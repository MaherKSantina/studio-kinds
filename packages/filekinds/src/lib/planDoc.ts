/**
 * `.plan` — a policy over a playbook, and the schedule it produces.
 *
 * The playbook says what is true and what could happen. It cannot say what to
 * do next, because that depends on what you are optimising for, which belongs
 * to you rather than to the domain. This is where that lives.
 *
 * RULES ARE A LIST, not a settings object, and each rule carries exactly one
 * instruction. That is the whole design: "specify the order explicitly" is one
 * rule kind, and a weighting, an exclusion or a deadline is another, so a policy
 * can start as a hand-written sequence and grow into a ranking without ever
 * being rewritten. Adding a kind adds a case; it does not reshape the file.
 *
 * Order rules are CONSTRAINTS, not the answer. Naming three events in sequence
 * pins those three and leaves everything else to be ranked around them, which is
 * what makes a half-specified policy usable instead of a stub.
 */
import yaml from "js-yaml";

/** One instruction. Exactly one field is meaningful; the rest are absent. */
export interface PlanRule {
  /** Off without being deleted — the point of a playground. */
  off?: boolean;
  note?: string;

  /** These events, in this order, relative to each other. A partial order. */
  order?: string[];
  /** Never plan these, whatever they score. */
  exclude?: string[];
  /** A thumb on the scale, per event key. For judgement a formula misses. */
  boost?: Record<string, number>;
  /** How the ranker trades off. Absent terms keep their defaults. */
  weights?: { closesGaps?: number; opens?: number; cheap?: number };
  /** Working days of effort available per working day. */
  capacity?: number;
}

export interface PlanDoc {
  title: string;
  description?: string;
  /** Files this plans over. Several because decisions and events are often
   *  in separate books, and the plan needs both. */
  playbooks: string[];
  /** Where we are standing when the plan starts. */
  locks: string[];
  /** Working days the plan covers. Also the deadline: work past it is dropped. */
  horizon: number;
  rules: PlanRule[];
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined =>
  typeof x === "string" && x.trim() ? x.trim() : undefined;
const strs = (x: unknown): string[] => arr(x).map((r) => str(r)).filter(Boolean) as string[];
const nums = (x: unknown): Record<string, number> => Object.fromEntries(
  Object.entries(rec(x)).filter(([, v]) => typeof v === "number")) as Record<string, number>;

export function parsePlan(text: string): PlanDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty, not blank */ }

  return {
    title: str(raw.title) ?? "Plan",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    // `playbook` singular is accepted, because one book is the common case and
    // making people write a list of one is a papercut.
    playbooks: strs(raw.playbooks).length ? strs(raw.playbooks)
      : str(raw.playbook) ? [str(raw.playbook)!] : [],
    locks: strs(raw.locks),
    horizon: typeof raw.horizon === "number" ? raw.horizon : 120,
    rules: arr(raw.rules).map((r) => {
      const o = rec(r);
      const w = rec(o.weights);
      const weights = {
        ...(typeof w.closesGaps === "number" ? { closesGaps: w.closesGaps } : {}),
        ...(typeof w.opens === "number" ? { opens: w.opens } : {}),
        ...(typeof w.cheap === "number" ? { cheap: w.cheap } : {}),
      };
      return {
        ...(o.off === true ? { off: true } : {}),
        ...(str(o.note) ? { note: str(o.note)! } : {}),
        ...(strs(o.order).length ? { order: strs(o.order) } : {}),
        ...(strs(o.exclude).length ? { exclude: strs(o.exclude) } : {}),
        ...(Object.keys(nums(o.boost)).length ? { boost: nums(o.boost) } : {}),
        ...(Object.keys(weights).length ? { weights } : {}),
        ...(typeof o.capacity === "number" ? { capacity: o.capacity } : {}),
      };
    // A rule with nothing in it is noise, but one that is merely OFF is a rule
    // you are still holding.
    }).filter((r) => r.off || r.order || r.exclude || r.boost || r.weights
      || typeof r.capacity === "number"),
  };
}

export function dumpPlan(doc: PlanDoc): string {
  return yaml.dump({
    title: doc.title,
    ...(doc.description ? { description: doc.description } : {}),
    playbooks: doc.playbooks,
    ...(doc.locks.length ? { locks: doc.locks } : {}),
    horizon: doc.horizon,
    rules: doc.rules.map((r) => ({
      ...(r.off ? { off: true } : {}),
      ...(r.note ? { note: r.note } : {}),
      ...(r.order?.length ? { order: r.order } : {}),
      ...(r.exclude?.length ? { exclude: r.exclude } : {}),
      ...(r.boost && Object.keys(r.boost).length ? { boost: r.boost } : {}),
      ...(r.weights && Object.keys(r.weights).length ? { weights: r.weights } : {}),
      ...(typeof r.capacity === "number" ? { capacity: r.capacity } : {}),
    })),
  }, { lineWidth: -1, noRefs: true });
}

/** What one rule IS, for a UI that has to label it without a type field. */
export const ruleKind = (r: PlanRule): string =>
  r.order ? "order" : r.exclude ? "exclude" : r.boost ? "boost"
    : r.weights ? "weights" : typeof r.capacity === "number" ? "capacity" : "empty";

export interface CompiledPolicy {
  closesGaps?: number;
  opens?: number;
  cheap?: number;
  boost: Record<string, number>;
  exclude: string[];
  capacity?: number;
  /** `a` must be taken before `b`. Accumulated from every order rule. */
  before: [string, string][];
}

/**
 * Fold the live rules into one policy.
 *
 * Later rules win on scalars, because editing a policy means appending to it and
 * the newest statement should be the one in force. Boosts and exclusions
 * ACCUMULATE instead — those are separate statements about separate events, and
 * having a second exclusion silently cancel the first would be surprising.
 */
export function compilePlan(doc: PlanDoc): CompiledPolicy {
  const out: CompiledPolicy = { boost: {}, exclude: [], before: [] };
  for (const r of doc.rules) {
    if (r.off) continue;
    if (r.order) for (let i = 1; i < r.order.length; i++) out.before.push([r.order[i - 1], r.order[i]]);
    if (r.exclude) out.exclude.push(...r.exclude);
    if (r.boost) Object.assign(out.boost, r.boost);
    if (r.weights) Object.assign(out, r.weights);
    if (typeof r.capacity === "number") out.capacity = r.capacity;
  }
  return out;
}
