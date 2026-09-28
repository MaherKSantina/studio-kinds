/**
 * An `.analysis` open — every combination of the inputs, decided by the rules
 * and drawn as a tree. The rail on the left is the inputs in the order the
 * tree nests them (drag one, or step it up and down); the panels lock input
 * values and pin output values; the tree redraws for each; a node clicked
 * opens what holds at that position. The order, the locks, the pins, the
 * folds and the selection are the page's for the session — nothing here
 * writes the file.
 */
import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, RotateCcw, X } from "lucide-react";
import { cn } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import {
  buildKeptTree, buildTree, compileAnalysis, hasTarget, matchTarget, parseAnalysis, pathKey, showValue,
  type Compiled, type DimValue, type Row, type TreeNode, MAX_COMBINATIONS, NONE,
} from "../../lib/analysisDoc";

/** One tint per outcome value, by its place among the outcome's values; `—` is muted. */
const TINTS = [
  "bg-sky-100 text-sky-900", "bg-emerald-100 text-emerald-900", "bg-violet-100 text-violet-900", "bg-amber-100 text-amber-900",
  "bg-rose-100 text-rose-900", "bg-teal-100 text-teal-900", "bg-orange-100 text-orange-900", "bg-indigo-100 text-indigo-900",
  "bg-lime-100 text-lime-900", "bg-fuchsia-100 text-fuchsia-900",
];
/** The swatch a chip carries for each tint — the same hue, deeper. */
const SWATCHES = [
  "bg-sky-400", "bg-emerald-400", "bg-violet-400", "bg-amber-400", "bg-rose-400", "bg-teal-400", "bg-orange-400", "bg-indigo-400",
  "bg-lime-400", "bg-fuchsia-400",
];
const MUTED_TINT = "bg-muted text-muted-foreground";
const MUTED_SWATCH = "bg-muted-foreground/40";

const PANEL = "rounded-lg border bg-card px-3 py-2";
const HEAD = "mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const NOTE = "font-normal normal-case tracking-normal";
const LINK = "text-[11px] text-muted-foreground hover:text-foreground";

type Locks = Record<string, DimValue[]>;
type Target = Record<string, string[]>;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export default function AnalysisView({ content, height = "100%" }: ViewerProps) {
  const doc = useMemo(() => parseAnalysis(content), [content]);

  // The session's state. Each is reconciled against the document as it stands, so a dimension or a
  // value that vanished from the file drops out and a new dimension joins the end of the order.
  const [order, setOrder] = useState<string[]>([]);
  const [locks, setLocks] = useState<Locks>({});
  const [target, setTarget] = useState<Target>({});
  const [toggled, setToggled] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const liveOrder = useMemo(() => {
    const kept = order.filter((d) => d in doc.dimensions);
    for (const d of doc.dimensionOrder) if (!kept.includes(d)) kept.push(d);
    return kept;
  }, [order, doc]);
  const liveLocks = useMemo(() => {
    const out: Locks = {};
    for (const [d, vals] of Object.entries(locks)) {
      const dom = doc.dimensions[d];
      if (!dom) continue;
      const v = vals.filter((x) => dom.includes(x));
      if (v.length) out[d] = v;
    }
    return out;
  }, [locks, doc]);

  const compiled = useMemo(() => compileAnalysis(doc, liveLocks), [doc, liveLocks]);
  const liveTarget = useMemo(() => {
    const out: Target = {};
    for (const [slot, toks] of Object.entries(target)) {
      const dom = compiled.domains[slot];
      if (!dom) continue;
      const t = toks.filter((x) => dom.includes(x));
      if (t.length) out[slot] = t;
    }
    return out;
  }, [target, compiled]);

  const tree = useMemo(() => {
    if (!compiled.enumerated) return { kind: "too-many" as const };
    if (compiled.rows.length === 0) return { kind: "no-rows" as const };
    if (!hasTarget(liveTarget)) return { kind: "tree" as const, node: buildTree(compiled.rows, liveOrder), reached: compiled.rows.length };
    const node = buildKeptTree(compiled.rows, liveOrder, (r) => matchTarget(r, liveTarget));
    const reached = compiled.rows.filter((r) => matchTarget(r, liveTarget)).length;
    return node ? { kind: "tree" as const, node, reached } : { kind: "unreached" as const };
  }, [compiled, liveOrder, liveTarget]);

  // ── the rail ────────────────────────────────────────────────────────────
  const move = (dim: string, to: number) => {
    const without = liveOrder.filter((d) => d !== dim);
    without.splice(Math.max(0, Math.min(to, without.length)), 0, dim);
    setOrder(without);
  };
  const dropOn = (dim: string) => {
    if (dragging && dragging !== dim) move(dragging, liveOrder.filter((d) => d !== dragging).indexOf(dim));
    setDragging(null);
  };
  const dropLast = () => { if (dragging) move(dragging, liveOrder.length); setDragging(null); };

  const toggleLock = (dim: string, v: DimValue) => setLocks((l) => {
    const cur = liveLocks[dim] ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    const out = { ...l };
    if (next.length) out[dim] = next; else delete out[dim];
    return out;
  });
  const clearLock = (dim: string) => setLocks((l) => { const out = { ...l }; delete out[dim]; return out; });
  const togglePin = (slot: string, tok: string) => setTarget((t) => {
    const cur = liveTarget[slot] ?? [];
    const next = cur.includes(tok) ? cur.filter((x) => x !== tok) : [...cur, tok];
    const out = { ...t };
    if (next.length) out[slot] = next; else delete out[slot];
    return out;
  });
  const toggleFold = (key: string) => setToggled((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const reset = () => { setOrder([]); setLocks({}); setTarget({}); setToggled(new Set()); setSelected(null); };
  const touched = order.length > 0 || Object.keys(liveLocks).length > 0 || hasTarget(liveTarget) || toggled.size > 0;

  const tintIndex = (slot: string, tok: string): number => (compiled.domains[slot] ?? []).indexOf(tok);
  const tintOf = (slot: string, tok: string): string => (tok === NONE ? MUTED_TINT : TINTS[Math.max(0, tintIndex(slot, tok)) % TINTS.length]);
  const swatchOf = (slot: string, tok: string): string => (tok === NONE ? MUTED_SWATCH : SWATCHES[Math.max(0, tintIndex(slot, tok)) % SWATCHES.length]);
  const leafOf = (key: string): { label: string; tint: string } => {
    if (key === "mixed") return { label: "depends on an input not in the order", tint: MUTED_TINT };
    const i = Number(key);
    if (!(i >= 0) || !doc.rules[i]) return { label: "no rule", tint: MUTED_TINT };
    const rule = doc.rules[i];
    const tok = doc.outcome in rule.then ? showValue(rule.then[doc.outcome]) : NONE;
    return { label: rule.label, tint: tintOf(doc.outcome, tok) };
  };

  const empty = doc.dimensionOrder.length === 0;
  const summary = `${plural(doc.dimensionOrder.length, "dimension")} · ${plural(compiled.total, "combination")} · ${plural(doc.rules.length, "rule")}`;

  return (
    <div style={{ height }} className="min-h-0 overflow-y-auto bg-background p-3 text-foreground">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {doc.title && <h2 className="text-base font-semibold">{doc.title}</h2>}
        <span className="text-xs text-muted-foreground">{summary}</span>
        {touched && (
          <button type="button" onClick={reset} className={cn(LINK, "ml-auto flex items-center gap-1")} title="Back to the file's order, no locks, no pins">
            <RotateCcw className="size-3" /> Reset
          </button>
        )}
      </div>
      {doc.description && <p className="mt-0.5 max-w-[70ch] text-xs text-muted-foreground">{doc.description}</p>}
      {doc.error && <p className="mt-2 text-sm text-destructive">The file does not parse: {doc.error}</p>}
      {empty && !doc.error && (
        <p className="mt-2 text-sm text-muted-foreground">
          No <code>dimensions</code> yet — the inputs and the values each can take; <code>rules</code> then decide what follows from each combination.
        </p>
      )}

      {!empty && (
        <div className="mt-3 grid grid-cols-1 items-start gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          {/* The rail: the inputs in the order the tree nests them. */}
          <div className={cn(PANEL, "md:sticky md:top-0")}>
            <div className={HEAD}><span>Order</span><span className={NOTE}>drag · top is the root</span></div>
            <ul className="space-y-1">
              {liveOrder.map((dim, i) => (
                <li key={dim}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragging(dim); }}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={dragging ? (e) => e.preventDefault() : undefined}
                  onDrop={dragging ? () => dropOn(dim) : undefined}
                  className={cn("rounded-md border bg-background px-1.5 py-1 font-mono text-[12px]",
                    dragging === dim ? "opacity-40" : "cursor-grab", dragging && dragging !== dim && "border-dashed border-primary/60")}>
                  <div className="flex items-center gap-1">
                    <GripVertical className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                    <span className={cn("min-w-0 flex-1 truncate", compiled.noEffect.has(dim) && "text-muted-foreground")} title={dim}>{dim}</span>
                    <span className="flex shrink-0 flex-col">
                      <button type="button" onClick={() => move(dim, i - 1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-25" title="Up"><ArrowUp className="size-3" /></button>
                      <button type="button" onClick={() => move(dim, i + 1)} disabled={i === liveOrder.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-25" title="Down"><ArrowDown className="size-3" /></button>
                    </span>
                  </div>
                  {(i === 0 || liveLocks[dim] || (compiled.enumerated && compiled.noEffect.has(dim))) && (
                    <div className="mt-0.5 flex flex-wrap gap-1 pl-[18px]">
                      {i === 0 && <Badge>root</Badge>}
                      {liveLocks[dim] && <Badge tone="lock">{liveLocks[dim].length} of {doc.dimensions[dim].length}</Badge>}
                      {compiled.enumerated && compiled.noEffect.has(dim) && <Badge tone="muted" title="Changing this input never changes an output here">no effect</Badge>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {dragging && (
              <div onDragOver={(e) => e.preventDefault()} onDrop={dropLast}
                className="mt-1 flex h-7 items-center justify-center rounded-md border border-dashed border-primary/60 text-[11px] text-muted-foreground">
                drop here for last
              </div>
            )}
            {liveOrder.length === 0 && <p className="text-xs text-muted-foreground">No dimensions.</p>}
          </div>

          <div className="min-w-0 space-y-3">
            {/* Inputs: lock values. */}
            <div className={PANEL}>
              <div className={HEAD}>
                <span>Inputs</span><span className={NOTE}>lock values · every locked input must hold</span>
                {Object.keys(liveLocks).length > 0 && <button type="button" onClick={() => setLocks({})} className={cn(LINK, "ml-auto")}>clear locks</button>}
              </div>
              <div className="space-y-1">
                {liveOrder.map((dim) => {
                  const lock = liveLocks[dim];
                  return (
                    <div key={dim} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className={cn("w-[130px] shrink-0 truncate font-mono text-[12px]", lock ? "text-foreground" : "text-muted-foreground")} title={dim}>{dim}</span>
                      <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                        <Chip on={!lock} italic onClick={() => clearLock(dim)}>any</Chip>
                        {doc.dimensions[dim].map((v) => (
                          <Chip key={showValue(v)} on={!!lock?.includes(v)} onClick={() => toggleLock(dim, v)}>{showValue(v)}</Chip>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                {compiled.kept === compiled.total
                  ? `${compiled.total} combinations`
                  : `${compiled.kept} of ${compiled.total} combinations match the locks`}
                {compiled.enumerated && compiled.unmatched > 0 && ` · ${compiled.unmatched} no rule decides`}
                {tree.kind === "tree" && hasTarget(liveTarget) && ` · ${tree.reached} reach the pinned outputs`}
              </p>
            </div>

            {/* Outputs: pin values. */}
            <div className={PANEL}>
              <div className={HEAD}>
                <span>Outputs</span><span className={NOTE}>pin values · any pinned value of a key, every pinned key</span>
                {hasTarget(liveTarget) && <button type="button" onClick={() => setTarget({})} className={cn(LINK, "ml-auto")}>clear pins</button>}
              </div>
              {doc.rules.length === 0 ? (
                <p className="text-xs text-muted-foreground">No rule sets an output yet.</p>
              ) : (
                <div className="space-y-1">
                  {compiled.slots.map((slot) => {
                    const pins = liveTarget[slot] ?? [];
                    const isOutcome = slot === doc.outcome;
                    return (
                      <div key={slot} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className={cn("w-[130px] shrink-0 truncate font-mono text-[12px]", pins.length ? "text-foreground" : "text-muted-foreground")}
                          title={isOutcome ? `${slot} — the outcome; leaves take its tints` : slot}>
                          {slot}{isOutcome && <span className="text-muted-foreground"> ★</span>}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                          {compiled.domains[slot].map((tok) => (
                            <Chip key={tok} on={pins.includes(tok)} onClick={() => togglePin(slot, tok)} swatch={isOutcome ? swatchOf(slot, tok) : undefined}>
                              {tok === NONE ? "(none)" : tok}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* The tree. */}
            <div className={cn(PANEL, "overflow-x-auto font-mono text-[12.5px] leading-6")}>
              {tree.kind === "too-many" && (
                <p className="font-sans text-sm text-muted-foreground">
                  {compiled.kept.toLocaleString()} combinations is more than this page draws ({MAX_COMBINATIONS.toLocaleString()}) — lock values above to come under it.
                </p>
              )}
              {tree.kind === "no-rows" && <p className="font-sans text-sm text-destructive">No combination matches these locks — loosen one.</p>}
              {tree.kind === "unreached" && (
                <p className="font-sans text-sm text-destructive">
                  No combination produces these outputs together{compiled.kept < compiled.total ? " under the locks" : ""} — they never co-occur.
                </p>
              )}
              {tree.kind === "tree" && (tree.node.leaf ? (
                <p className="text-muted-foreground">every combination → <Leaf {...leafOf(tree.node.key)} /></p>
              ) : (
                <Branch node={tree.node} depth={0} path={[]} toggled={toggled} onFold={toggleFold} selected={selected} onSelect={setSelected} leafOf={leafOf} />
              ))}
            </div>

            {/* What holds at the selected position. */}
            {selected !== null && tree.kind === "tree" && (
              <Detail node={tree.node} selectedKey={selected} compiled={compiled} order={liveOrder} tintOf={tintOf} onClose={() => setSelected(null)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ children, tone = "root", title }: { children: React.ReactNode; tone?: "root" | "lock" | "muted"; title?: string }) {
  return (
    <span title={title} className={cn("shrink-0 rounded border px-1 text-[9px] uppercase tracking-wide",
      tone === "root" && "border-primary/40 text-primary", tone === "lock" && "border-amber-400/60 text-amber-700", tone === "muted" && "text-muted-foreground")}>
      {children}
    </span>
  );
}

function Chip({ children, on, onClick, italic, swatch }: { children: React.ReactNode; on?: boolean; onClick?: () => void; italic?: boolean; swatch?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[11px] leading-4",
        on ? "border-primary/50 bg-primary/10 text-foreground" : "bg-background text-muted-foreground hover:text-foreground", italic && "italic")}>
      {swatch && <span className={cn("size-2 rounded-sm", swatch)} aria-hidden />}
      {children}
    </button>
  );
}

function Leaf({ label, tint, outlined }: { label: string; tint: string; outlined?: boolean }) {
  return <span className={cn("inline-block rounded px-1.5 text-[11.5px] font-semibold leading-5", tint, outlined && "ring-2 ring-primary ring-offset-1")}>{label}</span>;
}

interface BranchProps {
  node: Extract<TreeNode, { leaf: false }>;
  depth: number;
  path: { field: string; value: DimValue }[];
  toggled: Set<string>;
  onFold: (key: string) => void;
  selected: string | null;
  onSelect: (key: string) => void;
  leafOf: (key: string) => { label: string; tint: string };
}

function Branch({ node, depth, path, toggled, onFold, selected, onSelect, leafOf }: BranchProps) {
  const key = pathKey(path);
  // The two levels under the root are open unless folded; deeper ones closed unless opened.
  const open = depth < 2 ? !toggled.has(key) : toggled.has(key);
  const nodeKey = key || "(root)";
  return (
    <div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onFold(key)} className="text-muted-foreground hover:text-foreground" title={open ? "Fold" : "Unfold"}>
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <button type="button" onClick={() => onSelect(nodeKey)}
          className={cn("rounded px-0.5 hover:text-primary", selected === nodeKey && "ring-2 ring-primary ring-offset-1")}>
          {node.field}?
        </button>
        <span className="text-[10.5px] text-muted-foreground">{plural(node.children.length, "value")} · {plural(node.n, "combination")}</span>
      </div>
      {open && (
        <ul className="ml-1.5 border-l pl-3">
          {node.children.map((c) => {
            const np = [...path, { field: node.field, value: c.value }];
            const k = pathKey(np);
            return (
              <li key={showValue(c.value)}>
                <span className="text-muted-foreground">├ </span>
                <span className="text-amber-700">{showValue(c.value)}</span>
                {c.node.leaf ? (
                  <>
                    <span className="text-muted-foreground"> → </span>
                    <button type="button" onClick={() => onSelect(k)} className="rounded" title={plural(c.node.n, "combination")}>
                      <Leaf {...leafOf(c.node.key)} outlined={selected === k} />
                    </button>
                  </>
                ) : (
                  <div className="ml-3">
                    <Branch node={c.node} depth={depth + 1} path={np} toggled={toggled} onFold={onFold} selected={selected} onSelect={onSelect} leafOf={leafOf} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The rows at a tree position, by its key. */
function rowsAt(node: TreeNode, targetKey: string, path: { field: string; value: DimValue }[] = []): { rows: Row[]; path: { field: string; value: DimValue }[] } | null {
  if ((pathKey(path) || "(root)") === targetKey) return { rows: node.rows, path };
  if (node.leaf) return null;
  for (const c of node.children) {
    const found = rowsAt(c.node, targetKey, [...path, { field: node.field, value: c.value }]);
    if (found) return found;
  }
  return null;
}

function Detail({ node, selectedKey, compiled, order, tintOf, onClose }: {
  node: TreeNode; selectedKey: string; compiled: Compiled; order: string[]; tintOf: (slot: string, tok: string) => string; onClose: () => void;
}) {
  const found = rowsAt(node, selectedKey);
  if (!found) return null;
  const { rows, path } = found;
  const free = order.filter((d) => !path.some((p) => p.field === d));
  const rules = [...new Set(rows.map((r) => r.label))];
  return (
    <div className={cn(PANEL, "border-l-4 border-l-primary")}>
      <div className={HEAD}>
        <span>Position</span><span className={NOTE}>{plural(rows.length, "combination")}</span>
        <button type="button" onClick={onClose} className={cn(LINK, "ml-auto")} title="Close"><X className="size-3.5" /></button>
      </div>
      <Section label="inputs fixed on this path">
        {path.length ? path.map((p) => <Chip key={p.field} on>{p.field} = {showValue(p.value)}</Chip>) : <span className="text-[11px] text-muted-foreground">the root — nothing fixed yet</span>}
        <span className="basis-full text-[11px] text-muted-foreground">free: {free.length ? free.join(", ") : "—"}</span>
      </Section>
      <Section label="outputs here" column>
        {compiled.slots.map((slot) => {
          const vals = [...new Set(rows.map((r) => r.slots[slot]))];
          const isOutcome = slot === compiled.doc.outcome;
          return (
            <div key={slot} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="w-[130px] shrink-0 truncate font-mono text-[12px] text-muted-foreground" title={slot}>{slot}</span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {vals.slice(0, 12).map((v) => (
                  <Leaf key={v} label={v === NONE ? "(none)" : v} tint={isOutcome ? tintOf(slot, v) : v === NONE ? MUTED_TINT : "bg-accent text-accent-foreground"} />
                ))}
                {vals.length > 12 && <span className="text-[11px] text-muted-foreground">+{vals.length - 12} more</span>}
              </div>
            </div>
          );
        })}
      </Section>
      <Section label="rules deciding here">
        {rules.map((label) => <Chip key={label}>{label}</Chip>)}
      </Section>
    </div>
  );
}

function Section({ label, children, column }: { label: string; children: React.ReactNode; column?: boolean }) {
  return (
    <div className="my-1.5">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={column ? "space-y-1" : "flex flex-wrap items-baseline gap-1"}>{children}</div>
    </div>
  );
}
