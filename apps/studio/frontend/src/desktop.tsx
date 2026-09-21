/**
 * THE STUDIO ON THE DESKTOP — the same App over a folder on disk. The shell
 * (apps/desktop) owns the folder and the file system; this entry wires the
 * kit's adapters to its bridge and mounts App with a folder store. Ask goes
 * to the suite's ask worker when one is running on this machine.
 *
 * A folder opens on its ROOT MEMORY (the store's `homeMemory`): the first
 * `.memory` file in the root — MADE, as an empty `/<folder>.memory`, when
 * there is none, so "Open with Studio" on any folder lands on its split
 * (every sub-folder a focus, the files beside them Everything else). A
 * `.memory` made, removed or renamed in the root afterwards: the start page
 * follows it, making one again if the folder is left without.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { Button, askApi } from "crosscut";
import { configureFileKinds } from "filekinds";
import { FolderOpen } from "lucide-react";
import App from "./App";
import { blobToBase64, bridge, desktopFs } from "./lib/desktopFs";
import { ensureRootMemory, isRootMemoryPath } from "./lib/folderHome";
import type { HomeMemory, StudioStore } from "./store";
import "./index.css";

const b = bridge();
const fs = desktopFs();

configureFileKinds({
  readFile: (abs) => b.fs.read(abs).then((r) => r.content),
  rawFileUrl: (abs) => b.rawUrl(abs),
  listFiles: (abs) => b.fs.list(abs),
  writeFile: (abs, content) => b.fs.write(abs, content),
  mkdir: (abs) => b.fs.mkdir(abs),
  renameFile: (abs, name) => b.fs.rename(abs, name),
  removeFile: (abs) => b.fs.remove(abs),
  writeBinary: async (abs, blob) => b.fs.writeBinary(abs, await blobToBase64(blob)),
  indexFiles: (from) => b.fs.index(from),
  // The suite's ask worker, when it runs on this machine; the panels say so when it does not.
  ask: askApi("http://127.0.0.1:9250"),
  // On only with STUDIO_REMOTE_CONTENT=on on the app; otherwise the main process refuses every request off this machine too.
  remoteContent: b.remoteContent === true,
});

const folderStore = (root: string, homeMemory: HomeMemory): StudioStore => ({
  id: `folder:${root}`,
  fs,
  label: root,
  home: "folder",
  homeMemory,
  chooseFolder: () => b.chooseFolder(),
  showInFolder: (p) => b.showInFolder(p),
});

function NoFolder() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
      <h1 className="text-xl font-semibold">Studio</h1>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Open a folder. Its files open here by their kind — frames, flows, playbooks, projects and the rest — and save in place.
      </p>
      <Button onClick={() => void b.chooseFolder()}><FolderOpen /> Open a folder…</Button>
    </div>
  );
}

function Desktop() {
  const [root, setRoot] = React.useState<string | null | undefined>(undefined);
  const [home, setHome] = React.useState<HomeMemory | null>(null);
  React.useEffect(() => {
    void b.getRoot().then(setRoot);
    const offRoot = b.onRoot(setRoot);
    // A file handed to the shell (a file association, the command line): show it as the URL would.
    const offOpen = b.onOpenPath((storePath) => {
      const u = new URL(window.location.href);
      u.search = `?path=${encodeURIComponent(storePath)}`;
      window.history.pushState({}, "", u);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    // The native File menu's actions (New…, Open…, Save as…, Rename…, Close) reach the App as one event.
    const offMenu = b.onMenu((action) => window.dispatchEvent(new CustomEvent("studio:action", { detail: action })));
    // A change on disk (another editor, an agent): the App re-reads what it shows; an entry made,
    // removed or renamed — the folder's SHAPE — also tells the root memory to re-read the store.
    const offFs = b.onFsChanged((p, type) => {
      window.dispatchEvent(new CustomEvent("studio:fs-changed", { detail: p }));
      if (type === "rename") window.dispatchEvent(new CustomEvent("studio:fs-entries-changed", { detail: p }));
    });
    return () => { offRoot(); offOpen(); offMenu(); offFs(); };
  }, []);

  // The folder's root memory — found, or made. Followed while the folder is open: a `.memory`
  // made or removed in the root re-resolves it (the same path again changes nothing).
  React.useEffect(() => {
    setHome(null);
    if (!root) return;
    let live = true;
    const resolve = () => ensureRootMemory(fs, root).then(
      (h) => { if (live) setHome((cur) => (cur && cur.path === h.path ? cur : h)); },
      (e: unknown) => console.warn("root memory: could not open or make one", e),
    );
    void resolve();
    const onFs = (e: Event) => {
      const changed = (e as CustomEvent<string>).detail;
      if (isRootMemoryPath(changed)) void resolve();
    };
    window.addEventListener("studio:fs-entries-changed", onFs);
    return () => { live = false; window.removeEventListener("studio:fs-entries-changed", onFs); };
  }, [root]);

  if (root === undefined) return null;
  if (!root) return <NoFolder />;
  if (!home) return null;
  return <App key={`${root}|${home.path}`} store={folderStore(root, home)} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Desktop />
  </React.StrictMode>,
);
