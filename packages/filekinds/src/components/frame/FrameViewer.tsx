/**
 * Read-only `.frame` viewer — the single frame on a canvas, with its VIEWS
 * as tabs (Base + one per UI state), its versions in a picker, and a layer
 * tree that highlights the node you click. Zoom fits the frame to the
 * container by default; the studio owns editing, this only shows.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Chip, IconButton, MenuItem, Select, Stack, Tooltip, Typography } from "@mui/material";
import LayersIcon from "@mui/icons-material/Layers";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { type FrameBody, type FrameNode, childrenOf, frameOf, frameProblems, frameSnapshotAt, hiddenIn, parseFrame, viewById } from "../../lib/frameDoc";
import type { ViewerProps } from "../../lib/filePreviews";
import FrameCanvas from "./FrameCanvas";

const ZOOMS = [0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2];

/** The node tree as indented rows — hidden ones (in the active view) dimmed. */
export function FrameLayerTree({ body, hidden, selectedId, onSelect }: {
  body: FrameBody;
  hidden: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const rows: { node: FrameNode; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const n of childrenOf(body, parentId)) {
      rows.push({ node: n, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return (
    <Box sx={{ py: 0.5 }}>
      {rows.length === 0 && <Typography sx={{ px: 1.5, py: 1, fontSize: 12, color: "text.disabled" }}>No nodes yet</Typography>}
      {rows.map(({ node, depth }) => (
        <Stack key={node.id} direction="row" onClick={() => onSelect(node.id)}
          sx={{ alignItems: "center", gap: 0.75, pl: 1 + depth * 1.25, pr: 1, py: 0.35, cursor: "pointer",
                bgcolor: selectedId === node.id ? "#2563eb1a" : "transparent", opacity: hidden.has(node.id) ? 0.45 : 1,
                "&:hover": { bgcolor: "#0f172a0a" } }}>
          <Typography noWrap sx={{ fontSize: 12, flex: 1 }}>{node.name}</Typography>
          <Chip size="small" label={node.kind} sx={{ height: 20, fontSize: 12, fontFamily: "monospace" }} />
          {hidden.has(node.id) && <VisibilityOffIcon sx={{ fontSize: 12, color: "text.disabled" }} />}
        </Stack>
      ))}
    </Box>
  );
}

export default function FrameViewer({ content, height = "100%", agentId, path, chromeless }: ViewerProps) {
  const doc = useMemo(() => parseFrame(content), [content]);
  const docPath = path ?? agentId;
  const [version, setVersion] = useState<string>("");
  const body = useMemo(() => frameSnapshotAt(doc, version || undefined), [doc, version]);
  const [viewId, setViewId] = useState<string | null>(null);
  const view = viewById(body, viewId) ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layers, setLayers] = useState(false);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const problems = useMemo(() => frameProblems(body), [body]);
  const hidden = useMemo(() => hiddenIn(body, view), [body, view]);

  // Fit: the frame's width against the scroll area's, never above 1:1.
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [areaW, setAreaW] = useState(800);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    // Only a real change re-fits: a scrollbar toggling would otherwise
    // re-fit, re-size the canvas, toggle the scrollbar again — forever.
    const measure = () => setAreaW((w) => (Math.abs(w - el.clientWidth) > 2 ? el.clientWidth : w));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const frame = frameOf(body);
  const fit = frame ? Math.min(1, Math.max(0.05, (areaW - 40) / Math.max(1, frame.width))) : 1;
  const scale = zoom === "fit" ? fit : zoom;
  const step = (dir: 1 | -1) => {
    const cur = scale;
    const next = dir > 0 ? ZOOMS.find((z) => z > cur + 0.001) : [...ZOOMS].reverse().find((z) => z < cur - 0.001);
    if (next) setZoom(next);
  };

  useEffect(() => { setViewId(null); setSelectedId(null); }, [content, version]);

  return (
    <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Stack direction="row" spacing={1}
        sx={{ alignItems: "center", px: 1.25, py: 0.5, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0, flexWrap: "wrap", rowGap: 0.5 }}>
        {!chromeless && <Typography sx={{ fontSize: 13, fontWeight: 650, mr: 0.5 }}>{body.title || "Untitled frame"}</Typography>}
        <Tooltip title="Layers">
          <IconButton size="small" onClick={() => setLayers((v) => !v)} color={layers ? "primary" : "default"}><LayersIcon sx={{ fontSize: 16 }} /></IconButton>
        </Tooltip>
        <Chip size="small" label="Base" onClick={() => setViewId(null)} color={viewId === null ? "primary" : "default"}
          variant={viewId === null ? "filled" : "outlined"} sx={{ height: 22, fontSize: 13 }} />
        {body.views.map((v) => (
          <Chip key={v.id} size="small" label={v.name} onClick={() => setViewId(v.id)} color={viewId === v.id ? "primary" : "default"}
            variant={viewId === v.id ? "filled" : "outlined"} sx={{ height: 22, fontSize: 13 }} />
        ))}
        <Box sx={{ flex: 1 }} />
        {doc.versions.length > 0 && (
          <Select size="small" value={version} onChange={(e) => setVersion(String(e.target.value))} sx={{ fontSize: 13, height: 26, minWidth: 120 }}>
            <MenuItem value="" sx={{ fontSize: 12 }}>{doc.versionName ? `${doc.versionName} (latest)` : "latest"}</MenuItem>
            {doc.versions.map((v, i) => <MenuItem key={v.name + i} value={v.name} sx={{ fontSize: 12 }}>{v.name}</MenuItem>)}
          </Select>
        )}
        {problems.length > 0 && (
          <Tooltip title={<Box component="ul" sx={{ pl: 2, m: 0 }}>{problems.map((p, i) => <li key={i}>{p}</li>)}</Box>}>
            <Chip size="small" color="warning" label={`${problems.length} problem${problems.length === 1 ? "" : "s"}`} sx={{ height: 22, fontSize: 13 }} />
          </Tooltip>
        )}
        <Stack direction="row" sx={{ alignItems: "center" }}>
          <IconButton size="small" onClick={() => step(-1)}><RemoveIcon sx={{ fontSize: 14 }} /></IconButton>
          <Typography sx={{ fontSize: 13, width: 38, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{Math.round(scale * 100)}%</Typography>
          <IconButton size="small" onClick={() => step(1)}><AddIcon sx={{ fontSize: 14 }} /></IconButton>
          <Tooltip title="Fit"><IconButton size="small" onClick={() => setZoom("fit")} color={zoom === "fit" ? "primary" : "default"}><FitScreenIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
        </Stack>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        {layers && (
          <Box sx={{ width: 220, flexShrink: 0, borderRight: "1px solid", borderColor: "divider", overflowY: "auto" }}>
            <FrameLayerTree body={body} hidden={hidden} selectedId={selectedId} onSelect={setSelectedId} />
          </Box>
        )}
        <Box ref={areaRef} sx={{ flex: 1, minWidth: 0, overflow: "auto", scrollbarGutter: "stable", p: 2.5, bgcolor: "#eef0f3",
                                 backgroundImage: "radial-gradient(#d4d7dd 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
          <FrameCanvas body={body} view={view} docPath={docPath} scale={scale} selectedId={selectedId} onSelect={setSelectedId} />
        </Box>
      </Box>
    </Box>
  );
}
