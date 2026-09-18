/**
 * A `.calendar` open — the derived schedule of one `.kanban` board on a
 * month grid. Nothing here is authored: the board's dependency edges chain
 * tasks backward from the due date (kanbanDoc's `scheduleTasks`), and this
 * view lays the result on the journey's own `monthGrid`, so both calendars
 * in the suite read the same way. Chips take their color from the task's
 * status column; the due day wears a ring; tasks that can't be scheduled
 * (no due anywhere downstream, or a dependency cycle) are listed plainly
 * below rather than being given invented dates.
 */
import React, { useEffect, useMemo, useState } from "react";
import { cn, resolveRef } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { readVirtualDirectoryFile } from "../../api";
import { parseCalendarLens } from "../../lib/calendarDoc";
import {
  columnIndexOf, parseKanban, resolveBoardSource, scheduleTasks,
  type KanbanBoardDoc, type KanbanTask,
} from "../../lib/kanbanDoc";
import { monthGrid, type CalTask } from "../../lib/journeyStages";
import { TaskDialog } from "./TaskDialog";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarLensView({ content, path, height }: ViewerProps) {
  const lens = useMemo(() => parseCalendarLens(content), [content]);
  const base = path ?? "/";
  const [board, setBoard] = useState<KanbanBoardDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const boardAbs = lens.board ? resolveRef(base, lens.board) : null;
  useEffect(() => {
    setBoard(null); setErr(null);
    if (!boardAbs) return;
    let live = true;
    readVirtualDirectoryFile(boardAbs, boardAbs).then(
      async (r) => {
        // The board may itself be a lens over a points stream — resolve that
        // too, so the calendar schedules the same merged tasks the board shows.
        const resolved = await resolveBoardSource(parseKanban(r.content), boardAbs);
        if (live) setBoard(resolved);
      },
      () => { if (live) setErr(`could not read ${boardAbs}`); },
    );
    return () => { live = false; };
  }, [boardAbs]);

  const due = lens.due ?? board?.due;
  const { scheduled, unscheduled } = useMemo(
    () => (board ? scheduleTasks(board, lens.due) : { scheduled: [], unscheduled: [] }),
    [board, lens.due],
  );
  const calTasks: CalTask[] = useMemo(() => scheduled.map((s) => ({
    label: s.task.title, start: s.start, end: s.end, group: s.task.status ?? "",
  })), [scheduled]);
  const grid = useMemo(() => monthGrid(calTasks, due), [calTasks, due]);
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState<string | null>(null);
  const keyOfLabel = useMemo(
    () => new Map(scheduled.map((s) => [s.task.title, s.task.key])), [scheduled]);

  const colorOf = (label: string): string => {
    if (!board) return "#94a3b8";
    const t = scheduled.find((s) => s.task.title === label)?.task;
    return (t && board.columns[columnIndexOf(t, board.columns)]?.color) ?? "#94a3b8";
  };

  return (
    <div style={{ height }} className="min-h-0 overflow-y-auto bg-background p-3 text-foreground">
      {lens.title && <h2 className="text-base font-semibold">{lens.title}</h2>}
      <p className="mt-0.5 text-xs text-muted-foreground">
        {lens.description ?? "Derived schedule — dependency edges chained backward from the due date."}
        {due && <> Due <span className="font-medium text-foreground">{due}</span>.</>}
      </p>
      {err && <p className="mt-3 text-sm text-muted-foreground">{err}</p>}
      {!lens.board && <p className="mt-3 text-sm text-muted-foreground">No `board:` ref — nothing to derive from.</p>}
      {board && (
        <>
          <h3 className="mt-3 text-sm font-medium">{grid.title}</h3>
          <div className="mt-1.5 overflow-x-auto pb-2">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="px-1.5 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">{d}</div>
                ))}
                {grid.weeks.flat().map((cell) => (
                  <div key={cell.iso}
                    className={cn(
                      "min-h-16 rounded border p-1",
                      cell.inMonth ? "bg-background" : "bg-muted/40",
                      cell.iso === due && "ring-2 ring-amber-400",
                      cell.iso === today && "border-foreground/40",
                    )}>
                    <div className={cn("text-[13px]", cell.inMonth ? "text-muted-foreground" : "text-muted-foreground/50")}>
                      {cell.day}{cell.iso === today && " · today"}
                    </div>
                    <div className="mt-0.5 space-y-0.5">
                      {cell.tasks.map((t) => (
                        <button key={t.label} type="button"
                          title={`${t.label} · ${t.start} → ${t.end}`}
                          onClick={() => setOpen(keyOfLabel.get(t.label) ?? null)}
                          className="block w-full truncate rounded px-1 py-0.5 text-left text-[13px] text-white hover:opacity-80"
                          style={{ background: colorOf(t.label) }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {unscheduled.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Unscheduled (no due anywhere downstream, or a dependency cycle):{" "}
              {unscheduled.map((t: KanbanTask) => t.title).join(" · ")}
            </p>
          )}
          {boardAbs && (
            <React.Suspense fallback={null}>
              <TaskDialog doc={board} base={boardAbs} taskKey={open}
                onSelect={(k) => setOpen(k)} onClose={() => setOpen(null)} />
            </React.Suspense>
          )}
        </>
      )}
    </div>
  );
}
