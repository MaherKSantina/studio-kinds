/**
 * The `.definition` viewer — the process, two ways:
 *
 *   Graph   — the laned DAG (the project-lens canvas): shared nodes, edges
 *             showing exactly how information propagates.
 *   Streams — the process UNROLLED: one row per slot, its inputs stacked
 *             vertically on the left and the slot to the right. Shared
 *             dependencies are DUPLICATED per row, so a repeated pattern
 *             (four matches with the same shape) reads as the abstraction
 *             it is.
 *
 * Both render the definition abstract or the instance with live fill state.
 * The header states the rules every slot's authoring must honor.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, Chip, Dialog, DialogContent, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { resolveRef } from "crosscut";
import { readVirtualDirectoryFile } from "../../api";
import {
  DefinitionDoc, DefSlot, InstanceDoc, firstGap, labelOf, laneByKey, parseDefinitionFile, resolveVariant, variantLabel,
} from "../../lib/definitionDoc";
import { extensionOfPath } from "../../lib/filePreviews";
import type { ViewerProps } from "../../lib/filePreviews";
import type { LanedGraph } from "../../lib/projectGraph";
import { DagCanvas } from "../project/ProjectDagView";
import { NodeRefDialog } from "../points/PointsView";
import BoardView from "./BoardView";
import JourneyView from "./JourneyView";
import JourneyStagesView, { parseJourneyStages } from "./JourneyStagesView";
import JourneyVariantsView from "./JourneyVariantsView";
import { parseJourneyVariants } from "../../lib/journeyStages";
import JourneyKanban from "./JourneyKanban";

interface NodeInfo {
  key: string;
  label: string;
  chip: string;
  /** Resolved path of the content behind this node, or null when empty. */
  open: string | null;
  /** Nothing authored here yet — the PENDING look (dashed, muted). */
  empty?: boolean;
  /** An optional slot: pending here never blocks, so it whispers. */
  optional?: boolean;
  /** THE step this instance is waiting on — the slot whose name is the
   *  card's kanban column. Solid amber, so both views visibly agree. */
  next?: boolean;
}

/** Every input/param/slot as a renderable node with live fill state. */
function nodeInfos(def: DefinitionDoc, defPath: string, inst: InstanceDoc | null, instPath: string): Map<string, NodeInfo> {
  const out = new Map<string, NodeInfo>();
  // The one step the instance is waiting on — named by its kanban column.
  const nextKey = inst ? firstGap(def, inst)?.key ?? null : null;
  for (const i of def.inputs) {
    const abs = resolveRef(defPath, i.node);
    out.set(i.key, { key: i.key, label: labelOf(i), chip: extensionOfPath(abs) || "node", open: abs });
  }
  for (const p of def.params) {
    const fill = inst?.fills[p.key];
    const abs = fill ? resolveRef(instPath, fill) : null;
    out.set(p.key, {
      key: p.key, label: labelOf(p),
      chip: abs ? extensionOfPath(abs) || "doc" : `param · ${p.optional ? "optional" : "pending"}`,
      open: abs,
      ...(abs ? {} : { empty: true }),
      ...(p.optional ? { optional: true } : {}),
    });
  }
  for (const s of def.slots) {
    const fill = inst?.fills[s.key];
    const abs = fill ? resolveRef(instPath, fill) : null;
    const isNext = !abs && s.key === nextKey;
    out.set(s.key, {
      key: s.key, label: labelOf(s),
      chip: abs
        ? extensionOfPath(abs) || "doc"
        : `${s.kind ?? "slot"} · ${isNext ? "next" : s.optional ? "optional" : "pending"}`,
      open: abs,
      ...(abs ? {} : { empty: true }),
      ...(s.optional ? { optional: true } : {}),
      ...(isNext ? { next: true } : {}),
    });
  }
  return out;
}

/** The definition (+ fills) as the lens renderer's graph — shared nodes. */
function buildGraph(def: DefinitionDoc, infos: Map<string, NodeInfo>): LanedGraph {
  const lanes = laneByKey(def);
  const graph: LanedGraph = { nodes: [], edges: [], lanes: {} };
  const idOf = (key: string) => infos.get(key)!.open ?? `def#${key}`;
  for (const info of infos.values()) {
    const id = idOf(info.key);
    // An empty slot has no content to open — clicking it explains it instead.
    graph.nodes.push({
      id, label: info.label, chip: info.chip, open: { node: info.open ?? "" },
      ...(info.next ? { accent: "next" as const } : {}),
    });
    graph.lanes[id] = lanes.get(info.key) ?? 0;
  }
  for (const s of def.slots) {
    for (const dep of s.from) {
      // Bare arrows: the definition's edges carry no label text.
      if (infos.has(dep)) graph.edges.push({ from: idOf(dep), to: idOf(s.key), kind: "" });
    }
  }
  return graph;
}

/* ── Streams mode ───────────────────────────────────────────────────────── */

const SW = 210, SH = 36, SGAP = 8, CONN = 64;

function NodeBox({ n, strong, onClick }: { n: NodeInfo; strong?: boolean; onClick: () => void }) {
  // NEXT is the step being waited on — solid amber, and its label is the
  // card's kanban column. Other required gaps are amber but dashed; optional
  // ones whisper in gray.
  const pending = n.empty && !n.optional;
  return (
    <Tooltip title={n.open ?? (n.next ? "next — the step this instance is waiting on"
      : n.optional ? "optional — not filled" : "pending — not filled yet")}>
      <Box onClick={onClick}
        sx={{ width: SW, height: SH, display: "flex", alignItems: "center", gap: 0.4, px: 1,
              border: n.next ? "1.5px solid" : "1px solid",
              borderStyle: n.empty && !n.next ? "dashed" : "solid",
              borderColor: pending ? "#b45309" : strong && !n.empty ? "#4f46e555" : "divider",
              borderRadius: 1.5,
              bgcolor: n.next ? "#b453090f" : n.empty ? "#fafbfc" : strong ? "#4f46e508" : "#fff",
              boxShadow: n.empty && !n.next ? "none" : "0 1px 3px #0f172a14",
              cursor: "pointer", "&:hover": { borderColor: pending ? "#b45309" : "#4f46e5" } }}>
        <Typography sx={{ fontSize: 13, fontWeight: strong && !n.empty ? 700 : 500, flex: 1, minWidth: 0,
                          color: n.empty ? "text.secondary" : "text.primary" }} noWrap>
          {n.label}
        </Typography>
        <Chip size="small" label={n.chip}
          sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                bgcolor: pending ? "#b4530914" : strong && !n.empty ? "#4f46e514" : "#0f172a0d",
                color: pending ? "#b45309" : strong && !n.empty ? "#4f46e5" : "text.secondary" }} />
      </Box>
    </Tooltip>
  );
}

/** HORIZONTAL flow on a strict LEVEL GRID: every node sits in the column of
 *  its own level (level 1 = depends on nothing; a consumer of a level-N node
 *  is at level N+1 or later). One ROW per slot: the slot's dependencies
 *  appear in their own level columns, the slot in its column, edges flowing
 *  left → right. A node consumed by several rows repeats VERTICALLY in its
 *  one column — never horizontally. Every dep is an input to the SAME slot,
 *  so no two of them share a line — deps CASCADE: columns left → right, each
 *  continuing below the previous column's last dep. */
function StreamsView({ def, infos, onNode }: {
  def: DefinitionDoc;
  infos: Map<string, NodeInfo>;
  onNode: (n: NodeInfo) => void;
}) {
  const lanes = laneByKey(def);
  const level = (k: string) => (lanes.get(k) ?? 0) + 1;
  const maxLevel = Math.max(1, ...def.slots.map((s) => level(s.key)));
  const COLW = SW + CONN;
  const ROWGAP = 26;

  const rows = def.slots.map((s) => {
    const grouped = new Map<number, NodeInfo[]>();
    for (const k of s.from) {
      const d = infos.get(k);
      if (d) grouped.set(level(k), [...(grouped.get(level(k)) ?? []), d]);
    }
    const depsByCol = new Map<number, { d: NodeInfo; line: number }[]>();
    let line = 0;
    for (const col of [...grouped.keys()].sort((a, b) => a - b)) {
      depsByCol.set(col, grouped.get(col)!.map((d) => ({ d, line: line++ })));
    }
    const stack = Math.max(1, line);
    const h = stack * SH + (stack - 1) * SGAP;
    return { slot: s, out: infos.get(s.key)!, depsByCol, slotCol: level(s.key), h };
  });

  const width = maxLevel * COLW;

  // Params and inputs NO SLOT reads never appear in a slot row — they still
  // exist (a lead's source, say) and still open their content, so they get
  // their own context row at the top of their level column.
  const consumedKeys = new Set(def.slots.flatMap((s) => s.from));
  const loose = [...def.inputs, ...def.params]
    .filter((x) => !consumedKeys.has(x.key))
    .map((x) => infos.get(x.key))
    .filter(Boolean) as NodeInfo[];

  return (
    <Box sx={{ p: 3, minWidth: width + 48 }}>
      <Box sx={{ position: "relative", width, height: 16, mb: 1 }}>
        {Array.from({ length: maxLevel }, (_, i) => (
          <Typography key={i} sx={{ position: "absolute", left: i * COLW, fontSize: 12, fontWeight: 700,
                                    letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled" }}>
            Level {i + 1}
          </Typography>
        ))}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: `${ROWGAP}px` }}>
        {loose.length > 0 && (
          <Box sx={{ position: "relative", width, height: loose.length * SH + (loose.length - 1) * SGAP }}>
            {loose.map((d, i) => (
              <Box key={d.key} sx={{ position: "absolute", left: 0, top: i * (SH + SGAP) }}>
                <NodeBox n={d} onClick={() => onNode(d)} />
              </Box>
            ))}
          </Box>
        )}
        {rows.map((r) => (
          <Box key={r.slot.key} sx={{ position: "relative", width, height: r.h }}>
            <svg width={width} height={r.h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              <defs>
                <marker id="stream-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="#4f46e5" />
                </marker>
              </defs>
              {[...r.depsByCol.entries()].flatMap(([col, deps]) =>
                deps.map(({ d, line }) => {
                  const x1 = (col - 1) * COLW + SW;
                  const y1 = line * (SH + SGAP) + SH / 2;
                  const x2 = (r.slotCol - 1) * COLW - 2;
                  const y2 = r.h / 2;
                  const dx = Math.max(28, (x2 - x1) / 2);
                  return (
                    <path key={`${col}:${d.key}:${line}`}
                      d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                      fill="none" stroke="#4f46e5" strokeWidth={1.4} opacity={0.75}
                      markerEnd="url(#stream-arrow)" />
                  );
                }))}
            </svg>
            {[...r.depsByCol.entries()].flatMap(([col, deps]) =>
              deps.map(({ d, line }) => (
                <Box key={`${col}:${d.key}:${line}`}
                  sx={{ position: "absolute", left: (col - 1) * COLW, top: line * (SH + SGAP) }}>
                  <NodeBox n={d} onClick={() => onNode(d)} />
                </Box>
              )))}
            <Box sx={{ position: "absolute", left: (r.slotCol - 1) * COLW, top: (r.h - SH) / 2 }}>
              <NodeBox n={r.out} strong onClick={() => onNode(r.out)} />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/* ── The viewer ─────────────────────────────────────────────────────────── */

export default function DefinitionView({ content, height = "100%", path, agentId, onChange, chromeless }: ViewerProps) {
  const base = path ?? agentId ?? "";
  const parsed = useMemo(() => parseDefinitionFile(content), [content]);

  // An instance names its definition — load it; a definition is itself.
  const [def, setDef] = useState<DefinitionDoc | null>(parsed.role === "definition" ? parsed : null);
  const [defPath, setDefPath] = useState<string>(parsed.role === "definition" ? base : "");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (parsed.role === "journey") { setDef(null); setErr(null); return; }
    if (parsed.role === "definition") { setDef(parsed); setDefPath(base); setErr(null); return; }
    // Boards and instances both name their definition — load it, so a board
    // can toggle from the kanban to the process DAG.
    const abs = resolveRef(base, parsed.definition);
    let live = true;
    setDef(null); setErr(null);
    readVirtualDirectoryFile(abs, abs).then(
      (r) => {
        if (!live) return;
        const d = parseDefinitionFile(r.content);
        if (d.role !== "definition") { setErr(`${parsed.definition} is not a definition`); return; }
        setDef(d); setDefPath(abs);
      },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [parsed, base]);

  const inst = parsed.role === "instance" ? parsed : null;

  /* Polymorphism: an instance renders ITS shape; a bare definition renders
   * the union, or a variant the viewer picked to preview. */
  const [previewVariant, setPreviewVariant] = useState<string | null>(null);
  const shaped = useMemo(
    () => (def ? resolveVariant(def, inst ? inst.variant : previewVariant) : null),
    [def, inst, previewVariant],
  );

  const infos = useMemo(
    () => (shaped ? nodeInfos(shaped, defPath, inst, base) : null),
    [shaped, defPath, inst, base],
  );
  const graph = useMemo(() => (shaped && infos ? buildGraph(shaped, infos) : null), [shaped, infos]);

  const filled = inst && shaped ? shaped.slots.filter((s) => inst.fills[s.key]).length : 0;
  const isBoard = parsed.role === "board";
  const [view, setView] = useState<"kanban" | "graph" | "streams">(isBoard ? "kanban" : "streams");
  /* The journey's own pair: the flow rendering, or every stage's board
   * merged into one kanban. */
  const [jview, setJview] = useState<"journey" | "kanban">("journey");
  /** Bumped by the staged journey's Reload — remounts the view, so every
   *  policy, list, and run is re-read and re-derived. */
  const [journeyNonce, setJourneyNonce] = useState(0);

  /* An EMPTY node's click explains what belongs there: the param or slot
   * behind the key, with its hint and what it reads. */
  const [info, setInfo] = useState<{
    label: string; role: "param" | "slot"; kind?: string; hint?: string; reads: string[];
  } | null>(null);
  const explainKey = (key: string) => {
    if (!shaped) return;
    const nameOf = (k: string) =>
      [...shaped.inputs, ...shaped.params, ...shaped.slots].find((x) => x.key === k)?.label ?? k;
    const p = shaped.params.find((x) => x.key === key);
    if (p) { setInfo({ label: labelOf(p), role: "param", hint: p.hint, reads: [] }); return; }
    const s = shaped.slots.find((x) => x.key === key);
    if (s) setInfo({ label: labelOf(s), role: "slot", kind: s.kind, hint: s.hint, reads: s.from.map(nameOf) });
  };
  const explainNode = (n: { id: string }) => { if (n.id.startsWith("def#")) explainKey(n.id.slice(4)); };

  /* Streams mode opens content itself (graph mode's canvas has its own). */
  const [openRef, setOpenRef] = useState<{ node: string; label?: string } | null>(null);
  const streamNode = (n: NodeInfo) => {
    if (n.open) setOpenRef({ node: n.open, label: n.label });
    else explainKey(n.key);
  };

  /* CONNECTED PIPELINES: any fill pointing at a `.definition` file links
   * this instance to another pipeline — a param fill is UPSTREAM (the
   * source that produced this), a slot fill is NESTED (the application it
   * carries). Each gets a header chip opening that pipeline in a dialog
   * over the DAG. */
  const [related, setRelated] = useState<{ key: string; label: string; title: string; path: string; upstream: boolean }[]>([]);
  useEffect(() => {
    if (!def || !inst) { setRelated([]); return; }
    let live = true;
    (async () => {
      const out: { key: string; label: string; title: string; path: string; upstream: boolean }[] = [];
      for (const [k, fill] of Object.entries(inst.fills)) {
        const abs = resolveRef(base, fill);
        if (!abs.endsWith(".definition")) continue;
        const upstream = def.params.some((p) => p.key === k);
        const slotLabel = [...def.params, ...def.slots].find((x) => x.key === k)?.label ?? k;
        let title = abs.slice(abs.lastIndexOf("/") + 1).replace(/\.definition$/, "");
        try {
          const linked = parseDefinitionFile((await readVirtualDirectoryFile(abs, abs)).content);
          if (linked.role === "definition") title = linked.title;
          else if (linked.title) title = linked.title;
        } catch { /* the filename stays the label */ }
        out.push({ key: k, label: slotLabel, title, path: abs, upstream });
      }
      if (live) setRelated(out);
    })();
    return () => { live = false; };
  }, [def, inst, base]);

  /* An A/B file (`variants:`) renders pills over whole journeys — flip
   * to compare versions. Probed on raw text like the staged journey. */
  /* A journey's frame: the title bar with the live Reload chip — or, in a
   * CHROMELESS host (the Studio shows content only), no bar at all and the
   * chip floating in the corner. Everything derives live from files: after
   * editing a policy in a mini journey, one reload re-runs the whole chain. */
  const reloadChip = (floating: boolean) => (
    <Chip size="small" label="Reload" onClick={() => setJourneyNonce((n) => n + 1)}
      sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0,
            bgcolor: "#4f46e514", color: "#4f46e5", "&:hover": { bgcolor: "#4f46e526" },
            ...(floating ? { position: "absolute", top: 8, right: 14, zIndex: 2 } : {}) }} />
  );
  const journeyFrame = (title: string, subtitle: string, body: ReactNode) => (chromeless
    ? <Box sx={{ height, minHeight: 0, position: "relative" }}>{reloadChip(true)}{body}</Box>
    : (
      <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider",
                   display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 650, flex: 1, minWidth: 0 }}>
            {title}
            <Typography component="span" sx={{ fontSize: 13, color: "text.secondary", ml: 1 }}>{subtitle}</Typography>
          </Typography>
          {reloadChip(false)}
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>{body}</Box>
      </Box>
    ));

  const variants = parseJourneyVariants(content);
  if (variants) {
    return journeyFrame(variants.title, `A/B · ${variants.variants.length} journeys — pills flip whole versions`,
      <JourneyVariantsView key={journeyNonce} doc={variants} basePath={base} />);
  }

  /* A STAGED journey (`stages:`) renders vertical stages of horizontal
   * lanes with collate/fanout boundaries — the one-place view. The probe is
   * on the raw text: a staged file needs no legacy `journey:` list. */
  const staged = parseJourneyStages(content);
  if (staged) {
    // raw + onChange let the journey PIN versioned refs (text surgery through
    // the host's own edit path, so autosave stays coherent).
    return journeyFrame(staged.title, `journey · ${staged.stages.length} stages — shared steps span every item; click a boundary for what happened`,
      <JourneyStagesView key={journeyNonce} doc={staged} basePath={base} raw={content} onChange={onChange} />);
  }

  /* A legacy JOURNEY (bare board list) renders the pipelines as one flow —
   * stages horizontal, fan-outs vertical. All hooks above still ran. */
  if (parsed.role === "journey") {
    const jtoggle = (v: "journey" | "kanban", label: string) => (
      <Chip size="small" label={label} onClick={() => setJview(v)}
        sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
              bgcolor: jview === v ? "#4f46e5" : "#0f172a0d",
              color: jview === v ? "#fff" : "text.secondary",
              "&:hover": { bgcolor: jview === v ? "#4f46e5" : "#0f172a1a" } }} />
    );
    return (
      <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider",
                   display: "flex", alignItems: "flex-start", gap: 1 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 650, flex: 1, minWidth: 0 }}>
            {parsed.title ?? "Journey"}
            <Typography component="span" sx={{ fontSize: 13, color: "text.secondary", ml: 1 }}>
              journey · {parsed.journey.length} stage{parsed.journey.length === 1 ? "" : "s"} — click any box for its value
            </Typography>
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ pt: 0.25, flexShrink: 0 }}>
            {jtoggle("journey", "Journey")}
            {jtoggle("kanban", "Kanban")}
          </Stack>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {jview === "kanban"
            ? <JourneyKanban doc={parsed} basePath={base} />
            : <JourneyView doc={parsed} basePath={base} />}
        </Box>
      </Box>
    );
  }

  const toggle = (v: "kanban" | "graph" | "streams", label: string) => (
    <Chip size="small" label={label} onClick={() => setView(v)}
      sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
            bgcolor: view === v ? "#4f46e5" : "#0f172a0d",
            color: view === v ? "#fff" : "text.secondary",
            "&:hover": { bgcolor: view === v ? "#4f46e5" : "#0f172a1a" } }} />
  );

  return (
    <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider",
                 display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 650 }}>
            {isBoard && parsed.role === "board" ? parsed.title ?? "Pipeline" : def?.title ?? "Definition"}
            {isBoard && parsed.role === "board" && (
              <Typography component="span" sx={{ fontSize: 13, color: "text.secondary", ml: 1 }}>
                board · {parsed.instances.length} instance{parsed.instances.length === 1 ? "" : "s"} of {parsed.definition.slice(parsed.definition.lastIndexOf("/") + 1)}
              </Typography>
            )}
            {inst && shaped && (
              <Typography component="span" sx={{ fontSize: 13, color: "text.secondary", ml: 1 }}>
                instance{inst.variant && def ? ` · ${variantLabel(def, inst.variant)}` : ""} · {filled}/{shaped.slots.length} slots filled
              </Typography>
            )}
          </Typography>
          {!!def?.rules.length && (
            <Typography sx={{ fontSize: 13, color: "#4f46e5", mt: 0.25 }}>
              Rules: {def.rules.join(" · ")}
            </Typography>
          )}
          {/* A board shows its own variant chips (with card counts) inside
              the kanban; a bare definition gets them here. */}
          {!inst && !isBoard && def && def.variants.length > 0 && (
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ mt: 0.5, flexWrap: "wrap" }}>
              <Chip size="small" label="All shapes" onClick={() => setPreviewVariant(null)}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      bgcolor: previewVariant === null ? "#4f46e5" : "#0f172a0d",
                      color: previewVariant === null ? "#fff" : "text.secondary" }} />
              {def.variants.map((v) => (
                <Chip key={v.key} size="small" label={v.label ?? v.key} onClick={() => setPreviewVariant(v.key)}
                  sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        bgcolor: previewVariant === v.key ? "#4f46e5" : "#0f172a0d",
                        color: previewVariant === v.key ? "#fff" : "text.secondary" }} />
              ))}
            </Stack>
          )}
          {related.length > 0 && (
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ mt: 0.5, flexWrap: "wrap" }}>
              {related.map((r) => (
                <Chip key={r.key} size="small"
                  label={`${r.upstream ? "⇠" : "⇢"} ${r.label}: ${r.title}`}
                  onClick={() => setOpenRef({ node: r.path, label: r.title })}
                  sx={{ height: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        bgcolor: "#4f46e514", color: "#4f46e5",
                        "&:hover": { bgcolor: "#4f46e526" } }} />
              ))}
            </Stack>
          )}
        </Box>
        <Stack direction="row" spacing={0.5} sx={{ pt: 0.25, flexShrink: 0 }}>
          {isBoard && toggle("kanban", "Kanban")}
          {toggle("streams", "Streams")}
          {toggle("graph", "Graph")}
        </Stack>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", bgcolor: view === "streams" ? "#fafbfc" : undefined }}>
        {isBoard && parsed.role === "board" && view === "kanban"
          ? <BoardView board={parsed} boardPath={base}
              variant={previewVariant} onVariantChange={setPreviewVariant} />
          : err ? <Typography sx={{ p: 3, fontSize: 12, color: "error.main" }}>{err}</Typography>
          : !def || !infos || !graph ? <Typography sx={{ p: 3, fontSize: 12, color: "text.disabled" }}>Reading the definition…</Typography>
            : !graph.nodes.length ? (
              <Typography sx={{ p: 3, fontSize: 12, color: "text.disabled", fontStyle: "italic" }}>
                The definition declares no inputs, params or slots yet.
              </Typography>
            ) : view === "graph"
              ? <DagCanvas graph={graph} base={defPath || base} onEmptyNode={explainNode} />
              : shaped && <StreamsView def={shaped} infos={infos} onNode={streamNode} />}
      </Box>

      <NodeRefDialog base={defPath || base} nodeRef={openRef} onClose={() => setOpenRef(null)} />

      {/* disablePortal keeps this INSIDE the host's subtree — a Radix modal
          (the studio preview) disables pointer events on the portal root, so
          a body-portaled dialog could never be closed there. */}
      <Dialog open={!!info} onClose={() => setInfo(null)} maxWidth="xs" fullWidth disablePortal>
        {info && (
          <DialogContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 650, flex: 1, minWidth: 0 }}>{info.label}</Typography>
              <Chip size="small"
                label={info.role === "param" ? "per-instance input" : `authored slot${info.kind ? ` · ${info.kind}` : ""}`}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#4f46e514", color: "#4f46e5" }} />
              <IconButton size="small" aria-label="Close" onClick={() => setInfo(null)} sx={{ ml: 0.25 }}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Stack>
            {info.hint && (
              <Typography sx={{ fontSize: 13, color: "text.primary", mb: 1 }}>{info.hint}</Typography>
            )}
            {info.reads.length > 0 && (
              <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 0.5 }}>
                Reads: {info.reads.join(", ")}
              </Typography>
            )}
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              {info.role === "param"
                ? "Provided when a project adopts this definition — not filled here yet."
                : "Authored into this slot when the instance is filled — empty so far."}
            </Typography>
          </DialogContent>
        )}
      </Dialog>
    </Box>
  );
}
