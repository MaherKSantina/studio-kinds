/**
 * A `.tablediff` open — the two declared tables read LIVE, diffed by key,
 * drawn as one grid: green rows exist only in the left (proposed) table,
 * red rows only in the right (base), amber CELLS carry a change as
 * "right → left". Unchanged rows can be tucked away; the counts strip is
 * the summary the comparison step actually wants.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Download, Eye, EyeOff } from "lucide-react";
import { Button, CopyHandleButton, cn, nodeHandleOf, parentOf } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { configuredWriter, readVirtualDirectoryFile } from "../../api";
import { parseCsv } from "../../lib/tableData";
import { diffTables, diffToHtml, parseTableDiff, type RowStatus, type TableDiffResult } from "../../lib/tableDiff";

const ROW_TINT: Record<RowStatus, string> = {
  added: "bg-emerald-50",
  deleted: "bg-red-50",
  changed: "",
  unchanged: "",
  regrouped: "bg-sky-50",
};

const CHIP: Record<RowStatus, { label: string; cls: string }> = {
  added: { label: "+", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  deleted: { label: "−", cls: "bg-red-100 text-red-800 border-red-300" },
  changed: { label: "~", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  unchanged: { label: "=", cls: "bg-muted text-muted-foreground border-transparent" },
  regrouped: { label: "≈", cls: "bg-sky-100 text-sky-800 border-sky-300" },
};

export default function TableDiffView({ content, path, agentId, height = "100%" }: ViewerProps) {
  const docPath = path ?? agentId ?? "";
  const doc = useMemo(() => parseTableDiff(content), [content]);
  const [result, setResult] = useState<TableDiffResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(true);
  const [exported, setExported] = useState<string | null>(null);

  // A dated SNAPSHOT of what the lens shows: one self-contained HTML file,
  // downloaded for sharing and — when the host can write — saved beside this
  // document so the snapshot has a handle too.
  const exportSnapshot = async () => {
    if (!result || result.error) return;
    const today = new Date().toISOString().slice(0, 10);
    const html = diffToHtml(doc, result, today);
    const stem = docPath ? docPath.slice(docPath.lastIndexOf("/") + 1).replace(/\.tablediff$/, "") : "diff";
    const name = `${stem}-snapshot-${today}.html`;
    const writer = configuredWriter();
    if (writer && docPath) {
      const abs = `${parentOf(docPath)}/${name}`;
      try { await writer(abs, html); setExported(nodeHandleOf(abs)); } catch { /* download still happens */ }
    }
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    setResult(null); setErr(null);
    if (!doc.left || !doc.right) { setErr("Declare both sides: left: {handle: …} and right: {handle: …}"); return; }
    let live = true;
    (async () => {
      try {
        const [l, r] = await Promise.all([
          readVirtualDirectoryFile(doc.left!.handle, doc.left!.handle),
          readVirtualDirectoryFile(doc.right!.handle, doc.right!.handle),
        ]);
        if (!live) return;
        setResult(diffTables(parseCsv(l.content).sheets[0], parseCsv(r.content).sheets[0], doc));
      } catch (e: unknown) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [doc]);

  const rows = useMemo(
    () => (result ? result.rows.filter((r) => showUnchanged || r.status !== "unchanged") : []),
    [result, showUnchanged],
  );

  return (
    <div style={{ height }} className="flex min-h-0 flex-col bg-background">
      <div className="shrink-0 space-y-1 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{doc.title}</h2>
          {docPath && <CopyHandleButton path={docPath} />}
          <Button size="xs" variant="outline" onClick={() => setShowUnchanged((v) => !v)}>
            {showUnchanged ? <EyeOff /> : <Eye />} {showUnchanged ? "Hide unchanged" : "Show unchanged"}
          </Button>
          <Button size="xs" variant="outline" onClick={exportSnapshot} disabled={!result || !!result.error}
            title="Download a self-contained colored HTML snapshot (and save it beside this document)">
            <Download /> Export
          </Button>
        </div>
        {exported && (
          <p className="text-[13px] text-muted-foreground">Snapshot saved: <span className="font-mono">{exported}</span></p>
        )}
        {doc.description && <p className="max-w-3xl text-[12px] leading-snug text-muted-foreground">{doc.description}</p>}
        {result && !result.error && (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-px font-medium text-emerald-800">
              + {result.counts.added} only in {doc.left?.label ?? "left"}
            </span>
            <span className="rounded-full border border-red-300 bg-red-100 px-2 py-px font-medium text-red-800">
              − {result.counts.deleted} only in {doc.right?.label ?? "right"}
            </span>
            <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-px font-medium text-amber-800">
              ~ {result.counts.changed} changed
            </span>
            {result.counts.regrouped > 0 && (
              <span className="rounded-full border border-sky-300 bg-sky-100 px-2 py-px font-medium text-sky-800"
                title="Same substance, sliced differently — the summed column agrees across both sides">
                ≈ {result.counts.regrouped} regrouped
              </span>
            )}
            <span className="rounded-full border bg-muted px-2 py-px font-medium text-muted-foreground">
              = {result.counts.unchanged} matching
            </span>
            <span className="text-muted-foreground">
              key: {result.key.join(" + ")}
              {doc.range && ` · ${doc.range.column} ${doc.range.since ? `from ${doc.range.since} ` : ""}${doc.range.until ? `until ${doc.range.until}` : ""}`}
              {" "}· changed cells read “{doc.right?.label ?? "right"} → {doc.left?.label ?? "left"}”
            </span>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {err ? <p className="p-4 text-sm text-destructive">{err}</p>
          : !result ? <p className="p-4 text-sm text-muted-foreground">Reading both tables…</p>
            : result.error ? <p className="p-4 text-sm text-destructive">{result.error}</p>
              : (
                <table className="border-collapse font-mono text-[13px] leading-5" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <thead>
                    <tr>
                      <th className="sticky top-0 z-10 border bg-sidebar px-1.5 py-0.5" />
                      {result.key.map((k) => (
                        <th key={k} className="sticky top-0 z-10 border bg-sidebar px-2 py-0.5 text-left text-xs font-semibold text-muted-foreground">{k}</th>
                      ))}
                      {result.columns.map((c) => (
                        <th key={c} className="sticky top-0 z-10 border bg-sidebar px-2 py-0.5 text-left text-xs font-semibold text-muted-foreground">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={cn(ROW_TINT[r.status], "hover:brightness-[0.98]")}>
                        <td className="border px-1 py-0.5 text-center">
                          <span className={cn("inline-block min-w-4 rounded border text-center text-xs font-bold", CHIP[r.status].cls)}
                            title={r.status}>{CHIP[r.status].label}</span>
                        </td>
                        {r.keyCells.map((v, j) => (
                          <td key={j} className="whitespace-nowrap border px-2 py-0.5">{v}</td>
                        ))}
                        {r.cells.map((c) => {
                          const regroupedSplit = r.status === "regrouped" && c.left !== c.right;
                          return (
                            <td key={c.column}
                              className={cn("whitespace-nowrap border px-2 py-0.5",
                                c.changed && "bg-amber-100 font-semibold text-amber-900",
                                regroupedSplit && "font-semibold text-sky-900")}
                              title={c.changed ? `${doc.right?.label ?? "right"}: ${c.right || "—"} → ${doc.left?.label ?? "left"}: ${c.left || "—"}`
                                : regroupedSplit ? `${doc.left?.label ?? "left"}: ${c.left} · ${doc.right?.label ?? "right"}: ${c.right} — same total` : undefined}>
                              {c.changed ? `${c.right || "—"} → ${c.left || "—"}`
                                : regroupedSplit ? `${c.left} ↔ ${c.right}`
                                  : (c.left ?? c.right ?? "")}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
      </div>
    </div>
  );
}
