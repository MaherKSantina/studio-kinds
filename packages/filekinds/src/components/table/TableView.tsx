/**
 * The tabular viewer — `.csv`/`.tsv` rendered from text, `.xlsx`/`.xls`
 * decoded from raw bytes (SheetJS) — one grid either way: A1 column rail,
 * numbered rows, first row emphasized as the header it almost always is,
 * sheet tabs when a workbook has several. Made for EXAMINING cells and rows,
 * the way the pdf kind is made for reading pages: it renders the file as
 * itself, no import step, no copy.
 */
import React, { useEffect, useMemo, useState } from "react";
import { cn } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { rawFileUrlFor } from "../../api";
import { TableData, columnCountOf, columnLabel, parseCsv } from "../../lib/tableData";

const BINARY_EXT = /\.(xlsx|xls)$/i;

function Grid({ rows, cols }: { rows: string[][]; cols: number }) {
  return (
    <table className="border-collapse font-mono text-[13px] leading-5" style={{ fontVariantNumeric: "tabular-nums" }}>
      <thead>
        <tr>
          <th className="sticky top-0 z-10 border bg-sidebar px-1.5 py-0.5 text-xs font-medium text-muted-foreground" />
          {Array.from({ length: cols }, (_, c) => (
            <th key={c} className="sticky top-0 z-10 border bg-sidebar px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {columnLabel(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={cn(i === 0 && "bg-accent/60 font-semibold", "hover:bg-accent/30")}>
            <td className="border bg-sidebar px-1.5 py-0.5 text-right text-xs text-muted-foreground">{i + 1}</td>
            {Array.from({ length: cols }, (_, c) => (
              <td key={c} className="max-w-[360px] truncate whitespace-nowrap border px-2 py-0.5" title={r[c]}>
                {r[c] ?? ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function TableView({ content, path, agentId, height = "100%" }: ViewerProps) {
  const docPath = path ?? agentId ?? "";
  const binary = BINARY_EXT.test(docPath);
  const [workbook, setWorkbook] = useState<TableData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState(0);

  // Workbooks decode from BYTES — the text channel carries nothing for them.
  useEffect(() => {
    if (!binary) return;
    setWorkbook(null); setErr(null); setSheet(0);
    const url = rawFileUrlFor(docPath, docPath);
    if (!url) { setErr("The host has no raw-bytes endpoint configured — workbooks need one."); return; }
    let live = true;
    (async () => {
      try {
        const XLSX = await import("xlsx");
        const buf = await (await fetch(url)).arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheets = wb.SheetNames.map((name) => ({
          name,
          rows: (XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" }) as string[][])
            .map((r) => r.map((c) => String(c ?? ""))),
        }));
        if (live) setWorkbook({ sheets });
      } catch (e: unknown) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [binary, docPath]);

  const data = useMemo<TableData | null>(
    () => (binary ? workbook : parseCsv(content ?? "")),
    [binary, workbook, content],
  );

  if (err) return <div className="p-6 text-sm text-destructive">{err}</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Reading the workbook…</div>;
  const current = data.sheets[Math.min(sheet, data.sheets.length - 1)] ?? { name: "", rows: [] };
  const cols = columnCountOf(current);

  return (
    <div style={{ height }} className="flex min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-[13px] text-muted-foreground">
        {data.sheets.length > 1 ? (
          <div className="flex rounded-md border p-0.5">
            {data.sheets.map((s, i) => (
              <button key={s.name} type="button" onClick={() => setSheet(i)}
                className={cn("rounded px-2 py-0.5 text-xs font-medium",
                  i === sheet ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                {s.name}
              </button>
            ))}
          </div>
        ) : (
          <span className="font-medium text-foreground">{current.name}</span>
        )}
        <span>{current.rows.length} rows × {cols} columns</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {current.rows.length ? <Grid rows={current.rows} cols={cols} />
          : <p className="p-4 text-sm text-muted-foreground">The sheet is empty.</p>}
      </div>
    </div>
  );
}
