/** GOLDEN RULES for asking a board to change — a reply is read leniently
 *  (aliases, the user's words for a task's parts), ops apply in order through
 *  the board's own mutators with handles for what the reply created, the
 *  target fills what an op leaves out, and nothing applied leaves the file
 *  byte-for-byte alone. */
import { describe, expect, it } from "vitest";
import { parseKanban } from "../lib/kanbanDoc";
import {
  KANBAN_ASK_OPS, KANBAN_ASK_SCHEMA, applyKanbanOps, kanbanAskSystem, kanbanAskUser, normalizeKanbanOp, parseKanbanAskReply,
} from "../lib/kanbanAsk";

const BOARD = `title: Prep board
columns: [To do, Doing, Done]
tasks:
  - {key: a, title: Print badges, status: Done}
  - {key: b, title: Finalize lanyards, needs: [a], note: after the print run}
`;
const NONE = { taskKey: null, column: null };

describe("reading a reply", () => {
  it("accepts aliases and the user's words for a task's parts, coerces needs and duration", () => {
    expect(normalizeKanbanOp({ action: "delete", id: "a" })).toEqual({ op: "remove_task", task: "a" });
    expect(normalizeKanbanOp({ op: "Add Task", title: "T", note: "one line", body: "more", status: "Doing", needs: ["a", "b"], duration: "2", handle: "t1" }))
      .toEqual({ op: "add_task", title: "T", description: "one line", details: "more", column: "Doing", needs: "a|b", duration: 2, as: "t1" });
    expect(normalizeKanbanOp({ op: "update_column", column: "Doing", new_name: "In progress" })).toEqual({ op: "rename_column", column: "Doing", name: "In progress" });
    expect(normalizeKanbanOp({ op: "nonsense" })).toBeNull();
    expect(normalizeKanbanOp("add_task")).toBeNull();
  });

  it("a reply's ops may be called edits; junk is dropped; a non-object is empty", () => {
    expect(parseKanbanAskReply({ message: "ok", edits: [{ op: "move_task", task: "a", to: "Doing" }, 42] }))
      .toEqual({ say: "ok", ops: [{ op: "move_task", task: "a", column: "Doing" }] });
    expect(parseKanbanAskReply(null)).toEqual({ say: "", ops: [] });
  });

  it("the schema names exactly the ops the applier knows", () => {
    expect(KANBAN_ASK_SCHEMA.properties.ops.items.properties.op.enum).toEqual([...KANBAN_ASK_OPS]);
    expect(kanbanAskSystem()).toContain("add_task {title, description, details, column, needs");
  });
});

describe("applying", () => {
  it("creates with handles, wires needs to them, moves, and reports each step", () => {
    const r = applyKanbanOps(BOARD, [
      { op: "add_task", title: "Load the car", column: "To do", as: "car" },
      { op: "add_task", title: "Drive", needs: "car|Finalize lanyards", as: "drive", description: "with the lanyards" },
      { op: "move_task", task: "drive", column: "Doing" },
      { op: "update_task", task: "b", details: "- fold\n- pack" },
    ], NONE);
    expect(r.skipped).toEqual([]);
    expect(r.applied).toEqual([
      'added "Load the car" (load-the-car) in To do',
      'added "Drive" (drive) needing load-the-car, b',
      'moved "Drive" (drive) to Doing',
      'updated "Finalize lanyards" (b): details',
    ]);
    const doc = parseKanban(r.content);
    expect(doc.tasks.map((t) => [t.key, t.status ?? "", t.needs])).toEqual([
      ["a", "Done", []], ["b", "", ["a"]], ["load-the-car", "To do", []], ["drive", "Doing", ["load-the-car", "b"]],
    ]);
    expect(doc.tasks[1].body).toBe("- fold\n- pack");
    expect(r.focusKey).toBe("b");
  });

  it("the target fills what an op leaves out: the task for update / move / remove, the column for add and column ops", () => {
    const r = applyKanbanOps(BOARD, [
      { op: "update_task", description: "" },
      { op: "add_task", title: "Here" },
      { op: "rename_column", name: "Now" },
    ], { taskKey: "b", column: "Doing" });
    expect(r.skipped).toEqual([]);
    const doc = parseKanban(r.content);
    expect(doc.tasks.find((t) => t.key === "b")?.note).toBeUndefined();
    expect(doc.tasks.find((t) => t.key === "here")?.status).toBe("Now");
    expect(doc.columns.map((c) => c.title)).toEqual(["To do", "Now", "Done"]);
  });

  it("refusals are said, not thrown, and a reply that changed nothing leaves the text alone", () => {
    const r = applyKanbanOps(BOARD, [
      { op: "update_task", task: "ghost", title: "x" },
      { op: "add_task", title: "x", column: "Nowhere" },
      { op: "remove_task" },
      { op: "add_column", name: "Done" },
      { op: "set_title" },
    ], NONE);
    expect(r.applied).toEqual([]);
    expect(r.content).toBe(BOARD);
    expect(r.skipped).toEqual([
      'update_task ghost: unknown task "ghost"',
      'add_task: no column called "Nowhere"',
      "remove_task: no task given and none targeted",
      'add_column: a column called "Done" already exists',
      "set_title: nothing to change",
    ]);
  });

  it("columns: add first, remove with its tasks falling back, the head", () => {
    const r = applyKanbanOps(BOARD, [
      { op: "add_column", name: "Inbox", after: "" },
      { op: "remove_column", column: "Done" },
      { op: "set_title", title: "Show prep", due: "2026-09-09" },
    ], NONE);
    expect(r.skipped).toEqual([]);
    expect(r.applied).toEqual(["added column Inbox (first)", "removed column Done (1 task back to the first column)", "board title, due set"]);
    const doc = parseKanban(r.content);
    expect(doc.columns.map((c) => c.title)).toEqual(["Inbox", "To do", "Doing"]);
    expect(doc.due).toBe("2026-09-09");
  });

  it("a sourced board refuses task edits with the reason, and still takes column edits", () => {
    const sourced = "source: tasks.points\ncolumns: [To do, Done]\ntasks: []\n";
    const r = applyKanbanOps(sourced, [{ op: "add_task", title: "x" }, { op: "add_column", name: "Doing", after: "To do" }], NONE);
    expect(r.skipped).toEqual(["add_task: tasks come from tasks.points — only needs, duration, due, file and section are this board's to change"]);
    expect(parseKanban(r.content).columns.map((c) => c.title)).toEqual(["To do", "Doing", "Done"]);
  });
});

describe("what the model reads", () => {
  it("names the target, lists the board one task per line, and ends with the instruction", () => {
    const user = kanbanAskUser(BOARD, { taskKey: "b", column: null }, "move it to Doing", [{ instruction: "hi", say: "hello", result: "applied nothing" }]);
    expect(user).toContain('TARGET task: "Finalize lanyards" (b, in To do)');
    expect(user).toContain("TARGET column: none");
    expect(user).toContain("RECENT TURNS\nuser: hi\nyou: hello [applied nothing]");
    expect(user).toContain("columns: To do | Doing | Done");
    expect(user).toContain('- b · "Finalize lanyards" · To do · needs: a · description: after the print run');
    expect(user.endsWith("INSTRUCTION: move it to Doing")).toBe(true);
  });
});
