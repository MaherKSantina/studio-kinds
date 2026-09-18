/**
 * The FRAMES kept inside this flow — the Frames tab. A frame moved into a
 * flow is a SCREEN of it (the move adds one when no state showed the file);
 * this tab is the frames themselves: each drawn small, with its views and
 * the states that show it, a way into the Studio, a screen for one that
 * lost its states, and a way out of the flow.
 */
import { useMemo } from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import type { FrameEditTarget } from "./FrameEditDialog";
import { type FlowBody, panelsOf } from "../../lib/flowEngine";
import type { FlowDoc } from "../../lib/flowOps";
import { addScreenForInlineFrame, removeInlineFrameFromDoc } from "../../lib/flowFrames";
import { parseFrameObject, frameOf } from "../../lib/frameDoc";
import { openInStudio, studioUrlFor } from "../../lib/studioDialog";
import FrameCanvas from "../frame/FrameCanvas";
import { MUTED, EMPH, PANE_BG, SEL_BG, ACTION_BG, ACTION_BG_HOVER, ACTION_FG } from "./flowPalette";

const THUMB_W = 150;

export default function FlowFramesList({ body, agentId, path, onDocChange, onEditFrame }: {
  body: FlowBody;
  agentId?: string;
  path?: string;
  onDocChange?: (mutate: (draft: FlowDoc) => { ok: boolean; error?: string }) => void;
  /** Opens the frame editor over one of these frames, in place. */
  onEditFrame?: (target: FrameEditTarget) => void;
}) {
  const frames = useMemo(() => Object.entries(body.frames).map(([name, raw]) => {
    const doc = parseFrameObject(raw);
    const usedBy: string[] = [];
    for (const s of body.screens) {
      if (panelsOf(s).some((p) => p.kind === "frame" && p.path === name)) usedBy.push(s.title);
      for (const v of s.variants) if (panelsOf(v).some((p) => p.kind === "frame" && p.path === name)) usedBy.push(`${s.title} · ${v.label}`);
    }
    return { name, doc, frame: frameOf(doc), usedBy };
  }), [body]);
  const folder = (agentId ?? "").replace(/\/+$/, "");
  const addScreen = (name: string) => onDocChange?.((draft) => addScreenForInlineFrame(draft, name));
  const remove = (name: string, usedBy: string[]) => {
    const shown = usedBy.length ? ` ${usedBy.length} state${usedBy.length === 1 ? "" : "s"} show${usedBy.length === 1 ? "s" : ""} it and will say it is missing.` : "";
    if (!window.confirm(`Remove the frame “${name}” from this flow?${shown} This cannot be undone.`)) return;
    onDocChange?.((draft) => removeInlineFrameFromDoc(draft, name));
  };
  const actionSx = { textTransform: "none", fontSize: 13, py: 0.25, px: 1, minWidth: 0 } as const;

  if (!frames.length) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>No frames inside this flow</Typography>
        <Typography sx={{ fontSize: 13, color: MUTED, mt: 0.5 }}>
          A frame beside the flow can move in from the project's directory view (“Move into flow…”); it becomes a screen of this flow and lives in this file.
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ p: 1.5, overflow: "auto", height: "100%", display: "flex", flexWrap: "wrap", gap: 1.5, alignContent: "flex-start" }}>
      {frames.map(({ name, doc, frame, usedBy }) => {
        const scale = frame ? Math.min(1, THUMB_W / frame.width) : 1;
        const url = path ? studioUrlFor(path, name) : null;
        return (
          <Box key={name} sx={{ width: 320, border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1, display: "flex", gap: 1.25, bgcolor: "background.paper" }}>
            <Box sx={{ width: THUMB_W, height: frame ? Math.min(260, frame.height * scale) : 80, flexShrink: 0, overflow: "hidden", bgcolor: PANE_BG, borderRadius: 0.5 }}>
              {frame ? <FrameCanvas body={doc} view={null} docPath={`${folder}/${name}.frame`} scale={scale} /> : null}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: EMPH }} noWrap title={name}>{name}</Typography>
              <Typography sx={{ fontSize: 13, color: MUTED }}>
                {frame ? `${frame.width}×${frame.height}` : "no frame"} · {doc.nodes.length} node{doc.nodes.length === 1 ? "" : "s"}
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4 }}>
                <Chip size="small" label="Base" sx={{ height: 20, fontSize: 12, bgcolor: SEL_BG, color: EMPH }} />
                {doc.views.map((v) => <Chip key={v.id} size="small" label={v.name} variant="outlined" sx={{ height: 20, fontSize: 12 }} />)}
              </Box>
              <Typography sx={{ fontSize: 13, color: usedBy.length ? MUTED : "warning.main" }}>
                {usedBy.length ? `Shown by: ${usedBy.join(", ")}` : "No screen shows it"}
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: "auto" }}>
                {onEditFrame ? (
                  <Button size="small" variant="contained" startIcon={<EditOutlinedIcon sx={{ fontSize: "14px !important" }} />}
                    onClick={() => onEditFrame({ kind: "inline", name })}
                    sx={{ ...actionSx, bgcolor: ACTION_BG, color: ACTION_FG, "&:hover": { bgcolor: ACTION_BG_HOVER } }}>
                    Edit
                  </Button>
                ) : url && (
                  <Button size="small" variant="contained" startIcon={<OpenInNewIcon sx={{ fontSize: "14px !important" }} />}
                    onClick={() => openInStudio({ url, title: `${name} · Studio` })}
                    sx={{ ...actionSx, bgcolor: ACTION_BG, color: ACTION_FG, "&:hover": { bgcolor: ACTION_BG_HOVER } }}>
                    Studio
                  </Button>
                )}
                {onDocChange && !usedBy.length && (
                  <Button size="small" variant="outlined" startIcon={<AddIcon sx={{ fontSize: "14px !important" }} />} onClick={() => addScreen(name)} sx={actionSx}>
                    Add as a screen
                  </Button>
                )}
                {onDocChange && (
                  <Button size="small" variant="outlined" color="error" title="Remove this frame from the flow" startIcon={<DeleteOutlineIcon sx={{ fontSize: "14px !important" }} />}
                    onClick={() => remove(name, usedBy)} sx={actionSx}>
                    Remove…
                  </Button>
                )}
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
