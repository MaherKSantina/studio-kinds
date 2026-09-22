/**
 * The `.middleware` kind — rows AMENDED on their way to a view. A source,
 * and rules that each pick a few rows (or one) by clauses and SET fields on
 * them. "I opened this listing and the page said it is not available for
 * those dates": a rule matching the listing's link sets its availability
 * to false. The scrape stays as it was, the correction lives here — dated,
 * explained — and every `.jsonl` that names this middleware among its
 * `$sources` (instead of the raw file) sees the corrected rows, read live,
 * never cached. A field a rule sets that no row had is a NEW column: the
 * policy the `.jsonl` applies decides whether it shows.
 *
 * Authoring shape (YAML, lenient — a half-written file still renders):
 *
 *   title, description?
 *   source: accommodation.json#properties      # a .json (#key naming its list), a .jsonl, a .csv,
 *                                              # or another .middleware (chains; no cycles)
 *   rules:
 *     - where:                                 # EVERY clause must hold — the one clause vocabulary
 *         - {field: best_offer.url, op: equals, value: "https://www.airbnb.com.au/rooms/1770093089894538093?…"}
 *       set: {available_for_dates: false, availability_note: "Airbnb page, 15 Sep: not available for these dates"}
 *       note: what you saw, for the reader     # optional
 *     - {where: [{field: name, op: equals, value: Family Room}], key: sleeps, value: 4}   # one key: key/value
 *
 * A `field` is a key of the row or a dot path into nested objects; a `set`
 * key may be a dot path too (best_offer.price_total_aud: 900) — the nested
 * object is copied, never mutated in place. Ops: equals, not_equals,
 * contains, not_contains, starts_with, ends_with, matches, gt, gte, lt, lte,
 * between, in, not_in, is_empty, not_empty, is_true, is_false (policyDoc.ts);
 * a text op takes one value or a list — any of them:
 *     - {where: [{field: name, op: contains, value: [caravan, truck]}], set: {type: Camper}}
 * A rule that matches NO row is a PROBLEM (the link changed, the row is
 * gone) — the checker and the view report every rule's match count. A rule
 * with no clauses matches every row.
 */
import yaml from "js-yaml";
import { clauseHolds, type PolicyClause } from "./policyDoc";
import { parseSourceRef, type DataRow, type SourceRef } from "./dataRows";
import { clauseInput, readClauses } from "./tablePolicy";

export interface MiddlewareRule {
  /** ALL must hold; none = every row. */
  where: PolicyClause[];
  /** Field → value set on each matched row; keys may be dot paths. */
  set: Record<string, unknown>;
  note?: string;
}

export interface MiddlewareDoc {
  title: string;
  description?: string;
  source: SourceRef | null;
  rules: MiddlewareRule[];
  /** Authoring problems: no source, a rule without a field or an op, a rule that sets nothing. */
  problems: string[];
}

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

/** One rule as written — its clauses, its set (`set:` and `key`/`value` merged) and its note; `at` names
 *  it in a problem ("rule 2", "stage corrections rule 2"). A pipeline's rules are read here too. */
export function readRule(o: Record<string, unknown>, problems: string[], at: string): MiddlewareRule {
  const where = readClauses(o.where, problems, `${at} where`);
  const set: Record<string, unknown> = { ...rec(o.set) };
  if (typeof o.key === "string" && o.key.trim()) set[o.key.trim()] = o.value;
  if (!Object.keys(set).length) problems.push(`${at}: sets nothing — give it set: {field: value} or key/value`);
  return { where, set, ...(str(o.note) ? { note: str(o.note)! } : {}) };
}

/** Lenient parse — never throws; what cannot be read is a problem, not a crash. */
export function parseMiddleware(text: string): MiddlewareDoc {
  let raw: Record<string, unknown> = {};
  const problems: string[] = [];
  try { raw = rec(yaml.load(text)); } catch (e) { problems.push(`YAML: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`); }

  const source = raw.source === undefined ? null : parseSourceRef(raw.source);
  if (raw.source !== undefined && !source) problems.push("source: not a file ref");

  const rules = arr(raw.rules).map((r, i) => readRule(rec(r), problems, `rule ${i + 1}`));
  if (raw.rules !== undefined && !Array.isArray(raw.rules)) problems.push("rules: must be a list");

  return {
    title: str(raw.title) ?? "",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    source, rules, problems,
  };
}

/** The row with `value` at `path` (a dot path builds or copies the objects along it); the row itself untouched. */
export function withValue(row: DataRow, path: string, value: unknown): DataRow {
  const segs = path.split(".");
  const build = (at: unknown, i: number): DataRow => {
    const base = at && typeof at === "object" && !Array.isArray(at) ? { ...(at as DataRow) } : {};
    if (i === segs.length - 1) base[segs[i]] = value;
    else base[segs[i]] = build(base[segs[i]], i + 1);
    return base;
  };
  return build(row, 0);
}

export interface MiddlewareResult {
  rows: DataRow[];
  /** Per rule, the indices (in `rows`) it amended. */
  matches: number[][];
  /** Rows at least one rule touched. */
  amended: number;
  problems: string[];
}

/** The rules applied in order to copies of the rows; later rules see earlier rules' values. */
export function applyMiddleware(doc: MiddlewareDoc, source: DataRow[]): MiddlewareResult {
  const rows = [...source];
  const touched = new Set<number>();
  const problems = [...doc.problems];
  const matches = doc.rules.map((rule, r) => {
    const hit: number[] = [];
    rows.forEach((row, i) => {
      if (!rule.where.every((c) => clauseHolds(c, clauseInput(row, rule.where)))) return;
      let next = row;
      for (const [k, v] of Object.entries(rule.set)) next = withValue(next, k, v);
      rows[i] = next;
      hit.push(i);
      touched.add(i);
    });
    if (!hit.length && source.length) problems.push(`rule ${r + 1} matches no row`);
    return hit;
  });
  return { rows, matches, amended: touched.size, problems };
}

/** A set as text — "available_for_dates = false, note = “…”". */
export function setText(set: Record<string, unknown>): string {
  return Object.entries(set).map(([k, v]) => `${k} = ${typeof v === "string" ? `“${v}”` : JSON.stringify(v)}`).join(", ");
}
