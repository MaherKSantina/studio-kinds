// FEATURE TREE — a named, nestable node plus the immutable tree edits over it.
//
// This shape started life inside foundry as "the schema the FEATURES agent returns", and the type
// leaked outward from there: `.brief` documents are built on it (lib/briefDoc), the file-kind
// contract names it (lib/fileKindContract), DiffFilePane colours it, and a node's role picker walks
// it. Two of those are in lib/, so lib/ was importing from components/foundry/ — the dependency
// pointing the wrong way, and any of them touching foundry to get a plain tree type.
//
// Nothing here is foundry-specific: it is a tree of named nodes with optional prose and provenance.
// The agent RESPONSE schema (FeaturesResponse, the validator that throws, the `.list` YAML
// conversion) is a different thing and stays in components/foundry/featuresList.ts, which imports
// this and re-exports it so foundry's own call sites are unchanged.
//
// Paths are index paths: [1, 0] is the 2nd root's 1st child — the same path FeatureTreeExplorer
// derives from a row's dotted id. Every edit returns a FRESH tree so React sees a new reference.

export interface FeatureNode {
  /** The feature title. */
  name: string;
  /** One-line description of the feature (optional). */
  description?: string;
  /** Longer-form markdown prose describing the feature in depth (optional).
   *  Rendered in the explorer's detail pane when a node is selected. */
  prose?: string;
  /** Re-analysis tag: how this node changed vs the previous iteration. */
  change?: "add" | "edit" | "remove";
  /** Which change-op produced this node, when it came from an applied diff (`DiffChange.id`,
   *  stamped as `__op`). Read-only provenance — it identifies the CHANGE, so anything said about
   *  the change (a rationale) hangs off this rather than off the node's title, which a rename
   *  would take with it. Never serialized back: it belongs to the diff, not the document. */
  opId?: string;
  /** WHY this node changed, when it came from a diff (`__note`). Read-only provenance, never
   *  serialized back: it explains a change, it is not part of the document. */
  note?: string;
  /**
   * What this node SAID before, when it arrived edited (`__was`).
   *
   * A coloured row tells you something moved; it does not tell you what. For a
   * title that is fine, because the title is right there. For a body it is not:
   * an amber node with three paragraphs is an invitation to read all three and
   * guess. Carrying the previous text lets the detail pane show the change
   * rather than announce it. Read-only provenance, never serialized back.
   */
  was?: { description?: string; prose?: string };
  /** Nested sub-features (optional) — this is what makes it a tree. */
  children?: FeatureNode[];
}

/** A blank feature for a freshly-added node. */
export function emptyFeature(name = "New feature"): FeatureNode { return { name }; }

/** Replace the node at `path` with `fn(node)`. */
export function updateFeatureAt(list: FeatureNode[], path: number[], fn: (n: FeatureNode) => FeatureNode): FeatureNode[] {
  const [i, ...rest] = path;
  return list.map((n, idx) => {
    if (idx !== i) return n;
    if (rest.length === 0) return fn(n);
    return { ...n, children: updateFeatureAt(n.children ?? [], rest, fn) };
  });
}

/** Drop the node at `path`. */
export function removeFeatureAt(list: FeatureNode[], path: number[]): FeatureNode[] {
  const [i, ...rest] = path;
  if (rest.length === 0) return list.filter((_, idx) => idx !== i);
  return list.map((n, idx) => (idx === i ? { ...n, children: removeFeatureAt(n.children ?? [], rest) } : n));
}

/** Append `child` to the children of the node at `path`. */
export function addChildAt(list: FeatureNode[], path: number[], child: FeatureNode): FeatureNode[] {
  return updateFeatureAt(list, path, (n) => ({ ...n, children: [...(n.children ?? []), child] }));
}

/** The node at an index `path`, or null if the path doesn't resolve. */
export function featureAt(list: FeatureNode[], path: number[]): FeatureNode | null {
  let cur: FeatureNode[] = list;
  let node: FeatureNode | null = null;
  for (const i of path) {
    node = cur[i] ?? null;
    if (!node) return null;
    cur = node.children ?? [];
  }
  return node;
}

/** The index path of a node found by reference, or null. */
export function featurePathOf(list: FeatureNode[], ref: FeatureNode, prefix: number[] = []): number[] | null {
  for (let i = 0; i < list.length; i++) {
    const p = [...prefix, i];
    if (list[i] === ref) return p;
    const c = featurePathOf(list[i].children ?? [], ref, p);
    if (c) return c;
  }
  return null;
}

/** True when `a` is a prefix of (or equal to) `b` — i.e. b is a/self or a descendant. */
const isPrefixPath = (a: number[], b: number[]): boolean => a.length <= b.length && a.every((v, i) => v === b[i]);

/** After removing the node at `removed`, the index path that used to be `target`
 *  (a later sibling under the same parent shifts down by one). */
const adjustAfterRemoval = (target: number[], removed: number[]): number[] => {
  const lvl = removed.length - 1;
  const t = target.slice();
  if (t.length > lvl && removed.slice(0, lvl).every((v, k) => v === t[k]) && t[lvl] > removed[lvl]) t[lvl] -= 1;
  return t;
};

/** Reparent the node at `draggedPath` to be the last child of the node at
 *  `targetPath`. Returns null when the drop is invalid (onto itself or one of its
 *  own descendants). */
export function reparentFeature(list: FeatureNode[], draggedPath: number[], targetPath: number[]): FeatureNode[] | null {
  if (isPrefixPath(draggedPath, targetPath)) return null;   // into self / a descendant
  const dragged = featureAt(list, draggedPath);
  if (!dragged) return null;
  const without = removeFeatureAt(list, draggedPath);
  return addChildAt(without, adjustAfterRemoval(targetPath, draggedPath), dragged);
}

/** Move the node at `draggedPath` to top level (last root), or null if invalid. */
export function unparentFeature(list: FeatureNode[], draggedPath: number[]): FeatureNode[] | null {
  if (draggedPath.length <= 1) return null;                 // already a root
  const dragged = featureAt(list, draggedPath);
  if (!dragged) return null;
  return [...removeFeatureAt(list, draggedPath), dragged];
}

/** Swap the node at `path` with its sibling `dir` steps away (−1 up, +1 down);
 *  a no-op at the ends. */
export function moveFeatureAt(list: FeatureNode[], path: number[], dir: number): FeatureNode[] {
  const parent = path.slice(0, -1);
  const i = path[path.length - 1];
  const j = i + dir;
  const swap = (arr: FeatureNode[]): FeatureNode[] => {
    if (j < 0 || j >= arr.length) return arr;
    const next = arr.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  if (parent.length === 0) return swap(list);
  return updateFeatureAt(list, parent, (n) => ({ ...n, children: swap(n.children ?? []) }));
}

/** Serialize a hand-edited feature tree back into the stored JSON shape. */
export function serializeFeatures(features: FeatureNode[]): string {
  return JSON.stringify({ features }, null, 2);
}
