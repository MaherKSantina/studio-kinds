/**
 * The item dialog every view of a `.views` document opens: the label, the
 * status, the dates, what it comes after and what comes after it, what it
 * is part of and what is part of it — every edge a JUMP — then every field
 * as written. Read only.
 */
import React from "react";
import { Check, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "crosscut";
import { cellText, childrenOf, columnIndexOf, columnsOf, followersOf, type ViewsDoc, type ViewsItem } from "../../lib/viewsDoc";

/** One colour per column, by index — the same in every view. */
export const COLUMN_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#64748b"];
export const colorOf = (item: ViewsItem, columns: string[]): string =>
  item.status ? COLUMN_COLORS[columnIndexOf(item, columns) % COLUMN_COLORS.length] : "#94a3b8";

function Chip({ item, columns, onJump }: { item: ViewsItem; columns: string[]; onJump: () => void }) {
  return (
    <button type="button" onClick={onJump}
      className="flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs hover:bg-accent">
      <span className="size-2 rounded-full" style={{ background: colorOf(item, columns) }} />
      <span>{item.title}</span>
      {item.status && <span className="text-muted-foreground">· {item.status}</span>}
    </button>
  );
}

function CopyId({ id }: { id: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button type="button" title="Copy the id" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={() => { void navigator.clipboard?.writeText(id).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }); }}>
      {done ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}

export function ItemDialog({ doc, itemId, onSelect, onClose }: {
  doc: ViewsDoc; itemId: string | null; onSelect: (id: string) => void; onClose: () => void;
}) {
  const item = doc.items.find((it) => it.id === itemId) ?? null;
  const columns = columnsOf(doc);
  const previous = item ? item.previous.map((p) => doc.items.find((it) => it.id === p)).filter((it): it is ViewsItem => !!it) : [];
  const followers = item ? followersOf(doc.items, item.id) : [];
  const parent = item?.parent ? doc.items.find((it) => it.id === item.parent) ?? null : null;
  const children = item ? childrenOf(doc.items, item.id) : [];
  return (
    <Dialog open={item !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col" style={{ maxWidth: "min(720px, 96vw)" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span className="min-w-0 truncate">{item?.title ?? ""}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">The item, what it comes after, and every field as written</DialogDescription>
        </DialogHeader>
        {item && (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              {item.status && (
                <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5">
                  <span className="size-2 rounded-full" style={{ background: colorOf(item, columns) }} />{item.status}
                </span>
              )}
              {(item.start || item.end) && (
                <span className="font-mono text-muted-foreground">{item.start ?? "?"} → {item.end ?? item.start}</span>
              )}
              {previous.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">after</span>
                  {previous.map((p) => <Chip key={p.id} item={p} columns={columns} onJump={() => onSelect(p.id)} />)}
                </span>
              )}
              {followers.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">followed by</span>
                  {followers.map((f) => <Chip key={f.id} item={f} columns={columns} onJump={() => onSelect(f.id)} />)}
                </span>
              )}
              {parent && (
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">part of</span>
                  <Chip item={parent} columns={columns} onJump={() => onSelect(parent.id)} />
                </span>
              )}
              {children.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">made of</span>
                  {children.map((c) => <Chip key={c.id} item={c} columns={columns} onJump={() => onSelect(c.id)} />)}
                </span>
              )}
            </div>
            <div className="min-h-0 overflow-y-auto rounded border">
              <table className="w-full text-[13px]">
                <tbody>
                  {Object.entries(item.fields).map(([k, v]) => (
                    <tr key={k} className="border-b align-top last:border-b-0">
                      <td className="w-[1%] whitespace-nowrap bg-muted/40 px-2 py-1 font-mono text-muted-foreground">{k}</td>
                      <td className="px-2 py-1">
                        <span className="flex items-start gap-1">
                          <span className="min-w-0 break-words whitespace-pre-wrap">{cellText(v)}</span>
                          {k === doc.fields.id && <CopyId id={item.id} />}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
