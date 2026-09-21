/**
 * The `.policy` kind — a DETERMINISTIC input → filter → bucket machine.
 *
 *   params  — the typed input parameters an item carries.
 *   cases   — an ordered SWITCH: each case is a filter (clauses ANDed) over
 *             the params plus the bucket it assigns. First match WINS and
 *             the switch stops — buckets are mutually exclusive.
 *   buckets — the declared outputs; `default:` names the bucket for items
 *             no case claims (omitted = the built-in "unmatched" bucket).
 *
 * Applying the policy to ONE item answers {bucket, case}; applying it to a
 * LIST answers the 1-D grouping a OneDList renders directly. Everything in
 * here is pure — no dates, no randomness, no IO.
 *
 * A param's `type` is `string`, `number` or `boolean` (anything else reads
 * as string). A clause's `op` is one of: equals, not_equals, contains,
 * not_contains, starts_with, ends_with, matches, gt, gte, lt, lte, between
 * (`value: [low, high]`), in, not_in (`value:` a list), is_empty, not_empty,
 * is_true, is_false. Text ops take one value or a list (any of them; none
 * of them for the negated ops) and compare case-insensitively.
 *
 * The parser is lenient — a half-written policy still opens — and the
 * CHECKER is strict: `policyProblems` names a case with no bucket, a bucket
 * or default no `buckets:` entry declares, a clause on a param `params:`
 * does not declare, an op not in the list above, a value the op cannot use
 * (`between` without two numbers, `in` without a list, a numeric op without
 * a number), a param type outside the three, and a duplicate param or bucket
 * key — because a dropped clause leaves its case matching EVERYTHING, and
 * a switch that guesses is not deterministic.
 */
import yaml from "js-yaml";

export type ParamType = "string" | "number" | "boolean";

export interface PolicyParam {
  key: string;
  label?: string;
  type: ParamType;
}

/** One condition over one param. String matching is CASE-INSENSITIVE —
 *  policies filter prose, and prose capitalizes freely. */
export interface PolicyClause {
  param: string;
  op:
    | "equals" | "not_equals"
    | "contains" | "not_contains"     // a LIST value = any of them (none of them for not_contains)
    | "starts_with" | "ends_with"     // the same for every text op: "name contains caravan or truck"
    | "matches"                      // regex, case-insensitive (a list = any of the patterns)
    | "gt" | "gte" | "lt" | "lte"
    | "between"                      // value: [low, high], inclusive, numeric
    | "in" | "not_in"                // value: a list; the field's text, case-insensitive
    | "is_empty" | "not_empty"
    | "is_true" | "is_false";
  value?: string | number | (string | number)[];
}

/** A clause value as authored: a string, a number, or a list of those (YAML booleans read as
 *  yes/no, the same rule as decision keys, since clause values compare against text). */
export function clauseValue(v: unknown): PolicyClause["value"] {
  const one = (x: unknown): string | number | undefined =>
    typeof x === "boolean" ? (x ? "yes" : "no") : typeof x === "string" || typeof x === "number" ? x : undefined;
  if (Array.isArray(v)) return v.map(one).filter((x): x is string | number => x !== undefined);
  return one(v);
}

export interface PolicyCase {
  label?: string;
  /** ALL clauses must hold (AND). An empty list matches everything. */
  when: PolicyClause[];
  bucket: string;
}

export interface PolicyBucket {
  key: string;
  label?: string;
  /** Optional timeslot ("HH:MM") — a policy whose buckets carry times fans
   *  items onto a day, and a run over it can draw a calendar. */
  start?: string;
  end?: string;
}

export interface PolicyDoc {
  title: string;
  description?: string;
  params: PolicyParam[];
  cases: PolicyCase[];
  buckets: PolicyBucket[];
  /** Bucket for items no case claims. Omitted = built-in "unmatched". */
  default?: string;
}

export const UNMATCHED = "unmatched";

export const labelOfParam = (p: PolicyParam): string => p.label ?? p.key;

/**
 * A policy RUN: this policy applied to a whole list of items, rather than
 * one hand-typed input. `map` says which list column feeds which param —
 * "label" means the row's own label, anything else a field name, and a
 * list of names is joined with a space (so prose params can read several
 * columns at once).
 */
export interface PolicyRunDoc {
  role: "run";
  title: string;
  description?: string;
  /** Path of the `.policy` to apply. */
  policy: string;
  /** Path of the `.list` whose rows are the items. */
  items: string;
  /** policy param key -> list column(s). */
  map: Record<string, string[]>;
  /** The day this run schedules ("YYYY-MM-DD") — shown on the calendar. */
  date?: string;
}

export type PolicyFile = ({ role: "policy" } & PolicyDoc) | PolicyRunDoc;

/** Which role a `.policy` file plays: a run names a policy AND a list. */
export function parsePolicyFile(text: string): PolicyFile {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  const policy = str(raw.policy);
  const items = str(raw.items);
  if (policy && items) {
    const map: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(rec(raw.map))) {
      const cols = typeof v === "string" ? [v] : arr(v).map(str).filter(Boolean) as string[];
      if (cols.length) map[k] = cols;
    }
    // A bare `2026-09-21` is a Date to YAML; quoted, it is text — both are the day.
    const date = raw.date instanceof Date ? raw.date.toISOString().slice(0, 10) : str(raw.date);
    return {
      role: "run",
      title: str(raw.title) ?? "Policy run",
      ...(str(raw.description) ? { description: str(raw.description)! } : {}),
      policy, items, map,
      ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}),
    };
  }
  return { role: "policy", ...parsePolicy(text) };
}

/** One list row as policy input, through the run's column mapping. */
export function inputForRow(
  run: PolicyRunDoc,
  row: { label?: string; fields?: Record<string, string> },
): PolicyInput {
  const value = (col: string): string =>
    col === "label" ? (row.label ?? "") : (row.fields?.[col] ?? "");
  const out: PolicyInput = {};
  for (const [param, cols] of Object.entries(run.map)) {
    out[param] = cols.map(value).filter(Boolean).join(" ");
  }
  return out;
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const isObj = (x: unknown): boolean => !!x && typeof x === "object" && !Array.isArray(x);

export const OPS = new Set<PolicyClause["op"]>([
  "equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with",
  "matches", "gt", "gte", "lt", "lte", "between", "in", "not_in", "is_empty", "not_empty", "is_true", "is_false",
]);

/** Clause-list parsing shared by every kind that filters on clauses (a
 *  ranking's derive rules, a memory's include and derive). LENIENT: a clause
 *  without an op means `contains`, and unknown ops drop the clause rather
 *  than the document. The policy's own `cases:` stay strict — a switch that
 *  guesses is not deterministic. */
export function parseClauses(x: unknown): PolicyClause[] {
  return arr(x).map(rec).flatMap((c) => {
    const param = str(c.param);
    const op = (str(c.op) ?? "contains") as PolicyClause["op"];
    if (!param || !OPS.has(op)) return [];
    const v = clauseValue(c.value);
    return [{ param, op, ...(v !== undefined ? { value: v } : {}) }];
  });
}

export function parsePolicy(text: string): PolicyDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  const params = arr(raw.params).map((x) => {
    const o = rec(x);
    const key = str(o.key);
    if (!key) return null;
    const t = str(o.type);
    return {
      key,
      ...(str(o.label) ? { label: str(o.label)! } : {}),
      type: (t === "number" || t === "boolean" ? t : "string") as ParamType,
    };
  }).filter(Boolean) as PolicyParam[];
  const cases = arr(raw.cases).map((x) => {
    const o = rec(x);
    const bucket = str(o.bucket);
    if (!bucket) return null;
    const when = arr(o.when).map((c) => {
      const co = rec(c);
      const param = str(co.param);
      const op = str(co.op) as PolicyClause["op"] | undefined;
      if (!param || !op || !OPS.has(op)) return null;
      const v = clauseValue(co.value);
      return { param, op, ...(v !== undefined ? { value: v } : {}) };
    }).filter(Boolean) as PolicyClause[];
    return {
      ...(str(o.label) ? { label: str(o.label)! } : {}),
      when, bucket,
    };
  }).filter(Boolean) as PolicyCase[];
  const buckets = arr(raw.buckets).map((x) => {
    const o = rec(x);
    const key = str(o.key);
    if (!key) return null;
    const start = str(o.start);
    const end = str(o.end);
    return {
      key,
      ...(str(o.label) ? { label: str(o.label)! } : {}),
      ...(start && slotMinutes(start) !== null ? { start } : {}),
      ...(end && slotMinutes(end) !== null ? { end } : {}),
    };
  }).filter(Boolean) as PolicyBucket[];
  return {
    title: str(raw.title) ?? "Policy",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    params, cases, buckets,
    ...(str(raw.default) ? { default: str(raw.default)! } : {}),
  };
}

const NUMERIC_OPS = new Set(["gt", "gte", "lt", "lte"]);
const LIST_OPS = new Set(["in", "not_in"]);
const BARE_OPS = new Set(["is_empty", "not_empty", "is_true", "is_false"]);
const TEXT_OPS = new Set(["contains", "not_contains", "starts_with", "ends_with", "matches"]);
const PARAM_TYPES = new Set(["string", "number", "boolean"]);

/** What the lenient parser dropped or defaulted in a BUCKET policy (`role` absent or `bucket`),
 *  as the checker reports it — the field table's `required` rows enforced and every silent
 *  fallback named. A run (`policy` + `items`) is checked for its two refs and its map. */
export function policyProblems(text: string): string[] {
  let raw: Record<string, unknown>;
  try { raw = rec(yaml.load(text)); } catch { return []; }
  const out: string[] = [];
  const doc = parsePolicyFile(text);
  if (doc.role === "run") {
    for (const [k, v] of Object.entries(rec(raw.map))) {
      if (typeof v !== "string" && !(Array.isArray(v) && v.every((x) => typeof x === "string"))) out.push(`map ${k}: a field name or a list of them`);
    }
    if (raw.date !== undefined && !doc.date) out.push("`date` is not `YYYY-MM-DD`");
    return out;
  }
  if (typeof raw.policy === "string" || typeof raw.items === "string") out.push("a run names both `policy` and `items` — one without the other is a bucket policy missing its cases");
  if (!str(raw.title)) out.push("no `title` — a name for the rules");
  const params = new Set<string>();
  arr(raw.params).forEach((x, i) => {
    const o = rec(x);
    const key = str(o.key);
    if (!key) { out.push(`param ${i + 1}: no \`key\``); return; }
    if (params.has(key)) out.push(`param ${key}: duplicate key`);
    params.add(key);
    if (o.type !== undefined && !PARAM_TYPES.has(String(o.type))) out.push(`param ${key}: type \`${String(o.type)}\` is not one of string, number, boolean`);
  });
  const buckets = new Set<string>();
  arr(raw.buckets).forEach((x, i) => {
    const o = rec(x);
    const key = str(o.key);
    if (!key) { out.push(`bucket ${i + 1}: no \`key\``); return; }
    if (buckets.has(key)) out.push(`bucket ${key}: duplicate key`);
    buckets.add(key);
    for (const k of ["start", "end"] as const) {
      if (o[k] !== undefined && slotMinutes(str(o[k])) === null) out.push(`bucket ${key}: \`${k}\` is not a time — write \`HH:MM\``);
    }
  });
  const defaultKey = str(raw.default);
  if (raw.default !== undefined && !defaultKey) out.push("`default` is not a bucket key");
  if (defaultKey && buckets.size && !buckets.has(defaultKey)) out.push(`default \`${defaultKey}\` is not a declared bucket — one of ${[...buckets].join(", ")}`);
  if (!Array.isArray(raw.cases)) out.push("no `cases` — the ordered switch; `cases: []` claims nothing");
  arr(raw.cases).forEach((x, i) => {
    const o = rec(x);
    const name = `case ${i + 1}${str(o.label) ? ` (${str(o.label)})` : ""}`;
    if (!isObj(x)) { out.push(`${name}: not a mapping — write \`when\` and \`bucket\``); return; }
    const bucket = str(o.bucket);
    if (!bucket) out.push(`${name}: no \`bucket\` — the case is dropped and can never claim an item`);
    else if (buckets.size && !buckets.has(bucket)) out.push(`${name}: bucket \`${bucket}\` is not declared — one of ${[...buckets].join(", ")}`);
    if (o.when === undefined) out.push(`${name}: no \`when\` — an empty \`when: []\` says "always" on purpose`);
    else if (!Array.isArray(o.when)) out.push(`${name}: \`when\` is not a list of clauses`);
    arr(o.when).forEach((c, j) => {
      const co = rec(c);
      const where = `${name}, clause ${j + 1}`;
      const param = str(co.param);
      const op = str(co.op);
      if (!param) out.push(`${where}: no \`param\` — the clause is dropped, and a case with no clauses left matches everything`);
      else if (params.size && !params.has(param)) out.push(`${where}: param \`${param}\` is not declared — one of ${[...params].join(", ")}`);
      if (!op) { out.push(`${where}: no \`op\` — the clause is dropped, and a case with no clauses left matches everything`); return; }
      if (!OPS.has(op as PolicyClause["op"])) { out.push(`${where}: op \`${op}\` is not one — the clause is dropped, and a case with no clauses left matches everything; ops are ${[...OPS].join(", ")}`); return; }
      const v = co.value;
      if (NUMERIC_OPS.has(op) && !Number.isFinite(Number(v)) ) out.push(`${where}: \`${op}\` needs a number (got ${JSON.stringify(v)})`);
      if (op === "between" && !(Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(Number(n))))) out.push(`${where}: \`between\` needs \`value: [low, high]\` (got ${JSON.stringify(v)})`);
      if (LIST_OPS.has(op) && !Array.isArray(v)) out.push(`${where}: \`${op}\` needs \`value:\` as a list (got ${JSON.stringify(v)})`);
      if (BARE_OPS.has(op) && v !== undefined) out.push(`${where}: \`${op}\` takes no value`);
      if (TEXT_OPS.has(op) && v === undefined) out.push(`${where}: \`${op}\` needs a \`value\` — one, or a list meaning any of them`);
    });
  });
  return out;
}

/** One line for the checker: what the switch holds. */
export function policySummary(doc: PolicyFile): string {
  if (doc.role === "run") return `run: ${doc.policy} over ${doc.items}, ${Object.keys(doc.map).length} params mapped`;
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
  return `${n(doc.params.length, "param")}, ${n(doc.cases.length, "case")}, ${n(doc.buckets.length, "bucket")}${doc.default ? `, default ${doc.default}` : ""}`;
}

export type PolicyInput = Record<string, string | number | boolean>;

/** One clause against one input. Unknown params and malformed regexes never
 *  throw — the clause simply fails, keeping the switch deterministic. */
export function clauseHolds(clause: PolicyClause, input: PolicyInput): boolean {
  const v = input[clause.param];
  const s = v === undefined || v === null ? "" : String(v).toLowerCase();
  // A text op takes ONE value or a LIST: a list means ANY of them (for the
  // negated ops, NONE of them) — "name contains caravan or truck".
  const needles = (Array.isArray(clause.value) ? clause.value : clause.value === undefined ? [] : [clause.value])
    .map((x) => String(x).toLowerCase()).filter((x) => x !== "");
  const any = (test: (needle: string) => boolean) => needles.some(test);
  // An EMPTY value is unknown, not zero — numeric clauses must fail on it,
  // so a missing salary falls through a floor gate instead of tripping it.
  const n = typeof v === "number" ? v : s.trim() === "" ? NaN : Number(v);
  const cmp = typeof clause.value === "number" ? clause.value : Number(clause.value);
  switch (clause.op) {
    case "equals": return needles.length ? any((x) => s === x) : s === "";
    case "not_equals": return needles.length ? !any((x) => s === x) : s !== "";
    case "contains": return any((x) => s.includes(x));
    case "not_contains": return !any((x) => s.includes(x));
    case "starts_with": return any((x) => s.startsWith(x));
    case "ends_with": return any((x) => s.endsWith(x));
    case "matches": {
      if (!needles.length) return false;
      const raw = Array.isArray(clause.value) ? clause.value : [clause.value];
      return raw.some((p) => { try { return new RegExp(String(p), "i").test(String(v ?? "")); } catch { return false; } });
    }
    case "gt": return Number.isFinite(n) && Number.isFinite(cmp) && n > cmp;
    case "gte": return Number.isFinite(n) && Number.isFinite(cmp) && n >= cmp;
    case "lt": return Number.isFinite(n) && Number.isFinite(cmp) && n < cmp;
    case "lte": return Number.isFinite(n) && Number.isFinite(cmp) && n <= cmp;
    case "between": {
      const [lo, hi] = (Array.isArray(clause.value) ? clause.value : []).map(Number);
      return Number.isFinite(n) && Number.isFinite(lo) && Number.isFinite(hi) && n >= Math.min(lo, hi) && n <= Math.max(lo, hi);
    }
    case "in": return (Array.isArray(clause.value) ? clause.value : []).some((x) => String(x).toLowerCase() === s);
    case "not_in": return !(Array.isArray(clause.value) ? clause.value : []).some((x) => String(x).toLowerCase() === s);
    case "is_empty": return s.trim() === "";
    case "not_empty": return s.trim() !== "";
    case "is_true": return v === true || s === "true";
    case "is_false": return v === false || s === "false" || v === undefined;
  }
}

export interface PolicyVerdict {
  /** The assigned bucket key — a declared bucket, the default, or UNMATCHED. */
  bucket: string;
  /** Index of the case that claimed the item; -1 = no case matched. */
  caseIndex: number;
}

/** THE SWITCH: cases in order, all clauses ANDed, first match wins & stops. */
export function applyPolicy(doc: PolicyDoc, input: PolicyInput): PolicyVerdict {
  for (let i = 0; i < doc.cases.length; i++) {
    if (doc.cases[i].when.every((c) => clauseHolds(c, input))) {
      return { bucket: doc.cases[i].bucket, caseIndex: i };
    }
  }
  return { bucket: doc.default ?? UNMATCHED, caseIndex: -1 };
}

export const bucketLabel = (doc: PolicyDoc, key: string): string =>
  key === UNMATCHED ? "Unmatched"
    : doc.buckets.find((b) => b.key === key)?.label ?? key;

/** A LIST of items through the policy — the project-facing use: the result
 *  is the 1-D grouping (bucket order = declared order, unmatched last). */
export function applyPolicyToItems<T extends PolicyInput>(doc: PolicyDoc, items: T[]):
  { item: T; verdict: PolicyVerdict }[] {
  return items.map((item) => ({ item, verdict: applyPolicy(doc, item) }));
}

/** Bucket order for a OneDList dimension: declared buckets, then any case
 *  buckets never declared, then the default/unmatched residue. */
export function bucketOrder(doc: PolicyDoc): string[] {
  const declared = doc.buckets.map((b) => b.key);
  const fromCases = doc.cases.map((c) => c.bucket).filter((k) => !declared.includes(k));
  const tail = [doc.default ?? UNMATCHED].filter((k) => !declared.includes(k) && !fromCases.includes(k));
  return [...declared, ...[...new Set(fromCases)], ...tail];
}

/** "HH:MM" → minutes since midnight; anything else → null. */
export function slotMinutes(s: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** A bucket's timeslot in minutes, when it carries a coherent one. */
export function bucketSlot(b: PolicyBucket): { start: number; end: number } | null {
  const start = slotMinutes(b.start);
  const end = slotMinutes(b.end);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

/** True when the policy fans items onto a day — any bucket carries a slot. */
export const hasTimedBuckets = (doc: PolicyDoc): boolean =>
  doc.buckets.some((b) => bucketSlot(b) !== null);

/** Human-readable clause line for the case list. */
export function clauseText(c: PolicyClause): string {
  const V = c.value === undefined ? "" : ` “${Array.isArray(c.value) ? c.value.join(", ") : c.value}”`;
  return `${c.param} ${c.op.replace(/_/g, " ")}${V}`;
}
