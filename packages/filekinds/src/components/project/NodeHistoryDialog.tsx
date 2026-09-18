/**
 * THE HISTORY OF A NODE — a dialog listing its recorded versions with ONLY
 * what changed in each (the node's own states, then its file children's).
 * Clicking a change opens the FULL STATE of the node at that version,
 * rendered by its own kind — a second dialog over this one.
 */
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "crosscut";
import { configuredLister, readVirtualDirectoryFile } from "../../api";
import { HistoryEntry, HistoryTarget, gatherNodeHistory } from "../../lib/nodeHistory";
import { GraphDocs, LanedGraph, graphWithVersion, nodeConnections, versionStreamsUnrolled } from "../../lib/projectGraph";
import type { ProjectDoc } from "../../lib/projectDoc";
import { DocumentPreview } from "../DocumentPreview";
import { NodeRefDialog } from "../points/PointsView";

const LINE_CAP = 10;

export interface HistoryRequest {
  title: string;
  targets: HistoryTarget[];
  /** Set for an ELEMENT row (a decision, an event): version states open THIS
   *  element at that version, not the whole backing file. */
  element?: string;
}

/** What a version row's lens button opens: the production graph WITH the
 *  version joined, localized to it — rendered by the host's DAG dialog. */
export interface VersionLens {
  id: string;
  dir: "up" | "down";
  label: string;
  graph: LanedGraph;
  /** The graph is FINAL — render it as-is, no localization. */
  raw?: boolean;
}

export function NodeHistoryDialog({ req, onClose, pinContext, onLens }: {
  req: HistoryRequest | null;
  onClose: () => void;
  /** The project's graph and docs — what grounds the version lens buttons.
   *  Absent, history rows simply carry no lenses. */
  pinContext?: { graph: LanedGraph; doc: ProjectDoc; docs: GraphDocs };
  onLens?: (l: VersionLens) => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [state, setState] = useState<{ entry: HistoryEntry; content: string } | null>(null);
  const [elementState, setElementState] = useState<{ node: string; element: string; label: string } | null>(null);

  useEffect(() => {
    setEntries(null);
    setState(null);
    setElementState(null);
    if (!req) return;
    let live = true;
    const lister = configuredLister();
    if (!lister) { setEntries([]); return; }
    gatherNodeHistory(req.targets, lister, (abs) => readVirtualDirectoryFile(abs, abs).then((r) => r.content))
      .then((es) => { if (live) setEntries(es); }, () => { if (live) setEntries([]); });
    return () => { live = false; };
  }, [req]);

  const files = entries ? [...new Set(entries.map((e) => e.file))] : [];
  const openState = (entry: HistoryEntry) => {
    if (req?.element) {
      setElementState({ node: entry.path, element: req.element, label: `${entry.fileLabel} · ${entry.version}` });
      return;
    }
    void readVirtualDirectoryFile(entry.path, entry.path).then((r) => setState({ entry, content: r.content }));
  };

  /** A snapshot's lens rides the refs that PIN it; the live entry's rides
   *  the ordinary per-node rule, same as its tree row. */
  const lensFor = (e: HistoryEntry) => {
    if (!pinContext || !onLens) return null;
    const label = `${e.fileLabel} · ${e.version}`;
    const open = (dir: "up" | "down") => {
      const g = e.current
        ? pinContext.graph
        : graphWithVersion(pinContext.graph, pinContext.doc, pinContext.docs, e.path, label, dir);
      if (!g) return;
      if (!e.current) {
        // A version's lens resolves to STREAM PIPELINES when streams are what
        // touch it: up = the producing stream's stages ending at its Output;
        // down = the reading stream's stages with the version among the
        // inputs. No stream item box, no version box.
        const unrolled = versionStreamsUnrolled(pinContext.docs, g, e.path, dir);
        if (unrolled) {
          onLens({ id: e.path, dir, label, graph: unrolled, raw: true });
          return;
        }
      }
      onLens({ id: e.current ? e.file : e.path, dir, label, graph: g });
    };
    const conn = e.current
      ? nodeConnections(pinContext.graph, e.file)
      : (() => {
          const g = graphWithVersion(pinContext.graph, pinContext.doc, pinContext.docs, e.path, label);
          return g ? nodeConnections(g, e.path) : { up: false, down: false };
        })();
    if (!conn.up && !conn.down) return null;
    const btn = (dir: "up" | "down", Icon: typeof ArrowDownLeft, title: string) => (
      <button type="button" title={title}
        className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-primary"
        onClick={(ev) => { ev.stopPropagation(); open(dir); }}>
        <Icon className="size-3" />
      </button>
    );
    return (
      <span className="mt-1.5 flex shrink-0 items-center">
        {conn.up && btn("up", ArrowDownLeft, `Who produced “${label}” — the full chain`)}
        {conn.down && btn("down", ArrowUpRight, `What “${label}” feeds — the full chain`)}
      </span>
    );
  };

  const changeLines = (e: HistoryEntry) => {
    const rows = [
      ...e.removed.map((l) => ({ sign: "−", l, cls: "text-destructive" })),
      ...e.added.map((l) => ({ sign: "+", l, cls: "text-success" })),
    ];
    const over = rows.length - LINE_CAP;
    return (
      <span className="mt-0.5 block">
        {rows.slice(0, LINE_CAP).map((r, i) => (
          <span key={i} className={`block truncate font-mono text-xs leading-4 ${r.cls}`}>
            {r.sign} {r.l || "␣"}
          </span>
        ))}
        {over > 0 && (
          <span className="block text-xs text-muted-foreground">… and {over} more changed line{over === 1 ? "" : "s"}</span>
        )}
      </span>
    );
  };

  return (
    <>
      <Dialog open={!!req} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="flex max-h-[80dvh] flex-col gap-0 p-0 sm:max-w-xl" showCloseButton>
          <DialogTitle className="border-b px-4 py-2.5 text-sm font-semibold">
            History of “{req?.title}”
          </DialogTitle>
          <DialogDescription className="sr-only">Recorded versions and only what changed in each</DialogDescription>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {entries === null && <p className="px-2 py-2 text-xs text-muted-foreground">Reading versions…</p>}
            {entries !== null && !entries.length && (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                No recorded versions — nothing here keeps history yet.
              </p>
            )}
            {files.map((f) => {
              const own = entries!.filter((e) => e.file === f);
              return (
                <div key={f} className="mb-2">
                  {files.length > 1 && (
                    <p className="px-2 pb-0.5 pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {own[0].fileLabel}
                    </p>
                  )}
                  {[...own].reverse().map((e) => (
                    <div key={e.path} className="mb-1 flex items-start">
                      <button type="button"
                        className="block min-w-0 flex-1 rounded border border-transparent px-2 py-1.5 text-left hover:border-input hover:bg-accent/50"
                        onClick={() => openState(e)}>
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 truncate text-xs font-semibold">{e.version}</span>
                          {e.current && (
                            <span className="shrink-0 rounded border border-success/50 px-1 text-xs font-semibold text-success">live</span>
                          )}
                          {!e.initial && (e.added.length > 0 || e.removed.length > 0) && (
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                              {e.added.length > 0 && <span className="text-success">+{e.added.length}</span>}
                              {e.added.length > 0 && e.removed.length > 0 && " "}
                              {e.removed.length > 0 && <span className="text-destructive">−{e.removed.length}</span>}
                            </span>
                          )}
                        </span>
                        {e.initial
                          ? <span className="block text-xs text-muted-foreground">First recorded state.</span>
                          : changeLines(e)}
                      </button>
                      {lensFor(e)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      <NodeRefDialog base={elementState?.node ?? "/"} nodeRef={elementState} onClose={() => setElementState(null)} />
      <Dialog open={!!state} onOpenChange={(o) => { if (!o) setState(null); }}>
        <DialogContent className="flex h-[84dvh] flex-col gap-0 p-0 sm:max-w-[80vw]" showCloseButton>
          <DialogTitle className="border-b px-4 py-2.5 text-sm font-semibold">
            {state?.entry.fileLabel} · {state?.entry.version}
          </DialogTitle>
          <DialogDescription className="sr-only">The full state of this node at this version</DialogDescription>
          <div className="min-h-0 flex-1 overflow-hidden">
            {state && <DocumentPreview key={state.entry.path} path={state.entry.path} content={state.content} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
