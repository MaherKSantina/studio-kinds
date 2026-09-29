/**
 * The `.views` kind — ONE LIST OF ITEMS in the file and the views over it.
 * `items` are mappings, each with an id; `fields` says which item key plays
 * which ROLE — id, title, status, start, end, previous, parent — and `views`
 * says which views the file offers, each over the items its own `filter`
 * keeps. Without `views`, the roles decide: a table always; a kanban when a
 * key is the `status`; a calendar when a key is the `start` (with `end` when
 * there is one); a gantt when `start`, `end` and `previous` or `parent` are
 * named; a sequence — the gantt's rows on steps of what comes after what, not
 * days — when `previous` or `parent` is; a dependency tree when `previous`
 * is. A PAGE is a view the file
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
 *     start: start            # a day, YYYY-MM-DD, or a time, YYYY-MM-DD HH:MM → Calendar; with end + previous/parent, Gantt
 *     end: end                # a day or a time, as start
 *     previous: after         # the id(s) of what comes before → Tree, Sequence
 *     parent: under           # the id of the item this one is part of → nested in the Gantt and the Sequence
 *   columns: [To do, Doing, Done]    # the statuses in order; absent = the values found
 *   views:                    # optional — absent = every view the roles allow, the table first
 *     - {key: open, kind: kanban, label: Open work, filter: [{field: status, op: not_equals, value: Done}]}
 *     - {key: plan, kind: gantt}
 *     - {key: steps, kind: sequence}
 *     - {key: report, kind: page, template: "{% for item in items %}<p>{{ item.title }}</p>{% endfor %}"}
 *   items:
 *     - {id: plan, title: Plan the launch, status: Done, start: 2026-10-01, end: 2026-10-03,
 *        content: {kind: md, doc: "Scope, owners and the date."}}   # a document written in
 *     - {id: build, title: Build it, status: Doing, start: 2026-10-04, end: 2026-10-10, after: plan}
 *     - {id: api, title: The API, status: Doing, start: 2026-10-04, end: 2026-10-07, under: build}
 *     - id: demo                                        # a time: the week and the day place it by the clock
 *       title: Demo the API
 *       start: 2026-10-07 14:00
 *       end: 2026-10-07 15:30
 *
 * Every key an item carries is shown as it is but `content`: an item that
 * holds more than its line shows writes that document into itself —
 * `content: {kind, doc}`, the shape a brief's section carries — and its dialog
 * draws it by its own kind (writtenDocument.ts). A start or an end is a day,
 * or a time on it on a 24-hour clock in no zone — the time the calendar
 * shows: an item with a time at either end is timed (a start with none the
 * start of its day, an end with none the end of its day, no end a moment),
 * one of days alone all-day. The calendar shows a day, its week or its month
 * — the week and the day by the clock — the scale the page's for the session like the view;
 * the gantt and the sequence fold a parent's rows away and back, the folds
 * the page's for the session too. A view's `group` names an item key whose
 * values gather its items: a kanban's lanes, and a gantt's or a sequence's
 * groups — a row per value over the top rows carrying it, folding like a
 * parent.
 *
 * A view's filter, sort and limit are the table rules every kind shares
 * (tablePolicy.ts — the pipeline's clause vocabulary). Everything drawn is
 * DERIVED from the text on every read — the columns found, the dependency
 * depth, the gantt's day range and nesting, the sequence's steps, the tree —
 * and nothing is written
 * back. The parser is lenient (an item with no id is given `#N`, a second id
 * is dropped, an unknown `previous` or `parent` is ignored, a view whose
 * roles are not named is left out) and mirrors the checker,
 * `python/studio_kinds/kinds/views.py`, which names all of that.
 */
import yaml from "js-yaml";
import type { PageRender } from "./pageDoc";
import type { PolicyClause } from "./policyDoc";
import { applyTablePolicy, readTableRules, type TableSort } from "./tablePolicy";
import { readWritten, type WrittenDocument } from "./writtenDocument";

/** The one item key that is not shown as it is: the document written into the item, `{kind, doc}`. */
export const CONTENT_KEY = "content";

export const VIEW_ROLES = ["id", "title", "status", "start", "end", "previous", "parent"] as const;
export type ViewRole = (typeof VIEW_ROLES)[number];
export type ViewName = "table" | "kanban" | "calendar" | "gantt" | "sequence" | "tree" | "page";
/** The views the roles allow, in the order they are offered when the file names none — a page is a
 *  view only a file names, with its template. */
export const VIEW_ORDER: ViewName[] = ["table", "kanban", "calendar", "gantt", "sequence", "tree"];
/** Every view a file can name. */
export const VIEW_KINDS: ViewName[] = [...VIEW_ORDER, "page"];
const VIEW_LABEL: Record<ViewName, string> = {
  table: "Table", kanban: "Kanban", calendar: "Calendar", gantt: "Gantt", sequence: "Sequence", tree: "Tree", page: "Page",
};

export interface ViewsItem {
  id: string;
  title: string;
  status?: string;
  /** ISO dates, when the role is named and the value is a date. */
  start?: string;
  end?: string;
  /** The time on the start's day and on the end's, `HH:MM`, when the value carries one — the item is timed. */
  startTime?: string;
  endTime?: string;
  /** Ids of the items this one comes after — only ids that are items here, the item itself excluded. */
  previous: string[];
  /** The id of the item this one is part of — only when it is an item here and not itself. */
  parent?: string;
  /** The document written into the item — its `content`, when that is a mapping. */
  content?: WrittenDocument;
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
  /** The item key whose values gather the view's items — a kanban's lanes, a gantt's or a sequence's groups; those
   *  views only. */
  group?: string;
}

/** The views whose items a `group` key gathers: the kanban into lanes, the gantt and the sequence into groups. */
export const GROUP_KINDS: ViewName[] = ["kanban", "gantt", "sequence"];

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

/** A day and a time on it: `YYYY-MM-DD HH:MM`, a `T` or a space between, seconds allowed and not read. */
const CLOCK = /^\d{4}-\d{2}-\d{2}[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/** The time of day a start or an end carries, `HH:MM` — "" for a day alone. A bare timestamp js-yaml hands over as a
 *  Date keeps its clock in UTC, and at midnight is its day alone, as a bare date reads the same; a text's is the time
 *  written after its day, on a 24-hour clock. The checker reads it the same (views.py `as_time`). */
export function asClock(v: unknown): string {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? "" : iso.slice(11, 16);
  }
  const m = typeof v === "string" ? CLOCK.exec(v) : null;
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** A start or an end in words: its day, and its time when it has one — `2026-10-05 09:30`. */
export const whenText = (day: string, time?: string): string => (time ? `${day} ${time}` : day);

/** An item's span in words: `2026-10-01 → 2026-10-03`, `2026-10-05 09:00 → 10:30` (an end on the start's day names its
 *  time alone), `2026-10-05 09:00` for a moment, the day alone for one day; "" with no start. */
export function spanText(item: ViewsItem): string {
  if (!item.start) return "";
  const from = whenText(item.start, item.startTime);
  if (!item.end || (item.end === item.start && !item.endTime)) return from;
  return `${from} → ${item.end === item.start ? item.endTime : whenText(item.end, item.endTime)}`;
}

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
    case "sequence": return !!f.previous || !!f.parent;
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
      ...(GROUP_KINDS.includes(kind) && asStr(v.group) ? { group: asStr(v.group) } : {}),
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
    const startTime = start ? asClock(it[fields.start!]) : "";
    const endTime = end ? asClock(it[fields.end!]) : "";
    const parent = fields.parent ? idText(it[fields.parent]) : "";
    const content = readWritten(it[CONTENT_KEY]);
    items.push({
      id,
      title: asStr(it[fields.title]) || id,
      ...(status ? { status } : {}),
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      previous: fields.previous ? idsOf(it[fields.previous]).filter((p) => p !== id) : [],
      ...(parent && parent !== id ? { parent } : {}),
      ...(content ? { content } : {}),
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

/** An item's keys as a view's rules read them — as the table shows them, a date as its day and its time when it has
 *  one — so a bare day and a time written as text sort together. */
const asShown = (fields: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v instanceof Date ? cellText(v) : v]));

/** The items a view shows — its filter, sort and limit applied over the items' own fields, as the table shows them. */
export function rowsOfView(doc: ViewsDoc, view: ViewSpec): ViewsItem[] {
  if (!view.where.length && !view.sort.length && !view.limit) return doc.items;
  const rows = doc.items.map((it) => asShown(it.fields));
  const byRow = new Map(rows.map((r, i) => [r, doc.items[i]]));
  const out = applyTablePolicy({ role: "table", title: "", where: view.where, sort: view.sort, hide: [], problems: [], ...(view.limit ? { limit: view.limit } : {}) }, rows);
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

/** One lane of a grouped kanban: the value of the view's `group` key, and the items carrying it.
 *  An empty label is the last lane — the items with no value for that key. */
export interface Lane { label: string; items: ViewsItem[] }

/** What an item carries for a view's `group` key, as the text its lane or its group is labelled by — "" for nothing:
 *  no value, an empty one, or a boolean. */
export function groupValueOf(item: ViewsItem, group: string): string {
  const v = (item.fields as Record<string, unknown>)[group];
  return v === null || v === undefined || v === "" || typeof v === "boolean" ? "" : typeof v === "string" ? v : cellText(v);
}

/** A kanban's lanes: the values `group` takes among these items, first seen first, and last the
 *  items carrying none. One unlabelled lane when the view groups by nothing. */
export function lanesOf(items: ViewsItem[], group?: string): Lane[] {
  if (!group) return [{ label: "", items }];
  const lanes: Lane[] = [];
  const at = new Map<string, Lane>();
  const rest: ViewsItem[] = [];
  for (const it of items) {
    const label = groupValueOf(it, group);
    if (!label) { rest.push(it); continue; }
    let lane = at.get(label);
    if (!lane) { lane = { label, items: [] }; at.set(label, lane); lanes.push(lane); }
    lane.items.push(it);
  }
  if (rest.length) lanes.push({ label: "", items: rest });
  return lanes;
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

/** A value as the text a cell shows: text as it is, a date as its day and its time when it has one, a list joined, a
 *  mapping as JSON. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return whenText(asIsoDate(v), asClock(v));
  if (Array.isArray(v)) return v.map(cellText).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** What the table shows for one of an item's keys: the kind of the document written in, else the value as text. */
export const itemCellText = (item: ViewsItem, key: string): string =>
  key === CONTENT_KEY && item.content?.kind ? item.content.kind : cellText(item.fields[key]);

/** The fields the item's dialog lists under the document it draws: every key as written, the document's own
 *  `content` left out. */
export const listedFieldsOf = (item: ViewsItem): [string, unknown][] =>
  Object.entries(item.fields).filter(([k]) => !(k === CONTENT_KEY && item.content));

const DAY = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
/** Whole days from `a` to `b` (0 when the same day). */
export const daysBetween = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / DAY);
/** The ISO day `n` days after `iso`. */
export const addDays = (iso: string, n: number): string => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);

/** How much of the calendar shows at once: a day, its week (Monday to Sunday), or its month. */
export type CalendarScale = "day" | "week" | "month";
export const CALENDAR_SCALES: CalendarScale[] = ["day", "week", "month"];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** 0 for a Monday … 6 for a Sunday. */
const weekdayOf = (iso: string): number => (new Date(utc(iso)).getUTCDay() + 6) % 7;
/** The Monday of the week `iso` falls in. */
export const mondayOf = (iso: string): string => addDays(iso, -weekdayOf(iso));

/** `iso` moved by `by` days, weeks or months; a month keeps the day — its last when the month is shorter. */
export function shiftCalendar(iso: string, scale: CalendarScale, by: number): string {
  if (scale === "day") return addDays(iso, by);
  if (scale === "week") return addDays(iso, 7 * by);
  const [y, m, d] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + by, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

/** Whether two days fall in the same span of a scale — the same day, week or month. */
export const sameSpan = (scale: CalendarScale, a: string, b: string): boolean =>
  scale === "day" ? a === b : scale === "week" ? mondayOf(a) === mondayOf(b) : a.slice(0, 7) === b.slice(0, 7);

/** The heading of the span around `iso`: `Monday 5 October 2026`, `5 – 11 October 2026` (a week across two
 *  months or years names both), `October 2026`. */
export function spanTitle(scale: CalendarScale, iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (scale === "day") return `${WEEKDAYS[weekdayOf(iso)]} ${d} ${MONTHS[m - 1]} ${y}`;
  if (scale === "month") return `${MONTHS[m - 1]} ${y}`;
  const from = mondayOf(iso), to = addDays(from, 6);
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const head = fy !== ty ? `${fd} ${MONTHS[fm - 1]} ${fy}` : fm !== tm ? `${fd} ${MONTHS[fm - 1]}` : `${fd}`;
  return `${head} – ${td} ${MONTHS[tm - 1]} ${ty}`;
}

/** A day of this machine's calendar, `YYYY-MM-DD` — today when no date is given: what "Today" and the shading of today mean. */
export const localDay = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Whether an item has a time at either end — the week and the day place it by the clock. */
export const isTimed = (item: ViewsItem): boolean => !!(item.startTime || item.endTime);

/** An item as the calendar places it. `start` and `end` are the file's own clock, in no zone: a day, `YYYY-MM-DD`, for
 *  an item all day, the end the day after its last as a calendar counts; a time, `YYYY-MM-DDTHH:MM:00`, for one timed.
 *  No `end`: one day, or a moment. */
export interface CalendarEntry { id: string; title: string; allDay: boolean; start: string; end?: string }

/** Where the calendar places an item with a start: all day across its days when it has no time, else timed from its
 *  start — the start of its day when it has no time — to its end — the end of its day when it has none — and a
 *  moment when it has no end, or one not after its start. A timed item that lasts a day or more goes all day across
 *  the days it touches, as a diary lays out a stay or a trip. */
export function calendarEntryOf(item: ViewsItem): CalendarEntry | null {
  if (!item.start) return null;
  const { id, title } = item;
  const allDay = (last: string): CalendarEntry => ({ id, title, allDay: true, start: item.start!, ...(last > item.start! ? { end: addDays(last, 1) } : {}) });
  if (!isTimed(item)) return allDay(item.end && item.end > item.start ? item.end : item.start);
  const start = `${item.start}T${item.startTime ?? "00:00"}:00`;
  const end = !item.end ? "" : item.endTime ? `${item.end}T${item.endTime}:00` : `${addDays(item.end, 1)}T00:00:00`;
  if (end > start && Date.parse(`${end}Z`) - Date.parse(`${start}Z`) >= DAY) {
    return allDay(end.endsWith("T00:00:00") ? addDays(end.slice(0, 10), -1) : end.slice(0, 10));
  }
  return { id, title, allDay: false, start, ...(end > start ? { end } : {}) };
}

/** The hour the calendar's hours open at: the one before the earliest time an item starts at — 08:00 when none has one. */
export function firstHourOf(items: ViewsItem[]): string {
  const first = items.map((it) => it.startTime).filter((t): t is string => !!t).sort()[0];
  return `${String(first ? Math.max(0, Number(first.slice(0, 2)) - 1) : 8).padStart(2, "0")}:00`;
}

export interface GanttRow {
  /** The row's identity in the outline: its item's id. */
  key: string;
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
    key: r.item.id, item: r.item, start: r.start, end: r.end, from: daysBetween(first, r.start), to: daysBetween(first, r.end),
    depth: layer.get(r.item.id) ?? Number.MAX_SAFE_INTEGER, level: r.level, summary: r.summary,
  }));
  return { rows, first, last, days: daysBetween(first, last) + 1, missing };
}

export interface SequenceRow {
  /** The row's identity in the outline: its item's id. */
  key: string;
  item: ViewsItem;
  /** The steps the row spans, counted from 0, both ends included — one step for an item, its parts' for a whole. */
  from: number;
  to: number;
  /** How deep under its parents the row sits — 0 at the top. */
  level: number;
  /** The row spans its parts: an item with parts in the view. */
  summary: boolean;
}

export interface Sequence {
  rows: SequenceRow[];
  /** How many steps the rows span. */
  steps: number;
  /** Items no step can hold — caught in a loop of `previous`, of `parent`, or of the two — listed, not drawn. */
  looped: ViewsItem[];
}

/** The gantt's rows on a scale of STEPS instead of days. An item stands one step past the last step of everything it
 *  comes after, and no earlier than its parent may start; an item takes one step, and a parent — a whole — spans its
 *  parts, so what a whole comes after holds for every part, and what comes after a whole comes after all of them.
 *  Rows nested by `parent`; siblings in the view's order, each below the siblings it comes after. */
export function sequenceOf(doc: ViewsDoc): Sequence {
  const nested = new Set(parentCyclic(doc.items).map((it) => it.id));
  const items = doc.items.filter((it) => !nested.has(it.id));
  const at = new Map(items.map((it, i) => [it.id, i]));
  const parts = new Map<string, ViewsItem[]>();
  for (const it of items) if (it.parent && at.has(it.parent)) parts.set(it.parent, [...(parts.get(it.parent) ?? []), it]);
  // Two points per item — 2i where it starts, 2i + 1 where it ends — each at the longest path to it: no step inside
  // an item, from a whole's start into its parts' starts, or from its parts' ends into its own end; one step from
  // the end of what an item comes after to its start.
  const n = items.length * 2;
  const next: { to: number; steps: number }[][] = Array.from({ length: n }, () => []);
  const waiting = new Array<number>(n).fill(0);
  const link = (a: number, b: number, steps: number) => { next[a].push({ to: b, steps }); waiting[b]++; };
  items.forEach((it, i) => {
    const own = parts.get(it.id);
    if (own) for (const c of own) { const j = at.get(c.id)!; link(2 * i, 2 * j, 0); link(2 * j + 1, 2 * i + 1, 0); }
    else link(2 * i, 2 * i + 1, 0);
    for (const p of it.previous) { const j = at.get(p); if (j !== undefined) link(2 * j + 1, 2 * i, 1); }
  });
  // Kahn's order, the point of the earliest item in the file first: the order items start in is the rows' order.
  // A point in a loop, or after one, is never reached.
  const step = new Array<number>(n).fill(0);
  const reached = new Array<boolean>(n).fill(false);
  const order = new Map<string, number>();
  const ready = new Set<number>();
  for (let v = 0; v < n; v++) if (!waiting[v]) ready.add(v);
  while (ready.size) {
    const v = Math.min(...ready);
    ready.delete(v);
    reached[v] = true;
    if (v % 2 === 0) order.set(items[v / 2].id, order.size);
    for (const e of next[v]) {
      step[e.to] = Math.max(step[e.to], step[v] + e.steps);
      if (--waiting[e.to] === 0) ready.add(e.to);
    }
  }
  const placed = (it: ViewsItem): boolean => { const i = at.get(it.id)!; return reached[2 * i] && reached[2 * i + 1]; };
  // A whole starts where its first part does — its own start is only the earliest its parts may.
  const fromOf = (it: ViewsItem): number => {
    const own = parts.get(it.id);
    return own ? Math.min(...own.map(fromOf)) : step[2 * at.get(it.id)!];
  };
  const rows: SequenceRow[] = [];
  const walk = (list: ViewsItem[], level: number) => {
    for (const it of list.filter(placed).sort((a, b) => order.get(a.id)! - order.get(b.id)!)) {
      const own = parts.get(it.id) ?? [];
      rows.push({ key: it.id, item: it, from: fromOf(it), to: step[2 * at.get(it.id)! + 1], level, summary: own.length > 0 });
      walk(own, level + 1);
    }
  };
  // At the top, every item that is part of nothing drawn: a part whose whole has no step stands on its own.
  walk(items.filter((it) => !(it.parent && at.has(it.parent) && placed(items[at.get(it.parent)!]))), 0);
  return {
    rows,
    steps: rows.length ? Math.max(...rows.map((r) => r.to)) + 1 : 0,
    looped: doc.items.filter((it) => nested.has(it.id) || !placed(it)),
  };
}

/** A row of an outline — an item, or a group of the view's items — at a depth, in the order drawn; the rows under a
 *  row follow it, one level deeper. `key` is its identity: an item's id, or a group's key, never an item's. */
export interface OutlineRow { key: string; level: number; item?: ViewsItem }

/** A row the view's `group` key makes: the top rows carrying one value of it — "" for those carrying none — gathered
 *  under it, one level deeper. It spans them, and folds them away like a parent. */
export interface GroupRow extends OutlineRow {
  item?: undefined;
  /** The value its rows carry. */
  group: string;
  /** How many rows it gathers — its items, and their parts. */
  items: number;
  from: number;
  to: number;
  summary: true;
}

/** Whether an outline's row is a group's rather than an item's. */
export const isGroupRow = (r: OutlineRow): r is GroupRow => r.item === undefined;

/** An outline's top rows gathered into GROUPS by the view's `group` key: one per value its top rows carry, in the order
 *  the view's items first carry it, and last one for the rows carrying none — each a row of its own that spans its
 *  rows, which follow it one level deeper. A part stays under its whole, whatever it carries. No key, the rows as they
 *  are. */
export function groupOutline<R extends OutlineRow & { from: number; to: number }>(rows: R[], items: ViewsItem[], group?: string): (R | GroupRow)[] {
  if (!group) return rows;
  const gathered = new Map<string, R[]>();
  let value = "";
  for (const r of rows) {
    if (r.level === 0) value = r.item ? groupValueOf(r.item, group) : "";
    gathered.set(value, [...(gathered.get(value) ?? []), { ...r, level: r.level + 1 }]);
  }
  const values = [...new Set(items.map((it) => groupValueOf(it, group)).filter((v) => v && gathered.has(v)))];
  if (gathered.has("")) values.push("");
  const taken = new Set(rows.map((r) => r.key));
  const out: (R | GroupRow)[] = [];
  for (const v of values) {
    const own = gathered.get(v)!;
    let key = `group:${v}`;
    while (taken.has(key)) key += "'";
    taken.add(key);
    out.push({ key, group: v, items: own.length, level: 0, from: Math.min(...own.map((r) => r.from)), to: Math.max(...own.map((r) => r.to)), summary: true });
    out.push(...own);
  }
  return out;
}

/** The items at the top of a view's outline: those whose parent is not among them. */
export const topItemsOf = (items: ViewsItem[]): ViewsItem[] => {
  const ids = new Set(items.map((it) => it.id));
  return items.filter((it) => !(it.parent && ids.has(it.parent)));
};

/** An outline's row as it is shown while some parents are folded. */
export interface ShownRow<R extends OutlineRow> {
  row: R;
  /** Rows sit under it — it can fold. */
  parent: boolean;
  /** The rows under it are folded away. */
  folded: boolean;
  /** How many rows its fold hides. */
  hidden: number;
}

/** The rows an outline shows while the parents in `folded` (row keys) are folded: every row not under a folded one —
 *  marked whether rows sit under it, whether they are folded and how many the fold hides — and, for every item, the
 *  key of the row it is drawn as: its own when shown, else the folded row it hides under. */
export function foldOutline<R extends OutlineRow>(rows: R[], folded: ReadonlySet<string>): { shown: ShownRow<R>[]; drawnAs: Map<string, string> } {
  const shown: ShownRow<R>[] = [];
  const drawnAs = new Map<string, string>();
  let under: ShownRow<R> | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (under && row.level > under.row.level) {
      under.hidden++;
      if (row.item) drawnAs.set(row.item.id, under.row.key);
      continue;
    }
    const parent = (rows[i + 1]?.level ?? -1) > row.level;
    const s: ShownRow<R> = { row, parent, folded: parent && folded.has(row.key), hidden: 0 };
    shown.push(s);
    if (row.item) drawnAs.set(row.item.id, row.key);
    under = s.folded ? s : null;
  }
  return { shown, drawnAs };
}

/** The arrows between an outline's rows: every `previous` edge between two of its items, drawn between the rows its
 *  ends are drawn as (row keys) — an edge folded inside one row is not drawn, and edges folded onto the same two rows
 *  are one. */
export function linksOf(rows: OutlineRow[], drawnAs: ReadonlyMap<string, string>): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.item) continue;
    const to = drawnAs.get(r.item.id);
    for (const p of r.item.previous) {
      const from = drawnAs.get(p);
      if (!from || !to || from === to) continue;
      const key = JSON.stringify([from, to]);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from, to });
    }
  }
  return out;
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

/** The checker's summary line: `12 items · table, kanban (3 columns), …`, or with the file's own views `12 items · views: open (kanban, 3 columns) 4, plan (gantt)`;
 *  `12 items, 2 documents · …` when items hold documents written in. */
export function viewsSummary(doc: ViewsDoc): string {
  const n = doc.items.length;
  const c = columnsOf(doc).length;
  const w = doc.items.filter((it) => it.content?.kind).length;
  const cols = `${c} column${c === 1 ? "" : "s"}`;
  const head = `${n} item${n === 1 ? "" : "s"}${w ? `, ${w} document${w === 1 ? "" : "s"}` : ""}`;
  if (doc.views === null) {
    return `${head} · ${availableViews(doc).map((v) => (v.kind === "kanban" ? `kanban (${cols})` : v.kind)).join(", ")}`;
  }
  const parts = doc.views.map((v) => {
    const rows = rowsOfView(doc, v);
    let kind: string = v.kind;
    if (v.kind === "kanban") {
      kind = `kanban, ${cols}`;
      if (v.group) {
        const l = lanesOf(rows, v.group).length;
        kind += `, ${l} lane${l === 1 ? "" : "s"}`;
      }
    } else if (v.group) {
      const g = lanesOf(topItemsOf(rows), v.group).length;
      kind += `, ${g} group${g === 1 ? "" : "s"}`;
    }
    const shown = rows.length;
    return shown !== n ? `${v.key} (${kind}) ${shown}` : `${v.key} (${kind})`;
  });
  return `${head} · views: ${parts.join(", ") || "none"}`;
}
