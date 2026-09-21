/**
 * THE DESKTOP SHELL — the Studio over a real folder on disk.
 *
 * One window loads the Studio's desktop renderer (built from apps/studio with
 * `--mode desktop`). The renderer never touches the disk itself: it talks to
 * this process over a small IPC surface that implements the suite's
 * file-system contract (list / read / write / mkdir / rename / remove, bytes,
 * the flat index) relative to ONE open folder — so every path the editors
 * see is `/sub/file.frame`, exactly as on the shared drive, and document-
 * relative references (`<stem>-assets/`, embeds, sources) resolve the same.
 *
 * Bytes (screenshots, exports) are served through the `studio-local://`
 * scheme, again only from inside the open folder.
 *
 * The folder comes from File › Open Folder…, from the last one used, from
 * `--folder <path>` / a folder or file given on the command line (a file
 * opens its folder and then the file — what a file association delivers),
 * or from the STUDIO_FOLDER environment variable.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const SCHEME = "studio-local";
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
]);

/** @type {string | null} the open folder, absolute */
let root = null;
/** @type {BrowserWindow | null} */
let win = null;
/** A file to open once the renderer is up — posix path relative to the root. */
let pendingOpen = null;

/* ── the folder watcher ─────────────────────────────────────────────────── */

// A change on disk — another editor, an agent, a script — reaches the renderer as the changed
// store path (debounced per path) with the event's type: "change" is content written, "rename"
// an entry made, removed or renamed (the folder's SHAPE — the root memory re-reads the store on
// those alone). The open document re-reads itself; the folder tree refreshes.
let watcher = null;
function watchRoot() {
  if (watcher) { try { watcher.close(); } catch { /* already gone */ } watcher = null; }
  if (!root) return;
  const pending = new Map();
  try {
    watcher = require("node:fs").watch(root, { recursive: true }, (event, filename) => {
      if (!filename) return;
      const rel = String(filename).split(path.sep).join("/");
      const segs = rel.split("/");
      if (segs.some((seg) => SKIP.has(seg) || seg.startsWith("."))) return;
      // A database's journal, an editor's swap or lock file, a download in progress: side effects
      // of something running, never a change anyone opens (the folder worker skips the same).
      if (TRANSIENT.test(segs[segs.length - 1])) return;
      const p = `/${rel}`;
      // Within one burst a rename outranks a change: a file made then written is an entry made.
      const type = event === "rename" || pending.get(p)?.type === "rename" ? "rename" : "change";
      clearTimeout(pending.get(p)?.timer);
      pending.set(p, { type, timer: setTimeout(() => {
        pending.delete(p);
        if (win && !win.isDestroyed()) win.webContents.send("fs:changed", p, type);
      }, 250) });
    });
  } catch (e) {
    console.warn("folder watch failed:", e instanceof Error ? e.message : e);
  }
}

/* ── text size ──────────────────────────────────────────────────────────── */

// Type is sized in the kit itself (no default zoom here); the window still
// offers Ctrl+= / Ctrl+- / Ctrl+0 and Ctrl+wheel like a browser, and remembers
// the choice with the folder.
const DEFAULT_ZOOM = 1;
const ZOOM_STEP = 0.1;
let zoom = DEFAULT_ZOOM;

async function applyZoom(next, persist = true) {
  zoom = Math.min(3, Math.max(0.5, Math.round(next * 20) / 20));
  if (win && !win.isDestroyed()) win.webContents.setZoomFactor(zoom);
  if (persist) await saveState({ zoom });
}

const stateFile = () => path.join(app.getPath("userData"), "studio.json");
async function loadState() {
  try { return JSON.parse(await fs.readFile(stateFile(), "utf8")); } catch { return {}; }
}
async function saveState(patch) {
  const cur = await loadState();
  await fs.mkdir(path.dirname(stateFile()), { recursive: true });
  await fs.writeFile(stateFile(), JSON.stringify({ ...cur, ...patch }, null, 2));
}

/* ── paths ──────────────────────────────────────────────────────────────── */

/** A store path (`/a/b.frame`) → the absolute disk path, refusing anything that leaves the root. */
function within(storePath) {
  if (!root) throw new Error("No folder is open.");
  const rel = String(storePath ?? "/").replace(/\\/g, "/").replace(/^\/+/, "");
  const abs = path.resolve(root, rel);
  const base = path.resolve(root);
  if (abs !== base && !abs.startsWith(base + path.sep)) throw new Error(`Path leaves the open folder: ${storePath}`);
  return abs;
}
/** The absolute disk path → the store path. */
function storePathOf(abs) {
  const rel = path.relative(root, abs).split(path.sep).join("/");
  return rel ? `/${rel}` : "/";
}
const SKIP = new Set(["node_modules", ".git", ".vite", "dist", "$RECYCLE.BIN", "System Volume Information"]);
const TRANSIENT = /(\.(db-wal|db-shm|db-journal|sqlite-wal|sqlite-shm|sqlite-journal|tmp|temp|swp|swx|lock|part|crdownload)|~)$|^(~\$|\.#)/i;

async function entryOf(abs, d) {
  const st = await fs.stat(abs).catch(() => null);
  return {
    path: storePathOf(abs),
    name: d.name,
    kind: d.isDirectory() ? "folder" : "file",
    ...(st ? { updatedAt: st.mtime.toISOString(), size: d.isDirectory() ? undefined : st.size } : {}),
  };
}

/** What a listing shows: not the skipped names, not dot-folders (files such as `.env` do show). */
const shown = (d) => !SKIP.has(d.name) && !(d.name.startsWith(".") && d.isDirectory());

/** Children of a folder: folders first, then files, each alphabetical — the contract every tool shares. */
async function list(storePath) {
  const abs = within(storePath);
  const ds = (await fs.readdir(abs, { withFileTypes: true })).filter(shown);
  const out = await Promise.all(ds.map((d) => entryOf(path.join(abs, d.name), d)));
  const by = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  return [...out.filter((e) => e.kind === "folder").sort(by), ...out.filter((e) => e.kind === "file").sort(by)];
}

// The flat store: a folder's children stat together and sibling folders walk together (the
// folder worker's index(), kept in step — ~5x faster than one stat after another on a big folder).
// `from` narrows the walk to one folder's subtree (a memory that authors decisions over a
// sub-folder reads that, never the whole root).
async function index(from = "/") {
  const out = [];
  const walk = async (abs) => {
    let ds;
    try { ds = (await fs.readdir(abs, { withFileTypes: true })).filter(shown); } catch { return; }
    out.push(...(await Promise.all(ds.map((d) => entryOf(path.join(abs, d.name), d)))));
    await Promise.all(ds.filter((d) => d.isDirectory()).map((d) => walk(path.join(abs, d.name))));
  };
  await walk(within(from ?? "/"));
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/* ── the folder ─────────────────────────────────────────────────────────── */

async function setRoot(folder, openFile) {
  root = folder ? path.resolve(folder) : null;
  watchRoot();
  await saveState({ root });
  if (win && !win.isDestroyed()) {
    win.setTitle(root ? `Studio — ${root}` : "Studio");
    win.webContents.send("root:changed", root);
    if (openFile) win.webContents.send("open:path", openFile);
  }
}

async function chooseFolder() {
  const r = await dialog.showOpenDialog(win ?? undefined, { title: "Open a folder in the Studio", properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths[0]) return root;
  await setRoot(r.filePaths[0]);
  return root;
}

/** STUDIO_REMOTE_CONTENT=off: the app fetches nothing a document names from off this machine. */
const REMOTE_CONTENT = (process.env.STUDIO_REMOTE_CONTENT ?? "on").toLowerCase() !== "off";

/** `--folder <dir>`, `--folder=<dir>`, a bare folder, or a bare file (its folder opens, then it). */
async function targetFromArgs(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith("--remote-debugging") && !a.startsWith("--inspect"));
  let folder = process.env.STUDIO_FOLDER || null;
  let file = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--folder" && args[i + 1]) { folder = args[++i]; continue; }
    if (a.startsWith("--folder=")) { folder = a.slice("--folder=".length); continue; }
    if (a.startsWith("--")) continue;
    const st = await fs.stat(a).catch(() => null);
    if (!st) continue;
    if (st.isDirectory()) folder = a;
    else { folder = path.dirname(a); file = a; }
  }
  return { folder, file };
}

/* ── the window ─────────────────────────────────────────────────────────── */

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: root ? `Studio — ${root}` : "Studio",
    // The Studio's own icon (scripts/make-icon.mjs) — in dev the window would otherwise carry Electron's.
    icon: path.join(__dirname, "build", "icon.ico"),
    backgroundColor: "#fafafa",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true,
      // The page reads this off its argv (preload) and holds remote images back; the session below refuses them anyway.
      additionalArguments: REMOTE_CONTENT ? [] : ["--studio-remote-content=off"],
    },
  });
  if (!REMOTE_CONTENT) {
    // STUDIO_REMOTE_CONTENT=off: nothing a document names leaves this machine. The renderer's own files
    // (file:, studio-local:, the dev server) and the suite's ask worker on this machine pass; every other
    // http(s) request is refused at the network layer, whatever the page asked for.
    win.webContents.session.webRequest.onBeforeRequest((details, cb) => {
      const local = /^(file|studio-local|devtools|data|blob):/.test(details.url)
        || /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(details.url);
      cb({ cancel: !local });
    });
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  // A link that would replace the app with a web page (a "browse in Nodes"
  // affordance meant for the browser) opens in the browser instead.
  win.webContents.on("will-navigate", (e, url) => {
    if (/^https?:/.test(url)) { e.preventDefault(); void shell.openExternal(url); }
  });
  win.webContents.on("did-finish-load", () => {
    win.webContents.setZoomFactor(zoom);
    win.webContents.send("root:changed", root);
    if (pendingOpen) { win.webContents.send("open:path", pendingOpen); pendingOpen = null; }
  });
  // Ctrl+wheel: Chromium only reports the intent; the shell applies it.
  win.webContents.on("zoom-changed", (_e, direction) => { void applyZoom(zoom + (direction === "in" ? ZOOM_STEP : -ZOOM_STEP)); });
  const dev = process.env.STUDIO_DEV_URL;
  if (dev) void win.loadURL(dev);
  else void win.loadFile(path.join(__dirname, "renderer", "desktop.html"));
  win.on("closed", () => { win = null; });
}

/** A document action for the page: the App listens for these as `studio:action` events. */
const act = (action) => () => { if (win && !win.isDestroyed()) win.webContents.send("menu:action", action); };

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        { label: "New Document…", accelerator: "CmdOrCtrl+N", click: act("new") },
        { label: "Open Document…", click: act("open") },
        { label: "Open Folder…", accelerator: "CmdOrCtrl+Shift+O", click: () => void chooseFolder() },
        { type: "separator" },
        { label: "Save As…", click: act("save-as") },
        { label: "Rename…", click: act("rename") },
        { type: "separator" },
        { label: "Close Document", accelerator: "CmdOrCtrl+Shift+W", click: act("close") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Journey Catalog", click: act("catalog") },
        { type: "separator" },
        { role: "reload" }, { role: "toggleDevTools" },
        { type: "separator" },
        { label: "Zoom In", accelerator: "CmdOrCtrl+=", click: () => void applyZoom(zoom + ZOOM_STEP) },
        { label: "Zoom In", accelerator: "CmdOrCtrl+Plus", visible: false, click: () => void applyZoom(zoom + ZOOM_STEP) },
        { label: "Zoom In", accelerator: "CmdOrCtrl+numadd", visible: false, click: () => void applyZoom(zoom + ZOOM_STEP) },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => void applyZoom(zoom - ZOOM_STEP) },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+numsub", visible: false, click: () => void applyZoom(zoom - ZOOM_STEP) },
        { label: `Reset Zoom (${Math.round(DEFAULT_ZOOM * 100)}%)`, accelerator: "CmdOrCtrl+0", click: () => void applyZoom(DEFAULT_ZOOM) },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
  ]));
}

/* ── IPC: the file-system contract over the open folder ─────────────────── */

ipcMain.handle("root:get", () => root);
ipcMain.handle("root:choose", () => chooseFolder());
ipcMain.handle("fs:list", (_e, p) => list(p));
ipcMain.handle("fs:read", async (_e, p) => {
  const abs = within(p);
  const st = await fs.stat(abs);
  if (st.isDirectory()) throw new Error(`${p} is a folder`);
  return { path: p, content: await fs.readFile(abs, "utf8"), updatedAt: st.mtime.toISOString() };
});
ipcMain.handle("fs:write", async (_e, p, content) => {
  const abs = within(p);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, String(content ?? ""), "utf8");
});
ipcMain.handle("fs:writeBinary", async (_e, p, base64) => {
  const abs = within(p);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, Buffer.from(String(base64), "base64"));
});
ipcMain.handle("fs:mkdir", async (_e, p) => { await fs.mkdir(within(p), { recursive: true }); });
ipcMain.handle("fs:rename", async (_e, p, newName) => {
  if (!newName || /[\\/]/.test(newName)) throw new Error("Give a plain new name, no slashes");
  const abs = within(p);
  const next = path.join(path.dirname(abs), newName);
  within(storePathOf(next));
  await fs.rename(abs, next);
  return { path: storePathOf(next) };
});
ipcMain.handle("fs:remove", async (_e, p) => { await fs.rm(within(p), { recursive: true, force: true }); });
ipcMain.handle("fs:index", (_e, from) => index(from));
ipcMain.handle("shell:openExternal", (_e, url) => { if (/^https?:/.test(String(url))) return shell.openExternal(String(url)); });
ipcMain.handle("shell:showInFolder", (_e, p) => { shell.showItemInFolder(within(p)); });

/* ── lifecycle ──────────────────────────────────────────────────────────── */

// A separate profile (its own remembered folder and zoom, its own instance lock) — for tests and side-by-side runs.
if (process.env.STUDIO_USER_DATA) app.setPath("userData", process.env.STUDIO_USER_DATA);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", async (_e, argv) => {
    const t = await targetFromArgs(argv);
    if (t.folder) await setRoot(t.folder, t.file ? storePathOfIn(t.folder, t.file) : null);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    // Bytes from inside the open folder only — images behind frames, screenshots, PDFs.
    protocol.handle(SCHEME, (req) => {
      try {
        const u = new URL(req.url);
        const abs = within(decodeURIComponent(u.pathname));
        return net.fetch(pathToFileURL(abs).href);
      } catch (e) {
        return new Response(String(e instanceof Error ? e.message : e), { status: 404 });
      }
    });
    const t = await targetFromArgs(process.argv);
    const saved = await loadState();
    if (typeof saved.zoom === "number" && saved.zoom >= 0.5 && saved.zoom <= 3) zoom = saved.zoom;
    const folder = t.folder ?? saved.root ?? null;
    if (folder && (await fs.stat(folder).catch(() => null))?.isDirectory()) {
      root = path.resolve(folder);
      watchRoot();
      if (t.file) pendingOpen = storePathOfIn(root, t.file);
    }
    buildMenu();
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}

/** The store path of `file` inside `folder` (both absolute). */
function storePathOfIn(folder, file) {
  const rel = path.relative(path.resolve(folder), path.resolve(file)).split(path.sep).join("/");
  return rel && !rel.startsWith("..") ? `/${rel}` : null;
}
