/** GOLDEN RULES for a project's MODE flip — the top-level scalars written
 *  by line surgery, the lens a project gets, and the memory authoring the
 *  lens supports (foci, explicit membership, sub-foci, the decisions block
 *  rewritten with the rest of the file untouched). */
import { describe, expect, it } from "vitest";
import { parseProject, projectMemoryPath, projectRoot, writeProjectTop, dumpProject } from "../lib/projectDoc";
import {
  addSubFocus, addValue, assignUnit, explicitAnswer, memorySelection, newProjectMemory, parseMemory, removeValue, slugKey, withElse, writeDecisions, writeLocks,
} from "../lib/memoryDoc";
import { indexFields } from "../lib/nodeIndex";

const PROJECT = `name: Coding Mock Interview
description: Practice for the two-hour assessment.
# the material
items:
  - file: /Hnry/coding-interview-invite.md
    label: Hnry invite
`;

describe("project mode", () => {
  it("mode/root/memory parse, dump, and are absent by default", () => {
    expect(parseProject(PROJECT).mode).toBeUndefined();
    const d = parseProject("name: X\nmode: memory\nroot: /X\nmemory: /memory/X.memory\nitems: []\n");
    expect(d).toMatchObject({ mode: "memory", root: "/X", memory: "/memory/X.memory" });
    expect(parseProject("name: X\nmode: bogus\n").mode).toBeUndefined();
    expect(dumpProject(d)).toContain("mode: memory\nroot: /X\nmemory: /memory/X.memory\n");
  });

  it("writeProjectTop inserts after the description, replaces in place, removes on undefined, keeps comments and items", () => {
    const a = writeProjectTop(PROJECT, { mode: "directory", root: "/Coding Mock Interview" });
    expect(a).toBe(`name: Coding Mock Interview
description: Practice for the two-hour assessment.
mode: directory
root: /Coding Mock Interview
# the material
items:
  - file: /Hnry/coding-interview-invite.md
    label: Hnry invite
`);
    const b = writeProjectTop(a, { mode: "memory", memory: "/memory/Coding Mock Interview.memory" });
    expect(b.split("\n").filter((l) => /^mode:/.test(l))).toEqual(["mode: memory"]);
    expect(b).toContain("memory: /memory/Coding Mock Interview.memory\n# the material");
    const c = writeProjectTop(b, { mode: undefined });
    expect(c).not.toMatch(/^mode:/m);
    expect(parseProject(c)).toMatchObject({ root: "/Coding Mock Interview", memory: "/memory/Coding Mock Interview.memory" });
    expect(writeProjectTop("items: []\n", { mode: "directory" })).toBe("mode: directory\nitems: []\n");
  });

  it("the root falls back to the first node reference; the lens path follows the name", () => {
    expect(projectRoot(parseProject(PROJECT))).toBeNull();
    expect(projectRoot(parseProject("name: H\nitems:\n  - node: /Hnry\n"))).toBe("/Hnry");
    expect(projectRoot(parseProject("name: H\nroot: /R\nitems:\n  - node: /Hnry\n"))).toBe("/R");
    expect(projectMemoryPath(parseProject(PROJECT))).toBe("/memory/Coding Mock Interview.memory");
    expect(projectMemoryPath(parseProject("name: X\nmemory: /m/x.memory\n"))).toBe("/m/x.memory");
  });
});

describe("a project's lens", () => {
  const store = [
    { path: "/Coding Mock Interview", name: "Coding Mock Interview", kind: "folder" as const },
    { path: "/Coding Mock Interview/README.md", name: "README.md", kind: "file" as const },
    { path: "/Coding Mock Interview/warmup.frame", name: "warmup.frame", kind: "file" as const },
    { path: "/Coding Mock Interview/lead.node", name: "lead.node", kind: "folder" as const },
    { path: "/Coding Mock Interview/lead.node/schema.schema", name: "schema.schema", kind: "file" as const },
    { path: "/Hnry/coding-interview-invite.md", name: "coding-interview-invite.md", kind: "file" as const },
  ];
  const units = store.map((e) => ({ item: e.path, fields: indexFields(e, "2026-09-10") }));

  it("starts with everything under the root in Everything else", () => {
    const text = newProjectMemory({ title: "Coding Mock Interview", root: "/Coding Mock Interview", date: "2026-09-10" });
    const doc = parseMemory(text);
    expect(doc.title).toBe("Coding Mock Interview");
    expect(doc.decisions.map((d) => d.key)).toEqual(["focus"]);
    const s = memorySelection(doc, units);
    expect(s.included.map((u) => u.item)).toEqual(["/Coding Mock Interview/README.md", "/Coding Mock Interview/warmup.frame", "/Coding Mock Interview/lead.node"]);
    expect(s.groupBy?.key).toBe("focus");
    expect(s.groups.map((g) => [g.key, g.units.length])).toEqual([["~else", 3]]);
  });

  it("an items-based project admits exactly its listed paths", () => {
    const doc = parseMemory(newProjectMemory({ title: "T", paths: ["/Hnry/coding-interview-invite.md", "/Coding Mock Interview/lead.node"] }));
    expect(memorySelection(doc, units).included.map((u) => u.item)).toEqual(["/Coding Mock Interview/lead.node", "/Hnry/coding-interview-invite.md"]);
  });

  it("foci: add, move a unit in (explicit rule wins), move it back, sub-focus under a focus, resolve", () => {
    const text = newProjectMemory({ title: "T", root: "/Coding Mock Interview", date: "2026-09-10" });
    let decisions = parseMemory(text).decisions;
    const added = addValue(decisions, "focus", "Warm-ups");
    expect(added.key).toBe("warm-ups");
    decisions = assignUnit(added.decisions, "focus", "warm-ups", "/Coding Mock Interview/warmup.frame");
    let doc = { ...parseMemory(text), decisions };
    let s = memorySelection(doc, units);
    expect(s.groups.map((g) => [g.key, g.units.map((u) => u.item)])).toEqual([
      ["warm-ups", ["/Coding Mock Interview/warmup.frame"]],
      ["~else", ["/Coding Mock Interview/README.md", "/Coding Mock Interview/lead.node"]],
    ]);
    expect(explicitAnswer(decisions, "focus", "/Coding Mock Interview/warmup.frame")).toBe("warm-ups");
    // Re-assigning replaces, never duplicates, the explicit rule.
    decisions = assignUnit(decisions, "focus", "warm-ups", "/Coding Mock Interview/warmup.frame");
    expect(decisions[0].derive).toHaveLength(1);
    decisions = assignUnit(decisions, "focus", null, "/Coding Mock Interview/warmup.frame");
    expect(decisions[0].derive).toHaveLength(0);
    // A sub-focus hangs a new question under the focus.
    const sub = addSubFocus(decisions, "focus", "warm-ups");
    expect(sub.key).toBe("warm-ups-sub");
    expect(sub.decisions[0].values[0].activates).toEqual(["warm-ups-sub"]);
    expect(sub.decisions[1]).toMatchObject({ key: "warm-ups-sub", label: "Sub-focus", values: [] });
    doc = { ...doc, decisions: sub.decisions, locks: ["focus=warm-ups"] };
    s = memorySelection(doc, units);
    expect(s.groupBy?.key).toBe("warm-ups-sub");
    // Resolving the focus drops it and its rules; the sub-decision stays parked.
    const resolved = removeValue(sub.decisions, "focus", "warm-ups");
    expect(resolved[0].values).toEqual([]);
    expect(resolved.map((d) => d.key)).toEqual(["focus", "warm-ups-sub"]);
  });

  it("slugKey: readable, unique, never the structural else", () => {
    expect(slugKey("P & M interview", [])).toBe("p-m-interview");
    expect(slugKey("P & M interview", ["p-m-interview"])).toBe("p-m-interview-2");
    expect(slugKey("~else", [])).toBe("focus");
  });

  it("writeDecisions replaces only the block: head comments and the locks tail stay byte-for-byte", () => {
    const base = newProjectMemory({ title: "T", root: "/R", date: "2026-09-10" });
    const locked = writeLocks(base, ["focus=~else"], "2026-09-10T00:00:00.000Z");
    const next = addValue(parseMemory(locked).decisions, "focus", "Warm-ups").decisions;
    const out = writeDecisions(locked, next);
    const head = locked.slice(0, locked.indexOf("decisions:"));
    expect(out.startsWith(head)).toBe(true);
    const tail = locked.slice(locked.indexOf("# The answers currently taken."));
    expect(out.endsWith(tail)).toBe(true);
    const doc = parseMemory(out);
    expect(doc.decisions[0].values.map((v) => v.key)).toEqual(["warm-ups"]);
    expect(doc.locks).toEqual(["focus=~else"]);
    expect(doc.journal).toHaveLength(1);
    // Round trip through the else-extended space keeps the authored answers only.
    expect(withElse(doc.decisions)[0].values.map((v) => v.key)).toEqual(["warm-ups", "~else"]);
  });

  it("writeDecisions adds a block when the file has none, ahead of the locks", () => {
    const out = writeDecisions("title: X\ninclude: []\n\n# The answers currently taken. Written by the memory view — keep last.\nlocks: []\n", [{ key: "focus", label: "Focus", values: [], derive: [] }]);
    expect(out).toContain("include: []\n\ndecisions:\n  - key: focus\n");
    expect(out.trimEnd().endsWith("locks: []")).toBe(true);
  });
});
