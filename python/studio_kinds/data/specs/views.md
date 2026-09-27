# .views — Views

## The engine's account

The check is `python/studio_kinds/kinds/views.py` in the studio-kinds repository; the account below is that engine's own.

The `.views` file kind: one list of items in the file and the views over it.
`items` are mappings, each with an id; `fields` says which item key plays
which ROLE — `id`, `title`, `status`, `start`, `end`, `previous`, `parent` —
and `views` says which views the file offers, each over the items its own
`filter` keeps. Without `views`, the roles decide: a table always; a kanban
when a key is the `status`; a calendar when a key is the `start` (the `end`
too, when there is one); a gantt when `start`, `end` and `previous` or
`parent` are named; a sequence — the gantt's rows on steps of what comes
after what, not days — when `previous` or `parent` is; a dependency tree
when `previous` is. A page is a view
the file names with a Nunjucks `template` of its own: it renders the view's
items as HTML, the way a `.page` renders its model, and the roles never
offer one. The views are read: nothing on the page writes the file, and
which view is open is kept for the session only.

Authoring shape (YAML, lenient — a half-written file still renders):

  title: Launch
  description: one line
  fields:                # item key → role; a role absent means the views that need it are absent
    id: id               # what identifies an item (default `id`)
    title: title         # what an item is labelled by (default `title`)
    status: status       # a kanban column                     → Kanban
    start: start         # a date, YYYY-MM-DD                  → Calendar; with `end` and `previous` or `parent`, Gantt
    end: end             # a date
    previous: after      # the id(s) of what comes before      → Tree, Sequence; with the dates, Gantt
    parent: under        # the id of the item this one is part of → Sequence; nested under it there and in the gantt
  columns: [To do, Doing, Done]   # the statuses in order; absent = the values found, first seen first
  views:                 # optional — absent = every view the roles allow, the table first
    - key: open
      kind: kanban       # table | kanban | calendar | gantt | sequence | tree | page
      label: Open work
      filter: [{field: status, op: not_equals, value: Done}]   # the suite's clause vocabulary
      sort: [{field: start, dir: asc}]
      group: owner       # a kanban's LANES: the values this item key takes, first seen first
    - key: plan
      kind: gantt
    - key: steps
      kind: sequence     # the gantt's rows on steps of what comes after what — no dates
      group: owner       # a gantt's or a sequence's GROUPS: a row per value over the top rows carrying it
    - key: report
      kind: page         # the view's items through a Nunjucks template of its own
      template: |
        {% for item in items %}<p>{{ item.title }} — {{ item.status }}</p>{% endfor %}
  items:
    - id: plan
      title: Plan the launch
      status: Done
      start: 2026-10-01
      end: 2026-10-03
      owner: Ana
      content:             # a document written into the item — its dialog draws it by its kind
        kind: md
        doc: |
          Scope, owners and the date.
    - id: build
      title: Build it
      status: Doing
      start: 2026-10-04
      end: 2026-10-10
      owner: Bo
      after: plan          # one id, or a list
    - id: build-api
      title: The API
      status: Doing
      start: 2026-10-04
      end: 2026-10-07
      under: build         # a child of `build`

A date is `YYYY-MM-DD`, bare or quoted. `previous` is one id or a list of
ids, `parent` one id, every one an item of this file. A view's `filter` is
clauses over the items' own keys (`equals`, `not_equals`, `contains`,
`not_contains`, `starts_with`, `ends_with`, `matches`, `gt`, `gte`, `lt`,
`lte`, `between`, `in`, `not_in`, `is_empty`, `not_empty`, `is_true`,
`is_false` — one value or a list); `sort` is `{field, dir}`, first key first;
`limit` caps the rows. A KANBAN view may also name a `group`: an item key
whose values become the board's LANES — rows of the board, the status
columns running across each, in the order the values are first seen among
that view's items, and a last lane for the items carrying no value for that
key. Lanes are derived from the items, never listed: a lane is a value that
is there. A GANTT or a SEQUENCE may name a `group` too: its top rows gathered
under a row per value, in the same order, and a last row for those carrying
none — each row spanning its rows and folding them away as a parent does, a
part staying under its whole whatever it carries. A SEQUENCE lays the gantt's rows on steps instead of days: an item
stands one step past everything it comes after, and no earlier than its
parent may start; an item takes one step and a parent spans its parts, so
what a whole comes after holds for every part and what comes after a whole
comes after all of them. Every other key an item carries is shown as it is —
in the table's columns and in the item's dialog — but `content`: an item that
holds more than its line shows writes that document into itself, `content:
{kind, doc}`, the shape a brief's section and a kanban's task carry; the
item's dialog draws it by its own kind, and the table names its kind. A page
view's template is handed `items` — the view's items after its filter, sort and limit, each a
mapping of its own keys as written, a date as `YYYY-MM-DD` — with `title`
(the document's), `fields` (the role → key map, defaults filled), `columns`
(the kanban's) and `view` (its `key` and `label`); its `partials` are the
templates its `include`, `import`, `from` and `extends` name.

The CHECKER names what the lenient reader dropped or defaulted: not a
mapping, no `title`, `fields` that is not a mapping, a role that is not one
of the seven or mapped to something that is not a key name, `columns` that
is not a list of text, `views` that is not a list, a view without a key or a
kind, a key used twice, a kind that is not one of the seven or whose roles
are not named, a page view whose `template` is missing, not text or blank,
whose `partials` are not a mapping of text, or whose templates name a
partial it does not hold, a `template` or `partials` on a view that is not a
page, a `group` on a view that is not a kanban, a gantt or a sequence, one
that is not an item key name, or one no item carries, a clause without a field or with an op outside the vocabulary, `items` that is not a list, an item that is not a mapping or has
no id, an id used twice, a status that is not a column when columns are
given, a start or end that is not a date, an end before its start, a
`previous` that is not an id or a list of ids, a `parent` that is not an id,
one naming no item or the item itself, items caught in a cycle, a part and
its whole out of order — a part after its own whole or after what comes
after it, a whole after its own part, which no step can hold — and what an
item's `content` cannot be — not a mapping, no `kind` or `doc`, an `md`
document that is not text, `by`, `docs` or `file` on it. Each written
document is then run through its own kind's engine, so a broken brief inside
an item is a broken views document.

## A fresh document (what the Studio creates)

```yaml
title: "untitled"
description: "One list of items; `fields` says which key plays which role, `views` which views to offer and what each keeps."
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
  - key: all
    kind: table
  - key: open
    kind: kanban
    label: Open work
    filter: [{field: status, op: not_equals, value: Done}]
  - key: month
    kind: calendar
  - key: plan
    kind: gantt
  - key: steps
    kind: sequence
  - key: chain
    kind: tree
items:
  - id: first
    title: The first thing
    status: Done
    start: 2026-12-01
    end: 2026-12-03
  - id: second
    title: What follows it
    status: Doing
    start: 2026-12-04
    end: 2026-12-10
    after: first
  - id: second-a
    title: Its first half
    status: Done
    start: 2026-12-04
    end: 2026-12-06
    under: second
  - id: second-b
    title: Its second half
    status: Doing
    start: 2026-12-07
    end: 2026-12-10
    under: second
    after: second-a
  - id: third
    title: And then this
    status: To do
    start: 2026-12-11
    end: 2026-12-12
    after: [second]
```
