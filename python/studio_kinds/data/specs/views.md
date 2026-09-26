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
`parent` are named; a dependency tree when `previous` is. A page is a view
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
    previous: after      # the id(s) of what comes before      → Tree; with the dates, Gantt
    parent: under        # the id of the item this one is part of — the gantt nests it there
  columns: [To do, Doing, Done]   # the statuses in order; absent = the values found, first seen first
  views:                 # optional — absent = every view the roles allow, the table first
    - key: open
      kind: kanban       # table | kanban | calendar | gantt | tree | page
      label: Open work
      filter: [{field: status, op: not_equals, value: Done}]   # the suite's clause vocabulary
      sort: [{field: start, dir: asc}]
    - key: plan
      kind: gantt
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
    - id: build
      title: Build it
      status: Doing
      start: 2026-10-04
      end: 2026-10-10
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
`limit` caps the rows. Every other key an item carries is shown as it is —
in the table's columns and in the item's dialog. A page view's template is
handed `items` — the view's items after its filter, sort and limit, each a
mapping of its own keys as written, a date as `YYYY-MM-DD` — with `title`
(the document's), `fields` (the role → key map, defaults filled), `columns`
(the kanban's) and `view` (its `key` and `label`); its `partials` are the
templates its `include`, `import`, `from` and `extends` name.

The CHECKER names what the lenient reader dropped or defaulted: not a
mapping, no `title`, `fields` that is not a mapping, a role that is not one
of the seven or mapped to something that is not a key name, `columns` that
is not a list of text, `views` that is not a list, a view without a key or a
kind, a key used twice, a kind that is not one of the six or whose roles
are not named, a page view whose `template` is missing, not text or blank,
whose `partials` are not a mapping of text, or whose templates name a
partial it does not hold, a `template` or `partials` on a view that is not a
page, a clause without a field or with an op outside the vocabulary, `items` that is not a list, an item that is not a mapping or has
no id, an id used twice, a status that is not a column when columns are
given, a start or end that is not a date, an end before its start, a
`previous` that is not an id or a list of ids, a `parent` that is not an id,
one naming no item or the item itself, and items caught in a cycle.

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
