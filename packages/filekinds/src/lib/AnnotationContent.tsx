/**
 * The registry-powered annotation renderer: markdown bodies through
 * MarkdownPane, bullet items, and `file:` refs rendered READ-ONLY by whatever
 * kind owns them — a brief, a list, another guide. Pass to AnnotationProvider:
 *
 *   renderAnnotation={annotationRendererFor(docPath)}
 */
import React, { useEffect, useState } from "react";
import type { Annotation } from "crosscut";
import { readVirtualDirectoryFile } from "../api";
import { MarkdownPane } from "./MarkdownPane";
import { previewForPath } from "./filePreviews";

/** Load a referenced file and render it read-only by its kind — reusable by
 *  any pane that wants "show this file inline". */
export function InlineFile({ base, file, height = 320 }: { base: string; file: string; height?: number | string }) {
  const [content, setContent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    readVirtualDirectoryFile(base, file).then(
      (r) => { if (!stale) setContent(r.content); },
      (e: unknown) => { if (!stale) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { stale = true; };
  }, [base, file]);
  const kind = previewForPath(file);
  if (err) return <p style={{ fontSize: 12, color: "#dc2626" }}>{err}</p>;
  if (content === null) return <p style={{ fontSize: 12, color: "#888" }}>Loading {file}…</p>;
  if (!kind) return <pre style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{content}</pre>;
  return (
    <div style={{ height, overflow: "hidden", border: "1px solid var(--border, #e2e5eb)", borderRadius: 8 }}>
      <kind.Renderer content={content} height="100%" agentId={base} path={file} />
    </div>
  );
}

export function annotationRendererFor(docPath: string): (a: Annotation) => React.ReactNode {
  const R = (a: Annotation) => (
    <>
      {a.body && (
        <div className="text-sm" style={{ margin: "0 -20px" }}>
          <MarkdownPane content={a.body} height="auto" />
        </div>
      )}
      {!!a.items?.length && (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {a.items.map((it, j) => <li key={j}>{it}</li>)}
        </ul>
      )}
      {a.file && <InlineFile base={docPath} file={a.file} />}
    </>
  );
  return R;
}
