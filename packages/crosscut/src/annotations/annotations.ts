/**
 * Annotations — explanations pinned to specific components of a preview.
 *
 * A preview publishes stable TARGET ids for its parts ("event:fund",
 * "answer:entity=pty", "step:record-loan"); an annotation set maps targets to
 * content. The AnnotationLayer renders the overlay; this module is the pure
 * data half.
 */

export interface Annotation {
  /** What this annotation is pinned to — a target id the preview publishes. */
  target: string;
  title?: string;
  /** Markdown body (rendered by the host's renderer; plain text fallback). */
  body?: string;
  /** Bullet items. */
  items?: string[];
  /** A file whose kind renders the annotation (a brief, a list…), resolved
   *  relative to the annotated document by the host's renderer. */
  file?: string;
}

export const annotationsFor = (all: Annotation[], target: string): Annotation[] =>
  all.filter((a) => a.target === target);

export const annotatedTargets = (all: Annotation[]): Set<string> =>
  new Set(all.map((a) => a.target));
