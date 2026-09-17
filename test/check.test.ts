import { describe, expect, it } from "vitest";
import brief from "../examples/venture.brief?raw";
import example from "../examples/venture.playbook?raw";
import { KINDS, check, kindForFile } from "../src/check";

describe("check", () => {
  it("passes the example playbook and names the one file it cannot read", () => {
    const r = check("playbook", example);
    expect(r.ok).toBe(true);
    expect(r.version).toBe(2);
    expect(r.summary).toBe("v2 · 2 decisions, 3 events, 2 topics, 5 written inline");
    expect(r.notes).toEqual(["1 file entry not checked — this check has no folder: audits/last-time.md"]);
  });

  it("a YAML error is the only problem, with its line", () => {
    const r = check("playbook", "title: t\nevents: [unclosed\n");
    expect(r.ok).toBe(false);
    expect(r.problems.length).toBe(1);
    expect(r.problems[0].message).toMatch(/^YAML:/);
    expect(r.problems[0].line).toBeGreaterThanOrEqual(1);
  });

  it("runs each written document through its own kind, prefixed with where it sits", () => {
    const r = check("playbook", `version: 2
title: t
events:
  - key: e
    label: E
    trigger: imposed
    content:
      - {kind: playbook, label: Inner, doc: {version: 9, title: x}}
      - {kind: brife, label: Typo, doc: {title: x}}
      - {kind: md, label: Map, doc: {title: x}}
`);
    expect(r.ok).toBe(false);
    expect(r.problems.map((p) => p.message)).toEqual([
      "event e: Map: an `md` document is its text — write it as a block string",
      "event e: Inner (playbook): `version: 9` — this Studio knows playbook up to version 2; read as 2, so newer content may not show",
      "event e: Typo (brife): not a kind this check knows — one of playbook, brief, md",
    ]);
  });

  it("a written set is checked member by member, and a nested book's notes come up too", () => {
    const r = check("playbook", `version: 2
title: t
decisions:
  - {key: d, label: D, values: [{key: a, label: A}, {key: b, label: B}]}
events:
  - key: e
    label: E
    trigger: imposed
    content:
      - kind: playbook
        label: Set
        by: [d]
        docs:
          d=a: {title: fine, events: [{key: x, label: X, trigger: imposed, content: [{file: x.md}]}]}
          d=b: {version: 2, title: bad, events: [{key: x, label: X, trigger: imposed, content: [{kind: md, doc: {no: text}}]}]}
`);
    expect(r.problems.map((p) => p.message)).toEqual([
      "event e: Set (playbook) [d=b]: event x: inline content: an `md` document is its text — write it as a block string",
    ]);
    expect(r.notes).toEqual(["event e: Set (playbook) [d=a]: 1 file entry not checked — this check has no folder: x.md"]);
  });

  it("a version-1 file holding written content is told to add version: 2", () => {
    const r = check("playbook", "title: t\nevents:\n  - {key: e, label: E, trigger: imposed, content: [{kind: md, doc: hi}]}\n");
    expect(r.ok).toBe(false);
    expect(r.version).toBe(1);
    expect(r.problems[0].message).toMatch(/add `version: 2`/);
  });

  it("brief and markdown", () => {
    const b = check("brief", brief);
    expect(b.ok).toBe(true);
    expect(b.summary).toBe("4 sections");
    expect(check(".BRIEF", "title: t").kind).toBe("brief");
    expect(check("brief", "title: [").ok).toBe(false);
    expect(check("md", "# hi\n").ok).toBe(true);
  });

  it("an unknown kind is refused, and a file name picks its kind", () => {
    const r = check("frame", "x: 1");
    expect(r.ok).toBe(false);
    expect(r.problems[0].message).toMatch(/not a kind this check knows/);
    expect(kindForFile("a.playbook")).toBe("playbook");
    expect(kindForFile("A.Brief")).toBe("brief");
    expect(kindForFile("notes.md")).toBe("md");
    expect(kindForFile("x.frame")).toBeUndefined();
    expect(Object.keys(KINDS)).toEqual(["playbook", "brief", "md"]);
  });
});
