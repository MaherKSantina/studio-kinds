/**
 * One dimension over a list — the pure half of `OneDList`.
 *
 * A Dimension names ONE way of grouping items. The component decides how that
 * grouping PRESENTS (headings, filter pills, or not at all); this module only
 * answers what the groups are and what order they come in. The same Dimension
 * type is the building block for the n-dimensional components to come (a
 * matrix is two of these).
 */

export interface Dimension<T> {
  /** Group key for an item. Return "" for "no natural group" — those items
   *  land in the fallback group; grouped means NOTHING sits outside a group. */
  of: (item: T) => string;
  /** Display label for a group key. Default: the key itself. */
  label?: (key: string) => string;
  /** Explicit group order. Keys not listed follow in first-seen order. */
  order?: string[];
  /** Label of the group that catches items with no key. Default "Other". */
  fallback?: string;
}

export interface Group<T> {
  /** "" = the fallback group (items with no natural key) — always LAST. */
  key: string;
  label: string;
  items: T[];
}

export function groupItems<T>(items: T[], dim: Dimension<T>): Group<T>[] {
  const byKey = new Map<string, T[]>();
  for (const it of items) {
    const k = dim.of(it) ?? "";
    const arr = byKey.get(k) ?? [];
    arr.push(it);
    byKey.set(k, arr);
  }
  const seen = [...byKey.keys()];
  const ordered = [
    ...(dim.order ?? []).filter((k) => k !== "" && byKey.has(k)),
    ...seen.filter((k) => k !== "" && !(dim.order ?? []).includes(k)),
    // The fallback group comes LAST: it is the residue, not the headline.
    ...(byKey.has("") ? [""] : []),
  ];
  // de-dup while keeping first position
  const unique = ordered.filter((k, i) => ordered.indexOf(k) === i);
  return unique.map((k) => ({
    key: k,
    label: k === "" ? dim.fallback ?? "Other" : dim.label?.(k) ?? k,
    items: byKey.get(k)!,
  }));
}

/** Filter mode: which groups' items are visible for a selected pill.
 *  null = All. The fallback group ("") is an ordinary group here — it has its
 *  own pill, because grouped means nothing lives outside a group. */
export function visibleItems<T>(groups: Group<T>[], selected: string | null): T[] {
  if (selected === null) return groups.flatMap((g) => g.items);
  return groups.find((g) => g.key === selected)?.items ?? [];
}

/* ── Search ───────────────────────────────────────────────────────────────── */

/**
 * Local match: case-insensitive, every whitespace-separated term of the query
 * must appear in `text` as a CONTIGUOUS substring — all terms, in any order
 * ("bill arr" hits "A bill arrives"; "barr" does not). Subsequence matching
 * was tried and removed: over long concatenated field text almost any string
 * of letters could be found in order, so nonsense like "akjsdajdh" matched
 * everything and the box felt broken. Matching FILTERS, it never reorders —
 * order stays the list's/dimension's business.
 */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = text.toLowerCase();
  return q.split(/[ ]+/).every((term) => hay.includes(term));
}

/** The search pass the component applies BEFORE grouping: groups, headings and
 *  pill counts all describe the matched universe. */
export function searchItems<T>(items: T[], text: (item: T) => string, query: string): T[] {
  if (!query.trim()) return items;
  return items.filter((it) => fuzzyMatch(query, text(it)));
}
