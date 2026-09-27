/** GOLDEN RULES for a views document — one list, the roles that unlock the views, the file's own views and their filters, everything derived from the text. */
import { describe, expect, it } from "vitest";
import nunjucks from "nunjucks";
import {
  availableViews, cellText, columnIndexOf, columnsOf, cyclicOf, docOfView, foldOutline, ganttOf, groupOutline, isGroupRow, itemCellText, layersOf,
  linksOf, listedFieldsOf, mondayOf, pageOfView, lanesOf, parentCyclic, parseViews, rowsOfView, sameSpan, sequenceOf, shiftCalendar, spanTitle,
  tableColumnsOf, treeOf, viewsSummary,
} from "./viewsDoc";
import { RENDER_PAGE } from "./pageDoc";
import PAGE_VIEW from "../../../../conformance/views/page-view.views?raw";
import CONTENT from "../../../../conformance/views/content.views?raw";
import GROUPED from "../../../../conformance/views/group.views?raw";
import GROUPED_OUTLINE from "../../../../conformance/views/group-outline.views?raw";

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
  it("reads the document written into an item when its `content` is a mapping, the kind as the registry knows it", () => {
    const d = parseViews(CONTENT);
    expect(d.items.map((i) => i.content?.kind)).toEqual(["brief", "md", undefined]);
    expect(d.items[0].content?.doc).toMatchObject({ title: "The kickoff", sections: [{ title: "Agenda" }, { title: "Who" }] });
    expect(d.items[1].content?.doc).toBe("The notes from the review, in the item.");
    const odd = parseViews("title: x\nitems:\n  - {id: a, content: a string}\n  - {id: b, content: {kind: .Brief, doc: {title: B}}}\n");
    expect(odd.items[0].content).toBeUndefined();
    expect(odd.items[0].fields.content).toBe("a string");
    expect(odd.items[1].content).toEqual({ kind: "brief", doc: { title: "B" } });
  });
});

describe("the views offered", () => {
  it("without views: a table always, and the rest by role", () => {
    const kinds = (t: string) => availableViews(parseViews(t)).map((v) => v.kind);
    expect(kinds(TEXT)).toEqual(["table", "kanban", "calendar", "gantt", "sequence", "tree"]);
    expect(kinds("title: x\nitems: []")).toEqual(["table"]);
    expect(kinds("title: x\nfields: {status: s}\nitems: []")).toEqual(["table", "kanban"]);
    expect(kinds("title: x\nfields: {start: s}\nitems: []")).toEqual(["table", "calendar"]);
    expect(kinds("title: x\nfields: {previous: p}\nitems: []")).toEqual(["table", "sequence", "tree"]);
    expect(kinds("title: x\nfields: {parent: p}\nitems: []")).toEqual(["table", "sequence"]);
    expect(kinds("title: x\nfields: {start: s, end: e, parent: p}\nitems: []")).toEqual(["table", "calendar", "gantt", "sequence"]);
    expect(kinds("title: x\nfields: {start: s, end: e, previous: p}\nitems: []")).toEqual(["table", "calendar", "gantt", "sequence", "tree"]);
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
  it("names the kind of an item's document in the table, and lists every other field in its dialog", () => {
    const d = parseViews(CONTENT);
    expect(tableColumnsOf(d)).toEqual(["id", "title", "start", "content", "end"]);
    expect(d.items.map((i) => itemCellText(i, "content"))).toEqual(["brief", "md", ""]);
    expect(itemCellText(d.items[1], "end")).toBe("2026-10-13");
    expect(listedFieldsOf(d.items[0]).map(([k]) => k)).toEqual(["id", "title", "start"]);
    expect(listedFieldsOf(d.items[2]).map(([k]) => k)).toEqual(["id", "title", "start"]);
    const odd = parseViews("title: x\nitems:\n  - {id: a, content: a string}\n");
    expect(itemCellText(odd.items[0], "content")).toBe("a string");
    expect(listedFieldsOf(odd.items[0]).map(([k]) => k)).toEqual(["id", "content"]);
  });
  it("summarises as the checker does", () => {
    expect(viewsSummary(parseViews(TEXT))).toBe("5 items · table, kanban (3 columns), calendar, gantt, sequence, tree");
    expect(viewsSummary(parseViews("title: x\nitems: []"))).toBe("0 items · table");
    expect(viewsSummary(parseViews(NESTED))).toBe("6 items · views: open (kanban, 3 columns) 5, plan (gantt), two (table) 2");
    expect(viewsSummary(parseViews(CONTENT))).toBe("3 items, 2 documents · views: month (calendar), all (table)");
  });
});

describe("the sequence", () => {
  const PARTS = `
title: Parts
fields: {previous: after, parent: under}
items:
  - {id: design}
  - {id: build, after: design}
  - {id: api, under: build}
  - {id: ui, under: build, after: api}
  - {id: docs, under: build}
  - {id: review, after: [api, ui]}
  - {id: ship, after: build}
`;
  const lay = (t: string) => sequenceOf(parseViews(t)).rows.map((r) => [r.item.id, r.level, r.from, r.to, r.summary]);

  it("stands every item one step past everything it comes after, dates or not, in the file's order", () => {
    const s = sequenceOf(parseViews(TEXT));
    expect(s.rows.map((r) => [r.item.id, r.level, r.from, r.to, r.summary])).toEqual([
      ["plan", 0, 0, 0, false], ["build", 0, 1, 1, false], ["test", 0, 2, 2, false], ["7", 0, 3, 3, false], ["#6", 0, 0, 0, false],
    ]);
    expect([s.steps, s.looped]).toEqual([4, []]);
  });
  it("nests parts under their whole: what the whole comes after holds for its parts, what comes after it waits for all of them", () => {
    const s = sequenceOf(parseViews(PARTS));
    expect(s.rows.map((r) => [r.item.id, r.level, r.from, r.to, r.summary])).toEqual([
      ["design", 0, 0, 0, false],
      ["build", 0, 1, 2, true],
      ["api", 1, 1, 1, false],
      ["ui", 1, 2, 2, false],
      ["docs", 1, 1, 1, false],
      ["review", 0, 3, 3, false],
      ["ship", 0, 3, 3, false],
    ]);
    expect(s.steps).toBe(4);
    expect(lay(NESTED)).toEqual([
      ["plan", 0, 0, 0, false], ["build", 0, 1, 2, true], ["api", 1, 1, 1, false], ["ui", 1, 2, 2, false],
      ["ship", 0, 3, 3, false], ["loose", 0, 0, 0, false],
    ]);
  });
  it("puts an item below the siblings it comes after, whatever the file's order", () => {
    expect(lay("title: x\nfields: {previous: after}\nitems:\n  - {id: c, after: b}\n  - {id: b, after: a}\n  - {id: a}\n  - {id: d}\n"))
      .toEqual([["a", 0, 0, 0, false], ["b", 0, 1, 1, false], ["c", 0, 2, 2, false], ["d", 0, 0, 0, false]]);
  });
  it("lays out only what the view keeps, in the view's order: a whole it hides leaves its parts at the top", () => {
    const d = parseViews(NESTED);
    const s = sequenceOf(docOfView(d, d.views!.find((v) => v.key === "open")!));
    expect(s.rows.map((r) => [r.item.id, r.level, r.from, r.to, r.summary])).toEqual([
      ["build", 0, 0, 1, true], ["api", 1, 0, 0, false], ["ui", 1, 1, 1, false], ["ship", 0, 2, 2, false], ["loose", 0, 0, 0, false],
    ]);
    const whole = parseViews("title: x\nfields: {parent: under}\nviews: [{key: parts, kind: sequence, filter: [{field: id, op: not_equals, value: w}]}]\nitems:\n  - {id: w}\n  - {id: p, under: w}\n");
    expect(sequenceOf(docOfView(whole, whole.views![0])).rows.map((r) => [r.item.id, r.level])).toEqual([["p", 0]]);
  });
  it("gives no step to what is caught in a loop — of previous, of parent, or a part and its whole out of order", () => {
    const looped = (t: string) => sequenceOf(parseViews(t)).looped.map((i) => i.id);
    const F = "title: x\nfields: {previous: after, parent: under}\nitems:\n";
    expect(looped(`${F}  - {id: a, after: b}\n  - {id: b, after: a}\n  - {id: c, after: a}\n  - {id: d}\n`)).toEqual(["a", "b", "c"]);
    expect(looped(`${F}  - {id: c, under: d}\n  - {id: d, under: c}\n  - {id: e, under: c}\n`)).toEqual(["c", "d", "e"]);
    // A part after its own whole; a whole after its own part.
    expect(looped(`${F}  - {id: whole}\n  - {id: part, under: whole, after: whole}\n  - {id: ok}\n`)).toEqual(["whole", "part"]);
    expect(looped(`${F}  - {id: w, after: p}\n  - {id: p, under: w}\n`)).toEqual(["w", "p"]);
    // A part after what comes after its whole — the whole's other part still stands, on its own.
    const s = sequenceOf(parseViews(`${F}  - {id: w}\n  - {id: p, under: w, after: r}\n  - {id: r, after: w}\n  - {id: other, under: w}\n`));
    expect(s.looped.map((i) => i.id)).toEqual(["w", "p", "r"]);
    expect(s.rows.map((r) => [r.item.id, r.level, r.from])).toEqual([["other", 0, 0]]);
  });
  it("is offered by `previous` or `parent`, and summarised as the checker does", () => {
    const d = parseViews("title: x\nfields: {parent: under}\nviews: [{key: steps, kind: sequence}, {key: no, kind: tree}]\nitems:\n  - {id: w}\n  - {id: p, under: w}\n");
    expect(d.views!.map((v) => [v.key, v.kind, v.label])).toEqual([["steps", "sequence", "Sequence"]]);
    expect(viewsSummary(d)).toBe("2 items · views: steps (sequence)");
    expect(parseViews("title: x\nviews: [{key: steps, kind: sequence}]\nitems: []").views).toEqual([]);
  });
});

describe("folding an outline", () => {
  const PARTS = `
title: Parts
fields: {previous: after, parent: under}
items:
  - {id: design}
  - {id: build, after: design}
  - {id: api, under: build}
  - {id: ui, under: build, after: api}
  - {id: docs, under: build}
  - {id: review, after: [api, ui]}
  - {id: ship, after: build}
`;
  const rows = sequenceOf(parseViews(PARTS)).rows;

  it("shows every row while nothing is folded, a row with rows under it marked a parent", () => {
    const { shown, drawnAs } = foldOutline(rows, new Set());
    expect(shown.map((s) => [s.row.item.id, s.parent, s.folded, s.hidden])).toEqual([
      ["design", false, false, 0], ["build", true, false, 0], ["api", false, false, 0], ["ui", false, false, 0],
      ["docs", false, false, 0], ["review", false, false, 0], ["ship", false, false, 0],
    ]);
    expect(linksOf(rows, drawnAs)).toEqual([
      { from: "design", to: "build" }, { from: "api", to: "ui" }, { from: "api", to: "review" }, { from: "ui", to: "review" }, { from: "build", to: "ship" },
    ]);
  });
  it("hides a folded parent's rows and draws their arrows to it — one arrow for the edges that fold onto the same rows, none inside", () => {
    const { shown, drawnAs } = foldOutline(rows, new Set(["build", "design"]));
    expect(shown.map((s) => [s.row.item.id, s.folded, s.hidden])).toEqual([
      ["design", false, 0], ["build", true, 3], ["review", false, 0], ["ship", false, 0],
    ]);
    expect([drawnAs.get("api"), drawnAs.get("ui"), drawnAs.get("docs"), drawnAs.get("ship")]).toEqual(["build", "build", "build", "ship"]);
    expect(linksOf(rows, drawnAs)).toEqual([{ from: "design", to: "build" }, { from: "build", to: "review" }, { from: "build", to: "ship" }]);
  });
  it("folds the gantt's rows the same way", () => {
    const g = ganttOf(parseViews(NESTED));
    const { shown, drawnAs } = foldOutline(g.rows, new Set(["build"]));
    expect(shown.map((s) => [s.row.item.id, s.folded, s.hidden])).toEqual([["plan", false, 0], ["build", true, 2], ["ship", false, 0]]);
    expect(linksOf(g.rows, drawnAs)).toEqual([{ from: "plan", to: "build" }, { from: "build", to: "ship" }]);
  });
});

describe("a grouped gantt or sequence", () => {
  const cut = (rows: { key: string; level: number; from: number; to: number }[]) => rows.map((r) => [r.key, r.level, r.from, r.to]);

  it("reads `group` on a kanban, a gantt or a sequence view, and on no other kind", () => {
    const d = parseViews(`
title: G
fields: {status: status, start: start, end: end, previous: after}
views:
  - {key: board, kind: kanban, group: owner}
  - {key: plan, kind: gantt, group: owner}
  - {key: steps, kind: sequence, group: owner}
  - {key: chain, kind: tree, group: owner}
  - {key: rows, kind: table, group: owner}
items: []
`);
    expect(d.views!.map((v) => v.group)).toEqual(["owner", "owner", "owner", undefined, undefined]);
  });
  it("gathers the top rows under a row per value, in the order the items first carry it, the rows with none last; a part stays under its whole", () => {
    const d = parseViews(GROUPED_OUTLINE);
    const rows = groupOutline(sequenceOf(d).rows, d.items, "team");
    expect(cut(rows)).toEqual([
      ["group:Product", 0, 0, 3], ["design", 1, 0, 0], ["launch", 1, 3, 3],
      ["group:Engineering", 0, 1, 2], ["build", 1, 1, 2], ["api", 2, 1, 1], ["ui", 2, 2, 2],
      ["group:", 0, 4, 4], ["party", 1, 4, 4],
    ]);
    expect(rows.filter(isGroupRow).map((g) => [g.group, g.items, g.summary])).toEqual([["Product", 2, true], ["Engineering", 3, true], ["", 1, true]]);
    const plain = sequenceOf(d).rows;
    expect(groupOutline(plain, d.items, undefined)).toBe(plain);
  });
  it("folds a group as a parent, the arrows of the rows it hides drawn to it", () => {
    const d = parseViews(GROUPED_OUTLINE);
    const rows = groupOutline(sequenceOf(d).rows, d.items, "team");
    expect(linksOf(rows, foldOutline(rows, new Set()).drawnAs)).toEqual([
      { from: "build", to: "launch" }, { from: "design", to: "build" }, { from: "api", to: "ui" }, { from: "launch", to: "party" },
    ]);
    const { shown, drawnAs } = foldOutline(rows, new Set(["group:Engineering"]));
    expect(shown.map((s) => [s.row.key, s.folded, s.hidden])).toEqual([
      ["group:Product", false, 0], ["design", false, 0], ["launch", false, 0], ["group:Engineering", true, 3], ["group:", false, 0], ["party", false, 0],
    ]);
    expect(linksOf(rows, drawnAs)).toEqual([
      { from: "group:Engineering", to: "launch" }, { from: "design", to: "group:Engineering" }, { from: "launch", to: "party" },
    ]);
  });
  it("keys a group apart from every item's id", () => {
    const d = parseViews("title: x\nfields: {previous: after}\nitems:\n  - {id: 'group:A', team: A}\n  - {id: b, team: A, after: 'group:A'}\n");
    expect(groupOutline(sequenceOf(d).rows, d.items, "team").map((r) => r.key)).toEqual(["group:A'", "group:A", "b"]);
  });
  it("groups the gantt's rows the same way, over the rows it draws", () => {
    const d = parseViews(GROUPED_OUTLINE);
    const g = ganttOf(d);
    expect(cut(groupOutline(g.rows, d.items, "team"))).toEqual([
      ["group:Product", 0, 0, 8], ["design", 1, 0, 1], ["launch", 1, 8, 8],
      ["group:Engineering", 0, 2, 7], ["build", 1, 2, 7], ["api", 2, 2, 5], ["ui", 2, 4, 7],
    ]);
    expect(g.missing.map((i) => i.id)).toEqual(["party"]);
  });
  it("summarises as the checker does, counting the groups of the view's top items", () => {
    expect(viewsSummary(parseViews(GROUPED_OUTLINE))).toBe("6 items · views: steps (sequence, 3 groups), plan (gantt, 3 groups), open (sequence, 3 groups) 5");
  });
});

describe("the calendar", () => {
  it("moves by a day, a week or a month — a month keeps the day, its last when the month is shorter", () => {
    expect(shiftCalendar("2026-10-05", "day", 1)).toBe("2026-10-06");
    expect(shiftCalendar("2026-12-31", "day", 1)).toBe("2027-01-01");
    expect(shiftCalendar("2026-10-05", "week", -1)).toBe("2026-09-28");
    expect(shiftCalendar("2026-10-05", "month", 1)).toBe("2026-11-05");
    expect(shiftCalendar("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(shiftCalendar("2028-03-31", "month", -1)).toBe("2028-02-29");
    expect(shiftCalendar("2026-12-15", "month", 1)).toBe("2027-01-15");
  });
  it("runs a week Monday to Sunday, and knows when two days share a span", () => {
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
    expect(sameSpan("week", "2026-10-05", "2026-10-11")).toBe(true);
    expect(sameSpan("week", "2026-10-11", "2026-10-12")).toBe(false);
    expect(sameSpan("month", "2026-10-01", "2026-10-31")).toBe(true);
    expect(sameSpan("day", "2026-10-01", "2026-10-02")).toBe(false);
  });
  it("heads each span in words, a week across months or years naming both", () => {
    expect(spanTitle("day", "2026-10-05")).toBe("Monday 5 October 2026");
    expect(spanTitle("week", "2026-10-07")).toBe("5 – 11 October 2026");
    expect(spanTitle("week", "2026-10-01")).toBe("28 September – 4 October 2026");
    expect(spanTitle("week", "2026-12-31")).toBe("28 December 2026 – 3 January 2027");
    expect(spanTitle("month", "2026-10-31")).toBe("October 2026");
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

describe("a grouped kanban", () => {
  it("reads `group` on a kanban view, and on no other kind", () => {
    const d = parseViews(`
title: G
fields: {id: id, title: title, status: status, start: start}
views:
  - {key: board, kind: kanban, group: owner}
  - {key: plain, kind: kanban}
  - {key: rows, kind: table, group: owner}
  - {key: days, kind: calendar, group: owner}
items:
  - {id: a, title: A, status: To do, start: 2026-10-01, owner: Ana}
`);
    expect(d.views!.map((v) => v.group)).toEqual(["owner", undefined, undefined, undefined]);
  });

  it("lanes are the values found, first seen first, the items with none last", () => {
    const d = parseViews(GROUPED);
    const board = d.views!.find((v) => v.key === "board")!;
    expect(lanesOf(rowsOfView(d, board), board.group)).toEqual([
      { label: "Ana", items: [d.items[0], d.items[2]] },
      { label: "Bo", items: [d.items[1]] },
      { label: "", items: [d.items[3]] },
    ]);
  });

  it("groups only what the view's filter keeps", () => {
    const d = parseViews(GROUPED);
    const open = d.views!.find((v) => v.key === "open")!;
    expect(lanesOf(rowsOfView(d, open), open.group).map((l) => [l.label, l.items.map((i) => i.id)]))
      .toEqual([["Bo", ["build"]], ["Ana", ["ship"]], ["", ["loose"]]]);
  });

  it("groups by nothing into one unlabelled lane", () => {
    const d = parseViews(GROUPED);
    expect(lanesOf(d.items, undefined)).toEqual([{ label: "", items: d.items }]);
    expect(lanesOf(d.items, "")).toEqual([{ label: "", items: d.items }]);
  });

  it("the summary counts the lanes of a grouped board only", () => {
    expect(viewsSummary(parseViews(GROUPED)))
      .toBe("4 items · views: board (kanban, 3 columns, 3 lanes), open (kanban, 3 columns, 3 lanes) 3, plain (kanban, 3 columns)");
  });
});
