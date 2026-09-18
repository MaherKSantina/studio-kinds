import { describe, expect, it } from "vitest";
import { assembleLanedGraph, graphWithVersion, localizeGraph, nodeConnections, originVersionGraph, rowStreamsUnrolled, unrolledStreamsGraph, versionStreamsUnrolled } from "./projectGraph";
import { parseProject } from "./projectDoc";
import { parsePoints } from "./pointsDoc";
import { parseWorkup } from "./workupDoc";
import { parseDocList } from "./listDoc";
import { parsePlaybook } from "./playbookDoc";

const PROJECT = parseProject(`
name: Meme XP
items:
  - file: /P/legal/documents.list
    label: Legal documents
  - file: /P/legal/laws/act.workup
    label: Act — workup
  - file: /P/applicable-law.points
    label: Applicable law
  - file: /P/context/context.brief
    label: Context
  - file: /P/policy.playbook
    label: Policy
links:
  - from: {file: /P/applicable-law.points, stage: output}
    to: {file: /P/legal/documents.list}
    kind: feeds
    label: authored
  - from: {file: /P/legal/documents.list}
    to: {file: /P/policy.playbook, element: decision:incorporation}
    kind: produces
`);

const DOCS = {
  points: new Map([["/P/applicable-law.points", parsePoints(`
title: Applicable law
exports: [output]
stages:
  - key: inputs
    label: Inputs
    nodes:
      - node: context/context.brief
        label: Context
      - node: policy.playbook
        element: decision:incorporation
        label: The decision
  - key: output
    label: Output
    kind: points
points:
  - id: p1
    target: {file: legal/documents.list, element: "item:0"}
    keys: []
`)]]),
  workups: new Map([["/P/legal/laws/act.workup", parseWorkup(`
title: Act — workup
source: /P/legal/laws/act.pdf
exports: [classify]
steps:
  - key: classify
    label: Typed rows
    output: classified.list
    status: done
`)]]),
  lists: new Map([["/P/legal/documents.list", parseDocList(`
title: Legal documents
items:
  - file: laws/act.pdf
    label: The Act
    export: true
`)]]),
  playbooks: new Map([["/P/policy.playbook", parsePlaybook(`
title: Policy
decisions:
  - key: incorporation
    label: Incorporation
    values:
      - key: not-yet
        label: Not yet
      - key: incorporated
        label: Incorporated (SA)
events:
  - key: incorporate
    label: We incorporate
`)]]),
};

describe("laned project graph", () => {
  const g = assembleLanedGraph(PROJECT, DOCS);
  const node = (id: string) => g.nodes.find((n) => n.id === id)!;
  const edge = (from: string, to: string) => g.edges.find((e) => e.from === from && e.to === to);

  it("every exported child is its OWN targetable node under its parent", () => {
    expect(node("/P/legal/laws/act.pdf")).toMatchObject({ parent: "/P/legal/documents.list", chip: "pdf" });
    expect(node("/P/legal/laws/act workup/classified.list")).toMatchObject({ parent: "/P/legal/laws/act.workup", chip: "list" });
    expect(node("/P/applicable-law.points#stage:output")).toMatchObject({ parent: "/P/applicable-law.points", chip: "stage" });
  });

  it("the input stage is a GROUP: its refs are clickable child nodes; covered items absorbed", () => {
    const groupId = "/P/applicable-law.points#stage:inputs";
    expect(node(groupId)).toMatchObject({ chip: "stage", label: "Inputs" });
    // Context lives on as the group's child, opening the brief itself…
    expect(node(`${groupId}/0`)).toMatchObject({
      parent: groupId, label: "Context", chip: "brief", open: { node: "/P/context/context.brief" },
    });
    // …the element ref is a child too, opening the single decision.
    expect(node(`${groupId}/1`)).toMatchObject({
      parent: groupId, label: "The decision", chip: "decision",
      open: { node: "/P/policy.playbook", element: "decision:incorporation" },
    });
    // The standalone Context item box is gone; the group feeds the stream once.
    expect(g.nodes.find((n) => n.id === "/P/context/context.brief")).toBeUndefined();
    expect(edge(groupId, "/P/applicable-law.points")).toMatchObject({ kind: "input" });
  });

  it("a decision-targeted link materializes the decision STANDALONE with its answers; the playbook item never renders", () => {
    const gid = "/P/policy.playbook#decision:incorporation";
    expect(node(gid)).toMatchObject({ chip: "decision", label: "Incorporation" });
    expect(node(`${gid}=not-yet`)).toMatchObject({
      parent: gid, label: "Not yet", chip: "answer",
      open: { node: "/P/policy.playbook", element: "decision:incorporation=not-yet" },
    });
    expect(node(`${gid}=incorporated`)).toMatchObject({ parent: gid, label: "Incorporated (SA)", chip: "answer" });
    // the authored edge fans into EACH answer
    expect(edge("/P/legal/documents.list", `${gid}=not-yet`)).toMatchObject({ kind: "produces" });
    expect(edge("/P/legal/documents.list", `${gid}=incorporated`)).toMatchObject({ kind: "produces" });
    // the playbook itself belongs to another dag
    expect(g.nodes.find((n) => n.id === "/P/policy.playbook")).toBeUndefined();
  });

  it("edges anchor at the FINEST real endpoint", () => {
    expect(edge("/P/applicable-law.points#stage:output", "/P/legal/documents.list")).toMatchObject({ kind: "feeds", label: "authored" });
    expect(edge("/P/legal/laws/act.pdf", "/P/legal/laws/act.workup")).toMatchObject({ kind: "source" });
    expect(g.edges).toHaveLength(5); // feeds + source + input + produces×2
  });

  it("lanes order by production: inputs(0) → stream(1) → list(2) → workup & decision(3)", () => {
    expect(g.lanes["/P/applicable-law.points"]).toBe(1);
    expect(g.lanes["/P/legal/documents.list"]).toBe(2);
    expect(g.lanes["/P/legal/laws/act.workup"]).toBe(3);
  });
});

describe("localized graph (provenance of one node)", () => {
  const g = assembleLanedGraph(PROJECT, DOCS);

  it("ONE production hop with structure: the direct producer and its children — the cascade pruned", () => {
    const loc = localizeGraph(g, "/P/policy.playbook#decision:incorporation=not-yet");
    const ids = loc.nodes.map((n) => n.id);
    expect(ids).toContain("/P/policy.playbook#decision:incorporation=not-yet");
    expect(ids).toContain("/P/policy.playbook#decision:incorporation"); // parent
    expect(ids).toContain("/P/legal/documents.list");                  // the DIRECT producer
    expect(ids).toContain("/P/legal/laws/act.pdf");                    // the producer's structure
    // the producer's own producers stay out — lens THAT node to go further
    expect(ids).not.toContain("/P/applicable-law.points#stage:output");
    expect(ids).not.toContain("/P/applicable-law.points#stage:inputs/0");
    // consumers stay out of an up lens
    expect(ids).not.toContain("/P/legal/laws/act.workup");
    // lanes compact to start at 0
    expect(Math.min(...Object.values(loc.lanes) as number[])).toBe(0);
  });
});

describe("localized graph, DOWN direction (what a node produces)", () => {
  const g = assembleLanedGraph(PROJECT, DOCS);

  it("forward chain from Legal documents: workups with their outputs, the decision's answers — upstream pruned", () => {
    const loc = localizeGraph(g, "/P/legal/documents.list", "down");
    const ids = loc.nodes.map((n) => n.id);
    expect(ids).toContain("/P/legal/laws/act.pdf");                     // own child seeds the walk
    expect(ids).toContain("/P/legal/laws/act.workup");                  // produced via the pdf
    expect(ids).toContain("/P/legal/laws/act workup/classified.list");  // containment carries down
    expect(ids).toContain("/P/policy.playbook#decision:incorporation=not-yet");
    expect(ids).not.toContain("/P/applicable-law.points");              // upstream pruned
    expect(ids).not.toContain("/P/applicable-law.points#stage:inputs");
  });

});


describe("seeds: absorbed items and stood-in playbooks keep their lenses", () => {
  const g = assembleLanedGraph(PROJECT, DOCS);
  it("each node is analyzed BY ITSELF — no group inheritance, descendants aggregate", () => {
    // Context's stand-in has no edges of its own; the INPUTS GROUP feeds the
    // stream, not Context — so Context shows nothing.
    expect(nodeConnections(g, "/P/context/context.brief")).toEqual({ up: false, down: false });
    // The playbook itself came from nowhere.
    expect(nodeConnections(g, "/P/policy.playbook")).toEqual({ up: false, down: false });
    // The decision aggregates its ANSWERS (production landed there) but does
    // not inherit the inputs group's outgoing edge: in, not out.
    expect(nodeConnections(g, "/P/policy.playbook#decision:incorporation")).toEqual({ up: true, down: false });
    // The inputs GROUP itself owns its edge to the stream.
    expect(nodeConnections(g, "/P/applicable-law.points#stage:inputs")).toEqual({ up: false, down: true });
  });
});

describe("first-stage refs already drawn elsewhere stay put", () => {
  // A stream whose inputs are another item's EXPORTED CHILDREN (a workup's
  // typed rows) must not duplicate them as group members — the input edge
  // anchors at the real node under its real parent.
  const P2 = parseProject(`
name: External inputs
items:
  - file: /Q/act.workup
    label: Act — workup
  - file: /Q/decide.points
    label: Decide
  - file: /Q/context.brief
    label: Context
`);
  const D2 = {
    workups: new Map([["/Q/act.workup", parseWorkup(`
title: Act — workup
source: /Q/act.pdf
exports: [classify]
steps:
  - key: classify
    label: Typed rows
    output: classified.list
    status: done
`)]]),
    points: new Map([["/Q/decide.points", parsePoints(`
title: Decide
exports: [output]
stages:
  - key: inputs
    label: Inputs
    nodes:
      - node: act workup/classified.list
        label: Typed rows
      - node: context.brief
        label: Context
  - key: output
    label: Output
    kind: points
points: []
`)]]),
  };
  const g = assembleLanedGraph(P2, D2);
  const node = (id: string) => g.nodes.find((n) => n.id === id);
  const edge = (from: string, to: string) => g.edges.find((e) => e.from === from && e.to === to);

  it("the external ref keeps its ONE box under its real parent; no group member for it", () => {
    expect(node("/Q/act workup/classified.list")).toMatchObject({ parent: "/Q/act.workup" });
    expect(node("/Q/decide.points#stage:inputs/0")).toBeUndefined();
  });

  it("the input edge anchors at the real node; the group keeps only its own members", () => {
    expect(edge("/Q/act workup/classified.list", "/Q/decide.points")).toMatchObject({ kind: "input", derived: true });
    const groupId = "/Q/decide.points#stage:inputs";
    expect(node(groupId)).toMatchObject({ chip: "stage" });
    expect(node(`${groupId}/1`)).toMatchObject({ parent: groupId, label: "Context" });
    expect(edge(groupId, "/Q/decide.points")).toMatchObject({ kind: "input" });
  });

  it("lenses follow: the typed rows produce, the stream is produced", () => {
    expect(nodeConnections(g, "/Q/act workup/classified.list")).toEqual({ up: false, down: true });
    expect(nodeConnections(g, "/Q/decide.points").up).toBe(true);
  });
});

describe("answer-targeted links: a selection edges into ONE answer", () => {
  const P3 = parseProject(`
name: Selection
items:
  - file: /R/shape.points
    label: Shape the question
  - file: /R/select.points
    label: Select the answer
  - file: /R/policy.playbook
    label: Policy
links:
  - from: {file: /R/shape.points}
    to: {file: /R/policy.playbook, element: decision:d}
    kind: produces
  - from: {file: /R/select.points}
    to: {file: /R/policy.playbook, element: decision:d=b}
    kind: selects
`);
  const D3 = {
    playbooks: new Map([["/R/policy.playbook", parsePlaybook(`
title: Policy
decisions:
  - key: d
    label: The decision
    values:
      - key: a
        label: A
      - key: b
        label: B
`)]]),
  };
  const g = assembleLanedGraph(P3, D3);
  const edge = (from: string, to: string) => g.edges.find((e) => e.from === from && e.to === to);
  const gid = "/R/policy.playbook#decision:d";

  it("the decision materializes ONCE; the fan and the selection share it", () => {
    expect(g.nodes.filter((n) => n.id === gid)).toHaveLength(1);
    expect(g.nodes.find((n) => n.id === `${gid}=b`)).toMatchObject({ chip: "answer" });
  });

  it("the producer fans into every answer; the selector edges into its answer alone", () => {
    expect(edge("/R/shape.points", `${gid}=a`)).toMatchObject({ kind: "produces" });
    expect(edge("/R/shape.points", `${gid}=b`)).toMatchObject({ kind: "produces" });
    expect(edge("/R/select.points", `${gid}=b`)).toMatchObject({ kind: "selects" });
    expect(edge("/R/select.points", `${gid}=a`)).toBeUndefined();
  });
});

describe("version pins: a snapshot's provenance is the refs that pin it", () => {
  const P4 = parseProject(`
name: Versions
items:
  - file: /V/shape.points
    label: Shape
  - file: /V/select.points
    label: Select
`);
  const D4 = {
    points: new Map([
      ["/V/shape.points", parsePoints(`
title: Shape
exports: [output]
stages:
  - key: output
    label: Output
    kind: points
points:
  - id: p1
    target: {file: "policy versions.playbook/v1.playbook"}
    keys: []
`)],
      ["/V/select.points", parsePoints(`
title: Select
stages:
  - key: inputs
    label: Inputs
    nodes:
      - node: "policy versions.playbook/v1.playbook"
        element: decision:d
        label: The question as it stood
`)],
    ]),
  };
  const g = assembleLanedGraph(P4, D4);
  const V1 = "/V/policy versions.playbook/v1.playbook";

  it("an output point pinning the version PRODUCED it; an input ref pinning it READS it", () => {
    const vg = graphWithVersion(g, P4, D4, V1, "Policy · v1")!;
    expect(vg).not.toBeNull();
    expect(nodeConnections(vg, V1)).toEqual({ up: true, down: true });
    expect(vg.edges.find((e) => e.to === V1)).toMatchObject({ from: "/V/shape.points#stage:output", kind: "produces", derived: true });
    expect(vg.edges.find((e) => e.from === V1)).toMatchObject({ to: "/V/select.points", kind: "input", derived: true });
  });

  it("localizing up shows the producing chain; down shows the reading stream", () => {
    const up = localizeGraph(graphWithVersion(g, P4, D4, V1, "v1", "up")!, V1, "up");
    expect(up.nodes.map((n) => n.id)).toContain("/V/shape.points#stage:output");
    expect(up.nodes.map((n) => n.id)).not.toContain("/V/select.points");
    const down = localizeGraph(graphWithVersion(g, P4, D4, V1, "v1", "down")!, V1, "down");
    expect(down.nodes.map((n) => n.id)).toContain("/V/select.points");
    expect(down.nodes.map((n) => n.id)).not.toContain("/V/shape.points");
  });

  it("an unpinned path has no version graph", () => {
    expect(graphWithVersion(g, P4, D4, "/V/policy versions.playbook/v2.playbook", "v2")).toBeNull();
  });
});

describe("a top-level item absorbs ONCE — later streams edge to the existing member", () => {
  const P5 = parseProject(`
name: Shared input
items:
  - file: /S/a.points
    label: A
  - file: /S/b.points
    label: B
  - file: /S/context.brief
    label: Context
`);
  const D5 = {
    points: new Map([
      ["/S/a.points", parsePoints(`
title: A
stages:
  - key: inputs
    label: Inputs
    nodes:
      - node: context.brief
        label: Context
`)],
      ["/S/b.points", parsePoints(`
title: B
stages:
  - key: inputs
    label: Inputs
    nodes:
      - node: context.brief
        label: Context
`)],
    ]),
  };
  const g = assembleLanedGraph(P5, D5);

  it("Context is drawn exactly once, as the FIRST group's member; the second stream gets no group", () => {
    expect(g.nodes.filter((n) => n.open.node === "/S/context.brief")).toHaveLength(1);
    expect(g.nodes.find((n) => n.id === "/S/a.points#stage:inputs/0")).toBeDefined();
    expect(g.nodes.find((n) => n.id === "/S/b.points#stage:inputs")).toBeUndefined();
  });

  it("the second stream's input edge anchors at the existing member", () => {
    expect(g.edges.find((e) => e.to === "/S/b.points")).toMatchObject({ from: "/S/a.points#stage:inputs/0", kind: "input", derived: true });
  });
});

describe("a version pin of the lensed element never shows as its own input", () => {
  const P6 = parseProject(`
name: Self
items:
  - file: /T/sel.points
    label: Sel
  - file: /T/ctx.brief
    label: Ctx
  - file: /T/policy.playbook
    label: Policy
links:
  - from: {file: /T/sel.points}
    to: {file: /T/policy.playbook, element: decision:d=a}
    kind: selects
`);
  const D6 = {
    points: new Map([["/T/sel.points", parsePoints(`
title: Sel
stages:
  - key: inputs
    label: Inputs
    nodes:
      - node: ctx.brief
        label: Ctx
      - node: "policy versions.playbook/v1.playbook"
        element: decision:d
        label: The question as it stood
`)]]),
    playbooks: new Map([["/T/policy.playbook", parsePlaybook(`
title: Policy
decisions:
  - key: d
    label: D
    values:
      - key: a
        label: A
`)]]),
  };
  const g = assembleLanedGraph(P6, D6);

  it("up from the LIVE decision keeps Context but prunes the pinned self", () => {
    const loc = localizeGraph(g, "/T/policy.playbook#decision:d", "up");
    const labels = loc.nodes.map((n) => n.label);
    expect(labels).toContain("Ctx");
    expect(labels).toContain("Sel");
    expect(labels).not.toContain("The question as it stood");
  });

  it("the pin still shows where it IS the connection — the version's own lens", () => {
    const V1 = "/T/policy versions.playbook/v1.playbook";
    const vg = graphWithVersion(g, P6, D6, V1, "Policy · v1", "down")!;
    const loc = localizeGraph(vg, V1, "down");
    expect(loc.nodes.map((n) => n.label)).toContain("The question as it stood");
  });
});

describe("originVersionGraph: a row's lens prefers the node's BIRTH version", () => {
  // Reuses the P4 fixture shape: /V/shape.points produces v1; v2 is unpinned.
  const P = parseProject(`
name: Versions
items:
  - file: /V/shape.points
    label: Shape
  - file: /V/select.points
    label: Select
`);
  const D = {
    points: new Map([
      ["/V/shape.points", parsePoints(`
title: Shape
exports: [output]
stages:
  - key: output
    label: Output
    kind: points
points:
  - id: p1
    target: {file: "policy versions.playbook/v1.playbook"}
    keys: []
`)],
      ["/V/select.points", parsePoints(`
title: Select
stages:
  - key: inputs
    label: Inputs
    nodes:
      - node: "policy versions.playbook/v1.playbook"
        element: decision:d
        label: The question as it stood
`)],
    ]),
  };
  const g = assembleLanedGraph(P, D);
  const V = (n: string) => ({ path: `/V/policy versions.playbook/${n}`, name: n });

  it("picks the FIRST version something produced, name-ordered", () => {
    const o = originVersionGraph(g, P, D, [V("v2.playbook"), V("v1.playbook")], "Incorporation");
    expect(o?.path).toBe("/V/policy versions.playbook/v1.playbook");
    expect(o?.label).toBe("Incorporation · v1");
    expect(o!.graph.edges.some((e) => e.to === o!.path && e.kind === "produces")).toBe(true);
  });

  it("no produced version → null: the ordinary lens takes over", () => {
    expect(originVersionGraph(g, P, D, [V("v2.playbook")], "Incorporation")).toBeNull();
  });
});

describe("unrolledStreamsGraph: the stream AS its stage pipeline", () => {
  const DOCS7 = {
    points: new Map([["/U/select.points", parsePoints(`
title: Select
stages:
  - key: inputs
    label: Inputs
    nodes:
      - node: laws/act.pdf
        label: The Act
      - node: "policy versions.playbook/v1.playbook"
        element: decision:d
        label: The question as it stood
  - key: derivation
    label: Derivation
    nodes:
      - node: thinking.brief
        label: Thought process
  - key: output
    label: Output
    kind: points
`)]]),
  };
  const g = unrolledStreamsGraph(DOCS7, ["/U/select.points"]);

  it("each stage is a COLUMN in stage order, joined by then-edges; no stream item box", () => {
    expect(g.lanes["/U/select.points#stage:inputs"]).toBe(0);
    expect(g.lanes["/U/select.points#stage:derivation"]).toBe(1);
    expect(g.lanes["/U/select.points#stage:output"]).toBe(2);
    expect(g.edges).toEqual([
      { from: "/U/select.points#stage:inputs", to: "/U/select.points#stage:derivation", kind: "then", derived: true },
      { from: "/U/select.points#stage:derivation", to: "/U/select.points#stage:output", kind: "then", derived: true },
    ]);
    expect(g.nodes.find((n) => n.id === "/U/select.points")).toBeUndefined();
  });

  it("a MULTI-input stage shows its refs under it; a lone ref stays inside its stage box", () => {
    expect(g.nodes.find((n) => n.id === "/U/select.points#stage:inputs/0")).toMatchObject({
      parent: "/U/select.points#stage:inputs", label: "The Act", chip: "pdf" });
    expect(g.nodes.find((n) => n.id === "/U/select.points#stage:inputs/1")).toMatchObject({
      chip: "decision", open: { node: "/U/policy versions.playbook/v1.playbook", element: "decision:d" } });
    // Derivation has ONE ref — no child box duplicating the stage.
    expect(g.nodes.find((n) => n.id === "/U/select.points#stage:derivation/0")).toBeUndefined();
  });
});

describe("versionStreamsUnrolled: a version lens resolves to stream pipelines", () => {
  // Same shape as the P4 fixture: shape PRODUCES v1 (via its output points),
  // select READS v1 (via a first-stage ref).
  const P = parseProject(`
name: Versions
items:
  - file: /W/shape.points
    label: Shape
  - file: /W/select.points
    label: Select
`);
  const D = {
    points: new Map([
      ["/W/shape.points", parsePoints(`
title: Shape
exports: [output]
stages:
  - key: inputs
    label: Inputs
    nodes:
      - node: rows.list
        label: Rows
  - key: output
    label: Output
    kind: points
points:
  - id: p1
    target: {file: "policy versions.playbook/v1.playbook"}
    keys: []
`)],
      ["/W/select.points", parsePoints(`
title: Select
stages:
  - key: inputs
    label: Inputs
    nodes:
      - node: "policy versions.playbook/v1.playbook"
        element: decision:d
        label: The question as it stood
`)],
    ]),
  };
  const g = assembleLanedGraph(P, D);
  const V1 = "/W/policy versions.playbook/v1.playbook";

  it("up unrolls the PRODUCING stream — its stages, ending at Output, no version box", () => {
    const vg = graphWithVersion(g, P, D, V1, "v1")!;
    const up = versionStreamsUnrolled(D, vg, V1, "up")!;
    expect(up.nodes.map((n) => n.id)).toContain("/W/shape.points#stage:output");
    expect(up.nodes.find((n) => n.id === V1)).toBeUndefined();
    expect(up.nodes.find((n) => n.id === "/W/select.points#stage:inputs")).toBeUndefined();
  });

  it("down unrolls the READING stream (its lone-ref inputs stage stays one box)", () => {
    const vg = graphWithVersion(g, P, D, V1, "v1", "down")!;
    const down = versionStreamsUnrolled(D, vg, V1, "down")!;
    expect(down.nodes.map((n) => n.id)).toContain("/W/select.points#stage:inputs");
    expect(down.nodes.find((n) => n.id === "/W/select.points#stage:inputs/0")).toBeUndefined();
    expect(down.nodes.find((n) => n.id === "/W/shape.points#stage:inputs")).toBeUndefined();
  });
});

describe("rowStreamsUnrolled: an ordinary row's lens is the other side's pipeline", () => {
  // The P2 shape: a workup's typed rows feed a stream.
  const P = parseProject(`
name: External inputs
items:
  - file: /Q/act.workup
    label: Act — workup
  - file: /Q/decide.points
    label: Decide
  - file: /Q/context.brief
    label: Context
`);
  const D = {
    workups: new Map([["/Q/act.workup", parseWorkup(`
title: Act — workup
source: /Q/act.pdf
exports: [classify]
steps:
  - key: classify
    label: Typed rows
    output: classified.list
    status: done
`)]]),
    points: new Map([["/Q/decide.points", parsePoints(`
title: Decide
exports: [output]
stages:
  - key: inputs
    label: Inputs
    nodes:
      - node: act workup/classified.list
        label: Typed rows
      - node: context.brief
        label: Context
  - key: output
    label: Output
    kind: points
points: []
`)]]),
  };
  const g = assembleLanedGraph(P, D);

  it("down from the typed rows unrolls the consuming stream — no self box", () => {
    const u = rowStreamsUnrolled(g, D, "/Q/act workup/classified.list", "down")!;
    expect(u).not.toBeNull();
    expect(u.nodes.map((n) => n.id)).toContain("/Q/decide.points#stage:output");
    expect(u.nodes.find((n) => n.id === "/Q/act workup/classified.list")).toBeUndefined();
    expect(u.nodes.find((n) => n.id === "/Q/decide.points")).toBeUndefined();
  });

  it("the workup row aggregates its rows' consumers the same way", () => {
    expect(rowStreamsUnrolled(g, D, "/Q/act.workup", "down")).not.toBeNull();
  });

  it("a non-stream other side → null: the one-hop view takes over", () => {
    // The stream's own producers are a workup's rows, not a stream.
    expect(rowStreamsUnrolled(g, D, "/Q/decide.points", "up")).toBeNull();
  });
});
