/**
 * The TABLE role of a `.policy` (`role: table`) — a policy over ROWS: which
 * to keep, in which order, which columns. The file holds RULES only and
 * knows NOTHING about the data: no source, no title for the rows, no header
 * labels. The rows come from the `.jsonl` that applies it — its directive
 * lines name the sources, this policy, and everything said about the data
 * (see dataRows.ts) — read live on every open and never cached, so several
 * `.jsonl` files can share one policy and none can drift from its data.
 *
 * Authoring shape (YAML, lenient — a half-written file still renders):
 *
 *   role: table
 *   title, description?                # a name for the RULES ("within the price band, cheapest first"), never the data
 *   where:                            # EVERY clause must hold (AND); a row failing one is out
 *     - {field: available_for_dates, op: is_true}
 *     - {field: best_offer.price_total_aud, op: between, value: [600, 2000]}
 *   sort:                             # first key first; a later key breaks ties
 *     - {field: best_offer.price_total_aud, dir: asc}
 *     - {field: distance_from_narooma_km, dir: asc}
 *   columns: [name, sleeps, best_offer.price_total_aud, "*"]   # shown, in THIS order; omitted = every
 *                                     # column the rows carry; "*" = every other column, after these
 *   hide: [images]                    # subtracted from the columns shown
 *   limit: 100                        # at most this many rows
 *
 * A `field` is a key of the row, or a DOT PATH into nested objects
 * (`best_offer.price_total_aud`), everywhere a field is named. The ops are
 * the suite's one clause vocabulary (policyDoc.ts): equals, not_equals,
 * contains, not_contains, starts_with, ends_with, matches (regex), gt, gte,
 * lt, lte, between ([low, high]), in / not_in (a list), is_empty, not_empty,
 * is_true, is_false — text ops case-insensitive and taking one value or a
 * LIST (any of them; none of them for the not_ ops: {field: name, op:
 * contains, value: [caravan, truck]}), numeric ops never true for an empty
 * field. An unknown op, a sort direction that is not asc/desc, a
 * column no row carries are PROBLEMS the checker and the view report, not
 * silent drops.
 *
 * Apply it from a `.jsonl` beside it — the title and the header labels
 * belong THERE, with the data:
 *
 *   {"$sources": ["accommodation.json#properties"], "$policy": "cheapest.policy"}
 *   {"$title": "Stays by price", "$labels": {"best_offer.price_total_aud": "Total (4 nights, AUD)"}}
 */
import yaml from "js-yaml";
import { OPS, clauseHolds, parseClauses, type PolicyClause, type PolicyInput } from "./policyDoc";
import { cellText, compareValues, valueAt, type DataRow, type SortDir } from "./dataRows";

export interface TableSort { field: string; dir: SortDir }

export interface TablePolicyDoc {
  role: "table";
  title: string;
  description?: string;
  where: PolicyClause[];
  sort: TableSort[];
  columns?: string[];
  hide: string[];
  limit?: number;
  /** Authoring problems: an unknown op, a sort direction that is not asc/desc, a clause without a field. */
  problems: string[];
}

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const strList = (x: unknown): string[] => (typeof x === "string" ? [x] : arr(x).map(str).filter((s): s is string => !!s));

/** Lenient parse — never throws; what cannot be read is a problem, not a crash. */
export function parseTablePolicy(text: string): TablePolicyDoc {
  let raw: Record<string, unknown> = {};
  const problems: string[] = [];
  try { raw = rec(yaml.load(text)); } catch (e) { problems.push(`YAML: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`); }

  // `field` is the table's word for policyDoc's `param`; both are read.
  const clausesRaw: Record<string, unknown>[] = arr(raw.where).map((c) => {
    const o = rec(c);
    return { ...o, param: str(o.param) ?? str(o.field) };
  });
  clausesRaw.forEach((o, i) => {
    if (!o.param) problems.push(`where ${i + 1}: no field`);
    else if (o.op === undefined) problems.push(`where ${i + 1}: no op`);
    else if (!OPS.has(str(o.op) as PolicyClause["op"])) problems.push(`where ${i + 1}: unknown op "${String(o.op)}"`);
  });
  const where = parseClauses(clausesRaw);

  const sort: TableSort[] = [];
  arr(raw.sort).forEach((s, i) => {
    const o = typeof s === "string" ? { field: s } : rec(s);
    const field = str(o.field) ?? str(o.param);
    const dir = str(o.dir) ?? "asc";
    if (!field) { problems.push(`sort ${i + 1}: no field`); return; }
    if (dir !== "asc" && dir !== "desc") { problems.push(`sort ${i + 1}: dir must be asc or desc, not "${dir}"`); return; }
    sort.push({ field, dir });
  });

  if (raw.rename !== undefined) problems.push("rename: header labels belong to the .jsonl that applies this policy ($labels), not to the rules");
  if (raw.source !== undefined || raw.sources !== undefined) problems.push("source: the data is named by the .jsonl that applies this policy ($sources), not by the rules");
  const limitRaw = raw.limit;
  const limit = typeof limitRaw === "number" && limitRaw > 0 ? Math.floor(limitRaw) : undefined;
  if (limitRaw !== undefined && limit === undefined) problems.push("limit: must be a positive number");
  const columns = raw.columns === undefined ? undefined : strList(raw.columns);

  return {
    role: "table",
    title: str(raw.title) ?? "",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    where, sort,
    ...(columns ? { columns } : {}),
    hide: strList(raw.hide),
    ...(limit !== undefined ? { limit } : {}),
    problems,
  };
}

export interface TableResult {
  rows: DataRow[];
  /** Rows given, before the rules. */
  total: number;
  columns: string[];
  problems: string[];
}

/** A row as the clauses see it: the clause's fields resolved (dot paths included), objects as text. */
export function clauseInput(row: DataRow, clauses: PolicyClause[]): PolicyInput {
  const out: PolicyInput = {};
  for (const c of clauses) {
    const v = valueAt(row, c.param);
    out[c.param] = typeof v === "number" || typeof v === "boolean" || typeof v === "string" ? v : cellText(v);
  }
  return out;
}

/** The columns a set of rows carries, first-seen order. */
export function columnsOf(rows: DataRow[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); found.push(k); }
  return found;
}

/** The rules applied: filter, sort (first key first), cap; then the columns to show. */
export function applyTablePolicy(doc: TablePolicyDoc, source: DataRow[]): TableResult {
  const kept = source.filter((row) => {
    const input = clauseInput(row, doc.where);
    return doc.where.every((c) => clauseHolds(c, input));
  });
  const ordered = kept.map((row, i) => ({ row, i })).sort((a, b) => {
    for (const s of doc.sort) {
      const c = compareValues(valueAt(a.row, s.field), valueAt(b.row, s.field), s.dir);
      if (c !== 0) return c;
    }
    return a.i - b.i;
  }).map((x) => x.row);
  const rows = doc.limit ? ordered.slice(0, doc.limit) : ordered;

  const hidden = new Set(doc.hide);
  const found = columnsOf(rows);
  const listed = doc.columns;
  // "*" stands for every column the rows carry that is not named — after the named ones.
  const expanded = listed ? listed.flatMap((c) => (c === "*" ? found.filter((f) => !listed.includes(f)) : [c])) : found;
  const columns = expanded.filter((c, i) => !hidden.has(c) && expanded.indexOf(c) === i);

  const problems = [...doc.problems];
  if (listed) {
    for (const c of listed) if (c !== "*" && rows.length && !rows.some((r) => valueAt(r, c) !== undefined)) problems.push(`column "${c}": no row carries it`);
  }
  for (const s of doc.sort) if (rows.length && !rows.some((r) => valueAt(r, s.field) !== undefined)) problems.push(`sort "${s.field}": no row carries it`);
  return { rows, total: source.length, columns, problems };
}

/** One clause as a sentence — "price between 600 and 2000", "area is one of Narooma, Tilba". */
export function clauseSentence(c: PolicyClause): string {
  const list = Array.isArray(c.value) ? c.value : c.value === undefined ? [] : [c.value];
  const q = (v: string | number) => (typeof v === "number" ? String(v) : `“${v}”`);
  // A list on a text op reads "any of a, b" — "none of" for the negated ops.
  const any = list.length > 1 ? `any of ${list.map(q).join(", ")}` : list.length ? q(list[0]) : "…";
  const none = list.length > 1 ? `none of ${list.map(q).join(", ")}` : list.length ? q(list[0]) : "…";
  const one = list.length ? q(list[0]) : "…";
  switch (c.op) {
    case "equals": return `${c.param} is ${any}`;
    case "not_equals": return `${c.param} is ${none === any ? `not ${none}` : none}`;
    case "contains": return `${c.param} contains ${any}`;
    case "not_contains": return `${c.param} contains ${list.length > 1 ? none : `no ${none}`}`;
    case "starts_with": return `${c.param} starts with ${any}`;
    case "ends_with": return `${c.param} ends with ${any}`;
    case "matches": return `${c.param} matches ${list.map((p) => `/${p}/`).join(" or ") || "/…/"}`;
    case "gt": return `${c.param} greater than ${one}`;
    case "gte": return `${c.param} at least ${one}`;
    case "lt": return `${c.param} less than ${one}`;
    case "lte": return `${c.param} at most ${one}`;
    case "between": return `${c.param} between ${list[0] ?? "…"} and ${list[1] ?? "…"}`;
    case "in": return `${c.param} is one of ${list.map(q).join(", ") || "…"}`;
    case "not_in": return `${c.param} is none of ${list.map(q).join(", ") || "…"}`;
    case "is_empty": return `${c.param} is empty`;
    case "not_empty": return `${c.param} is not empty`;
    case "is_true": return `${c.param} is true`;
    case "is_false": return `${c.param} is false`;
  }
}

/** The rules in one line — for a lead above a table: "2 filters · sorted by price asc, then km asc · first 100".
 *  `labels` are the VIEW's header names (the .jsonl's $labels), so the line reads as the table does. */
export function rulesSummary(doc: TablePolicyDoc, labels: Record<string, string> = {}): string {
  const label = (f: string) => labels[f] ?? f;
  return [
    doc.where.length ? `${doc.where.length} filter${doc.where.length === 1 ? "" : "s"}` : "",
    doc.sort.length ? `sorted by ${doc.sort.map((s) => `${label(s.field)} ${s.dir}`).join(", then ")}` : "",
    doc.limit ? `first ${doc.limit}` : "",
  ].filter(Boolean).join(" · ");
}
