/** GOLDEN RULES for a flow state that shows a FRAME — one panel drawn live at
 *  one of the frame's views: read from the shorthand or from `content`,
 *  written back as the shorthand when it stands alone, resolved beside the
 *  flow, merged over a state's other panels without losing them. */
import { describe, expect, it } from "vitest";
import {
  type FlowPanel, framePanelOf, mergeStatePanels, parseFlow, readFlow, readPanels, resolvePanelTarget, shotsOf, writePanels,
} from "../lib/flowOps";

describe("frame panels", () => {
  it("read from the shorthand and from content; views are optional", () => {
    expect(readPanels({ frame: "login.frame", view: "Loading" })).toEqual([{ kind: "frame", path: "login.frame", view: "Loading", label: null }]);
    expect(readPanels({ frame: "login.frame" })).toEqual([{ kind: "frame", path: "login.frame", view: null, label: null }]);
    expect(readPanels({ content: [{ frame: "a.frame", view: "v2", label: "The screen" }, "shot.png", { file: "notes.brief" }] })).toEqual([
      { kind: "frame", path: "a.frame", view: "v2", label: "The screen" },
      { kind: "screenshot", key: "shot.png", label: null },
      { kind: "file", path: "notes.brief", agent: null, source: null, label: null },
    ]);
    // A screenshot beats the shorthand when both are authored — content spells it out.
    expect(readPanels({ screenshot: "s.png", frame: "a.frame" })).toEqual([{ kind: "screenshot", key: "s.png", label: null }]);
  });

  it("a lone frame writes back as the shorthand; with company it goes into content; other spellings are cleared", () => {
    const target: Record<string, unknown> = { screenshot: "old.png", screenshots: ["a", "b"] };
    writePanels(target, [{ kind: "frame", path: "login.frame", view: "Loading", label: null }]);
    expect(target).toEqual({ frame: "login.frame", view: "Loading" });
    writePanels(target, [{ kind: "frame", path: "login.frame", view: null, label: null }, { kind: "screenshot", key: "s.png", label: null }]);
    expect(target).toEqual({ content: [{ frame: "login.frame" }, { screenshot: "s.png" }] });
    writePanels(target, [{ kind: "screenshot", key: "s.png", label: null }]);
    expect(target).toEqual({ screenshot: "s.png" });
    writePanels(target, []);
    expect(target).toEqual({});
  });

  it("resolves beside the flow, is not a screenshot, and survives the model round trip", () => {
    const body = readFlow(parseFlow("screens:\n  - id: a\n    title: A\n    frame: ./login.frame\n    view: Base\n"));
    const panel = body.screens[0].content[0];
    expect(panel.kind).toBe("frame");
    expect(resolvePanelTarget(panel, body)).toEqual({ agent: null, path: "login.frame" });
    expect(shotsOf(body.screens[0])).toEqual([]);
    expect(framePanelOf(body.screens[0].content)?.view).toBe("Base");
  });

  it("the dialog's merge keeps file panels, replaces shots in order, puts the frame first, removes it on null", () => {
    const existing: FlowPanel[] = [
      { kind: "screenshot", key: "one.png", label: "top" },
      { kind: "file", path: "notes.brief", agent: null, source: null, label: null },
      { kind: "frame", path: "old.frame", view: "v1", label: "old" },
    ];
    expect(mergeStatePanels(existing, { screenshots: ["one.png", "two.png"], frame: { path: "new.frame", view: "Loading" } })).toEqual([
      { kind: "frame", path: "new.frame", view: "Loading", label: "old" },
      { kind: "screenshot", key: "one.png", label: "top" },
      { kind: "file", path: "notes.brief", agent: null, source: null, label: null },
      { kind: "screenshot", key: "two.png", label: null },
    ]);
    expect(mergeStatePanels(existing, { screenshots: [], frame: null })).toEqual([
      { kind: "file", path: "notes.brief", agent: null, source: null, label: null },
    ]);
  });
});
