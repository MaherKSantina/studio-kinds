/** GOLDEN RULES for the policy checker: a dropped clause leaves its case matching everything,
 *  so every silent fallback of the lenient parser is named as a problem. */
import { describe, expect, it } from "vitest";
import { parsePolicyFile, policyProblems, policySummary } from "./policyDoc";

const GOOD = `
title: Guest pitch triage
params:
  - {key: audience, label: Audience size, type: number}
  - {key: topic, type: string}
  - {key: proven, type: boolean}
buckets:
  - {key: accept, label: Accept}
  - {key: maybe, label: Maybe}
  - {key: decline, label: Decline}
default: decline
cases:
  - label: Off topic
    when:
      - {param: topic, op: not_contains, value: [podcast, audio]}
    bucket: decline
  - label: Big audience
    when:
      - {param: audience, op: gte, value: 50000}
    bucket: accept
  - label: Mid and proven
    when:
      - {param: audience, op: between, value: [10000, 50000]}
      - {param: proven, op: is_true}
    bucket: accept
  - label: Everything else on topic
    when: []
    bucket: maybe
`;

describe("policyProblems", () => {
  it("a policy the engine runs exactly as written has no problems, and a summary", () => {
    expect(policyProblems(GOOD)).toEqual([]);
    expect(policySummary(parsePolicyFile(GOOD))).toBe("3 params, 4 cases, 3 buckets, default decline");
  });

  it("an op outside the vocabulary is the trap: the clause is dropped and its case claims everything", () => {
    const text = `
title: t
params: [{key: audience, type: number}]
buckets: [{key: accept}, {key: decline}]
cases:
  - when: [{param: audience, op: bigger_then, value: 1}]
    bucket: accept
`;
    expect(policyProblems(text)).toEqual([
      "case 1, clause 1: op `bigger_then` is not one — the clause is dropped, and a case with no clauses left matches everything; ops are equals, not_equals, contains, not_contains, starts_with, ends_with, matches, gt, gte, lt, lte, between, in, not_in, is_empty, not_empty, is_true, is_false",
    ]);
  });

  it("enforces the field table: title, bucket per case, declared buckets and params, the three types", () => {
    const text = `
params: [{key: x, type: integer}, {key: x}]
buckets: [{key: a, start: noon}, {key: a}]
default: nope
cases:
  - when: [{param: y, op: gt, value: 1}]
  - label: Second
    when: [{param: x, op: gt, value: 1}]
    bucket: b
  - when: [{op: gt, value: 1}, {param: x}]
    bucket: a
`;
    expect(policyProblems(text)).toEqual([
      "no `title` — a name for the rules",
      "param x: type `integer` is not one of string, number, boolean",
      "param x: duplicate key",
      "bucket a: `start` is not a time — write `HH:MM`",
      "bucket a: duplicate key",
      "default `nope` is not a declared bucket — one of a",
      "case 1: no `bucket` — the case is dropped and can never claim an item",
      "case 1, clause 1: param `y` is not declared — one of x",
      "case 2 (Second): bucket `b` is not declared — one of a",
      "case 3, clause 1: no `param` — the clause is dropped, and a case with no clauses left matches everything",
      "case 3, clause 2: no `op` — the clause is dropped, and a case with no clauses left matches everything",
    ]);
  });

  it("a value the op cannot use is named", () => {
    const text = `
title: t
params: [{key: n, type: number}, {key: s, type: string}]
cases:
  - when:
      - {param: n, op: gt, value: many}
      - {param: n, op: between, value: 5}
      - {param: s, op: in, value: a}
      - {param: s, op: is_empty, value: x}
      - {param: s, op: contains}
    bucket: a
  - bucket: a
`;
    expect(policyProblems(text)).toEqual([
      "case 1, clause 1: `gt` needs a number (got \"many\")",
      "case 1, clause 2: `between` needs `value: [low, high]` (got 5)",
      "case 1, clause 3: `in` needs `value:` as a list (got \"a\")",
      "case 1, clause 4: `is_empty` takes no value",
      "case 1, clause 5: `contains` needs a `value` — one, or a list meaning any of them",
      "case 2: no `when` — an empty `when: []` says \"always\" on purpose",
    ]);
  });

  it("a run is its two refs and a map; `policy` without `items` is a bucket policy missing its cases", () => {
    const run = "title: r\npolicy: order.policy\nitems: pool.list\nmap: {title: label, body: [a, b]}\ndate: 2026-09-21\n";
    expect(policyProblems(run)).toEqual([]);
    expect(policySummary(parsePolicyFile(run))).toBe("run: order.policy over pool.list, 2 params mapped");
    expect(policyProblems("title: r\npolicy: order.policy\nitems: pool.list\nmap: {title: 3}\ndate: today\n")).toEqual([
      "map title: a field name or a list of them",
      "`date` is not `YYYY-MM-DD`",
    ]);
    expect(policyProblems("title: r\npolicy: order.policy\n")).toEqual([
      "a run names both `policy` and `items` — one without the other is a bucket policy missing its cases",
      "no `cases` — the ordered switch; `cases: []` claims nothing",
    ]);
  });

  it("a YAML error is the YAML stage's to report — nothing here", () => {
    expect(policyProblems("title: [unclosed\n")).toEqual([]);
  });
});
