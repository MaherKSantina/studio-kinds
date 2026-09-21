/**
 * THE STUDIO ON THE WEB, OVER A FOLDER ON DISK — the same App the drive
 * entry (main.tsx) and the desktop entry (desktop.tsx) mount, here over the
 * folder worker (apps/folder-worker), reached through this app's Vite proxy
 * at `folder-api/`. That is how C:\Github opens in a browser — a phone's
 * included, through suite-router and the public hostname, where this page IS
 * the domain root. A change on disk (an editor, an agent) arrives as a
 * server-sent event and the App re-reads what it shows, as it does on the
 * desktop.
 *
 * Its start page is the folder's ROOT MEMORY (the store's `homeMemory`): the
 * first `.memory` file sitting in the root when there is one — a file, saved
 * on disk — else a VIRTUAL memory this browser keeps, so a folder with no
 * `.memory` behaves as an empty one does on the desktop and in VS Code —
 * every sub-folder a focus, the files beside them Everything else — and
 * nothing is written into the folder unasked. A `.memory` appearing in the
 * root takes over as the start page.
 *
 * Its own page (`/studio/folder.html`) rather than a query flag: the App
 * rebuilds the query on every navigation (lib/studioUrl.ts), so a flag would
 * be lost the first time a document opened.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { httpFs } from "crosscut";
import { configureFileKinds, fileTemplate } from "filekinds";
import App from "./App";
import { ask, uploadBinary } from "./api";
import { RemoteControl } from "./components/RemoteControl";
import { defaultMemoryPath, findRootMemory, folderStem, homeStorageKey, isRootMemoryPath } from "./lib/folderHome";
import type { HomeMemory, StudioStore } from "./store";
import "./index.css";

const base = `${import.meta.env.BASE_URL}folder-api`;
/** A folder-worker endpoint under the app's base, e.g. `folderApi("api/fs/index")`. */
const folderApi = (p: string): string => `${base}/${p}`;
const folderFs = httpFs(base);

configureFileKinds({
  readFile: (abs) => folderFs.read(abs).then((r) => r.content),
  rawFileUrl: (abs) => folderApi(`api/fs/raw?path=${encodeURIComponent(abs)}`),
  listFiles: (abs) => folderFs.list(abs),
  writeFile: (abs, content) => folderFs.write(abs, content),
  mkdir: (abs) => folderFs.mkdir(abs),
  renameFile: (abs, name) => folderFs.rename(abs, name),
  removeFile: (abs) => folderFs.remove(abs),
  writeBinary: (abs, blob) => uploadBinary(folderApi("api/fs/binary"), abs, blob),
  // The flat store, or one folder's subtree (`from`). The folder split the start page shows
  // never calls this: it LISTS where you are and what you take (memoryLoad.ts).
  indexFiles: async (from) => {
    const r = await fetch(folderApi(`api/fs/index${from && from !== "/" ? `?path=${encodeURIComponent(from)}` : ""}`));
    if (!r.ok) throw new Error(`index failed: ${r.status}`);
    return r.json();
  },
  ask,
  // VITE_STUDIO_REMOTE_CONTENT=off at build or dev time: remote images and the map are held back.
  remoteContent: import.meta.env.VITE_STUDIO_REMOTE_CONTENT !== "off",
});

/** The folder's root memory: the first `.memory` file in the root, else a virtual one this browser keeps. */
async function homeMemoryOf(root: string): Promise<HomeMemory> {
  const real = await findRootMemory(folderFs);
  if (real) return real;
  const path = defaultMemoryPath(root);
  const key = homeStorageKey(root);
  const fresh = () => fileTemplate(path, folderStem(root));
  return {
    path,
    virtual: true,
    read: async () => { try { return localStorage.getItem(key) ?? fresh(); } catch { return fresh(); } },
    // A private window or blocked storage: the answers last the page, and that is all.
    write: async (t) => { try { localStorage.setItem(key, t); } catch { /* kept in memory only */ } },
  };
}

function NoWorker({ error }: { error: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-foreground">
      <h1 className="text-xl font-semibold">Studio</h1>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        The folder worker is not answering, so there is no folder to open. Start it on the folder you want
        (<code>folder-worker</code> in Mission Control, or <code>pnpm --filter folder-worker dev -- --folder &lt;path&gt;</code>) and reload.
      </p>
      <p className="max-w-md text-center text-xs text-muted-foreground">{error}</p>
    </div>
  );
}

function Folder() {
  const [root, setRoot] = React.useState<string | null>(null);
  const [home, setHome] = React.useState<HomeMemory | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    fetch(folderApi("api/root"))
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => "")}`);
        return (await r.json()) as { root: string };
      })
      .then(async (j) => { setHome(await homeMemoryOf(j.root)); setRoot(j.root); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  React.useEffect(() => {
    if (!root) return;
    // A change on disk: the App re-reads what it shows (`studio:fs-changed`, the same event the
    // desktop shell sends, for every change); an entry made, removed or renamed — the folder's
    // SHAPE, not a file's content — is also `studio:fs-entries-changed`, which the start page
    // turns into a re-read of the store. Content writes alone (a database's journal being
    // appended somewhere in the folder, every second) never reload anything.
    const es = new EventSource(folderApi("api/fs/events"));
    es.onmessage = (ev) => {
      const { path, type } = JSON.parse(ev.data) as { path?: string; type?: "rename" | "change" };
      if (!path) return;
      window.dispatchEvent(new CustomEvent("studio:fs-changed", { detail: path }));
      if (type !== "change") window.dispatchEvent(new CustomEvent("studio:fs-entries-changed", { detail: path }));
      // A `.memory` made or removed in the root: the start page follows it.
      if (type !== "change" && isRootMemoryPath(path)) void homeMemoryOf(root).then(setHome, () => { /* the listing failed: keep the start page */ });
    };
    return () => es.close();
  }, [root]);
  // The start page's corner chip: Claude Code's Remote Control on this PC, restartable from
  // here when its link has dropped (components/RemoteControl.tsx) — this host alone has the
  // worker that can do it.
  const store = React.useMemo<StudioStore | null>(
    () => (root && home
      ? { id: `folder:${root}`, fs: folderFs, label: root, home: "folder", homeMemory: home, homeActions: <RemoteControl api={folderApi} /> }
      : null),
    [root, home],
  );
  if (error) return <NoWorker error={error} />;
  if (!store || !home) return null;
  return <App key={`${store.id}|${home.path}|${home.virtual}`} store={store} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Folder />
  </React.StrictMode>,
);
