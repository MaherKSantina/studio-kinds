/**
 * GOLDEN RULES — how a diff classifies one item that exists in version A,
 * version B, or both. THE suite-wide diff vocabulary:
 *
 *   added   → GREEN    only in B (the new combination brought it)
 *   removed → RED      only in A — shown fully readable, colored, NEVER struck through
 *   edited  → AMBER    in both, content changed; the item colors amber and its
 *                      CONTENT shows the green/amber/red detail
 *   same    → no color
 *
 * A diff view shows content changes, not layout ghosts: no gaps where removed
 * items "would have been", no crossed-out text.
 */
import { DecisionTable, decide } from "../decision/decisionTable";

export type DiffChange = "added" | "removed" | "edited" | "same";

export interface DiffCtx {
  inA: boolean;
  inB: boolean;
  /** The item's content differs between the versions (only meaningful when in both). */
  changed: boolean;
}

export const diffRules: DecisionTable<DiffCtx, { change: DiffChange }> = {
  name: "diff-change",
  answers: "How does one item differ between version A and version B?",
  rules: [
    { rule: "added", because: "only the new combination has it — presence wins over any content comparison", when: { inA: false, inB: true }, then: { change: "added" } },
    { rule: "removed", because: "the new combination loses it; still shown readable, just red", when: { inA: true, inB: false }, then: { change: "removed" } },
    { rule: "edited", because: "present in both with different content — amber at the item, detail colors inside", when: { inA: true, inB: true, changed: true }, then: { change: "edited" } },
  ],
  otherwise: { change: "same" },
};

export const classifyDiff = (ctx: DiffCtx): DiffChange => decide(diffRules, ctx).outcome.change;

/** The only three diff colors. Everything diff-related draws from here. */
export const DIFF_COLORS: Record<Exclude<DiffChange, "same">, string> = {
  added: "#15803d",
  edited: "#b45309",
  removed: "#dc2626",
};
