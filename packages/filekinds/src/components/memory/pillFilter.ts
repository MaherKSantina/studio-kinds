/**
 * FILTER THE FOCI BY NAME — the search field over the pills. With many
 * answers on the table (the fifty folders of C:\Github) the eye wants a
 * shortcut: type part of a name and only the matching pills stay. Pure: the
 * same decisions with only the values whose label (or key) contains the
 * query, case-insensitively. A TAKEN answer and the structural else always
 * stay — a lock has to remain visible to be cleared, and the complement is a
 * stage, not a name. An empty query is the table untouched.
 */
import { ELSE } from "../../lib/memoryDoc";

export interface PillDecision { key: string; values: { key: string; label: string }[] }

export function filterPills<D extends PillDecision>(decisions: D[], query: string, taken: readonly string[]): D[] {
  const q = query.trim().toLowerCase();
  if (!q) return decisions;
  const on = new Set(taken);
  return decisions.map((d) => ({
    ...d,
    values: d.values.filter((v) =>
      v.key === ELSE || on.has(`${d.key}=${v.key}`) || v.label.toLowerCase().includes(q) || v.key.toLowerCase().includes(q)),
  }));
}

/** How many NAMED answers a decision offers (the else is not one). */
export const namedCount = (d: PillDecision | null | undefined): number =>
  d ? d.values.filter((v) => v.key !== ELSE).length : 0;
