/**
 * THE POINTS STORE — the stream that runs UNDER every document.
 *
 * A `.points` file captures the pipeline the finished artifacts hide:
 * LITERATURE (the collated inputs — laws, regulations, source documents,
 * all ordinary files) is distilled — through however many intermediate files
 * it takes, each an ordinary kind (.brief, .md, .list) — into POINTS.
 *
 * A point is a piece of information that EXISTS BY ITSELF. It starts as
 * identity only: a stable id, minted before its shape is known. It then
 * accretes KEYS, and every key=value is a claim with citations back into the
 * literature (`from`), optionally through the distillation files that carried
 * it (`via`). Setting a `type` is a lens applied later — it makes the point
 * start appearing AS something; untyped points are legitimate.
 *
 * DEFINITION vs INSTANCE — roles, not separate entities:
 *   - a point with `defines: [slot, ...]` declares EMPTY keys for instances
 *     to fill. Its own `keys` are facts about the general concept and are
 *     NEVER inherited — nothing is overridable, there are no defaults.
 *   - a point with `of: <id>` is an instance: its keys fill the definition's
 *     declared slots. What a document shows (a playbook event) is a
 *     PROJECTION of such a point, not the definition.
 *   - the demotion move costs nothing: a point later discovered to be one
 *     manifestation of something more general gains `of:` pointing at a
 *     newly minted definition (the shape shifts up a level) and keeps its id,
 *     so every reference to it survives.
 */
import yaml from "js-yaml";
import { DecisionTable, decide } from "crosscut";

export interface Citation {
  file: string;
  quote?: string;
  label?: string;
}

export interface PointKey {
  key: string;
  value?: string;
  /** Literature the claim is set FROM. */
  from?: Citation[];
  /** Distillation files the claim travelled THROUGH (stages, on demand). */
  via?: Citation[];
}

/**
 * What a point REFERENCES — the same node, not a copy. A stream whose output
 * is a policy part points at that part: the element under the policy
 * (`element: "decision:incorporation"`, `"event:incorporate"`), or a whole
 * file when the output IS a document (content). Viewers render the referenced
 * node itself, so the stream's output and the policy's child are one thing.
 */
export interface PointTarget {
  /** Doc-relative or absolute path of the targeted document. */
  file: string;
  /** "decision:<key>" | "event:<key>"; absent = the file itself. */
  element?: string;
}

export interface Point {
  /** Stable forever. References use this and only this; labels are just keys. */
  id: string;
  label?: string;
  /** The single lens this point appears through. One type per point. */
  type?: string;
  /** Instance role: the definition this point manifests. */
  of?: string;
  /** Definition role: the empty slots instances of this point fill. */
  defines?: string[];
  /** The node this point IS — same reference, rendered in place. */
  target?: PointTarget;
  keys: PointKey[];
  note?: string;
}

export interface LiteratureEntry {
  file: string;
  label?: string;
}

/** A stage key — free-form; the classic shape uses literature | distillation | points. */
export type StageKey = string;

/**
 * One stage of a stream's pipeline. Stages are AUTHORED PER STREAM — the
 * business logic decides them. literature → distillation → points is only the
 * default shape (used when a file declares no `stages:`); a stream that
 * chooses its literature might instead run sweep → shortlist → selection, and
 * one with nothing between inputs and points simply has no middle stage.
 *
 *   shelf  — a list of files (each opens whole, in the content dialog)
 *   points — renders the stream's points (there is exactly one; if an
 *            explicit `stages:` forgets it, a default one is appended)
 */
export interface StreamStage {
  key: string;
  label: string;
  hint?: string;
  kind: "shelf" | "points";
  /** shelf stages only. */
  entries: LiteratureEntry[];
  /** NODE REFERENCES — the stage is a VIEW of shared nodes, not an owner of
   *  content. One reference: a `.list` node feeds the entries, an `element`
   *  ref shows just that policy element, anything else renders whole.
   *  SEVERAL references: the stage lists its inputs — multiple nodes, one
   *  stage. Nodes are written by the stream outputs targeting them and
   *  read-only here. (`node:`/`source:` are accepted single-ref spellings.) */
  nodes: StageNodeRef[];
}

export interface StageNodeRef {
  /** Doc-relative or absolute path of the node. */
  node: string;
  /** Address INSIDE the node: "decision:<key>" | "event:<key>". */
  element?: string;
  label?: string;
}

/**
 * One edge between THIS stream and another one. Streams stay bounded — a
 * connection is an affordance (a chip on the stage header that opens the other
 * stream's preview as a dialog), never a merge into one long chain:
 *
 *   source — the stage IS the other stream's final output (it was produced
 *            there; working backwards from data you already have)
 *   via    — the hop from the PREVIOUS stage into this one is itself a whole
 *            stream (input = the stage on the left, output = this stage)
 *   feeds  — this stage is the other stream's input (moving forward with it)
 */
export interface StreamConnection {
  at: StageKey;
  role: "source" | "via" | "feeds";
  /** The other stream's `.points` file, doc-relative or absolute. */
  stream: string;
  label?: string;
}

export interface PointsDoc {
  title: string;
  description?: string;
  /** The pipeline, normalized: authored `stages:` verbatim (plus a points
   *  stage if forgotten), or the classic three derived from the legacy
   *  literature/distillation blocks. */
  stages: StreamStage[];
  /** True when the file authored its own `stages:` block. */
  explicitStages: boolean;
  /** Stage keys EXPORTED to the outside — a project hierarchy shows these as
   *  children of the points item. One list, so it works for authored and
   *  derived (classic) stages alike. */
  exports: StageKey[];
  connections: StreamConnection[];
  literature: LiteratureEntry[];
  /** Declared distillation stages — the intermediate files (briefs, lists,
   *  notes) the literature passed through. On demand: keys may also cite
   *  `via` files never declared here; `distillationFiles` merges both. */
  distillation: LiteratureEntry[];
  points: Point[];
}

/* ── GOLDEN RULES: what role a point plays ─────────────────────────────── */

export interface PointRoleCtx {
  hasDefines: boolean;
  hasOf: boolean;
}

export interface PointRoleVerdict {
  role: "definition" | "instance" | "point";
  /** It also manifests a higher definition (a demoted definition). */
  alsoInstance: boolean;
}

export const pointRoleRules: DecisionTable<PointRoleCtx, PointRoleVerdict> = {
  name: "point-role",
  answers: "Is a point a definition, an instance, or just itself?",
  rules: [
    { rule: "definition-instance",
      because: "the demotion move applied to a definition: it declares slots for its own instances AND manifests a higher definition — the shape shifted up a level",
      when: { hasDefines: true, hasOf: true },
      then: { role: "definition", alsoInstance: true } },
    { rule: "definition",
      because: "declared slots make it a shape other points can manifest",
      when: { hasDefines: true },
      then: { role: "definition", alsoInstance: false } },
    { rule: "instance",
      because: "pointing at a definition makes its keys fill that definition's slots",
      when: { hasOf: true },
      then: { role: "instance", alsoInstance: false } },
  ],
  otherwise: { role: "point", alsoInstance: false },
};

export const roleOf = (p: Point): PointRoleVerdict =>
  decide(pointRoleRules, { hasDefines: !!p.defines?.length, hasOf: !!p.of }).outcome;

/* ── helpers ───────────────────────────────────────────────────────────── */

export const pointById = (doc: PointsDoc, id: string): Point | undefined =>
  doc.points.find((p) => p.id === id);

export const definitionOf = (doc: PointsDoc, p: Point): Point | undefined =>
  p.of ? pointById(doc, p.of) : undefined;

export const instancesOf = (doc: PointsDoc, defId: string): Point[] =>
  doc.points.filter((p) => p.of === defId);

/** Instance keys OUTSIDE the definition's declared slots — the definition owns
 *  the shape, so these are authoring mistakes worth surfacing, not merging. */
export function strayKeys(doc: PointsDoc, p: Point): string[] {
  const def = definitionOf(doc, p);
  if (!def) return [];
  const slots = new Set(def.defines ?? []);
  return p.keys.map((k) => k.key).filter((k) => !slots.has(k));
}

/** Declared slots an instance has not filled yet — the honest gap list. */
export function emptySlots(doc: PointsDoc, p: Point): string[] {
  const def = definitionOf(doc, p);
  if (!def) return [];
  const filled = new Set(p.keys.map((k) => k.key));
  return (def.defines ?? []).filter((s) => !filled.has(s));
}

export const connectionsAt = (doc: PointsDoc, at: StageKey): StreamConnection[] =>
  doc.connections.filter((c) => c.at === at);

/** What a shelf stage actually lists: authored entries, except the DERIVED
 *  distillation stage, which also collects undeclared `via` files. */
export const exportedStages = (doc: PointsDoc): StreamStage[] =>
  doc.stages.filter((st) => doc.exports.includes(st.key));

export const stageEntries = (doc: PointsDoc, stage: StreamStage): LiteratureEntry[] =>
  !doc.explicitStages && stage.key === "distillation" ? distillationFiles(doc) : stage.entries;

/** Every shelf entry across every stage — label lookups for opened files. */
export const allShelfEntries = (doc: PointsDoc): LiteratureEntry[] =>
  doc.stages.filter((st) => st.kind === "shelf").flatMap((st) => stageEntries(doc, st));

/** The distillation stage as actually used: declared entries first, then any
 *  `via` file cited by a key that nobody declared — on-demand stages count. */
export function distillationFiles(doc: PointsDoc): LiteratureEntry[] {
  const out = [...doc.distillation];
  const seen = new Set(out.map((d) => d.file));
  for (const p of doc.points) for (const k of p.keys) for (const c of k.via ?? []) {
    if (!seen.has(c.file)) { seen.add(c.file); out.push({ file: c.file, ...(c.label ? { label: c.label } : {}) }); }
  }
  return out;
}

/** Reverse index for one file: how many keys cite it, across how many points. */
export function usesOfFile(doc: PointsDoc, file: string): { keys: number; points: number } {
  let keys = 0;
  const pts = new Set<string>();
  for (const p of doc.points) for (const k of p.keys) {
    if ((k.from ?? []).some((c) => c.file === file) || (k.via ?? []).some((c) => c.file === file)) {
      keys += 1; pts.add(p.id);
    }
  }
  return { keys, points: pts.size };
}

/** Every distinct file the store touches for one point: citations + vias. */
export function filesBehind(p: Point): string[] {
  const out = new Set<string>();
  for (const k of p.keys) {
    for (const c of k.from ?? []) out.add(c.file);
    for (const c of k.via ?? []) out.add(c.file);
  }
  return [...out];
}

/** Mint a stable id: readable prefix from the label, entropy for stability. */
export const mintPointId = (label: string): string => {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "point";
  return `p-${slug}-${Math.random().toString(36).slice(2, 6)}`;
};

/* ── parse / serialize ─────────────────────────────────────────────────── */

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined =>
  typeof x === "string" ? x : typeof x === "number" ? String(x) : undefined;

const parseCitations = (x: unknown): Citation[] =>
  arr(x).map((c) => {
    if (typeof c === "string") return { file: c };
    const o = rec(c);
    const file = str(o.file);
    return file ? {
      file,
      ...(str(o.quote) ? { quote: str(o.quote)! } : {}),
      ...(str(o.label) ? { label: str(o.label)! } : {}),
    } : null;
  }).filter(Boolean) as Citation[];

const parseShelf = (x: unknown): LiteratureEntry[] =>
  arr(x).map((l) => {
    if (typeof l === "string") return { file: l };
    const o = rec(l);
    const file = str(o.file);
    return file ? { file, ...(str(o.label) ? { label: str(o.label)! } : {}) } : null;
  }).filter(Boolean) as LiteratureEntry[];

const slugStage = (v: string) =>
  v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "stage";

export function parsePoints(text: string): PointsDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }

  // The pipeline: authored stages when declared, the classic three otherwise.
  const explicit = arr(raw.stages).length > 0;
  let stages: StreamStage[];
  if (explicit) {
    stages = arr(raw.stages).map((x, i) => {
      const o = rec(x);
      const label = str(o.label) ?? str(o.key) ?? `Stage ${i + 1}`;
      const kind = str(o.kind) === "points" ? "points" as const : "shelf" as const;
      return {
        key: str(o.key) ?? slugStage(label),
        label,
        ...(str(o.hint) ? { hint: str(o.hint)! } : {}),
        kind,
        entries: kind === "shelf" ? parseShelf(o.entries) : [],
        nodes: kind !== "shelf" ? [] : (() => {
          const refs = arr(o.nodes).map((n) => {
            const w = rec(n);
            const node = str(w.node) ?? str(w.file);
            return node ? {
              node,
              ...(str(w.element) ? { element: str(w.element)! } : {}),
              ...(str(w.label) ? { label: str(w.label)! } : {}),
            } : null;
          }).filter(Boolean) as StageNodeRef[];
          const single = str(o.node) ?? str(o.source);
          return refs.length ? refs : single ? [{ node: single }] : [];
        })(),
      };
    });
    // Points that exist must have a stage to show them — but a stream whose
    // output is a document (a brief, a note) legitimately has NO points
    // stage, so nothing is appended while the points list is empty.
    if (!stages.some((st) => st.kind === "points") && arr(raw.points).length > 0) {
      stages.push({ key: "points", label: "Points", kind: "points", entries: [], nodes: [] });
    }
  } else {
    stages = [
      { key: "literature", label: "Literature",
        hint: "The collated inputs — laws, regulations, source documents.", kind: "shelf", entries: parseShelf(raw.literature), nodes: [] },
      { key: "distillation", label: "Distillation",
        hint: "The stages between — ordinary files (briefs, notes, lists), declared or cited via keys.", kind: "shelf", entries: parseShelf(raw.distillation), nodes: [] },
      { key: "points", label: "Points", kind: "points", entries: [], nodes: [] },
    ];
  }

  return {
    title: str(raw.title) ?? "Points",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    stages,
    explicitStages: explicit,
    exports: arr(raw.exports).map(str).filter((k): k is string => !!k && stages.some((st) => st.key === k))
      .filter((k, i, a) => a.indexOf(k) === i),
    connections: arr(raw.connections).map((c) => {
      const o = rec(c);
      const at = str(o.at);
      const role = str(o.role);
      const stream = str(o.stream);
      if (!stream || !at) return null;
      if (!stages.some((st) => st.key === at)) return null;
      if (role !== "source" && role !== "via" && role !== "feeds") return null;
      return { at, role, stream, ...(str(o.label) ? { label: str(o.label)! } : {}) };
    }).filter(Boolean) as StreamConnection[],
    literature: parseShelf(raw.literature),
    distillation: parseShelf(raw.distillation),
    points: arr(raw.points).map((p) => {
      const o = rec(p);
      const id = str(o.id);
      if (!id) return null;
      return {
        id,
        ...(str(o.label) ? { label: str(o.label)! } : {}),
        ...(str(o.type) ? { type: str(o.type)! } : {}),
        ...(str(o.of) ? { of: str(o.of)! } : {}),
        ...(arr(o.defines).length ? { defines: arr(o.defines).map(str).filter(Boolean) as string[] } : {}),
        ...((() => {
          const t = rec(o.target);
          const file = str(t.file);
          return file ? { target: { file, ...(str(t.element) ? { element: str(t.element)! } : {}) } } : {};
        })()),
        keys: arr(o.keys).map((k) => {
          const w = rec(k);
          const key = str(w.key);
          return key ? {
            key,
            ...(str(w.value) !== undefined ? { value: str(w.value)! } : {}),
            ...(parseCitations(w.from).length ? { from: parseCitations(w.from) } : {}),
            ...(parseCitations(w.via).length ? { via: parseCitations(w.via) } : {}),
          } : null;
        }).filter(Boolean) as PointKey[],
        ...(str(o.note) ? { note: str(o.note)! } : {}),
      };
    }).filter(Boolean) as Point[],
  };
}

export function dumpPoints(doc: PointsDoc): string {
  return yaml.dump({
    title: doc.title,
    ...(doc.description ? { description: doc.description } : {}),
    ...(doc.explicitStages ? { stages: doc.stages.map((st) => ({
      key: st.key, label: st.label,
      ...(st.hint ? { hint: st.hint } : {}),
      kind: st.kind,
      ...(st.kind === "shelf" ? { entries: st.entries.map((l) => ({ file: l.file, ...(l.label ? { label: l.label } : {}) })) } : {}),
      ...(st.nodes.length === 1 && !st.nodes[0].element && !st.nodes[0].label
        ? { node: st.nodes[0].node }
        : st.nodes.length ? { nodes: st.nodes.map((n) => ({
            node: n.node,
            ...(n.element ? { element: n.element } : {}),
            ...(n.label ? { label: n.label } : {}),
          })) } : {}),
    })) } : {}),
    ...(doc.exports.length ? { exports: doc.exports } : {}),
    ...(doc.connections.length ? { connections: doc.connections.map((c) => ({
      at: c.at, role: c.role, stream: c.stream, ...(c.label ? { label: c.label } : {}),
    })) } : {}),
    ...(doc.explicitStages ? {} : { literature: doc.literature.map((l) => ({ file: l.file, ...(l.label ? { label: l.label } : {}) })) }),
    ...(!doc.explicitStages && doc.distillation.length ? { distillation: doc.distillation.map((l) => ({ file: l.file, ...(l.label ? { label: l.label } : {}) })) } : {}),
    points: doc.points.map((p) => ({
      id: p.id,
      ...(p.label ? { label: p.label } : {}),
      ...(p.type ? { type: p.type } : {}),
      ...(p.of ? { of: p.of } : {}),
      ...(p.defines?.length ? { defines: p.defines } : {}),
      ...(p.target ? { target: { file: p.target.file, ...(p.target.element ? { element: p.target.element } : {}) } } : {}),
      ...(p.keys.length ? { keys: p.keys.map((k) => ({
        key: k.key,
        ...(k.value !== undefined ? { value: k.value } : {}),
        ...(k.from?.length ? { from: k.from } : {}),
        ...(k.via?.length ? { via: k.via } : {}),
      })) } : { keys: [] }),
      ...(p.note ? { note: p.note } : {}),
    })),
  }, { lineWidth: -1, noRefs: true });
}
