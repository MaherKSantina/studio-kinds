# .policy — Policy

## The engine's account

The check is `python/studio_kinds/kinds/policy.py` in the studio-kinds repository; the account below is the Studio's engine's own (`packages/filekinds/src/lib/policyDoc.ts`), which the check reproduces.

The `.policy` kind — a DETERMINISTIC input → filter → bucket machine.

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

## Also (policyChain.ts)

The POLICY CHAIN — triage factored into two documents instead of one switch.

  tags policy (`role: tags`) — reads an item's params and TAGS it along a
    set of dimensions (crosscut `SpaceDecision`s — same shape, but these
    are facts about the content, not judgements). A dimension carries
    ordered `derive` rules (clauses over the params → a value) or, for a
    COMPUTED dimension, ordered `from` rules (refs over the answers of
    dimensions declared ABOVE it → a value) — how several raw answers
    collapse into one the order can name ("undesired employer" from two
    employers). Either way the first matching rule tags it and a rule
    with no conditions is the default. `hidden: true` marks a dimension
    as plumbing: it still tags, but Input panes and answer groups skip
    it — the computed dimension is the face, the raw one the mechanism.

  order policy (`role: order`) — the judgement: a RANKING over tag
    combinations, and nothing else. An entry is just a `when` predicate
    (`dimension=value` refs, ANDed); its POSITION IS ITS RANK, top to
    bottom, first match wins; its label falls out of the values it names.
    There is no veto lane: a "bad" combination is simply an entry near the
    bottom, and the entries above it carry the refs that keep it out of
    them (exactly how a ranking group writes `employer=open`). An entry
    with no refs takes everything left — least priority IS excluded.
    Items nothing claims are UNRANKED — parked, never discarded. It names
    the tags policy it consumes via `tags:`, which is what makes the chain
    navigable: run → order → tags.

A run whose `policy:` points at an order policy applies the whole chain
per row: map → params → tag values → rank. Everything here is pure — no IO.

## Also (tablePolicy.ts)

The TABLE role of a `.policy` (`role: table`) — a policy over ROWS: which
to keep, in which order, which columns. The file holds RULES only and
knows NOTHING about the data: no source, no title for the rows, no header
labels. The rows come from the `.jsonl` that applies it — its directive
lines name the sources, this policy, and everything said about the data
(see dataRows.ts) — read live on every open and never cached, so several
`.jsonl` files can share one policy and none can drift from its data.

Authoring shape (YAML, lenient — a half-written file still renders):

  role: table
  title, description?                # a name for the RULES ("within the price band, cheapest first"), never the data
  where:                            # EVERY clause must hold (AND); a row failing one is out
    - {field: available_for_dates, op: is_true}
    - {field: best_offer.price_total_aud, op: between, value: [600, 2000]}
  sort:                             # first key first; a later key breaks ties
    - {field: best_offer.price_total_aud, dir: asc}
    - {field: distance_from_narooma_km, dir: asc}
  columns: [name, sleeps, best_offer.price_total_aud, "*"]   # shown, in THIS order; omitted = every
                                    # column the rows carry; "*" = every other column, after these
  hide: [images]                    # subtracted from the columns shown
  limit: 100                        # at most this many rows

A `field` is a key of the row, or a DOT PATH into nested objects
(`best_offer.price_total_aud`), everywhere a field is named. The ops are
the suite's one clause vocabulary (policyDoc.ts): equals, not_equals,
contains, not_contains, starts_with, ends_with, matches (regex), gt, gte,
lt, lte, between ([low, high]), in / not_in (a list), is_empty, not_empty,
is_true, is_false — text ops case-insensitive and taking one value or a
LIST (any of them; none of them for the not_ ops: {field: name, op:
contains, value: [caravan, truck]}), numeric ops never true for an empty
field. An unknown op, a sort direction that is not asc/desc, a
column no row carries are PROBLEMS the checker and the view report, not
silent drops.

Apply it from a `.jsonl` beside it — the title and the header labels
belong THERE, with the data:

  {"$sources": ["accommodation.json#properties"], "$policy": "cheapest.policy"}
  {"$title": "Stays by price", "$labels": {"best_offer.price_total_aud": "Total (4 nights, AUD)"}}

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

