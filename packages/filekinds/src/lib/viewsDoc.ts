/**
 * The `.views` kind — ONE LIST OF ITEMS in the file and the views over it.
 * `items` are mappings, each with an id; `fields` says which item key plays
 * which ROLE — id, title, status, start, end, previous, parent — and `views`
 * says which views the file offers, each over the items its own `filter`
 * keeps. Without `views`, the roles decide: a table always; a kanban when a
 * key is the `status`; a calendar when a key is the `start` (with `end` when
 * there is one); a gantt when `start`, `end` and `previous` or `parent` are
 * named; a dependency tree when `previous` is. A PAGE is a view the file
 * names with a Nunjucks `template` of its own: the view's items rendered as
 * HTML in the frame a `.page` renders in — the roles never offer one. The
 * views READ the items and write nothing; which view is open is the page's
 * for the session.
 *
 *   title: Launch
 *   fields:                   # item key → role; a role absent = the views that need it absent
 *     id: id                  # what identifies an item (default `id`)
 *     title: title            # what an item is labelled by (default `title`)
 *     status: status          # → Kanban
 *     start: start            # a date, YYYY-MM-DD → Calendar; with end + previous/parent, Gantt
 *     end: end
 *     previous: after         # the id(s) of what comes before → Tree
 *     parent: under           # the id of the item this one is part of → nested in the Gantt
 *   columns: [To do, Doing, Done]    # the statuses in order; absent = the values found
 *   views:                    # optional — absent = every view the roles allow, the table first
 *     - {key: open, kind: kanban, label: Open work, filter: [{field: status, op: not_equals, value: Done}]}
 *     - {key: plan, kind: gantt}
 *     - {key: report, kind: page, template: "{% for item in items %}<p>{{ item.title }}</p>{% endfor %}"}
 *   items:
 *     - {id: plan, title: Plan the launch, status: Done, start: 2026-10-01, end: 2026-10-03}
 *     - {id: build, title: Build it, status: Doing, start: 2026-10-04, end: 2026-10-10, after: plan}
 *     - {id: api, title: The API, status: Doing, start: 2026-10-04, end: 2026-10-07, under: build}
 *
 * A view's filter, sort and limit are the table rules every kind shares
 * (tablePolicy.ts — the pipeline's clause vocabulary). Everything drawn is
 * DERIVED from the text on every read — the columns found, the dependency
 * depth, the gantt's day range and nesting, the tree — and nothing is written
 * back. The parser is lenient (an item with no id is given `#N`, a second id
 * is dropped, an unknown `previous` or `parent` is ignored, a view whose
 * roles are not named is left out) and mirrors the checker,
 * `python/studio_kinds/kinds/views.py`, which names all of that.
 */
import yaml from "js-yaml";
import type { PageRender } from "./pageDoc";
import type { PolicyClause } from "./policyDoc";
import { applyTablePolicy, readTableRules, type TableSort } from "./tablePolicy";

export const VIEW_ROLES = ["id", "title", "status", "start", "end", "previous", "parent"] as const;
export type ViewRole = (typeof VIEW_ROLES)[number];
export type ViewName = "table" | "kanban" | "calendar" | "gantt" | "tree" | "page";
/** The views the roles allow, in the order they are offered when the file names none — a page is a
 *  view only a file names, with its template. */
export const VIEW_ORDER: ViewName[] = ["table", "kanban", "calendar", "gantt", "tree"];
/** Every view a file can name. */
export const VIEW_KINDS: ViewName[] = [...VIEW_ORDER, "page"];
const VIEW_LABEL: Record<ViewName, string> = { table: "Table", kanban: "Kanban", calendar: "Calendar", gantt: "Gantt", tree: "Tree", page: "Page" };

export interface ViewsItem {
  id: string;
  title: string;
  status?: string;
  /** ISO dates, when the role is named and the value is a date. */
  start?: string;
  end?: string;
  /** Ids of the items this one comes after — only ids that are items here, the item itself excluded. */
  previous: string[];
  /** The id of the item this one is part of — only when it is an item here and not itself. */
  parent?: string;
  /** Every field as written. */
  fields: Record<string, unknown>;
}

export type ViewsFields = { id: string; title: string } & Partial<Record<Exclude<ViewRole, "id" | "title">, string>>;

/** One view the file offers: its kind and the rules that pick and order its items. */
export interface ViewSpec {
  key: string;
  kind: ViewName;
  label: string;
  where: PolicyClause[];
  sort: TableSort[];
  limit?: number;
  /** A page view's Nunjucks template ("" when absent) and its partials that are text — a page view only. */
  template?: string;
  partials?: Record<string, string>;
}

export interface ViewsDoc {
  title: string;
  description?: string;
  fields: ViewsFields;
  /** The file's columns, or null when it names none (the statuses found stand in). */
  columns: string[] | null;
  /** The file's own views, or null when it names none (the roles decide). */
  views: ViewSpec[] | null;
  items: ViewsItem[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
/** An id as text: a string, or a whole number written as one. */
const idText = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" && Number.isInteger(v) ? String(v) : "";
/** An ISO date — js-yaml parses an unquoted `2026-09-09` as a Date object. */
export const asIsoDate = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10)
  : typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v.slice(0, 10) : "";

export const emptyViews = (): ViewsDoc => ({ title: "", fields: { id: "id", title: "title" }, columns: null, views: null, items: [] });

/** The role → key mapping, defaults filled: `id` and `title` always have a key. */
export function readViewFields(raw: unknown): ViewsFields {
  const out: ViewsFields = { id: "id", title: "title" };
  if (!isObj(raw)) return out;
  for (const role of VIEW_ROLES) {
    const key = raw[role];
    if (typeof key === "string" && key) out[role] = key;
  }
  return out;
}

/** Whether the roles named allow a view of this kind — a table and a page need none. */
export function viewOffered(kind: ViewName, f: ViewsFields): boolean {
  switch (kind) {
    case "table": return true;
    case "page": return true;
    case "kanban": return !!f.status;
    case "calendar": return !!f.start;
    case "gantt": return !!f.start && !!f.end && (!!f.previous || !!f.parent);
    case "tree": return !!f.previous;
  }
}

const isViewName = (s: string): s is ViewName => (VIEW_KINDS as string[]).includes(s);

const idsOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(idText).filter(Boolean) : idText(v) ? [idText(v)] : [];

function readViews(raw: unknown, fields: ViewsFields): ViewSpec[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ViewSpec[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (!isObj(v)) continue;
    const key = asStr(v.key);
    const kind = asStr(v.kind).trim().toLowerCase();
    if (!key || seen.has(key) || !isViewName(kind) || !viewOffered(kind, fields)) continue;
    seen.add(key);
    const rules = readTableRules(v, [], "filter");
    const partials: Record<string, string> = {};
    if (kind === "page") for (const [k, p] of Object.entries(isObj(v.partials) ? v.partials : {})) if (typeof p === "string") partials[k] = p;
    out.push({
      key, kind, label: asStr(v.label) || VIEW_LABEL[kind], where: rules.where, sort: rules.sort, ...(rules.limit ? { limit: rules.limit } : {}),
      ...(kind === "page" ? { template: asStr(v.template), partials } : {}),
    });
  }
  return out;
}

/** Lenient parse — never throws; anything unusable degrades to empty. */
export function parseViews(text: string): ViewsDoc {
  let raw: unknown;
  try { raw = yaml.load(text); } catch { return emptyViews(); }
  if (!isObj(raw)) return emptyViews();
  const fields = readViewFields(raw.fields);
  const columns = Array.isArray(raw.columns) ? raw.columns.filter((c): c is string => typeof c === "string" && !!c) : null;
  const seen = new Set<string>();
  const items: ViewsItem[] = [];
  (Array.isArray(raw.items) ? raw.items : []).forEach((it, i) => {
    if (!isObj(it)) return;
    const id = idText(it[fields.id]) || `#${i + 1}`;
    if (seen.has(id)) return;
    seen.add(id);
    const status = fields.status ? asStr(it[fields.status]) : "";
    const start = fields.start ? asIsoDate(it[fields.start]) : "";
    const end = fields.end ? asIsoDate(it[fields.end]) : "";
    const parent = fields.parent ? idText(it[fields.parent]) : "";
    items.push({
      id,
      title: asStr(it[fields.title]) || id,
      ...(status ? { status } : {}),
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      previous: fields.previous ? idsOf(it[fields.previous]).filter((p) => p !== id) : [],
      ...(parent && parent !== id ? { parent } : {}),
      fields: { ...it },
    });
  });
  for (const it of items) {
    it.previous = it.previous.filter((p) => seen.has(p));
    if (it.parent && !seen.has(it.parent)) delete it.parent;
  }
  return {
    title: asStr(raw.title),
    ...(asStr(raw.description) ? { description: asStr(raw.description) } : {}),
    fields,
    columns,
    views: readViews(raw.views, fields),
    items,
  };
}

/** The views the file offers: its own, else one of every kind the roles allow, the table first. */
export function availableViews(doc: ViewsDoc): ViewSpec[] {
  if (doc.views !== null) return doc.views;
  return VIEW_ORDER.filter((k) => viewOffered(k, doc.fields)).map((k) => ({ key: k, kind: k, label: VIEW_LABEL[k], where: [], sort: [] }));
}

/** The items a view shows — its filter, sort and limit applied over the items' own fields. */
export function rowsOfView(doc: ViewsDoc, view: ViewSpec): ViewsItem[] {
  if (!view.where.length && !view.sort.length && !view.limit) return doc.items;
  const byRow = new Map(doc.items.map((it) => [it.fields, it]));
  const out = applyTablePolicy({ role: "table", title: "", where: view.where, sort: view.sort, hide: [], problems: [], ...(view.limit ? { limit: view.limit } : {}) }, doc.items.map((it) => it.fields));
  return out.rows.map((r) => byRow.get(r)!).filter(Boolean);
}

/** The document as one view sees it: the view's items, with edges to items it hides dropped. */
export function docOfView(doc: ViewsDoc, view: ViewSpec): ViewsDoc {
  const items = rowsOfView(doc, view);
  if (items === doc.items) return doc;
  const kept = new Set(items.map((it) => it.id));
  return {
    ...doc,
    items: items.map((it) => ({
      ...it,
      previous: it.previous.filter((p) => kept.has(p)),
      ...(it.parent && !kept.has(it.parent) ? { parent: undefined } : {}),
    })),
  };
}

/** A value as the file wrote it, for a template: a date YAML read as one is its day again (`2026-10-01`),
 *  or the whole timestamp when it has a time; lists and mappings are walked. */
export function asWritten(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().endsWith("T00:00:00.000Z") ? v.toISOString().slice(0, 10) : v.toISOString();
  if (Array.isArray(v)) return v.map(asWritten);
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, asWritten(x)]));
  return v;
}

/** What a page view renders: its template and partials, and as its model the view's items — after its
 *  filter, sort and limit, each its own keys as written — with the document's `title`, the `fields`, the
 *  kanban's `columns` and the view's `key` and `label`. */
export function pageOfView(doc: ViewsDoc, view: ViewSpec): PageRender {
  return {
    template: view.template ?? "",
    partials: view.partials ?? {},
    model: {
      title: doc.title,
      view: { key: view.key, label: view.label },
      fields: doc.fields,
      columns: columnsOf(doc),
      items: rowsOfView(doc, view).map((it) => asWritten(it.fields)),
    },
  };
}

/** The kanban's columns: the file's, else every status found, first seen first. */
export function columnsOf(doc: ViewsDoc): string[] {
  if (doc.columns !== null) return doc.columns;
  const out: string[] = [];
  for (const it of doc.items) if (it.status && !out.includes(it.status)) out.push(it.status);
  return out;
}

/** Which column an item stands in: its status, case-insensitively; unset or unknown = the first. */
export function columnIndexOf(item: ViewsItem, columns: string[]): number {
  if (!item.status) return 0;
  const i = columns.findIndex((c) => c.toLowerCase() === item.status!.toLowerCase());
  return i < 0 ? 0 : i;
}

/** Each item's depth by longest chain of `previous` (Kahn's order); items in a cycle are absent. */
export function layersOf(items: ViewsItem[]): Map<string, number> {
  const byId = new Map(items.map((it) => [it.id, it]));
  const layer = new Map<string, number>();
  const pending = new Map(items.map((it) => [it.id, it.previous.length]));
  const queue = items.filter((it) => it.previous.length === 0).map((it) => it.id);
  while (queue.length) {
    const id = queue.shift()!;
    const prev = byId.get(id)!.previous;
    layer.set(id, prev.length ? Math.max(...prev.map((p) => layer.get(p) ?? 0)) + 1 : 0);
    for (const other of items) {
      if (layer.has(other.id) || !other.previous.includes(id)) continue;
      const left = (pending.get(other.id) ?? 0) - 1;
      pending.set(other.id, left);
      if (left === 0) queue.push(other.id);
    }
  }
  return layer;
}

/** The items caught in a cycle of `previous` — those layering cannot place. */
export const cyclicOf = (items: ViewsItem[]): ViewsItem[] => {
  const layer = layersOf(items);
  return items.filter((it) => !layer.has(it.id));
};

/** The items whose parent chain never reaches a top — caught in a cycle of `parent`. */
export function parentCyclic(items: ViewsItem[]): ViewsItem[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  return items.filter((it) => {
    const seen = new Set<string>();
    let at: ViewsItem | undefined = it;
    while (at?.parent) {
      if (seen.has(at.id)) return true;
      seen.add(at.id);
      at = byId.get(at.parent);
    }
    return false;
  });
}

/** The items that come after `id`. */
export const followersOf = (items: ViewsItem[], id: string): ViewsItem[] => items.filter((it) => it.previous.includes(id));
/** The items that are part of `id`. */
export const childrenOf = (items: ViewsItem[], id: string): ViewsItem[] => items.filter((it) => it.parent === id);

/** The columns a table shows: the id and the label first, then every other key any item carries, first seen first. */
export function tableColumnsOf(doc: ViewsDoc): string[] {
  const out = [doc.fields.id];
  if (doc.fields.title !== doc.fields.id) out.push(doc.fields.title);
  for (const it of doc.items) for (const k of Object.keys(it.fields)) if (!out.includes(k)) out.push(k);
  return out;
}

/** A value as the text a cell shows: text as it is, a date as its day, a list joined, a mapping as JSON. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return asIsoDate(v);
  if (Array.isArray(v)) return v.map(cellText).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const DAY = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
/** Whole days from `a` to `b` (0 when the same day). */
export const daysBetween = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / DAY);
/** The ISO day `n` days after `iso`. */
export const addDays = (iso: string, n: number): string => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);

export interface GanttRow {
  item: ViewsItem;
  start: string;
  end: string;
  /** Day offsets from the chart's first day, inclusive. */
  from: number;
  to: number;
  depth: number;
  /** How deep under its parents the row sits — 0 at the top. */
  level: number;
  /** The row's span is its children's, not its own dates — a parent with no dates of its own. */
  summary: boolean;
}

export interface Gantt {
  rows: GanttRow[];
  /** The chart's first and last day; empty strings when no row has dates. */
  first: string;
  last: string;
  days: number;
  /** Items without dates of their own or of any child — listed, not drawn. */
  missing: ViewsItem[];
}

/** One row per item with dates — its own, or its children's for a parent without — nested by `parent`,
 *  siblings in dependency order (depth, then start, then the file's order), on a day scale. */
export function ganttOf(doc: ViewsDoc): Gantt {
  const layer = layersOf(doc.items);
  const order = new Map(doc.items.map((it, i) => [it.id, i]));
  const nested = new Set(parentCyclic(doc.items).map((it) => it.id));
  const byId = new Map(doc.items.map((it) => [it.id, it]));
  // An item's span: its own dates, else the earliest start and latest end among its descendants.
  const spanOf = (it: ViewsItem): { start: string; end: string; summary: boolean } | null => {
    if (it.start && it.end) return { start: it.start, end: it.end < it.start ? it.start : it.end, summary: false };
    const spans = childrenOf(doc.items, it.id).filter((c) => !nested.has(c.id)).map(spanOf).filter((s): s is NonNullable<typeof s> => !!s);
    if (!spans.length) return null;
    return { start: spans.map((s) => s.start).sort()[0], end: spans.map((s) => s.end).sort().at(-1)!, summary: true };
  };
  const siblings = (a: ViewsItem, b: ViewsItem) =>
    (layer.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (layer.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    || (a.start ?? "").localeCompare(b.start ?? "") || order.get(a.id)! - order.get(b.id)!;
  const missing: ViewsItem[] = [];
  const flat: { item: ViewsItem; start: string; end: string; summary: boolean; level: number }[] = [];
  const walk = (items: ViewsItem[], level: number) => {
    for (const it of [...items].sort(siblings)) {
      const span = spanOf(it);
      if (!span) { missing.push(it); continue; }
      flat.push({ item: it, ...span, level });
      walk(childrenOf(doc.items, it.id).filter((c) => !nested.has(c.id)), level + 1);
    }
  };
  walk(doc.items.filter((it) => !nested.has(it.id) && !(it.parent && byId.has(it.parent))), 0);
  missing.push(...doc.items.filter((it) => nested.has(it.id)));
  if (!flat.length) return { rows: [], first: "", last: "", days: 0, missing };
  const first = flat.map((r) => r.start).sort()[0];
  const last = flat.map((r) => r.end).sort().at(-1)!;
  const rows = flat.map((r): GanttRow => ({
    item: r.item, start: r.start, end: r.end, from: daysBetween(first, r.start), to: daysBetween(first, r.end),
    depth: layer.get(r.item.id) ?? Number.MAX_SAFE_INTEGER, level: r.level, summary: r.summary,
  }));
  return { rows, first, last, days: daysBetween(first, last) + 1, missing };
}

export interface TreeNode {
  item: ViewsItem;
  children: TreeNode[];
  /** The OTHER items this one also comes after — shown where it appears under one of them. */
  alsoAfter: ViewsItem[];
}

/** The dependency tree: roots are items that come after nothing; under each, what comes after it. Cyclic items have no root and are returned apart. */
export function treeOf(doc: ViewsDoc): { roots: TreeNode[]; cyclic: ViewsItem[] } {
  const layer = layersOf(doc.items);
  const byId = new Map(doc.items.map((it) => [it.id, it]));
  const node = (item: ViewsItem, under: string | null): TreeNode => ({
    item,
    children: followersOf(doc.items, item.id).filter((c) => layer.has(c.id)).map((c) => node(c, item.id)),
    alsoAfter: under ? item.previous.filter((p) => p !== under).map((p) => byId.get(p)!).filter(Boolean) : [],
  });
  return {
    roots: doc.items.filter((it) => it.previous.length === 0 && layer.has(it.id)).map((it) => node(it, null)),
    cyclic: doc.items.filter((it) => !layer.has(it.id)),
  };
}

/** The checker's summary line: `12 items · table, kanban (3 columns), …`, or with the file's own views `12 items · views: open (kanban, 3 columns) 4, plan (gantt)`. */
export function viewsSummary(doc: ViewsDoc): string {
  const n = doc.items.length;
  const c = columnsOf(doc).length;
  const cols = `${c} column${c === 1 ? "" : "s"}`;
  const head = `${n} item${n === 1 ? "" : "s"}`;
  if (doc.views === null) {
    return `${head} · ${availableViews(doc).map((v) => (v.kind === "kanban" ? `kanban (${cols})` : v.kind)).join(", ")}`;
  }
  const parts = doc.views.map((v) => {
    const kind = v.kind === "kanban" ? `kanban, ${cols}` : v.kind;
    const shown = rowsOfView(doc, v).length;
    return shown !== n ? `${v.key} (${kind}) ${shown}` : `${v.key} (${kind})`;
  });
  return `${head} · views: ${parts.join(", ") || "none"}`;
}
