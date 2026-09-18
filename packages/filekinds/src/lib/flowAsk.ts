/**
 * ASKING a flow to change — the live-edit vocabulary behind Flow Studio's Ask
 * panel. The user stands on a screen, looking at one of its states, and
 * types one line: "add a Payment failed screen after Checkout", "make this
 * state show the Loading view of login.frame", "add a Retry control that
 * comes back here".
 *
 * The model reads the flow's MODEL half (its own YAML; the views half — what
 * the reader was looking at — stays out), the target, and the frames beside
 * the flow with their views, and answers with OPS from a closed vocabulary.
 * `applyFlowOps` runs them through the SAME mutators the dialogs use
 * (`flowOps`), on a clone, and re-serialises only the model half, so the
 * views survive every turn and nothing a model says can produce a shape the
 * studio could not. Refusals from the mutators (a duplicate title, an unknown
 * screen) become skipped lines the panel shows, never throws.
 *
 * Screens are referred to by id OR title, states by label OR 1-based index,
 * controls by id OR event label — the words a person uses. Conditions and
 * assignments are TEXT ("flag: true; type: a|b"), the grammar the file has.
 */
import {
  type Assignment, type DimValue, type FlowBody, type FlowDoc, type FlowPanel, type FlowScreen, type When,
  addEdge, addScreen, addVariant, deleteEdge, deleteScreen, deleteVariant, dumpFlow, framePanelOf, mergeStatePanels,
  panelsOf, readFlow, setDimension, setScreenLocal, shotsOf, splitFlowFile, updateEdge, updateScreen, updateVariant,
} from "./flowOps";
import { parseFlowFile, withModel } from "./flowEngine";
import { parseFrameObject } from "./frameDoc";

export const FLOW_ASK_OPS = [
  "add_screen", "update_screen", "remove_screen",
  "add_state", "update_state", "remove_state",
  "add_control", "update_control", "remove_control",
  "set_dimension", "remove_dimension", "set_local", "remove_local",
  "set_initial", "set_title",
] as const;
export type FlowAskOpName = (typeof FLOW_ASK_OPS)[number];

/** One edit as the model emits it. Which fields matter depends on the op (see `flowAskSystem`). */
export interface FlowOp {
  op: FlowAskOpName;
  /** A screen: its id or title (or a handle from an earlier `as` in this reply). */
  screen?: string;
  /** A state of that screen: its label, or its 1-based index. */
  state?: string;
  /** A control: its id, or its event label on the screen. */
  control?: string;
  title?: string;
  label?: string;
  description?: string;
  event?: string;
  /** Where a control leads: a screen; "" = it stays on its screen. */
  to?: string;
  /** "dim: value; other: a|b" — value = equals, a|b = one of, !x = not; "*" or "" = always. */
  when?: string;
  /** "dim: value; ..." — applied on traversal. */
  sets?: string;
  /** "when -> screen; * -> screen" — destination by parameters, first match wins. */
  dispatch?: string;
  /** What a state shows: a .frame beside the flow, at one of its views. "" removes the frame. */
  frame?: string;
  view?: string;
  screenshot?: string;
  /** For dimensions and locals. */
  name?: string;
  /** "a|b|c". */
  values?: string;
  default?: string;
  initial?: boolean;
  /** A handle for a screen or control this reply creates, for later ops in the same reply. */
  as?: string;
}

export interface FlowAskReply {
  say: string;
  ops: FlowOp[];
}

const STRING_FIELDS = [
  "screen", "state", "control", "title", "label", "description", "event", "to", "when", "sets", "dispatch",
  "frame", "view", "screenshot", "name", "values", "default", "as",
] as const;

/** The JSON schema a reply must satisfy — plain enough for every validator. */
export const FLOW_ASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["say", "ops"],
  properties: {
    say: { type: "string", description: "One short sentence: what changed, or the one question to ask (then ops is empty)." },
    ops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op"],
        properties: {
          op: { type: "string", enum: [...FLOW_ASK_OPS] },
          ...Object.fromEntries(STRING_FIELDS.map((k) => [k, { type: "string" }])),
          initial: { type: "boolean" },
        },
      },
    },
  },
} as const;

/** What the model is told once — stable text: the file, the ops, the grammar, the rules. */
export function flowAskSystem(): string {
  return `You are the editing hand inside Flow Studio. The user is authoring ONE walkthrough (a .flow file) and gives you short instructions, often live in front of other people. Answer ONLY through the schema: "say" is one short sentence, under twelve words (what you changed, or the single question you need answered), "ops" is the list of edits.

THE FILE (its model half; you never touch the views half)
- dimensions: closed value sets about the world that outlive a screen (a feature flag, what the listing is). defaults: the starting assignment. derived: computed dimensions — leave them alone.
- screens: each {id, title, description, locals, variants, edges}. locals = the screen's OWN variables (which tab is open, which step you are on); they reset every time you arrive. A screen that looks different under different data is ONE screen with STATES, never several screens.
- variants = the STATES of a screen: first match wins by \`when\`; the LAST one should be the catch-all (when "*"). What a state SHOWS is a frame — a .frame file beside the flow, drawn live at one of its views (the states of a screen usually point at different views of the SAME frame: Base, Loading, Error) — or screenshots.
- edges = the CONTROLS on a screen: {id, event, when, to, sets, dispatch, description}. when = offered only when it holds. to = the screen it leads to; omitted = it STAYS and \`sets\` moves the screen to another of its own states. dispatch = the destination depends on the parameters, first match wins.
- frames: whole frames kept INSIDE this flow, by name. A state shows one with its bare name (frame: login); a file beside the flow with its file name (frame: login.frame).
- initial: the screen the walk starts on.

THE OPS — one edit each, applied in order:
- add_screen {title, description, frame, view, screenshot, initial, as}: a new screen. frame + view = what it shows. as = a handle so later ops in THIS reply can lead to it.
- update_screen {screen, title, description, frame, view, initial}: only the fields that change. frame "" removes the frame; view alone changes the view of the frame it already shows.
- remove_screen {screen}: the screen and every control leading to it.
- add_state {screen, label, when, frame, view, screenshot, description}: a new state of a screen, placed before its catch-all. when "*" or omitted = a catch-all.
- update_state {screen, state, label, when, frame, view, description}. remove_state {screen, state}.
- add_control {screen, event, to, when, sets, dispatch, description, as}: a control ON that screen. Give to (a screen) OR dispatch, or neither to stay.
- update_control {control, screen, event, to, when, sets, dispatch, description}: control = its id or its event label; screen narrows which screen's control. to "" makes it stay. remove_control {control, screen}.
- set_dimension {name, values, default}: values "a|b|c". remove_dimension {name}. set_local {screen, name, values}, remove_local {screen, name}: a screen's own variable.
- set_initial {screen}. set_title {title, description}.

THE GRAMMAR of when / sets / dispatch — plain text, not objects:
- when: "dim: value; other: a|b" — value = equals, a|b = one of, !x = not that value, "*" or empty = always.
- sets: "dim: value; other: value" — values as text: true, false, 3, free_shipping.
- dispatch: "flag: false -> home; type: paid -> checkout; * -> home" — each branch is a when, an arrow, a screen ("" after the arrow = stays).

RULES
- Refer to screens by their id or exact title, to states by label or 1-based index, to controls by id or event label. Screens this reply creates are referred to by the handle you gave (as); never guess an id.
- Only the frames listed under FRAMES exist; use their exact paths and view names. Different states of a screen should point at different views of the same frame.
- Make the smallest change that does what was asked; leave everything not mentioned alone. Keep a reply under about 20 ops.
- A screen needs a catch-all state last; a control that "goes back" leads to the screen it came from.
- Act when the instruction can be applied sensibly. Ask (say + empty ops) only when it cannot.`;
}

export interface FlowAskTarget {
  screenId: string | null;
  /** The state on screen (index into the screen's variants); null = the screen's own rendering. */
  stateIndex: number | null;
}

export interface FlowAskFrame {
  /** Relative to the flow's folder. */
  path: string;
  views: { id: string; name: string }[];
}

export interface FlowAskTurn {
  instruction: string;
  say: string;
  result?: string;
}

/** What the model is told per turn: the target, the frames beside the flow, recent turns, the model half, the instruction. */
export function flowAskUser(content: string, target: FlowAskTarget, instruction: string, history: FlowAskTurn[] = [], frames: FlowAskFrame[] = []): string {
  const { body, doc } = parseFlowFile(content);
  const screen = target.screenId ? body.screens.find((s) => s.id === target.screenId) : undefined;
  const state = screen && target.stateIndex !== null ? screen.variants[target.stateIndex] : undefined;
  const lines = [
    `TARGET screen: ${screen ? `${screen.title} (${screen.id})` : "none — the whole flow"}`,
    `TARGET state: ${state ? `${state.label} (#${(target.stateIndex ?? 0) + 1})` : screen ? "the screen itself" : "none"}`,
  ];
  // Frames inside the flow first, by name; files beside it after (a name wins over a file).
  const inline = Object.entries(body.frames).map(([name, raw]) => ({ path: name, views: parseFrameObject(raw).views.map((v) => ({ id: v.id, name: v.name })), inline: true }));
  const all = [...inline, ...frames.filter((f) => !body.frames[f.path]).map((f) => ({ ...f, inline: false }))];
  lines.push("FRAMES this flow can show" + (all.length ? "" : ": none"));
  for (const f of all) lines.push(`- ${f.path}${f.inline ? " (inside this flow)" : ""}: views ${f.views.length ? f.views.map((v) => `${v.name} (${v.id})`).join(", ") : "none (Base only)"}`);
  const recent = history.slice(-4);
  if (recent.length) {
    lines.push("RECENT TURNS");
    for (const t of recent) lines.push(`user: ${t.instruction}`, `you: ${t.say}${t.result ? ` [${t.result}]` : ""}`);
  }
  // The model half — without the inline frames' bodies, whose names and views are listed above.
  let modelText = splitFlowFile(content).modelText;
  if (inline.length) { const slim = { ...doc }; delete slim.frames; modelText = dumpFlow(slim); }
  lines.push("FLOW (model half)", modelText.trimEnd(), `INSTRUCTION: ${instruction.trim()}`);
  return lines.join("\n");
}

/* ── reading a reply ─────────────────────────────────────────────────────── */

const OP_ALIASES: Record<string, FlowAskOpName> = {
  create_screen: "add_screen", new_screen: "add_screen", edit_screen: "update_screen", delete_screen: "remove_screen",
  add_variant: "add_state", create_state: "add_state", update_variant: "update_state", edit_state: "update_state",
  remove_variant: "remove_state", delete_state: "remove_state",
  add_edge: "add_control", create_control: "add_control", update_edge: "update_control", edit_control: "update_control",
  remove_edge: "remove_control", delete_control: "remove_control",
  add_dimension: "set_dimension", update_dimension: "set_dimension", delete_dimension: "remove_dimension",
  add_local: "set_local", delete_local: "remove_local", set_start: "set_initial", rename: "set_title",
};

const text = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : undefined;

/** A condition or assignment however the model wrote it — text, or an object — as text. */
function clauseText(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join("|");
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${Array.isArray(val) ? val.map(text).filter(Boolean).join("|") : text(val) ?? ""}`)
      .join("; ");
  }
  return undefined;
}

/** A dispatch however the model wrote it — text, or a list of branches — as text. */
function dispatchText(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v.flatMap((b) => {
      const r = b && typeof b === "object" ? (b as Record<string, unknown>) : null;
      if (!r) return [];
      const when = r.when === undefined || r.when === "*" ? "*" : clauseText(r.when) ?? "*";
      return [`${when} -> ${text(r.to) ?? ""}`];
    }).join("; ");
  }
  return undefined;
}

export function normalizeFlowOp(x: unknown): FlowOp | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const rawOp = (text(r.op ?? r.action ?? r.type) ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const op = (FLOW_ASK_OPS as readonly string[]).includes(rawOp) ? (rawOp as FlowAskOpName) : OP_ALIASES[rawOp];
  if (!op) return null;
  const out: FlowOp = { op };
  for (const k of STRING_FIELDS) {
    const raw = k === "when" || k === "sets" ? clauseText(r[k]) : k === "dispatch" ? dispatchText(r[k]) : k === "values" ? clauseText(r[k]) : text(r[k]);
    if (raw !== undefined) out[k] = raw;
  }
  if (out.screen === undefined) { const s = text(r.screen_id ?? r.screenId ?? r.id); if (s !== undefined && (op.endsWith("_screen") || op === "set_initial")) out.screen = s; }
  if (out.control === undefined) { const c = text(r.edge ?? r.control_id ?? r.id); if (c !== undefined && op.endsWith("_control") && op !== "add_control") out.control = c; }
  if (out.state === undefined) { const st = text(r.variant ?? r.index); if (st !== undefined && op.endsWith("_state") && op !== "add_state") out.state = st; }
  const initial = r.initial === true || r.initial === "true" ? true : r.initial === false || r.initial === "false" ? false : undefined;
  if (initial !== undefined) out.initial = initial;
  return out;
}

export function parseFlowAskReply(x: unknown): FlowAskReply {
  const r = x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
  const say = text(r.say ?? r.message) ?? "";
  const rawOps = Array.isArray(r.ops) ? r.ops : Array.isArray(r.edits) ? r.edits : [];
  return { say, ops: rawOps.map(normalizeFlowOp).filter((o): o is FlowOp => !!o) };
}

/* ── the grammar ─────────────────────────────────────────────────────────── */

const scalar = (s: string): DimValue => {
  const v = s.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
};

/** `"dim: value; other: a|b"` → a `when`; "*", "" or nothing → undefined (always). */
export function parseWhenText(s: string | undefined): When | undefined {
  const t = s?.trim() ?? "";
  if (!t || t === "*" || t.toLowerCase() === "always") return undefined;
  const out: Record<string, DimValue | DimValue[]> = {};
  for (const part of t.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (!key || !val) continue;
    out[key] = val.includes("|") ? val.split("|").map(scalar) : scalar(val);
  }
  return Object.keys(out).length ? out : undefined;
}

/** `"dim: value; other: value"` → an assignment. */
export function parseSetsText(s: string | undefined): Assignment {
  const out: Assignment = {};
  for (const part of (s ?? "").split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (key && val) out[key] = scalar(val);
  }
  return out;
}

/** `"a|b|c"` (or comma-separated) → values. */
export const parseValuesText = (s: string | undefined): DimValue[] =>
  (s ?? "").split(/[|,]/).map((v) => v.trim()).filter(Boolean).map(scalar);

/* ── applying ────────────────────────────────────────────────────────────── */

export interface FlowAskApplied {
  content: string;
  applied: string[];
  skipped: string[];
  /** A screen an op created or changed — worth standing on next. */
  focusScreenId: string | null;
}

const isCatchAll = (w: When): boolean => w === "*" || (typeof w === "object" && !Array.isArray(w) && !Object.keys(w).length);

/** Apply a reply's ops, in order, through the flow's own mutators; say what happened. Never throws. */
export function applyFlowOps(content: string, ops: FlowOp[], target: FlowAskTarget): FlowAskApplied {
  const applied: string[] = [];
  const skipped: string[] = [];
  let focusScreenId: string | null = null;
  const parsed = parseFlowFile(content);
  if (parsed.error) return { content, applied, skipped: [`the flow does not parse: ${parsed.error}`], focusScreenId };
  const draft: FlowDoc = JSON.parse(JSON.stringify(parsed.doc));
  const handles = new Map<string, string>();
  let body: FlowBody = readFlow(draft);
  const refresh = () => { body = readFlow(draft); };

  const findScreen = (ref: string | undefined, fallback = true): FlowScreen | undefined => {
    if (ref === undefined || ref === "") return fallback && target.screenId ? body.screens.find((s) => s.id === target.screenId) : undefined;
    const viaHandle = handles.get(ref);
    return body.screens.find((s) => s.id === (viaHandle ?? ref))
      ?? body.screens.find((s) => s.title.toLowerCase() === ref.trim().toLowerCase());
  };
  /** A screen reference → its id; "" stays ""; undefined = not given; null = unknown. */
  const screenIdOf = (ref: string | undefined): string | null | undefined => {
    if (ref === undefined) return undefined;
    if (ref === "") return "";
    return findScreen(ref, false)?.id ?? null;
  };
  const stateIndexOf = (screen: FlowScreen, ref: string | undefined): number => {
    if (ref === undefined || ref === "") return target.screenId === screen.id && target.stateIndex !== null ? target.stateIndex : -1;
    const n = Number(ref);
    if (Number.isInteger(n) && n >= 1 && n <= screen.variants.length) return n - 1;
    return screen.variants.findIndex((v) => v.label.toLowerCase() === ref.trim().toLowerCase());
  };
  const findControl = (ref: string | undefined, screenRef: string | undefined) => {
    if (!ref) return undefined;
    const viaHandle = handles.get(ref) ?? ref;
    const byId = body.edges.find((e) => e.id === viaHandle);
    if (byId) return byId;
    const scope = findScreen(screenRef);
    const pool = scope ? scope.edges : body.edges;
    const hits = pool.filter((e) => e.event.toLowerCase() === ref.trim().toLowerCase());
    return hits.length === 1 ? hits[0] : undefined;
  };
  /** The frame panel an op asks for, over what the state shows now; undefined = leave it. */
  const nextFrame = (existing: FlowPanel[], op: FlowOp): { path: string; view: string | null } | null | undefined => {
    if (op.frame === "") return null;
    if (op.frame) return { path: op.frame.trim(), view: op.view?.trim() || null };
    if (op.view !== undefined) {
      const cur = framePanelOf(existing);
      return cur ? { path: cur.path, view: op.view.trim() || null } : undefined;
    }
    return undefined;
  };
  const contentFor = (existing: FlowPanel[], op: FlowOp): FlowPanel[] | undefined => {
    const frame = nextFrame(existing, op);
    const shots = op.screenshot ? [...shotsOf({ content: existing }), op.screenshot.trim()] : shotsOf({ content: existing });
    if (frame === undefined && !op.screenshot) return undefined;
    return mergeStatePanels(existing, { screenshots: shots, frame: frame === undefined ? (framePanelOf(existing) ? { path: framePanelOf(existing)!.path, view: framePanelOf(existing)!.view } : null) : frame });
  };
  const dispatchOf = (s: string | undefined): Array<{ when?: When; to?: string }> | undefined => {
    if (s === undefined) return undefined;
    const out: Array<{ when?: When; to?: string }> = [];
    for (const part of s.split(";")) {
      const m = part.match(/^(.*?)(?:->|=>|→)(.*)$/);
      if (!m) continue;
      const w = parseWhenText(m[1]);
      const toRef = m[2].trim();
      const to = toRef ? screenIdOf(toRef) ?? null : "";
      if (to === null) { skipped.push(`dispatch: unknown screen "${toRef}"`); continue; }
      out.push({ when: w ?? {}, ...(to ? { to } : {}) });
    }
    return out;
  };

  for (const op of ops) {
    switch (op.op) {
      case "add_screen": {
        const frame = op.frame?.trim() ? { path: op.frame.trim(), view: op.view?.trim() || null } : null;
        const panels: FlowPanel[] = frame ? [{ kind: "frame", path: frame.path, view: frame.view, label: null }] : [];
        if (op.screenshot?.trim()) panels.push({ kind: "screenshot", key: op.screenshot.trim(), label: null });
        const r = addScreen(draft, { title: op.title ?? op.label, description: op.description, initial: op.initial, ...(panels.length ? { content: panels } : {}) });
        if (!r.ok || !r.id) { skipped.push(`add_screen: ${r.error ?? "refused"}`); break; }
        if (op.as?.trim()) handles.set(op.as.trim(), r.id);
        refresh();
        focusScreenId = r.id;
        applied.push(`added screen "${findScreen(r.id)?.title ?? r.id}" (${r.id})${frame ? ` showing ${frame.path}${frame.view ? ` · ${frame.view}` : ""}` : ""}`);
        break;
      }
      case "update_screen": {
        const s = findScreen(op.screen);
        if (!s) { skipped.push(`update_screen: unknown screen "${op.screen ?? ""}"`); break; }
        const panels = contentFor(panelsOf(s), op);
        const r = updateScreen(draft, s.id, {
          ...(op.title !== undefined ? { title: op.title } : {}),
          ...(op.description !== undefined ? { description: op.description } : {}),
          ...(panels ? { content: panels } : {}),
          ...(op.initial ? { makeInitial: true } : {}),
        });
        if (!r.ok) { skipped.push(`update_screen ${s.title}: ${r.error ?? "refused"}`); break; }
        refresh();
        focusScreenId = s.id;
        applied.push(`updated screen "${s.title}"${panels ? " (what it shows)" : ""}`);
        break;
      }
      case "remove_screen": {
        const s = findScreen(op.screen, false);
        if (!s) { skipped.push(`remove_screen: unknown screen "${op.screen ?? ""}"`); break; }
        const r = deleteScreen(draft, s.id);
        if (!r.ok) { skipped.push(`remove_screen ${s.title}: refused`); break; }
        refresh();
        applied.push(`removed screen "${s.title}"${r.removedEdges.length ? ` and ${r.removedEdges.length} control(s) leading to it` : ""}`);
        break;
      }
      case "add_state": {
        const s = findScreen(op.screen);
        if (!s) { skipped.push(`add_state: unknown screen "${op.screen ?? ""}"`); break; }
        const when = parseWhenText(op.when) ?? {};
        const panels = contentFor([], op) ?? [];
        const last = s.variants[s.variants.length - 1];
        const index = last && isCatchAll(last.when) && !isCatchAll(when) ? s.variants.length - 1 : undefined;
        const r = addVariant(draft, s.id, { label: op.label ?? op.title ?? `State ${s.variants.length + 1}`, when, content: panels, description: op.description, index });
        if (!r.ok) { skipped.push(`add_state on ${s.title}: ${r.error ?? "refused"}`); break; }
        refresh();
        focusScreenId = s.id;
        applied.push(`added state "${op.label ?? op.title ?? ""}" to "${s.title}"${isCatchAll(when) ? " (catch-all)" : ""}`);
        break;
      }
      case "update_state": {
        const s = findScreen(op.screen);
        if (!s) { skipped.push(`update_state: unknown screen "${op.screen ?? ""}"`); break; }
        const i = stateIndexOf(s, op.state);
        if (i < 0) { skipped.push(`update_state on ${s.title}: unknown state "${op.state ?? ""}"`); break; }
        const v = s.variants[i];
        const panels = contentFor(panelsOf(v), op);
        const r = updateVariant(draft, s.id, i, {
          ...(op.label !== undefined ? { label: op.label } : {}),
          ...(op.when !== undefined ? { when: parseWhenText(op.when) ?? {} } : {}),
          ...(op.description !== undefined ? { description: op.description } : {}),
          ...(panels ? { content: panels } : {}),
        });
        if (!r.ok) { skipped.push(`update_state ${v.label}: ${r.error ?? "refused"}`); break; }
        refresh();
        focusScreenId = s.id;
        applied.push(`updated state "${v.label}" of "${s.title}"${panels ? " (what it shows)" : ""}`);
        break;
      }
      case "remove_state": {
        const s = findScreen(op.screen);
        if (!s) { skipped.push(`remove_state: unknown screen "${op.screen ?? ""}"`); break; }
        const i = stateIndexOf(s, op.state);
        if (i < 0) { skipped.push(`remove_state on ${s.title}: unknown state "${op.state ?? ""}"`); break; }
        const label = s.variants[i].label;
        if (!deleteVariant(draft, s.id, i)) { skipped.push(`remove_state ${label}: refused`); break; }
        refresh();
        applied.push(`removed state "${label}" from "${s.title}"`);
        break;
      }
      case "add_control": {
        const s = findScreen(op.screen);
        if (!s) { skipped.push(`add_control: unknown screen "${op.screen ?? ""}"`); break; }
        const to = screenIdOf(op.to);
        if (to === null) { skipped.push(`add_control "${op.event ?? ""}": unknown screen "${op.to}"`); break; }
        const dispatch = dispatchOf(op.dispatch);
        const r = addEdge(draft, {
          event: op.event ?? op.label ?? op.title ?? "", from: s.id, when: parseWhenText(op.when),
          ...(to ? { to } : {}), ...(dispatch?.length ? { dispatch } : {}),
          sets: parseSetsText(op.sets), description: op.description,
        });
        if (!r.ok || !r.id) { skipped.push(`add_control on ${s.title}: ${r.error ?? "refused"}`); break; }
        if (op.as?.trim()) handles.set(op.as.trim(), r.id);
        refresh();
        focusScreenId = s.id;
        const dest = to ? `→ "${findScreen(to)?.title ?? to}"` : dispatch?.length ? "(dispatch)" : "(stays)";
        applied.push(`added control "${op.event ?? ""}" on "${s.title}" ${dest}`);
        break;
      }
      case "update_control": {
        const e = findControl(op.control, op.screen);
        if (!e) { skipped.push(`update_control: unknown control "${op.control ?? ""}"`); break; }
        const to = screenIdOf(op.to);
        if (to === null) { skipped.push(`update_control "${e.event}": unknown screen "${op.to}"`); break; }
        const dispatch = dispatchOf(op.dispatch);
        const r = updateEdge(draft, e.id, {
          ...(op.event !== undefined ? { event: op.event } : {}),
          ...(op.when !== undefined ? { when: parseWhenText(op.when) ?? "*" } : {}),
          ...(op.to !== undefined ? { to: to ?? "" } : {}),
          ...(dispatch !== undefined ? { dispatch } : {}),
          ...(op.sets !== undefined ? { sets: parseSetsText(op.sets) } : {}),
          ...(op.description !== undefined ? { description: op.description } : {}),
        });
        if (!r.ok) { skipped.push(`update_control "${e.event}": ${r.error ?? "refused"}`); break; }
        refresh();
        focusScreenId = e.from;
        applied.push(`updated control "${e.event}" on "${findScreen(e.from)?.title ?? e.from}"`);
        break;
      }
      case "remove_control": {
        const e = findControl(op.control, op.screen);
        if (!e) { skipped.push(`remove_control: unknown control "${op.control ?? ""}"`); break; }
        if (!deleteEdge(draft, e.id)) { skipped.push(`remove_control "${e.event}": refused`); break; }
        refresh();
        applied.push(`removed control "${e.event}" from "${findScreen(e.from)?.title ?? e.from}"`);
        break;
      }
      case "set_dimension": {
        const name = op.name?.trim() ?? "";
        const values = parseValuesText(op.values);
        const r = setDimension(draft, name, values);
        if (!r.ok) { skipped.push(`set_dimension ${name}: ${r.error ?? "refused"}`); break; }
        if (op.default?.trim()) {
          const defaults = (draft.defaults && typeof draft.defaults === "object" ? draft.defaults : (draft.defaults = {})) as Record<string, unknown>;
          defaults[name] = scalar(op.default);
        }
        refresh();
        applied.push(`dimension ${name}: ${values.map(String).join(" | ")}${op.default ? ` (default ${op.default})` : ""}`);
        break;
      }
      case "remove_dimension": {
        const name = op.name?.trim() ?? "";
        const r = setDimension(draft, name, null);
        if (!r.ok) { skipped.push(`remove_dimension ${name}: ${r.error ?? "refused"}`); break; }
        if (draft.defaults && typeof draft.defaults === "object") delete (draft.defaults as Record<string, unknown>)[name];
        refresh();
        applied.push(`removed dimension ${name}`);
        break;
      }
      case "set_local":
      case "remove_local": {
        const s = findScreen(op.screen);
        if (!s) { skipped.push(`${op.op}: unknown screen "${op.screen ?? ""}"`); break; }
        const name = op.name?.trim() ?? "";
        const r = setScreenLocal(draft, s.id, name, op.op === "set_local" ? parseValuesText(op.values) : null);
        if (!r.ok) { skipped.push(`${op.op} ${name} on ${s.title}: ${r.error ?? "refused"}`); break; }
        refresh();
        applied.push(op.op === "set_local" ? `local ${name} on "${s.title}": ${parseValuesText(op.values).map(String).join(" | ")}` : `removed local ${name} from "${s.title}"`);
        break;
      }
      case "set_initial": {
        const s = findScreen(op.screen);
        if (!s) { skipped.push(`set_initial: unknown screen "${op.screen ?? ""}"`); break; }
        updateScreen(draft, s.id, { makeInitial: true });
        refresh();
        applied.push(`the walk now starts on "${s.title}"`);
        break;
      }
      case "set_title": {
        if (op.title !== undefined) draft.title = op.title;
        if (op.description !== undefined) draft.description = op.description;
        if (op.title === undefined && op.description === undefined) { skipped.push("set_title: nothing to change"); break; }
        refresh();
        applied.push("flow title/description set");
        break;
      }
      default:
        skipped.push(`unknown op "${String((op as { op: unknown }).op)}"`);
    }
  }
  return { content: applied.length ? withModel(content, dumpFlow(draft)) : content, applied, skipped, focusScreenId };
}
