import { describe, expect, it } from "vitest";
import { checkGolden } from "crosscut";
import {
  connectionsAt, distillationFiles, exportedStages, dumpPoints, emptySlots, filesBehind, mintPointId,
  parsePoints, pointRoleRules, roleOf, stageEntries, strayKeys, usesOfFile,
  type PointRoleCtx, type PointRoleVerdict,
} from "./pointsDoc";

const STORE = `
title: Venture points
connections:
  - at: literature
    role: source
    stream: research/collate.points
    label: How the literature was chosen
  - at: distillation
    role: via
    stream: research/lit-analysis.points
  - at: points
    role: feeds
    stream: planning/plan.points
  - at: nowhere
    role: source
    stream: bad.points
  - at: points
    role: sideways
    stream: bad.points
literature:
  - file: research/cipc-windows.md
    label: CIPC windows note
points:
  - id: d-statutory-window
    label: A statutory window closes
    type: event
    defines: [window, filing, regulator]
    keys:
      - key: nature
        value: A clock the law starts; it runs whether anybody is watching.
        from:
          - file: research/cipc-windows.md
            quote: the window opens at incorporation
  - id: p-bo-window
    label: Beneficial ownership window
    type: event
    of: d-statutory-window
    keys:
      - key: window
        value: 10 days from incorporation
        from: [research/cipc-windows.md]
        via:
          - file: research/windows-categorized.brief
      - key: filing
        value: BO declaration
  - id: p-unknown
    label: Something that exists
  - id: p-ref
    label: Incorporation
    type: decision
    target:
      file: policy.playbook
      element: decision:incorporation
`;

describe("point-role golden", () => {
  it("holds its goldens", () => {
    expect(checkGolden<PointRoleCtx, PointRoleVerdict>(pointRoleRules, [
      { name: "defines only = definition",
        ctx: { hasDefines: true, hasOf: false },
        expect: { role: "definition", alsoInstance: false }, via: "definition" },
      { name: "of only = instance",
        ctx: { hasDefines: false, hasOf: true },
        expect: { role: "instance", alsoInstance: false }, via: "instance" },
      { name: "both = demoted definition (shape shifted up a level)",
        ctx: { hasDefines: true, hasOf: true },
        expect: { role: "definition", alsoInstance: true }, via: "definition-instance" },
      { name: "neither = a point, identity before shape",
        ctx: { hasDefines: false, hasOf: false },
        expect: { role: "point", alsoInstance: false } },
    ])).toEqual([]);
  });
});

describe("points doc", () => {
  const doc = parsePoints(STORE);

  it("parses literature, roles, and bare-string citations", () => {
    expect(doc.literature[0]).toEqual({ file: "research/cipc-windows.md", label: "CIPC windows note" });
    expect(roleOf(doc.points[0]).role).toBe("definition");
    expect(roleOf(doc.points[1]).role).toBe("instance");
    expect(roleOf(doc.points[2]).role).toBe("point");
    expect(doc.points[1].keys[0].from).toEqual([{ file: "research/cipc-windows.md" }]);
  });

  it("a point can be identity only — no type, no keys, still real", () => {
    expect(doc.points[2]).toEqual({ id: "p-unknown", label: "Something that exists", keys: [] });
  });

  it("a target makes the point THE node it references — file plus optional element", () => {
    expect(doc.points[3].target).toEqual({ file: "policy.playbook", element: "decision:incorporation" });
    expect(parsePoints(dumpPoints(doc)).points[3].target).toEqual({ file: "policy.playbook", element: "decision:incorporation" });
  });

  it("instances fill declared slots; the gap and the strays are named", () => {
    expect(emptySlots(doc, doc.points[1])).toEqual(["regulator"]);
    expect(strayKeys(doc, doc.points[1])).toEqual([]);
    const stray = { ...doc.points[1], keys: [...doc.points[1].keys, { key: "colour", value: "blue" }] };
    expect(strayKeys(doc, stray)).toEqual(["colour"]);
  });

  it("filesBehind collects every cited file once", () => {
    expect(filesBehind(doc.points[0])).toEqual(["research/cipc-windows.md"]);
  });

  it("distillation is declared entries plus undeclared via files — stages on demand", () => {
    expect(distillationFiles(doc)).toEqual([{ file: "research/windows-categorized.brief" }]);
  });

  it("usesOfFile runs the citations backward — the blast radius of one source", () => {
    expect(usesOfFile(doc, "research/cipc-windows.md")).toEqual({ keys: 2, points: 2 });
    expect(usesOfFile(doc, "research/windows-categorized.brief")).toEqual({ keys: 1, points: 1 });
    expect(usesOfFile(doc, "nowhere.md")).toEqual({ keys: 0, points: 0 });
  });

  it("connections parse per stage; bad at/role rows are dropped, not guessed", () => {
    expect(doc.connections).toHaveLength(3);
    expect(connectionsAt(doc, "literature")).toEqual([
      { at: "literature", role: "source", stream: "research/collate.points", label: "How the literature was chosen" },
    ]);
    expect(connectionsAt(doc, "distillation")[0].role).toBe("via");
    expect(connectionsAt(doc, "points")[0].role).toBe("feeds");
  });

  it("round-trips through dump", () => {
    const again = parsePoints(dumpPoints(doc));
    expect(again).toEqual(doc);
  });

  it("mints readable stable ids", () => {
    expect(mintPointId("The Authorised Dealer answers!")).toMatch(/^p-the-authorised-dealer-an[a-z0-9-]*-[a-z0-9]{4}$/);
  });
});

describe("authored stages", () => {
  const CUSTOM = `
title: Choosing the literature
stages:
  - key: sweep
    label: The sweep
    hint: Everything pulled, before judgment.
    entries:
      - file: 1/v1.brief
  - key: shortlist
    label: Shortlist
    entries: []
  - key: selection
    label: Selection
    kind: points
connections:
  - at: selection
    role: feeds
    stream: ../venture.points
  - at: nowhere
    role: feeds
    stream: bad.points
points:
  - id: p-x
    label: X
    keys: []
`;

  it("stages are per stream — keys, labels, kinds as authored", () => {
    const doc = parsePoints(CUSTOM);
    expect(doc.explicitStages).toBe(true);
    expect(doc.stages.map((s) => `${s.key}:${s.kind}`)).toEqual(["sweep:shelf", "shortlist:shelf", "selection:points"]);
    expect(doc.stages[0].entries).toEqual([{ file: "1/v1.brief" }]);
  });

  it("connections validate against the AUTHORED stage keys", () => {
    const doc = parsePoints(CUSTOM);
    expect(doc.connections).toHaveLength(1);
    expect(connectionsAt(doc, "selection")[0].role).toBe("feeds");
  });

  it("a forgotten points stage is appended only when points EXIST", () => {
    const withPoints = parsePoints(`title: T
stages:
  - key: inputs
    label: Inputs
    entries: []
points:
  - id: p-1
    keys: []`);
    expect(withPoints.stages.map((s) => s.kind)).toEqual(["shelf", "points"]);
    // a stream ending in a document has no points and needs no points stage
    const docOut = parsePoints(`title: T
stages:
  - key: output
    label: Output
    entries: []
points: []`);
    expect(docOut.stages.map((s) => s.kind)).toEqual(["shelf"]);
  });

  it("no stages block = the classic three, derived", () => {
    const doc = parsePoints(STORE);
    expect(doc.explicitStages).toBe(false);
    expect(doc.stages.map((s) => s.key)).toEqual(["literature", "distillation", "points"]);
    // the derived distillation shelf still collects undeclared via files
    expect(stageEntries(doc, doc.stages[1])).toEqual(distillationFiles(doc));
  });

  it("exports name the stages a project hierarchy may show; unknown keys drop", () => {
    const doc = parsePoints(CUSTOM.replace("connections:", `exports: [sweep, selection, nowhere]
connections:`));
    expect(doc.exports).toEqual(["sweep", "selection"]);
    expect(exportedStages(doc).map((s) => s.label)).toEqual(["The sweep", "Selection"]);
    expect(parsePoints(dumpPoints(doc)).exports).toEqual(["sweep", "selection"]);
  });

  it("a stage references nodes — single `node:`/`source:` sugar, or a `nodes:` list with element addressing", () => {
    const doc = parsePoints(`title: T
stages:
  - key: docs
    label: Documents
    node: legal/documents.list
    entries: []
  - key: tp
    label: Thought process
    source: legal/thought-process.brief
    entries: []
  - key: inputs
    label: Inputs
    nodes:
      - node: legal/thought-process.brief
        label: Thought process
      - node: policy.playbook
        element: decision:incorporation
        label: Incorporation
points: []`);
    expect(doc.stages[0].nodes).toEqual([{ node: "legal/documents.list" }]);
    expect(doc.stages[1].nodes).toEqual([{ node: "legal/thought-process.brief" }]);
    expect(doc.stages[2].nodes).toHaveLength(2);
    expect(doc.stages[2].nodes[1]).toEqual({ node: "policy.playbook", element: "decision:incorporation", label: "Incorporation" });
    const again = parsePoints(dumpPoints(doc));
    expect(again.stages[0].nodes).toEqual([{ node: "legal/documents.list" }]);
    expect(again.stages[2].nodes).toEqual(doc.stages[2].nodes);
  });

  it("explicit stages round-trip through dump", () => {
    const doc = parsePoints(CUSTOM);
    expect(parsePoints(dumpPoints(doc))).toEqual(doc);
  });
});

