/** GOLDEN — the table diff: key grouping, multiset pairing, cell changes,
 *  totals tails skipped, declared-key errors. */
import { describe, expect, it } from "vitest";
import { parseCsv } from "./tableData";
import { diffTables, parseTableDiff } from "./tableDiff";

const sheet = (text: string) => parseCsv(text).sheets[0];

const SPEC = { key: ["Client", "Service Date"], compare: ["Duration", "Charge"], ignore: [] };

describe("parseTableDiff", () => {
  it("sides need absolute handles; key/compare/ignore parse", () => {
    const d = parseTableDiff(`
title: T
left: {handle: /a.csv, label: A}
right: {handle: /b.csv}
key: [Client]
ignore: [Staff]
`);
    expect(d.left).toEqual({ handle: "/a.csv", label: "A" });
    expect(d.right).toEqual({ handle: "/b.csv" });
    expect(d.key).toEqual(["Client"]);
    expect(d.compare).toBeUndefined(); // defaults to shared-minus-key at diff time
    expect(parseTableDiff("left: {handle: relative.csv}").left).toBeNull();
  });
});

describe("diffTables", () => {
  it("added, deleted, changed cells, unchanged — and the totals tail is not a row", () => {
    const left = sheet(
      "Client,Service Date,Duration,Charge\n" +
      "Roya,13/07/2026,1,90\n" +          // unchanged
      "Jenine,13/07/2026,2,90\n" +        // changed duration (right has 1)
      "Kazim,23/07/2026,1,90\n" +         // added (left only)
      ",,,\n,,Therapy Hours,35\n");
    const right = sheet(
      "Client,Service Date,Duration,Charge\n" +
      "Roya,13/07/2026,1,90\n" +
      "Jenine,13/07/2026,1,90\n" +
      "Irfaan,15/07/2026,1,55\n");        // deleted (right only)
    const r = diffTables(left, right, SPEC);
    expect(r.error).toBeUndefined();
    expect(r.counts).toEqual({ added: 1, deleted: 1, changed: 1, unchanged: 1, regrouped: 0 });
    const jenine = r.rows.find((x) => x.keyCells[0] === "Jenine")!;
    expect(jenine.status).toBe("changed");
    expect(jenine.cells).toEqual([
      { column: "Duration", left: "2", right: "1", changed: true },
      { column: "Charge", left: "90", right: "90", changed: false },
    ]);
  });

  it("repeated keys pair off in order; the surplus is added or deleted", () => {
    const left = sheet("Client,Service Date,Duration,Charge\nSohail,14/07/2026,1,55\nSohail,14/07/2026,1,55\nSohail,14/07/2026,1,55\n");
    const right = sheet("Client,Service Date,Duration,Charge\nSohail,14/07/2026,3,55\n");
    const r = diffTables(left, right, SPEC);
    // one pair (changed: 1h vs 3h) + two surplus left rows
    expect(r.counts).toEqual({ added: 2, deleted: 0, changed: 1, unchanged: 0, regrouped: 0 });
  });

  it("rows sort by key with dd/mm/yyyy read as dates", () => {
    const left = sheet("Client,Service Date,Duration,Charge\nA,04/08/2026,1,90\nA,14/07/2026,1,90\n");
    const right = sheet("Client,Service Date,Duration,Charge\n");
    const r = diffTables(left, right, { key: ["Client", "Service Date"], ignore: [] });
    expect(r.rows.map((x) => x.keyCells[1])).toEqual(["14/07/2026", "04/08/2026"]);
  });

  it("compare defaults to shared columns minus key minus ignore", () => {
    const left = sheet("Client,Duration,Notes,Extra\nA,1,n,e\n");
    const right = sheet("Client,Duration,Notes\nA,2,n\n");
    const r = diffTables(left, right, { key: ["Client"], ignore: ["Notes"] });
    expect(r.columns).toEqual(["Duration"]); // Extra unshared, Notes ignored
    expect(r.counts.changed).toBe(1);
  });

  it("a missing key column is an error, not a crash", () => {
    const r = diffTables(sheet("A,B\n1,2\n"), sheet("Client\nX\n"), { key: ["Client"], ignore: [] });
    expect(r.error).toContain("left");
  });

  it("sum columns reconcile slicing: three 1-hour rows ≈ one 3-hour row at the same rate", () => {
    const left = sheet("Client,Service Date,Duration,Charge\nSohail,16/07/2026,1,55\nSohail,16/07/2026,1,55\nSohail,16/07/2026,1,55\n");
    const right = sheet("Client,Service Date,Duration,Charge\nSohail,16/07/2026,3,55\n");
    const r = diffTables(left, right, { ...SPEC, sum: ["Duration"] });
    expect(r.counts).toEqual({ added: 0, deleted: 0, changed: 0, unchanged: 0, regrouped: 1 });
    expect(r.rows[0].cells).toEqual([
      { column: "Duration", left: "1+1+1", right: "3", changed: false },
      { column: "Charge", left: "55", right: "55", changed: false },
    ]);
  });

  it("reconciliation refuses when totals differ or unit values disagree — real differences stay loud", () => {
    const spec = { ...SPEC, sum: ["Duration"] };
    // totals differ: 3×1 vs 1 → falls back to one pair + two additions
    const shorter = diffTables(
      sheet("Client,Service Date,Duration,Charge\nSohail,14/07/2026,1,55\nSohail,14/07/2026,1,55\nSohail,14/07/2026,1,55\n"),
      sheet("Client,Service Date,Duration,Charge\nSohail,14/07/2026,1,55\n"), spec);
    expect(shorter.counts).toEqual({ added: 2, deleted: 0, changed: 0, unchanged: 1, regrouped: 0 });
    // totals equal but the rate disagrees → not the same thing
    const rate = diffTables(
      sheet("Client,Service Date,Duration,Charge\nA,16/07/2026,1,55\nA,16/07/2026,1,55\n"),
      sheet("Client,Service Date,Duration,Charge\nA,16/07/2026,2,90\n"), spec);
    expect(rate.counts.regrouped).toBe(0);
  });

  it("a range bounds BOTH sides — rows outside the window are not part of the question", () => {
    const left = sheet("Client,Service Date,Duration,Charge\nA,04/08/2026,1,90\nA,10/08/2026,1,90\n");
    const right = sheet("Client,Service Date,Duration,Charge\nA,4/08/2026,1,90\nA,25/08/2026,1,90\n");
    const r = diffTables(left, right, { ...SPEC, range: { column: "Service Date", until: "04/08/2026" } });
    expect(r.counts).toEqual({ added: 0, deleted: 0, changed: 0, unchanged: 1, regrouped: 0 });
  });

  it("date-shaped keys normalize before joining — 4/08/2026 IS 04/08/2026", () => {
    const left = sheet("Client,Service Date,Duration,Charge\nIrfaan,04/08/2026,1,55\n");
    const right = sheet("Client,Service Date,Duration,Charge\nIrfaan,4/08/2026,1,55\n");
    const r = diffTables(left, right, SPEC);
    expect(r.counts).toEqual({ added: 0, deleted: 0, changed: 0, unchanged: 1, regrouped: 0 });
  });
});
