/**
 * The five panes of a `.views` document — the same items laid out as a
 * table, a kanban, a calendar, a gantt (nested by `parent`) and a dependency
 * tree (by `previous`). Every pane reads the document as its view sees it
 * (viewsDoc.ts) and calls `onOpen(id)` for an item; none writes anything.
 */
import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "crosscut";
import { monthGrid, type CalTask } from "../../lib/journeyStages";
import {
  addDays, cellText, columnIndexOf, columnsOf, ganttOf, tableColumnsOf, treeOf,
  type TreeNode, type ViewsDoc, type ViewsItem,
} from "../../lib/viewsDoc";
import { colorOf } from "./ItemDialog";

export interface PaneProps { doc: ViewsDoc; onOpen: (id: string) => void }

/* ── Table ──────────────────────────────────────────────────────────────── */

export function TablePane({ doc, onOpen }: PaneProps) {
  const cols = useMemo(() => tableColumnsOf(doc), [doc]);
  if (!doc.items.length) return <Empty>No items yet.</Empty>;
  return (
    <div className="overflow-auto rounded-lg border">
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>{cols.map((c) => <th key={c} className="whitespace-nowrap border-b px-2 py-1 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>
          {doc.items.map((it) => (
            <tr key={it.id} className="cursor-pointer border-b last:border-b-0 hover:bg-accent/60" onClick={() => onOpen(it.id)}>
              {cols.map((c) => (
                <td key={c} className={cn("max-w-[32ch] truncate px-2 py-1 align-top", c === doc.fields.id && "font-mono text-muted-foreground")}
                  title={cellText(it.fields[c])}>
                  {cellText(it.fields[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Kanban ─────────────────────────────────────────────────────────────── */

function Card({ item, columns, onOpen }: { item: ViewsItem; columns: string[]; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}
      className="w-full rounded-md border bg-background p-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2">
      <span className="block font-medium leading-snug">{item.title}</span>
      {(item.start || item.previous.length > 0) && (
        <span className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
          {item.start && <span className="font-mono">{item.start}{item.end && item.end !== item.start ? ` → ${item.end}` : ""}</span>}
          {item.previous.length > 0 && <span title={`after ${item.previous.join(", ")}`}>⇠ {item.previous.length}</span>}
        </span>
      )}
      <span className="sr-only">{columns[columnIndexOf(item, columns)]}</span>
    </button>
  );
}

export function KanbanPane({ doc, onOpen }: PaneProps) {
  const columns = columnsOf(doc);
  if (!columns.length) return <Empty>No statuses found — nothing to lay in columns.</Empty>;
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: `repeat(${columns.length}, minmax(200px, 1fr))`, gap: 8 };
  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-fit">
        <div style={grid}>
          {columns.map((c, ci) => {
            const n = doc.items.filter((it) => columnIndexOf(it, columns) === ci).length;
            return (
              <div key={c} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf({ id: "", title: "", status: c, previous: [], fields: {} }, columns) }} />
                <span className="min-w-0 flex-1 truncate">{c}</span>
                <span className="font-normal">{n}</span>
              </div>
            );
          })}
        </div>
        <div style={grid} className="mt-1.5 rounded-lg border bg-muted/30 p-2">
          {columns.map((c, ci) => (
            <div key={c} className="flex min-h-12 flex-col gap-1.5">
              {doc.items.filter((it) => columnIndexOf(it, columns) === ci).map((it) => (
                <Card key={it.id} item={it} columns={columns} onOpen={() => onOpen(it.id)} />
              ))}
            </div>
          ))}
        </div>
        {!doc.items.length && <p className="mt-2 px-1 text-xs text-muted-foreground">No items yet.</p>}
      </div>
    </div>
  );
}

/* ── Calendar ───────────────────────────────────────────────────────────── */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthOf = (iso: string) => iso.slice(0, 7);
const shiftMonth = (ym: string, by: number): string => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

export function CalendarPane({ doc, onOpen }: PaneProps) {
  const columns = columnsOf(doc);
  const dated = useMemo(() => doc.items.filter((it) => it.start), [doc.items]);
  const undated = useMemo(() => doc.items.filter((it) => !it.start), [doc.items]);
  const today = new Date().toISOString().slice(0, 10);
  const firstMonth = dated.length ? monthOf(dated.map((it) => it.start!).sort()[0]) : monthOf(today);
  const [month, setMonth] = useState(firstMonth);
  const tasks: CalTask[] = useMemo(() => dated.map((it) => ({
    label: it.title, start: it.start!, end: it.end && it.end >= it.start! ? it.end : it.start!, group: it.id,
  })), [dated]);
  const grid = useMemo(() => monthGrid(tasks, `${month}-15`), [tasks, month]);
  const byId = useMemo(() => new Map(doc.items.map((it) => [it.id, it])), [doc.items]);
  const nav = "rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground";
  return (
    <div>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{grid.title}</h3>
        <button type="button" className={nav} title="The month before" onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft className="size-3" /></button>
        <button type="button" className={nav} title="The month after" onClick={() => setMonth((m) => shiftMonth(m, 1))}><ChevronRight className="size-3" /></button>
        <button type="button" className={nav} onClick={() => setMonth(monthOf(today))}>Today</button>
        {firstMonth !== monthOf(today) && <button type="button" className={nav} onClick={() => setMonth(firstMonth)}>First item</button>}
      </div>
      <div className="mt-1.5 overflow-x-auto pb-2">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-1.5 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">{d}</div>
            ))}
            {grid.weeks.flat().map((cell) => (
              <div key={cell.iso}
                className={cn("min-h-16 rounded border p-1", cell.inMonth ? "bg-background" : "bg-muted/40", cell.iso === today && "border-foreground/40")}>
                <div className={cn("text-[13px]", cell.inMonth ? "text-muted-foreground" : "text-muted-foreground/50")}>
                  {cell.day}{cell.iso === today && " · today"}
                </div>
                <div className="mt-0.5 space-y-0.5">
                  {cell.tasks.map((t) => {
                    const it = byId.get(t.group);
                    return (
                      <button key={t.group} type="button" title={`${t.label} · ${t.start} → ${t.end}`}
                        onClick={() => onOpen(t.group)}
                        className="block w-full truncate rounded px-1 py-0.5 text-left text-[13px] text-white hover:opacity-80"
                        style={{ background: it ? colorOf(it, columns) : "#94a3b8" }}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {undated.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          No start date:{" "}
          {undated.map((it, i) => (
            <React.Fragment key={it.id}>
              {i > 0 && " · "}
              <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-foreground" onClick={() => onOpen(it.id)}>{it.title}</button>
            </React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
}

/* ── Gantt ──────────────────────────────────────────────────────────────── */

const DAY_W = 26;
const ROW_H = 30;
const LABEL_W = 220;
const HEAD_H = 40;

export function GanttPane({ doc, onOpen }: PaneProps) {
  const columns = columnsOf(doc);
  const g = useMemo(() => ganttOf(doc), [doc]);
  const today = new Date().toISOString().slice(0, 10);
  if (!g.rows.length) return <Empty>No item has a start and an end date, nor children with them — nothing to draw.</Empty>;
  const days = Array.from({ length: g.days }, (_, i) => addDays(g.first, i));
  const width = LABEL_W + g.days * DAY_W;
  const height = HEAD_H + g.rows.length * ROW_H;
  const rowIndex = new Map(g.rows.map((r, i) => [r.item.id, i]));
  const x = (day: number) => LABEL_W + day * DAY_W;
  const y = (i: number) => HEAD_H + i * ROW_H + ROW_H / 2;
  // An arrow from the end of every previous item to the start of the one after it.
  const arrows = g.rows.flatMap((r, i) => r.item.previous.flatMap((p) => {
    const pi = rowIndex.get(p);
    if (pi === undefined) return [];
    const pr = g.rows[pi];
    const x1 = x(pr.to + 1), y1 = y(pi), x2 = x(r.from), y2 = y(i);
    const mid = x2 > x1 + 8 ? x1 + (x2 - x1) / 2 : x1 + 6;
    const d = x2 > x1 + 8
      ? `M${x1},${y1} H${mid} V${y2} H${x2}`
      : `M${x1},${y1} H${mid} V${y2 > y1 ? y2 - ROW_H / 2 : y2 + ROW_H / 2} H${x2 - 6} V${y2} H${x2}`;
    return [{ key: `${p}->${r.item.id}`, d }];
  }));
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <div className="relative" style={{ width, height }}>
          {/* The day scale: the month named where it begins, then every day. */}
          {days.map((d, i) => {
            const first = d.endsWith("-01") || i === 0;
            const weekend = [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
            return (
              <div key={d} className={cn("absolute top-0 border-l text-center", weekend ? "bg-muted/50" : "", d === today && "bg-amber-50")}
                style={{ left: x(i), width: DAY_W, height }}>
                {first && (
                  <div className="absolute left-1 top-0 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
                    {new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" })}
                  </div>
                )}
                <div className="absolute inset-x-0 top-5 text-[11px] text-muted-foreground/70">{Number(d.slice(8, 10))}</div>
              </div>
            );
          })}
          {/* The rows: a label on the left, a bar on the scale. */}
          {g.rows.map((r, i) => (
            <div key={r.item.id} className="absolute left-0 border-t" style={{ top: HEAD_H + i * ROW_H, width, height: ROW_H }}>
              <button type="button" onClick={() => onOpen(r.item.id)}
                title={`${r.item.title} · ${r.start} → ${r.end}${r.summary ? " (its children's span)" : ""}`}
                className={cn("sticky left-0 z-10 h-full truncate bg-background px-2 text-left text-[13px] hover:bg-accent", r.summary && "font-medium")}
                style={{ width: LABEL_W, paddingLeft: 8 + r.level * 14 }}>
                {r.item.title}
              </button>
              {r.summary ? (
                // A parent without dates of its own: a thin bar over its children's span.
                <button type="button" onClick={() => onOpen(r.item.id)} title={`${r.item.title} · ${r.start} → ${r.end} (its children's span)`}
                  className="absolute rounded-sm hover:opacity-80"
                  style={{ left: x(r.from) + 1, width: (r.to - r.from + 1) * DAY_W - 2, top: ROW_H / 2 - 3, height: 6, background: colorOf(r.item, columns) }} />
              ) : (
                <button type="button" onClick={() => onOpen(r.item.id)} title={`${r.item.title} · ${r.start} → ${r.end}`}
                  className="absolute rounded text-left text-[12px] text-white hover:opacity-80"
                  style={{ left: x(r.from) + 1, width: (r.to - r.from + 1) * DAY_W - 2, top: 6, height: ROW_H - 12, background: colorOf(r.item, columns) }}>
                  <span className="block truncate px-1.5 leading-[18px]">{r.item.status ?? ""}</span>
                </button>
              )}
            </div>
          ))}
          <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
            <defs>
              <marker id="views-gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="currentColor" />
              </marker>
            </defs>
            {arrows.map((a) => (
              <path key={a.key} d={a.d} fill="none" stroke="currentColor" strokeWidth={1.25} className="text-foreground/50" markerEnd="url(#views-gantt-arrow)" />
            ))}
          </svg>
        </div>
      </div>
      {g.missing.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Missing a date:{" "}
          {g.missing.map((it, i) => (
            <React.Fragment key={it.id}>
              {i > 0 && " · "}
              <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-foreground" onClick={() => onOpen(it.id)}>{it.title}</button>
            </React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
}

/* ── Tree ───────────────────────────────────────────────────────────────── */

function Node({ node, columns, onOpen }: { node: TreeNode; columns: string[]; onOpen: (id: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(node.item.id)}
        className="flex items-center gap-1.5 rounded border bg-background px-2 py-1 text-left text-[13px] hover:bg-accent">
        <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(node.item, columns) }} />
        <span>{node.item.title}</span>
        {node.item.status && <span className="text-muted-foreground">· {node.item.status}</span>}
        {node.item.start && <span className="font-mono text-[12px] text-muted-foreground">{node.item.start}</span>}
        {node.alsoAfter.length > 0 && (
          <span className="text-[12px] text-muted-foreground">also after {node.alsoAfter.map((a) => a.title).join(", ")}</span>
        )}
      </button>
      {node.children.length > 0 && (
        <ul className="ml-3 mt-1 space-y-1 border-l pl-3">
          {node.children.map((c) => <Node key={c.item.id} node={c} columns={columns} onOpen={onOpen} />)}
        </ul>
      )}
    </li>
  );
}

export function TreePane({ doc, onOpen }: PaneProps) {
  const columns = columnsOf(doc);
  const t = useMemo(() => treeOf(doc), [doc]);
  if (!doc.items.length) return <Empty>No items yet.</Empty>;
  return (
    <div>
      <ul className="space-y-1">
        {t.roots.map((r) => <Node key={r.item.id} node={r} columns={columns} onOpen={onOpen} />)}
      </ul>
      {t.cyclic.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          In a cycle — after each other, so no root:{" "}
          {t.cyclic.map((it, i) => (
            <React.Fragment key={it.id}>
              {i > 0 && " · "}
              <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-foreground" onClick={() => onOpen(it.id)}>{it.title}</button>
            </React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-xs text-muted-foreground">{children}</p>;
}
