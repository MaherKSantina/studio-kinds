/**
 * THE LENS — one item under the glass, its children laid out with their
 * PROVENANCE visible. Pick a target (the policy, a list, a workup); every
 * child the production DAG feeds carries a "produced" mark and a TRACE
 * button that swaps in the DAG LOCALIZED to that child — where it came
 * from, and nothing else. This is the feedback loop's reading surface:
 * see what an analysis produced, trace it, then go produce the next thing.
 */
import { useEffect, useMemo, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { ProjectDoc, ProjectItem, itemLabel } from "../../lib/projectDoc";
import { extensionOfPath } from "../../lib/filePreviews";
import {
  GraphDocs, LanedGraph, assembleLanedGraph, isProduced, localizeGraph,
} from "../../lib/projectGraph";
import { NodeRefDialog } from "../points/PointsView";
import { DagCanvas, loadGraphDocs } from "./ProjectDagView";

const MONO = { fontFamily: "ui-monospace, monospace" } as const;
const INDIGO = "#4f46e5";

interface LensRow {
  id: string;
  label: string;
  chip: string;
  indent: boolean;
  open: { node: string; element?: string };
}

/** The target's children as the lens shows them. A playbook contributes its
 *  decisions with their answers nested; anything else contributes the
 *  graph's children of the item. */
function lensRows(target: string, docs: GraphDocs, graph: LanedGraph): LensRow[] {
  const pb = docs.playbooks?.get(target);
  if (pb) {
    const rows: LensRow[] = [];
    for (const d of pb.decisions) {
      rows.push({
        id: `${target}#decision:${d.key}`, label: d.label, chip: "decision", indent: false,
        open: { node: target, element: `decision:${d.key}` },
      });
      for (const v of d.values) {
        rows.push({
          id: `${target}#decision:${d.key}=${v.key}`, label: v.label, chip: "answer", indent: true,
          open: { node: target, element: `decision:${d.key}=${v.key}` },
        });
      }
    }
    for (const ev of pb.events) {
      rows.push({
        id: `${target}#event:${ev.key}`, label: ev.label, chip: "event", indent: false,
        open: { node: target, element: `event:${ev.key}` },
      });
    }
    return rows;
  }
  return graph.nodes
    .filter((n) => n.parent === target)
    .map((n) => ({ id: n.id, label: n.label, chip: n.chip, indent: true, open: n.open }));
}

export default function ProjectLensView({ doc, base }: {
  doc: ProjectDoc;
  /** The project file's abs path — refs resolve against it. */
  base: string;
}) {
  const [loaded, setLoaded] = useState<{ docs: GraphDocs; graph: LanedGraph } | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [trace, setTrace] = useState<{ id: string; label: string } | null>(null);
  const [openRef, setOpenRef] = useState<{ node: string; element?: string; label?: string } | null>(null);

  useEffect(() => {
    let live = true;
    void loadGraphDocs(doc).then((docs) => {
      if (live) setLoaded({ docs, graph: assembleLanedGraph(doc, docs) });
    });
    return () => { live = false; };
  }, [doc, base]);

  const items = useMemo(() => {
    const out: ProjectItem[] = [];
    const walk = (list: ProjectItem[]) => {
      for (const it of list) {
        if (it.file) out.push(it);
        if (it.items) walk(it.items);
      }
    };
    walk(doc.items);
    return out;
  }, [doc]);

  if (!loaded) return <Typography sx={{ p: 3, fontSize: 12, color: "text.disabled" }}>Reading the project's documents…</Typography>;
  const { docs, graph } = loaded;

  /* ── the trace: the DAG, localized to one child ──────────────────────── */
  if (target && trace) {
    return (
      <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 2, py: 1, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
          <Chip size="small" clickable label="‹ back" onClick={() => setTrace(null)}
            sx={{ height: 20, fontSize: 12, fontWeight: 700 }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 650 }}>Where “{trace.label}” came from</Typography>
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <DagCanvas graph={localizeGraph(graph, trace.id)} base={base} />
        </Box>
      </Box>
    );
  }

  /* ── the target's children, provenance-marked ────────────────────────── */
  if (target) {
    const it = items.find((x) => x.file === target);
    const rows = lensRows(target, docs, graph);
    return (
      <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 2, py: 1, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
          <Chip size="small" clickable label="‹ items" onClick={() => setTarget(null)}
            sx={{ height: 20, fontSize: 12, fontWeight: 700 }} />
          <Typography sx={{ fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            onClick={() => setOpenRef({ node: target, label: it ? itemLabel(it) : target })}>
            {it ? itemLabel(it) : target}
          </Typography>
          <Chip size="small" label={extensionOfPath(target) || "file"}
            sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase", bgcolor: "#0f172a0d", color: "text.secondary" }} />
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>{target}</Typography>
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.5 }}>
          {rows.map((r) => {
            const produced = isProduced(graph, r.id);
            return (
              <Stack key={r.id} direction="row" spacing={0.75}
                sx={{ alignItems: "center", py: 0.75, px: 1, ml: r.indent ? 3 : 0, mb: 0.5,
                      border: "1px solid", borderColor: "divider", borderRadius: 1.5, bgcolor: "#fff",
                      cursor: "pointer", "&:hover": { borderColor: INDIGO } }}
                onClick={() => setOpenRef({ ...r.open, label: r.label })}>
                <Typography sx={{ fontSize: 12, fontWeight: r.indent ? 500 : 650, flex: 1, minWidth: 0 }} noWrap>
                  {r.label}
                </Typography>
                <Chip size="small" label={r.chip}
                  sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                        bgcolor: `${INDIGO}14`, color: INDIGO }} />
                {produced && (
                  <>
                    <Chip size="small" label="produced"
                      title="This node was produced by the project's DAG"
                      sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#16a34a1a", color: "#16a34a" }} />
                    <Chip size="small" clickable label="trace"
                      title="See the DAG localized to this node — where it came from"
                      onClick={(e) => { e.stopPropagation(); setTrace({ id: r.id, label: r.label }); }}
                      sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: `${INDIGO}14`, color: INDIGO,
                            border: "1px solid", borderColor: `${INDIGO}55` }} />
                  </>
                )}
              </Stack>
            );
          })}
          {!rows.length && (
            <Typography sx={{ fontSize: 13, color: "text.disabled", fontStyle: "italic" }}>
              Nothing under this item.
            </Typography>
          )}
        </Box>
        <NodeRefDialog base={base} nodeRef={openRef} onClose={() => setOpenRef(null)} />
      </Box>
    );
  }

  /* ── pick the target ─────────────────────────────────────────────────── */
  return (
    <Box sx={{ height: "100%", minHeight: 0, overflow: "auto", p: 1.5 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "text.disabled", mb: 1 }}>
        Put one item under the lens
      </Typography>
      {items.map((it) => (
        <Stack key={it.file} direction="row" spacing={0.75}
          sx={{ alignItems: "center", py: 0.75, px: 1, mb: 0.5, border: "1px solid", borderColor: "divider",
                borderRadius: 1.5, bgcolor: "#fff", cursor: "pointer", "&:hover": { borderColor: INDIGO } }}
          onClick={() => setTarget(it.file!)}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 650, flex: 1, minWidth: 0 }} noWrap>{itemLabel(it)}</Typography>
          <Chip size="small" label={extensionOfPath(it.file!) || "file"}
            sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase", bgcolor: "#0f172a0d", color: "text.secondary" }} />
        </Stack>
      ))}
    </Box>
  );
}
