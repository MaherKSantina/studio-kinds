# How a pipeline works

<!-- Generated from kinds/pipeline/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

One curated list in the file, the stages that transform it and the views that show the output — the rows as of any stage and the logic behind them one click apart; applied on every open, never cached, never written back.

This is the `.pipeline` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Always

*imposed*

What holds at every moment — the shape of the file, what a stage and a view are, what a circumstance is, why it exists, and where the engine lives.

### The shape of the file

*The items, the stages in order, the views; the decisions the circumstances name.*

#### Top-level keys

| key | what it is |
|---|---|
| `title` | the heading; the file's name stands in |
| `decisions` | a playbook's decisions — `key`, `label`, `values: [{key, label}]` — the circumstances a `when` can name |
| `labels` | header names by field, for every view |
| `items` | the list, in the file: every item a mapping with an `id` (a uuid) — its identity, what a rule names |
| `stages` | in order; each `key` + ONE verb — `rules`, `filter` or `sort` — and an optional `label` and `when` |
| `views` | the output shown: each `key`, `label`, and `filter`, `sort`, `columns`, `hide`, `limit`, `when` |

#### A stage

```yaml
stages:
  - key: corrections
    rules:                                   # pick items by id or clause, set fields
      - item: 9b2f6d1c-4e0a-4c7b-9a1d-2f5e8c3b7a10   # one id or a list — the short form of a clause on `id`
        set: {price: 850}
        when: [method=anecdotal]             # the circumstance
      - where: [{field: name, op: contains, value: cabin}]
        set: {type: Cabin}
  - key: band
    filter: [{field: price, op: lte, value: 2000}]    # every clause must hold; the rest are dropped for good
  - key: cheapest
    sort: [{field: price, dir: asc}]         # first key first
```

A rule is `where` clauses (all must hold; none = every item), `set`
(a key may be a dot path) or `key`/`value`, a `note`; `item` names items by id. The
clause vocabulary is the suite's one: `equals`, `not_equals`, `contains`,
`not_contains`, `starts_with`, `ends_with`, `matches`, `gt`, `gte`, `lt`, `lte`,
`between`, `in`, `not_in`, `is_empty`, `not_empty`, `is_true`, `is_false`. A filter
drops for the stages after it and for the output; a sort orders, first key first.

#### A view

```yaml
views:
  - key: by-price
    label: By price
    columns: [name, sleeps, price, "*"]     # in this order; "*" = every other column, after these
  - key: groups
    label: Sleeps 6+
    filter: [{field: sleeps, op: gte, value: 6}]      # hides for this view only
    sort: [{field: price, dir: asc}]
```

A view is a set of rules over the output — `filter`, `sort`, `columns`,
`hide`, `limit` together — and nothing else; the first view is what opens. No
views: one plain view, every column, the output's order.

#### A circumstance

`when` — on a rule, a stage or a view — is a list of refs `decision=answer` into
`decisions`. It holds while no answer taken contradicts it: nothing taken, everything
applies and a later rule wins; `method=measured` taken, a rule under
`method=anecdotal` is off the table. The answers are taken on the page for the
session and never saved. A value a rule set carries its refs as the badge on the
cell and in the field's trail; one key set under two circumstances shows both values
until an answer decides — the way to say "measured 5, the host says 6" in one row.

#### Why

A list curated from several places at several times: the items are what was known
first, and what came later — a page opened, a call made, a friend's word — is a stage
with a rule per thing learned, each under the circumstance it was learned in. The
items are never edited by a stage, so the list as of any stage is there to look at,
and the logic that made it is beside it. Everything is one file: paste it, check it,
render it with nothing else on disk.

#### Where the engine lives

`python/studio_kinds/kinds/pipeline.py` — `parse`, `run`, `holds_under`, `trail`,
`rows_at`, `summary`, with the rules (`read_rule`, `apply_rules`) in it and the
clauses, the filter and the sort in `_rows.py` (`read_clauses`, `read_table_rules`,
`apply_table`); its header comment is what `studio-check --spec pipeline` prints,
and the shape is `kinds/pipeline/v1.schema.json`. The view is
`components/pipeline/PipelineView.tsx`, over the data grid and the row dialog.

## The file is opened

*imposed*

parsePipeline reads the YAML once and never throws; runPipeline applies every stage and every view, nothing taken; the items open first.

### What is parsed, what is run, and what is drawn

*A lenient parse, the stages run in order, the rail and the pane.*

#### The parse

A YAML error is the first problem. Then: `decisions: must be a list`, `decision x: no
values`, `labels.x: must be text`; per item `item N: no id` (it is given `#N` so the
rest still runs) and `item N: id x is item M's too`; per stage `stage N: no key`,
`stage x: key twice`, `stage x: no verb — give it rules, filter or sort`, `stage x:
filter and sort — one verb per stage`, `stage x when: no decision "d"` or `d has no
answer "a"`, and the rules' own — `stage x rule N where M: no field` / `no op` /
`unknown op "z"`, `stage x rule N: sets nothing`, `stage x rule N: item y is no
item`, `stage x rule N when: …`; a filter's or sort's `stage x filter M: …`, `stage
x sort M: …`; per view `view N: no key`, `view x: key twice`, `view x: a stage has
this key`, and its rules' problems.

#### The run

The stages in order, each on the rows the one before it left: a `rules` stage runs
the rules on the table (their `when` holds under the answers taken) as one
in order, so a later rule sees an earlier rule's value — every cell set is marked
with the rule's circumstance and the claim joins the field's trail; a `rules` stage
rule matching nothing is `stage x rule N matches no item`; a `filter` stage keeps
the rows every clause holds for and remembers the dropped; a `sort` stage orders
(a key no row carries is a problem). A stage whose `when` is contradicted is
skipped — the rows pass through. Then every view over the output: the same rules
applied, `id` shown only when named in `columns`.

#### What is drawn

The heading (the title, else the file's name), `N items · N stages · N out`, the
problem count (every problem in its tooltip), and the decisions as pills when the
file has any. Down the left, the rail: **Items** with their count; every stage with
its label and what it did — `rules · 3 set`, `filter · 12 → 9`, `sort · 9`,
`skipped` — greyed when skipped, an amber count where it has problems; a line; then
**Output** with its count and the number of views. The pane opens on the items: the
grid of every field but `id`, with the header labels, cells a stage sets carrying
their circumstance as a badge.

## A stage is clicked

*chosen · many*

The rows as of that stage, or its logic — Rows and Logic, a switch at the right of the pane's head.

### Rows and Logic

*Two ways to look at one stage.*

#### Rows

The grid as of this stage: the cells this stage set on amber, each with its
circumstance as a badge and, on hover, the stage that set it; cells earlier stages
set keep their badges. A key two rules set under different circumstances is
CONTESTED while nothing taken decides it: the cell shows the value the row carries
(the later rule's) with its badge, then every other value on the table, muted, with
its own — `5 Method = Measured · 6 Method = Anecdotal`; an answer taken leaves one.
A skipped stage says so above the grid and shows the rows unchanged. The stage's own
problems sit above the grid.

#### Logic

By the verb. `rules` — a numbered list: "where item Family Room and price greater
than 800" (or "every item"), "set price = 850", "under Method = Anecdotal", the note,
and a button carrying the count — `3 items` — that opens the items this rule set,
as of this stage, the set fields first; "matches no item" in amber; "off the table
under the answers taken" greyed. `filter` — "keep where price at most 2000", "kept 9
of 12" and a button `3 items dropped` that opens them. `sort` — "sorted by price
asc, then km asc" in the header labels' words.

## An answer is taken

*chosen · many*

A pill clicked — the pipeline runs again under the answers taken; clicking the taken pill clears it.

A rule, a stage or a view whose `when` names another answer to a taken decision goes off
the table: its sets are not made, its filter and sort do not run, its tab is struck
through. Everything under the taken answer, and everything under nothing, stays. The
counts on the rail, the badges, the trails and the views follow. Nothing is written: the
file opens with nothing taken every time.

## Output is clicked

*chosen · many*

The views as tabs, one grid at a time.

The views' labels as tabs, the first open; above the grid the view's label and its rules
in a line — "2 filters · sorted by price asc · first 100" — in the header labels' words.
The grid is the view's rows in its columns, badges on the cells a stage set. A view off
the table under the answers taken is struck through and, opened, says which answer it
holds under. With no views the grid is the output in every column.

## A row is clicked

*chosen · many*

The row dialog — every field, then the item's id and the trail of every field a stage set.

Every field of the row in full, the grid's columns first; under them the item's `id`
with a copy button, and for every field a stage set, its trail: `900 (item) → 850
(corrections · rule 1 · Method = Anecdotal)`. Arrows walk the rows as the grid shows them.

## The output is taken somewhere

*imposed · many*

--collect COPIES the output, or a view's rows, into a collection of its own; nothing else reads a pipeline.

- `studio-check --collect stays.pipeline`, or `stays.pipeline#by-price` for a view, writes
  a `.collection` holding those rows — the file's labels copied with them — to decide over
  one at a time. The rows are COPIED: the collection then holds them and nothing points
  back here, so the two can never drift apart. The run is with nothing taken.
- Nothing reads a pipeline while it is open: the items, the stages and the views are in
  this file, and what it produces is looked at here.

## studio-check runs on it

*imposed*

The whole file is checked wherever it is — its items are its own, so the page's check is the checker's.

### What the checker does

*One file in, one verdict out — the same on the command line and on the page.*

#### The check

1. Parse the YAML — a parse error is the only problem reported.
2. `parsePipeline` — its problems.
3. `runPipeline`, nothing taken — every stage's and every view's problems.

Summary: `12 items → corrections (rules · 3 set; rule 1 → 1, rule 2 → 1, rule 3 → 8)
→ band (filter · 12 → 9) → cheapest (sort · 9) → 9 out · views: by-price 9, groups
2 · 1 decision`.

#### Not checked

Whether a rule matches the item it was written for rather than several. Whether a
set field is one a view shows. What the file looks like under an answer taken.

## A pipeline is written

*chosen*

### Write a pipeline

*From the template to a list with its stages and views.*

#### Start from the template

`studio-check --template pipeline > stays.pipeline`: one decision, one item, a
stage of each verb, one view. Replace the item with the list, one mapping each,
every one with a fresh uuid as its `id`.

#### Add a stage per thing learned

A `rules` stage for what a place said about particular items — `item:` the id,
`set:` the fields as they should be, `when:` the circumstance if it has one; a
`filter` to drop what is out; a `sort` for the order. One verb per stage; the key
is its identity — keep it once written.

#### Say how the output shows

A view per representation: its `columns` in order, a `filter` that hides for this
view only, a `sort`. `labels` at the top name the headers for every view.

#### Check it

`studio-check stays.pipeline` prints every stage's counts; a rule that matches no
item, an item a rule names that is not there, a ref to no decision — each is a
problem to fix.
