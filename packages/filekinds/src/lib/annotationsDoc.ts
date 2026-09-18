/**
 * `<file>.annotations` — the sidecar that pins explanations onto a document's
 * components. YAML list; lenient like every doc parser here.
 *
 *   - target: answer:entity=pty        # a target id the preview publishes
 *     title: Why Pty Ltd matters
 *     body: |                          # markdown
 *       ...
 *     items: [ ... ]                   # bullet list
 *     file: money/settle-up.brief      # rendered by its kind, relative to the doc
 */
import yaml from "js-yaml";
import type { Annotation } from "crosscut";

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export function parseAnnotations(text: string): Annotation[] {
  let raw: unknown = [];
  try { raw = yaml.load(text); } catch { /* unparseable reads as none */ }
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { annotations?: unknown[] })?.annotations) ? (raw as { annotations: unknown[] }).annotations : [];
  return list.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const target = str(o.target);
    if (!target) return [];
    return [{
      target,
      ...(str(o.title) ? { title: str(o.title)! } : {}),
      ...(str(o.body) ? { body: str(o.body)! } : {}),
      ...(Array.isArray(o.items) ? { items: o.items.filter((i): i is string => typeof i === "string") } : {}),
      ...(str(o.file) ? { file: str(o.file)! } : {}),
    }];
  });
}

/** Sidecar path for a document. */
export const annotationsPathFor = (docPath: string): string => `${docPath}.annotations`;
