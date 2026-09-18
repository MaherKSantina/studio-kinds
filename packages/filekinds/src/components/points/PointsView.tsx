/**
 * The `.points` preview — THE WHOLE CHAIN IN ONE CONTEXT.
 *
 * The PaneTrail's positions ARE the pipeline's stages: Literature (the
 * collated inputs), Distillation (the intermediate files the literature
 * passed through), Points (stable identities with sourced keys), then the
 * selected point's stream and any opened file drawn by its own kind. Moving
 * forward collapses the previous stage to its rail, exactly like every other
 * drill in the suite — one flat trail, one centered seek.
 *
 * Selection connects the stages: a literature or distillation row says how
 * many keys it feeds (the citations run backward); a point opens its stream;
 * every citation opens its file.
 */
import { useEffect, useMemo, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { Dialog, DialogContent, DialogDescription, DialogTitle, EventRow, OneDList, PaneTrail, resolveRef, type TrailPane } from "crosscut";
import {
  LiteratureEntry, Point, PointsDoc, StageNodeRef, StreamConnection, StreamStage, allShelfEntries,
  connectionsAt, definitionOf, parsePoints, roleOf, stageEntries, usesOfFile,
} from "../../lib/pointsDoc";
import { parsePlaybook, type PlaybookDoc } from "../../lib/playbookDoc";
import ElementView from "../playbook/ElementView";
import { readVirtualDirectoryFile } from "../../api";
import { parseDocList } from "../../lib/listDoc";
import { extensionOfPath, type ViewerProps } from "../../lib/filePreviews";
import FileContentDialog, { FileContentBody } from "./FileContentDialog";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import PointStream, { KeyRows, RoleChip, TypeChip } from "./PointStream";

const MONO = { fontFamily: "ui-monospace, monospace" } as const;

const STREAM_HUE = "#4f46e5";

/** The visible edges to OTHER streams — a chip per connection on the stage
 *  header; clicking opens that stream's full preview as a dialog on top. */
function ConnectionChips({ list, prevStage, onOpen }: {
  list: StreamConnection[];
  prevStage?: string;
  onOpen: (c: StreamConnection) => void;
}) {
  if (!list.length) return null;
  const text = (c: StreamConnection) =>
    c.role === "source" ? `output of: ${c.label ?? c.stream}`
    : c.role === "via" ? `${prevStage ? `from ${prevStage} ` : ""}via: ${c.label ?? c.stream}`
    : `feeds: ${c.label ?? c.stream}`;
  return (
    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}>
      {list.map((c, i) => (
        <Chip key={i} size="small"
          label={(c.role === "feeds" ? "" : "⟵ ") + text(c) + (c.role === "feeds" ? " ⟶" : "")}
          onClick={() => onOpen(c)}
          sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                bgcolor: `${STREAM_HUE}14`, color: STREAM_HUE,
                border: "1px solid", borderColor: `${STREAM_HUE}55`,
                "&:hover": { bgcolor: `${STREAM_HUE}26` } }} />
      ))}
    </Stack>
  );
}

/**
 * One stage of the PARENT stream, rendered inside a substream's trail as its
 * input or output boundary — opening a connected stream always shows where it
 * starts from and where it lands. Self-contained: parent files open in this
 * pane's own content dialog, against the parent's base.
 */
function BoundaryPane({ doc, base, stage, side }: {
  doc: PointsDoc;
  base: string;
  stage: StreamStage;
  side: "input" | "output";
}) {
  const [file, setFile] = useState<string | null>(null);
  // Anchored at the BOTTOM (not above the header) so the boundary pane's
  // title lines up with every other stage title on the trail.
  const strip = (
    <Box sx={{ flexShrink: 0, px: 1.5, py: 0.4, bgcolor: `${STREAM_HUE}12`, borderTop: "1px solid", borderColor: `${STREAM_HUE}44` }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: STREAM_HUE }}>
        {side === "input" ? "input — " : "output — "}{doc.title}
      </Typography>
    </Box>
  );
  if (stage.kind === "shelf") {
    return (
      <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ShelfPane title={stage.label} hint={stage.hint ?? ""}
            entries={stageEntries(doc, stage)} doc={doc} selectedFile={file}
            onOpen={(f) => setFile(f)} empty="Nothing here." baseForBody={base} />
        </Box>
        {strip}
        <FileContentDialog base={base} file={file}
          label={stageEntries(doc, stage).find((l) => l.file === file)?.label}
          open={!!file} onClose={() => setFile(null)} />
      </Box>
    );
  }
  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{stage.label}</Typography>
        {stage.hint && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{stage.hint}</Typography>}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.25 }}>
        {doc.points.map((pt) => (
          <BoundaryPointRow key={pt.id} doc={doc} pt={pt} />
        ))}
        {!doc.points.length && (
          <Typography sx={{ fontSize: 13, color: "text.disabled", fontStyle: "italic" }}>No points yet.</Typography>
        )}
      </Box>
      {strip}
    </Box>
  );
}

function BoundaryPointRow({ doc, pt }: { doc: PointsDoc; pt: Point }) {
  const [open, setOpen] = useState(false);
  return (
    <EventRow
      label={pt.label ?? pt.id}
      meta={pt.keys.length ? `${pt.keys.length} key${pt.keys.length === 1 ? "" : "s"}` : "identity only"}
      badge={
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <TypeChip type={pt.type} />
          <RoleChip doc={doc} p={pt} />
        </span>
      }
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <Box sx={{ borderTop: "1px solid", borderColor: "divider", p: 1 }}>
        <KeyRows p={pt} />
      </Box>
    </EventRow>
  );
}

/** Another stream, whole, in a dialog OVER this one. It renders the same
 *  PointsView, so its own connections open further dialogs — streams chain by
 *  stacking, never by merging into one long trail. */
function StreamDialog({ base, parentDoc, connection, onClose }: {
  base: string;
  /** The stream the connection was clicked IN — its stages become the opened
   *  stream's visible input/output boundaries. */
  parentDoc: PointsDoc;
  connection: StreamConnection | null;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const file = connection?.stream ?? null;
  useEffect(() => {
    if (!file) return;
    let live = true;
    setContent(null); setErr(null);
    readVirtualDirectoryFile(base, file).then(
      (r) => { if (live) setContent(r.content); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [base, file]);
  if (!connection || !file) return null;
  const abs = resolveRef(base, file);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[86dvh] flex-col gap-0 p-0 sm:max-w-[88vw]" showCloseButton>
        <DialogTitle className="sr-only">{connection.label ?? file}</DialogTitle>
        <DialogDescription className="sr-only">The connected stream {file}</DialogDescription>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 2, py: 1.25,
                 borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
          <Chip size="small" label="stream"
                sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                      bgcolor: `${STREAM_HUE}14`, color: STREAM_HUE }} />
          <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{connection.label ?? file}</Typography>
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: "text.disabled", pr: 3 }}>{file}</Typography>
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {err ? <Typography sx={{ p: 3, fontSize: 12.5, color: "#dc2626" }}>{err}</Typography>
            : content === null ? <Typography sx={{ p: 3, fontSize: 12.5, color: "text.disabled" }}>Loading…</Typography>
              : (() => {
                  // The connection decides which PARENT stages frame the
                  // substream: `via` runs FROM the previous stage INTO this
                  // one, `source` PRODUCES this stage, `feeds` CONSUMES it.
                  const idx = parentDoc.stages.findIndex((st) => st.key === connection.at);
                  const atStage = idx >= 0 ? parentDoc.stages[idx] : undefined;
                  const prevStage = idx > 0 ? parentDoc.stages[idx - 1] : undefined;
                  const bp = (stage: StreamStage | undefined, side: "input" | "output", key: string): TrailPane[] =>
                    stage ? [{
                      key,
                      title: `${parentDoc.title} · ${stage.label}`,
                      render: <BoundaryPane doc={parentDoc} base={base} stage={stage} side={side} />,
                    }] : [];
                  const before = connection.role === "via" ? bp(prevStage, "input", "in")
                    : connection.role === "feeds" ? bp(atStage, "input", "in") : [];
                  const after = connection.role === "via" ? bp(atStage, "output", "out")
                    : connection.role === "source" ? bp(atStage, "output", "out") : [];
                  return <PointsView content={content} height="100%" agentId={abs} path={abs}
                                     beforePanes={before} afterPanes={after} />;
                })()}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

/** Just one policy element out of a referenced node — the decision with its
 *  answers (or the event), never the whole document. */
function NodeElementBody({ base, nodeRef }: { base: string; nodeRef: StageNodeRef }) {
  const abs = resolveRef(base, nodeRef.node);
  const [doc, setDoc] = useState<PlaybookDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setDoc(null); setErr(null);
    readVirtualDirectoryFile(abs, abs).then(
      (r) => { if (live) setDoc(parsePlaybook(r.content)); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [abs]);
  if (err) return <Typography sx={{ p: 2, fontSize: 13, color: "#dc2626" }}>{err}</Typography>;
  if (doc === null) return <Typography sx={{ p: 2, fontSize: 13, color: "text.disabled" }}>Loading…</Typography>;
  // "decision:<key>" opens the element; "decision:<key>=<value>" narrows
  // to ONE ANSWER of it.
  const [kind, rest] = (nodeRef.element ?? "").split(":");
  const [key, valueKey] = (rest ?? "").split("=");
  return kind === "decision" || kind === "event"
    ? <ElementView doc={doc} kind={kind} elKey={key} valueKey={valueKey || undefined} base={abs} />
    : <Typography sx={{ p: 2, fontSize: 13, color: "#b45309" }}>Unknown element “{nodeRef.element}”.</Typography>;
}

/** One STAGE of a stream, opened as an element (`stage:<key>` addressing) —
 *  the stream dialog FOCUSED on that stage, the way an exported stage opens
 *  from the project hierarchy. */
function StageElementBody({ base, nodeRef }: { base: string; nodeRef: StageNodeRef }) {
  const abs = resolveRef(base, nodeRef.node);
  const [content, setContent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setContent(null); setErr(null);
    readVirtualDirectoryFile(abs, abs).then(
      (r) => { if (live) setContent(r.content); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [abs]);
  if (err) return <Typography sx={{ p: 2, fontSize: 13, color: "#dc2626" }}>{err}</Typography>;
  if (content === null) return <Typography sx={{ p: 2, fontSize: 13, color: "text.disabled" }}>Loading…</Typography>;
  return <PointsView content={content} agentId={abs} path={abs} stage={(nodeRef.element ?? "").slice("stage:".length)} />;
}

/** A referenced input opened from the stage's list — the preview in a dialog.
 *  Exported: the project DAG opens its nodes' content through this too. */
export function NodeRefDialog({ base, nodeRef, onClose }: { base: string; nodeRef: StageNodeRef | null; onClose: () => void }) {
  if (!nodeRef) return null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[82dvh] flex-col gap-0 p-0 sm:max-w-[76vw]" showCloseButton>
        <DialogTitle className="sr-only">{nodeRef.label ?? nodeRef.node}</DialogTitle>
        <DialogDescription className="sr-only">Preview of one stage input</DialogDescription>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", px: 2, py: 1.25,
                 borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{nodeRef.label ?? nodeRef.node}</Typography>
          <Chip size="small" label={nodeRef.element ?? extensionOfPath(nodeRef.node) ?? "node"}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#4f46e514", color: "#4f46e5" }} />
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: "text.disabled", pr: 3 }}>{nodeRef.node}</Typography>
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", bgcolor: "#fff" }}>
          {nodeRef.element?.startsWith("stage:")
            ? <StageElementBody base={base} nodeRef={nodeRef} />
            : nodeRef.element
              ? <NodeElementBody base={base} nodeRef={nodeRef} />
              : <FileContentBody base={base} file={nodeRef.node} />}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function ShelfPane({ title, hint, entries, doc, selectedFile, onOpen, empty, chips, baseForBody, nodes }: {
  title: string;
  hint: string;
  entries: LiteratureEntry[];
  doc: ReturnType<typeof parsePoints>;
  selectedFile: string | null;
  onOpen: (file: string) => void;
  empty: string;
  chips?: React.ReactNode;
  /** The referencing document's abs path — a lone item renders INLINE against
   *  this base; without it the pane falls back to the list. */
  baseForBody?: string | null;
  /** NODE REFERENCES this stage views. One: a `.list` node feeds the
   *  entries, an element ref shows just that element, anything else renders
   *  whole. Several: the stage lists its inputs, each previewing in a
   *  dialog. Written by the streams that target them; read-only here. */
  nodes?: StageNodeRef[];
}) {
  const refs = nodes ?? [];
  const loneRef = refs.length === 1 ? refs[0] : null;
  const manyRefs = refs.length > 1;
  const node = loneRef && !loneRef.element ? loneRef.node : undefined;
  // Which input from the list is open in the preview dialog.
  const [openRef, setOpenRef] = useState<StageNodeRef | null>(null);
  // A referenced node: a `.list` node feeds the entries live (resolved
  // relative to the LIST file so its refs stay portable); any other node
  // becomes the stage's single document.
  const isListNode = !!node && extensionOfPath(node) === "list";
  const [sourced, setSourced] = useState<LiteratureEntry[] | null>(null);
  useEffect(() => {
    if (!isListNode || baseForBody === undefined || baseForBody === null) { setSourced(null); return; }
    let live = true;
    readVirtualDirectoryFile(baseForBody, node!).then(
      (r) => {
        if (!live) return;
        const listAbs = resolveRef(baseForBody, node!);
        const listDoc = parseDocList(r.content);
        setSourced(listDoc.items.filter((i) => i.file).map((i) => ({
          file: resolveRef(listAbs, i.file!), ...(i.label ? { label: i.label } : {}),
        })));
      },
      () => { if (live) setSourced([]); },
    );
    return () => { live = false; };
  }, [isListNode, node, baseForBody]);
  const shown: LiteratureEntry[] = manyRefs
    ? []
    : loneRef
      ? (isListNode ? (sourced ?? []) : [{ file: loneRef.node, ...(loneRef.label ? { label: loneRef.label } : {}) }])
      : entries;

  // A lone-item document's drill-down (a brief section, a guide step) stays
  // INSIDE this pane — same seek position, the detail replacing the document
  // with a back button, never a new dot on the trail.
  const [drill, setDrill] = useState<{ key: string; title: string; render: () => React.ReactNode } | null>(null);
  const loneFile = shown.length === 1 ? shown[0].file : null;
  useEffect(() => { setDrill(null); }, [loneFile]);
  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* ONE item = the stage IS the document: a SINGLE consolidated header
          (title, file chips, path, hint) and the content filling the pane.
          Several items = the generic header + the list, each row opening
          whole in the dialog. */}
      {shown.length === 1 && baseForBody !== undefined ? (
        <>
          <Box sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{title}</Typography>
              <Chip size="small" label={extensionOfPath(shown[0].file) || "file"}
                    sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                          bgcolor: "#0f172a0d", color: "text.secondary" }} />
              {(() => { const u = usesOfFile(doc, shown[0].file); return u.keys ? (
                <Chip size="small" label={`feeds ${u.keys} key${u.keys === 1 ? "" : "s"} · ${u.points} point${u.points === 1 ? "" : "s"}`}
                      sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#0e74901a", color: "#0e7490" }} />
              ) : null; })()}
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>{shown[0].file}</Typography>
              <Box component="button" title="Open properly, full size" onClick={() => onOpen(shown[0].file)}
                   sx={{ display: "inline-flex", p: 0.4, border: "none", bgcolor: "transparent",
                         cursor: "pointer", color: "#4f46e5", borderRadius: 1, "&:hover": { bgcolor: "#4f46e514" } }}>
                <OpenInFullIcon sx={{ fontSize: 14 }} />
              </Box>
            </Stack>
            {hint && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{hint}</Typography>}
            {loneRef && (
              <Chip size="small"
                    label={`node · ${loneRef.node}${loneRef.element ? ` · ${loneRef.element}` : ""}`}
                    onClick={() => onOpen(loneRef.node)}
                    title="A shared node — written by the streams that target it; read-only here"
                    sx={{ mt: 0.4, height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          bgcolor: "#4f46e514", color: "#4f46e5", border: "1px solid", borderColor: "#4f46e555" }} />
            )}
            {chips}
          </Box>
          {drill && (
            <Stack direction="row" spacing={0.75}
                   sx={{ alignItems: "center", px: 1, py: 0.5, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
              <Chip size="small" label="‹ back" onClick={() => setDrill(null)}
                    sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          bgcolor: "transparent", border: "1px solid", borderColor: "#c3c9d2",
                          "&:hover": { bgcolor: "#0f172a0a" } }} />
              <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{drill.title}</Typography>
            </Stack>
          )}
          <Box sx={{ flex: 1, minHeight: 0, overflow: extensionOfPath(shown[0].file) === "pdf" ? "hidden" : "auto", bgcolor: "#fff",
                     display: drill ? "none" : "block" }}>
            {!baseForBody
              ? <Typography sx={{ p: 2, fontSize: 13, color: "text.disabled" }}>No document base to read from.</Typography>
              : loneRef?.element
                ? <NodeElementBody base={baseForBody} nodeRef={loneRef} />
                : <FileContentBody base={baseForBody} file={shown[0].file} onDrill={setDrill} />}
          </Box>
          {drill && (
            <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", bgcolor: "#fff" }}>
              {drill.render()}
            </Box>
          )}
        </>
      ) : (<>
      <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{hint}</Typography>
        {loneRef && (
          <Chip size="small"
                label={`node · ${loneRef.node}${loneRef.element ? ` · ${loneRef.element}` : ""}`}
                onClick={() => onOpen(loneRef.node)}
                title="A shared node — written by the streams that target it; read-only here"
                sx={{ mt: 0.4, height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      bgcolor: "#4f46e514", color: "#4f46e5", border: "1px solid", borderColor: "#4f46e555" }} />
        )}
        {manyRefs && (
          <Chip size="small" label={`${refs.length} inputs`}
                title="Multiple inputs feed this stage — click a row to preview it"
                sx={{ mt: 0.4, height: 20, fontSize: 12, fontWeight: 700,
                      bgcolor: "#4f46e514", color: "#4f46e5", border: "1px solid", borderColor: "#4f46e555" }} />
        )}
        {chips}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.25 }}>
        {manyRefs && refs.map((ref, i) => (
          <EventRow key={`${ref.node}|${ref.element ?? ""}`}
            label={ref.label ?? ref.node}
            leading={<span style={{ fontSize: 12, fontWeight: 700, width: 18, display: "inline-block", textAlign: "right" }} className="text-muted-foreground">{i + 1}.</span>}
            badge={
              <Chip size="small" label={ref.element ?? (extensionOfPath(ref.node) || "node")}
                    sx={{ height: 20, fontSize: 12, fontWeight: 700,
                          bgcolor: "#4f46e514", color: "#4f46e5" }} />
            }
            subtitle={<Typography component="span" sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>{ref.node}</Typography>}
            open={false}
            onToggle={() => setOpenRef(ref)}
          />
        ))}
        {!manyRefs && shown.length === 0 && (
          <Typography sx={{ fontSize: 13, color: "text.disabled", fontStyle: "italic" }}>{empty}</Typography>
        )}
        {!manyRefs && shown.map((l) => {
          const uses = usesOfFile(doc, l.file);
          return (
            <EventRow key={l.file}
              label={l.label ?? l.file}
              meta={uses.keys ? `feeds ${uses.keys} key${uses.keys === 1 ? "" : "s"} on ${uses.points} point${uses.points === 1 ? "" : "s"}` : "not cited yet"}
              badge={
                <Chip size="small" label={extensionOfPath(l.file) || "file"}
                      sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                            bgcolor: "#0f172a0d", color: "text.secondary" }} />
              }
              subtitle={<Typography component="span" sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>{l.file}</Typography>}
              open={selectedFile === l.file}
              onToggle={() => onOpen(l.file)}
            />
          );
        })}
      </Box>
      </>)}
      {baseForBody && (
        <NodeRefDialog base={baseForBody} nodeRef={openRef} onClose={() => setOpenRef(null)} />
      )}
    </Box>
  );
}

export default function PointsView({ content, height = "100%", agentId, beforePanes, afterPanes, stage }: ViewerProps & {
  /** Boundary stages injected by a StreamDialog: where this stream starts
   *  from (the parent stage feeding it) and where it lands (the stage it
   *  produces). They render as first/last positions of the trail. */
  beforePanes?: TrailPane[];
  afterPanes?: TrailPane[];
  /** Render ONE stage only (by key) — how an EXPORTED stage appears when a
   *  project hierarchy opens it on its own. Selection panes (a point's
   *  stream, file dialogs) still work; the other stages simply are not here. */
  stage?: string;
}) {
  const doc = useMemo(() => parsePoints(content), [content]);
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [openConn, setOpenConn] = useState<StreamConnection | null>(null);

  // Instances sort under their definition; the list reads as the hierarchy.
  const ordered = useMemo(() => {
    const defs = doc.points.filter((p) => roleOf(p).role === "definition");
    const out: Point[] = [];
    const placed = new Set<string>();
    for (const d of defs) {
      if (placed.has(d.id)) continue;
      out.push(d); placed.add(d.id);
      for (const i of doc.points.filter((p) => p.of === d.id)) {
        if (!placed.has(i.id)) { out.push(i); placed.add(i.id); }
      }
    }
    for (const p of doc.points) if (!placed.has(p.id)) out.push(p);
    return out;
  }, [doc]);

  // Opening a file shows its FULL content in a dialog over the trail — the
  // literature is mostly PDF/DOCX/markdown and each renders whole in there.
  const openFile = (f: string) => setFile(f);

  const pointsPane = (st: { label: string; hint?: string }, pointsChips: React.ReactNode) => (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{st.label}</Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {st.hint ?? "Stable identities. Keys are claims with citations; definitions declare slots their instances fill."}
        </Typography>
        {pointsChips}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.25 }}>
        <OneDList
          items={ordered}
          keyOf={(p) => p.id}
          dimension={ordered.some((p) => p.type) ? { of: (p) => p.type ?? "", fallback: "untyped" } : undefined}
          mode="filter"
          search={(p) => `${p.label ?? ""} ${p.id} ${p.keys.map((k) => `${k.key} ${k.value ?? ""}`).join(" ")}`}
          searchPlaceholder="Search points"
          renderItem={(p) => {
            const isInstance = roleOf(p).role === "instance";
            return (
              <Box sx={{ pl: isInstance && definitionOf(doc, p) ? 2 : 0 }}>
                <EventRow
                  label={p.label ?? p.id}
                  meta={p.keys.length ? `${p.keys.length} key${p.keys.length === 1 ? "" : "s"}` : "identity only"}
                  badge={
                    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                      <TypeChip type={p.type} />
                      <RoleChip doc={doc} p={p} />
                    </span>
                  }
                  subtitle={<Typography component="span" sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>{p.id}</Typography>}
                  open={selected === p.id}
                  onToggle={() => setSelected(selected === p.id ? null : p.id)}
                />
              </Box>
            );
          }}
          empty={<Typography sx={{ fontSize: 13, color: "text.disabled" }}>No points yet — mint the first the moment something exists.</Typography>}
        />
      </Box>
    </Box>
  );

  // The pipeline as authored: one pane per stage, in stage order. Shelf
  // stages list their files; the points stage renders the points list. The
  // first pane's header carries the stream's own title.
  const shownStages = stage ? doc.stages.filter((st) => st.key === stage) : doc.stages;
  const stagePanes: TrailPane[] = shownStages.map((st, i) => {
    const chips = (
      <ConnectionChips list={connectionsAt(doc, st.key)}
        prevStage={(() => { const ix = doc.stages.findIndex((x) => x.key === st.key); return ix > 0 ? doc.stages[ix - 1].label : undefined; })()} onOpen={setOpenConn} />
    );
    if (st.kind === "points") return { key: `stage:${st.key}`, title: st.label, render: pointsPane(st, chips) };
    return {
      key: `stage:${st.key}`,
      title: st.label,
      render: (
        <ShelfPane
          // A lone-item stage shows the DOCUMENT right below its header, so
          // the stage keeps its own label there — the doc names itself.
          title={!stage && i === 0 && stageEntries(doc, st).length !== 1 ? doc.title : st.label}
          hint={st.hint ?? (!stage && i === 0 && doc.description ? doc.description : "")}
          entries={stageEntries(doc, st)} doc={doc} selectedFile={file} onOpen={openFile}
          baseForBody={agentId ?? null} nodes={st.nodes}
          empty={st.key === "distillation"
            ? "No stages — literature went straight to points, which is allowed."
            : "Nothing here yet."}
          chips={chips} />
      ),
    };
  });

  const panes: TrailPane[] = [
    ...(beforePanes ?? []),
    ...stagePanes,
    ...(selected ? [{
      key: `stream:${selected}`,
      title: doc.points.find((p) => p.id === selected)?.label ?? selected,
      render: (
        <Box sx={{ height: "100%", minHeight: 0, overflow: "auto" }}>
          <PointStream doc={doc} pointId={selected} base={agentId ?? undefined}
                       onOpenFile={openFile}
                       onJumpPoint={(id) => { setSelected(id); setFile(null); }} />
        </Box>
      ),
    }] : []),
    ...(afterPanes ?? []),
  ];

  const fileLabel = file
    ? (allShelfEntries(doc).find((l) => l.file === file)?.label ?? undefined)
    : undefined;
  const fileUses = file ? usesOfFile(doc, file) : null;

  return (
    <Box sx={{ height, minHeight: 0 }}>
      <PaneTrail className="h-full" panes={panes} />
      {agentId && (
        <StreamDialog base={agentId} parentDoc={doc} connection={openConn} onClose={() => setOpenConn(null)} />
      )}
      {agentId && (
        <FileContentDialog base={agentId} file={file} label={fileLabel}
          open={!!file} onClose={() => setFile(null)}
          subtitle={fileUses?.keys ? (
            <Chip size="small" label={`feeds ${fileUses.keys} key${fileUses.keys === 1 ? "" : "s"} · ${fileUses.points} point${fileUses.points === 1 ? "" : "s"}`}
                  sx={{ height: 20, fontSize: 12, bgcolor: "#0e74901a", color: "#0e7490", fontWeight: 700 }} />
          ) : undefined} />
      )}
    </Box>
  );
}
