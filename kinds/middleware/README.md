# How a version-1 middleware works

<!-- Generated from kinds/middleware/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

Rows amended on their way to a view — a source, and rules that pick rows by clauses and set fields on them; read live by every .jsonl that names it, checked against the rows, never cached.

This is the `.middleware` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Always

*imposed*

What holds at every moment — the shape of the file, what a rule is, why it exists, and where the engine lives.

### The shape of the file

*A source and a list of rules; the scrape stays as it was, the correction lives here.*

#### Top-level keys

| key | what it is |
|---|---|
| `title`, `description` | the heading and one line under it |
| `source` | the rows amended — a `.json` (`#key` naming its list), a `.jsonl`, a `.csv`, or another `.middleware`; resolved against this file's folder |
| `rules` | each picks rows by clauses and sets fields on them, in order |

#### A rule

```yaml
rules:
  - where:                                   # EVERY clause must hold; none = every row
      - {field: best_offer.url, op: equals, value: "https://www.airbnb.com.au/rooms/…"}
    set: {available_for_dates: false, availability_note: "Airbnb page, 15 Sep: not available"}
    note: what you saw, for the reader
  - {where: [{field: name, op: equals, value: Family Room}], key: sleeps, value: 4}   # one key: key/value
```

A `field` (`param` reads the same) is a key of the row or a dot path into nested
objects; a `set` key may be a dot path too — the nested object is copied, never
mutated. The ops are the suite's one clause vocabulary: `equals`, `not_equals`,
`contains`, `not_contains`, `starts_with`, `ends_with`, `matches` (regex), `gt`,
`gte`, `lt`, `lte`, `between`, `in`, `not_in`, `is_empty`, `not_empty`, `is_true`,
`is_false`; text ops are case-insensitive and take one value or a list (any of them;
none of them for the `not_` ops); numeric ops are never true for an empty field.

#### Why

"I opened this listing and the page said it is not available for those dates": a
rule matching the listing's link sets its availability to false. The scrape stays as
it was, the correction lives here — dated, explained — and every `.jsonl` that names
this middleware among its `$sources` instead of the raw file sees the corrected rows.
A field a rule sets that no row had is a NEW column; the policy the `.jsonl` applies
decides whether it shows.

#### Where the engine lives

`packages/filekinds/src/lib/middlewareDoc.ts` — `parseMiddleware`, `withValue`,
`applyMiddleware`, `setText`; its header comment is what `studio-check --spec
middleware` prints, with `dataSources.ts` (`readSourceRows`, `chainText`) beside it.
The clauses are `policyDoc.ts`'s. The view is
`components/middleware/MiddlewareView.tsx`, which borrows the data grid; the checker
is `python/studio_kinds/kinds/middleware.py`.

## The file is opened

*imposed*

parseMiddleware reads the YAML once and never throws; the source chain is read live and every rule's match count is shown.

### What is parsed, what is read, and what is drawn

*A lenient parse, a live read of the chain, the rules applied.*

#### The parse

A YAML error is the first problem. Then: `source: not a file ref`, `rules: must be a
list`, per rule `rule N where M: no field`, `no op`, `unknown op "x"`, and `rule N:
sets nothing — give it set: {field: value} or key/value`. `set` and `key`/`value`
merge into one set; a `note` is kept when a string.

#### Reading the chain

"Source · x.json#key — reading…" while `readSourceRows` follows the ref, resolved
against this file's folder: a data file gives its rows; another `.middleware` is
followed to ITS source, at most eight deep, with `x.middleware: a cycle — it is
already being read (a → b)` refused, and each step's rules applied on the way back.
The line then reads the chain in words: `corrections.middleware →
accommodation.json#properties (483 rows, 1 amended)`. No `source`: "none" in amber.
An unreadable file: `could not read x`.

#### The rules applied

`applyMiddleware` runs the rules in order on copies of the rows; a later rule sees
an earlier rule's values. Every row every clause holds for gets the set's fields.
A rule that matches no row, when the source has rows, is the problem `rule N matches
no row` — the link changed, the row is gone.

#### What is drawn

The title (else the file's name) and description; the Source line; a box with every
problem — the parse's, the chain's, the rules'; then the rules as a numbered list:
"where price between 600 and 2000 and name contains any of “caravan”, “truck”" (or
"every row"), "set available_for_dates = false, note = “…”", the note, and a button
carrying the match count — `3 rows` — or "matches no row" in amber; "…" while the
chain is still being read. Nothing else on the page, and nothing is edited here.

## A rule's match count is clicked

*chosen · many*

The rows that rule matched, as amended, in a dialog.

"Rule N · N rows" over a data grid of the matched rows AS AMENDED — the columns the rule
sets first, then every other column the rows carry — with the grid's own search, sort,
pager and row dialog. A rule that matched nothing has no button to click.

## A file in the chain changes on disk

*imposed · many*

The source, or any middleware or raw file behind it, fires studio:fs-changed and the chain is read again.

The view remembers every file the chain read and listens for `studio:fs-changed` on any
of them; a change re-reads the chain and re-applies the rules, so the counts follow the
data. This file's own change (the desktop watcher, the web folder's events, VS Code's
text document) re-parses the rules and re-applies them to the rows already read; the
source is read again only when the `source` ref itself changed. The open dialog stays.

## A view names it

*imposed · many*

The middleware does its work wherever a .jsonl or another .middleware reads through it.

- A `.jsonl` lists it in `$sources` in place of the raw file; the composed view reads the
  chain, applies the rules, shows `(N rows, N amended)` in its lead, and re-reads when
  this file changes. Its table policy decides whether a column a rule added shows.
- Another `.middleware` names it as `source` — a middleware over a middleware over the
  raw file; the outer rules see the inner rules' values.
- `studio-check --collect x.jsonl` and the checker read through it the same way.

## studio-check runs on it

*imposed*

One file in, one verdict out — on the command line the source is read and every rule's count printed.

### What the checker does

*Two checks that differ by what they can reach.*

#### On the command line

1. Parse the YAML — a parse error is the only problem reported.
2. `parseMiddleware` — its problems. No `source`: the problem `no source` and the
   summary `N rules, no source`.
3. The chain read from disk beside the file and the rules applied: the chain's
   problems and every `rule N matches no row`.

Summary: `over <chain> (N rows, N amended): rule 1 → 3, rule 2 → 1`.

#### On the page

Steps 1 and 2 only. Summary `N rules over x.json#key`, and the note `source not
read — this check has no folder: x.json`.

#### Not checked

Whether a rule matches the row it was written for, rather than several. Whether a
set field is one the policy shows. A regex that never compiles (`matches` simply
fails).

## A middleware is written

*chosen*

### Write a middleware

*From the template to a correction the views see — and the raw file untouched.*

#### Start from the template

`studio-check --template middleware > fixes.middleware`, beside the data:

```yaml
source: rows.jsonl
rules:
  - where:
      - {field: url, op: equals, value: "https://example.test/item/1"}
    set: {available: false}
```

Point `source` at the raw file (with `#key` for a `.json` object), or at another
middleware to stack corrections.

#### Write one rule per thing seen

Clauses that pick exactly the row — a link with `equals` is the surest — then `set`
with the fields as they should be, and a `note` saying what was seen and when.

#### Name it from the view

In the `.jsonl`'s directive, replace the raw file in `$sources` with
`fixes.middleware`. The raw file is never edited.

#### Check it

`studio-check fixes.middleware` reads the source and prints every rule's count; a
rule that matches no row is a problem to fix — the link changed, or the row is gone.
