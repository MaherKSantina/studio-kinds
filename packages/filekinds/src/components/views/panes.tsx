/**
 * The panes of a `.views` document — the same items laid out as a table, a
 * kanban, a gantt (nested by `parent`, on days), a sequence (nested by
 * `parent`, on steps of `previous`) and a dependency tree (by `previous`);
 * the calendar (a day, a week or a month) is CalendarPane.tsx, loaded when
 * one first opens. Every pane reads the document as its view sees it
 * (viewsDoc.ts) and calls `onOpen(id)` for an item; none writes anything. An
 * item that holds a document written in carries a mark wherever its label is
 * drawn.
 */
import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { cn } from "crosscut";
import {
  addDays, columnIndexOf, columnsOf, foldOutline, ganttOf, groupOutline, isGroupRow, itemCellText, lanesOf, linksOf, localDay, sequenceOf,
  spanText, tableColumnsOf, treeOf, type CalendarScale, type GroupRow, type OutlineRow, type TreeNode, type ViewsDoc, type ViewsItem,
} from "../../lib/viewsDoc";
import { colorOf } from "./ItemDialog";

/** The calendar's scale and the day it shows — the page's for the session, per view, like which view is open. */
export interface CalendarState { scale: CalendarScale; day: string }

export interface PaneProps {
  doc: ViewsDoc;
  onOpen: (id: string) => void;
  /** A calendar pane's scale and day, kept by the host across view switches; absent, the pane keeps its own. */
  calendar?: CalendarState;
  onCalendar?: (s: CalendarState) => void;
  /** A kanban view's `group` — the item key whose values lane the board; absent, one plain board. */
  group?: string;
  /** The parents a gantt or a sequence has folded, by id, kept by the host across view switches; absent, the pane keeps its own. */
  folded?: string[];
  onFolded?: (ids: string[]) => void;
}

/** The small buttons over a pane: the calendar's moves, the outline's folds. */
export const NAV = "rounded border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground";

/** The mark of an item holding a document written in — its dialog draws it. */
export function DocMark({ item }: { item: ViewsItem }) {
  return item.content ? <FileText aria-hidden className="size-3 shrink-0 opacity-80" /> : null;
}
/** The words a title attribute adds for an item's document: " · holds a brief". */
export const docWords = (item: ViewsItem): string => (item.content ? ` · holds a ${item.content.kind || "document"}` : "");

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
                  title={itemCellText(it, c)}>
                  {itemCellText(it, c)}
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
    <button type="button" onClick={onOpen} title={`${item.title}${docWords(item)}`}
      className="w-full rounded-md border bg-background p-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2">
      <span className="flex items-start gap-1.5 font-medium leading-snug"><span className="min-w-0 flex-1">{item.title}</span><DocMark item={item} /></span>
      {(item.start || item.previous.length > 0) && (
        <span className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
          {item.start && <span className="font-mono">{spanText(item)}</span>}
          {item.previous.length > 0 && <span title={`after ${item.previous.join(", ")}`}>⇠ {item.previous.length}</span>}
        </span>
      )}
      <span className="sr-only">{columns[columnIndexOf(item, columns)]}</span>
    </button>
  );
}

export function KanbanPane({ doc, onOpen, group }: PaneProps) {
  const columns = columnsOf(doc);
  const lanes = useMemo(() => lanesOf(doc.items, group), [doc.items, group]);
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
        {lanes.map((lane, li) => (
          <div key={lane.label || `#${li}`}>
            {group && (
              <div className="mt-2 flex items-baseline gap-1.5 px-1 text-xs font-medium">
                <span className={cn("min-w-0 truncate", !lane.label && "italic text-muted-foreground")}>{lane.label || "—"}</span>
                <span className="font-normal text-muted-foreground">{lane.items.length}</span>
              </div>
            )}
            <div style={grid} className="mt-1.5 rounded-lg border bg-muted/30 p-2">
              {columns.map((c, ci) => (
                <div key={c} className="flex min-h-12 flex-col gap-1.5">
                  {lane.items.filter((it) => columnIndexOf(it, columns) === ci).map((it) => (
                    <Card key={it.id} item={it} columns={columns} onOpen={() => onOpen(it.id)} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
        {!doc.items.length && <p className="mt-2 px-1 text-xs text-muted-foreground">No items yet.</p>}
      </div>
    </div>
  );
}

/* ── Gantt and sequence: one outline on a scale ─────────────────────────── */

const ROW_H = 30;
const LABEL_W = 220;

/** A row on the scale: an item from column `from` to column `to`, both included — a thin bar over its rows when it spans them. */
interface ScaleRow extends OutlineRow { item: ViewsItem; from: number; to: number; summary: boolean }

/** A group's bar: the colour of no status, a shade darker — a group has none. */
const GROUP_COLOR = "#64748b";

interface OutlineChartProps<R extends ScaleRow> {
  /** The items' rows, and the rows the view's `group` gathers them under. */
  rows: (R | GroupRow)[];
  /** The scale across: how many columns and how wide, how tall its head, what each column's head shows and how it is shaded. */
  cols: number;
  colW: number;
  headH: number;
  head: (col: number) => React.ReactNode;
  shade?: (col: number) => string;
  /** How far a bar stands in from its columns' edges — the room an arrow between two bars has. */
  inset: number;
  /** A row in words: its bar's title. */
  tip: (r: R | GroupRow) => string;
  columns: string[];
  onOpen: (id: string) => void;
  folded: ReadonlySet<string>;
  onFolded: (keys: string[]) => void;
}

/** The gantt's and the sequence's one drawing: rows nested by `parent` on a scale across — days or steps. On the left
 *  the outline, as a brief's tree: a parent's chevron is its own target and only folds its rows away and back, the
 *  label opens the item. On the scale a bar per row, coloured by its column and saying its status — a thin bar over
 *  its rows for one that spans them — and an arrow from the end of every `previous` item to the start of the one after
 *  it, an end folded away drawn at the row it folds into. A group the view's `group` key makes is a row too: its value
 *  and how many rows it gathers, a thin bar over them, and a label that folds it — there is no item to open. */
function OutlineChart<R extends ScaleRow>({ rows, cols, colW, headH, head, shade, inset, tip, columns, onOpen, folded, onFolded }: OutlineChartProps<R>) {
  const { shown, drawnAs } = useMemo(() => foldOutline(rows, folded), [rows, folded]);
  const links = useMemo(() => linksOf(rows, drawnAs), [rows, drawnAs]);
  const parents = useMemo(() => rows.filter((r, i) => (rows[i + 1]?.level ?? -1) > r.level).map((r) => r.key), [rows]);
  const width = LABEL_W + cols * colW;
  const height = headH + shown.length * ROW_H;
  const index = new Map(shown.map((s, i) => [s.row.key, i]));
  const x = (col: number) => LABEL_W + col * colW;
  const y = (i: number) => headH + i * ROW_H + ROW_H / 2;
  const fold = (key: string) => onFolded(folded.has(key) ? [...folded].filter((f) => f !== key) : [...folded, key]);
  const arrows = links.flatMap(({ from, to }) => {
    const pi = index.get(from), i = index.get(to);
    if (pi === undefined || i === undefined) return [];
    const x1 = x(shown[pi].row.to + 1) - inset + 1, y1 = y(pi), x2 = x(shown[i].row.from) + inset - 1, y2 = y(i);
    const mid = x2 > x1 + 8 ? x1 + (x2 - x1) / 2 : x1 + 6;
    const d = x2 > x1 + 8
      ? `M${x1},${y1} H${mid} V${y2} H${x2}`
      : `M${x1},${y1} H${mid} V${y2 > y1 ? y2 - ROW_H / 2 : y2 + ROW_H / 2} H${x2 - 6} V${y2} H${x2}`;
    return [{ key: `${from}->${to}`, d }];
  });
  return (
    <div>
      {parents.length > 0 && (
        <div className="mb-1.5 flex items-center justify-end gap-1">
          <button type="button" className={NAV} onClick={() => onFolded(parents)}>Collapse all</button>
          <button type="button" className={NAV} onClick={() => onFolded([])}>Expand all</button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border bg-background">
        <div className="relative" style={{ width, height }}>
          {Array.from({ length: cols }, (_, col) => (
            <div key={col} className={cn("absolute top-0 border-l text-center", shade?.(col))} style={{ left: x(col), width: colW, height }}>
              {head(col)}
            </div>
          ))}
          {/* The rows: the outline on the left, a bar on the scale. */}
          {shown.map(({ row: r, parent, folded: shut, hidden }, i) => {
            const item = r.item;
            // An item's row opens the item; a group's folds, having no item to open.
            const act = () => (item ? onOpen(item.id) : fold(r.key));
            const span = { left: x(r.from) + inset, width: (r.to - r.from + 1) * colW - 2 * inset };
            const color = item ? colorOf(item, columns) : GROUP_COLOR;
            return (
              <div key={r.key} className="absolute left-0 border-t" style={{ top: headH + i * ROW_H, width, height: ROW_H }}>
                <div className="sticky left-0 z-10 flex h-full items-center bg-background" style={{ width: LABEL_W, paddingLeft: 4 + r.level * 14 }}>
                  {parents.length > 0 && (parent ? (
                    <button type="button" aria-expanded={!shut} onClick={() => fold(r.key)}
                      title={shut ? `Expand — ${hidden} row${hidden === 1 ? "" : "s"} inside` : "Collapse"}
                      className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
                      {shut ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    </button>
                  ) : <span aria-hidden className="size-5 shrink-0" />)}
                  <button type="button" onClick={act} title={item ? `${tip(r)}${docWords(item)}` : tip(r)}
                    className={cn("flex h-full min-w-0 flex-1 items-center gap-1 px-1 text-left text-[13px] hover:bg-accent", r.summary && "font-medium")}>
                    {item ? (
                      <>
                        <span className="min-w-0 truncate">{item.title}</span>
                        <DocMark item={item} />
                      </>
                    ) : isGroupRow(r) && (
                      <>
                        <span className={cn("min-w-0 truncate", !r.group && "italic text-muted-foreground")}>{r.group || "—"}</span>
                        <span className="shrink-0 font-normal text-muted-foreground">{r.items}</span>
                      </>
                    )}
                  </button>
                </div>
                {r.summary ? (
                  // A row that spans its rows: a thin bar over them.
                  <button type="button" onClick={act} title={tip(r)} className="absolute rounded-sm hover:opacity-80"
                    style={{ ...span, top: ROW_H / 2 - 3, height: 6, background: color }} />
                ) : (
                  <button type="button" onClick={act} title={tip(r)} className="absolute rounded text-left text-[12px] text-white hover:opacity-80"
                    style={{ ...span, top: 6, height: ROW_H - 12, background: color }}>
                    <span className="block truncate px-1.5 leading-[18px]">{item?.status ?? ""}</span>
                  </button>
                )}
              </div>
            );
          })}
          <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
            <defs>
              <marker id="views-outline-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="currentColor" />
              </marker>
            </defs>
            {arrows.map((a) => (
              <path key={a.key} d={a.d} fill="none" stroke="currentColor" strokeWidth={1.25} className="text-foreground/50" markerEnd="url(#views-outline-arrow)" />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

/** The parents a pane has folded: the host's, per view, when it keeps them; else the pane's own. */
function useFolds({ folded, onFolded }: PaneProps): [ReadonlySet<string>, (ids: string[]) => void] {
  const [own, setOwn] = useState<string[]>([]);
  const ids = folded ?? own;
  return [useMemo(() => new Set(ids), [ids]), onFolded ?? setOwn];
}

/** Items a pane cannot draw, listed under it by label — each opens the item. */
export function Apart({ what, items, onOpen }: { what: string; items: ViewsItem[]; onOpen: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {what}{" "}
      {items.map((it, i) => (
        <React.Fragment key={it.id}>
          {i > 0 && " · "}
          <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-foreground" onClick={() => onOpen(it.id)}>{it.title}</button>
        </React.Fragment>
      ))}
    </p>
  );
}

/* ── Gantt ──────────────────────────────────────────────────────────────── */

const DAY_W = 26;

export function GanttPane(props: PaneProps) {
  const { doc, onOpen, group } = props;
  const columns = columnsOf(doc);
  const g = useMemo(() => ganttOf(doc), [doc]);
  const rows = useMemo(() => groupOutline(g.rows, doc.items, group), [g.rows, doc.items, group]);
  const [folded, onFolded] = useFolds(props);
  const today = localDay();
  if (!g.rows.length) return <Empty>No item has a start and an end date, nor children with them — nothing to draw.</Empty>;
  const days = Array.from({ length: g.days }, (_, i) => addDays(g.first, i));
  return (
    <div>
      <OutlineChart rows={rows} cols={g.days} colW={DAY_W} headH={40} inset={1} columns={columns} onOpen={onOpen} folded={folded} onFolded={onFolded}
        // The day scale: the month named where it begins, then every day.
        head={(i) => (
          <>
            {(i === 0 || days[i].endsWith("-01")) && (
              <div className="absolute left-1 top-0 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
                {new Date(`${days[i]}T00:00:00Z`).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" })}
              </div>
            )}
            <div className="absolute inset-x-0 top-5 text-[11px] text-muted-foreground/70">{Number(days[i].slice(8, 10))}</div>
          </>
        )}
        shade={(i) => cn([0, 6].includes(new Date(`${days[i]}T00:00:00Z`).getUTCDay()) && "bg-muted/50", days[i] === today && "bg-amber-50")}
        tip={(r) => (isGroupRow(r)
          ? `${r.group || "—"} · ${days[r.from]} → ${days[r.to]} (its rows' span)`
          : `${r.item.title} · ${r.start} → ${r.end}${r.summary ? " (its children's span)" : ""}`)} />
      <Apart what="Missing a date:" items={g.missing} onOpen={onOpen} />
    </div>
  );
}

/* ── Sequence ───────────────────────────────────────────────────────────── */

const STEP_W = 96;

export function SequencePane(props: PaneProps) {
  const { doc, onOpen, group } = props;
  const columns = columnsOf(doc);
  const s = useMemo(() => sequenceOf(doc), [doc]);
  const rows = useMemo(() => groupOutline(s.rows, doc.items, group), [s.rows, doc.items, group]);
  const [folded, onFolded] = useFolds(props);
  if (!doc.items.length) return <Empty>No items yet.</Empty>;
  return (
    <div>
      {s.rows.length > 0 && (
        <OutlineChart rows={rows} cols={s.steps} colW={STEP_W} headH={26} inset={14} columns={columns} onOpen={onOpen} folded={folded} onFolded={onFolded}
          // The step scale: what comes after what, counted from 1 — no dates, no durations.
          head={(i) => <div className="absolute inset-x-0 top-1.5 text-[11px] text-muted-foreground/70">{i + 1}</div>}
          tip={(r) => (isGroupRow(r)
            ? `${r.group || "—"} · steps ${r.from + 1} → ${r.to + 1} (its rows' span)`
            : r.summary ? `${r.item.title} · steps ${r.from + 1} → ${r.to + 1} (its children's span)` : `${r.item.title} · step ${r.from + 1}`)} />
      )}
      <Apart what="In a loop — after each other or inside each other, so no step:" items={s.looped} onOpen={onOpen} />
    </div>
  );
}

/* ── Tree ───────────────────────────────────────────────────────────────── */

function Node({ node, columns, onOpen }: { node: TreeNode; columns: string[]; onOpen: (id: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(node.item.id)} title={`${node.item.title}${docWords(node.item)}`}
        className="flex items-center gap-1.5 rounded border bg-background px-2 py-1 text-left text-[13px] hover:bg-accent">
        <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(node.item, columns) }} />
        <span>{node.item.title}</span>
        <DocMark item={node.item} />
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
