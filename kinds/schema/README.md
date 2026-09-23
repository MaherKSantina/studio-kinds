# How a version-1 schema works

<!-- Generated from kinds/schema/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

The shape half of a structured node — entries with stable ids, drawn by their type — and what happens when it is joined with its content half inside a .node folder.

This is the `.schema` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Where is it open?** (`where`)

- `alone` — The file on its own. The schema view — the shape, entry by entry, with the ids beside the labels.
- `node` — As half of a `<name>.node` folder. The structured node view — three faces, the first being the join of shape and content.

## Always

*imposed*

What holds at every moment — the shape of the file, why ids are the contract, what a structured node is, and where the engine lives.

### The shape of the file

*A type, a title, and entries whose ids never change.*

#### Top-level keys

| key | what it is |
|---|---|
| `type` | which view draws it — `kanban`, `composite`, or anything (unknown types render generically) |
| `title` | the heading; "Schema" when absent |
| `field` | the content field carrying the reference; default by type: kanban → `column`, composite → `stream`, else `ref` |
| `display` | a presentation hint; `compact` strips a composite board to labels and folded values |
| `entries` | the slots; `columns:` (kanban) and `streams:` (composite) are the type's aliases |

#### An entry

```yaml
type: kanban
title: Job applications
columns:
  - {id: triage, label: Triage, detail: "being analyzed"}
  - {id: applied, label: Applied}
```

`id` is required — an entry without one cannot be referenced and is dropped; `label`
defaults to the id. A composite entry adds `driver` (`observed`, `derived`,
`authored` — who authors the stream's changes), `source` (prose), `via` (the file
that produces or owns it), `of` (the stream a derived one reads), and `cadence`
(`daily`, `weekly`, `monthly`, `<n>d`).

Content rows then carry `column: triage` — the ID, never the label. Relabel an entry
freely; renaming its id orphans every content row referencing it.

#### A structured node

On disk, a `<name>.node` folder with two halves: a file whose stem is `schema`
(this kind) and one whose stem is `content` (a `.list`, usually), any extension. The
tree reads the folder as one document; a half missing is an explicit gap, never a
crash. The split is the point: any node can be broken into shape and data this way,
and each half stays an ordinary file other tools already understand.

#### Where the engine lives

`packages/filekinds/src/lib/schemaDoc.ts` — `parseSchemaDoc`, `contentByEntry`,
`splitHalvesOf`; its header comment is what `studio-check --spec schema` prints. The
composite fold and the `stream-status` table are `compositeDoc.ts`
(`compositeStreams`, `cadenceDays`, `flattenStreamFields`). The views are
`components/schema/SchemaView.tsx`, `components/SplitNodeView.tsx` and
`components/composite/CompositeBoard.tsx`; the checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## It is opened

*imposed*

parseSchemaDoc reads the YAML once and never throws; what is drawn depends on where the file was opened from.

> Say where it is open — the file alone shows the shape; the node folder joins it with its content.

### When `where=alone`

**The parse.** `type` lower-cased, the title, `field` (given, else the type's default),
`display` lower-cased, and the entries from `entries`, `columns` or `streams` — an entry
without an `id` dropped, every optional key kept only when a string.

**What is drawn.** The title and `<type> schema · N entries · content references ids
via <field>:`. A kanban schema reads as the column pipeline: one card per entry with
its label, its id in a monospace chip ("The stable id — content references this, never
the label") and its detail, arrows between them; "No columns yet." when empty. A
composite schema shows one card per stream with a driver badge (sky for observed,
violet for derived, emerald for authored, "no driver" otherwise), the id, the detail,
`source · x · cadence`, `via …` and `reads <of>`; "No streams yet." Any other type: "No
dedicated view for type “x” yet — the shape is still the contract." over generic cards.
Under it all: "Ids are stable: relabel an entry freely — renaming its id orphans every
content row referencing it."

### When `where=node`

**The read.** The folder is listed and its halves found by stem (`schema.*`,
`content.*`); the schema is parsed, the content read, and a `.list` content's rows
collated. "The host has not configured a file lister." when the host cannot list.

**The faces.** A strip names the node, `structured node · <type>`, and three pills:
Structured, Schema, Content. Schema and Content render each half through its own kind's
preview; a missing half reads "This node has no schema half yet — add a file named
“schema.<kind>” inside <name>.node." Structured is the join: `contentByEntry` files each
row under the entry whose id its `<field>` names, in schema order; a row naming no id,
or an unknown one, lands in an amber "Unfiled · N" column ("fix the row or add the id to
the schema") — visible, never dropped. A kanban schema draws a board, one column per
entry with its label, count and id, cards showing the row's label and a sub-line
(`#rank · company`); a composite schema draws the composite board; any other type lists
the join generically. A content half that is not a list: "no structured join for that
kind yet; use the Content face."

## A card is clicked

*chosen · many* — only when `where=node`

The row's document, or its fields, in a dialog.

A row backed by a `file` opens that document, rendered by its kind, resolved against the
content half's path. A plain row opens its fields — every non-empty one with its key,
links clickable — and an "Open listing" button when it carries a `url`. Nothing here
writes.

## A composite node is composed

*imposed · many* — only when `where=node`

Every stream's arrivals fold to a current picture, and the stream-status table judges its freshness by who holds the pen.

### The fold, and the golden table

*One entity assembled from streams, each judged by its driver.*

#### The fold

The content rows are arrivals — each one diff, tagged `stream: <id>` and `at:
<date>`, its payload in the remaining fields. Per stream, the rows fold in file
order, later arrivals winning field by field (`at`, `of` and `rules` are about the
arrival, not the picture); the newest `at` is the stream's last arrival and its age
in whole days is measured against today.

#### The stream-status table

| rule | when | status |
|---|---|---|
| empty | no rows | `empty` (quiet) |
| authored-current | driver `authored` | `current` — the primary record cannot drift |
| derived-input-moved | driver `derived`, and the `of` stream arrived newer | `input moved` (bad) — re-run the rules |
| derived-fresh | driver `derived` | `fresh` — stales by input or rules, never by clock |
| observed-untimed | driver `observed`, no cadence or no dated arrival | `untimed` (warn) — declare `cadence:` |
| observed-fresh | within one cadence | `fresh` |
| observed-aging | within two cadences | `aging` (warn) — a sync was missed |
| observed-stale | driver `observed` | `stale` (bad) — treat as historical |
| otherwise | no driver | `untracked` — staleness has no semantics |

The board shows each stream as a column: the driver badge, `source`/`via`, the status
chip (hover for the because), the folded picture, and the arrival history under it.
`display: compact` keeps only the label, the folded key/values and the driver's
coloured rail.

#### Slices as fields

`flattenStreamFields` turns the fold into clause-ready fields — `<stream>.<field>`
per current value, `<stream>._status` and `<stream>._age_days` — so a memory can
select and group on slice data beside a node's own facts.

## Another kind reads structured nodes

*imposed · many*

The join is data to a board and to a memory.

- A `.kanban` with `source:` pointing at a FOLDER reads every `<name>.node` inside it
  whose schema is `type: composite`: the streams fold to a current picture and `title`,
  `status`, `description` and `note` become one task keyed by the folder name.
- A memory's index marks a structured node `structured: yes`, and a moves log classes it
  as `node` — the coarsest structure factor in the pressure context.
- A project's directory mode opens a `.node` folder in the node browser.

## A half changes on disk

*imposed · many*

The schema file re-parses on its own; the node view re-reads both halves when its path changes or it reopens.

Open alone, the file follows the host's re-read (the desktop watcher's 250 ms debounce
and `studio:fs-changed`, the web folder's events, VS Code's text document; the Studio
skips it while its autosave is dirty, saving or in error) and the view re-parses. The
node view reads its halves once per path: a schema or content edited while the node sits
open shows on the next open. The face pill stays.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses.

### What the checker does

*The order it runs in, and what it leaves alone.*

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseSchemaDoc` — it never throws. No summary line.

#### Not checked

Two entries with one id (the second silently shares the column). A `field` no
content row carries (every row is unfiled). A type nobody draws (rendered
generically). Whether the content half exists — only the node view says so.

## A schema is written

*chosen*

### Write a schema

*From the template to a node folder that joins.*

#### Make the node folder

A folder named `<name>.node`. Two files go in it, by stem: `schema.schema` and
`content.list`.

#### Start the schema from the template

`studio-check --template schema > schema.schema`:

```yaml
type: kanban
title: "schema"
columns:
  - {id: triage, label: Triage, detail: "being analyzed"}
  - {id: doing, label: Doing}
  - {id: done, label: Done}
```

#### Choose ids you will never rename

Short, lower-case, stable. The label is free to change; the id is what every content
row writes.

#### Write the content rows against the ids

In `content.list`, each row carries `column: <id>` (or the schema's `field`). A row
with a wrong id lands in Unfiled, where the node view shows it.

#### Check it, then open the folder

`studio-check schema.schema` — only YAML can fail. Open the `.node` folder: the
Structured face is the join.
