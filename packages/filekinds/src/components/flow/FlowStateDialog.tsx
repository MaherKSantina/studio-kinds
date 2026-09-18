/**
 * Edit ONE state of a screen, in a dialog.
 *
 * `.walkthrough` authors a state by opening it — a pen to edit, a bin to remove — and that is the
 * shape people already have in their hands here. An earlier attempt put the label in an inline
 * underlined TextField and the condition in a row of bare Selects, directly in the list; every
 * state then read as a form rather than as a thing, and a list of eight of them was unreadable.
 * The list is back to being a list; the editing happens here.
 *
 * The condition is the part worth designing for: a state nobody can reach is the commonest way to
 * get this format wrong, so the dialog says in plain words when the state would never show, and
 * `when` is built from the DECLARED dimensions rather than typed, so it cannot name something that
 * does not exist.
 *
 * What the state SHOWS is a frame at one of its views, or screenshots, or both. The frame list is
 * the `.frame` files beside this flow (two folders deep); the view list is that frame's own.
 */
import { useEffect, useRef, useState } from "react";
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, TextField, Tooltip, Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import { readVirtualDirectoryFile, uploadDirectoryAsset } from "./flowHost";
import { configuredLister } from "../../api";
import FlowConditionEditor from "./FlowConditionEditor";
import { type DimValue, type FlowBody, type FlowScreen, type When } from "../../lib/flowEngine";
import { parseFrame, parseFrameObject } from "../../lib/frameDoc";
import { MUTED, COND, WARN, PANE_BG, OVERLAY_BG, OVERLAY_FG, ACTION_BG, ACTION_BG_HOVER, ACTION_FG } from "./flowPalette";


export interface StateDraft {
  label: string;
  when: When;
  description: string;
  screenshots: string[];
  /** The frame this state shows, at one of its views (null = Base); null = no frame. */
  frame: { path: string; view: string | null } | null;
}

/** The `.frame` files beside a flow — its folder and two levels below — as paths relative to it. */
export function useFramesNear(agentId: string | undefined): string[] {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    const lister = configuredLister();
    if (!agentId || !lister) { setFrames([]); return; }
    let live = true;
    const root = agentId.replace(/\/+$/, "");
    (async () => {
      const out: string[] = [];
      const walk = async (dir: string, depth: number) => {
        let entries: { path: string; name: string; kind: "folder" | "file" }[] = [];
        try { entries = await lister(dir); } catch { return; }
        for (const e of entries) {
          if (e.kind === "file" && e.name.toLowerCase().endsWith(".frame")) out.push(e.path.slice(root.length + 1));
          else if (e.kind === "folder" && depth < 2 && !e.name.includes(".")) await walk(e.path, depth + 1);
        }
      };
      await walk(root, 0);
      if (live) setFrames(out.sort());
    })();
    return () => { live = false; };
  }, [agentId]);
  return frames;
}

/** A frame's views — from the flow itself when the frame lives inside it, else read live from the file beside the flow. */
function useFrameViews(agentId: string | undefined, path: string | null, inlineRaw: unknown | undefined): { id: string; name: string }[] {
  const [views, setViews] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (inlineRaw) { setViews(parseFrameObject(inlineRaw).views.map((v) => ({ id: v.id, name: v.name }))); return; }
    if (!agentId || !path) { setViews([]); return; }
    let live = true;
    readVirtualDirectoryFile(agentId, path).then(
      (r) => { if (live) setViews(parseFrame(r.content).views.map((v) => ({ id: v.id, name: v.name }))); },
      () => { if (live) setViews([]); },
    );
    return () => { live = false; };
  }, [agentId, path, inlineRaw]);
  return views;
}

export default function FlowStateDialog({
  open, body, screen, index, draft, urls, agentId, path, onClose, onSave, onDelete, onAssetAdded,
  screenLevel = false,
}: {
  open: boolean;
  body: FlowBody;
  screen: FlowScreen;
  /** -1 when adding a new state. */
  index: number;
  draft: StateDraft;
  urls: Record<string, string>;
  agentId?: string;
  path?: string;
  onClose: () => void;
  onSave: (next: StateDraft) => void;
  onDelete?: () => void;
  onAssetAdded?: (key: string) => void;
  /** True when the screen has no states of its own — the dialog then edits the SCREEN's shots. */
  screenLevel?: boolean;
}) {
  // Initialised ONCE. The caller mounts this with a key per edit session, so there is deliberately
  // no effect syncing `draft` into state: one existed, and because the parent rebuilds `draft`
  // every render it reset the draft mid-edit and threw away screenshot uploads.
  const [d, setD] = useState<StateDraft>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragShot, setDragShot] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const files = useFramesNear(agentId);
  // Frames inside the flow come first, by name; files beside it after.
  const inlineNames = Object.keys(body.frames);
  const frames = [...inlineNames, ...files.filter((f) => !inlineNames.includes(f))];
  const views = useFrameViews(agentId, d.frame?.path ?? null, d.frame ? body.frames[d.frame.path] : undefined);

  // This screen's OWN variables belong in scope here, and come FIRST — a state on a screen that
  // declares locals is usually keyed on one of them. They were missing entirely until now, which
  // left an authored `when` naming a local with nothing to select in the dropdown, so the row
  // rendered blank and the state read as a catch-all it was not.
  const allDims = [...screen.localOrder, ...body.dimensionOrder, ...body.derived.map((x) => x.name)];
  const domainOf = (dim: string): DimValue[] =>
    screen.locals[dim] ?? body.dimensions[dim] ?? body.derived.find((x) => x.name === dim)?.values ?? [];

  const clauseCount =
    d.when === "*" || typeof d.when !== "object" ? 0 : Object.keys(d.when as Record<string, unknown>).length;

  // A state placed after a catch-all can never be selected. Saying so here is cheaper than the
  // coverage report telling you later that you authored something unreachable.
  const catchAllBefore = screen.variants.findIndex(
    (v, i) => i < (index < 0 ? screen.variants.length : index)
      && (v.when === "*" || (typeof v.when === "object" && !Object.keys(v.when).length)),
  );
  const shadowed = catchAllBefore >= 0 && clauseCount > 0;

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length || !agentId || !path) return;
    setBusy(true); setError(null);
    try {
      const added: string[] = [];
      for (const file of Array.from(files)) {
        const { key } = await uploadDirectoryAsset(agentId, path, file, file.name);
        added.push(key);
        onAssetAdded?.(key);
      }
      setD((cur) => ({ ...cur, screenshots: [...cur.screenshots, ...added] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const framePath = d.frame?.path ?? "";
  const frameOptions = framePath && !frames.includes(framePath) ? [framePath, ...frames] : frames;
  const viewValue = d.frame?.view ?? "";
  const viewKnown = !viewValue || views.some((v) => v.id === viewValue || v.name === viewValue);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700, pb: 1 }}>
        {screenLevel ? "Edit screen" : index < 0 ? "Add a state" : "Edit state"}
        <Typography sx={{ fontSize: 13, color: MUTED, fontWeight: 400 }}>{screen.title}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          Name
        </Typography>
        <TextField
          fullWidth size="small" autoFocus value={d.label}
          onChange={(e) => setD({ ...d, label: e.target.value })}
          sx={{ mt: 0.5, mb: 1.5 }}
        />

        {screenLevel ? (
          <Typography sx={{ fontSize: 13, color: MUTED, mb: 1 }}>
            This screen has one rendering, so there is nothing to condition on. Add a state to make
            it render differently under different parameters.
          </Typography>
        ) : (
        <>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          Shown when
        </Typography>
        <Typography sx={{ fontSize: 13, color: MUTED, mb: 0.5 }}>
          All of these must hold. Leave it empty for a catch-all that always matches.
        </Typography>
        <FlowConditionEditor
          when={d.when}
          onChange={(next) => setD({ ...d, when: next })}
          dims={allDims}
          domainOf={domainOf}
          noteFor={(dim) => (screen.locals[dim] ? "(this screen)" : "")}
          emptyLabel="always — this is the catch-all"
        />
        {shadowed && (
          <Typography sx={{ fontSize: 13, color: WARN, mt: 0.75 }}>
            An earlier state on this screen already matches everything, so this one would never show.
            Move it above that catch-all after saving.
          </Typography>
        )}
        </>
        )}

        <Typography variant="caption" sx={{ display: "block", mt: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          Frame
        </Typography>
        <Typography sx={{ fontSize: 13, color: MUTED, mb: 0.75 }}>
          A <code>.frame</code> kept inside this flow or beside it, drawn live at one of its views — the states of a
          screen usually point at different views of the same frame. Its scroll is its own, so no captures to step through.
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField select fullWidth size="small" label="Frame" value={framePath}
            onChange={(e) => setD({ ...d, frame: e.target.value ? { path: e.target.value, view: null } : null })}
            SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
            <MenuItem value=""><em>none</em></MenuItem>
            {frameOptions.map((f) => <MenuItem key={f} value={f} sx={{ fontSize: 12 }}>{inlineNames.includes(f) ? `${f} (in this flow)` : f}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="View" value={viewValue} disabled={!d.frame}
            onChange={(e) => setD({ ...d, frame: d.frame ? { ...d.frame, view: e.target.value || null } : null })}
            SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} sx={{ width: 170, flexShrink: 0 }}>
            <MenuItem value="">Base</MenuItem>
            {views.map((v) => <MenuItem key={v.id} value={v.id} sx={{ fontSize: 12 }}>{v.name}</MenuItem>)}
            {!viewKnown && <MenuItem value={viewValue} sx={{ fontSize: 12 }}>{viewValue} (not in this frame)</MenuItem>}
          </TextField>
        </Box>
        {agentId && frames.length === 0 && !framePath && (
          <Typography sx={{ fontSize: 13, color: MUTED, mt: 0.5 }}>
            No <code>.frame</code> beside this flow yet — draw one in the Studio in the same folder.
          </Typography>
        )}

        <Typography variant="caption" sx={{ display: "block", mt: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          Screenshots
        </Typography>
        <Typography sx={{ fontSize: 13, color: MUTED, mb: 0.5 }}>
          In scroll order, top to bottom — several for a screen taller than the viewport.
          {d.screenshots.length > 1 && " Drag to reorder."}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.6, flexWrap: "wrap", alignItems: "center" }}>
          {d.screenshots.map((k, i) => (
            <Box
              key={`${k}-${i}`}
              draggable
              onDragStart={(e) => {
                setDragShot(i);
                e.dataTransfer.effectAllowed = "move";
                try { e.dataTransfer.setData("text/plain", String(i)); } catch { /* some browsers */ }
              }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragShot !== null && dragShot !== i) {
                  const next = [...d.screenshots];
                  next.splice(i, 0, next.splice(dragShot, 1)[0]);
                  setD({ ...d, screenshots: next });
                }
                setDragShot(null);
              }}
              onDragEnd={() => setDragShot(null)}
              sx={{
                position: "relative", width: 52, height: 72, bgcolor: PANE_BG, borderRadius: 0.5,
                overflow: "hidden", border: "2px solid", cursor: "grab", flexShrink: 0,
                borderColor: dragShot !== null && dragShot !== i ? COND : "divider",
                opacity: dragShot === i ? 0.4 : 1,
              }}
            >
              {/* draggable=false so the CONTAINER is the drag source — a natively-draggable <img>
                  hijacks the drag and the reorder never fires. */}
              {urls[k]
                ? <Box component="img" draggable={false} src={urls[k]} alt="" sx={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
                : <Box sx={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}><Typography sx={{ fontSize: 12, color: MUTED }}>…</Typography></Box>}
              <Box sx={{ position: "absolute", top: 0, left: 0, px: 0.4, fontSize: 12, fontWeight: 800, color: "#fff", bgcolor: "rgba(15,23,42,0.75)", borderBottomRightRadius: 4 }}>{i + 1}</Box>
              <IconButton
                size="small"
                onClick={() => setD({ ...d, screenshots: d.screenshots.filter((_, j) => j !== i) })}
                sx={{ position: "absolute", top: -3, right: -3, p: 0.2, bgcolor: OVERLAY_BG, color: OVERLAY_FG }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Box>
          ))}
          <input ref={fileInput} type="file" accept="image/*" multiple hidden
            onChange={(e) => void onPickFiles(e.target.files)} />
          <Tooltip title={agentId && path ? "Add a screenshot" : "Screenshots need a saved file"}>
            <span>
              <IconButton size="small" disabled={busy || !agentId || !path} onClick={() => fileInput.current?.click()}>
                {busy ? <CircularProgress size={16} /> : <AddPhotoAlternateOutlinedIcon sx={{ fontSize: 20 }} />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        <Typography variant="caption" sx={{ display: "block", mt: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          Note
        </Typography>
        <TextField
          fullWidth size="small" multiline minRows={2} value={d.description}
          placeholder="What is different about this state — a requirement id, a copy decision…"
          onChange={(e) => setD({ ...d, description: e.target.value })}
          sx={{ mt: 0.5 }}
        />
        {error && <Typography sx={{ fontSize: 13, color: "#ef4444", mt: 1 }}>{error}</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1 }}>
        {onDelete && index >= 0 && !screenLevel && (
          <Button size="small" onClick={onDelete} sx={{ color: "#ef4444", mr: "auto", textTransform: "none" }}>
            Delete state
          </Button>
        )}
        <Button size="small" onClick={onClose} sx={{ textTransform: "none", color: MUTED }}>Cancel</Button>
        <Button
          size="small" variant="contained" disabled={!d.label.trim()}
          onClick={() => onSave({ ...d, label: d.label.trim() })}
          sx={{ textTransform: "none", bgcolor: ACTION_BG, color: ACTION_FG, "&:hover": { bgcolor: ACTION_BG_HOVER } }}
        >
          {index < 0 ? "Add" : "Save"}
        </Button>
      </DialogActions>
      {void AddIcon}
    </Dialog>
  );
}
