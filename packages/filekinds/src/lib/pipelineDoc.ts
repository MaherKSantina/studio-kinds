/**
 * The `.pipeline` kind — ONE curated list, the stages that transform it, and
 * the views that show the result, all in one file. The items are the list as
 * first known — a scrape's rows, a hand-written table — and what is learned
 * later, from other places and at other times, arrives as a STAGE: a set of
 * rules that amend items, a filter that drops some, a sort that orders them.
 * A stage never edits the items; it is applied when the file opens, so the
 * rows as of any stage can be looked at, and the logic that produced them
 * beside it. The output is the rows after the last stage; a VIEW is one way
 * of showing it — its own filter, sort and columns, applied to the output
 * and to nothing else. Nothing is cached, nothing is written back.
 *
 * Authoring shape (YAML, lenient — a half-written file still renders):
 *
 *   title?
 *   decisions:                                   # the circumstances values can be given under — a playbook's decisions
 *     - key: method
 *       label: Method
 *       values: [{key: measured, label: Measured}, {key: anecdotal, label: Anecdotal}]
 *   labels: {price: "Total (AUD)"}               # header names by field, for every view; optional
 *   items:                                       # the list — every item has an `id` (a uuid), its identity
 *     - {id: 9b2f6d1c-4e0a-4c7b-9a1d-2f5e8c3b7a10, name: Family Room, price: 900, sleeps: 4}
 *     - {id: 3e7a5c88-1b2d-4f0e-8a6c-d94b1e2f7c03, name: Beach Cabin, price: 1200, sleeps: 4}
 *   stages:                                      # in order; each is `key` + ONE verb
 *     - key: corrections
 *       rules:                                   # a middleware's rules: pick items, set fields
 *         - item: 9b2f6d1c-4e0a-4c7b-9a1d-2f5e8c3b7a10   # one id or a list — the short form of a clause on `id`
 *           set: {price: 850}
 *           when: [method=anecdotal]             # the circumstance: off the table once another answer is taken
 *         - where: [{field: name, op: contains, value: cabin}]
 *           set: {type: Cabin}
 *     - key: band
 *       filter: [{field: price, op: lte, value: 2000}]    # every clause must hold; the rest are dropped for good
 *     - key: cheapest
 *       sort: [{field: price, dir: asc}]         # first key first
 *   views:                                       # the output, shown; the first is what opens
 *     - key: by-price
 *       label: By price
 *       columns: [name, sleeps, price, "*"]
 *     - key: groups
 *       label: Sleeps 6+
 *       filter: [{field: sleeps, op: gte, value: 6}]      # hides for this view only
 *       sort: [{field: price, dir: asc}]
 *
 * Rules are the middleware's (middlewareDoc.ts): `where` clauses (all must
 * hold; none = every item), `set` (dot paths allowed) or `key`/`value`, a
 * `note`; a rule that matches no item is a problem. `item:` names items by
 * id and is refused when no item has it. A filter, a sort and a view are the
 * table policy's rules (tablePolicy.ts): the same clause vocabulary, `sort`
 * keys with `dir`, `columns` (`"*"` = every other column, after the named
 * ones), `hide`, `limit`. A stage with no verb, or two, is a problem, as is
 * a duplicate `key`, an item without an `id`, an id twice.
 *
 * `when` — on a rule, a stage or a view — is the circumstance: refs
 * `decision=answer` into `decisions`, and it holds while no answer taken
 * contradicts it. The answers are taken on the page and never saved:
 * nothing taken, everything applies and a later rule wins; `method=measured`
 * taken, a rule under `method=anecdotal` is off the table, so the same file
 * shows "the measured picture". A value a rule set carries its refs: a badge
 * on the cell, and the field's trail in the row dialog — the item's own
 * value, then every stage that set it. Two rules setting one key under
 * different circumstances CONTEST it: while nothing taken decides between
 * them the cell shows every value on the table, each with its badge — the
 * one the row carries (the later rule's) first, the others beside it — and
 * once an answer is taken only the value under it is left. A ref to a
 * decision or an answer the file does not declare is a problem.
 *
 * Read from elsewhere: a `.jsonl`'s `$sources`, a `.middleware`'s `source`
 * and `studio-check --collect` take `stays.pipeline` (the output),
 * `stays.pipeline#<stage>` (the rows as of that stage) or
 * `stays.pipeline#<view>` (a view's rows and columns), nothing taken.
 */
import yaml from "js-yaml";
import { refOf, splitRef, type SpaceDecision, type SpaceValue, type When } from "./decisionSpace";
import type { PolicyClause } from "./policyDoc";
import { valueAt, type DataRow } from "./dataRows";
import { applyMiddleware, readRule, type MiddlewareRule } from "./middlewareDoc";
import { applyTablePolicy, clauseSentence, columnsOf, readTableRules, type TablePolicyDoc, type TableSort } from "./tablePolicy";

export type StageVerb = "rules" | "filter" | "sort";
export const VERBS: StageVerb[] = ["rules", "filter", "sort"];

export interface PipelineRule extends MiddlewareRule {
  /** The ids `item:` names — applied as a clause on `id` before `where`. */
  items: string[];
  /** The circumstance: the rule applies while no answer taken contradicts it; empty = always. */
  when: When;
}

export interface PipelineStage {
  key: string;
  label?: string;
  when: When;
  verb: StageVerb;
  rules: PipelineRule[];
  filter: PolicyClause[];
  sort: TableSort[];
}

export interface PipelineView {
  key: string;
  label?: string;
  when: When;
  where: PolicyClause[];
  sort: TableSort[];
  columns?: string[];
  hide: string[];
  limit?: number;
}

export interface PipelineDoc {
  title: string;
  decisions: SpaceDecision[];
  /** Header names by field, for every view. */
  labels: Record<string, string>;
  /** The list as written; an item without an `id` is given `#<n>` and reported. */
  items: DataRow[];
  stages: PipelineStage[];
  views: PipelineView[];
  /** Authoring problems — the shape, the refs, the clauses. */
  problems: string[];
}

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const text = (x: unknown): string | undefined => (typeof x === "string" ? x : typeof x === "number" ? String(x) : typeof x === "boolean" ? (x ? "yes" : "no") : undefined);
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** `when` as written — a ref, a list of refs, or a mapping `{decision: answer}` — as refs. */
export function readWhen(x: unknown): When {
  if (x === undefined || x === null) return [];
  if (Array.isArray(x)) return x.map(text).filter((s): s is string => !!s && s.includes("="));
  if (typeof x === "object") return Object.entries(rec(x)).map(([d, v]) => refOf(d, text(v) ?? ""));
  const s = text(x);
  return s && s.includes("=") ? [s] : [];
}

/** Does the circumstance hold under the answers taken? While no taken answer contradicts a ref — an
 *  unanswered decision contradicts nothing, so with nothing taken everything holds. */
export function holdsUnder(taken: string[], when: When): boolean {
  return when.every((ref) => {
    const [d, v] = splitRef(ref);
    const t = taken.find((x) => splitRef(x)[0] === d);
    return !t || splitRef(t)[1] === v;
  });
}

/** Lenient parse — never throws; what cannot be read is a problem, not a crash. */
export function parsePipeline(source: string): PipelineDoc {
  let raw: Record<string, unknown> = {};
  const problems: string[] = [];
  try { raw = rec(yaml.load(source)); } catch (e) { problems.push(`YAML: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`); }

  const decisions: SpaceDecision[] = arr(raw.decisions).map((d, i) => {
    const o = rec(d);
    const label = str(o.label) ?? text(o.key) ?? `Decision ${i + 1}`;
    const key = text(o.key) ?? slug(label);
    const values: SpaceValue[] = arr(o.values).map((v, j) => {
      if (typeof v !== "object" || v === null) { const k = text(v) ?? `answer-${j + 1}`; return { key: k, label: k }; }
      const w = rec(v);
      const vl = str(w.label) ?? text(w.key) ?? `Answer ${j + 1}`;
      return { key: text(w.key) ?? slug(vl), label: vl, ...(str(w.detail) ? { detail: str(w.detail)! } : {}) };
    });
    if (!values.length) problems.push(`decision ${key}: no values`);
    return { key, label, ...(str(o.detail) ? { detail: str(o.detail)! } : {}), values };
  });
  if (raw.decisions !== undefined && !Array.isArray(raw.decisions)) problems.push("decisions: must be a list");

  const labels: Record<string, string> = {};
  for (const [f, l] of Object.entries(rec(raw.labels))) { if (typeof l === "string" && l.trim()) labels[f] = l.trim(); else problems.push(`labels.${f}: must be text`); }

  // The items: every one a mapping with an id; a missing id is filled with `#<n>` so the rest still runs.
  const ids = new Set<string>();
  const items: DataRow[] = arr(raw.items).map((it, i) => {
    const row = { ...rec(it) };
    if (typeof it !== "object" || it === null || Array.isArray(it)) problems.push(`item ${i + 1}: not a mapping`);
    const id = text(row.id);
    if (!id) { problems.push(`item ${i + 1}: no id`); row.id = `#${i + 1}`; }
    else if (ids.has(id)) problems.push(`item ${i + 1}: id ${id} is item ${[...ids].indexOf(id) + 1}'s too`);
    else row.id = id;
    ids.add(String(row.id));
    return row;
  });
  if (raw.items !== undefined && !Array.isArray(raw.items)) problems.push("items: must be a list");

  const checkWhen = (when: When, at: string) => {
    for (const ref of when) {
      const [d, v] = splitRef(ref);
      const dec = decisions.find((x) => x.key === d);
      if (!dec) problems.push(`${at} when: no decision "${d}"`);
      else if (!dec.values.some((x) => x.key === v)) problems.push(`${at} when: ${d} has no answer "${v}"`);
    }
  };

  const keys = new Set<string>();
  const stages: PipelineStage[] = arr(raw.stages).map((s, i) => {
    const o = rec(s);
    const key = text(o.key) ?? `stage-${i + 1}`;
    const at = `stage ${key}`;
    if (!text(o.key)) problems.push(`stage ${i + 1}: no key`);
    else if (keys.has(key)) problems.push(`${at}: key twice`);
    keys.add(key);
    const verbs = VERBS.filter((v) => o[v] !== undefined);
    if (!verbs.length) problems.push(`${at}: no verb — give it rules, filter or sort`);
    else if (verbs.length > 1) problems.push(`${at}: ${verbs.join(" and ")} — one verb per stage`);
    const verb: StageVerb = verbs[0] ?? "rules";
    const when = readWhen(o.when);
    checkWhen(when, at);

    const rules: PipelineRule[] = verb === "rules" ? arr(o.rules).map((r, j) => {
      const ro = rec(r);
      const ruleAt = `${at} rule ${j + 1}`;
      const base = readRule(ro, problems, ruleAt);
      const named = Array.isArray(ro.item) ? ro.item.map(text).filter((x): x is string => !!x) : text(ro.item) ? [text(ro.item)!] : [];
      for (const id of named) if (!ids.has(id)) problems.push(`${ruleAt}: item ${id} is no item`);
      const rw = readWhen(ro.when);
      checkWhen(rw, ruleAt);
      return { ...base, items: named, when: rw };
    }) : [];
    if (verb === "rules" && o.rules !== undefined && !Array.isArray(o.rules)) problems.push(`${at}: rules must be a list`);
    const tableRules = verb === "filter" || verb === "sort" ? readTableRules(o, problems, "filter", at) : { where: [], sort: [] };
    if (verb === "filter" && !Array.isArray(o.filter)) problems.push(`${at}: filter must be a list of clauses`);
    if (verb === "sort" && !Array.isArray(o.sort)) problems.push(`${at}: sort must be a list of keys`);
    return { key, ...(str(o.label) ? { label: str(o.label)! } : {}), when, verb, rules, filter: tableRules.where, sort: tableRules.sort };
  });
  if (raw.stages !== undefined && !Array.isArray(raw.stages)) problems.push("stages: must be a list");

  const viewKeys = new Set<string>();
  const views: PipelineView[] = arr(raw.views).map((v, i) => {
    const o = rec(v);
    const key = text(o.key) ?? `view-${i + 1}`;
    const at = `view ${key}`;
    if (!text(o.key)) problems.push(`view ${i + 1}: no key`);
    else if (viewKeys.has(key)) problems.push(`${at}: key twice`);
    else if (keys.has(key)) problems.push(`${at}: a stage has this key`);
    viewKeys.add(key);
    const when = readWhen(o.when);
    checkWhen(when, at);
    return { key, ...(str(o.label) ? { label: str(o.label)! } : {}), when, ...readTableRules(o, problems, "filter", at) };
  });
  if (raw.views !== undefined && !Array.isArray(raw.views)) problems.push("views: must be a list");

  return { title: str(raw.title) ?? "", decisions, labels, items, stages, views, problems };
}

/* ── running it ──────────────────────────────────────────────────────────── */

/** One value a field was given: by the item as written (`stage` null), or by a stage's rule under a circumstance. */
export interface Claim {
  value: unknown;
  stage: string | null;
  rule?: number;
  when: When;
}

/** The key of one cell: an item's id and a field (a dot path as the rule wrote it). */
export const cellKey = (id: unknown, field: string): string => `${String(id)}::${field}`;

export interface StageRun {
  key: string;
  label: string;
  verb: StageVerb;
  when: When;
  /** false when an answer taken contradicts `when`: the rows pass through unchanged. */
  applied: boolean;
  /** The rows as of this stage. */
  rows: DataRow[];
  /** Rows in. */
  before: number;
  /** rules: per rule, the indices in `rows` it set; a rule not on the table has none. */
  matches: number[][];
  /** rules: rows at least one rule touched. */
  amended: number;
  /** filter: the rows it dropped. */
  dropped: DataRow[];
  /** The cells THIS stage set: cell key → the rule's circumstance. */
  set: Map<string, When>;
  /** Every cell a stage has set so far, as of this stage: cell key → the last claim. */
  marks: Map<string, Claim>;
  /** Every claim made so far, as of this stage: cell key → the claims in order. */
  claims: Map<string, Claim[]>;
  problems: string[];
}

export interface ViewRun {
  key: string;
  label: string;
  when: When;
  applied: boolean;
  rows: DataRow[];
  columns: string[];
  problems: string[];
}

export interface PipelineRun {
  items: DataRow[];
  stages: StageRun[];
  /** The rows after the last stage. */
  output: DataRow[];
  views: ViewRun[];
  /** Every claim a stage made, per cell, in stage order — the item's own value is not here (see `trail`). */
  claims: Map<string, Claim[]>;
  /** The last claim per cell after every stage — the badges of the output. */
  marks: Map<string, Claim>;
  /** The document's problems, then each stage's and each view's. */
  problems: string[];
}

const asPolicy = (where: PolicyClause[], sort: TableSort[], rest: Partial<TablePolicyDoc> = {}): TablePolicyDoc =>
  ({ role: "table", title: "", where, sort, hide: [], problems: [], ...rest });

/** The stages applied in order to the items under the answers `taken`, then every view over the output. */
export function runPipeline(doc: PipelineDoc, taken: string[] = []): PipelineRun {
  const claims = new Map<string, Claim[]>();
  const marks = new Map<string, Claim>();
  let rows = doc.items;
  const stages: StageRun[] = doc.stages.map((stage) => {
    const applied = holdsUnder(taken, stage.when);
    const before = rows.length;
    const problems: string[] = [];
    const set = new Map<string, When>();
    const matches: number[][] = stage.rules.map(() => []);
    let amended = 0;
    let dropped: DataRow[] = [];
    if (applied && stage.verb === "rules") {
      // Only the rules on the table run, as one middleware; problems carry the file's own numbering.
      const live = stage.rules.map((r, i) => ({ r, i })).filter(({ r }) => holdsUnder(taken, r.when));
      const mw: MiddlewareRule[] = live.map(({ r }) => ({
        where: [...(r.items.length ? [{ param: "id", op: "in", value: r.items } as PolicyClause] : []), ...r.where],
        set: r.set,
      }));
      const out = applyMiddleware({ title: "", source: null, rules: mw, problems: [] }, rows);
      live.forEach(({ r, i }, k) => {
        matches[i] = out.matches[k];
        if (!out.matches[k].length && rows.length) problems.push(`stage ${stage.key} rule ${i + 1} matches no item`);
        for (const at of out.matches[k]) {
          const id = out.rows[at].id;
          for (const field of Object.keys(r.set)) {
            const key = cellKey(id, field);
            const claim: Claim = { value: r.set[field], stage: stage.key, rule: i + 1, when: r.when };
            set.set(key, r.when);
            marks.set(key, claim);
            claims.set(key, [...(claims.get(key) ?? []), claim]);
          }
        }
      });
      rows = out.rows;
      amended = out.amended;
    } else if (applied && stage.verb === "filter") {
      const out = applyTablePolicy(asPolicy(stage.filter, []), rows);
      const kept = new Set(out.rows);
      dropped = rows.filter((r) => !kept.has(r));
      rows = out.rows;
    } else if (applied && stage.verb === "sort") {
      const out = applyTablePolicy(asPolicy([], stage.sort), rows);
      problems.push(...out.problems.map((p) => `stage ${stage.key}: ${p}`));
      rows = out.rows;
    }
    return { key: stage.key, label: stage.label ?? stage.key, verb: stage.verb, when: stage.when, applied, rows, before, matches, amended, dropped, set, marks: new Map(marks), claims: new Map(claims), problems };
  });
  const output = rows;
  const views: ViewRun[] = doc.views.map((v) => {
    const applied = holdsUnder(taken, v.when);
    const out = applied ? applyTablePolicy(asPolicy(v.where, v.sort, { columns: v.columns, hide: v.hide, limit: v.limit }), output) : null;
    return {
      key: v.key, label: v.label ?? v.key, when: v.when, applied,
      rows: out?.rows ?? [], columns: (out?.columns ?? []).filter((c) => c !== "id" || v.columns?.includes("id")),
      problems: (out?.problems ?? []).map((p) => `view ${v.key}: ${p}`),
    };
  });
  return {
    items: doc.items, stages, output, views, claims, marks,
    problems: [...doc.problems, ...stages.flatMap((s) => s.problems), ...views.flatMap((v) => v.problems)],
  };
}

/** A field's trail on one item: what the item says, then every claim a stage made, in order. */
export function trail(run: PipelineRun, id: unknown, field: string): Claim[] {
  const item = run.items.find((it) => String(it.id) === String(id));
  const own = item ? valueAt(item, field) : undefined;
  return [...(own !== undefined ? [{ value: own, stage: null, when: [] } as Claim] : []), ...(run.claims.get(cellKey(id, field)) ?? [])];
}

/** What one cell carries and what else is on the table for it, from the claims made on it: `holds` is the last claim
 *  (the value the row carries); `others` are the last claims under every OTHER circumstance, in the order those first
 *  appeared — a contested cell has some, a plain one none. Two claims under one circumstance: the later stands alone. */
export function contest(claims: Map<string, Claim[]>, id: unknown, field: string): { holds?: Claim; others: Claim[] } {
  const all = claims.get(cellKey(id, field)) ?? [];
  const holds = all[all.length - 1];
  if (!holds) return { others: [] };
  const byWhen = new Map<string, Claim>();
  for (const c of all) byWhen.set(c.when.join(","), c);
  byWhen.delete(holds.when.join(","));
  return { holds, others: [...byWhen.values()] };
}

/** The columns a set of rows shows by default: every field the rows carry but `id`, which the row dialog shows. */
export const shownColumns = (rows: DataRow[]): string[] => columnsOf(rows).filter((c) => c !== "id");

/** What to call an item: its first text field that is not its id or a link, else its id. */
export function itemName(row: DataRow): string {
  for (const [k, v] of Object.entries(row)) {
    if (k === "id") continue;
    if (typeof v === "string" && v.trim() && !/^https?:\/\/\S+$/i.test(v)) return v.trim();
  }
  return String(row.id ?? "");
}

/** A circumstance in words — "Method = Measured"; the decisions' labels where they have them. */
export function whenText(when: When, decisions: SpaceDecision[] = []): string {
  return when.map((ref) => {
    const [d, v] = splitRef(ref);
    const dec = decisions.find((x) => x.key === d);
    return `${dec?.label ?? d} = ${dec?.values.find((x) => x.key === v)?.label ?? v}`;
  }).join(", ");
}

/** A rule's pick in words — "item Family Room and price greater than 800", or "every item". */
export function ruleSentence(rule: PipelineRule, items: DataRow[]): string {
  const named = rule.items.map((id) => { const it = items.find((x) => String(x.id) === id); return it ? itemName(it) : id; });
  const parts = [...(named.length ? [`item ${named.join(", ")}`] : []), ...rule.where.map(clauseSentence)];
  return parts.join(" and ") || "every item";
}

/** A stage's doing in a few words — "rules · 3 set", "filter · 12 → 9", "sort · 9". */
export function stageText(s: StageRun): string {
  if (!s.applied) return `${s.verb} · skipped`;
  switch (s.verb) {
    case "rules": return `rules · ${s.amended} set`;
    case "filter": return `filter · ${s.before} → ${s.rows.length}`;
    case "sort": return `sort · ${s.rows.length}`;
  }
}

/** One line for the checker: every stage with its counts, the output, the views. */
export function pipelineSummary(doc: PipelineDoc, run: PipelineRun): string {
  const stages = run.stages.map((s) => {
    const rules = s.verb === "rules" && s.applied ? `; ${s.matches.map((m, i) => `rule ${i + 1} → ${m.length}`).join(", ") || "no rules"}` : "";
    return `${s.key} (${stageText(s)}${rules})`;
  });
  const views = run.views.map((v) => `${v.key} ${v.applied ? v.rows.length : "skipped"}`);
  return `${run.items.length} items${stages.length ? ` → ${stages.join(" → ")}` : ""} → ${run.output.length} out${views.length ? ` · views: ${views.join(", ")}` : ""}${doc.decisions.length ? ` · ${doc.decisions.length} decision${doc.decisions.length === 1 ? "" : "s"}` : ""}`;
}

/** The rows a ref into the file names: none = the output; a stage's key = the rows as of it; a view's key = its rows and columns. */
export function rowsAt(run: PipelineRun, at?: string): { rows: DataRow[]; columns?: string[]; problems: string[] } {
  if (!at) return { rows: run.output, problems: [] };
  const stage = run.stages.find((s) => s.key === at);
  if (stage) return { rows: stage.rows, problems: [] };
  const view = run.views.find((v) => v.key === at);
  if (view) return { rows: view.rows, columns: view.columns, problems: [] };
  return { rows: [], problems: [`no stage or view "${at}"`] };
}
