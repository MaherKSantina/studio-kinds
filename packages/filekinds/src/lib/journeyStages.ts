/**
 * JOURNEY STAGES — the whole flow as VERTICAL stages of HORIZONTAL lanes,
 * no DAG canvas. The one/many action lives on the BOUNDARY between stages:
 *
 *   lanes    — parallel strands side by side (eight site scrapes)
 *   collate  — many strands above funnel into ONE here (⇒). The stage names
 *              the pooled artifact; its steps operate on the merged whole.
 *   fanout   — one pool above explodes into PER-ITEM columns here (⇉).
 *              Items come LIVE from a list, a policy run's ranks, or a
 *              group-by over a field — never hand-listed children.
 *
 * Inside a fanout stage, steps come in two kinds. SPINE steps are declared
 * once on the stage and span every column — the streamlined common process.
 * ITEM steps live in one column only — the exploratory divergence. The
 * journey of a process is the migration of steps from columns to spine.
 *
 * A stage can also BE another journey (`journey:` portal) — split a journey
 * by moving stage blocks out and leaving the portal band behind. And a
 * stage can carry `calendar:` — the final collate rendered as a month grid
 * over task lists' start/end fields.
 *
 * A journey can EMBED another: a stages-list entry `- embed: <journey>`
 * splices that journey's stages inline BY REFERENCE — never copied —
 * each marked with its owner; a LANE with `embed:` compresses the same
 * journey into one content column instead. The common section lives in
 * its own file and every journey that embeds it derives from the same
 * living data (`at:` optionally cuts the prefix through that stage key).
 *
 * Parsing is lenient; the pure helpers here are the view's only logic.
 */
import yaml from "js-yaml";

export type JState = "done" | "next" | "pending";

export interface JLane {
  label: string;
  /** Ref of the process/definition this lane runs. */
  process?: string;
  /** Ref of the artifact the lane produces (a site's leads list). */
  out?: string;
  status?: JState;
  /** true = show the artifact's CONTENT inside the lane column (list rows).
   *  Policy outs always flow their structure; lists only when asked. */
  flow?: boolean;
  /** EMBED-AS-A-COLUMN: a journey this lane compresses — its stages listed
   *  compactly, by reference, the band opening the journey itself. The
   *  full-size alternative is a stages-list `- embed:` entry. */
  embed?: string;
  /** Stage KEY in the embedded journey the splice runs through, inclusive
   *  (omitted = all of it). */
  at?: string;
  /** DECISION ANSWERS column: a policy RUN whose chain is evaluated live
   *  for ONE row — the lane shows every visible dimension's answer (and
   *  the rank it lands), never a copy of derived data. */
  answers?: string;
  /** The row label the answers are derived for (with `answers:`). */
  item?: string;
}

export interface JStep {
  key: string;
  label: string;
  /** Ref opened on click — a run, a list, a document. */
  file?: string;
  hint?: string;
  /** The MINI JOURNEY that produced this operation: the one-off exploration
   *  (aggregate, analyze, draft) compressed behind the link once its output
   *  — the policy, the transform — existed. Opens from the link's dialog;
   *  its output file is live, so editing it updates the main journey. */
  journey?: string;
  /** false = do NOT flow this step's content under the cell — the cell
   *  stands alone and everything lives behind its click. */
  flow?: boolean;
}

export interface JItemStep {
  label: string;
  /** Spine step key this inserts AFTER (omitted = before the first). */
  after?: string;
  file?: string;
  status?: JState;
}

export interface JItemOverride {
  /** The divergence: steps only this item has. */
  steps: JItemStep[];
  /** Spine progress: spine step key → state. Unset = pending. */
  status: Record<string, JState>;
  /** THE ANSWER per shared step: spine step key → ref of the artifact this
   *  item produced there. The band cell shows the result CARD — the actual
   *  ticket — never a status word; no result = the cell stays empty. A
   *  result also means done wherever state is asked (kanban, attention). */
  results: Record<string, string>;
  /** Optional instance document backing this item. */
  instance?: string;
}

export interface JFanout {
  /** The pool being fanned out (a `.list`, possibly collated). */
  list?: string;
  /** A run whose ranking selects and orders the items. */
  run?: string;
  /** 1-based rank positions to include (with `run`). */
  ranks?: number[];
  /** Group-by fan: one column per distinct value of this field. */
  by?: string;
  /** Cap the columns. */
  take?: number;
  /** The mini journey that produced this fan — see JStep.journey. */
  journey?: string;
}

export interface JStage {
  key: string;
  label: string;
  detail?: string;
  lanes?: JLane[];
  /** A 2-D arrangement of lane cells: rows of columns, columns aligned
   *  across rows (all cells one fixed width). An empty cell (`{}`) is a
   *  spacer — `label: ""` — so position carries meaning: what sits BESIDE
   *  a thing gets matched against it, what sits BELOW derives from it. */
  grid?: JLane[][];
  /** Fan-in: ref of the pooled artifact this stage collates into. */
  collate?: string;
  fanout?: JFanout;
  /** The spine (fanout stages) or the stage's own steps (single lane). */
  steps: JStep[];
  items: Record<string, JItemOverride>;
  /** Portal: this stage IS another journey. */
  journey?: string;
  /** Month-grid rendering over task lists (rows need start/end fields). */
  calendar?: { sources: string[] };
  /** EMBED placeholder: this entry stands for another journey's stages,
   *  spliced in place by the view. `at` optionally cuts the prefix. */
  embed?: string;
  at?: string;
  /** Set on stages spliced in from an embedded journey: where they live.
   *  Never parsed from YAML — the owner keeps them; this journey only looks. */
  sharedFrom?: { journey: string; title: string };
}

export interface JourneyStagesDoc {
  title: string;
  description?: string;
  stages: JStage[];
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const state = (x: unknown): JState | undefined =>
  x === "done" || x === "next" || x === "pending" ? x : undefined;

/** null when the text has no `stages:` — the caller falls back to the
 *  legacy journey (a bare list of board refs). */
export function parseJourneyStages(text: string): JourneyStagesDoc | null {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { return null; }
  if (!Array.isArray(raw.stages)) return null;
  const stages: JStage[] = arr(raw.stages).map(rec).flatMap((s, i) => {
    const emb = str(s.embed);
    if (emb) {
      // An EMBED entry: a placeholder the view replaces with the embedded
      // journey's stages. Its label only shows if resolution fails.
      const stem = emb.split("/").pop()!.replace(/\.[^.]+$/, "");
      const placeholder: JStage = {
        key: str(s.key) ?? `embed-${i}`, label: stem, embed: emb,
        ...(str(s.at) ? { at: str(s.at)! } : {}),
        steps: [], items: {},
      };
      return [placeholder];
    }
    const key = str(s.key) ?? `stage-${i}`;
    const laneOf = (l: Record<string, unknown>): JLane | null => {
      const label = str(l.label);
      return label ? {
        label,
        ...(str(l.process) ? { process: str(l.process)! } : {}),
        ...(str(l.out) ? { out: str(l.out)! } : {}),
        ...(state(l.status) ? { status: state(l.status)! } : {}),
        ...(l.flow === true ? { flow: true } : {}),
        ...(str(l.embed) ? { embed: str(l.embed)! } : {}),
        ...(str(l.at) ? { at: str(l.at)! } : {}),
        ...(str(l.answers) ? { answers: str(l.answers)! } : {}),
        ...(str(l.item) ? { item: str(l.item)! } : {}),
      } : null;
    };
    const lanes = arr(s.lanes).map(rec).flatMap((l) => {
      const x = laneOf(l);
      return x ? [x] : [];
    });
    // Grid cells keep their POSITION: a label-less cell stays as a spacer.
    const grid = Array.isArray(s.grid)
      ? arr(s.grid).map((row) => arr(row).map(rec).map((c) => laneOf(c) ?? { label: "" }))
      : undefined;
    const steps = arr(s.steps).map(rec).flatMap((t, j) => {
      const label = str(t.label);
      return label ? [{
        key: str(t.key) ?? `s${j}`,
        label,
        ...(str(t.file) ? { file: str(t.file)! } : {}),
        ...(str(t.hint) ? { hint: str(t.hint)! } : {}),
        ...(str(t.journey) ? { journey: str(t.journey)! } : {}),
        ...(t.flow === false ? { flow: false } : {}),
      }] : [];
    });
    const items: Record<string, JItemOverride> = {};
    for (const [label, v] of Object.entries(rec(s.items))) {
      const o = rec(v);
      items[label] = {
        steps: arr(o.steps).map(rec).flatMap((t) => {
          const lb = str(t.label);
          return lb ? [{
            label: lb,
            ...(str(t.after) ? { after: str(t.after)! } : {}),
            ...(str(t.file) ? { file: str(t.file)! } : {}),
            ...(state(t.status) ? { status: state(t.status)! } : {}),
          }] : [];
        }),
        status: Object.fromEntries(
          Object.entries(rec(o.status)).flatMap(([k, sv]) => {
            const st = state(sv);
            return st ? [[k, st]] : [];
          })),
        results: Object.fromEntries(
          Object.entries(rec(o.results)).flatMap(([k, rv]) => {
            const ref = str(rv);
            return ref ? [[k, ref]] : [];
          })),
        ...(str(o.instance) ? { instance: str(o.instance)! } : {}),
      };
    }
    const f = rec(s.fanout);
    const fanout: JFanout | undefined = s.fanout ? {
      ...(str(f.list) ? { list: str(f.list)! } : {}),
      ...(str(f.run) ? { run: str(f.run)! } : {}),
      ...(Array.isArray(f.ranks) ? { ranks: arr(f.ranks).map(Number).filter(Number.isFinite) } : {}),
      ...(str(f.by) ? { by: str(f.by)! } : {}),
      ...(typeof f.take === "number" ? { take: f.take } : {}),
      ...(str(f.journey) ? { journey: str(f.journey)! } : {}),
    } : undefined;
    const cal = rec(s.calendar);
    return [{
      key, label: str(s.label) ?? key,
      ...(str(s.detail) ? { detail: str(s.detail)! } : {}),
      ...(lanes.length ? { lanes } : {}),
      ...(grid && grid.length ? { grid } : {}),
      ...(str(s.collate) ? { collate: str(s.collate)! } : {}),
      ...(fanout ? { fanout } : {}),
      steps, items,
      ...(str(s.journey) ? { journey: str(s.journey)! } : {}),
      ...(s.calendar ? { calendar: { sources: arr(cal.sources).map(str).filter(Boolean) as string[] } } : {}),
    }];
  });
  return {
    title: str(raw.title) ?? "Journey",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    stages,
  };
}

/**
 * An embedded journey's stages as seen from the embedder: up to and
 * including key `at` (unknown/omitted key = all of them), each marked
 * `sharedFrom` and key-prefixed so the embedder's own stage keys can't
 * collide. References all the way down — the stages still point at the
 * embedded journey's files, so every embedder derives from the same
 * living data.
 */
export function embedStages(source: JourneyStagesDoc, journeyAbs: string, at?: string): JStage[] {
  const cut = at
    ? source.stages.findIndex((s) => s.key === at || s.key === `shared:${at}`)
    : -1;
  const taken = cut >= 0 ? source.stages.slice(0, cut + 1) : source.stages.slice();
  return taken.map((s) => ({
    ...s,
    key: s.key.startsWith("shared:") ? s.key : `shared:${s.key}`,
    // A stage the source itself embedded keeps its ORIGINAL owner —
    // embedding never launders provenance.
    sharedFrom: s.sharedFrom ?? { journey: journeyAbs, title: source.title },
  }));
}

/* ── variants: one file, several journeys, pills to flip ───────────────── */

export interface JourneyVariant {
  label: string;
  /** Ref of the variant's journey file. */
  journey: string;
}

export interface JourneyVariantsDoc {
  title: string;
  description?: string;
  variants: JourneyVariant[];
}

/** An A/B file: `variants:` names sibling journeys that answer the same
 *  question differently; the view renders pills and flips whole journeys.
 *  Null when the text has no usable `variants:` list. */
export function parseJourneyVariants(text: string): JourneyVariantsDoc | null {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { return null; }
  if (!Array.isArray(raw.variants)) return null;
  const variants = arr(raw.variants).map(rec).flatMap((v) => {
    const journey = str(v.journey);
    return journey ? [{
      label: str(v.label) ?? journey.split("/").pop()!.replace(/\.[^.]+$/, ""),
      journey,
    }] : [];
  });
  if (!variants.length) return null;
  return {
    title: str(raw.title) ?? "Variants",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    variants,
  };
}

/** What the boundary ABOVE stage i says: how this stage consumes the last. */
export function boundaryOf(stage: JStage): "collate" | "fanout" | "carry" {
  if (stage.collate) return "collate";
  if (stage.fanout) return "fanout";
  return "carry";
}

/* ── the fanout grid: spine bands and divergence zones ─────────────────── */

/** One rendered row of a fanout stage: a spine band spanning all columns,
 *  or a divergence zone where each column stacks its own steps. */
export type FanRow =
  | { kind: "spine"; step: JStep }
  | { kind: "zone"; after: string | null; perItem: Record<string, JItemStep[]> };

/**
 * Interleave the spine with the items' divergent steps. Zones are keyed by
 * the spine step they follow (`after`); steps with no anchor lead the grid.
 * A zone only exists where at least one item diverges.
 */
export function fanRows(stage: JStage, itemLabels: string[]): FanRow[] {
  const zone = (after: string | null): FanRow | null => {
    const perItem: Record<string, JItemStep[]> = {};
    let any = false;
    for (const label of itemLabels) {
      const mine = (stage.items[label]?.steps ?? []).filter((t) => (t.after ?? null) === after);
      if (mine.length) { perItem[label] = mine; any = true; }
    }
    return any ? { kind: "zone", after, perItem } : null;
  };
  const rows: FanRow[] = [];
  const lead = zone(null);
  if (lead) rows.push(lead);
  for (const step of stage.steps) {
    rows.push({ kind: "spine", step });
    const z = zone(step.key);
    if (z) rows.push(z);
  }
  return rows;
}

/** An item's state on a spine step. A RESULT is the strongest signal —
 *  the artifact exists, so the step is done regardless of any status word;
 *  otherwise the explicit status, and unset means pending. */
export const spineState = (stage: JStage, item: string, stepKey: string): JState => {
  const o = stage.items[item];
  if (o?.results[stepKey]) return "done";
  return o?.status[stepKey] ?? "pending";
};

/** The kanban column an item sits in: its first not-done spine step
 *  (null = past the end — done with the stage). */
export function kanbanColumn(stage: JStage, item: string): string | null {
  for (const s of stage.steps) {
    if (spineState(stage, item, s.key) !== "done") return s.key;
  }
  return null;
}

/** How many things in a stage are flagged `next` — the attention count. */
export function attentionCount(stage: JStage, itemLabels: string[]): number {
  let n = [...(stage.lanes ?? []), ...(stage.grid ?? []).flat()]
    .filter((l) => l.status === "next").length;
  for (const label of itemLabels) {
    const o = stage.items[label];
    if (!o) continue;
    n += Object.values(o.status).filter((s) => s === "next").length;
    n += o.steps.filter((t) => t.status === "next").length;
  }
  return n;
}

/** Contiguous runs of equal group labels — the column-group headers of a
 *  fanout whose items came from several buckets. Columns arrive in rank
 *  order, so a bucket is always one contiguous span. */
export function columnGroups(groups: (string | undefined)[]): { label: string; span: number }[] {
  const out: { label: string; span: number }[] = [];
  for (const g of groups) {
    const label = g ?? "";
    if (out.length && out[out.length - 1].label === label) out[out.length - 1].span++;
    else out.push({ label, span: 1 });
  }
  return out;
}

/* ── boundary operations, explained ────────────────────────────────────── */

export interface CollateFacts {
  dedupeBy?: string;
  sources: { list: string; label?: string }[];
}

/** What a collated list says about itself — the deterministic operation's
 *  own description: which sources pool in, and the dedupe key. */
export function collateFactsOf(text: string): CollateFacts {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* not yaml — no facts */ }
  return {
    ...(str(raw.dedupeBy) ? { dedupeBy: str(raw.dedupeBy)! } : {}),
    sources: arr(raw.sources).map(rec).flatMap((s) => {
      const list = str(s.list);
      return list ? [{ list, ...(str(s.label) ? { label: str(s.label)! } : {}) }] : [];
    }),
  };
}

/** Does a collate target look like a file the dialog can open and count? */
export const isRefLike = (s: string): boolean => /\.[a-z0-9]+$/i.test(s.trim());

/* ── the calendar stage: a month grid over task rows ───────────────────── */

export interface CalTask {
  label: string;
  /** ISO dates, inclusive. */
  start: string;
  end: string;
  /** The grouping the task came from (its gap context / source list). */
  group: string;
}

/** Rows → tasks; rows without a parseable start date are dropped (counted
 *  by the caller if it cares). */
export function tasksOfRows(
  rows: { label?: string; fields?: Record<string, string> }[], group: string,
): CalTask[] {
  return rows.flatMap((r) => {
    const start = r.fields?.start?.trim();
    if (!start || Number.isNaN(Date.parse(start))) return [];
    const end = r.fields?.end?.trim();
    return [{
      label: r.label ?? "(task)",
      start,
      end: end && !Number.isNaN(Date.parse(end)) ? end : start,
      group,
    }];
  });
}

export interface CalWeekCell { iso: string; day: number; inMonth: boolean; tasks: CalTask[] }

/** The weeks of the month containing most tasks (or of `anchor`), Monday
 *  first, each cell carrying the tasks whose [start,end] cover it. */
export function monthGrid(tasks: CalTask[], anchor?: string): { title: string; weeks: CalWeekCell[][] } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const pick = anchor ?? (tasks.length
    ? [...tasks.map((t) => t.start)].sort()[Math.floor(tasks.length / 2)]
    : iso(new Date()));
  const first = new Date(pick.slice(0, 8) + "01T00:00:00Z");
  const month = first.getUTCMonth();
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7)); // back to Monday
  const weeks: CalWeekCell[][] = [];
  const cur = new Date(start);
  do {
    const week: CalWeekCell[] = [];
    for (let i = 0; i < 7; i++) {
      const day = iso(cur);
      week.push({
        iso: day, day: cur.getUTCDate(), inMonth: cur.getUTCMonth() === month,
        tasks: tasks.filter((t) => t.start <= day && day <= t.end),
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    weeks.push(week);
  } while (cur.getUTCMonth() === month);
  return {
    title: first.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }),
    weeks,
  };
}

/**
 * VERSION PINNING (text surgery). A journey ref PINS a versioned file by
 * pointing at one concrete version inside its folder
 * (`out: context.md/01 initial.md`); the bare folder ref is UNPINNED (reads
 * as latest). Pinning and updating rewrite the ref IN THE RAW TEXT — the
 * YAML is hand-authored, so the edit must be surgical: only the ref token
 * after an `out:` / `file:` key changes, comments and formatting survive.
 */
export function rewriteRef(raw: string, from: string, to: string): string {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`((?:out|file):\\s*)(['"]?)${esc}\\2(?=\\s*(?:[,}\\]]|$))`, "gm");
  return raw.replace(re, (_m, pre: string, q: string) => `${pre}${q}${to}${q}`);
}

/** The written ref for "this ref, pinned to `version`": an unpinned ref
 *  gains the version segment, a pinned one swaps it. */
export function pinnedRefFor(ref: string, version: string, wasPinned: boolean): string {
  const folder = wasPinned ? ref.slice(0, ref.lastIndexOf("/")) : ref;
  return `${folder}/${version}`;
}
