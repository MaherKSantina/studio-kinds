/**
 * THE PROJECT DAG — the laned rendering of `assembleLanedGraph`: invisible
 * production lanes left→right, hierarchy as INDENTATION (every exported
 * child its own targetable box under its parent), production as ARROWS
 * anchored at the finest real source. Clicking ANY node opens its content
 * in a dialog OVER the DAG — the DAG is a place you stay.
 */
import { useEffect, useMemo, useState } from "react";
import { Box, Chip, Tooltip, Typography } from "@mui/material";
import { readVirtualDirectoryFile } from "../../api";
import { ProjectDoc } from "../../lib/projectDoc";
import { parsePoints } from "../../lib/pointsDoc";
import { parseWorkup } from "../../lib/workupDoc";
import { parseDocList } from "../../lib/listDoc";
import { parsePlaybook } from "../../lib/playbookDoc";
import { extensionOfPath } from "../../lib/filePreviews";
import { NodeRefDialog } from "../points/PointsView";
import { loadGraphDocs } from "../../lib/projectGraphLoad";
export { loadGraphDocs } from "../../lib/projectGraphLoad";
import {
  DagEdge, GraphDocs, LanedGraph, LanedNode, assembleLanedGraph,
} from "../../lib/projectGraph";

const W = 230, HDR = 36, PAD = 24, INDENT = 28, XGAP = 120;
const ELEMENT_CHIPS = new Set(["decision", "event", "stage", "answer"]);

export default function ProjectDagView({ doc, base }: {
  doc: ProjectDoc;
  /** The project file's abs path — refs resolve against it. */
  base: string;
}) {
  const [graph, setGraph] = useState<LanedGraph | null>(null);

  useEffect(() => {
    let live = true;
    void loadGraphDocs(doc).then((docs) => { if (live) setGraph(assembleLanedGraph(doc, docs)); });
    return () => { live = false; };
  }, [doc, base]);

  if (!graph) return <Typography sx={{ p: 3, fontSize: 12, color: "text.disabled" }}>Reading the project's documents…</Typography>;
  if (!graph.nodes.length) return <Typography sx={{ p: 3, fontSize: 12, color: "text.disabled", fontStyle: "italic" }}>Nothing to draw — the project lists no items.</Typography>;
  return <DagCanvas graph={graph} base={base} />;
}

/** The laned canvas over ONE graph — the DAG dialog renders the whole
 *  project's; the lens renders a LOCALIZED slice through the same canvas. */
export function DagCanvas({ graph, base, onEmptyNode }: {
  graph: LanedGraph;
  base: string;
  /** Called for a node with no open target (an unfilled definition slot) —
   *  the host can explain the node instead of opening content. */
  onEmptyNode?: (n: LanedNode) => void;
}) {
  // Clicking a node shows ITS CONTENT in a dialog OVER the canvas — the DAG
  // is a place you stay; nothing navigates away.
  const [openRef, setOpenRef] = useState<{ node: string; element?: string; label?: string } | null>(null);

  // Placement: each node in its item's lane; children indented under their
  // parent; per-lane cumulative y with breathing room between hierarchies.
  // PARALLEL INPUTS NEVER ALIGN: two nodes in DIFFERENT lanes feeding the
  // same node are siblings, and sharing a row would read as a pipeline —
  // the later one drops below the earlier.
  const pos = useMemo(() => {
    const out = new Map<string, { x: number; y: number; h: number }>();
    if (!graph) return out;
    const consumersOf = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!consumersOf.has(e.from)) consumersOf.set(e.from, new Set());
      consumersOf.get(e.from)!.add(e.to);
    }
    const laneY = new Map<number, number>();
    const lanePrevChild = new Map<number, boolean>();
    const placed: { lane: number; y: number; consumers?: Set<string> }[] = [];
    for (const n of graph.nodes) {
      const lane = graph.lanes[n.parent ?? n.id] ?? 0;
      const isChild = !!n.parent;
      let y = laneY.get(lane) ?? PAD;
      if (!isChild && lanePrevChild.get(lane)) y += 14;
      const mine = consumersOf.get(n.id);
      if (mine) {
        let moved = true;
        while (moved) {
          moved = false;
          for (const p of placed) {
            if (p.lane !== lane && p.consumers && Math.abs(p.y - y) < HDR &&
                [...mine].some((c) => p.consumers!.has(c))) {
              y = p.y + HDR + 10;
              moved = true;
            }
          }
        }
      }
      const x = PAD + lane * (W + INDENT + XGAP) + (isChild ? INDENT : 0);
      const h = HDR;
      out.set(n.id, { x, y, h });
      placed.push({ lane, y, consumers: mine });
      laneY.set(lane, y + h + (isChild ? 8 : 10));
      lanePrevChild.set(lane, isChild);
    }
    return out;
  }, [graph]);

  const width = Math.max(0, ...[...pos.values()].map((p) => p.x)) + W + PAD;
  const height = Math.max(240, ...[...pos.values()].map((p) => p.y + p.h + PAD));

  const edgePath = (e: DagEdge): string | null => {
    const f = pos.get(e.from), t = pos.get(e.to);
    if (!f || !t) return null;
    const leftward = t.x < f.x;
    const x1 = leftward ? f.x : f.x + W, y1 = f.y + f.h / 2;
    const x2 = leftward ? t.x + W : t.x, y2 = t.y + t.h / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (leftward ? -1 : 1);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  // A node with no target (an unfilled definition slot) has no content —
  // the host may explain it instead.
  const click = (n: LanedNode) => {
    if (n.open.node) setOpenRef({ ...n.open, label: n.label });
    else onEmptyNode?.(n);
  };

  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", bgcolor: "#fafbfc" }}>
      <Box sx={{ position: "relative", width, height }}>
        <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <defs>
            <marker id="dag-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#4f46e5" />
            </marker>
          </defs>
          {graph.edges.map((e, i) => {
            const d = edgePath(e);
            if (!d) return null;
            const f = pos.get(e.from)!, t = pos.get(e.to)!;
            const mx = (f.x + W / 2 + t.x + W / 2) / 2, my = (f.y + t.y) / 2 + HDR / 2;
            const short = e.label && e.label.length > 34 ? e.label.slice(0, 32) + "…" : e.label;
            return (
              <g key={i}>
                <title>{e.label ? `${e.kind} — ${e.label}` : e.kind}</title>
                <path d={d} fill="none" stroke="#4f46e5" strokeWidth={1.4}
                  strokeDasharray={e.derived ? "4 3" : undefined} markerEnd="url(#dag-arrow)" opacity={0.75} />
                <text x={mx} y={short ? my - 12 : my - 5} textAnchor="middle"
                  style={{ fontSize: 12, fontWeight: 700, fill: "#4f46e5" }}>
                  {e.kind}
                </text>
                {short && (
                  <text x={mx} y={my - 2} textAnchor="middle"
                    style={{ fontSize: 12, fill: "#4f46e5", opacity: 0.8 }}>
                    {short}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {graph.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const isChild = !!n.parent;
          const isElement = ELEMENT_CHIPS.has(n.chip);
          // Definition nodes with nothing behind them read as PENDING —
          // dashed and muted. Project-graph nodes always have a target.
          // The one the instance is WAITING ON is solid amber instead.
          const isNext = n.accent === "next";
          const isEmpty = !n.open.node && !isNext;
          return (
            <Tooltip key={n.id} title={n.id}>
              <Box onClick={() => click(n)}
                sx={{ position: "absolute", left: p.x, top: p.y, width: W, height: p.h,
                      border: "1px solid", borderStyle: isEmpty ? "dashed" : "solid",
                      borderColor: isNext ? "#b45309" : isElement ? "#4f46e555" : "divider",
                      borderRadius: 1.5,
                      bgcolor: isElement ? "#4f46e508" : isChild ? "#f8fafc" : "#fff",
                      boxShadow: "0 1px 3px #0f172a14",
                      cursor: n.open.node || onEmptyNode ? "pointer" : "default",
                      "&:hover": { borderColor: n.open.node || onEmptyNode ? "#4f46e5" : undefined } }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, px: 1, height: HDR }}>
                  <Typography sx={{ fontSize: 13, fontWeight: isChild ? 500 : 700, flex: 1, minWidth: 0 }} noWrap>
                    {n.label}
                  </Typography>
                  <Chip size="small" label={n.chip}
                    sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                          bgcolor: isElement ? "#4f46e514" : "#0f172a0d",
                          color: isElement ? "#4f46e5" : "text.secondary" }} />
                </Box>
              </Box>
            </Tooltip>
          );
        })}
      </Box>
      </Box>
      <NodeRefDialog base={base} nodeRef={openRef} onClose={() => setOpenRef(null)} />
    </Box>
  );
}
