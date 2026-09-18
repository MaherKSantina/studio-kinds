/** GOLDEN — the pulse: content movement derived from timestamps, rows from
 *  the memory's first decision plus the structural else. */
import { describe, expect, it } from "vitest";
import { ELSE, parseMemory } from "./memoryDoc";
import { parsePulse, pulseGrid, pulseSiblings } from "./pulseDoc";

const MEM = parseMemory(`
include:
  - {param: depth, op: lte, value: 2}
decisions:
  - key: focus
    label: Focus
    values:
      - {key: a, label: Area A, activates: [sub]}
    derive:
      - {value: a, when: [{param: area, op: equals, value: A}]}
  - key: sub
    label: Sub-focus
    values:
      - {key: x, label: X things}
    derive:
      - {value: x, when: [{param: name, op: matches, value: x}]}
`);

const u = (area: string, depth: string, createdAt?: string, updatedAt?: string, name = "f.md") =>
  ({ fields: { area, depth, name }, ...(createdAt ? { createdAt } : {}), ...(updatedAt ? { updatedAt } : {}) });

describe("parsePulse", () => {
  it("pointer + window, sane defaults", () => {
    const p = parsePulse("memory: /memory/desk.memory\ndays: 7\n");
    expect(p.memory).toBe("/memory/desk.memory");
    expect(p.days).toBe(7);
    expect(parsePulse("").days).toBe(21);
    expect(parsePulse("days: 999").days).toBe(120); // capped
  });
});

describe("pulseGrid", () => {
  it("rows cover the WHOLE hierarchy — children indented under the activating answer, parents aggregating; include rules gate units", () => {
    const grid = pulseGrid(MEM, [
      u("A", "2", "2026-09-04T10:00:00Z", undefined, "x-plan.md"),  // A → X, arrived yesterday
      u("A", "2", "2026-08-01T10:00:00Z", "2026-09-05T08:00:00Z"),  // A → sub-else, old, touched today
      u("B", "2", "2026-09-05T07:00:00Z", "2026-09-05T07:00:00Z"),  // top else, arrived today (no double count)
      u("A", "3", "2026-09-05T07:00:00Z", undefined, "x-extra.md"), // depth 3 — not a unit
    ], "2026-09-05", 3);

    expect(grid.dates).toEqual(["2026-09-03", "2026-09-04", "2026-09-05"]);
    // Named hierarchy first; every else SUBTREE deferred to the tail, depth
    // reset, context naming whose complement it is. Everything in the tail —
    // named answers included — is PARKED and draws grey.
    expect(grid.rows.map((r) => [r.key, r.depth, r.isElse, r.parked, r.context])).toEqual([
      ["focus=a", 0, false, false, undefined],
      ["focus=a/sub=x", 1, false, false, undefined],
      ["focus=a/sub=~else", 0, true, true, "Area A"],
      [`focus=${ELSE}`, 0, true, true, undefined],
    ]);

    const [a, ax, aElse, topElse] = grid.rows;
    // The parent aggregates its subtree: both A units, one arrival, one touch.
    expect(a.units).toBe(2);
    expect(a.addedTotal).toBe(1);
    expect(a.cells.map((c) => c.added)).toEqual([0, 1, 0]);
    expect(a.cells.map((c) => c.touched)).toEqual([0, 0, 1]);
    // The RUNNING SIZE: the pre-window unit tints every column as the base,
    // the arrival steps the gradient up — how the working memory changed.
    expect(a.cells.map((c) => c.total)).toEqual([1, 2, 2]);
    // The children split the same units by the sub-focus answer.
    expect(ax.units).toBe(1);
    expect(ax.cells.map((c) => c.added)).toEqual([0, 1, 0]);
    expect(ax.cells.map((c) => c.total)).toEqual([0, 1, 1]);
    expect(aElse.units).toBe(1);
    expect(aElse.cells.map((c) => c.touched)).toEqual([0, 0, 1]);
    expect(aElse.cells.map((c) => c.total)).toEqual([1, 1, 1]); // old unit: full row base

    expect(topElse.units).toBe(1);
    expect(topElse.cells.map((c) => c.added)).toEqual([0, 0, 1]);
    expect(topElse.cells.map((c) => c.total)).toEqual([0, 0, 1]);
    expect(topElse.cells.map((c) => c.touched)).toEqual([0, 0, 0]); // created==updated is an arrival, not a touch
  });

  it("weights ride the same walk — mass runs like total, in the caller's unit, defaulting to 1 each", () => {
    const grid = pulseGrid(MEM, [
      { ...u("A", "2", "2026-09-04T10:00:00Z", undefined, "x-plan.md"), weight: 4 },
      { ...u("A", "2", "2026-08-01T10:00:00Z"), weight: 40 }, // pre-window: base mass
    ], "2026-09-05", 3);
    const [a, ax] = grid.rows;
    expect(a.cells.map((c) => c.mass)).toEqual([40, 44, 44]);
    expect(a.mass).toBe(44);
    expect(ax.cells.map((c) => c.mass)).toEqual([0, 4, 4]);
    // No weights given: mass mirrors total, so unweighted callers see no change.
    const plain = pulseGrid(MEM, [u("A", "2", "2026-09-04T10:00:00Z")], "2026-09-05", 3);
    expect(plain.rows[0].cells.map((c) => c.mass)).toEqual(plain.rows[0].cells.map((c) => c.total));
  });

  it("an unticked option's slice doesn't pulse either — the same rule selection lives by", () => {
    const mem = parseMemory(`
options:
  - {key: dirs, on: false, matches: [{param: name, op: matches, value: x}]}
include:
  - {param: depth, op: lte, value: 2}
decisions:
  - key: focus
    label: Focus
    values: [{key: a, label: Area A}]
    derive: [{value: a, when: [{param: area, op: equals, value: A}]}]
`);
    const grid = pulseGrid(mem, [
      u("A", "2", "2026-09-04T10:00:00Z", undefined, "x-plan.md"), // hidden by the option
      u("A", "2", "2026-09-04T10:00:00Z"),
    ], "2026-09-05", 3);
    expect(grid.rows[0].units).toBe(1);
  });
});

describe("pulseSiblings", () => {
  const units = [
    u("A", "2", "2026-09-04T10:00:00Z", undefined, "x-plan.md"),
    u("A", "2", "2026-08-01T10:00:00Z"),
    u("B", "2", "2026-09-05T07:00:00Z"),
  ];
  const grid = pulseGrid(MEM, units, "2026-09-05", 3);

  it("resolves the taken path to ONE level's rows — the target's siblings, else included, in authored order", () => {
    expect(pulseSiblings(MEM, grid, ["focus=a"], "sub").map((r) => r.key))
      .toEqual(["focus=a/sub=x", "focus=a/sub=~else"]);
    // A root target needs no locks at all.
    expect(pulseSiblings(MEM, grid, [], "focus").map((r) => r.key))
      .toEqual(["focus=a", `focus=${ELSE}`]);
  });

  it("a target the locks never reach yields no rows", () => {
    expect(pulseSiblings(MEM, grid, [], "sub")).toEqual([]);
    expect(pulseSiblings(MEM, grid, ["focus=a"], "ghost")).toEqual([]);
  });
});
