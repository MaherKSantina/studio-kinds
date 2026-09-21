/**
 * The `.kanban` file kind: a task board whose COLUMNS are status and whose
 * ROWS are DERIVED dependency groups — never authored. Each task may name
 * prerequisites (`needs:`); the board layers tasks by longest prerequisite
 * chain: row one is everything that needs nothing, row two what builds on
 * row one, and so on. A board with no dependencies is one row — the plain
 * kanban it degenerates to.
 *
 * Authoring shape (YAML, lenient — a half-written file still renders):
 *
 *   title, description?
 *   due: 2026-09-09                       # the day everything must be done by —
 *                                         # the anchor backward scheduling chains from
 *   source: Sep 9 tasks                   # OPTIONAL: where the tasks COME FROM. A
 *                                         # folder ref means composite `.node`s — one
 *                                         # node per task, its STREAMS the task's
 *                                         # domains (identity carries title/description,
 *                                         # a status stream's latest arrival carries the
 *                                         # column), folded current-picture first. A
 *                                         # `.points` ref sources a points stream the
 *                                         # same way. The board then authors only its
 *                                         # OWN domains (needs, duration, file/section)
 *                                         # and merges them onto the sourced tasks by key.
 *   columns: [To do, Doing, Done]         # strings or {title, color?}
 *   tasks:
 *     - key: print-badges                 # stable key `needs:` edges point at
 *       title: Print the badge sheets
 *       status: Done                      # a column TITLE; unset/unknown = first column
 *       file: Sep 9 EDMinis badges.pdf    # ref resolved against the board's folder,
 *                                         # opened in the card dialog by its own kind
 *       section: Round 1                  # for a `.brief` file: open just the first
 *                                         # section whose title contains this (case-
 *                                         # insensitive), not the whole document
 *       note: one line under the title
 *       body: |                           # the task's OWN authored markdown —
 *         - what doing this actually means # the dialog's main content, with the
 *         - in this task's own words       # file/section slice below as provenance
 *       needs: [other-key, …]             # prerequisites (keys)
 *       duration: 2                       # calendar days this task takes (default 1)
 *       due: 2026-09-08                   # per-task cap, tighter than the board's
 *
 * Rows are computed, not stored, because dependency depth is a FACT about
 * the edges — authoring it separately would let the two drift. Unknown and
 * self `needs` keys are ignored; tasks caught in a cycle can't be layered
 * honestly, so they land together in one final row rather than vanishing.
 *
 * Scheduling follows the same principle: dates are DERIVED, not authored.
 * `scheduleTasks` chains backward from the due date — a task ends the day
 * before its earliest dependent starts (or at its own cap), and starts
 * `duration` days earlier — so the calendar is always exactly what the
 * edges and durations imply, never a copy that can drift. Days are CALENDAR
 * days: a `duration: 5` ending on a Friday starts on the Monday, and a
 * weekend inside a task is simply part of it; there is no holiday calendar.
 * Dates are `YYYY-MM-DD`, bare or quoted.
 *
 * The parser is lenient so a half-written board still renders; the CHECKER
 * is strict. `kanbanProblems` names what the parser silently dropped or
 * defaulted — a missing title, columns or tasks, a task with no key, a
 * duplicate key, a `needs` edge to no task, a status that is not a column,
 * a duration that is not a positive number, a due that is not a date, and
 * tasks caught in a cycle — so `ok` from `studio-check` means the file says
 * what the board shows.
 */
import yaml from "js-yaml";
import { joinPath, resolveRef } from "crosscut";
import { configuredLister, readVirtualDirectoryFile } from "../api";
import { dumpBrief, parseBrief } from "./briefDoc";
import { compositeStreams } from "./compositeDoc";
import type { FeatureNode } from "./featureTree";
import { readListRows } from "./listCollate";
import { parsePoints, type Point } from "./pointsDoc";
import { parseSchemaDoc, splitHalvesOf } from "./schemaDoc";

export interface KanbanColumn {
  title: string;
  color?: string;
}

export interface KanbanTask {
  key: string;
  title: string;
  /** Column TITLE this task sits in; unset or unknown = the first column. */
  status?: string;
  /** Ref of the backing document, resolved against the board's own folder. */
  file?: string;
  /** For a `.brief` file: the section this task came from — first section
   *  whose title contains this, case-insensitively. */
  section?: string;
  note?: string;
  /** The task's own authored markdown — what THIS task means, in its own
   *  words. `file`/`section` stay provenance underneath it. */
  body?: string;
  /** Keys of prerequisite tasks. */
  needs: string[];
  /** Calendar days this task takes (default 1, floored at 1). */
  duration?: number;
  /** ISO date this task must be done by — a cap tighter than the board's. */
  due?: string;
}

export interface KanbanBoardDoc {
  title: string;
  description?: string;
  /** ISO date the whole board must be done by — the scheduling anchor. */
  due?: string;
  /** Ref of a `.points` file the tasks come from (see header). */
  source?: string;
  columns: KanbanColumn[];
  tasks: KanbanTask[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
/** An ISO date — js-yaml parses an unquoted `2026-09-09` as a Date object. */
const asDate = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10)
  : typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v.slice(0, 10) : "";

export const emptyKanban = (): KanbanBoardDoc => ({ title: "", columns: [], tasks: [] });

/** Lenient parse — never throws; anything unusable degrades to empty. */
export function parseKanban(content: string): KanbanBoardDoc {
  let raw: unknown;
  try { raw = yaml.load(content); } catch { return emptyKanban(); }
  if (!isObj(raw)) return emptyKanban();

  const columns: KanbanColumn[] = (Array.isArray(raw.columns) ? raw.columns : [])
    .map((c): KanbanColumn | null => {
      if (typeof c === "string") return c ? { title: c } : null;
      if (!isObj(c)) return null;
      // `label` is what a hand-written column (or the file template) may
      // call its title; a column with neither is nothing to draw.
      const title = asStr(c.title) || asStr(c.label);
      if (!title) return null;
      return { title, ...(asStr(c.color) ? { color: asStr(c.color) } : {}) };
    })
    .filter((c): c is KanbanColumn => c !== null);

  const seen = new Set<string>();
  const tasks: KanbanTask[] = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .map((t): KanbanTask | null => {
      if (!isObj(t)) return null;
      const title = asStr(t.title) || asStr(t.key);
      const key = asStr(t.key) || title;
      if (!key || seen.has(key)) return null; // a duplicate key would fork every edge to it
      seen.add(key);
      const needs = (Array.isArray(t.needs) ? t.needs : [])
        .map(asStr).filter((k) => k && k !== key);
      return {
        key, title, needs,
        ...(asStr(t.status) ? { status: asStr(t.status) } : {}),
        ...(asStr(t.file) ? { file: asStr(t.file) } : {}),
        ...(asStr(t.section) ? { section: asStr(t.section) } : {}),
        ...(asStr(t.note) ? { note: asStr(t.note) } : {}),
        ...(asStr(t.body) ? { body: asStr(t.body) } : {}),
        ...(Number.isFinite(Number(t.duration)) && Number(t.duration) > 0
          ? { duration: Number(t.duration) } : {}),
        ...(asDate(t.due) ? { due: asDate(t.due) } : {}),
      };
    })
    .filter((t): t is KanbanTask => t !== null);

  return {
    title: asStr(raw.title),
    ...(asStr(raw.description) ? { description: asStr(raw.description) } : {}),
    ...(asDate(raw.due) ? { due: asDate(raw.due) } : {}),
    ...(asStr(raw.source) ? { source: asStr(raw.source) } : {}),
    columns, tasks,
  };
}

/**
 * What the lenient parser dropped or defaulted, as the checker reports it —
 * the field table's `required` rows enforced, and every silent fallback
 * named. Empty for a board the Studio shows exactly as written.
 */
export function kanbanProblems(content: string): string[] {
  let raw: unknown;
  try { raw = yaml.load(content); } catch { return []; }
  const out: string[] = [];
  if (!isObj(raw)) return ["not a mapping — a board is `title`, `columns` and `tasks`"];
  if (!asStr(raw.title)) out.push("no `title` — the board's heading");
  if (raw.due !== undefined && !asDate(raw.due)) out.push(`\`due\` is not a date — write \`YYYY-MM-DD\`, bare or quoted (got ${JSON.stringify(raw.due)})`);
  if (!Array.isArray(raw.columns)) out.push("no `columns` — the statuses in order, a string or `{title, color?}` each");
  else {
    raw.columns.forEach((c, i) => {
      if (typeof c === "string" ? !c : !isObj(c) || !(asStr(c.title) || asStr(c.label))) out.push(`column ${i + 1}: no title — a string, or \`{title, color?}\``);
    });
    if (!raw.columns.length) out.push("`columns` is empty — a board needs at least one status");
  }
  const columns = parseKanban(content).columns.map((c) => c.title.toLowerCase());
  if (!Array.isArray(raw.tasks)) { out.push("no `tasks` — the cards; `tasks: []` is an empty board"); return out; }
  const keys = new Set<string>();
  const tasks = raw.tasks.map((t, i) => {
    const where = `task ${i + 1}`;
    if (!isObj(t)) { out.push(`${where}: not a mapping — write \`key\`, \`title\` and the rest`); return null; }
    const key = asStr(t.key) || asStr(t.title);
    const name = key ? `task ${key}` : where;
    if (!asStr(t.key)) out.push(`${name}: no \`key\` — the stable key \`needs\` edges point at`);
    if (!asStr(t.title)) out.push(`${name}: no \`title\` — the card's heading`);
    if (!key) return null;
    if (keys.has(key)) out.push(`${name}: duplicate key — every edge to it would fork; keys are identity`);
    keys.add(key);
    if (t.needs !== undefined && !Array.isArray(t.needs)) out.push(`${name}: \`needs\` is not a list — the keys of its prerequisites`);
    if (t.duration !== undefined && !(Number.isFinite(Number(t.duration)) && Number(t.duration) > 0)) out.push(`${name}: \`duration\` is not a positive number of days (got ${JSON.stringify(t.duration)})`);
    if (t.due !== undefined && !asDate(t.due)) out.push(`${name}: \`due\` is not a date — write \`YYYY-MM-DD\` (got ${JSON.stringify(t.due)})`);
    const status = asStr(t.status);
    if (status && columns.length && !columns.includes(status.toLowerCase())) out.push(`${name}: status \`${status}\` is not a column — it would land in the first column; columns are ${parseKanban(content).columns.map((c) => c.title).join(", ")}`);
    return { key, needs: (Array.isArray(t.needs) ? t.needs : []).map(asStr) };
  });
  for (const t of tasks) {
    if (!t) continue;
    for (const n of t.needs) {
      if (!n) out.push(`task ${t.key}: a \`needs\` entry is not a key`);
      else if (n === t.key) out.push(`task ${t.key}: needs itself`);
      else if (!keys.has(n)) out.push(`task ${t.key}: needs \`${n}\` — no task has that key`);
    }
  }
  const doc = parseKanban(content);
  const layer = layersOf(doc.tasks);
  const cyclic = doc.tasks.filter((t) => !layer.has(t.key)).map((t) => t.key);
  if (cyclic.length) out.push(`cycle: ${cyclic.join(" → ")} — tasks that need each other cannot be rowed or scheduled`);
  return out;
}

/** One line for the checker: what the board holds. */
export function kanbanSummary(doc: KanbanBoardDoc): string {
  const rows = dependencyRows(doc.tasks).length;
  return `${doc.tasks.length} task${doc.tasks.length === 1 ? "" : "s"} in ${rows} row${rows === 1 ? "" : "s"}, ${doc.columns.length} column${doc.columns.length === 1 ? "" : "s"}${doc.due ? `, due ${doc.due}` : ""}${doc.source ? `, from ${doc.source}` : ""}`;
}

/* ── sourcing tasks from a points stream ───────────────────────────────── */

/**
 * Points → tasks: the point's stable id is the task key, its label the
 * title, and the keys it has accreted so far map to task fields —
 * `description` becomes the body (the task's own words), `status` the
 * column. A point that hasn't accreted a key yet simply doesn't have that
 * field: identity first, domains as they arrive.
 */
export function tasksFromPoints(points: Point[]): KanbanTask[] {
  const val = (p: Point, k: string) => p.keys.find((x) => x.key === k)?.value;
  return points.map((p) => ({
    key: p.id,
    title: p.label ?? p.id,
    needs: [],
    ...(val(p, "status") ? { status: val(p, "status")! } : {}),
    ...(val(p, "description") ? { body: val(p, "description")! } : {}),
    ...(p.note ? { note: p.note } : {}),
  }));
}

/**
 * Merge the board's OWN domains onto sourced tasks by key. The source owns
 * identity and the domains its points accrete — title, body, and above all
 * STATUS: a sourced task's column comes from the point or nowhere, so a
 * stale board-side `status:` can never shadow the stream (a point that
 * hasn't accreted status simply sits in the first column). The board owns
 * what only a board knows: needs, duration, due, file/section. Board tasks
 * with no source row are kept whole, after the sourced ones.
 */
export function mergeSourceTasks(source: KanbanTask[], board: KanbanTask[]): KanbanTask[] {
  const byKey = new Map(board.map((t) => [t.key, t]));
  const merged = source.map((s) => {
    const b = byKey.get(s.key);
    if (!b) return s;
    return {
      key: s.key,
      title: s.title,
      needs: b.needs,
      ...(s.status ? { status: s.status } : {}),
      ...(s.body ?? b.body ? { body: (s.body ?? b.body)! } : {}),
      ...(s.note ?? b.note ? { note: (s.note ?? b.note)! } : {}),
      ...(b.duration ? { duration: b.duration } : {}),
      ...(b.due ? { due: b.due } : {}),
      ...(b.file ? { file: b.file } : {}),
      ...(b.section ? { section: b.section } : {}),
    };
  });
  const sourced = new Set(source.map((s) => s.key));
  return [...merged, ...board.filter((t) => !sourced.has(t.key))];
}

/**
 * Tasks from a FOLDER of composite `.node`s (the lead pattern): each node is
 * one task, its streams the task's DOMAINS. Every stream folds its arrivals
 * to a current picture (later arrivals win) and the pictures merge flat —
 * so an `identity` stream's title/description and a `status` stream's
 * status land on one task without this code knowing the domain names.
 * Nodes that aren't composite (or won't read) are skipped, not invented.
 */
export async function tasksFromNodeFolder(folderAbs: string): Promise<KanbanTask[]> {
  const lister = configuredLister();
  if (!lister) return [];
  const today = new Date().toISOString().slice(0, 10);
  const children = await lister(folderAbs);
  const nodes = children.filter((c) => c.kind === "folder" && c.name.endsWith(".node"));
  const tasks = await Promise.all(nodes.map(async (n): Promise<KanbanTask | null> => {
    try {
      const halves = splitHalvesOf(await lister(n.path));
      if (!halves.schema || !halves.content) return null;
      const schemaAbs = joinPath(n.path, halves.schema);
      const schema = parseSchemaDoc((await readVirtualDirectoryFile(schemaAbs, schemaAbs)).content);
      if (schema.type !== "composite") return null;
      const rows = halves.content.endsWith(".list")
        ? (await readListRows(joinPath(n.path, halves.content))).rows : [];
      const current: Record<string, string> = {};
      for (const s of compositeStreams(schema, rows, today).streams) Object.assign(current, s.current);
      const key = n.name.replace(/\.node$/, "");
      return {
        key,
        title: current.title ?? key,
        needs: [],
        ...(current.status ? { status: current.status } : {}),
        ...(current.description ? { body: current.description } : {}),
        ...(current.note ? { note: current.note } : {}),
      };
    } catch {
      return null;
    }
  }));
  return tasks.filter((t): t is KanbanTask => t !== null);
}

/** The board with its source applied — a folder of composite task nodes, or
 *  a `.points` stream. The IO lives here so every lens over a board
 *  resolves it the same way; an unreadable source degrades to the board's
 *  own tasks. */
export async function resolveBoardSource(doc: KanbanBoardDoc, boardPath: string): Promise<KanbanBoardDoc> {
  if (!doc.source) return doc;
  const abs = resolveRef(boardPath, doc.source);
  try {
    const sourceTasks = abs.toLowerCase().endsWith(".points")
      ? tasksFromPoints(parsePoints((await readVirtualDirectoryFile(abs, abs)).content).points)
      : await tasksFromNodeFolder(abs);
    return { ...doc, tasks: mergeSourceTasks(sourceTasks, doc.tasks) };
  } catch {
    return doc;
  }
}

/** The column a task sits in — status matched case-insensitively against
 *  column titles; unset or unknown lands in the first column. */
export const columnIndexOf = (t: KanbanTask, columns: KanbanColumn[]): number => {
  if (!t.status) return 0;
  const i = columns.findIndex((c) => c.title.toLowerCase() === t.status!.toLowerCase());
  return i === -1 ? 0 : i;
};

/**
 * The board's rows: tasks layered by longest prerequisite chain (Kahn's
 * order, so a diamond sits as deep as its longest path). Edges to unknown
 * keys are ignored. Tasks left over after the topological pass are cyclic —
 * they can't be ordered honestly, so they form one final row together.
 * Every returned row is non-empty; row order is dependency order.
 */
/** Each task's dependency depth by Kahn's order (longest chain). Tasks in a
 *  cycle can't be layered and are simply absent from the map. */
function layersOf(tasks: KanbanTask[]): Map<string, number> {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const needsOf = (t: KanbanTask) => t.needs.filter((k) => byKey.has(k));
  const layer = new Map<string, number>();

  const pending = new Map(tasks.map((t) => [t.key, needsOf(t).length]));
  const queue = tasks.filter((t) => needsOf(t).length === 0).map((t) => t.key);
  while (queue.length) {
    const key = queue.shift()!;
    const t = byKey.get(key)!;
    const deps = needsOf(t);
    layer.set(key, deps.length ? Math.max(...deps.map((k) => layer.get(k) ?? 0)) + 1 : 0);
    for (const other of tasks) {
      if (layer.has(other.key) || !other.needs.includes(key)) continue;
      const left = (pending.get(other.key) ?? 0) - 1;
      pending.set(other.key, left);
      if (left === 0) queue.push(other.key);
    }
  }
  return layer;
}

export function dependencyRows(tasks: KanbanTask[]): KanbanTask[][] {
  const layer = layersOf(tasks);
  const depth = Math.max(-1, ...[...layer.values()]);
  const rows: KanbanTask[][] = Array.from({ length: depth + 1 }, () => []);
  for (const t of tasks) if (layer.has(t.key)) rows[layer.get(t.key)!].push(t);
  const cyclic = tasks.filter((t) => !layer.has(t.key));
  if (cyclic.length) rows.push(cyclic);
  return rows.filter((r) => r.length > 0);
}

/** Tasks whose `needs` include `key` — what the card dialog lists as
 *  "depended on by". */
export const dependentsOf = (tasks: KanbanTask[], key: string): KanbanTask[] =>
  tasks.filter((t) => t.needs.includes(key));

export interface ScheduledTask {
  task: KanbanTask;
  /** ISO dates, inclusive — the same contract the journey calendar renders. */
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;
const addDays = (isoDate: string, n: number): string =>
  new Date(Date.parse(isoDate + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);

/**
 * Backward-chained (as-late-as-possible) schedule: a task ends at the
 * earliest of its own `due`, the board's `due`, and the day before its
 * earliest dependent starts — then runs `duration` days back from there.
 * That is the whole ask: dependencies chain onto calendar days. Tasks with
 * no anchor at all (no due anywhere downstream) and cyclic tasks come back
 * in `unscheduled` instead of being given invented dates.
 */
export function scheduleTasks(
  doc: KanbanBoardDoc, dueOverride?: string,
): { scheduled: ScheduledTask[]; unscheduled: KanbanTask[] } {
  const boardDue = dueOverride ?? doc.due;
  const layer = layersOf(doc.tasks);
  const startOf = new Map<string, string>();
  const endOf = new Map<string, string>();

  // Dependents sit on HIGHER layers than their prerequisites, so walking
  // layers descending schedules every dependent before the task it needs.
  const ordered = doc.tasks
    .filter((t) => layer.has(t.key))
    .sort((a, b) => layer.get(b.key)! - layer.get(a.key)!);
  for (const t of ordered) {
    const depStarts = dependentsOf(doc.tasks, t.key)
      .map((d) => startOf.get(d.key))
      .filter((s): s is string => !!s)
      .sort();
    const chainEnd = depStarts.length ? addDays(depStarts[0], -1) : undefined;
    const cap = t.due ?? boardDue;
    const end = chainEnd && cap ? (chainEnd < cap ? chainEnd : cap) : (chainEnd ?? cap);
    if (!end) continue;
    const duration = Math.max(1, Math.round(t.duration ?? 1));
    endOf.set(t.key, end);
    startOf.set(t.key, addDays(end, -(duration - 1)));
  }

  const scheduled = doc.tasks
    .filter((t) => endOf.has(t.key))
    .map((t) => ({ task: t, start: startOf.get(t.key)!, end: endOf.get(t.key)! }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.task.title.localeCompare(b.task.title));
  return { scheduled, unscheduled: doc.tasks.filter((t) => !endOf.has(t.key)) };
}

/**
 * A task's slice of its backing `.brief`: the first section (depth-first)
 * whose title contains `section` case-insensitively, re-dumped as a one-
 * section brief so the ordinary brief renderer shows just that part. Null
 * when nothing matches — the caller falls back to the whole document.
 */
export function briefSectionSlice(content: string, section: string): string | null {
  const doc = parseBrief(content);
  const wanted = section.toLowerCase();
  const find = (nodes: FeatureNode[]): FeatureNode | null => {
    for (const n of nodes) {
      if ((n.name ?? "").toLowerCase().includes(wanted)) return n;
      const hit = n.children?.length ? find(n.children) : null;
      if (hit) return hit;
    }
    return null;
  };
  const hit = find(doc.sections);
  if (!hit) return null;
  // The hit is the single section, so its own description/body survive the cut.
  return dumpBrief({ title: doc.title, description: `Section: ${hit.name}`, sections: [hit] });
}
