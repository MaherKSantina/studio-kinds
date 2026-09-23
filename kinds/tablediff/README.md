# How a version-1 table diff works

<!-- Generated from kinds/tablediff/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

Two tables compared live — rows paired by key columns, verdicts per row, regrouping by totals, a dated HTML snapshot on export; recomputed on every open and never stored.

This is the `.tablediff` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Always

*imposed*

What holds at every moment — the shape of the file, what the verdicts mean, and where the engine lives.

### The shape of the file

Two handles, a key, and what to compare; the diff lives nowhere.

#### Top-level keys

```yaml
title: Timesheet vs shift notes
left:  {handle: /Fatin/timesheet.csv, label: Timesheet}     # the proposed table
right: {handle: /Fatin/shift-notes.csv, label: Shift notes} # the base table
key: [Client, Service Date]      # the columns that identify a row
compare: [Duration, Charge]      # omitted = every shared column except the key
ignore: [Staff]                  # subtracted from the default compare set
sum: [Duration]                  # columns that may match by group total
range: {column: Service Date, since: 1/08/2026, until: 31/08/2026}   # bound both tables first
```

A side's handle must be an absolute store path (a bare string is read as one); a
side without one is null. The tables are CSV; the first row is the header.

#### The verdicts

| status | mark | meaning |
|---|---|---|
| added | `+` green | in the left table only |
| deleted | `−` red | in the right table only |
| changed | `~` amber cells | key-matched, a compare column differs — read "right → left" |
| regrouped | `≈` sky | the same substance sliced differently — every `sum` column's totals agree and every other column carries one value |
| unchanged | `=` | key-matched and equal |

Keys may repeat (three sessions on one day): rows group by key and pair off in
order; the surplus on either side is added or deleted. Rows whose key cells are all
empty — a totals tail — are not rows. Date-shaped key values normalise to
`dd/mm/yyyy` before joining, so `4/08/2026` and `04/08/2026` are one session.

#### Where the engine lives

`packages/filekinds/src/lib/tableDiff.ts` — `parseTableDiff`, `diffTables`,
`columnTotals`, `diffToHtml`; its header comment is what `studio-check --spec
tablediff` prints. The CSV parser is `tableData.ts`. The view is
`components/tablediff/TableDiffView.tsx`; the checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

Both tables are read from the store and diffed; the grid and the counts are drawn.

### What is read, what is computed, and what is drawn

The parse, the read, the diff, the grid.

#### The parse and the read

`parseTableDiff` never throws. Without both sides: "Declare both sides: left:
{handle: …} and right: {handle: …}". "Reading both tables…" while both handles are
read and parsed as CSV; an unreadable one shows its error.

#### The diff

`diffTables`: no key → "declare at least one key column"; a key or range column
missing on a side → `left: key column "x" is missing`. The compare set is `compare`,
else every shared header except the key, less `ignore`. Each side's rows become
records (keys normalised, totals tails skipped, rows outside the `range` window
dropped — dates compare as dates), grouped by key. A group whose sides differ in row
count is first tried as REGROUPED: every `sum` column's totals equal and every other
compare column carrying one consistent value across both sides — else it falls back
to ordinary pairing. Pairs are compared cell by cell; the surplus is added or
deleted. Rows sort by key, dates as dates.

#### What is drawn

The title, a copy-handle button, "Hide unchanged" / "Show unchanged", "Export". The
description. The counts: `+ N only in <left label>`, `− N only in <right label>`,
`~ N changed`, `≈ N regrouped` (when any), `= N matching`, then `key: a + b`, the
range in words, and "changed cells read “<right> → <left>”". The grid: a status chip,
the key cells, then the compare cells — a changed cell amber as `old → new`, a
regrouped split sky as `l ↔ r` ("same total"), otherwise the value. Rows tinted by
status.

## Hide unchanged is clicked

*chosen · many*

The matching rows leave the grid; the counts stay.

The rows whose status is unchanged are filtered out of the grid; added, deleted, changed
and regrouped rows stay, and the counts strip is unchanged. "Show unchanged" brings them
back. State only; nothing is written.

## Export is clicked

*chosen · many*

A dated, self-contained HTML snapshot — saved beside the file when the host can write, and downloaded either way.

`diffToHtml` renders the diff as one HTML file with colours inlined, no scripts, no
dependencies: the title and description, the counts line, a totals line for every compare
column that is numeric on every row (`Duration: Timesheet 12 · Shift notes 11 · Δ 1`, a
regrouped cell's `1+1+1` summed), the table with the same marks and cell texts, and
"Snapshot generated <date> from the live lens — the sources may have moved since." It is
named `<stem>-snapshot-<date>.html`. With a writer it is saved in the file's folder and
"Snapshot saved: <handle>" shows; then, and in any host, it is downloaded. The button is
disabled until a diff exists without an error.

## The file changes on disk

*imposed · many*

The document re-parses and both tables are read again; the tables changing on their own is not watched.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. Any change to this document re-reads both tables
and re-diffs. A CSV edited while the diff sits open is not noticed until the document
changes or is reopened. The unchanged-rows toggle stays.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses and the tables are not read.

### What the checker does

The order it runs in, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseTableDiff` — it never throws. No summary line.

#### Not checked

That both sides are declared (the view says so). That the handles exist. That the
key columns exist in both tables (the diff says so). Whether `compare`, `ignore` and
`sum` name real columns.

## A table diff is written

*chosen*

### Write a table diff

Two handles and a key, then narrow the question.

#### Start from the template

`studio-check --template tablediff > new.tablediff`:

```yaml
title: "new"
description: "Two tables compared live: …"
left:  {handle: /proposed.csv, label: Proposed}
right: {handle: /base.csv, label: Base}
key: [Id]
# compare: [Amount]   # omitted = every shared column except the key
# ignore: [Notes]     # subtracted from the default compare set
```

#### Pick the key

The columns that identify one row on both sides. Repeated keys pair off in order,
so a stable secondary column helps.

#### Narrow the question

`compare` or `ignore` to keep the columns that matter; `sum` for columns where
three 1-hour rows should equal one 3-hour row; `range` to bound both tables to one
period.

#### Check it, then open it

`studio-check new.tablediff` — only YAML can fail. Open it; a missing key column is
reported by side. Export a snapshot for whoever does not have the suite.
