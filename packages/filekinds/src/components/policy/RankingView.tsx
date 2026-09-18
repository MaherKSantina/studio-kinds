/**
 * A RANKING — a list sorted into buckets that fall out of its answers.
 *
 *   left   — every row, exactly as its own list renders it
 *   right  — the same rows GROUPED BY RANK, best group first, each group a
 *            predicate over answers rather than a name someone assigned
 *
 * Clicking a row opens its assignment: what every decision answered, where
 * that answer came from, and which group claimed it. The answers are pills, so
 * the dialog is also where you overrule a rule — click an answer to tag it,
 * click it again to hand the decision back to the rules.
 */
import { useEffect, useMemo, useState } from "react";
import { Box, Chip, Dialog, DialogContent, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import { DecisionPills, OneDList, resolveRef, splitRef, useIsMobile } from "crosscut";
import { configuredWriter, readVirtualDirectoryFile } from "../../api";
import { readListRows } from "../../lib/listCollate";
import type { DocListItem } from "../../lib/listDoc";
import { clauseText, inputForRow, type PolicyInput, type PolicyRunDoc } from "../../lib/policyDoc";
import {
  Answer, RankingDoc, answerLabel, assignmentFor, groupText, isCatchAll, locksOf,
  parseRanking, rankOf, writeTags,
} from "../../lib/rankingDoc";
import DocListView from "../list/DocListView";

interface Placed {
  row: DocListItem;
  input: PolicyInput;
  answers: Answer[];
  locks: string[];
  /** Index into doc.ranking; -1 when no group holds. */
  rank: number;
}

const UNRANKED = "__unranked";

/**
 * Every decision, every answer it can take, and what the rows actually did
 * with it — the reference you read BEFORE adding a decision, and the one that
 * tells you whether a criterion is earning its place.
 */
function DecisionsPanel({ doc, placed }: { doc: RankingDoc; placed: Placed[] }) {
  if (!doc.decisions.length) {
    return (
      <Typography sx={{ fontSize: 12, color: "text.disabled", fontStyle: "italic", p: 1.25 }}>
        No decisions yet — add a `decisions:` block and every row gains an answer.
      </Typography>
    );
  }
  return (
    <Stack spacing={1.25} sx={{ p: 1.25 }}>
      {doc.decisions.map((d) => {
        const answers = placed.map((p) => p.answers.find((a) => a.decision === d.key));
        const unanswered = answers.filter((a) => a?.source === "unanswered").length;
        const bySource = (s: Answer["source"]) => answers.filter((a) => a?.source === s).length;
        return (
          <Box key={d.key} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline" }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{d.label}</Typography>
              <Typography sx={{ fontSize: 12, fontFamily: "monospace", color: "text.disabled" }}>
                {d.key}
              </Typography>
              <Box sx={{ flex: 1 }} />
              {unanswered > 0 && (
                <Chip size="small" label={`${unanswered} unanswered`}
                  sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#b4530914", color: "#b45309",
                        "& .MuiChip-label": { px: 0.75 } }} />
              )}
            </Stack>
            {d.detail && (
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{d.detail}</Typography>
            )}

            {/* The possible answers — all of them, with how many rows took each. */}
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
              {d.values.map((v) => {
                const n = answers.filter((a) => a?.value === v.key).length;
                return (
                  <Chip key={v.key} size="small" label={`${v.label} · ${n}`}
                    sx={{ height: 20, fontSize: 12, fontWeight: 700,
                          bgcolor: n ? "#4f46e514" : "#0f172a0d",
                          color: n ? "#4f46e5" : "text.disabled",
                          "& .MuiChip-label": { px: 0.75 } }} />
                );
              })}
            </Stack>

            {/* Where those answers came from — a decision answered only by rule
                has never been looked at; one answered mostly by hand wants a
                better rule. */}
            <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.6 }}>
              {bySource("tagged")} tagged · {bySource("field")} from the list · {bySource("derived")} by rule
            </Typography>

            {/* How a rule decides, in the order the rules are tried. */}
            {d.derive.length > 0 && (
              <Box sx={{ mt: 0.6 }}>
                {d.derive.map((r, i) => (
                  <Typography key={i} sx={{ fontSize: 12, fontFamily: "monospace", color: "text.secondary" }}>
                    {i + 1}. → {d.values.find((v) => v.key === r.value)?.label ?? r.value}
                    {r.when.length
                      ? ` when ${r.when.map(clauseText).join(" and ")}`
                      : "  (default — nothing above matched)"}
                  </Typography>
                ))}
              </Box>
            )}
            {!d.derive.length && (
              <Typography sx={{ fontSize: 12, fontStyle: "italic", color: "text.disabled", mt: 0.6 }}>
                No rules — this one is answered by hand, or left open.
              </Typography>
            )}

            {/* Which groups actually depend on this decision. A decision no
                group names changes nothing about the ranking. */}
            {(() => {
              const used = doc.ranking.filter((g) => g.when.some((ref) => splitRef(ref)[0] === d.key));
              return (
                <Typography sx={{ fontSize: 12, color: used.length ? "text.secondary" : "#b45309", mt: 0.5 }}>
                  {used.length
                    ? `Used by ${used.length} group${used.length === 1 ? "" : "s"}: ${used.map((g) => g.label).join(", ")}`
                    : "No group names this decision — it labels rows but does not rank them."}
                </Typography>
              );
            })()}
          </Box>
        );
      })}
    </Stack>
  );
}

/** Where an answer came from, as a badge. Unanswered is the one worth seeing. */
const SOURCE_STYLE: Record<Answer["source"], { label: string; bg: string; fg: string }> = {
  tagged: { label: "tagged", bg: "#4f46e51f", fg: "#4f46e5" },
  field: { label: "from the list", bg: "#0f766e1f", fg: "#0f766e" },
  derived: { label: "by rule", bg: "#0f172a0d", fg: "#64748b" },
  unanswered: { label: "unanswered", bg: "#b4530914", fg: "#b45309" },
};

export default function RankingView({ doc, base, content, height = "100%" }: {
  doc: RankingDoc;
  base: string;
  /** The ranking file's own text — tags are written back into it. */
  content: string;
  height?: number | string;
}) {
  const [live, setLive] = useState<RankingDoc>(doc);
  const [text, setText] = useState(content);
  const [listContent, setListContent] = useState<string | null>(null);
  const [listPath, setListPath] = useState("");
  const [rows, setRows] = useState<DocListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [only, setOnly] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const [reloadedAt, setReloadedAt] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [pane, setPane] = useState<"items" | "groups">("groups");
  /** The right pane is either the ranked rows or the decisions behind them. */
  const [right, setRight] = useState<"groups" | "decisions">("groups");

  useEffect(() => { setLive(doc); setText(content); }, [doc, content]);

  useEffect(() => {
    let alive = true;
    setRows(null); setErr(null);
    (async () => {
      try {
        const lAbs = resolveRef(base, live.items);
        const raw = await readVirtualDirectoryFile(lAbs, lAbs);
        const { rows: r } = await readListRows(lAbs);
        if (!alive) return;
        setListContent(raw.content);
        setListPath(lAbs);
        setRows(r);
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { alive = false; };
  }, [live.items, base, nonce]);

  /** Re-read the ranking file itself, so edited decisions and groups apply. */
  const reload = async () => {
    try {
      const raw = await readVirtualDirectoryFile(base, base);
      setText(raw.content);
      setLive(parseRanking(raw.content));
    } catch { /* keep what we have; the list reload below still runs */ }
    setReloadedAt(new Date().toLocaleTimeString());
    setNonce((n) => n + 1);
  };

  // The run's column mapping is the policy's, so the same helper reads a row.
  const asRun = useMemo(
    () => ({ role: "run", title: "", policy: "", items: live.items, map: live.map }) as PolicyRunDoc,
    [live.items, live.map],
  );

  const placed: Placed[] = useMemo(() => (rows ?? []).map((row) => {
    const input = inputForRow(asRun, row);
    const answers = assignmentFor(live, row, input);
    const locks = locksOf(answers);
    return { row, input, answers, locks, rank: rankOf(live, locks) };
  }), [rows, live, asRun]);

  const keyOf = (p: Placed) => `${p.row.label ?? ""}|${p.row.fields?.url ?? ""}`;
  const current = placed.find((p) => keyOf(p) === chosen) ?? null;

  /** Save one row's hand tags, keeping the authored head of the file intact. */
  const saveTags = async (p: Placed, next: string[]) => {
    const label = p.row.label ?? "";
    if (!label) return;
    const before = new Set(p.locks);
    const added = next.filter((r) => !before.has(r));
    const cleared = [...before]
      .filter((r) => !next.includes(r))
      .map((r) => splitRef(r)[0])
      .filter((d) => !added.some((r) => splitRef(r)[0] === d));

    let mine = [...(live.tags[label] ?? [])];
    for (const r of added) mine = [...mine.filter((t) => splitRef(t)[0] !== splitRef(r)[0]), r];
    for (const d of cleared) mine = mine.filter((t) => splitRef(t)[0] !== d);

    const tags = { ...live.tags };
    if (mine.length) tags[label] = mine; else delete tags[label];
    const nextText = writeTags(text, tags);
    setText(nextText);
    setLive(parseRanking(nextText));
    await configuredWriter()?.(base, nextText);
  };

  if (err) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography sx={{ fontSize: 12, color: "error.main", mb: 1 }}>{err}</Typography>
        <Chip size="small" icon={<RefreshIcon sx={{ fontSize: 13 }} />} label="Reload" onClick={reload}
          sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer" }} />
      </Box>
    );
  }
  if (!rows) {
    return <Typography sx={{ p: 3, fontSize: 12, color: "text.disabled" }}>Working out the answers…</Typography>;
  }

  const order = [...live.ranking.map((_, i) => String(i)), UNRANKED];
  const labelOfRank = (k: string) =>
    k === UNRANKED ? "Unranked" : live.ranking[Number(k)]?.label ?? "—";
  const counts = live.ranking.map((_, i) => placed.filter((p) => p.rank === i).length);
  const unranked = placed.filter((p) => p.rank < 0).length;
  /** How many rows still have a decision nobody answered — the work queue. */
  const openQuestions = placed.filter((p) => p.answers.some((a) => a.source === "unanswered")).length;

  return (
    <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid", borderColor: "divider",
                 display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 650, flex: 1, minWidth: 0,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {live.title}
          <Typography component="span" sx={{ fontSize: 13, color: "text.secondary", ml: 1 }}>
            {placed.length} rows · {live.decisions.length} decisions · {live.ranking.length} groups
            {openQuestions > 0 && ` · ${openQuestions} with an open question`}
            {reloadedAt && ` · reloaded ${reloadedAt}`}
          </Typography>
        </Typography>
        {isMobile && (
          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
            {(["items", "groups"] as const).map((p) => (
              <Chip key={p} size="small" clickable label={p === "items" ? "Items" : "Groups"}
                onClick={() => setPane(p)}
                sx={{ height: 20, fontSize: 12, fontWeight: 700,
                      bgcolor: pane === p ? "#4f46e5" : "#0f172a0d",
                      color: pane === p ? "#fff" : "text.secondary" }} />
            ))}
          </Stack>
        )}
        <Tooltip title="Re-read the decisions, the groups and the rows, and work the answers out again">
          <Chip size="small" clickable icon={<RefreshIcon sx={{ fontSize: 13, ml: 0.5 }} />}
            label={isMobile ? undefined : "Reload"} onClick={reload}
            sx={{ height: 20, fontSize: 12, fontWeight: 700, flexShrink: 0,
                  bgcolor: "#4f46e514", color: "#4f46e5",
                  "& .MuiChip-label": isMobile ? { px: 0.25 } : undefined,
                  "&:hover": { bgcolor: "#4f46e526" } }} />
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        {(!isMobile || pane === "items") && (
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0,
                     borderRight: isMobile ? 0 : "1px solid", borderColor: "divider" }}>
            {listContent !== null && <DocListView content={listContent} agentId={listPath} height="100%" />}
          </Box>
        )}

        {(!isMobile || pane === "groups") && (
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* Ranked rows, or the decisions they were ranked by. */}
          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, px: 1.25, pt: 1 }}>
            {([["groups", `Groups · ${live.ranking.length}`],
               ["decisions", `Decisions · ${live.decisions.length}`]] as const).map(([k, label]) => (
              <Chip key={k} size="small" clickable label={label} onClick={() => setRight(k)}
                sx={{ height: 20, fontSize: 12, fontWeight: 700,
                      bgcolor: right === k ? "#0f172a" : "#0f172a0d",
                      color: right === k ? "#fff" : "text.secondary" }} />
            ))}
          </Stack>
          {right === "decisions" ? (
            <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <DecisionsPanel doc={live} placed={placed} />
            </Box>
          ) : (
          <>
          <Stack direction="row" spacing={0.5} useFlexGap
            sx={{ flexWrap: "wrap", flexShrink: 0, px: 1.25, pt: 1, pb: 0.75 }}>
            <Chip size="small" label={`All · ${placed.length}`} onClick={() => setOnly(null)}
              sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    bgcolor: only === null ? "#4f46e5" : "#0f172a0d",
                    color: only === null ? "#fff" : "text.secondary" }} />
            {live.ranking.map((g, i) => (
              <Tooltip key={i} title={groupText(live, g)}>
                <Chip size="small" label={`${i + 1}. ${g.label} · ${counts[i]}`}
                  onClick={() => setOnly(only === i ? null : i)}
                  sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        bgcolor: only === i ? "#4f46e5" : counts[i] ? "#4f46e514" : "#0f172a0d",
                        color: only === i ? "#fff" : counts[i] ? "#4f46e5" : "text.disabled",
                        // The catch-all is the bottom of the order, and looks it.
                        ...(isCatchAll(g) && only !== i
                          ? { bgcolor: "#b4530914", color: "#b45309" } : {}) }} />
              </Tooltip>
            ))}
            {unranked > 0 && (
              <Chip size="small" label={`Unranked · ${unranked}`} onClick={() => setOnly(-1)}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      bgcolor: only === -1 ? "#b45309" : "#b4530914",
                      color: only === -1 ? "#fff" : "#b45309" }} />
            )}
          </Stack>
          <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", px: 1.25, pb: 1.25 }}>
            <OneDList<Placed>
              items={only === null ? placed : placed.filter((p) => p.rank === only)}
              keyOf={keyOf}
              dimension={{
                of: (p) => (p.rank < 0 ? UNRANKED : String(p.rank)),
                label: labelOfRank,
                order,
              }}
              mode="headings"
              search={(p) => `${p.row.label ?? ""} ${Object.values(p.row.fields ?? {}).join(" ")} ${p.locks.join(" ")}`}
              searchPlaceholder="Search the ranked rows"
              empty={<Typography sx={{ fontSize: 12, color: "text.disabled", fontStyle: "italic" }}>Nothing here.</Typography>}
              renderItem={(p) => (
                <Box onClick={() => setChosen(keyOf(p))}
                  sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, px: 1, py: 0.6,
                        bgcolor: "#fff", cursor: "pointer", "&:hover": { borderColor: "#4f46e5" } }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                    {p.row.label ?? "(unlabelled)"}
                  </Typography>
                  {/* The assignment IS the summary — every answer, in one line. */}
                  <Stack direction="row" spacing={0.4} useFlexGap sx={{ flexWrap: "wrap", mt: 0.3 }}>
                    {p.answers.map((a) => {
                      const s = SOURCE_STYLE[a.source];
                      return (
                        <Chip key={a.decision} size="small"
                          label={a.value ? answerLabel(live, a) : `${a.decision}?`}
                          sx={{ height: 20, fontSize: 12, fontWeight: 700,
                                bgcolor: s.bg, color: s.fg, "& .MuiChip-label": { px: 0.75 } }} />
                      );
                    })}
                  </Stack>
                </Box>
              )}
            />
          </Box>
          </>
          )}
        </Box>
        )}
      </Box>

      {/* ── the row's assignment, and where to overrule it ── */}
      <Dialog open={!!current} onClose={() => setChosen(null)} maxWidth="sm" fullWidth disablePortal>
        {current && (
          <DialogContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", mb: 1 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 650, flex: 1, minWidth: 0 }}>
                {current.row.label ?? "(unlabelled)"}
              </Typography>
              <Chip size="small"
                label={current.rank < 0 ? "Unranked" : live.ranking[current.rank].label}
                sx={{ height: 20, fontSize: 12, fontWeight: 700,
                      bgcolor: current.rank < 0 ? "#b45309" : "#4f46e5", color: "#fff" }} />
              <IconButton size="small" aria-label="Close" onClick={() => setChosen(null)}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Stack>

            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                              color: "text.disabled", mt: 1.25, mb: 0.5 }}>
              {current.rank < 0 ? "No group holds" : "Claimed by"}
            </Typography>
            {current.rank >= 0 ? (
              <Box sx={{ border: "1px solid #4f46e555", borderRadius: 1.5, bgcolor: "#4f46e50d", p: 1 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 650 }}>
                  {current.rank + 1}. {live.ranking[current.rank].label}
                </Typography>
                <Typography sx={{ fontSize: 13, fontFamily: "monospace", color: "text.secondary" }}>
                  {isCatchAll(live.ranking[current.rank])
                    ? "no conditions — this group takes anything left, which is what makes it last"
                    : `holds when ${groupText(live, live.ranking[current.rank])}`}
                </Typography>
                <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5 }}>
                  Better groups were tested first and did not hold — the order stops here.
                </Typography>
              </Box>
            ) : (
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                No group's conditions hold, and there is no catch-all to take it. Add a final
                group with no conditions and nothing can fall through again.
              </Typography>
            )}

            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                              color: "text.disabled", mt: 1.5, mb: 0.5 }}>
              Its answers — click to overrule
            </Typography>
            <DecisionPills decisions={live.decisions} value={current.locks}
              onChange={(next) => { void saveTags(current, next); }} />
            <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.75 }}>
              Clicking an answer tags this row; clicking the active one clears the tag and hands
              the decision back to the rules.
            </Typography>

            <Stack spacing={0.4} sx={{ mt: 1.25 }}>
              {current.answers.map((a) => {
                const s = SOURCE_STYLE[a.source];
                return (
                  <Box key={a.decision} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                    <Typography sx={{ fontSize: 12, fontFamily: "monospace", color: "text.disabled",
                                      width: 118, flexShrink: 0 }}>{a.decision}</Typography>
                    <Typography sx={{ fontSize: 13, flex: 1,
                                      color: a.value ? "text.primary" : "text.disabled" }}>
                      {answerLabel(live, a)}
                    </Typography>
                    <Chip size="small" label={s.label}
                      sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: s.bg, color: s.fg,
                            "& .MuiChip-label": { px: 0.75 } }} />
                  </Box>
                );
              })}
            </Stack>
          </DialogContent>
        )}
      </Dialog>
    </Box>
  );
}
