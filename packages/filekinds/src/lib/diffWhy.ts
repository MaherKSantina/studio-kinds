/**
 * WHY does this diff exist? Derived from the engine, not guessed: the rules
 * that matched under A and under B declare `when` conditions, and the answers
 * those conditions name are the cause. The differing ones are the explanation.
 *
 *   added   -> "Exists because Legal form: unanswered → Pty Ltd"
 *   removed -> "Lost because ..."   (the n/a rule's condition is exactly why)
 *   edited  -> "A different rule applies — ..."
 */
import type { DiffChange, SpaceDecision } from "crosscut";

export function diffWhy(
  change: DiffChange,
  rA: { when?: string[] } | undefined,
  rB: { when?: string[] } | undefined,
  effA: string[],
  effB: string[],
  decisions: SpaceDecision[],
): string | null {
  if (change === "same") return null;
  const keys = [...new Set([...(rA?.when ?? []), ...(rB?.when ?? [])].map((r) => r.split("=")[0]))];
  const parts: string[] = [];
  for (const k of keys) {
    const a = effA.find((r) => r.startsWith(k + "="));
    const b = effB.find((r) => r.startsWith(k + "="));
    if (a === b) continue;
    const d = decisions.find((x) => x.key === k);
    const lab = (ref?: string) =>
      ref ? d?.values.find((v) => v.key === ref.split("=")[1])?.label ?? ref.split("=")[1] : "unanswered";
    parts.push(`${d?.label ?? k}: ${lab(a)} → ${lab(b)}`);
  }
  if (!parts.length) {
    return change === "edited" ? "The applying rule changed its process."
      : change === "added" ? "Newly available under the new combination."
      : "No longer available under the new combination.";
  }
  const because = parts.join(" · ");
  return change === "added" ? `Exists because ${because}`
    : change === "removed" ? `Lost because ${because}`
    : `A different rule applies — ${because}`;
}
