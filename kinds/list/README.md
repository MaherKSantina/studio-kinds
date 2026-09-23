# How a version-1 list works

<!-- Generated from kinds/list/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

A list of documents that is a node by itself — rows with a file or fields, read live from other lists when it has sources, each row opening whole.

This is the `.list` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Where do the rows come from?** (`rows`)

- `own` — Its own items. No `sources` — the rows are the `items` in the file.
- `collated` — Collated from other lists. `sources:` names other lists; their rows are read live on every open and merged behind this list's own.

## Always

*imposed*

What holds at every moment — the shape of the file, what a row is, and where the engine lives.

### The shape of the file

A title and rows; optionally other lists to collate.

#### Top-level keys

| key | what it is |
|---|---|
| `title` | the heading; "List" when absent |
| `description` | one line under the title |
| `items` | the rows |
| `sources` | other `.list` files whose rows this list collates — a path, or `{list, label}` (`file` and `path` read as `list`) |
| `dedupeBy` | with sources: rows sharing this field's value (or `label`) collapse into one |

Refs resolve against this file's folder, or from the store root when absolute.

#### A row

```yaml
items:
  - {label: Incorporation, file: incorporation.brief}     # a document, by ref
  - {label: A row without a file, status: done, at: 2026-09-01}
  - Just a label                                         # a bare string is a label
```

`file` is the document; `label` (else `text`, else `title`) is the name; `export:
true` lets a project show the row as a child of the list node; `refs: [{kind, to}]`
are typed edges to other rows. EVERY OTHER SCALAR KEY is a field of the row, kept as
a string — a bare ISO date YAML read as a date is kept as the date written. A row
with its own `label` keeps `title` as an ordinary field: a job ad's title is data,
not the row's name. A row with neither a file nor a label is dropped.

#### Why it is a node

Born from the multiple-producers rule: when several streams target one thing, that
thing graduates to its own node. Streams save documents into a list one by one —
each output point targets `item:0` … `item:last` — and other streams take the whole
list as an input stage.

#### Where the engine lives

`packages/filekinds/src/lib/listDoc.ts` — `parseDocList`, `dumpDocList`, `itemAt`,
`exportedItems`; its header comment is what `studio-check --spec list` prints.
Reading with sources is `listCollate.ts` (`collateList`, `readListRows`), kept apart
because it reads files. The view is `components/list/DocListView.tsx` (with
`RowFieldsBlock`, shared with a policy run's why-dialog); rows open through
`components/points/FileContentDialog.tsx`. The checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

parseDocList reads the YAML once and never throws; the rows are drawn, numbered from 0, with a filter over their fields.

> Say where the rows come from — a collated list reads other files before it has rows.

### When `rows=own`

**The parse.** An unparseable file opens as "List" with no rows. Each row keeps its
file, label, `export`, `refs` and fields as the shape says.

**What is drawn.** The title in the strip. One row per item, numbered from 0 (the
numbering survives every filter), showing the label — else the file, else "Item N" —
a kind chip with the file's extension, the file path in monospace, and chips for the
fields (`key: value`; a field whose value is a URL is a link chip showing its host) and
the refs (`kind → to`).

**The filter.** Every field present on some rows with 2 to 12 distinct values is a
dimension candidate, listed under "filter by"; the first is the default lens the moment
the list is typed. The active dimension's values become pills that filter the rows
(a row without the field falls under "—"), and its chip is skipped on the rows. Search
runs over labels, files, field values and refs.

**Empty.** "Empty — streams save documents into this node one by one."

### When `rows=collated`

**The parse.** As for a plain list, plus `sources` and `dedupeBy`.

**The read.** The strip says "collated from N lists — reading…". `collateList` starts
from this list's own rows, then reads each source in order, resolved against this file's
folder: every sourced row is appended with its `file` re-resolved against ITS list and a
`source` field naming the source (its `label`, else the file's stem) unless the row
already carries one. A source that cannot be read is skipped, never a blocker. One hop
only: a source's own `sources` are not followed.

**Deduplication.** With `dedupeBy`, rows whose value for that field (or their label, for
`label`) match case-insensitively collapse into the first; the others' `source` names
accrue on it as `also_on`, so the `source` value set stays small enough to filter by. A
row with an empty key never collapses.

**What is drawn.** The strip ends "· N rows"; then the same rows, chips, filter and
search as a plain list — `source` is usually the first filter dimension. The collation
needs a store to read from: without one (no base path) the list shows only its own items.

## A row is clicked

*chosen · many*

A row with a file opens the document whole; a row with only fields opens its fields.

- **A row with a file** opens it in the file-content dialog, rendered by its own kind —
  a brief as a tree, a kanban as a board, a PDF in a frame — with the row's label as the
  title. A collated row's file was re-resolved against its source list, so it opens from
  there.
- **A row with fields but no file** opens a details dialog: the label (or "Item N"), every
  non-empty field with its key, URLs clickable, and an "Open <host>" button for the first
  field that is a URL. A row with none: "This row carries no fields."
- **A bare label** does nothing.
- **A link chip** on a row opens the URL in a new tab and does not open the row.

Nothing is written: a list is read here, never edited.

## A filter or a search is taken

*chosen · many*

Session-only narrowing over the rows shown.

Clicking a dimension chip makes it the active lens; clicking the active one clears the
lens (an explicit "none", not the default). The value pills filter; a search matches
every word against the row's label, file, field values and refs. Row numbers are the
original indices, so "12." is item 12 whatever is hidden. The state is the view's own and
is gone when the file is closed.

## The file changes on disk

*imposed · many*

The host re-reads; a collated list reads its sources again — but only when this file changed.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The view re-parses and, when the list has sources,
re-collates. A change to a SOURCE list alone is not noticed: the collation re-runs on this
list's text or path changing, so a source edited elsewhere shows on the next open of this
list. The active filter and the open dialog are state and stay.

## Something writes rows into it

*imposed · many*

A list is where streams land documents and where other kinds read rows from.

### Who writes it, who reads it

The list is authored by hand or by producers; several kinds read it.

#### Producers

A points store's output points target `item:0` … `item:last` (`itemAt`) and save a
document into the row. A workup's classify step stamps typed fields onto rows —
`norm_type`, `actor` — which is where the filter dimensions come from. A journey's
`collate:` pools every lane above into one list.

#### Readers

A project shows `export: true` rows as children of the list node (`exportedItems`).
A definition's `fanout: {list: pool.list}` splits a pool into per-item columns. A
policy run maps the rows of the list it names, and its why-dialog shows a row's
fields through the same block the list's own dialog uses. Another list collates it.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses.

### What the checker does

The order it runs in, the summary line, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseDocList` — it never throws.

#### The summary line

`N items` — the file's own rows; sources are not read by the checker. The page does
not know the list kind at all: a list written inside a playbook there is reported as
"not a kind this check knows".

#### Not checked

That a row's `file` exists. That a source exists or is a list. That `dedupeBy` names
a field any row carries. A row dropped for having neither file nor label.

## A list is written

*chosen*

### Write a list

From the template to rows that open — by hand, or as the target of a stream.

#### Start from the template

`studio-check --template list > new.list`:

```yaml
title: new
items: []
```

#### Write the rows

`{label, file}` for a document (the ref relative to this file's folder); any extra
scalar key is a field. Keep field keys consistent across rows, because a field is a
filter only when 2 to 12 distinct values repeat across rows.

#### Point the streams at it

Leave `items: []` and let the output points target `item:0` … `item:last`; the
list shows "Empty — streams save documents into this node one by one" until the
first lands.

#### Collate other lists instead

`sources: [a.list, {list: b.list, label: b}]` and, when the same thing appears in
several, `dedupeBy: <field>` — rows are read live, never copied.

#### Check it

`studio-check new.list` prints the item count. Open it to see the collation and the
filter — the checker reads neither.
