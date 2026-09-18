/**
 * One row, whole — every field the row carries (hidden columns included),
 * nothing clipped: nested objects opened up into dotted fields, lists of
 * values on one line, lists of objects as readable JSON, links clickable with
 * a copy button. The grid's columns come first, in the grid's order (the
 * policy's), then every other field the row carries. Arrows walk the rows in
 * the order the grid shows them (search and sort applied), so a scan through
 * 189 stays is a keypress each.
 */
import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "crosscut";
import { cellText, type DataRow } from "../../lib/dataRows";
import { CopyButton, LinkText, isUrl } from "./cells";

const isPlain = (v: unknown): v is DataRow => !!v && typeof v === "object" && !Array.isArray(v);

/** The row as (dotted key, value) pairs: nested objects opened, everything else kept. */
export function flattenRow(row: DataRow, prefix = ""): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const [k, v] of Object.entries(row)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlain(v) && Object.keys(v).length) out.push(...flattenRow(v, key));
    else out.push([key, v]);
  }
  return out;
}

/** What to call a row: its first non-empty text field that is not a link, else its number. */
export function rowTitle(row: DataRow, columns: string[], fallback: string): string {
  for (const c of [...columns, ...Object.keys(row)]) {
    const v = row[c];
    if (typeof v === "string" && v.trim() && !isUrl(v)) return v.trim();
  }
  return fallback;
}

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (typeof v === "string") {
    if (isUrl(v)) return <span className="flex min-w-0 items-center gap-1"><LinkText href={v} className="whitespace-normal break-all" /><CopyButton text={v} /></span>;
    return <span className="whitespace-pre-wrap break-words">{v}</span>;
  }
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return <span className="tabular-nums">{String(v)}</span>;
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-muted-foreground">(empty list)</span>;
    if (v.every((x) => x === null || typeof x !== "object")) {
      return (
        <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
          {v.map((x, i) => {
            const t = cellText(x);
            return (
              <span key={i} className="flex min-w-0 items-center gap-1">
                {isUrl(t) ? <><LinkText href={t} className="whitespace-normal break-all" /><CopyButton text={t} /></> : <span className="whitespace-pre-wrap break-words">{t}</span>}
                {i < v.length - 1 && <span className="text-muted-foreground">,</span>}
              </span>
            );
          })}
        </span>
      );
    }
  }
  return <pre className="whitespace-pre-wrap break-all font-mono text-[12px] leading-5">{JSON.stringify(v, null, 2)}</pre>;
}

export interface RowDialogProps {
  rows: DataRow[];
  /** Row indices in the order the grid shows them. */
  ordered: number[];
  /** Position in `ordered` of the row shown; null = closed. */
  at: number | null;
  columns: string[];
  labels?: Record<string, string>;
  onMove: (at: number | null) => void;
}

/** The shown columns first, in the grid's order, then every other field the row carries. */
export function orderFields(fields: [string, unknown][], columns: string[]): [string, unknown][] {
  const rank = new Map(columns.map((c, i) => [c, i]));
  return fields.map((f, i) => ({ f, i })).sort((a, b) => {
    const ra = rank.get(a.f[0]) ?? Infinity, rb = rank.get(b.f[0]) ?? Infinity;
    return ra !== rb ? ra - rb : a.i - b.i;
  }).map((x) => x.f);
}

export function RowDialog({ rows, ordered, at, columns, labels = {}, onMove }: RowDialogProps) {
  const index = at === null ? null : ordered[at];
  const row = index === null || index === undefined ? null : rows[index];
  const fields = useMemo(() => (row ? orderFields(flattenRow(row), columns) : []), [row, columns]);
  const open = row !== null;
  const prev = at !== null && at > 0;
  const next = at !== null && at < ordered.length - 1;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onMove(null); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 p-4" style={{ maxWidth: "min(760px, 94vw)" }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" && prev) { e.preventDefault(); onMove(at! - 1); }
          if (e.key === "ArrowRight" && next) { e.preventDefault(); onMove(at! + 1); }
        }}>
        <DialogHeader className="pr-8">
          <DialogTitle className="flex min-w-0 items-baseline gap-2 text-[15px]">
            <span className="min-w-0 truncate">{row ? rowTitle(row, columns, `Row ${index! + 1}`) : ""}</span>
            <span className="shrink-0 text-xs font-normal text-muted-foreground">row {index === null ? "" : index + 1} · {at === null ? "" : at + 1} of {ordered.length}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">Every field of the row, in full</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto">
          <dl className="grid grid-cols-[minmax(120px,max-content)_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            {fields.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="truncate font-mono text-[12px] leading-5 text-muted-foreground" title={k}>{labels[k] ?? k}</dt>
                <dd className="min-w-0 leading-5"><Value v={v} /></dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t pt-3">
          <Button size="sm" variant="outline" onClick={() => onMove(at! - 1)} disabled={!prev} aria-label="Previous row"><ChevronLeft /> Previous</Button>
          <Button size="sm" variant="outline" onClick={() => onMove(at! + 1)} disabled={!next} aria-label="Next row">Next <ChevronRight /></Button>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            Copy the row as JSON
            <CopyButton text={row ? JSON.stringify(row, null, 2) : ""} label="Copy the row as JSON" />
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
