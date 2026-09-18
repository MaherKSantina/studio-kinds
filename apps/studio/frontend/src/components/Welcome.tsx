/**
 * The welcome page: start a document of any kind, open one, pick up a recent
 * one, and the store's own home — on the shared drive the suite's projects
 * (read live from `/projects`), on the desktop the open folder's tree — plus
 * the journey catalog.
 */
import * as React from "react";
import { Button, Card, CardContent, DirectoryTree, type FsEntry } from "crosscut";
import { Clock, FileText, FolderOpen, FolderPlus, Frame, Package, Waypoints } from "lucide-react";
import { iconForFsPath } from "filekinds";
import { startableKinds } from "../lib/kinds";
import type { Recent } from "../lib/recents";
import { targetOfRecent } from "../lib/studioUrl";
import type { StudioStore } from "../store";

function RecentRow({ recent, onPick }: { recent: Recent; onPick: (key: string) => void }) {
  const t = targetOfRecent(recent.path);
  const Icon = t.frame ? Frame : iconForFsPath(t.path, "file");
  return (
    <li>
      <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => onPick(recent.path)}>
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{t.path}{t.frame ? <span className="text-muted-foreground"> › {t.frame}</span> : null}</span>
        <Clock className="size-3 shrink-0 text-muted-foreground/60" />
      </button>
    </li>
  );
}

/** The shared drive's home: the suite's entry points. */
function ProjectsHome({ store, onPick, onNew }: { store: StudioStore; onPick: (path: string) => void; onNew: (ext: string) => void }) {
  const [projects, setProjects] = React.useState<FsEntry[] | null>(null);
  React.useEffect(() => {
    let stale = false;
    store.fs.list("/projects").then(
      (es) => { if (!stale) setProjects(es.filter((e) => e.kind === "file" && e.name.endsWith(".project"))); },
      () => { if (!stale) setProjects([]); },
    );
    return () => { stale = true; };
  }, [store]);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projects</h2>
        <Button size="sm" variant="outline" onClick={() => onNew("project")}><FolderPlus /> New project</Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {(projects ?? []).map((p) => (
          <button key={p.path} type="button" onClick={() => onPick(p.path)}
            className="flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md">
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent"><Package className="size-5 text-primary" /></span>
            <span className="text-sm font-semibold">{p.name.slice(0, -".project".length)}</span>
          </button>
        ))}
      </div>
      {projects !== null && !projects.length && (
        <p className="text-sm text-muted-foreground">
          No projects yet — start one above, or drop a <code>.project</code> file into the <code>/projects</code> folder.
        </p>
      )}
    </section>
  );
}

/** A folder's home: its files, by their kind — click one to open it. */
function FolderHome({ store, onPick, refreshKey }: { store: StudioStore; onPick: (path: string) => void; refreshKey?: number }) {
  return (
    <section className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folder</h2>
          <p className="truncate font-mono text-xs text-muted-foreground" title={store.label}>{store.label}</p>
        </div>
        {store.chooseFolder && (
          <Button size="sm" variant="outline" onClick={() => void store.chooseFolder?.()}><FolderOpen /> Change folder…</Button>
        )}
      </div>
      <DirectoryTree fs={store.fs} showFiles showRoot={false} selectedPath={null} refreshKey={refreshKey}
        onSelect={(e) => { if (e.kind === "file") onPick(e.path); }}
        className="max-h-[52vh] rounded-md border bg-card" />
      <p className="text-[13px] text-muted-foreground">Every file opens by its extension; unknown kinds open as text. Edits save into the folder as you type.</p>
    </section>
  );
}

export function Welcome({ store, recents, onOpen, onPick, onNew, onCatalog, refreshKey }: {
  store: StudioStore;
  /** Bumped when the store changed underneath (a file written on disk) — the folder tree reloads. */
  refreshKey?: number;
  recents: Recent[];
  onOpen: () => void;
  /** A recent entry's key (`<path>` or `<flow>#<frame>`), or a path. */
  onPick: (key: string) => void;
  /** Start a document of this extension. */
  onNew: (ext: string) => void;
  onCatalog: () => void;
}) {
  const kinds = React.useMemo(() => startableKinds(), []);
  return (
    // The page scrolls; its sections never shrink. (A flex column squeezes its children to fit a
    // short viewport — on a phone the folder tree collapsed and its caption overflowed onto Start.)
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-8 overflow-y-auto p-4 sm:p-8 [&>*]:shrink-0">
      <div>
        <h1 className="text-xl font-semibold">Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One place to author every kind of document. A frame, a flow, a playbook and a project open on their own
          editors; everything else opens as its interactive preview with the source one click away. Files live in{" "}
          {store.home === "folder" ? "the open folder" : store.label} and save as you type.
        </p>
      </div>

      {store.home === "folder" && <FolderHome store={store} onPick={onPick} refreshKey={refreshKey} />}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start</h2>
        <div className="flex flex-wrap gap-2">
          {kinds.filter((k) => k.ext !== "project").map((k) => {
            const Icon = k.Icon ?? FileText;
            return (
              <Button key={k.ext} variant="outline" title={k.what} onClick={() => onNew(k.ext)}>
                <Icon /> New {k.kind.label.toLowerCase()}
              </Button>
            );
          })}
          <Button onClick={onOpen}><FolderOpen /> Open…</Button>
        </div>
      </section>

      {recents.length > 0 && (
        <Card>
          <CardContent className="p-2">
            <p className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">Recent</p>
            <ul>{recents.map((r) => <RecentRow key={r.path} recent={r} onPick={onPick} />)}</ul>
          </CardContent>
        </Card>
      )}

      {store.home === "projects" && <ProjectsHome store={store} onPick={onPick} onNew={onNew} />}

      <button type="button" className="flex items-center gap-2 self-start text-xs text-muted-foreground underline" onClick={onCatalog}>
        <Waypoints className="size-3.5" /> Journey catalog — the staged journey in parts, every component live
      </button>
    </div>
  );
}
