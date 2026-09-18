/**
 * STUDIO — one app for every file kind, over ONE store handed in by the
 * entry: the suite's shared drive (main.tsx), a folder on disk through the
 * folder worker (folder.tsx) or the desktop shell (desktop.tsx). Every
 * document opens as its kind's PREVIEW (golden table `studio-surface`,
 * KindSurface) — the same surface in every host; documents are changed by
 * an agent on the store and re-read here as the changes land. What a
 * preview offers (a lock, a tick) persists through the autosave.
 *
 * AN OPEN DOCUMENT IS THE WHOLE WINDOW — no header, no menubar, no title
 * strip: only the content. Everything around it is the keyboard, the welcome
 * page, or the desktop shell's native File menu (which reaches the App as
 * `studio:action` events):
 *   Ctrl+O open · Ctrl+N new · Ctrl+S save now · Ctrl+Shift+S save as ·
 *   F2 rename · Ctrl+Shift+W close (back to the welcome page; on the web the
 *   browser's Back does the same, the welcome is in the history).
 * The welcome and catalog pages keep the suite's shell (logo, title).
 */
import * as React from "react";
import { LayoutTemplate, X } from "lucide-react";
import { AppShell, AutosaveChip, AutosaveInfo, Button, FilePickerDialog, NamePromptDialog, extensionOf, nameOf, parentOf, useAutosave } from "crosscut";
import {
  KIND_ICONS, STUDIO_OPEN_EVENT, type StudioOpenRequest, fileTemplate, inlineFrameText, isActiveStudioDialog,
  journeyCatalogStory, newProjectText, previewForPath, registerStudioDialog, withInlineFrameText,
} from "filekinds";
import { HomeMemory } from "./components/HomeMemory";
import { KindSurface } from "./components/KindSurface";
import { NewDocDialog } from "./components/NewDocDialog";
import { Welcome } from "./components/Welcome";
import { type Recent, forgetRecent, readRecents, touchRecent } from "./lib/recents";
import { type StudioTarget, parseStudioSearch, recentKeyOf, sameTarget, studioSearch, targetOfRecent } from "./lib/studioUrl";
import type { StudioStore } from "./store";

// The catalog page pulls the whole journey engine — loaded when it is opened, not with the shell.
const JourneyCatalog = React.lazy(() => import("filekinds/catalog"));

/** A frame kept INSIDE a flow, open as if it were a file of its own: the
 *  document path is a stand-in beside the flow (its folder is what the
 *  canvas and uploads use), and every save goes back into the flow. */
interface Inline { flow: string; name: string }
const standInPath = (i: Inline) => `${parentOf(i.flow)}/${i.name}.frame`;

type DialogState =
  | { kind: "open" }
  | { kind: "save-as" }
  | { kind: "new" }
  | { kind: "new-file"; ext: string }
  | { kind: "rename"; siblings: string[] }
  | null;

const pushTarget = (t: StudioTarget) => {
  const u = new URL(window.location.href);
  u.search = studioSearch(t);
  window.history.pushState({}, "", u);
};

/** The `path` / `frame` a studio URL names — whatever origin it was built for. */
const targetOfStudioUrl = (url: string): StudioTarget | null => {
  const qi = url.indexOf("?");
  const q = new URLSearchParams(qi >= 0 ? url.slice(qi) : "");
  const path = q.get("path");
  return path ? { kind: "doc", path, frame: q.get("frame") || null } : null;
};

function BinaryNote({ path, store }: { path: string; store: StudioStore }) {
  return (
    <div className="m-6 max-w-lg rounded-md border bg-card p-4 text-sm">
      <p className="font-medium">{nameOf(path)} is bytes, not text.</p>
      <p className="mt-1 text-muted-foreground">There is no source to edit here.</p>
      <div className="mt-3 flex gap-2">
        {store.nodesUrl && <Button size="sm" onClick={() => window.open(store.nodesUrl!(path), "_blank")}>Open in Nodes</Button>}
        {store.showInFolder && <Button size="sm" variant="outline" onClick={() => void store.showInFolder?.(path)}>Show in folder</Button>}
      </div>
    </div>
  );
}

export default function App({ store }: { store: StudioStore }) {
  const fs = store.fs;
  const [docPath, setDocPath] = React.useState<string | null>(null);
  const [inline, setInline] = React.useState<Inline | null>(null);
  const [content, setContent] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [catalog, setCatalog] = React.useState<{ story: string | null } | null>(null);
  const [recents, setRecents] = React.useState<Recent[]>(() => readRecents(store.id));
  const [dialog, setDialog] = React.useState<DialogState>(null);
  // What the page shows, readable from the popstate handler without re-subscribing it.
  const shownRef = React.useRef<StudioTarget>({ kind: "welcome" });

  const autosave = useAutosave(React.useCallback((c: string) => {
    if (!docPath) return Promise.resolve();
    // Freshly read, so nothing else in the flow is lost between two saves.
    if (inline) return fs.read(inline.flow).then((r) => fs.write(inline.flow, withInlineFrameText(r.content, inline.name, c)));
    return fs.write(docPath, c);
  }, [fs, docPath, inline]));

  const storeRef = React.useRef(store);
  storeRef.current = store;
  /** Show `target`; `push` mirrors it into the URL (false when following the URL itself). */
  const show = React.useCallback((t: StudioTarget, push = true) => {
    const arrive = () => { if (push) pushTarget(t); shownRef.current = t; setLoadError(null); };
    if (t.kind !== "doc") {
      arrive();
      setDocPath(null); setInline(null); setContent(null);
      setCatalog(t.kind === "catalog" ? { story: t.story } : null);
      return;
    }
    // Nothing changes until the read settles: a target that turns out to be a
    // FOLDER (a journey's pool, a memory's card) is shown the way this host
    // can — revealed in the file manager, or handed to Nodes — and the page
    // stays where it was.
    const fail = (msg: string) => { arrive(); setCatalog(null); setDocPath(null); setInline(null); setContent(null); setLoadError(msg); };
    fs.read(t.path).then(
      (r) => {
        let next: { inline: Inline | null; docPath: string; content: string };
        if (t.frame) {
          const text = inlineFrameText(r.content, t.frame);
          if (text === null) { fail(`No frame named “${t.frame}” inside ${t.path}.`); return; }
          const i = { flow: t.path, name: t.frame };
          next = { inline: i, docPath: standInPath(i), content: text };
        } else {
          next = { inline: null, docPath: t.path, content: r.content };
        }
        arrive(); setCatalog(null);
        setInline(next.inline); setDocPath(next.docPath); setContent(next.content);
        setRecents(touchRecent(store.id, recentKeyOf(t)));
      },
      (e: unknown) => fs.list(t.path).then(
        () => {
          const s = storeRef.current;
          if (s.showInFolder) void s.showInFolder(t.path);
          else if (s.nodesUrl) window.location.href = s.nodesUrl(t.path);
          else fail("A folder — nothing to open here.");
        },
        () => fail(e instanceof Error ? e.message : String(e)),
      ),
    );
  }, [fs, store.id]);

  React.useEffect(() => {
    // The URL already names the target — show it WITHOUT pushing, so the first
    // Back press leaves the page instead of hitting a duplicate entry.
    show(parseStudioSearch(window.location.search), false);
    // Back/forward: follow the URL. A pop that only moved an editor's own
    // params (the project editor's `item`) is that editor's to handle.
    const onPop = () => {
      const next = parseStudioSearch(window.location.search);
      if (!sameTarget(next, shownRef.current)) show(next, false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [show]);

  // "Open in the Studio" requests from inside a document (a project's item, a frame beside a
  // flow in a read-only host) open HERE — this window is the Studio.
  React.useEffect(() => {
    const me = registerStudioDialog();
    const onOpen = (e: Event) => {
      if (!isActiveStudioDialog(me.id)) return;
      const t = targetOfStudioUrl((e as CustomEvent<StudioOpenRequest>).detail.url);
      if (t) { void autosave.flush(); show(t); }
    };
    window.addEventListener(STUDIO_OPEN_EVENT, onOpen);
    return () => { window.removeEventListener(STUDIO_OPEN_EVENT, onOpen); me.unregister(); };
  }, [show, autosave]);

  const edit = (next: string) => { setContent(next); autosave.onEdit(next); };
  const openPath = (path: string, frame: string | null = null) => show({ kind: "doc", path, frame });

  const startRename = React.useCallback(async () => {
    if (!docPath) return;
    const sibs = await fs.list(parentOf(docPath));
    setDialog({ kind: "rename", siblings: sibs.map((s) => s.name) });
  }, [fs, docPath]);
  const doRename = async (name: string) => {
    if (!docPath) return;
    const r = await fs.rename(docPath, name);
    setRecents(forgetRecent(store.id, docPath));
    setDialog(null);
    openPath(r.path);
  };

  /** A fresh file of its kind's template; a project also gets the folder it stands on. */
  const createDoc = async (path: string) => {
    const ext = extensionOf(path);
    const stem = nameOf(path).replace(/\.[^.]+$/, "");
    if (ext === "project") {
      await fs.write(path, newProjectText(stem));
      // The folder a directory project stands on exists the moment it holds a file.
      try { await fs.read(`/${stem}/README.md`); } catch { await fs.write(`/${stem}/README.md`, `# ${stem}\n\n`); }
    } else {
      await fs.write(path, fileTemplate(path));
    }
    setDialog(null);
    openPath(path);
  };

  // The keyboard is the document's chrome.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && !e.shiftKey && k === "s") { e.preventDefault(); void autosave.flush(); }
      else if (mod && e.shiftKey && k === "s") { e.preventDefault(); if (docPath && !inline) setDialog({ kind: "save-as" }); }
      else if (mod && !e.shiftKey && k === "o") { e.preventDefault(); setDialog({ kind: "open" }); }
      else if (mod && !e.shiftKey && k === "n") { e.preventDefault(); setDialog({ kind: "new" }); }
      else if (mod && e.shiftKey && k === "w") { e.preventDefault(); show({ kind: "welcome" }); }
      else if (e.key === "F2" && docPath && !inline) { e.preventDefault(); void startRename(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autosave, docPath, inline, show, startRename]);

  // The desktop shell's native File menu (New…, Open…, Save as…, Rename…, Close) and anything
  // else outside the page reach the same actions through one window event.
  React.useEffect(() => {
    const onAction = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      if (action === "new") setDialog({ kind: "new" });
      else if (action === "open") setDialog({ kind: "open" });
      else if (action === "save-as") { if (docPath && !inline) setDialog({ kind: "save-as" }); }
      else if (action === "rename") { if (docPath && !inline) void startRename(); }
      else if (action === "close") show({ kind: "welcome" });
      else if (action === "catalog") show({ kind: "catalog", catalog: "journey", story: null });
    };
    window.addEventListener("studio:action", onAction);
    return () => window.removeEventListener("studio:action", onAction);
  }, [docPath, inline, show, startRename]);

  // A change on disk (another editor, an agent, a script) to the open document: re-read it —
  // unless an edit of our own is still pending, in which case ours is the newer truth. Our own
  // saves arrive here too and compare equal. Any change bumps the welcome page's folder tree.
  const [fsTick, setFsTick] = React.useState(0);
  const contentRef = React.useRef(content);
  contentRef.current = content;
  React.useEffect(() => {
    const onChanged = (e: Event) => {
      const changed = (e as CustomEvent<string>).detail;
      setFsTick((t) => t + 1);
      const file = inline?.flow ?? docPath;
      const busy = autosave.state === "dirty" || autosave.state === "saving" || autosave.state === "error";
      if (!file || changed !== file || busy) return;
      fs.read(file).then((r) => {
        const next = inline ? inlineFrameText(r.content, inline.name) : r.content;
        if (next !== null && next !== contentRef.current) setContent(next);
      }, () => { /* gone or unreadable: keep what we show */ });
    };
    window.addEventListener("studio:fs-changed", onChanged);
    return () => window.removeEventListener("studio:fs-changed", onChanged);
  }, [fs, docPath, inline, autosave.state]);

  const kind = docPath ? previewForPath(docPath) : undefined;
  const Logo = (kind && KIND_ICONS[kind.key]) || LayoutTemplate;
  const story = catalog ? journeyCatalogStory(catalog.story) : null;
  const hostFile = inline?.flow ?? docPath;
  const docTitle = inline ? `${nameOf(inline.flow)} › ${inline.name}` : docPath ? nameOf(docPath) : catalog ? (story?.story.title ?? "Journey catalog") : store.homeMemory ? store.label : null;
  const autosaveInfo: AutosaveInfo | null = docPath ? { state: autosave.state, lastSavedAt: autosave.lastSavedAt, lastError: autosave.lastError } : null;
  const newInitialPath = (ext: string) => (ext === "project" && store.home === "projects" ? "/projects" : hostFile ? parentOf(hostFile) : "/");

  // The window's title carries what the page no longer shows.
  React.useEffect(() => { document.title = docTitle ? `${docTitle} | Studio` : "Studio"; }, [docTitle]);

  const dialogs = (
    <>
      <NewDocDialog open={dialog?.kind === "new"} onOpenChange={(o) => { if (!o) setDialog(null); }} onPick={(ext) => setDialog({ kind: "new-file", ext })} />
      <FilePickerDialog fs={fs} mode="open" open={dialog?.kind === "open"} onOpenChange={(o) => { if (!o) setDialog(null); }}
        initialPath={hostFile ? parentOf(hostFile) : "/"} onPick={(p) => { setDialog(null); openPath(p); }} />
      <FilePickerDialog fs={fs} mode="save" open={dialog?.kind === "save-as"} title="Save a copy as" onOpenChange={(o) => { if (!o) setDialog(null); }}
        extensions={docPath ? [extensionOf(docPath)] : undefined} initialPath={docPath ? parentOf(docPath) : "/"} defaultName={docPath ? nameOf(docPath) : ""}
        onPick={(p) => { void fs.write(p, content ?? "").then(() => { setDialog(null); openPath(p); }); }} />
      <FilePickerDialog fs={fs} mode="save" open={dialog?.kind === "new-file"}
        title={dialog?.kind === "new-file" ? `New ${dialog.ext}` : "New"} onOpenChange={(o) => { if (!o) setDialog(null); }}
        extensions={dialog?.kind === "new-file" ? [dialog.ext] : undefined}
        initialPath={dialog?.kind === "new-file" ? newInitialPath(dialog.ext) : "/"}
        defaultName={dialog?.kind === "new-file" ? `untitled.${dialog.ext}` : ""}
        onPick={(p) => void createDoc(p)} />
      <NamePromptDialog open={dialog?.kind === "rename"} title={`Rename “${docPath ? nameOf(docPath) : ""}”`} action="Rename"
        initial={docPath ? nameOf(docPath) : ""} siblings={dialog?.kind === "rename" ? dialog.siblings : []}
        onClose={() => setDialog(null)} onSubmit={doRename} />
    </>
  );

  // A document: the content, and nothing else. The autosave chip surfaces only while a save is
  // in flight or has failed, in a corner.
  if (docPath) {
    return (
      <div className="flex min-h-0 flex-col bg-background text-foreground" style={{ height: "100dvh" }}>
        <main className="min-h-0 flex-1">
          {content !== null
            ? <KindSurface path={docPath} content={content} onChange={edit} binary={<BinaryNote path={docPath} store={store} />}
                onOpenPath={(p) => { void autosave.flush(); openPath(p); }} />
            : <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        </main>
        {autosaveInfo && <div className="pointer-events-none fixed bottom-2 right-3 z-40">{<AutosaveChip autosave={autosaveInfo} />}</div>}
        {dialogs}
      </div>
    );
  }

  // THE FOLDER'S START PAGE: its root memory as the whole window, where the store says so (the
  // folder entry). A card opens a document, Back and Ctrl+Shift+W return here; a folder a card
  // names (a `.node`) cannot open in this host and says so above the memory.
  if (!catalog && store.homeMemory) {
    return (
      <div className="flex min-h-0 flex-col bg-background text-foreground" style={{ height: "100dvh" }}>
        {loadError && <div className="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{loadError}</div>}
        <main className="min-h-0 flex-1">
          <HomeMemory home={store.homeMemory} onOpenPath={(p) => openPath(p)} />
        </main>
        {store.homeActions}
        {dialogs}
      </div>
    );
  }

  return (
    <AppShell
      appName="Studio"
      logo={<span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Logo className="size-5" /></span>}
      homeHref={store.home === "projects" ? "/suite/" : null}
      docTitle={catalog ? docTitle : null}
      docPath={catalog ? "Journey catalog" : undefined}
      right={catalog ? <Button size="sm" variant="ghost" title="Back to the welcome page" onClick={() => show({ kind: "welcome" })}><X /> Close</Button> : undefined}
    >
      {loadError && <div className="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{loadError}</div>}
      {catalog && !loadError && (
        <React.Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading the catalog…</div>}>
          <JourneyCatalog storyId={catalog.story} onPick={(id: string | null) => show({ kind: "catalog", catalog: "journey", story: id })} />
        </React.Suspense>
      )}
      {!catalog && !loadError && (
        <Welcome store={store} recents={recents} refreshKey={fsTick} onOpen={() => setDialog({ kind: "open" })}
          onPick={(key) => { const t = targetOfRecent(key); openPath(t.path, t.frame); }}
          onNew={(ext) => setDialog({ kind: "new-file", ext })}
          onCatalog={() => show({ kind: "catalog", catalog: "journey", story: null })} />
      )}
      {dialogs}
    </AppShell>
  );
}
