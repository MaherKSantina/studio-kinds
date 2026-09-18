/**
 * The windowing math behind `PaneTrail` — a drill-down chain of panes viewed
 * through a sliding three-slot window:
 *
 *   position 0:   [ pane0 open | pane1 open ]          (root always open)
 *   position k>0: [ pane(k-1) collapsed | pane k open | pane k+1 open ]
 *
 * One dot per position; pushing a deeper pane advances to the newest position.
 */

export interface TrailWindow {
  /** Index shown as a collapsed rail on the far left, or null (position 0). */
  collapsed: number | null;
  /** Indexes rendered open, left to right. */
  open: number[];
}

/** Windowed seek positions of a chain of `count` panes. */
export const positionsFor = (count: number): number => Math.max(1, count - 1);

/** All positions including the trailing SOLO one — "content pane only", the
 *  deepest pane at full width. Exists once there are 2+ panes. */
export const totalPositionsFor = (count: number): number =>
  count <= 1 ? 1 : positionsFor(count) + 1;

/** Is this position the solo (content-only) one? */
export const isSoloPosition = (count: number, position: number): boolean =>
  count > 1 && position >= positionsFor(count);

export function trailWindow(count: number, position: number): TrailWindow {
  if (count <= 0) return { collapsed: null, open: [] };
  const p = Math.min(Math.max(0, position), totalPositionsFor(count) - 1);
  if (isSoloPosition(count, p)) return { collapsed: null, open: [count - 1] };
  if (p === 0) return { collapsed: null, open: count === 1 ? [0] : [0, 1] };
  return { collapsed: p - 1, open: p + 1 < count ? [p, p + 1] : [p] };
}

/** Where to stand after the chain length changes: a grown chain jumps to the
 *  newest WINDOWED position (solo stays an explicit choice); a shrunk one
 *  clamps back into range. */
export function advancedPosition(prevCount: number, nextCount: number, position: number): number {
  if (nextCount > prevCount) return positionsFor(nextCount) - 1;
  return Math.min(position, totalPositionsFor(nextCount) - 1);
}

/* ── single-pane mode (small screens) ───────────────────────────────────── */

/** How the trail lays panes out: the three-slot WINDOW on room-enough
 *  screens, or ONE pane per position on small ones (phones) — same chain,
 *  same dots, no collapsed rail, no separate solo position (every position
 *  already is one pane at full width). */
export type TrailMode = "window" | "single";

export const totalPositionsIn = (mode: TrailMode, count: number): number =>
  mode === "single" ? Math.max(1, count) : totalPositionsFor(count);

export const isSoloIn = (mode: TrailMode, count: number, position: number): boolean =>
  mode === "single" ? false : isSoloPosition(count, position);

export function trailWindowIn(mode: TrailMode, count: number, position: number): TrailWindow {
  if (mode !== "single") return trailWindow(count, position);
  if (count <= 0) return { collapsed: null, open: [] };
  const p = Math.min(Math.max(0, position), count - 1);
  return { collapsed: null, open: [p] };
}

/** Push advances to the NEWEST pane (which in single mode is the last one);
 *  pop clamps, exactly like window mode. */
export function advancedPositionIn(mode: TrailMode, prevCount: number, nextCount: number, position: number): number {
  if (mode !== "single") return advancedPosition(prevCount, nextCount, position);
  if (nextCount > prevCount) return Math.max(0, nextCount - 1);
  return Math.min(position, Math.max(0, nextCount - 1));
}

/** Index of the first key in `next` not present in `prev` — where a pane was
 *  INSERTED (drills join mid-chain, adjacent to the stage that spawned them),
 *  or null when nothing was added. */
export function insertedIndex(prev: string[], next: string[]): number | null {
  if (next.length <= prev.length) return null;
  const seen = new Set(prev);
  for (let i = 0; i < next.length; i++) if (!seen.has(next[i])) return i;
  return next.length - 1;
}

/** The seek position that reveals pane `index`: alone in single mode, as the
 *  right open slot in window mode (so its source stays visible beside it). */
export const positionShowing = (mode: TrailMode, count: number, index: number): number =>
  mode === "single"
    ? Math.min(Math.max(0, index), Math.max(0, count - 1))
    : Math.min(Math.max(0, index - 1), Math.max(0, positionsFor(count) - 1));


/** The first index whose key changed while the chain kept its length: a pane
 *  REPLACED in place, e.g. an event's detail swapping in for the topics pane. */
export function replacedIndex(prev: string[], next: string[]): number | null {
  if (next.length !== prev.length) return null;
  for (let i = 0; i < next.length; i++) if (next[i] !== prev[i]) return i;
  return null;
}

/**
 * Where the seek lands after the chain changed.
 *
 * A pushed pane is shown. A pane replaced in place is shown only when the
 * current window hides it — on a phone, an event's detail taking the topics
 * pane's slot must come into view, or the row toggles and nothing else moves,
 * which read as a dead click. A visible replacement, and a pop, just clamp.
 */
export function positionAfter(
  mode: TrailMode, prev: string[], next: string[], position: number, anchor: number = position,
): number {
  // On a phone an automatic advance moves at most ONE pane past where the user
  // last touched. Opening an event whose detail is a nested book pushes two
  // panes in a burst (the book, then its own detail); landing on the second
  // skips the book's decisions and events, which is what the tap asked for.
  const cap = (p: number) => (mode === "single" ? Math.min(p, anchor + 1) : p);
  const inserted = insertedIndex(prev, next);
  if (inserted !== null) return cap(positionShowing(mode, next.length, inserted));
  const replaced = replacedIndex(prev, next);
  if (replaced !== null && !trailWindowIn(mode, next.length, position).open.includes(replaced)) {
    return cap(positionShowing(mode, next.length, replaced));
  }
  return Math.min(position, totalPositionsIn(mode, next.length) - 1);
}
