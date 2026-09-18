/**
 * Golden rules tables — behaviour as data.
 *
 * A DecisionTable is the single place a feature's behaviour lives. The UI asks
 * `decide(table, ctx)` and renders the outcome; it never re-implements the
 * logic inline. That buys three things at once:
 *
 *  · READABILITY — open the `*.rules.ts` file and the feature's behaviour is a
 *    table you can read top to bottom, each row with a `because`. No digging
 *    through layout files to find the `&&` that made the button grey.
 *  · REGRESSION — every table ships a `*.golden.test.ts` next to it: a list of
 *    (ctx → expected outcome) rows run by vitest. Change a rule and the golden
 *    file tells you exactly which behaviours moved.
 *  · AGENT LEGIBILITY — an agent greps for the table, reads twenty rows, and
 *    knows the feature. `tableToMarkdown` renders the same table into docs and
 *    Storybook, so the documentation cannot drift from the implementation.
 *
 * Semantics: FIRST MATCH WINS, top to bottom, like a firewall. A rule matches
 * when every key in `when` accepts the corresponding ctx value; keys absent
 * from `when` don't care. `otherwise` is the mandatory fallback, so a table
 * totally covers its input space by construction.
 */

/** A cell in the `when` column: a literal (strict equality) or a labelled
 *  predicate. The label is what renders into docs — keep it short and exact. */
export type Matcher<V> = V | { label: string; test: (v: V) => boolean };

export interface DecisionRule<C extends object, O> {
  /** Stable kebab-case id. Golden tests pin outcomes to it; logs mention it. */
  rule: string;
  /** Why this row exists, in domain language. Renders into docs and failures. */
  because: string;
  when: { [K in keyof C]?: Matcher<C[K]> };
  then: O;
}

export interface DecisionTable<C extends object, O> {
  /** kebab-case table id, unique within the app. */
  name: string;
  /** The question this table answers, as a sentence. */
  answers: string;
  rules: DecisionRule<C, O>[];
  /** Mandatory fallback — the table always answers. */
  otherwise: O;
}

export interface Decision<O> {
  outcome: O;
  /** The rule that fired, or "otherwise". */
  rule: string;
  because: string;
}

const isMatcher = (m: unknown): m is { label: string; test: (v: unknown) => boolean } =>
  typeof m === "object" && m !== null && "test" in (m as object) && typeof (m as { test?: unknown }).test === "function";

const accepts = <V,>(m: Matcher<V>, v: V): boolean => (isMatcher(m) ? m.test(v) : Object.is(m, v));

export function ruleMatches<C extends object, O>(r: DecisionRule<C, O>, ctx: C): boolean {
  return (Object.keys(r.when) as (keyof C)[]).every((k) => accepts(r.when[k] as Matcher<C[keyof C]>, ctx[k]));
}

export function decide<C extends object, O>(t: DecisionTable<C, O>, ctx: C): Decision<O> {
  for (const r of t.rules) if (ruleMatches(r, ctx)) return { outcome: r.then, rule: r.rule, because: r.because };
  return { outcome: t.otherwise, rule: "otherwise", because: "no rule matched" };
}

/* ── Matchers ─────────────────────────────────────────────────────────────── */

/** Matches anything — an explicit "don't care" that still shows in the docs. */
export const any = { label: "*", test: () => true } as const;

export const oneOf = <V,>(...vs: V[]): { label: string; test: (v: unknown) => boolean } => ({
  label: vs.map(String).join(" | "),
  test: (v: unknown) => vs.some((x) => Object.is(x, v)),
});

export const not = <V,>(m: Matcher<V>): { label: string; test: (v: unknown) => boolean } => ({
  label: `not(${isMatcher(m) ? m.label : String(m)})`,
  test: (v: unknown) => !accepts(m, v as V),
});

export const gt = (n: number): Matcher<number> => ({ label: `> ${n}`, test: (v) => v > n });
export const gte = (n: number): Matcher<number> => ({ label: `>= ${n}`, test: (v) => v >= n });
export const lt = (n: number): Matcher<number> => ({ label: `< ${n}`, test: (v) => v < n });

export const matches = (re: RegExp): Matcher<string> => ({ label: `~ ${re}`, test: (v) => re.test(v) });

/** Escape hatch for a predicate the helpers don't cover. Label it precisely. */
export const pred = <V,>(label: string, test: (v: V) => boolean): Matcher<V> => ({ label, test });

/* ── Rendering & explain ─────────────────────────────────────────────────── */

const cellOf = (m: unknown): string => (isMatcher(m) ? m.label : JSON.stringify(m));

const thenOf = (o: unknown): string =>
  typeof o === "object" && o !== null
    ? Object.entries(o as Record<string, unknown>).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")
    : JSON.stringify(o);

/** The table, as GitHub markdown. Docs and Storybook render THIS — the real
 *  rules, not a hand-written copy that can drift. */
export function tableToMarkdown<C extends object, O>(t: DecisionTable<C, O>): string {
  const keys = [...new Set(t.rules.flatMap((r) => Object.keys(r.when)))];
  const header = ["rule", ...keys, "then", "because"];
  const lines = [
    `### \`${t.name}\``,
    "",
    t.answers,
    "",
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...t.rules.map((r) => {
      const cells = keys.map((k) => (k in r.when ? cellOf((r.when as Record<string, unknown>)[k]) : "·"));
      return `| ${r.rule} | ${cells.join(" | ")} | ${thenOf(r.then)} | ${r.because} |`;
    }),
    `| otherwise | ${keys.map(() => "·").join(" | ")} | ${thenOf(t.otherwise)} | fallback |`,
  ];
  return lines.join("\n");
}

export interface RuleTrace {
  rule: string;
  matched: boolean;
  /** Which `when` keys rejected the ctx (empty when matched). */
  failedOn: string[];
}

/** Per-rule trace of one evaluation — for debugging and the Storybook demo. */
export function explain<C extends object, O>(t: DecisionTable<C, O>, ctx: C): { decision: Decision<O>; trace: RuleTrace[] } {
  const trace: RuleTrace[] = t.rules.map((r) => {
    const failedOn = (Object.keys(r.when) as (keyof C)[])
      .filter((k) => !accepts(r.when[k] as Matcher<C[keyof C]>, ctx[k]))
      .map(String);
    return { rule: r.rule, matched: failedOn.length === 0, failedOn };
  });
  return { decision: decide(t, ctx), trace };
}

/* ── Golden test support ─────────────────────────────────────────────────── */

export interface GoldenCase<C extends object, O> {
  name: string;
  ctx: C;
  expect: O;
  /** Optionally pin WHICH rule must fire, not just the outcome. */
  via?: string;
}

export interface GoldenFailure {
  name: string;
  reason: string;
}

/** Framework-free golden runner: returns failures, empty means green. Test
 *  files assert `checkGolden(...)` is `[]` so vitest prints the failures. */
export function checkGolden<C extends object, O>(t: DecisionTable<C, O>, cases: GoldenCase<C, O>[]): GoldenFailure[] {
  const out: GoldenFailure[] = [];
  for (const c of cases) {
    const d = decide(t, c.ctx);
    if (JSON.stringify(d.outcome) !== JSON.stringify(c.expect))
      out.push({ name: c.name, reason: `outcome ${JSON.stringify(d.outcome)} != expected ${JSON.stringify(c.expect)} (via ${d.rule})` });
    else if (c.via && d.rule !== c.via)
      out.push({ name: c.name, reason: `fired rule "${d.rule}", expected "${c.via}"` });
  }
  return out;
}
