/**
 * The whole flow at once — orientation, not reading.
 *
 * Demoted from the main view deliberately: a graph shows you the shape of a model but is a poor
 * place to answer "what does this screen look like" or "where does this button go", which are the
 * two questions the Screens and Navigate tabs exist for. Clicking a node here jumps to that
 * screen's page, which is what the graph is genuinely good for.
 *
 * Edges are resolved under the parameters in force, and a dispatching control is drawn DASHED
 * where an unconditional one is solid — the distinction the format is built on, made visible in
 * the one place that used to hide it completely, without spending a colour on it.
 */
import { useMemo } from "react";
import {
  Background, Controls, MarkerType, Position, ReactFlow,
  type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import { Box, Chip, Typography } from "@mui/material";
import {
  type Assignment, type FlowBody,
  matchWhen, reachFlow, resolveEdge, resolveVariant, screenAssignment,
} from "../../lib/flowEngine";
import { MUTED, EMPH, COND, MAP } from "./flowPalette";

const NODE_W = 220;
const NODE_H = 118;

export default function FlowMap({
  body, assignment, reach, labelVariants, focus, onFocus, onToggleVariants,
}: {
  body: FlowBody;
  assignment: Assignment;
  reach: ReturnType<typeof reachFlow>;
  labelVariants: boolean;
  focus: string | null;
  onFocus: (id: string) => void;
  onToggleVariants: () => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 46, ranksep: 78, marginx: 24, marginy: 24 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const s of body.screens) g.setNode(s.id, { width: NODE_W, height: NODE_H });

    // Each screen is resolved under ITS OWN opening assignment, not one shared one: a screen's
    // locals only exist while you are on it, so evaluating another screen's controls against them
    // would be reading a variable that is out of scope.
    const resolved = body.screens.flatMap((s) => {
      const at = screenAssignment(body, s.id, assignment);
      return s.edges
        .filter((e) => matchWhen(e.when, at))
        .map((edge) => ({ edge, res: resolveEdge(edge, at) }))
        // A control that resolves nowhere is not a route; one that STAYS is a route inside a
        // single node, and a graph of screens has nowhere to draw it.
        .filter((x) => x.res.resolved && x.res.to !== null && x.res.to !== s.id);
    });
    for (const { edge, res } of resolved) g.setEdge(edge.from, res.to!);
    dagre.layout(g);

    const nodeList: Node[] = body.screens.map((s) => {
      const pos = g.node(s.id);
      const live = reach.screens.has(s.id);
      const variant = resolveVariant(s, screenAssignment(body, s.id, assignment));
      return {
        id: s.id,
        position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          label: (
            <Box sx={{ p: 0.75, textAlign: "left" }}>
              {body.initial === s.id && (
                <Chip size="small" label="start" sx={{ height: 20, fontSize: 12, mb: 0.4, bgcolor: `${EMPH}44` }} />
              )}
              <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{s.title}</Typography>
              {labelVariants && variant && (
                <Typography sx={{ fontSize: 12, color: COND, mt: 0.25 }}>{variant.label}</Typography>
              )}
              {!live && <Typography sx={{ fontSize: 12, color: MUTED, mt: 0.25 }}>unreachable here</Typography>}
            </Box>
          ),
        },
        style: {
          width: NODE_W, padding: 0, borderRadius: 8,
          border: `${focus === s.id ? 2 : 1}px solid`,
          borderColor: focus === s.id ? EMPH : live ? MAP.nodeBorder : MAP.nodeBorderDead,
          background: live ? MAP.nodeBg : MAP.nodeBgDead,
          opacity: live ? 1 : 0.42,
          color: MAP.nodeFg, fontSize: 13, textAlign: "left" as const,
        },
      };
    });

    const edgeList: Edge[] = resolved.map(({ edge, res }, i) => {
      const live = reach.edges.has(edge.id);
      const branched = edge.dispatch.length > 0;
      return {
        id: `${edge.id}_${i}`,
        source: edge.from,
        target: res.to!,
        label: edge.event,
        type: "default",
        markerEnd: { type: MarkerType.ArrowClosed, color: branched ? COND : MUTED },
        style: {
          stroke: branched ? COND : MUTED,
          strokeWidth: branched ? 1.6 : 1.2,
          // Dashed, not coloured: the palette is neutral now, so the always/depends distinction
          // has to be carried by the stroke itself.
          ...(branched ? { strokeDasharray: "5 3" } : null),
          opacity: live ? 1 : 0.28,
        },
        labelStyle: { fontSize: 12, fill: MAP.labelFg },
        labelBgStyle: { fill: MAP.labelBg, fillOpacity: 0.85 },
      };
    });

    return { nodes: nodeList, edges: edgeList };
  }, [body, assignment, reach, labelVariants, focus]);

  return (
    <Box sx={{ height: "100%", position: "relative" }}>
      <Box sx={{ position: "absolute", top: 8, left: 8, zIndex: 5, display: "flex", gap: 0.5, alignItems: "center" }}>
        <Chip size="small" label={labelVariants ? "Showing states" : "Show states"} onClick={onToggleVariants}
          variant={labelVariants ? "filled" : "outlined"} sx={{ fontSize: 12, height: 21 }} />
        <Chip size="small" label="——— always" sx={{ fontSize: 12, height: 20, color: MUTED }} variant="outlined" />
        <Chip size="small" label="- - - depends on parameters" sx={{ fontSize: 12, height: 20, color: COND, borderColor: COND }} variant="outlined" />
        <Typography sx={{ fontSize: 12, color: MUTED, ml: 0.5 }}>click a screen to open its page</Typography>
      </Box>
      <ReactFlow
        nodes={nodes} edges={edges} fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false} nodesConnectable={false}
        onNodeClick={(_, n) => onFocus(n.id)}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </Box>
  );
}
