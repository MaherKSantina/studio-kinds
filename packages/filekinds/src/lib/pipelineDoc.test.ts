/** GOLDEN RULES for a pipeline — one curated list, the stages that transform it, the views that show it. */
import { describe, expect, it } from "vitest";
import { cellKey, contest, holdsUnder, itemName, parsePipeline, pipelineSummary, readWhen, rowsAt, ruleSentence, runPipeline, stageText, trail, whenText } from "./pipelineDoc";
import { readSourceRows } from "./dataSources";

const A = "9b2f6d1c-4e0a-4c7b-9a1d-2f5e8c3b7a10";
const B = "3e7a5c88-1b2d-4f0e-8a6c-d94b1e2f7c03";
const C = "c0ffee00-0000-4000-8000-000000000003";

const TEXT = `
title: Stays
decisions:
  - key: method
    label: Method
    values: [{key: measured, label: Measured}, {key: anecdotal, label: Anecdotal}]
labels: {price: "Total (AUD)"}
items:
  - {id: ${A}, name: Family Room, url: "https://www.airbnb.com.au/rooms/1", price: 900, sleeps: 4}
  - {id: ${B}, name: Beach Cabin, price: 1200, sleeps: 4}
  - {id: ${C}, name: Manor, price: 3000, sleeps: 10}
stages:
  - key: corrections
    label: Seen on the pages
    rules:
      - item: ${A}
        set: {price: 850}
        when: [method=anecdotal]
      - item: ${B}
        set: {sleeps: 6}
        when: [method=measured]
      - where: [{field: name, op: contains, value: cabin}]
        set: {type: Cabin}
  - key: band
    filter: [{field: price, op: lte, value: 2000}]
  - key: cheapest
    sort: [{field: price, dir: asc}]
views:
  - key: by-price
    label: By price
    columns: [name, sleeps, price, "*"]
  - key: groups
    label: Sleeps 6+
    filter: [{field: sleeps, op: gte, value: 6}]
`;

describe("parsing", () => {
  it("reads the decisions, the labels, the items with their ids, each stage's one verb, and the views", () => {
    const d = parsePipeline(TEXT);
    expect(d.title).toBe("Stays");
    expect(d.decisions).toEqual([{ key: "method", label: "Method", values: [{ key: "measured", label: "Measured" }, { key: "anecdotal", label: "Anecdotal" }] }]);
    expect(d.labels).toEqual({ price: "Total (AUD)" });
    expect(d.items.map((i) => i.id)).toEqual([A, B, C]);
    expect(d.stages.map((s) => [s.key, s.verb])).toEqual([["corrections", "rules"], ["band", "filter"], ["cheapest", "sort"]]);
    expect(d.stages[0].label).toBe("Seen on the pages");
    expect(d.stages[0].rules[0]).toEqual({ where: [], set: { price: 850 }, items: [A], when: ["method=anecdotal"] });
    expect(d.stages[0].rules[2]).toEqual({ where: [{ param: "name", op: "contains", value: "cabin" }], set: { type: "Cabin" }, items: [], when: [] });
    expect(d.stages[1].filter).toEqual([{ param: "price", op: "lte", value: 2000 }]);
    expect(d.stages[2].sort).toEqual([{ field: "price", dir: "asc" }]);
    expect(d.views.map((v) => v.key)).toEqual(["by-price", "groups"]);
    expect(d.views[0].columns).toEqual(["name", "sleeps", "price", "*"]);
    expect(d.views[1].where).toEqual([{ param: "sleeps", op: "gte", value: 6 }]);
    expect(d.problems).toEqual([]);
  });
  it("names what it cannot use: a stage with no verb or two, a key twice, an item without an id or with another's, an item a rule names that is no item, a ref to no decision or answer", () => {
    const d = parsePipeline(`
decisions: [{key: method, values: [measured]}]
items:
  - {name: No id}
  - {id: x, name: X}
  - {id: x, name: X again}
stages:
  - key: a
  - key: a
    filter: []
    sort: []
  - key: b
    when: [method=guessed]
    rules:
      - {item: nobody, set: {a: 1}}
      - {where: [{field: a}], set: {}, when: [colour=red]}
  - filter: [{field: a, op: is_true}]
views:
  - key: b
    filter: [{field: a, op: near}]
  - key: v
  - key: v
`);
    expect(d.problems).toEqual([
      "item 1: no id",
      "item 3: id x is item 2's too",
      "stage a: no verb — give it rules, filter or sort",
      "stage a: key twice",
      "stage a: filter and sort — one verb per stage",
      'stage b when: method has no answer "guessed"',
      "stage b rule 1: item nobody is no item",
      "stage b rule 2 where 1: no op",
      "stage b rule 2: sets nothing — give it set: {field: value} or key/value",
      'stage b rule 2 when: no decision "colour"',
      "stage 4: no key",
      "view b: a stage has this key",
      'view b filter 1: unknown op "near"',
      "view v: key twice",
    ]);
    expect(d.items[0].id).toBe("#1");
    expect(d.decisions[0].values).toEqual([{ key: "measured", label: "measured" }]);
  });
  it("readWhen takes a ref, a list, or a mapping", () => {
    expect(readWhen("method=measured")).toEqual(["method=measured"]);
    expect(readWhen(["method=measured", "site=airbnb"])).toEqual(["method=measured", "site=airbnb"]);
    expect(readWhen({ method: "measured" })).toEqual(["method=measured"]);
    expect(readWhen("nonsense")).toEqual([]);
  });
  it("an empty file is a pipeline with nothing in it", () => {
    expect(parsePipeline("")).toEqual({ title: "", decisions: [], labels: {}, items: [], stages: [], views: [], problems: [] });
  });
});

describe("running", () => {
  const doc = parsePipeline(TEXT);
  it("with nothing taken every rule applies (a later rule wins), the filter drops for good, the sort orders, the views show the output", () => {
    const run = runPipeline(doc);
    expect(run.problems).toEqual([]);
    const [rules, band, cheapest] = run.stages;
    expect(rules.matches).toEqual([[0], [1], [1]]);
    expect(rules.amended).toBe(2);
    expect(rules.rows[0]).toMatchObject({ name: "Family Room", price: 850 });
    expect(rules.rows[1]).toMatchObject({ name: "Beach Cabin", sleeps: 6, type: "Cabin" });
    expect(doc.items[0].price).toBe(900);
    expect(band.before).toBe(3);
    expect(band.rows.length).toBe(2);
    expect(band.dropped.map((r) => r.name)).toEqual(["Manor"]);
    expect(cheapest.rows.map((r) => r.name)).toEqual(["Family Room", "Beach Cabin"]);
    expect(run.output).toBe(cheapest.rows);
    expect(run.views[0].rows.map((r) => r.name)).toEqual(["Family Room", "Beach Cabin"]);
    expect(run.views[0].columns).toEqual(["name", "sleeps", "price", "url", "type"]);
    expect(run.views[1].rows.map((r) => r.name)).toEqual(["Beach Cabin"]);
    expect(run.views[1].columns).toEqual(["name", "price", "sleeps", "type"]);
  });
  it("taking an answer puts the rules under the other answer off the table; a stage or a view under a contradicted answer is skipped, an unanswered one holds", () => {
    const measured = runPipeline(doc, ["method=measured"]);
    expect(measured.stages[0].matches).toEqual([[], [1], [1]]);
    expect(measured.stages[0].rows[0].price).toBe(900);
    expect(measured.stages[0].rows[1].sleeps).toBe(6);
    expect(runPipeline(doc, ["method=anecdotal"]).stages[0].matches).toEqual([[0], [], [1]]);
    const gated = parsePipeline(`${TEXT}  - key: only-measured\n    when: [method=measured]\n    filter: [{field: sleeps, op: gte, value: 6}]\n`);
    expect(runPipeline(gated).views[2]).toMatchObject({ applied: true, rows: [expect.objectContaining({ name: "Beach Cabin" })] });
    expect(runPipeline(gated, ["method=anecdotal"]).views[2]).toMatchObject({ applied: false, rows: [] });
    const stage = parsePipeline(`items: [{id: a, n: 1}]\ndecisions: [{key: d, values: [x, y]}]\nstages: [{key: s, when: [d=x], filter: [{field: n, op: gt, value: 5}]}]\n`);
    expect(runPipeline(stage).stages[0]).toMatchObject({ applied: true, rows: [] });
    expect(runPipeline(stage, ["d=y"]).stages[0]).toMatchObject({ applied: false, rows: [{ id: "a", n: 1 }] });
    expect(holdsUnder([], ["d=x"])).toBe(true);
    expect(holdsUnder(["d=x"], ["d=x", "e=1"])).toBe(true);
    expect(holdsUnder(["d=y"], ["d=x"])).toBe(false);
  });
  it("every cell a rule set is marked with its circumstance, and a field's trail is the item's value then every claim", () => {
    const run = runPipeline(doc);
    expect(run.stages[0].set.get(cellKey(A, "price"))).toEqual(["method=anecdotal"]);
    expect(run.stages[0].set.get(cellKey(B, "type"))).toEqual([]);
    expect(run.marks.get(cellKey(B, "sleeps"))).toEqual({ value: 6, stage: "corrections", rule: 2, when: ["method=measured"] });
    expect(trail(run, A, "price")).toEqual([{ value: 900, stage: null, when: [] }, { value: 850, stage: "corrections", rule: 1, when: ["method=anecdotal"] }]);
    expect(trail(run, B, "type")).toEqual([{ value: "Cabin", stage: "corrections", rule: 3, when: [] }]);
    expect(trail(run, C, "name")).toEqual([{ value: "Manor", stage: null, when: [] }]);
  });
  it("two rules setting one key under different circumstances contest it: the cell holds the later value and the other stays on the table until an answer decides", () => {
    const d = parsePipeline(`
decisions: [{key: method, values: [measured, anecdotal]}]
items: [{id: a, name: Room, sleeps: 4}, {id: b, name: Hut, type: Shed}]
stages:
  - key: heard
    rules:
      - {item: a, set: {sleeps: 6}, when: [method=anecdotal]}
      - {item: a, set: {sleeps: 5}, when: [method=measured]}
      - {item: a, set: {sleeps: 7}, when: [method=anecdotal]}
      - {item: b, set: {type: Cabin}}
      - {item: b, set: {type: Hut}, when: [method=measured]}
  - key: later
    rules:
      - {item: b, set: {type: Barn}}
`);
    const open = runPipeline(d);
    expect(open.stages[0].rows[0].sleeps).toBe(7);
    // The later anecdotal claim stands for its circumstance; the measured one is the other value on the table.
    expect(contest(open.stages[0].claims, "a", "sleeps")).toEqual({
      holds: { value: 7, stage: "heard", rule: 3, when: ["method=anecdotal"] },
      others: [{ value: 5, stage: "heard", rule: 2, when: ["method=measured"] }],
    });
    // An unconditional claim contends like any other; as of the first stage Hut (measured) holds over Cabin.
    expect(contest(open.stages[0].claims, "b", "type")).toEqual({
      holds: { value: "Hut", stage: "heard", rule: 5, when: ["method=measured"] },
      others: [{ value: "Cabin", stage: "heard", rule: 4, when: [] }],
    });
    // After the second stage the unconditional Barn holds; the measured Hut is still on the table beside it.
    expect(contest(open.claims, "b", "type")).toEqual({
      holds: { value: "Barn", stage: "later", rule: 1, when: [] },
      others: [{ value: "Hut", stage: "heard", rule: 5, when: ["method=measured"] }],
    });
    expect(contest(open.claims, "a", "name")).toEqual({ others: [] });
    // An answer taken leaves one value: nothing is contested any more.
    const measured = runPipeline(d, ["method=measured"]);
    expect(measured.stages[0].rows[0].sleeps).toBe(5);
    expect(contest(measured.claims, "a", "sleeps")).toEqual({ holds: { value: 5, stage: "heard", rule: 2, when: ["method=measured"] }, others: [] });
    const anecdotal = runPipeline(d, ["method=anecdotal"]);
    expect(anecdotal.stages[0].rows[0].sleeps).toBe(7);
    expect(contest(anecdotal.claims, "a", "sleeps").others).toEqual([]);
  });
  it("a rule that matches no item is a problem — including one whose item an earlier filter dropped", () => {
    const d = parsePipeline(`items: [{id: a, n: 1}, {id: b, n: 9}]\nstages:\n  - {key: cut, filter: [{field: n, op: lt, value: 5}]}\n  - {key: late, rules: [{item: b, set: {seen: true}}, {where: [{field: n, op: equals, value: 7}], set: {x: 1}}]}\n`);
    expect(runPipeline(d).problems).toEqual(["stage late rule 1 matches no item", "stage late rule 2 matches no item"]);
  });
  it("words: the stage line, the rule's pick, the circumstance, the item's name, the checker's summary", () => {
    const run = runPipeline(doc);
    expect(run.stages.map(stageText)).toEqual(["rules · 2 set", "filter · 3 → 2", "sort · 2"]);
    expect(stageText(runPipeline(parsePipeline(`items: [{id: a}]\ndecisions: [{key: d, values: [x, y]}]\nstages: [{key: s, when: [d=x], sort: [a]}]\n`), ["d=y"]).stages[0])).toBe("sort · skipped");
    expect(ruleSentence(doc.stages[0].rules[0], doc.items)).toBe("item Family Room");
    expect(ruleSentence(doc.stages[0].rules[2], doc.items)).toBe("name contains “cabin”");
    expect(ruleSentence({ where: [], set: {}, items: [], when: [] }, doc.items)).toBe("every item");
    expect(whenText(["method=anecdotal"], doc.decisions)).toBe("Method = Anecdotal");
    expect(whenText(["site=airbnb"])).toBe("site = airbnb");
    expect(itemName({ id: "x", url: "https://a.b", name: "Spa" })).toBe("Spa");
    expect(itemName({ id: "x", n: 1 })).toBe("x");
    expect(pipelineSummary(doc, run)).toBe("3 items → corrections (rules · 2 set; rule 1 → 1, rule 2 → 1, rule 3 → 1) → band (filter · 3 → 2) → cheapest (sort · 2) → 2 out · views: by-price 2, groups 1 · 1 decision");
  });
  it("rowsAt: nothing = the output, a stage's key = the rows as of it, a view's key = its rows and columns, anything else a problem", () => {
    const run = runPipeline(doc);
    expect(rowsAt(run).rows).toBe(run.output);
    expect(rowsAt(run, "corrections").rows.length).toBe(3);
    expect(rowsAt(run, "groups")).toMatchObject({ rows: [expect.objectContaining({ name: "Beach Cabin" })], columns: ["name", "price", "sleeps", "type"] });
    expect(rowsAt(run, "nope")).toEqual({ rows: [], problems: ['no stage or view "nope"'] });
  });
});

describe("read from elsewhere", () => {
  const FILES: Record<string, string> = {
    "/trip/stays.pipeline": TEXT,
    "/trip/more.middleware": "source: stays.pipeline#corrections\nrules:\n  - {where: [{field: name, op: equals, value: Manor}], set: {seen: true}}\n",
  };
  const read = (abs: string) => (abs in FILES ? Promise.resolve(FILES[abs]) : Promise.reject(new Error("ENOENT")));
  it("a source ref to the file gives the output; #stage the rows as of the stage; #view its rows and columns; a middleware chains over it", async () => {
    const out = await readSourceRows({ file: "stays.pipeline" }, "/trip/view.jsonl", read);
    expect(out.rows.map((r) => r.name)).toEqual(["Family Room", "Beach Cabin"]);
    expect(out.chain).toEqual(["stays.pipeline"]);
    expect(out.files).toEqual(["/trip/stays.pipeline"]);
    expect(out.amended).toBe(2);
    expect(out.problems).toEqual([]);
    const view = await readSourceRows({ file: "stays.pipeline", path: "groups" }, "/trip/view.jsonl", read);
    expect(view.rows.map((r) => r.name)).toEqual(["Beach Cabin"]);
    expect(view.columns).toEqual(["name", "price", "sleeps", "type"]);
    const stage = await readSourceRows({ file: "stays.pipeline", path: "corrections" }, "/trip/view.jsonl", read);
    expect(stage.rows.length).toBe(3);
    const chained = await readSourceRows({ file: "more.middleware" }, "/trip/view.jsonl", read);
    expect(chained.rows.find((r) => r.name === "Manor")).toMatchObject({ seen: true });
    expect(chained.chain).toEqual(["more.middleware", "stays.pipeline#corrections"]);
    const missing = await readSourceRows({ file: "stays.pipeline", path: "nope" }, "/trip/view.jsonl", read);
    expect(missing.problems).toEqual(['stays.pipeline: no stage or view "nope"']);
  });
});
