/**
 * A `.schema` document — the SHAPE half of a structured node (`*.node`
 * folder: one `schema` child + one `content` child).
 *
 * The schema declares:
 *  - `type` — which view draws it (kanban today; gantt and friends later);
 *  - ENTRIES with STABLE IDS — the shape's slots. Labels may be reworded
 *    freely; the id is the contract the content references, forever;
 *  - `field` — the content field carrying the reference (defaults per type,
 *    kanban → "column").
 *
 * Kanban spelling (columns: is the type's alias for entries:):
 *
 *   type: kanban
 *   title: Job applications
 *   columns:
 *     - {id: triage, label: Triage, detail: "being analyzed"}
 *     - {id: applied, label: Applied}
 *
 * Content rows then carry `column: triage` — the ID, never the label.
 */
import yaml from "js-yaml";
import type { DocListItem } from "./listDoc";

export interface SchemaEntry {
  /** The stable id content references. Never rename; relabel instead. */
  id: string;
  label: string;
  detail?: string;
  /** Composite streams — WHO authors this stream's changes: "observed" (the
   *  world, via a sync), "derived" (my rules, via a policy), "authored" (my
   *  process, via moves). The driver decides the staleness semantics. */
  driver?: string;
  /** Composite: where observed content comes from, as prose ("Indeed scrape"). */
  source?: string;
  /** Composite: the file that produces or owns this stream (a .policy for a
   *  derived stream, the process board for an authored one). */
  via?: string;
  /** Composite: the stream id a derived stream reads — its input. */
  of?: string;
  /** Composite: expected refresh cadence of an observed stream — "daily",
   *  "weekly", "monthly", or "<n>d". */
  cadence?: string;
}

export interface SchemaDoc {
  /** The view family: "kanban", "gantt", … Free-form; unknown types render
   *  generically (the shape is still legible without a dedicated view). */
  type: string;
  title: string;
  /** The content field whose value is an entry id. */
  field: string;
  /** Presentation hint. "compact" strips a composite board to the dimension
   *  labels and their folded key/values — no driver/staleness/provenance
   *  chrome, for nodes whose streams are plain domains rather than synced
   *  pipelines. */
  display?: string;
  entries: SchemaEntry[];
}

/** Per-type defaults for the referencing field. */
const DEFAULT_FIELD: Record<string, string> = { kanban: "column", composite: "stream" };

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

export function parseSchemaDoc(text: string): SchemaDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  const type = (str(raw.type) ?? "").toLowerCase();
  // `entries:` is the generic spelling; a type may alias it (kanban: columns,
  // composite: streams).
  const listed = Array.isArray(raw.entries) ? raw.entries
    : Array.isArray(raw.columns) ? raw.columns
      : Array.isArray(raw.streams) ? raw.streams
        : [];
  const entries = listed.map((x) => {
    const o = rec(x);
    const id = str(o.id);
    if (!id) return null; // a slot without a stable id cannot be referenced
    const opt = (k: "detail" | "driver" | "source" | "via" | "of" | "cadence") =>
      (str(o[k]) ? { [k]: str(o[k])! } : {});
    return {
      id,
      label: str(o.label) ?? id,
      ...opt("detail"), ...opt("driver"), ...opt("source"), ...opt("via"), ...opt("of"), ...opt("cadence"),
    };
  }).filter((e): e is SchemaEntry => e !== null);
  return {
    type,
    title: str(raw.title) ?? "Schema",
    field: str(raw.field) ?? DEFAULT_FIELD[type] ?? "ref",
    ...(str(raw.display) ? { display: str(raw.display)!.toLowerCase() } : {}),
    entries,
  };
}

/** The composed join: content rows under their schema entry, in schema
 *  order; rows whose reference matches no entry (or is missing) land in
 *  `unfiled` — visible, never dropped. */
export function contentByEntry(
  schema: SchemaDoc,
  items: DocListItem[],
): { groups: { entry: SchemaEntry; items: DocListItem[] }[]; unfiled: DocListItem[] } {
  const byId = new Map(schema.entries.map((e) => [e.id, [] as DocListItem[]]));
  const unfiled: DocListItem[] = [];
  for (const it of items) {
    const ref = it.fields?.[schema.field]?.trim();
    const bucket = ref ? byId.get(ref) : undefined;
    if (bucket) bucket.push(it);
    else unfiled.push(it);
  }
  return {
    groups: schema.entries.map((entry) => ({ entry, items: byId.get(entry.id)! })),
    unfiled,
  };
}

/** The two halves of a structured node among its folder's children: the
 *  file whose STEM is `schema` and the one whose stem is `content`, any
 *  extension. Null halves render as explicit gaps, never as crashes. */
export function splitHalvesOf(
  children: { name: string; kind: "folder" | "file" }[],
): { schema: string | null; content: string | null } {
  const stem = (n: string) => (n.includes(".") ? n.slice(0, n.indexOf(".")) : n).toLowerCase();
  const find = (want: string) => children.find((c) => c.kind === "file" && stem(c.name) === want)?.name ?? null;
  return { schema: find("schema"), content: find("content") };
}
