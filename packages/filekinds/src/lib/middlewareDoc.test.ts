/** GOLDEN RULES for a middleware — rows amended on their way to a view — and the source chain behind a ref. */
import { describe, expect, it } from "vitest";
import { applyMiddleware, parseMiddleware, setText, withValue } from "./middlewareDoc";
import { chainText, readSourceRows } from "./dataSources";
import { applyTablePolicy, parseTablePolicy } from "./tablePolicy";

const LINK = "https://www.airbnb.com.au/rooms/1770093089894538093?check_in=2026-10-01&check_out=2026-10-05&adults=2&children=2";
const STAYS = [
  { name: "Spa Unit", best_offer: { url: LINK, price: 800 }, available_for_dates: true },
  { name: "Family Room", best_offer: { url: "https://example.test/2", price: 800 }, available_for_dates: true },
  { name: "Cabin", best_offer: null, available_for_dates: false },
];

const TEXT = `
title: What the listing pages said
source: accommodation.json#properties
rules:
  - where:
      - {field: best_offer.url, op: equals, value: "${LINK}"}
    set: {available_for_dates: false, availability_note: "Airbnb, 15 Sep: not available for these dates"}
    note: Opened the page on 15 Sep
  - {where: [{field: name, op: equals, value: Family Room}], key: sleeps, value: 4}
`;

describe("parsing", () => {
  it("reads the source ref, each rule's clauses, its set (or key/value) and note", () => {
    const d = parseMiddleware(TEXT);
    expect(d.source).toEqual({ file: "accommodation.json", path: "properties" });
    expect(d.rules.length).toBe(2);
    expect(d.rules[0].where).toEqual([{ param: "best_offer.url", op: "equals", value: LINK }]);
    expect(d.rules[0].set).toEqual({ available_for_dates: false, availability_note: "Airbnb, 15 Sep: not available for these dates" });
    expect(d.rules[0].note).toBe("Opened the page on 15 Sep");
    expect(d.rules[1].set).toEqual({ sleeps: 4 });
    expect(d.problems).toEqual([]);
  });
  it("reports what it cannot use", () => {
    const d = parseMiddleware("source: 7\nrules:\n  - {where: [{op: equals, value: 1}, {field: x, op: near}], set: {}}\n  - {set: {a: 1}}\n");
    expect(d.problems).toEqual(["source: not a file ref", "rule 1 where 1: no field", 'rule 1 where 2: unknown op "near"', "rule 1: sets nothing — give it set: {field: value} or key/value"]);
    expect(d.rules[1].where).toEqual([]);
  });
});

describe("applying", () => {
  it("sets the fields on the matched rows only, copies never mutate the source, and counts what each rule touched", () => {
    const r = applyMiddleware(parseMiddleware(TEXT), STAYS);
    expect(r.matches).toEqual([[0], [1]]);
    expect(r.amended).toBe(2);
    expect(r.rows[0]).toMatchObject({ name: "Spa Unit", available_for_dates: false, availability_note: "Airbnb, 15 Sep: not available for these dates" });
    expect(r.rows[1]).toMatchObject({ name: "Family Room", sleeps: 4 });
    expect(r.rows[2]).toBe(STAYS[2]);
    expect(STAYS[0].available_for_dates).toBe(true);
    expect(r.problems).toEqual([]);
  });
  it("a rule that matches no row is a problem; a rule with no clauses matches every row; a dot-path set copies the nested object", () => {
    const d = parseMiddleware("source: a.json\nrules:\n  - {where: [{field: name, op: equals, value: Ghost}], set: {x: 1}}\n  - {set: {best_offer.price: 900}}\n");
    const r = applyMiddleware(d, STAYS);
    expect(r.problems).toEqual(["rule 1 matches no row"]);
    expect(r.matches[1]).toEqual([0, 1, 2]);
    expect(r.rows[0].best_offer).toEqual({ url: LINK, price: 900 });
    expect(STAYS[0].best_offer!.price).toBe(800);
    expect(r.rows[2].best_offer).toEqual({ price: 900 });
  });
  it("withValue and setText", () => {
    expect(withValue({ a: { b: 1 } }, "a.c", 2)).toEqual({ a: { b: 1, c: 2 } });
    expect(setText({ available: false, note: "seen" })).toBe("available = false, note = “seen”");
  });
  it("the corrected rows fall out of a policy that filters on the field", () => {
    const r = applyMiddleware(parseMiddleware(TEXT), STAYS);
    const kept = applyTablePolicy(parseTablePolicy("where: [{field: available_for_dates, op: is_true}]"), r.rows);
    expect(kept.rows.map((x) => x.name)).toEqual(["Family Room"]);
  });
});

describe("the source chain behind a ref", () => {
  const FILES: Record<string, string> = {
    "/trip/accommodation.json": JSON.stringify({ sources: [{ site: "x" }], properties: STAYS }),
    "/trip/corrections.middleware": TEXT,
    "/trip/more.middleware": "source: corrections.middleware\nrules:\n  - {where: [{field: name, op: equals, value: Cabin}], set: {seen: true}}\n",
    "/trip/loop-a.middleware": "source: loop-b.middleware\nrules: [{set: {a: 1}}]\n",
    "/trip/loop-b.middleware": "source: loop-a.middleware\nrules: [{set: {b: 1}}]\n",
    "/trip/empty.middleware": "title: nothing yet\n",
  };
  const read = async (abs: string) => { if (!(abs in FILES)) throw new Error(`no ${abs}`); return FILES[abs]; };

  it("a raw file: its rows, the one file, the chain with the key it took", async () => {
    const r = await readSourceRows({ file: "accommodation.json" }, "/trip/stays.jsonl", read);
    expect(r.rows.length).toBe(3);
    expect(r.files).toEqual(["/trip/accommodation.json"]);
    expect(r.chain).toEqual(["accommodation.json#properties"]);
    expect(chainText(r)).toBe("accommodation.json#properties (3 rows)");
  });
  it("a middleware over a middleware over the raw file: every step applied on the way back, every file listed", async () => {
    const r = await readSourceRows({ file: "more.middleware" }, "/trip/stays.jsonl", read);
    expect(r.chain).toEqual(["more.middleware", "corrections.middleware", "accommodation.json#properties"]);
    expect(r.files).toEqual(["/trip/more.middleware", "/trip/corrections.middleware", "/trip/accommodation.json"]);
    expect(r.rows[0].available_for_dates).toBe(false);
    expect(r.rows[2].seen).toBe(true);
    expect(r.amended).toBe(3);
    expect(chainText(r)).toBe("more.middleware → corrections.middleware → accommodation.json#properties (3 rows, 3 amended)");
    expect(r.problems).toEqual([]);
  });
  it("a cycle, a missing file, a middleware without a source: problems, not hangs", async () => {
    expect((await readSourceRows({ file: "loop-a.middleware" }, "/trip/x.jsonl", read)).problems.some((p) => /cycle/.test(p))).toBe(true);
    expect((await readSourceRows({ file: "ghost.json" }, "/trip/x.jsonl", read)).problems).toEqual(["could not read ghost.json"]);
    expect((await readSourceRows({ file: "empty.middleware" }, "/trip/x.jsonl", read)).problems).toEqual(["empty.middleware: no source"]);
  });
});
