import { Suspense } from "react";
import { previewForPath } from "filekinds";

/**
 * The document rendered by the Studio's own renderer for its kind — the same component the web
 * Studio, the desktop app and the VS Code extension mount. The registry picks it by the file name's
 * extension; a kind it has no renderer for is shown as written.
 */
export default function Preview({ name, text }: { name: string; text: string }) {
  const def = previewForPath(name);
  if (!def) {
    return (
      <div className="raw-wrap">
        <div className="muted note">The Studio has no renderer for this kind; the text is shown as written. `studio-check` reads it.</div>
        <pre className="raw">{text}</pre>
      </div>
    );
  }
  const Renderer = def.Renderer;
  return (
    <Suspense fallback={<div className="muted" style={{ padding: 12 }}>Loading the {def.label.toLowerCase()} view…</div>}>
      <Renderer content={text} height="100%" path={`/${name}`} chromeless />
    </Suspense>
  );
}
