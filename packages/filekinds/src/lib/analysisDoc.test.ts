/** GOLDEN RULES for an analysis — closed inputs, rules decided first match wins, and the tree nested over the inputs in a given order. */
import { describe, expect, it } from "vitest";
import {
  analysisSummary, buildKeptTree, buildTree, combinations, compileAnalysis, decide, domainsOf, matchCond, matchTarget, parseAnalysis, slotsOf, NONE,
} from "./analysisDoc";
import { fileTemplate } from "./fileTemplates";

/** The conformance corpus the checker is held to — the same files, read here. */
const CASES = import.meta.glob("../../../../conformance/analysis/*.analysis", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const VERDICTS = import.meta.glob("../../../../conformance/analysis/*.analysis.expected.json", { import: "default", eager: true }) as Record<string, { ok: boolean; summary?: string }>;
const OK = CASES["../../../../conformance/analysis/ok.analysis"];

const TEXT = `
title: Banner
dimensions:
  party: [buyer, seller]
  offer: [none, sent, accepted]
  flag: [true, false]
rules:
  - label: Pay now
    when: {party: buyer, offer: accepted}
    then: {type: button, title: Pay now}
  - label: Waiting
    when: {party: buyer, offer: sent}
    then: {type: ribbon, title: Waiting for the seller}
  - label: Respond
    when: {party: seller, offer: sent}
    then: {type: ribbon, title: Respond to the offer}
  - label: Sold
    when: {party: seller, offer: "!none"}
    then: {type: ribbon}
`;

describe("parsing", () => {
  it("reads the dimensions in order with their scalar values, the rules with their label, when and then, and the outcome", () => {
    const d = parseAnalysis(TEXT);
    expect(d.title).toBe("Banner");
    expect(d.dimensionOrder).toEqual(["party", "offer", "flag"]);
    expect(d.dimensions.flag).toEqual([true, false]);
    expect(d.rules.map((r) => r.label)).toEqual(["Pay now", "Waiting", "Respond", "Sold"]);
    expect(d.rules[3].when).toEqual({ party: "seller", offer: "!none" });
    expect(d.rules[0].then).toEqual({ type: "button", title: "Pay now" });
    expect(d.outcome).toBe("type");
  });
  it("is lenient: a dimension that is not a list, a non-scalar value, a repeated value, a bad when or then are dropped; a rule without a label is Rule N", () => {
    const d = parseAnalysis("dimensions:\n  a: [1, 1, [x], 2]\n  b: nope\nrules:\n  - when: {a: [1, {x: 1}]}\n    then: [1]\n  - when: 3\n");
    expect(d.dimensions).toEqual({ a: [1, 2] });
    expect(d.rules[0]).toEqual({ label: "Rule 1", when: { a: [1] }, then: {} });
    expect(d.rules[1]).toEqual({ label: "Rule 2", when: {}, then: {} });
  });
  it("carries the YAML error and opens empty when the text does not parse", () => {
    const d = parseAnalysis("title: [");
    expect(d.error).toBeTruthy();
    expect(d.dimensionOrder).toEqual([]);
  });
  it("the template parses and starts from its title", () => {
    const d = parseAnalysis(fileTemplate("/x/Banner.analysis"));
    expect(d.title).toBe("Banner");
    expect(d.rules.length).toBeGreaterThan(0);
  });
});

describe("deciding", () => {
  it("a bare value equals, a list is one of, * is any, !x is not equal on the value's text", () => {
    expect(matchCond("a", "a")).toBe(true);
    expect(matchCond(["a", "b"], "b")).toBe(true);
    expect(matchCond("*", 7)).toBe(true);
    expect(matchCond("!none", "sent")).toBe(true);
    expect(matchCond("!none", "none")).toBe(false);
    expect(matchCond("!1", 1)).toBe(false);
    expect(matchCond(1, "1")).toBe(false);
  });
  it("the first rule whose when holds decides; none is -1", () => {
    const d = parseAnalysis(TEXT);
    expect(decide(d, { party: "buyer", offer: "accepted", flag: true })).toBe(0);
    expect(decide(d, { party: "seller", offer: "accepted", flag: true })).toBe(3);
    expect(decide(d, { party: "seller", offer: "sent", flag: false })).toBe(2);
    expect(decide(d, { party: "buyer", offer: "none", flag: false })).toBe(-1);
  });
  it("the outputs are the outcome first then every key a rule sets; a domain is the values written, sorted, then —", () => {
    const d = parseAnalysis(TEXT);
    expect(slotsOf(d)).toEqual(["type", "title"]);
    expect(domainsOf(d).type).toEqual(["button", "ribbon", NONE]);
    expect(domainsOf(d).title).toEqual(["Pay now", "Respond to the offer", "Waiting for the seller", NONE]);
  });
  it("compiles every combination, counts the unmatched, and finds the inputs with no effect and the rules that fire", () => {
    const d = parseAnalysis(TEXT);
    const c = compileAnalysis(d);
    expect(c.total).toBe(12);
    expect(c.rows.length).toBe(12);
    expect(c.unmatched).toBe(4); // buyer/none and seller/none, both flags
    expect([...c.noEffect]).toEqual(["flag"]);
    expect([...c.fired].sort()).toEqual([0, 1, 2, 3]);
    expect(c.rows.find((r) => r.values.party === "seller" && r.values.offer === "accepted")!.slots).toEqual({ type: "ribbon", title: NONE });
  });
  it("locks narrow the enumeration and the count", () => {
    const d = parseAnalysis(TEXT);
    expect(combinations(d, { party: ["buyer"] })).toBe(6);
    const c = compileAnalysis(d, { party: ["buyer"], flag: [true] });
    expect(c.kept).toBe(3);
    expect(c.total).toBe(12);
    expect(c.rows.every((r) => r.values.party === "buyer" && r.values.flag === true)).toBe(true);
  });
  it("past the cap nothing is enumerated and the counts still hold", () => {
    const dims = Array.from({ length: 6 }, (_, i) => `d${i}: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]`).join("\n  ");
    const c = compileAnalysis(parseAnalysis(`dimensions:\n  ${dims}\nrules: []\n`));
    expect(c.total).toBe(1_000_000);
    expect(c.enumerated).toBe(false);
    expect(c.rows).toEqual([]);
  });
});

describe("the tree", () => {
  it("branches on the first input in order that separates the leaves, folds children that agree, and leaves the rule that decides", () => {
    const d = parseAnalysis(TEXT);
    const c = compileAnalysis(d);
    const t = buildTree(c.rows, ["flag", "party", "offer"]);
    // flag never separates anything, so the root skips it and branches on party.
    expect(t.leaf).toBe(false);
    if (t.leaf) return;
    expect(t.field).toBe("party");
    const buyer = t.children.find((ch) => ch.value === "buyer")!.node;
    expect(buyer.leaf).toBe(false);
    if (buyer.leaf) return;
    expect(buyer.field).toBe("offer");
    expect(buyer.children.map((ch) => [ch.value, (ch.node as { key: string }).key])).toEqual([["none", "-1"], ["sent", "1"], ["accepted", "0"]]);
  });
  it("the order changes the nesting: offer first splits on offer at the root", () => {
    const d = parseAnalysis(TEXT);
    const t = buildTree(compileAnalysis(d).rows, ["offer", "party", "flag"]);
    expect(!t.leaf && t.field).toBe("offer");
  });
  it("one leaf everywhere is one leaf", () => {
    const d = parseAnalysis("dimensions: {a: [1, 2]}\nrules: [{label: All, then: {type: x}}]\n");
    const t = buildTree(compileAnalysis(d).rows, ["a"]);
    expect(t).toMatchObject({ leaf: true, key: "0", n: 2 });
  });
  it("a pinned output keeps only the rows that reach it and drops the branches that do not; nothing reached is null", () => {
    const d = parseAnalysis(TEXT);
    const rows = compileAnalysis(d).rows;
    const keep = (r: (typeof rows)[number]) => matchTarget(r, { type: ["button"] });
    const t = buildKeptTree(rows, d.dimensionOrder, keep);
    expect(t && !t.leaf && t.field).toBe("party");
    expect(t && !t.leaf && t.children.map((ch) => ch.value)).toEqual(["buyer"]);
    expect(t && t.n).toBe(2); // a pruned branch counts the rows that reach the pins
    expect(t && t.rows.every(keep)).toBe(true);
    expect(buildKeptTree(rows, d.dimensionOrder, (r) => matchTarget(r, { type: ["button"], title: ["Respond to the offer"] }))).toBeNull();
  });
  it("matchTarget is any pinned value of a key and every pinned key; no pins is everything", () => {
    const rows = compileAnalysis(parseAnalysis(TEXT)).rows;
    const sold = rows.find((r) => r.values.party === "seller" && r.values.offer === "accepted")!;
    expect(matchTarget(sold, {})).toBe(true);
    expect(matchTarget(sold, { type: ["ribbon", "button"] })).toBe(true);
    expect(matchTarget(sold, { type: ["ribbon"], title: [NONE] })).toBe(true);
    expect(matchTarget(sold, { type: ["ribbon"], title: ["Pay now"] })).toBe(false);
  });
});

describe("the corpus", () => {
  it("the ok document compiles with no unmatched combination", () => {
    const c = compileAnalysis(parseAnalysis(OK));
    expect(c.unmatched).toBe(0);
    expect(c.rows.length).toBe(c.total);
  });
  it("the summary line is the checker's, on every case with one", () => {
    for (const [path, v] of Object.entries(VERDICTS)) {
      if (v.summary === undefined) continue;
      expect(analysisSummary(parseAnalysis(CASES[path.replace(/\.expected\.json$/, "")])), path).toBe(v.summary);
    }
  });
});
