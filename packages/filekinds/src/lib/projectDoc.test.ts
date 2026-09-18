import { describe, expect, it } from "vitest";
import { dumpProject, fileItemsOf, insertItemAfterFile, itemKind, itemLabel, linksTouching, parseProject } from "./projectDoc";

const DOC = `
name: Meme XP
description: Everything in one place.
items:
  - label: Strategy
    items:
      - file: /Meme XP/readiness.playbook
      - file: /Meme XP/setup.plan
        label: The plan
  - node: /Meme XP
    label: Meme XP files
  - file: /Meme XP/legal-documents.points
    stage: thought-process
    label: Thought process
`;

describe("project doc", () => {
  const doc = parseProject(DOC);

  it("parses the tree with the three item kinds", () => {
    expect(doc.name).toBe("Meme XP");
    expect(itemKind(doc.items[0])).toBe("folder");
    expect(itemKind(doc.items[0].items![0])).toBe("file");
    expect(itemKind(doc.items[1])).toBe("node");
  });

  it("file items display WITHOUT their extension; labels win; nodes use the folder name", () => {
    expect(itemLabel(doc.items[0].items![0])).toBe("readiness");
    expect(itemLabel(doc.items[0].items![1])).toBe("The plan");
    expect(itemLabel({ node: "/Meme XP" })).toBe("Meme XP");
  });

  it("a stage item references ONE stage of a stream, standing alone", () => {
    expect(doc.items[2]).toEqual({ label: "Thought process", file: "/Meme XP/legal-documents.points", stage: "thought-process" });
    expect(itemKind(doc.items[2])).toBe("file");
  });

  it("round-trips", () => {
    expect(parseProject(dumpProject(doc))).toEqual(doc);
  });
});

describe("project file items + line-targeted insertion", () => {
  const doc = parseProject(DOC);

  it("fileItemsOf flattens every file item, depth-first, labels resolved", () => {
    expect(fileItemsOf(doc)).toEqual([
      { file: "/Meme XP/readiness.playbook", label: "readiness" },
      { file: "/Meme XP/setup.plan", label: "The plan" },
      { file: "/Meme XP/legal-documents.points", label: "Thought process" },
    ]);
  });

  it("insertItemAfterFile is a LINE edit: sibling after the item's block, comments survive", () => {
    const text = "name: P\n# keep me\nitems:\n  - file: /a/act.md\n    label: The act\n  - file: /a/other.md\n";
    const next = insertItemAfterFile(text, "/a/act.md", { file: "/a/act.workup", label: "act workup" });
    expect(next).toContain("# keep me");
    const items = parseProject(next).items;
    expect(items.map((i) => i.file)).toEqual(["/a/act.md", "/a/act.workup", "/a/other.md"]);
    expect(items[1].label).toBe("act workup");
    // Idempotent: the workup already referenced -> unchanged.
    expect(insertItemAfterFile(next, "/a/act.md", { file: "/a/act.workup" })).toBe(next);
    // Nested source item: sibling lands inside the same nesting level.
    const nested = "items:\n  - label: Acts\n    items:\n      - file: /a/act.md\n      - file: /a/b.md\n";
    const n2 = insertItemAfterFile(nested, "/a/act.md", { file: "/a/act.workup", label: "w" });
    const acts = parseProject(n2).items[0].items!;
    expect(acts.map((i) => i.file)).toEqual(["/a/act.md", "/a/act.workup", "/a/b.md"]);
    // Unknown anchor: appended as a last top-level item.
    const n3 = insertItemAfterFile("name: P\nitems:\n  - file: /x.md\n", "/ghost.md", { file: "/w.workup" });
    expect(parseProject(n3).items.map((i) => i.file)).toEqual(["/x.md", "/w.workup"]);
  });
});

describe("project links (the dependency DAG as data)", () => {
  const LINKED = DOC + `
links:
  - from: {file: /Meme XP/readiness.playbook, stage: output}
    to: {file: /Meme XP/setup.plan}
    kind: feeds
    label: what came before what
`;
  const doc = parseProject(LINKED);

  it("parses typed stage-aware edges and finds the ones touching an item", () => {
    expect(doc.links).toEqual([{
      from: { file: "/Meme XP/readiness.playbook", stage: "output" },
      to: { file: "/Meme XP/setup.plan" },
      kind: "feeds", label: "what came before what",
    }]);
    expect(linksTouching(doc, "/Meme XP/setup.plan").incoming).toHaveLength(1);
    expect(linksTouching(doc, "/Meme XP/readiness.playbook").outgoing).toHaveLength(1);
    expect(linksTouching(doc, "/Meme XP/other.md")).toEqual({ outgoing: [], incoming: [] });
  });

  it("links round-trip through dump", () => {
    expect(parseProject(dumpProject(doc)).links).toEqual(doc.links);
  });
});
