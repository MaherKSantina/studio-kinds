/**
 * A VERSIONED FILE — on the fs it is a folder named like a file
 * (`launch.playbook/`) whose child FILES are the versions of that document
 * (crosscut's `entry-presentation` table makes the tree read it as a single
 * file-like entry; crosscut's `versionedFile.ts` is the shared vocabulary).
 *
 * This view is the whole surface for one:
 *  - left, the versions newest-first with the latest preselected, plus the
 *    History entry — the reserved `versions.md` changelog that says WHY each
 *    version changed;
 *  - right, the selected version drawn by its own kind through DocumentPreview.
 *
 * With a configured writer the view also AUTHORS: “New version” cuts the next
 * version from what you're looking at and asks why (the answer lands in the
 * changelog), and the LATEST version can be edited raw in place. Older
 * versions stay read-only — they are history, and refs pinned to them
 * (`…/notes.md/01 initial.md`) must never drift.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, ScrollText } from "lucide-react";
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Input, Textarea,
  compareVersionNames, extensionOf, isVersionsMeta, joinPath, nameOf, nextVersionName,
  useAutosave, validateName, versionLabelOf, versionsMetaPathOf,
} from "crosscut";
import { configuredWriter, readVirtualDirectoryFile } from "../api";
import { DocumentPreview } from "./DocumentPreview";

export interface FileVersion {
  name: string;
  path: string;
  updatedAt?: string;
}

const labelOf = versionLabelOf;

/** Ask what the next version is called and why it exists. */
function NewVersionDialog({ open, folder, versions, from, onClose, onCreate }: {
  open: boolean;
  folder: string;
  versions: FileVersion[];
  /** The version the new one starts from (label only, for the copy). */
  from: string | null;
  onClose: () => void;
  onCreate: (opts: { name: string; why: string }) => void | Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [why, setWhy] = useState("");
  useEffect(() => { if (open) { setLabel(""); setWhy(""); } }, [open]);
  const name = nextVersionName(
    versions.map((v) => ({ path: v.path, name: v.name, kind: "file" as const })),
    label,
    extensionOf(folder),
  );
  const verdict = validateName(name, versions.map((v) => v.name));
  const ok = !!label.trim() && verdict.ok;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New version</DialogTitle>
          <DialogDescription>
            Cuts <span className="font-medium text-foreground">{name}</span>
            {from ? <> starting from <span className="font-medium text-foreground">{from}</span></> : " empty"} —
            earlier versions (and anything pinned to them) stay exactly as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <p className="text-xs font-medium">Label</p>
          <Input autoFocus value={label} placeholder="e.g. after HH reply" onChange={(e) => setLabel(e.target.value)} />
          {!verdict.ok && label.trim() && <p className="text-xs text-destructive">{verdict.error}</p>}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium">What changed &amp; why</p>
          <Textarea rows={3} value={why} placeholder="Lands in the changelog (versions.md)" onChange={(e) => setWhy(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!ok} onClick={() => void onCreate({ name, why })}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Raw in-place editor for the LATEST version only, autosaving through the
 *  configured writer — the same shape as the nodes raw editor. */
function LatestEditor({ path, initial, onDone, trailing }: {
  path: string;
  initial: string;
  onDone: () => void;
  trailing?: React.ReactNode;
}) {
  const write = configuredWriter();
  const [content, setContent] = useState(initial);
  const autosave = useAutosave(
    React.useCallback((c: string) => (write ? write(path, c) : Promise.resolve()), [write, path]),
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b px-3">
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{nameOf(path)} — editing</span>
        <span className="text-xs text-muted-foreground">{autosave.state === "saving" ? "saving…" : autosave.state === "error" ? "save failed" : ""}</span>
        <Button size="xs" variant="outline" onClick={() => void autosave.flush().then(onDone)}>Done</Button>
        {trailing}
      </div>
      <Textarea
        value={content}
        spellCheck={false}
        onChange={(e) => { setContent(e.target.value); autosave.onEdit(e.target.value); }}
        className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-[13px] leading-5 focus-visible:ring-0"
      />
    </div>
  );
}

export function VersionedFileView({ path, versions, trailing, className, onVersionsChanged }: {
  /** The versioned folder itself, e.g. "/Demo/launch.playbook". */
  path: string;
  /** Its child files. Name order IS version order (oldest → newest); the
   *  reserved changelog (`versions.md`) is filtered out here. */
  versions: FileVersion[];
  /** Host controls appended to the preview strip (a Close button, say). */
  trailing?: React.ReactNode;
  className?: string;
  /** Called after this view writes a new version, so the host can re-list. */
  onVersionsChanged?: () => void;
}) {
  const write = configuredWriter();
  const metaPath = versionsMetaPathOf(path);
  const ordered = useMemo(
    () => versions.filter((v) => !isVersionsMeta(v.name)).sort((a, b) => compareVersionNames(a.name, b.name)),
    [versions],
  );
  const latest = ordered[ordered.length - 1] ?? null;
  const [selected, setSelected] = useState<string | null>(latest?.path ?? null);
  useEffect(() => { setSelected(latest?.path ?? null); }, [path, latest?.path]);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [selected]);
  const [creating, setCreating] = useState(false);

  // The changelog — why each version changed. Absent is fine.
  const [meta, setMeta] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setMeta(null);
    readVirtualDirectoryFile(metaPath, metaPath).then(
      (r) => { if (live) setMeta(r.content); },
      () => { if (live) setMeta(null); },
    );
    return () => { live = false; };
  }, [metaPath]);

  const [content, setContent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!selected || selected === metaPath) return;
    let live = true;
    setContent(null); setErr(null);
    readVirtualDirectoryFile(selected, selected).then(
      (r) => { if (live) setContent(r.content); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [selected, metaPath]);

  const createVersion = async ({ name, why }: { name: string; why: string }) => {
    if (!write) return;
    // The new version starts from the version on screen (else the latest).
    const fromPath = (selected && selected !== metaPath ? selected : latest?.path) ?? null;
    let base = "";
    if (fromPath) {
      try { base = (await readVirtualDirectoryFile(fromPath, fromPath)).content; } catch { base = ""; }
    }
    const newPath = joinPath(path, name);
    await write(newPath, base);
    const stamp = new Date().toISOString().slice(0, 10);
    const section = `\n## ${labelOf(name)} — ${stamp}\n\n${why.trim() || "(no note)"}\n`;
    const nextMeta = (meta ?? `# Versions — ${nameOf(path)}\n`) + section;
    await write(metaPath, nextMeta);
    setMeta(nextMeta);
    setCreating(false);
    setSelected(newPath);
    onVersionsChanged?.();
  };

  const showHistory = meta !== null || !!write;
  const editable = !!write && !!latest && selected === latest.path;

  const rightPane = () => {
    if (selected === metaPath) {
      return meta === null
        ? <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">No history yet — cutting a new version starts the changelog.</div>
        : <DocumentPreview key={metaPath} path={metaPath} content={meta} trailing={trailing} />;
    }
    if (err) return <div className="p-6 text-sm text-destructive">{err}</div>;
    if (!selected) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No versions yet.</div>;
    if (content === null) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
    if (editing && editable) {
      return <LatestEditor key={selected} path={selected} initial={content} trailing={trailing}
        onDone={() => {
          setEditing(false);
          // Re-read so the preview shows what was just saved.
          readVirtualDirectoryFile(selected, selected).then((r) => setContent(r.content), () => undefined);
        }} />;
    }
    return (
      <DocumentPreview key={selected} path={selected} content={content}
        trailing={
          <>
            {editable && (
              <Button size="xs" variant="outline" title="Edit the latest version in place — history stays frozen"
                onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            )}
            {trailing}
          </>
        } />
    );
  };

  return (
    <div className={"flex h-full min-h-0 " + (className ?? "")}>
      <aside className="flex w-48 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex items-center border-b px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span className="flex-1">Versions · {ordered.length}</span>
          {write && (
            <Button size="xs" variant="ghost" className="h-5 px-1" title="New version" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" />
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {[...ordered].reverse().map((v) => (
            <button key={v.path} type="button" onClick={() => setSelected(v.path)}
              className={"flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs " +
                (selected === v.path ? "bg-accent font-medium text-accent-foreground" : "hover:bg-accent/50")}>
              <span className="min-w-0 flex-1 truncate">{labelOf(v.name)}</span>
              {v === latest && (
                <span className="shrink-0 rounded border border-success/50 px-1 text-xs font-semibold text-success">
                  latest
                </span>
              )}
            </button>
          ))}
          {!ordered.length && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              No versions yet.{write ? " Cut the first one with +." : ""}
            </p>
          )}
        </div>
        {showHistory && (
          <div className="border-t p-1">
            <button type="button" onClick={() => setSelected(metaPath)}
              title="versions.md — why each version changed"
              className={"flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs " +
                (selected === metaPath ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/50")}>
              <ScrollText className="size-3.5 shrink-0" />
              <span className="flex-1">History</span>
              {meta === null && <span className="text-xs">none yet</span>}
            </button>
          </div>
        )}
      </aside>
      <section className="min-w-0 flex-1">{rightPane()}</section>
      <NewVersionDialog open={creating} folder={path} versions={ordered}
        from={selected && selected !== metaPath ? labelOf(nameOf(selected)) : latest ? labelOf(latest.name) : null}
        onClose={() => setCreating(false)} onCreate={createVersion} />
    </div>
  );
}
