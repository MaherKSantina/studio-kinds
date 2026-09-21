/**
 * THE STUDIO INSIDE VS CODE — one document's surface in a custom-editor
 * webview. VS Code owns the text document: this page shows the surface for
 * the text it is given and posts every edit back as the whole document; a
 * change made elsewhere (the text editor beside it) arrives as new content.
 * The files a document reaches for go through the extension's RPC onto the
 * workspace folder (lib/vscodeBridge.ts); bytes load as webview resource
 * URIs under that folder. The same page also serves the JOURNEY CATALOG as
 * a panel (init `mode: "catalog"`): the staged-journey engine, component by
 * component, live over the workspace's /Journey Studio/demo files.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { askApi } from "crosscut";
import { STUDIO_OPEN_EVENT, type StudioOpenRequest, configureFileKinds, isActiveStudioDialog, registerStudioDialog } from "filekinds";
import { KindSurface } from "./components/KindSurface";
import { blobToBase64 } from "./lib/desktopFs";
import { onHostMessage, post, rpc, vscodeFs } from "./lib/vscodeBridge";
import "./index.css";

/** The webview URI of the workspace folder — bytes (screenshots, images) load beneath it. */
let resourceBase = "";
const fs = vscodeFs();

configureFileKinds({
  readFile: (abs) => fs.read(abs).then((r) => r.content),
  rawFileUrl: (abs) => `${resourceBase}${encodeURI(abs.startsWith("/") ? abs : `/${abs}`)}`,
  listFiles: (abs) => fs.list(abs),
  writeFile: (abs, content) => fs.write(abs, content),
  mkdir: (abs) => fs.mkdir(abs),
  renameFile: (abs, name) => fs.rename(abs, name),
  removeFile: (abs) => fs.remove(abs),
  writeBinary: async (abs, blob) => { await rpc("writeBinary", abs, await blobToBase64(blob)); },
  indexFiles: (from) => rpc("index", from),
  // The suite's ask worker, when it runs on this machine; the panels say so when it does not.
  ask: askApi("http://127.0.0.1:9250"),
  // The extension's `studio.remoteContent` setting, written into the page as a <meta> beside the CSP that enforces it.
  remoteContent: document.querySelector('meta[name="studio-remote-content"]')?.getAttribute("content") !== "off",
});

// The catalog page pulls the whole journey engine — loaded when it is opened, not with every document.
const JourneyCatalog = React.lazy(() => import("filekinds/catalog"));

function Document() {
  const [doc, setDoc] = React.useState<{ path: string; content: string } | null>(null);
  const [catalog, setCatalog] = React.useState<{ story: string | null } | null>(null);
  const lastSent = React.useRef<string | null>(null);

  React.useEffect(() => {
    const off = onHostMessage((m) => {
      if (m.type === "init") {
        resourceBase = m.resourceBase;
        if (m.mode === "catalog") setCatalog({ story: m.story ?? null });
        else setDoc({ path: m.path, content: m.content });
      }
      else if (m.type === "content" && m.content !== lastSent.current) setDoc((d) => (d ? { ...d, content: m.content } : d));
    });
    // "Open in the Studio" from inside a document (a project's item): VS Code opens that file in its own tab.
    const me = registerStudioDialog();
    const onOpen = (e: Event) => {
      if (!isActiveStudioDialog(me.id)) return;
      const url = (e as CustomEvent<StudioOpenRequest>).detail.url;
      const qi = url.indexOf("?");
      const p = new URLSearchParams(qi >= 0 ? url.slice(qi) : "").get("path");
      if (p) post({ type: "open", path: p });
    };
    window.addEventListener(STUDIO_OPEN_EVENT, onOpen);
    post({ type: "ready" });
    return () => { off(); window.removeEventListener(STUDIO_OPEN_EVENT, onOpen); me.unregister(); };
  }, []);

  const onChange = (next: string) => {
    lastSent.current = next;
    setDoc((d) => (d ? { ...d, content: next } : d));
    post({ type: "edit", content: next });
  };

  if (catalog) {
    return (
      <div className="h-screen bg-background text-foreground" style={{ height: "100vh" }}>
        <React.Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading the catalog…</div>}>
          <JourneyCatalog storyId={catalog.story} onPick={(id: string | null) => setCatalog({ story: id })} />
        </React.Suspense>
      </div>
    );
  }
  if (!doc) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="h-screen bg-background text-foreground" style={{ height: "100vh" }}>
      <KindSurface path={doc.path} content={doc.content} onChange={onChange} onOpenPath={(p) => post({ type: "open", path: p })} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Document />
  </React.StrictMode>,
);
