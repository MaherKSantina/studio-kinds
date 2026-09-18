/**
 * The `.moves` kind — WHAT MOVED, harvested by looking.
 *
 * The store keeps no history, so movement is reconstructed the honest way:
 * the moves document carries a SNAPSHOT of "unit → answer path" (and the
 * decisions' shape) from the last look, and every open diffs reality
 * against it. The differences are movement events — appended to the
 * document's log, snapshot replaced — so the file accumulates a real
 * movement history as a side effect of being read:
 *
 *   node-moved      a unit's answer path changed (renamed, refiled, or the
 *                   criteria re-claimed it)
 *   arrived / gone  units entering or leaving a path (aggregated per path)
 *   answer-moved    a NAMED answer changed decisions — flagged `parked`
 *                   when it moved under an else (Jason's pattern), and
 *                   `retrieved` when it came back out
 *   answer-added / answer-removed — the unpaired cases
 *
 * The doc's head is a pointer (`memory:` + `keep:`); the tail is machine
 * state under a banner, same head-preserving contract as locks and tags.
 */
import yaml from "js-yaml";
import { enablersOf, splitRef } from "crosscut";
import { ELSE, answerPath, withElse, type MemoryDoc } from "./memoryDoc";
import { clauseHolds, type PolicyInput } from "./policyDoc";

export interface MovesDoc {
  title: string;
  description?: string;
  /** Path of the `.memory` being watched. */
  memory: string;
  /** How many events the log keeps. */
  keep: number;
}

export interface SnapshotRow {
  /** The unit's store path. */
  p: string;
  /** Its answer-path key ("focus=fatin/fj=jason"). */
  a: string;
  /** The human labels, joined " › " — kept so departed units stay legible. */
  l: string;
  /** Size in characters, when known — the reading-burden factor. */
  s?: number;
  /** Coarse structure class — the "structure of files" pressure factor. */
  k?: UnitKind;
}

/** The structure factor, coarsely: a structured NODE, a machine-shaped
 *  document (tables, lists, engines), free PROSE, or other. Prose weighs on
 *  a working memory harder per byte than structure does — the classifier
 *  exists so the pressure policy can learn that from events. */
export type UnitKind = "node" | "structured" | "prose" | "other";

const STRUCTURED_EXTS = new Set([
  "list", "csv", "tsv", "xlsx", "xls", "schema", "kanban", "policy", "definition",
  "points", "workup", "memory", "pulse", "moves", "project", "tablediff", "program",
  "playbook", "plan", "guide", "flow", "questions",
]);
const PROSE_EXTS = new Set(["md", "markdown", "mdx", "brief", "txt", "html", "htm"]);

export function unitKindOf(fields: Record<string, string>): UnitKind {
  if (fields.structured === "yes") return "node";
  const ext = fields.ext ?? "";
  if (STRUCTURED_EXTS.has(ext)) return "structured";
  if (PROSE_EXTS.has(ext)) return "prose";
  return "other";
}

/** One focus's pressure factors at a moment — what a threshold is ABOUT. */
export interface PressureCtx {
  files: number;
  /** Total kilochars, rounded. */
  kb: number;
  nodes: number;
  structured: number;
  prose: number;
}

/** Roll a snapshot up at the FOCUS level (the first answer-path segment) —
 *  the granularity Maher's pressure operates at. */
export function pressureAt(snapshot: Snapshot, focusRef: string): PressureCtx {
  const ctx: PressureCtx = { files: 0, kb: 0, nodes: 0, structured: 0, prose: 0 };
  for (const m of snapshot.mapping) {
    if (m.a.split("/")[0] !== focusRef) continue;
    ctx.files += 1;
    ctx.kb += m.s ?? 0;
    if (m.k === "node") ctx.nodes += 1;
    else if (m.k === "structured") ctx.structured += 1;
    else if (m.k === "prose") ctx.prose += 1;
  }
  ctx.kb = Math.round(ctx.kb / 1000);
  return ctx;
}

export interface Snapshot {
  at: string;
  mapping: SnapshotRow[];
  /** The structure the memory had: named answers per decision, plus the
   *  refs that ACTIVATE it (`e`) — kept so park/retrieve verdicts can walk
   *  a structure that no longer exists in the live doc. */
  shape: { d: string; v: string[]; e: string[] }[];
}

export type MoveEvent =
  | { at: string; kind: "node-moved"; node: string; from: string; to: string; ctx?: PressureCtx; fromCtx?: PressureCtx }
  | { at: string; kind: "arrived"; to: string; count: number; ctx?: PressureCtx }
  | { at: string; kind: "gone"; from: string; count: number; fromCtx?: PressureCtx }
  | { at: string; kind: "answer-moved"; answer: string; from: string; to: string; parked?: boolean; retrieved?: boolean }
  | { at: string; kind: "answer-added"; answer: string; under: string }
  | { at: string; kind: "answer-removed"; answer: string; from: string };

export interface MovesState {
  snapshot: Snapshot | null;
  events: MoveEvent[];
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

export function parseMoves(text: string): MovesDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  const keep = typeof raw.keep === "number" && raw.keep >= 10 ? Math.min(Math.floor(raw.keep), 1000) : 200;
  return {
    title: str(raw.title) ?? "Moves",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    memory: str(raw.memory) ?? "",
    keep,
  };
}

export function parseMovesState(text: string): MovesState {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { return { snapshot: null, events: [] }; }
  const s = rec(raw.snapshot);
  const at = str(s.at);
  const snapshot: Snapshot | null = at ? {
    at,
    mapping: arr(s.mapping).map(rec).flatMap((m) => {
      const p = str(m.p); const a = str(m.a); const l = str(m.l);
      const k = str(m.k) as UnitKind | undefined;
      return p && a !== undefined ? [{
        p, a: a ?? "", l: l ?? "",
        ...(typeof m.s === "number" ? { s: m.s } : {}),
        ...(k ? { k } : {}),
      }] : [];
    }),
    shape: arr(s.shape).map(rec).flatMap((sh) => {
      const d = str(sh.d);
      const strs = (x: unknown) => arr(x).map(str).filter((y): y is string => !!y);
      return d ? [{ d, v: strs(sh.v), e: strs(sh.e) }] : [];
    }),
  } : null;
  const events = arr(raw.events).map(rec).flatMap((e) => {
    const at2 = str(e.at); const kind = str(e.kind);
    return at2 && kind ? [{ ...(e as object), at: at2, kind } as MoveEvent] : [];
  });
  return { snapshot, events };
}

/** Reality, as a snapshot: every include-passing unit's answer path, plus
 *  the named-answer shape of each decision. Pure. */
export function computeSnapshot(
  memory: MemoryDoc,
  units: { path: string; fields: Record<string, string> }[],
  at: string,
): Snapshot {
  const mapping = units
    .filter((u) => memory.include.every((c) => clauseHolds(c, u.fields as PolicyInput)))
    .map((u) => {
      const ap = answerPath(memory, u.fields);
      const size = Number(u.fields.size);
      return {
        p: u.path, a: ap.key, l: ap.labels.join(" › "),
        ...(Number.isFinite(size) ? { s: size } : {}),
        k: unitKindOf(u.fields),
      };
    })
    .sort((x, y) => x.p.localeCompare(y.p));
  const spaced = withElse(memory.decisions);
  const shape = memory.decisions.map((d) => ({
    d: d.key,
    v: d.values.filter((v) => v.key !== ELSE).map((v) => v.key),
    e: enablersOf(spaced, d.key),
  }));
  return { at, mapping, shape };
}

/** Does `to`'s activation chain — as a SNAPSHOT recorded it — pass through
 *  `from`'s else? That's what parking means, and the snapshot answers even
 *  after the live doc forgot the parked decision. */
function underElseOf(shape: Snapshot["shape"], from: string, to: string): boolean {
  const byKey = new Map(shape.map((s) => [s.d, s]));
  const seen = new Set<string>();
  const up = (dk: string): boolean => {
    if (seen.has(dk)) return false;
    seen.add(dk);
    for (const ref of byKey.get(dk)?.e ?? []) {
      const [ownerKey, valueKey] = splitRef(ref);
      if (ownerKey === from && valueKey === ELSE) return true;
      if (up(ownerKey)) return true;
    }
    return false;
  };
  return up(to);
}

/** A decision's place in the memory's words — the labels of the answers
 *  that activate it, root first ("Fatin › Everything else"). */
export function decisionContext(memory: MemoryDoc, dKey: string): string {
  const spaced = withElse(memory.decisions);
  const chain: string[] = [];
  let key = dKey;
  const seen = new Set<string>();
  for (;;) {
    if (seen.has(key)) break;
    seen.add(key);
    const ref = enablersOf(spaced, key)[0];
    if (!ref) break;
    const [ownerKey, valueKey] = splitRef(ref);
    const owner = spaced.find((d) => d.key === ownerKey);
    const v = owner?.values.find((x) => x.key === valueKey);
    chain.unshift(v?.label ?? valueKey);
    key = ownerKey;
  }
  return chain.join(" › ");
}

const stemOf = (p: string): string => {
  const name = p.slice(p.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
};

/** The movement between two looks — what a `.moves` open appends. */
export function diffMoves(prev: Snapshot, next: Snapshot, memory: MemoryDoc, at: string): MoveEvent[] {
  const events: MoveEvent[] = [];

  // Nodes: moved / arrived / gone, by store path. Every node event carries
  // the PRESSURE CONTEXT of the affected focus at that moment — the labeled
  // observation the pressure policy gets fitted from.
  const before = new Map(prev.mapping.map((m) => [m.p, m]));
  const after = new Map(next.mapping.map((m) => [m.p, m]));
  const focusOf = (a: string) => a.split("/")[0];
  const arrived = new Map<string, { count: number; ref: string }>();
  const gone = new Map<string, { count: number; ref: string }>();
  for (const m of next.mapping) {
    const was = before.get(m.p);
    if (!was) {
      const cur = arrived.get(m.l) ?? { count: 0, ref: focusOf(m.a) };
      cur.count += 1;
      arrived.set(m.l, cur);
    } else if (was.a !== m.a) {
      events.push({
        at, kind: "node-moved", node: stemOf(m.p), from: was.l, to: m.l,
        ctx: pressureAt(next, focusOf(m.a)),
        fromCtx: pressureAt(prev, focusOf(was.a)),
      });
    }
  }
  for (const m of prev.mapping) {
    if (!after.has(m.p)) {
      const cur = gone.get(m.l) ?? { count: 0, ref: focusOf(m.a) };
      cur.count += 1;
      gone.set(m.l, cur);
    }
  }
  for (const [to, { count, ref }] of arrived) events.push({ at, kind: "arrived", to, count, ctx: pressureAt(next, ref) });
  for (const [from, { count, ref }] of gone) events.push({ at, kind: "gone", from, count, fromCtx: pressureAt(prev, ref) });

  // Answers: a named answer changing decisions is a park / retrieval / move.
  const pairsOf = (s: Snapshot) => new Set(s.shape.flatMap((sh) => sh.v.map((v) => `${sh.d}=${v}`)));
  const beforePairs = pairsOf(prev);
  const afterPairs = pairsOf(next);
  const removed = [...beforePairs].filter((p) => !afterPairs.has(p)).map(splitRef);
  const added = [...afterPairs].filter((p) => !beforePairs.has(p)).map(splitRef);
  const usedAdd = new Set<number>();
  for (const [fromD, k] of removed) {
    const i = added.findIndex(([, ak], idx) => ak === k && !usedAdd.has(idx));
    if (i >= 0) {
      usedAdd.add(i);
      const toD = added[i][0];
      // Parked: in the NEW structure, the destination hangs under the
      // source's else. Retrieved: in the OLD structure, the source hung
      // under the destination's else.
      const parked = underElseOf(next.shape, fromD, toD);
      const retrieved = underElseOf(prev.shape, toD, fromD);
      events.push({
        at, kind: "answer-moved", answer: k,
        from: decisionContext(memory, fromD) || fromD,
        to: decisionContext(memory, toD) || toD,
        ...(parked ? { parked: true } : {}),
        ...(retrieved ? { retrieved: true } : {}),
      });
    } else {
      events.push({ at, kind: "answer-removed", answer: k, from: decisionContext(memory, fromD) || fromD });
    }
  }
  added.forEach(([toD, k], idx) => {
    if (!usedAdd.has(idx)) events.push({ at, kind: "answer-added", answer: k, under: decisionContext(memory, toD) || toD });
  });

  return events;
}

const STATE_BANNER = "# Movement state. Written by the moves view — keep last.";

/** The document with fresh machine state, head byte-for-byte (the same
 *  contract as a memory's locks and a ranking's tags). */
export function writeMovesState(text: string, snapshot: Snapshot, events: MoveEvent[], keep: number): string {
  const lines = text.split("\n");
  const banner = lines.findIndex((l) => l.trim() === STATE_BANNER);
  const cut = banner >= 0 ? banner : lines.findIndex((l) => /^snapshot:/.test(l));
  const head = (cut < 0 ? lines : lines.slice(0, cut)).join("\n").replace(/\s*$/, "");
  const body = yaml.dump({ snapshot, events: events.slice(-keep) }, { lineWidth: 200, noRefs: true, flowLevel: 3 });
  return `${head}\n\n${STATE_BANNER}\n${body}`;
}
