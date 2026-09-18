/**
 * The task dialog both kanban lenses share (board and calendar): the task's
 * facts, its dependency edges as jumps, its own authored markdown, and —
 * when it carries a `file:` ref — the backing document rendered by its own
 * kind (a `.brief` sliced to the task's `section:`), the memory view's
 * unit-dialog pattern.
 */
import React, { useEffect, useState } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import {
  CopyHandleButton, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  SUITE_APPS, cn, resolveRef,
} from "crosscut";
import { MarkdownPane } from "../../lib/MarkdownPane";
import { readVirtualDirectoryFile } from "../../api";
import {
  briefSectionSlice, columnIndexOf, dependentsOf,
  type KanbanBoardDoc, type KanbanColumn, type KanbanTask,
} from "../../lib/kanbanDoc";

// DocumentPreview pulls in every kind's renderer; load it only when a card
// actually opens so the board itself stays light.
const DocumentPreviewLazy = React.lazy(() =>
  import("../DocumentPreview").then((m) => ({ default: m.DocumentPreview })));

/** One dependency edge in the dialog, as a jump to the other card. */
function EdgeChip({ task, columns, onJump }: { task: KanbanTask; columns: KanbanColumn[]; onJump: () => void }) {
  const col = columns[columnIndexOf(task, columns)];
  return (
    <button type="button" onClick={onJump}
      className="flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs hover:bg-accent">
      <span className="size-2 rounded-full" style={{ background: col?.color ?? "#94a3b8" }} />
      <span>{task.title}</span>
      {col && <span className="text-muted-foreground">· {col.title}</span>}
    </button>
  );
}

export function TaskDialog({ doc, base, taskKey, onSelect, onClose, onEdit, onDelete }: {
  doc: KanbanBoardDoc; base: string; taskKey: string | null;
  onSelect: (key: string) => void; onClose: () => void;
  /** Present on an editable board: open the task's edit dialog / ask to delete it. */
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const task = doc.tasks.find((t) => t.key === taskKey) ?? null;
  const abs = task?.file ? resolveRef(base, task.file) : null;
  const [content, setContent] = useState<{ path: string; body: string } | null>(null);

  const section = task?.section;
  useEffect(() => {
    setContent(null);
    if (!abs) return;
    let live = true;
    readVirtualDirectoryFile(abs, abs).then(
      (r) => {
        if (!live) return;
        // A task cut from one section of a brief opens just that section;
        // no match (or any other kind) falls back to the whole document.
        const sliced = section && abs.toLowerCase().endsWith(".brief")
          ? briefSectionSlice(r.content, section) : null;
        setContent({ path: abs, body: sliced ?? r.content });
      },
      () => { /* an unreadable ref just shows no preview */ },
    );
    return () => { live = false; };
  }, [abs, section]);

  const needs = task ? task.needs.map((k) => doc.tasks.find((t) => t.key === k)).filter((t): t is KanbanTask => !!t) : [];
  const dependents = task ? dependentsOf(doc.tasks, task.key) : [];

  return (
    <Dialog open={task !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[94dvh] flex-col" style={{ maxWidth: "min(1500px, 96vw)" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span className="min-w-0 truncate">{task?.title ?? ""}</span>
            {onEdit && (
              <button type="button" title="Edit this task" onClick={onEdit}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                <Pencil className="size-3.5" />
              </button>
            )}
            {onDelete && (
              <button type="button" title="Delete this task…" onClick={onDelete}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive">
                <Trash2 className="size-3.5" />
              </button>
            )}
            {abs && <CopyHandleButton path={abs} />}
            {abs && (
              <a href={`${SUITE_APPS.nodes.origin}/?path=${encodeURIComponent(abs)}`}
                title="Open in Nodes" className="text-muted-foreground hover:text-foreground">
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">The task, its dependency edges, and its backing document</DialogDescription>
        </DialogHeader>
        {task && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            {task.note && <span className="text-muted-foreground">{task.note}</span>}
            {needs.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground">needs</span>
                {needs.map((t) => <EdgeChip key={t.key} task={t} columns={doc.columns} onJump={() => onSelect(t.key)} />)}
              </span>
            )}
            {dependents.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground">depended on by</span>
                {dependents.map((t) => <EdgeChip key={t.key} task={t} columns={doc.columns} onJump={() => onSelect(t.key)} />)}
              </span>
            )}
            {needs.length === 0 && dependents.length === 0 && (
              <span className="text-muted-foreground">no dependency edges</span>
            )}
          </div>
        )}
        {task?.body && (
          // The task's own words lead; the source slice is provenance below.
          <div className={cn("overflow-y-auto rounded border p-3", abs ? "max-h-[45%] shrink-0" : "min-h-0 flex-1")}>
            <MarkdownPane content={task.body} height="auto" />
          </div>
        )}
        {abs && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border">
            <div className="border-b bg-muted/40 px-2 py-1 text-[13px] text-muted-foreground">
              Source · {task?.file}{task?.section ? ` · § ${task.section}` : ""}
            </div>
            {content ? (
              <div className="min-h-0 flex-1 overflow-hidden">
                <DocumentPreviewLazy key={content.path} path={content.path} content={content.body} />
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            )}
          </div>
        )}
        {!task?.body && !abs && (
          <p className="p-4 text-sm text-muted-foreground">No content authored — the card is the whole task.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
