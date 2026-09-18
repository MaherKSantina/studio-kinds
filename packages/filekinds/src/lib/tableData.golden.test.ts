/** GOLDEN — the CSV half of the tabular kinds: quoting, delimiters, tails. */
import { describe, expect, it } from "vitest";
import { columnCountOf, columnLabel, parseCsv } from "./tableData";

describe("parseCsv", () => {
  it("plain rows, trailing newline dropped", () => {
    expect(parseCsv("a,b,c\n1,2,3\n").sheets[0].rows).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("quoted fields keep commas, newlines, and doubled quotes", () => {
    expect(parseCsv('name,quote\n"Charaf, Zakariya","he said ""hi""\nthen left"\n').sheets[0].rows)
      .toEqual([["name", "quote"], ["Charaf, Zakariya", 'he said "hi"\nthen left']]);
  });

  it("CRLF files and ragged rows survive as written", () => {
    expect(parseCsv("a,b\r\n1\r\n,,3\r\n").sheets[0].rows).toEqual([["a", "b"], ["1"], ["", "", "3"]]);
  });

  it("a tab in the first line means TSV", () => {
    expect(parseCsv("a\tb\n1,5\t2\n").sheets[0].rows).toEqual([["a", "b"], ["1,5", "2"]]);
  });

  it("empty text is an empty sheet, not a crash", () => {
    expect(parseCsv("  \n").sheets[0].rows).toEqual([]);
  });

  it("column math: widest row wins; labels run A…Z, AA…", () => {
    expect(columnCountOf(parseCsv("a\n1,2,3\n").sheets[0])).toBe(3);
    expect([0, 25, 26, 27].map(columnLabel)).toEqual(["A", "Z", "AA", "AB"]);
  });
});
