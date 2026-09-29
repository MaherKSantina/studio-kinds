/**
 * A `.views` open — one list of items and a row of view buttons: the file's
 * own `views`, else one of every kind its roles allow (see viewsDoc.ts).
 * The first opens; a view shows the items its filter keeps; the open view
 * — a calendar view's scale and day, the parents a gantt or a sequence has
 * folded — is the page's for the session; an
 * item clicked in any view opens the item dialog, which draws the document
 * written into the item. A page view is the view's items through its own
 * Nunjucks template, in the sandboxed frame a `.page` renders in, filling the
 * pane; a calendar fills it too, its hours scrolling inside it. Nothing here
 * writes the file.
 */
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChartGantt, Kanban, LayoutTemplate, ListTree, Table2, Workflow } from "lucide-react";
import { cn } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { rulesSummary } from "../../lib/tablePolicy";
import { availableViews, docOfView, pageOfView, parseViews, type ViewName, type ViewSpec } from "../../lib/viewsDoc";
import { ItemDialog } from "./ItemDialog";
import { GanttPane, KanbanPane, SequencePane, TablePane, TreePane, type CalendarState, type PaneProps } from "./panes";

/** The frame a page view renders in, with Nunjucks in it — loaded when a page view first opens. */
const PageFrame = lazy(() => import("../page/PageFrame").then((m) => ({ default: m.PageFrame })));
/** The calendar, with FullCalendar in it — loaded when a calendar view first opens. */
const CalendarPane = lazy(() => import("./CalendarPane"));

const ICONS: Record<ViewName, React.ComponentType<{ className?: string }>> = {
  table: Table2, kanban: Kanban, calendar: CalendarDays, gantt: ChartGantt, sequence: Workflow, tree: ListTree, page: LayoutTemplate,
};
/** The views that draw the items themselves; a page's template draws its own. */
const PANES: Record<Exclude<ViewName, "page">, React.ComponentType<PaneProps>> = {
  table: TablePane, kanban: KanbanPane, calendar: CalendarPane, gantt: GanttPane, sequence: SequencePane, tree: TreePane,
};

/** What a view's rules do, in a line: "2 filters · sorted by from asc · first 10". */
const rulesLine = (v: ViewSpec): string =>
  rulesSummary({ role: "table", title: "", where: v.where, sort: v.sort, hide: [], problems: [], ...(v.limit ? { limit: v.limit } : {}) });

export default function ViewsView({ content, height = "100%", agentId, onOpenPath }: ViewerProps) {
  const doc = useMemo(() => parseViews(content), [content]);
  const offered = useMemo(() => availableViews(doc), [doc]);
  const [key, setKey] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Each calendar view's scale and day, and each gantt's or sequence's folded parents, by the view's key — kept while
  // the page is, across view switches.
  const [calendars, setCalendars] = useState<Record<string, CalendarState>>({});
  const [folds, setFolds] = useState<Record<string, string[]>>({});
  // A re-read that no longer offers the open view falls back to the first; an open item stays while its id survives.
  useEffect(() => { if (key && !offered.some((v) => v.key === key)) setKey(null); }, [offered, key]);
  useEffect(() => { if (open && !doc.items.some((it) => it.id === open)) setOpen(null); }, [doc, open]);
  const view = offered.find((v) => v.key === key) ?? offered[0];
  const seen = useMemo(() => (view ? docOfView(doc, view) : doc), [doc, view]);
  const page = useMemo(() => (view?.kind === "page" ? pageOfView(doc, view) : null), [doc, view]);
  const Pane = view && view.kind !== "page" ? PANES[view.kind] : TablePane;
  // A page and a calendar fill what is left under the buttons; every other view scrolls with the header.
  const fills = !!page || view?.kind === "calendar";
  const rules = view ? rulesLine(view) : "";

  return (
    <div style={{ height }} className={cn("min-h-0 overflow-y-auto bg-background p-3 text-foreground", fills && "flex flex-col")}>
      <div className="min-w-0">
        {doc.title && <h2 className="text-base font-semibold">{doc.title}</h2>}
        {doc.description && <p className="mt-0.5 max-w-[70ch] text-xs text-muted-foreground">{doc.description}</p>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {offered.map((v) => {
          const Icon = ICONS[v.kind];
          const active = v.key === view?.key;
          return (
            <button key={v.key} type="button" onClick={() => setKey(v.key)}
              title={`${v.label} — a ${v.kind}${rulesLine(v) ? ` · ${rulesLine(v)}` : ""}`}
              className={cn("flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[13px] font-medium",
                active ? "border-transparent bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
              <Icon className="size-3.5" /> {v.label}
            </button>
          );
        })}
        {offered.length === 0 && <span className="text-xs text-muted-foreground">No view — the file's `views` name none its roles allow.</span>}
        <span className="ml-auto text-xs text-muted-foreground">
          {seen.items.length !== doc.items.length ? `${seen.items.length} of ${doc.items.length} items` : `${doc.items.length} item${doc.items.length === 1 ? "" : "s"}`}
          {rules && <span> · {rules}</span>}
        </span>
      </div>
      <div className={cn("mt-3", fills && "min-h-0 flex-1")}>
        {page && view
          ? <Suspense fallback={<p className="text-xs text-muted-foreground">Loading the page…</p>}><PageFrame page={page} title={view.label} height="100%" /></Suspense>
          : <Suspense fallback={<p className="text-xs text-muted-foreground">Loading the calendar…</p>}>
              <Pane doc={seen} onOpen={setOpen} group={view?.group} calendar={view ? calendars[view.key] : undefined}
                onCalendar={(s) => { if (view) setCalendars((c) => ({ ...c, [view.key]: s })); }}
                folded={view ? folds[view.key] : undefined} onFolded={(ids) => { if (view) setFolds((f) => ({ ...f, [view.key]: ids })); }} />
            </Suspense>}
      </div>
      <ItemDialog doc={doc} itemId={open} onSelect={setOpen} onClose={() => setOpen(null)} host={{ agentId, onOpenPath }} />
    </div>
  );
}
