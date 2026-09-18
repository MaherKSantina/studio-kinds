/** GOLDEN RULES for a table policy (`role: table`) — the rules a `.jsonl` passes its rows through. */
import { describe, expect, it } from "vitest";
import { applyTablePolicy, clauseSentence, parseTablePolicy, rulesSummary } from "./tablePolicy";
import { parsePolicyKindFile } from "./policyChain";
import { parseDataRows, rowsOfSource } from "./dataRows";

const STAYS = [
  { name: "Lake unit", area: "Narooma", km: 0, sleeps: 4, best_offer: { price: 1024, url: "u1" }, available: true },
  { name: "Tilba cottage", area: "Tilba", km: 15, sleeps: 5, best_offer: { price: 900, url: "u2" }, available: true },
  { name: "Beach house", area: "Dalmeny", km: 8, sleeps: 8, best_offer: { price: 3200, url: "u3" }, available: true },
  { name: "Cheap cabin", area: "Bermagui", km: 26, sleeps: 4, best_offer: { price: 900, url: "u4" }, available: true },
  { name: "Sold out", area: "Narooma", km: 1, sleeps: 6, best_offer: null, available: false },
];

const TEXT = `
role: table
title: Stays by price
where:
  - {field: available, op: is_true}
  - {field: best_offer.price, op: between, value: [600, 2000]}
sort:
  - {field: best_offer.price, dir: asc}
  - {field: km, dir: asc}
columns: [name, area, best_offer.price, km, best_offer.url]
`;
const DOC = parseTablePolicy(TEXT);

describe("parsing", () => {
  it("reads fields, dot paths, both sort keys and the labels; no problems", () => {
    expect(DOC.role).toBe("table");
    expect(DOC.where.map((c) => `${c.param} ${c.op}`)).toEqual(["available is_true", "best_offer.price between"]);
    expect(DOC.sort).toEqual([{ field: "best_offer.price", dir: "asc" }, { field: "km", dir: "asc" }]);
    expect(DOC.columns).toEqual(["name", "area", "best_offer.price", "km", "best_offer.url"]);
    expect(DOC.problems).toEqual([]);
  });
  it("is a role of the .policy kind — the kind file dispatches on role: table", () => {
    const d = parsePolicyKindFile(TEXT);
    expect(d.role).toBe("table");
    expect(d.role === "table" && d.sort.length).toBe(2);
  });
  it("reports what it cannot use instead of dropping it silently", () => {
    const d = parseTablePolicy(`role: table\nwhere:\n  - {field: x, op: nearby, value: 1}\n  - {op: gt, value: 1}\n  - {field: y}\nsort:\n  - {field: x, dir: up}\n  - y\nlimit: -3\n`);
    expect(d.problems).toEqual(['where 1: unknown op "nearby"', "where 2: no field", "where 3: no op", 'sort 1: dir must be asc or desc, not "up"', "limit: must be a positive number"]);
    expect(d.sort).toEqual([{ field: "y", dir: "asc" }]);
  });
  it("an empty file is a policy with no rules", () => {
    expect(parseTablePolicy("")).toMatchObject({ role: "table", title: "", where: [], sort: [], hide: [], problems: [] });
  });
  it("knows nothing about the data: a source or header labels in the policy are problems, not rules", () => {
    const d = parseTablePolicy("role: table\nsource: rows.json\nrename: {km: \"km from Narooma\"}\n");
    expect(d.problems).toEqual([
      "rename: header labels belong to the .jsonl that applies this policy ($labels), not to the rules",
      "source: the data is named by the .jsonl that applies this policy ($sources), not by the rules",
    ]);
  });
});

describe("the rules applied", () => {
  it("filters on nested fields, sorts by two keys, shows the named columns with their labels", () => {
    const r = applyTablePolicy(DOC, STAYS);
    expect(r.total).toBe(5);
    expect(r.rows.map((x) => x.name)).toEqual(["Tilba cottage", "Cheap cabin", "Lake unit"]); // 900/15km, 900/26km, 1024
    expect(r.columns).toEqual(["name", "area", "best_offer.price", "km", "best_offer.url"]);
    expect(r.problems).toEqual([]);
  });
  it("without columns: every column the remaining rows carry, minus hide; desc sorts; limit caps", () => {
    const d = parseTablePolicy("where: [{field: area, op: in, value: [Narooma, Tilba]}]\nsort: [{field: km, dir: desc}]\nhide: [best_offer]\nlimit: 2\n");
    const r = applyTablePolicy(d, STAYS);
    expect(r.rows.map((x) => x.name)).toEqual(["Tilba cottage", "Sold out"]);
    expect(r.columns).toEqual(["name", "area", "km", "sleeps", "available"]);
  });
  it("\"*\" in columns is every other column the rows carry, after the named ones, hidden ones out", () => {
    const d = parseTablePolicy('columns: [km, name, "*"]\nhide: [best_offer]\n');
    expect(applyTablePolicy(d, STAYS).columns).toEqual(["km", "name", "area", "sleeps", "available"]);
    expect(applyTablePolicy(d, STAYS).problems).toEqual([]);
  });
  it("names a column or sort key no row carries", () => {
    const d = parseTablePolicy("columns: [name, nope]\nsort: [{field: missing, dir: asc}]\n");
    expect(applyTablePolicy(d, STAYS).problems).toEqual(['column "nope": no row carries it', 'sort "missing": no row carries it']);
  });
});

describe("composed rows — the directive line a .jsonl carries", () => {
  it("a $sources/$policy line is a directive, not a row; raw lines beside it are rows", () => {
    const d = parseDataRows('{"$sources": ["accommodation.json#properties", {"file": "more.jsonl"}], "$policy": "stays.policy"}\n{"name": "Raw one", "km": 3}\n');
    expect(d.compose).toEqual({ sources: [{ file: "accommodation.json", path: "properties" }, { file: "more.jsonl" }], policy: "stays.policy" });
    expect(d.rows).toEqual([{ name: "Raw one", km: 3 }]);
    expect(d.problems).toEqual([]);
  });
  it("the view's own words — title, description, header labels — live in the directive lines, which merge", () => {
    const d = parseDataRows([
      '{"$sources": ["a.json"], "$policy": "p.policy"}',
      '{"$title": "Stays by price", "$description": "4 nights, two adults"}',
      '{"$labels": {"best_offer.price": "Total (AUD)"}}',
      '{"$labels": {"km": "km from Narooma"}, "$sources": ["b.jsonl"]}',
    ].join("\n"));
    expect(d.compose).toEqual({
      sources: [{ file: "a.json" }, { file: "b.jsonl" }], policy: "p.policy",
      title: "Stays by price", description: "4 nights, two adults",
      labels: { "best_offer.price": "Total (AUD)", km: "km from Narooma" },
    });
    expect(d.problems).toEqual([]);
    const bad = parseDataRows('{"$title": 3, "$labels": {"km": 1}}\n{"$title": "A"}\n{"$title": "B"}');
    expect(bad.problems).toEqual(["line 1: $title must be text", 'line 1: $labels."km" must be text', "line 3: a second $title — this one applies"]);
    expect(bad.compose?.title).toBe("B");
  });
  it("either key alone works; what is not understood is a problem", () => {
    expect(parseDataRows('{"$sources": ["a.json"]}').compose).toEqual({ sources: [{ file: "a.json" }] });
    expect(parseDataRows('{"$policy": "p.policy"}').compose).toEqual({ sources: [], policy: "p.policy" });
    const d = parseDataRows('{"$sources": "a.json", "$mode": 1, "name": "x"}\n{"$policy": "a.policy"}\n{"$policy": "b.policy"}');
    expect(d.problems).toEqual([
      'line 1: unknown directive "$mode" (known: $sources, $policy, $title, $description, $labels)',
      'line 1: a directive line carries no row fields — "name" ignored',
      "line 1: $sources must be a list of files",
      "line 3: a second $policy — this one applies",
    ]);
    expect(d.compose?.policy).toBe("b.policy");
  });
  it("a plain file has no compose", () => {
    expect(parseDataRows('{"a": 1}').compose).toBeUndefined();
  });
});

describe("the source's rows", () => {
  it("a JSON object: the named key, else the LONGEST list of objects (a scrape's small `sources` list is not the rows)", () => {
    const text = JSON.stringify({ generated: "x", sources: [{ key: "a" }], trip: { n: 4 }, properties: STAYS.slice(0, 2) });
    expect(rowsOfSource(text, "a.json", "properties").rows.length).toBe(2);
    expect(rowsOfSource(text, "a.json")).toMatchObject({ path: "properties" });
    expect(rowsOfSource(text, "a.json").rows.map((r) => r.name)).toEqual(["Lake unit", "Tilba cottage"]);
    expect(rowsOfSource(text, "a.json", "trip").problems).toEqual(['"trip" is not a list in a.json']);
  });
  it("JSON lines and a JSON array go through the data-rows parser; a source's own directive is not followed", () => {
    expect(rowsOfSource('{"a":1}\n{"a":2}\n', "rows.jsonl").rows.length).toBe(2);
    expect(rowsOfSource('[{"a":1},{"a":2}]', "rows.json").rows.length).toBe(2);
    const r = rowsOfSource('{"$sources": ["x.json"]}\n{"a":1}\n', "view.jsonl");
    expect(r.rows.length).toBe(1);
    expect(r.problems).toEqual(["view.jsonl composes rows itself — only its raw lines were read"]);
  });
  it("a csv's first row is the header", () => {
    expect(rowsOfSource("name,price\nA,10\nB,20\n", "rows.csv").rows).toEqual([{ name: "A", price: "10" }, { name: "B", price: "20" }]);
  });
});

describe("the rules in words", () => {
  it("one clause as a sentence, the whole policy in a line", () => {
    expect(DOC.where.map(clauseSentence)).toEqual(["available is true", "best_offer.price between 600 and 2000"]);
    expect(clauseSentence({ param: "area", op: "in", value: ["Narooma", "Tilba"] })).toBe("area is one of “Narooma”, “Tilba”");
    expect(clauseSentence({ param: "name", op: "contains", value: "beach" })).toBe("name contains “beach”");
    expect(clauseSentence({ param: "name", op: "contains", value: ["caravan", "truck"] })).toBe("name contains any of “caravan”, “truck”");
    expect(clauseSentence({ param: "name", op: "not_contains", value: ["caravan", "truck"] })).toBe("name contains none of “caravan”, “truck”");
    expect(clauseSentence({ param: "name", op: "not_contains", value: "x" })).toBe("name contains no “x”");
    expect(clauseSentence({ param: "area", op: "not_equals", value: ["a", "b"] })).toBe("area is none of “a”, “b”");
    expect(clauseSentence({ param: "area", op: "not_equals", value: "a" })).toBe("area is not “a”");
    expect(rulesSummary(DOC)).toBe("2 filters · sorted by best_offer.price asc, then km asc");
    expect(rulesSummary(DOC, { "best_offer.price": "Total (AUD)" })).toBe("2 filters · sorted by Total (AUD) asc, then km asc");
    expect(rulesSummary(parseTablePolicy("limit: 10"))).toBe("first 10");
  });
});
