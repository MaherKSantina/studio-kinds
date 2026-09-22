# .calendar — Calendar

## The engine's account

The check is `python/studio_kinds/kinds/calendar.py` in the studio-kinds repository; the account below is that engine's own.

The `.calendar` file kind: dated work on a month grid. The file holds the
tasks, what each one needs, how long it takes and the day everything must
be done by — and every DATE shown is derived from those, never written
down. A task ends at the earliest of its own `due`, the calendar's `due`
and the day before its earliest dependent starts, and begins `duration`
days earlier. A task with no anchor anywhere downstream, or in a cycle, is
unscheduled rather than given an invented date.

Authoring shape (YAML, lenient — a half-written file still renders):

  title, description?
  due: 2026-12-01                 # the day everything must be done by — the
                                  # anchor the schedule chains backward from
  tasks:
    - key: plan                   # the stable key `needs:` edges point at
      title: Plan the show
      note: one line under the title
      body: |                     # the task's own markdown
        What doing this actually means.
      duration: 5                 # calendar days (default 1)
    - key: record
      title: Record the pilot
      needs: [plan]               # prerequisites, by key
      due: 2026-11-28             # a cap tighter than the calendar's

Days are CALENDAR days: a `duration: 5` ending on a Friday starts on the
Monday, and a weekend inside a task is simply part of it; there is no
holiday calendar. Dates are `YYYY-MM-DD`, bare or quoted.

A task with neither `title` nor `key` is dropped; a second task with a key
already seen is dropped, because a duplicate key would fork every edge to
it. The CHECKER names what the lenient parser dropped or defaulted — no
title, no `due`, a task with no key or title, a duplicate key, a `needs`
edge to no task, a duration that is not a positive number, a date that is
not one, and tasks caught in a cycle.

## A fresh document (what the Studio creates)

```yaml
title: "untitled"
description: "The schedule these edges, durations and the due date produce. No date is written down — every one is derived."
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
