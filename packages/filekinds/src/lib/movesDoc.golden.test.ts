/** GOLDEN — the moves kind: snapshots of unit → answer path, and the diff
 *  that turns two looks into movement events (parking and retrieval of
 *  answers included, judged by the snapshots' own structure). */
import { describe, expect, it } from "vitest";
import { parseMemory } from "./memoryDoc";
import {
  computeSnapshot, diffMoves, parseMoves, parseMovesState, writeMovesState,
} from "./movesDoc";

// BEFORE: jason is a named answer beside ors.
const BEFORE = parseMemory(`
decisions:
  - key: focus
    label: Focus
    values:
      - {key: fatin, label: Fatin, activates: [topic]}
    derive:
      - {value: fatin, when: [{param: area, op: equals, value: Fatin}]}
  - key: topic
    label: Sub-focus
    values:
      - {key: ors, label: ORS}
      - {key: jason, label: Jason}
    derive:
      - {value: ors, when: [{param: name, op: matches, value: ors}]}
      - {value: jason, when: [{param: name, op: matches, value: jason}]}
`);

// AFTER: jason parked — one level down, under topic's else.
const AFTER = parseMemory(`
decisions:
  - key: focus
    label: Focus
    values:
      - {key: fatin, label: Fatin, activates: [topic]}
    derive:
      - {value: fatin, when: [{param: area, op: equals, value: Fatin}]}
  - key: topic
    label: Sub-focus
    values:
      - {key: ors, label: ORS}
      - {key: "~else", activates: [fj]}
    derive:
      - {value: ors, when: [{param: name, op: matches, value: ors}]}
  - key: fj
    label: Sub-focus
    values:
      - {key: jason, label: Jason}
    derive:
      - {value: jason, when: [{param: name, op: matches, value: jason}]}
`);

const UNITS = [
  { path: "/Fatin/jason-timesheet.xlsx", fields: { area: "Fatin", name: "jason-timesheet.xlsx" } },
  { path: "/Fatin/ors-review.md", fields: { area: "Fatin", name: "ors-review.md" } },
];

describe("computeSnapshot", () => {
  it("maps every unit to its full answer path and records the structure with enablers", () => {
    const s = computeSnapshot(AFTER, UNITS, "2026-09-05T10:00:00Z");
    expect(s.mapping).toEqual([
      { p: "/Fatin/jason-timesheet.xlsx", a: "focus=fatin/topic=~else/fj=jason", l: "Fatin › Everything else › Jason", k: "other" },
      { p: "/Fatin/ors-review.md", a: "focus=fatin/topic=ors", l: "Fatin › ORS", k: "other" },
    ]);
    expect(s.shape).toEqual([
      { d: "focus", v: ["fatin"], e: [] },
      { d: "topic", v: ["ors"], e: ["focus=fatin"] },
      { d: "fj", v: ["jason"], e: ["topic=~else"] },
    ]);
  });

  it("sizes and structure classes ride the rows when the fields carry them", () => {
    const s = computeSnapshot(AFTER, [
      { path: "/Fatin/jason-timesheet.xlsx", fields: { area: "Fatin", name: "jason-timesheet.xlsx", ext: "xlsx", structured: "no", size: "140000" } },
      { path: "/Fatin/ors-review.md", fields: { area: "Fatin", name: "ors-review.md", ext: "md", structured: "no", size: "2000" } },
    ], "2026-09-05T10:00:00Z");
    expect(s.mapping.map((m) => [m.k, m.s])).toEqual([["structured", 140000], ["prose", 2000]]);
  });
});

describe("diffMoves", () => {
  const AT = "2026-09-05T11:00:00Z";
  const before = computeSnapshot(BEFORE, UNITS, "2026-09-05T09:00:00Z");
  const after = computeSnapshot(AFTER, UNITS, "2026-09-05T10:00:00Z");

  it("parking: the answer moved under the else, the node's path moved with it, and both foci's pressure rode along", () => {
    const events = diffMoves(before, after, AFTER, AT);
    const moved = events.find((e) => e.kind === "node-moved");
    expect(moved).toMatchObject({
      at: AT, node: "jason-timesheet",
      from: "Fatin › Jason", to: "Fatin › Everything else › Jason",
      ctx: { files: 2, kb: 0, nodes: 0, structured: 0, prose: 0 },
      fromCtx: { files: 2, kb: 0, nodes: 0, structured: 0, prose: 0 },
    });
    expect(events).toContainEqual({
      at: AT, kind: "answer-moved", answer: "jason",
      from: "Fatin", to: "Fatin › Everything else", parked: true,
    });
  });

  it("retrieval: the reverse diff flags the answer as retrieved, judged by the OLD structure", () => {
    const events = diffMoves(after, before, BEFORE, AT);
    expect(events).toContainEqual({
      at: AT, kind: "answer-moved", answer: "jason",
      from: "fj", to: "Fatin", retrieved: true,
    });
  });

  it("arrivals aggregate per path with the destination focus's PRESSURE CONTEXT; departures carry the source's", () => {
    const more = computeSnapshot(AFTER, [
      { path: "/Fatin/jason-timesheet.xlsx", fields: { area: "Fatin", name: "jason-timesheet.xlsx", ext: "xlsx", structured: "no", size: "140000" } },
      { path: "/Fatin/ors-review.md", fields: { area: "Fatin", name: "ors-review.md", ext: "md", structured: "no", size: "2000" } },
      { path: "/Fatin/jason-invoice.md", fields: { area: "Fatin", name: "jason-invoice.md", ext: "md", structured: "no", size: "3000" } },
      { path: "/Fatin/jason-notes.md", fields: { area: "Fatin", name: "jason-notes.md", ext: "md", structured: "no", size: "5000" } },
    ], "2026-09-05T12:00:00Z");
    const events = diffMoves(after, more, AFTER, AT);
    // The ctx is the labeled observation the pressure policy learns from:
    // 4 files, 150k chars, 3 prose + 1 machine-shaped, at arrival time.
    expect(events).toEqual([{
      at: AT, kind: "arrived", to: "Fatin › Everything else › Jason", count: 2,
      ctx: { files: 4, kb: 150, nodes: 0, structured: 1, prose: 3 },
    }]);

    const goneEvents = diffMoves(more, after, AFTER, AT);
    expect(goneEvents).toEqual([{
      at: AT, kind: "gone", from: "Fatin › Everything else › Jason", count: 2,
      fromCtx: { files: 4, kb: 150, nodes: 0, structured: 1, prose: 3 },
    }]);
  });
});

describe("moves state round-trip", () => {
  it("head byte-for-byte, banner replaced not duplicated, events capped", () => {
    const authored = "title: Desk moves\nmemory: /memory/desk.memory\n";
    expect(parseMoves("keep: 3").keep).toBe(200); // below the floor = the default
    const s1 = computeSnapshot(AFTER, UNITS, "2026-09-05T10:00:00Z");
    const once = writeMovesState(authored, s1, [
      { at: "1", kind: "arrived", to: "A", count: 1 },
      { at: "2", kind: "arrived", to: "B", count: 1 },
      { at: "3", kind: "arrived", to: "C", count: 1 },
      { at: "4", kind: "arrived", to: "D", count: 1 },
    ], 3);
    expect(once.startsWith(authored.replace(/\n$/, ""))).toBe(true);
    const state1 = parseMovesState(once);
    expect(state1.snapshot?.mapping).toEqual(s1.mapping);
    expect(state1.snapshot?.shape).toEqual(s1.shape);
    expect(state1.events.map((e) => e.at)).toEqual(["2", "3", "4"]); // capped at 3

    const twice = writeMovesState(once, s1, state1.events, 3);
    expect(twice.match(/# Movement state/g)).toHaveLength(1);
    expect(parseMoves(twice).memory).toBe("/memory/desk.memory");
  });
});
