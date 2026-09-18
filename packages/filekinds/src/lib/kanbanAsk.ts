/**
 * ASKING a kanban board to change — the live-edit vocabulary behind the
 * board's Ask panel. The user stands on the board, maybe on one card or one
 * column, and types one line: "add a task to test the login flow after the
 * dry run", "move it to Done", "rename Doing to In progress", "split this
 * into three tasks".
 *
 * The model reads a compact listing of the board plus the target and
 * answers with OPS from a closed vocabulary; `applyKanbanOps` runs them
 * through the SAME mutators the dialogs use (`kanbanEdit`), so nothing a
 * model says can produce a shape the board could not. Refusals from the
 * mutators (an unknown column, a sourced board) become skipped lines the
 * panel shows, never throws.
 *
 * The model speaks the user's words for a task's parts: `description` is
 * the one line under the title (the file's `note`), `details` is its own
 * markdown (the file's `body`).
 */
import { parseKanban, type KanbanBoardDoc, type KanbanTask } from "./kanbanDoc";
import {
  addColumn, addTask, dumpKanban, findColumn, findTask, moveColumn, moveTask, removeColumn, removeTask, renameColumn,
  setBoardMeta, updateTask,
} from "./kanbanEdit";

export const KANBAN_ASK_OPS = [
  "add_task", "update_task", "remove_task", "move_task",
  "add_column", "rename_column", "remove_column", "move_column",
  "set_title",
] as const;
export type KanbanAskOpName = (typeof KANBAN_ASK_OPS)[number];

/** One edit as the model emits it. Which fields matter depends on the op (see `kanbanAskSystem`). */
export interface KanbanOp {
  op: KanbanAskOpName;
  /** A task: its key or exact title (or a handle from an earlier `as` in this reply). */
  task?: string;
  title?: string;
  /** The one line under the title (the file's `note`). */
  description?: string;
  /** The task's own markdown (the file's `body`). */
  details?: string;
  /** A column title — where a task stands, or which column an op is about. */
  column?: string;
  /** Prerequisite tasks, "key|other" (titles and handles accepted). */
  needs?: string;
  file?: string;
  section?: string;
  duration?: number;
  due?: string;
  /** add_column / rename_column: the (new) title. */
  name?: string;
  color?: string;
  /** The task or column to land after; "" = first. */
  after?: string;
  /** A handle for a task this reply creates, for later ops in the same reply. */
  as?: string;
  /** update_task: a new key. */
  key?: string;
}

export interface KanbanAskReply {
  say: string;
  ops: KanbanOp[];
}

const STRING_FIELDS = ["task", "title", "description", "details", "column", "needs", "file", "section", "due", "name", "color", "after", "as", "key"] as const;

/** The JSON schema a reply must satisfy — plain enough for every validator. */
export const KANBAN_ASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["say", "ops"],
  properties: {
    say: { type: "string", description: "One short sentence: what changed, or the one question to ask (then ops is empty)." },
    ops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op"],
        properties: {
          op: { type: "string", enum: [...KANBAN_ASK_OPS] },
          ...Object.fromEntries(STRING_FIELDS.map((k) => [k, { type: "string" }])),
          duration: { type: "number" },
        },
      },
    },
  },
} as const;

/** What the model is told once — stable text: the board, the ops, the rules. */
export function kanbanAskSystem(): string {
  return `You are the editing hand inside a kanban board (a .kanban file). The user gives short instructions, often live in front of other people. Answer ONLY through the schema: "say" is one short sentence, under twelve words (what you changed, or the single question you need answered), "ops" is the list of edits.

THE BOARD
- columns: the statuses, in order (To do, Doing, Done). A task stands in the column its status names; no status = the first column.
- tasks: each {key, title, description, details, column, needs, file, section, duration, due}. key = a stable slug the edges point at. description = ONE line under the title. details = the task's own markdown — what doing it actually means. needs = keys of prerequisite tasks: the board draws its ROWS from them (row one needs nothing, each later row builds on the ones above), so "X depends on Y" is needs, never a column. file/section = the document a task came from (leave alone unless asked). duration = working days (default 1); due = an ISO date cap.
- A board with a source takes its tasks from elsewhere: there only columns, needs, duration, due and file/section can change.

THE OPS — one edit each, applied in order:
- add_task {title, description, details, column, needs, file, section, duration, due, after, as}: a new task. column omitted = the TARGET column, else the first. needs = keys or exact titles separated by "|". after = the task to land after ("" = first, omitted = last). as = a handle of your choosing (t1, deploy) so later ops in THIS reply can name it in needs or task.
- update_task {task, title, description, details, column, needs, file, section, duration, due, key}: only the fields that change. task = its key or exact title (omitted = the target task). An empty string removes description / details / file / section / due; needs replaces the whole list ("" = none); duration 0 removes it.
- remove_task {task}. move_task {task, column}: stand it in that column.
- add_column {name, color, after}: a new column (after "" = first). rename_column {column, name, color}: a new title — the tasks in it follow. remove_column {column}: its tasks fall back to the first column. move_column {column, after}.
- set_title {title, description, due}: the board's own head.

RULES
- Refer to existing tasks by key or exact title and columns by title; refer to tasks this reply creates only through the handles you gave (as). Never invent keys — omit key and one is derived from the title.
- "It", "this", "the selected one" = the target task; "here" = the target column.
- Make the smallest change that does what was asked; leave everything not mentioned alone. Keep a reply under about 20 ops.
- Several tasks at once are several add_task ops, each with its own handle; wire dependencies with needs, not with extra columns.
- Act when the instruction can be applied sensibly. Ask (say + empty ops) only when it cannot.`;
}

export interface KanbanAskTarget {
  taskKey: string | null;
  column: string | null;
}

export interface KanbanAskTurn {
  instruction: string;
  say: string;
  result?: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

/** One task, one line (its details on a second) — what the model reads. */
function taskLine(doc: KanbanBoardDoc, t: KanbanTask): string {
  const col = findColumn(doc, t.status ?? "")?.title ?? doc.columns[0]?.title ?? "(first)";
  const parts = [`- ${t.key} · "${t.title}" · ${col}`];
  if (t.needs.length) parts.push(`needs: ${t.needs.join(", ")}`);
  if (t.note) parts.push(`description: ${t.note}`);
  if (t.file) parts.push(`file: ${t.file}${t.section ? ` § ${t.section}` : ""}`);
  if (t.duration) parts.push(`duration: ${t.duration}`);
  if (t.due) parts.push(`due: ${t.due}`);
  const head = parts.join(" · ");
  return t.body ? `${head}\n  details: ${clip(t.body.replace(/\s+/g, " ").trim(), 240)}` : head;
}

/** What the model is told per turn: the target, recent turns, the board, the instruction. */
export function kanbanAskUser(content: string, target: KanbanAskTarget, instruction: string, history: KanbanAskTurn[] = []): string {
  const doc = parseKanban(content);
  const task = target.taskKey ? findTask(doc, target.taskKey) : undefined;
  const column = target.column ? findColumn(doc, target.column) : undefined;
  const lines = [
    `TARGET task: ${task ? `"${task.title}" (${task.key}, in ${findColumn(doc, task.status ?? "")?.title ?? doc.columns[0]?.title ?? "the first column"})` : "none — the whole board"}`,
    `TARGET column: ${column ? column.title : "none"}`,
  ];
  const recent = history.slice(-4);
  if (recent.length) {
    lines.push("RECENT TURNS");
    for (const t of recent) lines.push(`user: ${t.instruction}`, `you: ${t.say}${t.result ? ` [${t.result}]` : ""}`);
  }
  lines.push("BOARD", `title: ${doc.title || "(untitled)"}`);
  if (doc.description) lines.push(`description: ${doc.description}`);
  if (doc.due) lines.push(`due: ${doc.due}`);
  if (doc.source) lines.push(`source: ${doc.source} (tasks come from there — only columns, needs, duration, due and file/section change here)`);
  lines.push(`columns: ${doc.columns.length ? doc.columns.map((c) => c.title).join(" | ") : "(none — one implicit column)"}`);
  lines.push(`tasks (${doc.tasks.length}):`, ...(doc.tasks.length ? doc.tasks.map((t) => taskLine(doc, t)) : ["- (none)"]));
  lines.push(`INSTRUCTION: ${instruction.trim()}`);
  return lines.join("\n");
}

/* ── reading a reply ─────────────────────────────────────────────────────── */

const OP_ALIASES: Record<string, KanbanAskOpName> = {
  add: "add_task", create: "add_task", create_task: "add_task", new_task: "add_task", insert_task: "add_task",
  update: "update_task", edit: "update_task", edit_task: "update_task", change_task: "update_task", set: "update_task",
  remove: "remove_task", delete: "remove_task", delete_task: "remove_task",
  move: "move_task", set_status: "move_task", set_column: "move_task", status: "move_task",
  create_column: "add_column", new_column: "add_column", add_col: "add_column", insert_column: "add_column",
  update_column: "rename_column", edit_column: "rename_column", retitle_column: "rename_column", recolor_column: "rename_column",
  delete_column: "remove_column", drop_column: "remove_column",
  reorder_column: "move_column",
  set_meta: "set_title", rename_board: "set_title", doc: "set_title", set_description: "set_title", set_due: "set_title",
};

const text = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : undefined;

/** `needs` however the model wrote it — "a|b", "a, b", or a list — as the one text form. */
const needsText = (v: unknown): string | undefined =>
  Array.isArray(v) ? v.map(text).filter(Boolean).join("|") : text(v);

export function normalizeKanbanOp(x: unknown): KanbanOp | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const rawOp = (text(r.op ?? r.action ?? r.type) ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const op = (KANBAN_ASK_OPS as readonly string[]).includes(rawOp) ? (rawOp as KanbanAskOpName) : OP_ALIASES[rawOp];
  if (!op) return null;
  const out: KanbanOp = { op };
  for (const k of STRING_FIELDS) {
    const raw = k === "needs" ? needsText(r[k]) : text(r[k]);
    if (raw !== undefined) out[k] = raw;
  }
  // The names a model reaches for that mean one of ours.
  if (out.task === undefined) { const s = text(r.id ?? r.task_key ?? r.taskKey); if (s !== undefined) out.task = s; }
  if (out.description === undefined) { const s = text(r.note ?? r.subtitle); if (s !== undefined) out.description = s; }
  if (out.details === undefined) { const s = text(r.body ?? r.markdown ?? r.content); if (s !== undefined) out.details = s; }
  if (out.column === undefined) { const s = text(r.status ?? r.to ?? r.column_title); if (s !== undefined) out.column = s; }
  if (out.name === undefined) { const s = text(r.new_name ?? r.new_title ?? r.newName); if (s !== undefined) out.name = s; }
  if (out.as === undefined) { const s = text(r.handle ?? r.alias); if (s !== undefined && s.trim()) out.as = s.trim(); }
  const duration = typeof r.duration === "number" ? r.duration : typeof r.duration === "string" && r.duration.trim() && Number.isFinite(Number(r.duration)) ? Number(r.duration) : undefined;
  if (duration !== undefined) out.duration = duration;
  return out;
}

export function parseKanbanAskReply(x: unknown): KanbanAskReply {
  const r = x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
  const say = text(r.say ?? r.message) ?? "";
  const rawOps = Array.isArray(r.ops) ? r.ops : Array.isArray(r.edits) ? r.edits : Array.isArray(r.operations) ? r.operations : [];
  return { say, ops: rawOps.map(normalizeKanbanOp).filter((o): o is KanbanOp => !!o) };
}

/* ── applying ────────────────────────────────────────────────────────────── */

export interface KanbanAskApplied {
  content: string;
  applied: string[];
  skipped: string[];
  /** A task an op created or changed — the natural next target. */
  focusKey: string | null;
}

/** "a|b, c" → the parts, each resolved through handles and the board. */
const splitRefs = (s: string | undefined): string[] => (s ?? "").split(/[|,]/).map((x) => x.trim()).filter(Boolean);

/** Apply a reply's ops, in order, through the board's own mutators; say what happened. Never throws. */
export function applyKanbanOps(content: string, ops: KanbanOp[], target: KanbanAskTarget): KanbanAskApplied {
  const applied: string[] = [];
  const skipped: string[] = [];
  let focusKey: string | null = null;
  let doc = parseKanban(content);
  const handles = new Map<string, string>();

  const taskRef = (ref: string | undefined): string | undefined => {
    if (ref === undefined || ref === "") return target.taskKey ?? undefined;
    return handles.get(ref) ?? ref;
  };
  const columnRef = (ref: string | undefined): string | undefined => (ref?.trim() ? ref : target.column ?? undefined);
  /** A task ref → its key, else the raw text (the mutator will say it is unknown). */
  const keyOf = (ref: string): string => handles.get(ref) ?? findTask(doc, ref)?.key ?? ref;
  const needsOf = (s: string | undefined): string[] | undefined => (s === undefined ? undefined : splitRefs(s).map(keyOf));
  const afterOf = (a: string | undefined): string | null | undefined => (a === undefined ? undefined : a === "" ? null : keyOf(a));
  const label = (t: KanbanTask) => `"${t.title}" (${t.key})`;
  const drops = (dropped: string[]) => (dropped.length ? ` — unknown needs dropped: ${dropped.join(", ")}` : "");

  for (const op of ops) {
    switch (op.op) {
      case "add_task": {
        const column = op.column?.trim() ? op.column : target.column ?? undefined;
        const r = addTask(doc, {
          title: op.title ?? "", note: op.description, body: op.details, status: column, needs: needsOf(op.needs),
          file: op.file, section: op.section, duration: op.duration, due: op.due, key: op.key,
        }, { after: afterOf(op.after) });
        if (!r.ok) { skipped.push(`add_task: ${r.error}`); break; }
        doc = r.doc;
        if (op.as?.trim()) handles.set(op.as.trim(), r.task.key);
        focusKey = r.task.key;
        applied.push(`added ${label(r.task)}${r.task.status ? ` in ${r.task.status}` : ""}${r.task.needs.length ? ` needing ${r.task.needs.join(", ")}` : ""}${drops(r.dropped)}`);
        break;
      }
      case "update_task": {
        const ref = taskRef(op.task);
        if (!ref) { skipped.push("update_task: no task given and none targeted"); break; }
        const r = updateTask(doc, ref, {
          title: op.title, note: op.description, body: op.details, status: op.column, needs: needsOf(op.needs),
          file: op.file, section: op.section, duration: op.duration, due: op.due, key: op.key,
        });
        if (!r.ok) { skipped.push(`update_task ${ref}: ${r.error}`); break; }
        doc = r.doc;
        focusKey = r.task.key;
        const what = (["title", "description", "details", "column", "needs", "file", "section", "duration", "due", "key"] as const).filter((k) => op[k] !== undefined);
        applied.push(`updated ${label(r.task)}: ${what.join(", ")}${drops(r.dropped)}`);
        break;
      }
      case "remove_task": {
        const ref = taskRef(op.task);
        if (!ref) { skipped.push("remove_task: no task given and none targeted"); break; }
        const r = removeTask(doc, ref);
        if (!r.ok) { skipped.push(`remove_task ${ref}: ${r.error}`); break; }
        doc = r.doc;
        if (focusKey === r.task.key) focusKey = null;
        applied.push(`removed ${label(r.task)}${r.unlinked ? ` (unlinked from ${r.unlinked} task${r.unlinked === 1 ? "" : "s"})` : ""}`);
        break;
      }
      case "move_task": {
        const ref = taskRef(op.task);
        const column = columnRef(op.column);
        if (!ref) { skipped.push("move_task: no task given and none targeted"); break; }
        if (!column) { skipped.push(`move_task ${ref}: no column given`); break; }
        const r = moveTask(doc, ref, column);
        if (!r.ok) { skipped.push(`move_task ${ref}: ${r.error}`); break; }
        doc = r.doc;
        focusKey = r.task.key;
        applied.push(`moved ${label(r.task)} to ${r.task.status ?? column}`);
        break;
      }
      case "add_column": {
        const after = op.after === undefined ? undefined : op.after === "" ? null : op.after;
        const r = addColumn(doc, op.name ?? op.title ?? op.column ?? "", { color: op.color, after });
        if (!r.ok) { skipped.push(`add_column: ${r.error}`); break; }
        doc = r.doc;
        applied.push(`added column ${r.column.title}${after === null ? " (first)" : after ? ` after ${after}` : ""}`);
        break;
      }
      case "rename_column": {
        const ref = columnRef(op.column);
        if (!ref) { skipped.push("rename_column: no column given and none targeted"); break; }
        const r = renameColumn(doc, ref, op.name ?? op.title, { color: op.color });
        if (!r.ok) { skipped.push(`rename_column ${ref}: ${r.error}`); break; }
        doc = r.doc;
        applied.push(`column ${ref} → ${r.column.title}${op.color !== undefined ? ` (${op.color || "no colour"})` : ""}`);
        break;
      }
      case "remove_column": {
        const ref = columnRef(op.column);
        if (!ref) { skipped.push("remove_column: no column given and none targeted"); break; }
        const r = removeColumn(doc, ref);
        if (!r.ok) { skipped.push(`remove_column ${ref}: ${r.error}`); break; }
        doc = r.doc;
        applied.push(`removed column ${r.column.title}${r.moved ? ` (${r.moved} task${r.moved === 1 ? "" : "s"} back to the first column)` : ""}`);
        break;
      }
      case "move_column": {
        const ref = columnRef(op.column);
        if (!ref) { skipped.push("move_column: no column given and none targeted"); break; }
        const r = moveColumn(doc, ref, op.after?.trim() ? op.after : null);
        if (!r.ok) { skipped.push(`move_column ${ref}: ${r.error}`); break; }
        doc = r.doc;
        applied.push(`moved column ${ref}${op.after?.trim() ? ` after ${op.after}` : " first"}`);
        break;
      }
      case "set_title": {
        if (op.title === undefined && op.description === undefined && op.due === undefined) { skipped.push("set_title: nothing to change"); break; }
        const r = setBoardMeta(doc, { title: op.title, description: op.description, due: op.due });
        if (!r.ok) { skipped.push(`set_title: ${r.error}`); break; }
        doc = r.doc;
        applied.push(`board ${(["title", "description", "due"] as const).filter((k) => op[k] !== undefined).join(", ")} set`);
        break;
      }
      default:
        skipped.push(`unknown op "${String((op as { op: unknown }).op)}"`);
    }
  }
  return { content: applied.length ? dumpKanban(doc) : content, applied, skipped, focusKey };
}
