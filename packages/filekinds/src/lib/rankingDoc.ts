/**
 * RANKING — buckets that FALL OUT of decisions instead of being assigned.
 *
 * A policy's switch names its bucket directly: match these clauses, go in that
 * pile. That works until the reason a row matters stops being one thing. A job
 * lead is not simply "apply" — it is iOS or not, staff-level or not, needs
 * relocation or not, and which pile it belongs in is what those answers add up
 * to. Encoding that in a flat switch means writing a case per combination and
 * re-writing all of them the day a new criterion appears.
 *
 * So the pieces are separated:
 *
 *   decisions  — the criteria, each offering answers. Authored, and extended
 *                whenever a new one occurs to you.
 *   assignment — the answers ONE ROW takes. Tagged on the row, or derived from
 *                its fields by rules. A tag always wins: the row is the
 *                authority on itself.
 *   ranking    — groups of assignments in PRIORITY ORDER. A group is a
 *                predicate over answers, so it can name one answer and ignore
 *                the rest; the first group that holds claims the row.
 *
 * Exclusion is not a special case. It is the last group in the order: the one
 * with no conditions, which therefore matches whatever is left. "Least
 * priority" and "excluded" are the same statement, and nothing is ever dropped
 * silently — a row you did not think about lands at the bottom, visibly.
 *
 * The decision vocabulary is crosscut's `decisionSpace` — the same `When`
 * predicates a playbook and a guide are built from, and the same `DecisionPills`
 * that author them. The clause engine for deriving answers is the policy's.
 */
import yaml from "js-yaml";
import { meets, refOf, splitRef, type SpaceDecision, type SpaceValue, type When } from "crosscut";
import { clauseHolds, parseClauses, type PolicyClause, type PolicyInput } from "./policyDoc";

/** How an untagged row's answer is worked out. */
export interface RankDerive {
  /** The answer taken when this rule holds. */
  value: string;
  /** ALL clauses must hold. Empty = always — the decision's default answer. */
  when: PolicyClause[];
}

/** A criterion. Extends SpaceDecision, so `DecisionPills` renders it as-is. */
export interface RankingDecision extends SpaceDecision {
  derive: RankDerive[];
}

/** One bucket, as a predicate over answers. Order in the file IS priority. */
export interface RankGroup {
  label: string;
  detail?: string;
  /** Every ref must hold. EMPTY MATCHES ANYTHING — the catch-all. */
  when: When;
}

export interface RankingDoc {
  role: "ranking";
  title: string;
  description?: string;
  /** The `.list` being ranked. */
  items: string;
  /** List columns → derive params, exactly as a policy run maps them. */
  map: Record<string, string[]>;
  decisions: RankingDecision[];
  /** In priority order, best first. */
  ranking: RankGroup[];
  /**
   * Answers taken by hand, per row label → refs.
   *
   * They live HERE and not on the list because the list being ranked is
   * usually collated — its rows are mirrors of eight other files, and writing
   * to a mirror writes to nothing. A tag is also a judgement made inside this
   * ranking, not a fact about the lead, so this is where it belongs.
   *
   * Written by the view, so `writeTags` keeps the block LAST in the file and
   * rewrites only from there down — everything a human authored above it,
   * comments included, survives untouched.
   */
  tags: Record<string, string[]>;
}

/** Where a row's answer came from — a hand tag, a list field, or a rule. */
export type AnswerSource = "tagged" | "field" | "derived" | "unanswered";

export interface Answer {
  decision: string;
  /** The answer's key, or "" when nothing decided it. */
  value: string;
  source: AnswerSource;
  /** Which derive rule fired (index), when one did. */
  ruleIndex?: number;
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
/** YAML turns bare yes/no into booleans; answers are keys, so stringify them. */
const key = (x: unknown): string =>
  typeof x === "boolean" ? (x ? "yes" : "no") : typeof x === "number" ? String(x) : (str(x) ?? "");

/** `when` as ANSWER REFS: accepts ["platform=yes"] or a {platform: yes}
 *  mapping. Shared spelling for ranking groups and decision-value gates. */
export function parseWhenRefs(x: unknown): When {
  return Array.isArray(x)
    ? arr(x).map(key).filter(Boolean)
    : Object.entries(rec(x)).map(([d, v]) => refOf(d, key(v)));
}

/** One decision's answers. "yes" alone is a value; {key,label} spells one
 *  out; `activates`/`when` ride along so hierarchical documents (a memory's
 *  localized decisions) parse through the same door. */
export function parseDecisionValues(x: unknown): SpaceValue[] {
  return arr(x).map((v) => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      const vk = key(v);
      return { key: vk, label: vk };
    }
    const r = rec(v);
    const vk = key(r.key);
    const activates = arr(r.activates).map(key).filter(Boolean);
    const when = parseWhenRefs(r.when);
    return {
      key: vk,
      label: str(r.label) ?? vk,
      ...(str(r.detail) ? { detail: str(r.detail)! } : {}),
      ...(activates.length ? { activates } : {}),
      ...(when.length ? { when } : {}),
    };
  }).filter((v) => v.key);
}

/** Criteria with their derive rules — the decisions block a ranking and a
 *  memory share verbatim. */
export function parseRankingDecisions(x: unknown): RankingDecision[] {
  return arr(x).map(rec).flatMap((d) => {
    const k = key(d.key);
    if (!k) return [];
    const values = parseDecisionValues(d.values);
    const derive: RankDerive[] = arr(d.derive).map(rec).flatMap((r) => {
      const value = key(r.value);
      return value ? [{ value, when: parseClauses(r.when) }] : [];
    });
    return [{ key: k, label: str(d.label) ?? k, ...(str(d.detail) ? { detail: str(d.detail)! } : {}), values, derive }];
  });
}

/** Lenient: a half-written ranking still has to render. */
export function parseRanking(text: string): RankingDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }

  const decisions = parseRankingDecisions(raw.decisions);

  const ranking: RankGroup[] = arr(raw.ranking).map(rec).flatMap((g) => {
    const label = str(g.label);
    if (!label) return [];
    return [{ label, ...(str(g.detail) ? { detail: str(g.detail)! } : {}), when: parseWhenRefs(g.when) }];
  });

  const map: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(rec(raw.map))) {
    const cols = typeof v === "string" ? [v] : arr(v).map(str).filter(Boolean) as string[];
    if (cols.length) map[k] = cols;
  }

  const tags: Record<string, string[]> = {};
  for (const [row, v] of Object.entries(rec(raw.tags))) {
    const refs = arr(v).map(key).filter(Boolean);
    if (refs.length) tags[row] = refs;
  }

  return {
    role: "ranking",
    title: str(raw.title) ?? "Ranking",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    items: str(raw.items) ?? "",
    map,
    decisions,
    ranking,
    tags,
  };
}

/**
 * The document with a new `tags:` block, as TEXT.
 *
 * Everything above the block is returned byte-for-byte, so the authored
 * decisions and their comments are never re-serialized by a YAML dumper that
 * would strip them.
 */
export function writeTags(text: string, tags: Record<string, string[]>): string {
  const lines = text.split("\n");
  // Cut at the generated banner when there is one, NOT at `tags:` — the banner
  // sits above the key, and slicing below it leaves the comment behind to
  // accumulate one copy per save.
  const banner = lines.findIndex((l) => l.trim() === TAGS_BANNER);
  const at = banner >= 0 ? banner : lines.findIndex((l) => /^tags:\s*$/.test(l));
  const head = (at < 0 ? lines : lines.slice(0, at)).join("\n").replace(/\s*$/, "");
  const entries = Object.entries(tags).filter(([, refs]) => refs.length);
  if (!entries.length) return `${head}\n`;
  const body = entries
    .map(([row, refs]) => `  ${JSON.stringify(row)}: [${refs.join(", ")}]`)
    .join("\n");
  return `${head}\n\n${TAGS_BANNER}\ntags:\n${body}\n`;
}

const TAGS_BANNER = "# Answers taken by hand. Written by the ranking view — keep last.";

/**
 * One row's answer to one decision.
 *
 * Precedence is by how deliberate the answer was. A hand tag wins outright —
 * tagging is how you overrule a rule that cannot see what you can. Then the
 * row's own field, which is a fact carried by the list. Then the first derive
 * rule whose clauses all hold, a rule with no clauses being the default.
 * Failing all of them the decision is UNANSWERED, which is a real state and
 * not a zero: no group can claim the row on a ground it never established.
 */
export function answerFor(
  decision: RankingDecision,
  row: { fields?: Record<string, string> },
  input: PolicyInput,
  tagged: string[] = [],
): Answer {
  const hand = tagged.find((r) => splitRef(r)[0] === decision.key);
  if (hand) {
    const vk = splitRef(hand)[1];
    if (decision.values.some((v) => v.key === vk)) {
      return { decision: decision.key, value: vk, source: "tagged" };
    }
  }
  const tag = row.fields?.[decision.key]?.trim();
  if (tag) {
    // Match on the answer's key or its label, case-insensitively — the tag is
    // written by a human, not generated.
    const hit = decision.values.find(
      (v) => v.key.toLowerCase() === tag.toLowerCase() || v.label.toLowerCase() === tag.toLowerCase(),
    );
    if (hit) return { decision: decision.key, value: hit.key, source: "field" };
  }
  for (let i = 0; i < decision.derive.length; i++) {
    const r = decision.derive[i];
    if (r.when.every((c) => clauseHolds(c, input))) {
      return { decision: decision.key, value: r.value, source: "derived", ruleIndex: i };
    }
  }
  return { decision: decision.key, value: "", source: "unanswered" };
}

/** Every decision answered for one row, hand tags included. */
export function assignmentFor(
  doc: RankingDoc,
  row: { label?: string; fields?: Record<string, string> },
  input: PolicyInput,
): Answer[] {
  const tagged = doc.tags[row.label ?? ""] ?? [];
  return doc.decisions.map((d) => answerFor(d, row, input, tagged));
}

/** The refs an assignment holds — unanswered decisions contribute nothing. */
export const locksOf = (answers: Answer[]): string[] =>
  answers.filter((a) => a.value).map((a) => refOf(a.decision, a.value));

/**
 * Which group claims this row. First match wins and stops, exactly like the
 * switch — but the conditions are answers, so a group can name one criterion
 * and stay silent about the others.
 *
 * -1 when nothing matches, which only happens without a catch-all.
 */
export function rankOf(doc: RankingDoc, locks: string[]): number {
  for (let i = 0; i < doc.ranking.length; i++) {
    if (meets(locks, doc.ranking[i].when)) return i;
  }
  return -1;
}

/** The bottom of the order — where "excluded" actually lives. */
export const isCatchAll = (g: RankGroup): boolean => !g.when.length;

/** "iOS role · Staff level" — a group's conditions in the decisions' words. */
export function groupText(doc: RankingDoc, g: RankGroup): string {
  if (!g.when.length) return "anything left";
  return g.when.map((ref) => {
    const [dk, vk] = splitRef(ref);
    const d = doc.decisions.find((x) => x.key === dk);
    const v = d?.values.find((x) => x.key === vk);
    return `${d?.label ?? dk} = ${v?.label ?? vk}`;
  }).join(" · ");
}

/** A decision's answer label, for display. */
export function answerLabel(doc: RankingDoc, a: Answer): string {
  const d = doc.decisions.find((x) => x.key === a.decision);
  if (!a.value) return "unanswered";
  return d?.values.find((v) => v.key === a.value)?.label ?? a.value;
}
