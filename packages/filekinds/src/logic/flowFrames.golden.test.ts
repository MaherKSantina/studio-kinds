/** GOLDEN RULES for frames kept INSIDE a flow — moved in from a file under their
 *  stem with every state re-pointed (or a new screen added when none showed it:
 *  a moved frame is a SCREEN of the flow), resolved by bare name before any file,
 *  edited in place as `.frame` text, the views half never touched. */
import { describe, expect, it } from "vitest";
import { addScreenForInlineFrame, frameNameFor, inlineFrameNames, inlineFrameText, moveFrameIntoFlow, removeInlineFrame, statesShowingInlineFrame, withInlineFrameText } from "../lib/flowFrames";
import { parseFlowFile, splitFlowFile } from "../lib/flowEngine";
import { parseFlow, readFlow, resolvePanelTarget } from "../lib/flowOps";
import { parseFrame } from "../lib/frameDoc";

const FRAME = `title: Login
frames:
  - {id: f1, name: Login, width: 390, height: 844}
nodes:
  - {id: root, frame: f1, name: Root, kind: vstack, expand: true}
  - {id: t, frame: f1, parent: root, name: Title, kind: text, props: {text: Hi}}
views:
  - {id: v1, name: Loading, hidden: [t]}
`;
const FLOW = `title: T
initial: a
screens:
  - id: a
    title: A
    frame: login.frame
    view: v1
  - id: b
    title: B
    variants:
      - when: "*"
        label: X
        content:
          - { frame: ./login.frame }
          - { screenshot: s.png }
---
active: v1
views:
  - id: v1
    name: W
    layout: { tab: screens }
`;

describe("moveFrameIntoFlow", () => {
  it("puts the frame under its stem, re-points every state that showed the file, keeps the views half", () => {
    const r = moveFrameIntoFlow(FLOW, FRAME, "/p/login.frame");
    expect(r.name).toBe("login");
    expect(r.rewired).toBe(2);
    expect(r.screen).toBeNull(); // the states that showed the file show it now — no extra screen
    const { modelText, viewsText } = splitFlowFile(r.flowText);
    expect(modelText).not.toContain("login.frame");
    expect(modelText).toContain("frames:");
    expect(viewsText.trim()).toBe(splitFlowFile(FLOW).viewsText.trim());
    const { body } = parseFlowFile(r.flowText);
    expect(Object.keys(body.frames)).toEqual(["login"]);
    expect(body.screens[0].content).toEqual([{ kind: "frame", path: "login", view: "v1", label: null }]);
    expect(body.screens[1].variants[0].content[0]).toEqual({ kind: "frame", path: "login", view: null, label: null });
    // An inline frame needs no file: nothing to fetch.
    expect(resolvePanelTarget(body.screens[0].content[0], body)).toBeNull();
    expect(resolvePanelTarget({ kind: "frame", path: "other.frame", view: null, label: null }, body)).toEqual({ agent: null, path: "other.frame" });
    // The frame came through whole.
    const inline = parseFrame(inlineFrameText(r.flowText, "login")!);
    expect(inline.nodes).toEqual(parseFrame(FRAME).nodes);
    expect(inline.views).toEqual(parseFrame(FRAME).views);
  });

  it("a frame below the flow's folder is re-pointed by its path from there", () => {
    const flow = FLOW.replace("frame: login.frame", "frame: screens/login.frame").replace("{ frame: ./login.frame }", "{ frame: ./screens/login.frame }");
    const r = moveFrameIntoFlow(flow, FRAME, "/p/screens/login.frame", "/p/main.flow");
    expect(r.rewired).toBe(2);
    expect(splitFlowFile(r.flowText).modelText).not.toContain("login.frame");
    // Without the flow's path, only the bare file name is known — those references stay.
    expect(moveFrameIntoFlow(flow, FRAME, "/p/screens/login.frame").rewired).toBe(0);
  });

  it("a frame no state showed becomes a NEW SCREEN of the flow — the initial one when the flow had none", () => {
    const r = moveFrameIntoFlow(FLOW, FRAME, "/p/other.frame");
    expect(r.rewired).toBe(0);
    expect(r.screen).toBeTruthy();
    const { body } = parseFlowFile(r.flowText);
    const added = body.screens.find((s) => s.id === r.screen)!;
    expect(added.title).toBe("Login"); // the frame's title
    expect(added.content).toEqual([{ kind: "frame", path: "other", view: null, label: null }]);
    expect(body.initial).toBe("a"); // the flow already had an initial screen — kept
    expect(statesShowingInlineFrame(parseFlow(r.flowText), "other")).toBe(1);
    // Into an empty flow: the screen is the initial one, titled after the stem when the frame has no title.
    const bare = moveFrameIntoFlow("title: Empty\n", FRAME.replace("title: Login\n", ""), "/p/first.frame");
    const empty = parseFlowFile(bare.flowText).body;
    expect(empty.screens.map((s) => s.title)).toEqual(["first"]);
    expect(empty.initial).toBe(bare.screen);
    // A title already taken gets the frame's name appended rather than failing the move.
    const twice = moveFrameIntoFlow(r.flowText, FRAME, "/q/another.frame");
    expect(twice.screen).toBeTruthy();
    expect(parseFlowFile(twice.flowText).body.screens.map((s) => s.title)).toContain("Login (another)");
    // Adding a screen for a frame by hand, later: same rule; a frame that is not there is refused.
    const doc = parseFlow(r.flowText);
    expect(addScreenForInlineFrame(doc, "nope").ok).toBe(false);
    expect(addScreenForInlineFrame(doc, "other").ok).toBe(true);
    expect(statesShowingInlineFrame(doc, "other")).toBe(2);
  });

  it("a second frame of the same stem gets a numbered name; a non-frame is refused", () => {
    const once = moveFrameIntoFlow(FLOW, FRAME, "/p/login.frame").flowText;
    expect(frameNameFor(parseFlow(once), "/q/login.frame")).toBe("login-2");
    expect(inlineFrameNames(parseFlow(moveFrameIntoFlow(once, FRAME, "/q/login.frame").flowText))).toEqual(["login", "login-2"]);
    expect(() => moveFrameIntoFlow(FLOW, "title: nothing here\n", "/p/x.frame")).toThrow(/not a frame/);
  });
});

describe("editing an inline frame in place", () => {
  it("hands Frame Studio the frame as .frame text and writes the edit back into the flow only", () => {
    const flow = moveFrameIntoFlow(FLOW, FRAME, "/p/login.frame").flowText;
    const text = inlineFrameText(flow, "login")!;
    expect(text.startsWith("# .frame — ONE screen")).toBe(true);
    expect(inlineFrameText(flow, "nope")).toBeNull();
    const edited = text.replace("title: Login", "title: Sign in");
    const next = withInlineFrameText(flow, "login", edited);
    const { body } = parseFlowFile(next);
    expect((body.frames.login as { title?: string }).title).toBe("Sign in");
    expect(body.screens.map((s) => s.title)).toEqual(["A", "B"]);
    expect(splitFlowFile(next).viewsText.trim()).toBe(splitFlowFile(FLOW).viewsText.trim());
    expect(readFlow(parseFlow(next)).frames.login).toBeTruthy();
    // Removing it leaves the model without a `frames` map and the views half as it was.
    const gone = removeInlineFrame(next, "login");
    expect(inlineFrameNames(parseFlow(gone))).toEqual([]);
    expect(splitFlowFile(gone).modelText).not.toContain("frames:");
    expect(removeInlineFrame(gone, "login")).toBe(gone);
  });
});
