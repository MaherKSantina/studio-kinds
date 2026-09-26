/** GOLDEN RULES for a views document — one list, the roles that unlock the views, the file's own views and their filters, everything derived from the text. */
import { describe, expect, it } from "vitest";
import nunjucks from "nunjucks";
import {
  availableViews, cellText, columnIndexOf, columnsOf, cyclicOf, docOfView, ganttOf, layersOf, pageOfView, parentCyclic, parseViews, rowsOfView,
  tableColumnsOf, treeOf, viewsSummary,
} from "./viewsDoc";
import { RENDER_PAGE } from "./pageDoc";
import PAGE_VIEW from "../../../../conformance/views/page-view.views?raw";

const TEXT = `
title: Launch
description: Five ways.
fields:
  id: key
  title: name
  status: stage
  start: from
  end: to
  previous: after
columns: [To do, Doing, Done]
items:
  - key: plan
    name: Plan the launch
    stage: Done
    from: 2026-10-01
    to: 2026-10-03
    owner: Maher
  - key: build
    name: Build it
    stage: Doing
    from: 2026-10-04
    to: 2026-10-10
    after: plan
  - key: test
    name: Test it
    stage: To do
    from: "2026-10-08"
    to: "2026-10-12"
    after: [build]
  - key: 7
    name: Ship
    stage: to do
    from: 2026-10-13
    to: 2026-10-13
    after: [build, test, nobody, 7]
  - key: build
    name: A second build, dropped
  - name: no key
`;

const NESTED = `
title: Nested
fields: {id: key, title: name, status: stage, start: from, end: to, previous: after, parent: under}
columns: [To do, Doing, Done]
views:
  - key: open
    kind: kanban
    label: Open work
    filter: [{field: stage, op: not_equals, value: Done}]
    sort: [{field: from, dir: desc}]
  - key: plan
    kind: gantt
  - key: two
    kind: table
    limit: 2
  - key: skipped
    kind: dance
  - key: open
    kind: table
items:
  - {key: plan, name: Plan, stage: Done, from: 2026-10-01, to: 2026-10-03}
  - {key: build, name: Build, stage: Doing, after: plan}
  - {key: api, name: The API, stage: Doing, from: 2026-10-04, to: 2026-10-07, under: build}
  - {key: ui, name: The UI, stage: To do, from: 2026-10-07, to: 2026-10-10, under: build, after: api}
  - {key: ship, name: Ship, stage: To do, from: 2026-10-11, to: 2026-10-11, after: build, under: ship}
  - {key: loose, name: Loose, stage: To do, under: nobody}
`;

describe("parsing", () => {
  it("reads the roles by the items' own keys, the columns, and every item with its id, label, status, dates and previous", () => {
    const d = parseViews(TEXT);
    expect(d.title).toBe("Launch");
    expect(d.fields).toEqual({ id: "key", title: "name", status: "stage", start: "from", end: "to", previous: "after" });
    expect(d.columns).toEqual(["To do", "Doing", "Done"]);
    expect(d.views).toBeNull();
    expect(d.items.map((i) => i.id)).toEqual(["plan", "build", "test", "7", "#6"]);
    expect(d.items[0]).toMatchObject({ title: "Plan the launch", status: "Done", start: "2026-10-01", end: "2026-10-03", previous: [] });
    expect(d.items[0].fields.owner).toBe("Maher");
    expect(d.items[2]).toMatchObject({ start: "2026-10-08", end: "2026-10-12", previous: ["build"] });
  });
  it("keeps only the previous ids that are items here, the item itself excluded; a second id is dropped; no id is #N", () => {
    const d = parseViews(TEXT);
    expect(d.items[3].previous).toEqual(["build", "test"]);
    expect(d.items[4]).toMatchObject({ id: "#6", title: "no key" });
  });
  it("reads a parent only when it is another item here, and the file's views only when their kind and roles hold", () => {
    const d = parseViews(NESTED);
    expect(d.items.find((i) => i.id === "api")?.parent).toBe("build");
    expect(d.items.find((i) => i.id === "ship")?.parent).toBeUndefined();
    expect(d.items.find((i) => i.id === "loose")?.parent).toBeUndefined();
    expect(d.views?.map((v) => [v.key, v.kind, v.label])).toEqual([["open", "kanban", "Open work"], ["plan", "gantt", "Gantt"], ["two", "table", "Table"]]);
    expect(d.views?.[0].where).toEqual([{ param: "stage", op: "not_equals", value: "Done" }]);
    expect(d.views?.[0].sort).toEqual([{ field: "from", dir: "desc" }]);
    expect(d.views?.[2].limit).toBe(2);
  });
  it("defaults id and title to keys of those names and never throws", () => {
    const d = parseViews("title: x\nitems:\n  - {id: a, title: A}\n");
    expect(d.fields).toEqual({ id: "id", title: "title" });
    expect(d.items[0]).toMatchObject({ id: "a", title: "A", previous: [] });
    expect(parseViews("title: [").items).toEqual([]);
    expect(parseViews("- a").fields).toEqual({ id: "id", title: "title" });
  });
});

describe("the views offered", () => {
  it("without views: a table always, and the rest by role", () => {
    const kinds = (t: string) => availableViews(parseViews(t)).map((v) => v.kind);
    expect(kinds(TEXT)).toEqual(["table", "kanban", "calendar", "gantt", "tree"]);
    expect(kinds("title: x\nitems: []")).toEqual(["table"]);
    expect(kinds("title: x\nfields: {status: s}\nitems: []")).toEqual(["table", "kanban"]);
    expect(kinds("title: x\nfields: {start: s}\nitems: []")).toEqual(["table", "calendar"]);
    expect(kinds("title: x\nfields: {previous: p}\nitems: []")).toEqual(["table", "tree"]);
    expect(kinds("title: x\nfields: {start: s, end: e, parent: p}\nitems: []")).toEqual(["table", "calendar", "gantt"]);
    expect(kinds("title: x\nfields: {start: s, end: e, previous: p}\nitems: []")).toEqual(["table", "calendar", "gantt", "tree"]);
  });
  it("with views: those, in that order, each over the items its rules keep", () => {
    const d = parseViews(NESTED);
    const [open, , two] = availableViews(d);
    expect(rowsOfView(d, open).map((i) => i.id)).toEqual(["ship", "ui", "api", "build", "loose"]);
    expect(rowsOfView(d, two).map((i) => i.id)).toEqual(["plan", "build"]);
    expect(rowsOfView(d, availableViews(d)[1])).toBe(d.items);
    // Edges to items a view hides are dropped for that view.
    const seen = docOfView(d, open);
    expect(seen.items.find((i) => i.id === "build")?.previous).toEqual([]);
    expect(seen.items.find((i) => i.id === "api")?.parent).toBe("build");
  });
  it("takes the file's columns, else the statuses found first seen first; an unknown status lands first", () => {
    const d = parseViews(TEXT);
    expect(columnsOf(d)).toEqual(["To do", "Doing", "Done"]);
    expect(columnIndexOf(d.items[3], columnsOf(d))).toBe(0);
    expect(columnIndexOf(d.items[1], columnsOf(d))).toBe(1);
    const found = parseViews("title: x\nfields: {status: s}\nitems:\n  - {id: a, s: Open}\n  - {id: b, s: Closed}\n  - {id: c, s: Open}\n  - {id: d}\n");
    expect(columnsOf(found)).toEqual(["Open", "Closed"]);
    expect(columnIndexOf(found.items[3], columnsOf(found))).toBe(0);
  });
});

describe("derived", () => {
  it("layers by longest chain of previous; cycles of previous and of parent are apart", () => {
    const d = parseViews(TEXT);
    expect([...layersOf(d.items).entries()]).toEqual([["plan", 0], ["#6", 0], ["build", 1], ["test", 2], ["7", 3]]);
    const cyc = parseViews("title: x\nfields: {previous: p, parent: u}\nitems:\n  - {id: a, p: b}\n  - {id: b, p: a}\n  - {id: c, u: d}\n  - {id: d, u: c}\n  - {id: e, u: c}\n");
    expect(cyclicOf(cyc.items).map((i) => i.id)).toEqual(["a", "b"]);
    expect(parentCyclic(cyc.items).map((i) => i.id)).toEqual(["c", "d", "e"]);
  });
  it("lays a gantt on a day scale from the earliest start to the latest end, rows in dependency order", () => {
    const g = ganttOf(parseViews(TEXT));
    expect([g.first, g.last, g.days]).toEqual(["2026-10-01", "2026-10-13", 13]);
    expect(g.rows.map((r) => [r.item.id, r.from, r.to, r.depth, r.level])).toEqual([["plan", 0, 2, 0, 0], ["build", 3, 9, 1, 0], ["test", 7, 11, 2, 0], ["7", 12, 12, 3, 0]]);
    expect(g.missing.map((i) => i.id)).toEqual(["#6"]);
  });
  it("nests children under their parent, and a parent without dates spans its children", () => {
    const g = ganttOf(parseViews(NESTED));
    expect(g.rows.map((r) => [r.item.id, r.level, r.start, r.end, r.summary])).toEqual([
      ["plan", 0, "2026-10-01", "2026-10-03", false],
      ["build", 0, "2026-10-04", "2026-10-10", true],
      ["api", 1, "2026-10-04", "2026-10-07", false],
      ["ui", 1, "2026-10-07", "2026-10-10", false],
      ["ship", 0, "2026-10-11", "2026-10-11", false],
    ]);
    expect(g.missing.map((i) => i.id)).toEqual(["loose"]);
  });
  it("builds the tree from the roots, repeating an item under each thing it comes after", () => {
    const t = treeOf(parseViews(TEXT));
    expect(t.roots.map((r) => r.item.id)).toEqual(["plan", "#6"]);
    const build = t.roots[0].children[0];
    expect(build.item.id).toBe("build");
    expect(build.children.map((c) => c.item.id)).toEqual(["test", "7"]);
    expect(build.children[1].alsoAfter.map((i) => i.id)).toEqual(["test"]);
    expect(build.children[0].children[0].item.id).toBe("7");
    expect(t.cyclic).toEqual([]);
  });
  it("shows the id and the label first in the table, then every key found; cells as text", () => {
    const d = parseViews(TEXT);
    expect(tableColumnsOf(d)).toEqual(["key", "name", "stage", "from", "to", "owner", "after"]);
    expect(cellText(d.items[0].fields.from)).toBe("2026-10-01");
    expect(cellText(["a", "b"])).toBe("a, b");
    expect(cellText({ a: 1 })).toBe('{"a":1}');
    expect(cellText(null)).toBe("");
  });
  it("summarises as the checker does", () => {
    expect(viewsSummary(parseViews(TEXT))).toBe("5 items · table, kanban (3 columns), calendar, gantt, tree");
    expect(viewsSummary(parseViews("title: x\nitems: []"))).toBe("0 items · table");
    expect(viewsSummary(parseViews(NESTED))).toBe("6 items · views: open (kanban, 3 columns) 5, plan (gantt), two (table) 2");
  });
});

describe("a page view", () => {
  const renderPage = new Function(`return ${RENDER_PAGE}`)() as (engine: typeof nunjucks, page: object) => { html?: string; error?: string };

  it("is a view the file names with its template and partials — the roles never offer one", () => {
    const doc = parseViews(PAGE_VIEW);
    const page = doc.views!.find((v) => v.kind === "page")!;
    expect(page).toMatchObject({ key: "report", label: "Report", template: expect.stringContaining("{% for item in items %}") });
    expect(Object.keys(page.partials!)).toEqual(["row"]);
    expect(doc.views!.find((v) => v.kind === "table")).not.toHaveProperty("template");
    expect(availableViews(parseViews(TEXT)).map((v) => v.kind)).not.toContain("page");
    expect(parseViews("title: x\nviews: [{key: p, kind: page}]\nitems: []").views).toEqual([
      { key: "p", kind: "page", label: "Page", where: [], sort: [], template: "", partials: {} },
    ]);
  });
  it("hands its template the view's items as written, the title, the fields, the columns and the view", () => {
    const doc = parseViews(PAGE_VIEW);
    const { template, partials, model } = pageOfView(doc, doc.views!.find((v) => v.kind === "page")!);
    expect(template).toContain("{% include \"row\" %}");
    expect(Object.keys(partials)).toEqual(["row"]);
    expect(model).toEqual({
      title: "Launch",
      view: { key: "report", label: "Report" },
      fields: { id: "key", title: "name", status: "stage" },
      columns: ["To do", "Doing", "Done"],
      items: [
        { key: "build", name: "Build it", stage: "Doing", due: "2026-10-10" },
        { key: "test", name: "Test it", stage: "To do", due: "2026-10-12" },
      ],
    });
  });
  it("renders through the frame's own code", () => {
    const doc = parseViews(PAGE_VIEW);
    const html = renderPage(nunjucks, pageOfView(doc, doc.views!.find((v) => v.kind === "page")!)).html!;
    expect(html).toContain("<h1>Launch — Report</h1>");
    expect(html).toContain("<tr><td>Build it</td><td>Doing</td><td>2026-10-10</td></tr>");
    expect(html).not.toContain("Plan the launch");
    expect(html).toContain("<p>2 open, in To do → Doing → Done</p>");
  });
  it("summarises as the checker does", () => {
    expect(viewsSummary(parseViews(PAGE_VIEW))).toBe("3 items · views: all (table), report (page) 2");
  });
  it("renders every page view of the examples and of the corpus's passing cases", () => {
    const corpus = import.meta.glob("../../../../conformance/views/*.views", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const verdicts = import.meta.glob("../../../../conformance/views/*.views.expected.json", { import: "default", eager: true }) as Record<string, { ok: boolean }>;
    const files = {
      ...import.meta.glob("../../../../examples/*.views", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
      ...Object.fromEntries(Object.entries(corpus).filter(([path]) => verdicts[`${path}.expected.json`]?.ok)),
    };
    const pages = Object.entries(files).flatMap(([path, text]) => {
      const doc = parseViews(text);
      return (doc.views ?? []).filter((v) => v.kind === "page").map((v) => ({ path, key: v.key, out: renderPage(nunjucks, pageOfView(doc, v)) }));
    });
    expect(pages.length).toBeGreaterThanOrEqual(2);
    for (const p of pages) expect(p.out.error, `${p.path} ${p.key}`).toBeUndefined();
    const status = pages.find((p) => p.key === "status")!.out.html!;
    expect(status).toContain("<h1>Launch: Status report</h1>");
    expect(status).toContain("<h2>Doing · 2</h2>");
    expect(status).toContain("<li><b>The API</b> <small>2026-10-04 → 2026-10-07</small></li>");
  });
});
