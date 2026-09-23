# How a data file works

<!-- Generated from kinds/jsonl/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

Data rows, one JSON object per line, shown as a paged, searchable, sortable table with the columns found — and, on directive lines, what is known about those rows.

This is the `.jsonl` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Always

*imposed*

What holds at every moment — the shape of a line, what a directive is, and where the engine lives.

### The shape of the file

*Not YAML — JSON Lines, with directive lines for what is known about the rows.*

#### A row

One JSON object per line; the columns are the union of the objects' keys in the
order first seen. A file whose whole text is one JSON array of objects is accepted
too. Values render as text — strings as they are, numbers and booleans as written,
null and missing empty, objects and arrays as compact JSON — and that text is what
the search and the sort see. Nothing is authored in the view: a `.jsonl` is written
by whatever produced the data.

#### Directive lines

```json
{"$title": "Stays by price", "$description": "Thu 1 - Mon 5 Oct, 4 nights, two adults"}
{"$labels": {"best_offer.price_total_aud": "Total (4 nights, AUD)"}}
```

| directive | what it is |
|---|---|
| `$title`, `$description` | the table's own words |
| `$labels` | header names by field, dot paths included |

A line whose keys start with `$` is a directive, not a row. They may be split;
`$labels` accumulates, a second scalar replaces the first with a note.

#### The rows are this file's

The table is the file: the rows are here, and what is said about them is here too,
so a copy of the file is a copy of the table and the two can never drift. A list
curated from several places at several times — rows amended, filtered and sorted by
rules — is a `.pipeline`, which holds its items and its stages in one file the same
way.

#### Where the engine lives

`python/studio_kinds/kinds/jsonl.py` — `parse_data_rows`, `About`, with `_rows.py`
beside it for `cell_text`, `value_at`, `columns_of` and `compare_values`; its header
comment is what `studio-check --spec jsonl` prints, and the shape of a line is
`kinds/jsonl/v1.schema.json`. The view is `components/data/DataTableView.tsx`
(`DataGrid`, the Collect button) with `RowDialog.tsx` and `cells.tsx`.

## The file is opened

*imposed*

Every line is read and nothing throws; the grid is drawn from the rows the file holds.

### What is read, and what is drawn

*The lines, then the grid.*

#### The parse

Blank lines are skipped. A line that is not JSON, or not an object, is a problem
named by its line — `line 12: Unexpected token…`, `line 12: not a JSON object` —
and the row is skipped. A text starting with `[` is tried as one array first. The
columns are gathered from the rows kept.

#### The directive

A `$` line is not a row. Named problems: `a directive line carries no row fields —
"k" ignored`, `unknown directive "$x" (known: $title, $description, $labels)`,
`$title must be text`, `a second $title — this one applies`, `$labels must be an
object of field: label`, `$labels."f" must be text`. `$sources` and `$policy` are
named as gone: the rows a table shows are the file's own, and rules over rows live
in the `.pipeline` that holds them.

#### The grid

A strip: `N rows · N columns`, and `N match` while a search is on; "Search every
field" (every word must match, case-insensitive, applied 150 ms after typing,
Escape clears); rows per page (25, 50, 100, 250; 50 to start) and a pager
`from–to of total`. Problems under it: `N lines skipped: line 12: …`. Then the
table: a `#` column with the row's original number, one column per key, headers
sortable and named by `$labels`, cells in monospace truncated at 360px with the
whole text on hover; a cell that is a link opens in the browser and has a copy
button beside it. The heading is the `$title`, else the file's name, with the
`$description` under it.

#### Empty

No rows and problems: "No rows could be read — one JSON object per line is the
shape." with up to eight of them and the text underneath. No rows and no problems:
"No rows — one JSON object per line." The file's text shows in either case.

## The rows are searched, sorted or paged

*chosen · many*

Session-only narrowing; a row click opens the row whole.

A search keeps the rows whose text — every column's, joined — contains every word.
A header click sorts ascending, a second descending, a third clears; numbers sort before
text when both occur, text by locale with numbers inside it read as numbers, empties last
whichever the direction, ties in original order. A new search, sort, page size or set of
rows goes back to page one and closes the dialog. Clicking a row opens it in full — every
column and its value, with previous and next over the rows in their current order and the
row as JSON to copy. Row numbers are the rows' original positions. Nothing is written.

## The file changes on disk

*imposed · many*

The host re-reads; the grid re-parses and goes back to page one.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The rows and columns are re-parsed — everything the
table shows is in the new text, so there is nothing else to wait for. A new set of rows
returns the grid to page one and closes the row dialog; the search and the sort stay.

## The rows are collected

*chosen*

The rows are COPIED into a .collection to decide over one at a time — a handover, not a link.

The Collect button sits in the grid's lead when the host has a writer. It asks for a name
(`<stem>.collection`, checked against the folder's files) and writes a collection whose
`fields` are the columns shown, whose `labels` are the `$labels`, whose `stats` are the
numeric fields and the first link, and whose items are the rows shown with ids 1, 2, 3…
in order — then opens it. `studio-check --collect x.jsonl [name.collection]` writes the
same from the command line. The rows are copied in: the collection then holds them, and
nothing points back here, so a decision and the row it was taken about cannot drift apart.

## Another document holds rows like these

*imposed · many*

Every kind that shows rows holds its own.

- A `.pipeline` holds its items, the stages that amend, filter and sort them, and the
  views over the output — one curated list in one file.
- A `.collection` holds the rows copied out of a table to decide over, one at a time.
- A `.policy` holds rules and knows nothing about any rows; what the rows ARE is said
  where the rows are.

## studio-check runs on it

*imposed*

One file in, one verdict out — the engine's own problems are the check.

### What the checker does

*Not YAML, so the engine's own problems are the check.*

#### Rows and directives

Every skipped line is a problem, named by its line; every directive that cannot be
read is one too, and `$sources`/`$policy` are named as gone with what holds the rows
and the rules now. Summary: `N rows × N columns`, and `, N labelled` when `$labels`
names any.

#### Nothing beside it

There is nothing beside the file to read, so the verdict is the same wherever the
file is checked — on this machine, on another, or pasted into a page.

#### Not checked

That the columns are consistent across rows. That a `$labels` field is a field any
row carries.

## A data file is written

*chosen*

### Write a data file

*Rows from a producer, and the words that name them.*

#### Start from the template

`studio-check --template jsonl > new.jsonl` — two rows:

```json
{"id":1,"name":"First row","amount":10,"done":true}
{"id":2,"name":"Second row","amount":20,"done":false,"note":"any key becomes a column"}
```

#### Write or produce the rows

One object per line, no trailing commas, no blank objects — a `JSON.stringify(row)`
per line from whatever produced the data. Keep keys the same across rows; a key that
appears once is a mostly-empty column.

#### Name the table

A directive line for what is known about these rows: `{"$title": "Stays by price"}`
and `{"$labels": {"best_offer.price_total_aud": "Total (4 nights, AUD)"}}`.

#### Check it

`studio-check new.jsonl` — every skipped line and every unreadable directive is
named, and the summary counts the rows, the columns and the labelled fields. Then
open it and search.
