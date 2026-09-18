/**
 * The COMPOSITE node type — one entity assembled from STREAMS, split by who
 * authors each stream's changes. The trail behind it (Abstraction project,
 * points 16/17/22): content accretes as diffs from different processes at
 * different times, and the DRIVER of each stream decides its staleness
 * semantics:
 *
 *   observed — the world holds the pen (a scrape/sync). Ages against the
 *              stream's declared cadence; never hand-edited.
 *   derived  — my rules hold the pen (a policy run). Stales when its INPUT
 *              stream moves (or the rules change), never by clock.
 *   authored — my process holds the pen (moves I made). The primary record:
 *              cannot go stale, there is nothing external to drift from.
 *
 * On the fs this is an ordinary structured node: `schema.schema` with
 * `type: composite` and `streams:` (stable-id entries carrying driver/source/
 * via/of/cadence), plus a `content.list` whose rows are ARRIVALS — each row
 * one diff, tagged `stream: <id>` and `at: <date>`, payload in its remaining
 * fields. The composed view folds rows per stream (later rows win) and judges
 * freshness with the `stream-status` golden table below.
 */
import { DecisionTable, Decision, decide } from "crosscut";
import type { DocListItem } from "./listDoc";
import { SchemaDoc, SchemaEntry, contentByEntry } from "./schemaDoc";

/* ── Cadence ─────────────────────────────────────────────────────────────── */

/** "daily" | "weekly" | "monthly" | "<n>d" | "<n>" → days; anything else null. */
export function cadenceDays(cadence: string | undefined): number | null {
  if (!cadence) return null;
  const c = cadence.trim().toLowerCase();
  if (c === "daily") return 1;
  if (c === "weekly") return 7;
  if (c === "monthly") return 30;
  const m = /^(\d+)\s*d(?:ays?)?$/.exec(c) ?? /^(\d+)$/.exec(c);
  return m ? Number(m[1]) : null;
}

/* ── Fold ────────────────────────────────────────────────────────────────── */

/** Row keys that are ABOUT the arrival, not part of the entity's picture. */
const META_KEYS = new Set(["at", "of", "rules"]);

export interface CompositeStream {
  entry: SchemaEntry;
  /** This stream's arrivals, file order — the diff history. */
  rows: DocListItem[];
  /** The folded picture: every payload field, later arrivals winning. */
  current: Record<string, string>;
  /** The newest `at:` across the arrivals (ISO date), null when none carry one. */
  lastAt: string | null;
  /** Whole days between lastAt and `now`; null without a lastAt. */
  ageDays: number | null;
  status: Decision<StreamStatusVerdict>;
}

const DAY = 86_400_000;
const dateMs = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** The composed read of a composite node: schema streams folded from content
 *  arrivals, each judged by the `stream-status` table. `now` is an ISO date so
 *  callers (and golden tests) stay in charge of the clock. */
export function compositeStreams(
  schema: SchemaDoc,
  rows: DocListItem[],
  now: string,
): { streams: CompositeStream[]; unfiled: DocListItem[] } {
  const { groups, unfiled } = contentByEntry(schema, rows);
  const nowMs = dateMs(now);

  // First pass — fold and stamp, so derived streams can compare against input.
  const folded = groups.map(({ entry, items }) => {
    const current: Record<string, string> = {};
    let lastMs: number | null = null;
    let lastAt: string | null = null;
    for (const it of items) {
      for (const [k, v] of Object.entries(it.fields ?? {})) {
        if (k === schema.field || META_KEYS.has(k)) continue;
        current[k] = v; // later arrivals win
      }
      const at = it.fields?.at;
      const ms = dateMs(at);
      if (ms !== null && (lastMs === null || ms >= lastMs)) { lastMs = ms; lastAt = at!; }
    }
    const ageDays = lastMs !== null && nowMs !== null ? Math.floor((nowMs - lastMs) / DAY) : null;
    return { entry, rows: items, current, lastAt, lastMs, ageDays };
  });

  const lastMsOf = new Map(folded.map((s) => [s.entry.id, s.lastMs]));
  const streams = folded.map(({ lastMs, ...s }) => {
    const cadence = cadenceDays(s.entry.cadence);
    const inputMs = s.entry.of ? lastMsOf.get(s.entry.of) ?? null : null;
    const ctx: StreamStatusCtx = {
      driver: driverOf(s.entry),
      hasRows: s.rows.length > 0,
      withinCadence: cadence !== null && s.ageDays !== null ? s.ageDays <= cadence : null,
      withinTwoCadences: cadence !== null && s.ageDays !== null ? s.ageDays <= 2 * cadence : null,
      inputMoved: inputMs !== null && lastMs !== null ? inputMs > lastMs : null,
    };
    return { ...s, status: decide(streamStatusRules, ctx) };
  });
  return { streams, unfiled };
}

/* ── Status — the golden table ───────────────────────────────────────────── */

export type Driver = "observed" | "derived" | "authored" | "";

export const driverOf = (e: SchemaEntry): Driver => {
  const d = (e.driver ?? "").trim().toLowerCase();
  return d === "observed" || d === "derived" || d === "authored" ? d : "";
};

export interface StreamStatusCtx {
  driver: Driver;
  hasRows: boolean;
  /** Observed: last arrival within one declared cadence? null = no cadence or no dated arrival. */
  withinCadence: boolean | null;
  withinTwoCadences: boolean | null;
  /** Derived: has the `of:` input stream arrived NEWER than this stream? null = nothing to compare. */
  inputMoved: boolean | null;
}

export interface StreamStatusVerdict {
  status: string;
  tone: "ok" | "warn" | "bad" | "quiet";
}

export const streamStatusRules: DecisionTable<StreamStatusCtx, StreamStatusVerdict> = {
  name: "stream-status",
  answers: "How fresh is one stream of a composite node, judged by WHO authors its changes?",
  rules: [
    {
      rule: "empty",
      because: "Nothing has arrived on this stream yet — there is no freshness to judge.",
      when: { hasRows: false },
      then: { status: "empty", tone: "quiet" },
    },
    {
      rule: "authored-current",
      because: "Process-authored rows ARE the primary record — nothing external exists for them to drift from; their integrity is the event history, not a clock.",
      when: { driver: "authored" },
      then: { status: "current", tone: "ok" },
    },
    {
      rule: "derived-input-moved",
      because: "The input stream has newer arrivals than this derivation — the rules must be re-run over what changed.",
      when: { driver: "derived", inputMoved: true },
      then: { status: "input moved", tone: "bad" },
    },
    {
      rule: "derived-fresh",
      because: "A derivation is fresh while its input hasn't moved — it stales by input change or rules change, never by clock.",
      when: { driver: "derived" },
      then: { status: "fresh", tone: "ok" },
    },
    {
      rule: "observed-untimed",
      because: "Observed with no declared cadence (or no dated arrivals) — age is visible but there is nothing to judge it against; declare `cadence:` on the stream.",
      when: { driver: "observed", withinCadence: null },
      then: { status: "untimed", tone: "warn" },
    },
    {
      rule: "observed-fresh",
      because: "The world was re-read within one cadence — the copy is as current as its schedule promises.",
      when: { driver: "observed", withinCadence: true },
      then: { status: "fresh", tone: "ok" },
    },
    {
      rule: "observed-aging",
      because: "At least one sync was missed — the world may have moved since this copy.",
      when: { driver: "observed", withinTwoCadences: true },
      then: { status: "aging", tone: "warn" },
    },
    {
      rule: "observed-stale",
      because: "More than two cadences without a re-read — treat the copy as historical, not current.",
      when: { driver: "observed" },
      then: { status: "stale", tone: "bad" },
    },
  ],
  // Undeclared driver: staleness has no semantics until the schema says who
  // holds the pen.
  otherwise: { status: "untracked", tone: "quiet" },
};

/* ── Slices as flat fields ───────────────────────────────────────────────── */

/**
 * A composite node's streams flattened into clause-ready fields, so lenses
 * over the store (a memory document) can select and group on SLICE data
 * alongside a node's intrinsic facts: `<stream>.<field>` per current value,
 * plus the underscore-prefixed verdict meta — `<stream>._status` (the
 * stream-status outcome) and `<stream>._age_days`. The prefix keeps meta
 * from ever colliding with a stream's own field (the `status` stream carries
 * a `status` field, and both must survive).
 */
export function flattenStreamFields(streams: CompositeStream[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of streams) {
    for (const [k, v] of Object.entries(s.current)) out[`${s.entry.id}.${k}`] = v;
    out[`${s.entry.id}._status`] = s.status.outcome.status;
    if (s.ageDays !== null) out[`${s.entry.id}._age_days`] = String(s.ageDays);
  }
  return out;
}
