# .calendar — Calendar

## The engine's account

The check is `python/studio_kinds/kinds/calendar.py` in the studio-kinds repository; the account below is the Studio's engine's own (`packages/filekinds/src/lib/calendarDoc.ts`), which the check reproduces.

The `.calendar` file kind: a LENS over one `.kanban` board — like
`.tablediff`, it recomputes from its source on every open and stores no
dates of its own. The board's dependency edges, durations and due date
produce the schedule (kanbanDoc's `scheduleTasks`, backward-chained from
the due date); this file only says WHICH board, and optionally overrides
the anchor.

Authoring shape (YAML, lenient):

  title, description?
  board: Sep 9 prep board.kanban   # ref resolved against this file's folder
  due: 2026-09-09                  # optional — overrides the board's own due

## A fresh document (what the Studio creates)

```yaml
title: "untitled"
description: "A lens over one board: the schedule its dependency edges, durations and due date produce. Nothing is stored here — it recomputes on every open."
board: board.kanban   # a ref resolved against this file's folder
# due: 2026-12-31     # optional — overrides the board's own due date
```

