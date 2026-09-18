/**
 * The `.collection` kind — a SNAPSHOT of rows to decide over, one at a time.
 * Made from a `.jsonl` view ("Collect" on the view, or `check --collect`):
 * the rows are COPIED in, with the view's fields and labels, so the
 * collection stands still while the data, the policy and the middleware
 * move on. Then the decisions: push an item up, push it down, hide it, each
 * with a reason in plain words. The decisions are a LOG, never applied to
 * the items — the order shown is derived (below), and a later step reads
 * the reasons to write the policy that produces the same order.
 *
 * Shape (YAML):
 *
 *   source: stays.jsonl                 # where the items were copied from
 *   to: Narooma NSW                     # where directions go (the view asks once)
 *   fields: [name, location, sleeps, best_offer.price_total_aud]   # the facts shown, in order
 *   stats: [best_offer.price_total_aud, distance_from_narooma_km, best_offer.url]   # the big cards
 *   labels: {best_offer.price_total_aud: "Total (4 nights, AUD)"}
 *   items:                              # the rows, each with an `id` given at copy time
 *     - {id: 1, name: ..., featured: "https://…/2.jpg", ...}   # `featured`: the picture that stands for it
 *   decisions:                          # in the order taken
 *     - {item: 3, op: down, reason: "56 km from town"}
 *     - {item: 7, op: hide, reason: "shared bathroom"}
 *     - {item: 12, op: up, reason: "on the water"}
 *     - {item: 7, op: show}             # a hide taken back
 *
 * The order shown: each item's RANK is its ups minus its downs; items sort
 * by rank descending, ties in their copied order; an item whose last
 * hide/show is a hide is HIDDEN (kept in the file, shown on request). A
 * decision naming an item that is not there, an unknown op, or a missing
 * reason is a PROBLEM.
 *
 * An item's FIELDS may be edited in place (a commute time looked up, a
 * picture chosen as `featured`): that changes the item itself, with no
 * decision and no reason — a decision is about the item's standing, an
 * edit is about what is known of it.
 */
import yaml from "js-yaml";
import { valueAt, type DataRow } from "./dataRows";
import { withValue } from "./middlewareDoc";

export type CollectionOp = "up" | "down" | "hide" | "show";
export const COLLECTION_OPS: CollectionOp[] = ["up", "down", "hide", "show"];

export interface CollectionDecision {
  item: number;
  op: CollectionOp;
  reason?: string;
}

export interface CollectionItem extends DataRow { id: number }

export interface CollectionDoc {
  source?: string;
  to?: string;
  fields: string[];
  /** The fields shown as big cards under the picture. */
  stats: string[];
  labels: Record<string, string>;
  items: CollectionItem[];
  decisions: CollectionDecision[];
  problems: string[];
}

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

/** Lenient parse — never throws; what cannot be read is a problem, not a crash. */
export function parseCollection(text: string): CollectionDoc {
  let raw: Record<string, unknown> = {};
  const problems: string[] = [];
  try { raw = rec(yaml.load(text)); } catch (e) { problems.push(`YAML: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`); }

  const items: CollectionItem[] = [];
  const ids = new Set<number>();
  arr(raw.items).forEach((x, i) => {
    const o = rec(x);
    const id = typeof o.id === "number" ? o.id : i + 1;
    if (ids.has(id)) problems.push(`item ${i + 1}: id ${id} is already used`);
    ids.add(id);
    items.push({ ...o, id });
  });

  const decisions: CollectionDecision[] = [];
  arr(raw.decisions).forEach((x, i) => {
    const o = rec(x);
    const item = typeof o.item === "number" ? o.item : Number.NaN;
    const op = str(o.op) as CollectionOp | undefined;
    if (!Number.isFinite(item)) { problems.push(`decision ${i + 1}: no item`); return; }
    if (!op || !COLLECTION_OPS.includes(op)) { problems.push(`decision ${i + 1}: unknown op "${String(o.op ?? "")}"`); return; }
    if (!ids.has(item)) problems.push(`decision ${i + 1}: item ${item} is not in the collection`);
    const reason = str(o.reason)?.trim();
    if (!reason && op !== "show") problems.push(`decision ${i + 1}: no reason`);
    decisions.push({ item, op, ...(reason ? { reason } : {}) });
  });

  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec(raw.labels))) if (typeof v === "string" && v.trim()) labels[k] = v;
  return {
    ...(str(raw.source) ? { source: str(raw.source)! } : {}),
    ...(str(raw.to) ? { to: str(raw.to)! } : {}),
    fields: arr(raw.fields).map(str).filter((s): s is string => !!s),
    stats: arr(raw.stats).map(str).filter((s): s is string => !!s),
    labels, items, decisions, problems,
  };
}

/** The file text — the whole document regenerated (a UI save; comments do not survive). */
export function dumpCollection(doc: Omit<CollectionDoc, "problems">): string {
  const out: Record<string, unknown> = {};
  if (doc.source) out.source = doc.source;
  if (doc.to) out.to = doc.to;
  out.fields = doc.fields;
  if (doc.stats.length) out.stats = doc.stats;
  if (Object.keys(doc.labels).length) out.labels = doc.labels;
  out.items = doc.items;
  out.decisions = doc.decisions;
  return yaml.dump(out, { lineWidth: -1, noRefs: true, quotingType: '"' });
}

/** The fields worth a big card, from the rows: those numeric in the first row that carries them, then the first link. */
export function defaultStats(rows: DataRow[], fields: string[]): string[] {
  const numeric = fields.filter((f) => rows.some((r) => typeof valueAt(r, f) === "number"));
  const link = fields.find((f) => rows.some((r) => { const v = valueAt(r, f); return typeof v === "string" && /^https?:\/\//i.test(v); }));
  return [...numeric, ...(link ? [link] : [])];
}

/** A collection from a view's rows: ids given in order, the view's fields and labels kept. */
export function collectionFromRows(rows: DataRow[], opts: { source?: string; fields: string[]; stats?: string[]; labels?: Record<string, string> }): Omit<CollectionDoc, "problems"> {
  return {
    ...(opts.source ? { source: opts.source } : {}),
    fields: opts.fields,
    stats: opts.stats ?? defaultStats(rows, opts.fields),
    labels: opts.labels ?? {},
    items: rows.map((r, i) => ({ ...r, id: i + 1 })),
    decisions: [],
  };
}

export interface ItemState {
  item: CollectionItem;
  /** Ups minus downs. */
  rank: number;
  hidden: boolean;
  /** This item's decisions, in the order taken. */
  decisions: CollectionDecision[];
}

/** Every item's standing from the log: rank, hidden, its own decisions. */
export function itemStates(doc: Pick<CollectionDoc, "items" | "decisions">): Map<number, ItemState> {
  const states = new Map<number, ItemState>();
  for (const item of doc.items) states.set(item.id, { item, rank: 0, hidden: false, decisions: [] });
  for (const d of doc.decisions) {
    const s = states.get(d.item);
    if (!s) continue;
    s.decisions.push(d);
    if (d.op === "up") s.rank += 1;
    else if (d.op === "down") s.rank -= 1;
    else if (d.op === "hide") s.hidden = true;
    else if (d.op === "show") s.hidden = false;
  }
  return states;
}

/** The items in the order the decisions give them: rank descending, ties in copied order; hidden ones out unless asked. */
export function orderedItems(doc: Pick<CollectionDoc, "items" | "decisions">, withHidden = false): ItemState[] {
  const states = itemStates(doc);
  const order = doc.items.map((it, i) => ({ s: states.get(it.id)!, i }));
  return order
    .filter(({ s }) => withHidden || !s.hidden)
    .sort((a, b) => b.s.rank - a.s.rank || a.i - b.i)
    .map(({ s }) => s);
}

/** Counts for a heading: how many shown, up, down, hidden, and decisions without a reason. */
export function collectionSummary(doc: Pick<CollectionDoc, "items" | "decisions">): { shown: number; up: number; down: number; hidden: number; unreasoned: number } {
  const states = [...itemStates(doc).values()];
  return {
    shown: states.filter((s) => !s.hidden).length,
    up: states.filter((s) => !s.hidden && s.rank > 0).length,
    down: states.filter((s) => !s.hidden && s.rank < 0).length,
    hidden: states.filter((s) => s.hidden).length,
    unreasoned: doc.decisions.filter((d) => d.op !== "show" && !d.reason).length,
  };
}

/** Where directions start from: coordinates when the row has them, else its address, else its name and place. */
export function originOf(item: DataRow): string {
  const lat = item.lat, lng = item.lng;
  if (typeof lat === "number" && typeof lng === "number") return `${lat},${lng}`;
  const address = typeof item.address === "string" && item.address.trim();
  if (address) return address;
  return [item.name, item.location].filter((x) => typeof x === "string" && x).join(", ");
}

/** What a typed value means: empty = the field goes; a number where the field was one (or the text is one); true/false; else the text. */
export function parseFieldInput(raw: string, previous: unknown): unknown {
  const t = raw.trim();
  if (t === "") return undefined;
  if (typeof previous === "boolean" || t === "true" || t === "false") { if (t === "true") return true; if (t === "false") return false; }
  if (typeof previous === "number" || (typeof previous !== "string" && /^-?\d+(\.\d+)?$/.test(t)) || (typeof previous === "string" && /^-?\d+(\.\d+)?$/.test(t) && /^-?\d+(\.\d+)?$/.test(previous.trim()))) {
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return t;
}

/** The row with `path` removed (a dot path clears the last segment; the objects along it are copied). */
function withoutValue(row: DataRow, path: string): DataRow {
  const segs = path.split(".");
  const drop = (at: unknown, i: number): DataRow => {
    const base = at && typeof at === "object" && !Array.isArray(at) ? { ...(at as DataRow) } : {};
    if (i === segs.length - 1) delete base[segs[i]];
    else if (base[segs[i]] && typeof base[segs[i]] === "object") base[segs[i]] = drop(base[segs[i]], i + 1);
    return base;
  };
  return drop(row, 0);
}

/** The collection with one item's field set (undefined = removed) — the item copied, the log untouched. */
export function setItemField<T extends Pick<CollectionDoc, "items">>(doc: T, id: number, path: string, value: unknown): T {
  return {
    ...doc,
    items: doc.items.map((it) => (it.id !== id ? it : (value === undefined ? withoutValue(it, path) : withValue(it, path, value)) as CollectionItem)),
  };
}

/** The picture standing for an item: its `featured` when that is one of its pictures, else its first. */
export function featuredOf(item: DataRow, images: string[]): string | null {
  const f = item.featured;
  if (typeof f === "string" && images.includes(f)) return f;
  return images[0] ?? null;
}
