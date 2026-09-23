# How a version-1 pulse works

<!-- Generated from kinds/pulse/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

The movement of a working memory on one page — a heat grid of arrivals per focus per day, drawn live from the store's timestamps, and the attention trail from the memory's journal; nothing cached.

This is the `.pulse` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Always

*imposed*

What holds at every moment — the file is a pointer and a window; where the two sources are; where the engine lives.

### The shape of the file

Four keys, and two honest sources it reads on every open.

#### Top-level keys

| key | what it is |
|---|---|
| `title`, `description` | the heading and one line under it |
| `memory` | the `.memory` whose foci are the rows — an absolute store path |
| `days` | how far back the grid reaches, today inclusive: 1 to 120, default 21 |

#### The two sources

Content movement is DERIVED live from the store's own timestamps: for each focus,
how many units arrived (created) and were touched (updated) on each day. Attention
movement is AUTHORED: the memory's `journal`, appended by every pill click that
changed the taken answers. Neither is cached here.

#### What heat means

A saturation WARNING, not a celebration: many arrivals into one focus means a
working set getting harder to reason about. "Everything else" rows are grey — the
unclaimed pool does not compete for attention.

#### Where the engine lives

`packages/filekinds/src/lib/pulseDoc.ts` — `parsePulse`, `pulseGrid`, `fillColor`,
`pulseSiblings`; its header comment is what `studio-check --spec pulse` prints. It
reads the memory through `memoryDoc.ts` and `components/memory/memoryLoad.ts`. The
view is `components/pulse/PulseView.tsx`; the checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

The memory is read over its store, every unit is placed on its answer path and its days, and the grid and the trail are drawn.

### What is computed, and what is drawn

The rows, the columns, the cells, then the page.

#### The parse and the read

`parsePulse` never throws: the title ("Pulse"), `memory`, `days` clamped to 1–120 or
defaulted to 21. Without a memory: "The pulse names no memory: add `memory:
/memory/desk.memory`." Otherwise "Reading the store…" while the memory is read and
laid over its folder — folder splits and nested memories included — and its units
come back with their created and updated times.

#### The rows

The memory's WHOLE foci hierarchy: every decision's answers, the structural
"Everything else" included, children indented under the answer that activates them,
depth-first in authored order. Named answers keep the hierarchy at the top; every
"Everything else" subtree is deferred to a grey tail at the bottom, with `· <whose
complement>` beside it, because the unclaimed pool should not interleave with what
competes for attention. A parked named answer rides inside its else block. An
activation cycle never recurses.

#### The columns and the cells

The last `days` local days, anchored at noon so daylight saving cannot shift a
column, ending today. Every unit passing the memory's include rules and not hidden
by an unticked option walks its answer path and counts on every level it passes:
`added` on the day it was created, `touched` on the day it was updated when that is
another day, and units created before the window form the row's base population.
A running pass turns arrivals into `total` — how full the focus was by the end of
each day — and `mass`, the same in the caller's weight.

#### What is drawn

The title, the memory's path with a copy-handle button, the description. "Saturation
by focus · last N days · each box = how full the focus was that day (deeper red =
more saturated), ring = touched, grey = parked/else": a table with the dates across
the top (the first column, the 1st and the 15th labelled), one row per focus with
its label indented (`└` for a child), a box per day coloured by `total` over the
row's units — red, or grey for an else or parked row — ringed when touched, titled
`<date> — N in memory, +N that day, N touched`, and a "now" column with the row's
units. Then "Attention trail · every change of the taken answers, newest first": one
line per journal entry, the answers' labels joined "→", or "cleared — the whole
store"; "No movements logged yet — the trail writes itself as answers are taken on
the memory." when empty.

## The file changes on disk

*imposed · many*

The pointer re-parses; the store is read again only when the memory or the window changed.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The file re-parses; the store is read and the grid
rebuilt when `memory` or `days` changed, or the day turned. The store itself is not
watched: reopen the pulse to see today's arrivals.

## The memory draws its own pulse

*imposed*

The same grid, one level of it, beside the memory view.

The memory view's side pulse calls `pulseGrid` over the same units (21 days, reading
minutes as the weight) and `pulseSiblings` picks one level of it: the rows of the lowest
sub-focus on the table, alongside its siblings, found by following the taken answers
through the activation chain from the roots. A `.moves` log is the harvested counterpart:
it owns departures, which leave no trace in the store.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses.

### What the checker does

The order it runs in, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parsePulse` — it never throws. No summary line.

#### Not checked

That `memory` is present or exists (the view says so). That `days` was in range (it
is clamped or defaulted, quietly).

## A pulse is written

*chosen*

### Write a pulse

Three lines beside a memory.

#### Start from the template

`studio-check --template pulse > desk.pulse`:

```yaml
title: "desk"
description: "The movement of a working memory: …"
memory: /desk.memory   # the .memory this pulse reads — an absolute store path
days: 21
```

Point `memory` at the memory, as an absolute store path; widen `days` up to 120.

#### Check it, then open it

`studio-check desk.pulse` — only YAML can fail. Open it: a row deep red across the
window is a focus that filled up; the trail is empty until answers are taken on the
memory.
