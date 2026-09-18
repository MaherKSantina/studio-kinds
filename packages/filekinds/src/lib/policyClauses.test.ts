/** The clause operators every filtering kind shares — the ones a table over data brought in. */
import { describe, expect, it } from "vitest";
import { clauseHolds, clauseValue, parseClauses } from "./policyDoc";

describe("between / in / not_in", () => {
  it("between is inclusive, numeric, either order of bounds, never true for an empty field", () => {
    const c = { param: "price", op: "between" as const, value: [600, 2000] };
    expect(clauseHolds(c, { price: 600 })).toBe(true);
    expect(clauseHolds(c, { price: "2000" })).toBe(true);
    expect(clauseHolds(c, { price: 2001 })).toBe(false);
    expect(clauseHolds(c, { price: "" })).toBe(false);
    expect(clauseHolds({ ...c, value: [2000, 600] }, { price: 1000 })).toBe(true);
    expect(clauseHolds({ ...c, value: 5 }, { price: 5 })).toBe(false); // not a pair: never holds
  });
  it("in and not_in match the field's text against a list, case-insensitively", () => {
    const c = { param: "area", op: "in" as const, value: ["Narooma", "Tilba"] };
    expect(clauseHolds(c, { area: "tilba" })).toBe(true);
    expect(clauseHolds(c, { area: "Bega" })).toBe(false);
    expect(clauseHolds({ ...c, op: "not_in" }, { area: "Bega" })).toBe(true);
    expect(clauseHolds({ ...c, op: "not_in" }, { area: "Narooma" })).toBe(false);
    expect(clauseHolds({ ...c, value: [4, 5] }, { sleeps: 4, area: "4" })).toBe(true);
  });
  it("list values survive parsing; booleans inside read as yes/no", () => {
    expect(parseClauses([{ param: "x", op: "in", value: ["a", 2, true] }])).toEqual([{ param: "x", op: "in", value: ["a", 2, "yes"] }]);
    expect(parseClauses([{ param: "x", op: "between", value: [1, 9] }])).toEqual([{ param: "x", op: "between", value: [1, 9] }]);
    expect(clauseValue(false)).toBe("no");
    expect(clauseValue({ nested: 1 })).toBeUndefined();
  });
});

describe("a list on a text op — any of them, none of them for the negated ops", () => {
  const rows = [{ name: "Caravan among spotty gums" }, { name: "Anchored Truck Tiny House" }, { name: "Lake unit" }, { name: "" }];
  const names = (c: Parameters<typeof clauseHolds>[0]) => rows.filter((r) => clauseHolds(c, r)).map((r) => r.name);
  it("contains any of caravan, truck — case-insensitive", () => {
    expect(names({ param: "name", op: "contains", value: ["caravan", "Truck"] })).toEqual(["Caravan among spotty gums", "Anchored Truck Tiny House"]);
    expect(names({ param: "name", op: "not_contains", value: ["caravan", "truck"] })).toEqual(["Lake unit", ""]);
    expect(names({ param: "name", op: "starts_with", value: ["lake", "anchored"] })).toEqual(["Anchored Truck Tiny House", "Lake unit"]);
    expect(names({ param: "name", op: "equals", value: ["lake unit", "nope"] })).toEqual(["Lake unit"]);
    expect(names({ param: "name", op: "not_equals", value: ["lake unit", "nope"] })).toEqual(["Caravan among spotty gums", "Anchored Truck Tiny House", ""]);
    expect(names({ param: "name", op: "matches", value: ["^caravan", "house$"] })).toEqual(["Caravan among spotty gums", "Anchored Truck Tiny House"]);
  });
  it("one value behaves as before; an empty value never contains, always not-contains", () => {
    expect(names({ param: "name", op: "contains", value: "truck" })).toEqual(["Anchored Truck Tiny House"]);
    expect(names({ param: "name", op: "contains", value: "" })).toEqual([]);
    expect(names({ param: "name", op: "not_contains", value: "" })).toEqual(rows.map((r) => r.name));
    expect(names({ param: "name", op: "equals" })).toEqual([""]);
  });
});
