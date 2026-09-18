/**
 * ONE column of a state's CONTENT — the whole answer to "what does this state show?".
 *
 * `.flow` used to answer that with a screenshot, and this component used to be `ShotPane`: an
 * `<img>`, a scroll index and two arrows. The format has since generalised (see `FlowPanel` in
 * `flow_ops.ts`) — a state shows a LIST OF PANELS, and a screenshot is one kind of panel next to a
 * reference to another file, or to a FRAME drawn live at one of its views.
 *
 * Two things stayed exactly as they were, because generalising them would have been a regression:
 *
 *   • The pane owns ITS OWN position. A before/after pair is two different states of a screen and
 *     they are rarely the same shape, so stepping them together would put you at unrelated places
 *     in each. That was true of a tall screenshot's scroll and it is true of a three-panel state.
 *   • Panels are a SEQUENCE, not a layout. One at a time, arrows to move. A state that wants two
 *     things side by side is describing a screen, and a screen is a `.frame`.
 *
 * A file panel renders through the SAME registry every other host uses (`previewForPath`), so a
 * `.brief` here is the `.brief` you get everywhere — read-only and LIVE. It is not a copy: the
 * referenced file is fetched by `useFlowPanelFiles` and editing it changes what this state says.
 * A frame panel renders through the frame canvas at the state's view, fitted to the pane like a
 * device: the whole screen is visible and a scroll node inside it scrolls by itself — which is
 * why a frame state is ONE panel with no arrows, where a tall capture needed several.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

import { previewForPath } from "../../lib/filePreviews";
import { openInStudio, studioUrlFor } from "../../lib/studioDialog";
import { readVirtualDirectoryFile } from "./flowHost";
import { type FlowBody, type FlowPanel, resolvePanelTarget } from "../../lib/flowEngine";
import type { FlowFramePanel } from "../../lib/flowOps";
import { frameOf, parseFrame, parseFrameObject, viewById } from "../../lib/frameDoc";
import FrameCanvas from "../frame/FrameCanvas";
import FrameEditIcon from "@mui/icons-material/EditOutlined";
import type { FrameEditTarget } from "./FrameEditDialog";
import { MUTED, PANE_BG, FILE_BG, FILE_FG, OVERLAY_BG, OVERLAY_FG, WARN } from "./flowPalette";


/** Where a file or frame panel actually reads from, once the flow's sources and host are applied. */
export interface PanelFile { agentId: string; path: string }

/** Stable cache key for a resolved file panel. */
export const panelFileKey = (agentId: string, path: string): string => `${agentId} ${path}`;

/**
 * Resolve a panel to a concrete (agent, path), or null when it is a screenshot or the flow is not
 * saved into a directory yet.
 *
 * The `source` → folder half is the MODEL's business and lives in `flow_ops.resolvePanelTarget`;
 * all that is added here is the host, which the model cannot know: a panel that names no agent
 * means "the directory this `.flow` is in".
 */
export function panelFile(panel: FlowPanel, body: FlowBody, hostAgentId?: string): PanelFile | null {
  const target = resolvePanelTarget(panel, body);
  if (!target || !target.path) return null;
  const agentId = target.agent ?? hostAgentId ?? "";
  return agentId ? { agentId, path: target.path } : null;
}

/** Every file and frame panel in the model, deduplicated by (agent, path). */
function panelTargets(body: FlowBody, hostAgentId?: string): Map<string, PanelFile> {
  const out = new Map<string, PanelFile>();
  for (const screen of body.screens) {
    for (const p of [...screen.content, ...screen.variants.flatMap((v) => v.content)]) {
      const f = panelFile(p, body, hostAgentId);
      if (f) out.set(panelFileKey(f.agentId, f.path), f);
    }
  }
  return out;
}

/**
 * Fetch the bodies of every file this flow's states reference.
 *
 * Loaded once per (agent, path) and kept — a walk moves between states constantly and re-reading
 * the same `.brief` on every step would make pressing a control feel like a page load. `""` is a
 * resolved-but-unreadable file (deleted, renamed, no access), which the pane draws as a broken
 * reference rather than as "still loading" — the two look identical to a reader and only one of
 * them is worth waiting for.
 */
export function useFlowPanelFiles(body: FlowBody, hostAgentId?: string): Record<string, string> {
  const [files, setFiles] = useState<Record<string, string>>({});
  const ref = useRef<Record<string, string>>({});
  // Only the SET of targets should re-trigger a load — not every keystroke in the model.
  const wanted = useMemo(() => panelTargets(body, hostAgentId), [body, hostAgentId]);
  const signature = [...wanted.keys()].sort().join("|");
  useEffect(() => {
    const missing = [...wanted.values()].filter((f) => ref.current[panelFileKey(f.agentId, f.path)] === undefined);
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      const next = { ...ref.current };
      for (const f of missing) {
        const key = panelFileKey(f.agentId, f.path);
        try { next[key] = (await readVirtualDirectoryFile(f.agentId, f.path)).content ?? ""; }
        catch { next[key] = ""; }
      }
      if (cancelled) return;
      ref.current = next;
      setFiles(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return files;
}

/** A file panel's body: its content, still loading, or a broken reference. */
function FilePanelView({ file, files, label }: { file: PanelFile | null; files: Record<string, string>; label: string | null }) {
  if (!file) {
    return <Note>This panel names a file, but the flow has not been saved into a directory yet.</Note>;
  }
  const content = files[panelFileKey(file.agentId, file.path)];
  if (content === undefined) return <Note>loading {file.path}…</Note>;
  if (content === "") return <Note>Can’t read <code>{file.path}</code> — it may have been renamed or removed.</Note>;
  const preview = previewForPath(file.path);
  return (
    <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", minHeight: 0, bgcolor: FILE_BG }}>
      <Box sx={{ flexShrink: 0, px: 0.75, py: 0.4, borderBottom: "1px solid", borderColor: "divider", display: "flex", gap: 0.75, alignItems: "baseline" }}>
        <Typography sx={{ fontSize: 13, color: FILE_FG, fontWeight: 600 }}>{label || file.path.split("/").pop()}</Typography>
        <Typography sx={{ fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.path}</Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {preview
          ? <preview.Renderer content={content} height="100%" editable={false} agentId={file.agentId} path={file.path} />
          : <pre style={{ margin: 0, padding: 10, fontSize: 13, color: FILE_FG, whiteSpace: "pre-wrap" }}>{content}</pre>}
      </Box>
    </Box>
  );
}

/**
 * A frame panel: the frame — a file beside the flow, or one kept inside it — drawn by the canvas
 * at the state's view, fitted to the pane on both axes like a device in a hand: the whole screen
 * visible, a scroll node scrolling on its own. A link opens it in the Studio either way.
 */
function FramePanelView({ file, files, panel, body, hostAgentId, hostPath, onEditFrame }: {
  file: PanelFile | null; files: Record<string, string>; panel: FlowFramePanel; body: FlowBody; hostAgentId?: string; hostPath?: string;
  onEditFrame?: (target: FrameEditTarget) => void;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  // The measured box mounts only once the frame has loaded — the first renders are a note — so the
  // observer attaches when the element arrives, not on the component's first effect.
  const observer = useRef<ResizeObserver | null>(null);
  const boxRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((cur) => (Math.abs(cur.w - r.width) > 1 || Math.abs(cur.h - r.height) > 1 ? { w: r.width, h: r.height } : cur));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    observer.current = ro;
  }, []);
  // Inside the flow, or a file beside it — the name wins.
  const inlineRaw = body.frames[panel.path];
  const content = inlineRaw ? null : file ? files[panelFileKey(file.agentId, file.path)] : undefined;
  const doc = useMemo(() => (inlineRaw ? parseFrameObject(inlineRaw) : content ? parseFrame(content) : null), [inlineRaw, content]);
  if (!inlineRaw) {
    if (!file) return <Note>This state names a frame, but the flow has not been saved into a directory yet.</Note>;
    if (content === undefined) return <Note>loading {file.path}…</Note>;
    if (content === "" || !doc) return <Note>Can’t read <code>{file.path}</code> — it may have been renamed or removed.</Note>;
  }
  if (!doc) return <Note>no frame</Note>;
  const frame = frameOf(doc);
  if (!frame) return <Note><code>{panel.path}</code> has no frame yet.</Note>;
  const wanted = panel.view?.trim() ?? "";
  const view = viewById(doc, wanted) ?? doc.views.find((v) => v.name.toLowerCase() === wanted.toLowerCase()) ?? null;
  const missingView = !!wanted && !view;
  const scale = box.w && box.h ? Math.min(1, (box.w - 12) / frame.width, (box.h - 12) / frame.height) : 1;
  // The absolute store path the canvas resolves the frame's images and embeds against: the file's
  // own, or — for an inline frame — a stand-in beside the flow, whose FOLDER is all that matters.
  const folder = (hostAgentId ?? "").replace(/\/+$/, "");
  const docPath = inlineRaw ? `${folder}/${panel.path}.frame` : `${file!.agentId.replace(/\/+$/, "")}/${file!.path.replace(/^\/+/, "")}`;
  const label = inlineRaw ? `${panel.path} (in this flow)` : file!.path.split("/").pop();
  const studioUrl = inlineRaw
    ? (hostPath ? studioUrlFor(hostPath, panel.path) : null)
    : studioUrlFor(docPath);
  return (
    <Box ref={boxRef} sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {/* Drawn at once — at 1:1 until the pane reports a size, then fitted; a background tab may never report one. */}
      <FrameCanvas body={doc} view={view} docPath={docPath} scale={scale} />
      {/* Bottom-left, off the screen's header — a phone's first row is the one worth reading. */}
      <Chip size="small" label={`${label} · ${view ? view.name : "Base"}`}
        sx={{ position: "absolute", bottom: 6, left: 6, height: 20, fontSize: 12, zIndex: 2, bgcolor: OVERLAY_BG, color: OVERLAY_FG }} />
      {onEditFrame ? (
        <Tooltip title="Edit this frame">
          <IconButton size="small" onClick={() => onEditFrame(inlineRaw ? { kind: "inline", name: panel.path } : { kind: "file", abs: docPath })}
            sx={{ position: "absolute", bottom: 4, right: 4, zIndex: 2, bgcolor: OVERLAY_BG, color: OVERLAY_FG, "&:hover": { bgcolor: OVERLAY_BG } }}>
            <FrameEditIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      ) : studioUrl && (
        <Tooltip title="Open in the Studio">
          <IconButton size="small" onClick={() => openInStudio({ url: studioUrl, title: `${label} · Studio` })}
            sx={{ position: "absolute", bottom: 4, right: 4, zIndex: 2, bgcolor: OVERLAY_BG, color: OVERLAY_FG, "&:hover": { bgcolor: OVERLAY_BG } }}>
            <OpenInNewIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
      {missingView && (
        <Chip size="small" label={`no view “${wanted}” in this frame — showing Base`}
          sx={{ position: "absolute", bottom: 28, left: 6, height: 20, fontSize: 12, zIndex: 2, bgcolor: `${WARN}22`, color: WARN }} />
      )}
    </Box>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ fontSize: 13, color: MUTED, p: 3, textAlign: "center" }}>{children}</Typography>;
}

export default function FlowContentPane({ panels, urls, files, body, hostAgentId, hostPath, label, tone, empty, onEditFrame }: {
  panels: FlowPanel[];
  /** Signed URLs for screenshot panels, keyed by Storage key. */
  urls: Record<string, string>;
  /** Bodies for file and frame panels, keyed by `panelFileKey`. See `useFlowPanelFiles`. */
  files: Record<string, string>;
  /** Needed to resolve a file panel's `source` against the flow's declared versions, and for its inline frames. */
  body: FlowBody;
  hostAgentId?: string;
  /** The flow's own path — where the Studio opens an inline frame from. */
  hostPath?: string;
  /** Opens the frame editor over a frame panel; absent = a link to the Studio instead. */
  onEditFrame?: (target: FrameEditTarget) => void;
  label?: string;
  tone?: string;
  /** What to say when there is nothing to show — the caller knows WHY there is nothing. */
  empty: string;
}) {
  const [index, setIndex] = useState(0);
  // Reset when the pane is pointed at a different state, or a 3-panel state followed by a 1-panel
  // one would open on an index that no longer exists.
  const signature = panels.map((p) => (p.kind === "screenshot" ? p.key : p.kind === "frame" ? `${p.path}@${p.view ?? ""}` : `${p.source ?? ""}/${p.path}`)).join("|");
  useEffect(() => { setIndex(0); }, [signature]);
  const at = Math.min(index, Math.max(0, panels.length - 1));
  const panel = panels[at];
  const url = panel?.kind === "screenshot" ? urls[panel.key] : undefined;
  // "scroll" is the right word for a tall capture cut into pieces and the wrong one for a
  // screenshot followed by a brief, so it is used only when every panel is an image.
  const stepWord = panels.every((p) => p.kind === "screenshot") ? "scroll" : "panel";

  return (
    <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {label && (
        <Typography sx={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6, color: tone ?? MUTED, mb: 0.3, flexShrink: 0 }}>
          {label}
        </Typography>
      )}
      <Box sx={{
        position: "relative", bgcolor: PANE_BG, borderRadius: 1, flex: 1, minHeight: 0,
        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
        border: "1px solid", borderColor: tone ?? "divider",
      }}>
        {!panel && <Note>{empty}</Note>}
        {panel?.kind === "screenshot" && (url
          ? <img src={url} alt="" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
          : <Note>loading…</Note>)}
        {panel?.kind === "file" && (
          <FilePanelView file={panelFile(panel, body, hostAgentId)} files={files} label={panel.label} />
        )}
        {panel?.kind === "frame" && (
          <FramePanelView file={panelFile(panel, body, hostAgentId)} files={files} panel={panel} body={body} hostAgentId={hostAgentId} hostPath={hostPath} onEditFrame={onEditFrame} />
        )}
        {panels.length > 1 && (
          <>
            <IconButton size="small" disabled={at === 0} onClick={() => setIndex(at - 1)}
              sx={{ position: "absolute", top: 4, right: 4, bgcolor: OVERLAY_BG, color: OVERLAY_FG, zIndex: 2 }}>
              <KeyboardArrowUpIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton size="small" disabled={at >= panels.length - 1} onClick={() => setIndex(at + 1)}
              sx={{ position: "absolute", bottom: 4, right: 4, bgcolor: OVERLAY_BG, color: OVERLAY_FG, zIndex: 2 }}>
              <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Chip size="small" label={`${stepWord} ${at + 1} / ${panels.length}`}
              sx={{ position: "absolute", bottom: 6, left: 6, height: 20, fontSize: 12, zIndex: 2 }} />
          </>
        )}
      </Box>
    </Box>
  );
}
