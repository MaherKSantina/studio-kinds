/** GOLDEN RULES for asking a frame to change — the model speaks in ops from
 *  a closed vocabulary; applying them can only produce what the inspector
 *  could, and everything that cannot be done is said, not thrown. */
import { describe, expect, it } from "vitest";
import {
  FRAME_ASK_OPS, FRAME_ASK_SCHEMA, applyFrameOps, coerceProp, frameAskSystem, frameAskUser, parseFrameAskReply, parseProps,
} from "../lib/frameAsk";
import { childrenOf, frameProblems, parseFrame, viewById } from "../lib/frameDoc";

const LOGIN = `frames:
  - {id: f1, name: Login, width: 390, height: 844}
nodes:
  - {id: root, frame: f1, name: Root, kind: vstack, expand: true, props: {gap: 12, padding: 20}}
  - {id: title, frame: f1, parent: root, name: Title, kind: text, props: {text: Welcome back, fontSize: 18}}
  - {id: email, frame: f1, parent: root, name: Email, kind: input, props: {placeholder: Email}}
  - {id: foot, frame: f1, parent: root, name: Footer, kind: hstack}
views:
  - {id: v1, name: Loading, hidden: [foot]}
`;
const NONE = { viewId: null, nodeId: null };

describe("applyFrameOps", () => {
  const doc = parseFrame(LOGIN);

  it("add lands in the target's container after the named sibling, props coerced; a button shows its name", () => {
    const r = applyFrameOps(doc, [{
      op: "add", kind: "button", name: "Continue", after: "email",
      props: "background: #2563eb; fontSize: 16",
    }], { viewId: null, nodeId: "title" });
    expect(childrenOf(r.doc, "root").map((n) => n.id)).toEqual(["title", "email", r.focusId, "foot"]);
    const b = r.doc.nodes.find((n) => n.id === r.focusId)!;
    expect(b.props).toMatchObject({ text: "Continue", background: "#2563eb", fontSize: 16 });
    expect(r.skipped).toEqual([]);
    expect(r.applied).toEqual([`added button Continue (${r.focusId}) into Root (root)`]);
    expect(frameProblems(r.doc)).toEqual([]);
  });

  it("an omitted parent is the target when it holds children, else the target's parent; \"\" is the frame", () => {
    const into = applyFrameOps(doc, [{ op: "add", kind: "text" }], { viewId: null, nodeId: "foot" });
    expect(into.doc.nodes.find((n) => n.id === into.focusId)!.parent).toBe("foot");
    const beside = applyFrameOps(doc, [{ op: "add", kind: "text" }], { viewId: null, nodeId: "email" });
    expect(beside.doc.nodes.find((n) => n.id === beside.focusId)!.parent).toBe("root");
    const onFrame = applyFrameOps(doc, [{ op: "add", kind: "text", parent: "" }], { viewId: null, nodeId: "title" });
    expect(onFrame.doc.nodes.find((n) => n.id === onFrame.focusId)!.parent).toBeUndefined();
  });

  it("update merges props, \"\" removes one, sizing flags stay exclusive, a note lands in meta", () => {
    const r = applyFrameOps(doc, [{
      op: "update", id: "title", props: "fontSize: 28; text: ",
      sizing: "fixed", height: 60, note: "bigger, per Sam",
    }], NONE);
    const t = r.doc.nodes.find((n) => n.id === "title")!;
    expect(t.props).toEqual({ fontSize: 28 });
    expect(t).toMatchObject({ fixed: true, height: 60, meta: { note: "bigger, per Sam" } });
    expect(t.expand).toBeUndefined();
    expect(r.applied[0]).toBe("updated Title (title): note: bigger, per Sam, fontSize=28, text removed, fixed, height 60");
  });

  it("a unique name works as a ref; unknown ids, leaf parents and self-moves are skipped with a reason", () => {
    const r = applyFrameOps(doc, [
      { op: "update", id: "Email", props: "placeholder: Work email" },
      { op: "remove", id: "ghost" },
      { op: "add", kind: "text", parent: "title" },
      { op: "move", id: "root", parent: "foot" },
    ], NONE);
    expect(r.doc.nodes.find((n) => n.id === "email")!.props.placeholder).toBe("Work email");
    expect(r.applied).toHaveLength(1);
    expect(r.skipped).toEqual([
      'remove: unknown node "ghost"',
      "add text: Title (title) is a text — it holds no children",
      "move Root (root): refused (a node cannot move into its own subtree)",
    ]);
  });

  it("the file's own fixed/expand flags work as a sizing shorthand", () => {
    const r = applyFrameOps(doc, [{ op: "add", kind: "button", name: "Go", fixed: true, height: 52 }, { op: "update", id: "foot", expand: true }], NONE);
    expect(r.doc.nodes.find((n) => n.id === r.focusId)).toMatchObject({ fixed: true, height: 52 });
    expect(r.doc.nodes.find((n) => n.id === "foot")).toMatchObject({ expand: true });
    expect(r.applied[1]).toBe("updated Footer (foot): expand");
  });

  it("a reply nests new nodes under new nodes through handles, and names its duplicates", () => {
    const r = applyFrameOps(doc, [
      { op: "add", as: "list", kind: "vstack", parent: "root", after: "title", props: "gap: 8" },
      { op: "add", id: "row1", kind: "hstack", parent: "list" },
      { op: "add", kind: "text", parent: "row1", name: "Label" },
      { op: "add", kind: "spacer", parent: "row1" },
      { op: "duplicate", id: "row1", as: "row2" },
      { op: "update", id: "row2", name: "Row 2" },
      { op: "hide", ids: ["row2"], view: "Loading" },
    ], NONE);
    expect(r.skipped).toEqual([]);
    const list = childrenOf(r.doc, "root")[1];
    expect(list.kind).toBe("vstack");
    const rows = childrenOf(r.doc, list.id);
    expect(rows.map((n) => n.kind)).toEqual(["hstack", "hstack"]);
    expect(rows[1].name).toBe("Row 2");
    expect(childrenOf(r.doc, rows[1].id).map((n) => n.kind)).toEqual(["text", "spacer"]);
    expect(viewById(r.doc, "v1")!.hidden).toContain(rows[1].id);
    expect(frameProblems(r.doc)).toEqual([]);
  });

  it("move reorders or reparents through placeNode", () => {
    const r = applyFrameOps(doc, [{ op: "move", id: "foot", after: "" }, { op: "move", id: "title", parent: "foot" }], NONE);
    expect(childrenOf(r.doc, "root").map((n) => n.id)).toEqual(["foot", "email"]);
    expect(childrenOf(r.doc, "foot").map((n) => n.id)).toEqual(["title"]);
  });

  it("hide/show act in the target view or a named one, are idempotent, and refuse on Base", () => {
    const base = applyFrameOps(doc, [{ op: "hide", ids: ["title"] }], NONE);
    expect(base.skipped[0]).toMatch(/no view/);
    const inView = applyFrameOps(doc, [{ op: "hide", ids: ["title"] }, { op: "show", ids: ["foot"], view: "Loading" }], { viewId: "v1", nodeId: null });
    expect(viewById(inView.doc, "v1")!.hidden).toEqual(["title"]);
    const again = applyFrameOps(inView.doc, [{ op: "hide", ids: ["title"] }], { viewId: "v1", nodeId: null });
    expect(viewById(again.doc, "v1")!.hidden).toEqual(["title"]);
  });

  it("add_view creates a state and focuses it; frame and doc ops patch the top level", () => {
    const r = applyFrameOps(doc, [
      { op: "add_view", name: "Error", ids: ["email"] },
      { op: "frame", width: 430, height: 932 },
      { op: "doc", title: "Login" },
    ], NONE);
    expect(r.doc.views.map((v) => v.name)).toEqual(["Loading", "Error"]);
    expect(r.focusViewId).toBe("v2");
    expect(viewById(r.doc, "v2")!.hidden).toEqual(["email"]);
    expect(r.doc.frames[0]).toMatchObject({ width: 430, height: 932 });
    expect(r.doc.title).toBe("Login");
    expect(r.skipped).toEqual([]);
  });
});

describe("what the model sees and says", () => {
  it("the system prompt carries the legend and every op; the user message names the target and the compact frame", () => {
    const sys = frameAskSystem();
    for (const op of FRAME_ASK_OPS) expect(sys).toContain(`${op} {`);
    expect(sys).toContain("CROSS axis always stretches");
    expect(sys).not.toContain("\n# ");
    const user = frameAskUser(parseFrame(LOGIN), { viewId: "v1", nodeId: "title" }, "make it bigger",
      [{ instruction: "add a title", say: "Added a title.", result: "applied 1; skipped 1: unknown parent \"row1\"" }]);
    expect(user).toContain("TARGET view: Loading (v1)");
    expect(user).toContain("TARGET node: Title (title, text, in root)");
    expect(user).toContain("user: add a title\nyou: Added a title. [applied 1; skipped 1: unknown parent \"row1\"]");
    expect(user).toMatch(/- \{[^\n]*id: title[^\n]*kind: text[^\n]*\}/);
    expect(user.endsWith("INSTRUCTION: make it bigger")).toBe(true);
  });

  it("the schema names exactly the ops the applier knows; replies and prop values read leniently", () => {
    expect(FRAME_ASK_SCHEMA.properties.ops.items.properties.op.enum).toEqual([...FRAME_ASK_OPS]);
    expect(parseFrameAskReply({ say: "ok", ops: [{ op: "remove", id: "x" }, { nope: 1 }, "junk", { op: "fly" }] }))
      .toEqual({ say: "ok", ops: [{ op: "remove", id: "x" }] });
    expect(parseFrameAskReply("garbage")).toEqual({ say: "", ops: [] });
    // A model writes what comes naturally: aliases, an object for props, a lone id for ids, numbers as text.
    expect(parseFrameAskReply({ message: "ok", edits: [
      { action: "Delete", node: "x" },
      { op: "update", id: 7, props: { fontSize: 24, text: "Save" }, width: "200", fixed: "true" },
      { op: "hide", ids: "title", view: null },
      { op: "add", kind: " Button ", props: [{ key: "text", value: "Go" }], after: null },
      { op: "fly" }, "junk",
    ] })).toEqual({ say: "ok", ops: [
      { op: "remove", id: "x" },
      { op: "update", id: "7", props: "fontSize: 24; text: Save", width: 200, fixed: true },
      { op: "hide", ids: ["title"] },
      { op: "add", kind: "button", props: "text: Go" },
    ] });
    expect(coerceProp("text", "2024")).toBe("2024");
    expect(coerceProp("gap", "12")).toBe(12);
    expect(coerceProp("wrap", "true")).toBe(true);
    expect(coerceProp("gap", "")).toBeUndefined();
    expect(coerceProp("color", "#ffffff")).toBe("#ffffff");
    const props = parseProps("src: https://x.test/a.png; gap: 12 ; wrap: true; color: ; junk")!;
    expect(props).toEqual({ src: "https://x.test/a.png", gap: 12, wrap: true, color: undefined });
    expect(Object.keys(props)).toContain("color");
    expect(parseProps("  ")).toBeNull();
  });
});
