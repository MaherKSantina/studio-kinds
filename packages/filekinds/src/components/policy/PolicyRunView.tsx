/**
 * A POLICY RUN — the policy applied to a whole list at once.
 *
 *   left   — every item, exactly as its own list renders (search, filter
 *            pills, clickable links, row details)
 *   right  — the same items GROUPED, groups in the policy's declared order
 *            so the top of the pane is the top of the priority
 *
 * Two shapes of policy can drive it. A FLAT policy: params → switch →
 * buckets. Or the CHAIN: the run points at an ORDER policy, which ranks tag
 * combinations from a TAGS policy — each row is tagged, then ranked, and the
 * groups are the ranks (then Excluded, then Unranked). The header button
 * opens the order policy in a dialog, and from there the tags policy — the
 * whole hierarchy is reachable from here.
 *
 * Clicking a grouped row says WHY it landed there: the tags it took (chain)
 * or the case that claimed it (flat), and the input the policy actually saw.
 */
import { useEffect, useState } from "react";
import { Box, Chip, Dialog, DialogContent, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import RuleIcon from "@mui/icons-material/Rule";
import { OneDList, resolveRef, useIsMobile } from "crosscut";
import { readVirtualDirectoryFile } from "../../api";
import { readListRows } from "../../lib/listCollate";
import type { DocListItem } from "../../lib/listDoc";
import {
  PolicyDoc, PolicyInput, PolicyRunDoc, UNMATCHED, applyPolicy, bucketLabel, bucketOrder,
  bucketSlot, clauseText, hasTimedBuckets, inputForRow,
} from "../../lib/policyDoc";
import {
  OrderPolicyDoc, TagAnswer, TagsPolicyDoc, applyOrder, deriveTags,
  locksOfTags, orderKeyLabel, orderKeys, parsePolicyKindFile, parseTagsPolicy,
  tagAnswerLabel, viaText, whenRefsText,
} from "../../lib/policyChain";
import DocListView, { RowFieldsBlock } from "../list/DocListView";
import DaySchedule from "./DaySchedule";
import OrderPolicyView from "./OrderPolicyView";

interface Verdict {
  row: DocListItem;
  input: PolicyInput;
  /** Group key — a bucket (flat) or "rank:<i>" / "unranked". */
  bucket: string;
  /** Flat runs: index of the case that claimed it; -1 = no case matched. */
  caseIndex: number;
  /** Chain runs: the tags the row took, dimension by dimension. */
  tags?: TagAnswer[];
  /** Chain runs: index of the order entry that claimed it; -1 = unranked. */
  index?: number;
}

/** A run whose policy is an ORDER policy applies the whole chain per row. */
interface ChainDocs {
  order: OrderPolicyDoc;
  tags: TagsPolicyDoc;
  /** Absolute path of the order policy — base for its `tags` ref and for
   *  the dialog that opens it. */
  orderPath: string;
}

export default function PolicyRunView({ run, base, height = "100%" }: {
  run: PolicyRunDoc;
  base: string;
  height?: number | string;
}) {
  const [policy, setPolicy] = useState<PolicyDoc | null>(null);
  const [chain, setChain] = useState<ChainDocs | null>(null);
  const [listContent, setListContent] = useState<string | null>(null);
  const [listPath, setListPath] = useState<string>("");
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Verdict | null>(null);
  /** The policy dialog: the flat decision table, or the order policy. */
  const [rulesOpen, setRulesOpen] = useState(false);
  /** Bucket pill selection — null = every bucket. */
  const [only, setOnly] = useState<string | null>(null);
  /** Bumped by the reload button: re-reads the policy and the items and
   *  applies the switch again, so edited rules show up immediately. */
  const [nonce, setNonce] = useState(0);
  const [reloadedAt, setReloadedAt] = useState<string | null>(null);
  /** Narrow screens can't hold two scroll panes side by side, so they show
   *  one at a time — the items, or the buckets. */
  const isMobile = useIsMobile();
  const [pane, setPane] = useState<"items" | "buckets">("buckets");
  /** The grouped pane's face: the 1-D list, or — when the policy's buckets
   *  carry timeslots — the day calendar with the same items laid out. */
  const [face, setFace] = useState<"groups" | "day">("groups");

  useEffect(() => {
    let live = true;
    setPolicy(null); setChain(null); setVerdicts(null); setErr(null);
    (async () => {
      try {
        const pAbs = resolveRef(base, run.policy);
        const parsed = parsePolicyKindFile((await readVirtualDirectoryFile(pAbs, pAbs)).content);
        const lAbs = resolveRef(base, run.items);
        const raw = await readVirtualDirectoryFile(lAbs, lAbs);
        const { rows } = await readListRows(lAbs);
        if (!live) return;
        setListContent(raw.content);
        setListPath(lAbs);
        if (parsed.role === "order") {
          // The CHAIN: map → params → tag values → rank, per row.
          const tAbs = resolveRef(pAbs, parsed.tags);
          const tagsDoc = parseTagsPolicy((await readVirtualDirectoryFile(tAbs, tAbs)).content);
          if (!live) return;
          setChain({ order: parsed, tags: tagsDoc, orderPath: pAbs });
          setVerdicts(rows.map((row) => {
            const input = inputForRow(run, row);
            const tags = deriveTags(tagsDoc, input);
            const v = applyOrder(parsed, locksOfTags(tags));
            return { row, input, bucket: v.key, caseIndex: -1, tags, index: v.index };
          }));
        } else if (parsed.role === "policy") {
          setPolicy(parsed);
          setVerdicts(rows.map((row) => {
            const input = inputForRow(run, row);
            const v = applyPolicy(parsed, input);
            return { row, input, bucket: v.bucket, caseIndex: v.caseIndex };
          }));
        } else {
          setErr(`The run's policy is a ${parsed.role} document — point it at a policy or an order policy.`);
        }
      } catch (e: unknown) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [run, base, nonce]);

  const reload = () => {
    setReloadedAt(new Date().toLocaleTimeString());
    setNonce((n) => n + 1);
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
  if ((!policy && !chain) || !verdicts) {
    return <Typography sx={{ p: 3, fontSize: 12, color: "text.disabled" }}>Applying the policy…</Typography>;
  }

  // One vocabulary for both shapes: a flat policy's buckets, or the chain's
  // ranks (then Excluded, then Unranked).
  const order = chain ? orderKeys(chain.order) : bucketOrder(policy!);
  const labelOf = (k: string) =>
    chain ? orderKeyLabel(chain.order, chain.tags.tags, k) : bucketLabel(policy!, k);
  const policyTitle = chain ? chain.order.title : policy!.title;
  const counts = order.map((k) => ({ k, n: verdicts.filter((v) => v.bucket === k).length }));
  // Flat-run internals, used by the decision-table dialog below.
  const defaultBucket = (policy?.default) ?? UNMATCHED;
  const claimedBy = (policy?.cases ?? []).map((_, i) => verdicts.filter((v) => v.caseIndex === i).length);
  const unclaimed = verdicts.filter((v) => v.caseIndex === -1).length;

  /** The small "why" chip on a grouped row. Ranked rows get none — their
   *  group heading already IS the combination that claimed them. */
  const rowChip = (v: Verdict): { label: string; warn: boolean } | null => {
    if (!chain) {
      return v.caseIndex >= 0
        ? { label: `rule ${v.caseIndex + 1}: ${policy!.cases[v.caseIndex].label ?? "case"}`, warn: false }
        : { label: "no rule matched — default", warn: true };
    }
    if (v.index === -1) return { label: "nothing claimed it — parked", warn: true };
    return null;
  };

  return (
    <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid", borderColor: "divider",
                 display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 650, flex: 1, minWidth: 0,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {run.title}
          <Typography component="span" sx={{ fontSize: 13, color: "text.secondary", ml: 1 }}>
            {verdicts.length} items · {policyTitle}
            {chain && ` · tagged by ${chain.tags.title}`}
            {reloadedAt && ` · reloaded ${reloadedAt}`}
          </Typography>
        </Typography>
        {/* One pane at a time on a phone — a toggle, not two squeezed columns. */}
        {isMobile && (
          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
            {(["items", "buckets"] as const).map((p) => (
              <Chip key={p} size="small" clickable label={p === "items" ? "Items" : "Buckets"}
                onClick={() => setPane(p)}
                sx={{ height: 20, fontSize: 12, fontWeight: 700,
                      bgcolor: pane === p ? "#4f46e5" : "#0f172a0d",
                      color: pane === p ? "#fff" : "text.secondary" }} />
            ))}
          </Stack>
        )}
        {/* The calendar face exists exactly when the buckets carry hours. */}
        {policy && hasTimedBuckets(policy) && (
          <Tooltip title={face === "day"
            ? "Back to the grouped list"
            : "Lay the fanned items on the day's timeline"}>
            <Chip size="small" clickable icon={<CalendarMonthIcon sx={{ fontSize: 13, ml: 0.5 }} />}
              label={isMobile ? undefined : face === "day" ? "List" : "Calendar"}
              onClick={() => setFace(face === "day" ? "groups" : "day")}
              sx={{ height: 20, fontSize: 12, fontWeight: 700, flexShrink: 0,
                    bgcolor: face === "day" ? "#4f46e5" : "#4f46e514",
                    color: face === "day" ? "#fff" : "#4f46e5",
                    "& .MuiChip-label": isMobile ? { px: 0.25 } : undefined,
                    "& .MuiChip-icon": face === "day" ? { color: "#fff" } : undefined,
                    "&:hover": { bgcolor: face === "day" ? "#4338ca" : "#4f46e526" } }} />
          </Tooltip>
        )}
        <Tooltip title={chain
          ? "Open the order policy — every ranked combination (and, one level down, the tags themselves)"
          : "Every rule the policy tests, grouped under the bucket it feeds"}>
          <Chip size="small" clickable icon={<RuleIcon sx={{ fontSize: 13, ml: 0.5 }} />}
            label={isMobile ? undefined : chain ? "Order policy" : "Rules"} onClick={() => setRulesOpen(true)}
            sx={{ height: 20, fontSize: 12, fontWeight: 700, flexShrink: 0,
                  bgcolor: "#4f46e514", color: "#4f46e5",
                  "& .MuiChip-label": isMobile ? { px: 0.25 } : undefined,
                  "&:hover": { bgcolor: "#4f46e526" } }} />
        </Tooltip>
        <Tooltip title="Re-read the policy and the items, and apply the rules again">
          <Chip size="small" clickable icon={<RefreshIcon sx={{ fontSize: 13, ml: 0.5 }} />}
            label={isMobile ? undefined : "Reload"} onClick={reload}
            sx={{ height: 20, fontSize: 12, fontWeight: 700, flexShrink: 0,
                  bgcolor: "#4f46e514", color: "#4f46e5",
                  "& .MuiChip-label": isMobile ? { px: 0.25 } : undefined,
                  "&:hover": { bgcolor: "#4f46e526" } }} />
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* ── every item, as its own list renders it ── */}
        {(!isMobile || pane === "items") && (
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0,
                     borderRight: isMobile ? 0 : "1px solid", borderColor: "divider" }}>
            {listContent !== null && <DocListView content={listContent} agentId={listPath} height="100%" />}
          </Box>
        )}

        {/* ── the same items, grouped in priority order ── */}
        {(!isMobile || pane === "buckets") && (
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {face === "day" && policy ? (
            // ── the same verdicts, on the day's clock ──
            <DaySchedule
              date={run.date}
              events={verdicts.flatMap((v) => {
                const slot = bucketSlot(policy.buckets.find((b) => b.key === v.bucket) ?? { key: v.bucket });
                return slot ? [{
                  id: `${v.row.label ?? ""}|${v.row.fields?.url ?? ""}`,
                  title: v.row.label ?? "(unlabelled)",
                  ...(v.row.fields?.who ? { detail: v.row.fields.who } : {}),
                  start: slot.start, end: slot.end,
                  onClick: () => setChosen(v),
                }] : [];
              })}
              unscheduled={verdicts
                .filter((v) => !bucketSlot(policy.buckets.find((b) => b.key === v.bucket) ?? { key: v.bucket }))
                .map((v) => ({
                  id: `${v.row.label ?? ""}|${v.row.fields?.url ?? ""}`,
                  title: v.row.label ?? "(unlabelled)",
                  onClick: () => setChosen(v),
                }))}
            />
          ) : (<>
          {/* The pills ARE the priority overview: counted, top group first,
              and one click narrows the pane to that group. */}
          <Stack direction="row" spacing={0.5} useFlexGap
            sx={{ flexWrap: "wrap", flexShrink: 0, px: 1.25, pt: 1, pb: 0.75 }}>
            <Chip size="small" label={`All · ${verdicts.length}`} onClick={() => setOnly(null)}
              sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    bgcolor: only === null ? "#4f46e5" : "#0f172a0d",
                    color: only === null ? "#fff" : "text.secondary" }} />
            {counts.map(({ k, n }, i) => (
              <Chip key={k} size="small"
                label={`${chain ? "" : `${i + 1}. `}${labelOf(k)} · ${n}`}
                onClick={() => setOnly(only === k ? null : k)}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      bgcolor: only === k ? "#4f46e5" : n ? "#4f46e514" : "#0f172a0d",
                      color: only === k ? "#fff" : n ? "#4f46e5" : "text.disabled" }} />
            ))}
          </Stack>
          {/* Chain runs: the selected rank's full combination, in the
              dimensions' words — the answers tied to the pill you clicked. */}
          {chain && only?.startsWith("rank:") && (
            <Typography sx={{ px: 1.25, pb: 0.5, fontSize: 12, color: "text.secondary", flexShrink: 0 }}>
              rank {Number(only.slice(5)) + 1} ={" "}
              {whenRefsText(chain.tags.tags, chain.order.order[Number(only.slice(5))]?.when ?? [])}
            </Typography>
          )}
          {/* Only the list scrolls: the pills stay put as the header. */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", px: 1.25, pb: 1.25 }}>
          <OneDList<Verdict>
            items={only === null ? verdicts : verdicts.filter((v) => v.bucket === only)}
            keyOf={(v) => `${v.row.label ?? ""}|${v.row.fields?.url ?? ""}`}
            dimension={{ of: (v) => v.bucket, label: labelOf, order }}
            mode="headings"
            search={(v) => `${v.row.label ?? ""} ${Object.values(v.row.fields ?? {}).join(" ")}`}
            searchPlaceholder="Search the grouped items"
            empty={<Typography sx={{ fontSize: 12, color: "text.disabled", fontStyle: "italic" }}>The list is empty.</Typography>}
            renderItem={(v) => {
              const chip = rowChip(v);
              return (
                <Box onClick={() => setChosen(v)}
                  sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, px: 1, py: 0.6,
                        bgcolor: "#fff", cursor: "pointer", "&:hover": { borderColor: "#4f46e5" } }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                    {v.row.label ?? "(unlabelled)"}
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 0.3 }}>
                    {chip && (
                      <Chip size="small" label={chip.label}
                        sx={{ height: 20, fontSize: 12, fontWeight: 700,
                              bgcolor: chip.warn ? "#b4530914" : "#4f46e514",
                              color: chip.warn ? "#b45309" : "#4f46e5",
                              maxWidth: 260, "& .MuiChip-label": { px: 0.75 } }} />
                    )}
                    {v.row.fields?.source && (
                      <Typography sx={{ fontSize: 12, color: "text.disabled" }}>{v.row.fields.source}</Typography>
                    )}
                  </Stack>
                </Box>
              );
            }}
          />
          </Box>
          </>)}
        </Box>
        )}
      </Box>

      {/* ── why this item is in this group ── */}
      <Dialog open={!!chosen} onClose={() => setChosen(null)} maxWidth="sm" fullWidth disablePortal>
        {chosen && (
          <DialogContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", mb: 1 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 650, flex: 1, minWidth: 0 }}>
                {chosen.row.label ?? "(unlabelled)"}
              </Typography>
              <Chip size="small" label={labelOf(chosen.bucket)}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#4f46e5", color: "#fff" }} />
              <IconButton size="small" aria-label="Close" onClick={() => setChosen(null)}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Stack>

            {/* ── the ad itself: every field it carries, link included ── */}
            <RowFieldsBlock it={chosen.row} />

            {/* ── chain runs: the tags the ad took ── */}
            {chain && chosen.tags && (
              <>
                <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                                  color: "text.disabled", mt: 1.25, mb: 0.5 }}>
                  The tags ({chain.tags.title})
                </Typography>
                <Stack spacing={0.4}>
                  {/* Hidden dimensions are the mechanism, not the vocabulary:
                      their effect shows through the computed answer's "via". */}
                  {chosen.tags.filter((a) => !chain.tags.tags.find((x) => x.key === a.dimension)?.hidden)
                    .map((a) => {
                    const d = chain.tags.tags.find((x) => x.key === a.dimension);
                    const via = viaText(chain.tags, a);
                    return (
                      <Box key={a.dimension} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, width: 118, flexShrink: 0 }}>
                          {d?.label ?? a.dimension}
                        </Typography>
                        <Chip size="small" label={tagAnswerLabel(chain.tags, a)}
                          sx={{ height: 20, fontSize: 12, fontWeight: 700,
                                bgcolor: a.value ? "#4f46e514" : "#b4530914",
                                color: a.value ? "#4f46e5" : "#b45309" }} />
                        {via && (
                          <Typography sx={{ fontSize: 12, color: "text.disabled", minWidth: 0 }} noWrap>
                            via: {via}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </>
            )}

            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                              color: "text.disabled", mt: 1.25, mb: 0.5 }}>
              {chain
                ? chosen.index! >= 0 ? "Claimed by" : "Nothing claimed it"
                : chosen.caseIndex >= 0 ? "Matched rule" : "No rule matched"}
            </Typography>
            {chain ? (
              chosen.index === -1 ? (
                <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                  No combination in the order claims these tags — the item is <b>unranked</b>.
                  It is parked, not discarded.
                </Typography>
              ) : (
                <Box sx={{ border: "1px solid #4f46e555", borderRadius: 1.5, bgcolor: "#4f46e50d", p: 1 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 650 }}>
                    rank {chosen.index! + 1} of {chain.order.order.length}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    ✓ {whenRefsText(chain.tags.tags, chain.order.order[chosen.index!].when)}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5 }}>
                    Higher entries were tested first and did not match — this is the best the tags reach.
                  </Typography>
                </Box>
              )
            ) : chosen.caseIndex >= 0 ? (
              <Box sx={{ border: "1px solid #4f46e555", borderRadius: 1.5, bgcolor: "#4f46e50d", p: 1 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 650 }}>
                  {chosen.caseIndex + 1}. {policy!.cases[chosen.caseIndex].label ?? "case"}
                </Typography>
                {policy!.cases[chosen.caseIndex].when.map((cl, i) => (
                  <Typography key={i} sx={{ fontSize: 13, fontFamily: "monospace", color: "text.secondary" }}>
                    ✓ {i > 0 ? "and " : "when "}{clauseText(cl)}
                  </Typography>
                ))}
                {!policy!.cases[chosen.caseIndex].when.length && (
                  <Typography sx={{ fontSize: 13, fontStyle: "italic", color: "text.secondary" }}>always</Typography>
                )}
                <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.5 }}>
                  Earlier rules were tested first and did not match — the switch stops here.
                </Typography>
              </Box>
            ) : (
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                Nothing claimed this item, so it fell to the default bucket —
                <b> {labelOf(chosen.bucket)}</b>. It is parked, not discarded.
              </Typography>
            )}

            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                              color: "text.disabled", mt: 1.5, mb: 0.5 }}>
              What the policy saw
            </Typography>
            <Stack spacing={0.4}>
              {Object.entries(chosen.input).map(([k, v]) => (
                <Box key={k} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                  <Typography sx={{ fontSize: 12, fontFamily: "monospace", color: "text.disabled",
                                    width: 118, flexShrink: 0 }}>{k}</Typography>
                  <Typography sx={{ fontSize: 13, color: String(v).trim() ? "text.primary" : "text.disabled" }}>
                    {String(v).trim() || "— (unknown; numeric gates never fire on this)"}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </DialogContent>
        )}
      </Dialog>

      {/* ── flat policy: the whole decision table, under the bucket it feeds ── */}
      <Dialog open={rulesOpen && !!policy} onClose={() => setRulesOpen(false)} maxWidth="sm" fullWidth disablePortal>
        {policy && (
        <DialogContent sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", mb: 0.5 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 650, flex: 1, minWidth: 0 }}>
              How “{policy.title}” decides
            </Typography>
            <IconButton size="small" aria-label="Close" onClick={() => setRulesOpen(false)}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.5 }}>
            Rules are tested top to bottom on every item; the first rule that matches claims it
            and names its bucket. Rule numbers here are the same ones shown on the bucketed items.
          </Typography>

          {order.map((k, i) => {
            const feeding = policy.cases
              .map((c, gi) => ({ c, gi }))
              .filter(({ c }) => c.bucket === k);
            const n = counts.find((x) => x.k === k)?.n ?? 0;
            return (
              <Box key={k} sx={{ mb: 1.5 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.5 }}>
                  <Chip size="small" label={`${i + 1}. ${bucketLabel(policy, k)} · ${n}`}
                    sx={{ height: 20, fontSize: 12, fontWeight: 700,
                          bgcolor: n ? "#4f46e514" : "#0f172a0d",
                          color: n ? "#4f46e5" : "text.disabled" }} />
                  {k === defaultBucket && (
                    <Typography sx={{ fontSize: 12, color: "text.disabled" }}>default</Typography>
                  )}
                </Stack>
                <Stack spacing={0.5}>
                  {feeding.map(({ c, gi }) => (
                    <Box key={gi} sx={{ border: "1px solid", borderColor: "divider",
                                        borderRadius: 1.5, px: 1, py: 0.6 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline" }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 650, flex: 1, minWidth: 0 }}>
                          rule {gi + 1}: {c.label ?? "case"}
                        </Typography>
                        <Typography sx={{ fontSize: 12, flexShrink: 0,
                                          color: claimedBy[gi] ? "#4f46e5" : "text.disabled" }}>
                          claimed {claimedBy[gi]}
                        </Typography>
                      </Stack>
                      {c.when.length ? c.when.map((cl, ci) => (
                        <Typography key={ci} sx={{ fontSize: 13, fontFamily: "monospace",
                                                   color: "text.secondary" }}>
                          {ci > 0 ? "and " : "when "}{clauseText(cl)}
                        </Typography>
                      )) : (
                        <Typography sx={{ fontSize: 13, fontStyle: "italic",
                                          color: "text.secondary" }}>always</Typography>
                      )}
                    </Box>
                  ))}
                  {k === defaultBucket && (
                    <Box sx={{ border: "1px dashed", borderColor: "divider",
                               borderRadius: 1.5, px: 1, py: 0.6 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline" }}>
                        <Typography sx={{ fontSize: 13, fontStyle: "italic",
                                          color: "text.secondary", flex: 1, minWidth: 0 }}>
                          no rule matched — items nothing claims land here
                        </Typography>
                        <Typography sx={{ fontSize: 12, flexShrink: 0,
                                          color: unclaimed ? "#b45309" : "text.disabled" }}>
                          claimed {unclaimed}
                        </Typography>
                      </Stack>
                    </Box>
                  )}
                  {!feeding.length && k !== defaultBucket && (
                    <Typography sx={{ fontSize: 13, fontStyle: "italic", color: "text.disabled" }}>
                      No rule routes here.
                    </Typography>
                  )}
                </Stack>
              </Box>
            );
          })}

          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                            textTransform: "uppercase", color: "text.disabled", mt: 1.5, mb: 0.5 }}>
            What the policy reads
          </Typography>
          <Stack spacing={0.4}>
            {policy.params.map((p) => (
              <Box key={p.key} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                <Typography sx={{ fontSize: 12, fontFamily: "monospace", color: "text.disabled",
                                  width: 118, flexShrink: 0 }}>{p.key}</Typography>
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                  {p.type}
                  {run.map[p.key]?.length ? ` — from ${run.map[p.key].join(" + ")}` : " — not mapped"}
                </Typography>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        )}
      </Dialog>

      {/* ── chain: the order policy itself, operable — and from there, the
             tags policy one level further down ── */}
      <Dialog open={rulesOpen && !!chain} onClose={() => setRulesOpen(false)} maxWidth="md" fullWidth
        disablePortal PaperProps={{ sx: { height: "85vh" } }}>
        {chain && (
          <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "flex-end", px: 1, pt: 1, flexShrink: 0 }}>
              <IconButton size="small" aria-label="Close" onClick={() => setRulesOpen(false)}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <OrderPolicyView doc={chain.order} base={chain.orderPath} height="100%" />
            </Box>
          </Box>
        )}
      </Dialog>
    </Box>
  );
}
