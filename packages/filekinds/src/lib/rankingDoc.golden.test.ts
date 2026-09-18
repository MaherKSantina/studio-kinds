import { describe, expect, it } from "vitest";
import {
  answerFor, assignmentFor, groupText, isCatchAll, locksOf, parseRanking, rankOf, writeTags,
} from "./rankingDoc";

const DOC = parseRanking(`
title: Lead ranking
items: /leads.list
map:
  title: [label]
  text: [fit, label]
decisions:
  - key: platform
    label: iOS role?
    values:
      - {key: "yes", label: iOS}
      - {key: "no", label: Not iOS}
    derive:
      - {value: "yes", when: [{param: title, op: matches, value: "ios|swift"}]}
      - {value: "no", when: []}
  - key: level
    label: Staff level?
    values: ["staff", "senior"]
    derive:
      - {value: staff, when: [{param: title, op: matches, value: "staff|principal"}]}
      - {value: senior}
  - key: relocation
    label: Needs relocation?
    values: ["no", "yes"]
    # No derive rules at all — this one is TAGGED by hand or left unanswered.
ranking:
  - {label: "Ideal", when: [platform=yes, level=staff, relocation=no]}
  - {label: "iOS, any level", when: [platform=yes]}
  - {label: "Staff, any platform", when: [level=staff]}
  - {label: "Everything else", when: []}
`);

const input = (title: string, text = "") => ({ title, text });

describe("ranking golden", () => {
  it("parses decisions, bare-string answers, and derive rules", () => {
    expect(DOC.decisions.map((d) => d.key)).toEqual(["platform", "level", "relocation"]);
    // A bare "staff" is an answer; key and label are the same word.
    expect(DOC.decisions[1].values).toEqual([
      { key: "staff", label: "staff" }, { key: "senior", label: "senior" },
    ]);
    expect(DOC.decisions[2].derive).toEqual([]);
  });

  it("YAML's bare yes/no stay ANSWER KEYS, not booleans", () => {
    // `values: [yes, no]` parses as [true, false] — as answer keys those would
    // stringify to "true"/"false" and never match a `platform=yes` ref.
    const d = parseRanking(`decisions: [{key: k, values: [yes, no]}]`).decisions[0];
    expect(d.values.map((v) => v.key)).toEqual(["yes", "no"]);
  });

  it("a derive rule with no clauses is the DEFAULT answer", () => {
    expect(answerFor(DOC.decisions[0], {}, input("Backend Engineer")))
      .toEqual({ decision: "platform", value: "no", source: "derived", ruleIndex: 1 });
  });

  it("first derive rule that holds wins", () => {
    expect(answerFor(DOC.decisions[0], {}, input("Senior iOS Engineer")))
      .toEqual({ decision: "platform", value: "yes", source: "derived", ruleIndex: 0 });
  });

  it("a list FIELD beats the rules — the row carries a fact the rule cannot see", () => {
    const a = answerFor(DOC.decisions[0], { fields: { platform: "no" } }, input("Senior iOS Engineer"));
    expect(a).toEqual({ decision: "platform", value: "no", source: "field" });
  });

  it("a HAND TAG beats the field, which beats the rule", () => {
    const row = { fields: { platform: "no" } };
    const a = answerFor(DOC.decisions[0], row, input("Senior iOS Engineer"), ["platform=yes"]);
    expect(a).toEqual({ decision: "platform", value: "yes", source: "tagged" });
  });

  it("a hand tag naming an answer that does not exist is ignored, not obeyed", () => {
    const a = answerFor(DOC.decisions[0], {}, input("iOS Engineer"), ["platform=perhaps"]);
    expect(a.source).toBe("derived");
  });

  it("hand tags are keyed by row label and reach the assignment", () => {
    const doc = parseRanking(`
decisions: [{key: relocation, values: ["no", "yes"]}]
ranking: [{label: Local, when: [relocation=no]}, {label: Rest, when: []}]
tags:
  "Senior iOS Engineer — Acme": [relocation=no]
`);
    const row = { label: "Senior iOS Engineer — Acme" };
    expect(locksOf(assignmentFor(doc, row, {}))).toEqual(["relocation=no"]);
    expect(rankOf(doc, locksOf(assignmentFor(doc, row, {})))).toBe(0);
    // An untagged row is untouched by another row's tag.
    expect(rankOf(doc, locksOf(assignmentFor(doc, { label: "Other" }, {})))).toBe(1);
  });

  it("writeTags keeps everything above the block byte-for-byte — comments included", () => {
    const src = [
      "title: Lead ranking",
      "# the criterion that matters most",
      "decisions: [{key: platform, values: [\"yes\", \"no\"]}]",
      "",
      "tags:",
      '  "Old row": [platform=no]',
      "",
    ].join("\n");
    const next = writeTags(src, { "New row": ["platform=yes"] });
    expect(next).toContain("# the criterion that matters most");
    expect(next).not.toContain("Old row");
    expect(parseRanking(next).tags).toEqual({ "New row": ["platform=yes"] });
    // And a document with no block yet simply gains one at the end.
    const fresh = writeTags("title: X\n", { "A row": ["k=v"] });
    expect(parseRanking(fresh).tags).toEqual({ "A row": ["k=v"] });
    expect(fresh.startsWith("title: X")).toBe(true);
  });

  it("clearing every tag removes the block instead of leaving an empty one", () => {
    const next = writeTags("title: X\n\ntags:\n  \"A\": [k=v]\n", {});
    expect(next).toBe("title: X\n");
    expect(parseRanking(next).tags).toEqual({});
  });

  it("save/clear cycles are idempotent — no banner or blank-line accumulation", () => {
    // The generated comment sits ABOVE `tags:`, so cutting at the key would
    // leave one copy behind per save.
    let t = "title: X\n";
    for (let i = 0; i < 4; i++) {
      t = writeTags(t, { A: ["k=v"] });
      t = writeTags(t, {});
    }
    expect(t).toBe("title: X\n");
    t = writeTags(writeTags(writeTags(t, { A: ["k=v"] }), { A: ["k=w"] }), { A: ["k=x"] });
    expect(t.match(/Answers taken by hand/g)?.length).toBe(1);
    expect(parseRanking(t).tags).toEqual({ A: ["k=x"] });
  });

  it("a tag matches an answer's LABEL too, case-insensitively", () => {
    expect(answerFor(DOC.decisions[0], { fields: { platform: "Not iOS" } }, input("x")).value).toBe("no");
    expect(answerFor(DOC.decisions[0], { fields: { platform: "YES" } }, input("x")).value).toBe("yes");
  });

  it("a tag naming no known answer falls through to the rules", () => {
    const a = answerFor(DOC.decisions[0], { fields: { platform: "maybe?" } }, input("iOS Engineer"));
    expect(a.source).toBe("derived");
    expect(a.value).toBe("yes");
  });

  it("no tag and no rule = UNANSWERED, which is a state and not a zero", () => {
    const a = answerFor(DOC.decisions[2], {}, input("anything"));
    expect(a).toEqual({ decision: "relocation", value: "", source: "unanswered" });
    // And it contributes no ref, so no group can claim it on that ground.
    expect(locksOf([a])).toEqual([]);
  });

  it("an assignment answers every decision, in the decisions' order", () => {
    const answers = assignmentFor(DOC, { fields: { relocation: "no" } }, input("Staff iOS Engineer"));
    expect(locksOf(answers)).toEqual(["platform=yes", "level=staff", "relocation=no"]);
  });

  it("ORDER IS PRIORITY: the first group that holds claims the row", () => {
    // This row satisfies groups 0, 1 AND 2 — it must take the best one.
    expect(rankOf(DOC, ["platform=yes", "level=staff", "relocation=no"])).toBe(0);
    // Without the relocation answer, group 0 no longer holds; group 1 does.
    expect(rankOf(DOC, ["platform=yes", "level=staff"])).toBe(1);
  });

  it("a group names ONE criterion and stays silent about the rest", () => {
    expect(rankOf(DOC, ["platform=yes", "level=senior"])).toBe(1);
    expect(rankOf(DOC, ["platform=no", "level=staff"])).toBe(2);
  });

  it("the empty group is the catch-all — 'excluded' IS the bottom of the order", () => {
    expect(isCatchAll(DOC.ranking[3])).toBe(true);
    expect(rankOf(DOC, ["platform=no", "level=senior"])).toBe(3);
    // A row that answered NOTHING still lands somewhere visible.
    expect(rankOf(DOC, [])).toBe(3);
  });

  it("without a catch-all a row can go unranked — never silently dropped", () => {
    const doc = parseRanking(`ranking: [{label: Only iOS, when: [platform=yes]}]`);
    expect(rankOf(doc, ["platform=no"])).toBe(-1);
  });

  it("`when` also accepts a mapping, since that is how people write it", () => {
    const doc = parseRanking(`ranking: [{label: G, when: {platform: yes, level: staff}}]`);
    expect(doc.ranking[0].when).toEqual(["platform=yes", "level=staff"]);
  });

  it("a group reads back in the decisions' own words", () => {
    expect(groupText(DOC, DOC.ranking[0]))
      .toBe("iOS role? = iOS · Staff level? = staff · Needs relocation? = no");
    expect(groupText(DOC, DOC.ranking[1])).toBe("iOS role? = iOS");
    expect(groupText(DOC, DOC.ranking[3])).toBe("anything left");
  });

  it("adding a decision does not invalidate existing groups", () => {
    // The whole point of predicates over answers: groups that never mentioned
    // `remote` keep claiming exactly what they claimed before.
    const before = rankOf(DOC, ["platform=yes", "level=senior"]);
    expect(rankOf(DOC, ["platform=yes", "level=senior", "remote=yes"])).toBe(before);
  });

  it("an empty document parses and ranks nothing, without throwing", () => {
    const empty = parseRanking("");
    expect(empty.decisions).toEqual([]);
    expect(rankOf(empty, [])).toBe(-1);
  });
});
