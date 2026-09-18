/**
 * The `.schema` viewer — the SHAPE half of a structured node, drawn by its
 * TYPE. A kanban schema reads as the column pipeline itself; a type without
 * a dedicated view yet still renders its entries generically, because the
 * ids are the contract whether or not anyone drew them prettily.
 *
 * Everything here is deliberately about STABLE IDS: each entry shows its id
 * beside its label, so "relabel freely, never rename the id" stays visible.
 */
import React from "react";
import { ViewerProps } from "../../lib/filePreviews";
import { SchemaDoc, parseSchemaDoc } from "../../lib/schemaDoc";

function EntryCard({ id, label, detail }: { id: string; label: string; detail?: string }) {
  return (
    <div className="min-w-[150px] max-w-[220px] shrink-0 rounded-lg border bg-card px-3 py-2">
      <p className="text-sm font-semibold leading-tight">{label}</p>
      <p className="mt-1 w-fit rounded bg-accent px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
        title="The stable id — content references this, never the label">
        {id}
      </p>
      {detail && <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{detail}</p>}
    </div>
  );
}

function KanbanSchema({ doc }: { doc: SchemaDoc }) {
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto pb-2">
      {doc.entries.map((e, i) => (
        <React.Fragment key={e.id}>
          {i > 0 && <div className="flex items-center text-lg font-bold text-muted-foreground/60">→</div>}
          <EntryCard {...e} />
        </React.Fragment>
      ))}
      {!doc.entries.length && <p className="text-sm text-muted-foreground">No columns yet.</p>}
    </div>
  );
}

const DRIVER_BADGE: Record<string, string> = {
  observed: "bg-sky-100 text-sky-800",
  derived: "bg-violet-100 text-violet-800",
  authored: "bg-emerald-100 text-emerald-800",
};

function CompositeSchema({ doc }: { doc: SchemaDoc }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {doc.entries.map((e) => (
        <div key={e.id} className="w-[240px] rounded-lg border bg-card px-3 py-2">
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">{e.label}</p>
            <span className={`rounded px-1 py-px font-mono text-xs font-medium ${DRIVER_BADGE[(e.driver ?? "").toLowerCase()] ?? "bg-accent text-muted-foreground"}`}
              title="Who authors this stream's changes — decides its staleness semantics">
              {e.driver ?? "no driver"}
            </span>
          </div>
          <p className="mt-1 w-fit rounded bg-accent px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
            title="The stable id — arrivals reference this via the stream: field">
            {e.id}
          </p>
          {e.detail && <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{e.detail}</p>}
          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {e.source && <p className="truncate">source · {e.source}{e.cadence ? ` · ${e.cadence}` : ""}</p>}
            {e.via && <p className="truncate font-mono">via {e.via}</p>}
            {e.of && <p>reads <span className="font-mono">{e.of}</span></p>}
          </div>
        </div>
      ))}
      {!doc.entries.length && <p className="text-sm text-muted-foreground">No streams yet.</p>}
    </div>
  );
}

function GenericSchema({ doc }: { doc: SchemaDoc }) {
  return (
    <div className="max-w-xl">
      <p className="mb-2 text-xs text-muted-foreground">
        No dedicated view for type “{doc.type || "?"}” yet — the shape is still the contract.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {doc.entries.map((e) => <EntryCard key={e.id} {...e} />)}
        {!doc.entries.length && <p className="text-sm text-muted-foreground">No entries yet.</p>}
      </div>
    </div>
  );
}

export default function SchemaView({ content, height = "100%" }: ViewerProps) {
  const doc = parseSchemaDoc(content);
  return (
    <div style={{ height }} className="min-h-0 overflow-auto bg-background p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-base font-semibold">{doc.title}</h2>
        <span className="text-[13px] text-muted-foreground">
          {doc.type || "untyped"} schema · {doc.entries.length} {doc.entries.length === 1 ? "entry" : "entries"} ·
          content references ids via <span className="font-mono">{doc.field}:</span>
        </span>
      </div>
      {doc.type === "kanban" ? <KanbanSchema doc={doc} />
        : doc.type === "composite" ? <CompositeSchema doc={doc} />
          : <GenericSchema doc={doc} />}
      <p className="mt-3 text-[13px] text-muted-foreground">
        Ids are stable: relabel an entry freely — renaming its id orphans every content row referencing it.
      </p>
    </div>
  );
}
