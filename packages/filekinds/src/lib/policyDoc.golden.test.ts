/** GOLDEN RULES for the policy switch — the deterministic core the viewer
 *  and every project use only through applyPolicy/applyPolicyToItems. */
import { describe, expect, it } from "vitest";
import {
  UNMATCHED, applyPolicy, bucketLabel, bucketOrder, bucketSlot, clauseHolds,
  hasTimedBuckets, parsePolicy, parsePolicyFile, slotMinutes,
} from "./policyDoc";

const DOC = parsePolicy(`
title: Job triage
params:
  - {key: title, label: Job title, type: string}
  - {key: description, type: string}
  - {key: salary, type: number}
buckets:
  - {key: strong, label: Strong fit}
  - {key: maybe, label: Maybe}
  - {key: skip, label: Skip}
default: skip
cases:
  - label: AI-native
    when:
      - {param: description, op: contains, value: "AI"}
      - {param: description, op: contains, value: product}
    bucket: strong
  - label: Senior mobile
    when:
      - {param: title, op: matches, value: "senior.*(ios|mobile)"}
    bucket: strong
  - label: Well paid
    when:
      - {param: salary, op: gte, value: 150000}
    bucket: maybe
`);

describe("the switch", () => {
  it("first match wins and STOPS — mutually exclusive buckets", () => {
    // Matches case 0 AND case 1 — case 0 claims it.
    const v = applyPolicy(DOC, { title: "Senior iOS Engineer", description: "AI product work" });
    expect(v).toEqual({ bucket: "strong", caseIndex: 0 });
  });

  it("clauses AND within a case", () => {
    // "AI" without "product" fails case 0, falls to case 2 via salary.
    const v = applyPolicy(DOC, { title: "Analyst", description: "AI reports", salary: 200000 });
    expect(v).toEqual({ bucket: "maybe", caseIndex: 2 });
  });

  it("no match lands in the declared default", () => {
    expect(applyPolicy(DOC, { title: "Chef", description: "pastry", salary: 90000 }))
      .toEqual({ bucket: "skip", caseIndex: -1 });
  });

  it("without a default the residue is the built-in unmatched bucket", () => {
    const doc = parsePolicy("title: T\nparams: []\nbuckets: []\ncases: []");
    expect(applyPolicy(doc, {})).toEqual({ bucket: UNMATCHED, caseIndex: -1 });
    expect(bucketLabel(doc, UNMATCHED)).toBe("Unmatched");
  });

  it("string matching is case-insensitive; regex too", () => {
    expect(applyPolicy(DOC, { title: "SENIOR MOBILE DEV", description: "" }).bucket).toBe("strong");
    expect(clauseHolds({ param: "x", op: "contains", value: "AbC" }, { x: "zzabczz" })).toBe(true);
  });

  it("unknown params and bad regexes fail the clause, never throw", () => {
    expect(clauseHolds({ param: "ghost", op: "contains", value: "x" }, {})).toBe(false);
    expect(clauseHolds({ param: "t", op: "matches", value: "([" }, { t: "anything" })).toBe(false);
  });

  it("numeric ops require real numbers on both sides", () => {
    expect(clauseHolds({ param: "n", op: "gte", value: 10 }, { n: "banana" })).toBe(false);
    expect(clauseHolds({ param: "n", op: "gte", value: 10 }, { n: "10" })).toBe(true);
  });

  it("an EMPTY value is unknown, not zero — floors don't trip on it", () => {
    expect(clauseHolds({ param: "n", op: "lt", value: 140000 }, { n: "" })).toBe(false);
    expect(clauseHolds({ param: "n", op: "lt", value: 140000 }, { n: 0 })).toBe(true);
  });

  it("bucket order: declared, then case-only, then the residue last", () => {
    expect(bucketOrder(DOC)).toEqual(["strong", "maybe", "skip"]);
    const doc = parsePolicy(`
title: T
params: []
buckets: [{key: a}]
cases: [{when: [], bucket: b}]
`);
    expect(bucketOrder(doc)).toEqual(["a", "b", UNMATCHED]);
  });

  it("an empty when matches everything — a catch-all case", () => {
    const doc = parsePolicy(`
title: T
params: []
buckets: [{key: rest}]
cases: [{when: [], bucket: rest}]
`);
    expect(applyPolicy(doc, { anything: "at all" })).toEqual({ bucket: "rest", caseIndex: 0 });
  });
});

describe("timed buckets — the day the policy fans onto", () => {
  it("buckets keep well-formed HH:MM slots and drop malformed ones", () => {
    const doc = parsePolicy(`
title: T
params: []
buckets:
  - {key: a, start: "07:00", end: "08:00"}
  - {key: b, start: "7:05", end: "23:59"}
  - {key: bad, start: "25:00", end: "9am"}
  - {key: none}
cases: []
`);
    expect(doc.buckets[0]).toEqual({ key: "a", start: "07:00", end: "08:00" });
    expect(doc.buckets[1]).toEqual({ key: "b", start: "7:05", end: "23:59" });
    expect(doc.buckets[2]).toEqual({ key: "bad" });
    expect(bucketSlot(doc.buckets[0])).toEqual({ start: 420, end: 480 });
    expect(bucketSlot(doc.buckets[1])).toEqual({ start: 425, end: 1439 });
    expect(bucketSlot(doc.buckets[2])).toBeNull();
    expect(bucketSlot(doc.buckets[3])).toBeNull();
  });

  it("a slot must END after it starts — a backwards one is no slot", () => {
    expect(bucketSlot({ key: "x", start: "10:00", end: "09:00" })).toBeNull();
    expect(bucketSlot({ key: "x", start: "10:00", end: "10:00" })).toBeNull();
  });

  it("hasTimedBuckets flags a schedulable policy; slotMinutes rejects junk", () => {
    expect(hasTimedBuckets(parsePolicy(`
title: T
params: []
buckets: [{key: a, start: "07:00", end: "08:00"}, {key: rest}]
cases: []
`))).toBe(true);
    expect(hasTimedBuckets(parsePolicy("title: T\nparams: []\nbuckets: [{key: a}]\ncases: []"))).toBe(false);
    expect(slotMinutes("07:00")).toBe(420);
    expect(slotMinutes("24:00")).toBeNull();
    expect(slotMinutes("today")).toBeNull();
    expect(slotMinutes(undefined)).toBeNull();
  });

  it("a run keeps a well-formed date and drops anything else", () => {
    const run = (d: string) => parsePolicyFile(`title: R\npolicy: /p.policy\nitems: /i.list\ndate: "${d}"\nmap: {t: label}\n`);
    const good = run("2026-08-28");
    expect(good.role === "run" && good.date).toBe("2026-08-28");
    const bad = run("Friday");
    expect(bad.role === "run" && bad.date).toBeUndefined();
  });
});
