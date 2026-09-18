/**
 * Turning a playbook into a plan.
 *
 * The playbook says what is true and what could happen. It does not say what to
 * do next, and it cannot: the answer depends on what you are optimising for,
 * which is the one thing that belongs to you rather than to the domain.
 *
 * So this is the other half. A policy ranks the CHOSEN events available in the
 * current assignment, the winner is taken, its `sets` move the assignment, and
 * the frontier is recomputed. One ranking pass would only ever tell you what is
 * next — incorporating makes six events exist that did not a moment ago, so a
 * sequence deep enough to draw has to be simulated forward, not sorted.
 *
 * Three things are deliberately NOT here:
 *
 * · Work. Steps live in the event's guide, authored once, with their own
 *   conditions and dependencies. A plan schedules them; it never invents them.
 * · Effort and negotiability. Facts about the work, so they are authored with
 *   it. A policy reads them.
 * · Imposed events. You have no say in them, so they are not ranked — they
 *   inject dated, usually unmovable work that everything else fits around.
 */
import { canArise, meets, ruleFor, variationOf, type PlaybookDoc, type PlaybookEvent } from "./playbookDoc";
import { stepsAt, type GuideDoc, type GuideStep } from "./guideDoc";
import { applyRefs } from "./decisionSpace";

/** What the ranker is being asked to prefer. Authored by you; this file only reads it. */
export interface PolicyParams {
  /** Weight on how many `gap` events an answer closes — buying down exposure. */
  closesGaps?: number;
  /** Weight on how many further events an answer makes available — optionality. */
  opens?: number;
  /** Weight on cheapness. Positive prefers small events first. */
  cheap?: number;
  /** Per-event thumb on the scale, by event key. The escape hatch for judgement
   *  a formula does not hold. */
  boost?: Record<string, number>;
  /** Events never to plan, whatever they score. */
  exclude?: string[];
  /**
   * `a` must be taken before `b`. Hand-written sequence, as a CONSTRAINT.
   *
   * Not the answer, deliberately: pinning three events leaves everything else to
   * be ranked around them, so a half-specified policy is usable rather than a
   * stub you have to finish before it runs.
   */
  before?: [string, string][];
  /** Working days available per day of calendar. 1 = one thing at a time. */
  capacity?: number;
}

export interface PlannedTask {
  /**
   * Stable across re-runs, so a downstream tracker can upsert rather than
   * duplicate. Occurrence is in the key or every recurring task doubles on the
   * second publish.
   */
  id: string;
  event: string;
  eventLabel: string;
  domain?: string;
  step: GuideStep;
  /** Which pass of a recurring event this belongs to. 0 for one-offs. */
  occurrence: number;
  /** Working days from the start of the plan. */
  start: number;
  end: number;
  /** Ids of tasks that must finish first. */
  after: string[];
  /** Past the deadline, so it did not make the cut. */
  dropped?: boolean;
}

export interface PlanStep {
  event: PlaybookEvent;
  score: number;
  /** Why it won, for the view that has to explain the order. */
  because: { closesGaps: number; opens: number; effort: number; boost: number };
  locksBefore: string[];
  locksAfter: string[];
}

export interface Plan {
  order: PlanStep[];
  tasks: PlannedTask[];
  /** The `many` events, and what they cost per day at their current rate. */
  load: OperationLoad[];
  /**
   * Share of capacity the operations already eat.
   *
   * Moves get whatever is left. Over 1 means the plan below is fiction: there
   * is no time to do any of it, which is the single most useful thing a plan
   * can tell you and the easiest to hide by only drawing the bars.
   */
  utilisation: number;
  /** Events left unplanned because nothing could be taken — usually every
   *  remaining event is imposed, or excluded. */
  unreachable: string[];
  /** Order rules that can never be satisfied, in words. */
  blocked: string[];
}

// `mo` before `m`, and `m` is MINUTES. Months are the rarer unit and minutes
// are what a procedure step is actually written in; the other way round turns
// "10m" of paperwork into ten months of it.
const DAY = /^(\d+(?:\.\d+)?)\s*(mo|min|sec|[smhdw])$/i;
const IN_DAYS: Record<string, number> = {
  // Seconds matter: an automated step really does cost ~nothing per item, and
  // rounding it to the unstated default would make every strategy look linear.
  s: 1 / 28800, sec: 1 / 28800,
  m: 1 / 480, min: 1 / 480, h: 1 / 8, d: 1, w: 5, mo: 21,
};

/** Effort as working days, on an 8-hour day. Unstated is half a day: small, not free. */
export function effortDays(effort?: string): number {
  if (!effort) return 0.5;
  const m = DAY.exec(effort.trim());
  if (!m) return 0.5;
  return parseFloat(m[1]) * IN_DAYS[m[2].toLowerCase()];
}

const RATE = /^(\d+(?:\.\d+)?)\s*(?:\/\s*(d|w|mo))?$/i;
const PER_DAY: Record<string, number> = { d: 1, w: 1 / 5, mo: 1 / 21 };

/** A firing rate as times per working day. Bare numbers are per day. */
export function ratePerDay(rate?: string): number {
  if (!rate) return 0;
  const m = RATE.exec(rate.trim());
  return m ? parseFloat(m[1]) * PER_DAY[(m[2] ?? "d").toLowerCase()] : 0;
}

/**
 * MOVES available here: chosen, once-only, not already taken.
 *
 * Operations are excluded on purpose. They never leave the frontier, so ranking
 * them would put the same event in the order forever — and they do not belong
 * in an order at all, they belong in the capacity budget.
 */
export function frontier(
  doc: PlaybookDoc, locks: string[], taken: Set<string>, policy: PolicyParams,
): PlaybookEvent[] {
  const excluded = new Set(policy.exclude ?? []);
  // Anything an order rule says must come first, and has not happened yet.
  const blocked = new Set((policy.before ?? [])
    .filter(([a]) => !taken.has(a))
    .map(([, b]) => b));
  return doc.events.filter((e) => {
    if (e.trigger !== "chosen" || (e.arity ?? "once") === "many") return false;
    if (taken.has(e.key) || excluded.has(e.key) || blocked.has(e.key)) return false;
    // An event that cannot arise here (`n/a` at version 1; a `when` that does not
    // hold at version 2) is out. A gap is still work — the work is finding out —
    // so gaps stay in.
    return canArise(doc, e, locks);
  });
}

/** How many events currently sitting at `gap` would stop being gaps. */
function gapsClosedBy(doc: PlaybookDoc, before: string[], after: string[]): number {
  const bad = (locks: string[]) => doc.events.filter((e) => {
    const r = ruleFor(doc, e.key, locks);
    return r?.status === "gap";
  }).length;
  return bad(before) - bad(after);
}

/** How many events become available that were not. */
function opensBy(doc: PlaybookDoc, before: string[], after: string[], taken: Set<string>): number {
  const n = (locks: string[]) => frontier(doc, locks, taken, {}).length;
  return n(after) - n(before);
}

export function scoreEvent(
  doc: PlaybookDoc, e: PlaybookEvent, locks: string[], taken: Set<string>,
  policy: PolicyParams, guides: Map<string, GuideDoc>,
): PlanStep {
  const rule = ruleFor(doc, e.key, locks);
  const after = rule?.sets?.length ? applyRefs(locks, rule.sets) : locks;
  const closesGaps = gapsClosedBy(doc, locks, after);
  const opens = opensBy(doc, locks, after, taken);
  const effort = tasksFor(doc, e, locks, guides, 0).reduce((t, x) => t + effortDays(x.effort), 0);
  const boost = policy.boost?.[e.key] ?? 0;

  const score = closesGaps * (policy.closesGaps ?? 1)
    + opens * (policy.opens ?? 1)
    // Cheapness, not cost: a bigger number is always better, so the ranker
    // never has to know which direction a term points.
    - effort * (policy.cheap ?? 0)
    + boost;

  return { event: e, score, because: { closesGaps, opens, effort, boost },
           locksBefore: locks, locksAfter: after };
}

/** The steps an event contributes here, from its guide. Never invented. */
export function tasksFor(
  doc: PlaybookDoc, e: PlaybookEvent, locks: string[],
  guides: Map<string, GuideDoc>, _occurrence: number,
): GuideStep[] {
  const out: GuideStep[] = [];
  for (const c of e.content ?? []) {
    const { file, missing } = variationOf(c, locks);
    if (missing.length) continue;
    const g = guides.get(file);
    if (g) out.push(...stepsAt(g, locks, []));
  }
  return out;
}

export interface OperationLoad {
  event: PlaybookEvent;
  /** Firings per working day. */
  rate: number;
  /** Working days of work per firing, under the current answers. */
  perRun: number;
  /** Working days of work per working day. Over capacity means underwater. */
  perDay: number;
  /** The rate at which this operation alone consumes the whole budget. */
  saturatesAt: number;
  steps: GuideStep[];
}

/**
 * What the `many` events cost, at their current rate.
 *
 * This is the scalability question in one line: `perRun` comes from the guide
 * steps that the CURRENT ANSWERS select, so moderating by hand and moderating
 * by tool are the same event with different per-item costs, and the rate is the
 * knob. Turn it up until `perDay` exceeds capacity and you have found where the
 * approach stops working — which is a fact about the answer, not the volume.
 */
export function operations(
  doc: PlaybookDoc, locks: string[], guides: Map<string, GuideDoc>,
  policy: PolicyParams = {},
): OperationLoad[] {
  const capacity = Math.max(0.1, policy.capacity ?? 1);
  const excluded = new Set(policy.exclude ?? []);
  return doc.events
    .filter((e) => (e.arity ?? "once") === "many" && !excluded.has(e.key))
    .filter((e) => canArise(doc, e, locks))
    .map((e) => {
      const steps = tasksFor(doc, e, locks, guides, 0);
      const perRun = steps.reduce((t, x) => t + effortDays(x.effort), 0);
      const rate = ratePerDay(e.rate);
      return {
        event: e, rate, perRun, perDay: rate * perRun, steps,
        // Infinite when a firing costs nothing: no volume breaks free work.
        saturatesAt: perRun > 0 ? capacity / perRun : Infinity,
      };
    });
}

/**
 * How many times a recurring event fires inside the horizon.
 *
 * One occurrence is materialised per firing, and no more: a kanban wants the
 * next one, a gantt wants the ones inside its window, and nobody wants forty
 * annual returns.
 */
function occurrences(everyMonths: number | undefined, from: number, horizon: number): number[] {
  if (!everyMonths || everyMonths <= 0) return [0];
  const step = everyMonths * 21;
  const out: number[] = [];
  for (let at = from, i = 0; at < horizon && i < 200; at += step, i++) out.push(at);
  return out.length ? out : [from];
}

/**
 * Simulate forward, emitting scheduled work.
 *
 * `horizon` is in working days and does two jobs: it stops the simulation, and
 * it is the deadline. Work that lands past it is kept and marked `dropped`
 * rather than deleted — what did not fit is the most interesting output, and a
 * plan that silently omits it reads as though everything fits.
 */
export function plan(
  doc: PlaybookDoc,
  opts: {
    locks: string[];
    guides: Map<string, GuideDoc>;
    policy?: PolicyParams;
    horizon?: number;
  },
): Plan {
  const policy = opts.policy ?? {};
  const horizon = opts.horizon ?? 250;
  const capacity = Math.max(0.1, policy.capacity ?? 1);

  let locks = opts.locks;
  const taken = new Set<string>();
  const order: PlanStep[] = [];
  const tasks: PlannedTask[] = [];
  // When each event finished, so a recurrence anchored to it can be dated.
  const finishedAt = new Map<string, number>();
  let clock = 0;

  for (let pass = 0; pass < doc.events.length + 1; pass++) {
    const live = frontier(doc, locks, taken, policy);
    if (!live.length) break;

    const scored = live.map((e) => scoreEvent(doc, e, locks, taken, policy, opts.guides));
    // Stable: ties keep document order, so an unweighted policy reads as the
    // book was written rather than in whatever order the sort happened to land.
    scored.sort((a, b) => b.score - a.score
      || doc.events.indexOf(a.event) - doc.events.indexOf(b.event));
    const win = scored[0];

    const rule = ruleFor(doc, win.event.key, locks);
    const anchor = rule?.from ? finishedAt.get(rule.from) ?? clock : clock;
    const firstAt = anchor + (rule?.offset ?? 0);

    for (const occ of occurrences(rule?.every, firstAt, horizon).entries()) {
      const [i, at] = occ;
      let cursor = Math.max(at, clock);
      const steps = tasksFor(doc, win.event, locks, opts.guides, i);
      const idOf = (k: string) => `${win.event.key}:${k}:${i}`;
      for (const st of steps) {
        const days = effortDays(st.effort) / capacity;
        // Dependencies inside one event serialise; everything else may weave,
        // which is what keeps a two-week filing wait from blocking the calendar.
        const deps = (st.after ?? []).map(idOf).filter((d) => tasks.some((t) => t.id === d));
        const readyAt = deps.reduce(
          (m, d) => Math.max(m, tasks.find((t) => t.id === d)!.end), cursor);
        const start = readyAt;
        const end = start + days;
        tasks.push({
          id: idOf(st.key), event: win.event.key, eventLabel: win.event.label,
          ...(win.event.domain ? { domain: win.event.domain } : {}),
          step: st, occurrence: i, start, end, after: deps,
          ...(start >= horizon ? { dropped: true } : {}),
        });
        cursor = Math.max(cursor, end);
      }
      if (i === 0) clock = cursor;
    }

    finishedAt.set(win.event.key, clock);
    taken.add(win.event.key);
    locks = win.locksAfter;
    order.push(win);
  }

  // An order rule naming an event that is excluded, imposed, or simply absent
  // would block its successor for good. Report it rather than quietly ending the
  // plan early — a short plan and a broken constraint look identical otherwise.
  const known = new Set(doc.events.map((e) => e.key));
  const stuck = (policy.before ?? [])
    .filter(([a, b]) => known.has(b) && !taken.has(a) && !taken.has(b))
    .map(([a, b]) => `${b} waits on ${known.has(a) ? a : `${a} (no such event)`}`);

  const load = operations(doc, locks, opts.guides, policy);
  const planned = new Set(order.map((o) => o.event.key));
  return {
    order,
    tasks,
    load,
    utilisation: load.reduce((t, x) => t + x.perDay, 0) / capacity,
    blocked: stuck,
    unreachable: doc.events
      .filter((e) => e.trigger === "chosen" && (e.arity ?? "once") !== "many"
        && !planned.has(e.key))
      .map((e) => e.key),
  };
}
