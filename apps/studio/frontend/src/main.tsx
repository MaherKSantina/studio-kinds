/**
 * THE STUDIO ON THE WEB — the App over the suite's shared drive, reached
 * through the nodes worker behind this app's own Vite proxy. (The desktop
 * entry, desktop.tsx, mounts the same App over a folder on disk.)
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { SUITE_APPS } from "crosscut";
import { configureFileKinds } from "filekinds";
import App from "./App";
import { ask, nodesApi, nodesFs, putBinary } from "./api";
import type { StudioStore } from "./store";
import "./index.css";

// Every kind's viewer and editor reads and writes the shared store through
// this one adapter — the complete set, since the Studio hosts every kind:
// references inside documents, folder listings, writes, bytes, the flat
// index a `.memory` lens renders over, program runs, and the model bridge.
configureFileKinds({
  readFile: (abs) => nodesFs.read(abs).then((r) => r.content),
  rawFileUrl: (abs) => nodesApi(`api/fs/raw?path=${encodeURIComponent(abs)}`),
  listFiles: (abs) => nodesFs.list(abs),
  writeFile: (abs, content) => nodesFs.write(abs, content),
  mkdir: (abs) => nodesFs.mkdir(abs),
  renameFile: (abs, name) => nodesFs.rename(abs, name),
  removeFile: (abs) => nodesFs.remove(abs),
  writeBinary: putBinary,
  // The flat store, or one folder's subtree (`from`) — what a memory that authors decisions reads.
  indexFiles: async (from) => {
    const r = await fetch(nodesApi(`api/fs/index${from && from !== "/" ? `?path=${encodeURIComponent(from)}` : ""}`));
    if (!r.ok) throw new Error(`index failed: ${r.status}`);
    return r.json();
  },
  runProgram: async (abs) => {
    const r = await fetch(nodesApi("api/run/program"), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: abs }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `run failed: ${r.status}`);
    return r.json();
  },
  ask,
  // Remote images and the map are held back unless VITE_STUDIO_REMOTE_CONTENT=on at build or dev time.
  remoteContent: import.meta.env.VITE_STUDIO_REMOTE_CONTENT === "on",
});

const drive: StudioStore = {
  id: "drive",
  fs: nodesFs,
  label: "the shared drive",
  home: "projects",
  nodesUrl: (path) => `${SUITE_APPS.nodes.origin}/?path=${encodeURIComponent(path)}`,
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App store={drive} />
  </React.StrictMode>,
);
