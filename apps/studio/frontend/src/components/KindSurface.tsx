/**
 * ONE DOCUMENT'S SURFACE — what every host mounts once it holds a document's
 * text: the kind's PREVIEW (the surface a memory's card shows; an unknown
 * extension shows as text inside it), or the host's note for bytes. The same
 * in the web Studio, the desktop app and the VS Code extension — the choice
 * is the `studio-surface` golden table, and it no longer mounts editors.
 */
import * as React from "react";
import { decide } from "crosscut";
import { DocumentPreview, type FileKindDef, previewForPath } from "filekinds";
import { type SurfaceVerdict, surfaceCtxOf, surfaceRules } from "../lib/surfaceRules";

export const surfaceFor = (kind: FileKindDef | undefined): SurfaceVerdict["surface"] => decide(surfaceRules, surfaceCtxOf(kind)).outcome.surface;

export function KindSurface({ path, content, onChange, binary, onOpenPath }: {
  path: string;
  content: string;
  /** What the preview offers (a lock, a tick) persists through this — the host autosaves. */
  onChange: (next: string) => void;
  /** What to show for bytes (pdf, workbook) — hosts differ in where those can be viewed. */
  binary?: React.ReactNode;
  /** The document asks to open ANOTHER one (a memory's card): the host navigates. */
  onOpenPath?: (path: string) => void;
}) {
  const surface = surfaceFor(previewForPath(path));
  if (surface === "binary") return <>{binary ?? <div className="m-6 text-sm text-muted-foreground">{path.slice(path.lastIndexOf("/") + 1)} is bytes, not text — there is nothing to show here.</div>}</>;
  // `onChange` without `editable`: what the preview offers (a lock, a tick) persists; the
  // renderer's own authoring affordances (a playbook's Edit / Ask strip) stay hidden.
  return <DocumentPreview key={path} path={path} content={content} onChange={onChange} editable={false} onOpenPath={onOpenPath} />;
}
