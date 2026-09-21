/**
 * A `.collection` open, two ways over the same order:
 *
 *   FLOW — one item at a time: its pictures to flip through (a star makes
 *   one the item's featured picture), the stats as big cards under the
 *   picture, the other facts below, its link, directions to the collection's
 *   `to`, and the decision buttons (push up, push down, hide) with a reason.
 *   A rail on the left lists the whole order with each item's featured
 *   picture and jumps.
 *   GALLERY — every item as a card: featured picture, title, the stats, and
 *   the same decision buttons with a reason on the card.
 *
 * A decision is appended to the file's log at once; the position stays, so
 * the next item takes the place of the one just decided. A fact (a commute
 * time looked up) is edited on the spot by clicking it — that changes the
 * item, with no reason. Arrow keys flip items; `u`, `d`, `h` decide; `f`
 * features the picture shown — outside an input.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ArrowBigDown, ArrowBigUp, ChevronLeft, ChevronRight, EyeOff, GalleryHorizontal, Navigation, Rows3, RotateCcw, Star, Undo2 } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, cn } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { configuredWriter, isRemoteUrl, remoteContentAllowed } from "../../api";
import {
  collectionSummary, dumpCollection, featuredOf, orderedItems, originOf, parseCollection, parseFieldInput, setItemField,
  type CollectionDecision, type CollectionDoc, type CollectionOp, type ItemState,
} from "../../lib/collectionDoc";
import { cellText, valueAt, type DataRow } from "../../lib/dataRows";
import { CopyButton, LinkText, isUrl } from "../data/cells";

/** An item's picture: fetched when the host allows remote content, a held placeholder otherwise —
 *  the pictures of a `.collection` live where the listing does, so showing one is a request there. */
function ItemImage({ src, className, eager }: { src: string; className?: string; eager?: boolean }) {
  if (isRemoteUrl(src) && !remoteContentAllowed()) {
    return (
      <span className={cn("flex items-center justify-center bg-muted p-2 text-center text-[12px] text-muted-foreground", className)} title={src}>
        Picture not fetched — remote content is off
      </span>
    );
  }
  return <img src={src} alt="" loading={eager ? undefined : "lazy"} referrerPolicy="no-referrer" className={className} />;
}

/** The item's pictures: `images`, `photos`, or one `image`. */
export function imagesOf(item: DataRow): string[] {
  for (const k of ["images", "photos", "pictures"]) {
    const v = item[k];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && isUrl(x));
  }
  const one = item.image ?? item.photo;
  return typeof one === "string" && isUrl(one) ? [one] : [];
}

/** The item's page: the first shown field that is a link, else any link it carries one level down. */
export function linkOf(item: DataRow, fields: string[]): string | null {
  for (const f of fields) { const v = valueAt(item, f); if (typeof v === "string" && isUrl(v)) return v; }
  const scan = (o: DataRow): string | null => {
    for (const v of Object.values(o)) if (typeof v === "string" && isUrl(v)) return v;
    return null;
  };
  const top = scan(item);
  if (top) return top;
  for (const v of Object.values(item)) if (v && typeof v === "object" && !Array.isArray(v)) { const u = scan(v as DataRow); if (u) return u; }
  return null;
}

const OP_LABEL: Record<CollectionOp, string> = { up: "▲ up", down: "▼ down", hide: "hidden", show: "shown again" };
const titleOf = (item: DataRow, fields: string[]) => cellText(item.name ?? valueAt(item, fields[0] ?? "name"));
const domainOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

/** A value that turns into an input on click; Enter or blur saves, Escape leaves it. */
function Editable({ value, onSave, className, big }: { value: unknown; onSave: (next: unknown) => void; className?: string; big?: boolean }) {
  const [editing, setEditing] = useState(false);
  const text = cellText(value);
  if (editing) {
    return (
      <Input autoFocus defaultValue={text} aria-label="Edit value"
        className={cn("h-7 text-[13px]", big && "h-9 text-[20px] font-semibold", className)}
        onBlur={(e) => { setEditing(false); const next = parseFieldInput(e.target.value, value); if (next !== value) onSave(next); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { (e.target as HTMLInputElement).value = text; (e.target as HTMLInputElement).blur(); } }} />
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} title="Click to edit"
      className={cn("min-w-[2ch] rounded px-1 text-left hover:bg-accent/60", !text && "text-muted-foreground", className)}>
      {text || "—"}
    </button>
  );
}

/** The big cards: a number to read at a glance (editable), or a link to open. */
function StatCards({ item, stats, label, onEdit, compact }: {
  item: DataRow; stats: string[]; label: (f: string) => string; onEdit?: (path: string, next: unknown) => void; compact?: boolean;
}) {
  if (!stats.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", compact ? "gap-1.5" : "gap-3")}>
      {stats.map((f) => {
        const v = valueAt(item, f);
        const t = cellText(v);
        if (isUrl(t)) {
          return (
            <a key={f} href={t} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={t}
              className={cn("flex min-w-0 flex-col justify-center rounded-lg border bg-sidebar hover:bg-accent/40", compact ? "px-2 py-1" : "px-4 py-2")}>
              <span className={cn("truncate font-semibold text-primary underline underline-offset-2", compact ? "text-[13px]" : "text-[18px]")}>{domainOf(t)}</span>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label(f)}</span>
            </a>
          );
        }
        return (
          <div key={f} className={cn("flex min-w-[96px] flex-col justify-center rounded-lg border bg-sidebar", compact ? "px-2 py-1" : "px-4 py-2")}>
            {onEdit
              ? <Editable value={v} onSave={(n) => onEdit(f, n)} big={!compact} className={cn("tabular-nums", compact ? "text-[15px] font-semibold" : "text-[22px] font-semibold")} />
              : <span className={cn("tabular-nums font-semibold", compact ? "text-[15px]" : "text-[22px]", !t && "text-muted-foreground")}>{t || "—"}</span>}
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label(f)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Reason + the three decisions, the same on the flow's card and on a gallery card. */
function Decide({ state, reason, setReason, onDecide, compact }: {
  state: ItemState; reason: string; setReason: (r: string) => void; onDecide: (op: CollectionOp) => void; compact?: boolean;
}) {
  const size = compact ? "xs" : "sm";
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" aria-label="Reason" className={cn("text-[13px]", compact ? "h-7" : "h-8")}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }} />
      <div className={cn("flex flex-wrap gap-2", compact ? "mt-1.5 gap-1.5" : "mt-2")}>
        <Button size={size} onClick={() => onDecide("up")} title="Push up (u)"><ArrowBigUp /> Up</Button>
        <Button size={size} onClick={() => onDecide("down")} title="Push down (d)"><ArrowBigDown /> Down</Button>
        {state.hidden
          ? <Button size={size} variant="outline" onClick={() => onDecide("show")} title="Show again"><RotateCcw /> Restore</Button>
          : <Button size={size} variant="outline" onClick={() => onDecide("hide")} title="Hide (h)"><EyeOff /> Hide</Button>}
      </div>
    </div>
  );
}

const RankBadge = ({ s, index, className }: { s: ItemState; index: number; className?: string }) => (
  <span className={cn("tabular-nums", s.hidden ? "text-muted-foreground line-through" : s.rank > 0 ? "text-green-700" : s.rank < 0 ? "text-amber-800" : "text-muted-foreground", className)}>
    {s.hidden ? "hid" : s.rank > 0 ? `▲${s.rank}` : s.rank < 0 ? `▼${-s.rank}` : `${index + 1}`}
  </span>
);

export default function CollectionView({ content, path, agentId, height = "100%", onChange }: ViewerProps) {
  const base = path ?? agentId ?? "/";
  const name = base.slice(base.lastIndexOf("/") + 1);
  const parsed = useMemo(() => parseCollection(content ?? ""), [content]);
  const [draft, setDraft] = useState<CollectionDoc>(parsed);
  useEffect(() => { setDraft(parsed); }, [parsed]);

  const [mode, setMode] = useState<"flow" | "gallery">("flow");
  const [showHidden, setShowHidden] = useState(false);
  const [pos, setPos] = useState(0);
  const [img, setImg] = useState(0);
  const [reason, setReason] = useState("");
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [dir, setDir] = useState(false);

  const ordered = useMemo(() => orderedItems(draft, showHidden), [draft, showHidden]);
  const at = Math.min(pos, Math.max(0, ordered.length - 1));
  const state: ItemState | null = ordered[at] ?? null;
  const item = state?.item ?? null;
  const images = useMemo(() => (item ? imagesOf(item) : []), [item]);
  const featured = item ? featuredOf(item, images) : null;
  const link = item ? linkOf(item, draft.fields) : null;
  const summary = collectionSummary(draft);
  const details = draft.fields.filter((f) => !draft.stats.includes(f));
  const label = (f: string) => draft.labels[f] ?? f;
  // A new item opens on its featured picture.
  useEffect(() => { setImg(Math.max(0, featured ? images.indexOf(featured) : 0)); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (next: CollectionDoc) => {
    setDraft(next);
    const text = dumpCollection(next);
    if (onChange) onChange(text);
    else void configuredWriter()?.(base, text);
  };
  const decideOn = (target: ItemState, op: CollectionOp, why: string) => {
    const r = why.trim();
    persist({ ...draft, decisions: [...draft.decisions, { item: target.item.id, op, ...(r ? { reason: r } : {}) }] });
  };
  const decide = (op: CollectionOp) => { if (state) { decideOn(state, op, reason); setReason(""); } };
  const undo = () => { if (draft.decisions.length) persist({ ...draft, decisions: draft.decisions.slice(0, -1) }); };
  const setReasonOf = (d: CollectionDecision, text: string) => {
    const i = draft.decisions.indexOf(d);
    if (i < 0 || (d.reason ?? "") === text.trim()) return;
    const decisions = draft.decisions.slice();
    decisions[i] = { item: d.item, op: d.op, ...(text.trim() ? { reason: text.trim() } : {}) };
    persist({ ...draft, decisions });
  };
  const setTo = (to: string) => { if ((draft.to ?? "") !== to.trim()) persist({ ...draft, ...(to.trim() ? { to: to.trim() } : {}) }); };
  const editField = (id: number, pathOf: string, next: unknown) => persist(setItemField(draft, id, pathOf, next));
  const feature = (url: string | undefined) => { if (item) editField(item.id, "featured", item.featured === url ? undefined : url); };

  const move = (d: number) => setPos(Math.max(0, Math.min(ordered.length - 1, at + d)));
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || dir || mode !== "flow") return;
    if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    else if (e.key === "u") decide("up");
    else if (e.key === "d") decide("down");
    else if (e.key === "h") decide("hide");
    else if (e.key === "f" && images[img]) feature(images[img]);
  };

  const origin = item ? originOf(item) : "";
  const to = draft.to ?? "";
  const embed = `https://maps.google.com/maps?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(to)}&output=embed`;
  const mapsLink = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(to)}&travelmode=driving`;
  const shownImg = images[Math.min(img, images.length - 1)];

  return (
    <div style={{ height }} className="flex min-h-0 flex-col bg-background text-sm outline-none" tabIndex={0} onKeyDown={onKey}>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5 text-[13px]">
        <span className="font-medium">{name}</span>
        <span className="flex overflow-hidden rounded-md border">
          <button type="button" onClick={() => setMode("flow")} className={cn("flex items-center gap-1 px-2 py-0.5", mode === "flow" ? "bg-accent" : "hover:bg-accent/40")} title="One at a time"><Rows3 className="size-3.5" /> Flow</button>
          <button type="button" onClick={() => setMode("gallery")} className={cn("flex items-center gap-1 border-l px-2 py-0.5", mode === "gallery" ? "bg-accent" : "hover:bg-accent/40")} title="All at once"><GalleryHorizontal className="size-3.5" /> Gallery</button>
        </span>
        <span className="text-muted-foreground">
          {summary.shown.toLocaleString()} shown · {summary.up} up · {summary.down} down · {summary.hidden} hidden
          {summary.unreasoned > 0 && <span className="text-amber-900"> · {summary.unreasoned} without a reason</span>}
        </span>
        <label className="flex items-center gap-1 text-muted-foreground">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> show hidden
        </label>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span>to</span>
          <Input defaultValue={to} key={to} onBlur={(e) => setTo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="Narooma NSW" aria-label="Directions to" className="h-7 w-40 text-[13px]" />
        </span>
        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
          <Button size="xs" variant="ghost" onClick={undo} disabled={!draft.decisions.length} title="Undo the last decision"><Undo2 /> Undo</Button>
          {mode === "flow" && (
            <>
              <Button size="xs" variant="ghost" onClick={() => move(-1)} disabled={at <= 0} aria-label="Previous item"><ChevronLeft /></Button>
              <span className="tabular-nums">{ordered.length ? at + 1 : 0} / {ordered.length}</span>
              <Button size="xs" variant="ghost" onClick={() => move(1)} disabled={at >= ordered.length - 1} aria-label="Next item"><ChevronRight /></Button>
            </>
          )}
        </span>
      </div>
      {draft.problems.length > 0 && (
        <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-3 py-1 text-[12px] text-amber-900">
          {draft.problems.slice(0, 3).join("; ")}{draft.problems.length > 3 ? "; …" : ""}
        </div>
      )}

      {mode === "gallery" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {ordered.length ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {ordered.map((s, i) => {
                const pics = imagesOf(s.item);
                const pic = featuredOf(s.item, pics);
                return (
                  <div key={s.item.id} className={cn("flex flex-col overflow-hidden rounded-lg border bg-background", s.hidden && "opacity-60")}>
                    <button type="button" onClick={() => { setPos(i); setMode("flow"); }} className="relative block aspect-[4/3] w-full bg-muted" title="Open in the flow">
                      {pic ? <ItemImage src={pic} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-muted-foreground">No picture</span>}
                      <RankBadge s={s} index={i} className="absolute left-2 top-2 rounded bg-background/90 px-1.5 text-[12px] font-medium" />
                    </button>
                    <div className="flex flex-1 flex-col gap-2 p-2">
                      <button type="button" onClick={() => { setPos(i); setMode("flow"); }} className="truncate text-left text-[14px] font-semibold hover:underline" title={titleOf(s.item, draft.fields)}>
                        {titleOf(s.item, draft.fields)}
                      </button>
                      <StatCards item={s.item} stats={draft.stats} label={label} compact onEdit={(f, n) => editField(s.item.id, f, n)} />
                      <div className="mt-auto">
                        <Decide state={s} compact reason={reasons[s.item.id] ?? ""} setReason={(r) => setReasons((m) => ({ ...m, [s.item.id]: r }))}
                          onDecide={(op) => { decideOn(s, op, reasons[s.item.id] ?? ""); setReasons((m) => ({ ...m, [s.item.id]: "" })); }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-muted-foreground">{draft.items.length ? "Every item is hidden." : "No items."}</p>}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ol className="w-64 shrink-0 overflow-auto border-r">
            {ordered.map((s, i) => {
              const pics = imagesOf(s.item);
              const pic = featuredOf(s.item, pics);
              return (
                <li key={s.item.id}>
                  <button type="button" onClick={() => setPos(i)}
                    className={cn("flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-accent/40", i === at && "bg-accent/60")}>
                    <RankBadge s={s} index={i} className="w-7 shrink-0 text-[11px]" />
                    <span className="h-9 w-12 shrink-0 overflow-hidden rounded bg-muted">
                      {pic && <ItemImage src={pic} className="h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{titleOf(s.item, draft.fields)}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {details.filter((f) => f !== "name").slice(0, 2).map((f) => cellText(valueAt(s.item, f))).filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {item && state ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              <div className="relative shrink-0 bg-muted" style={{ height: "42%", minHeight: 220 }}>
                {images.length ? (
                  <>
                    <ItemImage src={shownImg} className="h-full w-full object-contain" eager />
                    {images.length > 1 && (
                      <>
                        <button type="button" onClick={() => setImg((i) => (i - 1 + images.length) % images.length)} aria-label="Previous image"
                          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1 shadow hover:bg-background"><ChevronLeft /></button>
                        <button type="button" onClick={() => setImg((i) => (i + 1) % images.length)} aria-label="Next image"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1 shadow hover:bg-background"><ChevronRight /></button>
                      </>
                    )}
                    <span className="absolute bottom-2 right-3 rounded bg-background/80 px-1.5 text-[12px] tabular-nums">{Math.min(img, images.length - 1) + 1} / {images.length}</span>
                    <button type="button" onClick={() => feature(shownImg)} title={featured === shownImg && item.featured === shownImg ? "The featured picture (f)" : "Make this the featured picture (f)"}
                      aria-label="Feature this picture" aria-pressed={item.featured === shownImg}
                      className={cn("absolute left-3 top-3 flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-[12px] shadow hover:bg-background", item.featured === shownImg && "text-amber-600")}>
                      <Star className={cn("size-3.5", item.featured === shownImg && "fill-current")} /> {item.featured === shownImg ? "Featured" : "Feature"}
                    </button>
                  </>
                ) : <p className="p-4 text-muted-foreground">No pictures.</p>}
              </div>
              {images.length > 1 && (
                <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1">
                  {images.map((u, i) => (
                    <button key={i} type="button" onClick={() => setImg(i)} className={cn("relative h-12 w-16 shrink-0 overflow-hidden rounded border", i === img && "ring-2 ring-primary")}>
                      <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                      {item.featured === u && <Star className="absolute right-0.5 top-0.5 size-3 fill-current text-amber-500" />}
                    </button>
                  ))}
                </div>
              )}
              <div className="p-4">
                <StatCards item={item} stats={draft.stats} label={label} onEdit={(f, n) => editField(item.id, f, n)} />
              </div>
              <div className="grid gap-4 px-4 pb-4 md:grid-cols-[1fr_320px]">
                <div>
                  <h2 className="text-[15px] font-semibold">{titleOf(item, draft.fields)}</h2>
                  <dl className="mt-2 grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-0.5 text-[13px]">
                    {details.map((f) => {
                      const v = valueAt(item, f);
                      const t = cellText(v);
                      return (
                        <React.Fragment key={f}>
                          <dt className="text-muted-foreground">{label(f)}</dt>
                          <dd className="min-w-0">
                            {isUrl(t) ? <span className="flex min-w-0 items-center gap-1"><LinkText href={t} /><CopyButton text={t} /></span>
                              : <Editable value={v} onSave={(n) => editField(item.id, f, n)} className="break-words" />}
                          </dd>
                        </React.Fragment>
                      );
                    })}
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDir(true)} disabled={!origin}><Navigation /> Directions</Button>
                    {link && <Button size="sm" variant="outline" asChild><a href={link} target="_blank" rel="noopener noreferrer">Open listing</a></Button>}
                  </div>
                </div>
                <div>
                  <Decide state={state} reason={reason} setReason={setReason} onDecide={decide} />
                  {state.decisions.length > 0 && (
                    <ul className="mt-3 space-y-1 text-[13px]">
                      {state.decisions.map((d, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className={cn("w-16 shrink-0", d.op === "up" ? "text-green-700" : d.op === "down" ? "text-amber-800" : "text-muted-foreground")}>{OP_LABEL[d.op]}</span>
                          {d.op === "show" ? null : (
                            <Input key={`${i}-${d.reason ?? ""}`} defaultValue={d.reason ?? ""} placeholder="no reason yet" aria-label="Reason"
                              onBlur={(e) => setReasonOf(d, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              className={cn("h-7 text-[13px]", !d.reason && "border-amber-300")} />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ) : <p className="p-4 text-muted-foreground">{draft.items.length ? "Every item is hidden." : "No items."}</p>}
        </div>
      )}

      <Dialog open={dir} onOpenChange={setDir}>
        <DialogContent className="flex h-[85dvh] flex-col gap-2 p-4" style={{ maxWidth: "min(1100px, 96vw)" }}>
          <DialogHeader className="pr-8">
            <DialogTitle className="text-[15px]">{item ? titleOf(item, draft.fields) : ""} → {to || "…"}</DialogTitle>
            <DialogDescription className="sr-only">Directions from the item to the collection's destination</DialogDescription>
          </DialogHeader>
          {to && !remoteContentAllowed() ? (
            <p className="text-muted-foreground">Remote content is off in this Studio — the map is not embedded. "Open in Google Maps" opens the directions in your browser.</p>
          ) : to ? (
            <iframe title="Directions" src={embed} className="min-h-0 w-full flex-1 rounded border" referrerPolicy="no-referrer-when-downgrade" />
          ) : (
            <p className="text-muted-foreground">Type the destination in the <code>to</code> field above first.</p>
          )}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {to && <Button size="sm" variant="outline" asChild><a href={mapsLink} target="_blank" rel="noopener noreferrer">Open in Google Maps</a></Button>}
            {link && <Button size="sm" variant="outline" asChild><a href={link} target="_blank" rel="noopener noreferrer">Open listing</a></Button>}
            {link && <span className="flex items-center gap-1 text-[12px] text-muted-foreground"><LinkText href={link} className="max-w-[420px]" /><CopyButton text={link} /></span>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
