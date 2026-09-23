# How a collection works

<!-- Generated from kinds/collection/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

A snapshot of a view's rows to decide over one at a time — how it is made, how a decision is logged and the order derived from the log, what an edit to a fact is instead, and where the file is written.

This is the `.collection` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**How does the host save?** (`persist`) — Every decision and edit is written at once; only the path to the disk differs.

- `autosave` — Through the host's autosave. The Studio, the desktop app, VS Code — the view hands the new text to `onChange` and the host's autosave writes it.
- `writer` — Straight through the writer. A host with no `onChange` — a dialog, a pane — writes the file through the configured writer itself.

## Always

*imposed*

What holds at every moment — the shape of the file, why the decisions are a log, and where the engine lives.

### The shape of the file

Copied rows, and a log of what was decided about them.

#### Top-level keys

| key | what it is |
|---|---|
| `to` | where directions go (the view asks once) |
| `fields` | the facts shown for each item, in order; dot paths allowed |
| `stats` | the fields shown as the big cards |
| `labels` | header names, by field |
| `items` | the rows copied in, each with an `id` given at copy time; `featured` names the picture that stands for it |
| `decisions` | the log, in the order taken |

#### A decision

```yaml
decisions:
  - {item: 3, op: down, reason: "56 km from town"}
  - {item: 7, op: hide, reason: "shared bathroom"}
  - {item: 12, op: up, reason: "on the water"}
  - {item: 7, op: show}              # a hide taken back
```

`op` is `up`, `down`, `hide` or `show`; `reason` is required for the first three.
The log is never applied to the items: the order shown is DERIVED — an item's rank is
its ups minus its downs, items sort by rank descending with ties in copied order, and
an item whose last hide/show is a hide is hidden (kept in the file, shown on request).
A later step reads the reasons to write the rules that produce the same order.

#### Why the snapshot

The rows are COPIED in with the view's fields and labels, so the collection stands
still while whatever it was copied from moves on. A fact edited here —
a commute time looked up, a picture chosen as `featured` — changes the item itself,
with no decision and no reason: a decision is about the item's standing, an edit is
about what is known of it.

#### Where the engine lives

`packages/filekinds/src/lib/collectionDoc.ts` — `parseCollection`, `dumpCollection`,
`collectionFromRows`, `defaultStats`, `itemStates`, `orderedItems`,
`collectionSummary`, `originOf`, `parseFieldInput`, `setItemField`, `featuredOf`; its
header comment is what `studio-check --spec collection` prints. The view is
`components/collection/CollectionView.tsx` (`imagesOf`, `linkOf`), which borrows the
data view's cells; the checker is `python/studio_kinds/kinds/collection.py`.

## A view is collected

*chosen*

The rows a table shows are COPIED into a new .collection — from the Collect button or from the command line.

**From the view.** "Collect" on a `.jsonl` view asks for a name and writes
`<name>.collection` beside the view, then opens it. **From the command line**,
`studio-check --collect x.jsonl [name.collection]` writes `x.collection` (or the name
given) beside the view.

Both take the rows the table SHOWS — copied in, so the collection holds them and
nothing points back — with
`fields` the columns shown (else the first row's keys), `labels` the table's
`$labels`, `stats` the fields numeric in some row followed by the first field that is a
link, and every row copied whole with `id` 1, 2, 3… in the order shown. `decisions` starts
empty. Nothing in the view is changed.

## The file is opened

*imposed*

parseCollection reads the YAML once and never throws; the order is derived from the log and the first item is shown.

### What the parser keeps, and what is drawn

A lenient parse with a problem list, then the flow or the gallery.

#### The parse

A YAML error is the first problem. Every item gets its `id` (the number written, else
its position from 1); `item N: id X is already used` when two share one. Every
decision is checked: `decision N: no item`, `unknown op "x"` (the decision is
dropped), `item X is not in the collection`, `no reason` unless the op is `show`.
`labels` keeps only non-empty strings. Then `orderedItems` derives the order from the
log, hidden items out unless asked.

#### The strip

The file's name; Flow / Gallery; `N shown · N up · N down · N hidden`, and `N
without a reason` in amber when any; "show hidden"; the `to` field for directions;
Undo (the last decision); in the flow, previous and next around `i / N`. Problems show
under it, the first three.

#### The flow

A rail on the left lists the whole order — a badge (`▲2`, `▼1`, `hid`, or the
position), the featured picture, the title and two facts — and a click jumps. The
item: its pictures (`images`, `photos` or `pictures` lists, else `image` or `photo`)
to flip through with a counter and a star that makes the shown one `featured`; a
thumbnail strip when there are several; the stats as big cards (a number editable in
place, a link opening its site); the title (`name`, else the first field); the other
facts as a list (links with a copy button, values editable); Directions and Open
listing (the first shown field that is a link, else any link one level down); the
reason field with Up, Down and Hide — Restore in place of Hide on a hidden item — and
the item's own decisions under it, each reason editable, an empty one bordered amber.
"No items." or "Every item is hidden." when there is nothing to show.

#### The gallery

Every item as a card — the featured picture with the badge, the title, the compact
stats, and the same reason field and buttons. Clicking the picture or the title
opens that item in the flow.

## A decision is taken

*chosen · many*

One line is appended to the log and the file is written at once; the position stays, so the next item takes the place of the one decided.

> Say how the host saves — the log is written either way; only the path to the disk differs.

### When `persist=autosave`

Up, Down, Hide or Restore (keys `u`, `d`, `h` outside an input, in the flow) appends
`{item, op, reason}` — the reason trimmed, left out when empty — to the log, clears the
reason field, and re-derives the order: a pushed-down item drops below, a hidden one
leaves, and the position stays so the next item is now in view. Undo removes the last
decision; a reason typed into the log rewrites that decision; the `to` field rewrites
`to`.

Each of these regenerates the whole file with `dumpCollection` (comments do not
survive) and hands it to the host's `onChange`; the host's autosave writes it after an
800 ms debounce, retries after an error, and the new text comes back as content. The
Studio, the desktop app and VS Code all persist what the preview offers this way, with
no authoring editor in the loop.

### When `persist=writer`

Up, Down, Hide or Restore (keys `u`, `d`, `h` outside an input, in the flow) appends
`{item, op, reason}` — the reason trimmed, left out when empty — to the log, clears the
reason field, and re-derives the order: a pushed-down item drops below, a hidden one
leaves, and the position stays so the next item is now in view. Undo removes the last
decision; a reason typed into the log rewrites that decision; the `to` field rewrites
`to`.

With no `onChange` from the host, each of these regenerates the whole file with
`dumpCollection` (comments do not survive) and writes it straight through the configured
writer to the file's path, at once. A host with neither writes nothing, and the change
lives only in the view until it closes.

## A fact is edited in place

*chosen · many*

The item changes; the log does not.

Clicking a stat or a fact turns it into an input; Enter or blur saves, Escape leaves it.
The text is read back by `parseFieldInput`: empty removes the field; `true`/`false` where
the field was a boolean or the text is one; a number where the field was a number, or the
text is one and the field was not text; anything else the text. A dot path sets the value
inside the nested object, copying along the way. The star (or `f`) sets `featured` to the
picture shown, and again clears it. `setItemField` copies the one item and the file is
written the same way a decision is — with no decision and no reason.

## Directions is clicked

*chosen · many*

A map from the item to the collection's destination, in a dialog.

The origin is the item's `lat,lng` when it has both, else its `address`, else its `name`
and `location`; the destination is `to`. A Google Maps embed draws the drive, with "Open
in Google Maps" and "Open listing" under it; the listing's link is shown with a copy
button. Without a `to`: "Type the destination in the `to` field above first."

## The file changes on disk

*imposed · many*

The host re-reads; the view's draft is replaced and the order re-derived; the position stays.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error — so the view's own saves come back as content and
match. The draft is replaced by the parse, the order re-derived, and the position and mode
stay; a decision logged elsewhere shows in the item's list.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser's problem list is the verdict.

### What the checker does

The order it runs in, the summary line, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseCollection` — duplicate ids; decisions with no item, an unknown op, an item
   not in the collection, or no reason.

#### The summary line

`N items · N shown, N up, N down, N hidden · N decisions`, on the command line and on
the page alike.

#### Not checked

That the `fields` and `stats` name keys the items carry (a
missing one shows as "—"). That `featured` is one of the item's pictures (it is
ignored, and the first picture stands in).

## A collection is made and worked

*chosen*

### Work a collection

From a table to a log of reasons — then the rules that reproduce the order.

#### Get the view right first

The table's columns and labels are what the copy takes. A field
missing from the view is missing from every item.

#### Collect it

"Collect" on the table, or `studio-check --collect x.jsonl`. The template
(`studio-check --template collection`) is only the shape — `to`,
`fields`, empty `items` and `decisions` — for a collection made by hand.

#### Set the destination

Type the place in the `to` field once; it is written to the file and Directions works
from then on.

#### Decide, with reasons

One item at a time in the flow: a reason, then Up, Down or Hide. A reason is what the
next step reads; the count of decisions without one sits in the strip in amber.

#### Write the rules from the reasons

Read the log's reasons and write the ranking, or the pipeline stages, that produce the same
order over the live view — the collection stays as the record of why.
