/**
 * A `.middleware` open — the source chain, then the rules: each in words with
 * a button carrying its match count that opens the matched rows (as amended)
 * in a dialog. Nothing else on the page. Re-read when any file in the chain
 * changes on disk.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "crosscut";
import { readVirtualDirectoryFile } from "../../api";
import { ViewerProps } from "../../lib/filePreviews";
import { applyMiddleware, parseMiddleware, setText } from "../../lib/middlewareDoc";
import { chainText, readSourceRows, type ResolvedRows } from "../../lib/dataSources";
import { clauseSentence, columnsOf } from "../../lib/tablePolicy";
import { DataGrid } from "../data/DataTableView";

export default function MiddlewareView({ content, path, agentId, height = "100%" }: ViewerProps) {
  const doc = useMemo(() => parseMiddleware(content ?? ""), [content]);
  const base = path ?? agentId ?? "/";
  const name = base.slice(base.lastIndexOf("/") + 1);
  const [src, setSrc] = useState<ResolvedRows | null>(null);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const sourceKey = doc.source ? `${doc.source.file}#${doc.source.path ?? ""}` : "";

  useEffect(() => {
    setSrc(null);
    if (!doc.source) return;
    let live = true;
    readSourceRows(doc.source, base, (abs) => readVirtualDirectoryFile(abs, abs).then((r) => r.content))
      .then((r) => { if (live) setSrc(r); });
    return () => { live = false; };
  }, [base, sourceKey, version]); // eslint-disable-line react-hooks/exhaustive-deps -- sourceKey stands for doc.source
  useEffect(() => {
    const watched = new Set(src?.files ?? []);
    const onChanged = (e: Event) => { if (watched.has((e as CustomEvent<string>).detail)) setVersion((v) => v + 1); };
    window.addEventListener("studio:fs-changed", onChanged);
    return () => window.removeEventListener("studio:fs-changed", onChanged);
  }, [src]);

  const result = useMemo(() => (src ? applyMiddleware({ ...doc, problems: [] }, src.rows) : null), [doc, src]);
  const problems = [...doc.problems, ...(src?.problems ?? []), ...(result?.problems ?? [])];

  // The rows one rule matched, as amended, its set fields first.
  const shown = useMemo(() => {
    if (open === null || !result) return null;
    const rows = result.matches[open].map((i) => result.rows[i]);
    const setKeys = Object.keys(doc.rules[open]?.set ?? {});
    return { rows, columns: [...setKeys, ...columnsOf(rows).filter((c) => !setKeys.includes(c))] };
  }, [open, result, doc.rules]);

  return (
    <div style={{ height }} className="overflow-auto bg-background p-4 text-sm">
      <h2 className="text-[15px] font-semibold">{doc.title || name}</h2>
      {doc.description && <p className="mt-1 text-muted-foreground">{doc.description}</p>}
      <p className="mt-2 text-[13px]">
        <span className="text-muted-foreground">Source · </span>
        {doc.source ? <code>{src ? chainText(src) : `${doc.source.file}${doc.source.path ? `#${doc.source.path}` : ""} — reading…`}</code>
          : <span className="text-amber-900">none</span>}
      </p>
      {problems.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <ul className="list-disc pl-5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      <ol className="mt-4 list-decimal space-y-2 pl-5">
        {doc.rules.map((rule, i) => {
          const hit = result?.matches[i] ?? null;
          return (
            <li key={i} className="leading-6">
              <div>
                <span className="text-muted-foreground">where </span>
                {rule.where.length ? rule.where.map((c, j) => <span key={j}>{j > 0 && <span className="text-muted-foreground"> and </span>}{clauseSentence(c)}</span>) : <span>every row</span>}
              </div>
              <div><span className="text-muted-foreground">set </span><code className="text-[12px]">{setText(rule.set)}</code></div>
              {rule.note && <div className="text-[13px] text-muted-foreground">{rule.note}</div>}
              <div>
                {!hit ? <span className="text-muted-foreground">…</span>
                  : hit.length ? <Button size="xs" variant="outline" onClick={() => setOpen(i)}>{hit.length.toLocaleString()} row{hit.length === 1 ? "" : "s"}</Button>
                  : <span className="text-amber-900">matches no row</span>}
              </div>
            </li>
          );
        })}
      </ol>
      <Dialog open={shown !== null} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="flex max-h-[85dvh] flex-col gap-2 overflow-hidden p-4" style={{ maxWidth: "min(1100px, 96vw)" }}>
          <DialogHeader className="pr-8">
            <DialogTitle className="text-[15px]">Rule {open === null ? "" : open + 1} · {shown?.rows.length.toLocaleString()} row{shown?.rows.length === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription className="sr-only">The rows this rule matched, as amended</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            {shown && <DataGrid rows={shown.rows} columns={shown.columns} height="auto" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
