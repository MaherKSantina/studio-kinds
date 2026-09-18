/**
 * EDITING a `.frame` — the pure mutations Frame Studio applies. Every
 * function takes a document and returns a new one; the studio dumps the
 * result and autosaves. Document order is the layout order (siblings lay
 * out in the order they appear), so moves and reparents REFLOW the node
 * list as a depth-first walk of the intended tree.
 */
import {
  CONTAINER_KINDS, type FrameDoc, type FrameNode, type FrameRect, childrenOf, nextFrameId, nodeById, subtreeIds,
} from "./frameDoc";

/** Kinds that may hold children: containers, plus the reference kinds
 *  (an embed's children are slot injections). */
export const canHoldChildren = (kind: string): boolean => CONTAINER_KINDS.has(kind) || kind === "embed";

const DEFAULT_PROPS: Record<string, Record<string, unknown>> = {
  vstack: { gap: 8, padding: 0, align: "stretch" },
  hstack: { gap: 8, padding: 0, align: "center" },
  box: { padding: 8 },
  grid: { columns: 2, gap: 8 },
  scroll: { gap: 12, padding: 16, direction: "vertical" },
  text: { text: "Text", fontSize: 14, color: "#111827" },
  button: { text: "Button", background: "#111827", color: "#ffffff", borderRadius: 10 },
  input: { placeholder: "Placeholder" },
  image: {},
  divider: { color: "#e5e7eb" },
  spacer: {},
  embed: { ref_path: "" },
  slot: { name: "content" },
};

/** A node walk in document (= layout) order, with an optional override of
 *  one parent's children order. The result is the new `nodes` array. */
function reflow(doc: FrameDoc, override?: { parent: string | null; order: string[] }): FrameNode[] {
  const out: FrameNode[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null) => {
    let kids = childrenOf(doc, parentId);
    if (override && override.parent === parentId) {
      const byId = new Map(kids.map((k) => [k.id, k]));
      kids = override.order.map((id) => byId.get(id)).filter((k): k is FrameNode => !!k);
    }
    for (const k of kids) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      out.push(k);
      walk(k.id);
    }
  };
  walk(null);
  // Nodes whose parent chain is broken still belong to the file.
  for (const n of doc.nodes) if (!seen.has(n.id)) out.push(n);
  return out;
}

export type NodePatch = Partial<Omit<FrameNode, "id" | "props" | "meta">> & {
  props?: Record<string, unknown>;
  meta?: Record<string, string>;
};

/** Merge a patch into one node. `fixed` and `expand` stay mutually
 *  exclusive; an explicit `undefined` width/height/parent clears it; props
 *  merge key by key (undefined / "" / null deletes). */
export function updateNode(doc: FrameDoc, id: string, patch: NodePatch): FrameDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      if (n.id !== id) return n;
      const next: FrameNode = { ...n };
      if ("name" in patch && patch.name !== undefined) next.name = patch.name;
      if ("kind" in patch && patch.kind !== undefined) next.kind = patch.kind;
      if ("frame" in patch && patch.frame !== undefined) next.frame = patch.frame;
      if ("parent" in patch) { if (patch.parent) next.parent = patch.parent; else delete next.parent; }
      if ("width" in patch) { if (patch.width !== undefined) next.width = patch.width; else delete next.width; }
      if ("height" in patch) { if (patch.height !== undefined) next.height = patch.height; else delete next.height; }
      if ("fixed" in patch) { if (patch.fixed) { next.fixed = true; delete next.expand; } else delete next.fixed; }
      if ("expand" in patch) { if (patch.expand) { next.expand = true; delete next.fixed; } else delete next.expand; }
      if (patch.props) next.props = mergeProps(n.props, patch.props);
      if (patch.meta) next.meta = { ...patch.meta };
      return next;
    }),
  };
}

export function mergeProps(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === "") delete out[k];
    else out[k] = v;
  }
  return out;
}

export const patchProps = (doc: FrameDoc, id: string, props: Record<string, unknown>): FrameDoc => updateNode(doc, id, { props });

/** Add a node of `kind` as the last child of `parentId` (null = on the frame). */
export function addNode(doc: FrameDoc, parentId: string | null, kind: string, name?: string): { doc: FrameDoc; id: string } {
  let d = doc;
  if (!d.frames.length) d = setFrame(d, {});
  const id = nextFrameId(d, "n");
  const node: FrameNode = {
    id, frame: d.frames[0].id, name: name ?? defaultName(kind), kind,
    props: { ...(DEFAULT_PROPS[kind] ?? {}) }, meta: {},
  };
  if (parentId && nodeById(d, parentId)) node.parent = parentId;
  if (kind === "text" && !name) node.props.text = "Text";
  const next = { ...d, nodes: [...d.nodes, node] };
  return { doc: { ...next, nodes: reflow(next) }, id };
}

const defaultName = (kind: string): string => {
  const names: Record<string, string> = {
    vstack: "V Stack", hstack: "H Stack", box: "Box", grid: "Grid", scroll: "Scroll", text: "Text", button: "Button",
    input: "Input", image: "Image", divider: "Divider", spacer: "Spacer", embed: "Embed", slot: "Slot",
  };
  return names[kind] ?? kind;
};

/** Remove a node and everything under it; views forget the hidden ids. */
export function removeNode(doc: FrameDoc, id: string): FrameDoc {
  const gone = new Set(subtreeIds(doc, id));
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => !gone.has(n.id)),
    views: doc.views.map((v) => ({ ...v, hidden: v.hidden.filter((h) => !gone.has(h)) })),
  };
}

/** Copy a node's subtree with fresh ids, placed right after the original among its siblings. */
export function duplicateNode(doc: FrameDoc, id: string): { doc: FrameDoc; id: string } {
  const src = nodeById(doc, id);
  if (!src) return { doc, id };
  const ids = subtreeIds(doc, id);
  const map = new Map<string, string>();
  let d = doc;
  for (const old of ids) {
    const fresh = nextFrameId({ ...d, nodes: [...d.nodes, ...[...map.values()].map((v) => ({ ...src, id: v }))] }, "n");
    map.set(old, fresh);
    d = { ...d, nodes: [...d.nodes, { ...src, id: fresh }] }; // reserve the id
  }
  const copies: FrameNode[] = ids.map((old) => {
    const n = nodeById(doc, old)!;
    const c: FrameNode = { ...n, id: map.get(old)!, props: { ...n.props }, meta: { ...n.meta } };
    if (n.parent && map.has(n.parent)) c.parent = map.get(n.parent)!;
    return c;
  });
  const withCopies = { ...doc, nodes: [...doc.nodes, ...copies] };
  const parent = src.parent ?? null;
  const order = childrenOf(withCopies, parent).map((n) => n.id).filter((x) => x !== map.get(id));
  order.splice(order.indexOf(id) + 1, 0, map.get(id)!);
  return { doc: { ...withCopies, nodes: reflow(withCopies, { parent, order }) }, id: map.get(id)! };
}

/** Swap a node with its previous (-1) or next (+1) sibling. */
export function moveNode(doc: FrameDoc, id: string, dir: -1 | 1): FrameDoc {
  const n = nodeById(doc, id);
  if (!n) return doc;
  const parent = n.parent ?? null;
  const order = childrenOf(doc, parent).map((k) => k.id);
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return doc;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...doc, nodes: reflow(doc, { parent, order }) };
}

/** Put a node (with its subtree) under another parent, last among its
 *  children. Refused when the target cannot hold children or sits inside
 *  the moving subtree. */
export function reparentNode(doc: FrameDoc, id: string, newParent: string | null): FrameDoc {
  const n = nodeById(doc, id);
  if (!n) return doc;
  if (newParent) {
    const target = nodeById(doc, newParent);
    if (!target || !canHoldChildren(target.kind) || subtreeIds(doc, id).includes(newParent)) return doc;
  }
  const moved = updateNode(doc, id, { parent: newParent ?? undefined });
  // Last among its new siblings — document order would otherwise decide.
  const order = [...childrenOf(doc, newParent).map((k) => k.id).filter((x) => x !== id), id];
  return { ...moved, nodes: reflow(moved, { parent: newParent, order }) };
}

/** Put a node (with its subtree) under `parent` (null = the frame) at a
 *  precise spot: right after sibling `after`, first when `after` is null,
 *  last when it is omitted or unknown. Same refusals as `reparentNode`. */
export function placeNode(doc: FrameDoc, id: string, parent: string | null, after?: string | null): FrameDoc {
  const n = nodeById(doc, id);
  if (!n) return doc;
  if (parent) {
    const target = nodeById(doc, parent);
    if (!target || !canHoldChildren(target.kind) || subtreeIds(doc, id).includes(parent)) return doc;
  }
  const moved = (n.parent ?? null) === parent ? doc : updateNode(doc, id, { parent: parent ?? undefined });
  const order = childrenOf(moved, parent).map((k) => k.id).filter((x) => x !== id);
  let at = order.length;
  if (after === null) at = 0;
  else if (after !== undefined) { const i = order.indexOf(after); if (i >= 0) at = i + 1; }
  order.splice(at, 0, id);
  return { ...moved, nodes: reflow(moved, { parent, order }) };
}

/** Nest a node under the sibling above it (when that sibling can hold children). */
export function indentNode(doc: FrameDoc, id: string): FrameDoc {
  const n = nodeById(doc, id);
  if (!n) return doc;
  const sibs = childrenOf(doc, n.parent ?? null);
  const i = sibs.findIndex((s) => s.id === id);
  const above = i > 0 ? sibs[i - 1] : undefined;
  return above && canHoldChildren(above.kind) ? reparentNode(doc, id, above.id) : doc;
}

/** Lift a node out to its grandparent, right after its old parent. */
export function outdentNode(doc: FrameDoc, id: string): FrameDoc {
  const n = nodeById(doc, id);
  if (!n?.parent) return doc;
  const parent = nodeById(doc, n.parent);
  if (!parent) return doc;
  const grand = parent.parent ?? null;
  const moved = updateNode(doc, id, { parent: grand ?? undefined });
  const order = childrenOf(moved, grand).map((k) => k.id).filter((x) => x !== id);
  order.splice(order.indexOf(parent.id) + 1, 0, id);
  return { ...moved, nodes: reflow(moved, { parent: grand, order }) };
}

export function addView(doc: FrameDoc, name: string): { doc: FrameDoc; id: string } {
  const id = nextFrameId(doc, "v");
  return { doc: { ...doc, views: [...doc.views, { id, name: name.trim() || id, hidden: [] }] }, id };
}

export function renameView(doc: FrameDoc, id: string, name: string): FrameDoc {
  return { ...doc, views: doc.views.map((v) => (v.id === id && name.trim() ? { ...v, name: name.trim() } : v)) };
}

export function deleteView(doc: FrameDoc, id: string): FrameDoc {
  return { ...doc, views: doc.views.filter((v) => v.id !== id) };
}

export function moveView(doc: FrameDoc, id: string, dir: -1 | 1): FrameDoc {
  const i = doc.views.findIndex((v) => v.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= doc.views.length) return doc;
  const views = [...doc.views];
  [views[i], views[j]] = [views[j], views[i]];
  return { ...doc, views };
}

/** Flip a node's membership in a view's hidden list. */
export function toggleHidden(doc: FrameDoc, viewId: string, nodeId: string): FrameDoc {
  return {
    ...doc,
    views: doc.views.map((v) => {
      if (v.id !== viewId) return v;
      const hidden = v.hidden.includes(nodeId) ? v.hidden.filter((h) => h !== nodeId) : [...v.hidden, nodeId];
      return { ...v, hidden };
    }),
  };
}

/** Patch THE frame, creating it when the file has none. */
export function setFrame(doc: FrameDoc, patch: Partial<FrameRect>): FrameDoc {
  const cur: FrameRect = doc.frames[0] ?? { id: "f1", name: doc.title || "Frame", x: 0, y: 0, width: 390, height: 844 };
  const next: FrameRect = { ...cur, ...patch };
  if (patch.image === undefined && "image" in patch) delete next.image;
  const frames = [next, ...doc.frames.slice(1)];
  // Nodes pointing at no frame adopt the one.
  const nodes = doc.nodes.map((n) => (n.frame ? n : { ...n, frame: next.id }));
  return { ...doc, frames, nodes };
}

export function setDocMeta(doc: FrameDoc, patch: { title?: string; description?: string }): FrameDoc {
  return { ...doc, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}) };
}
