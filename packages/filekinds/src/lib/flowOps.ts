// `.flow` — a walkthrough whose screens and edges are PARAMETERISED.
//
// WHY this exists, and why it is not `.walkthrough` with extra fields:
//
// A `.walkthrough` state is one screen in one condition. The moment a screen renders differently
// depending on data — a listing's shipping type, a feature flag, whether the seller already
// countered — the only way to say so is to author a SECOND state with a different title. That is
// how a 20-state flow becomes a 40-state flow, and it is where the format starts lying: three
// edges out of one screen look identical whether they are three buttons the user can choose
// between or ONE button that dispatches on data the user never sees. The event label is free text,
// so the distinction survives only as prose ("Continue Free" / "Continue - Free Shipping" /
// "Shipping - SYI Shipping Free" are all the same idea, written three ways), and the derived `.dag`
// drops event labels entirely so it cannot survive there at all.
//
// So this format splits the two axes that `.walkthrough` conflates:
//
//   • DIMENSIONS — the closed parameter space (copied wholesale from `.analysis`: named dimensions
//     with finite ordered value sets, and the same `when` grammar — bare value equals, [a,b] one-of,
//     "*" any, "!x" not-equal). A screen declares VARIANTS over that space instead of splitting
//     into several screens.
//   • EDGES — navigation. An edge is either unconditional (`to:`) or a DISPATCH (`dispatch:` — a
//     precedence-ordered list of when/to, first match wins). Unconditional versus dispatch is a
//     TYPE distinction, so "same button, different data" is no longer a naming convention.
//
// An edge may also `sets:` dimension values, because some parameters are established by walking
// the flow rather than fixed before it starts (the seller countering is what makes the buyer see a
// counter-offer). Without that, every such parameter would have to be ambient and the flow could
// only ever model one moment.
//
// DELIBERATELY NOT a simulator of the real app. Derived values are first-match-wins rules over
// declared literals, not expressions; there is no arithmetic, no strings, no user-defined
// functions. The point is to validate what is about to be built and stay cheap to author — the
// moment this needs a real evaluator, the answer is that the app should be running instead.
//
// FILE SHAPE: two YAML documents separated by a line that is exactly `---`. Doc 1 is the MODEL
// (hand-authored). Doc 2 is the VIEWS (saved parameter sets and layout; the preview writes back
// only this half). Same two-document contract as `.analysis`, for the same reason: the thing you
// explore with is not the thing you author.
//
// This module is a deliberate COPY of the shapes in walkthrough_ops.ts and analysisEngine.ts
// rather than an import of either. `.flow` is work in progress and its model will move; sharing
// code would make every change here a change to two shipped file kinds.
import yaml from "js-yaml";

export type FlowDoc = Record<string, unknown>;
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const asStr = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const clean = (v: unknown): string => asStr(v).trim();
const objects = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter(isObj) as Obj[]) : []);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null));

/** A dimension value. Scalars only — the parameter space is finite and enumerable by design. */
export type DimValue = string | number | boolean;
/** A `when` entry: bare value → equals; array → one-of; "*" → any; "!x" → not-equal. */
export type WhenCond = DimValue | DimValue[];
/**
 * A whole condition: a conjunction over dimensions, the bare string "*" for "always", or a LIST of
 * alternative conjunctions — any one of which matching is enough.
 *
 * The list form is the only way to say OR across two different dimensions. Inside one mapping an
 * array ORs the values of a SINGLE dimension (`{ x: [a, b] }`), and separate keys AND together, so
 * a condition like "in person, or shipping but only when declining" has no conjunctive form. That
 * shape is real — a control's availability often is "this case or that case" — and writing it as
 * two edges is not an option, because an edge's identity downstream is (screen title, event) and
 * two edges sharing an event would collide.
 *
 * There is no ambiguity with `WhenCond`'s array form: a `when` in this position is always a
 * mapping or "*", never a bare list of values, so a list here can only mean alternatives.
 */
export type When = Record<string, WhenCond> | When[] | "*";
/** A concrete parameter assignment. */
export type Assignment = Record<string, DimValue>;

const isScalar = (v: unknown): v is DimValue =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean";

// ---------------------------------------------------------------------------
// Two-document split (same contract as `.analysis`)
// ---------------------------------------------------------------------------

/** Split the combined blob into its model doc and views doc, on the FIRST bare `---` line. */
export function splitFlowFile(content: string): { modelText: string; viewsText: string } {
  const lines = content.split(/\r?\n/);
  let sep = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i])) { sep = i; break; }
  }
  if (sep === -1) return { modelText: content, viewsText: "" };
  return { modelText: lines.slice(0, sep).join("\n"), viewsText: lines.slice(sep + 1).join("\n") };
}

/** Recombine the two halves into one blob with a `---` separator. */
export function joinFlowFile(modelText: string, viewsText: string): string {
  const a = modelText.replace(/\s+$/, "");
  const b = viewsText.replace(/^\s+/, "");
  return `${a}\n---\n${b}\n`;
}

export function parseFlow(content: string): FlowDoc {
  const { modelText } = splitFlowFile(content);
  const parsed = modelText.trim() ? yaml.load(modelText) : {};
  if (parsed != null && !isObj(parsed)) throw new Error("expected a mapping at the top level");
  return isObj(parsed) ? parsed : {};
}

export function dumpFlow(doc: FlowDoc): string {
  return yaml.dump(doc, { lineWidth: 120, noRefs: true });
}

/** Parse the views half. Never throws — a broken views doc must not make the model unreadable. */
export function parseFlowViews(content: string): Obj {
  const { viewsText } = splitFlowFile(content);
  try {
    const parsed = viewsText.trim() ? yaml.load(viewsText) : {};
    return isObj(parsed) ? parsed : {};
  } catch { return {}; }
}

// ---------------------------------------------------------------------------
// The `when` grammar — copied verbatim in behaviour from analysisEngine.matchCond
// ---------------------------------------------------------------------------

function matchCond(cond: WhenCond, value: DimValue | undefined): boolean {
  if (Array.isArray(cond)) return cond.some((c) => c === value);
  if (typeof cond === "string") {
    if (cond === "*") return true;
    // Stringified compare so `!true` works against a boolean dimension, matching `.analysis`.
    if (cond.startsWith("!")) return String(value) !== cond.slice(1);
  }
  return cond === value;
}

/** True when every clause holds. `"*"` and `{}` both mean "always" — the else-branch idiom. */
export function matchWhen(when: When | undefined, a: Assignment): boolean {
  if (when === undefined || when === "*") return true;
  // A LIST is a disjunction — any one alternative matching is enough. Checked before `isObj`,
  // which deliberately excludes arrays. An EMPTY list means "always", matching what `{}` means:
  // logically an empty disjunction is false, but every other empty condition here reads as
  // "no restriction", and a half-written condition should not silently disable a control.
  if (Array.isArray(when)) return when.length === 0 || when.some((group) => matchWhen(group, a));
  if (!isObj(when)) return true;
  for (const [dim, cond] of Object.entries(when)) {
    if (!matchCond(cond as WhenCond, a[dim])) return false;
  }
  return true;
}

const readWhen = (raw: unknown): When => {
  if (raw === "*") return "*";
  // Groups that are neither a mapping nor "*" are dropped rather than coerced to `{}`, which would
  // read as "always" and quietly widen the condition. `validateWhen` reports them.
  if (Array.isArray(raw)) return raw.filter((g) => g === "*" || isObj(g)).map(readWhen);
  return isObj(raw) ? (raw as Record<string, WhenCond>) : {};
};

// ---------------------------------------------------------------------------
// Normalized read model
// ---------------------------------------------------------------------------

/**
 * ONE thing a state puts on screen.
 *
 * `.flow` began as "a walkthrough whose screens are parameterised", and a screen's evidence was
 * always a screenshot: a Storage key uploaded from the app being described. That is ONE KIND of
 * evidence, not the only one. A flow over a company's structure has no app to photograph — the
 * thing that changes as you walk it is a DOCUMENT, and that document already has a file kind that
 * knows how to draw itself. So a state's content is a LIST OF PANELS, and a screenshot is one
 * variety of panel rather than the definition of the format.
 *
 *   • screenshot — a Storage key in this file's directory, drawn as an image.
 *   • file       — another file in a virtual directory, drawn by its OWN kind's preview
 *                  (`.brief`, `.list`, `.tree`, ...), read-only and LIVE. Not a copy:
 *                  editing the referenced `.brief` changes what every state showing it says.
 *   • frame      — a `.frame` beside this flow (`login.frame`) OR one kept INSIDE it under the
 *                  top-level `frames:` map (`login`), drawn LIVE by the frame canvas at one of its
 *                  VIEWS. The states of a screen point at different views of the SAME frame
 *                  (Base, Loading, Error), so a design drawn once is walked as a flow. Scrolling
 *                  is the frame's own — a scroll node scrolls — so a frame state is one panel,
 *                  never a stack of captures to step through.
 *
 * A panel carries no layout. Panels are a SEQUENCE — the same "scroll through a tall capture"
 * affordance a multi-shot state already had, generalised — because a state showing three things
 * shows them one after another. Anything richer is a `.design`, not a flow.
 */
export type FlowPanel =
  | { kind: "screenshot"; key: string; label: string | null }
  | { kind: "file"; path: string; agent: string | null; source: string | null; label: string | null }
  | { kind: "frame"; path: string; view: string | null; label: string | null };

export type FlowFramePanel = Extract<FlowPanel, { kind: "frame" }>;

/**
 * A named place file panels resolve against — the flow's answer to "WHICH VERSION of the material".
 *
 * A flow is usually walked over material that is itself published in versions: the org structure as
 * it stands today, and the org structure after incorporation. Writing those as two panels pointing
 * at two hand-typed paths works exactly once; the moment a third version exists, every state in the
 * file has to be edited and the file no longer says WHY the paths differ. A source names the
 * version ONCE, and a panel says which one it wants.
 *
 * `path` is a folder prefix inside `agent` (omitted → this file's own directory), so the same
 * relative `file:` under two sources means "the same document, that version" — exactly the shape a
 * variant needs: two states of one screen differing only in which version they show.
 */
export interface FlowSource {
  name: string;
  /** Folder prefix. Empty = the directory root. */
  path: string;
  /** Directory agent holding it. Null = the directory this `.flow` lives in. */
  agent: string | null;
  description: string | null;
}

export interface FlowVariant {
  when: When;
  label: string;
  /** What this state SHOWS, in order. See `FlowPanel`. */
  content: FlowPanel[];
  description: string | null;
}

export interface FlowBranch { when: When; to: string; sets: Assignment }

/**
 * A control on a screen. Authored UNDER the screen it belongs to — a button is a property of the
 * page it sits on, not a free-floating fact about the model.
 *
 * Three fields carry the whole grammar:
 *
 *   • `when`  — whether the control is OFFERED AT ALL. A button that does not apply in the state
 *     you are in simply is not there. That used to be spelled as a dispatch whose every branch
 *     failed, which is a lie about the shape of the thing: "leads nowhere" and "is not on the
 *     screen" are different facts.
 *   • `to`    — OPTIONAL. Omit it and you STAY on this screen, so `sets` moves you to a different
 *     STATE of the same screen. Picking a radio, opening a section, filling a field: all of those
 *     were self-transitions the graph had to special-case, and every one of them polluted the
 *     global dimension space with something only one screen cared about.
 *   • `dispatch` — the destination depends on the parameters, first match wins. A branch may also
 *     omit its `to`, which stays.
 */
export interface FlowEdge {
  id: string;
  event: string;
  /**
   * The screen this control lives on. NOT authored — `readFlow` fills it in from position. It is
   * kept in the read model because almost every consumer (the diff's identity, the graph, the
   * "reached from" list) asks "whose control is this?" and reconstructing it each time is worse
   * than carrying it.
   */
  from: string;
  /** Offered only when this holds. `"*"`/absent means always. */
  when: When;
  /** Where it leads. `""` means STAY on this screen — `sets` then picks a different state. */
  to: string;
  dispatch: FlowBranch[];
  /** Applied on traversal, AFTER entering the target, so it may seed the target's locals. */
  sets: Assignment;
  /**
   * Why this control is the way it is — a requirement id, a copy decision, a caveat.
   *
   * Variants and screens have carried one from the start; edges did not, which left a NAVIGATION
   * change with nowhere to explain itself. A control appearing, disappearing or re-routing is one
   * of the most consequential things a proposal can do, and it was the only kind of change whose
   * reason had to live in a YAML comment — where the next write through the app destroys it.
   */
  description: string | null;
}

export interface FlowScreen {
  id: string;
  title: string;
  description: string | null;
  /** Fallback content for a screen with no variants, or when no variant matches. */
  content: FlowPanel[];
  variants: FlowVariant[];
  /**
   * Variables this screen OWNS: which radio is selected, which step of a form you are on.
   *
   * They RESET to `localDefaults` whenever you arrive from another screen, because that is what
   * "local" means — walking away and coming back gives you the screen as it opens, not as you left
   * it. Global `dimensions` are for facts about the world that outlive one screen (the feature
   * flag, what the listing is), and mixing the two is what made the parameter rail unreadable:
   * every screen's private UI state was a dimension every other screen had to ignore.
   *
   * Two screens may name a local the same thing without colliding, since only the screen you are
   * standing on has its locals in scope.
   */
  locals: Record<string, DimValue[]>;
  localOrder: string[];
  localDefaults: Assignment;
  /** The controls on this screen. */
  edges: FlowEdge[];
}

export interface FlowEntry {
  id: string;
  event: string;
  to: string;
  dispatch: FlowBranch[];
  sets: Assignment;
}

export interface FlowDerived {
  name: string;
  values: DimValue[];
  rules: Array<{ when: When; value: DimValue | string }>;
}

export interface FlowBody {
  title: string | null;
  description: string | null;
  initial: string | null;
  startMode: "screen" | "entries";
  dimensions: Record<string, DimValue[]>;
  dimensionOrder: string[];
  defaults: Assignment;
  derived: FlowDerived[];
  /** Named versions of the material file panels are read from. See `FlowSource`. */
  sources: FlowSource[];
  /** The source a `file` panel uses when it names none. Null = the flow's own directory. */
  defaultSource: string | null;
  screens: FlowScreen[];
  /**
   * Frames kept INSIDE the flow, by name — whole `.frame` bodies, raw. A state shows one with
   * `frame: <name>`; the name wins over a file of the same name beside the flow. See flowFrames.ts.
   */
  frames: Record<string, Record<string, unknown>>;
  /**
   * Every screen's controls, flattened. DERIVED, not authored — the file has no top-level `edges`
   * key any more. Whole-model passes (coverage, the graph, the diff) genuinely want one list, and
   * making each of them re-flatten would be the same loop written six times.
   */
  edges: FlowEdge[];
  entries: FlowEntry[];
}

/**
 * Read a screen's or variant's panels, in display order.
 *
 * `content:` is the general spelling. `screenshot:`/`screenshots:` are the ORIGINAL spelling and
 * stay first-class rather than being migrated away: they are terser, every existing `.flow` uses
 * them, and "this state is one image" deserves to read as one line. They are simply the
 * screenshot-only shorthand for `content:`.
 *
 * Accepted `content` entries:
 *   - a bare string                                -> a screenshot Storage key
 *   - { screenshot: <key>, label?: <caption> }
 *   - { file: <path>, source?: <name>, agent?: <uuid>, label?: <caption> }
 *   - { frame: <path>, view?: <view id or name>, label?: <caption> }
 * `frame:` + `view:` on a state is the frame-only shorthand, as `screenshot:` is for one image.
 */
export function readPanels(raw: Obj): FlowPanel[] {
  if (Array.isArray(raw.content)) {
    const out: FlowPanel[] = [];
    for (const item of raw.content as unknown[]) {
      if (typeof item === "string") {
        const key = item.trim();
        if (key) out.push({ kind: "screenshot", key, label: null });
        continue;
      }
      if (!isObj(item)) continue;
      const label = clean(item.label) || null;
      const frame = clean(item.frame);
      if (frame) {
        out.push({ kind: "frame", path: frame, view: clean(item.view) || null, label });
        continue;
      }
      const file = clean(item.file);
      if (file) {
        out.push({ kind: "file", path: file, agent: clean(item.agent) || null, source: clean(item.source) || null, label });
        continue;
      }
      const key = clean(item.screenshot);
      if (key) out.push({ kind: "screenshot", key, label });
    }
    if (out.length) return out;
  }
  const many = Array.isArray(raw.screenshots) ? (raw.screenshots as unknown[]).map(asStr).filter(Boolean) : [];
  if (many.length) return many.map((key) => ({ kind: "screenshot", key, label: null } as FlowPanel));
  const one = clean(raw.screenshot);
  if (one) return [{ kind: "screenshot", key: one, label: null }];
  const frame = clean(raw.frame);
  return frame ? [{ kind: "frame", path: frame, view: clean(raw.view) || null, label: null }] : [];
}

/** The frame panel of a state, if it shows one. */
export const framePanelOf = (panels: FlowPanel[]): FlowFramePanel | null =>
  (panels.find((p) => p.kind === "frame") as FlowFramePanel | undefined) ?? null;

/** Serialize one panel back to its authored shape. */
const dumpPanel = (p: FlowPanel): Obj => {
  const out: Obj = {};
  if (p.kind === "screenshot") out.screenshot = p.key;
  else if (p.kind === "frame") {
    out.frame = p.path;
    if (p.view) out.view = p.view;
  } else {
    out.file = p.path;
    if (p.source) out.source = p.source;
    if (p.agent) out.agent = p.agent;
  }
  if (p.label) out.label = p.label;
  return out;
};

/** A screen's or variant's panels off the READ model. */
export function panelsOf(s: { content?: FlowPanel[] | null }): FlowPanel[] {
  return Array.isArray(s.content) ? s.content : [];
}

/**
 * Just the SCREENSHOT keys, in order — what every caller that deals in images (the asset-URL
 * resolver, the missing-capture list, the image cache) actually wants. A file panel is not a
 * missing screenshot, so it simply is not in this list.
 *
 * Accepts a raw authored object too, so callers holding un-normalised YAML keep working.
 */
export function shotsOf(s: { content?: FlowPanel[] | null; screenshot?: string | null; screenshots?: string[] | null }): string[] {
  const panels = Array.isArray(s.content) ? s.content : readPanels(s as Obj);
  return panels.flatMap((p) => (p.kind === "screenshot" ? [p.key] : []));
}

/** Named sources, from either an array of `{ name, path }` or a mapping of name -> path/object. */
function readSources(raw: unknown): FlowSource[] {
  const one = (name: string, v: unknown): FlowSource => (isObj(v)
    ? { name, path: clean(v.path), agent: clean(v.agent) || null, description: v.description == null ? null : asStr(v.description) }
    : { name, path: asStr(v).trim(), agent: null, description: null });
  if (Array.isArray(raw)) return objects(raw).map((s) => one(clean(s.name), s)).filter((s) => !!s.name);
  if (isObj(raw)) return Object.entries(raw).map(([name, v]) => one(name, v)).filter((s) => !!s.name);
  return [];
}

/** Where a file panel actually reads from: a directory agent (null = this file's own) and a path. */
export interface PanelTarget { agent: string | null; path: string }

const joinPath = (base: string, rel: string): string => {
  const r = rel.replace(/^\.\//, "").trim();
  if (!base || r.startsWith("/")) return r.replace(/^\/+/, "");
  return `${base.replace(/\/+$/, "")}/${r}`;
};

/**
 * Resolve a file panel against the flow's sources. Returns null for a screenshot panel.
 *
 * Precedence is panel -> source -> host, for each of the two halves independently: a panel may name
 * its own agent while still taking the version's folder, which is what a cross-directory reference
 * inside a versioned set looks like.
 */
export function resolvePanelTarget(panel: FlowPanel, body: FlowBody): PanelTarget | null {
  // A frame lives beside the flow (no sources, no other directory) — or inside it, and then
  // there is nothing to fetch.
  if (panel.kind === "frame") return body.frames[panel.path] ? null : { agent: null, path: joinPath("", panel.path) };
  if (panel.kind !== "file") return null;
  const name = panel.source ?? body.defaultSource;
  const src = name ? body.sources.find((s) => s.name === name) ?? null : null;
  return { agent: panel.agent ?? src?.agent ?? null, path: joinPath(src?.path ?? "", panel.path) };
}

const readSets = (raw: unknown): Assignment => {
  const out: Assignment = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) if (isScalar(v)) out[k] = v;
  return out;
};

const readBranches = (raw: unknown): FlowBranch[] =>
  objects(raw).map((b) => ({ when: readWhen(b.when), to: asStr(b.to), sets: readSets(b.sets) }));

export function readFlow(doc: FlowDoc): FlowBody {
  const dimsRaw = isObj(doc.dimensions) ? doc.dimensions : {};
  const dimensions: Record<string, DimValue[]> = {};
  const dimensionOrder: string[] = [];
  for (const [name, values] of Object.entries(dimsRaw)) {
    if (!Array.isArray(values)) continue;
    dimensions[name] = (values as unknown[]).filter(isScalar);
    dimensionOrder.push(name);
  }
  const entries = objects(doc.entries).map((t) => ({
    id: asStr(t.id), event: asStr(t.event), to: asStr(t.to),
    dispatch: readBranches(t.dispatch), sets: readSets(t.sets),
  }));
  const screens = objects(doc.screens).map(readScreen);
  const frames: Record<string, Obj> = {};
  if (isObj(doc.frames)) for (const [name, v] of Object.entries(doc.frames)) if (isObj(v)) frames[name] = v;
  return {
    title: doc.title == null ? null : asStr(doc.title),
    description: doc.description == null ? null : asStr(doc.description),
    initial: doc.initial == null ? null : asStr(doc.initial),
    startMode: doc.start_mode === "entries" || (doc.start_mode !== "screen" && entries.length > 0) ? "entries" : "screen",
    dimensions,
    dimensionOrder,
    defaults: readSets(doc.defaults),
    sources: readSources(doc.sources),
    defaultSource: clean(doc.default_source) || null,
    derived: objects(doc.derived).map((d) => ({
      name: asStr(d.name),
      values: Array.isArray(d.values) ? (d.values as unknown[]).filter(isScalar) : [],
      rules: objects(d.rules).map((r) => ({ when: readWhen(r.when), value: isScalar(r.value) ? r.value : asStr(r.value) })),
    })),
    screens,
    frames,
    edges: screens.flatMap((s) => s.edges),
    entries,
  };
}

/** One screen, with its locals normalised and its controls stamped with their owner. */
function readScreen(s: Obj): FlowScreen {
  const id = asStr(s.id);
  const localsRaw = isObj(s.locals) ? s.locals : {};
  const locals: Record<string, DimValue[]> = {};
  const localOrder: string[] = [];
  for (const [name, values] of Object.entries(localsRaw)) {
    if (!Array.isArray(values)) continue;
    locals[name] = (values as unknown[]).filter(isScalar);
    localOrder.push(name);
  }
  // A local's default is its FIRST declared value unless `local_defaults` overrides it, so
  // `[unset, shipping, pickup]` opens on `unset` with nothing else to write down.
  const localDefaults: Assignment = {};
  for (const name of localOrder) if (locals[name].length) localDefaults[name] = locals[name][0];
  Object.assign(localDefaults, readSets(s.local_defaults));

  return {
    id,
    title: asStr(s.title),
    description: s.description == null ? null : asStr(s.description),
    content: readPanels(s),
    variants: objects(s.variants).map((v) => ({
      when: readWhen(v.when),
      label: asStr(v.label),
      description: v.description == null ? null : asStr(v.description),
      content: readPanels(v),
    })),
    locals,
    localOrder,
    localDefaults,
    edges: objects(s.edges).map((e) => ({
      id: asStr(e.id),
      event: asStr(e.event),
      from: id,
      when: readWhen(e.when),
      to: asStr(e.to),
      dispatch: readBranches(e.dispatch),
      sets: readSets(e.sets),
      description: e.description == null ? null : asStr(e.description),
    })),
  };
}

// ---------------------------------------------------------------------------
// Resolution — the whole point of the format
// ---------------------------------------------------------------------------

/** Every dimension name the model can assign, declared or derived. */
export function allDimensionNames(body: FlowBody): string[] {
  return [...body.dimensionOrder, ...body.derived.map((d) => d.name)];
}

/**
 * Apply the derived rules to a raw assignment, in declaration order, so a later derived value may
 * read an earlier one. `value: "= otherDim"` copies another dimension rather than writing a
 * literal — the one affordance needed for the common "a flag overrides a data value" shape,
 * without opening the door to expressions.
 */
export function applyDerived(raw: Assignment, body: FlowBody): Assignment {
  const a: Assignment = { ...raw };
  for (const d of body.derived) {
    if (!d.name) continue;
    for (const rule of d.rules) {
      if (!matchWhen(rule.when, a)) continue;
      const v = rule.value;
      if (typeof v === "string" && v.startsWith("=")) {
        const src = v.slice(1).trim();
        if (src in a) a[d.name] = a[src];
      } else if (isScalar(v)) {
        a[d.name] = v;
      }
      break; // first match wins
    }
  }
  return a;
}

/** The starting assignment: model defaults, then the caller's params, then derived. */
export function baseAssignment(body: FlowBody, params?: Assignment): Assignment {
  return applyDerived({ ...body.defaults, ...(params ?? {}) }, body);
}

/** The variant a screen renders under this assignment, or null when none matches. */
export function resolveVariant(screen: FlowScreen, a: Assignment): FlowVariant | null {
  for (const v of screen.variants) if (matchWhen(v.when, a)) return v;
  return null;
}

/**
 * What a screen SHOWS under this assignment: its matching variant's panels, else its own.
 *
 * A variant with no content of its own falls through to the screen's, which is how a screen with
 * one capture and several conditional CONTROLS stays a single-capture screen.
 */
export function resolvePanels(screen: FlowScreen, a: Assignment): FlowPanel[] {
  const v = resolveVariant(screen, a);
  if (v && v.content.length) return v.content;
  return screen.content;
}

/** Just the screenshots of `resolvePanels`. */
export function resolveShots(screen: FlowScreen, a: Assignment): string[] {
  return resolvePanels(screen, a).flatMap((p) => (p.kind === "screenshot" ? [p.key] : []));
}

export interface EdgeResolution {
  /** The target screen, or null when the control STAYS where it is. */
  to: string | null;
  /**
   * False only when a dispatch matched no branch — the control leads nowhere at all.
   *
   * Distinct from `to === null`, which is a legitimate outcome: staying on this screen in a
   * different state. Collapsing the two is what made "the button is not here" and "the button
   * goes nowhere" indistinguishable.
   */
  resolved: boolean;
  sets: Assignment;
  branch: number;
}

/** Where an edge leads under this assignment, ignoring whether it is OFFERED (see `isOffered`). */
export function resolveEdge(edge: FlowEdge | FlowEntry, a: Assignment): EdgeResolution {
  if (edge.dispatch.length) {
    for (let i = 0; i < edge.dispatch.length; i++) {
      const b = edge.dispatch[i];
      if (matchWhen(b.when, a)) return { to: b.to || null, resolved: true, sets: { ...edge.sets, ...b.sets }, branch: i };
    }
    return { to: null, resolved: false, sets: {}, branch: -1 };
  }
  return { to: edge.to || null, resolved: true, sets: { ...edge.sets }, branch: -1 };
}

/** Whether a control is on the screen at all in this state. */
export function isOffered(edge: FlowEdge, a: Assignment): boolean {
  return matchWhen(edge.when, a) && resolveEdge(edge, a).resolved;
}

/** Every local name any screen declares — what has to be cleared when you walk somewhere else. */
function allLocalKeys(body: FlowBody): Set<string> {
  const out = new Set<string>();
  for (const s of body.screens) for (const name of s.localOrder) out.add(name);
  return out;
}

/**
 * The assignment on ARRIVAL at a screen: every screen's locals dropped, then this screen's own
 * seeded to their defaults. Globals and derived values pass straight through.
 *
 * This is the rule that makes a local local. Without it a radio left on "pickup" three screens ago
 * would still read as "pickup" when you came back, and the only fix would be to have every edge
 * remember to reset it — which is exactly the bookkeeping the format is supposed to remove.
 */
export function enterScreen(body: FlowBody, screenId: string, a: Assignment): Assignment {
  const locals = allLocalKeys(body);
  const out: Assignment = {};
  for (const [k, v] of Object.entries(a)) if (!locals.has(k)) out[k] = v;
  const screen = body.screens.find((s) => s.id === screenId);
  if (screen) Object.assign(out, screen.localDefaults);
  return out;
}

/**
 * The full assignment for standing on one screen: model defaults, the caller's pins, that screen's
 * locals (pinned values winning over the defaults), then the derived rules.
 */
export function screenAssignment(body: FlowBody, screenId: string, params?: Assignment): Assignment {
  const pins = params ?? {};
  const seeded = enterScreen(body, screenId, { ...body.defaults, ...pins });
  const screen = body.screens.find((s) => s.id === screenId);
  for (const name of screen?.localOrder ?? []) if (pins[name] !== undefined) seeded[name] = pins[name];
  return applyDerived(seeded, body);
}

/** The controls actually on a screen under this assignment. */
export function availableEdges(body: FlowBody, screenId: string, a: Assignment): Array<{ edge: FlowEdge; res: EdgeResolution }> {
  const screen = body.screens.find((s) => s.id === screenId);
  return (screen?.edges ?? [])
    .filter((edge) => matchWhen(edge.when, a))
    .map((edge) => ({ edge, res: resolveEdge(edge, a) }))
    .filter((x) => x.res.resolved);
}

/**
 * Press a control: where you end up and with what.
 *
 * `sets` lands AFTER entry, so an edge may deliberately seed a local of the screen it opens — the
 * reset is the default, not a wall. Returns null when the control is not offered here.
 *
 * Note the asymmetry between omitting `to` and writing `to: <this screen>`: the first STAYS (your
 * locals survive, which is how a radio moves the screen to another state), the second RE-ENTERS
 * (your locals reset, which is how a form returns to blank). Both are things people mean.
 */
export function traverse(
  body: FlowBody, screenId: string, edge: FlowEdge, a: Assignment,
): { screen: string; assignment: Assignment } | null {
  if (!matchWhen(edge.when, a)) return null;
  const res = resolveEdge(edge, a);
  if (!res.resolved) return null;
  const target = res.to ?? screenId;
  const base = res.to === null ? a : enterScreen(body, target, a);
  return { screen: target, assignment: applyDerived({ ...base, ...res.sets }, body) };
}

// ---------------------------------------------------------------------------
// Reachability under a fixed parameter set
// ---------------------------------------------------------------------------

export interface FlowReach {
  /** Screen ids reachable from the start under this assignment. */
  screens: Set<string>;
  /** Edge/entry ids traversed. */
  edges: Set<string>;
  /** The assignment in force on FIRST arrival at each screen — the display default. */
  arrival: Map<string, Assignment>;
  /**
   * EVERY distinct assignment a screen is reached with.
   *
   * A screen reachable by more than one route renders once per route, and those renderings can
   * differ: the seller's Request Payment Review is entered from the pickup branch, the shipping
   * branch and the no-shipping branch, and shows a different shipping line each time. Keeping only
   * the first arrival made three of its four variants look dead.
   */
  arrivals: Map<string, Assignment[]>;
}

/**
 * BFS from the start under an assignment, following `sets` as it goes.
 *
 * A screen is keyed by (id + the assignment on arrival), because a `sets` edge can bring you back
 * to a screen you have already seen but in a different configuration, where it renders differently
 * and offers different edges. Collapsing those would under-report the graph.
 */
export function reachFlow(body: FlowBody, params?: Assignment): FlowReach {
  const screens = new Set<string>();
  const edges = new Set<string>();
  const arrival = new Map<string, Assignment>();
  const arrivals = new Map<string, Assignment[]>();
  const byId = new Map(body.screens.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const queue: Array<{ id: string; a: Assignment }> = [];

  const visit = (id: string, a: Assignment) => {
    if (!byId.has(id)) return;
    const key = `${id}\u0000${JSON.stringify(a, Object.keys(a).sort())}`;
    if (seen.has(key)) return;
    seen.add(key);
    screens.add(id);
    if (!arrival.has(id)) arrival.set(id, a);
    const list = arrivals.get(id) ?? [];
    list.push(a);
    arrivals.set(id, list);
    queue.push({ id, a });
  };

  const start = baseAssignment(body, params);
  if (body.startMode === "entries") {
    for (const e of body.entries) {
      const res = resolveEdge(e, start);
      if (!res.resolved || res.to === null) continue;
      edges.add(e.id);
      visit(res.to, applyDerived({ ...enterScreen(body, res.to, start), ...res.sets }, body));
    }
  } else {
    const first = body.initial || body.screens[0]?.id || "";
    if (first) visit(first, applyDerived(enterScreen(body, first, start), body));
  }

  while (queue.length) {
    const cur = queue.shift()!;
    const screen = byId.get(cur.id);
    for (const e of screen?.edges ?? []) {
      const step = traverse(body, cur.id, e, cur.a);
      if (!step) continue;
      edges.add(e.id);
      visit(step.screen, step.assignment);
    }
  }
  return { screens, edges, arrival, arrivals };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export function simulateFlow(
  doc: FlowDoc,
  opts: { events: string[]; params?: Assignment; fromScreenId?: string; version?: string | number | null },
) {
  const ref = resolveFlowVersion(doc, opts.version);
  if (!ref) return { ok: false as const, error: `version not found: ${opts.version}` };
  const body = readFlow(ref.body);
  const byId = new Map(body.screens.map((s) => [s.id, s]));

  let a = baseAssignment(body, opts.params);
  const path: Array<{ screen: string; title: string; event?: string; variant?: string | null; params: Assignment }> = [];
  const step = (id: string, event?: string) => {
    const screen = byId.get(id) ?? null;
    path.push({
      screen: id,
      title: screen?.title ?? id,
      ...(event === undefined ? {} : { event }),
      variant: screen ? (resolveVariant(screen, a)?.label ?? null) : null,
      params: { ...a },
    });
  };

  let currentId: string;
  let events = opts.events;
  const startsFromEntries = !opts.fromScreenId && body.startMode === "entries";

  if (startsFromEntries) {
    const offered = body.entries.filter((e) => resolveEdge(e, a).resolved);
    if (!events.length) {
      return {
        ok: true as const, path: [], finalScreen: null, params: a,
        availableEvents: offered.map((e) => e.event),
      };
    }
    const first = offered.find((e) => e.event === events[0]);
    if (!first) {
      return {
        ok: true as const, path: [], finalScreen: null, params: a,
        availableEvents: offered.map((e) => e.event),
        stuckAt: { screen: "$start", event: events[0] },
      };
    }
    const res = resolveEdge(first, a);
    currentId = res.to!;
    a = applyDerived({ ...enterScreen(body, currentId, a), ...res.sets }, body);
    step(currentId, events[0]);
    events = events.slice(1);
  } else {
    currentId = opts.fromScreenId ?? body.initial ?? body.screens[0]?.id ?? "";
    if (!currentId || !byId.has(currentId)) {
      return { ok: false as const, error: `start screen not found: ${currentId || "(none)"}`, path: [], finalScreen: null, availableEvents: [] };
    }
    a = applyDerived(enterScreen(body, currentId, a), body);
    step(currentId);
  }

  let stuckAt: { screen: string; event: string } | undefined;
  for (const event of events) {
    const options = availableEdges(body, currentId, a);
    const hit = options.find((o) => o.edge.event === event);
    if (!hit) { stuckAt = { screen: currentId, event }; break; }
    const next = traverse(body, currentId, hit.edge, a)!;
    currentId = next.screen;
    a = next.assignment;
    step(currentId, event);
  }

  const result: Record<string, unknown> = {
    ok: true,
    path,
    finalScreen: byId.get(currentId) ?? null,
    params: a,
    availableEvents: availableEdges(body, currentId, a).map((o) => o.edge.event),
  };
  if (stuckAt) result.stuckAt = stuckAt;
  return result;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateWhen(raw: unknown, dims: Map<string, Set<DimValue>>, where: string, problems: string[]): void {
  if (raw === undefined || raw === "*") return;
  if (Array.isArray(raw)) {
    if (!raw.length) { problems.push(`${where} is an empty list of alternatives; write "*" for "always".`); return; }
    raw.forEach((group, i) => {
      // The likeliest mistake is writing a list of VALUES here. That belongs against a dimension
      // (`{ dim: [a, b] }`); a list in the `when` position is a list of whole conditions.
      if (group !== "*" && !isObj(group)) {
        problems.push(`${where}[${i}] must be a mapping of dimension → value: a list \`when\` is a list of ALTERNATIVE conditions, not a list of values.`);
        return;
      }
      validateWhen(group, dims, `${where}[${i}]`, problems);
    });
    return;
  }
  if (!isObj(raw)) { problems.push(`${where} must be a mapping of dimension → value, a list of such mappings, or the string "*".`); return; }
  for (const [dim, cond] of Object.entries(raw)) {
    const domain = dims.get(dim);
    if (!domain) { problems.push(`${where}.${dim} is not a declared dimension.`); continue; }
    const check = (val: unknown) => {
      // "*" and "!x" are grammar, not values — they are never in a domain.
      if (typeof val === "string" && (val === "*" || val.startsWith("!"))) return;
      if (!isScalar(val)) { problems.push(`${where}.${dim} has a non-scalar value.`); return; }
      if (!domain.has(val)) problems.push(`${where}.${dim} value "${String(val)}" is not in dimension "${dim}".`);
    };
    if (Array.isArray(cond)) cond.forEach(check); else check(cond);
  }
}

function validateSets(raw: unknown, dims: Map<string, Set<DimValue>>, where: string, problems: string[]): void {
  if (raw === undefined) return;
  if (!isObj(raw)) { problems.push(`${where} must be a mapping of dimension → value.`); return; }
  for (const [dim, val] of Object.entries(raw)) {
    const domain = dims.get(dim);
    if (!domain) { problems.push(`${where}.${dim} is not a declared dimension.`); continue; }
    if (!isScalar(val)) { problems.push(`${where}.${dim} must be a scalar.`); continue; }
    if (!domain.has(val)) problems.push(`${where}.${dim} value "${String(val)}" is not in dimension "${dim}".`);
  }
}

/** A screen's or variant's `content:` (and the screenshot shorthand it generalises). */
function validateContent(raw: Obj, where: string, sources: Set<string>, problems: string[]): void {
  if (raw.screenshot !== undefined && typeof raw.screenshot !== "string") {
    problems.push(`${where}.screenshot must be a string Storage key.`);
  }
  if (raw.screenshots !== undefined
    && (!Array.isArray(raw.screenshots) || raw.screenshots.some((k) => typeof k !== "string"))) {
    problems.push(`${where}.screenshots must be an array of string Storage keys, ordered top→bottom.`);
  }
  if (raw.content === undefined) return;
  if (!Array.isArray(raw.content)) {
    problems.push(`${where}.content must be an array of panels (\`{ screenshot: <key> }\` or \`{ file: <path> }\`).`);
    return;
  }
  (raw.content as unknown[]).forEach((item, i) => {
    const cw = `${where}.content[${i}]`;
    if (typeof item === "string") { if (!item.trim()) problems.push(`${cw} is an empty screenshot key.`); return; }
    if (!isObj(item)) { problems.push(`${cw} must be a string Storage key or an object.`); return; }
    const hasFile = clean(item.file) !== "";
    const hasShot = clean(item.screenshot) !== "";
    if (hasFile && hasShot) problems.push(`${cw} sets both \`file\` and \`screenshot\` — a panel is one or the other.`);
    else if (!hasFile && !hasShot) problems.push(`${cw} needs a \`file\` (another file to render) or a \`screenshot\` (a Storage key).`);
    if (item.label !== undefined && typeof item.label !== "string") problems.push(`${cw}.label must be a string.`);
    if (!hasFile) {
      for (const k of ["source", "agent"] as const) {
        if (item[k] !== undefined) problems.push(`${cw}.${k} only applies to a \`file\` panel.`);
      }
      return;
    }
    const src = clean(item.source);
    if (src && !sources.has(src)) problems.push(`${cw}.source "${src}" is not a declared source. Add it under top-level \`sources:\`.`);
    if (item.agent !== undefined && typeof item.agent !== "string") problems.push(`${cw}.agent must be a directory agent uuid.`);
  });
}

function validateBody(doc: Obj, prefix: string, problems: string[]): void {
  for (const key of ["title", "description"] as const) {
    if (doc[key] !== undefined && typeof doc[key] !== "string") problems.push(`${prefix}\`${key}\` must be a string.`);
  }
  if (doc.start_mode !== undefined && doc.start_mode !== "screen" && doc.start_mode !== "entries") {
    problems.push(`${prefix}\`start_mode\` must be \`screen\` or \`entries\`.`);
  }

  // `sources` — the named versions file panels read from. Checked before screens, because a panel
  // naming a source that does not exist should say so by name rather than resolve to the root and
  // silently show the wrong version.
  const sourceNames = new Set<string>();
  if (doc.sources !== undefined) {
    if (!Array.isArray(doc.sources) && !isObj(doc.sources)) {
      problems.push(`${prefix}\`sources\` must be an array of \`{ name, path }\` or a mapping of name → path.`);
    } else {
      for (const src of readSources(doc.sources)) {
        if (sourceNames.has(src.name)) problems.push(`${prefix}\`sources\` names "${src.name}" twice.`);
        sourceNames.add(src.name);
      }
      if (Array.isArray(doc.sources) && objects(doc.sources).length !== doc.sources.length) {
        problems.push(`${prefix}\`sources\` entries must be objects with a \`name\`.`);
      }
    }
  }
  const defaultSource = clean(doc.default_source);
  if (defaultSource && !sourceNames.has(defaultSource)) {
    problems.push(`${prefix}\`default_source\` "${defaultSource}" is not a declared source.`);
  }

  // Dimensions first — everything else validates its values against them.
  const dims = new Map<string, Set<DimValue>>();
  if (doc.dimensions !== undefined) {
    if (!isObj(doc.dimensions)) problems.push(`${prefix}\`dimensions\` must be a mapping of name → value list.`);
    else for (const [name, values] of Object.entries(doc.dimensions)) {
      if (!Array.isArray(values) || !values.length) { problems.push(`${prefix}dimensions.${name} must be a non-empty array of scalars.`); continue; }
      const bad = (values as unknown[]).filter((v) => !isScalar(v));
      if (bad.length) problems.push(`${prefix}dimensions.${name} must contain only scalars.`);
      dims.set(name, new Set((values as unknown[]).filter(isScalar)));
    }
  }

  // Derived dimensions join the namespace, so a `when` may reference them.
  if (doc.derived !== undefined) {
    if (!Array.isArray(doc.derived)) problems.push(`${prefix}\`derived\` must be an array.`);
    else doc.derived.forEach((raw, i) => {
      const where = `${prefix}derived[${i}]`;
      if (!isObj(raw)) { problems.push(`${where} must be an object.`); return; }
      const name = clean(raw.name);
      if (!name) { problems.push(`${where}.name is required.`); return; }
      if (dims.has(name)) problems.push(`${where}.name "${name}" is already a declared dimension.`);
      if (!Array.isArray(raw.values) || !raw.values.length) problems.push(`${where}.values must be a non-empty array of scalars.`);
      dims.set(name, new Set(Array.isArray(raw.values) ? (raw.values as unknown[]).filter(isScalar) : []));
    });
    // Second pass so a derived rule may reference any dimension, including later derived ones.
    (doc.derived as unknown[]).forEach((raw, i) => {
      if (!isObj(raw)) return;
      const where = `${prefix}derived[${i}]`;
      const domain = dims.get(clean(raw.name)) ?? new Set<DimValue>();
      if (raw.rules !== undefined && !Array.isArray(raw.rules)) { problems.push(`${where}.rules must be an array.`); return; }
      objects(raw.rules).forEach((rule, j) => {
        const rw = `${where}.rules[${j}]`;
        validateWhen(rule.when, dims, `${rw}.when`, problems);
        const v = rule.value;
        if (typeof v === "string" && v.startsWith("=")) {
          const src = v.slice(1).trim();
          if (!dims.has(src)) problems.push(`${rw}.value "= ${src}" does not name a dimension.`);
        } else if (!isScalar(v)) problems.push(`${rw}.value must be a scalar or "= <dimension>".`);
        else if (!domain.has(v)) problems.push(`${rw}.value "${String(v)}" is not in "${clean(raw.name)}".`);
      });
    });
  }

  validateSets(doc.defaults, dims, `${prefix}defaults`, problems);

  if (doc.edges !== undefined) {
    problems.push(`${prefix}\`edges\` is no longer a top-level key — a control belongs to the screen it sits on. Move each edge into that screen's \`edges\` array and drop its \`from\`.`);
  }

  // ---- screens, in TWO passes. The first collects ids, titles and each screen's local names,
  // because an edge's `to` may name any screen and a variant's `when` may name a local — neither
  // is knowable until every screen has been seen once.
  const screens = doc.screens;
  const screenIds = new Set<string>();
  const screenTitles = new Set<string>();
  /** Screen id → just that screen's locals. Composed with `dims` to make its private namespace. */
  const screenLocals = new Map<string, Map<string, Set<DimValue>>>();

  // No `screens` key at all is an EMPTY flow, not a broken one — the surface shows an empty state.
  if (!Array.isArray(screens)) { if (screens !== undefined) problems.push(`${prefix}\`screens\` must be an array.`); }
  else {
    screens.forEach((raw, i) => {
      const where = `${prefix}screens[${i}]`;
      if (!isObj(raw)) { problems.push(`${where} must be an object.`); return; }
      const id = typeof raw.id === "string" ? raw.id : "";
      if (!id.trim()) problems.push(`${where}.id is required (a unique non-empty string).`);
      else if (screenIds.has(id)) problems.push(`${where}.id "${id}" is duplicated.`);
      else screenIds.add(id);
      const title = typeof raw.title === "string" ? raw.title : "";
      if (!title.trim()) problems.push(`${where}.title is required (a non-empty string).`);
      // Titles are the diff's identity, exactly as in `.walkthrough` — a duplicate silently
      // collapses two screens into one on every downstream comparison.
      else if (screenTitles.has(title)) problems.push(`${where}.title "${title}" is duplicated; screen titles must be unique.`);
      else screenTitles.add(title);

      // Locals join THIS screen's namespace only. A name that is already a global dimension is
      // rejected rather than shadowed: one name meaning two things depending on where you happen
      // to be standing is exactly the confusion that splitting them was meant to end.
      const own = new Map<string, Set<DimValue>>();
      if (raw.locals !== undefined) {
        if (!isObj(raw.locals)) problems.push(`${where}.locals must be a mapping of name → value list.`);
        else for (const [name, values] of Object.entries(raw.locals)) {
          if (dims.has(name)) { problems.push(`${where}.locals.${name} is already a global dimension — rename one of them.`); continue; }
          if (!Array.isArray(values) || !values.length) { problems.push(`${where}.locals.${name} must be a non-empty array of scalars.`); continue; }
          if ((values as unknown[]).some((v) => !isScalar(v))) problems.push(`${where}.locals.${name} must contain only scalars.`);
          own.set(name, new Set((values as unknown[]).filter(isScalar)));
        }
      }
      if (id.trim()) screenLocals.set(id, own);
      validateSets(raw.local_defaults, own, `${where}.local_defaults`, problems);
    });

    screens.forEach((raw, i) => {
      const where = `${prefix}screens[${i}]`;
      if (!isObj(raw)) return;
      const id = typeof raw.id === "string" ? raw.id : "";
      const scoped = new Map([...dims, ...(screenLocals.get(id) ?? new Map())]);
      if (raw.description !== undefined && typeof raw.description !== "string") problems.push(`${where}.description must be a string.`);
      validateContent(raw, where, sourceNames, problems);
      if (raw.variants !== undefined) {
        if (!Array.isArray(raw.variants)) problems.push(`${where}.variants must be an array.`);
        else raw.variants.forEach((v, j) => {
          const vw = `${where}.variants[${j}]`;
          if (!isObj(v)) { problems.push(`${vw} must be an object.`); return; }
          if (typeof v.label !== "string" || !v.label.trim()) problems.push(`${vw}.label is required (a non-empty string).`);
          validateWhen(v.when, scoped, `${vw}.when`, problems);
          validateContent(v, vw, sourceNames, problems);
        });
      }
    });
  }

  const initial = typeof doc.initial === "string" ? doc.initial : "";
  if (initial && !screenIds.has(initial)) problems.push(`${prefix}\`initial\` "${initial}" does not match any screen id.`);

  const withTargetLocals = (scoped: Map<string, Set<DimValue>>, targets: Set<string>) => {
    const out = new Map(scoped);
    for (const t of targets) for (const [k, v] of screenLocals.get(t) ?? []) if (!out.has(k)) out.set(k, v);
    return out;
  };

  /**
   * `to` / `dispatch` / `sets` on an edge or an entry.
   *
   * `scoped` is the namespace a condition may read: the globals plus, for an edge, the locals of
   * the screen it lives on. `allowStay` is what separates the two callers — omitting `to` on a
   * control means "stay here in a different state", but an ENTRY has no here to stay in.
   *
   * A `sets` may also write the TARGET screen's locals, which is how an edge seeds the screen it
   * opens rather than leaving it on its defaults.
   */
  const checkTargets = (raw: Obj, where: string, scoped: Map<string, Set<DimValue>>, allowStay: boolean) => {
    const hasTo = typeof raw.to === "string" && raw.to.trim();
    const hasDispatch = Array.isArray(raw.dispatch) && raw.dispatch.length > 0;
    if (hasTo && hasDispatch) problems.push(`${where} has both \`to\` and \`dispatch\` — use one. \`to\` is unconditional; \`dispatch\` branches on parameters.`);
    if (!hasTo && !hasDispatch && !allowStay) problems.push(`${where} needs either \`to\` (a screen id) or \`dispatch\` (a list of when/to branches).`);
    if (hasTo && !screenIds.has(asStr(raw.to))) problems.push(`${where}.to "${asStr(raw.to)}" does not match any screen id.`);

    const targets = new Set<string>();
    if (hasTo) targets.add(asStr(raw.to));
    if (raw.dispatch !== undefined && !Array.isArray(raw.dispatch)) problems.push(`${where}.dispatch must be an array of { when, to } branches.`);
    else objects(raw.dispatch).forEach((b, k) => {
      const bw = `${where}.dispatch[${k}]`;
      validateWhen(b.when, scoped, `${bw}.when`, problems);
      const to = asStr(b.to);
      if (to.trim() && !screenIds.has(to)) problems.push(`${bw}.to "${to}" does not match any screen id.`);
      else if (!to.trim() && !allowStay) problems.push(`${bw}.to is required (a screen id).`);
      if (to.trim()) targets.add(to);
      validateSets(b.sets, withTargetLocals(scoped, targets), `${bw}.sets`, problems);
    });
    validateSets(raw.sets, withTargetLocals(scoped, targets), `${where}.sets`, problems);
  };

  const entries = doc.entries;
  const entryIds = new Set<string>();
  const entryLabels = new Set<string>();
  if (entries !== undefined && !Array.isArray(entries)) problems.push(`${prefix}\`entries\` must be an array.`);
  else if (Array.isArray(entries)) entries.forEach((raw, i) => {
    const where = `${prefix}entries[${i}]`;
    if (!isObj(raw)) { problems.push(`${where} must be an object.`); return; }
    const id = typeof raw.id === "string" ? raw.id : "";
    const event = typeof raw.event === "string" ? raw.event : "";
    if (!id.trim()) problems.push(`${where}.id is required (a unique non-empty string).`);
    else if (entryIds.has(id)) problems.push(`${where}.id "${id}" is duplicated.`);
    else entryIds.add(id);
    if (!event.trim()) problems.push(`${where}.event is required (a non-empty string).`);
    else if (entryLabels.has(event)) problems.push(`${where} duplicates start event "${event}".`);
    else entryLabels.add(event);
    checkTargets(raw, where, dims, false);
  });

  // ---- controls: a third pass over screens, because a target may be any screen and a condition
  // may name a local, so neither is knowable until both earlier passes have run.
  const edgeIds = new Set<string>();
  if (Array.isArray(screens)) screens.forEach((sraw, i) => {
    if (!isObj(sraw)) return;
    const sid = typeof sraw.id === "string" ? sraw.id : "";
    const scoped = new Map([...dims, ...(screenLocals.get(sid) ?? new Map())]);
    const swhere = `${prefix}screens[${i}]`;
    if (sraw.edges === undefined) return;
    if (!Array.isArray(sraw.edges)) { problems.push(`${swhere}.edges must be an array of controls.`); return; }

    /** event -> the `when`s already used for it here, so a genuinely duplicated control is caught. */
    const byEvent = new Map<string, string[]>();
    sraw.edges.forEach((raw, j) => {
      const where = `${swhere}.edges[${j}]`;
      if (!isObj(raw)) { problems.push(`${where} must be an object.`); return; }
      if (raw.from !== undefined) problems.push(`${where}.from is not a field any more — a control's screen is where it is written.`);
      const id = typeof raw.id === "string" ? raw.id : "";
      const event = typeof raw.event === "string" ? raw.event : "";
      // Ids stay globally unique: they are the handle the diff, the graph and every mutation use
      // to address a control, and scoping them per screen would make those handles ambiguous.
      if (!id.trim()) problems.push(`${where}.id is required (a unique non-empty string).`);
      else if (edgeIds.has(id)) problems.push(`${where}.id "${id}" is duplicated.`);
      else edgeIds.add(id);
      if (!event.trim()) problems.push(`${where}.event is required (a non-empty string).`);
      if (raw.description !== undefined && typeof raw.description !== "string") problems.push(`${where}.description must be a string.`);
      validateWhen(raw.when, scoped, `${where}.when`, problems);
      checkTargets(raw, where, scoped, true);

      // Two controls sharing a label on one screen are fine when their `when`s tell them apart —
      // that is one button whose destination depends on the state you are in. Two with the SAME
      // condition are a mistake: one of them can never be the one you pressed.
      if (event.trim()) {
        const seen = byEvent.get(event) ?? [];
        const key = JSON.stringify(raw.when ?? {});
        if (seen.includes(key)) {
          problems.push(`${where} repeats event "${event}" with the same \`when\` as an earlier control on this screen. Give them different conditions, or branch one with \`dispatch\`.`);
        }
        seen.push(key);
        byEvent.set(event, seen);
      }
    });
  });
}

export function validateFlow(doc: unknown): string[] {
  if (!isObj(doc)) return ["doc must be a mapping with `screens` and `edges` arrays."];
  const problems: string[] = [];
  validateBody(doc, "", problems);
  if (doc.version_name !== undefined && typeof doc.version_name !== "string") problems.push("`version_name` must be a string.");
  if (doc.versions !== undefined) {
    if (!Array.isArray(doc.versions)) problems.push("`versions` must be an array of version snapshots.");
    else doc.versions.forEach((raw, i) => {
      const where = `versions[${i}]`;
      if (!isObj(raw)) { problems.push(`${where} must be an object.`); return; }
      if (raw.name !== undefined && typeof raw.name !== "string") problems.push(`${where}.name must be a string.`);
      validateBody(raw, `${where}.`, problems);
    });
  }
  return problems.slice(0, 40);
}

/** Validate the whole two-document file body. Views are checked structurally only. */
export function validateFlowFile(content: string): string[] {
  const { modelText, viewsText } = splitFlowFile(content);
  let doc: unknown;
  try { doc = modelText.trim() ? yaml.load(modelText) : {}; }
  catch (e) { return [`model YAML parse error: ${e instanceof Error ? e.message : String(e)}`]; }
  const problems = validateFlow(doc);

  if (viewsText.trim()) {
    let views: unknown;
    try { views = yaml.load(viewsText); }
    catch (e) { problems.push(`views YAML parse error: ${e instanceof Error ? e.message : String(e)}`); return problems.slice(0, 40); }
    if (!isObj(views)) problems.push("views doc must be a mapping with `active` and `views`.");
    else {
      const names = allDimensionNames(readFlow(isObj(doc) ? doc : {}));
      const known = new Set(names);
      if (views.views !== undefined && !Array.isArray(views.views)) problems.push("views.`views` must be an array.");
      else {
        const ids = new Set<string>();
        objects(views.views).forEach((v, i) => {
          const where = `views[${i}]`;
          if (typeof v.id !== "string" || !v.id.trim()) problems.push(`${where}.id is required.`);
          else ids.add(v.id);
          const layout = isObj(v.layout) ? v.layout : {};
          if (layout.params !== undefined) {
            if (!isObj(layout.params)) problems.push(`${where}.layout.params must be a mapping of dimension → value.`);
            else for (const dim of Object.keys(layout.params)) {
              if (!known.has(dim)) problems.push(`${where}.layout.params.${dim} is not a declared dimension.`);
            }
          }
        });
        const active = clean(views.active);
        if (active && ids.size && !ids.has(active)) problems.push(`views.\`active\` "${active}" does not match a view id.`);
      }
    }
  }
  return problems.slice(0, 40);
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export interface FlowVersionRef { name: string; index: number; isLatest: boolean; body: FlowDoc }

// Every authored key. A key missing here is silently DROPPED the first time a version is created,
// which is how a parameterised body would quietly lose its dimensions.
const BODY_KEYS = [
  "title", "description", "start_mode", "initial",
  "dimensions", "defaults", "derived", "screens", "entries",
] as const;

export function flowVersionRefs(doc: FlowDoc): FlowVersionRef[] {
  const older = Array.isArray(doc.versions) ? doc.versions : [];
  const refs = older.map((v, i) => ({
    name: clean(isObj(v) ? v.name : "") || `Version ${i + 1}`,
    index: i,
    isLatest: false,
    body: isObj(v) ? v : {},
  }));
  refs.push({ name: clean(doc.version_name) || `Version ${refs.length + 1}`, index: refs.length, isLatest: true, body: doc });
  return refs;
}

export function resolveFlowVersion(doc: FlowDoc, selector?: string | number | null): FlowVersionRef | null {
  const refs = flowVersionRefs(doc);
  if (selector === undefined || selector === null || selector === "") return refs[refs.length - 1];
  if (typeof selector === "number") return refs[selector - 1] ?? null;
  const value = selector.trim();
  return refs.find((r) => r.name === value)
    ?? refs.find((r) => r.name.toLowerCase() === value.toLowerCase())
    ?? (/^\d+$/.test(value) ? refs[Number(value) - 1] ?? null : null);
}

export function listFlowVersions(doc: FlowDoc): Array<{ name: string; index: number; is_latest: boolean; screen_count: number; edge_count: number }> {
  return flowVersionRefs(doc).map((r) => ({
    name: r.name,
    index: r.index + 1,
    is_latest: r.isLatest,
    screen_count: objects(r.body.screens).length,
    edge_count: objects(r.body.screens).reduce((n, s) => n + objects(s.edges).length, 0),
  }));
}

export function createFlowVersion(doc: FlowDoc, name?: string): string {
  if (!Array.isArray(doc.versions)) doc.versions = [];
  const versions = doc.versions as unknown[];
  const snapshot: Obj = { name: clean(doc.version_name) || `Version ${versions.length + 1}` };
  for (const key of BODY_KEYS) if (doc[key] !== undefined) snapshot[key] = clone(doc[key]);
  versions.push(snapshot);
  const created = clean(name) || `Version ${versions.length + 1}`;
  doc.version_name = created;
  return created;
}

export function renameFlowVersion(doc: FlowDoc, selector: string | number | null | undefined, name: string): boolean {
  const ref = resolveFlowVersion(doc, selector);
  if (!ref || !clean(name)) return false;
  if (ref.isLatest) doc.version_name = name.trim(); else ref.body.name = name.trim();
  return true;
}

export function deleteFlowVersion(doc: FlowDoc, selector: string | number | null | undefined): { ok: boolean; error?: string } {
  const refs = flowVersionRefs(doc);
  if (refs.length <= 1) return { ok: false, error: "cannot delete the only version" };
  const ref = resolveFlowVersion(doc, selector);
  if (!ref) return { ok: false, error: "version not found" };
  const versions = doc.versions as unknown[];
  if (ref.isLatest) {
    const promoted = versions.pop();
    const body = isObj(promoted) ? promoted : {};
    for (const key of BODY_KEYS) delete doc[key];
    for (const key of BODY_KEYS) if (body[key] !== undefined) doc[key] = body[key];
    doc.version_name = clean(body.name) || `Version ${versions.length + 1}`;
  } else {
    const index = versions.findIndex((v) => v === ref.body);
    if (index >= 0) versions.splice(index, 1);
  }
  if (versions.length === 0) { delete doc.versions; delete doc.version_name; }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

function mutableArray(body: FlowDoc, key: "screens" | "entries" | "derived" | "sources"): unknown[] {
  if (!Array.isArray(body[key])) body[key] = [];
  return body[key] as unknown[];
}

/** A screen's control list, created on demand. */
function screenEdges(screen: Obj): unknown[] {
  if (!Array.isArray(screen.edges)) screen.edges = [];
  return screen.edges as unknown[];
}

/** Every control in the document, paired with the screen that owns it. */
function allEdges(body: FlowDoc): Array<{ screen: Obj; edge: Obj }> {
  return objects(body.screens).flatMap((s) => objects(s.edges).map((edge) => ({ screen: s, edge })));
}

function findById(items: unknown[], id: string): Obj | null {
  return (items.find((v) => isObj(v) && asStr(v.id) === id) as Obj | undefined) ?? null;
}

function freshId(items: unknown[], prefix: string): string {
  const used = new Set(objects(items).map((v) => asStr(v.id)));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function setDimension(body: FlowDoc, name: string, values: DimValue[] | null): { ok: boolean; error?: string } {
  if (!clean(name)) return { ok: false, error: "dimension name cannot be blank" };
  if (!isObj(body.dimensions)) body.dimensions = {};
  const dims = body.dimensions as Obj;
  if (values === null) { delete dims[name]; if (!Object.keys(dims).length) delete body.dimensions; return { ok: true }; }
  if (!values.length) return { ok: false, error: "a dimension needs at least one value" };
  dims[name] = [...values];
  return { ok: true };
}

/**
 * Declare, redefine or remove one named source — a VERSION of the material file panels read from.
 *
 * Stored as an array rather than a mapping because the order is meaningful to a reader (drafts
 * before published, oldest to newest) and a YAML mapping's order is an accident of how it was
 * written. `readSources` accepts either.
 */
export function setSource(
  body: FlowDoc, name: string, spec: { path?: string; agent?: string | null; description?: string | null } | null,
): { ok: boolean; error?: string } {
  const key = clean(name);
  if (!key) return { ok: false, error: "a source needs a name" };
  const list = mutableArray(body, "sources");
  const index = list.findIndex((v) => isObj(v) && asStr(v.name) === key);
  if (spec === null) {
    if (index < 0) return { ok: false, error: `source not found: ${key}` };
    list.splice(index, 1);
    if (!list.length) delete body.sources;
    // A default pointing at a source that no longer exists would resolve every panel to the root.
    if (clean(body.default_source) === key) delete body.default_source;
    return { ok: true };
  }
  const entry: Obj = isObj(list[index]) ? (list[index] as Obj) : { name: key };
  if (spec.path !== undefined) { if (clean(spec.path)) entry.path = spec.path.trim(); else delete entry.path; }
  if (spec.agent !== undefined) { if (spec.agent) entry.agent = spec.agent; else delete entry.agent; }
  if (spec.description !== undefined) { if (spec.description) entry.description = spec.description; else delete entry.description; }
  if (index < 0) list.push(entry);
  return { ok: true };
}

/** Pick the source `file` panels use when they name none. Pass null to clear it. */
export function setDefaultSource(body: FlowDoc, name: string | null): { ok: boolean; error?: string } {
  if (name === null || !clean(name)) { delete body.default_source; return { ok: true }; }
  const key = clean(name);
  if (!readSources(body.sources).some((s) => s.name === key)) return { ok: false, error: `source not found: ${key}` };
  body.default_source = key;
  return { ok: true };
}

export function addScreen(body: FlowDoc, input: { title?: string; description?: string; screenshot?: string; content?: FlowPanel[]; initial?: boolean }): { ok: boolean; id?: string; error?: string } {
  const screens = mutableArray(body, "screens");
  const title = clean(input.title) || `Screen ${screens.length + 1}`;
  if (objects(screens).some((s) => asStr(s.title) === title)) return { ok: false, error: `a screen named "${title}" already exists; screen titles must be unique` };
  const id = freshId(screens, "sc");
  const screen: Obj = { id, title };
  if (input.content !== undefined) writePanels(screen, input.content);
  else if (clean(input.screenshot)) screen.screenshot = input.screenshot!.trim();
  if (input.description !== undefined) screen.description = input.description;
  screens.push(screen);
  if (input.initial) { body.initial = id; body.start_mode = "screen"; }
  return { ok: true, id };
}

export function updateScreen(body: FlowDoc, id: string, patch: { title?: string; description?: string; screenshot?: string; screenshots?: string[]; content?: FlowPanel[]; clearScreenshot?: boolean; makeInitial?: boolean }): { ok: boolean; error?: string } {
  const screens = mutableArray(body, "screens");
  const screen = findById(screens, id);
  if (!screen) return { ok: false, error: `screen not found: ${id}` };
  if (patch.title !== undefined) {
    const title = clean(patch.title);
    if (!title) return { ok: false, error: "screen title cannot be blank" };
    if (objects(screens).some((s) => asStr(s.id) !== id && asStr(s.title) === title)) return { ok: false, error: `a screen named "${title}" already exists; screen titles must be unique` };
    screen.title = title;
  }
  if (patch.description !== undefined) { if (patch.description) screen.description = patch.description; else delete screen.description; }
  if (patch.content !== undefined) writePanels(screen, patch.content);
  else if (patch.clearScreenshot) writePanels(screen, []);
  else if (patch.screenshots !== undefined) writeShots(screen, patch.screenshots);
  else if (patch.screenshot !== undefined) writeShots(screen, clean(patch.screenshot) ? [patch.screenshot.trim()] : []);
  if (patch.makeInitial) { body.initial = id; body.start_mode = "screen"; }
  return { ok: true };
}

/**
 * Write a whole panel list onto a screen or variant.
 *
 * Screenshot-only content is written back as `screenshot:`/`screenshots:` — 0 shots → neither
 * field, 1 → the scalar (small diffs), 2+ → the array. That is not legacy tolerance, it is the
 * canonical spelling for a state that is only images, and keeping it means adding this abstraction
 * rewrote no existing `.flow`.
 */
export function writePanels(target: Obj, panels: FlowPanel[]): void {
  const keys = panels.every((p) => p.kind === "screenshot" && !p.label)
    ? panels.map((p) => (p as { key: string }).key).filter(Boolean)
    : null;
  // A state that is ONE frame is written as `frame:` + `view:` — the frame-only shorthand, as
  // one image is written `screenshot:`.
  const soleFrame = panels.length === 1 && panels[0].kind === "frame" && !panels[0].label ? panels[0] : null;
  // Each branch ASSIGNS the field it keeps rather than deleting everything first, because deleting
  // a key and re-adding it moves it to the END of the mapping — so a rewrite that changed nothing
  // would still show up in the file's diff as a line that moved.
  if (soleFrame) {
    target.frame = soleFrame.path;
    if (soleFrame.view) target.view = soleFrame.view; else delete target.view;
    delete target.screenshot;
    delete target.screenshots;
    delete target.content;
  } else if (keys === null) {
    target.content = panels.map(dumpPanel);
    delete target.screenshot;
    delete target.screenshots;
    delete target.frame;
    delete target.view;
  } else if (keys.length === 1) {
    target.screenshot = keys[0];
    delete target.screenshots;
    delete target.content;
    delete target.frame;
    delete target.view;
  } else if (keys.length > 1) {
    target.screenshots = keys;
    delete target.screenshot;
    delete target.content;
    delete target.frame;
    delete target.view;
  } else {
    delete target.screenshot;
    delete target.screenshots;
    delete target.content;
    delete target.frame;
    delete target.view;
  }
}

/**
 * The state dialog's edit — its screenshots and its frame — merged over the panels the state
 * already had: file panels stay where they are, screenshot panels are replaced in order (as
 * `writeShots` does), the frame panel is replaced or removed, and a frame goes FIRST because it
 * is the screen; captures are evidence beside it.
 */
export function mergeStatePanels(existing: FlowPanel[], next: { screenshots: string[]; frame: { path: string; view: string | null } | null }): FlowPanel[] {
  const out: FlowPanel[] = [];
  const keys = next.screenshots.filter(Boolean);
  let i = 0;
  for (const p of existing) {
    if (p.kind === "frame") continue;
    if (p.kind !== "screenshot") { out.push(p); continue; }
    if (i < keys.length) out.push({ kind: "screenshot", key: keys[i++], label: p.label });
  }
  for (; i < keys.length; i++) out.push({ kind: "screenshot", key: keys[i], label: null });
  const path = next.frame?.path.trim();
  if (path) out.unshift({ kind: "frame", path, view: next.frame?.view?.trim() || null, label: framePanelOf(existing)?.label ?? null });
  return out;
}

/**
 * Replace only the SCREENSHOT panels, in place, leaving file panels where they are.
 *
 * The upload control adds an image to the state you are looking at; it has no opinion about a
 * `.brief` that state also shows. Rebuilding the list from the keys alone would delete it.
 */
export function writeShots(target: Obj, keys: string[]): void {
  const list = keys.filter(Boolean);
  const existing = readPanels(target);
  const out: FlowPanel[] = [];
  let i = 0;
  for (const p of existing) {
    if (p.kind !== "screenshot") { out.push(p); continue; }
    if (i < list.length) out.push({ kind: "screenshot", key: list[i++], label: p.label });
  }
  for (; i < list.length; i++) out.push({ kind: "screenshot", key: list[i], label: null });
  writePanels(target, out);
}

export function deleteScreen(body: FlowDoc, id: string): { ok: boolean; removedEdges: string[]; removedEntries: string[] } {
  const screens = mutableArray(body, "screens");
  const index = screens.findIndex((v) => isObj(v) && asStr(v.id) === id);
  if (index < 0) return { ok: false, removedEdges: [], removedEntries: [] };
  screens.splice(index, 1);

  // An edge that merely had ONE dispatch branch pointing here loses the branch, not the edge —
  // deleting the whole control because one of its outcomes went away would silently remove
  // navigation that is still valid under other parameters.
  const prune = (items: unknown[]): string[] => {
    const removed: string[] = [];
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const e = items[i];
      if (!isObj(e)) continue;
      if (Array.isArray(e.dispatch)) {
        e.dispatch = (e.dispatch as unknown[]).filter((b) => !(isObj(b) && asStr(b.to) === id));
        if (!(e.dispatch as unknown[]).length) { removed.unshift(asStr(e.id)); items.splice(i, 1); continue; }
      }
      // A `to` pointing at the removed screen kills the control. An EMPTY `to` does not: that is a
      // stay, which has nothing to do with the screen that just went away.
      if (asStr(e.to) === id) { removed.unshift(asStr(e.id)); items.splice(i, 1); }
    }
    return removed;
  };
  // The deleted screen's own controls went with it; what is left to prune is everyone else's.
  const removedEdges = objects(screens).flatMap((s) => prune(screenEdges(s)));
  const removedEntries = Array.isArray(body.entries) ? prune(body.entries as unknown[]) : [];
  if (clean(body.initial) === id) delete body.initial;
  return { ok: true, removedEdges, removedEntries };
}

export function addVariant(body: FlowDoc, screenId: string, input: { label: string; when?: When; screenshot?: string; screenshots?: string[]; content?: FlowPanel[]; description?: string; index?: number }): { ok: boolean; error?: string } {
  const screen = findById(mutableArray(body, "screens"), screenId);
  if (!screen) return { ok: false, error: `screen not found: ${screenId}` };
  if (!clean(input.label)) return { ok: false, error: "variant label cannot be blank" };
  if (!Array.isArray(screen.variants)) screen.variants = [];
  const variants = screen.variants as unknown[];
  const variant: Obj = { when: input.when ?? {}, label: input.label.trim() };
  if (input.description) variant.description = input.description;
  if (input.content !== undefined) writePanels(variant, input.content);
  else writeShots(variant, input.screenshots ?? (clean(input.screenshot) ? [input.screenshot!.trim()] : []));
  if (input.index !== undefined && input.index >= 0 && input.index < variants.length) variants.splice(input.index, 0, variant);
  else variants.push(variant);
  return { ok: true };
}

export function updateVariant(body: FlowDoc, screenId: string, index: number, patch: { label?: string; when?: When; screenshots?: string[]; content?: FlowPanel[]; description?: string }): { ok: boolean; error?: string } {
  const screen = findById(mutableArray(body, "screens"), screenId);
  if (!screen) return { ok: false, error: `screen not found: ${screenId}` };
  const variants = Array.isArray(screen.variants) ? (screen.variants as unknown[]) : [];
  const variant = variants[index];
  if (!isObj(variant)) return { ok: false, error: `variant ${index} not found on screen ${screenId}` };
  if (patch.label !== undefined) { if (!clean(patch.label)) return { ok: false, error: "variant label cannot be blank" }; variant.label = patch.label.trim(); }
  if (patch.when !== undefined) variant.when = patch.when;
  if (patch.description !== undefined) { if (patch.description) variant.description = patch.description; else delete variant.description; }
  if (patch.content !== undefined) writePanels(variant, patch.content);
  else if (patch.screenshots !== undefined) writeShots(variant, patch.screenshots);
  return { ok: true };
}

export function deleteVariant(body: FlowDoc, screenId: string, index: number): boolean {
  const screen = findById(mutableArray(body, "screens"), screenId);
  if (!screen || !Array.isArray(screen.variants)) return false;
  const variants = screen.variants as unknown[];
  if (index < 0 || index >= variants.length) return false;
  variants.splice(index, 1);
  if (!variants.length) delete screen.variants;
  return true;
}

/**
 * Declares, redefines or removes one of a screen's own variables.
 *
 * Removing a local that a `when` still reads is caught by the validator, not here — the mutation
 * layer's job is to make the edit, and the validator's is to refuse to save a broken file.
 */
export function setScreenLocal(body: FlowDoc, screenId: string, name: string, values: DimValue[] | null): { ok: boolean; error?: string } {
  const screen = findById(mutableArray(body, "screens"), screenId);
  if (!screen) return { ok: false, error: `screen not found: ${screenId}` };
  if (!clean(name)) return { ok: false, error: "local name cannot be blank" };
  if (isObj(body.dimensions) && name in (body.dimensions as Obj)) {
    return { ok: false, error: `"${name}" is already a global dimension — a name cannot mean two things` };
  }
  if (!isObj(screen.locals)) screen.locals = {};
  const locals = screen.locals as Obj;
  if (values === null) {
    delete locals[name];
    if (isObj(screen.local_defaults)) delete (screen.local_defaults as Obj)[name];
    if (!Object.keys(locals).length) delete screen.locals;
    return { ok: true };
  }
  if (!values.length) return { ok: false, error: "a local needs at least one value" };
  locals[name] = [...values];
  return { ok: true };
}

/**
 * Two controls may share a label on one screen when their `when`s tell them apart. Only an exact
 * repeat — same label, same condition — is a conflict, because then one of them is unpressable.
 */
function edgeConflict(screen: Obj, event: string, when: When | undefined, exceptId?: string): boolean {
  const key = JSON.stringify(when ?? {});
  return objects(screen.edges).some((e) =>
    asStr(e.id) !== exceptId && asStr(e.event) === event && JSON.stringify(e.when ?? {}) === key);
}

export interface EdgeInput {
  event: string;
  /** The screen this control lives on. */
  from: string;
  when?: When;
  /** Omit (or pass "") for a control that STAYS on this screen and only changes its state. */
  to?: string;
  dispatch?: Array<{ when?: When; to?: string; sets?: Assignment }>;
  sets?: Assignment;
  description?: string;
}

export function addEdge(body: FlowDoc, input: EdgeInput): { ok: boolean; id?: string; error?: string } {
  const screens = mutableArray(body, "screens");
  const screenIds = new Set(objects(screens).map((s) => asStr(s.id)));
  if (!clean(input.event)) return { ok: false, error: "event cannot be blank" };
  const screen = findById(screens, input.from);
  if (!screen) return { ok: false, error: `screen not found: ${input.from}` };
  const hasTo = !!clean(input.to);
  const hasDispatch = !!input.dispatch?.length;
  if (hasTo && hasDispatch) return { ok: false, error: "an edge takes `to` (one destination) or `dispatch` (parameter branches), not both" };
  if (hasTo && !screenIds.has(input.to!)) return { ok: false, error: `to screen not found: ${input.to}` };
  for (const b of input.dispatch ?? []) if (clean(b.to) && !screenIds.has(b.to!)) return { ok: false, error: `dispatch target not found: ${b.to}` };
  if (edgeConflict(screen, input.event, input.when)) {
    return { ok: false, error: `"${input.event}" already exists on this screen with the same condition — give them different \`when\`s, or branch one with \`dispatch\`` };
  }
  const edges = screenEdges(screen);
  const id = freshId(allEdges(body).map((x) => x.edge), "e");
  const edge: Obj = { id, event: input.event };
  if (input.when !== undefined && input.when !== "*" && Object.keys(input.when).length) edge.when = input.when;
  if (hasTo) edge.to = input.to!.trim();
  else if (hasDispatch) {
    edge.dispatch = (input.dispatch ?? []).map((b) => ({
      when: b.when ?? {},
      ...(clean(b.to) ? { to: b.to!.trim() } : {}),
      ...(b.sets && Object.keys(b.sets).length ? { sets: b.sets } : {}),
    }));
  }
  if (input.sets && Object.keys(input.sets).length) edge.sets = input.sets;
  if (clean(input.description)) edge.description = input.description!.trim();
  edges.push(edge);
  return { ok: true, id };
}

export function updateEdge(body: FlowDoc, id: string, patch: {
  event?: string; from?: string; when?: When; to?: string;
  dispatch?: Array<{ when?: When; to?: string; sets?: Assignment }>; sets?: Assignment;
  description?: string;
}): { ok: boolean; error?: string } {
  const screens = mutableArray(body, "screens");
  const found = allEdges(body).find((x) => asStr(x.edge.id) === id);
  if (!found) return { ok: false, error: `edge not found: ${id}` };
  const screenIds = new Set(objects(screens).map((s) => asStr(s.id)));
  const edge = found.edge;
  const event = patch.event ?? asStr(edge.event);
  if (!clean(event)) return { ok: false, error: "event cannot be blank" };

  // Moving a control to another screen is a move between two `edges` arrays, not a field write.
  let owner = found.screen;
  if (patch.from !== undefined && patch.from !== asStr(owner.id)) {
    const next = findById(screens, patch.from);
    if (!next) return { ok: false, error: `screen not found: ${patch.from}` };
    const from = screenEdges(owner);
    from.splice(from.indexOf(edge), 1);
    screenEdges(next).push(edge);
    owner = next;
  }
  const when = patch.when ?? (edge.when as When | undefined);
  if (edgeConflict(owner, event, when, id)) {
    return { ok: false, error: `"${event}" already exists on that screen with the same condition` };
  }

  if (patch.when !== undefined) {
    if (patch.when === "*" || !Object.keys(patch.when).length) delete edge.when; else edge.when = patch.when;
  }
  if (patch.dispatch !== undefined) {
    for (const b of patch.dispatch) if (clean(b.to) && !screenIds.has(b.to!)) return { ok: false, error: `dispatch target not found: ${b.to}` };
    if (patch.dispatch.length) {
      edge.dispatch = patch.dispatch.map((b) => ({
        when: b.when ?? {},
        ...(clean(b.to) ? { to: b.to!.trim() } : {}),
        ...(b.sets && Object.keys(b.sets).length ? { sets: b.sets } : {}),
      }));
    } else delete edge.dispatch;
    delete edge.to;
  } else if (patch.to !== undefined) {
    // "" is meaningful here: it converts the control into one that stays and only changes state.
    if (clean(patch.to) && !screenIds.has(patch.to)) return { ok: false, error: `to screen not found: ${patch.to}` };
    if (clean(patch.to)) edge.to = patch.to.trim(); else delete edge.to;
    delete edge.dispatch;
  }
  if (patch.sets !== undefined) { if (Object.keys(patch.sets).length) edge.sets = patch.sets; else delete edge.sets; }
  if (patch.description !== undefined) { if (clean(patch.description)) edge.description = patch.description.trim(); else delete edge.description; }
  edge.event = event;
  delete edge.from;
  return { ok: true };
}

export function deleteEdge(body: FlowDoc, id: string): boolean {
  for (const screen of objects(body.screens)) {
    const edges = screenEdges(screen);
    const index = edges.findIndex((v) => isObj(v) && asStr(v.id) === id);
    if (index >= 0) { edges.splice(index, 1); if (!edges.length) delete screen.edges; return true; }
  }
  return false;
}

export function addEntry(body: FlowDoc, input: Omit<EdgeInput, "from">): { ok: boolean; id?: string; error?: string } {
  const screenIds = new Set(objects(body.screens).map((s) => asStr(s.id)));
  if (!clean(input.event)) return { ok: false, error: "event cannot be blank" };
  const hasTo = !!clean(input.to);
  const hasDispatch = !!input.dispatch?.length;
  if (hasTo === hasDispatch) return { ok: false, error: "an entry needs exactly one of `to` or `dispatch`" };
  if (hasTo && !screenIds.has(input.to!)) return { ok: false, error: `to screen not found: ${input.to}` };
  // An entry, unlike a control, cannot STAY — there is no screen yet to stay on.
  for (const b of input.dispatch ?? []) {
    if (!clean(b.to)) return { ok: false, error: "a start event's branches each need a `to`" };
    if (!screenIds.has(b.to!)) return { ok: false, error: `dispatch target not found: ${b.to}` };
  }
  if (objects(body.entries).some((e) => asStr(e.event) === input.event)) return { ok: false, error: `start event "${input.event}" already exists` };
  const entries = mutableArray(body, "entries");
  const id = freshId(entries, "en");
  const entry: Obj = { id, event: input.event };
  if (hasTo) entry.to = input.to!.trim();
  else entry.dispatch = (input.dispatch ?? []).map((b) => ({ when: b.when ?? {}, to: b.to, ...(b.sets && Object.keys(b.sets).length ? { sets: b.sets } : {}) }));
  if (input.sets && Object.keys(input.sets).length) entry.sets = input.sets;
  entries.push(entry);
  body.start_mode = "entries";
  return { ok: true, id };
}

export function deleteEntry(body: FlowDoc, id: string): boolean {
  if (!Array.isArray(body.entries)) return false;
  const index = body.entries.findIndex((v) => isObj(v) && asStr(v.id) === id);
  if (index < 0) return false;
  body.entries.splice(index, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Coverage — the payoff for declaring the parameter space
// ---------------------------------------------------------------------------

export interface FlowCoverage {
  ok: true;
  /** Screens no parameter combination can reach. */
  unreachableScreens: Array<{ id: string; title: string }>;
  /** Edges no parameter combination traverses. */
  unreachableEdges: Array<{ id: string; event: string; from: string }>;
  /** Dispatch branches no combination selects — usually a `when` that cannot hold. */
  deadBranches: Array<{ edge: string; branch: number; to: string }>;
  /**
   * Variants no reachable configuration selects. Usually one of two things: a `when` shadowed by
   * an earlier variant, or a variant guarded on a parameter that the path to that screen always
   * pins — a rendering you have authored and screenshotted that nobody can ever see.
   */
  deadVariants: Array<{ screen: string; title: string; index: number; label: string }>;
  /** Dimensions where no value changes anything — declared but doing no work. */
  noEffectDimensions: string[];
  /**
   * Values of one dimension that always resolve identically. INFORMATION, not a fault: REQ-017's
   * "a price-on-request listing renders exactly like no SYI attribute" is precisely this, and
   * seeing it confirmed is the point. It only reads as a smell when you did not intend it.
   */
  indistinguishableValues: Array<{ dimension: string; values: DimValue[] }>;
  /** Screens with variants that leave some reachable configuration unrendered. */
  uncoveredScreens: Array<{ id: string; title: string; missing: number }>;
  /** How many assignments were enumerated (capped). */
  combinations: number;
  truncated: boolean;
}

const MAX_COMBINATIONS = 20000;

/** Every combination of the declared dimensions, capped so a wide space cannot hang the caller. */
export function enumerateAssignments(body: FlowBody): { rows: Assignment[]; truncated: boolean } {
  let rows: Assignment[] = [{ ...body.defaults }];
  let truncated = false;
  for (const dim of body.dimensionOrder) {
    const values = body.dimensions[dim] ?? [];
    if (!values.length) continue;
    const next: Assignment[] = [];
    for (const row of rows) {
      for (const v of values) {
        if (next.length >= MAX_COMBINATIONS) { truncated = true; break; }
        next.push({ ...row, [dim]: v });
      }
      if (truncated) break;
    }
    rows = next;
  }
  return { rows: rows.map((r) => applyDerived(r, body)), truncated };
}

/**
 * Every state ONE screen can be in: the global combinations crossed with its own locals.
 *
 * A screen's locals are invisible to `enumerateAssignments`, which is right — they do not exist
 * anywhere else in the model. But a question asked ABOUT a screen ("which parameters render this
 * state?") has to range over them, or a state guarded on a local looks unreachable.
 */
export function enumerateForScreen(body: FlowBody, screen: FlowScreen): Assignment[] {
  const { rows } = enumerateAssignments(body);
  let locals: Assignment[] = [{}];
  for (const name of screen.localOrder) {
    const values = screen.locals[name] ?? [];
    if (!values.length) continue;
    locals = locals.flatMap((l) => values.map((v) => ({ ...l, [name]: v })));
    if (locals.length >= MAX_COMBINATIONS) break;
  }
  const out: Assignment[] = [];
  for (const row of rows) {
    for (const l of locals) {
      if (out.length >= MAX_COMBINATIONS) return out;
      out.push(applyDerived({ ...row, ...l }, body));
    }
  }
  return out;
}

export function coverFlow(doc: FlowDoc, version?: string | number | null): FlowCoverage | { ok: false; error: string } {
  const ref = resolveFlowVersion(doc, version);
  if (!ref) return { ok: false, error: `version not found: ${version}` };
  const body = readFlow(ref.body);
  const { rows, truncated } = enumerateAssignments(body);

  const seenScreens = new Set<string>();
  const seenEdges = new Set<string>();
  const seenBranches = new Set<string>();
  const seenVariants = new Set<string>();
  // Per screen, the reachable assignments that no variant renders.
  const missingByScreen = new Map<string, number>();

  for (const params of rows) {
    const reach = reachFlow(body, params);
    for (const id of reach.screens) seenScreens.add(id);
    for (const id of reach.edges) seenEdges.add(id);
    for (const e of [...body.edges, ...body.entries]) {
      if (!reach.edges.has(e.id)) continue;
      // EVERY assignment the source screen is reached with, not just the first. A branch guarded
      // on something a LATER edge sets — "the seller has now picked Decline" — is only ever
      // selected on a second or third arrival, so checking the first arrival alone reported live
      // branches as dead. An entry has no source screen; it fires from the start assignment.
      const froms = "from" in e ? (reach.arrivals.get((e as FlowEdge).from) ?? [params]) : [params];
      for (const a of froms) {
        const res = resolveEdge(e, a);
        if (res.branch >= 0) seenBranches.add(`${e.id}\u0000${res.branch}`);
      }
    }
    for (const s of body.screens) {
      if (!reach.screens.has(s.id) || !s.variants.length) continue;
      for (const a of reach.arrivals.get(s.id) ?? [params]) {
        const hit = s.variants.findIndex((v) => matchWhen(v.when, a));
        if (hit < 0) missingByScreen.set(s.id, (missingByScreen.get(s.id) ?? 0) + 1);
        else seenVariants.add(`${s.id} ${hit}`);
      }
    }
  }

  const deadVariants: FlowCoverage["deadVariants"] = [];
  for (const s of body.screens) {
    s.variants.forEach((v, i) => {
      if (!seenVariants.has(`${s.id} ${i}`)) deadVariants.push({ screen: s.id, title: s.title, index: i, label: v.label });
    });
  }

  const deadBranches: FlowCoverage["deadBranches"] = [];
  for (const e of [...body.edges, ...body.entries]) {
    e.dispatch.forEach((b, i) => {
      if (!seenBranches.has(`${e.id}\u0000${i}`)) deadBranches.push({ edge: e.id, branch: i, to: b.to });
    });
  }

  // Whether a value matters is a question about OUTCOMES, not about syntax. A first attempt here
  // scanned the `when` clauses and called any value it did not find "unused" — which wrongly
  // condemned every value reached only through a `"*"` else-branch (in the seller flow: the flag
  // being ON, and a price-on-request listing, both of which fall through by design). So compare
  // resolutions instead: hold every other dimension fixed, vary this one, and see what moves.
  const signature = (a: Assignment): string => {
    const reach = reachFlow(body, a);
    const parts: string[] = [];
    for (const s of body.screens) {
      if (!reach.screens.has(s.id)) continue;
      const labels = (reach.arrivals.get(s.id) ?? [a]).map((at) => resolveVariant(s, at)?.label ?? "");
      parts.push(`${s.id}=${[...new Set(labels)].sort().join("/")}`);
    }
    for (const e of body.edges) {
      if (!reach.edges.has(e.id)) continue;
      const tos = (reach.arrivals.get(e.from) ?? [a]).map((at) => resolveEdge(e, at).to ?? "");
      parts.push(`${e.id}>${[...new Set(tos)].sort().join("/")}`);
    }
    return parts.sort().join("|");
  };

  const noEffectDimensions: string[] = [];
  const indistinguishableValues: FlowCoverage["indistinguishableValues"] = [];
  const journeySet = new Set(journeyDimensions(body));
  for (const dim of body.dimensionOrder) {
    const values = body.dimensions[dim] ?? [];
    if (values.length < 2) continue;
    // Skipped, not reported: the walk assigns this one, so of course its STARTING value is inert.
    if (journeySet.has(dim)) continue;
    // Group the enumerated rows by every OTHER dimension, so within a group the only thing that
    // differs is this dimension's value. Differing signatures there prove it does work.
    const groups = new Map<string, Map<string, string>>();
    for (const row of rows) {
      const others = body.dimensionOrder.filter((d) => d !== dim).map((d) => `${d}=${String(row[d])}`).join(",");
      const bucket = groups.get(others) ?? new Map<string, string>();
      bucket.set(String(row[dim]), signature(row));
      groups.set(others, bucket);
    }
    let anyEffect = false;
    // Two values are indistinguishable only if they agree in EVERY group, so intersect as we go.
    const peersOf = new Map<string, Set<string>>();
    for (const bucket of groups.values()) {
      if (new Set(bucket.values()).size > 1) anyEffect = true;
      for (const [va, sa] of bucket) {
        const peers = new Set<string>();
        for (const [vb, sb] of bucket) if (vb !== va && sb === sa) peers.add(vb);
        const prior = peersOf.get(va);
        peersOf.set(va, prior ? new Set([...prior].filter((x) => peers.has(x))) : peers);
      }
    }
    if (!anyEffect) { noEffectDimensions.push(dim); continue; }
    const reported = new Set<string>();
    for (const v of values) {
      const key = String(v);
      if (reported.has(key)) continue;
      const peers = peersOf.get(key);
      if (!peers?.size) continue;
      const group = [key, ...peers];
      for (const g of group) reported.add(g);
      indistinguishableValues.push({ dimension: dim, values: values.filter((x) => group.includes(String(x))) });
    }
  }

  return {
    ok: true,
    unreachableScreens: body.screens.filter((s) => !seenScreens.has(s.id)).map((s) => ({ id: s.id, title: s.title })),
    unreachableEdges: body.edges.filter((e) => !seenEdges.has(e.id)).map((e) => ({ id: e.id, event: e.event, from: e.from })),
    deadBranches,
    deadVariants,
    noEffectDimensions,
    indistinguishableValues,
    uncoveredScreens: [...missingByScreen.entries()].map(([id, missing]) => ({
      id, title: body.screens.find((s) => s.id === id)?.title ?? id, missing,
    })),
    combinations: rows.length,
    truncated,
  };
}

// ---------------------------------------------------------------------------
// "Which parameters actually matter here?"
// ---------------------------------------------------------------------------

/** Every dimension a condition reads. For a list, the UNION across alternatives. */
const whenDims = (w: When): string[] => {
  if (w === "*") return [];
  if (Array.isArray(w)) return [...new Set(w.flatMap(whenDims))];
  return isObj(w) ? Object.keys(w) : [];
};

/**
 * The dimensions a DERIVED value reads, transitively.
 *
 * A screen's variants usually key on a derived value (`syiShipping`) rather than the raw inputs,
 * so asking "what can I change to make this screen render differently" has to walk back through
 * the derivation — otherwise a screen page offers the reader a value they cannot set.
 */
export function derivedDependencies(name: string, body: FlowBody, seen = new Set<string>()): string[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const rule = body.derived.find((d) => d.name === name);
  if (!rule) return [];
  const out: string[] = [];
  for (const r of rule.rules) {
    for (const d of whenDims(r.when)) {
      out.push(d);
      if (body.derived.some((x) => x.name === d)) out.push(...derivedDependencies(d, body, seen));
    }
    // `value: "= otherDim"` is a read too.
    if (typeof r.value === "string" && r.value.startsWith("=")) {
      const src = r.value.slice(1).trim();
      out.push(src);
      if (body.derived.some((x) => x.name === src)) out.push(...derivedDependencies(src, body, seen));
    }
  }
  return [...new Set(out)];
}

export interface ScreenParams {
  /** Derived values this screen's variants key on, in declaration order. */
  derived: string[];
  /** Raw GLOBAL dimensions the reader can set to change this screen. */
  base: string[];
  /** Of `base`, the ones an edge assigns — settable here, but read-only in the player. */
  journey: string[];
  /** This screen's OWN variables, in declaration order. Always relevant: it declared them. */
  locals: string[];
  /** Declared global dimensions that cannot change anything about this screen. */
  irrelevant: string[];
}

/**
 * Split the parameter space by whether it affects ONE screen.
 *
 * A screen page that showed every dimension would be the same undifferentiated wall as the whole
 * model; the useful question is narrower — "of everything declared, what changes THIS screen?".
 * Edges leaving the screen count too, because a control appearing or disappearing is a change to
 * the screen just as much as a different screenshot is.
 */
export function screenParams(screen: FlowScreen, body: FlowBody): ScreenParams {
  const derived: string[] = [];
  const direct = new Set<string>();
  for (const v of screen.variants) for (const d of whenDims(v.when)) direct.add(d);
  for (const e of screen.edges) {
    // An edge's own `when` counts as much as a branch's: a control that appears or disappears is
    // a change to the screen exactly as much as a different screenshot is.
    for (const d of whenDims(e.when)) direct.add(d);
    for (const b of e.dispatch) for (const d of whenDims(b.when)) direct.add(d);
  }
  const base = new Set<string>();
  for (const d of direct) {
    if (body.derived.some((x) => x.name === d)) {
      derived.push(d);
      for (const dep of derivedDependencies(d, body)) {
        if (!body.derived.some((x) => x.name === dep)) base.add(dep);
      }
    } else base.add(d);
  }
  const ordered = body.dimensionOrder.filter((d) => base.has(d));
  const journey = new Set(journeyDimensions(body));
  return {
    derived: body.derived.map((d) => d.name).filter((n) => derived.includes(n)),
    base: ordered,
    journey: ordered.filter((d) => journey.has(d)),
    locals: screen.localOrder,
    irrelevant: body.dimensionOrder.filter((d) => !base.has(d)),
  };
}

/**
 * Every distinct rendering of a screen: its variants, plus the fallback when it has none.
 *
 * `panels` is what the state SHOWS (see `FlowPanel`); `shots` is the screenshot subset, kept
 * because the capture-oriented surfaces — the missing-screenshot list, the diff's "did the pixels
 * change" test — ask about images specifically and a `.brief` panel is not a missing image.
 */
export function screenRenderings(screen: FlowScreen): Array<{ label: string; when: When; panels: FlowPanel[]; shots: string[]; description: string | null }> {
  const withShots = (label: string, when: When, panels: FlowPanel[], description: string | null) => ({
    label, when, panels, description,
    shots: panels.flatMap((p) => (p.kind === "screenshot" ? [p.key] : [])),
  });
  if (!screen.variants.length) return [withShots("Default", "*", screen.content, screen.description)];
  return screen.variants.map((v) => withShots(v.label, v.when, v.content.length ? v.content : screen.content, v.description));
}

/**
 * The smallest parameter change that makes a screen render a chosen variant, or null when no
 * assignment can. Powers "click a variant, see the parameters that produce it" — the inverse of
 * "set parameters, see the variant", which is the direction you actually think in when reviewing.
 */
export function assignmentForVariant(
  screen: FlowScreen, variantIndex: number, body: FlowBody, from: Assignment,
): Assignment | null {
  const rows = enumerateForScreen(body, screen);
  const knobs = [...body.dimensionOrder, ...screen.localOrder];
  let best: Assignment | null = null;
  let bestDistance = Infinity;
  for (const row of rows) {
    const hit = screen.variants.findIndex((v) => matchWhen(v.when, row));
    if (hit !== variantIndex) continue;
    let distance = 0;
    for (const d of knobs) if (row[d] !== from[d]) distance += 1;
    if (distance < bestDistance) { bestDistance = distance; best = row; }
  }
  if (!best) return null;
  // Return the SMALLEST pin set that selects this state: the globals that can change THIS screen,
  // plus its own locals. Returning the whole row pinned dimensions the screen does not care about,
  // and those extra pins used to tie the arrival scoring — clicking a state could score equally
  // against an arrival rendering a different one, and the earliest won. Fewer pins, no ties.
  const relevant = new Set(screenParams(screen, body).base);
  const out: Assignment = {};
  for (const d of body.dimensionOrder) if (relevant.has(d)) out[d] = best[d];
  for (const d of screen.localOrder) out[d] = best[d];
  return out;
}

/**
 * Dimensions that some edge ASSIGNS as it is traversed.
 *
 * These are the parameters you arrive at a screen with rather than ones you choose up front —
 * which radio the seller picked, what the conversation has become. The distinction matters to the
 * surfaces: a screen PAGE should let you set them, because seeing every state of a screen is the
 * point of that page; a PLAYER must not, because there the answer is "whatever the journey made
 * true", and letting the reader override it would show a state they did not navigate to.
 */
export function journeyDimensions(body: FlowBody): string[] {
  const out = new Set<string>();
  for (const e of [...body.edges, ...body.entries]) {
    for (const k of Object.keys(e.sets)) out.add(k);
    for (const b of e.dispatch) for (const k of Object.keys(b.sets)) out.add(k);
  }
  return body.dimensionOrder.filter((d) => out.has(d));
}
