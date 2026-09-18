/**
 * `.guide` — one procedure, narrowed by questions.
 *
 * The steps an event actually takes, where some only apply on some branches: a
 * resident transfers, a non-resident cannot, and the middle of the procedure
 * differs while both ends do not. Written as one list per branch you duplicate
 * every shared step, and they drift the first time one is edited.
 *
 * So steps carry conditions, and answering removes the ones that do not apply.
 *
 * ORDER IS A GRAPH, not a position. A step declares what it comes `after`, so a
 * conditional step slipped into the middle renumbers nothing, and a branch that
 * genuinely runs in a different sequence says so without disturbing its
 * neighbours. This is also the dependency graph a schedule needs — authored
 * once here rather than restated as tasks somewhere else, because two copies of
 * a procedure become two different procedures by the end of the month.
 *
 * The assignment is NOT saved. It is not a fact about the business, it is how
 * you narrowed a page, and next week the facts are different. That is the whole
 * difference between this and a playbook, which shares every other part.
 */
import yaml from "js-yaml";
import { type SpaceDecision, type SpaceValue, type When } from "./decisionSpace";

/** How much room a schedule has to move a step. */
export type Negotiable = "fixed" | "scope" | "date";

export interface GuideStep {
  key: string;
  label: string;
  /** What doing it involves. Markdown. The label on its own is the task. */
  detail?: string;
  /** Part of the procedure only where this holds. Absent means always. */
  when?: When;
  /**
   * Keys this step comes after.
   *
   * An edge to a step that did not survive the conditions is dropped rather
   * than blocking: a branch that removes a step must not strand what followed
   * it.
   */
  after?: string[];
  /**
   * Consumed by scheduling, authored here because both are facts about the WORK
   * — how long it takes, whether it can lawfully be cut — rather than
   * preferences about the plan. A policy reads these; it does not own them.
   */
  effort?: string;
  negotiable?: Negotiable;
  /** Drawn as a warning. For the step that is the reason the guide exists. */
  emphasis?: boolean;
}

export interface GuideDoc {
  title: string;
  description?: string;
  decisions: SpaceDecision[];
  steps: GuideStep[];
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined =>
  typeof x === "string" && x.trim() ? x.trim() : undefined;
const refs = (x: unknown): string[] => arr(x).map((r) => str(r)).filter(Boolean) as string[];

export const slugKey = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "x";

export function parseGuide(text: string): GuideDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* an unparseable file opens empty, not blank */ }

  return {
    title: str(raw.title) ?? "Guide",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    decisions: arr(raw.decisions).map((d, i) => {
      const o = rec(d);
      const label = str(o.label) ?? str(o.key) ?? `Question ${i + 1}`;
      return {
        key: str(o.key) ?? slugKey(label),
        label,
        ...(str(o.detail) ? { detail: str(o.detail)! } : {}),
        values: arr(o.values).map((v, j) => {
          const w = rec(v);
          const vl = str(w.label) ?? str(w.key) ?? `Answer ${j + 1}`;
          return {
            key: str(w.key) ?? slugKey(vl),
            label: vl,
            ...(str(w.detail) ? { detail: str(w.detail)! } : {}),
            ...(refs(w.activates).length ? { activates: refs(w.activates) } : {}),
            ...(refs(w.when).length ? { when: refs(w.when) } : {}),
          } as SpaceValue;
        }),
      };
    }),
    steps: arr(raw.steps).map((x, i) => {
      const o = rec(x);
      const label = str(o.label) ?? str(o.key) ?? `Step ${i + 1}`;
      const neg = str(o.negotiable);
      // `body` reads as `detail`, so a hand-written file can use either word.
      const detail = str(o.detail) ?? str(o.body);
      return {
        key: str(o.key) ?? slugKey(label),
        label,
        ...(detail ? { detail } : {}),
        ...(refs(o.when).length ? { when: refs(o.when) } : {}),
        ...(refs(o.after).length ? { after: refs(o.after) } : {}),
        ...(str(o.effort) ? { effort: str(o.effort)! } : {}),
        ...(neg === "fixed" || neg === "scope" || neg === "date"
          ? { negotiable: neg as Negotiable } : {}),
        ...(o.emphasis === true ? { emphasis: true } : {}),
      } as GuideStep;
    }),
  };
}

export function dumpGuide(doc: GuideDoc): string {
  return yaml.dump({
    title: doc.title,
    ...(doc.description ? { description: doc.description } : {}),
    decisions: doc.decisions.map((d) => ({
      key: d.key, label: d.label,
      ...(d.detail ? { detail: d.detail } : {}),
      values: d.values.map((v) => ({
        key: v.key, label: v.label,
        ...(v.detail ? { detail: v.detail } : {}),
        ...(v.activates?.length ? { activates: v.activates } : {}),
        ...(v.when?.length ? { when: v.when } : {}),
      })),
    })),
    steps: doc.steps.map((x) => ({
      key: x.key,
      label: x.label,
      ...(x.when?.length ? { when: x.when } : {}),
      ...(x.after?.length ? { after: x.after } : {}),
      ...(x.effort ? { effort: x.effort } : {}),
      ...(x.negotiable ? { negotiable: x.negotiable } : {}),
      ...(x.emphasis ? { emphasis: true } : {}),
      ...(x.detail ? { detail: x.detail } : {}),
    })),
  }, { lineWidth: -1, noRefs: true });
}

/**
 * The steps that apply, in dependency order.
 *
 * Two rules, and neither is the playbook's.
 *
 * WHAT SURVIVES — a step stays while its questions are unanswered, and goes
 * only once you have answered one of them differently. The procedure opens
 * whole and narrowing REMOVES, rather than opening near-empty and revealing. A
 * guide showing one step until everything is answered reads as broken.
 *
 * HOW MANY — all of them. The sections this replaced competed and one won;
 * steps ACCUMULATE, because a procedure is not a branch you pick, it is every
 * instruction that applies to you.
 */
export function stepsAt(
  doc: GuideDoc, locks: string[], context: string[] = [],
): GuideStep[] {
  const taken = new Set([...locks, ...context]);
  const answered = new Set([...taken].map((l) => l.split("=")[0]));
  const live = doc.steps.filter((x) =>
    !x.when?.length || x.when.every((r) => taken.has(r) || !answered.has(r.split("=")[0])));

  // Kahn, with document order as the tie-break so an unconstrained procedure
  // reads exactly as written. Edges to steps that did not survive are dropped.
  const has = new Set(live.map((x) => x.key));
  const need = new Map(live.map((x) => [x.key, (x.after ?? []).filter((k) => has.has(k))]));
  const done = new Set<string>();
  const out: GuideStep[] = [];
  while (out.length < live.length) {
    const next = live.find((x) => !done.has(x.key) && need.get(x.key)!.every((k) => done.has(k)));
    // No candidate left means a cycle. Emit the remainder in document order
    // rather than spinning or dropping: a bad `after` should misorder a
    // procedure, not hide half of it.
    if (!next) {
      for (const x of live) if (!done.has(x.key)) { done.add(x.key); out.push(x); }
      break;
    }
    done.add(next.key);
    out.push(next);
  }
  return out;
}

/** How much of the procedure is hidden — the reason to keep answering. */
export function narrowing(doc: GuideDoc, locks: string[], context: string[] = []) {
  return { shown: stepsAt(doc, locks, context).length, total: doc.steps.length };
}
