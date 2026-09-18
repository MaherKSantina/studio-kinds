/**
 * THE preview surface — the whole thing the Studio's preview dialog shows, as one
 * reusable component: the control strip (doc name · Diff · Notes), the
 * chromeless interactive renderer under the annotation layer, and the A/B
 * diff view. Any tool that wants "the preview" hosts exactly this: the studio
 * dialog does, and so does the nodes explorer's right pane.
 */
import React, { useEffect, useState } from "react";
import { NotebookPen } from "lucide-react";
import { Annotation, AnnotationProvider, cn, extensionOf, nameOf } from "crosscut";
import { readVirtualDirectoryFile } from "../api";
import { annotationRendererFor } from "../lib/AnnotationContent";
import { annotationsPathFor, parseAnnotations } from "../lib/annotationsDoc";
import { previewForPath } from "../lib/filePreviews";

export function DocumentPreview({ path, content, onChange, editable = !!onChange, trailing, className, onElementJump, onOpenPath }: {
  onElementJump?: (el: { kind: "decision" | "event"; key: string; label: string }) => void;
  /** Absolute path of the document in the shared file system. */
  path: string;
  content: string;
  /** Present = interactions persist (the host autosaves); absent = local exploration. */
  onChange?: (next: string) => void;
  /** Whether the renderer may offer its AUTHORING affordances (a playbook's Edit and Ask, a
   *  kanban's task editing). Default: whenever `onChange` is present. A host that persists what
   *  a preview offers (a lock, a tick) but authors nowhere passes `onChange` with `editable={false}`. */
  editable?: boolean;
  /** The document asks to open ANOTHER one (a memory's card): a host that navigates passes it. */
  onOpenPath?: (path: string) => void;
  /** Host controls appended to the strip's right (a close button, a toggle…). */
  trailing?: React.ReactNode;
  className?: string;
}) {
  const kind = previewForPath(path);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotating, setAnnotating] = useState(false);

  // The sidecar `<doc>.annotations` powers the Notes overlay; absent = none.
  useEffect(() => {
    let stale = false;
    setAnnotating(false);
    readVirtualDirectoryFile(path, annotationsPathFor(path)).then(
      (r) => { if (!stale) setAnnotations(parseAnnotations(r.content)); },
      () => { if (!stale) setAnnotations([]); },
    );
    return () => { stale = true; };
  }, [path]);

  const pill = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string, title: string) => (
    <button type="button" title={title} onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] font-medium",
        active ? "border-transparent bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
      )}>
      {icon} {label}
    </button>
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex h-7 shrink-0 items-center gap-2 border-b px-3">
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{nameOf(path)}</span>
        {annotations.length > 0 &&
          pill(annotating, () => setAnnotating((v) => !v), <NotebookPen className="size-3" />, "Notes",
               annotating ? "Hide annotations" : `Show annotations (${annotations.length})`)}
        {trailing}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {kind ? (
          <AnnotationProvider annotations={annotations} active={annotating}
            renderAnnotation={annotationRendererFor(path)}>
            <kind.Renderer onElementJump={onElementJump} content={content} height="100%" agentId={path} path={path} chromeless
              editable={editable} onChange={onChange} onOpenPath={onOpenPath} />
          </AnnotationProvider>
        ) : (
          <pre className="h-full overflow-auto p-4 font-mono text-[12px] leading-5">{content}</pre>
        )}
      </div>
    </div>
  );
}
