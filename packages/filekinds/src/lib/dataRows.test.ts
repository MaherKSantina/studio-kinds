/** GOLDEN RULES for data rows — what a `.jsonl` shows and how it is searched, sorted and paged. */
import { describe, expect, it } from "vitest";
import { cellText, matchingRows, pageOf, parseDataRows, searchIndex, sortRows } from "./dataRows";

const LINES = [
  '{"id": 1, "name": "Alpha", "amount": 10, "tags": ["a", "b"]}',
  "",
  '{"id": 2, "name": "beta", "amount": "25", "done": true}',
  '{"id": 3, "name": "Gamma", "note": null, "meta": {"k": 1}}',
].join("\n");

describe("parsing", () => {
  it("reads one object per line, skips blank lines, finds the columns in first-seen order", () => {
    const d = parseDataRows(LINES);
    expect(d.rows.length).toBe(3);
    expect(d.columns).toEqual(["id", "name", "amount", "tags", "done", "note", "meta"]);
    expect(d.problems).toEqual([]);
  });
  it("reports a bad line by number and keeps the rest", () => {
    const d = parseDataRows('{"a": 1}\nnot json\n[1, 2]\n{"a": 2}');
    expect(d.rows.map((r) => r.a)).toEqual([1, 2]);
    expect(d.problems.length).toBe(2);
    expect(d.problems[0]).toMatch(/^line 2: /);
    expect(d.problems[1]).toBe("line 3: not a JSON object");
  });
  it("accepts a whole JSON array of objects as well", () => {
    const d = parseDataRows('[{"x": 1}, {"x": 2, "y": 3}, 7]');
    expect(d.rows.length).toBe(2);
    expect(d.columns).toEqual(["x", "y"]);
    expect(d.problems).toEqual(["row 3: not a JSON object"]);
  });
  it("an empty file is no rows and no problems", () => {
    expect(parseDataRows("")).toEqual({ rows: [], columns: [], problems: [] });
  });
});

describe("cells", () => {
  it("renders every value as text", () => {
    expect(cellText("s")).toBe("s");
    expect(cellText(3.5)).toBe("3.5");
    expect(cellText(true)).toBe("true");
    expect(cellText(null)).toBe("");
    expect(cellText(undefined)).toBe("");
    expect(cellText({ k: 1 })).toBe('{"k":1}');
    expect(cellText(["a", "b"])).toBe('["a","b"]');
  });
});

describe("search", () => {
  const d = parseDataRows(LINES);
  const index = searchIndex(d.rows, d.columns);
  it("scans every field, case-insensitively, every word required", () => {
    expect(matchingRows(index, "")).toEqual([0, 1, 2]);
    expect(matchingRows(index, "ALPHA")).toEqual([0]);
    expect(matchingRows(index, "true")).toEqual([1]);          // a boolean, as text
    expect(matchingRows(index, '"k":1')).toEqual([2]);         // inside a nested object
    expect(matchingRows(index, "a 10")).toEqual([0]);          // both words
    expect(matchingRows(index, "gamma 10")).toEqual([]);
  });
});

describe("sort", () => {
  const rows = [{ n: "10" }, { n: 9 }, { n: "b" }, {}, { n: "a" }, { n: null }];
  const all = [0, 1, 2, 3, 4, 5];
  it("numbers before text, text by locale, empties last, ties by original order", () => {
    expect(sortRows(rows, all, "n", "asc")).toEqual([1, 0, 4, 2, 3, 5]);
    expect(sortRows(rows, all, "n", "desc")).toEqual([2, 4, 0, 1, 3, 5]);
  });
  it("sorts only the given rows", () => {
    expect(sortRows(rows, [2, 4], "n", "asc")).toEqual([4, 2]);
  });
});

describe("pages", () => {
  const items = Array.from({ length: 120 }, (_, i) => i);
  it("cuts pages and clamps the page number", () => {
    expect(pageOf(items, 1, 50)).toMatchObject({ page: 1, pages: 3, from: 1, to: 50, total: 120 });
    expect(pageOf(items, 3, 50)).toMatchObject({ page: 3, pages: 3, from: 101, to: 120 });
    expect(pageOf(items, 9, 50).page).toBe(3);
    expect(pageOf(items, 0, 50).page).toBe(1);
    expect(pageOf([], 1, 50)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0, total: 0 });
  });
});
