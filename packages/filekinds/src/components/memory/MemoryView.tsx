/**
 * A `.memory` open — WORKING MEMORY as a rendered query over the flat store.
 *
 * Top: the decisions as pills (crosscut's DecisionPills — hierarchy included,
 * so an answer can bring localized decisions onto the table). Every click is
 * a retrieval cue: answered decisions FILTER the store, the first unanswered
 * one GROUPS what's visible, and the assignment is saved back into the file
 * when the host allows edits — attention is a fact worth keeping, and an
 * agent can steer it by editing the same document.
 *
 * Below: the working set in the PROJECTS idiom, not the file explorer's —
 * items typed by KIND (icon per kind, labels without extensions), because a
 * memory's results are project-compatible items, not raw fs rows. Clicking
 * one opens its content in a dialog through the shared DocumentPreview (a
 * structured `*.node` gets SplitNodeView); Nodes is one click further, never
 * the first stop. Composite nodes contribute their folded stream slices as
 * fields (`status.status`, `tags.platform`, …), so criteria can select on
 * slice data alongside intrinsic facts.
 *
 * Over a FOLDER (the desktop app, VS Code): the memory looks at the folder it
 * sits in, and when it authors no decisions — an empty file will do — the
 * folders are the foci: each sub-folder is an answer, files sitting directly
 * in the folder are Everything else, and a focus taken brings that
 * sub-folder's own split (its first `.memory`, else its sub-folders) onto
 * the table. `memoryLoad.ts` reads the store; `memoryOverFolder` decides.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, ExternalLink, Folder, Search, Wand2 } from "lucide-react";
import {
  Button, CopyHandleButton, DecisionPills, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input,
  SUITE_APPS, cn, isStructuredName, joinPath, nameOf, splitRef,
} from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { configuredWriter, readVirtualDirectoryFile } from "../../api";
import { CLAUDE_FILE, claudePreamble } from "../../lib/claudePreamble";
import {
  ELSE, addSubFocus, addValue, assignUnit, explicitAnswer, isFolderKey, memoryScope, parseMemory, memorySelection,
  removeValue, renameValue, takenFolderChain, withElse, writeDecisions, writeLocks, writeOption,
  type MemoryOption, type MemoryUnit,
} from "../../lib/memoryDoc";
import type { RankingDecision } from "../../lib/rankingDoc";
import { localToday, type IndexEntry } from "../../lib/nodeIndex";
import { fillColor, pulseGrid, pulseSiblings, type PulseGrid, type PulseRow } from "../../lib/pulseDoc";
import { iconForFsPath } from "../kindIcons";
import { DocumentPreview } from "../DocumentPreview";
import { SplitNodeView } from "../SplitNodeView";
import { STORE_CHANGED_EVENT, loadMemoryStore, memoryOver, type MemoryStore, type Unit } from "./memoryLoad";
import { filterPills, namedCount } from "./pillFilter";

const ageText = (fields: Record<string, string>): string | null => {
  const d = fields.age_days;
  if (d === undefined) return null;
  const n = Number(d);
  return n <= 0 ? "today" : n === 1 ? "1d ago" : `${n}d ago`;
};

/** One result, in the PROJECTS idiom: kind icon + label, no extensions —
 *  the parent folder locates it, the extension never shows. */
/** In AUTHORING hosts, where a card can be MOVED: the grouping decision's
 *  answers as a picker, the current one selected. */
interface Assign {
  options: { key: string; label: string }[];
  current: string;
  onAssign: (key: string | null) => void;
}

function UnitCard({ u, onOpen, assign }: { u: MemoryUnit<Unit>; onOpen: (u: MemoryUnit<Unit>) => void; assign?: Assign }) {
  const { entry, fields } = u.item;
  const Icon = iconForFsPath(entry.path, entry.kind);
  const age = ageText(fields);
  const pipeline = fields["status.status"];
  return (
    <div className="flex w-[228px] flex-col rounded-md border bg-card hover:border-primary">
      <button type="button" onClick={() => onOpen(u)} className="flex items-start gap-2 px-2.5 py-2 text-left">
        <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold leading-tight text-foreground">{fields.stem || entry.name}</span>
          <span className="block truncate text-xs text-muted-foreground" title={entry.path}>{fields.parent}</span>
          {(age || pipeline) && (
            <span className="mt-0.5 flex items-center gap-1.5">
              {age && <span className="text-xs text-muted-foreground">{age}</span>}
              {pipeline && (
                <span className="rounded-full bg-accent px-1.5 py-px font-mono text-xs text-accent-foreground"
                  title="The authored pipeline stream's current status">{pipeline}</span>
              )}
            </span>
          )}
        </span>
      </button>
      {assign && (
        <select value={assign.current} onChange={(e) => assign.onAssign(e.target.value || null)}
          title="Move this item to a focus — an explicit rule for its path, ahead of every pattern rule"
          className="mx-2 mb-1.5 h-6 rounded border bg-background px-1 text-xs text-muted-foreground">
          <option value="">Everything else</option>
          {assign.options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}

/** A result's depth: its content in a dialog. A structured node opens as
 *  itself (SplitNodeView), a file through DocumentPreview, a versioned
 *  folder as its latest version; only a plain folder has nothing to show
 *  here and says so. Nodes stays one explicit click away. */
function UnitDialog({ unit, onClose, onOpenPath }: { unit: Unit | null; onClose: () => void; onOpenPath?: (path: string) => void }) {
  const [doc, setDoc] = useState<{ path: string; content: string } | null>(null);
  const [plainFolder, setPlainFolder] = useState(false);
  const path = unit?.entry.path ?? null;
  const structured = !!path && isStructuredName(path);

  useEffect(() => {
    setDoc(null); setPlainFolder(false);
    if (!path || structured) return;
    let live = true;
    readVirtualDirectoryFile(path, path).then(
      (r) => { if (live) setDoc({ path, content: r.content }); },
      () => { if (live) setPlainFolder(true); }, // a folder with no document face
    );
    return () => { live = false; };
  }, [path, structured]);

  return (
    <Dialog open={unit !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={plainFolder ? "sm:max-w-md" : "flex h-[94dvh] flex-col"}
        // Near-fullscreen for content: inline so the default sm:max-w-lg can
        // never win the cascade over it.
        style={plainFolder ? undefined : { maxWidth: "min(1500px, 96vw)" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span className="min-w-0 truncate">{unit?.fields.stem ?? ""}</span>
            {path && <CopyHandleButton path={path} />}
            {path && onOpenPath && !structured && (
              <button type="button" title="Open in the Studio" className="text-muted-foreground hover:text-foreground"
                onClick={() => { onClose(); onOpenPath(path); }}>
                <ExternalLink className="size-3.5" />
              </button>
            )}
            {path && !onOpenPath && (
              <a href={`${SUITE_APPS.nodes.origin}/?path=${encodeURIComponent(path)}`}
                title="Open in Nodes" className="text-muted-foreground hover:text-foreground">
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">The item's content</DialogDescription>
        </DialogHeader>
        {structured && path ? (
          <div className="min-h-0 flex-1 overflow-hidden rounded border">
            <SplitNodeView path={path} />
          </div>
        ) : doc ? (
          <div className="min-h-0 flex-1 overflow-hidden rounded border">
            <DocumentPreview key={doc.path} path={doc.path} content={doc.content} />
          </div>
        ) : plainFolder ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">A folder — no single document to show.{onOpenPath ? "" : " Browse it in Nodes:"}</p>
            {!onOpenPath && (
              <Button size="xs" variant="outline"
                onClick={() => { if (path) window.location.href = `${SUITE_APPS.nodes.origin}/?path=${encodeURIComponent(path)}`; }}>
                <ExternalLink /> Open in Nodes
              </Button>
            )}
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** How far back the side pulse reaches — a fixed window, no doc to carry it. */
const SIDE_PULSE_DAYS = 21;

/** A unit's weight in the side pulse: estimated minutes of reading, ~1100
 *  chars a minute, floored at 1 so an item never weighs nothing. A couple
 *  of minutes should weigh far less than a pile of long files. A binary's
 *  `size` is bytes, not prose — a 440 KB PDF is not a 400-minute read — so
 *  it weighs the floor, like any other single glance. */
const readingMinutes = (e: IndexEntry): number =>
  e.binary ? 1 : Math.max(1, Math.round((e.size ?? 0) / 1100));

/**
 * The memory's pulse ON the memory page: one level — the lowest sub-focus
 * on the table — as vertical strips, siblings side by side, TODAY at the
 * top and the window's start at the bottom (the heat grid's transpose,
 * scoped to where attention stands). Color is READING BURDEN, not
 * headcount: cells shade by running mass (minutes of reading) normalized
 * across the siblings, so one short file sits faint beside a heavy pile.
 * Collapsible to a slim tab; the full hierarchy over time stays the
 * `.pulse` page's job.
 */
function SidePulse({ grid, rows, level, collapsed, onToggle }: {
  grid: PulseGrid; rows: PulseRow[]; level: string; collapsed: boolean; onToggle: () => void;
}) {
  const days = grid.dates.length;
  const maxMass = Math.max(...rows.map((r) => r.mass), 1);
  if (collapsed) {
    return (
      <button type="button" onClick={onToggle} title={`Show the ${level} pulse`}
        className="sticky top-4 flex shrink-0 items-center gap-0.5 rounded-lg border bg-card px-1.5 py-2 text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3" />
        <Activity className="size-3.5" />
      </button>
    );
  }
  return (
    <div className="sticky top-4 shrink-0 rounded-lg border bg-card px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1.5">
        <Activity className="size-3.5 text-primary" />
        <span className="text-[13px] font-bold">{level}</span>
        <span className="text-xs text-muted-foreground">· {days}d</span>
        <button type="button" onClick={onToggle} title="Collapse the pulse"
          className="ml-auto text-muted-foreground hover:text-foreground">
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {rows.map((r) => (
              <th key={r.key} className="p-0 pb-1 align-bottom">
                <span title={`${r.label} · ${r.units} now · ≈${r.mass} min of reading`}
                  className={cn("mx-auto block max-h-24 overflow-hidden font-mono text-xs font-normal leading-none",
                    r.isElse || r.parked ? "text-muted-foreground" : "text-foreground")}
                  style={{ writingMode: "vertical-rl" }}>
                  {r.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.dates.map((_, view) => {
            const i = days - 1 - view; // newest at the TOP
            const d = grid.dates[i];
            const mark = view === 0 ? "today" : d.endsWith("01") || d.slice(8) === "15" ? d.slice(5) : "";
            return (
              <tr key={d}>
                <td className="whitespace-nowrap pr-1.5 text-right align-middle font-mono text-xs leading-none text-muted-foreground">{mark}</td>
                {rows.map((r) => {
                  const c = r.cells[i];
                  return (
                    <td key={r.key} className="p-0">
                      <div title={`${d} — ${r.label}: ${c.total} in memory · ≈${c.mass} min${c.added ? `, +${c.added} that day` : ""}${c.touched ? `, ${c.touched} touched` : ""}`}
                        style={{ backgroundColor: fillColor(c.mass / maxMass, r.isElse || r.parked) }}
                        className={cn("size-[13px] rounded-[3px]",
                          c.touched > 0 && "ring-1 ring-inset ring-red-400/70",
                          c.touched > 0 && (r.isElse || r.parked) && "ring-gray-400/80")} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td />
            {rows.map((r) => (
              <td key={r.key} className="pt-0.5 text-center font-mono text-xs leading-none text-muted-foreground"
                title={`≈${r.mass} min of reading · ${r.addedTotal} added in window`}>{r.units}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function MemoryView(props: ViewerProps & { now?: string; authoring?: boolean }) {
  const { content, height = "100%", onChange, now, path, agentId, authoring = false } = props;
  const docPath = path ?? agentId ?? null;
  const today = useMemo(() => now ?? localToday(), [now]);
  const doc = useMemo(() => parseMemory(content), [content]);
  const scope = useMemo(() => memoryScope(doc, docPath), [doc, docPath]);
  // An untitled memory — an empty file, say — goes by its name.
  const title = doc.title !== "Memory" || !docPath ? doc.title : nameOf(docPath).replace(/\.memory$/i, "");

  // The taken assignment and option states: the document's, until a click
  // moves them. Saved through the host when it allows edits; otherwise a
  // guide-lifetime answer.
  const [locks, setLocks] = useState<string[]>(doc.locks);
  const [options, setOptions] = useState<MemoryOption[]>(doc.options);
  const stateRef = useRef({ locks: doc.locks, options: doc.options });
  useEffect(() => {
    const d = parseMemory(content);
    setLocks(d.locks); setOptions(d.options);
    stateRef.current = { locks: d.locks, options: d.options };
  }, [content]);

  // The store: every entry as a unit, plus the memories nested under the
  // scope — read once per scope, never per pill click; re-read IN PLACE when
  // the host says the store moved underneath (STORE_CHANGED_EVENT: an entry
  // made, removed or renamed), the current view staying up until the new
  // store lands. Only a new scope shows "Reading the store…" again.
  const [store, setStore] = useState<MemoryStore | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Unit | null>(null);
  const [storeVersion, setStoreVersion] = useState(0);
  useEffect(() => {
    const bump = () => setStoreVersion((v) => v + 1);
    window.addEventListener(STORE_CHANGED_EVENT, bump);
    return () => window.removeEventListener(STORE_CHANGED_EVENT, bump);
  }, []);
  // A memory with no decisions is the folder split and reads LAZILY — the scope's listing, then
  // one per folder the taken answers open — so the folders taken are part of what to load; a
  // memory that authors decisions reads everything under its scope once, whatever is taken.
  const lazy = doc.decisions.length === 0;
  const chainKey = lazy ? takenFolderChain(scope, locks).join("\n") : "";
  const docRef = useRef(doc);
  docRef.current = doc;
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    const key = `${scope}|${today}`;
    if (loadedFor.current !== key) setStore(null);
    loadMemoryStore(scope, today, { doc: docRef.current, locks: stateRef.current.locks }).then(
      (st) => { if (live) { loadedFor.current = key; setStore(st); setErr(null); } },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [scope, today, storeVersion, lazy, chainKey]);

  // The memory over its folder — the decisions actually on the table (the
  // authored ones, or the folders' with nested memories spliced in) — and
  // the selection the taken answers make of it.
  const over = useMemo(
    () => (store ? memoryOver({ ...doc, locks, options }, docPath, store) : null),
    [doc, locks, options, docPath, store],
  );
  const selection = useMemo(() => (over ? memorySelection(over.doc, over.units) : null), [over]);

  // "Prepare for Claude Code": a CLAUDE.md beside the memory, so a Claude Code session started
  // in this folder knows the suite's kinds, the skill and the checker (its own memory starts
  // empty). Written once, never overwritten; present = prepared. Hosts that cannot write
  // (a read-only preview) do not offer it.
  const claudePath = joinPath(scope, CLAUDE_FILE);
  const writer = configuredWriter();
  const [prepared, setPrepared] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    readVirtualDirectoryFile(claudePath, claudePath).then(() => { if (live) setPrepared(true); }, () => { if (live) setPrepared(false); });
    return () => { live = false; };
  }, [claudePath, storeVersion]);
  const prepare = async () => {
    if (!writer) return;
    try {
      // The folder's name — a memory below the root names its folder; at the root the view does
      // not know the open folder's name (a memory's file stem is not it), so only an authored
      // title is used, else none.
      await writer(claudePath, claudePreamble(scope !== "/" ? nameOf(scope) : doc.title !== "Memory" ? doc.title : ""));
      setPrepared(true);
    } catch (e) {
      setErr(`Could not write ${claudePath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // The pills on the table, narrowed by the search field over the foci.
  const [pillQuery, setPillQuery] = useState("");
  const pillDecisions = useMemo(
    () => (over ? filterPills(withElse(over.doc.decisions), pillQuery, selection?.locks ?? locks) : []),
    [over, pillQuery, selection, locks],
  );
  // Authoring edits THIS FILE's decisions; a synthesized folder split or a
  // nested memory's decision is not this file's to edit.
  const authoredKeys = useMemo(() => new Set(doc.decisions.map((d) => d.key)), [doc]);

  // The side pulse: the lowest sub-focus ON THE TABLE — the grouping
  // decision while one is unanswered, else the deepest taken one — with its
  // siblings as columns. Options ride along so an unticked slice stops
  // pulsing too.
  const [pulseCollapsed, setPulseCollapsed] = useState(false);
  const sidePulse = useMemo(() => {
    if (!over || !selection) return null;
    const mem = over.doc;
    const targetKey = selection.groupBy?.key
      ?? splitRef(selection.locks[selection.locks.length - 1] ?? "=")[0];
    const target = mem.decisions.find((d) => d.key === targetKey);
    if (!target) return null;
    const grid = pulseGrid(
      mem,
      over.units.map(({ item, fields }) => ({
        fields, createdAt: item.entry.createdAt, updatedAt: item.entry.updatedAt,
        weight: readingMinutes(item.entry),
      })),
      today, SIDE_PULSE_DAYS,
    );
    const rows = pulseSiblings(mem, grid, selection.locks, targetKey);
    return rows.length ? { grid, rows, level: target.label } : null;
  }, [over, selection, today]);

  // Persist over the FILE AS IT IS NOW, never this tab's possibly-stale copy:
  // an open desk must not resurrect old criteria when a pill is clicked (the
  // stale-buffer clobber). Every save writes this tab's WHOLE state — locks
  // and option flips together — so a superseded save loses nothing when the
  // latest one lands. Latest-wins by design — attention does.
  const saveSeq = useRef(0);
  const persist = () => {
    if (!onChange) return;
    const seq = ++saveSeq.current;
    const base = docPath
      ? readVirtualDirectoryFile(docPath, docPath).then((r) => r.content).catch(() => content)
      : Promise.resolve(content);
    void base.then((t) => {
      if (saveSeq.current !== seq) return;
      const s = stateRef.current;
      onChange(writeLocks(s.options.reduce((acc, o) => writeOption(acc, o.key, o.on), t), s.locks));
    });
  };
  const takeLocks = (next: string[]) => {
    setLocks(next);
    stateRef.current = { ...stateRef.current, locks: next };
    persist();
  };
  const toggleOption = (key: string, on: boolean) => {
    const next = stateRef.current.options.map((o) => (o.key === key ? { ...o, on } : o));
    setOptions(next);
    stateRef.current = { ...stateRef.current, options: next };
    persist();
  };

  // AUTHORING (a project's lens): foci, membership and sub-foci are edits
  // to the decisions block — written over the file as it is now, the head
  // and the locks tail untouched, and this tab's locks re-applied so an
  // answer taken a moment ago is not lost under the rewrite.
  const canAuthor = authoring && !!onChange;
  const persistDecisions = (next: RankingDecision[]) => {
    if (!onChange) return;
    const seq = ++saveSeq.current;
    const base = docPath
      ? readVirtualDirectoryFile(docPath, docPath).then((r) => r.content).catch(() => content)
      : Promise.resolve(content);
    void base.then((t) => {
      if (saveSeq.current !== seq) return;
      onChange(writeLocks(writeDecisions(t, next), stateRef.current.locks));
    });
  };
  const addFocus = (decisionKey: string, label: string) => {
    const name = window.prompt(`Name the new ${label}`, "");
    if (!name?.trim()) return;
    persistDecisions(addValue(doc.decisions, decisionKey, name.trim()).decisions);
  };
  const addSub = (decisionKey: string, valueKey: string, valueLabel: string) => {
    const name = window.prompt(`Name the question under “${valueLabel}”`, "Sub-focus");
    if (!name?.trim()) return;
    persistDecisions(addSubFocus(doc.decisions, decisionKey, valueKey, name.trim()).decisions);
  };
  const rename = (decisionKey: string, valueKey: string, current: string) => {
    const name = window.prompt("Rename the focus", current);
    if (!name?.trim() || name.trim() === current) return;
    persistDecisions(renameValue(doc.decisions, decisionKey, valueKey, name.trim()));
  };
  const resolve = (decisionKey: string, valueKey: string, label: string) => {
    if (!window.confirm(`Resolve “${label}”? Its items park under Everything else.`)) return;
    persistDecisions(removeValue(doc.decisions, decisionKey, valueKey));
  };
  const move = (decisionKey: string, unitPath: string, valueKey: string | null) => {
    persistDecisions(assignUnit(doc.decisions, decisionKey, valueKey, unitPath));
  };
  // The deepest answer taken — where a sub-focus would hang.
  const deepest = useMemo(() => {
    const ref = selection?.locks[selection.locks.length - 1];
    if (!ref) return null;
    const [dk, vk] = splitRef(ref);
    if (vk === ELSE) return null;
    const d = doc.decisions.find((x) => x.key === dk);
    const v = d?.values.find((x) => x.key === vk);
    return d && v ? { decisionKey: dk, valueKey: vk, label: v.label } : null;
  }, [selection, doc]);

  return (
    <div style={{ height }} className="min-h-0 overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-6xl items-start gap-5 p-4">
        <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          {selection && (store?.lazy ? (
            <span className="text-[13px] text-muted-foreground"
              title={`This memory looks at ${scope}; a folder is read when its pill is taken, nothing under it before`}>
              {selection.visible.length} here · {selection.groupBy ? selection.groupBy.values.filter((v) => v.key !== ELSE).length : 0} folders
            </span>
          ) : (
            <span className="text-[13px] text-muted-foreground" title={`This memory looks at ${scope}`}>
              {selection.visible.length} of {selection.included.length} in {scope}
            </span>
          ))}
          {writer && prepared === false && (
            <Button size="xs" variant="outline" className="ml-auto" onClick={() => void prepare()}
              title={`Write ${claudePath}: the preamble a Claude Code session started in this folder needs — the Studio's kinds, the studio-files skill, the checker`}>
              <Wand2 /> Prepare for Claude Code
            </Button>
          )}
          {prepared && (
            <span className="ml-auto text-xs text-muted-foreground" title={`${claudePath} is there — edit it to say what this folder is for`}>
              Prepared for Claude Code
            </span>
          )}
        </div>
        {doc.description && <p className="mb-3 max-w-2xl text-[12px] leading-snug text-muted-foreground">{doc.description}</p>}

        {options.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card px-3 py-1.5">
            {options.map((o) => (
              <label key={o.key}
                className="flex cursor-pointer select-none items-center gap-1.5 text-[13px] text-foreground"
                title="A togglable slice of the store — unticked, its units leave the working set entirely">
                <input type="checkbox" className="size-3.5 accent-primary" checked={o.on}
                  onChange={(e) => toggleOption(o.key, e.target.checked)} />
                {o.label}
              </label>
            ))}
          </div>
        )}

        {over && over.doc.decisions.length > 0 && (
          <div className="mb-4 rounded-lg border bg-card px-3 py-2">
            {/* The search field over the foci: part of a name keeps only the matching pills (taken
                answers and Everything else always stay). Escape clears it. */}
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <Input value={pillQuery} onChange={(e) => setPillQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setPillQuery(""); }}
                placeholder="Filter the foci by name" aria-label="Filter the foci by name"
                className="h-7 w-56 max-w-full text-[13px]" />
              {pillQuery.trim() && selection?.groupBy && (
                <span className="text-xs text-muted-foreground">
                  {namedCount(pillDecisions.find((d) => d.key === selection.groupBy!.key))} of {namedCount(selection.groupBy)} match
                </span>
              )}
            </div>
            <DecisionPills decisions={pillDecisions} value={selection?.locks ?? locks} onChange={takeLocks} includeSingles
              action={(key) => (isFolderKey(key)
                ? <Folder className="ml-1 inline size-3 align-[-1px] text-muted-foreground" aria-label="Split by the sub-folders" />
                : undefined)}
              valueState={(ref, on) => (splitRef(ref)[1] === ELSE
                ? { dim: !on, tooltip: "Everything the named answers don't claim — parked at this stage, one click away" }
                : undefined)} />
            {canAuthor && selection && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
                {selection.groupBy && authoredKeys.has(selection.groupBy.key) && (
                  <Button size="xs" variant="outline" onClick={() => addFocus(selection.groupBy!.key, selection.groupBy!.label)}
                    title={`A new answer to “${selection.groupBy.label}” — items move into it from Everything else`}>
                    + {selection.groupBy.label}
                  </Button>
                )}
                {deepest && (
                  <Button size="xs" variant="outline" onClick={() => addSub(deepest.decisionKey, deepest.valueKey, deepest.label)}
                    title={`A narrower question that only exists under “${deepest.label}”`}>
                    + Sub-focus under {deepest.label}
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">Move a card with the picker on it; double-click a group to rename, × to resolve.</span>
              </div>
            )}
          </div>
        )}

        {err ? <p className="text-sm text-destructive">{err}</p>
          : !selection ? <p className="text-sm text-muted-foreground">Reading the store…</p>
            : (
              <div className="space-y-4">
                {selection.groupBy && (store?.lazy ? (
                  <p className="text-[13px] text-muted-foreground">
                    Take a folder above to open it — the files sitting here are Everything else.
                  </p>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    Grouped by <span className="font-semibold text-foreground">{selection.groupBy.label}</span> — answer it above to narrow further.
                  </p>
                ))}
                {/* A lazy store has read nothing under the folders not taken: their groups would be empty
                    shells — the pills above are them. Only what sits here is shown. */}
                {selection.groups.filter((g) => !store?.lazy || g.key === ELSE || g.key === "*").map((g) => {
                  const gb = selection.groupBy;
                  const gbAuthored = !!gb && authoredKeys.has(gb.key);
                  const authored = canAuthor && gbAuthored && g.key !== ELSE && g.key !== "*";
                  const assignFor = (u: MemoryUnit<Unit>): Assign | undefined => (canAuthor && gb && gbAuthored ? {
                    options: gb.values.filter((v) => v.key !== ELSE).map((v) => ({ key: v.key, label: v.label })),
                    current: explicitAnswer(doc.decisions, gb.key, u.item.entry.path)
                      ?? (u.answers.find((a) => a.decision === gb.key)?.value ?? ""),
                    onAssign: (key) => move(gb.key, u.item.entry.path, key),
                  } : undefined);
                  return (
                  <section key={g.key}>
                    <h3 className={cn("mb-1.5 flex items-center gap-1.5 text-xs font-bold", g.key === ELSE && "text-muted-foreground")}
                      onDoubleClick={authored ? () => rename(gb!.key, g.key, g.label) : undefined}
                      title={authored ? "Double-click to rename" : undefined}>
                      {g.label} <span className="font-normal text-muted-foreground">· {g.units.length}</span>
                      {authored && (
                        <button type="button" title={`Resolve “${g.label}” — its items park under Everything else`}
                          className="rounded px-1 text-[13px] font-normal text-muted-foreground hover:bg-accent hover:text-destructive"
                          onClick={() => resolve(gb!.key, g.key, g.label)}>×</button>
                      )}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {g.units.map((u) => <UnitCard key={u.item.entry.path} u={u} onOpen={(x) => setOpen(x.item)} assign={assignFor(u)} />)}
                      {!g.units.length && <p className="text-[13px] text-muted-foreground">Nothing here.</p>}
                    </div>
                  </section>
                  );
                })}
                {!selection.visible.length && selection.included.length > 0 && (
                  <p className="text-sm text-muted-foreground">Nothing matches the answers taken — clear a pill to widen the set.</p>
                )}
              </div>
            )}
        </div>
        {sidePulse && !store?.lazy && (
          <SidePulse grid={sidePulse.grid} rows={sidePulse.rows} level={sidePulse.level}
            collapsed={pulseCollapsed} onToggle={() => setPulseCollapsed((c) => !c)} />
        )}
      </div>
      <UnitDialog unit={open} onClose={() => setOpen(null)} onOpenPath={props.onOpenPath} />
    </div>
  );
}
