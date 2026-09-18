/**
 * The COMPOSED face of a `type: composite` structured node — one entity, its
 * streams side by side. Each column is one stream: who authors it (driver
 * badge), where it comes from (source / via), how fresh it is (the
 * `stream-status` golden table — hover the chip for the because), the folded
 * current picture, and the arrival history that produced it.
 *
 * The color language is the driver, not the data: observed = sky (the world's
 * pen), derived = violet (my rules' pen), authored = emerald (my process's
 * pen). Status tones ride the chip only.
 *
 * `display: compact` on the schema strips a column to its dimension label
 * and the folded key/values — no driver badge, staleness chip, provenance
 * or arrivals trail. For nodes whose streams are plain DOMAINS of one item
 * (a task's identity and status) rather than synced pipelines, that
 * ceremony is noise; the driver's colored rail stays as the only trace.
 */
import React, { useMemo, useState } from "react";
import { ArrowDownToDot, CalendarSync, FileCog, History } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, cn } from "crosscut";
import { MarkdownPane } from "../../lib/MarkdownPane";
import type { DocListItem } from "../../lib/listDoc";
import type { SchemaDoc } from "../../lib/schemaDoc";
import { CompositeStream, Driver, compositeStreams, driverOf } from "../../lib/compositeDoc";

const DRIVER_STYLE: Record<Exclude<Driver, "">, { badge: string; rail: string; label: string; blurb: string }> = {
  observed: {
    badge: "bg-sky-100 text-sky-800 border-sky-200",
    rail: "border-t-sky-400",
    label: "observed",
    blurb: "The world holds the pen — synced verbatim, never hand-edited. Ages against its cadence.",
  },
  derived: {
    badge: "bg-violet-100 text-violet-800 border-violet-200",
    rail: "border-t-violet-400",
    label: "derived",
    blurb: "My rules hold the pen — recomputed from an input stream. Stales when the input moves or the rules change, never by clock.",
  },
  authored: {
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    rail: "border-t-emerald-400",
    label: "authored",
    blurb: "My process holds the pen — the primary record. Cannot go stale; its integrity is the event history.",
  },
};

const TONE_STYLE: Record<CompositeStream["status"]["outcome"]["tone"], string> = {
  ok: "bg-emerald-100 text-emerald-800 border-emerald-300",
  warn: "bg-amber-100 text-amber-800 border-amber-300",
  bad: "bg-red-100 text-red-800 border-red-300",
  quiet: "bg-muted text-muted-foreground border-transparent",
};

const age = (days: number | null): string | null =>
  days === null ? null : days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;

/** One folded field: its key and the value clamped to THREE lines — a card
 *  is a glance, not a read. Clicking opens the whole value (rendered as
 *  markdown) in a dialog stacked over whatever hosts the board. */
function FieldCard({ k, v, onExpand }: { k: string; v: string; onExpand: () => void }) {
  return (
    <button type="button" onClick={onExpand} title="Open the full value"
      className="block w-full rounded-md border bg-card px-2 py-1 text-left transition-colors hover:border-foreground/40">
      <span className="font-mono text-xs text-muted-foreground">{k}</span>
      <span className="block break-words text-[13px] leading-snug"
        style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {v}
      </span>
    </button>
  );
}

function StreamColumn({ s, compact, onRow, onOpenFile, onField }: {
  s: CompositeStream;
  compact?: boolean;
  onRow: (it: DocListItem) => void;
  onOpenFile?: (abs: string) => void;
  onField: (k: string, v: string) => void;
}) {
  const driver = driverOf(s.entry);
  const d = driver ? DRIVER_STYLE[driver] : null;
  const { status, tone } = s.status.outcome;
  const fields = Object.entries(s.current);
  const history = [...s.rows].reverse();

  if (compact) {
    return (
      <div className={cn("flex w-[252px] shrink-0 flex-col rounded-lg border border-t-2 bg-sidebar/60", d?.rail)}>
        <div className="border-b px-2.5 py-2">
          <p className="min-w-0 truncate text-xs font-bold" title={s.entry.detail ?? s.entry.label}>
            {s.entry.label}
          </p>
        </div>
        <div className="min-h-10 flex-1 overflow-y-auto p-2">
          {fields.length ? (
            <div className="space-y-1">
              {fields.map(([k, v]) => (
                <FieldCard key={k} k={k} v={v} onExpand={() => onField(k, v)} />
              ))}
            </div>
          ) : (
            <p className="px-1 py-2 text-[13px] text-muted-foreground">Nothing yet.</p>
          )}
        </div>
      </div>
    );
  }

  const viaButton = s.entry.via && (
    <button type="button" title={`Open ${s.entry.via}`}
      onClick={onOpenFile ? () => onOpenFile(s.entry.via!) : undefined}
      className={cn("inline-flex min-w-0 items-center gap-1 truncate font-mono text-xs text-muted-foreground",
        onOpenFile && "underline decoration-dotted underline-offset-2 hover:text-foreground")}>
      <FileCog className="size-3 shrink-0" />
      <span className="truncate">{s.entry.via}</span>
    </button>
  );

  return (
    <div className={cn("flex w-[252px] shrink-0 flex-col rounded-lg border border-t-2 bg-sidebar/60", d?.rail)}>
      {/* Who writes here, and how fresh it is. */}
      <div className="space-y-1 border-b px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-xs font-bold" title={s.entry.detail ?? s.entry.label}>
            {s.entry.label}
          </p>
          <span title={s.status.because}
            className={cn("rounded-full border px-1.5 py-px text-xs font-semibold", TONE_STYLE[tone])}>
            {status}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span title={d?.blurb ?? "No driver declared — the schema doesn't say who authors this stream."}
            className={cn("rounded border px-1 py-px font-mono text-xs font-medium",
              d?.badge ?? "bg-muted text-muted-foreground border-transparent")}>
            {d?.label ?? "no driver"}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{s.entry.id}</span>
        </div>
        {s.entry.detail && <p className="text-xs leading-snug text-muted-foreground">{s.entry.detail}</p>}
        {/* Provenance: where this stream's pen actually lives. */}
        <div className="space-y-0.5 pt-0.5">
          {s.entry.source && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarSync className="size-3 shrink-0" />
              <span className="truncate">{s.entry.source}{s.entry.cadence ? ` · ${s.entry.cadence}` : ""}</span>
            </p>
          )}
          {viaButton}
          {s.entry.of && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground" title="The input stream this one derives from">
              <ArrowDownToDot className="size-3 shrink-0" />
              <span>reads <span className="font-mono">{s.entry.of}</span></span>
            </p>
          )}
          {s.lastAt && (
            <p className="text-xs text-muted-foreground">
              last arrival <span className="font-mono">{s.lastAt}</span>
              {age(s.ageDays) ? ` · ${age(s.ageDays)}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* The folded picture — what this stream currently says. */}
      <div className="min-h-10 flex-1 overflow-y-auto p-2">
        {fields.length ? (
          <div className="space-y-1">
            {fields.map(([k, v]) => (
              <FieldCard key={k} k={k} v={v} onExpand={() => onField(k, v)} />
            ))}
          </div>
        ) : (
          <p className="px-1 py-2 text-[13px] text-muted-foreground">Nothing has arrived yet.</p>
        )}
      </div>

      {/* The arrivals that produced it, newest first. */}
      {history.length > 0 && (
        <div className="border-t px-2 py-1.5">
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="size-3" /> arrivals · {history.length}
          </p>
          <div className="space-y-0.5">
            {history.map((it, i) => (
              <button key={i} type="button" onClick={() => onRow(it)}
                className="flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left hover:bg-accent">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{it.fields?.at ?? "—"}</span>
                <span className="min-w-0 truncate text-[13px]">{it.label ?? "(arrival)"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function CompositeBoard({ schema, rows, now, onRow, onOpenFile }: {
  schema: SchemaDoc;
  rows: DocListItem[];
  /** ISO date used as "today" for staleness — stories pin it; hosts omit it. */
  now?: string;
  onRow: (it: DocListItem) => void;
  onOpenFile?: (abs: string) => void;
}) {
  const today = now ?? new Date().toISOString().slice(0, 10);
  const compact = schema.display === "compact";
  const { streams, unfiled } = useMemo(
    () => compositeStreams(schema, rows, today),
    [schema, rows, today],
  );
  // A field card's full value, opened over whatever hosts the board — the
  // dialog mounts after the host's, so it stacks on top.
  const [expanded, setExpanded] = useState<{ stream: string; k: string; v: string } | null>(null);
  return (
    <div className="flex h-full items-stretch gap-2 overflow-x-auto p-3">
      {streams.map((s) => (
        <StreamColumn key={s.entry.id} s={s} compact={compact} onRow={onRow} onOpenFile={onOpenFile}
          onField={(k, v) => setExpanded({ stream: s.entry.label, k, v })} />
      ))}
      {unfiled.length > 0 && (
        <div className="flex w-[252px] shrink-0 flex-col rounded-lg border border-warning/60 bg-warning/5">
          <div className="border-b px-2.5 py-2">
            <p className="text-xs font-bold text-warning"
              title={`Arrivals whose ${schema.field}: matches no stream id — fix the row or add the stream`}>
              Unfiled · {unfiled.length}
            </p>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {unfiled.map((it, i) => (
              <button key={i} type="button" onClick={() => onRow(it)}
                className="flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left hover:bg-accent">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{it.fields?.at ?? "—"}</span>
                <span className="min-w-0 truncate text-[13px]">{it.label ?? "(arrival)"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!streams.length && (
        <p className="p-3 text-sm text-muted-foreground">The schema declares no streams yet.</p>
      )}
      <Dialog open={expanded !== null} onOpenChange={(o) => { if (!o) setExpanded(null); }}>
        <DialogContent className="flex max-h-[80dvh] flex-col" style={{ maxWidth: "min(720px, 92vw)" }}>
          <DialogHeader>
            <DialogTitle className="flex items-baseline gap-2 text-sm">
              <span>{expanded?.stream}</span>
              <span className="font-mono text-xs font-normal text-muted-foreground">{expanded?.k}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">The field's full value</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto rounded border p-3">
            {expanded && <MarkdownPane content={expanded.v} height="auto" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CompositeBoard;
