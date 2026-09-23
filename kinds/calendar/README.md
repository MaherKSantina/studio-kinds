# How a calendar works

<!-- Generated from kinds/calendar/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

Dated work on a month grid — the tasks, their edges and durations, and the day everything must be done by; every date drawn is derived from those, on every open, and none is written down.

This is the `.calendar` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Always

*imposed*

What holds at every moment — the shape of the file, why no date is authored, and where the engine lives.

### The shape of the file

*Tasks and a due date are authored; every date shown is a fact about the edges.*

#### Top-level keys

| key | what it is |
|---|---|
| `title` | the heading |
| `description` | one line under it |
| `due` | the day everything must be done by — the anchor the schedule chains backward from |
| `tasks` | the dated work |

A bare `2026-09-09` is read by YAML as a date and kept as the day written; a string
that parses as a date is cut to its first ten characters; anything else is a problem.

#### A task

```yaml
tasks:
  - key: print-badges          # the stable key `needs:` edges point at; the title when absent
    title: Print the badge sheets
    note: one line under the title
    body: |                    # the task's own markdown — the dialog's main content
      What doing this means, in this task's words.
    needs: [order-badges]      # prerequisites, by key
    duration: 2                # calendar days (default 1) — a weekend inside a task is part of it
    due: 2026-09-08            # a cap tighter than the calendar's
```

A task with neither `title` nor `key` is dropped; a second task with a key already
seen is dropped, because a duplicate key would fork every edge to it; a `needs`
entry naming the task itself is dropped.

#### No date is written down

Every date on the grid is derived, on every open, from the edges, the durations and
the due date. Authoring a date separately would let the two drift, and the grid would
start lying about what the work implies. A task with no anchor anywhere downstream,
or in a cycle, is left unscheduled rather than given an invented date.

#### Where the engine lives

`python/studio_kinds/kinds/calendar.py` — `parse`, `problems`, `summary`, with the
layering it shares with the board (`kanban.py`'s `_layers`, `dependency_rows`); its
header comment is what `studio-check --spec calendar` prints. The shape is
`kinds/calendar/v1.schema.json` and the field table `v1.fields.yaml`.

## The file is opened

*imposed*

The file is parsed, the schedule computed backward from the due date, and the month picked from what it produced.

### What is derived, and what is drawn

*Three steps between the file and the grid.*

#### The parse

The parse never throws — an unparseable file is an empty calendar. Tasks keep their
key, title, note, body, edges, duration and due; a `duration` only when a positive
number, a `due` only when a date.

#### The schedule

As late as possible. Walking the dependency layers from the deepest up, each task
ends at the earliest of its own `due`, the calendar's `due`, and the day before its
earliest dependent starts; it starts `duration − 1` days before that (duration at
least 1, rounded). The scheduled tasks come out sorted by start, then title.

#### The grid

The month is the due date's; weeks run Monday to Sunday from the Monday on or before
the 1st until the month ends, each cell carrying the tasks whose start and end
enclose the day. The title is the month and year.

#### What is drawn

The title, the description and "Due <date>." A weekday header and the cells: days
outside the month dimmed, the due day with an amber ring, today with a darker border
and "· today". Each task is a chip in every day it covers, titled "<task> · <start> →
<end>". Below, when any: "Unscheduled (no due anywhere downstream, or a dependency
cycle): a · b". The grid needs 720px and scrolls sideways under that.

## A task chip is clicked

*chosen · many*

The task dialog — the note, the edges as jumps, and the task's own words.

The title, the note, then "needs" with one chip per prerequisite and "depended on by" with
one per dependent — a click JUMPS the dialog to that task — and the body as markdown. A
task with neither note nor body: "No content authored — the chip is the whole task." A
chip is found by the task's key, so every chip opens exactly its own task.

## The file changes on disk

*imposed · many*

The file re-parses and the schedule is recomputed; nothing else is read.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The whole schedule follows from the new text, so a
changed `due`, edge or duration lands at once — there is nothing else on disk to wait for.
The open dialog stays on its key and closes if the key is gone.

## A journey draws the same grid

*imposed*

The month grid is shared; this file is one of the things that fill it.

A staged journey's stage with `calendar:` lays its task lists' `start` and `end` fields on
the same month grid, coloured by group and legended by source list. That grid reads lists
and lives in the `.definition` kind; this file holds its own tasks and derives their dates.
The two look alike on purpose.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses, so the checker names everything it silently dropped or defaulted.

### What the checker does

*The order it runs in, and what it leaves alone.*

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. The field table's required rows, and every fallback the lenient parser takes: no
   `title`, no `due` (nothing to chain back from), no `tasks` (`tasks: []` is an
   empty calendar and passes), a task with no `key` or no `title`, a second task with
   a key already used, a `needs` entry naming no task or the task itself, a
   `duration` that is not a positive number, a `due` (on the calendar or a task) that
   is not a date, and a cycle. Each is one line, naming the task.
3. The summary line: `ok <name>  Calendar  5 tasks, longest chain 5, due 2026-11-13`.

#### Not checked

Whether the plan fits: a chain longer than the days between now and the due date
schedules into the past, and that is the calendar's answer, not a problem. The
checker sees the file alone, which is all there is.

## A calendar is written

*chosen*

### Write a calendar

*A due date, the work, and what waits for what.*

#### Start from the template

`studio-check --template calendar > new.calendar`:

```yaml
title: "untitled"
due: 2026-12-31
tasks:
  - key: first
    title: The first thing
    duration: 5
  - key: second
    title: What follows it
    needs: [first]
    duration: 2
```

Two tasks and one edge, so the schedule has something to show; replace them.

#### Set the day everything must be done by

`due` at the top is the anchor: without it, every task is unscheduled and the
checker says so.

#### Write the tasks with keys

`key` first, then `title`. Keep keys stable: edges point at them.

#### Say what waits for what

`needs: [key, …]` on the task that waits, and `duration` on anything longer than a
day. The dates follow from these alone; do not write a date anywhere but `due`.

#### Check it

`studio-check new.calendar` — a `needs` to no task, a duplicate key, a cycle, a date
or duration that is not one: each is a line naming the task, and the summary counts
the tasks and the longest chain.
