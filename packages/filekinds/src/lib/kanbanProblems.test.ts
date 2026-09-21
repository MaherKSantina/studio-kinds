/** GOLDEN RULES for the kanban checker: `ok` means the file says what the board shows —
 *  every silent fallback of the lenient parser is named as a problem. */
import { describe, expect, it } from "vitest";
import { kanbanProblems, kanbanSummary, parseKanban } from "./kanbanDoc";

const GOOD = `
title: Podcast launch
due: 2026-11-13
columns: [To do, {title: Doing, color: "#f5a623"}, Done]
tasks:
  - {key: plan, title: Plan the show, status: Doing, duration: 5}
  - {key: record, title: Record the pilot, needs: [plan], duration: 3}
  - {key: edit, title: Edit, needs: [record], due: 2026-11-10}
`;

describe("kanbanProblems", () => {
  it("a board the Studio shows exactly as written has no problems, and a summary", () => {
    expect(kanbanProblems(GOOD)).toEqual([]);
    expect(kanbanSummary(parseKanban(GOOD))).toBe("3 tasks in 3 rows, 3 columns, due 2026-11-13");
  });

  it("an empty board is fine — `tasks: []` on purpose", () => {
    expect(kanbanProblems("title: t\ncolumns: [To do, Doing, Done]\ntasks: []\n")).toEqual([]);
  });

  it("enforces the field table's required rows", () => {
    expect(kanbanProblems("tasks:\n  - key: a\n")).toEqual([
      "no `title` — the board's heading",
      "no `columns` — the statuses in order, a string or `{title, color?}` each",
      "task a: no `title` — the card's heading",
    ]);
    expect(kanbanProblems("title: t\ncolumns: [A]\n")).toEqual(["no `tasks` — the cards; `tasks: []` is an empty board"]);
    expect(kanbanProblems("- a\n")).toEqual(["not a mapping — a board is `title`, `columns` and `tasks`"]);
  });

  it("names what the parser silently drops: duplicate keys, edges to nothing, a status that is no column", () => {
    const board = `
title: t
columns: [To do, Done]
tasks:
  - {key: a, title: A, status: Dne}
  - {key: a, title: A again}
  - {key: b, title: B, needs: [ghost, b]}
`;
    expect(kanbanProblems(board)).toEqual([
      "task a: status `Dne` is not a column — it would land in the first column; columns are To do, Done",
      "task a: duplicate key — every edge to it would fork; keys are identity",
      "task b: needs `ghost` — no task has that key",
      "task b: needs itself",
    ]);
  });

  it("names a duration that is not a positive number and a due that is not a date", () => {
    expect(kanbanProblems("title: t\ncolumns: [A]\ndue: next friday\ntasks:\n  - {key: a, title: A, duration: two, due: soon}\n")).toEqual([
      "`due` is not a date — write `YYYY-MM-DD`, bare or quoted (got \"next friday\")",
      "task a: `duration` is not a positive number of days (got \"two\")",
      "task a: `due` is not a date — write `YYYY-MM-DD` (got \"soon\")",
    ]);
  });

  it("names a cycle — tasks that need each other cannot be rowed or scheduled", () => {
    expect(kanbanProblems("title: t\ncolumns: [A]\ntasks:\n  - {key: a, title: A, needs: [b]}\n  - {key: b, title: B, needs: [a]}\n")).toEqual([
      "cycle: a → b — tasks that need each other cannot be rowed or scheduled",
    ]);
  });

  it("a YAML error is the YAML stage's to report — nothing here", () => {
    expect(kanbanProblems("title: [unclosed\n")).toEqual([]);
  });
});
