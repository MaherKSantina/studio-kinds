/**
 * Hierarchical decisions, and predicates over the answers taken.
 *
 * Pulled out of `playbookDoc` because it was never about playbooks. The pieces
 * — a decision offers answers, an answer can bring further decisions into
 * existence, a condition holds when the named answers are taken — describe any
 * document whose content depends on which branch you are on. A playbook uses it
 * for the state of a business; a guide uses it to narrow one explanation.
 *
 * The difference between those two is LIFETIME, not shape. A playbook's
 * assignment is a fact about the world and is saved. A guide's is a question
 * you answered to read a paragraph, and is thrown away. Sharing the mechanism
 * and not the storage is the whole point of the split.
 */

/** A predicate over an assignment: every `decision=answer` ref must hold.
 *  Empty or absent matches everything. */
export type When = string[];

export const refOf = (decision: string, value: string) => `${decision}=${value}`;

export const splitRef = (ref: string): [string, string] => {
  const i = ref.indexOf("=");
  return i < 0 ? [ref, ""] : [ref.slice(0, i), ref.slice(i + 1)];
};

export interface SpaceValue {
  key: string;
  label: string;
  detail?: string;
  /** Decisions that only exist once this answer is taken. The hierarchy. */
  activates?: string[];
  /**
   * This ANSWER only exists where the condition holds.
   *
   * Decision-level gating says whether a question is worth asking; this says
   * which answers to it are even available. "The company's own account" is not
   * a worse answer while there is no company — it is not an answer, and
   * offering it invites an assignment that describes nothing real.
   */
  when?: When;
}

export interface SpaceDecision {
  key: string;
  label: string;
  detail?: string;
  values: SpaceValue[];
}

/**
 * Does the assignment satisfy this predicate?
 *
 * `context` is an enclosing assignment, when one document is being read inside
 * another. Refs from outside are indistinguishable from local ones once here,
 * deliberately: a condition should not have to know who owns the decision it
 * names.
 */
export const meets = (locks: string[], when?: When, context: string[] = []): boolean =>
  !when?.length || when.every((r) => locks.includes(r) || context.includes(r));

/** Every answer that would bring `decision` into existence. */
export function enablersOf(decisions: SpaceDecision[], decision: string): string[] {
  const out: string[] = [];
  for (const d of decisions) {
    for (const v of d.values) {
      if (v.activates?.includes(decision)) out.push(refOf(d.key, v.key));
    }
  }
  return out;
}

/** Decisions on the table: no enablers at all, or any enabler taken. */
export function activeDecisions(
  decisions: SpaceDecision[], locks: string[], context: string[] = [],
): SpaceDecision[] {
  return decisions.filter((d) => {
    const en = enablersOf(decisions, d.key);
    return !en.length || en.some((r) => locks.includes(r) || context.includes(r));
  });
}

/** The answers actually on offer here. */
export const valuesOn = (
  d: SpaceDecision, locks: string[], context: string[] = [],
): SpaceValue[] => d.values.filter((v) => meets(locks, v.when, context));

/**
 * Drop answers to questions nobody is asking any more, to a fixed point.
 *
 * Two ways a lock can go stale: its decision left the table, or the answer
 * itself stopped being on offer while the question stayed. Both leave an
 * assignment naming something that is not there, which every condition
 * downstream would keep matching against.
 */
export function pruneLocks(
  decisions: SpaceDecision[], locks: string[], context: string[] = [],
): string[] {
  let next = locks;
  for (let pass = 0; pass < decisions.length + 1; pass++) {
    const before = next.length;
    const live = new Set(activeDecisions(decisions, next, context).map((d) => d.key));
    next = next.filter((l) => {
      const [dk, vk] = splitRef(l);
      if (!live.has(dk)) return false;
      const v = decisions.find((d) => d.key === dk)?.values.find((x) => x.key === vk);
      return !v || meets(next, v.when, context);
    });
    if (next.length === before) break;
  }
  return next;
}

/** Take an answer, replacing any other answer to the same decision. */
export const applyRefs = (locks: string[], refs: string[]): string[] => {
  let next = locks;
  for (const ref of refs) {
    const [d] = splitRef(ref);
    next = [...next.filter((l) => splitRef(l)[0] !== d), ref];
  }
  return next;
};

/**
 * Take the answer to every decision that only has one.
 *
 * A question with a single available answer is not a question — it is a fact
 * stated as a prompt, and leaving it unanswered strands every condition
 * downstream of it. So it is taken automatically and never shown.
 *
 * Iterated, because taking one can activate a decision that is itself down to
 * one answer, or narrow a `when` so that another collapses. Runs to a fixed
 * point rather than a single pass.
 */
export function impliedLocks(
  decisions: SpaceDecision[], locks: string[], context: string[] = [],
): string[] {
  let next = locks;
  for (let pass = 0; pass < decisions.length + 1; pass++) {
    const before = next.length;
    for (const d of activeDecisions(decisions, next, context)) {
      if ([...next, ...context].some((l) => splitRef(l)[0] === d.key)) continue;
      const vals = valuesOn(d, next, context);
      if (vals.length === 1) next = applyRefs(next, [refOf(d.key, vals[0].key)]);
    }
    if (next.length === before) break;
  }
  return next;
}

/**
 * Decisions in reading order: each one under the answer that opened it.
 *
 * Flat, with a depth, because every consumer wants to render a list and indent
 * it rather than walk a tree.
 *
 * By default a decision down to ONE available answer is dropped — in an
 * assignment (a playbook, a guide) a single answer is a fact, auto-taken by
 * `impliedLocks`, and showing it invites answering a non-question. A host
 * whose decisions are RETRIEVAL CUES (a memory: taking the answer narrows a
 * set, not stating a fact) passes `includeSingles` — there, the one-answer
 * decision is still a choice.
 */
export function decisionRows(
  decisions: SpaceDecision[], locks: string[], context: string[] = [],
  opts: { includeSingles?: boolean } = {},
): { decision: SpaceDecision; depth: number }[] {
  const min = opts.includeSingles ? 0 : 1;
  const live = activeDecisions(decisions, locks, context)
    .filter((d) => valuesOn(d, locks, context).length > min);
  const byKey = new Map(live.map((d) => [d.key, d]));
  const seen = new Set<string>();
  const out: { decision: SpaceDecision; depth: number }[] = [];

  const all = new Map(decisions.map((d) => [d.key, d]));
  const visit = (key: string, depth: number) => {
    const d = all.get(key);
    if (!d || seen.has(key)) return;
    seen.add(key);
    const shown = byKey.has(key);
    if (shown) out.push({ decision: d, depth });
    const taken = [...locks, ...context].find((l) => splitRef(l)[0] === key);
    const val = taken ? d.values.find((v) => v.key === splitRef(taken)[1]) : undefined;
    // A collapsed parent contributes no indent — its children are not nested
    // under anything the reader can see.
    for (const k of val?.activates ?? []) visit(k, shown ? depth + 1 : depth);
  };

  for (const d of decisions) if (!enablersOf(decisions, d.key).length) visit(d.key, 0);
  // Anything still unreached is active through an answer that is not on screen.
  // Showing it flat beats dropping it.
  for (const d of live) visit(d.key, 0);
  return out;
}

/**
 * One pill click, as a pure function: take (or clear) an answer, then prune
 * answers to questions the change removed from the table. What `DecisionPills`
 * emits — the COMPLETE next assignment, never a delta.
 */
export function toggleRef(
  decisions: SpaceDecision[], locks: string[], ref: string,
  opts: { context?: string[]; allowClear?: boolean } = {},
): string[] {
  const context = opts.context ?? [];
  const next = locks.includes(ref)
    ? (opts.allowClear ?? true) ? locks.filter((l) => l !== ref) : locks
    : applyRefs(locks, [ref]);
  return pruneLocks(decisions, next, context);
}
