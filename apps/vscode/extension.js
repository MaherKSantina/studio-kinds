/**
 * STUDIO FOR VS CODE — the Studio's document surfaces inside a custom editor.
 *
 * The webview runs the Studio renderer built for this host (apps/studio,
 * `vite build --mode vscode` → media/). VS Code owns the TEXT DOCUMENT:
 * undo, redo, dirty state, save and hot exit are all its own, so every edit
 * the surface makes comes back here as the whole document and is applied as
 * a WorkspaceEdit; edits made elsewhere (the text editor beside it) go to
 * the webview as new content. Everything else a document reaches for — the
 * files it references, the screenshots beside it, an upload — goes through
 * a small RPC over postMessage onto `vscode.workspace.fs`, rooted at the
 * document's workspace folder, so store paths look exactly as they do on
 * the shared drive and in the desktop app (`/sub/file.frame`).
 */
const vscode = require("vscode");
const path = require("node:path");
const fs = require("node:fs");

const VIEW_TYPE = "studio.document";
const SKIP = new Set(["node_modules", ".git", ".vite", "dist"]);
const dec = new TextDecoder();
const enc = new TextEncoder();

function activate(context) {
  const provider = new StudioEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.commands.registerCommand("studio.openPreview", (uri) => openWith(uri, vscode.ViewColumn.Beside)),
    vscode.commands.registerCommand("studio.open", (uri) => openWith(uri, vscode.ViewColumn.Active)),
    vscode.commands.registerCommand("studio.openSource", (uri) => {
      const target = uri instanceof vscode.Uri ? uri : vscode.window.activeTextEditor?.document.uri ?? activeCustomUri;
      if (target) return vscode.commands.executeCommand("vscode.openWith", target, "default", vscode.ViewColumn.Beside);
    }),
    vscode.commands.registerCommand("studio.catalog", () => openCatalog(context, provider)),
  );
}

/** The kinds the Studio editor takes — the custom editor's selector, as a set. */
const STUDIO_EXTS = new Set(["frame", "flow", "playbook", "plan", "guide", "brief", "points", "policy", "project", "list", "kanban",
  "calendar", "definition", "memory", "schema", "workup", "program", "tablediff", "pulse", "moves"]);

/** "Open" from inside a surface: a Studio document in its own Studio tab, any other file in its
 *  default editor, a FOLDER (a journey's pool, a memory's card) revealed in the Explorer. */
async function openStorePath(root, storePath) {
  try {
    const uri = uriOf(root, storePath);
    const st = await vscode.workspace.fs.stat(uri);
    if (st.type & vscode.FileType.Directory) { await vscode.commands.executeCommand("revealInExplorer", uri); return; }
    if (STUDIO_EXTS.has(path.extname(uri.fsPath).slice(1).toLowerCase())) {
      await vscode.commands.executeCommand("vscode.openWith", uri, VIEW_TYPE, vscode.ViewColumn.Active);
    } else {
      await vscode.commands.executeCommand("vscode.open", uri);
    }
  } catch (e) {
    void vscode.window.showWarningMessage(`Could not open ${storePath}: ${e instanceof Error ? e.message : e}`);
  }
}

/** THE JOURNEY CATALOG as its own panel — the staged-journey engine, component by component,
 *  every state live over the workspace's `/Journey Studio/demo` files (the same page as the
 *  editor's, told to show the catalog). */
function openCatalog(context, provider) {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) { void vscode.window.showInformationMessage("Open a folder first — the catalog's live states read its /Journey Studio/demo files."); return; }
  const media = vscode.Uri.joinPath(context.extensionUri, "media");
  const panel = vscode.window.createWebviewPanel("studio.catalog", "Journey catalog", vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media, root] });
  const webview = panel.webview;
  webview.html = provider.html(webview, media);
  const resourceBase = webview.asWebviewUri(root).toString();
  const post = (m) => webview.postMessage(m);
  webview.onDidReceiveMessage(async (m) => {
    switch (m?.type) {
      case "ready":
        post({ type: "init", mode: "catalog", story: null, path: "/Journey Studio/story.definition", root: root.fsPath, resourceBase, content: "" });
        break;
      case "open": await openStorePath(root, m.path); break;
      case "rpc": {
        try { post({ type: "rpc:result", id: m.id, ok: true, value: await rpc(root, m.op, Array.isArray(m.args) ? m.args : []) }); }
        catch (e) { post({ type: "rpc:result", id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) }); }
        break;
      }
    }
  });
}

/** The document the active Studio editor shows — for commands invoked from its title bar. */
let activeCustomUri = null;

function openWith(uri, column) {
  const target = uri instanceof vscode.Uri ? uri : vscode.window.activeTextEditor?.document.uri;
  if (!target) { void vscode.window.showInformationMessage("Open a Studio document first (a .flow, .frame, .playbook…)."); return; }
  return vscode.commands.executeCommand("vscode.openWith", target, VIEW_TYPE, column);
}

/* ── paths ──────────────────────────────────────────────────────────────── */

/** A store path (`/a/b.frame`) → a URI under the root, refusing anything that climbs out. */
function uriOf(root, storePath) {
  const rel = String(storePath ?? "/").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = rel ? rel.split("/") : [];
  if (parts.some((s) => s === "..")) throw new Error(`Path leaves the folder: ${storePath}`);
  return parts.length ? vscode.Uri.joinPath(root, ...parts) : root;
}
/** A URI under the root → its store path. */
function storePathOf(root, uri) {
  const rel = path.relative(root.fsPath, uri.fsPath).split(path.sep).join("/");
  return rel ? `/${rel}` : "/";
}
const joinStore = (dir, name) => (dir === "/" ? `/${name}` : `${dir}/${name}`);
const normalizeStore = (p) => { const s = "/" + String(p ?? "/").replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""); return s === "//" ? "/" : s; };

/* ── the file system, rooted at the workspace folder ────────────────────── */

async function entryOf(root, dir, name, type) {
  const p = joinStore(dir, name);
  const folder = (type & vscode.FileType.Directory) !== 0;
  let st = null;
  try { st = await vscode.workspace.fs.stat(uriOf(root, p)); } catch { /* unreadable: no times */ }
  return { path: p, name, kind: folder ? "folder" : "file", ...(st ? { updatedAt: new Date(st.mtime).toISOString(), ...(folder ? {} : { size: st.size }) } : {}) };
}

/** Children of a folder: folders first, then files, each alphabetical — the contract every tool shares. */
async function list(root, storePath) {
  const dir = normalizeStore(storePath);
  const entries = await vscode.workspace.fs.readDirectory(uriOf(root, dir));
  const out = [];
  for (const [name, type] of entries) {
    if (SKIP.has(name) || (name.startsWith(".") && (type & vscode.FileType.Directory))) continue;
    out.push(await entryOf(root, dir, name, type));
  }
  const by = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  return [...out.filter((e) => e.kind === "folder").sort(by), ...out.filter((e) => e.kind === "file").sort(by)];
}

// `from` narrows the walk to one folder's subtree (a memory that authors decisions over a
// sub-folder reads that, never the whole workspace).
async function index(root, from = "/") {
  const out = [];
  const walk = async (dir) => {
    let entries;
    try { entries = await vscode.workspace.fs.readDirectory(uriOf(root, dir)); } catch { return; }
    for (const [name, type] of entries) {
      if (SKIP.has(name) || (name.startsWith(".") && (type & vscode.FileType.Directory))) continue;
      const e = await entryOf(root, dir, name, type);
      out.push(e);
      if (e.kind === "folder") await walk(e.path);
    }
  };
  await walk(normalizeStore(from || "/"));
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Make every folder on the way to `storePath`'s parent exist. */
async function ensureParent(root, storePath) {
  const parts = normalizeStore(storePath).split("/").filter(Boolean);
  parts.pop();
  let dir = "/";
  for (const part of parts) {
    dir = joinStore(dir, part);
    try { await vscode.workspace.fs.createDirectory(uriOf(root, dir)); } catch { /* exists */ }
  }
}

async function rpc(root, op, args) {
  const wfs = vscode.workspace.fs;
  switch (op) {
    case "list": return list(root, args[0]);
    case "read": {
      const u = uriOf(root, args[0]);
      const st = await wfs.stat(u);
      if (st.type & vscode.FileType.Directory) throw new Error(`${args[0]} is a folder`);
      return { path: args[0], content: dec.decode(await wfs.readFile(u)), updatedAt: new Date(st.mtime).toISOString() };
    }
    case "write": {
      await ensureParent(root, args[0]);
      await wfs.writeFile(uriOf(root, args[0]), enc.encode(String(args[1] ?? "")));
      return null;
    }
    case "writeBinary": {
      await ensureParent(root, args[0]);
      await wfs.writeFile(uriOf(root, args[0]), new Uint8Array(Buffer.from(String(args[1] ?? ""), "base64")));
      return null;
    }
    case "mkdir": {
      await ensureParent(root, joinStore(normalizeStore(args[0]), "x"));
      await wfs.createDirectory(uriOf(root, args[0]));
      return null;
    }
    case "rename": {
      const from = normalizeStore(args[0]);
      const name = String(args[1] ?? "");
      if (!name || /[\\/]/.test(name)) throw new Error("Give a plain new name, no slashes");
      const parent = from.slice(0, from.lastIndexOf("/")) || "/";
      const to = joinStore(parent, name);
      await wfs.rename(uriOf(root, from), uriOf(root, to), { overwrite: false });
      return { path: to };
    }
    case "remove": {
      await wfs.delete(uriOf(root, args[0]), { recursive: true, useTrash: true });
      return null;
    }
    case "index": return index(root, args[0]);
    default: throw new Error(`unknown op ${op}`);
  }
}

/* ── the custom editor ──────────────────────────────────────────────────── */

class StudioEditorProvider {
  constructor(context) { this.context = context; }

  /** The folder a document's store is rooted at: its workspace folder, else its own folder. */
  rootOf(uri) {
    return vscode.workspace.getWorkspaceFolder(uri)?.uri ?? vscode.Uri.file(path.dirname(uri.fsPath));
  }

  async resolveCustomTextEditor(document, panel) {
    const root = this.rootOf(document.uri);
    const media = vscode.Uri.joinPath(this.context.extensionUri, "media");
    const webview = panel.webview;
    webview.options = { enableScripts: true, localResourceRoots: [media, root] };
    webview.html = this.html(webview, media);

    const storePath = storePathOf(root, document.uri);
    const resourceBase = webview.asWebviewUri(root).toString();
    const post = (m) => webview.postMessage(m);
    let lastFromWebview = null;

    const changes = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      const text = e.document.getText();
      if (text !== lastFromWebview) post({ type: "content", content: text });
    });
    const focus = panel.onDidChangeViewState((e) => { if (e.webviewPanel.active) activeCustomUri = document.uri; });
    if (panel.active) activeCustomUri = document.uri;
    panel.onDidDispose(() => { changes.dispose(); focus.dispose(); if (activeCustomUri === document.uri) activeCustomUri = null; });

    webview.onDidReceiveMessage(async (m) => {
      switch (m?.type) {
        case "ready":
          post({ type: "init", path: storePath, root: root.fsPath, resourceBase, content: document.getText() });
          break;
        case "edit": {
          const next = String(m.content ?? "");
          if (next === document.getText()) break;
          lastFromWebview = next;
          const edit = new vscode.WorkspaceEdit();
          edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), next);
          await vscode.workspace.applyEdit(edit);
          break;
        }
        case "open":
          // "Open in the Studio" from inside a document (a project's item, a memory's card, a journey's pool).
          await openStorePath(root, m.path);
          break;
        case "rpc": {
          try { post({ type: "rpc:result", id: m.id, ok: true, value: await rpc(root, m.op, Array.isArray(m.args) ? m.args : []) }); }
          catch (e) { post({ type: "rpc:result", id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) }); }
          break;
        }
      }
    });
  }

  /** The built renderer page, its assets re-based onto webview URIs, under a CSP. */
  html(webview, media) {
    const file = path.join(media.fsPath, "vscode.html");
    if (!fs.existsSync(file)) {
      return `<!doctype html><html><body style="font: 13px system-ui; padding: 24px">The Studio renderer is not built. Run <code>pnpm vscode:renderer</code> in the suite workspace, then reload.</body></html>`;
    }
    let html = fs.readFileSync(file, "utf8");
    const base = webview.asWebviewUri(media).toString();
    const nonce = Array.from({ length: 24 }, () => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 62)]).join("");
    html = html.replace(/(src|href)="\.\/(assets\/[^"]+)"/g, (_m, attr, rel) => `${attr}="${base}/${rel}"`);
    html = html.replace(/<script /g, `<script nonce="${nonce}" `);
    // Monaco (the flow's raw pane) loads itself from jsdelivr; the Ask panels talk to the ask worker on this machine.
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data: blob:`,
      `style-src ${webview.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net`,
      `font-src ${webview.cspSource} data: https://cdn.jsdelivr.net`,
      `script-src 'nonce-${nonce}' ${webview.cspSource} https://cdn.jsdelivr.net`,
      `connect-src ${webview.cspSource} http://127.0.0.1:9250 http://localhost:9250 https://cdn.jsdelivr.net`,
      "worker-src blob: https://cdn.jsdelivr.net",
      "child-src blob:",
      "frame-src blob: https://maps.google.com https://www.google.com",
    ].join("; ");
    html = html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`);
    return html;
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
