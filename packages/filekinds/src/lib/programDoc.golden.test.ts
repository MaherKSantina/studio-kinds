/** GOLDEN — the `.program` contract: declared inputs/outputs, nothing implied. */
import { describe, expect, it } from "vitest";
import { parseProgram } from "./programDoc";

const DOC = `
title: Timesheet → shift-notes CSV
language: Python
inputs:
  - {handle: /Fatin/timesheet.xlsx, as: timesheet.xlsx}
  - {handle: /Fatin/notes.csv}
outputs:
  - {from: converted.csv, handle: /Fatin/converted.csv}
code: |
  print("hi")
`;

describe("parseProgram", () => {
  const doc = parseProgram(DOC);

  it("contract parses; language normalizes; `as` defaults to the handle's filename", () => {
    expect(doc.language).toBe("python");
    expect(doc.inputs).toEqual([
      { handle: "/Fatin/timesheet.xlsx", as: "timesheet.xlsx" },
      { handle: "/Fatin/notes.csv", as: "notes.csv" },
    ]);
    expect(doc.outputs).toEqual([{ from: "converted.csv", handle: "/Fatin/converted.csv" }]);
    expect(doc.code.trim()).toBe('print("hi")');
  });

  it("relative handles are dropped — the contract only speaks in store paths", () => {
    const d = parseProgram("inputs:\n  - {handle: not-absolute.csv}\noutputs:\n  - {from: x, handle: also-not}\n");
    expect(d.inputs).toEqual([]);
    expect(d.outputs).toEqual([]);
  });

  it("empty text opens empty, never throws", () => {
    expect(parseProgram("").title).toBe("Program");
  });
});
