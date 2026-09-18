import { describe, expect, it } from "vitest";
import { ELSE } from "../../lib/memoryDoc";
import { filterPills, namedCount } from "./pillFilter";

const table = [
  { key: "folder", values: [
    { key: "Neogrids", label: "Neogrids" }, { key: "orchestration", label: "orchestration" },
    { key: "Meme XP", label: "Meme XP" }, { key: ELSE, label: "Everything else" },
  ] },
  { key: "folder/Neogrids", values: [{ key: "samples", label: "samples" }, { key: ELSE, label: "Everything else" }] },
];

describe("the search field over the foci", () => {
  it("keeps only the pills whose name contains the query, case-insensitively", () => {
    const out = filterPills(table, "NEO", []);
    expect(out[0].values.map((v) => v.key)).toEqual(["Neogrids", ELSE]);
    expect(out[1].values.map((v) => v.key)).toEqual([ELSE]);
  });
  it("never hides a taken answer or the everything-else", () => {
    const out = filterPills(table, "xp", ["folder=Neogrids"]);
    expect(out[0].values.map((v) => v.key)).toEqual(["Neogrids", "Meme XP", ELSE]);
  });
  it("an empty or blank query is the table untouched", () => {
    expect(filterPills(table, "", [])).toBe(table);
    expect(filterPills(table, "   ", [])).toBe(table);
  });
  it("counts named answers only", () => {
    expect(namedCount(table[0])).toBe(3);
    expect(namedCount(filterPills(table, "orch", [])[0])).toBe(1);
    expect(namedCount(null)).toBe(0);
  });
});
