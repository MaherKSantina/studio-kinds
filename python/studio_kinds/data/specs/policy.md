# .policy — Policy

## The engine's account

The check is `python/studio_kinds/kinds/policy.py` in the studio-kinds repository; the account below is that engine's own.

The `.policy` kind — a DETERMINISTIC input → filter → bucket machine, and
the two chain roles, each of them one whole file.

  params  — the typed input parameters an item carries.
  cases   — an ordered SWITCH: each case is a filter (clauses ANDed) over
            the params plus the bucket it assigns. First match WINS and
            the switch stops — buckets are mutually exclusive.
  buckets — the declared outputs; `default:` names the bucket for items
            no case claims (omitted = the built-in "unmatched" bucket).

Applying the policy to ONE item answers {bucket, case}; applying it to a
LIST answers the 1-D grouping a OneDList renders directly. Everything in
here is pure — no dates, no randomness, no IO.

A param's `type` is `string`, `number` or `boolean` (anything else reads
as string). A clause's `op` is one of: equals, not_equals, contains,
not_contains, starts_with, ends_with, matches, gt, gte, lt, lte, between
(`value: [low, high]`), in, not_in (`value:` a list), is_empty, not_empty,
is_true, is_false. Text ops take one value or a list (any of them; none
of them for the negated ops) and compare case-insensitively.

The parser is lenient — a half-written policy still opens — and the
CHECKER is strict: `policyProblems` names a case with no bucket, a bucket
or default no `buckets:` entry declares, a clause on a param `params:`
does not declare, an op not in the list above, a value the op cannot use
(`between` without two numbers, `in` without a list, a numeric op without
a number), a param type outside the three, and a duplicate param or bucket
key — because a dropped clause leaves its case matching EVERYTHING, and
a switch that guesses is not deterministic.



## A fresh document (what the Studio creates)

```yaml
title: untitled
description: Input in, bucket out — the switch runs in order and stops at the first match.
params:
  - {key: name, label: Name, type: string}
buckets:
  - {key: "yes", label: "Yes"}
  - {key: "no", label: "No"}
default: "no"
cases:
  - label: The first filter
    when:
      - {param: name, op: not_empty}
    bucket: "yes"
```

