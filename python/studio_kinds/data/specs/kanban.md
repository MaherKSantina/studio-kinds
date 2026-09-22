# .kanban — Kanban

## The engine's account

The check is `python/studio_kinds/kinds/kanban.py` in the studio-kinds repository; the account below is that engine's own.

The `.kanban` file kind: a task board whose COLUMNS are status and whose
ROWS are DERIVED dependency groups — never authored. Each task may name
prerequisites (`needs:`); the board layers tasks by longest prerequisite
chain: row one is everything that needs nothing, row two what builds on
row one, and so on. A board with no dependencies is one row — the plain
kanban it degenerates to.

Authoring shape (YAML, lenient — a half-written file still renders):

  title, description?
  due: 2026-09-09                       # the day everything must be done by —
                                        # the anchor backward scheduling chains from
  columns: [To do, Doing, Done]         # strings or {title, color?}
  tasks:
    - key: print-badges                 # stable key `needs:` edges point at
      title: Print the badge sheets
      status: Done                      # a column TITLE; unset/unknown = first column
      note: one line under the title
      body: |                           # the task's OWN authored markdown —
        - what doing this actually means # the dialog's main content
        - in this task's own words
      content:                          # OPTIONAL: one whole document of another
        kind: brief                     # kind, written into the task — the card
        doc:                            # dialog draws it under the prose, and the
          title: The round              # checker runs it through that kind's engine
          sections:
            - title: Round 1
              body: What this round is.
      needs: [other-key, …]             # prerequisites (keys)
      duration: 2                       # calendar days this task takes (default 1)
      due: 2026-09-08                   # per-task cap, tighter than the board's

Rows are computed, not stored, because dependency depth is a FACT about
the edges — authoring it separately would let the two drift. Unknown and
self `needs` keys are ignored; tasks caught in a cycle can't be layered
honestly, so they land together in one final row rather than vanishing.

Scheduling follows the same principle: dates are DERIVED, not authored.
`scheduleTasks` chains backward from the due date — a task ends the day
before its earliest dependent starts (or at its own cap), and starts
`duration` days earlier — so the calendar is always exactly what the
edges and durations imply, never a copy that can drift. Days are CALENDAR
days: a `duration: 5` ending on a Friday starts on the Monday, and a
weekend inside a task is simply part of it; there is no holiday calendar.
Dates are `YYYY-MM-DD`, bare or quoted.

A task's `content` is the one document it holds: `{kind, doc}`, the same
shape a brief's section carries. The board is one file — a card opens what
is in it, so a board pasted anywhere shows the same thing it showed here.
Refused on it: a `content` that is not a mapping, one without `kind` or
`doc`, an `md` document that is not a string, and `by`, `docs` or `file` —
a board has no answers to vary by and names no file.

The parser is lenient so a half-written board still renders; the CHECKER
is strict. It names what the parser silently dropped or defaulted — a
missing title, columns or tasks, a task with no key, a duplicate key, a
`needs` edge to no task, a status that is not a column, a duration that is
not a positive number, a due that is not a date, tasks caught in a cycle,
and what a written document cannot be — so `ok` from `studio-check` means
the file says what the board shows.

## A fresh document (what the Studio creates)

```yaml
title: untitled
due: 2026-12-31
columns: [To do, Doing, Done]
tasks:
  - key: first
    title: The first thing
    status: Doing
    duration: 2
  - key: second
    title: What follows it
    needs: [first]
    due: 2026-12-24
```

