/**
 * The `.pulse` kind — THE MOVEMENT of a working memory, drawn from two
 * honest sources and never cached:
 *
 *   content movement   — DERIVED live from the store's own timestamps: for
 *                        each focus of the referenced `.memory`, how many
 *                        units arrived (created) and moved (updated) on each
 *                        of the last N days. A heat grid.
 *   attention movement — AUTHORED events: the memory's `journal:` trail,
 *                        appended by every pill click that changed the
 *                        taken answers. A timeline.
 *
 * The doc itself is only a POINTER plus a window:
 *
 *   title: Desk pulse
 *   memory: /memory/desk.memory
 *   days: 21
 *
 * Rows are the memory's WHOLE foci hierarchy — every decision's answers
 * with the structural else, children indented under the answer that
 * activates them — so the pulse reads as "the desk, over time". Heat is a
 * saturation WARNING, not celebration: many arrivals into one focus means
 * a working set getting harder to reason about. Else rows are grey — the
 * unclaimed doesn't compete for attention.
 */
import yaml from "js-yaml";
import { splitRef } from "crosscut";
import { ELSE, ELSE_LABEL, hiddenByOptions, withElse, type MemoryDoc } from "./memoryDoc";
import { answerFor, type RankingDecision } from "./rankingDoc";
import type { PolicyInput } from "./policyDoc";
import { clauseHolds } from "./policyDoc";
import { localDay, localNoonMs } from "./nodeIndex";

export interface PulseDoc {
  title: string;
  description?: string;
  /** Path of the `.memory` whose foci define the rows. */
  memory: string;
  /** How many days back the grid reaches (today inclusive). */
  days: number;
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

export function parsePulse(text: string): PulseDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  const days = typeof raw.days === "number" && raw.days >= 1 ? Math.min(Math.floor(raw.days), 120) : 21;
  return {
    title: str(raw.title) ?? "Pulse",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    memory: str(raw.memory) ?? "",
    days,
  };
}

export interface PulseCell {
  /** Units whose created date is this day — arrivals. */
  added: number;
  /** Units touched this day (updated) that did NOT arrive this day. */
  touched: number;
  /** How many of today's units already existed by the END of this day — the
   *  running SIZE of the focus, whose left-to-right gradient is how the
   *  working memory changed. (Of the current population: departures leave
   *  no trace in the store, and the moves log owns those.) */
  total: number;
  /** The same running sum in the caller's WEIGHT — reading burden rather
   *  than headcount, when units carry one (each defaults to 1, so an
   *  unweighted grid has mass == total). One short file weighs less than a
   *  pile of long ones. */
  mass: number;
}

export interface PulseRow {
  /** The full answer path, e.g. "focus=jobhunt/hunt=pipeline". */
  key: string;
  label: string;
  /** Nesting under the answer that activates this level. */
  depth: number;
  /** An else row — unclaimed territory, drawn grey: it doesn't compete. */
  isElse: boolean;
  /** Inside an else SUBTREE (the else row and everything beneath it, named
   *  answers included) — parked is parked, so the whole block draws grey. */
  parked: boolean;
  /** For a deferred else block: whose complement this is ("Job Hunt"). */
  context?: string;
  cells: PulseCell[];
  addedTotal: number;
  /** Units currently here — a parent row aggregates its whole subtree. */
  units: number;
  /** Their summed weight — the last cell's mass, kept here for callers that
   *  normalize columns against each other. */
  mass: number;
}

export interface PulseGrid {
  /** ISO dates, oldest first, ending today. */
  dates: string[];
  rows: PulseRow[];
}

const DAY = 86_400_000;

/**
 * The heat grid over the WHOLE foci hierarchy: every decision's answers
 * (structural else included) appear as rows, children indented under the
 * answer that activates them, depth-first in authored order. A unit counts
 * on every row of its answer path, so a parent row reads as the saturation
 * of its whole subtree. Heat is a WARNING here — many arrivals into one
 * focus means a saturated working set, harder to reason about.
 *
 * The memory's include rules pick the units; the store's timestamps place
 * them on days. Pure — callers own the clock.
 */
export function pulseGrid(
  memory: MemoryDoc,
  units: { fields: Record<string, string>; createdAt?: string; updatedAt?: string; weight?: number }[],
  todayIso: string,
  days: number,
): PulseGrid {
  // LOCAL days, anchored at noon so DST can't shift a column. UTC bucketing
  // grew a phantom empty column at the end of a Sydney afternoon.
  const anchor = localNoonMs(todayIso) ?? Date.parse(todayIso);
  const dates = Array.from({ length: days }, (_, i) =>
    localDay(new Date(anchor - (days - 1 - i) * DAY).toISOString())!);
  const dayIndex = new Map(dates.map((d, i) => [d, i]));

  const spaced = withElse(memory.decisions);
  const byKey = new Map(spaced.map((d) => [d.key, d]));
  const activated = new Set(spaced.flatMap((d) => d.values.flatMap((v) => v.activates ?? [])));
  const roots = spaced.filter((d) => !activated.has(d.key));

  // The row tree, in two blocks: NAMED answers keep the hierarchy up top;
  // every else SUBTREE defers to a tail at the bottom (context says whose
  // complement it is), because the unclaimed pool shouldn't interleave with
  // what competes for attention. A parked named answer (Jason under an else)
  // rides inside its else block, still red.
  const main: PulseRow[] = [];
  const tail: PulseRow[] = [];
  const rowIndex = new Map<string, PulseRow>();
  const emptyRow = (key: string, label: string, depth: number, isElse: boolean, parked: boolean, context?: string): PulseRow => ({
    key, label, depth, isElse, parked, ...(context ? { context } : {}),
    cells: dates.map(() => ({ added: 0, touched: 0, total: 0, mass: 0 })),
    addedTotal: 0, units: 0, mass: 0,
  });
  const declare = (
    d: RankingDecision, prefix: string, depth: number,
    context: string[], sink: PulseRow[], seen: Set<string>,
  ) => {
    if (seen.has(d.key)) return; // an activation cycle never recurses forever
    const deeper = new Set(seen).add(d.key);
    for (const v of d.values) {
      const key = `${prefix}${d.key}=${v.key}`;
      const isElse = v.key === ELSE;
      // An else met in the MAIN block defers its whole subtree to the tail,
      // depth restarted; inside the tail it stays inline, last among siblings.
      const defer = isElse && sink === main;
      const into = defer ? tail : sink;
      const rowDepth = defer ? 0 : depth;
      const row = emptyRow(key, isElse ? ELSE_LABEL : v.label, rowDepth, isElse, into === tail,
        defer && context.length ? context.join(" › ") : undefined);
      into.push(row);
      rowIndex.set(key, row);
      for (const ck of v.activates ?? []) {
        const child = byKey.get(ck);
        if (child) declare(child, `${key}/`, rowDepth + 1, [...context, row.label], into, deeper);
      }
    }
  };
  for (const root of roots) declare(root, "", 0, [], main, new Set());
  const rows = [...main, ...tail];

  // Each unit walks its answer path, counting on every level it passes.
  // Units created BEFORE the window are the row's base population — they
  // tint every column, so the gradient starts from what was already there.
  const base = new Map<PulseRow, number>();
  const baseMass = new Map<PulseRow, number>();
  for (const u of units) {
    if (!memory.include.every((c) => clauseHolds(c, u.fields as PolicyInput))) continue;
    if (hiddenByOptions(memory.options, u.fields)) continue; // an unticked slice doesn't pulse either
    const created = localDay(u.createdAt);
    const updated = localDay(u.updatedAt);
    const ci = created !== undefined ? dayIndex.get(created) : undefined;
    const ui = updated !== undefined && updated !== created ? dayIndex.get(updated) : undefined;
    const w = u.weight ?? 1;

    const mark = (row: PulseRow) => {
      row.units += 1;
      // cell.mass holds the day's arrival WEIGHT here; the running pass below
      // turns it into the same prefix sum total gets from `added`.
      if (ci !== undefined) { row.cells[ci].added += 1; row.cells[ci].mass += w; row.addedTotal += 1; }
      else { base.set(row, (base.get(row) ?? 0) + 1); baseMass.set(row, (baseMass.get(row) ?? 0) + w); }
      if (ui !== undefined) row.cells[ui].touched += 1;
    };
    const walk = (d: RankingDecision, prefix: string, seen: Set<string>) => {
      if (seen.has(d.key)) return;
      const deeper = new Set(seen).add(d.key);
      const a = answerFor(d, { fields: u.fields }, u.fields as PolicyInput).value || ELSE;
      const key = `${prefix}${d.key}=${a}`;
      const row = rowIndex.get(key);
      if (!row) return;
      mark(row);
      const v = d.values.find((x) => x.key === a);
      for (const ck of v?.activates ?? []) {
        const child = byKey.get(ck);
        if (child) walk(child, `${key}/`, deeper);
      }
    };
    for (const root of roots) walk(root, "", new Set());
  }
  // The running size: base population plus arrivals up to each day — in
  // heads (total) and in the caller's weight (mass) alike.
  for (const row of rows) {
    let run = base.get(row) ?? 0;
    let heft = baseMass.get(row) ?? 0;
    for (const cell of row.cells) {
      run += cell.added; cell.total = run;
      heft += cell.mass; cell.mass = heft;
    }
    row.mass = heft;
  }
  return { dates, rows };
}

/**
 * The pulse cell color, one place for every surface that draws it: the box
 * is the focus's running size that day on a continuous scale normalized to
 * the row, so a sequence reads as a gradient of how the working memory
 * filled up. Red is the saturation warning; parked/else use the same
 * gradient in grey, because the unclaimed pool doesn't compete for
 * attention. t = 0 still tints faintly: an empty day is part of the
 * gradient, not a hole in it.
 */
export const fillColor = (t: number, grey: boolean): string => {
  const c = Math.max(0, Math.min(1, t));
  const l = 94 - c * (grey ? 58 : 62); // 94% → 36% / 32%
  return grey ? `hsl(215 10% ${l}%)` : `hsl(0 72% ${l}%)`;
};

/**
 * ONE level of the grid, in context: the rows for a single decision's
 * answers (structural else included) under the answer path the taken locks
 * spell — the memory view's side pulse asks for "the lowest sub-focus on
 * the table, alongside its siblings" and this resolves it. The prefix is
 * found by following locks through the activation chain from the roots; a
 * target the locks never reach yields no rows.
 */
export function pulseSiblings(
  memory: MemoryDoc, grid: PulseGrid, locks: string[], targetKey: string,
): PulseRow[] {
  const spaced = withElse(memory.decisions);
  const byKey = new Map(spaced.map((d) => [d.key, d]));
  const taken = new Map(locks.map((r) => splitRef(r) as [string, string]));
  const activated = new Set(spaced.flatMap((d) => d.values.flatMap((v) => v.activates ?? [])));
  const roots = spaced.filter((d) => !activated.has(d.key));

  const find = (d: RankingDecision, prefix: string, seen: Set<string>): string | null => {
    if (seen.has(d.key)) return null;
    if (d.key === targetKey) return prefix;
    const a = taken.get(d.key);
    if (!a) return null; // the path descends only through answered decisions
    const v = d.values.find((x) => x.key === a);
    for (const ck of v?.activates ?? []) {
      const child = byKey.get(ck);
      const hit = child ? find(child, `${prefix}${d.key}=${a}/`, new Set(seen).add(d.key)) : null;
      if (hit !== null) return hit;
    }
    return null;
  };

  for (const root of roots) {
    const prefix = find(root, "", new Set());
    if (prefix !== null) {
      const target = byKey.get(targetKey);
      if (!target) return [];
      return target.values
        .map((v) => grid.rows.find((r) => r.key === `${prefix}${targetKey}=${v.key}`))
        .filter((r): r is PulseRow => !!r);
    }
  }
  return [];
}
