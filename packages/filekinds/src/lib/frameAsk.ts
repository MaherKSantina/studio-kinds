/**
 * ASKING a frame to change — the small-model edit loop behind Frame Studio's
 * Ask panel, built for live use (an interview, a review call): the user
 * points at a view and a node, types one line, the frame changes.
 *
 * The model never writes YAML. It reads the COMPACT body plus the target and
 * answers through a closed vocabulary of OPS (the JSON schema below, which
 * the transport also enforces); `applyFrameOps` turns those into the same
 * pure edits the inspector makes, so nothing a model says can leave the
 * file in a shape the studio could not have produced itself. Unknown ids,
 * refused moves and "no view to hide in" are reported, not thrown — the
 * panel shows them next to what did happen.
 *
 * The transport (the frame worker) is prompt-agnostic: it takes system +
 * user + schema and returns the object. Everything the model is told lives
 * HERE, beside the engine it drives, so the vocabulary cannot drift from
 * the edits.
 */
import {
  FRAME_LEGEND, FRAME_NODE_KINDS, type FrameBody, type FrameDoc, type FrameNode, type FrameView, dumpFrameCompact, nodeById, viewById,
} from "./frameDoc";
import {
  type NodePatch, addNode, addView, canHoldChildren, duplicateNode, patchProps, placeNode, removeNode, setDocMeta, setFrame,
  toggleHidden, updateNode,
} from "./frameEdit";

export const FRAME_ASK_OPS = ["add", "update", "remove", "duplicate", "move", "hide", "show", "add_view", "frame", "doc"] as const;
export type FrameAskOpName = (typeof FRAME_ASK_OPS)[number];

/** One edit as the model emits it. Only `op` is required; which other
 *  fields matter depends on the op (see `frameAskSystem`). */
export interface FrameOp {
  op: FrameAskOpName;
  /** An existing node (or, on `add`, a HANDLE the reply's later ops may refer to). */
  id?: string;
  /** On `add` / `duplicate`: a handle for the created node, for later ops in the same reply. */
  as?: string;
  ids?: string[];
  kind?: string;
  name?: string;
  /** A container id; "" = the frame; omitted = the target container. */
  parent?: string;
  /** The sibling id to land after; "" = first; omitted = last. */
  after?: string;
  /** ONE string of "key: value" pairs separated by ";" — numbers and booleans as text; an empty value removes the prop. */
  props?: string;
  sizing?: "hug" | "fixed" | "expand";
  /** The file's own flags, accepted as a shorthand for `sizing`. */
  fixed?: boolean;
  expand?: boolean;
  width?: number;
  height?: number;
  /** A view id or name, for hide / show. */
  view?: string;
  /** A reviewer comment kept on the node (meta.note). */
  note?: string;
  title?: string;
  description?: string;
}

export interface FrameAskReply {
  say: string;
  ops: FrameOp[];
}

/** The JSON schema a reply must satisfy — plain enough for every validator
 *  (no union `type`s, nothing beyond objects, arrays, strings and numbers). */
export const FRAME_ASK_SCHEMA = {
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
          op: { type: "string", enum: [...FRAME_ASK_OPS] },
          id: { type: "string" },
          as: { type: "string", description: "On add / duplicate: a handle for the new node that later ops in this reply can use as id, parent or after." },
          ids: { type: "array", items: { type: "string" } },
          kind: { type: "string", enum: [...FRAME_NODE_KINDS] },
          name: { type: "string" },
          parent: { type: "string" },
          after: { type: "string" },
          props: { type: "string", description: "\"key: value\" pairs separated by \";\" — e.g. \"text: Continue; fontSize: 16; wrap: true\"; an empty value removes the prop." },
          sizing: { type: "string", enum: ["hug", "fixed", "expand"] },
          fixed: { type: "boolean" },
          expand: { type: "boolean" },
          width: { type: "number" },
          height: { type: "number" },
          view: { type: "string" },
          note: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
  },
} as const;

/** What the model is told once — stable text, so a transport can cache it:
 *  the file's vocabulary (the legend), the ops, the rules. */
export function frameAskSystem(): string {
  const legend = FRAME_LEGEND.replace(/^# ?/gm, "").trimEnd();
  return `You are the editing hand inside Frame Studio. The user is sketching ONE screen (a .frame file) and gives you short instructions, often live in front of other people. Answer ONLY through the schema: "say" is one short sentence, under twelve words (what you changed, or the single question you need answered), "ops" is the list of edits.

THE FILE
${legend}

THE OPS — one edit each, applied in order:
- add {kind, name, parent, after, props, sizing, width, height, as}: a new node. parent = a container id (vstack, hstack, box, grid, scroll) or "" for the frame; OMIT parent to add into the TARGET (the selected node when it is a container, else its parent, else the frame). after = the sibling id to land after, "" = first, omitted = last. A text or button with no text prop shows its name. as = a handle of your choosing (row1, list) so later ops in THIS reply can nest under it or come after it; it becomes a real id when applied.
- update {id, name, kind, props, sizing, width, height, note, parent, after}: change an existing node — only the fields that change. note = a reviewer comment kept on the node.
- remove {id} or {ids}. duplicate {id, as}: a copy right after the original; as = a handle for the copy so later ops can update it.
- move {id, parent, after}: reorder or reparent (parent "" = the frame, omitted = stay where it is; after "" = first, omitted = last).
- hide {ids, view} / show {ids, view}: in a view (omit view = the target view). Hiding a container hides its subtree.
- add_view {name, ids}: a new UI state (Empty, Loading, Error…) that hides ids.
- frame {width, height, name}. doc {title, description}.
props is ONE string of "key: value" pairs separated by ";" — e.g. "text: Continue; background: #2563eb; fontSize: 16; wrap: true". An empty value ("gap: ") removes that prop.
sizing: hug (default) | fixed (pins the main axis — give height in a column, width in a row) | expand (fills the parent's main axis).

RULES
- Existing nodes are referred to by the ids in the frame. New nodes get real ids when applied: refer to them within this reply only through the handles you gave (as), never guess an id.
- Repeated rows: build ONE row (a container with its children), then duplicate it with handles and update each copy's text — far fewer ops than building every row by hand. Keep a reply under about 25 ops; for a big screen do the skeleton first and say what to ask for next.
- "It", "this", "the selected one" = the target node. A view named in the instruction beats the target view.
- Make the smallest change that does what was asked; leave everything not mentioned alone.
- Only the props named above exist: a border is borderWidth + borderColor (never "border"), sizes are plain numbers in px.
- Full width in a column needs nothing (the cross axis stretches); fixed + width there would pin the HEIGHT instead.
- A screen is usually one expanding vstack on the frame holding a header, a body that expands, and a footer; keep that shape when you add.
- Act when the instruction can be applied sensibly. Ask (say + empty ops) only when it cannot.`;
}

export interface FrameAskTarget {
  viewId: string | null;
  nodeId: string | null;
}

export interface FrameAskTurn {
  instruction: string;
  say: string;
  /** What actually happened — applied and skipped — so the model can correct itself next turn. */
  result?: string;
}

/** What the model is told per turn: the target, the recent turns, the compact frame, the instruction. */
export function frameAskUser(doc: FrameBody, target: FrameAskTarget, instruction: string, history: FrameAskTurn[] = []): string {
  const view = viewById(doc, target.viewId);
  const node = target.nodeId ? nodeById(doc, target.nodeId) : undefined;
  const lines = [
    `TARGET view: ${view ? `${view.name} (${view.id})` : "Base"}`,
    `TARGET node: ${node ? `${node.name} (${node.id}, ${node.kind}${node.parent ? `, in ${node.parent}` : ", on the frame"})` : "none — the frame"}`,
  ];
  const recent = history.slice(-4);
  if (recent.length) {
    lines.push("RECENT TURNS");
    for (const t of recent) lines.push(`user: ${t.instruction}`, `you: ${t.say}${t.result ? ` [${t.result}]` : ""}`);
  }
  lines.push("FRAME", dumpFrameCompact(doc).trimEnd(), `INSTRUCTION: ${instruction.trim()}`);
  return lines.join("\n");
}

/** Names a model reaches for that mean one of ours. */
const OP_ALIASES: Record<string, FrameAskOpName> = {
  delete: "remove", del: "remove", create: "add", insert: "add", new: "add", edit: "update", set: "update", change: "update",
  modify: "update", copy: "duplicate", reorder: "move", reparent: "move", unhide: "show", new_view: "add_view", view: "add_view",
};

const text = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : undefined;
const numberOf = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};
const boolOf = (v: unknown): boolean | undefined => (v === true || v === "true" ? true : v === false || v === "false" ? false : undefined);

/** `props` however the model wrote it — our string, a plain object, or
 *  key/value pairs — as the one string form the applier reads. */
export function propsText(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const parts = v.flatMap((p) => {
      const r = p && typeof p === "object" ? (p as Record<string, unknown>) : null;
      return r && typeof r.key === "string" ? [`${r.key}: ${text(r.value) ?? ""}`] : [];
    });
    return parts.length ? parts.join("; ") : undefined;
  }
  if (v && typeof v === "object") {
    const parts = Object.entries(v as Record<string, unknown>).map(([k, val]) => `${k}: ${val === null || val === undefined ? "" : text(val) ?? JSON.stringify(val)}`);
    return parts.length ? parts.join("; ") : undefined;
  }
  return undefined;
}

/** One op as the model wrote it → one op as the applier reads it, or null
 *  when there is no op name we know. Every field is coerced to its shape:
 *  a lone id where a list was expected, numbers as text, booleans as text. */
export function normalizeFrameOp(x: unknown): FrameOp | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const rawOp = (text(r.op ?? r.action ?? r.type) ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const op = (FRAME_ASK_OPS as readonly string[]).includes(rawOp) ? (rawOp as FrameAskOpName) : OP_ALIASES[rawOp];
  if (!op) return null;
  const out: FrameOp = { op };
  const id = text(r.id ?? r.node ?? r.target);
  if (id !== undefined) out.id = id;
  const as = text(r.as ?? r.handle ?? r.alias);
  if (as !== undefined && as.trim()) out.as = as.trim();
  const ids = Array.isArray(r.ids) ? r.ids.map(text).filter((s): s is string => !!s) : text(r.ids) ? [text(r.ids)!] : undefined;
  if (ids?.length) out.ids = ids;
  for (const k of ["kind", "name", "parent", "after", "view", "note", "title", "description"] as const) {
    const s = text(r[k]);
    if (s !== undefined) out[k] = k === "kind" ? s.trim().toLowerCase() : s;
  }
  const props = propsText(r.props ?? r.properties ?? r.style);
  if (props !== undefined) out.props = props;
  const sizing = text(r.sizing)?.trim().toLowerCase();
  if (sizing === "hug" || sizing === "fixed" || sizing === "expand") out.sizing = sizing;
  const fixed = boolOf(r.fixed);
  if (fixed !== undefined) out.fixed = fixed;
  const expand = boolOf(r.expand);
  if (expand !== undefined) out.expand = expand;
  const width = numberOf(r.width);
  if (width !== undefined) out.width = width;
  const height = numberOf(r.height);
  if (height !== undefined) out.height = height;
  return out;
}

/** A reply as it came back from a transport, read leniently: every op is
 *  normalized, junk ops are dropped, a non-object is empty. */
export function parseFrameAskReply(x: unknown): FrameAskReply {
  const r = x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
  const say = text(r.say ?? r.message) ?? "";
  const rawOps = Array.isArray(r.ops) ? r.ops : Array.isArray(r.edits) ? r.edits : Array.isArray(r.operations) ? r.operations : [];
  const ops = rawOps.map(normalizeFrameOp).filter((o): o is FrameOp => !!o);
  return { say, ops };
}

export interface FrameAskApplied {
  doc: FrameDoc;
  /** One line per edit made, in order. */
  applied: string[];
  /** What could not be done, and why. */
  skipped: string[];
  /** The last node an op created or copied — the natural next target. */
  focusId: string | null;
  /** The view an op created — worth switching to. */
  focusViewId: string | null;
}

/** Props whose values are text even when they look like numbers. */
const STRING_PROPS: ReadonlySet<string> = new Set([
  "text", "placeholder", "src", "asset", "ref_path", "view", "slot", "name", "color", "background", "borderColor",
  "textAlign", "fontStyle", "fontWeight", "align", "justify", "direction", "fit",
]);

/** A prop value as the model writes it (always text) → what the file stores. */
export function coerceProp(key: string, value: string): unknown {
  const v = value.trim();
  if (v === "") return undefined;
  if (STRING_PROPS.has(key)) return v;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

/** `"key: value; key: value"` → props; a value keeps its own colons, an
 *  empty value is a removal (present, undefined), parts without a colon are noise. */
export function parseProps(s: string | undefined): Record<string, unknown> | null {
  if (!s?.trim()) return null;
  const out: Record<string, unknown> = {};
  for (const part of s.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (key) out[key] = coerceProp(key, part.slice(i + 1));
  }
  return Object.keys(out).length ? out : null;
}

const propsOf = (op: FrameOp): Record<string, unknown> | null => parseProps(propsText(op.props));

const sizingPatch = (op: FrameOp): NodePatch => {
  const patch: NodePatch = {};
  const sizing = op.sizing ?? (op.fixed === true ? "fixed" : op.expand === true ? "expand" : undefined);
  if (sizing === "hug") { patch.fixed = false; patch.expand = false; }
  else if (sizing === "fixed") patch.fixed = true;
  else if (sizing === "expand") patch.expand = true;
  if (typeof op.width === "number") patch.width = op.width;
  if (typeof op.height === "number") patch.height = op.height;
  return patch;
};

const isKind = (k: unknown): k is string => typeof k === "string" && (FRAME_NODE_KINDS as readonly string[]).includes(k);

/** A node by id, else by a name that only one node carries (case-insensitive). */
function findNode(body: FrameBody, ref: string | undefined): FrameNode | undefined {
  if (!ref) return undefined;
  const byId = nodeById(body, ref);
  if (byId) return byId;
  const hits = body.nodes.filter((n) => n.name.toLowerCase() === ref.toLowerCase());
  return hits.length === 1 ? hits[0] : undefined;
}

/** A view by id, else by name (case-insensitive). */
function findView(body: FrameBody, ref: string | null | undefined): FrameView | undefined {
  if (!ref) return undefined;
  return viewById(body, ref) ?? body.views.find((v) => v.name.toLowerCase() === ref.toLowerCase());
}

const label = (body: FrameBody, id: string): string => {
  const n = nodeById(body, id);
  return n ? `${n.name} (${id})` : id;
};

/** Apply a reply's ops, in order, to the document — each through the pure
 *  edits — and say what happened. Never throws. */
export function applyFrameOps(doc: FrameDoc, ops: FrameOp[], target: FrameAskTarget): FrameAskApplied {
  let d = doc;
  const applied: string[] = [];
  const skipped: string[] = [];
  let focusId: string | null = null;
  let focusViewId: string | null = null;

  const targetNode = target.nodeId ? nodeById(d, target.nodeId) : undefined;
  const defaultParent = targetNode ? (canHoldChildren(targetNode.kind) ? targetNode.id : targetNode.parent ?? null) : null;

  // Handles the reply gave its own new nodes (add `as` / `id`, duplicate
  // `as`) → the real ids they got. A handle wins over a coincidental match
  // in the file: the reply defined it.
  const handles = new Map<string, string>();
  const lookup = (ref: string | undefined): FrameNode | undefined => {
    if (ref === undefined) return undefined;
    const viaHandle = handles.get(ref);
    return (viaHandle && nodeById(d, viaHandle)) || findNode(d, ref);
  };
  const remember = (handle: string | undefined, realId: string) => { if (handle?.trim()) handles.set(handle.trim(), realId); };

  const resolveParent = (p: string | undefined): { ok: true; id: string | null } | { ok: false; why: string } => {
    if (p === undefined) return { ok: true, id: defaultParent && nodeById(d, defaultParent) ? defaultParent : null };
    if (p === "") return { ok: true, id: null };
    const n = lookup(p);
    if (!n) return { ok: false, why: `unknown parent "${p}"` };
    if (!canHoldChildren(n.kind)) return { ok: false, why: `${n.name} (${n.id}) is a ${n.kind} — it holds no children` };
    return { ok: true, id: n.id };
  };
  const afterOf = (a: string | undefined): string | null | undefined => {
    if (a === undefined) return undefined;
    if (a === "") return null;
    return lookup(a)?.id ?? a;
  };
  const idsOf = (op: FrameOp): string[] => (op.ids?.length ? op.ids : op.id ? [op.id] : []);

  for (const op of ops) {
    switch (op.op) {
      case "add": {
        if (!isKind(op.kind)) { skipped.push(`add: unknown kind "${op.kind ?? ""}"`); break; }
        const parent = resolveParent(op.parent);
        if (!parent.ok) { skipped.push(`add ${op.kind}: ${parent.why}`); break; }
        const r = addNode(d, parent.id, op.kind, op.name?.trim() || undefined);
        d = r.doc;
        remember(op.as ?? op.id, r.id);
        const props = propsOf(op) ?? {};
        if ((op.kind === "text" || op.kind === "button") && props.text === undefined && op.name?.trim()) props.text = op.name.trim();
        if (Object.keys(props).length) d = patchProps(d, r.id, props);
        d = updateNode(d, r.id, sizingPatch(op));
        if (op.after !== undefined) d = placeNode(d, r.id, parent.id, afterOf(op.after));
        focusId = r.id;
        applied.push(`added ${op.kind} ${label(d, r.id)}${parent.id ? ` into ${label(d, parent.id)}` : " on the frame"}`);
        break;
      }
      case "update": {
        const n = lookup(op.id);
        if (!n) { skipped.push(`update: unknown node "${op.id ?? ""}"`); break; }
        const patch: NodePatch = sizingPatch(op);
        const what: string[] = [];
        if (op.name?.trim() && op.name.trim() !== n.name) { patch.name = op.name.trim(); what.push(`name → ${patch.name}`); }
        if (op.kind !== undefined) {
          if (isKind(op.kind)) { patch.kind = op.kind; what.push(`kind → ${op.kind}`); }
          else skipped.push(`update ${label(d, n.id)}: unknown kind "${op.kind}"`);
        }
        if (op.note !== undefined) {
          const meta = { ...n.meta };
          if (op.note.trim()) meta.note = op.note.trim(); else delete meta.note;
          patch.meta = meta;
          what.push(op.note.trim() ? `note: ${op.note.trim()}` : "note removed");
        }
        const props = propsOf(op);
        if (props) {
          patch.props = props;
          for (const [k, v] of Object.entries(props)) what.push(v === undefined ? `${k} removed` : `${k}=${String(v)}`);
        }
        if (patch.fixed) what.push("fixed"); else if (patch.expand) what.push("expand"); else if (op.sizing === "hug") what.push("hug");
        if (typeof op.width === "number") what.push(`width ${op.width}`);
        if (typeof op.height === "number") what.push(`height ${op.height}`);
        d = updateNode(d, n.id, patch);
        if (op.parent !== undefined || op.after !== undefined) {
          const parent = op.parent === undefined ? { ok: true as const, id: n.parent ?? null } : resolveParent(op.parent);
          if (!parent.ok) skipped.push(`move ${label(d, n.id)}: ${parent.why}`);
          else {
            const next = placeNode(d, n.id, parent.id, afterOf(op.after));
            if (next === d) skipped.push(`move ${label(d, n.id)}: refused (a node cannot move into its own subtree)`);
            else { d = next; what.push("moved"); }
          }
        }
        applied.push(`updated ${label(d, n.id)}${what.length ? `: ${what.join(", ")}` : ""}`);
        break;
      }
      case "remove": {
        const ids = idsOf(op);
        if (!ids.length) { skipped.push("remove: no id given"); break; }
        for (const ref of ids) {
          const n = lookup(ref);
          if (!n) { skipped.push(`remove: unknown node "${ref}"`); continue; }
          const name = label(d, n.id);
          d = removeNode(d, n.id);
          if (focusId === n.id) focusId = null;
          applied.push(`removed ${name}`);
        }
        break;
      }
      case "duplicate": {
        const n = lookup(op.id);
        if (!n) { skipped.push(`duplicate: unknown node "${op.id ?? ""}"`); break; }
        const r = duplicateNode(d, n.id);
        d = r.doc;
        remember(op.as, r.id);
        focusId = r.id;
        applied.push(`duplicated ${label(d, n.id)} → ${r.id}`);
        break;
      }
      case "move": {
        const n = lookup(op.id);
        if (!n) { skipped.push(`move: unknown node "${op.id ?? ""}"`); break; }
        const parent = op.parent === undefined ? { ok: true as const, id: n.parent ?? null } : resolveParent(op.parent);
        if (!parent.ok) { skipped.push(`move ${label(d, n.id)}: ${parent.why}`); break; }
        const next = placeNode(d, n.id, parent.id, afterOf(op.after));
        if (next === d) { skipped.push(`move ${label(d, n.id)}: refused (a node cannot move into its own subtree)`); break; }
        d = next;
        const where = op.after === "" ? " (first)" : op.after ? ` after ${label(d, afterOf(op.after) ?? op.after)}` : "";
        applied.push(`moved ${label(d, n.id)}${parent.id ? ` into ${label(d, parent.id)}` : " onto the frame"}${where}`);
        break;
      }
      case "hide":
      case "show": {
        const v = findView(d, op.view) ?? findView(d, target.viewId);
        if (!v) { skipped.push(`${op.op}: no view to ${op.op} in — switch to a view or name one`); break; }
        const ids = idsOf(op);
        if (!ids.length) { skipped.push(`${op.op}: no ids given`); break; }
        for (const ref of ids) {
          const n = lookup(ref);
          if (!n) { skipped.push(`${op.op}: unknown node "${ref}"`); continue; }
          const hidden = (viewById(d, v.id)?.hidden ?? []).includes(n.id);
          if ((op.op === "hide") !== hidden) d = toggleHidden(d, v.id, n.id);
          applied.push(`${op.op === "hide" ? "hid" : "showed"} ${label(d, n.id)} in ${v.name}`);
        }
        break;
      }
      case "add_view": {
        const name = op.name?.trim() || `View ${d.views.length + 1}`;
        const r = addView(d, name);
        d = r.doc;
        focusViewId = r.id;
        const hid: string[] = [];
        for (const ref of op.ids ?? []) {
          const n = lookup(ref);
          if (!n) { skipped.push(`add_view ${name}: unknown node "${ref}"`); continue; }
          d = toggleHidden(d, r.id, n.id);
          hid.push(label(d, n.id));
        }
        applied.push(`added view ${name} (${r.id})${hid.length ? ` hiding ${hid.join(", ")}` : ""}`);
        break;
      }
      case "frame": {
        const patch: { width?: number; height?: number; name?: string } = {};
        if (typeof op.width === "number" && op.width > 0) patch.width = op.width;
        if (typeof op.height === "number" && op.height > 0) patch.height = op.height;
        if (op.name?.trim()) patch.name = op.name.trim();
        if (!Object.keys(patch).length) { skipped.push("frame: nothing to change"); break; }
        d = setFrame(d, patch);
        applied.push(`frame ${Object.entries(patch).map(([k, v]) => `${k}=${String(v)}`).join(", ")}`);
        break;
      }
      case "doc": {
        const patch: { title?: string; description?: string } = {};
        if (op.title !== undefined) patch.title = op.title;
        if (op.description !== undefined) patch.description = op.description;
        if (!Object.keys(patch).length) { skipped.push("doc: nothing to change"); break; }
        d = setDocMeta(d, patch);
        applied.push(`document ${Object.keys(patch).join(", ")} set`);
        break;
      }
      default:
        skipped.push(`unknown op "${String((op as { op: unknown }).op)}"`);
    }
  }
  return { doc: d, applied, skipped, focusId, focusViewId };
}
