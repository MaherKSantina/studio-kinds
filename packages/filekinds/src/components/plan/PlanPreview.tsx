/**
 * The policy playground.
 *
 * Rules on the left, the plan they produce on the right, recomputed on every
 * edit. That pairing is the whole point: a policy is not readable on its own —
 * "prefer cheap events" tells you nothing until you see which order it actually
 * puts things in — so authoring and outcome have to share a screen.
 *
 * Rules stay editable as a LIST, in file order, with an off switch rather than
 * only a delete. Half the work of tuning a policy is asking what a rule was
 * doing, and the fastest answer is turning it off and watching the right-hand
 * side move.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box, Chip, CircularProgress, IconButton, Stack, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import LoopIcon from "@mui/icons-material/Loop";
import { readVirtualDirectoryFile } from "../../api";
import { compilePlan, dumpPlan, parsePlan, ruleKind, type PlanDoc, type PlanRule } from "../../lib/planDoc";
import { parsePlaybook, type PlaybookDoc } from "../../lib/playbookDoc";
import { parseGuide, type GuideDoc } from "../../lib/guideDoc";
import { plan as runPlan } from "../../lib/playbookPlan";

const OPERATION = "#4a5fa5";
const DROPPED = "#dc2626";

export default function PlanPreview({ content, height = "100%", onChange, agentId }: {
  content: string;
  height?: number | string;
  editable?: boolean;
  onChange?: (next: string) => void;
  agentId?: string;
  path?: string;
}) {
  // Read-only hosts pass no onChange — edits land locally and are dropped
  // when the host's content moves on, so the view stays fully interactive.
  const [localNext, setLocalNext] = useState<string | null>(null);
  const [seen, setSeen] = useState(content);
  const stale = content !== seen;
  const text = stale ? content : (localNext ?? content);
  if (stale) { setSeen(content); setLocalNext(null); }

  const doc = useMemo(() => parsePlan(text), [text]);
  const [book, setBook] = useState<PlaybookDoc | null>(null);
  const [guides, setGuides] = useState<Map<string, GuideDoc>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const edit = useCallback((fn: (d: PlanDoc) => PlanDoc) => {
    const next = dumpPlan(fn(structuredClone(doc)));
    if (onChange) onChange(next);
    else setLocalNext(next);
  }, [doc, onChange]);

  // The books, merged the way the walk merges them: decisions and events are
  // usually authored in separate files and a plan needs both halves.
  const files = doc.playbooks.join("|");
  useEffect(() => {
    let live = true;
    if (!agentId || !doc.playbooks.length) { setBook(null); return; }
    setLoading(true); setErr(null);
    (async () => {
      try {
        const parts: PlaybookDoc[] = [];
        for (const f of doc.playbooks) {
          parts.push(parsePlaybook((await readVirtualDirectoryFile(agentId, f)).content));
        }
        const merged: PlaybookDoc = {
          ...parts[0],
          decisions: parts.flatMap((p) => p.decisions),
          events: parts.flatMap((p) => p.events),
          rules: parts.flatMap((p) => p.rules),
        };
        const g = new Map<string, GuideDoc>();
        for (const c of merged.events.flatMap((e) => e.content ?? [])) {
          if (!c.file || c.by?.length || !c.file.endsWith(".guide") || g.has(c.file)) continue;
          try {
            g.set(c.file, parseGuide((await readVirtualDirectoryFile(agentId, c.file)).content));
          } catch { /* a missing guide costs its steps, not the plan */ }
        }
        if (live) { setBook(merged); setGuides(g); }
      } catch (e) {
        if (live) setErr(String((e as Error)?.message ?? e));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [agentId, files]);   // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo(() => {
    if (!book) return null;
    const c = compilePlan(doc);
    return runPlan(book, {
      locks: doc.locks, guides, horizon: doc.horizon,
      policy: {
        closesGaps: c.closesGaps, opens: c.opens, cheap: c.cheap,
        boost: c.boost, exclude: c.exclude, capacity: c.capacity, before: c.before,
      },
    });
  }, [book, doc, guides]);

  const moves = useMemo(
    () => (book?.events ?? []).filter((e) => e.trigger === "chosen" && (e.arity ?? "once") !== "many"),
    [book]);

  const addRule = (r: PlanRule) => edit((d) => ({ ...d, rules: [...d.rules, r] }));
  const setRule = (i: number, r: PlanRule) =>
    edit((d) => ({ ...d, rules: d.rules.map((x, j) => (j === i ? r : x)) }));
  const move = (i: number, by: number) => edit((d) => {
    const next = [...d.rules];
    const j = i + by;
    if (j < 0 || j >= next.length) return d;
    [next[i], next[j]] = [next[j], next[i]];
    return { ...d, rules: next };
  });

  return (
    <Box sx={{ height, minHeight: 0, display: "flex", overflow: "hidden" }}>
      {/* ── rules ─────────────────────────────────────────────────────── */}
      <Box sx={{ width: 380, flexShrink: 0, borderRight: "1px solid", borderColor: "divider",
                 display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Stack direction="row" sx={{ alignItems: "center", px: 1.25, py: 0.75, flexShrink: 0,
                                     borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                            letterSpacing: 0.6, color: "text.disabled", flex: 1 }}>
            Policy · {doc.rules.filter((r) => !r.off).length} of {doc.rules.length} live
          </Typography>
          {(
            <Tooltip title="Add an order rule — name events in the sequence you want them">
              <IconButton size="small" onClick={() => addRule({ order: [] })}
                          sx={{ color: "text.disabled" }}>
                <AddIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>

        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1 }}>
          {doc.rules.map((r, i) => (
            <Box key={i} sx={{ mb: 0.75, p: 0.75, border: "1px solid", borderRadius: 1,
                               borderColor: r.off ? "#e2e5eb" : "divider",
                               opacity: r.off ? 0.45 : 1 }}>
              <Stack direction="row" spacing={0.4} sx={{ alignItems: "center", mb: 0.4 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                                  letterSpacing: 0.6, color: "text.disabled", flex: 1 }}>
                  {ruleKind(r)}
                </Typography>
                {!!onChange && (
                  <>
                    <Tooltip title={r.off ? "Back on" : "Off, without deleting it"}>
                      <IconButton size="small" onClick={() => setRule(i, { ...r, off: !r.off })}
                                  sx={{ p: 0.15, color: "text.disabled" }}>
                        {r.off ? <VisibilityOffIcon sx={{ fontSize: 13 }} />
                               : <VisibilityIcon sx={{ fontSize: 13 }} />}
                      </IconButton>
                    </Tooltip>
                    <IconButton size="small" onClick={() => move(i, -1)} sx={{ p: 0.15, color: "text.disabled" }}>
                      <ArrowUpwardIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                    <IconButton size="small" onClick={() => move(i, 1)} sx={{ p: 0.15, color: "text.disabled" }}>
                      <ArrowDownwardIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                    <IconButton size="small" sx={{ p: 0.15, color: "text.disabled" }}
                                onClick={() => edit((d) => ({ ...d, rules: d.rules.filter((_, j) => j !== i) }))}>
                      <DeleteOutlineIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </>
                )}
              </Stack>

              {r.order && (
                <>
                  {/* The sequence as it stands, then everything else as one
                      click. Typing event keys by hand is how you get a rule that
                      silently names nothing. */}
                  <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.3, mb: r.order.length ? 0.4 : 0 }}>
                    {r.order.map((k, n) => (
                      <Chip key={`${k}${n}`} size="small"
                            label={`${n + 1}. ${book?.events.find((e) => e.key === k)?.label ?? k}`}
                            onDelete={onChange
                              ? () => setRule(i, { ...r, order: r.order!.filter((_, m) => m !== n) })
                              : undefined}
                            sx={{ height: 20, fontSize: 12, bgcolor: "#e8ebf1",
                                  ...(book && !book.events.some((e) => e.key === k)
                                    ? { color: DROPPED, border: "1px solid #dc262655" } : {}) }} />
                    ))}
                  </Stack>
                  {!!onChange && (
                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.3 }}>
                      {moves.filter((e) => !r.order!.includes(e.key)).map((e) => (
                        <Box key={e.key} onClick={() => setRule(i, { ...r, order: [...r.order!, e.key] })}
                             sx={{ px: 0.5, py: 0.1, borderRadius: 3, fontSize: 12, cursor: "pointer",
                                   border: "1px dashed #c3c9d2", color: "text.disabled",
                                   "&:hover": { borderColor: "#334155", color: "#334155" } }}>
                          + {e.label}
                        </Box>
                      ))}
                    </Stack>
                  )}
                </>
              )}

              {r.exclude && (
                <Typography sx={{ fontSize: 12 }}>never: {r.exclude.join(", ")}</Typography>
              )}
              {r.boost && (
                <Typography sx={{ fontSize: 12 }}>
                  {Object.entries(r.boost).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(" · ")}
                </Typography>
              )}
              {r.weights && (
                <Typography sx={{ fontSize: 12 }}>
                  {Object.entries(r.weights).map(([k, v]) => `${k} ${v}`).join(" · ")}
                </Typography>
              )}
              {typeof r.capacity === "number" && (
                <Typography sx={{ fontSize: 12 }}>{r.capacity} days of effort per day</Typography>
              )}
              {r.note && (
                <Typography sx={{ fontSize: 12, color: "text.disabled", fontStyle: "italic", mt: 0.3 }}>
                  {r.note}
                </Typography>
              )}
            </Box>
          ))}

          {!doc.rules.length && (
            <Typography sx={{ fontSize: 13, color: "text.disabled", fontStyle: "italic" }}>
              No rules yet. Everything is ranked by the defaults — add an order rule to pin
              the parts you already know.
            </Typography>
          )}
        </Box>
      </Box>

      {/* ── the plan it produces ──────────────────────────────────────── */}
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", p: 1.25 }}>
        {loading && <CircularProgress size={14} thickness={6} />}
        {err && <Typography sx={{ fontSize: 13, color: DROPPED }}>{err}</Typography>}
        {!doc.playbooks.length && (
          <Typography sx={{ fontSize: 13, color: "#a16207", fontStyle: "italic" }}>
            Set `playbooks:` to the books this plans over.
          </Typography>
        )}

        {result && (
          <>
            {!!result.blocked.length && (
              <Box sx={{ mb: 1, p: 0.75, borderLeft: "3px solid", borderColor: DROPPED,
                         bgcolor: "#dc26260f", borderRadius: 0.5 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: DROPPED, mb: 0.2 }}>
                  Order rules that can never be satisfied
                </Typography>
                {result.blocked.map((b) => (
                  <Typography key={b} sx={{ fontSize: 12 }}>{b}</Typography>
                ))}
              </Box>
            )}

            <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                              letterSpacing: 0.6, color: "text.disabled", mb: 0.5 }}>
              Order · {result.order.length} moves
            </Typography>
            {result.order.map((o, i) => (
              <Stack key={o.event.key} direction="row" spacing={0.8}
                     sx={{ alignItems: "baseline", mb: 0.25 }}>
                <Typography sx={{ fontSize: 12, color: "text.disabled", width: 16, textAlign: "right" }}>
                  {i + 1}.
                </Typography>
                <Typography sx={{ fontSize: 13, flex: 1 }}>{o.event.label}</Typography>
                <Tooltip title={`closes ${o.because.closesGaps} gaps · opens ${o.because.opens} · ${o.because.effort.toFixed(1)}d`}>
                  <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
                    {o.score.toFixed(1)}
                  </Typography>
                </Tooltip>
              </Stack>
            ))}

            <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                              letterSpacing: 0.6, color: "text.disabled", mt: 1.25, mb: 0.5 }}>
              Work · {result.tasks.length} tasks
              {!!result.tasks.filter((t) => t.dropped).length && (
                <Box component="span" sx={{ color: DROPPED, ml: 0.5 }}>
                  · {result.tasks.filter((t) => t.dropped).length} past the deadline
                </Box>
              )}
            </Typography>
            {result.tasks.map((t) => (
              <Stack key={t.id} direction="row" spacing={0.8} sx={{ alignItems: "baseline", mb: 0.15 }}>
                <Typography sx={{ fontSize: 12, color: "text.disabled", width: 62, flexShrink: 0,
                                  textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  d{t.start.toFixed(1)}–{t.end.toFixed(1)}
                </Typography>
                <Typography sx={{ fontSize: 13, flex: 1,
                                  color: t.dropped ? DROPPED : "text.primary" }}>
                  {t.step.label}
                </Typography>
                {t.step.negotiable === "fixed" && (
                  <Typography sx={{ fontSize: 12, color: "#b45309" }}>fixed</Typography>
                )}
              </Stack>
            ))}

            {!!result.load.length && (
              <>
                <Stack direction="row" spacing={0.6}
                       sx={{ alignItems: "center", mt: 1.25, mb: 0.5 }}>
                  <LoopIcon sx={{ fontSize: 12, color: OPERATION }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                                    letterSpacing: 0.6, color: "text.disabled" }}>
                    Ongoing load · {(result.utilisation * 100).toFixed(0)}% of capacity
                  </Typography>
                  {result.utilisation > 1 && (
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: DROPPED }}>
                      underwater — there is no time for the plan above
                    </Typography>
                  )}
                </Stack>
                {result.load.filter((l) => l.perDay > 0)
                  .sort((a, b) => b.perDay - a.perDay).map((l) => (
                  <Stack key={l.event.key} direction="row" spacing={0.8}
                         sx={{ alignItems: "baseline", mb: 0.15 }}>
                    <Typography sx={{ fontSize: 12, color: OPERATION, width: 62, flexShrink: 0,
                                      textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {(l.perDay * 100).toFixed(0)}%
                    </Typography>
                    <Typography sx={{ fontSize: 13, flex: 1 }}>{l.event.label}</Typography>
                    <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
                      {l.event.rate}
                    </Typography>
                  </Stack>
                ))}
              </>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
