import { describe, expect, it } from "vitest";
import { briefProblems, dumpBrief, parseBrief, writtenSections } from "../lib/briefDoc";

describe("brief doc golden", () => {
  it("parses the authored spelling", () => {
    const d = parseBrief(`
title: Meme XP
description: What we are building
sections:
  - title: Onboarding
    description: First run
    body: |
      Some **markdown**.
    children:
      - title: Sign up
`);
    expect(d.title).toBe("Meme XP");
    expect(d.sections[0].name).toBe("Onboarding");
    expect(d.sections[0].prose).toContain("**markdown**");
    expect(d.sections[0].children?.[0].name).toBe("Sign up");
  });
  it("accepts the in-memory spelling and never throws on junk", () => {
    expect(parseBrief("sections:\n  - name: X\n    prose: p").sections[0].name).toBe("X");
    expect(parseBrief(":::not yaml").sections).toEqual([]);
  });
  it("keeps a document written in a section, by kind, and writes it back between the body and the children", () => {
    const text = `title: Hook
sections:
  - title: The master is read
    body: What happens.
    content:
      kind: .Playbook
      doc:
        version: 2
        events:
          - key: missing
            label: The master playbook is missing
            content: {kind: md, doc: The note goes out.}
    children:
      - title: Deeper
        content: {kind: md, doc: Just text.}
`;
    const d = parseBrief(text);
    const s = d.sections[0];
    expect(s.content?.kind).toBe("playbook");
    expect((s.content?.doc as { version: number }).version).toBe(2);
    expect(s.children?.[0].content).toEqual({ kind: "md", doc: "Just text." });
    expect(writtenSections(d).map((w) => `${w.where} (${w.content.kind})`)).toEqual([
      "section The master is read (playbook)",
      "section The master is read › Deeper (md)",
    ]);
    const dumped = dumpBrief(d);
    expect(dumped.indexOf("body: What happens.")).toBeLessThan(dumped.indexOf("content:"));
    expect(dumped.indexOf("content:")).toBeLessThan(dumped.indexOf("children:"));
    expect(parseBrief(dumped)).toEqual(d);
    expect(briefProblems(text)).toEqual([]);
  });
  it("names what a section's content cannot be, by the section's title chain", () => {
    expect(briefProblems(`
sections:
  - title: A
    content: just text
  - title: B
    content: {doc: {title: x}}
  - title: C
    content: {kind: md}
  - title: D
    content: {kind: md, doc: {not: text}}
    children:
      - title: E
        content: {kind: brief, doc: {title: x}, by: [q], file: x.brief}
`)).toEqual([
      "section A: `content` is not a mapping — write `kind` and `doc`",
      "section B: `content` has no `kind` — say which kind renders it (playbook, kanban, md, …)",
      "section C: `content` has no `doc` — the document itself, as a file of that kind would hold it",
      "section D: an `md` document is its text — write it as a block string",
      "section D › E: `content` has `by` — a section holds one document written in; a brief has no answers to vary by and names no file",
      "section D › E: `content` has `file` — a section holds one document written in; a brief has no answers to vary by and names no file",
    ]);
    expect(briefProblems(":::not yaml")).toEqual([]);
    expect(briefProblems("title: only")).toEqual([]);
  });
});
