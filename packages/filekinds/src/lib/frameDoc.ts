/**
 * The `.frame` kind — a SINGLE-frame UI-design canvas.
 *
 * Ported from the legacy orchestration app's design model: one screenshot-
 * backed frame (one screen) plus a `nodes` hierarchy laid out with CSS
 * flexbox semantics. A `.design` held many frames; a `.frame` holds at most
 * ONE, which is what makes it embeddable — another frame's `embed` node can
 * render it read-only, live, and inject children into its named `slot`s.
 *
 *   frames    — at most one `{id, name, image?, x, y, width, height}`; the
 *               image is a store path to a screenshot (optional).
 *   nodes     — flat list; `parent` nests, `frame` says which frame (always
 *               the one). Containers: box (group, column), vstack, hstack,
 *               grid (`props.columns`, child `props.span`), scroll (a fixed
 *               viewport; `props.direction`). Leaves: text, button, image,
 *               input, divider, spacer. References: embed (`props.ref_path`,
 *               optional `props.view`), slot (`props.name`); a child of an
 *               embed carrying `props.slot` is injected into that slot.
 *   sizing    — hug by default; the cross axis stretches. `expand` grows
 *               along the parent's main axis; `fixed` pins the main-axis
 *               size (`height` in a column, `width` in a row).
 *   views     — reference-based visibility variants: `hidden` node ids.
 *               Nothing is copied, so a Base edit shows in every view.
 *   versions  — older full snapshots (oldest first); the top level is the
 *               latest and `version_name` is its display name.
 *
 * Parsing is LENIENT and never throws — a half-written file still renders.
 * The structural rules a studio enforces on save live in `frameProblems`.
 */
import yaml from "js-yaml";

export type FrameNodeKind =
  | "box" | "vstack" | "hstack" | "grid" | "scroll"
  | "text" | "button" | "image" | "input" | "divider" | "spacer"
  | "embed" | "slot";

export const FRAME_NODE_KINDS: FrameNodeKind[] = [
  "vstack", "hstack", "box", "grid", "scroll", "text", "button", "image", "input", "divider", "spacer", "embed", "slot",
];

/** Kinds whose children lay out inside them. */
export const CONTAINER_KINDS: ReadonlySet<string> = new Set(["box", "vstack", "hstack", "grid", "scroll"]);

export interface FrameRect {
  id: string;
  name: string;
  /** Screenshot behind the frame — a store path (absolute, or relative to the document). */
  image?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameNode {
  id: string;
  frame: string;
  parent?: string;
  name: string;
  kind: string;
  fixed?: boolean;
  expand?: boolean;
  width?: number;
  height?: number;
  props: Record<string, unknown>;
  meta: Record<string, string>;
}

export interface FrameView {
  id: string;
  name: string;
  hidden: string[];
}

export interface FrameBody {
  title: string;
  description: string;
  frames: FrameRect[];
  nodes: FrameNode[];
  views: FrameView[];
}

export interface FrameVersion extends FrameBody {
  name: string;
}

export interface FrameDoc extends FrameBody {
  versionName?: string;
  versions: FrameVersion[];
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : typeof x === "number" ? String(x) : undefined);
const num = (x: unknown): number | undefined => {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))) return Number(x);
  return undefined;
};

function parseRect(raw: unknown, i: number): FrameRect | null {
  const r = rec(raw);
  const id = str(r.id);
  if (!id) return null;
  const out: FrameRect = {
    id,
    name: str(r.name) ?? `Frame ${i + 1}`,
    x: num(r.x) ?? 0,
    y: num(r.y) ?? 0,
    width: num(r.width) ?? 390,
    height: num(r.height) ?? 844,
  };
  const image = str(r.image);
  if (image) out.image = image;
  return out;
}

function parseNode(raw: unknown, fallbackFrame: string | undefined): FrameNode | null {
  const r = rec(raw);
  const id = str(r.id);
  if (!id) return null;
  const out: FrameNode = {
    id,
    frame: str(r.frame) ?? fallbackFrame ?? "",
    name: str(r.name) ?? id,
    kind: str(r.kind) ?? "box",
    props: { ...rec(r.props) },
    meta: Object.fromEntries(Object.entries(rec(r.meta)).flatMap(([k, v]) => (str(v) !== undefined ? [[k, str(v)!]] : []))),
  };
  const parent = str(r.parent);
  if (parent) out.parent = parent;
  if (r.fixed === true) out.fixed = true;
  if (r.expand === true) out.expand = true;
  const w = num(r.width);
  if (w !== undefined) out.width = w;
  const h = num(r.height);
  if (h !== undefined) out.height = h;
  return out;
}

function parseView(raw: unknown, i: number): FrameView | null {
  const r = rec(raw);
  const id = str(r.id);
  if (!id) return null;
  return {
    id,
    name: str(r.name) ?? `View ${i + 1}`,
    hidden: arr(r.hidden).map(str).filter((s): s is string => !!s),
  };
}

function parseBody(r: Record<string, unknown>): FrameBody {
  const frames = arr(r.frames).map(parseRect).filter((f): f is FrameRect => !!f);
  const fallback = frames[0]?.id;
  return {
    title: str(r.title) ?? "",
    description: str(r.description) ?? "",
    frames,
    nodes: arr(r.nodes).map((n) => parseNode(n, fallback)).filter((n): n is FrameNode => !!n),
    views: arr(r.views).map(parseView).filter((v): v is FrameView => !!v),
  };
}

export const emptyFrame = (): FrameDoc => ({ title: "", description: "", frames: [], nodes: [], views: [], versions: [] });

/** Parse an already-loaded YAML value — a frame kept INSIDE another document (a flow's `frames:`). */
export function parseFrameObject(value: unknown): FrameDoc {
  const raw = rec(value);
  const body = parseBody(raw);
  const versions = arr(raw.versions).map(rec).flatMap((v, i): FrameVersion[] => {
    const name = str(v.name) ?? `v${i + 1}`;
    return [{ name, ...parseBody(v) }];
  });
  const versionName = str(raw.version_name);
  return { ...body, ...(versionName ? { versionName } : {}), versions };
}

/** Parse a `.frame` body. Never throws: an unparseable file reads as empty. */
export function parseFrame(text: string): FrameDoc {
  let raw: unknown;
  try { raw = yaml.load(text); } catch { return emptyFrame(); }
  return parseFrameObject(raw);
}

function rectToRaw(f: FrameRect): Record<string, unknown> {
  const out: Record<string, unknown> = { id: f.id, name: f.name };
  if (f.image) out.image = f.image;
  if (f.x) out.x = f.x;
  if (f.y) out.y = f.y;
  out.width = f.width;
  out.height = f.height;
  return out;
}

function nodeToRaw(n: FrameNode): Record<string, unknown> {
  const out: Record<string, unknown> = { id: n.id, frame: n.frame };
  if (n.parent) out.parent = n.parent;
  out.name = n.name;
  out.kind = n.kind;
  if (n.fixed) out.fixed = true;
  if (n.expand) out.expand = true;
  if (n.width !== undefined) out.width = n.width;
  if (n.height !== undefined) out.height = n.height;
  if (Object.keys(n.props).length) out.props = n.props;
  if (Object.keys(n.meta).length) out.meta = n.meta;
  return out;
}

function bodyToRaw(b: FrameBody): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (b.title.trim()) out.title = b.title.trim();
  if (b.description.trim()) out.description = b.description.trim();
  out.frames = b.frames.map(rectToRaw);
  out.nodes = b.nodes.map(nodeToRaw);
  if (b.views.length) out.views = b.views.map((v) => ({ id: v.id, name: v.name, hidden: v.hidden }));
  return out;
}

/**
 * THE LEGEND every saved `.frame` opens with. A frame is a one-shot handover
 * artifact — it travels to a reviewer and then to whoever implements it — so
 * the file explains its own vocabulary to the next reader, human or model.
 * YAML comments: the parser ignores them and a re-dump never doubles them.
 */
export const FRAME_LEGEND = `# .frame — ONE screen as a tree of nodes laid out with CSS flexbox (no absolute positions).
# frames    exactly one {id, name, width, height, image?}; image = a screenshot drawn behind the nodes.
# nodes     a flat list; \`parent\` nests a node (omit it = sits on the frame); siblings lay out in FILE ORDER.
# kinds     containers: vstack (column) · hstack (row) · box (column group) · grid (props.columns, child props.span)
#           · scroll (a viewport that scrolls its children; unsized, it fills the leftover space along props.direction vertical|horizontal)
#           leaves: text · button · image · input · divider · spacer
#           references: embed (props.ref_path = another .frame drawn live, props.view) · slot (props.name, filled by an embedder)
# sizing    hug by default (as big as its content). expand: true = grow to fill the parent's MAIN axis.
#           fixed: true = pin the MAIN-axis size (height in a column, width in a row) — give that dimension.
#           The CROSS axis always stretches unless the parent sets align. Main axis: vertical in vstack/box/frame, horizontal in hstack.
# props     containers: gap, padding, align (start|center|end|stretch), justify (start|center|end|between|around|evenly), wrap
#           text: text, fontSize, color, fontWeight, textAlign, fontStyle · button: text, background, color, fontSize
#           input: placeholder · image: src, fit · divider: color · any: background, borderWidth, borderColor, borderRadius, opacity
# views     UI states over the SAME tree: each lists the node ids it hides (hiding a node hides its subtree). Nothing is copied.
# meta      free notes per node (reviewer comments, intent) as key: value strings.
# versions  older full snapshots, oldest first; the top level is the latest, named by version_name.
`;

export interface DumpFrameOptions {
  /** Open the text with FRAME_LEGEND (default true). */
  legend?: boolean;
}

/** The value `dumpFrame` writes — a whole frame as a plain object, to sit inside another document. */
export function frameToRaw(doc: FrameDoc): Record<string, unknown> {
  const out = bodyToRaw(doc);
  if (doc.versionName) out.version_name = doc.versionName;
  if (doc.versions.length) out.versions = doc.versions.map((v) => ({ name: v.name, ...bodyToRaw(v) }));
  return out;
}

/** Serialize back to YAML, dropping empty optionals so the stored file stays clean. */
export function dumpFrame(doc: FrameDoc, opts: DumpFrameOptions = {}): string {
  const body = yaml.dump(frameToRaw(doc), { lineWidth: 120, noRefs: true });
  return opts.legend === false ? body : FRAME_LEGEND + body;
}

/** One body, compact: no legend, no versions, one line per node — what a
 *  model reads when asked to edit (a fraction of the stored file's tokens). */
export function dumpFrameCompact(body: FrameBody): string {
  return yaml.dump(bodyToRaw(body), { lineWidth: 400, noRefs: true, flowLevel: 2 });
}

/** A fresh single-frame document. */
export function newFrameDoc(title: string, width = 390, height = 844): FrameDoc {
  return {
    title,
    description: "",
    frames: [{ id: "f1", name: title || "Frame", x: 0, y: 0, width, height }],
    nodes: [],
    views: [],
    versions: [],
  };
}

/** THE frame — the one a `.frame` holds; null while the file is still empty. */
export const frameOf = (body: FrameBody): FrameRect | null => body.frames[0] ?? null;

/** Direct children of `parentId` (null = nodes sitting directly on the frame), in document order. */
export function childrenOf(body: FrameBody, parentId: string | null): FrameNode[] {
  const ids = new Set(body.nodes.map((n) => n.id));
  return body.nodes.filter((n) => {
    const p = n.parent && ids.has(n.parent) ? n.parent : undefined;
    return parentId === null ? p === undefined : p === parentId;
  });
}

export const nodeById = (body: FrameBody, id: string): FrameNode | undefined => body.nodes.find((n) => n.id === id);

export const viewById = (body: FrameBody, id: string | null | undefined): FrameView | undefined =>
  id ? body.views.find((v) => v.id === id) : undefined;

/** Every node hidden in `view` — the listed ids AND their whole subtrees.
 *  Base (no view) hides nothing. */
export function hiddenIn(body: FrameBody, view: FrameView | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!view) return out;
  const direct = new Set(view.hidden);
  const byParent = new Map<string, FrameNode[]>();
  for (const n of body.nodes) {
    if (!n.parent) continue;
    const list = byParent.get(n.parent) ?? [];
    list.push(n);
    byParent.set(n.parent, list);
  }
  const mark = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    for (const c of byParent.get(id) ?? []) mark(c.id);
  };
  for (const id of direct) mark(id);
  return out;
}

/** Ids of a node and everything nested under it. */
export function subtreeIds(body: FrameBody, id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    out.push(pid);
    for (const c of body.nodes) if (c.parent === pid) walk(c.id);
  };
  walk(id);
  return out;
}

/** Which axis a container arranges its children along. The frame itself and
 *  a `box` stack vertically; `hstack` and a horizontal `scroll` go across. */
export function axisOf(container: FrameNode | null): "column" | "row" {
  if (!container) return "column";
  if (container.kind === "hstack") return "row";
  if (container.kind === "scroll" && container.props.direction === "horizontal") return "row";
  return "column";
}

/** Whether a node fills its parent's MAIN axis: `expand` and spacers always;
 *  a `scroll` viewport with no size of its own does too when it scrolls along
 *  that axis — a vertical scroller in a column takes the leftover height, a
 *  horizontal one there hugs its height and scrolls sideways. A viewport
 *  that hugged its content would never scroll, which is the one thing it is
 *  for. */
export function fillsMainAxis(node: FrameNode, parent: FrameNode | null): boolean {
  if (node.kind === "spacer" || node.expand) return true;
  if (node.kind !== "scroll" || node.fixed) return false;
  const axis = axisOf(parent);
  const main = axis === "column" ? node.height : node.width;
  return main === undefined && axisOf(node) === axis;
}

/** The nodes a view shows, in document order. */
export function visibleNodes(body: FrameBody, view: FrameView | null | undefined): FrameNode[] {
  const hidden = hiddenIn(body, view);
  return body.nodes.filter((n) => !hidden.has(n.id));
}

/** A version snapshot by name or 1-based index; undefined = the latest (the
 *  document itself). Unknown names fall back to the latest. */
export function frameSnapshotAt(doc: FrameDoc, version?: string | number): FrameBody {
  if (version === undefined || version === "") return doc;
  const byIndex = typeof version === "number" ? version : Number(version);
  if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= doc.versions.length) return doc.versions[byIndex - 1];
  if (typeof version === "string") {
    if (doc.versionName && version === doc.versionName) return doc;
    const hit = doc.versions.find((v) => v.name === version);
    if (hit) return hit;
  }
  return doc;
}

/** Snapshot the current body under `currentName` and make the working copy
 *  the new version `newName` — the top level is always the latest. */
export function createFrameVersion(doc: FrameDoc, newName: string, currentName?: string): FrameDoc {
  const name = currentName?.trim() || doc.versionName || `v${doc.versions.length + 1}`;
  const body: FrameBody = {
    title: doc.title, description: doc.description,
    frames: doc.frames.map((f) => ({ ...f })),
    nodes: doc.nodes.map((n) => ({ ...n, props: { ...n.props }, meta: { ...n.meta } })),
    views: doc.views.map((v) => ({ ...v, hidden: [...v.hidden] })),
  };
  return { ...doc, versionName: newName.trim() || `v${doc.versions.length + 2}`, versions: [...doc.versions, { name, ...body }] };
}

/** The next free id for `prefix` (n1, n2, … / v1, v2, …). */
export function nextFrameId(body: FrameBody, prefix: string): string {
  const taken = new Set([...body.nodes.map((n) => n.id), ...body.views.map((v) => v.id), ...body.frames.map((f) => f.id)]);
  let i = 1;
  while (taken.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/** Structural problems a studio refuses to save (the viewer only reports them). */
export function frameProblems(body: FrameBody): string[] {
  const out: string[] = [];
  if (body.frames.length > 1) out.push(`a .frame holds ONE frame; this file has ${body.frames.length}`);
  const ids = new Map<string, number>();
  for (const n of body.nodes) ids.set(n.id, (ids.get(n.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) out.push(`node id "${id}" appears ${n} times`);
  const frameIds = new Set(body.frames.map((f) => f.id));
  for (const n of body.nodes) {
    if (n.frame && frameIds.size && !frameIds.has(n.frame)) out.push(`node "${n.id}" sits on unknown frame "${n.frame}"`);
    if (n.parent && !ids.has(n.parent)) out.push(`node "${n.id}" has unknown parent "${n.parent}"`);
    if (n.fixed && n.expand) out.push(`node "${n.id}" is both fixed and expand`);
    if (n.kind === "embed" && typeof n.props.ref_path !== "string") out.push(`embed "${n.id}" names no ref_path`);
    if (n.kind === "slot" && typeof n.props.name !== "string") out.push(`slot "${n.id}" has no name`);
  }
  // A parent chain must terminate at the frame — a cycle would never lay out.
  for (const n of body.nodes) {
    const seen = new Set<string>();
    let cur: FrameNode | undefined = n;
    while (cur?.parent) {
      if (seen.has(cur.id)) { out.push(`node "${n.id}" is inside a parent cycle`); break; }
      seen.add(cur.id);
      cur = nodeById(body, cur.parent);
    }
  }
  for (const v of body.views) for (const h of v.hidden) if (!ids.has(h)) out.push(`view "${v.id}" hides unknown node "${h}"`);
  return out;
}

/** Nodes that should be READ as this frame's named slots when it is embedded. */
export const slotsOf = (body: FrameBody): FrameNode[] => body.nodes.filter((n) => n.kind === "slot");

/** Children of an `embed` node carrying `props.slot` — the injections,
 *  grouped by the slot name they target. */
export function injectionsOf(body: FrameBody, embedId: string): Map<string, FrameNode[]> {
  const out = new Map<string, FrameNode[]>();
  for (const c of childrenOf(body, embedId)) {
    const slot = typeof c.props.slot === "string" ? c.props.slot : "";
    if (!slot) continue;
    const list = out.get(slot) ?? [];
    list.push(c);
    out.set(slot, list);
  }
  return out;
}
