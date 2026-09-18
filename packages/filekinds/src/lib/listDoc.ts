/**
 * A `.list` node — a LIST OF DOCUMENTS that is an entity by itself.
 *
 * Born from the multiple-producers rule: when several streams target one
 * thing, that thing graduates to its own node. The legal documents are the
 * first: streams save documents into this node one by one (each output point
 * targets `item:0` … `item:last`), other streams take the whole node as an
 * input stage, and opening it shows the list with each document a click away.
 *
 * Authoring shape (YAML, lenient):
 *
 *   title: Legal documents
 *   description?: ...
 *   items:
 *     - {label: Incorporation, file: incorporation.brief}   # a document, by ref (relative to this file's folder)
 *     - {label: A row without a file, status: done}        # any other key is a field of the row
 */
import yaml from "js-yaml";

export interface DocListItem {
  /** The document. Rows without a file render as plain labels. */
  file?: string;
  label?: string;
  /** Exported to the outside — a project hierarchy shows this item as a
   *  child of the list node. */
  export?: boolean;
  /** TYPED per-item fields (a workup's classify step, any producer that
   *  stamps structure onto rows): every extra scalar key on the item, as
   *  strings. The viewer renders them as chips and filters on them; the
   *  register projects them into the database. */
  fields?: Record<string, string>;
  /** Typed reference edges: `refs: [{kind, to}]` — cross-references a row
   *  makes ("subject_to" → "9"). */
  refs?: { kind: string; to: string }[];
}

/** One list feeding a MERGED list: its path, and the short name its rows
 *  carry as their `source` field. */
export interface DocListSource {
  list: string;
  label?: string;
}

export interface DocListDoc {
  title: string;
  description?: string;
  items: DocListItem[];
  /** Other `.list` nodes whose items this list COLLATES — read live, never
   *  copied, each merged row tagged with its origin. A sourced list's own
   *  `sources` are not followed (one hop only). */
  sources: DocListSource[];
  /** With sources: rows sharing this field's value (or the label, for
   *  "label") collapse into one, and the survivor's `source` names every
   *  list it was found in. */
  dedupeBy?: string;
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

export function parseDocList(text: string): DocListDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  return {
    title: str(raw.title) ?? "List",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    sources: arr(raw.sources).map((x) => {
      if (typeof x === "string") return { list: x };
      const o = rec(x);
      const l = str(o.list) ?? str(o.file) ?? str(o.path);
      return l ? { list: l, ...(str(o.label) ? { label: str(o.label)! } : {}) } : null;
    }).filter(Boolean) as DocListSource[],
    ...(str(raw.dedupeBy) ? { dedupeBy: str(raw.dedupeBy)! } : {}),
    items: arr(raw.items).map((x) => {
      if (typeof x === "string") return { label: x };
      const o = rec(x);
      const file = str(o.file);
      const label = str(o.label) ?? str(o.text) ?? str(o.title);
      if (!file && !label) return null;
      // Every extra SCALAR key is a typed field; `refs` is the edge list.
      // `text`/`title` are label FALLBACKS — reserved only while standing in
      // for the label. A row with its own `label:` keeps `title:` as an
      // ordinary field (a job ad's title is data, not the row's name).
      const RESERVED = new Set(["file", "label", "text", "export", "refs"]);
      if (str(o.label) === undefined && str(o.text) === undefined) RESERVED.add("title");
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(o)) {
        if (RESERVED.has(k)) continue;
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") fields[k] = String(v);
        // YAML reads a bare ISO date (at: 2026-09-01) as a Date object — keep
        // the date the author wrote instead of dropping the value.
        else if (v instanceof Date) fields[k] = v.toISOString().slice(0, 10);
      }
      const refs = arr(o.refs).map((r) => {
        const ro = rec(r);
        const kind = str(ro.kind);
        const to = str(ro.to);
        return kind && to ? { kind, to } : null;
      }).filter(Boolean) as { kind: string; to: string }[];
      return {
        ...(file ? { file } : {}),
        ...(label ? { label } : {}),
        ...(o.export === true ? { export: true } : {}),
        ...(Object.keys(fields).length ? { fields } : {}),
        ...(refs.length ? { refs } : {}),
      };
    }).filter(Boolean) as DocListItem[],
  };
}

export function dumpDocList(doc: DocListDoc): string {
  return yaml.dump({
    title: doc.title,
    ...(doc.description ? { description: doc.description } : {}),
    ...(doc.sources.length ? { sources: doc.sources.map((s) => ({ list: s.list, ...(s.label ? { label: s.label } : {}) })) } : {}),
    ...(doc.dedupeBy ? { dedupeBy: doc.dedupeBy } : {}),
    items: doc.items.map((i) => ({
      ...(i.file ? { file: i.file } : {}),
      ...(i.label ? { label: i.label } : {}),
      ...(i.export ? { export: true } : {}),
      ...(i.fields ?? {}),
      ...(i.refs?.length ? { refs: i.refs.map((r) => ({ kind: r.kind, to: r.to })) } : {}),
    })),
  }, { lineWidth: -1, noRefs: true });
}

/** Resolve an item spec from a point target: "last", or a 0-based index. */
export function itemAt(doc: DocListDoc, spec: string): { item: DocListItem; index: number } | null {
  const idx = spec === "last" ? doc.items.length - 1 : Number(spec);
  if (!Number.isInteger(idx) || idx < 0 || idx >= doc.items.length) return null;
  return { item: doc.items[idx], index: idx };
}

/** The items a project hierarchy may show as children of the list node. */
export const exportedItems = (doc: DocListDoc): { item: DocListItem; index: number }[] =>
  doc.items.map((item, index) => ({ item, index })).filter(({ item }) => item.export && item.file);

