/**
 * Data rows as a table for LOOKING THROUGH — the grid every set of rows
 * gets: the columns given, one page of rows in the DOM at a time, a search
 * box over every column (each word must match, case-insensitive), a header
 * click to sort. A cell that is a link opens in the browser and copies whole
 * with the button beside it; a click on a row opens it in full (RowDialog).
 * The count line says how many rows match; the pager says where you are.
 * Problems are listed above the table, the rows still shown.
 *
 * The default export is the `.jsonl` kind. Raw lines are the rows. DIRECTIVE
 * lines (`$sources`, `$policy`, `$title`, `$labels` — dataRows.ts) make it a
 * live view: the sources are read here on every open, the raw lines added,
 * the table policy applied, nothing cached; when a source or the policy
 * changes on disk (`studio:fs-changed`) it is read again. The heading and
 * the header labels are the file's own — the policy says nothing about the
 * data. A file with no rows at all falls back to its text.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button, Input, NamePromptDialog, cn, parentOf, resolveRef } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { configuredLister, configuredWriter, readVirtualDirectoryFile } from "../../api";
import { collectionFromRows, dumpCollection } from "../../lib/collectionDoc";
import {
  cellText, matchingRows, pageOf, parseDataRows, searchIndex, sortRows, valueAt,
  type DataRow, type DataRows, type SortDir,
} from "../../lib/dataRows";
import { chainText, readSourceRows } from "../../lib/dataSources";
import { applyTablePolicy, columnsOf, rulesSummary, type TablePolicyDoc } from "../../lib/tablePolicy";
import { parsePolicyKindFile } from "../../lib/policyChain";
import { CellContent, isUrl } from "./cells";
import { RowDialog } from "./RowDialog";

const PAGE_SIZES = [25, 50, 100, 250];

export interface DataGridProps {
  rows: DataRow[];
  /** The columns shown, in order — keys of the rows, or dot paths into nested objects. */
  columns: string[];
  /** Header labels, by column; a column without one shows its key. */
  labels?: Record<string, string>;
  /** Listed above the table (bad lines, a rule that names nothing). */
  problems?: string[];
  /** The host's own line at the left of the count (a policy's title, the sources). */
  lead?: React.ReactNode;
  height?: number | string;
}

export function DataGrid({ rows, columns, labels = {}, problems = [], lead, height = "100%" }: DataGridProps) {
  const index = useMemo(() => searchIndex(rows, columns), [rows, columns]);

  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  useEffect(() => { const t = setTimeout(() => setApplied(query), 150); return () => clearTimeout(t); }, [query]);
  const [sort, setSort] = useState<{ column: string; dir: SortDir } | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [at, setAt] = useState<number | null>(null);

  const matched = useMemo(() => matchingRows(index, applied), [index, applied]);
  const ordered = useMemo(
    () => (sort && columns.includes(sort.column) ? sortRows(rows, matched, sort.column, sort.dir) : matched),
    [rows, columns, matched, sort],
  );
  // A new question, order, page size or set of rows starts at page one, the dialog closed.
  useEffect(() => { setPage(1); setAt(null); }, [applied, sort, pageSize, rows]);
  const pg = pageOf(ordered, page, pageSize);

  const toggleSort = (column: string) =>
    setSort((s) => (s?.column !== column ? { column, dir: "asc" } : s.dir === "asc" ? { column, dir: "desc" } : null));

  return (
    <div style={{ height }} className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-1.5 text-[13px]">
        {lead}
        <span className="text-muted-foreground">
          {rows.length.toLocaleString()} rows · {columns.length} columns
          {applied.trim() ? <> · <span className="text-foreground">{matched.length.toLocaleString()} match</span></> : null}
        </span>
        <span className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
            placeholder="Search every field" aria-label="Search every field" className="h-7 w-64 max-w-full pl-7 text-[13px]" />
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page"
            className="h-7 rounded-md border bg-background px-1.5 text-[13px]">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <Button size="xs" variant="ghost" onClick={() => setPage((p) => p - 1)} disabled={pg.page <= 1} aria-label="Previous page"><ChevronLeft /></Button>
          <span className="tabular-nums">{pg.from.toLocaleString()}–{pg.to.toLocaleString()} of {pg.total.toLocaleString()}</span>
          <Button size="xs" variant="ghost" onClick={() => setPage((p) => p + 1)} disabled={pg.page >= pg.pages} aria-label="Next page"><ChevronRight /></Button>
        </span>
      </div>
      {problems.length > 0 && (
        <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-3 py-1 text-[12px] text-amber-900">
          {problems.length} problem{problems.length === 1 ? "" : "s"} — {problems.slice(0, 3).join("; ")}{problems.length > 3 ? "; …" : ""}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-collapse font-mono text-[13px] leading-5" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr>
              <th className="sticky top-0 z-10 border bg-sidebar px-1.5 py-0.5 text-xs font-medium text-muted-foreground">#</th>
              {columns.map((c) => {
                const active = sort?.column === c;
                return (
                  <th key={c} className="sticky top-0 z-10 border bg-sidebar p-0 text-left text-xs font-medium text-muted-foreground">
                    <button type="button" onClick={() => toggleSort(c)} title={`Sort by ${c}`}
                      className={cn("flex w-full items-center gap-1 px-2 py-0.5 hover:text-foreground", active && "text-foreground")}>
                      <span className="truncate">{labels[c] ?? c}</span>
                      {active ? (sort!.dir === "asc" ? <ArrowUp className="size-3 shrink-0" /> : <ArrowDown className="size-3 shrink-0" />)
                        : <ArrowUpDown className="size-3 shrink-0 opacity-40" />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pg.slice.map((i, k) => (
              <tr key={i} className="cursor-pointer hover:bg-accent/30" onClick={() => setAt(pg.from - 1 + k)} title="Open the row">
                <td className="border bg-sidebar px-1.5 py-0.5 text-right text-xs text-muted-foreground">{i + 1}</td>
                {columns.map((c) => {
                  const t = cellText(valueAt(rows[i], c));
                  return (
                    <td key={c} className="max-w-[360px] overflow-hidden truncate whitespace-nowrap border px-2 py-0.5" title={isUrl(t) ? undefined : t}>
                      <CellContent text={t} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!pg.slice.length && (
          <p className="p-4 text-sm text-muted-foreground">
            {rows.length ? "No row matches — clear the search to see them all." : "No rows."}
          </p>
        )}
      </div>
      <RowDialog rows={rows} ordered={ordered} at={at} columns={columns} labels={labels} onMove={setAt} />
    </div>
  );
}

/* ── composed rows: the sources and the policy read live ─────────────────── */

interface Composed {
  rows: DataRow[];
  policy: TablePolicyDoc | null;
  /** "corrections.middleware → accommodation.json#properties (483 rows, 1 amended)" per source. */
  notes: string[];
  /** Every file read — the sources, the chains behind them, the policy — to watch for changes. */
  files: string[];
  problems: string[];
}

const readAbs = (abs: string) => readVirtualDirectoryFile(abs, abs).then((r) => r.content);

function useComposed(base: string, data: DataRows): Composed | null {
  const compose = data.compose;
  const [out, setOut] = useState<Composed | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!compose) return;
    let live = true;
    setOut(null);
    (async () => {
      const rows: DataRow[] = [];
      const notes: string[] = [];
      const files: string[] = [];
      const problems: string[] = [];
      for (const s of compose.sources) {
        const got = await readSourceRows(s, base, readAbs);
        rows.push(...got.rows);
        problems.push(...got.problems);
        files.push(...got.files);
        notes.push(chainText(got));
      }
      let policy: TablePolicyDoc | null = null;
      if (compose.policy) {
        const abs = resolveRef(base, compose.policy);
        files.push(abs);
        try {
          const parsed = parsePolicyKindFile(await readAbs(abs));
          if (parsed.role === "table") policy = parsed;
          else problems.push(`${compose.policy} is not a table policy (role: ${parsed.role}) — the rows show as they are`);
        } catch { problems.push(`could not read ${compose.policy}`); }
      }
      if (live) setOut({ rows: [...rows, ...data.rows], policy, notes, files, problems });
    })();
    return () => { live = false; };
  }, [base, compose, data.rows, version]);

  // A file in the chain written underneath (a scrape re-run, a correction added, a rule changed): read again.
  useEffect(() => {
    const watched = new Set(out?.files ?? []);
    const onChanged = (e: Event) => { if (watched.has((e as CustomEvent<string>).detail)) setVersion((v) => v + 1); };
    window.addEventListener("studio:fs-changed", onChanged);
    return () => window.removeEventListener("studio:fs-changed", onChanged);
  }, [out]);

  return out;
}

/** "Collect": the rows shown, copied into a .collection beside this file, then opened. */
function CollectButton({ base, rows, fields, labels, onOpenPath }: {
  base: string; rows: DataRow[]; fields: string[]; labels: Record<string, string>; onOpenPath?: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [siblings, setSiblings] = useState<string[]>([]);
  const writer = configuredWriter();
  const name = base.slice(base.lastIndexOf("/") + 1);
  const stem = name.replace(/\.[^.]+$/, "");
  if (!writer) return null;
  const ask = async () => {
    try { setSiblings(((await configuredLister()?.(parentOf(base))) ?? []).map((e) => e.name)); } catch { setSiblings([]); }
    setOpen(true);
  };
  const collect = async (file: string) => {
    const abs = resolveRef(base, file);
    await writer(abs, dumpCollection(collectionFromRows(rows, { source: name, fields, labels })));
    setOpen(false);
    onOpenPath?.(abs);
  };
  return (
    <>
      <Button size="xs" variant="outline" onClick={ask} title="Copy these rows into a collection to decide over">Collect</Button>
      <NamePromptDialog open={open} title="Collect into" action="Collect" initial={`${stem}.collection`} siblings={siblings}
        onClose={() => setOpen(false)} onSubmit={collect} />
    </>
  );
}

function ComposedView({ data, base, height, onOpenPath }: { data: DataRows; base: string; height: number | string; onOpenPath?: (path: string) => void }) {
  const out = useComposed(base, data);
  const compose = data.compose!;
  const result = useMemo(() => {
    if (!out) return null;
    if (out.policy) return applyTablePolicy(out.policy, out.rows);
    return { rows: out.rows, total: out.rows.length, columns: columnsOf(out.rows), problems: [] as string[] };
  }, [out]);
  if (!out || !result) {
    return <div style={{ height }} className="p-4 text-sm text-muted-foreground">Reading {compose.sources.map((s) => s.file).join(", ") || "the rows"}…</div>;
  }
  const name = base.slice(base.lastIndexOf("/") + 1);
  const labels = compose.labels ?? {};
  const rules = out.policy ? rulesSummary(out.policy, labels) : "";
  const lead = (
    <span className="min-w-0 truncate" title={compose.description}>
      <span className="font-medium text-foreground">{compose.title || name}</span>
      <span className="text-muted-foreground">
        {" · "}{result.rows.length === result.total ? `${result.total.toLocaleString()} rows` : `${result.rows.length.toLocaleString()} of ${result.total.toLocaleString()} rows`}
        {out.notes.length > 0 && <> · from <code>{out.notes.join(", ")}</code></>}
        {data.rows.length > 0 && <> + {data.rows.length.toLocaleString()} raw line{data.rows.length === 1 ? "" : "s"}</>}
        {compose.policy && <> · through <code>{compose.policy}</code></>}
        {rules && <> · {rules}</>}
      </span>
      {" "}
      <CollectButton base={base} rows={result.rows} fields={result.columns} labels={labels} onOpenPath={onOpenPath} />
    </span>
  );
  return (
    <DataGrid rows={result.rows} columns={result.columns} labels={labels}
      problems={[...data.problems, ...out.problems, ...result.problems]} lead={lead} height={height} />
  );
}

/** The `.jsonl` kind: one JSON object per line as the grid — or, with a directive line, a live view over other files. */
export default function DataTableView({ content, path, agentId, height = "100%", onOpenPath }: ViewerProps) {
  const data = useMemo(() => parseDataRows(content ?? ""), [content]);
  if (data.compose) return <ComposedView data={data} base={path ?? agentId ?? "/"} height={height} onOpenPath={onOpenPath} />;
  if (!data.rows.length) {
    return (
      <div style={{ height }} className="overflow-auto p-4 text-sm">
        {data.problems.length ? (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <p className="font-medium">No rows could be read — one JSON object per line is the shape.</p>
            <ul className="mt-1 list-disc pl-5 text-[13px]">{data.problems.slice(0, 8).map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        ) : <p className="text-muted-foreground">No rows — one JSON object per line.</p>}
        {content?.trim() && <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-muted-foreground">{content}</pre>}
      </div>
    );
  }
  const problems = data.problems.length
    ? [`${data.problems.length} line${data.problems.length === 1 ? "" : "s"} skipped: ${data.problems.slice(0, 3).join("; ")}${data.problems.length > 3 ? "; …" : ""}`]
    : [];
  return <DataGrid rows={data.rows} columns={data.columns} problems={problems} height={height} />;
}
