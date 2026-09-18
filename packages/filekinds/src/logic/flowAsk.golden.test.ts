/** GOLDEN RULES for asking a flow to change — ops from a closed vocabulary go
 *  through the flow's own mutators, references are the words a person uses
 *  (titles, labels, event names), the views half is never touched, and what
 *  cannot be done is said, not thrown. */
import { describe, expect, it } from "vitest";
import {
  FLOW_ASK_OPS, FLOW_ASK_SCHEMA, applyFlowOps, flowAskSystem, flowAskUser, parseFlowAskReply, parseWhenText,
} from "../lib/flowAsk";
import { parseFlowFile, splitFlowFile } from "../lib/flowEngine";
import { framePanelOf, panelsOf } from "../lib/flowOps";

const SHOP = `title: Shop
dimensions:
  featureFlag: [true, false]
defaults:
  featureFlag: true
initial: home
screens:
  - id: home
    title: Home
    screenshot: home.png
    edges:
      - id: e1
        event: Checkout
        to: checkout
  - id: checkout
    title: Checkout
    variants:
      - when: { featureFlag: true }
        label: With flag
        screenshot: co-flag.png
      - when: "*"
        label: Default
        screenshot: co.png
---
active: v1
views:
  - id: v1
    name: Main
    layout: { tab: screens }
`;
const NONE = { screenId: null, stateIndex: null };

describe("applyFlowOps", () => {
  it("a screen showing a frame's view, a control to it by handle, a state before the catch-all — views untouched", () => {
    const r = applyFlowOps(SHOP, [
      { op: "add_screen", title: "Payment", frame: "pay.frame", view: "Base", as: "pay" },
      { op: "add_control", screen: "Checkout", event: "Pay", to: "pay", when: "featureFlag: true" },
      { op: "add_state", screen: "pay", label: "Failed", when: "featureFlag: false", frame: "pay.frame", view: "Error" },
      { op: "add_state", screen: "pay", label: "Any", when: "*", frame: "pay.frame" },
    ], NONE);
    expect(r.skipped).toEqual([]);
    expect(r.applied).toHaveLength(4);
    const { body } = parseFlowFile(r.content);
    const pay = body.screens.find((s) => s.title === "Payment")!;
    expect(pay).toBeTruthy();
    expect(framePanelOf(panelsOf(pay))).toEqual({ kind: "frame", path: "pay.frame", view: "Base", label: null });
    expect(splitFlowFile(r.content).modelText).toContain("frame: pay.frame");
    expect(splitFlowFile(r.content).viewsText.trim()).toBe(splitFlowFile(SHOP).viewsText.trim());
    const edge = body.edges.find((e) => e.event === "Pay")!;
    expect(edge.from).toBe("checkout");
    expect(edge.to).toBe(pay.id);
    expect(edge.when).toEqual({ featureFlag: true });
    // The catch-all stays last: "Failed" then "Any".
    expect(pay.variants.map((v) => v.label)).toEqual(["Failed", "Any"]);
    expect(framePanelOf(panelsOf(pay.variants[0]))?.view).toBe("Error");
    expect(r.focusScreenId).toBe(pay.id);
  });

  it("states and controls are addressed by label and event; a view alone re-points the frame; \"\" makes a control stay", () => {
    const withFrame = applyFlowOps(SHOP, [{ op: "update_state", screen: "Checkout", state: "Default", frame: "co.frame", view: "Base" }], NONE);
    const r = applyFlowOps(withFrame.content, [
      { op: "update_state", screen: "Checkout", state: "2", view: "Loading" },
      { op: "update_control", control: "Checkout", screen: "Home", to: "", sets: "featureFlag: false" },
      { op: "add_control", screen: "Home", event: "Go", dispatch: "featureFlag: false -> Home; * -> Checkout" },
    ], NONE);
    expect(r.skipped).toEqual([]);
    const { body } = parseFlowFile(r.content);
    const checkout = body.screens.find((s) => s.id === "checkout")!;
    expect(framePanelOf(panelsOf(checkout.variants[1]))).toEqual({ kind: "frame", path: "co.frame", view: "Loading", label: null });
    const e1 = body.edges.find((e) => e.id === "e1")!;
    expect(e1.to).toBe("");
    expect(e1.sets).toEqual({ featureFlag: false });
    const go = body.edges.find((e) => e.event === "Go")!;
    expect(go.dispatch.map((b) => [b.when, b.to])).toEqual([[{ featureFlag: false }, "home"], [{}, "checkout"]]);
  });

  it("dimensions, locals, the start screen and the title", () => {
    const r = applyFlowOps(SHOP, [
      { op: "set_dimension", name: "plan", values: "free|pro", default: "free" },
      { op: "set_local", screen: "Checkout", name: "agreed", values: "false|true" },
      { op: "set_initial", screen: "Checkout" },
      { op: "set_title", title: "Shop v2" },
      { op: "remove_dimension", name: "featureFlag" },
    ], NONE);
    expect(r.skipped).toEqual([]);
    const { body, doc } = parseFlowFile(r.content);
    expect(body.dimensions.plan).toEqual(["free", "pro"]);
    expect(body.defaults.plan).toBe("free");
    expect(body.dimensions.featureFlag).toBeUndefined();
    expect(body.screens.find((s) => s.id === "checkout")!.locals.agreed).toEqual([false, true]);
    expect(body.initial).toBe("checkout");
    expect(doc.title).toBe("Shop v2");
  });

  it("the target fills in the screen and state; refusals are said, in order, and leave the rest applied", () => {
    const r = applyFlowOps(SHOP, [
      { op: "update_state", label: "With the flag" },
      { op: "add_screen", title: "Home" },
      { op: "remove_control", control: "Nope" },
      { op: "add_control", screen: "Elsewhere", event: "X" },
    ], { screenId: "checkout", stateIndex: 0 });
    expect(r.applied).toEqual(['updated state "With flag" of "Checkout"']);
    expect(r.skipped).toEqual([
      'add_screen: a screen named "Home" already exists; screen titles must be unique',
      'remove_control: unknown control "Nope"',
      'add_control: unknown screen "Elsewhere"',
    ]);
    expect(parseFlowFile(r.content).body.screens[1].variants[0].label).toBe("With the flag");
  });

  it("nothing applied = the text is returned untouched", () => {
    const r = applyFlowOps(SHOP, [{ op: "remove_screen", screen: "Ghost" }], NONE);
    expect(r.content).toBe(SHOP);
    expect(r.skipped).toEqual(['remove_screen: unknown screen "Ghost"']);
  });
});

describe("what the model sees and says", () => {
  it("the system prompt names every op; the user message carries the target, the frames, the model half and no views", () => {
    const sys = flowAskSystem();
    for (const op of FLOW_ASK_OPS) expect(sys).toContain(`${op} {`);
    const user = flowAskUser(SHOP, { screenId: "checkout", stateIndex: 1 }, "make it show the error view", [{ instruction: "add a screen", say: "Added.", result: "applied 1" }],
      [{ path: "pay.frame", views: [{ id: "v1", name: "Error" }] }]);
    expect(user).toContain("TARGET screen: Checkout (checkout)");
    expect(user).toContain("TARGET state: Default (#2)");
    expect(user).toContain("- pay.frame: views Error (v1)");
    expect(user).toContain("you: Added. [applied 1]");
    expect(user).toContain("screens:");
    expect(user).not.toContain("active: v1");
    expect(user.endsWith("INSTRUCTION: make it show the error view")).toBe(true);
  });

  it("replies read leniently: aliases, objects for conditions, lists for values; the grammar parses", () => {
    expect(FLOW_ASK_SCHEMA.properties.ops.items.properties.op.enum).toEqual([...FLOW_ASK_OPS]);
    const r = parseFlowAskReply({ message: "ok", edits: [
      { action: "add_edge", screen: "Home", event: "Go", to: "checkout", when: { featureFlag: true, plan: ["a", "b"] } },
      { op: "set_dimension", name: "plan", values: ["free", "pro"] },
      { op: "add_state", screen: "Home", label: "L", when: "*", initial: "true" },
      { op: "fly" }, "junk",
    ] });
    expect(r.say).toBe("ok");
    expect(r.ops).toEqual([
      { op: "add_control", screen: "Home", event: "Go", to: "checkout", when: "featureFlag: true; plan: a|b" },
      { op: "set_dimension", name: "plan", values: "free|pro" },
      { op: "add_state", screen: "Home", label: "L", when: "*", initial: true },
    ]);
    expect(parseWhenText("featureFlag: true; plan: a|b; n: 3; not: !x")).toEqual({ featureFlag: true, plan: ["a", "b"], n: 3, not: "!x" });
    expect(parseWhenText("*")).toBeUndefined();
    expect(parseWhenText("")).toBeUndefined();
  });
});
