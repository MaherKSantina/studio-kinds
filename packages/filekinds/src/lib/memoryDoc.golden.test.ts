/** GOLDEN RULES for the memory kind — a saved query over the flat store:
 *  include admits units, locks filter, the first unanswered active decision
 *  groups, levels come from decisionSpace activation, and writeLocks keeps
 *  the authored head byte-for-byte. */
import { describe, expect, it } from "vitest";
import { ELSE, memorySelection, parseMemory, withElse, writeLocks, writeOption } from "./memoryDoc";
import { indexFields } from "./nodeIndex";

const DOC = `
title: Desk
description: What has my attention.
include:
  - {param: path, op: not_contains, value: ".node/"}
  - {param: depth, op: lte, value: 2}
decisions:
  - key: area
    label: Area
    values:
      - {key: jobhunt, label: Job Hunt, activates: [pipeline]}
      - {key: thinking, label: Abstraction}
    derive:
      - {value: jobhunt, when: [{param: area, op: equals, value: Job Hunt}]}
      - {value: thinking, when: [{param: area, op: equals, value: Abstraction}]}
  - key: pipeline
    label: Pipeline
    values: [triage, ready]
    derive:
      - {value: triage, when: [{param: status.status, op: equals, value: triage}]}
      - {value: ready, when: [{param: status.status, op: equals, value: ready}]}
  - key: heat
    label: Heat
    values:
      - {key: warm, label: This week}
      - {key: cold, label: Older}
    derive:
      - {value: warm, when: [{param: age_days, op: lte, value: 7}]}
      - {value: cold, when: [{param: age_days, op: gt, value: 7}]}
`;

const unit = (fields: Record<string, string>) => ({ item: fields.path, fields });

const STORE = [
  unit({ path: "/Job Hunt", depth: "1", area: "Job Hunt", age_days: "2", kind: "folder", ext: "" }),
  unit({ path: "/Job Hunt/lead-etoro.node", depth: "2", area: "Job Hunt", age_days: "0", "status.status": "triage", kind: "folder", ext: "node" }),
  unit({ path: "/Job Hunt/lead-etoro.node/schema.schema", depth: "3", area: "Job Hunt" }), // include drops: inside a node
  unit({ path: "/Abstraction/trail-of-thoughts.md", depth: "2", area: "Abstraction", age_days: "30", kind: "file", ext: "md" }),
  unit({ path: "/projects/Abstraction.project", depth: "2", area: "projects", age_days: "1", kind: "file", ext: "project" }),
];

describe("parseMemory", () => {
  const doc = parseMemory(DOC);

  it("include clauses, decisions with activation, empty locks", () => {
    expect(doc.include).toHaveLength(2);
    expect(doc.decisions.map((d) => d.key)).toEqual(["area", "pipeline", "heat"]);
    expect(doc.decisions[0].values[0].activates).toEqual(["pipeline"]);
    expect(doc.locks).toEqual([]);
  });

  it("locks parse only well-formed refs", () => {
    expect(parseMemory("locks: [area=jobhunt, nonsense, heat=warm]").locks)
      .toEqual(["area=jobhunt", "heat=warm"]);
  });
});

describe("memorySelection", () => {
  const doc = parseMemory(DOC);

  it("include admits units; a unit inside a structured node is not a unit", () => {
    const s = memorySelection(doc, STORE);
    expect(s.included.map((u) => u.item)).toEqual([
      "/Job Hunt", "/Job Hunt/lead-etoro.node", "/Abstraction/trail-of-thoughts.md", "/projects/Abstraction.project",
    ]);
  });

  it("no answers taken: everything visible, the FIRST decision groups, the structural else takes what no answer claims", () => {
    const s = memorySelection(doc, STORE);
    expect(s.visible).toHaveLength(4);
    expect(s.groupBy?.key).toBe("area");
    expect(s.groups.map((g) => [g.key, g.units.length])).toEqual([
      ["jobhunt", 2], ["thinking", 1], [ELSE, 1], // the project row answers no area value
    ]);
  });

  it("a lock filters, and the next question takes over the grouping — the hierarchy activates localized decisions first", () => {
    const s = memorySelection({ ...doc, locks: ["area=jobhunt"] }, STORE);
    expect(s.visible.map((u) => u.item)).toEqual(["/Job Hunt", "/Job Hunt/lead-etoro.node"]);
    // pipeline was ACTIVATED by area=jobhunt and sits under it in reading
    // order, so it groups before heat.
    expect(s.groupBy?.key).toBe("pipeline");
    expect(s.groups.map((g) => [g.key, g.units.length])).toEqual([
      ["triage", 1], ["ready", 0], [ELSE, 1], // the area folder has no pipeline stream
    ]);
  });

  it("the structural else is a TAKEABLE answer: locking it selects exactly what no named answer claimed", () => {
    const s = memorySelection({ ...doc, locks: [`area=${ELSE}`] }, STORE);
    expect(s.visible.map((u) => u.item)).toEqual(["/projects/Abstraction.project"]);
    // And it rides every decision without being authored (this doc declares none):
    const vals = withElse(doc.decisions)[0].values;
    expect(vals[vals.length - 1]).toEqual({ key: ELSE, label: "Everything else" });
    expect(doc.decisions[0].values.some((v) => v.key === ELSE)).toBe(false);
  });

  it("a DECLARED else hangs a deeper sub-focus under the complement — a resolved grouping parks, never deletes", () => {
    const parked = parseMemory(`
decisions:
  - key: topic
    values:
      - {key: ors, label: ORS}
      - {key: "~else", activates: [inner]}
    derive:
      - {value: ors, when: [{param: name, op: matches, value: ors}]}
  - key: inner
    values: [jason]
    derive:
      - {value: jason, when: [{param: name, op: matches, value: jason}]}
`);
    // The declared else keeps the canonical label and its activation.
    const spaced = withElse(parked.decisions)[0].values;
    expect(spaced[spaced.length - 1]).toEqual({ key: ELSE, label: "Everything else", activates: ["inner"] });
    const rows = [
      { item: "ors-review", fields: { name: "ors-review.md" } },
      { item: "jason-timesheet", fields: { name: "jason-timesheet.xlsx" } },
      { item: "misc", fields: { name: "misc.md" } },
    ];
    // Taking the else DESCENDS: the parked decision takes over the grouping.
    const s = memorySelection({ ...parked, locks: [`topic=${ELSE}`] }, rows);
    expect(s.visible.map((u) => u.item)).toEqual(["jason-timesheet", "misc"]);
    expect(s.groupBy?.key).toBe("inner");
    expect(s.groups.map((g) => [g.key, g.units.length])).toEqual([["jason", 1], [ELSE, 1]]);
    // Without the else taken, the parked decision stays off the table.
    expect(memorySelection(parked, rows).groupBy?.key).toBe("topic");
  });

  it("all active decisions answered: one group, no further question", () => {
    const s = memorySelection({ ...doc, locks: ["area=thinking", "heat=cold"] }, STORE);
    expect(s.groupBy).toBeNull();
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].units.map((u) => u.item)).toEqual(["/Abstraction/trail-of-thoughts.md"]);
  });

  it("locks to decisions no longer on the table are PRUNED, not enforced", () => {
    const s = memorySelection({ ...doc, locks: ["pipeline=triage"] }, STORE);
    // pipeline only exists once area=jobhunt is taken; alone it prunes away.
    expect(s.locks).toEqual([]);
    expect(s.visible).toHaveLength(4);
  });
});

describe("options", () => {
  const OPTED = `options:\n  - {key: dirs, label: Directories, on: false, matches: [{param: kind, op: equals, value: folder}, {param: ext, op: is_empty}]}\n${DOC}`;

  it("parse: label defaults to key, absent on reads TRUE (declaring never hides), keyless entries drop", () => {
    const o = parseMemory(OPTED).options;
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ key: "dirs", label: "Directories", on: false });
    expect(o[0].matches).toHaveLength(2);
    expect(parseMemory("options:\n  - {key: x, matches: [{param: kind, op: equals, value: folder}]}")
      .options[0]).toMatchObject({ label: "x", on: true });
    expect(parseMemory("options:\n  - {label: nameless}").options).toEqual([]);
  });

  it("an unticked option removes its slice with the include step; ticked or clauseless it removes nothing", () => {
    const doc = parseMemory(OPTED);
    // Both clauses must hold: the plain folder goes, the .node folder stays.
    expect(memorySelection(doc, STORE).included.map((u) => u.item)).toEqual([
      "/Job Hunt/lead-etoro.node", "/Abstraction/trail-of-thoughts.md", "/projects/Abstraction.project",
    ]);
    expect(memorySelection({ ...doc, options: [{ ...doc.options[0], on: true }] }, STORE).included).toHaveLength(4);
    expect(memorySelection({ ...doc, options: [{ key: "x", label: "x", on: false, matches: [] }] }, STORE).included).toHaveLength(4);
  });

  it("writeOption flips ONE entry's on: in place — nothing re-serialized, unknown keys change nothing", () => {
    const flipped = writeOption(OPTED, "dirs", true);
    expect(flipped).toBe(OPTED.replace("on: false", "on: true"));
    expect(writeOption(flipped, "dirs", true)).toBe(flipped); // idempotent
    expect(writeOption(OPTED, "ghost", true)).toBe(OPTED);
    // The combined save path: an option flip rides writeLocks untouched.
    const saved = writeLocks(flipped, ["area=jobhunt"], "2026-09-05T09:00:00Z");
    expect(parseMemory(saved).options[0].on).toBe(true);
    expect(parseMemory(saved).locks).toEqual(["area=jobhunt"]);
  });
});

describe("writeLocks", () => {
  it("keeps the authored head byte-for-byte, replaces its own block, and JOURNALS every change of attention", () => {
    const authored = "title: Desk\n# my comment survives\ndecisions: []\n";
    const once = writeLocks(authored, ["area=jobhunt"], "2026-09-05T09:00:00Z");
    expect(once.startsWith("title: Desk\n# my comment survives\ndecisions: []\n")).toBe(true);
    expect(once).toContain("locks: [area=jobhunt]");
    expect(parseMemory(once).journal).toEqual([{ at: "2026-09-05T09:00:00Z", locks: ["area=jobhunt"] }]);

    // A save with UNCHANGED locks appends nothing — no noise from resaves.
    const same = writeLocks(once, ["area=jobhunt"], "2026-09-05T09:01:00Z");
    expect(parseMemory(same).journal).toHaveLength(1);

    const twice = writeLocks(same, ["area=jobhunt", "heat=warm"], "2026-09-05T09:05:00Z");
    expect(twice.match(/^locks:/gm)).toHaveLength(1); // one locks LINE; journal rows carry their own
    expect(parseMemory(twice).locks).toEqual(["area=jobhunt", "heat=warm"]);
    expect(parseMemory(twice).journal.map((j) => j.at)).toEqual(["2026-09-05T09:00:00Z", "2026-09-05T09:05:00Z"]);

    // Clearing the answers is itself a movement — the trail keeps it.
    const cleared = writeLocks(twice, [], "2026-09-05T09:09:00Z");
    expect(parseMemory(cleared).locks).toEqual([]);
    expect(parseMemory(cleared).journal).toHaveLength(3);
    expect(cleared.startsWith(authored.replace(/\n$/, ""))).toBe(true);
  });
});

describe("indexFields", () => {
  it("derives clause-ready facts from one entry", () => {
    expect(indexFields(
      { path: "/Job Hunt/lead-etoro.node", name: "lead-etoro.node", kind: "folder", updatedAt: "2026-09-01T10:00:00Z" },
      "2026-09-04",
    )).toEqual({
      path: "/Job Hunt/lead-etoro.node",
      name: "lead-etoro.node",
      stem: "lead-etoro",
      ext: "node",
      kind: "folder",
      structured: "yes",
      area: "Job Hunt",
      parent: "/Job Hunt",
      depth: "2",
      updated: "2026-09-01",
      age_days: "3",
    });
  });

  it("a root folder has itself as area, root as parent, and no age without a date", () => {
    expect(indexFields({ path: "/Abstraction", name: "Abstraction", kind: "folder" }, "2026-09-04")).toEqual({
      path: "/Abstraction", name: "Abstraction", stem: "Abstraction", ext: "", kind: "folder",
      structured: "no", area: "Abstraction", parent: "/", depth: "1",
    });
  });
});
