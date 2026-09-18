/**
 * THE FRAME EDITOR — the `.frame` kind's authoring surface, mounted by the
 * Studio (registry `Editor`) and reusable by any host that writes: layers on
 * the left, the canvas in the middle with the view tabs and zoom above it,
 * the inspector or the Ask panel on the right. The document is the single
 * source of truth — every edit is a pure function over the parsed doc
 * (lib/frameEdit), dumped back to YAML and handed to the host through
 * `onChange`. The YAML itself lives with the host (the Studio's file, VS
 * Code's text editor), so there is no raw pane here. Export renders every
 * view off-screen at 1:1 and writes the
 * handover folder beside the frame through the host's configured writers.
 */
import * as React from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, SUITE_APPS, cn } from "crosscut";
import { Download, Grid2x2, Layers, Loader2, MessageSquare, Minus, Plus, Scan } from "lucide-react";
import type { KindEditorProps } from "../../lib/filePreviews";
import {
  FRAME_NODE_KINDS, type FrameBody, type FrameDoc, type FrameView, createFrameVersion, dumpFrame, frameOf, frameProblems, frameSnapshotAt, hiddenIn,
  nodeById, parseFrame, viewById,
} from "../../lib/frameDoc";
import {
  addNode, addView, canHoldChildren, deleteView, duplicateNode, indentNode, moveNode, moveView, outdentNode,
  removeNode, renameView, toggleHidden,
} from "../../lib/frameEdit";
import { type HandoverResult, exportHandover } from "../../lib/frameHandover";
import FrameAsk from "./FrameAsk";
import FrameCanvas from "./FrameCanvas";
import FrameInspector from "./FrameInspector";
import { FrameLayerTree } from "./FrameViewer";

const ZOOMS = [0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2];

/** One view mounted off-screen at 1:1; reports its canvas element once it
 *  has painted and its images (and any embedded frames' images) loaded. */
function HiddenRender({ body, view, docPath, onReady }: { body: FrameBody; view: FrameView | null; docPath: string; onReady: (el: HTMLElement) => void }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    if (!el) return;
    const settle = (i: HTMLImageElement) => (i.complete ? Promise.resolve() : new Promise<void>((r) => { i.onload = () => r(); i.onerror = () => r(); }));
    void (async () => {
      // A timer, not an animation frame: frames pause in a hidden tab and an
      // export started just before switching away would never finish.
      await new Promise((r) => setTimeout(r, 60));
      await Promise.all(Array.from(el.querySelectorAll("img")).map(settle));
      // Embedded frames arrive asynchronously — a beat, then their images too.
      await new Promise((r) => setTimeout(r, 300));
      await Promise.all(Array.from(el.querySelectorAll("img")).map(settle));
      if (!cancelled && el.firstElementChild) onReady(el.firstElementChild as HTMLElement);
    })();
    return () => { cancelled = true; };
  }, [body, view, docPath, onReady]);
  return (
    <div ref={ref} aria-hidden style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}>
      <FrameCanvas body={body} view={view} docPath={docPath} scale={1} />
    </div>
  );
}

export default function FrameEditor({ content, onChange, docPath }: KindEditorProps) {
  const doc = React.useMemo(() => parseFrame(content), [content]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [viewId, setViewId] = React.useState<string | null>(null);
  const [outlines, setOutlines] = React.useState(true);
  const [layers, setLayers] = React.useState(true);
  const [zoom, setZoom] = React.useState<number | "fit">("fit");
  const [versionSel, setVersionSel] = React.useState("");
  const [side, setSide] = React.useState<"inspect" | "ask">("inspect");
  const [askFocus, setAskFocus] = React.useState(0);
  const [exporting, setExporting] = React.useState<string | null>(null);
  const [exportResult, setExportResult] = React.useState<HandoverResult | { error: string } | null>(null);
  const [renderJob, setRenderJob] = React.useState<{ view: FrameView | null; resolve: (el: HTMLElement) => void } | null>(null);
  const areaRef = React.useRef<HTMLDivElement | null>(null);
  const [areaW, setAreaW] = React.useState(800);

  React.useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setAreaW((w) => (Math.abs(w - el.clientWidth) > 2 ? el.clientWidth : w));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => { setSelectedId(null); setViewId(null); setVersionSel(""); }, [docPath]);

  // Ctrl+K: the Ask box, from anywhere in the editor.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSide("ask"); setAskFocus((k) => k + 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commit = React.useCallback((next: FrameDoc) => onChange(dumpFrame(next)), [onChange]);
  const body = versionSel ? frameSnapshotAt(doc, versionSel) : doc;
  const readOnly = !!versionSel;
  const view = viewById(body, viewId) ?? null;
  const hidden = React.useMemo(() => hiddenIn(body, view), [body, view]);
  const frame = frameOf(body);
  const fit = frame ? Math.min(1, Math.max(0.05, (areaW - 48) / Math.max(1, frame.width))) : 1;
  const scale = zoom === "fit" ? fit : zoom;
  const problems = React.useMemo(() => frameProblems(doc), [doc]);
  const stepZoom = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOMS.find((z) => z > scale + 0.001) : [...ZOOMS].reverse().find((z) => z < scale - 0.001);
    if (next) setZoom(next);
  };

  const selected = selectedId ? nodeById(doc, selectedId) : undefined;
  const addTarget = selected && canHoldChildren(selected.kind) ? selected.id : selected?.parent ?? null;

  const actions = {
    remove: (id: string) => commit(removeNode(doc, id)),
    duplicate: (id: string) => { const r = duplicateNode(doc, id); commit(r.doc); setSelectedId(r.id); },
    move: (id: string, dir: -1 | 1) => commit(moveNode(doc, id, dir)),
    indent: (id: string) => commit(indentNode(doc, id)),
    outdent: (id: string) => commit(outdentNode(doc, id)),
    toggleHidden: (id: string) => { if (viewId) commit(toggleHidden(doc, viewId, id)); },
  };

  const add = (kind: string) => {
    const r = addNode(doc, addTarget, kind);
    commit(r.doc);
    setSelectedId(r.id);
  };

  const newView = () => {
    const name = window.prompt("Name the view (a UI state: Empty, Loading, Error…)", `View ${doc.views.length + 1}`);
    if (!name) return;
    const r = addView(doc, name);
    commit(r.doc);
    setViewId(r.id);
  };

  const newVersion = () => {
    const name = window.prompt("Name for the NEW working version", `v${doc.versions.length + 2}`);
    if (!name) return;
    const current = doc.versionName ?? window.prompt("Name for the version being snapshotted", `v${doc.versions.length + 1}`) ?? undefined;
    commit(createFrameVersion(doc, name, current ?? undefined));
  };

  // Export: each view mounts off-screen through HiddenRender and resolves the
  // pending job with its element; the exporter rasterises and writes.
  const renderView = React.useCallback((v: FrameView | null) => new Promise<HTMLElement>((resolve) => setRenderJob({ view: v, resolve })), []);
  const runExport = React.useCallback(async () => {
    if (exporting) return;
    setExporting("Starting…");
    try {
      setExportResult(await exportHandover(doc, docPath, { render: renderView, onProgress: setExporting }));
    } catch (e) {
      setExportResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setExporting(null);
      setRenderJob(null);
    }
  }, [doc, docPath, exporting, renderView]);

  const keyHandler = (e: React.KeyboardEvent) => {
    if (!selectedId) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); actions.remove(selectedId); setSelectedId(null); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); actions.duplicate(selectedId); }
    if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); actions.move(selectedId, -1); }
    if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); actions.move(selectedId, 1); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" onKeyDown={keyHandler} tabIndex={-1}>
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-card px-2 py-1">
        <Button size="sm" variant={layers ? "secondary" : "ghost"} onClick={() => setLayers((v) => !v)} title="Layers"><Layers /> Layers</Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" variant={viewId === null ? "default" : "outline"} onClick={() => setViewId(null)}>Base</Button>
        {body.views.map((v) => (
          <span key={v.id} className="inline-flex items-center">
            <Button size="sm" variant={viewId === v.id ? "default" : "outline"} onClick={() => setViewId(v.id)}
              onDoubleClick={() => { if (readOnly) return; const n = window.prompt("Rename view", v.name); if (n) commit(renameView(doc, v.id, n)); }}
              title="Double-click to rename">
              {v.name}
            </Button>
          </span>
        ))}
        {!readOnly && <Button size="sm" variant="ghost" onClick={newView} title="Add a view (a UI state)"><Plus /> view</Button>}
        {viewId && !readOnly && (
          <>
            <Button size="icon" variant="ghost" title="Move view left" onClick={() => commit(moveView(doc, viewId, -1))}>‹</Button>
            <Button size="icon" variant="ghost" title="Move view right" onClick={() => commit(moveView(doc, viewId, 1))}>›</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm("Delete this view?")) { commit(deleteView(doc, viewId)); setViewId(null); } }}>delete view</Button>
          </>
        )}
        <span className="flex-1" />
        {problems.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[13px] text-amber-900" title={problems.join("\n")}>
            {problems.length} problem{problems.length === 1 ? "" : "s"}
          </span>
        )}
        {(doc.versions.length > 0 || doc.versionName) && (
          <select value={versionSel} onChange={(e) => setVersionSel(e.target.value)} className="h-7 rounded-md border bg-background px-1.5 text-[13px]">
            <option value="">{doc.versionName ? `${doc.versionName} (working)` : "working version"}</option>
            {doc.versions.map((v, i) => <option key={v.name + i} value={v.name}>{v.name}</option>)}
          </select>
        )}
        <Button size="sm" variant="ghost" onClick={newVersion} title="Snapshot the working version and start a new one">+ version</Button>
        <Button size="sm" variant="ghost" disabled={!!exporting} onClick={() => void runExport()}
          title="Export handover — one picture per view beside the YAML, in a folder next to this frame">
          {exporting ? <Loader2 className="animate-spin" /> : <Download />} {exporting ?? "Export"}
        </Button>
        <Button size="sm" variant={side === "ask" ? "secondary" : "ghost"} title="Ask — edit from one line of instruction (Ctrl+K)"
          onClick={() => { setSide("ask"); setAskFocus((k) => k + 1); }}>
          <MessageSquare /> Ask
        </Button>
        <Button size="sm" variant={outlines ? "secondary" : "ghost"} onClick={() => setOutlines((v) => !v)} title="Outline containers"><Grid2x2 /></Button>
        <span className="inline-flex items-center rounded-md border">
          <Button size="icon" variant="ghost" onClick={() => stepZoom(-1)}><Minus /></Button>
          <span className="w-10 text-center text-[13px] tabular-nums">{Math.round(scale * 100)}%</span>
          <Button size="icon" variant="ghost" onClick={() => stepZoom(1)}><Plus /></Button>
          <Button size="icon" variant={zoom === "fit" ? "secondary" : "ghost"} onClick={() => setZoom("fit")} title="Fit"><Scan /></Button>
        </span>
      </div>
      {readOnly && (
        <div className="shrink-0 border-b bg-amber-50 px-3 py-1 text-[13px] text-amber-900">
          Viewing snapshot “{versionSel}” — read-only. Switch back to the working version to edit.
        </div>
      )}
        <div className="flex min-h-0 flex-1">
          {layers && (
            <div className="flex w-[240px] shrink-0 flex-col border-r bg-card">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <FrameLayerTree body={body} hidden={hidden} selectedId={selectedId} onSelect={setSelectedId} />
              </div>
              {!readOnly && (
                <div className="border-t p-2">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Add {addTarget ? `into ${nodeById(doc, addTarget)?.name ?? addTarget}` : "on the frame"}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {FRAME_NODE_KINDS.map((k) => (
                      <button key={k} type="button" onClick={() => add(k)}
                        className={cn("rounded border px-1.5 py-0.5 text-[13px] hover:bg-accent", canHoldChildren(k) && "font-medium")}>
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={areaRef} className="min-w-0 flex-1 overflow-auto p-6" style={{ scrollbarGutter: "stable", background: "#eef0f3 radial-gradient(#d4d7dd 1px, transparent 1px) 0 0 / 16px 16px" }}
            onClick={() => setSelectedId(null)}>
            <div onClick={(e) => e.stopPropagation()} className="inline-block">
              <FrameCanvas body={body} view={view} docPath={docPath} scale={scale} selectedId={selectedId} onSelect={setSelectedId} outlines={outlines} />
            </div>
          </div>
          <div className="flex w-[320px] shrink-0 flex-col border-l bg-card">
            <div className="flex shrink-0 border-b text-[13px]">
              {(["inspect", "ask"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setSide(s)}
                  className={cn("flex-1 px-2 py-1.5 font-medium", side === s ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {s === "ask" ? "Ask" : "Inspect"}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {readOnly ? (
                <div className="p-3 text-[13px] text-muted-foreground">Snapshots are read-only.</div>
              ) : side === "ask" ? (
                <FrameAsk doc={doc} content={content} docPath={docPath} viewId={viewId} selectedId={selectedId} focusKey={askFocus}
                  onDoc={commit} onRestore={onChange} onSelect={setSelectedId} onView={setViewId} />
              ) : (
                <FrameInspector doc={doc} docPath={docPath} selectedId={selectedId} viewId={viewId} onDoc={commit} onSelect={setSelectedId} actions={actions} />
              )}
            </div>
          </div>
        </div>
      <Dialog open={!!exportResult} onOpenChange={(o) => { if (!o) setExportResult(null); }}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogTitle>{exportResult && "error" in exportResult ? "Export failed" : "Handover exported"}</DialogTitle>
          <DialogDescription>
            {exportResult && "error" in exportResult ? "Nothing was left half-written; fix the cause and export again." : "One picture per view beside the YAML, in a folder next to this frame."}
          </DialogDescription>
          {exportResult && "error" in exportResult && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[12px] text-destructive">{exportResult.error}</div>
          )}
          {exportResult && !("error" in exportResult) && (
            <div className="flex flex-col gap-2 text-[12px]">
              <code className="rounded bg-muted px-2 py-1 text-[13px]">nodes:{exportResult.folder}</code>
              <ul className="list-disc pl-5 text-[13px] text-muted-foreground">
                {exportResult.files.map((f) => <li key={f.path}>{f.name}</li>)}
              </ul>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => window.open(`${SUITE_APPS.nodes.origin}/?path=${encodeURIComponent(exportResult.folder)}`, "_blank")}>Open in Nodes</Button>
                <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(`nodes:${exportResult.folder}`)}>Copy handle</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {renderJob && <HiddenRender body={doc} view={renderJob.view} docPath={docPath} onReady={renderJob.resolve} />}
    </div>
  );
}
