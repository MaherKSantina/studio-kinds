import { describe, expect, it } from "vitest";
import brief from "../examples/venture.brief?raw";
import example from "../examples/venture.playbook?raw";
import { KINDS, check, kindForFile } from "../src/check";

describe("check", () => {
  it("passes the example playbook, every document written in it", () => {
    const r = check("playbook", example);
    expect(r.ok).toBe(true);
    expect(r.version).toBe(2);
    expect(r.summary).toBe("v2 · 1 decisions, 4 events, 0 topics, 4 written inline");
    expect(r.notes).toEqual([]);
  });

  it("a version-2 book refuses a file beside it; a version-1 book names the files it cannot read", () => {
    const book = "title: t\nevents:\n  - {key: e, label: E, trigger: imposed, content: [{file: notes.md}]}\n";
    const v1 = check("playbook", book);
    expect(v1.ok).toBe(true);
    expect(v1.notes).toEqual(["1 file entry not checked — this check has no folder: notes.md"]);
    const v2 = check("playbook", `version: 2\n${book}`);
    expect(v2.ok).toBe(false);
    expect(v2.problems.map((p) => p.message)).toEqual([
      "event e: `content` is one document at version 2 — a mapping, not a list; several sections belong in one brief",
      "event e: notes.md is a file beside the book — version 2 is written in the book; write it as `kind` + `doc`, or take `version: 2` off",
    ]);
    expect(v2.notes).toEqual([]);
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
    content: {kind: playbook, label: Inner, doc: {version: 9, title: x}}
  - key: f
    label: F
    trigger: imposed
    content: {kind: brife, label: Typo, doc: {title: x}}
  - key: g
    label: G
    trigger: imposed
    content: {kind: md, label: Map, doc: {title: x}}
`);
    expect(r.ok).toBe(false);
    expect(r.problems.map((p) => p.message)).toEqual([
      "event g: Map: an `md` document is its text — write it as a block string",
      "event e: Inner (playbook): `version: 9` — this Studio knows playbook up to version 2; read as 2, so newer content may not show",
      "event f: Typo (brife): not a kind this check knows — one of playbook, brief, md",
    ]);
  });

  it("a nested book is checked as a book of its own, and its notes come up too", () => {
    const r = check("playbook", `version: 2
title: t
events:
  - key: e
    label: E
    trigger: imposed
    content:
      kind: playbook
      label: Inner
      doc: {version: 2, title: bad, events: [{key: x, label: X, trigger: imposed, content: {kind: md, doc: {no: text}}}]}
  - key: f
    label: F
    trigger: imposed
    content:
      kind: playbook
      label: Old
      doc: {title: fine, events: [{key: x, label: X, trigger: imposed, content: [{file: x.md}]}]}
`);
    expect(r.problems.map((p) => p.message)).toEqual([
      "event e: Inner (playbook): event x: inline content: an `md` document is its text — write it as a block string",
    ]);
    expect(r.notes).toEqual(["event f: Old (playbook): 1 file entry not checked — this check has no folder: x.md"]);
  });

  it("a version-2 book has no topics and no view, and a written set is closed — each is named", () => {
    const r = check("playbook", `version: 2
title: t
view: {locks: [d=a]}
decisions:
  - {key: d, label: D, values: [{key: a, label: A}, {key: b, label: B}]}
topics:
  - {key: t, label: T, content: {kind: md, doc: hi}}
events:
  - {key: e, label: E, trigger: imposed, content: {kind: md, label: Set, by: [d], docs: {d=a: x}}}
rules:
  - {event: e, when: [d=a], status: ready}
`);
    expect(r.ok).toBe(false);
    expect(r.version).toBe(2);
    expect(r.problems.map((p) => p.message)).toEqual([
      "`topics:` — version 2 has no topics; what is always true is the content of an always-on event, or take `version: 2` off",
      "`view:` — a version-2 walk is session-only and writes nothing; every decision opens unanswered. Delete the view",
      "event e: Set: docs has no `d=b` — every answer combination of `by` is a document of its own",
    ]);
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
