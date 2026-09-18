/** GOLDEN RULES for the frame EDIT helpers — every mutation keeps the
 *  document well-formed: sizing flags exclusive, subtrees move as one, views
 *  forget deleted nodes. */
import { describe, expect, it } from "vitest";
import { childrenOf, frameProblems, parseFrame } from "../lib/frameDoc";
import {
  addNode, addView, duplicateNode, indentNode, moveNode, outdentNode, placeNode, removeNode, reparentNode, setFrame, toggleHidden, updateNode,
} from "../lib/frameEdit";

const FRAME = `frames:
  - {id: f1, name: F, width: 390, height: 844}
nodes:
  - {id: root, frame: f1, name: Root, kind: vstack, expand: true}
  - {id: a, frame: f1, parent: root, name: A, kind: text}
  - {id: b, frame: f1, parent: root, name: B, kind: hstack}
  - {id: b1, frame: f1, parent: b, name: B1, kind: text}
  - {id: c, frame: f1, parent: root, name: C, kind: text}
views:
  - {id: v1, name: V, hidden: [b]}
`;

describe("frame edits", () => {
  const doc = parseFrame(FRAME);

  it("fixed and expand stay exclusive; clearing a size drops the key", () => {
    const d = updateNode(doc, "root", { fixed: true, height: 100 });
    const root = d.nodes.find((n) => n.id === "root")!;
    expect(root.fixed).toBe(true);
    expect(root.expand).toBeUndefined();
    expect(root.height).toBe(100);
    const cleared = updateNode(d, "root", { height: undefined, expand: true });
    expect(cleared.nodes.find((n) => n.id === "root")).toMatchObject({ expand: true });
    expect(cleared.nodes.find((n) => n.id === "root")!.height).toBeUndefined();
    expect(cleared.nodes.find((n) => n.id === "root")!.fixed).toBeUndefined();
  });

  it("adding lands last in the parent; a fresh file gets its frame first", () => {
    const { doc: d, id } = addNode(doc, "b", "button");
    expect(id).toBe("n1");
    expect(childrenOf(d, "b").map((n) => n.id)).toEqual(["b1", "n1"]);
    const fresh = addNode(parseFrame(""), null, "vstack");
    expect(fresh.doc.frames).toHaveLength(1);
    expect(fresh.doc.nodes[0].frame).toBe("f1");
  });

  it("removing takes the subtree and cleans the views", () => {
    const d = removeNode(doc, "b");
    expect(d.nodes.map((n) => n.id)).toEqual(["root", "a", "c"]);
    expect(d.views[0].hidden).toEqual([]);
  });

  it("duplicate copies the subtree with fresh ids, right after the original", () => {
    const { doc: d, id } = duplicateNode(doc, "b");
    expect(childrenOf(d, "root").map((n) => n.id)).toEqual(["a", "b", id, "c"]);
    const copyKids = childrenOf(d, id);
    expect(copyKids).toHaveLength(1);
    expect(copyKids[0].name).toBe("B1");
    expect(frameProblems(d)).toEqual([]);
  });

  it("move swaps siblings, subtrees travelling whole; indent/outdent re-nest", () => {
    const down = moveNode(doc, "a", 1);
    expect(childrenOf(down, "root").map((n) => n.id)).toEqual(["b", "a", "c"]);
    expect(down.nodes.map((n) => n.id)).toEqual(["root", "b", "b1", "a", "c"]);
    const nested = indentNode(doc, "c"); // under b, which can hold children
    expect(childrenOf(nested, "b").map((n) => n.id)).toEqual(["b1", "c"]);
    const lifted = outdentNode(nested, "b1"); // out of b, right after it; c stays inside b
    expect(childrenOf(lifted, "root").map((n) => n.id)).toEqual(["a", "b", "b1"]);
    expect(childrenOf(lifted, "b").map((n) => n.id)).toEqual(["c"]);
    expect(indentNode(doc, "b")).toBe(doc); // `a` is a text: cannot hold children
  });

  it("reparent refuses a target inside the moving subtree or a leaf", () => {
    expect(reparentNode(doc, "root", "b")).toBe(doc);
    expect(reparentNode(doc, "a", "c")).toBe(doc);
    const d = reparentNode(doc, "a", "b");
    expect(childrenOf(d, "b").map((n) => n.id)).toEqual(["b1", "a"]);
  });

  it("views: add, toggle hidden; setFrame patches the one frame", () => {
    const { doc: d, id } = addView(doc, "Empty");
    expect(id).toBe("v2");
    const t = toggleHidden(d, id, "a");
    expect(t.views[1].hidden).toEqual(["a"]);
    expect(toggleHidden(t, id, "a").views[1].hidden).toEqual([]);
    expect(setFrame(doc, { width: 1440 }).frames[0]).toMatchObject({ id: "f1", width: 1440, height: 844 });
  });
});

describe("placeNode", () => {
  const doc = parseFrame(FRAME);

  it("lands exactly where asked — first, after a sibling, last — in the same parent or another", () => {
    expect(childrenOf(placeNode(doc, "c", "root", null), "root").map((n) => n.id)).toEqual(["c", "a", "b"]);
    expect(childrenOf(placeNode(doc, "a", "root", "b"), "root").map((n) => n.id)).toEqual(["b", "a", "c"]);
    expect(childrenOf(placeNode(doc, "a", "b", null), "b").map((n) => n.id)).toEqual(["a", "b1"]);
    expect(childrenOf(placeNode(doc, "a", "b", "b1"), "b").map((n) => n.id)).toEqual(["b1", "a"]);
    expect(childrenOf(placeNode(doc, "a", "b"), "b").map((n) => n.id)).toEqual(["b1", "a"]);
    expect(childrenOf(placeNode(doc, "a", "b", "ghost"), "b").map((n) => n.id)).toEqual(["b1", "a"]);
    expect(childrenOf(placeNode(doc, "c", null, null), null).map((n) => n.id)).toEqual(["c", "root"]);
    expect(frameProblems(placeNode(doc, "a", "b", "b1"))).toEqual([]);
  });

  it("refuses a move into its own subtree or into a leaf, and an unknown node", () => {
    expect(placeNode(doc, "root", "b")).toBe(doc);
    expect(placeNode(doc, "a", "c")).toBe(doc);
    expect(placeNode(doc, "nope", "b")).toBe(doc);
  });
});
