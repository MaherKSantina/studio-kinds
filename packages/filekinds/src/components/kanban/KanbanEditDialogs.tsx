/**
 * The board's own edit dialogs — a task's words and place, a column's title
 * and colour. They gather a DRAFT; the board turns it into edits through
 * `kanbanEdit`, the same mutators the Ask panel uses, so a typed edit and a
 * spoken one cannot disagree about what the file may hold.
 */
import * as React from "react";
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea,
} from "crosscut";
import type { KanbanBoardDoc, KanbanTask } from "../../lib/kanbanDoc";

export interface TaskDraft {
  title: string;
  /** The one line under the title (the file's `note`). */
  note: string;
  /** The task's own markdown (the file's `body`). */
  body: string;
  status: string;
  needs: string[];
  file: string;
  section: string;
}

export const draftOf = (t: KanbanTask | null, status = ""): TaskDraft => ({
  title: t?.title ?? "", note: t?.note ?? "", body: t?.body ?? "", status: t?.status ?? status,
  needs: t?.needs ?? [], file: t?.file ?? "", section: t?.section ?? "",
});

const field = "h-8 rounded-md border bg-background px-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function TaskEditDialog({ open, doc, initial, editingKey, onClose, onSubmit }: {
  open: boolean;
  doc: KanbanBoardDoc;
  initial: TaskDraft;
  /** The task being edited — left out of the prerequisites it may pick. Null = a new task. */
  editingKey: string | null;
  onClose: () => void;
  onSubmit: (draft: TaskDraft) => void;
}) {
  const [d, setD] = React.useState<TaskDraft>(initial);
  React.useEffect(() => { if (open) setD(initial); }, [open, initial]);
  const others = doc.tasks.filter((t) => t.key !== editingKey);
  const ok = !!d.title.trim();
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const toggleNeed = (key: string) => set("needs", d.needs.includes(key) ? d.needs.filter((k) => k !== key) : [...d.needs, key]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingKey ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription className="sr-only">The task's title, description, details and place on the board</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-[12px]">
          <div className="grid gap-1">
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" autoFocus value={d.title} onChange={(e) => set("title", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && ok) onSubmit(d); }} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="task-note">Description <span className="font-normal text-muted-foreground">— one line under the title</span></Label>
            <Input id="task-note" value={d.note} onChange={(e) => set("note", e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="task-body">Details <span className="font-normal text-muted-foreground">— markdown, what doing this means</span></Label>
            <Textarea id="task-body" rows={5} value={d.body} onChange={(e) => set("body", e.target.value)} className="font-mono text-[12px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="task-status">Column</Label>
              <select id="task-status" value={d.status} onChange={(e) => set("status", e.target.value)} className={field}>
                {!doc.columns.length && <option value="">(the board's one column)</option>}
                {doc.columns.map((c) => <option key={c.title} value={c.title}>{c.title}</option>)}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>Needs <span className="font-normal text-muted-foreground">— done first</span></Label>
              <div className="max-h-28 overflow-y-auto rounded-md border px-2 py-1">
                {others.length === 0 && <span className="text-muted-foreground">no other tasks</span>}
                {others.map((t) => (
                  <label key={t.key} className="flex cursor-pointer items-center gap-1.5 py-0.5">
                    <input type="checkbox" checked={d.needs.includes(t.key)} onChange={() => toggleNeed(t.key)} />
                    <span className="min-w-0 truncate">{t.title}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="task-file">File <span className="font-normal text-muted-foreground">— a ref, optional</span></Label>
              <Input id="task-file" value={d.file} onChange={(e) => set("file", e.target.value)} placeholder="notes.md or /Area/doc.brief" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="task-section">Section <span className="font-normal text-muted-foreground">— of a .brief</span></Label>
              <Input id="task-section" value={d.section} onChange={(e) => set("section", e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!ok} onClick={() => onSubmit(d)}>{editingKey ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ColumnDraft {
  title: string;
  color: string;
}

export function ColumnDialog({ open, initial, editing, onClose, onSubmit }: {
  open: boolean;
  initial: ColumnDraft;
  /** The column being retitled; null = a new one. */
  editing: string | null;
  onClose: () => void;
  onSubmit: (draft: ColumnDraft) => void;
}) {
  const [d, setD] = React.useState<ColumnDraft>(initial);
  React.useEffect(() => { if (open) setD(initial); }, [open, initial]);
  const ok = !!d.title.trim();
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? `Rename “${editing}”` : "New column"}</DialogTitle>
          <DialogDescription className="sr-only">The column's title and colour</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-[12px]">
          <div className="grid gap-1">
            <Label htmlFor="col-title">Title</Label>
            <Input id="col-title" autoFocus value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && ok) onSubmit(d); }} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="col-color">Colour <span className="font-normal text-muted-foreground">— optional</span></Label>
            <div className="flex items-center gap-2">
              <input type="color" aria-label="Pick a colour" value={/^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#94a3b8"}
                onChange={(e) => setD({ ...d, color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border bg-background p-0.5" />
              <Input id="col-color" value={d.color} placeholder="#3b82f6" onChange={(e) => setD({ ...d, color: e.target.value })} />
              {d.color && <Button variant="ghost" size="sm" onClick={() => setD({ ...d, color: "" })}>None</Button>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!ok} onClick={() => onSubmit(d)}>{editing ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
