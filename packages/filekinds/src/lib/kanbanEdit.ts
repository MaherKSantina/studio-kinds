/**
 * EDITING a kanban board — the pure mutators behind the board's own controls
 * (add / edit / delete tasks and columns) and behind the Ask vocabulary
 * (`kanbanAsk`), so a typed edit and a spoken one go through the same code.
 * Every edit returns a new document or the reason it was refused; nothing
 * throws, and `dumpKanban` writes the file back in the authoring shape
 * `kanbanDoc.ts` documents, so the board can never save a shape it could
 * not read.
 *
 * A board with a `source:` owns no task identity — its tasks come from the
 * points or nodes it lenses — so adding and removing tasks is refused
 * there, and an update may only touch the board's OWN domains: `needs`,
 * `duration`, `due`, `file` and `section`. Such a board may hold a row for
 * a sourced task that carries nothing but the key and those fields.
 */
import yaml from "js-yaml";
import type { KanbanBoardDoc, KanbanColumn, KanbanTask } from "./kanbanDoc";

export type KanbanEdit<T = object> = ({ ok: true; doc: KanbanBoardDoc } & T) | { ok: false; error: string };

/** A stable key from a title: lowercase, dashes, at most 48 characters. */
export const taskKeyOf = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "task";

/** `base`, else `base-2`, `base-3`… — the first not taken. */
export function uniqueTaskKey(taken: Iterable<string>, base: string): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) {
    const k = `${base}-${i}`;
    if (!set.has(k)) return k;
  }
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A column by exact title, else case-insensitively. */
export function findColumn(doc: KanbanBoardDoc, ref: string | undefined): KanbanColumn | undefined {
  if (!ref?.trim()) return undefined;
  return doc.columns.find((c) => c.title === ref) ?? doc.columns.find((c) => same(c.title, ref));
}

/** A task by key (exact, then case-insensitive), else by a title that only one task carries. */
export function findTask(doc: KanbanBoardDoc, ref: string | undefined): KanbanTask | undefined {
  if (!ref?.trim()) return undefined;
  const byKey = doc.tasks.find((t) => t.key === ref) ?? doc.tasks.find((t) => same(t.key, ref));
  if (byKey) return byKey;
  const hits = doc.tasks.filter((t) => same(t.title, ref));
  return hits.length === 1 ? hits[0] : undefined;
}

/** Insert `item`: after the item keyed `after`, first when `after` is null, last when omitted or unknown. */
function place<T>(items: T[], item: T, after: string | null | undefined, keyOf: (t: T) => string): T[] {
  if (after === undefined) return [...items, item];
  if (after === null) return [item, ...items];
  const i = items.findIndex((x) => keyOf(x) === after);
  return i < 0 ? [...items, item] : [...items.slice(0, i + 1), item, ...items.slice(i + 1)];
}

/* ── columns ─────────────────────────────────────────────────────────────── */

export function addColumn(doc: KanbanBoardDoc, title: string, opts: { color?: string; after?: string | null } = {}): KanbanEdit<{ column: KanbanColumn }> {
  const t = title.trim();
  if (!t) return { ok: false, error: "a column needs a title" };
  if (findColumn(doc, t)) return { ok: false, error: `a column called "${t}" already exists` };
  const column: KanbanColumn = { title: t, ...(opts.color?.trim() ? { color: opts.color.trim() } : {}) };
  const after = typeof opts.after === "string" ? findColumn(doc, opts.after)?.title ?? opts.after : opts.after;
  return { ok: true, doc: { ...doc, columns: place(doc.columns, column, after, (c) => c.title) }, column };
}

/** Retitle (and/or recolour) a column; the tasks standing in it follow. */
export function renameColumn(doc: KanbanBoardDoc, ref: string, next: string | undefined, opts: { color?: string } = {}): KanbanEdit<{ column: KanbanColumn }> {
  const col = findColumn(doc, ref);
  if (!col) return { ok: false, error: `unknown column "${ref}"` };
  const title = next?.trim() || col.title;
  if (title !== col.title && doc.columns.some((c) => c !== col && same(c.title, title))) {
    return { ok: false, error: `a column called "${title}" already exists` };
  }
  const color = opts.color === undefined ? col.color : opts.color.trim() || undefined;
  const column: KanbanColumn = { title, ...(color ? { color } : {}) };
  return {
    ok: true,
    doc: {
      ...doc,
      columns: doc.columns.map((c) => (c === col ? column : c)),
      tasks: doc.tasks.map((t) => (t.status && same(t.status, col.title) ? { ...t, status: title } : t)),
    },
    column,
  };
}

/** Remove a column; the tasks standing in it fall back to the first column. */
export function removeColumn(doc: KanbanBoardDoc, ref: string): KanbanEdit<{ column: KanbanColumn; moved: number }> {
  const col = findColumn(doc, ref);
  if (!col) return { ok: false, error: `unknown column "${ref}"` };
  let moved = 0;
  const tasks = doc.tasks.map((t) => {
    if (!t.status || !same(t.status, col.title)) return t;
    moved++;
    const { status: _s, ...rest } = t;
    return rest;
  });
  return { ok: true, doc: { ...doc, columns: doc.columns.filter((c) => c !== col), tasks }, column: col, moved };
}

export function moveColumn(doc: KanbanBoardDoc, ref: string, after: string | null): KanbanEdit {
  const col = findColumn(doc, ref);
  if (!col) return { ok: false, error: `unknown column "${ref}"` };
  const rest = doc.columns.filter((c) => c !== col);
  const anchor = after === null ? null : findColumn(doc, after)?.title;
  if (after !== null && !anchor) return { ok: false, error: `unknown column "${after}"` };
  return { ok: true, doc: { ...doc, columns: place(rest, col, anchor, (c) => c.title) } };
}

/* ── tasks ───────────────────────────────────────────────────────────────── */

/** What an edit may say about a task. An empty string REMOVES an optional
 *  field; `needs` replaces the whole list; `duration` 0 removes it. */
export interface TaskPatch {
  key?: string;
  title?: string;
  note?: string;
  body?: string;
  status?: string;
  needs?: string[];
  file?: string;
  section?: string;
  duration?: number;
  due?: string;
}

const BOARD_OWNED: ReadonlySet<keyof TaskPatch> = new Set<keyof TaskPatch>(["needs", "duration", "due", "file", "section"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const sourcedRefusal = (doc: KanbanBoardDoc) =>
  `tasks come from ${doc.source} — only needs, duration, due, file and section are this board's to change`;

/** The patch applied to one task's fields (never its key). Unknown `needs` are dropped and named. */
function patched(doc: KanbanBoardDoc, task: KanbanTask, patch: TaskPatch): { ok: true; task: KanbanTask; dropped: string[] } | { ok: false; error: string } {
  const t: KanbanTask = { ...task, needs: [...task.needs] };
  const dropped: string[] = [];
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return { ok: false, error: "a task needs a title" };
    t.title = title;
  }
  for (const k of ["note", "file", "section"] as const) {
    const v = patch[k];
    if (v === undefined) continue;
    if (v.trim()) t[k] = v.trim(); else delete t[k];
  }
  if (patch.body !== undefined) {
    const body = patch.body.replace(/\s+$/, "");
    if (body.trim()) t.body = body; else delete t.body;
  }
  if (patch.status !== undefined) {
    if (!patch.status.trim()) delete t.status;
    else {
      const col = findColumn(doc, patch.status);
      if (!col) return { ok: false, error: `no column called "${patch.status}"` };
      t.status = col.title;
    }
  }
  if (patch.needs !== undefined) {
    const known = new Set(doc.tasks.map((x) => x.key));
    const next: string[] = [];
    for (const raw of patch.needs) {
      const k = raw.trim();
      if (!k) continue;
      if (k === task.key) { dropped.push(`${k} (itself)`); continue; }
      if (!known.has(k)) { dropped.push(k); continue; }
      if (!next.includes(k)) next.push(k);
    }
    t.needs = next;
  }
  if (patch.duration !== undefined) {
    if (!Number.isFinite(patch.duration) || patch.duration <= 0) delete t.duration;
    else t.duration = Math.round(patch.duration);
  }
  if (patch.due !== undefined) {
    const due = patch.due.trim();
    if (!due) delete t.due;
    else if (!ISO_DATE.test(due)) return { ok: false, error: `due "${due}" is not an ISO date (2026-09-30)` };
    else t.due = due;
  }
  return { ok: true, task: t, dropped };
}

export function addTask(doc: KanbanBoardDoc, patch: TaskPatch & { title: string }, opts: { after?: string | null } = {}): KanbanEdit<{ task: KanbanTask; dropped: string[] }> {
  if (doc.source) return { ok: false, error: sourcedRefusal(doc) };
  const title = patch.title.trim();
  if (!title) return { ok: false, error: "a task needs a title" };
  const key = uniqueTaskKey(doc.tasks.map((t) => t.key), patch.key?.trim() ? taskKeyOf(patch.key) : taskKeyOf(title));
  const r = patched(doc, { key, title, needs: [] }, { ...patch, key: undefined, title });
  if (!r.ok) return r;
  const after = typeof opts.after === "string" ? findTask(doc, opts.after)?.key ?? opts.after : opts.after;
  return { ok: true, doc: { ...doc, tasks: place(doc.tasks, r.task, after, (t) => t.key) }, task: r.task, dropped: r.dropped };
}

/**
 * Change a task. On a sourced board a task with no row yet gets one (key
 * only, plus the board-owned fields), and any other field is refused.
 * Renaming the key re-points every edge to it.
 */
export function updateTask(doc: KanbanBoardDoc, ref: string, patch: TaskPatch): KanbanEdit<{ task: KanbanTask; dropped: string[] }> {
  let task = findTask(doc, ref);
  let tasks = doc.tasks;
  if (doc.source) {
    const foreign = (Object.keys(patch) as (keyof TaskPatch)[]).filter((k) => patch[k] !== undefined && !BOARD_OWNED.has(k));
    if (foreign.length) return { ok: false, error: sourcedRefusal(doc) };
    if (!task) {
      const key = ref.trim();
      if (!key) return { ok: false, error: "no task given" };
      task = { key, title: key, needs: [] };
      tasks = [...tasks, task];
    }
  }
  if (!task) return { ok: false, error: `unknown task "${ref}"` };
  const current = task;
  const r = patched({ ...doc, tasks }, current, patch);
  if (!r.ok) return r;
  let next = r.task;
  if (patch.key !== undefined && patch.key.trim() && patch.key.trim() !== current.key) {
    const key = taskKeyOf(patch.key);
    if (tasks.some((t) => t !== current && t.key === key)) return { ok: false, error: `a task with key "${key}" already exists` };
    next = { ...next, key };
    tasks = tasks.map((t) => (t === current ? t : { ...t, needs: t.needs.map((k) => (k === current.key ? key : k)) }));
  }
  return { ok: true, doc: { ...doc, tasks: tasks.map((t) => (t === current ? next : t)) }, task: next, dropped: r.dropped };
}

/** Remove a task and every edge that pointed at it. */
export function removeTask(doc: KanbanBoardDoc, ref: string): KanbanEdit<{ task: KanbanTask; unlinked: number }> {
  if (doc.source) return { ok: false, error: sourcedRefusal(doc) };
  const task = findTask(doc, ref);
  if (!task) return { ok: false, error: `unknown task "${ref}"` };
  let unlinked = 0;
  const tasks = doc.tasks.filter((t) => t !== task).map((t) => {
    if (!t.needs.includes(task.key)) return t;
    unlinked++;
    return { ...t, needs: t.needs.filter((k) => k !== task.key) };
  });
  return { ok: true, doc: { ...doc, tasks }, task, unlinked };
}

/** Put a task in a column — `updateTask` with just the status. */
export const moveTask = (doc: KanbanBoardDoc, ref: string, column: string): KanbanEdit<{ task: KanbanTask; dropped: string[] }> =>
  doc.source ? { ok: false, error: sourcedRefusal(doc) } : updateTask(doc, ref, { status: column });

export function setBoardMeta(doc: KanbanBoardDoc, patch: { title?: string; description?: string; due?: string }): KanbanEdit {
  const next = { ...doc };
  if (patch.title !== undefined) next.title = patch.title.trim();
  if (patch.description !== undefined) { if (patch.description.trim()) next.description = patch.description.trim(); else delete next.description; }
  if (patch.due !== undefined) {
    const due = patch.due.trim();
    if (!due) delete next.due;
    else if (!ISO_DATE.test(due)) return { ok: false, error: `due "${due}" is not an ISO date (2026-09-30)` };
    else next.due = due;
  }
  return { ok: true, doc: next };
}

/* ── writing ─────────────────────────────────────────────────────────────── */

/** The file, in the shape `parseKanban` reads. A title equal to the key is
 *  left out (the parser restores it), which keeps a sourced board's rows to
 *  the key and the fields it owns. */
export function dumpKanban(doc: KanbanBoardDoc): string {
  return yaml.dump({
    title: doc.title,
    ...(doc.description ? { description: doc.description } : {}),
    ...(doc.due ? { due: doc.due } : {}),
    ...(doc.source ? { source: doc.source } : {}),
    columns: doc.columns.map((c) => (c.color ? { title: c.title, color: c.color } : c.title)),
    tasks: doc.tasks.map((t) => ({
      key: t.key,
      ...(t.title !== t.key ? { title: t.title } : {}),
      ...(t.status ? { status: t.status } : {}),
      ...(t.note ? { note: t.note } : {}),
      ...(t.body ? { body: t.body } : {}),
      ...(t.file ? { file: t.file } : {}),
      ...(t.section ? { section: t.section } : {}),
      ...(t.needs.length ? { needs: t.needs } : {}),
      ...(t.duration ? { duration: t.duration } : {}),
      ...(t.due ? { due: t.due } : {}),
    })),
  }, { lineWidth: -1, noRefs: true });
}
