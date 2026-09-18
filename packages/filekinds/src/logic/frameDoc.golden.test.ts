/** GOLDEN RULES for the frame kind — one frame, a flexbox node tree, views
 *  that hide subtrees, versions as full snapshots, lenient parsing. */
import { describe, expect, it } from "vitest";
import {
  FRAME_LEGEND, type FrameNode, axisOf, childrenOf, createFrameVersion, dumpFrame, dumpFrameCompact, fillsMainAxis, frameOf, frameProblems, frameSnapshotAt, hiddenIn,
  injectionsOf, newFrameDoc, nextFrameId, parseFrame, slotsOf, visibleNodes,
} from "../lib/frameDoc";

const DASHBOARD = `title: Dashboard
frames:
  - id: f1
    name: Dashboard
    width: 1440
    height: 900
nodes:
  - id: shell
    frame: f1
    name: App Shell
    kind: embed
    props:
      ref_path: scaffold.frame
    expand: true
  - id: page
    frame: f1
    parent: shell
    name: Page
    kind: vstack
    props:
      slot: content
      gap: 18
      padding: 28
    expand: true
  - id: title
    frame: f1
    parent: page
    name: Title
    kind: text
    props:
      text: Good morning
      fontSize: 24
  - id: stats
    frame: f1
    parent: page
    name: Stats
    kind: hstack
    props:
      gap: 16
  - id: stat1
    frame: f1
    parent: stats
    name: Stat sessions
    kind: vstack
    expand: true
  - id: tasks
    frame: f1
    parent: page
    name: Tasks card
    kind: vstack
    fixed: true
    width: 380
  - id: body
    frame: f1
    parent: page
    name: Body slot
    kind: slot
    props:
      name: body
views:
  - id: v1
    name: No stats
    hidden:
      - stats
`;

describe("parseFrame", () => {
  const doc = parseFrame(DASHBOARD);

  it("reads the one frame, the nodes with their sizing flags, and the views", () => {
    expect(frameOf(doc)).toEqual({ id: "f1", name: "Dashboard", x: 0, y: 0, width: 1440, height: 900 });
    expect(doc.nodes).toHaveLength(7);
    expect(doc.nodes.find((n) => n.id === "tasks")).toMatchObject({ fixed: true, width: 380, kind: "vstack", props: {} });
    expect(doc.nodes.find((n) => n.id === "shell")?.expand).toBe(true);
    expect(doc.views).toEqual([{ id: "v1", name: "No stats", hidden: ["stats"] }]);
    expect(doc.versions).toEqual([]);
  });

  it("never throws: junk reads as empty, a bare title still renders", () => {
    expect(parseFrame(":::not yaml").frames).toEqual([]);
    expect(parseFrame("title: Just a title").title).toBe("Just a title");
    expect(frameOf(parseFrame(""))).toBeNull();
  });

  it("a node without a frame sits on the one frame; a node without a name is named by its id", () => {
    const d = parseFrame("frames:\n  - {id: f1, name: F, width: 100, height: 100}\nnodes:\n  - {id: n1}\n");
    expect(d.nodes[0]).toMatchObject({ frame: "f1", name: "n1", kind: "box" });
  });
});

describe("tree and views", () => {
  const doc = parseFrame(DASHBOARD);

  it("children are found by parent, in document order; the frame's own children have no parent", () => {
    expect(childrenOf(doc, null).map((n) => n.id)).toEqual(["shell"]);
    expect(childrenOf(doc, "page").map((n) => n.id)).toEqual(["title", "stats", "tasks", "body"]);
  });

  it("hiding a node in a view hides its whole subtree; Base hides nothing", () => {
    expect([...hiddenIn(doc, doc.views[0])].sort()).toEqual(["stat1", "stats"]);
    expect(hiddenIn(doc, null).size).toBe(0);
    expect(visibleNodes(doc, doc.views[0]).map((n) => n.id)).not.toContain("stat1");
  });

  it("axis: frame, box and vstack stack; hstack and a horizontal scroll go across", () => {
    expect(axisOf(null)).toBe("column");
    expect(axisOf(doc.nodes.find((n) => n.id === "stats")!)).toBe("row");
    expect(axisOf(doc.nodes.find((n) => n.id === "page")!)).toBe("column");
    expect(axisOf({ id: "s", frame: "f1", name: "s", kind: "scroll", props: { direction: "horizontal" }, meta: {} })).toBe("row");
  });

  it("slots and slot injections", () => {
    expect(slotsOf(doc).map((n) => n.props.name)).toEqual(["body"]);
    const inj = injectionsOf(doc, "shell");
    expect([...inj.keys()]).toEqual(["content"]);
    expect(inj.get("content")!.map((n) => n.id)).toEqual(["page"]);
  });
});

describe("problems, versions, round trip", () => {
  it("reports the structural rules a studio enforces", () => {
    const two = parseFrame("frames:\n  - {id: a, name: A, width: 1, height: 1}\n  - {id: b, name: B, width: 1, height: 1}\nnodes:\n  - {id: n1, frame: a, name: X, parent: ghost, fixed: true, expand: true}\n  - {id: n1, frame: zzz, name: Y}\n  - {id: n2, frame: a, kind: embed}\nviews:\n  - {id: v1, name: V, hidden: [nope]}\n");
    const p = frameProblems(two);
    expect(p).toContain("a .frame holds ONE frame; this file has 2");
    expect(p).toContain('node id "n1" appears 2 times');
    expect(p).toContain('node "n1" has unknown parent "ghost"');
    expect(p).toContain('node "n1" is both fixed and expand');
    expect(p).toContain('node "n1" sits on unknown frame "zzz"');
    expect(p).toContain('embed "n2" names no ref_path');
    expect(p).toContain('view "v1" hides unknown node "nope"');
    expect(frameProblems(parseFrame(DASHBOARD))).toEqual([]);
  });

  it("a version snapshots the body; the top level stays the latest", () => {
    const doc = parseFrame(DASHBOARD);
    const v2 = createFrameVersion(doc, "v2", "v1");
    expect(v2.versionName).toBe("v2");
    expect(v2.versions.map((v) => v.name)).toEqual(["v1"]);
    expect(frameSnapshotAt(v2, "v1").nodes).toHaveLength(7);
    expect(frameSnapshotAt(v2, 1).title).toBe("Dashboard");
    expect(frameSnapshotAt(v2, "v2")).toBe(v2);
    expect(frameSnapshotAt(v2, "unknown")).toBe(v2);
    const text = dumpFrame(v2);
    const back = parseFrame(text);
    expect(back.versions[0].nodes).toHaveLength(7);
    expect(back.versionName).toBe("v2");
  });

  it("dump → parse round-trips the model and keeps unknown props", () => {
    const doc = parseFrame(DASHBOARD);
    const back = parseFrame(dumpFrame(doc));
    expect(back.nodes).toEqual(doc.nodes);
    expect(back.views).toEqual(doc.views);
    expect(frameOf(back)).toEqual(frameOf(doc));
  });

  it("a new document has one frame and no nodes; ids are minted past the taken ones", () => {
    const d = newFrameDoc("Login", 390, 844);
    expect(frameOf(d)).toMatchObject({ id: "f1", width: 390, height: 844 });
    expect(nextFrameId(d, "n")).toBe("n1");
    expect(nextFrameId(parseFrame(DASHBOARD), "v")).toBe("v2");
  });
});

describe("the legend", () => {
  it("every dump opens with the legend, once; the parser ignores it; a re-dump is byte-identical", () => {
    const doc = parseFrame(DASHBOARD);
    const text = dumpFrame(doc);
    expect(text.startsWith(FRAME_LEGEND)).toBe(true);
    expect(text.split("# .frame — ONE screen").length - 1).toBe(1);
    expect(parseFrame(text).nodes).toEqual(doc.nodes);
    expect(dumpFrame(parseFrame(text))).toBe(text);
    expect(dumpFrame(doc, { legend: false }).startsWith("title: Dashboard")).toBe(true);
  });

  it("the compact dump is one line per node, no legend, no versions — what a model reads", () => {
    const v2 = createFrameVersion(parseFrame(DASHBOARD), "v2", "v1");
    const compact = dumpFrameCompact(v2);
    expect(compact).not.toContain("# .frame");
    expect(compact).not.toContain("versions");
    expect(compact).toMatch(/^nodes:\n\s+- \{[^\n]*id: shell[^\n]*kind: embed[^\n]*\}$/m);
    expect(parseFrame(compact).nodes).toEqual(v2.nodes);
  });
});

describe("a scroll viewport's size", () => {
  const scroll: FrameNode = { id: "s", frame: "f1", name: "s", kind: "scroll", props: {}, meta: {} };
  const row: FrameNode = { id: "r", frame: "f1", name: "r", kind: "hstack", props: {}, meta: {} };

  it("unsized, it fills the leftover space along its own direction; across it, it hugs", () => {
    expect(fillsMainAxis(scroll, null)).toBe(true);
    expect(fillsMainAxis({ ...scroll, props: { direction: "horizontal" } }, null)).toBe(false);
    expect(fillsMainAxis({ ...scroll, props: { direction: "horizontal" } }, row)).toBe(true);
    expect(fillsMainAxis(scroll, row)).toBe(false);
  });

  it("a size or a fixed flag is taken as written; expand and spacers always fill", () => {
    expect(fillsMainAxis({ ...scroll, height: 300 }, null)).toBe(false);
    expect(fillsMainAxis({ ...scroll, fixed: true }, null)).toBe(false);
    expect(fillsMainAxis({ ...scroll, kind: "vstack" }, null)).toBe(false);
    expect(fillsMainAxis({ ...scroll, kind: "vstack", expand: true }, null)).toBe(true);
    expect(fillsMainAxis({ ...scroll, kind: "spacer" }, null)).toBe(true);
  });
});
