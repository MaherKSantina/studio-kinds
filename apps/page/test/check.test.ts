import { describe, expect, it } from "vitest";
import brief from "../../../examples/venture.brief?raw";
import example from "../../../examples/venture.playbook?raw";
import { KINDS, check, kindForFile } from "../src/check";

describe("check", () => {
  it("passes the example playbook, every document in it", () => {
    const r = check("playbook", example);
    expect(r.ok).toBe(true);
    expect(r.version).toBe(2);
    expect(r.summary).toBe("v2 · 1 decisions, 4 events, 4 documents");
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
      "event e: notes.md is a file beside the book — at version 2 the document is in the book; write it as `kind` + `doc`, or take `version: 2` off",
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

  it("runs each document through its own kind, prefixed with where it sits", () => {
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
      "event f: Typo (brife): not a kind this check knows — one of brief, playbook, kanban, calendar, policy, flow, jsonl, middleware, pipeline, collection, clip, song, md, guide",
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

  it("a version-2 book holding rules, topics, a view or a status is told so, and a `docs` set is closed", () => {
    const r = check("playbook", `version: 2
title: t
view: {locks: [d=a]}
decisions:
  - {key: d, label: D, values: [{key: a, label: A}, {key: b, label: B}]}
topics:
  - {key: t, label: T, content: {kind: md, doc: hi}}
events:
  - {key: e, label: E, trigger: imposed, status: ready, content: {kind: md, label: Set, by: [d], docs: {d=a: x}}}
rules:
  - {event: e, when: [d=a], status: ready}
`);
    expect(r.ok).toBe(false);
    expect(r.version).toBe(2);
    expect(r.problems.map((p) => p.message)).toEqual([
      "`rules:` — at version 2 an event carries its own `when` and `hint`, and its document shows once the answers it follows are taken. Move each rule's `process` onto its event as `hint`, a `when` where the event is on the table only under an answer, or take `version: 2` off",
      "`topics:` — at version 2 what is always true is the content of an always-on event, or take `version: 2` off",
      "`view:` — a version-2 walk is session-only and writes nothing; every decision opens unanswered. Delete the view",
      "event e: `status` — at version 2 the document shows when its answers are taken, and `hint` shows until then. Delete it",
      "event e: Set: docs has no `d=b` — every answer combination of `by` is a document of its own",
    ]);
  });

  it("a version-2 event carries its own when and hint; the ask shows while its answer is open", () => {
    const r = check("playbook", `version: 2
title: t
decisions:
  - {key: d, label: D, values: [{key: a, label: A}, {key: b, label: B}]}
events:
  - {key: e, label: E, trigger: imposed, when: [d=a], hint: Ask., content: {kind: md, by: [d], docs: {d=a: x, d=b: y}}}
`);
    expect(r.ok).toBe(true);
    expect(r.summary).toBe("v2 · 1 decisions, 1 events, 1 documents");
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
    expect(b.summary).toBe("4 sections, 1 document");
    expect(check(".BRIEF", "title: t").kind).toBe("brief");
    expect(check("brief", "title: [").ok).toBe(false);
    expect(check("md", "# hi\n").ok).toBe(true);
  });

  it("kanban and policy: `ok` means the engine runs the file as written, not just that it is YAML", () => {
    const board = check("kanban", "title: t\ncolumns: [To do, Done]\ntasks:\n  - {key: a, title: A, needs: [ghost]}\n");
    expect(board.ok).toBe(false);
    expect(board.problems.map((p) => p.message)).toEqual(["task a: needs `ghost` — no task has that key"]);
    expect(board.summary).toBe("1 task in 1 row, 2 columns");
    expect(check("kanban", "title: t\ncolumns: [To do]\ntasks: []\n").ok).toBe(true);
    const policy = check("policy", "title: t\nparams: [{key: n, type: number}]\nbuckets: [{key: a}]\ncases:\n  - when: [{param: n, op: bigger_then, value: 1}]\n    bucket: a\n");
    expect(policy.ok).toBe(false);
    expect(policy.problems[0].message).toMatch(/^case 1, clause 1: op `bigger_then` is not one/);
    expect(policy.summary).toBe("1 param, 1 case, 1 bucket");
    expect(check("policy", "role: table\nwhere: [{field: x, op: gt, value: 1}]\n").ok).toBe(true);
    expect(check("policy", "role: tags\ntitle: t\ntags: []\n").ok).toBe(true);
  });

  it("an unknown kind is refused, and a file name picks its kind", () => {
    const r = check("frame", "x: 1");
    expect(r.ok).toBe(false);
    expect(r.problems[0].message).toMatch(/not a kind this check knows/);
    expect(kindForFile("a.playbook")).toBe("playbook");
    expect(kindForFile("A.Brief")).toBe("brief");
    expect(kindForFile("notes.md")).toBe("md");
    expect(kindForFile("x.frame")).toBeUndefined();
    expect(Object.keys(KINDS)).toEqual(["brief", "playbook", "kanban", "calendar", "policy", "flow", "jsonl", "middleware", "pipeline", "collection", "clip", "song", "md", "guide"]);
  });
});
