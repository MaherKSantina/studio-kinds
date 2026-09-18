/**
 * The `.definition` kind — a FIXED PROCESS with slots, in two roles:
 *
 *   definition — the reusable process itself: fixed `inputs` (node refs, the
 *                same for every instance), per-instance `params` (source
 *                material provided at adoption), and `slots` (authored
 *                outputs, each declaring `from:` edges — the DAG).
 *   instance   — one project's adoption: `definition:` names the process,
 *                `fills:` maps param/slot keys to the documents that exist.
 *
 * The definition is the single source of truth: refining it updates every
 * instance's DAG and instructions. An instance owns no process logic.
 */
import yaml from "js-yaml";

export interface DefInput {
  key: string;
  label?: string;
  /** Absolute (or definition-relative) path of the fixed node. */
  node: string;
}

export interface DefParam {
  key: string;
  label?: string;
  hint?: string;
  /** An optional param may stay unfilled without reading as PENDING —
   *  source material some instances simply don't have (job questions). */
  optional?: boolean;
}

export interface DefSlot {
  key: string;
  label?: string;
  /** The instruction for whoever authors this slot's document. */
  hint?: string;
  /** Expected file kind of the authored document (brief, html, list…). */
  kind?: string;
  /** Keys this slot reads — inputs, params, or other slots. The DAG. */
  from: string[];
  /** Exported: a project shows this slot's fill as a child of the node. */
  export?: boolean;
  /** Optional slots never BLOCK an instance: derived status (the first
   *  unfilled slot) skips them — conditional work like gap-filling. */
  optional?: boolean;
}

/** One POLYMORPHIC SHAPE of a definition: which of the declared slots exist
 *  and, where needed, rewired `from` edges. The definition's `slots` are the
 *  UNION of every variant's; an instance picks its shape with `variant:`. */
export interface DefVariant {
  key: string;
  label?: string;
  /** The slot keys this shape keeps, resolved in the union's order. */
  slots: string[];
  /** Slot key -> replacement `from` list — connect nodes differently. */
  rewire?: Record<string, string[]>;
}

export interface DefinitionDoc {
  role: "definition";
  title: string;
  description?: string;
  /** Standing rules every slot's authoring must honor. */
  rules: string[];
  inputs: DefInput[];
  params: DefParam[];
  slots: DefSlot[];
  /** Polymorphic shapes. Empty = one shape (the slots as declared). */
  variants: DefVariant[];
  /** Shape for instances that don't declare one. Absent = the full union. */
  defaultVariant?: string;
}

export interface InstanceDoc {
  role: "instance";
  /** Display name of THIS adoption (a board card, a tree row). */
  title?: string;
  /** Path of the `.definition` this instance adopts. */
  definition: string;
  /** Which polymorphic shape of the definition this instance runs. */
  variant?: string;
  /** param/slot key -> document path (instance-relative or absolute). */
  fills: Record<string, string>;
}

/** A PIPELINE BOARD: many instances of one definition, tracked together.
 *  Status is DERIVED — an instance stands at its first unfilled required
 *  slot — so the board needs no status field anywhere. */
export interface BoardDoc {
  role: "board";
  title?: string;
  /** Path of the `.definition` every listed instance adopts. */
  definition: string;
  /** Paths of the instance files (board-relative or absolute). */
  instances: string[];
}

/** A JOURNEY: several pipelines viewed as one flow — stages (boards) stack
 *  horizontally, and an instance's fan-out into the next stage stacks its
 *  destinations vertically. Links are DERIVED from fills (terminal list
 *  rows forward, param back-references), never authored here. */
export interface JourneyDoc {
  role: "journey";
  title?: string;
  /** Board paths, in journey order (journey-relative or absolute). */
  journey: string[];
}

export type DefinitionFile = DefinitionDoc | InstanceDoc | BoardDoc | JourneyDoc;

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

export function parseDefinitionFile(text: string): DefinitionFile {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  if (Array.isArray(raw.journey)) {
    return {
      role: "journey",
      ...(str(raw.title) ? { title: str(raw.title)! } : {}),
      journey: arr(raw.journey).map(str).filter(Boolean) as string[],
    };
  }
  const definition = str(raw.definition);
  if (definition && Array.isArray(raw.instances)) {
    return {
      role: "board",
      ...(str(raw.title) ? { title: str(raw.title)! } : {}),
      definition,
      instances: arr(raw.instances).map(str).filter(Boolean) as string[],
    };
  }
  if (definition) {
    const fills: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec(raw.fills))) {
      const p = str(v);
      if (p) fills[k] = p;
    }
    return {
      role: "instance",
      ...(str(raw.title) ? { title: str(raw.title)! } : {}),
      definition,
      ...(str(raw.variant) ? { variant: str(raw.variant)! } : {}),
      fills,
    };
  }
  return {
    role: "definition",
    title: str(raw.title) ?? "Definition",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    rules: arr(raw.rules).map(str).filter(Boolean) as string[],
    inputs: arr(raw.inputs).map((x) => {
      const o = rec(x);
      const key = str(o.key);
      const node = str(o.node);
      return key && node ? { key, node, ...(str(o.label) ? { label: str(o.label)! } : {}) } : null;
    }).filter(Boolean) as DefInput[],
    params: arr(raw.params).map((x) => {
      const o = rec(x);
      const key = str(o.key);
      return key ? {
        key,
        ...(str(o.label) ? { label: str(o.label)! } : {}),
        ...(str(o.hint) ? { hint: str(o.hint)! } : {}),
        ...(o.optional === true ? { optional: true } : {}),
      } : null;
    }).filter(Boolean) as DefParam[],
    slots: arr(raw.slots).map((x) => {
      const o = rec(x);
      const key = str(o.key);
      return key ? {
        key,
        ...(str(o.label) ? { label: str(o.label)! } : {}),
        ...(str(o.hint) ? { hint: str(o.hint)! } : {}),
        ...(str(o.kind) ? { kind: str(o.kind)! } : {}),
        from: arr(o.from).map(str).filter(Boolean) as string[],
        ...(o.export === true ? { export: true } : {}),
        ...(o.optional === true ? { optional: true } : {}),
      } : null;
    }).filter(Boolean) as DefSlot[],
    variants: arr(raw.variants).map((x) => {
      const o = rec(x);
      const key = str(o.key);
      if (!key) return null;
      const rewire: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(rec(o.rewire))) {
        const froms = arr(v).map(str).filter(Boolean) as string[];
        if (froms.length) rewire[k] = froms;
      }
      return {
        key,
        ...(str(o.label) ? { label: str(o.label)! } : {}),
        slots: arr(o.slots).map(str).filter(Boolean) as string[],
        ...(Object.keys(rewire).length ? { rewire } : {}),
      };
    }).filter(Boolean) as DefVariant[],
    ...(str(raw.defaultVariant) ? { defaultVariant: str(raw.defaultVariant)! } : {}),
  };
}

/** THE POLYMORPHISM: a definition resolved to ONE shape. No variants (or an
 *  unknown/absent key with no default) = the union as declared. Otherwise:
 *  the variant's slots in union order, `from` rewired where the variant says
 *  so, and edges to slots outside the shape dropped. Params and inputs are
 *  shared by every shape. */
export function resolveVariant(def: DefinitionDoc, variantKey?: string | null): DefinitionDoc {
  if (!def.variants.length) return def;
  const v = def.variants.find((x) => x.key === (variantKey ?? def.defaultVariant));
  if (!v) return def;
  const keep = new Set(v.slots);
  const context = new Set([...def.inputs.map((i) => i.key), ...def.params.map((p) => p.key)]);
  const slots = def.slots
    .filter((s) => keep.has(s.key))
    .map((s) => ({
      ...s,
      from: (v.rewire?.[s.key] ?? s.from).filter((k) => keep.has(k) || context.has(k)),
    }));
  return { ...def, slots };
}

export const variantLabel = (def: DefinitionDoc, key: string): string =>
  def.variants.find((v) => v.key === key)?.label ?? key;

/** DERIVED STATUS: the first unfilled REQUIRED slot of the instance's
 *  resolved shape, or null when every required slot is filled — done. */
export function firstGap(def: DefinitionDoc, inst: InstanceDoc): DefSlot | null {
  for (const s of resolveVariant(def, inst.variant).slots) {
    if (!s.optional && !inst.fills[s.key]) return s;
  }
  return null;
}

/** Fill progress over the resolved shape's slots — the card's N/M. */
export function fillProgress(def: DefinitionDoc, inst: InstanceDoc): { filled: number; total: number } {
  const slots = resolveVariant(def, inst.variant).slots;
  return {
    filled: slots.filter((s) => inst.fills[s.key]).length,
    total: slots.length,
  };
}

export const labelOf = (x: { key: string; label?: string }): string => x.label ?? x.key;

/** Topological lane per key: inputs and params sit at lane 0, a slot one past
 *  its deepest dependency. Unknown/cyclic references never block — the slot
 *  simply lands after everything it can see. */
export function laneByKey(doc: DefinitionDoc): Map<string, number> {
  const lanes = new Map<string, number>();
  for (const i of doc.inputs) lanes.set(i.key, 0);
  for (const p of doc.params) lanes.set(p.key, 0);
  let changed = true;
  let guard = 0;
  while (changed && guard++ < doc.slots.length + 2) {
    changed = false;
    for (const s of doc.slots) {
      const deps = s.from.map((k) => lanes.get(k)).filter((n): n is number => n !== undefined);
      const lane = (deps.length ? Math.max(...deps) : 0) + 1;
      if (lanes.get(s.key) !== lane) { lanes.set(s.key, lane); changed = true; }
    }
  }
  return lanes;
}

/** What a project shows as an instance's children: the PARAMS (the provided
 *  source material — the job ad — belongs one click away too) followed by
 *  the exported slots. Params are shaped as slots with no reads. */
export function definitionChildren(def: DefinitionDoc): DefSlot[] {
  const params: DefSlot[] = def.params.map((p) => ({
    key: p.key,
    ...(p.label ? { label: p.label } : {}),
    ...(p.hint ? { hint: p.hint } : {}),
    from: [],
  }));
  return [...params, ...def.slots.filter((s) => s.export)];
}

/** The children with each one's fill when the document exists — computed
 *  over the instance's RESOLVED shape. */
export function instanceChildren(def: DefinitionDoc, inst: InstanceDoc):
  { slot: DefSlot; fill: string | null }[] {
  return definitionChildren(resolveVariant(def, inst.variant))
    .map((s) => ({ slot: s, fill: inst.fills[s.key] ?? null }));
}
