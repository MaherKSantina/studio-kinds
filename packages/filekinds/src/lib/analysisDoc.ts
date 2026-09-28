/**
 * The `.analysis` kind — A DECISION OVER CLOSED INPUTS. `dimensions` name the
 * inputs and every value each can take; `rules`, in precedence order, say what
 * follows from a combination (`when` over the inputs, `then` the outputs — the
 * FIRST rule whose `when` holds decides); `outcome` names the output key that
 * is the result, the one a leaf is coloured by. The view enumerates every
 * combination and draws them as a tree over the inputs, nested in the order
 * they are dragged into, each leaf the rule that decides there; locking input
 * values and pinning output values narrow it. Everything on the page is the
 * session's: nothing here writes the file.
 *
 *   title: Message list banner
 *   dimensions:
 *     party: [buyer, seller]
 *     offer: [none, sent, accepted]
 *   rules:
 *     - label: Pay now
 *       when: {party: buyer, offer: accepted}
 *       then: {type: button, title: Pay now}
 *   outcome: type
 *
 * The when grammar, per dimension: a bare value equals; `[a, b]` one of; `"*"`
 * any; `"!x"` not equal. Keys AND together; `{}` or no `when` is always.
 *
 * The parser is lenient — a half-written file still renders — and mirrors the
 * checker (`python/studio_kinds/kinds/analysis.py`): a dimension that is not
 * a list, a value that is not a scalar, a `then` that is not a mapping are
 * dropped here and named there.
 */
import yaml from "js-yaml";

export type DimValue = string | number | boolean;
/** A `when` condition on one dimension: a value equals; a list is one of; `"*"` any; `"!x"` not equal. */
export type WhenCond = DimValue | DimValue[];

export interface AnalysisRule {
  label: string;
  when: Record<string, WhenCond>;
  then: Record<string, DimValue>;
}

export interface AnalysisDoc {
  title: string;
  description?: string;
  /** Dimension → its values, in the order written. */
  dimensions: Record<string, DimValue[]>;
  dimensionOrder: string[];
  rules: AnalysisRule[];
  /** The output key that names the result. `type` when absent. */
  outcome: string;
  /** The YAML error when the text does not parse; the document is then empty. */
  error?: string;
}

/** The token of an output a rule does not set, and of a combination no rule decides. */
export const NONE = "—";
/** Past this many combinations the page stops enumerating and says so; lock values to come under it. */
export const MAX_COMBINATIONS = 200_000;

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const isScalar = (v: unknown): v is DimValue => typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/** A value as text, the way JavaScript writes it: `true`, `1`, `a`. */
export const showValue = (v: DimValue): string => String(v);

/** Lenient parse — never throws; an unparseable file opens as an empty analysis carrying the error. */
export function parseAnalysis(text: string): AnalysisDoc {
  let raw: Record<string, unknown> = {};
  let error: string | undefined;
  try { raw = rec(yaml.load(text)); } catch (e) { error = e instanceof Error ? e.message.split("\n")[0] : String(e); }
  const dimensions: Record<string, DimValue[]> = {};
  const dimensionOrder: string[] = [];
  for (const [name, values] of Object.entries(rec(raw.dimensions))) {
    if (!Array.isArray(values)) continue;
    const kept: DimValue[] = [];
    for (const v of values) if (isScalar(v) && !kept.includes(v)) kept.push(v);
    dimensions[name] = kept;
    dimensionOrder.push(name);
  }
  const rules: AnalysisRule[] = [];
  if (Array.isArray(raw.rules)) {
    raw.rules.forEach((r, i) => {
      const ro = rec(r);
      const when: Record<string, WhenCond> = {};
      for (const [dim, cond] of Object.entries(rec(ro.when))) {
        if (Array.isArray(cond)) when[dim] = cond.filter(isScalar);
        else if (isScalar(cond)) when[dim] = cond;
      }
      const then: Record<string, DimValue> = {};
      for (const [k, v] of Object.entries(rec(ro.then))) if (isScalar(v)) then[k] = v;
      rules.push({ label: str(ro.label) || `Rule ${i + 1}`, when, then });
    });
  }
  const description = str(raw.description);
  return {
    title: str(raw.title) ?? "",
    ...(description ? { description } : {}),
    dimensions, dimensionOrder, rules,
    outcome: str(raw.outcome) || "type",
    ...(error ? { error } : {}),
  };
}

/** Does one condition hold for a value? `"*"` always; `"!x"` when the value written as text is not `x`. */
export function matchCond(cond: WhenCond, value: DimValue | undefined): boolean {
  if (Array.isArray(cond)) return cond.some((c) => c === value);
  if (typeof cond === "string") {
    if (cond === "*") return true;
    if (cond.startsWith("!")) return value !== undefined && showValue(value) !== cond.slice(1);
  }
  return cond === value;
}

/** Does a rule's `when` hold for a combination? Every key must hold; no keys is always. */
export function matchWhen(when: Record<string, WhenCond>, values: Record<string, DimValue>): boolean {
  for (const [dim, cond] of Object.entries(when)) if (!matchCond(cond, values[dim])) return false;
  return true;
}

/** The rule that decides a combination — the first whose `when` holds — or -1. */
export function decide(doc: AnalysisDoc, values: Record<string, DimValue>): number {
  return doc.rules.findIndex((r) => matchWhen(r.when, values));
}

/** One combination, decided: its input values, the rule (or -1), and every output as a token. */
export interface Row {
  values: Record<string, DimValue>;
  rule: number;
  label: string;
  slots: Record<string, string>;
}

export interface Compiled {
  doc: AnalysisDoc;
  /** The output keys — the outcome first, then every key any rule's `then` sets, first seen first. */
  slots: string[];
  /** Per output key, every value the rules write as text, sorted, then `—`. */
  domains: Record<string, string[]>;
  /** How many combinations the whole space holds. */
  total: number;
  /** How many the locks keep. */
  kept: number;
  /** False when `kept` is past MAX_COMBINATIONS; `rows` is then empty. */
  enumerated: boolean;
  rows: Row[];
  /** Inputs whose value never changes any output, across the rows. */
  noEffect: Set<string>;
  /** Rows no rule decides. */
  unmatched: number;
  /** Rule indices that decide at least one row. */
  fired: Set<number>;
  /** Rule indices whose `when` holds for at least one row, whether or not an earlier rule took it. */
  matched: Set<number>;
}

/** Every value in a dimension the locks allow — all of them when the dimension is not locked. */
function domainUnder(doc: AnalysisDoc, dim: string, locks: Record<string, DimValue[]>): DimValue[] {
  const all = doc.dimensions[dim] ?? [];
  const lock = locks[dim];
  if (!lock || !lock.length) return all;
  return all.filter((v) => lock.includes(v));
}

/** The number of combinations — the whole space, or the part the locks keep; no dimensions is no combination. */
export function combinations(doc: AnalysisDoc, locks: Record<string, DimValue[]> = {}): number {
  if (!doc.dimensionOrder.length) return 0;
  let n = 1;
  for (const dim of doc.dimensionOrder) n *= domainUnder(doc, dim, locks).length;
  return n;
}

/** The output keys, the outcome first. */
export function slotsOf(doc: AnalysisDoc): string[] {
  const slots = [doc.outcome];
  for (const r of doc.rules) for (const k of Object.keys(r.then)) if (!slots.includes(k)) slots.push(k);
  return slots;
}

const byText = (a: string, b: string): number => (a === NONE ? 1 : b === NONE ? -1 : a < b ? -1 : a > b ? 1 : 0);

/** Per output key, the values the rules write, as text, sorted, with `—` last. */
export function domainsOf(doc: AnalysisDoc): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const slot of slotsOf(doc)) {
    const set = new Set<string>();
    for (const r of doc.rules) if (slot in r.then) set.add(showValue(r.then[slot]));
    out[slot] = [...set].sort(byText).concat(NONE);
  }
  return out;
}

/** Enumerate the combinations the locks keep and decide each; the space's counts come with them. */
export function compileAnalysis(doc: AnalysisDoc, locks: Record<string, DimValue[]> = {}): Compiled {
  const slots = slotsOf(doc);
  const domains = domainsOf(doc);
  const total = combinations(doc);
  const kept = combinations(doc, locks);
  const rows: Row[] = [];
  const fired = new Set<number>();
  const matched = new Set<number>();
  const noEffect = new Set<string>();
  let unmatched = 0;
  const enumerated = kept <= MAX_COMBINATIONS;
  if (enumerated && doc.dimensionOrder.length) {
    const dims = doc.dimensionOrder;
    const values: Record<string, DimValue> = {};
    const walk = (i: number) => {
      if (i === dims.length) {
        const v = { ...values };
        const rule = decide(doc, v);
        doc.rules.forEach((r, j) => { if (matchWhen(r.when, v)) matched.add(j); });
        const row: Row = { values: v, rule, label: rule < 0 ? "no rule" : doc.rules[rule].label, slots: {} };
        for (const s of slots) row.slots[s] = rule < 0 || !(s in doc.rules[rule].then) ? NONE : showValue(doc.rules[rule].then[s]);
        if (rule < 0) unmatched++; else fired.add(rule);
        rows.push(row);
        return;
      }
      for (const v of domainUnder(doc, dims[i], locks)) { values[dims[i]] = v; walk(i + 1); }
    };
    walk(0);
    // An input has no effect when, holding every other input fixed, changing it never changes the outputs.
    const SEP = "\u0000";
    const signature = (r: Row) => slots.map((s) => r.slots[s]).join(SEP);
    for (const dim of doc.dimensionOrder) {
      const others = doc.dimensionOrder.filter((d) => d !== dim);
      const groups = new Map<string, Set<string>>();
      for (const r of rows) {
        const key = others.map((d) => showValue(r.values[d])).join(SEP);
        let g = groups.get(key);
        if (!g) { g = new Set(); groups.set(key, g); }
        g.add(signature(r));
      }
      if (![...groups.values()].some((g) => g.size > 1)) noEffect.add(dim);
    }
  }
  return { doc, slots, domains, total, kept, enumerated, rows, noEffect, unmatched, fired, matched };
}

/** The checker's summary line: `3 dimensions · 24 combinations · 5 rules`, and `· N unmatched` when some combination no rule decides. */
export function analysisSummary(doc: AnalysisDoc): string {
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const c = compileAnalysis(doc);
  const parts = [plural(doc.dimensionOrder.length, "dimension"), plural(c.total, "combination"), plural(doc.rules.length, "rule")];
  if (c.enumerated && c.unmatched > 0) parts.push(`${c.unmatched} unmatched`);
  return parts.join(" · ");
}

// ── The tree ─────────────────────────────────────────────────────────────────

export type TreeNode =
  | { leaf: true; key: string; n: number; rows: Row[] }
  | { leaf: false; field: string; children: { value: DimValue; node: TreeNode }[]; n: number; rows: Row[] };

/** A leaf is the rule that decides there — its index as text, `-1` for no rule. */
export const leafKey = (r: Row): string => String(r.rule);

function distinct(rows: Row[], key: (r: Row) => string): Set<string> {
  const s = new Set<string>();
  for (const r of rows) s.add(key(r));
  return s;
}

function groupBy(rows: Row[], field: string): { values: DimValue[]; groups: Map<DimValue, Row[]> } {
  const values: DimValue[] = [];
  const groups = new Map<DimValue, Row[]>();
  for (const r of rows) {
    const v = r.values[field];
    let g = groups.get(v);
    if (!g) { g = []; groups.set(v, g); values.push(v); }
    g.push(r);
  }
  return { values, groups };
}

/**
 * Nest the rows over the inputs in `order`: a set of rows with one leaf is a leaf; otherwise
 * branch on the first input (in order) whose values SEPARATE the leaves, else on the first
 * that varies; children that all reach the same leaf fold into one.
 */
export function buildTree(rows: Row[], order: string[], key: (r: Row) => string = leafKey): TreeNode {
  if (rows.length === 0) return { leaf: true, key: "-1", n: 0, rows };
  const outs = distinct(rows, key);
  if (outs.size === 1) return { leaf: true, key: [...outs][0], n: rows.length, rows };
  for (let pass = 0; pass < 2; pass++) {
    for (const field of order) {
      const { values, groups } = groupBy(rows, field);
      if (values.length <= 1) continue;
      if (pass === 0 && !values.some((v) => distinct(groups.get(v)!, key).size < outs.size)) continue;
      const children = values.map((value) => ({ value, node: buildTree(groups.get(value)!, order, key) }));
      if (children.every((c) => c.node.leaf)) {
        const leaves = new Set(children.map((c) => (c.node as { key: string }).key));
        if (leaves.size === 1) return { leaf: true, key: [...leaves][0], n: rows.length, rows };
      }
      return { leaf: false, field, children, n: rows.length, rows };
    }
  }
  return { leaf: true, key: "mixed", n: rows.length, rows };
}

/** The same tree over only the rows `keep` admits — a branch dropped when none of its rows qualify, and every node counting and carrying the rows that do; null when no row does. */
export function buildKeptTree(rows: Row[], order: string[], keep: (r: Row) => boolean, key: (r: Row) => string = leafKey): TreeNode | null {
  let hits = 0;
  for (const r of rows) if (keep(r)) hits++;
  if (hits === 0) return null;
  if (hits === rows.length) return buildTree(rows, order, key);
  for (let pass = 0; pass < 2; pass++) {
    for (const field of order) {
      const { values, groups } = groupBy(rows, field);
      if (values.length <= 1) continue;
      if (pass === 0) {
        // Prefer an input some value of which is PURE — all of its rows kept, or none.
        const pure = values.some((v) => { const g = groups.get(v)!; const k = g.filter(keep).length; return k === 0 || k === g.length; });
        if (!pure) continue;
      }
      const children: { value: DimValue; node: TreeNode }[] = [];
      for (const value of values) {
        const node = buildKeptTree(groups.get(value)!, order, keep, key);
        if (node) children.push({ value, node });
      }
      if (!children.length) return null;
      const kept = rows.filter(keep);
      return { leaf: false, field, children, n: kept.length, rows: kept };
    }
  }
  return null;
}

/** Does a row's output carry every pinned value? OR within an output key, AND across keys; no pins is everything. */
export function matchTarget(r: Row, target: Record<string, string[]>): boolean {
  for (const [slot, toks] of Object.entries(target)) if (toks.length && !toks.includes(r.slots[slot])) return false;
  return true;
}

export const hasTarget = (target: Record<string, string[]>): boolean => Object.values(target).some((t) => t.length > 0);

/** The key of a tree position — `dim=value/dim=value`; the root is ``. */
export const pathKey = (path: { field: string; value: DimValue }[]): string =>
  path.map((p) => `${p.field}=${showValue(p.value)}`).join("/");
