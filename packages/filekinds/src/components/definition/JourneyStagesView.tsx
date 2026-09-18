/**
 * THE STAGED JOURNEY — everything in one place, stacks only, no DAG.
 *
 * Stages stack VERTICALLY (the process is sequential); inside a stage,
 * lanes or per-item columns stack HORIZONTALLY (a step can be parallel).
 * The one/many action lives on the BOUNDARY between stages and is drawn as
 * a glyph, not an edge: ⇒ collate (many strands pool into one artifact),
 * ⇉ fan out (one pool becomes per-item columns).
 *
 * A fanout stage is a grid: SPINE steps span every column (the common,
 * streamlined process); each column keeps its own divergent steps in the
 * zones between bands. The same stage flips to a KANBAN — columns are the
 * spine, cards are the items — because the board is a projection of the
 * grid, never separate children.
 *
 * Depth is always a DIALOG: a lane's process, an item's instance, a step's
 * run or list, the whole portal journey — one click, same page.
 */
import { useEffect, useState } from "react";
import { Box, Chip, Dialog, DialogContent, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { joinPath, resolveRef, splitRef, versionLabelOf } from "crosscut";
import { browseFolder } from "../../lib/studioDialog";
import { VersionRefState, probeVersionRef, readVirtualDirectoryFile } from "../../api";
import {
  CalTask, CollateFacts, JLane, JStage, JState, JStep, JourneyStagesDoc, attentionCount, boundaryOf,
  collateFactsOf, columnGroups, embedStages, fanRows, isRefLike, kanbanColumn, monthGrid,
  parseJourneyStages, pinnedRefFor, rewriteRef, spineState, tasksOfRows,
} from "../../lib/journeyStages";
import { tasksFromNodeFolder } from "../../lib/kanbanDoc";
import { readListRows } from "../../lib/listCollate";
import {
  applyOrder, deriveTags, entryLabel, locksOfTags, orderKeyLabel, orderKeys,
  parsePolicyKindFile, parseTagsPolicy, tagAnswerLabel, viaText, visibleTags,
} from "../../lib/policyChain";
import { applyPolicy, bucketLabel, bucketOrder, inputForRow } from "../../lib/policyDoc";
import { NodeRefDialog } from "../points/PointsView";
import { RowFieldsBlock } from "../list/DocListView";

export { parseJourneyStages };

interface FanColumn {
  label: string;
  /** "9 gaps" — a per-column footnote. */
  sub?: string;
  /** The BUCKET the column came from (its rank label) — contiguous columns
   *  sharing a group render under one spanning group header. */
  group?: string;
  /** Ref opened from the column header (the row's ad, the group's list). */
  open?: string | null;
}

/** Per-stage loaded extras (fanout columns, calendar tasks, list rows). */
interface StageData {
  columns?: FanColumn[];
  tasks?: CalTask[];
  /** A collated-list stage's rows, for the horizontal preview flow. */
  rows?: { label: string; url?: string; sub?: string }[];
  /** A policy-run stage's items, categorized — grouped like a fanout. */
  runItems?: { label: string; url?: string; group: string }[];
  /** Content lanes: per-lane structure rows (a policy's dimensions/entries). */
  laneRows?: Record<string, LaneRow[]>;
  /** Content lanes: per-lane raw TEXT (a markdown file shown in-column). */
  laneText?: Record<string, string>;
  /** Per-lane band-click override (a fork lane opens its trunk, not `out`). */
  laneOpen?: Record<string, string>;
  /** Lanes that are EMBEDS — the band draws provenance-violet. */
  laneEmbed?: Record<string, boolean>;
  /** VERSION state per ref-as-written (lane `out`, step `file`): pinned to a
   *  version, unpinned (a versioned folder, reads as latest), or absent for
   *  plain files. */
  pins?: Record<string, VersionRefState>;
  err?: string;
}

const GROUP_COLORS = ["#4f46e5", "#0e7490", "#b45309", "#15803d", "#9d174d", "#6d28d9"];

/** One structure row of a content lane: a tags dimension (label + sub), or
 *  an order entry (rank number + optional hand label + dimension:value
 *  chips, exactly how the order view's Output pane draws it). */
interface LaneRow {
  num?: number;
  label?: string;
  sub?: string;
  chips?: { dim: string; val: string }[];
  /** The full list row behind this lane row — present on flowing-list
   *  rows, and what the row dialog shows on click. */
  fields?: Record<string, string>;
}

/** A policy DOCUMENT's structure as lane rows: a tags policy's dimensions,
 *  an order policy's ranked entries. Null when the file is something else. */
async function structureRows(abs: string): Promise<LaneRow[] | null> {
  const parsed = parsePolicyKindFile((await readVirtualDirectoryFile(abs, abs)).content);
  if (parsed.role === "order") {
    let dims: ReturnType<typeof parseTagsPolicy>["tags"] | null = null;
    try {
      const tAbs = resolveRef(abs, parsed.tags);
      dims = parseTagsPolicy((await readVirtualDirectoryFile(tAbs, tAbs)).content).tags;
    } catch { /* labels fall back to raw refs */ }
    return parsed.order.map((e, i) => ({
      num: i + 1,
      ...(e.label ? { label: e.label } : {}),
      chips: e.when.map((ref) => {
        const [dk, vk] = splitRef(ref);
        const d = dims?.find((x) => x.key === dk);
        const vals = vk.split("|").filter(Boolean);
        return {
          dim: d?.label ?? dk,
          val: vals.map((v) => d?.values.find((x) => x.key === v)?.label ?? v).join(" or ") || vk,
        };
      }),
    }));
  }
  if (parsed.role === "tags") {
    return parsed.tags.map((d) => ({
      label: d.label,
      sub: `${d.values.length} values · ${(d.from.length ? d.from : d.derive).length} rules`,
    }));
  }
  return null;
}

/** Version state for every file ref this stage draws (lane `out`, step
 *  `file`). Plain files stay out of the map — no chip, no cost downstream. */
async function loadPins(stage: JStage, base: string): Promise<Record<string, VersionRefState>> {
  const refs = new Set<string>();
  for (const l of [...(stage.lanes ?? []), ...(stage.grid ?? []).flat()]) if (l.out) refs.add(l.out);
  for (const s of stage.steps) if (s.file) refs.add(s.file);
  const pins: Record<string, VersionRefState> = {};
  await Promise.all([...refs].map(async (ref) => {
    try {
      const st = await probeVersionRef(resolveRef(base, ref));
      if (st.state !== "plain") pins[ref] = st;
    } catch { /* stays plain */ }
  }));
  return pins;
}

async function loadStage(stage: JStage, base: string): Promise<StageData> {
  try {
    // CONTENT LANES: a lane whose `out` is a policy shows that policy's
    // structure vertically inside its column; a lane with `flow: true`
    // shows its list's rows; a text `out` shows the document itself; a
    // `fork` lane compresses another journey's shared prefix into rows —
    // definitions, data, and provenance side by side.
    const cells = [...(stage.lanes ?? []), ...(stage.grid ?? []).flat()].filter((l) => l.label);
    if (stage.grid || cells.some((l) =>
      l.embed || l.answers || l.out?.endsWith(".policy") || /\.(md|txt)$/i.test(l.out ?? "") || (l.flow && l.out),
    )) {
      const laneRows: Record<string, LaneRow[]> = {};
      const laneText: Record<string, string> = {};
      const laneOpen: Record<string, string> = {};
      const laneEmbed: Record<string, boolean> = {};
      for (const l of cells) {
        try {
          if (l.embed) {
            // The embedded journey's stages, one compact row each: the boundary
            // glyph carries the one/many story the full view draws large.
            const tAbs = resolveRef(base, l.embed);
            const src = parseJourneyStages((await readVirtualDirectoryFile(tAbs, tAbs)).content);
            if (src) {
              const resolved = await resolveEmbeds(src, tAbs);
              const shared = embedStages({ ...src, stages: resolved }, tAbs, l.at);
              laneRows[l.label] = shared.map((s, i) => ({
                label: `${i === 0 ? "" : { collate: "⇒ ", fanout: "⇉ ", carry: "→ " }[boundaryOf(s)]}${s.label}`,
                ...(s.detail ? { sub: s.detail } : {}),
              }));
              laneOpen[l.label] = tAbs;
              laneEmbed[l.label] = true;
            }
            continue;
          }
          if (l.answers && l.item) {
            // DECISION ANSWERS, derived live for one row: the same chain
            // the run view walks, narrowed to this item — dimension by
            // dimension, each with the rule that fired, plus the rank.
            const rAbs = resolveRef(base, l.answers);
            const run = parsePolicyKindFile((await readVirtualDirectoryFile(rAbs, rAbs)).content);
            if (run.role !== "run") throw new Error(`${l.answers} is not a policy run`);
            const oAbs = resolveRef(rAbs, run.policy);
            const order = parsePolicyKindFile((await readVirtualDirectoryFile(oAbs, oAbs)).content);
            if (order.role !== "order") throw new Error(`${run.policy} is not an order policy`);
            const tAbs = resolveRef(oAbs, order.tags);
            const tagsDoc = parseTagsPolicy((await readVirtualDirectoryFile(tAbs, tAbs)).content);
            const { rows } = await readListRows(resolveRef(rAbs, run.items));
            const row = rows.find((x) => x.label === l.item);
            if (row) {
              const answers = deriveTags(tagsDoc, inputForRow(run, row));
              const shown = visibleTags(tagsDoc);
              const laneRowsFor: LaneRow[] = answers
                .filter((a) => shown.some((d) => d.key === a.dimension))
                .map((a) => ({
                  chips: [{
                    dim: tagsDoc.tags.find((d) => d.key === a.dimension)?.label ?? a.dimension,
                    val: tagAnswerLabel(tagsDoc, a),
                  }],
                  ...(viaText(tagsDoc, a) ? { sub: viaText(tagsDoc, a)! } : {}),
                }));
              const v = applyOrder(order, locksOfTags(answers));
              if (v.index >= 0) {
                laneRowsFor.push({ num: v.index + 1, label: orderKeyLabel(order, tagsDoc.tags, `rank:${v.index}`).replace(/^\d+\.\s*/, "") });
              }
              laneRows[l.label] = laneRowsFor;
              laneOpen[l.label] = rAbs;
            }
            continue;
          }
          if (!l.out) continue;
          const abs = resolveRef(base, l.out);
          if (l.out.endsWith(".policy")) {
            const r = await structureRows(abs);
            if (r) laneRows[l.label] = r;
          } else if (/\.(md|txt)$/i.test(l.out)) {
            laneText[l.label] = (await readVirtualDirectoryFile(abs, abs)).content;
          } else if (l.flow) {
            const { rows } = await readListRows(abs);
            laneRows[l.label] = rows.map((r) => ({
              label: r.label ?? "(unlabelled)",
              ...(r.fields?.source ?? r.fields?.context
                ? { sub: r.fields?.source ?? r.fields?.context } : {}),
              ...(r.fields && Object.keys(r.fields).length ? { fields: r.fields } : {}),
            }));
          }
        } catch { /* a broken lane stays a plain card */ }
      }
      return { laneRows, laneText, laneOpen, laneEmbed };
    }
    if (stage.fanout) {
      const f = stage.fanout;
      if (f.run) {
        // The pool arrives RANKED: evaluate the chain exactly as the run
        // view does, keep the requested rank positions, in rank order.
        const rAbs = resolveRef(base, f.run);
        const run = parsePolicyKindFile((await readVirtualDirectoryFile(rAbs, rAbs)).content);
        if (run.role !== "run") throw new Error(`${f.run} is not a policy run`);
        const oAbs = resolveRef(rAbs, run.policy);
        const order = parsePolicyKindFile((await readVirtualDirectoryFile(oAbs, oAbs)).content);
        if (order.role !== "order") throw new Error(`${run.policy} is not an order policy`);
        const tAbs = resolveRef(oAbs, order.tags);
        const tags = parseTagsPolicy((await readVirtualDirectoryFile(tAbs, tAbs)).content);
        const lAbs = resolveRef(rAbs, run.items);
        const { rows } = await readListRows(lAbs);
        const ranked = rows.map((row) => {
          const v = applyOrder(order, locksOfTags(deriveTags(tags, inputForRow(run, row))));
          return { row, index: v.index };
        }).filter((x) => x.index >= 0 && (f.ranks ?? []).includes(x.index + 1));
        ranked.sort((a, b) => a.index - b.index);
        const cols = ranked.map(({ row, index }) => ({
          label: row.label ?? "(unlabelled)",
          group: orderKeyLabel(order, tags.tags, `rank:${index}`),
          open: row.fields?.url ?? null,
        }));
        return { columns: f.take ? cols.slice(0, f.take) : cols };
      }
      if (f.list && f.by) {
        // Group-by fan: one column per distinct value of the field.
        const lAbs = resolveRef(base, f.list);
        const { rows } = await readListRows(lAbs);
        const seen = new Map<string, number>();
        for (const r of rows) {
          const v = r.fields?.[f.by]?.trim();
          if (v) seen.set(v, (seen.get(v) ?? 0) + 1);
        }
        const cols = [...seen.entries()].map(([v, n]) => ({
          label: v, sub: `${n} item${n === 1 ? "" : "s"}`, open: lAbs,
        }));
        return { columns: f.take ? cols.slice(0, f.take) : cols };
      }
      if (f.list) {
        const lAbs = resolveRef(base, f.list);
        const { rows } = await readListRows(lAbs);
        const cols = rows.map((r) => ({
          label: r.label ?? "(unlabelled)", open: r.fields?.url ?? lAbs,
        }));
        return { columns: f.take ? cols.slice(0, f.take) : cols };
      }
      return { columns: [] };
    }
    if (stage.calendar) {
      const tasks: CalTask[] = [];
      for (const src of stage.calendar.sources) {
        const abs = resolveRef(base, src);
        const { rows } = await readListRows(abs);
        const stem = abs.slice(abs.lastIndexOf("/") + 1).replace(/\.[a-z]+$/, "").replace(/^tasks-/, "");
        tasks.push(...tasksOfRows(rows, stem));
      }
      return { tasks };
    }
    const runStep = stage.steps.find((s) => s.file?.endsWith(".policy") && s.flow !== false);
    if (!stage.collate && runStep) {
      // A policy-run stage shows EVERY item, categorized — the same bucket
      // grouping a fanout wears, over the whole pool.
      const rAbs = resolveRef(base, runStep.file!);
      const run = parsePolicyKindFile((await readVirtualDirectoryFile(rAbs, rAbs)).content);
      if (run.role === "run") {
        const pAbs = resolveRef(rAbs, run.policy);
        const pol = parsePolicyKindFile((await readVirtualDirectoryFile(pAbs, pAbs)).content);
        const lAbs = resolveRef(rAbs, run.items);
        const { rows } = await readListRows(lAbs);
        const mk = (row: (typeof rows)[number], group: string, idx: number) => ({
          label: row.label ?? "(unlabelled)",
          ...(row.fields?.url ? { url: row.fields.url } : {}),
          group, idx,
        });
        if (pol.role === "order") {
          const tAbs = resolveRef(pAbs, pol.tags);
          const tagsDoc = parseTagsPolicy((await readVirtualDirectoryFile(tAbs, tAbs)).content);
          const keys = orderKeys(pol);
          const items = rows.map((row) => {
            const v = applyOrder(pol, locksOfTags(deriveTags(tagsDoc, inputForRow(run, row))));
            return mk(row, orderKeyLabel(pol, tagsDoc.tags, v.key), keys.indexOf(v.key));
          }).sort((a, b) => a.idx - b.idx);
          return { runItems: items };
        }
        if (pol.role === "policy") {
          const keys = bucketOrder(pol);
          const items = rows.map((row) => {
            const v = applyPolicy(pol, inputForRow(run, row));
            return mk(row, bucketLabel(pol, v.bucket), keys.indexOf(v.bucket));
          }).sort((a, b) => a.idx - b.idx);
          return { runItems: items };
        }
      }
      // The step is a POLICY DOCUMENT, not a run — flow its structure: an
      // order policy's ranked entries, a tags policy's dimensions.
      if (run.role === "order") {
        let tagDims = null;
        try {
          const tAbs = resolveRef(rAbs, run.tags);
          tagDims = parseTagsPolicy((await readVirtualDirectoryFile(tAbs, tAbs)).content).tags;
        } catch { /* labels fall back to raw refs */ }
        return { rows: run.order.map((e, i) => ({ label: `${i + 1}. ${entryLabel(tagDims, e)}` })) };
      }
      if (run.role === "tags") {
        return {
          rows: run.tags.map((d) => ({
            label: d.label,
            sub: `${d.values.length} values · ${(d.from.length ? d.from : d.derive).length} rules`,
          })),
        };
      }
      return {};
    }
    const listStep = stage.steps.find((s) => s.file?.endsWith(".list") && s.flow !== false);
    if (!stage.collate && listStep) {
      // A list step flows its rows, exactly like a collated pool.
      const abs = resolveRef(base, listStep.file!);
      try {
        const { rows } = await readListRows(abs);
        return {
          rows: rows.map((r) => ({
            label: r.label ?? "(unlabelled)",
            ...(r.fields?.url ? { url: r.fields.url } : {}),
            ...(r.fields?.source ?? r.fields?.context
              ? { sub: r.fields?.source ?? r.fields?.context } : {}),
          })),
        };
      } catch { return {}; }
    }
    if (stage.collate && isRefLike(stage.collate)) {
      // A pooled LIST flows its rows horizontally, like any other strip.
      const abs = resolveRef(base, stage.collate);
      try {
        const { rows } = await readListRows(abs);
        return {
          rows: rows.map((r) => ({
            label: r.label ?? "(unlabelled)",
            ...(r.fields?.url ? { url: r.fields.url } : {}),
            ...(r.fields?.source ?? r.fields?.context
              ? { sub: r.fields?.source ?? r.fields?.context } : {}),
          })),
        };
      } catch { return {}; }
    }
    if (stage.collate && !isRefLike(stage.collate)) {
      // A pooled FOLDER of structured nodes flows the same way: one card per
      // node — labelled by the node's own folded title, subtitled by its
      // status — and each card opens the node itself.
      const abs = resolveRef(base, stage.collate);
      try {
        const tasks = await tasksFromNodeFolder(abs);
        if (tasks.length) {
          return {
            rows: tasks.map((t) => ({
              label: t.title,
              url: joinPath(abs, `${t.key}.node`),
              ...(t.status ? { sub: t.status } : {}),
            })),
          };
        }
      } catch { /* the ⇒ band still links the folder */ }
      return {};
    }
    return {};
  } catch (e: unknown) {
    return { err: e instanceof Error ? e.message : String(e) };
  }
}

/* ── small shared pieces ───────────────────────────────────────────────── */

function StepChip({ label, st, hint, onOpen }: {
  label: string; st: JState; hint?: string; onOpen?: (() => void) | null;
}) {
  const amber = st === "next";
  return (
    <Tooltip title={hint ?? (st === "next" ? "next — waiting on this" : st)}>
      <Box onClick={onOpen ?? undefined}
        sx={{ px: 0.9, py: 0.45, borderRadius: 1, minWidth: 0,
              border: amber ? "1.5px solid #b45309" : "1px solid",
              borderStyle: st === "pending" ? "dashed" : "solid",
              borderColor: amber ? "#b45309" : st === "done" ? "divider" : "#0f172a33",
              bgcolor: amber ? "#b453090f" : st === "done" ? "#fff" : "#fafbfc",
              boxShadow: st === "done" ? "0 1px 2px #0f172a12" : "none",
              cursor: onOpen ? "pointer" : "default",
              "&:hover": onOpen ? { borderColor: "#4f46e5" } : undefined }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, wordBreak: "break-word",
                          color: amber ? "#b45309" : st === "done" ? "text.primary" : "text.disabled" }}>
          {st === "done" ? "✓ " : ""}{label}
        </Typography>
      </Box>
    </Tooltip>
  );
}

/** EVERY operation between two cells wears the same face: a glyph, an
 *  uppercase description, and "what happened?" opening the same dialog —
 *  collation, fan-out, and a policy transform are peers. */
function OpRow({ glyph, text, onClick, mini }: {
  glyph: string; text: string; onClick: () => void;
  /** The operation has a MINI JOURNEY behind it — worn in amber, the mini
   *  journey's own color, so exploration-backed links stand out. */
  mini?: boolean;
}) {
  const accent = mini ? "#b45309" : "#4f46e5";
  return (
    <Stack direction="row" spacing={0.75} onClick={onClick}
      sx={{ alignItems: "center", py: 0.5, pl: 1.5, cursor: "pointer", width: "fit-content",
            "&:hover": { "& .op-hint": { color: accent } } }}>
      <Typography sx={{ fontSize: 15, color: accent, fontWeight: 700, lineHeight: 1 }}>{glyph}</Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                        textTransform: "uppercase", color: mini ? accent : "text.secondary" }}>
        {text}
      </Typography>
      <Typography className="op-hint" sx={{ fontSize: 12, color: "text.disabled" }}>
        {mini ? "· mini journey · what happened?" : "· what happened?"}
      </Typography>
    </Stack>
  );
}

const stemOf = (ref: string) => ref.slice(ref.lastIndexOf("/") + 1);

/** VERSION state of one ref, worn under its cell. A pinned ref holds the
 *  version it was added with — forever, that is the contract — so the bar is
 *  quiet until newer versions exist; then it names the latest and (when the
 *  host can write) offers the ONE manual way to move: update. An unpinned
 *  ref to a versioned folder reads as latest and asks to be pinned. */
function PinBar({ pin, ref_, onRewrite }: {
  pin: VersionRefState;
  /** The ref AS WRITTEN in the YAML — what a rewrite replaces. */
  ref_: string;
  onRewrite?: (from: string, to: string) => void;
}) {
  if (pin.state === "plain") return null;
  const chip = (label: string, title: string, onClick: () => void) => (
    <Box component="span" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onClick(); }} title={title}
      sx={{ ml: 0.5, px: 0.5, py: 0.1, borderRadius: 0.75, cursor: "pointer", fontWeight: 800,
            bgcolor: "#b4530922", "&:hover": { bgcolor: "#b4530938" } }}>
      {label}
    </Box>
  );
  if (pin.state === "pinned") {
    const behind = pin.behind && pin.latest;
    return (
      <Box title={behind
          ? `Pinned to ${pin.label}; ${versionLabelOf(pin.latest!)} exists. This journey keeps its version until you update it.`
          : `Pinned to ${pin.label} — new versions of ${stemOf(pin.folder)} never change this journey.`}
        sx={{ display: "flex", alignItems: "center", mb: 0.5, px: 0.6, py: 0.25, borderRadius: 1,
              border: `1px ${behind ? "solid #b4530955" : "dashed #0f172a22"}`,
              bgcolor: behind ? "#b453090a" : "transparent" }}>
        <Typography noWrap sx={{ fontSize: 12, fontWeight: 700,
                                 color: behind ? "#b45309" : "text.disabled" }}>
          ⊙ {pin.label}{behind ? ` · latest ${versionLabelOf(pin.latest!)}` : ""}
          {behind && onRewrite && chip("update", `Re-pin to ${versionLabelOf(pin.latest!)}`,
            () => onRewrite(ref_, pinnedRefFor(ref_, pin.latest!, true)))}
        </Typography>
      </Box>
    );
  }
  return (
    <Box title={pin.latest
        ? `${stemOf(pin.folder)} is a versioned file and this ref is unpinned — it follows the latest version (${versionLabelOf(pin.latest)}). Pin it so later versions can't change this journey.`
        : `${stemOf(pin.folder)} is a versioned folder with no versions yet.`}
      sx={{ display: "flex", alignItems: "center", mb: 0.5, px: 0.6, py: 0.25, borderRadius: 1,
            border: "1px solid #b4530955", bgcolor: "#b453090a" }}>
      <Typography noWrap sx={{ fontSize: 12, fontWeight: 700, color: "#b45309" }}>
        ◌ unpinned{pin.latest ? ` — showing ${versionLabelOf(pin.latest)}` : " — no versions"}
        {pin.latest && onRewrite && chip("pin", `Lock this journey to ${versionLabelOf(pin.latest)}`,
          () => onRewrite(ref_, pinnedRefFor(ref_, pin.latest!, false)))}
      </Typography>
    </Box>
  );
}

/** A policy run's items flowing horizontally, categorized: the same
 *  bucket group-bands a fanout wears, over the whole pool — ten up front,
 *  the rest behind "show all". */
function GroupedFlow({ items, onOpen, fallbackRef }: {
  items: NonNullable<StageData["runItems"]>;
  onOpen: (ref: string, label?: string) => void;
  fallbackRef: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 10);
  const groups = columnGroups(shown.map((i) => i.group));
  const W = 150;
  return (
    <Box sx={{ overflowX: "auto", mt: 0.75, pb: 0.5 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${shown.length}, ${W}px)`,
                 gap: "6px", mb: 0.5 }}>
        {groups.map((g, i) => (
          <Box key={i} sx={{ gridColumn: `span ${g.span}`, minWidth: 0,
                             bgcolor: "#4f46e50d", border: "1px solid #4f46e533",
                             borderRadius: 1, px: 0.75, py: 0.3 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#4f46e5",
                              letterSpacing: "0.04em" }} noWrap
              title={`${g.label} — ${g.span} shown from this bucket`}>
              {g.label} · {g.span}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: "flex", gap: "6px" }}>
        {shown.map((r, i) => (
          <Box key={i} onClick={() => onOpen(r.url ?? fallbackRef, r.label)}
            sx={{ width: W, flexShrink: 0, border: "1px solid", borderColor: "divider",
                  borderRadius: 1.5, px: 0.75, py: 0.6, bgcolor: "#fff", cursor: "pointer",
                  boxSizing: "border-box", "&:hover": { borderColor: "#4f46e5" } }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3,
                              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                              overflow: "hidden" }}>
              {r.label}
            </Typography>
          </Box>
        ))}
        {items.length > 10 && (
          <Box onClick={() => setAll((a) => !a)}
            sx={{ minWidth: 92, flexShrink: 0, border: "1px dashed #4f46e566", borderRadius: 1.5,
                  display: "flex", alignItems: "center", justifyContent: "center", px: 0.75,
                  cursor: "pointer", "&:hover": { borderColor: "#4f46e5", bgcolor: "#4f46e508" } }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textAlign: "center" }}>
              {all ? "show fewer" : `show all · ${items.length}`}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** A pooled list's rows, flowing horizontally like every other strip —
 *  ten up front, the rest behind "show all". */
function ListFlow({ rows, onOpen, listRef }: {
  rows: NonNullable<StageData["rows"]>;
  onOpen: (ref: string, label?: string) => void;
  listRef: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 10);
  return (
    <Box sx={{ display: "flex", gap: 0.6, overflowX: "auto", mt: 0.75, pb: 0.5 }}>
      {shown.map((r, i) => (
        <Box key={i} onClick={() => onOpen(r.url ?? listRef, r.label)}
          sx={{ width: 150, flexShrink: 0, border: "1px solid", borderColor: "divider",
                borderRadius: 1.5, px: 0.75, py: 0.6, bgcolor: "#fff", cursor: "pointer",
                "&:hover": { borderColor: "#4f46e5" } }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3,
                            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                            overflow: "hidden" }}>
            {r.label}
          </Typography>
          {r.sub && <Typography sx={{ fontSize: 12, color: "text.disabled" }} noWrap>{r.sub}</Typography>}
        </Box>
      ))}
      {rows.length > 10 && (
        <Box onClick={() => setAll((a) => !a)}
          sx={{ minWidth: 92, flexShrink: 0, border: "1px dashed #4f46e566", borderRadius: 1.5,
                display: "flex", alignItems: "center", justifyContent: "center", px: 0.75,
                cursor: "pointer", "&:hover": { borderColor: "#4f46e5", bgcolor: "#4f46e508" } }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textAlign: "center" }}>
            {all ? "show fewer" : `show all · ${rows.length}`}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function Boundary({ stage, onOp }: {
  stage: JStage; onOp: (target: OpTarget) => void;
}) {
  const b = boundaryOf(stage);
  if (b === "carry") {
    // A carry INTO a policy stage is a TRANSFORM: same face as the other
    // operations — the dialog names the policy and opens its rules.
    const policyStep = stage.steps.find((s) => s.file?.endsWith(".policy"));
    if (policyStep) {
      return <OpRow glyph="→" text={`apply the policy — ${stemOf(policyStep.file!)}`}
        mini={!!policyStep.journey} onClick={() => onOp({ stage, step: policyStep })} />;
    }
    return <Box sx={{ height: 14, borderLeft: "2px solid #0f172a22", ml: 3 }} />;
  }
  const collate = b === "collate";
  return <OpRow glyph={collate ? "⇒" : "⇉"}
    text={collate
      ? `collate into ${stage.collate ?? "one pool"}`
      : stage.fanout?.by
        ? `fan out — one column per ${stage.fanout.by}`
        : "fan out — one column per item"}
    mini={!collate && !!stage.fanout?.journey}
    onClick={() => onOp({ stage })} />;
}

/** One operation of a pooled stage — the collated artifact, a policy run, a
 *  plain step — as its own cell in a horizontal row. */
function OpCell({ glyph, title, sub, hint, onClick }: {
  glyph?: string; title: string; sub?: string; hint?: string; onClick?: (() => void) | null;
}) {
  return (
    <Tooltip title={hint ?? ""}>
      <Box onClick={onClick ?? undefined}
        sx={{ minWidth: 150, maxWidth: 260, flexShrink: 0, border: "1px solid", borderColor: "divider",
              borderRadius: 1.5, px: 1, py: 0.7, bgcolor: "#fafbfc",
              cursor: onClick ? "pointer" : "default",
              "&:hover": onClick ? { borderColor: "#4f46e5" } : undefined }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
          {glyph ? `${glyph} ` : ""}{title}{onClick ? "  ↗" : ""}
        </Typography>
        {sub && <Typography sx={{ fontSize: 12, color: "text.disabled" }} noWrap>{sub}</Typography>}
      </Box>
    </Tooltip>
  );
}

/** What a "what happened?" click points at: a stage's boundary operation,
 *  or one policy/plain step treated as an operation. */
interface OpTarget { stage: JStage; step?: JStep }

/**
 * WHAT HAPPENED — every operation explained through ONE dialog, whatever
 * its kind. A policy transform names the policy and opens its rules and its
 * run; a deterministic operation (collation, group-by, plain step) states
 * its facts: sources, dedupe key, counts. Nothing between cells is a
 * mystery, and nothing gets a special face.
 */
function OperationDialog({ target, data, base, onClose, onOpenNode }: {
  target: OpTarget | null;
  data: StageData;
  base: string;
  onClose: () => void;
  onOpenNode: (ref: string, label?: string) => void;
}) {
  const stage = target?.stage ?? null;
  const step = target?.step ?? null;
  const [facts, setFacts] = useState<(CollateFacts & { rows?: number }) | null>(null);
  /** A policy step resolved: the RUN (if it is one) and the RULES behind it. */
  const [policyRefs, setPolicyRefs] = useState<{ run?: string; rules: string } | null>(null);
  useEffect(() => {
    let live = true;
    setFacts(null); setPolicyRefs(null);
    if (step?.file?.endsWith(".policy")) {
      const abs = resolveRef(base, step.file);
      (async () => {
        try {
          const parsed = parsePolicyKindFile((await readVirtualDirectoryFile(abs, abs)).content);
          if (!live) return;
          setPolicyRefs(parsed.role === "run"
            ? { run: abs, rules: resolveRef(abs, parsed.policy) }
            : { rules: abs });
        } catch { if (live) setPolicyRefs({ rules: abs }); }
      })();
      return () => { live = false; };
    }
    if (!stage?.collate || !isRefLike(stage.collate) || step) return;
    const abs = resolveRef(base, stage.collate);
    (async () => {
      try {
        const f = collateFactsOf((await readVirtualDirectoryFile(abs, abs)).content);
        let rows: number | undefined;
        try { rows = (await readListRows(abs)).rows.length; } catch { /* not a list */ }
        if (live) setFacts({ ...f, rows });
      } catch { if (live) setFacts({ sources: [] }); }
    })();
    return () => { live = false; };
  }, [stage, step, base]);

  if (!stage) return null;
  const b = step ? (step.file?.endsWith(".policy") ? "policy" : "step") : boundaryOf(stage);
  const openChip = (ref: string, label: string) => (
    <Chip key={ref} size="small" label={`${label}  ↗`} onClick={() => { onClose(); onOpenNode(ref, label); }}
      sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
            bgcolor: "#4f46e514", color: "#4f46e5", "&:hover": { bgcolor: "#4f46e526" } }} />
  );
  return (
    // disablePortal: this dialog also opens INSIDE the Radix node dialog (a
    // mini journey), whose modal sets pointer-events:none on the body — a
    // body-portaled dialog there can never be clicked closed.
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth disablePortal>
      <DialogContent sx={{ p: 2.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", mb: 0.75 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 650, flex: 1, minWidth: 0 }}>
            {b === "collate" ? "⇒ Collate" : b === "fanout" ? "⇉ Fan out"
              : b === "policy" ? "→ Apply the policy" : "→ Operation"} — into “{stage.label}”
          </Typography>
          <IconButton size="small" aria-label="Close" onClick={onClose}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>

        {b === "policy" && step && (
          <>
            <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1 }}>
              The previous cell's rows go <b>through a policy</b>: its rules decide where every
              row lands — nothing is hand-sorted. Open the rules to see the ordering itself, or
              the run to see every row's verdict.
            </Typography>
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
              {policyRefs && (
                <Chip size="small" label="open the rules  ↗"
                  onClick={() => { onClose(); onOpenNode(policyRefs.rules, `${step.label} — the rules`); }}
                  sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        bgcolor: "#4f46e514", color: "#4f46e5", "&:hover": { bgcolor: "#4f46e526" } }} />
              )}
              {policyRefs?.run && (
                <Chip size="small" label="open the run — every row's verdict  ↗"
                  onClick={() => { onClose(); onOpenNode(policyRefs.run!, step.label); }}
                  sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        bgcolor: "#4f46e514", color: "#4f46e5", "&:hover": { bgcolor: "#4f46e526" } }} />
              )}
            </Stack>
            {step.journey && (
              <>
                <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                                  textTransform: "uppercase", color: "text.disabled", mt: 1.5, mb: 0.5 }}>
                  how this operation came to be
                </Typography>
                <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 0.75 }}>
                  The one-off exploration that produced this policy lives behind the link as a
                  mini journey. Its output IS the policy above — edit it there and the main
                  journey re-categorizes on its next load.
                </Typography>
                <Chip size="small" label="open the mini journey  ↗"
                  onClick={() => { onClose(); onOpenNode(step.journey!, `${step.label} — how it came to be`); }}
                  sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        bgcolor: "#b453091a", color: "#b45309", "&:hover": { bgcolor: "#b4530930" } }} />
              </>
            )}
          </>
        )}

        {b === "step" && step && (
          <>
            <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1 }}>
              A <b>deterministic step</b> — no policy chooses here; the previous cell's output
              goes through this operation as-is.
            </Typography>
            {step.hint && <Typography sx={{ fontSize: 13, mb: 1 }}>{step.hint}</Typography>}
            {step.file && (
              <Chip size="small" label={`open ${stemOf(step.file)}  ↗`}
                onClick={() => { onClose(); onOpenNode(step.file!, step.label); }}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      bgcolor: "#4f46e514", color: "#4f46e5" }} />
            )}
          </>
        )}

        {b === "collate" && (
          <>
            <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1 }}>
              A <b>deterministic operation</b> — no policy involved. The strands above pool into
              one artifact; rows are merged live from the sources, so nothing is copied and
              nothing can drift.
            </Typography>
            {facts && facts.sources.length > 0 && (
              <>
                <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                                  textTransform: "uppercase", color: "text.disabled", mb: 0.5 }}>
                  {facts.sources.length} sources{facts.dedupeBy ? ` · deduped by ${facts.dedupeBy}` : ""}
                  {typeof facts.rows === "number" ? ` · ${facts.rows} rows pooled` : ""}
                </Typography>
                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  {facts.sources.map((s) => openChip(
                    resolveRef(resolveRef(base, stage.collate!), s.list),
                    s.label ?? s.list.slice(s.list.lastIndexOf("/") + 1)))}
                </Stack>
              </>
            )}
            {stage.calendar && (
              <>
                <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                                  textTransform: "uppercase", color: "text.disabled", mb: 0.5 }}>
                  task rows pooled from {stage.calendar.sources.length} lists onto one grid
                </Typography>
                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  {stage.calendar.sources.map((s) => openChip(s, s.slice(s.lastIndexOf("/") + 1)))}
                </Stack>
              </>
            )}
            {stage.collate && (
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                {isRefLike(stage.collate)
                  ? openChip(stage.collate, `open the pool — ${stage.collate.slice(stage.collate.lastIndexOf("/") + 1)}`)
                  : <>
                      {(data.rows ?? []).map((r) => (r.url ? openChip(r.url, r.label) : null))}
                      <Chip size="small" label={`browse the folder  ↗`}
                        onClick={() => browseFolder(resolveRef(base, stage.collate!))}
                        sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                              bgcolor: "#4f46e514", color: "#4f46e5", "&:hover": { bgcolor: "#4f46e526" } }} />
                    </>}
              </Stack>
            )}
          </>
        )}

        {b === "fanout" && stage.fanout?.run && (
          <>
            <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1 }}>
              The next cells were <b>chosen by a policy</b>: the run ranks every row of the pool,
              and the columns are the rows that landed on rank{" "}
              {(stage.fanout.ranks ?? []).join(", ") || "any"} — {data.columns?.length ?? "…"} of them,
              in rank order. Open the run to see every item and why it ranked where it did.
            </Typography>
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
              {openChip(stage.fanout.run, "open the ranking run")}
              {stage.fanout.journey && openChip(stage.fanout.journey, "open the mini journey — how this fan came to be")}
            </Stack>
          </>
        )}

        {b === "fanout" && !stage.fanout?.run && (
          <>
            <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1 }}>
              A <b>deterministic operation</b> — no policy involved.{" "}
              {stage.fanout?.by
                ? <>One column per distinct <b>{stage.fanout.by}</b> of the pool's rows:</>
                : "One column per row of the pool."}
            </Typography>
            {stage.fanout?.by && data.columns && (
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                {data.columns.map((c) => (
                  <Chip key={c.label} size="small" label={`${c.label} · ${c.sub ?? ""}`}
                    sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#0f172a0a" }} />
                ))}
              </Stack>
            )}
            {stage.fanout?.list && (
              <Stack direction="row" spacing={0.5}>
                {openChip(stage.fanout.list, "open the pool")}
              </Stack>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── the fanout grid and its kanban projection ─────────────────────────── */

const COLW = 172;

function FanGrid({ stage, columns, onOpen }: {
  stage: JStage; columns: FanColumn[]; onOpen: (ref: string, label?: string) => void;
}) {
  const labels = columns.map((c) => c.label);
  const rows = fanRows(stage, labels);
  const grid = { display: "grid", gridTemplateColumns: `repeat(${columns.length}, ${COLW}px)`, gap: "6px" } as const;
  const groups = columnGroups(columns.map((c) => c.group));
  const hasGroups = groups.some((g) => g.label) && groups.length > 0;
  return (
    <Box
      onWheel={(e) => {
        // A wide fan is a STRIP: plain wheel motion walks it sideways, so
        // every column is reachable without hunting for a scrollbar. A grid
        // narrower than its box leaves the wheel alone.
        const el = e.currentTarget;
        if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          el.scrollLeft += e.deltaY;
        }
      }}
      sx={{ overflowX: "auto", pb: 0.5, scrollbarWidth: "thin",
            "&::-webkit-scrollbar": { height: 8 },
            "&::-webkit-scrollbar-thumb": { bgcolor: "#0f172a33", borderRadius: 4 } }}>
      {/* WHERE the columns came from: one spanning header per bucket. The
          items keep their horizontal flow; the band says the provenance. */}
      {hasGroups && (
        <Box sx={{ ...grid, mb: 0.5 }}>
          {groups.map((g, i) => (
            <Box key={i} sx={{ gridColumn: `span ${g.span}`, minWidth: 0,
                               bgcolor: "#4f46e50d", border: "1px solid #4f46e533",
                               borderRadius: 1, px: 0.75, py: 0.3 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#4f46e5",
                                letterSpacing: "0.04em" }} noWrap
                title={`${g.label} — ${g.span} item${g.span === 1 ? "" : "s"} from this bucket`}>
                {g.label || "ungrouped"} · {g.span}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      <Box sx={{ ...grid, mb: 0.75 }}>
        {columns.map((c) => {
          const inst = stage.items[c.label]?.instance;
          return (
            <Box key={c.label}
              onClick={() => { if (inst) onOpen(inst, c.label); else if (c.open) onOpen(c.open, c.label); }}
              sx={{ minWidth: 0, cursor: inst || c.open ? "pointer" : "default",
                    "&:hover": inst || c.open ? { "& p": { color: "#4f46e5" } } : undefined }}>
              <Typography title={c.label}
                sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25, overflow: "hidden",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {c.label}
              </Typography>
              {c.sub && (
                <Typography sx={{ fontSize: 12, color: "text.disabled" }} noWrap>{c.sub}</Typography>
              )}
            </Box>
          );
        })}
      </Box>
      <Stack spacing={0.6}>
        {rows.map((r, i) => r.kind === "spine" ? (
          /* A SHARED step: the same step for every item — the streamlined
             part of the process. The band spans the grid, and each item's
             RESULT CARD sits IN ITS OWN COLUMN — the actual artifact the
             step produced, never a status word. No answer yet = the cell
             simply stays empty. */
          <Box key={i}
            sx={{ width: columns.length * COLW + (columns.length - 1) * 6,
                  border: "1px solid #4f46e544", borderRadius: 1, bgcolor: "#4f46e50a",
                  py: 0.45, boxSizing: "border-box" }}>
            <Box onClick={() => { if (r.step.file) onOpen(r.step.file, r.step.label); }}
              sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 0.75, mb: 0.4,
                    cursor: r.step.file ? "pointer" : "default",
                    "&:hover": r.step.file ? { "& p": { color: "#4f46e5" } } : undefined }}>
              <Tooltip title="A shared step — every item goes through this same step. Shared steps are the streamlined part of the process; steps that differ per item sit in the columns between the bands.">
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#4f46e5",
                                  letterSpacing: "0.05em", flexShrink: 0 }}>
                  SHARED STEP
                </Typography>
              </Tooltip>
              <Typography sx={{ fontSize: 13, fontWeight: 650 }} noWrap>
                {r.step.label}{r.step.file ? "  ↗" : ""}
              </Typography>
            </Box>
            <Box sx={{ ...grid, px: 0 }}>
              {labels.map((l) => {
                const result = stage.items[l]?.results[r.step.key];
                if (!result) {
                  // No answer for this item yet — the cell holds the space
                  // and says nothing.
                  return <Box key={l} sx={{ mx: 0.5, height: 26 }} />;
                }
                return (
                  <Tooltip key={l} title={result}>
                    <Box onClick={() => onOpen(result, `${l} — ${r.step.label}`)}
                      sx={{ mx: 0.5, px: 0.6, height: 26, borderRadius: 1, minWidth: 0,
                            display: "flex", alignItems: "center", gap: 0.4,
                            border: "1px solid", borderColor: "divider", bgcolor: "#fff",
                            boxShadow: "0 1px 2px #0f172a12", cursor: "pointer",
                            "&:hover": { borderColor: "#4f46e5" } }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, minWidth: 0, flex: 1,
                                        overflow: "hidden", textOverflow: "ellipsis",
                                        whiteSpace: "nowrap" }}>
                        {stemOf(result)}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }}>↗</Typography>
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Box>
        ) : (
          /* The zone: each column's OWN steps — the not-yet-streamlined part. */
          <Box key={i} sx={grid}>
            {labels.map((l) => (
              <Stack key={l} spacing={0.5} sx={{ minWidth: 0 }}>
                {(r.perItem[l] ?? []).map((t, j) => (
                  <StepChip key={j} label={t.label} st={t.status ?? "pending"}
                    onOpen={t.file ? () => onOpen(t.file!, t.label) : null} />
                ))}
              </Stack>
            ))}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function FanKanban({ stage, columns, onOpen }: {
  stage: JStage; columns: FanColumn[]; onOpen: (ref: string, label?: string) => void;
}) {
  const cols: { key: string | null; label: string }[] =
    [...stage.steps.map((s) => ({ key: s.key as string | null, label: s.label })), { key: null, label: "Done" }];
  return (
    <Box sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 0.5 }}>
      {cols.map((c) => {
        const cards = columns.filter((it) => kanbanColumn(stage, it.label) === c.key);
        return (
          <Box key={c.label} sx={{ width: 190, flexShrink: 0, bgcolor: "#0f172a06",
                                   borderRadius: 1.5, p: 0.75 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
                              textTransform: "uppercase", color: "text.secondary", mb: 0.5 }}>
              {c.label} · {cards.length}
            </Typography>
            <Stack spacing={0.5}>
              {cards.map((it) => {
                const inst = stage.items[it.label]?.instance;
                return (
                  <Box key={it.label}
                    onClick={() => { if (inst) onOpen(inst, it.label); else if (it.open) onOpen(it.open, it.label); }}
                    sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, px: 0.75, py: 0.5,
                          bgcolor: "#fff", cursor: "pointer", "&:hover": { borderColor: "#4f46e5" } }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{it.label}</Typography>
                    {(it.group ?? it.sub) && (
                      <Typography sx={{ fontSize: 12, color: "text.disabled" }} noWrap>{it.group ?? it.sub}</Typography>
                    )}
                  </Box>
                );
              })}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}

/* ── the calendar stage body ───────────────────────────────────────────── */

function CalendarBody({ stage, tasks, onOpen, base }: {
  stage: JStage; tasks: CalTask[]; onOpen: (ref: string, label?: string) => void; base: string;
}) {
  const groups = [...new Set(tasks.map((t) => t.group))];
  const colorOf = (g: string) => GROUP_COLORS[groups.indexOf(g) % GROUP_COLORS.length];
  const grid = monthGrid(tasks);
  return (
    <Box>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", mb: 0.75 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{grid.title}</Typography>
        {groups.map((g) => (
          <Stack key={g} direction="row" spacing={0.4} sx={{ alignItems: "center" }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: colorOf(g) }} />
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{g}</Typography>
          </Stack>
        ))}
        {stage.calendar!.sources.map((s) => (
          <Chip key={s} size="small" label={s.slice(s.lastIndexOf("/") + 1)}
            onClick={() => onOpen(resolveRef(base, s))}
            sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  bgcolor: "#4f46e514", color: "#4f46e5" }} />
        ))}
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(96px, 1fr))",
                 border: "1px solid", borderColor: "divider", borderRadius: 1.5, overflow: "hidden" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <Box key={d} sx={{ px: 0.75, py: 0.4, bgcolor: "#0f172a06", borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.disabled" }}>{d}</Typography>
          </Box>
        ))}
        {grid.weeks.flat().map((cell) => (
          <Box key={cell.iso}
            sx={{ minHeight: 62, px: 0.5, py: 0.4, borderBottom: "1px solid", borderRight: "1px solid",
                  borderColor: "#0f172a0f", bgcolor: cell.inMonth ? "#fff" : "#fafbfc" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700,
                              color: cell.inMonth ? "text.secondary" : "text.disabled" }}>
              {cell.day}
            </Typography>
            <Stack spacing={0.25}>
              {cell.tasks.map((t, i) => (
                <Tooltip key={i} title={`${t.label} (${t.group}) ${t.start} → ${t.end}`}>
                  <Box sx={{ bgcolor: colorOf(t.group), borderRadius: 0.5, px: 0.5, py: 0.1 }}>
                    <Typography sx={{ fontSize: 12, color: "#fff", fontWeight: 600 }} noWrap>{t.label}</Typography>
                  </Box>
                </Tooltip>
              ))}
            </Stack>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** One lane cell — used by the flat lane strip AND the grid. A cell with
 *  loaded CONTENT (structure rows, a document's text) is a wide column;
 *  a plain lane stays a compact card (`fixed` pins the card width so grid
 *  columns align across rows). */
function LaneCell({ l, data, onOpen, onRow, fixed, onRewrite }: {
  l: JLane; data: StageData; fixed?: boolean;
  onOpen: (ref: string, label?: string) => void;
  /** A flowing-list row was clicked — open its full content in a dialog. */
  onRow?: (row: LaneRow) => void;
  /** Pin/update a versioned ref by rewriting the journey's raw text. */
  onRewrite?: (from: string, to: string) => void;
}) {
                const rows = data.laneRows?.[l.label];
                const text = data.laneText?.[l.label];
                const bandOpen = data.laneOpen?.[l.label] ?? l.out;
                const isEmbed = data.laneEmbed?.[l.label] === true;
                const hue = isEmbed ? "#6d28d9" : "#4f46e5";
                const pin = l.out ? data.pins?.[l.out] : undefined;
                const pinBar = pin && l.out
                  ? <PinBar pin={pin} ref_={l.out} onRewrite={onRewrite} />
                  : null;
                if (text !== undefined) {
                  /* A TEXT column: the document itself, readable in place —
                     the band opens it for editing. */
                  return (
                    <Box key={l.label} sx={{ width: 262, flexShrink: 0, minHeight: 0,
                                             display: "flex", flexDirection: "column" }}>
                      <Box onClick={() => { if (bandOpen) onOpen(bandOpen, l.label); }}
                        sx={{ bgcolor: `${hue}0d`, border: `1px solid ${hue}33`,
                              borderRadius: 1, px: 0.75, py: 0.3, mb: 0.5, flexShrink: 0,
                              cursor: bandOpen ? "pointer" : "default",
                              "&:hover": bandOpen ? { borderColor: hue } : undefined }}
                        title={bandOpen ? `open ${stemOf(bandOpen)}` : l.label}>
                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: hue,
                                          letterSpacing: "0.04em" }} noWrap>
                          {l.label}{bandOpen ? "  ↗" : ""}
                        </Typography>
                      </Box>
                      {pinBar}
                      <Box sx={{ maxHeight: 380, overflowY: "auto", pr: 0.25,
                                 border: "1px solid", borderColor: "divider",
                                 borderRadius: 1, bgcolor: "#fff", px: 0.75, py: 0.5 }}>
                        <Typography component="pre"
                          sx={{ fontSize: 12, lineHeight: 1.5, m: 0, whiteSpace: "pre-wrap",
                                fontFamily: "inherit", wordBreak: "break-word" }}>
                          {text}
                        </Typography>
                      </Box>
                    </Box>
                  );
                }
                if (rows) {
                  /* A CONTENT column: a bucket-band header over naked rows —
                     no wrapper box inside the stage box. The BAND opens the
                     section's document; the rows scroll under it. */
                  return (
                    <Box key={l.label} sx={{ width: 262, flexShrink: 0, minHeight: 0,
                                             display: "flex", flexDirection: "column" }}>
                      <Box onClick={() => { if (bandOpen) onOpen(bandOpen, l.label); }}
                        sx={{ bgcolor: `${hue}0d`, border: `1px solid ${hue}33`,
                              borderRadius: 1, px: 0.75, py: 0.3, mb: 0.5, flexShrink: 0,
                              cursor: bandOpen ? "pointer" : "default",
                              "&:hover": bandOpen ? { borderColor: hue } : undefined }}
                        title={bandOpen ? `open ${stemOf(bandOpen)}` : l.label}>
                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: hue,
                                          letterSpacing: "0.04em" }} noWrap>
                          {isEmbed ? "⑂ " : ""}{l.label} · {rows.length}{bandOpen ? "  ↗" : ""}
                        </Typography>
                      </Box>
                      {pinBar}
                      <Stack spacing={0.4} sx={{ maxHeight: 380, overflowY: "auto", pr: 0.25 }}>
                        {rows.map((r, i) => (
                          <Box key={i}
                            /* A row carrying `url:` opens that ref directly — same
                               contract as pooled-list rows; others show their fields. */
                            onClick={r.fields?.url ? () => onOpen(r.fields!.url!, r.label)
                              : r.fields && onRow ? () => onRow(r) : undefined}
                            sx={{ border: "1px solid", borderColor: "divider",
                                             borderRadius: 1, px: 0.6, py: 0.45, bgcolor: "#fff",
                                             display: "flex", gap: 0.6,
                                             cursor: r.fields?.url || (r.fields && onRow) ? "pointer" : "default",
                                             "&:hover": r.fields?.url || (r.fields && onRow) ? { borderColor: "#4f46e5" } : undefined }}>
                            {r.num !== undefined && (
                              <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.disabled",
                                                width: 12, flexShrink: 0, textAlign: "right" }}>
                                {r.num}
                              </Typography>
                            )}
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              {r.label && (
                                <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>
                                  {r.label}
                                </Typography>
                              )}
                              {r.chips && r.chips.length > 0 ? (
                                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4, mt: r.label ? 0.3 : 0 }}>
                                  {r.chips.map((c, j) => (
                                    <Box key={j} sx={{ bgcolor: "#0f172a08", borderRadius: 0.75,
                                                       px: 0.55, py: 0.15 }}>
                                      <Typography sx={{ fontSize: 12, lineHeight: 1.4 }} component="span">
                                        <Box component="span" sx={{ color: "text.disabled", fontWeight: 600 }}>
                                          {c.dim}:{" "}
                                        </Box>
                                        <Box component="span" sx={{ fontWeight: 700 }}>{c.val}</Box>
                                      </Typography>
                                    </Box>
                                  ))}
                                </Box>
                              ) : r.chips ? (
                                <Typography sx={{ fontSize: 12, fontStyle: "italic", color: "text.disabled" }}>
                                  anything
                                </Typography>
                              ) : null}
                              {r.sub && (
                                <Typography sx={{ fontSize: 12, color: "text.disabled" }} noWrap>{r.sub}</Typography>
                              )}
                            </Box>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  );
                }
                return (
                  <Box key={l.label} sx={{ minWidth: 118, width: fixed ? 262 : undefined, boxSizing: "border-box",
                         flexShrink: 0, border: "1px solid",
                         borderColor: l.status === "next" ? "#b45309" : "divider",
                         borderRadius: 1.5, p: 0.75,
                         bgcolor: l.status === "next" ? "#b4530908" : "#fafbfc" }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.4 }} noWrap>
                      {l.status === "done" ? "✓ " : l.status === "next" ? "● " : ""}{l.label}
                    </Typography>
                    <Stack spacing={0.4}>
                      {l.process && (
                        <Chip size="small" label="process" onClick={() => onOpen(l.process!, `${l.label} — process`)}
                          sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                                bgcolor: "#4f46e514", color: "#4f46e5", width: "fit-content" }} />
                      )}
                      {l.out && (
                        <Chip size="small" label={l.out.slice(l.out.lastIndexOf("/") + 1)}
                          onClick={() => onOpen(l.out!, `${l.label} — output`)}
                          sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                                bgcolor: "#0f172a0a", color: "text.secondary", maxWidth: 200 }} />
                      )}
                      {pinBar}
                    </Stack>
                  </Box>
                );
}

/* ── the journey ───────────────────────────────────────────────────────── */

function StageBlock({ stage, data, base, onOpen, onOpStep, onRow, onRewrite }: {
  stage: JStage; data: StageData; base: string;
  onOpen: (ref: string, label?: string) => void;
  onOpStep: (step: JStep) => void;
  onRow?: (row: LaneRow) => void;
  onRewrite?: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [face, setFace] = useState<"columns" | "board">("columns");
  // A folder collate's pooled items, as a pick-list dialog off the ⇒ band.
  const [poolOpen, setPoolOpen] = useState(false);
  const labels = (data.columns ?? []).map((c) => c.label);
  const attn = attentionCount(stage, labels);
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "#fff",
               boxShadow: "0 1px 3px #0f172a0a" }}>
      <Box sx={{ px: 1.5, py: 0.9, display: "flex", alignItems: "center", gap: 1,
                 borderBottom: open ? "1px solid" : "none", borderColor: "divider" }}>
        <Typography onClick={() => setOpen((o) => !o)}
          sx={{ fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          {open ? "▾" : "▸"} {stage.label}
        </Typography>
        {stage.detail && (
          <Typography sx={{ fontSize: 12, color: "text.secondary", flex: 1, minWidth: 0 }} noWrap>
            {stage.detail}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {stage.sharedFrom && (
          <Tooltip title={`Shared from ${stage.sharedFrom.title} — lives there, referenced here`}>
            <Chip size="small" label={`⑂ ${stage.sharedFrom.title}`}
              onClick={() => onOpen(stage.sharedFrom!.journey, stage.sharedFrom!.title)}
              sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    bgcolor: "#6d28d914", color: "#6d28d9" }} />
          </Tooltip>
        )}
        {attn > 0 && (
          <Chip size="small" label={`${attn} need${attn === 1 ? "s" : ""} attention`}
            sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#b453091a", color: "#b45309" }} />
        )}
        {stage.fanout && open && (
          <Stack direction="row" spacing={0.5}>
            {(["columns", "board"] as const).map((v) => (
              <Chip key={v} size="small" label={v === "columns" ? "Columns" : "Board"}
                onClick={() => setFace(v)}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      bgcolor: face === v ? "#4f46e5" : "#0f172a0d",
                      color: face === v ? "#fff" : "text.secondary" }} />
            ))}
          </Stack>
        )}
        {stage.journey && (
          <Chip size="small" label="open journey"
            onClick={() => onOpen(stage.journey!, stage.label)}
            sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  bgcolor: "#4f46e514", color: "#4f46e5" }} />
        )}
      </Box>
      {open && (
        <Box sx={{ p: 1.25, maxHeight: 480, overflowY: "auto" }}>
          {data.err && <Typography sx={{ fontSize: 13, color: "error.main" }}>{data.err}</Typography>}

          {/* lanes: parallel strands, side by side. A lane with loaded
              CONTENT (a policy's structure) is a wide column showing every
              row of its section; a plain lane stays a compact card. */}
          {stage.lanes && (
            <Box sx={{ display: "flex", gap: 0.75, overflowX: "auto", pb: 0.5 }}>
              {stage.lanes.map((l) => (
                <LaneCell key={l.label} l={l} data={data} onOpen={onOpen} onRow={onRow} onRewrite={onRewrite} />
              ))}
            </Box>
          )}

          {/* the GRID: rows of lane cells, columns aligned by fixed width.
              Position is meaning — what sits BESIDE a thing gets matched
              against it, what sits BELOW derives from it. An empty cell
              just holds the space. */}
          {stage.grid && (
            <Box sx={{ overflowX: "auto", pb: 0.5 }}>
              <Stack spacing={0.75}>
                {stage.grid.map((row, ri) => (
                  <Box key={ri} sx={{ display: "flex", gap: 0.75, alignItems: "flex-start" }}>
                    {row.map((l, ci) => l.label
                      ? <LaneCell key={ci} l={l} data={data} onOpen={onOpen} onRow={onRow} onRewrite={onRewrite} fixed />
                      : <Box key={ci} sx={{ width: 262, flexShrink: 0 }} />)}
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          {/* the pooled stage's cells — one PER ROW, stacked plain. The
              operations (⇒ ⇉ →) live on the PARENT journey's boundaries
              between stages, never between cells inside a stage. */}
          {!stage.fanout && !stage.calendar && (stage.steps.length > 0 || stage.collate) && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mt: stage.lanes ? 1 : 0 }}>
              {stage.collate && (
                <OpCell glyph="⇒" title={stage.collate.slice(stage.collate.lastIndexOf("/") + 1)}
                  sub={isRefLike(stage.collate) ? "the collated pool" : "the collated pool — a folder of nodes"}
                  hint={isRefLike(stage.collate)
                    ? "Every source strand pooled into one artifact — click to open it"
                    : "Every source strand pooled into one FOLDER of nodes — click to pick one of its items"}
                  // A folder collate has no single document — clicking lists its
                  // pooled items, each opening as itself; Nodes stays one more
                  // click away inside that dialog.
                  onClick={isRefLike(stage.collate)
                    ? () => onOpen(stage.collate!, stage.label)
                    : () => setPoolOpen(true)} />
              )}
              {poolOpen && stage.collate && (
                <Dialog open onClose={() => setPoolOpen(false)} maxWidth="sm" fullWidth disablePortal>
                  <DialogContent sx={{ p: 2.5 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.25 }}>
                      {stage.collate.slice(stage.collate.lastIndexOf("/") + 1)}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.25 }}>
                      The pooled items — click one to open it.
                    </Typography>
                    <Stack spacing={0.5}>
                      {(data.rows ?? []).map((r, i) => (
                        <Box key={i}
                          onClick={() => { if (!r.url) return; setPoolOpen(false); onOpen(r.url, r.label); }}
                          sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5,
                                px: 1.25, py: 0.75, cursor: r.url ? "pointer" : "default",
                                "&:hover": r.url ? { borderColor: "#4f46e5" } : undefined }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{r.label}</Typography>
                          {r.sub && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>{r.sub}</Typography>}
                        </Box>
                      ))}
                      {!(data.rows ?? []).length && (
                        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Nothing pooled yet.</Typography>
                      )}
                    </Stack>
                    <Typography
                      onClick={() => browseFolder(resolveRef(base, stage.collate!))}
                      sx={{ mt: 1.5, fontSize: 12, color: "#4f46e5", cursor: "pointer",
                            "&:hover": { textDecoration: "underline" } }}>
                      browse the folder ↗
                    </Typography>
                  </DialogContent>
                </Dialog>
              )}
              {stage.steps.map((s) => (
                <Box key={s.key} sx={{ display: "flex", flexDirection: "column", gap: 0.3,
                                       width: "fit-content", maxWidth: 260 }}>
                  <OpCell title={s.label} sub={s.file ? stemOf(s.file) : "step"}
                    hint={s.hint} onClick={s.file ? () => onOpen(s.file!, s.label) : null} />
                  {s.file && data.pins?.[s.file] && (
                    <PinBar pin={data.pins[s.file]} ref_={s.file} onRewrite={onRewrite} />
                  )}
                </Box>
              ))}
            </Box>
          )}

          {/* content rows — a pooled list, a list step, a policy's structure
              — flowing like any other strip */}
          {!stage.fanout && !stage.calendar && data.rows && data.rows.length > 0 && (
            <ListFlow rows={data.rows} onOpen={onOpen}
              listRef={stage.collate ?? stage.steps.find((s) => s.file)?.file ?? ""} />
          )}

          {/* a policy run's items, categorized under their bucket bands */}
          {!stage.fanout && !stage.calendar && data.runItems && data.runItems.length > 0 && (
            <GroupedFlow items={data.runItems} onOpen={onOpen}
              fallbackRef={stage.steps.find((s) => s.file?.endsWith(".policy"))?.file ?? ""} />
          )}

          {/* fanout: the grid, or its kanban projection */}
          {stage.fanout && data.columns && (
            face === "columns"
              ? <FanGrid stage={stage} columns={data.columns} onOpen={onOpen} />
              : <FanKanban stage={stage} columns={data.columns} onOpen={onOpen} />
          )}
          {stage.fanout && !data.columns && !data.err && (
            <Typography sx={{ fontSize: 13, color: "text.disabled" }}>Fanning out…</Typography>
          )}

          {/* the calendar collate */}
          {stage.calendar && data.tasks && (
            <CalendarBody stage={stage} tasks={data.tasks} onOpen={onOpen} base={base} />
          )}
          {stage.calendar && !data.tasks && !data.err && (
            <Typography sx={{ fontSize: 13, color: "text.disabled" }}>Collecting tasks…</Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * The effective stage list of a journey: each `- embed:` placeholder
 * replaced in place by the embedded journey's stages, BY REFERENCE.
 * Embedded journeys may embed further — followed up to a small depth so
 * a cycle can't spin. An unreadable embed stays a placeholder stage.
 */
async function resolveEmbeds(
  doc: JourneyStagesDoc, basePath: string, depth = 0,
): Promise<JStage[]> {
  const out: JStage[] = [];
  for (const s of doc.stages) {
    if (!s.embed || depth >= 3) { out.push(s); continue; }
    try {
      const abs = resolveRef(basePath, s.embed);
      const src = parseJourneyStages((await readVirtualDirectoryFile(abs, abs)).content);
      if (!src) { out.push(s); continue; }
      const inner = await resolveEmbeds(src, abs, depth + 1);
      out.push(...embedStages({ ...src, stages: inner }, abs, s.at));
    } catch {
      out.push(s);
    }
  }
  return out;
}

export default function JourneyStagesView({ doc, basePath, raw, onChange }: {
  doc: JourneyStagesDoc; basePath: string;
  /** The journey file's RAW text — what a pin/update rewrites. Without it
   *  (and `onChange`) the version chips still show, read-only. */
  raw?: string;
  onChange?: (next: string) => void;
}) {
  const hasEmbed = doc.stages.some((s) => s.embed);
  const [stages, setStages] = useState<JStage[] | null>(hasEmbed ? null : doc.stages);
  const [data, setData] = useState<Record<string, StageData>>({});
  const [openRef, setOpenRef] = useState<{ node: string; label?: string } | null>(null);
  const [op, setOp] = useState<OpTarget | null>(null);
  /** A content-column row, opened full-size: label + every field. */
  const [rowDlg, setRowDlg] = useState<LaneRow | null>(null);

  /** Refs inside a SHARED stage resolve against the trunk that owns it —
   *  sharedFrom.journey is stored absolute at splice time. */
  const baseOf = (stage: JStage) => stage.sharedFrom?.journey ?? basePath;

  /** An operation click. A policy op WITH a mini journey opens the mini
   *  journey directly — the exploration is the explanation, no
   *  intermediate dialog. Everything else gets the operation dialog. */
  const openOp = (target: OpTarget) => {
    if (target.step?.journey && target.step.file?.endsWith(".policy")) {
      setOpenRef({
        node: resolveRef(baseOf(target.stage), target.step.journey),
        label: `${target.step.label} — how it came to be`,
      });
      return;
    }
    setOp(target);
  };

  useEffect(() => {
    let live = true;
    setData({});
    setStages(hasEmbed ? null : doc.stages);
    (async () => {
      const resolved = await resolveEmbeds(doc, basePath);
      if (!live) return;
      setStages(resolved);
      for (const stage of resolved) {
        const stageBase = stage.sharedFrom?.journey ?? basePath;
        const d = await loadStage(stage, stageBase);
        if (!live) return;
        setData((s) => ({ ...s, [stage.key]: d }));
        const pins = await loadPins(stage, stageBase);
        if (!live) return;
        if (Object.keys(pins).length) setData((s) => ({ ...s, [stage.key]: { ...s[stage.key], pins } }));
      }
    })();
    return () => { live = false; };
  }, [doc, basePath]);

  const openFrom = (stage: JStage | null) => (ref: string, label?: string) => {
    // A column's `open` may be the ad's real URL — the web is not a node.
    if (/^https?:\/\//i.test(ref)) { window.open(ref, "_blank", "noopener,noreferrer"); return; }
    setOpenRef({ node: resolveRef(stage ? baseOf(stage) : basePath, ref), label });
  };
  const onOpen = openFrom(null);

  const shown = stages ?? [];
  return (
    <Box sx={{ height: "100%", minHeight: 0, overflow: "auto", bgcolor: "#fafbfc", p: 2 }}>
      {doc.description && (
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.25, maxWidth: 900 }}>
          {doc.description}
        </Typography>
      )}
      {!stages && (
        <Typography sx={{ fontSize: 13, color: "text.disabled" }}>Resolving embedded journeys…</Typography>
      )}
      {shown.map((stage, i) => (
        <Box key={stage.key}>
          {stage.sharedFrom &&
            shown[i - 1]?.sharedFrom?.journey !== stage.sharedFrom.journey && (
            /* An embedded run begins: whose stages these are. One click
               stands in the embedded journey itself — nothing is a copy. */
            <Box onClick={() => onOpen(stage.sharedFrom!.journey, stage.sharedFrom!.title)}
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.6, mt: i > 0 ? 1 : 0, mb: 0.5,
                    px: 1, py: 0.35, borderRadius: 1, cursor: "pointer",
                    bgcolor: "#6d28d90d", border: "1px solid #6d28d933",
                    "&:hover": { borderColor: "#6d28d9" } }}>
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#6d28d9" }}>
                ⑂ {stage.sharedFrom.title}
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                embedded — by reference, edited there  ↗
              </Typography>
            </Box>
          )}
          {i > 0 && !stage.sharedFrom && shown[i - 1].sharedFrom && (
            /* The embedded run ends: everything below is this journey's own. */
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 1, mb: -0.25 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#6d28d9" }}>⑂</Typography>
              <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
                this journey's own steps continue
              </Typography>
              <Box sx={{ flex: 1, borderBottom: "1px dashed #6d28d94d" }} />
            </Box>
          )}
          {i > 0 && <Boundary stage={stage} onOp={openOp} />}
          <StageBlock stage={stage} data={data[stage.key] ?? {}} base={baseOf(stage)}
            onOpen={openFrom(stage)} onOpStep={(step) => openOp({ stage, step })}
            onRow={setRowDlg}
            /* Pin/update rewrite THIS file's text — a shared stage's refs
               live in their owner journey, so its bars stay read-only. */
            onRewrite={raw !== undefined && onChange && !stage.sharedFrom
              ? (from, to) => { const next = rewriteRef(raw, from, to); if (next !== raw) onChange(next); }
              : undefined} />
        </Box>
      ))}
      <OperationDialog target={op} data={op ? data[op.stage.key] ?? {} : {}}
        base={op ? baseOf(op.stage) : basePath} onClose={() => setOp(null)} onOpenNode={onOpen} />
      <NodeRefDialog base={basePath} nodeRef={openRef} onClose={() => setOpenRef(null)} />
      {rowDlg && (
        <Dialog open onClose={() => setRowDlg(null)} maxWidth="sm" fullWidth disablePortal>
          <DialogContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", mb: 1.25 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 650, flex: 1, minWidth: 0 }}>
                {rowDlg.label}
              </Typography>
              <IconButton size="small" onClick={() => setRowDlg(null)}><CloseIcon fontSize="small" /></IconButton>
            </Stack>
            <RowFieldsBlock it={{ label: rowDlg.label ?? "", fields: rowDlg.fields ?? {} }} />
          </DialogContent>
        </Dialog>
      )}
    </Box>
  );
}
