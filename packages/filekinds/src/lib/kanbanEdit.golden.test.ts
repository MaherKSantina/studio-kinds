/** GOLDEN RULES for editing a board — a retitled column takes its tasks
 *  with it and a removed one drops them to the first column; task keys stay
 *  unique and every edge to a renamed or removed task is re-pointed or cut;
 *  a sourced board changes only its own domains; a dump reads back whole. */
import { describe, expect, it } from "vitest";
import { parseKanban } from "./kanbanDoc";
import {
  addColumn, addTask, dumpKanban, moveColumn, moveTask, removeColumn, removeTask, renameColumn, setBoardMeta, updateTask,
} from "./kanbanEdit";

const BOARD = `
title: Prep board
columns: [To do, {title: Doing, color: "#3b82f6"}, Done]
tasks:
  - {key: a, title: Print badges, status: Done}
  - {key: b, title: Finalize lanyards, needs: [a], file: prep.md}
  - {key: c, title: Load the car, needs: [b, e], status: Doing}
  - {key: e, title: Receive stickers}
`;
const board = () => parseKanban(BOARD);

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  expect(r.ok, (r as { error?: string }).error).toBe(true);
  return r as Extract<T, { ok: true }>;
}
const keys = (r: { doc: { tasks: { key: string }[] } }) => r.doc.tasks.map((t) => t.key);
const columns = (r: { doc: { columns: { title: string }[] } }) => r.doc.columns.map((c) => c.title);

describe("columns", () => {
  it("add: last by default, first with after null, after a named column; a duplicate title is refused", () => {
    expect(columns(ok(addColumn(board(), "Blocked")))).toEqual(["To do", "Doing", "Done", "Blocked"]);
    expect(columns(ok(addColumn(board(), "Inbox", { after: null })))).toEqual(["Inbox", "To do", "Doing", "Done"]);
    const r = ok(addColumn(board(), "Review", { after: "doing", color: "#f97316" }));
    expect(columns(r)).toEqual(["To do", "Doing", "Review", "Done"]);
    expect(r.column).toEqual({ title: "Review", color: "#f97316" });
    expect(addColumn(board(), "done")).toEqual({ ok: false, error: 'a column called "done" already exists' });
    expect(addColumn(board(), "  ").ok).toBe(false);
  });

  it("rename re-points the tasks standing in the column; a taken title is refused; colour alone is fine", () => {
    const r = ok(renameColumn(board(), "Doing", "In progress"));
    expect(columns(r)).toEqual(["To do", "In progress", "Done"]);
    expect(r.doc.tasks.find((t) => t.key === "c")?.status).toBe("In progress");
    expect(r.column).toEqual({ title: "In progress", color: "#3b82f6" });
    expect(renameColumn(board(), "Doing", "done").ok).toBe(false);
    expect(ok(renameColumn(board(), "Done", undefined, { color: "#22c55e" })).column).toEqual({ title: "Done", color: "#22c55e" });
    expect(ok(renameColumn(board(), "Doing", "Doing", { color: "" })).column).toEqual({ title: "Doing" });
  });

  it("remove drops its tasks to the first column (no status) and says how many; move reorders", () => {
    const r = ok(removeColumn(board(), "Done"));
    expect(columns(r)).toEqual(["To do", "Doing"]);
    expect(r.moved).toBe(1);
    expect(r.doc.tasks.find((t) => t.key === "a")?.status).toBeUndefined();
    expect(columns(ok(moveColumn(board(), "Done", null)))).toEqual(["Done", "To do", "Doing"]);
    expect(columns(ok(moveColumn(board(), "To do", "Done")))).toEqual(["Doing", "Done", "To do"]);
    expect(moveColumn(board(), "To do", "Ghost").ok).toBe(false);
  });
});

describe("tasks", () => {
  it("add derives a unique key from the title, validates the column, drops unknown and self edges", () => {
    const r = ok(addTask(board(), { title: "Print badges", status: "doing", needs: ["a", "ghost", "print-badges"], note: " one line " }));
    expect(r.task).toEqual({ key: "print-badges", title: "Print badges", needs: ["a"], status: "Doing", note: "one line" });
    expect(r.dropped).toEqual(["ghost", "print-badges (itself)"]);
    const again = ok(addTask(r.doc, { title: "Print badges" }));
    expect(again.task.key).toBe("print-badges-2");
    expect(keys(ok(addTask(board(), { title: "First!" }, { after: null })))[0]).toBe("first");
    expect(keys(ok(addTask(board(), { title: "After b" }, { after: "Finalize lanyards" })))).toEqual(["a", "b", "after-b", "c", "e"]);
    expect(addTask(board(), { title: "X", status: "Nowhere" })).toEqual({ ok: false, error: 'no column called "Nowhere"' });
    expect(addTask(board(), { title: " " }).ok).toBe(false);
  });

  it("update: an empty string removes an optional field, a bad due is refused, a new key re-points every edge", () => {
    const r = ok(updateTask(board(), "b", { file: "", note: "", body: "  \n", status: "", duration: 3, due: "2026-09-30" }));
    expect(r.task).toEqual({ key: "b", title: "Finalize lanyards", needs: ["a"], duration: 3, due: "2026-09-30" });
    expect(updateTask(board(), "b", { due: "next week" }).ok).toBe(false);
    expect(updateTask(board(), "ghost", { title: "x" })).toEqual({ ok: false, error: 'unknown task "ghost"' });
    const renamed = ok(updateTask(board(), "Print badges", { key: "Badges printed" }));
    expect(renamed.task.key).toBe("badges-printed");
    expect(renamed.doc.tasks.find((t) => t.key === "b")?.needs).toEqual(["badges-printed"]);
    expect(updateTask(board(), "a", { key: "b" }).ok).toBe(false);
    expect(ok(updateTask(board(), "e", { duration: 0 })).task.duration).toBeUndefined();
  });

  it("remove cuts every edge to the task; move is the status alone", () => {
    const r = ok(removeTask(board(), "b"));
    expect(keys(r)).toEqual(["a", "c", "e"]);
    expect(r.unlinked).toBe(1);
    expect(r.doc.tasks.find((t) => t.key === "c")?.needs).toEqual(["e"]);
    expect(ok(moveTask(board(), "Receive stickers", "done")).task.status).toBe("Done");
  });

  it("a sourced board refuses adding and removing, allows only its own domains, and grows a key-only row for a sourced task", () => {
    const sourced = parseKanban(`source: tasks.points\ncolumns: [To do, Done]\ntasks:\n  - {key: x, needs: [y]}\n  - {key: y}\n`);
    expect(addTask(sourced, { title: "New" }).ok).toBe(false);
    expect(removeTask(sourced, "x").ok).toBe(false);
    expect(updateTask(sourced, "x", { title: "Retitled" }).ok).toBe(false);
    expect(moveTask(sourced, "x", "Done").ok).toBe(false);
    const r = ok(updateTask(sourced, "z", { needs: ["x"], duration: 2 }));
    expect(r.doc.tasks.map((t) => t.key)).toEqual(["x", "y", "z"]);
    expect(r.task).toEqual({ key: "z", title: "z", needs: ["x"], duration: 2 });
    expect(dumpKanban(r.doc)).toContain("  - key: z\n    needs:\n      - x\n    duration: 2\n");
    expect(dumpKanban(r.doc)).not.toContain("title: z");
  });
});

describe("the file", () => {
  it("a dump parses back to the same document, dates and multi-line bodies included", () => {
    const doc = ok(updateTask(board(), "c", { body: "- drive\n- unload", due: "2026-09-09" })).doc;
    const withMeta = ok(setBoardMeta(doc, { description: "Before the show", due: "2026-09-10" })).doc;
    const text = dumpKanban(withMeta);
    expect(parseKanban(text)).toEqual(withMeta);
    expect(text).toContain("columns:\n  - To do\n  - title: Doing\n    color: '#3b82f6'\n  - Done\n");
  });

  it("the board's head: an empty description goes, a bad due is refused", () => {
    expect(ok(setBoardMeta(board(), { title: " Show prep ", description: "" })).doc.title).toBe("Show prep");
    expect(setBoardMeta(board(), { due: "soon" }).ok).toBe(false);
  });
});
