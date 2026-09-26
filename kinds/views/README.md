# How a views document works

<!-- Generated from kinds/views/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

One list of items in the file and the views over it — the views the file names, each over the items its filter keeps, or one of every kind the roles allow; a table, a kanban, a calendar, a gantt nested by parent, a dependency tree, and a page the view's own Nunjucks template renders; read only, nothing referenced, the open view kept for the session.

This is the `.views` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Always

*imposed*

What holds at every moment — the shape of the file, how the roles allow views and the file picks them, and where the engine lives.

### The shape of the file

The items are the data; the roles say what each key means; the views say how to look.

#### Top-level keys

| key | what it is |
|---|---|
| `title` | the heading |
| `description` | one line under it |
| `fields` | which item key plays which role — `id`, `title`, `status`, `start`, `end`, `previous`, `parent` |
| `columns` | the statuses in order, for the kanban; absent = the values found, first seen first |
| `views` | the views to offer, in order, each over the items its filter keeps; absent = one of every kind the roles allow |
| `items` | the list itself — mappings, each with an id |

```yaml
title: Launch
fields:
  id: id
  title: title
  status: status
  start: start
  end: end
  previous: after
  parent: under
columns: [To do, Doing, Done]
views:
  - key: open
    kind: kanban
    label: Open work
    filter: [{field: status, op: not_equals, value: Done}]
  - key: plan
    kind: gantt
items:
  - id: plan
    title: Plan the launch
    status: Done
    start: 2026-10-01
    end: 2026-10-03
  - id: build
    title: Build it
    status: Doing
    after: plan
  - id: api
    title: The API
    status: Doing
    start: 2026-10-04
    end: 2026-10-07
    under: build
```

An item's keys are its own — anything beside the roles is shown as it is. A date is
`YYYY-MM-DD`, bare or quoted. `previous` is one id or a list of ids, `parent` one id,
every one an item of this file. `id` and `title` default to keys of those names; an
item with no id is given `#N` so the rest still draws, and a second item with an id
already seen is dropped.

#### The roles allow views

| view | needs |
|---|---|
| Table | nothing — always allowed |
| Kanban | `status` |
| Calendar | `start` (`end` when there is one; a day otherwise) |
| Gantt | `start`, `end`, and `previous` or `parent` |
| Tree | `previous` |
| Page | nothing — but only a view the file names, with its `template`, is one |

A view whose roles the file does not name cannot be offered — there is no empty
kanban to click into.

#### The file picks its views

`views` is a list, each `key` (its identity), `kind` (`table`, `kanban`, `calendar`,
`gantt`, `tree`, `page`), an optional `label` (the button's text; the kind's name when absent),
and the table rules every kind shares: `filter` — clauses over the items' own keys,
`{field, op, value}` with the one vocabulary (`equals`, `not_equals`, `contains`,
`not_contains`, `starts_with`, `ends_with`, `matches`, `gt`, `gte`, `lt`, `lte`,
`between`, `in`, `not_in`, `is_empty`, `not_empty`, `is_true`, `is_false`; one value
or a list), every one of which must hold — `sort` (`{field, dir}`, first key first) and
`limit`. A filter hides items for that view only; an edge to a hidden item is dropped
for that view. Two views of one kind are two ways of looking — `open`, a kanban of
what is not Done; `mine`, a kanban of one owner's. Without `views`, one view of every
kind the roles allow is offered, the table first.

#### A page view

A view the file names with `kind: page` and a `template` of its own — Nunjucks, as a
`.page` writes it — and the `partials` its `include`, `import`, `from` and `extends`
name. The template is handed:

| variable | what it is |
|---|---|
| `items` | the view's items after its filter, sort and limit, each a mapping of its own keys as written — a date as `YYYY-MM-DD` |
| `title` | the document's title |
| `fields` | the role → key map, defaults filled — `item[fields.title]` is an item's label whatever its key |
| `columns` | the kanban's columns: the file's, else the statuses found |
| `view` | the view's `key` and `label` |

```yaml
views:
  - key: report
    kind: page
    label: Open work
    filter: [{field: status, op: not_equals, value: Done}]
    partials:
      row: <tr><td>{{ item.title }}</td><td>{{ item.status }}</td></tr>
    template: |
      <h1>{{ title }} — {{ view.label }}</h1>
      <table>{% for item in items %}{% include "row" %}{% endfor %}</table>
```

The template, the partials and the items are all in the file, so the page is as
computable from the text as every other view.

#### Parents and what comes before

Two different edges. `previous` is order — what has to be done before this — and it
is what the tree and the gantt's arrows draw. `parent` is composition — the item this
one is part of — and it is what the gantt nests by: a child sits indented under its
parent, and a parent with no dates of its own is drawn as a thin bar over its children's
span. An item can have both: a child that comes after its sibling.

#### Why one file, read only

The items, the roles and the views are in the file, so any view is computable from the
text alone: paste it, check it, render it with nothing else on disk. The views read the
items and write nothing — the file is edited as text, and every view follows on the
next read — and which view is open is the page's for the session, never saved.

#### Where the engine lives

`python/studio_kinds/kinds/views.py` — `parse`, `read_fields`, `view_offered`,
`available_views`, `rows_of_view`, `columns_of`, `layers`, `parent_cycle`, `problems`,
`summary`, with the clauses, the sort and the limit in `_rows.py` (`read_table_rules`,
`apply_table`); its header comment is what `studio-check --spec views` prints. The
shape is `kinds/views/v1.schema.json` and the field table `v1.fields.yaml`. The view is
`components/views/ViewsView.tsx` over `lib/viewsDoc.ts` — the table, the kanban, the
calendar on the month grid the journey and the `.calendar` kind share, the gantt and
the tree in `panes.tsx` — with `ItemDialog.tsx`; the rules are `tablePolicy.ts`. A page
view's model is `pageOfView` in `viewsDoc.ts`, and it renders in
`components/page/PageFrame.tsx`, the sandboxed frame a `.page` renders in; its template
and partials are checked by `template_problems` in `python/studio_kinds/kinds/page.py`.

## The file is opened

*imposed*

parseViews reads the YAML once and never throws; the views are offered; the first opens.

### What is parsed and drawn

The parse, the derived facts, and the page.

#### The parse

The title, the description, the roles (defaults for `id` and `title`), the columns
when the file has them, the views when it names them — a view without a key or a
kind, with a key already seen, a kind that is not one of the six, or a kind whose
roles are not named is left out, and a page view keeps its template (empty when
absent) and its partials that are text — and every item: its id (a string, or a whole number
as text), its label (the title key, else the id), its status, its start and end when
they are dates, what it comes after and what it is part of — only ids that are items
here, the item itself excluded — and all of its fields as written.

#### Derived

The kanban's columns: the file's, else every status found, first seen first. Each
view's items: its filter, sort and limit over the items' own fields. The dependency
depth of every item by longest chain of `previous` (Kahn's order; items in a cycle have
none). The gantt's rows: nested by `parent`, a parent without dates spanning its
children, and the day range from the earliest start to the latest end. Nothing derived
is written down.

#### What is drawn

The title and the description, and a row of view buttons — the file's views by their
labels, else Table, Kanban, Calendar, Gantt, Tree as the roles allow — the open one
filled, each titled with its kind and what its rules do ("2 filters · sorted by start
asc"). The first opens. At the right of the row, `N items`, or `N of M items` when the
view's filter hides some, and the rules in words. Under the buttons, the view — a page
view filling what is left of the pane.

## A view button is clicked

*chosen · many*

The pane shows the view's items that way; nothing is written; the choice lasts the session.

### The six kinds of view

One pane, six ways to lay the same items out — each over the items the view keeps.

#### Table

Every key any item carries, first seen first, as columns — the id and the label first
— and one row per item in the view's order. A cell shows text as it is, a date as
`YYYY-MM-DD`, a list joined by `, `, a mapping as JSON. A row opens the item.

#### Kanban

The columns across, each with its count; under each, a card per item whose status
matches it (case-insensitive), in the view's order; an item with no status, or a
status no column spells, lands in the first column. A card shows the label and, when
the roles allow, the dates and "⇠ N" for what it comes after. A card opens the item.

#### Calendar

A month grid, weeks Monday to Sunday, with ‹ and › to move a month, "Today" and
"First item" to jump; it opens on the month of the earliest start. A chip on every day
an item covers (start to end, or the start day alone), coloured by its column when the
file has a status, titled "<label> · <start> → <end>". Items with no start date are
listed under the grid. A chip opens the item.

#### Gantt

One row per item with dates — its own, or its children's for a parent without — nested
by `parent`: a child indented under its parent, siblings in dependency order (depth,
then start, then the file's order). A day scale across the top — every day, the month
named where it begins — and a bar per row from its start to its end, coloured by its
column, the label on the left; a parent without dates gets a thin bar over its
children's span. An arrow from the end of every `previous` item to the start of the one
that comes after it. Items with no dates anywhere are listed under the chart. A bar
opens the item.

#### Tree

What comes first at the top: every item that names no previous is a root; under each,
the items that come after it, indented, and so on. An item that comes after two things
appears under each, marked "also after <the other>". Items caught in a cycle are listed
under the tree, since they have no root. A node opens the item.

#### Page

The view's template rendered with its model — the view's items, the title, the fields,
the columns and the view — in the sandboxed frame a `.page` renders in: scripts
allowed, the host's origin withheld, filling the pane under the buttons, white until
the page paints a background of its own. A template the engine refuses shows its
message in the frame's place, "The page did not render", until the text renders. What
the page draws is the template's; nothing in it opens the item dialog.

## An item is clicked

*chosen · many*

The item dialog — every field as written, and every edge as a jump.

The label, then a line of facts: the status as a chip, the dates as `start → end`, "after"
with one chip per previous item, "followed by" with one per item that comes after, "part of"
with the parent, "made of" with the children — a click JUMPS the dialog to that item, whether
or not the open view shows it. Then every field of the item, as written, in a two-column list
— the id with a copy button. The dialog stays on its id across a re-read and closes if the id
is gone.

## The file changes on disk

*imposed · many*

The host re-reads; the open view redraws from the new text; the open item stays if its id survived.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. Everything drawn is in the text — the items, the roles,
the views, the columns — so the open view redraws at once; a view the new text no longer
offers falls back to the first.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses, so the checker names everything it silently dropped or defaulted.

### What the checker does

The order it runs in, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `problems`: not a mapping; no `title`; `fields` that is not a mapping, a role that
   is not one of the seven, a role mapped to something that is not a key name;
   `columns` that is not a list, an entry that is not text, or columns without a
   `status` role; `views` that is not a list, a view that is not a mapping, without a
   `key` or a `kind`, a key twice, a kind that is not one of the six, a kind whose
   roles are not named ("view open: a kanban needs a `status` role under `fields`"),
   a page view with no `template`, one not text or blank, `partials` that are not a
   mapping or a partial that is not text, a template naming a partial the view does
   not hold ("view report: template: `include "row"` names no partial of this view
   — write it under `partials`"), a `template` or `partials` on a view that is not a
   page, and its rules' own problems — a clause with no field or no op, an unknown op, a
   sort direction that is not asc or desc, a limit that is not positive; no `items`
   (`items: []` is an empty list and passes); an item that is not a mapping or has no
   id; an id used twice; a label that is not text; a status that is not text, or not a
   column when columns are given; a start or end that is not a date; an end before its
   start; a `previous` that is not an id or a list of ids, an empty entry, the item
   itself, or an id no item has; a `parent` that is not an id, the item itself, or an
   id no item has; a cycle of `previous`; a cycle of `parent`. Each is one line,
   naming the view or the item.
3. The summary line: `ok <name>  Views  12 items · table, kanban (3 columns), calendar,
   gantt, tree` when the roles decide, or `12 items · views: open (kanban, 3 columns)
   4, plan (gantt)` when the file names its views — a count after a view that hides
   some — so a misspelled role or a filter that hides everything is visible at once.

#### Not checked

Whether an item's dates overlap its previous item's — the gantt shows it. Whether every
item has a status, a start, a previous or a parent — an item without lands in the first
column, under the grid, at a root, or at the top. Whether a filter names a key any item
carries — a clause over nothing hides everything, and the summary's count says so. The
checker sees the file alone, which is all there is.

## A views document is written

*chosen*

### Write a views document

The items, the roles that allow views, the views that pick them.

#### Start from the template

`studio-check --template views > new.views` — five items with every role named and
five views, one of each kind, the kanban filtered to what is not Done; replace them.

#### Write the items with ids

One mapping per item, the id key first, then whatever the item is — a name, a
status, dates, an owner, a note. Keep ids stable: `previous` and `parent` point at them.

#### Say which keys play which role

Under `fields`, only the roles the items really carry: `status` for a kanban, `start`
(and `end`) for a calendar, `previous` for a tree, the dates with `previous` or
`parent` for a gantt, `parent` to nest items in the gantt. A role not named is a view
that cannot be offered — the right answer for items that have no dates.

#### Pick the views

Under `views`, one entry per way of looking: a `key`, a `kind`, a `label`, and a
`filter` for what that view leaves out — `[{field: status, op: not_equals, value:
Done}]` for the open work — with a `sort` and a `limit` where they help. A page is
`kind: page` with a `template` over `items` — `{% for item in items %}` and the items'
own keys — and the `partials` it includes. Leave `views` out to get one of every kind
the roles allow.

#### Order the columns

`columns` lists the statuses in the order the kanban shows them; leave it out and the
values found are the columns, first seen first.

#### Check it

`studio-check new.views` — an id used twice, a `previous` or `parent` to no item, a date
that is not one, a status that is no column, a view whose roles are missing, a clause
with an op outside the vocabulary, a cycle: each is a line naming the view or the item,
and the summary names the views the file offers with what each hides.
