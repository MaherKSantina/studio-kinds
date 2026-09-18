/**
 * A `.kanban` open — a task board whose COLUMNS are status and whose ROWS
 * are DERIVED dependency groups (see kanbanDoc.ts): row one needs nothing,
 * each later row builds on the ones above it, and a board with no
 * dependencies collapses to the single row it really is.
 *
 * A board with a `source:` ref is a LENS over a points stream: the tasks'
 * identity, words and status live on the points; the board contributes only
 * its own domains (dependency edges, durations, provenance slices).
 *
 * Clicking a card opens the shared TaskDialog — the task's facts, both
 * sides of its dependency edges, and its backing document rendered by its
 * own kind.
 *
 * With an `onChange` from the host the board EDITS: columns are added,
 * retitled and removed from their headers, tasks from a "+" under each
 * column and from the card dialog, every deletion behind a confirmation,
 * and — when the host configured the ask worker — an Ask panel lands one
 * line of instruction through the same mutators (`kanbanEdit`, `kanbanAsk`).
 * Edits go against the FILE's own document, never the drawn one: a sourced
 * board's tasks are not its to write, so there only columns change.
 */
import React, { useEffect, useMemo, useState } from "react";
import { MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog, cn, resolveRef } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { configuredAsk } from "../../api";
import {
  columnIndexOf, dependencyRows, dependentsOf, parseKanban, resolveBoardSource,
  type KanbanBoardDoc, type KanbanColumn, type KanbanTask,
} from "../../lib/kanbanDoc";
import {
  addColumn, addTask, dumpKanban, removeColumn, removeTask, renameColumn, updateTask, type KanbanEdit,
} from "../../lib/kanbanEdit";
import type { KanbanAskTarget } from "../../lib/kanbanAsk";
import { iconForFsPath } from "../kindIcons";
import { TaskDialog } from "./TaskDialog";
import { ColumnDialog, TaskEditDialog, draftOf, type ColumnDraft, type TaskDraft } from "./KanbanEditDialogs";
import KanbanAsk from "./KanbanAsk";

function TaskCard({ task, base, dependents, onOpen }: {
  task: KanbanTask; base: string; dependents: number; onOpen: () => void;
}) {
  const Icon = task.file ? iconForFsPath(resolveRef(base, task.file), "file") : null;
  return (
    <button type="button" onClick={onOpen}
      className="w-full rounded-md border bg-background p-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2">
      <span className="block font-medium leading-snug">{task.title}</span>
      {task.note && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{task.note}</span>}
      {(Icon || task.needs.length > 0 || dependents > 0) && (
        <span className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
          {Icon && <Icon className="size-3.5" />}
          {task.needs.length > 0 && <span title={`needs ${task.needs.length}`}>⇠ {task.needs.length}</span>}
          {dependents > 0 && <span title={`${dependents} depend on this`}>{dependents} ⇢</span>}
        </span>
      )}
    </button>
  );
}

type EditDialog =
  | { kind: "task"; key: string | null; status: string }
  | { kind: "column"; title: string | null }
  | { kind: "delete-task"; key: string }
  | { kind: "delete-column"; title: string }
  | null;

const iconButton = "rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground";

export default function KanbanBoardView({ content, path, height, onChange, editable: mayAuthor }: ViewerProps) {
  // `parsed` is the FILE; `doc` is what is DRAWN (the source applied). Every
  // edit is made to the file and read back through the host's content.
  const parsed = useMemo(() => parseKanban(content), [content]);
  const base = path ?? "/";
  const [doc, setDoc] = useState<KanbanBoardDoc>(parsed);
  useEffect(() => {
    setDoc(parsed);
    if (!parsed.source) return;
    let live = true;
    resolveBoardSource(parsed, base).then((d) => { if (live) setDoc(d); });
    return () => { live = false; };
  }, [parsed, base]);

  // Authoring (tasks, columns, Ask) needs a host that writes AND authors here; `editable={false}`
  // with an `onChange` is a host that only persists what the board offers on its own.
  const editable = !!onChange && mayAuthor !== false;
  const canEditTasks = editable && !parsed.source;
  const askApi = editable ? configuredAsk() : null;

  const columns: KanbanColumn[] = doc.columns.length ? doc.columns : [{ title: "Tasks" }];
  const rows = useMemo(() => dependencyRows(doc.tasks), [doc.tasks]);
  const [open, setOpen] = useState<string | null>(null);
  // Where the Ask aims: the card last opened, the column last clicked.
  const [aimTask, setAimTask] = useState<string | null>(null);
  const [aimColumn, setAimColumn] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askFocus, setAskFocus] = useState(0);
  const [dialog, setDialog] = useState<EditDialog>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = (r: KanbanEdit): boolean => {
    if (!r.ok) { setError(r.error); return false; }
    setError(null);
    onChange?.(dumpKanban(r.doc));
    return true;
  };

  const taskDraft = useMemo<TaskDraft>(() => (dialog?.kind === "task"
    ? draftOf(dialog.key ? parsed.tasks.find((t) => t.key === dialog.key) ?? null : null, dialog.status)
    : draftOf(null)), [dialog, parsed]);
  const columnDraft = useMemo<ColumnDraft>(() => {
    const c = dialog?.kind === "column" && dialog.title ? parsed.columns.find((x) => x.title === dialog.title) : undefined;
    return { title: c?.title ?? "", color: c?.color ?? "" };
  }, [dialog, parsed]);

  const submitTask = (d: TaskDraft) => {
    const patch = { title: d.title, note: d.note, body: d.body, status: d.status, needs: d.needs, file: d.file, section: d.section };
    const r = dialog?.kind === "task" && dialog.key ? updateTask(parsed, dialog.key, patch) : addTask(parsed, patch);
    if (commit(r)) { setDialog(null); if (r.ok) setAimTask(r.task.key); }
  };
  const submitColumn = (d: ColumnDraft) => {
    const r = dialog?.kind === "column" && dialog.title
      ? renameColumn(parsed, dialog.title, d.title, { color: d.color })
      : addColumn(parsed, d.title, { color: d.color });
    if (commit(r)) {
      setDialog(null);
      if (r.ok && aimColumn && dialog?.kind === "column" && dialog.title === aimColumn) setAimColumn(r.column.title);
    }
  };
  const deleteTask = (key: string) => {
    if (!commit(removeTask(parsed, key))) return;
    setDialog(null);
    if (open === key) setOpen(null);
    if (aimTask === key) setAimTask(null);
  };
  const deleteColumn = (title: string) => {
    if (!commit(removeColumn(parsed, title))) return;
    setDialog(null);
    if (aimColumn === title) setAimColumn(null);
  };

  const target: KanbanAskTarget = { taskKey: open ?? aimTask, column: aimColumn };
  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${columns.length}, minmax(200px, 1fr))`,
    gap: 8,
  };
  return (
    <div style={{ height }} className="flex min-h-0 bg-background text-foreground">
      <div className="min-w-0 flex-1 overflow-y-auto p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {doc.title && <h2 className="text-base font-semibold">{doc.title}</h2>}
            {doc.description && <p className="mt-0.5 max-w-[70ch] text-xs text-muted-foreground">{doc.description}</p>}
            {doc.source && <p className="mt-0.5 text-[13px] text-muted-foreground">tasks sourced from {doc.source} — edit them there; this board owns its columns and edges</p>}
          </div>
          {editable && (
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" title="Add a column" onClick={() => setDialog({ kind: "column", title: null })}
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground">
                <Plus className="size-3" /> Column
              </button>
              {askApi && (
                <button type="button" title="Ask — change the board from one line of instruction; click a card or a column to aim there"
                  onClick={() => { setAskOpen((o) => !o); setAskFocus((k) => k + 1); }}
                  className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-[13px] hover:bg-accent hover:text-foreground", askOpen ? "text-primary" : "text-muted-foreground")}>
                  <MessageSquare className="size-3" /> Ask
                </button>
              )}
            </div>
          )}
        </div>
        {error && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-xs text-destructive">
            <span className="flex-1">{error}</span>
            <button type="button" className="underline" onClick={() => setError(null)}>dismiss</button>
          </div>
        )}
        <div className="mt-3 overflow-x-auto pb-2">
          <div className="min-w-fit space-y-3">
            <div style={grid}>
              {columns.map((c) => {
                const real = doc.columns.length > 0;
                const aimed = aimColumn === c.title;
                return (
                  <div key={c.title}
                    className={cn("group flex items-center gap-1.5 rounded px-1 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground",
                      editable && real && "cursor-pointer hover:bg-accent/60", aimed && "bg-accent text-foreground")}
                    title={editable && real ? "Click to aim the Ask panel at this column" : undefined}
                    onClick={editable && real ? () => setAimColumn((cur) => (cur === c.title ? null : c.title)) : undefined}>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: c.color ?? "#94a3b8" }} />
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    {editable && real && (
                      <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" title="Rename or recolour this column" className={iconButton}
                          onClick={(e) => { e.stopPropagation(); setDialog({ kind: "column", title: c.title }); }}>
                          <Pencil className="size-3" />
                        </button>
                        <button type="button" title="Delete this column…" className={cn(iconButton, "hover:text-destructive")}
                          onClick={(e) => { e.stopPropagation(); setDialog({ kind: "delete-column", title: c.title }); }}>
                          <Trash2 className="size-3" />
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {rows.map((row, i) => (
              <section key={i} className="rounded-lg border bg-muted/30 p-2">
                <header className="mb-1.5 px-1 text-[13px] font-medium text-muted-foreground">
                  Row {i + 1}{i === 0 ? " · nothing blocks these" : ` · builds on row ${i}`}
                </header>
                <div style={grid}>
                  {columns.map((c, ci) => (
                    <div key={c.title} className={cn("flex min-h-12 flex-col gap-1.5")}>
                      {row.filter((t) => columnIndexOf(t, columns) === ci).map((t) => (
                        <TaskCard key={t.key} task={t} base={base}
                          dependents={dependentsOf(doc.tasks, t.key).length}
                          onOpen={() => { setOpen(t.key); setAimTask(t.key); }} />
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {rows.length === 0 && (
              <p className="px-1 text-xs text-muted-foreground">
                {doc.source ? "No tasks arrived from the source yet." : "No tasks yet."}
              </p>
            )}
            {canEditTasks && (
              <div style={grid}>
                {columns.map((c) => (
                  <button key={c.title} type="button" title={`Add a task in ${c.title}`}
                    onClick={() => setDialog({ kind: "task", key: null, status: doc.columns.length ? c.title : "" })}
                    className="flex items-center justify-center gap-1 rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                    <Plus className="size-3" /> Add task
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <React.Suspense fallback={null}>
          <TaskDialog doc={doc} base={base} taskKey={open}
            onSelect={(k) => { setOpen(k); setAimTask(k); }} onClose={() => setOpen(null)}
            onEdit={canEditTasks && open ? () => setDialog({ kind: "task", key: open, status: "" }) : undefined}
            onDelete={canEditTasks && open ? () => setDialog({ kind: "delete-task", key: open }) : undefined} />
        </React.Suspense>
        {editable && (
          <>
            <TaskEditDialog open={dialog?.kind === "task"} doc={parsed} initial={taskDraft}
              editingKey={dialog?.kind === "task" ? dialog.key : null}
              onClose={() => setDialog(null)} onSubmit={submitTask} />
            <ColumnDialog open={dialog?.kind === "column"} initial={columnDraft}
              editing={dialog?.kind === "column" ? dialog.title : null}
              onClose={() => setDialog(null)} onSubmit={submitColumn} />
            <ConfirmDeleteDialog open={dialog?.kind === "delete-task"}
              text={dialog?.kind === "delete-task" ? (() => {
                const t = parsed.tasks.find((x) => x.key === dialog.key);
                const dependents = dependentsOf(parsed.tasks, dialog.key).length;
                return `Delete “${t?.title ?? dialog.key}”?${dependents ? ` ${dependents} task${dependents === 1 ? "" : "s"} depend${dependents === 1 ? "s" : ""} on it — those edges are cut.` : ""} This cannot be undone.`;
              })() : ""}
              onClose={() => setDialog(null)} onConfirm={() => { if (dialog?.kind === "delete-task") deleteTask(dialog.key); }} />
            <ConfirmDeleteDialog open={dialog?.kind === "delete-column"}
              text={dialog?.kind === "delete-column" ? (() => {
                const n = parsed.tasks.filter((t) => t.status && t.status.toLowerCase() === dialog.title.toLowerCase()).length;
                const others = parsed.columns.filter((c) => c.title !== dialog.title);
                return `Delete the column “${dialog.title}”?${n ? ` ${n} task${n === 1 ? "" : "s"} in it fall${n === 1 ? "s" : ""} back to ${others[0] ? `“${others[0].title}”` : "the board's one column"}.` : ""} This cannot be undone.`;
              })() : ""}
              onClose={() => setDialog(null)} onConfirm={() => { if (dialog?.kind === "delete-column") deleteColumn(dialog.title); }} />
          </>
        )}
      </div>
      {askApi && askOpen && (
        <div className="flex w-[340px] shrink-0 flex-col border-l bg-card">
          <KanbanAsk api={askApi} content={content} target={target}
            onApplied={(next, focusKey) => { setError(null); onChange?.(next); if (focusKey) setAimTask(focusKey); if (open && !parseKanban(next).tasks.some((t) => t.key === open)) setOpen(null); }}
            onAim={(t) => { setAimTask(t.taskKey); if (open && !t.taskKey) setOpen(null); setAimColumn(t.column); }}
            focusKey={askFocus} onClose={() => setAskOpen(false)} resetKey={path} />
        </div>
      )}
    </div>
  );
}
