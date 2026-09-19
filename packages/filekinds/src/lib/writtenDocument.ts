/**
 * A DOCUMENT WRITTEN INSIDE ANOTHER — the shape a playbook event's `content`
 * and a brief section's `content` share.
 *
 * There is no file, so there is no extension to pick a renderer from: `kind`
 * names the engine that renders `doc`, and `doc` is the document exactly as a
 * file of that kind would hold it — as that kind's YAML parses it, or its text
 * for `md`. A viewer takes the text back (`docText`) under a synthetic path
 * (`writtenPath`, `inline.brief`) that the file-kind registry resolves as it
 * would a real `x.brief`. Nothing is read from disk to show it, so a written
 * document carries no annotations and is never pinned; a document two files
 * share is written in each.
 *
 *     content:
 *       kind: playbook          # any kind the Studio knows: brief, playbook, kanban, md, …
 *       doc:                    # the document, as a file of that kind would hold it
 *         version: 2
 *         events: [...]
 *
 * The checker runs each written document through its own kind's engine, so a
 * broken kanban inside a brief fails the brief.
 */
import yaml from "js-yaml";

export interface WrittenDocument {
  /** The kind that renders `doc`: lower-cased, no leading dot. Empty when the entry names none. */
  kind: string;
  /** The document, as its kind's YAML parses it; a string for `md`. */
  doc: unknown;
}

/** A kind as written (`.Brief`, `brief`) to the key the registry knows (`brief`); undefined when absent. */
export const writtenKind = (v: unknown): string | undefined =>
  typeof v === "string" && v ? v.replace(/^\./, "").toLowerCase() : undefined;

/** A path the registry can pick a renderer from — synthetic, since there is no file. */
export const writtenPath = (kind?: string): string => `inline.${kind || "md"}`;

/** The text a renderer takes for a written document: as YAML, or as is when it is a string. */
export const docText = (d: unknown): string =>
  typeof d === "string" ? d : yaml.dump(d ?? {}, { lineWidth: -1, noRefs: true });
