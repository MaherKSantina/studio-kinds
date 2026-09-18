import { describe, expect, it } from "vitest";
import { Dimension, fuzzyMatch, groupItems, searchItems, visibleItems } from "./oneD";

interface Ev { key: string; domain?: string }
const items: Ev[] = [
  { key: "a", domain: "Money" },
  { key: "b" },
  { key: "c", domain: "Liability" },
  { key: "d", domain: "Money" },
];
const dim: Dimension<Ev> = { of: (e) => e.domain ?? "" };

describe("one-dimension golden", () => {
  it("groups in first-seen order; keyless items land in the fallback group, LAST", () => {
    const g = groupItems(items, dim);
    expect(g.map((x) => x.key)).toEqual(["Money", "Liability", ""]);
    expect(g[g.length - 1].label).toBe("Other");
    expect(g.map((x) => x.items.map((i) => i.key))).toEqual([["a", "d"], ["c"], ["b"]]);
  });
  it("the fallback label is the dimension's to name", () => {
    expect(groupItems(items, { ...dim, fallback: "Elsewhere" }).slice(-1)[0]?.label).toBe("Elsewhere");
  });
  it("explicit order wins; unknown keys keep first-seen order after it", () => {
    const g = groupItems(items, { ...dim, order: ["Liability"] });
    expect(g.map((x) => x.key)).toEqual(["Liability", "Money", ""]);
  });
  it("labels come from the dimension", () => {
    const g = groupItems(items, { ...dim, label: (k) => k.toUpperCase() });
    expect(g.find((x) => x.key === "Money")?.label).toBe("MONEY");
  });
  it("filter: All shows everything, a group shows only its items, fallback is selectable", () => {
    const g = groupItems(items, dim);
    expect(visibleItems(g, null).map((i) => i.key)).toEqual(["a", "d", "c", "b"]);
    expect(visibleItems(g, "Money").map((i) => i.key)).toEqual(["a", "d"]);
    expect(visibleItems(g, "").map((i) => i.key)).toEqual(["b"]);
    expect(visibleItems(g, "Nope")).toEqual([]);
  });
  it("search: substring per term, any order, case-insensitive, no reordering", () => {
    expect(fuzzyMatch("bill arr", "A bill arrives")).toBe(true);
    expect(fuzzyMatch("arrives bill", "A bill arrives")).toBe(true);
    // Partial words still match — each term only has to be a substring.
    expect(fuzzyMatch("bil arr", "A bill arrives")).toBe(true);
    expect(fuzzyMatch("BILL", "a bill arrives")).toBe(true);
    expect(fuzzyMatch("xyz", "A bill arrives")).toBe(false);
    expect(fuzzyMatch("", "anything")).toBe(true);
    expect(fuzzyMatch("   ", "anything")).toBe(true);
  });

  it("NOT a subsequence match — nonsense must not match everything", () => {
    // The old subsequence rule made both of these true: letters found in
    // order anywhere in the text counted as a hit.
    expect(fuzzyMatch("barr", "A bill arrives")).toBe(false);
    expect(fuzzyMatch("akjsdajdh", "A bill arrives on a dark Thursday and jams the desk")).toBe(false);
  });
  it("search runs before grouping: groups and counts describe the matches", () => {
    const evs = [
      { key: "a", domain: "Money", label: "An invoice arrives" },
      { key: "b", domain: "Money", label: "The card is declined" },
      { key: "c", domain: "Liability", label: "A bill arrives" },
    ];
    const hit = searchItems(evs, (e) => e.label, "arriv");
    expect(hit.map((e) => e.key)).toEqual(["a", "c"]);
    const g = groupItems(hit, { of: (e) => e.domain });
    expect(g.map((x) => [x.key, x.items.length])).toEqual([["Money", 1], ["Liability", 1]]);
  });
  it("no dimension needed for a flat list — the component just maps", () => {
    // (flat mode never calls groupItems; pinned here as the contract's shape)
    expect(groupItems([], dim)).toEqual([]);
  });
});
