/**
 * FRAMES KEPT INSIDE A FLOW.
 *
 * A `.flow` may carry whole frames under a top-level `frames:` map, by name,
 * beside the screens that show them: the walkthrough and its screens travel
 * as ONE file. A state points at an inline frame by its bare name
 * (`frame: login`) exactly as it points at a file beside the flow
 * (`frame: login.frame`); the name wins when both exist.
 *
 * "Move into flow" is a text transform: the frame file's body goes under
 * `frames.<stem>`, every state that showed the file is re-pointed at the
 * name — and when no state did, a NEW SCREEN showing the frame is added, so
 * a moved frame is a screen of the flow, never an invisible child. The
 * caller removes the file only after the new text is saved — so a failed
 * write leaves the file where it was. Frame Studio edits an
 * inline frame in place: `inlineFrameText` hands it the frame as `.frame`
 * text, `withInlineFrameText` writes the edit back into the flow, and the
 * views half of the flow is never touched by either.
 */
import { type FlowDoc, addScreen, dumpFlow, parseFlow } from "./flowOps";
import { withModel } from "./flowEngine";
import { type FrameDoc, dumpFrame, frameToRaw, parseFrame, parseFrameObject } from "./frameDoc";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** The inline frames of a flow's model, by name, in declaration order (raw objects). */
export function inlineFrames(doc: FlowDoc): Record<string, Obj> {
  const raw = doc.frames;
  if (!isObj(raw)) return {};
  const out: Record<string, Obj> = {};
  for (const [k, v] of Object.entries(raw)) if (isObj(v)) out[k] = v;
  return out;
}

export const inlineFrameNames = (doc: FlowDoc): string[] => Object.keys(inlineFrames(doc));

/** One inline frame, parsed; null when the flow has none by that name. */
export function inlineFrame(doc: FlowDoc, name: string): FrameDoc | null {
  const raw = inlineFrames(doc)[name];
  return raw ? parseFrameObject(raw) : null;
}

/** The frame named `name` inside a flow's text, as `.frame` text (legend included) — what Frame Studio edits. */
export function inlineFrameText(flowText: string, name: string): string | null {
  const f = inlineFrame(parseFlow(flowText), name);
  return f ? dumpFrame(f) : null;
}

/** The flow's text with the frame named `name` replaced by `frameText` — how Frame Studio saves one. */
export function withInlineFrameText(flowText: string, name: string, frameText: string): string {
  const doc = parseFlow(flowText);
  const frames = isObj(doc.frames) ? doc.frames : (doc.frames = {});
  frames[name] = frameToRaw(parseFrame(frameText));
  return withModel(flowText, dumpFlow(doc));
}

/** Drop the frame named `name` from a flow's model (states that showed it are left to say so). */
export function removeInlineFrameFromDoc(doc: FlowDoc, name: string): { ok: boolean; error?: string } {
  if (!isObj(doc.frames) || !(name in doc.frames)) return { ok: false, error: `no frame named "${name}" in this flow` };
  delete doc.frames[name];
  if (!Object.keys(doc.frames).length) delete doc.frames;
  return { ok: true };
}

/** The flow's text without the frame named `name`. */
export function removeInlineFrame(flowText: string, name: string): string {
  const doc = parseFlow(flowText);
  if (!removeInlineFrameFromDoc(doc, name).ok) return flowText;
  return withModel(flowText, dumpFlow(doc));
}

/** The states (screens and variants) of a flow's model that show the inline frame `name`. */
export function statesShowingInlineFrame(doc: FlowDoc, name: string): number {
  let n = 0;
  const shows = (s: Obj) => (typeof s.frame === "string" && s.frame.trim() === name)
    || (Array.isArray(s.content) && s.content.some((c) => isObj(c) && typeof c.frame === "string" && c.frame.trim() === name));
  for (const s of Array.isArray(doc.screens) ? doc.screens : []) {
    if (!isObj(s)) continue;
    if (shows(s)) n++;
    for (const v of Array.isArray(s.variants) ? s.variants : []) if (isObj(v) && shows(v)) n++;
  }
  return n;
}

/**
 * ADD A SCREEN showing the inline frame `name` — titled after the frame (its stem when it has
 * no title), made the initial screen when the flow has none. A title already taken gets the
 * frame's name appended, so the screen always lands.
 */
export function addScreenForInlineFrame(doc: FlowDoc, name: string): { ok: boolean; id?: string; error?: string } {
  const frame = inlineFrame(doc, name);
  if (!frame) return { ok: false, error: `no frame named "${name}" in this flow` };
  const content = [{ kind: "frame" as const, path: name, view: null, label: null }];
  const initial = typeof doc.initial !== "string" || !doc.initial.trim();
  const base = frame.title.trim() || name;
  const first = addScreen(doc, { title: base, content, initial });
  if (first.ok) return first;
  return addScreen(doc, { title: `${base} (${name})`, content, initial });
}

/** A name for a frame file inside a flow: its stem, made safe, and unique among the frames already there. */
export function frameNameFor(doc: FlowDoc, framePath: string): string {
  const stem = framePath.slice(framePath.lastIndexOf("/") + 1).replace(/\.frame$/i, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "frame";
  const taken = new Set(inlineFrameNames(doc));
  if (!taken.has(stem)) return stem;
  let n = 2;
  while (taken.has(`${stem}-${n}`)) n++;
  return `${stem}-${n}`;
}

/** How a flow at `flowPath` referred to the frame file at `framePath`: relative to the flow's folder
 *  when the frame sits below it, else by file name — with and without a leading `./`. */
export function frameRefsFrom(framePath: string, flowPath?: string): Set<string> {
  const file = framePath.slice(framePath.lastIndexOf("/") + 1);
  const refs = new Set([file, `./${file}`]);
  if (flowPath) {
    const folder = flowPath.slice(0, flowPath.lastIndexOf("/") + 1);
    if (framePath.startsWith(folder) && framePath.length > folder.length) {
      const rel = framePath.slice(folder.length);
      refs.add(rel);
      refs.add(`./${rel}`);
    }
  }
  return refs;
}

/** Re-point every state (in the model and its version snapshots) that showed one of `refs` at the inline `name`. */
function rewire(doc: FlowDoc, refs: Set<string>, name: string): number {
  let n = 0;
  const visitState = (s: Obj) => {
    if (typeof s.frame === "string" && refs.has(s.frame.trim())) { s.frame = name; n++; }
    if (Array.isArray(s.content)) {
      for (const item of s.content) if (isObj(item) && typeof item.frame === "string" && refs.has(item.frame.trim())) { item.frame = name; n++; }
    }
  };
  const visitBody = (b: Obj) => {
    for (const s of Array.isArray(b.screens) ? b.screens : []) {
      if (!isObj(s)) continue;
      visitState(s);
      for (const v of Array.isArray(s.variants) ? s.variants : []) if (isObj(v)) visitState(v);
    }
  };
  visitBody(doc);
  for (const v of Array.isArray(doc.versions) ? doc.versions : []) if (isObj(v)) visitBody(v);
  return n;
}

/**
 * MOVE a frame file into a flow — as a SCREEN of it. Pure — nothing is read or written here:
 * the caller saves the returned text first and removes the file after. `flowPath` (the flow's
 * own path) lets states that named the frame by its path from the flow's folder be re-pointed
 * too. When no state showed the file, a new screen showing the frame is added (`screen` is its
 * id); otherwise the states that showed it now show it by name.
 */
export function moveFrameIntoFlow(flowText: string, frameText: string, framePath: string, flowPath?: string): { flowText: string; name: string; rewired: number; screen: string | null } {
  const doc = parseFlow(flowText);
  const frame = parseFrame(frameText);
  if (!frame.frames.length) throw new Error(`${framePath.slice(framePath.lastIndexOf("/") + 1)} is not a frame — it has no frame in it.`);
  const name = frameNameFor(doc, framePath);
  const frames = isObj(doc.frames) ? doc.frames : (doc.frames = {});
  frames[name] = frameToRaw(frame);
  const rewired = rewire(doc, frameRefsFrom(framePath, flowPath), name);
  let screen: string | null = null;
  if (!rewired) {
    const added = addScreenForInlineFrame(doc, name);
    if (!added.ok) throw new Error(added.error ?? "could not add a screen for the frame");
    screen = added.id ?? null;
  }
  return { flowText: withModel(flowText, dumpFlow(doc)), name, rewired, screen };
}
