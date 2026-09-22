# .pipeline — Pipeline

## The engine's account

The check is `python/studio_kinds/kinds/pipeline.py` in the studio-kinds repository; the account below is that engine's own.

The `.pipeline` kind — ONE curated list, the stages that transform it, and
the views that show the result, all in one file. The items are the list as
first known — a scrape's rows, a hand-written table — and what is learned
later, from other places and at other times, arrives as a STAGE: a set of
rules that amend items, a filter that drops some, a sort that orders them.
A stage never edits the items; it is applied when the file opens, so the
rows as of any stage can be looked at, and the logic that produced them
beside it. The output is the rows after the last stage; a VIEW is one way
of showing it — its own filter, sort and columns, applied to the output
and to nothing else. Nothing is cached, nothing is written back.

Authoring shape (YAML, lenient — a half-written file still renders):

  title?
  decisions:                                   # the circumstances values can be given under — a playbook's decisions
    - key: method
      label: Method
      values: [{key: measured, label: Measured}, {key: anecdotal, label: Anecdotal}]
  labels: {price: "Total (AUD)"}               # header names by field, for every view; optional
  items:                                       # the list — every item has an `id` (a uuid), its identity
    - {id: 9b2f6d1c-4e0a-4c7b-9a1d-2f5e8c3b7a10, name: Family Room, price: 900, sleeps: 4}
    - {id: 3e7a5c88-1b2d-4f0e-8a6c-d94b1e2f7c03, name: Beach Cabin, price: 1200, sleeps: 4}
  stages:                                      # in order; each is `key` + ONE verb
    - key: corrections
      rules:                                   # pick items by id or clause, set fields
        - item: 9b2f6d1c-4e0a-4c7b-9a1d-2f5e8c3b7a10   # one id or a list — the short form of a clause on `id`
          set: {price: 850}
          when: [method=anecdotal]             # the circumstance: off the table once another answer is taken
        - where: [{field: name, op: contains, value: cabin}]
          set: {type: Cabin}
    - key: band
      filter: [{field: price, op: lte, value: 2000}]    # every clause must hold; the rest are dropped for good
    - key: cheapest
      sort: [{field: price, dir: asc}]         # first key first
  views:                                       # the output, shown; the first is what opens
    - key: by-price
      label: By price
      columns: [name, sleeps, price, "*"]
    - key: groups
      label: Sleeps 6+
      filter: [{field: sleeps, op: gte, value: 6}]      # hides for this view only
      sort: [{field: price, dir: asc}]

A rule is `where` clauses (all must hold; none = every item), `set` (dot
paths allowed) or `key`/`value`, and a `note`; a rule that matches no item
is a problem. `item:` names items by id and is refused when no item has
it. A filter, a sort and a view take the same clause vocabulary, `sort`
keys with `dir`, `columns` (`"*"` = every other column, after the named
ones), `hide`, `limit`. A stage with no verb, or two, is a problem, as is
a duplicate `key`, an item without an `id`, an id twice.

`when` — on a rule, a stage or a view — is the circumstance: refs
`decision=answer` into `decisions`, and it holds while no answer taken
contradicts it. The answers are taken on the page and never saved:
nothing taken, everything applies and a later rule wins; `method=measured`
taken, a rule under `method=anecdotal` is off the table, so the same file
shows "the measured picture". A value a rule set carries its refs: a badge
on the cell, and the field's trail in the row dialog — the item's own
value, then every stage that set it. Two rules setting one key under
different circumstances CONTEST it: while nothing taken decides between
them the cell shows every value on the table, each with its badge — the
one the row carries (the later rule's) first, the others beside it — and
once an answer is taken only the value under it is left. A ref to a
decision or an answer the file does not declare is a problem.

`studio-check --collect stays.pipeline` copies the output — or
`stays.pipeline#<view>` a view's rows and columns, nothing taken — into a
`.collection` of its own to decide over, one row at a time. That is a
copy, not a link: the collection then holds the rows.


## A fresh document (what the Studio creates)

```yaml
decisions:
  - key: method
    label: Method
    values: [{key: measured, label: Measured}, {key: anecdotal, label: Anecdotal}]
items:
  - {id: 8c1f2b6e-3d4a-4e5f-9a0b-1c2d3e4f5a6b, name: First item, price: 100}
stages:
  - key: corrections
    rules:
      - item: 8c1f2b6e-3d4a-4e5f-9a0b-1c2d3e4f5a6b
        set: {price: 90}
        when: [method=anecdotal]
  - key: band
    filter: [{field: price, op: lte, value: 1000}]
  - key: cheapest
    sort: [{field: price, dir: asc}]
views:
  - key: all
    label: All
```

