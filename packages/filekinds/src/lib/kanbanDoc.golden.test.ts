import { describe, expect, it } from "vitest";
import {
  briefSectionSlice, dependencyRows, dependentsOf, mergeSourceTasks, parseKanban, scheduleTasks, tasksFromPoints,
} from "./kanbanDoc";
import { parsePoints } from "./pointsDoc";

const BOARD = `
title: Prep board
description: The tasks before the show.
columns: [To do, {title: Doing, color: "#3b82f6"}, Done]
tasks:
  - {key: a, title: Print badges, status: Done}
  - {key: b, title: Finalize lanyards, needs: [a], file: prep.md}
  - {key: c, title: Load the car, needs: [b, e]}
  - {key: d, title: Send safety sheet}
  - {key: e, title: Receive stickers}
`;

describe("kanbanDoc", () => {
  it("parses columns (strings and objects) and tasks", () => {
    const doc = parseKanban(BOARD);
    expect(doc.title).toBe("Prep board");
    expect(doc.columns).toEqual([
      { title: "To do" }, { title: "Doing", color: "#3b82f6" }, { title: "Done" },
    ]);
    expect(doc.tasks).toHaveLength(5);
    expect(doc.tasks[1]).toEqual({ key: "b", title: "Finalize lanyards", needs: ["a"], file: "prep.md" });
  });

  it("never throws on garbage or half-written files", () => {
    expect(parseKanban("")).toEqual({ title: "", columns: [], tasks: [] });
    expect(parseKanban("just text")).toEqual({ title: "", columns: [], tasks: [] });
    expect(parseKanban("tasks:\n  - 42\n  - {title: ok}").tasks).toEqual([
      { key: "ok", title: "ok", needs: [] },
    ]);
  });

  it("layers rows by longest prerequisite chain", () => {
    const rows = dependencyRows(parseKanban(BOARD).tasks).map((r) => r.map((t) => t.key));
    expect(rows).toEqual([["a", "d", "e"], ["b"], ["c"]]);
  });

  it("a board with no dependencies is one row", () => {
    const rows = dependencyRows(parseKanban("tasks: [{key: x}, {key: y}]").tasks);
    expect(rows.map((r) => r.map((t) => t.key))).toEqual([["x", "y"]]);
  });

  it("ignores unknown and self edges; cyclic tasks land together in a final row", () => {
    const doc = parseKanban(`
tasks:
  - {key: solo, needs: [ghost, solo]}
  - {key: p, needs: [q]}
  - {key: q, needs: [p]}
`);
    const rows = dependencyRows(doc.tasks).map((r) => r.map((t) => t.key));
    expect(rows).toEqual([["solo"], ["p", "q"]]);
  });

  it("parses a task's brief section pointer", () => {
    const doc = parseKanban('tasks: [{key: a, file: "sheet.brief", section: Round 1}]');
    expect(doc.tasks[0].section).toBe("Round 1");
  });

  it("parses a task's own authored body", () => {
    const doc = parseKanban("tasks:\n  - key: a\n    body: |\n      ## Own words\n      - a checklist line\n");
    expect(doc.tasks[0].body).toContain("## Own words");
    expect(doc.tasks[0].body).toContain("- a checklist line");
  });

  it("slices one section out of a brief, keeping its body; no match = null", () => {
    const brief = `
title: Run sheet
sections:
  - title: 5 · Round 1
    description: The tutorial round.
    body: Song-led.
  - title: 8 · Round 2 (Golden)
    body: Kid-led.
`;
    const slice = briefSectionSlice(brief, "round 2");
    expect(slice).toContain("Round 2 (Golden)");
    expect(slice).toContain("Kid-led.");
    expect(slice).not.toContain("Song-led.");
    expect(briefSectionSlice(brief, "no such section")).toBeNull();
  });

  it("chains the schedule backward from the due date", () => {
    const doc = parseKanban(`
due: 2026-09-09
tasks:
  - {key: print, title: Print}
  - {key: lanyards, title: Lanyards, needs: [print]}
  - {key: car, title: Car, needs: [lanyards]}
  - {key: engine, title: Engine, duration: 2}
  - {key: rehearse, title: Rehearse, needs: [engine], due: 2026-09-08}
`);
    const { scheduled, unscheduled } = scheduleTasks(doc);
    const at = (k: string) => scheduled.find((s) => s.task.key === k)!;
    expect(unscheduled).toEqual([]);
    // car ends on the due day; each prerequisite ends the day before its dependent starts
    expect([at("car").start, at("car").end]).toEqual(["2026-09-09", "2026-09-09"]);
    expect(at("lanyards").end).toBe("2026-09-08");
    expect(at("print").end).toBe("2026-09-07");
    // a per-task due caps tighter than the board's; duration stretches the start back
    expect(at("rehearse").end).toBe("2026-09-08");
    expect([at("engine").start, at("engine").end]).toEqual(["2026-09-06", "2026-09-07"]);
  });

  it("without any due date nothing gets invented dates", () => {
    const { scheduled, unscheduled } = scheduleTasks(parseKanban("tasks: [{key: a}, {key: b, needs: [a]}]"));
    expect(scheduled).toEqual([]);
    expect(unscheduled.map((t) => t.key)).toEqual(["a", "b"]);
  });

  it("sources tasks from a points stream and merges board domains by key", () => {
    const points = parsePoints(`
title: Tasks
points:
  - id: badges
    label: Print badges
    keys:
      - {key: description, value: Print all three sheets.}
      - {key: status, value: Done}
  - id: lanyards
    label: Finalize lanyards
    keys:
      - {key: description, value: "Cut, load, tug-test."}
`).points;
    const board = parseKanban(`
source: tasks.points
tasks:
  - {key: lanyards, needs: [badges], file: prep.md, duration: 2, status: Doing}
  - {key: board-only, title: Only here}
`);
    const merged = mergeSourceTasks(tasksFromPoints(points), board.tasks);
    const lanyards = merged.find((t) => t.key === "lanyards")!;
    expect(lanyards.title).toBe("Finalize lanyards");   // identity from the point
    expect(lanyards.body).toContain("tug-test");        // accreted description → body
    expect(lanyards.status).toBeUndefined();            // point hasn't accreted status — board's copy doesn't leak
    expect(lanyards.needs).toEqual(["badges"]);         // the board's own domain survives
    expect(lanyards.duration).toBe(2);
    expect(lanyards.file).toBe("prep.md");
    expect(merged.find((t) => t.key === "badges")!.status).toBe("Done"); // status read from the point
    expect(merged.map((t) => t.key)).toEqual(["badges", "lanyards", "board-only"]);
  });

  it("lists dependents for the card dialog", () => {
    const tasks = parseKanban(BOARD).tasks;
    expect(dependentsOf(tasks, "a").map((t) => t.key)).toEqual(["b"]);
    expect(dependentsOf(tasks, "e").map((t) => t.key)).toEqual(["c"]);
    expect(dependentsOf(tasks, "c")).toEqual([]);
  });
});
