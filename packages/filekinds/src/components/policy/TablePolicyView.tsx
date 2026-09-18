/**
 * A table policy (`role: table`) open — its rules in words: which rows it
 * keeps, in what order, which columns it shows. Nothing else: the rows
 * belong to the `.jsonl` that names its sources and this policy.
 */
import React from "react";
import { clauseSentence, type TablePolicyDoc } from "../../lib/tablePolicy";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export default function TablePolicyView({ doc, height = "100%", fileName }: { doc: TablePolicyDoc; height?: number | string; fileName?: string }) {
  const hidden = new Set(doc.hide);
  const shown = doc.columns?.filter((c) => !hidden.has(c));
  return (
    <div style={{ height }} className="overflow-auto bg-background p-4 text-sm">
      <h2 className="text-[15px] font-semibold">{doc.title || fileName || "Table policy"}</h2>
      {doc.description && <p className="mt-1 text-muted-foreground">{doc.description}</p>}
      {doc.problems.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <p className="font-medium">{doc.problems.length} problem{doc.problems.length === 1 ? "" : "s"}</p>
          <ul className="mt-1 list-disc pl-5">{doc.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}

      <Section title="Keeps the rows where">
        {doc.where.length ? (
          <ul className="list-disc pl-5 leading-6">
            {doc.where.map((c, i) => <li key={i}>{clauseSentence(c)}</li>)}
          </ul>
        ) : <p className="text-muted-foreground">every row — no filters</p>}
      </Section>

      <Section title="In the order">
        {doc.sort.length ? (
          <ol className="list-decimal pl-5 leading-6">
            {doc.sort.map((s, i) => <li key={i}><code>{s.field}</code> {s.dir === "asc" ? "ascending" : "descending"}</li>)}
          </ol>
        ) : <p className="text-muted-foreground">as they come from the sources</p>}
      </Section>

      <Section title="Showing the columns">
        {shown ? (
          <div className="flex flex-wrap gap-1">
            {shown.map((c) => (
              <span key={c} className="rounded-md border bg-sidebar px-1.5 py-0.5 font-mono text-[12px]">{c}</span>
            ))}
            {!shown.length && <span className="text-muted-foreground">none — every named column is hidden</span>}
          </div>
        ) : <p className="text-muted-foreground">every column the rows carry{doc.hide.length ? ", except the hidden ones" : ""}</p>}
        {doc.hide.length > 0 && <p className="mt-1 text-[13px] text-muted-foreground">Hidden: {doc.hide.join(", ")}</p>}
        {doc.limit && <p className="mt-1 text-[13px] text-muted-foreground">At most {doc.limit.toLocaleString()} rows.</p>}
      </Section>
    </div>
  );
}
