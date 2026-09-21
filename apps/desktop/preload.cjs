/**
 * The bridge the renderer sees as `window.studioDesktop` — the suite's
 * file-system contract over the open folder, the folder itself, and a URL
 * scheme for bytes. Nothing else from Node reaches the page.
 */
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel, cb) => {
  const handler = (_event, ...values) => cb(...values);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("studioDesktop", {
  /** True only when the app runs with STUDIO_REMOTE_CONTENT=on; otherwise the main process refuses every request off this machine, and the page holds remote images back. */
  remoteContent: process.argv.includes("--studio-remote-content=on"),
  getRoot: () => ipcRenderer.invoke("root:get"),
  chooseFolder: () => ipcRenderer.invoke("root:choose"),
  onRoot: (cb) => on("root:changed", cb),
  onOpenPath: (cb) => on("open:path", cb),
  /** The native menu asked for a document action: new, open, save-as, rename, close, catalog. */
  onMenu: (cb) => on("menu:action", cb),
  /** A file inside the folder changed on disk (store path, then "change" = content written | "rename" = made, removed or renamed). */
  onFsChanged: (cb) => on("fs:changed", cb),
  fs: {
    list: (p) => ipcRenderer.invoke("fs:list", p),
    read: (p) => ipcRenderer.invoke("fs:read", p),
    write: (p, content) => ipcRenderer.invoke("fs:write", p, content),
    writeBinary: (p, base64) => ipcRenderer.invoke("fs:writeBinary", p, base64),
    mkdir: (p) => ipcRenderer.invoke("fs:mkdir", p),
    rename: (p, newName) => ipcRenderer.invoke("fs:rename", p, newName),
    remove: (p) => ipcRenderer.invoke("fs:remove", p),
    /** The flat store, or only the rows under `from` when given. */
    index: (from) => ipcRenderer.invoke("fs:index", from),
  },
  /** Bytes of a file inside the folder, as a URL the page may load. */
  rawUrl: (p) => `studio-local://file${encodeURI(String(p).startsWith("/") ? p : `/${p}`)}`,
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  showInFolder: (p) => ipcRenderer.invoke("shell:showInFolder", p),
});
