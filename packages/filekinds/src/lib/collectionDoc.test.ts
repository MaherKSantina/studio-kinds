/** GOLDEN RULES for a collection — a snapshot of rows and the decisions taken over them. */
import { describe, expect, it } from "vitest";
import {
  collectionFromRows, collectionSummary, defaultStats, dumpCollection, featuredOf, itemStates, orderedItems, originOf, parseCollection, parseFieldInput, setItemField,
} from "./collectionDoc";

const ROWS = [
  { name: "A", km: 1, lat: -36.2, lng: 150.1, best_offer: { url: "https://x/a" } },
  { name: "B", km: 2, address: "3 Bay St, Narooma" },
  { name: "C", km: 3, location: "Tilba" },
  { name: "D", km: 4 },
];

describe("from rows, to text, and back", () => {
  it("copies the rows with ids in order, keeps the view's fields and labels, round-trips", () => {
    const doc = collectionFromRows(ROWS, { source: "stays.jsonl", fields: ["name", "km"], labels: { km: "km from town" } });
    expect(doc.items.map((i) => i.id)).toEqual([1, 2, 3, 4]);
    const back = parseCollection(dumpCollection(doc));
    expect(back.source).toBe("stays.jsonl");
    expect(back.fields).toEqual(["name", "km"]);
    expect(back.labels).toEqual({ km: "km from town" });
    expect(back.items[0]).toEqual({ id: 1, name: "A", km: 1, lat: -36.2, lng: 150.1, best_offer: { url: "https://x/a" } });
    expect(back.decisions).toEqual([]);
    expect(back.problems).toEqual([]);
  });
  it("reports what it cannot use: a duplicate id, a decision on a missing item, an unknown op, a missing reason", () => {
    const d = parseCollection("items:\n  - {id: 1, name: A}\n  - {id: 1, name: B}\ndecisions:\n  - {item: 9, op: up, reason: x}\n  - {item: 1, op: sideways, reason: x}\n  - {item: 1, op: down}\n  - {op: up}\n");
    expect(d.problems).toEqual([
      "item 2: id 1 is already used",
      "decision 1: item 9 is not in the collection",
      'decision 2: unknown op "sideways"',
      "decision 3: no reason",
      "decision 4: no item",
    ]);
    expect(d.decisions.length).toBe(2);
  });
  it("an empty file is an empty collection", () => {
    expect(parseCollection("")).toEqual({ fields: [], stats: [], labels: {}, items: [], decisions: [], problems: [] });
  });
});

describe("the order the decisions give", () => {
  const doc = {
    ...collectionFromRows(ROWS, { fields: ["name"] }),
    decisions: [
      { item: 3, op: "up" as const, reason: "close" },
      { item: 1, op: "down" as const, reason: "far" },
      { item: 3, op: "up" as const, reason: "cheap too" },
      { item: 2, op: "hide" as const, reason: "no photos" },
      { item: 4, op: "up" as const, reason: "pool" },
    ],
  };
  it("rank = ups minus downs; rank descending, ties in copied order; hidden out unless asked", () => {
    expect(orderedItems(doc).map((s) => `${s.item.name}:${s.rank}`)).toEqual(["C:2", "D:1", "A:-1"]);
    expect(orderedItems(doc, true).map((s) => s.item.name)).toEqual(["C", "D", "B", "A"]);
    expect(itemStates(doc).get(3)?.decisions.map((d) => d.reason)).toEqual(["close", "cheap too"]);
  });
  it("a show takes a hide back; the summary counts", () => {
    const shown = { ...doc, decisions: [...doc.decisions, { item: 2, op: "show" as const }] };
    expect(orderedItems(shown).map((s) => s.item.name)).toEqual(["C", "D", "B", "A"]);
    expect(collectionSummary(doc)).toEqual({ shown: 3, up: 2, down: 1, hidden: 1, unreasoned: 0 });
    expect(collectionSummary({ ...doc, decisions: [{ item: 1, op: "up" }] }).unreasoned).toBe(1);
  });
});

describe("directions start", () => {
  it("coordinates, else the address, else name and place", () => {
    expect(originOf(ROWS[0])).toBe("-36.2,150.1");
    expect(originOf(ROWS[1])).toBe("3 Bay St, Narooma");
    expect(originOf(ROWS[2])).toBe("C, Tilba");
    expect(originOf(ROWS[3])).toBe("D");
  });
});

describe("stats, featured, edits in place", () => {
  it("default stats: the numeric fields, then the first link", () => {
    const rows = [{ name: "A", km: 3, price: 800, url: "https://x/a", note: "n" }];
    expect(defaultStats(rows, ["name", "km", "price", "note", "url"])).toEqual(["km", "price", "url"]);
  });
  it("a typed value keeps the field's kind: a number stays a number, empty removes, text stays text", () => {
    expect(parseFieldInput("28", undefined)).toBe(28);
    expect(parseFieldInput("28", 17)).toBe(28);
    expect(parseFieldInput("far", 17)).toBe("far");
    expect(parseFieldInput("", 17)).toBeUndefined();
    expect(parseFieldInput("true", false)).toBe(true);
    expect(parseFieldInput("12", "abc")).toBe("12");
    expect(parseFieldInput("12", "7")).toBe(12);
  });
  it("setItemField copies the item (dot paths too), removes on undefined, leaves the log alone", () => {
    const doc = { ...collectionFromRows(ROWS, { fields: ["name"] }), decisions: [{ item: 1, op: "up" as const, reason: "r" }] };
    const next = setItemField(doc, 1, "commute_time_min", 28);
    expect(next.items[0]).toMatchObject({ id: 1, commute_time_min: 28 });
    expect(doc.items[0]).not.toHaveProperty("commute_time_min");
    expect(next.decisions).toBe(doc.decisions);
    expect(setItemField(next, 1, "best_offer.price", 900).items[0].best_offer).toEqual({ url: "https://x/a", price: 900 });
    expect(setItemField(next, 1, "commute_time_min", undefined).items[0]).not.toHaveProperty("commute_time_min");
  });
  it("the featured picture must be one of the item's pictures, else the first stands", () => {
    const imgs = ["https://i/1.jpg", "https://i/2.jpg"];
    expect(featuredOf({ featured: "https://i/2.jpg" }, imgs)).toBe("https://i/2.jpg");
    expect(featuredOf({ featured: "https://gone/x.jpg" }, imgs)).toBe("https://i/1.jpg");
    expect(featuredOf({}, [])).toBeNull();
  });
});
