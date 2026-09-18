/**
 * A STRUCTURED NODE — on the fs it is a `*.node` folder with two halves:
 * `schema.*` (the shape: a type + entries with STABLE IDS) and `content.*`
 * (the data: rows referencing those ids). crosscut's `entry-presentation`
 * table makes the tree read the folder as one document; this view is its
 * open surface, with three FACES:
 *
 *   Structured — the composed join, drawn by the schema's type (a kanban
 *               schema + a content list = the live board);
 *   Schema     — the schema document through its own kind (SchemaView);
 *   Content    — the content document through its own kind (a .list gets
 *               the full list view).
 *
 * The split is the point: any node can be broken into shape and data this
 * way, and each half stays an ordinary file other tools already understand.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Boxes, ExternalLink } from "lucide-react";
import {
  Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  cn, joinPath, nameOf, resolveRef,
} from "crosscut";
import { configuredLister, readVirtualDirectoryFile } from "../api";
import { SchemaDoc, contentByEntry, parseSchemaDoc, splitHalvesOf } from "../lib/schemaDoc";
import { readListRows } from "../lib/listCollate";
import type { DocListItem } from "../lib/listDoc";
import { CompositeBoard } from "./composite/CompositeBoard";
import { DocumentPreview } from "./DocumentPreview";
import { RowFieldsBlock } from "./list/DocListView";

type Face = "structured" | "schema" | "content";

const stemOf = (name: string) => (name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name);

/** One content row as a board card: label, a light sub, the url a click away.
 *  A `rank` field rides the sub — ordered pools stay legible on the board. */
function RowCard({ it, onClick }: { it: DocListItem; onClick: () => void }) {
  const base = it.fields?.company ?? it.fields?.source ?? it.fields?.location;
  const sub = it.fields?.rank ? `#${it.fields.rank}${base ? ` · ${base}` : ""}` : base;
  return (
    <button type="button" onClick={onClick}
      className="w-full rounded-md border bg-card px-2 py-1.5 text-left hover:border-primary">
      <p className="text-[13px] font-semibold leading-tight [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] overflow-hidden">
        {it.label ?? "(unlabelled)"}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </button>
  );
}

function Board({ schema, rows, onRow }: {
  schema: SchemaDoc; rows: DocListItem[]; onRow: (it: DocListItem) => void;
}) {
  const { groups, unfiled } = useMemo(() => contentByEntry(schema, rows), [schema, rows]);
  const column = (key: string, head: React.ReactNode, items: DocListItem[], amber = false) => (
    <div key={key}
      className={cn("flex w-[188px] shrink-0 flex-col rounded-lg border bg-sidebar/60",
        amber && "border-warning/60 bg-warning/5")}>
      <div className="border-b px-2 py-1.5">{head}</div>
      <div className="flex min-h-10 flex-col gap-1 overflow-y-auto p-1.5">
        {items.map((it, i) => <RowCard key={i} it={it} onClick={() => onRow(it)} />)}
      </div>
    </div>
  );
  return (
    <div className="flex h-full items-stretch gap-2 overflow-x-auto p-3">
      {groups.map((g) => column(g.entry.id, (
        <div title={g.entry.detail ?? g.entry.id}>
          <p className="text-xs font-bold">{g.entry.label} <span className="font-normal text-muted-foreground">· {g.items.length}</span></p>
          <p className="font-mono text-xs text-muted-foreground">{g.entry.id}</p>
        </div>
      ), g.items))}
      {unfiled.length > 0 && column("~unfiled", (
        <p className="text-xs font-bold text-warning"
          title={`Rows whose ${schema.field}: matches no schema id — fix the row or add the id to the schema`}>
          Unfiled · {unfiled.length}
        </p>
      ), unfiled, true)}
    </div>
  );
}

export function SplitNodeView({ path, trailing, className }: {
  /** The `*.node` folder itself, e.g. "/Job Hunt/applications.node". */
  path: string;
  /** Host controls appended to the face strip (a Close button, say). */
  trailing?: React.ReactNode;
  className?: string;
}) {
  const [face, setFace] = useState<Face>("structured");
  const [halves, setHalves] = useState<{ schema: string | null; content: string | null } | null>(null);
  const [schemaText, setSchemaText] = useState<string | null>(null);
  const [contentText, setContentText] = useState<string | null>(null);
  const [rows, setRows] = useState<DocListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<DocListItem | null>(null);
  const [rowDoc, setRowDoc] = useState<{ path: string; content: string } | null>(null);

  useEffect(() => {
    let live = true;
    setFace("structured"); setHalves(null); setSchemaText(null); setContentText(null);
    setRows(null); setErr(null); setOpenRow(null); setRowDoc(null);
    (async () => {
      const lister = configuredLister();
      if (!lister) { setErr("The host has not configured a file lister."); return; }
      try {
        const found = splitHalvesOf(await lister(path) as { name: string; kind: "folder" | "file" }[]);
        if (!live) return;
        setHalves(found);
        if (found.schema) {
          const t = (await readVirtualDirectoryFile(joinPath(path, found.schema), joinPath(path, found.schema))).content;
          if (live) setSchemaText(t);
        }
        if (found.content) {
          const abs = joinPath(path, found.content);
          const t = (await readVirtualDirectoryFile(abs, abs)).content;
          if (!live) return;
          setContentText(t);
          if (found.content.endsWith(".list")) {
            const r = await readListRows(abs);
            if (live) setRows(r.rows);
          }
        }
      } catch (e: unknown) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [path]);

  const schema = useMemo(() => (schemaText !== null ? parseSchemaDoc(schemaText) : null), [schemaText]);
  const schemaAbs = halves?.schema ? joinPath(path, halves.schema) : null;
  const contentAbs = halves?.content ? joinPath(path, halves.content) : null;

  // A row backed by a document opens that document; a plain row shows fields.
  const onRow = (it: DocListItem) => {
    setOpenRow(it); setRowDoc(null);
    if (it.file && contentAbs) {
      const abs = resolveRef(contentAbs, it.file);
      readVirtualDirectoryFile(abs, abs).then(
        (r) => setRowDoc({ path: abs, content: r.content }),
        () => setRowDoc(null),
      );
    }
  };

  const facePill = (f: Face, label: string, title: string) => (
    <button key={f} type="button" title={title} onClick={() => setFace(f)}
      className={cn("rounded px-2 py-0.5 text-xs font-medium",
        face === f ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
      {label}
    </button>
  );

  const gap = (what: "schema" | "content") => (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      This node has no {what} half yet — add a file named “{what}.&lt;kind&gt;” inside {nameOf(path)}.
    </div>
  );

  const structuredFace = () => {
    if (!halves) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
    if (!halves.schema) return gap("schema");
    if (!halves.content) return gap("content");
    if (!schema) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
    if (rows === null) {
      return (
        <div className="p-6 text-sm text-muted-foreground">
          The content half is “{halves.content}” — no structured join for that kind yet; use the Content face.
        </div>
      );
    }
    if (schema.type === "kanban") return <Board schema={schema} rows={rows} onRow={onRow} />;
    // Composite: streams by driver — a via click opens that file in the dialog.
    if (schema.type === "composite") {
      return (
        <CompositeBoard schema={schema} rows={rows} onRow={onRow}
          onOpenFile={(abs) => onRow({ label: nameOf(abs), file: abs })} />
      );
    }
    // A type without a dedicated composed view still shows the join.
    const { groups, unfiled } = contentByEntry(schema, rows);
    return (
      <div className="overflow-auto p-4">
        <p className="mb-2 text-xs text-muted-foreground">
          No composed view for type “{schema.type || "?"}” yet — the join, generically:
        </p>
        {groups.map((g) => (
          <div key={g.entry.id} className="mb-2">
            <p className="text-xs font-bold">{g.entry.label} <span className="font-mono text-xs text-muted-foreground">{g.entry.id}</span> · {g.items.length}</p>
            <p className="text-[13px] text-muted-foreground">{g.items.map((i) => i.label).join(" · ") || "—"}</p>
          </div>
        ))}
        {unfiled.length > 0 && <p className="text-xs text-warning">Unfiled · {unfiled.length}</p>}
      </div>
    );
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3">
        <Boxes className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 truncate text-[12px] font-semibold">{stemOf(nameOf(path))}</span>
        <span className="text-xs text-muted-foreground">
          structured node{schema ? ` · ${schema.type || "untyped"}` : ""}
        </span>
        <div className="flex flex-1 justify-center">
          <div className="flex rounded-md border p-0.5">
            {facePill("structured", "Structured", "The composed view — schema shape filled with content")}
            {facePill("schema", "Schema", "The shape: entries with stable ids, drawn by its type")}
            {facePill("content", "Content", "The data: rows referencing schema ids")}
          </div>
        </div>
        {trailing}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {err ? <div className="p-6 text-sm text-destructive">{err}</div>
          : face === "schema" ? (
            !halves ? <div className="p-6 text-sm text-muted-foreground">Loading…</div>
              : !schemaAbs || schemaText === null ? gap("schema")
                : <DocumentPreview key={schemaAbs} path={schemaAbs} content={schemaText} />
          ) : face === "content" ? (
            !halves ? <div className="p-6 text-sm text-muted-foreground">Loading…</div>
              : !contentAbs || contentText === null ? gap("content")
                : <DocumentPreview key={contentAbs} path={contentAbs} content={contentText} />
          ) : structuredFace()}
      </div>

      {/* A card's depth: its document when it has one, its fields otherwise. */}
      <Dialog open={openRow !== null} onOpenChange={(o) => { if (!o) { setOpenRow(null); setRowDoc(null); } }}>
        <DialogContent className={rowDoc ? "flex h-[80dvh] max-w-3xl flex-col" : "sm:max-w-md"}>
          <DialogHeader>
            <DialogTitle className="text-sm">{openRow?.label}</DialogTitle>
            <DialogDescription className="sr-only">Row detail</DialogDescription>
          </DialogHeader>
          {rowDoc ? (
            <div className="min-h-0 flex-1 overflow-hidden rounded border">
              <DocumentPreview path={rowDoc.path} content={rowDoc.content} />
            </div>
          ) : openRow ? (
            <div className="space-y-1">
              <RowFieldsBlock it={openRow} />
              {openRow.fields?.url && (
                <Button size="xs" variant="outline" onClick={() => window.open(openRow.fields!.url, "_blank", "noopener,noreferrer")}>
                  <ExternalLink /> Open listing
                </Button>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SplitNodeView;
