# .kanban — Kanban

## The engine's account

The check is `python/studio_kinds/kinds/kanban.py` in the studio-kinds repository; the account below is the Studio's engine's own (`packages/filekinds/src/lib/kanbanDoc.ts`), which the check reproduces.

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
  source: Sep 9 tasks                   # OPTIONAL: where the tasks COME FROM. A
                                        # folder ref means composite `.node`s — one
                                        # node per task, its STREAMS the task's
                                        # domains (identity carries title/description,
                                        # a status stream's latest arrival carries the
                                        # column), folded current-picture first. A
                                        # `.points` ref sources a points stream the
                                        # same way. The board then authors only its
                                        # OWN domains (needs, duration, file/section)
                                        # and merges them onto the sourced tasks by key.
  columns: [To do, Doing, Done]         # strings or {title, color?}
  tasks:
    - key: print-badges                 # stable key `needs:` edges point at
      title: Print the badge sheets
      status: Done                      # a column TITLE; unset/unknown = first column
      file: Sep 9 EDMinis badges.pdf    # ref resolved against the board's folder,
                                        # opened in the card dialog by its own kind
      section: Round 1                  # for a `.brief` file: open just the first
                                        # section whose title contains this (case-
                                        # insensitive), not the whole document
      note: one line under the title
      body: |                           # the task's OWN authored markdown —
        - what doing this actually means # the dialog's main content, with the
        - in this task's own words       # file/section slice below as provenance
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

The parser is lenient so a half-written board still renders; the CHECKER
is strict. `kanbanProblems` names what the parser silently dropped or
defaulted — a missing title, columns or tasks, a task with no key, a
duplicate key, a `needs` edge to no task, a status that is not a column,
a duration that is not a positive number, a due that is not a date, and
tasks caught in a cycle — so `ok` from `studio-check` means the file says
what the board shows.

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

