/** GOLDEN RULES for the policy chain — params → tag values → rank.
 *  Views use this only through deriveTags/applyOrder/parsePolicyKindFile. */
import { describe, expect, it } from "vitest";
import {
  UNRANKED, applyOrder, deriveTags, entryLabel, hasCatchAll, locksOfTags,
  orderKeyLabel, orderKeys, parseOrderPolicy, parsePolicyKindFile,
  parseTagsPolicy, refCovers, viaText, visibleTags, whenHolds, whenRefsText,
  whenValuesText,
} from "./policyChain";

const TAGS = parseTagsPolicy(`
title: Job ad tags
role: tags
params:
  - {key: title, type: string}
  - {key: location, type: string}
  - {key: company, type: string}
tags:
  - key: platform
    label: Platform
    values:
      - {key: ios, label: iOS}
      - {key: android, label: Android}
      - {key: none, label: Not mobile}
    derive:
      - {value: ios, label: iOS in the title, when: [{param: title, op: matches, value: "ios|swift"}]}
      - {value: android, when: [{param: title, op: contains, value: android}]}
      - {value: none, when: []}
  - key: reach
    label: Reachability
    values:
      - {key: local, label: Sydney or remote}
      - {key: elsewhere, label: Onsite elsewhere}
    derive:
      - {value: local, when: [{param: location, op: matches, value: "sydney|remote|^$"}]}
      - {value: elsewhere, when: []}
  - key: employer
    label: Employer
    hidden: true
    values:
      - {key: canva, label: Canva}
      - {key: commbank, label: CommBank}
      - {key: other, label: Anyone else}
    derive:
      - {value: canva, when: [{param: company, op: contains, value: canva}]}
      - {value: commbank, when: [{param: company, op: contains, value: commbank}]}
      - {value: other, when: []}
  # COMPUTED: collapses two raw employers into one answer the order names.
  - key: undesired
    label: Undesired employer
    values:
      - {key: "yes", label: Undesired}
      - {key: "no", label: Fine}
    from:
      - {value: "yes", when: {employer: canva}}
      - {value: "yes", when: {employer: commbank}}
      - {value: "no", when: []}
  - key: open
    label: Never tagged
    values: [x]
    derive:
      - {value: x, when: [{param: title, op: contains, value: zzz}]}
`);

// Pure ordering: the fit entries GUARD with the computed dimension's default
// (undesired=no), the veto combination is just a low entry, catch-all last.
const ORDER = parseOrderPolicy(`
title: Triage order
role: order
tags: ./job-ad-tags.policy
order:
  - when: {platform: ios, reach: local, undesired: "no"}
  - when: [platform=ios, undesired=no]
  - when: {undesired: "yes"}
  - {label: Anything left, when: []}
`);

describe("deriving tags", () => {
  it("first derive rule wins per dimension; empty when is the default", () => {
    expect(deriveTags(TAGS, { title: "Senior iOS android dev", location: "Sydney", company: "X" }))
      .toEqual([
        { dimension: "platform", value: "ios", ruleIndex: 0 },
        { dimension: "reach", value: "local", ruleIndex: 0 },
        { dimension: "employer", value: "other", ruleIndex: 2 },
        { dimension: "undesired", value: "no", ruleIndex: 2 },
        { dimension: "open", value: "", ruleIndex: -1 },
      ]);
  });

  it("a COMPUTED dimension reads the answers above it — several raw values funnel to one", () => {
    const canva = deriveTags(TAGS, { title: "x", location: "", company: "Canva Pty" });
    expect(canva.find((a) => a.dimension === "undesired")).toEqual(
      { dimension: "undesired", value: "yes", ruleIndex: 0 });
    const cba = deriveTags(TAGS, { title: "x", location: "", company: "CommBank" });
    expect(cba.find((a) => a.dimension === "undesired")).toEqual(
      { dimension: "undesired", value: "yes", ruleIndex: 1 });
  });

  it("an untagged dimension contributes no lock", () => {
    const tags = deriveTags(TAGS, { title: "ios", location: "", company: "" });
    expect(locksOfTags(tags)).toEqual(["platform=ios", "reach=local", "employer=other", "undesired=no"]);
  });

  it("hidden dimensions still tag but leave the visible vocabulary", () => {
    expect(visibleTags(TAGS).map((d) => d.key)).toEqual(["platform", "reach", "undesired", "open"]);
  });

  it("a from-rule explains itself in the dimensions' words", () => {
    const a = { dimension: "undesired", value: "yes", ruleIndex: 0 };
    expect(viaText(TAGS, a)).toBe("Employer = Canva");
  });

  it("`decisions:` and role decisions still parse as the tags shape", () => {
    const doc = parseTagsPolicy("title: T\nrole: decisions\ndecisions:\n  - {key: a, values: [x], derive: [{value: x, when: []}]}");
    expect(doc.tags).toHaveLength(1);
    expect(doc.tags[0].key).toBe("a");
  });
});

describe("the order — just ordering, top to bottom", () => {
  it("position is priority: the first entry that holds claims the item", () => {
    expect(applyOrder(ORDER, ["undesired=no", "platform=ios", "reach=local"]))
      .toEqual({ key: "rank:0", index: 0 });
    expect(applyOrder(ORDER, ["undesired=no", "platform=ios", "reach=elsewhere"]))
      .toEqual({ key: "rank:1", index: 1 });
  });

  it("a veto is only an entry near the bottom — the GUARDS keep it out of the fits", () => {
    // Canva OR CommBank + iOS + local: fails rank 0 and 1 on undesired=no,
    // lands on the one undesired entry — however good the fit.
    expect(applyOrder(ORDER, ["employer=canva", "undesired=yes", "platform=ios", "reach=local"]))
      .toEqual({ key: "rank:2", index: 2 });
    expect(applyOrder(ORDER, ["employer=commbank", "undesired=yes", "platform=ios", "reach=local"]))
      .toEqual({ key: "rank:2", index: 2 });
  });

  it("the empty-when catch-all takes everything left — least priority IS excluded", () => {
    expect(applyOrder(ORDER, ["undesired=no", "platform=none", "reach=local"]))
      .toEqual({ key: "rank:3", index: 3 });
    expect(hasCatchAll(ORDER)).toBe(true);
    expect(orderKeys(ORDER)).toEqual(["rank:0", "rank:1", "rank:2", "rank:3"]);
  });

  it("without a catch-all the residue is UNRANKED — parked, not discarded", () => {
    const doc = parseOrderPolicy("title: T\nrole: order\ntags: ./t.policy\norder:\n  - when: {a: b}");
    expect(hasCatchAll(doc)).toBe(false);
    expect(orderKeys(doc)).toEqual(["rank:0", UNRANKED]);
    expect(applyOrder(doc, [])).toEqual({ key: UNRANKED, index: -1 });
  });

  it("a MISSING tag never satisfies a ref — partial assignments fall through", () => {
    expect(applyOrder(ORDER, ["reach=local"]).key).toBe("rank:3");
  });
});

describe("value-OR within one ref", () => {
  const doc = parseOrderPolicy(`
title: T
role: order
tags: ./job-ad-tags.policy
order:
  - when: {platform: [ios, android], reach: local}
  - {label: Anything left, when: []}
`);

  it("a list-valued mapping parses to one d=v1|v2 ref", () => {
    expect(doc.order[0].when).toEqual(["platform=ios|android", "reach=local"]);
  });

  it("the ref holds when ANY alternative is the answer — across refs still AND", () => {
    expect(applyOrder(doc, ["platform=ios", "reach=local"]).index).toBe(0);
    expect(applyOrder(doc, ["platform=android", "reach=local"]).index).toBe(0);
    expect(applyOrder(doc, ["platform=none", "reach=local"]).index).toBe(1);
    expect(whenHolds(["platform=ios"], doc.order[0].when)).toBe(false); // reach missing
  });

  it("refCovers accepts any alternative and nothing else", () => {
    expect(refCovers("platform=ios|android", "platform=android")).toBe(true);
    expect(refCovers("platform=ios|android", "platform=none")).toBe(false);
    expect(refCovers("reach=local", "reach=local")).toBe(true);
  });

  it("displays as the labels joined with or, and counts as identity when any alternative is non-default", () => {
    expect(whenRefsText(TAGS.tags, ["platform=ios|android"])).toBe("Platform = iOS or Android");
    // "none" is platform's default, but ios is not — the OR ref still shows.
    expect(whenValuesText(TAGS.tags, ["platform=ios|none", "employer=other"]))
      .toBe("iOS or Not mobile");
  });
});

describe("chain end to end", () => {
  it("params → tags → rank", () => {
    const tags = deriveTags(TAGS, { title: "Swift engineer", location: "remote", company: "Reapit" });
    expect(applyOrder(ORDER, locksOfTags(tags)).key).toBe("rank:0");
  });
});

describe("file routing and display", () => {
  it("role decides the document; no role stays a flat policy or run", () => {
    expect(parsePolicyKindFile("role: tags\ntitle: T").role).toBe("tags");
    expect(parsePolicyKindFile("role: decisions\ntitle: D").role).toBe("tags");
    expect(parsePolicyKindFile("role: order\ntitle: O").role).toBe("order");
    expect(parsePolicyKindFile("title: F\ncases: []").role).toBe("policy");
    expect(parsePolicyKindFile("title: R\npolicy: ./a.policy\nitems: ./b.list").role).toBe("run");
  });

  it("auto-labels ELIDE default-value guards — the marked values are the identity", () => {
    // undesired=no is the computed dimension's default: a guard, not identity.
    expect(entryLabel(TAGS.tags, ORDER.order[0])).toBe("iOS · Sydney or remote");
    expect(orderKeyLabel(ORDER, TAGS.tags, "rank:2")).toBe("3. Undesired");
    expect(orderKeyLabel(ORDER, TAGS.tags, "rank:3")).toBe("4. Anything left");
    expect(orderKeyLabel(ORDER, TAGS.tags, UNRANKED)).toBe("Unranked");
  });

  it("when EVERY ref is a default, the guards ARE the identity and all show", () => {
    expect(whenValuesText(TAGS.tags, ["undesired=no"])).toBe("Fine");
  });

  it("predicates read in the dimensions' words — verbose keeps the guards", () => {
    expect(whenRefsText(TAGS.tags, ORDER.order[0].when))
      .toBe("Platform = iOS · Reachability = Sydney or remote · Undesired employer = Fine");
    expect(whenRefsText(TAGS.tags, [])).toBe("anything");
  });
});
