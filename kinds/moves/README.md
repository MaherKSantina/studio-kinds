# How a version-1 moves works

<!-- Generated from kinds/moves/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

A working memory's movement log, harvested by looking — every open diffs the store against the snapshot kept in the file's tail, appends what moved, and writes the tail back with the head untouched.

This is the `.moves` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Always

*imposed*

What holds at every moment — the two halves of the file, what an event is, and where the engine lives.

### The shape of the file

A pointer at the top, machine state under a banner at the bottom.

#### The head

| key | what it is |
|---|---|
| `title`, `description` | the heading and one line under it |
| `memory` | the `.memory` this log follows — an absolute store path |
| `keep` | how many events the log keeps: 10 to 1000, default 200 |

Everything above the banner is the author's and is never re-serialised.

#### The tail

```yaml
# Movement state. Written by the moves view — keep last.
snapshot:
  at: 2026-09-19T08:00:00.000Z
  mapping:                       # every unit → its answer path at the last look
    - {p: /desk/notes.md, a: focus=jobs/hunt=pipeline, l: Jobs › Pipeline, s: 1200, k: prose}
  shape:                         # each decision's named answers and what activates it
    - {d: hunt, v: [pipeline, closed], e: [focus=jobs]}
events:
  - {at: …, kind: node-moved, node: notes, from: Jobs › Pipeline, to: Jobs › Closed, ctx: {…}, fromCtx: {…}}
```

`p` is the unit's path, `a` its answer-path key, `l` the human labels joined " › "
(kept so departed units stay legible), `s` its size in characters, `k` its
structure class — `node` (a structured `.node`), `structured` (a list, a policy, a
board…), `prose` (`.md`, `.brief`, `.txt`, `.html`), or `other`. The store keeps no
history, so this snapshot is how movement is reconstructed honestly.

#### The events

| kind | when |
|---|---|
| `node-moved` | a unit's answer path changed — renamed, refiled, or the criteria re-claimed it |
| `arrived` / `gone` | units entering or leaving a path, counted per path |
| `answer-moved` | a named answer changed decisions; `parked` when it moved under an "Everything else", `retrieved` when it came back out |
| `answer-added` / `answer-removed` | the unpaired cases |

Every node event carries the PRESSURE CONTEXT of the affected focus at that moment —
`files`, `kb`, `nodes`, `structured`, `prose` — the labelled observation a pressure
policy is fitted from.

#### Where the engine lives

`packages/filekinds/src/lib/movesDoc.ts` — `parseMoves`, `parseMovesState`,
`computeSnapshot`, `diffMoves`, `pressureAt`, `unitKindOf`, `decisionContext`,
`writeMovesState`; its header comment is what `studio-check --spec moves` prints. It
reads the memory through `memoryDoc.ts` and `components/memory/memoryLoad.ts`. The
view is `components/moves/MovesView.tsx`; the checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

The memory is read over its store, reality is snapshotted, the LIVE file's snapshot is diffed against it, and the tail is written when anything moved.

### The harvest, step by step

Looking is what writes the log.

#### The parse

`parseMoves` never throws: the title ("Moves"), `memory` (empty when absent), `keep`
clamped to 10–1000 or defaulted to 200. Without a memory: "The moves doc names no
memory: add `memory: /memory/desk.memory`." and nothing else happens.

#### Reality

"Diffing against the last look…" while the memory is read and laid over its folder
— folder splits and nested memories included, the way the memory view sees it — and
every unit passing the memory's include rules is placed on its answer path. That is
the current snapshot: units sorted by path with size and kind, and the shape of every
decision with the refs that activate it.

#### The last look

The prior snapshot is read from the LIVE file on disk — never this tab's copy — so
two windows cannot fight over it. With a prior snapshot, `diffMoves` produces the
fresh events; without one this open is the baseline. The log is the prior events
plus the fresh ones, cut to the last `keep`.

#### The write

Only when something was harvested, or the baseline is being laid, and the host has a
writer and a path: `writeMovesState` keeps the head byte-for-byte up to the banner
(or up to `snapshot:` in a file with no banner yet), dumps the new snapshot and log
under the banner, writes the file, and hands the text to `onChange`. An unchanged
world writes nothing, so looking does not churn the store.

#### What is drawn

The title, the memory's path with a copy-handle button, the description. "Since last
look · <when>" with "Baseline recorded — movement shows from the next change
onward.", "Nothing moved.", or one line per fresh event. "Movement log · N events
kept", newest first, or "Empty — it fills as things move." An event line reads
`<time> · notes — Jobs › Pipeline → Jobs › Closed`, `3 arrived → Jobs › Pipeline`,
`1 left — Jobs › Closed`, `answer jason parked under Everything else — Fatin → Fatin
› Everything else`, `answer x added under …`, `answer x removed from …`.

## Something moved since the last look

*imposed · many*

What the diff makes of a difference — each rule, in the order it runs.

**Nodes, by store path.** A unit present now and absent before joins `arrived`, counted
per destination label. A unit present in both with a different answer path is
`node-moved`, from the old label to the new, with the pressure context of the new focus
(`ctx`) and of the old one (`fromCtx`). A unit absent now joins `gone`, counted per old
label. Arrivals and departures carry the context of their focus too.

**Answers, by `decision=value` pair.** The pairs of the old shape and the new are
compared. A pair removed whose value reappears under another decision is `answer-moved`:
`parked` when, in the NEW shape, the destination's activation chain passes through the
source's "Everything else"; `retrieved` when, in the OLD shape, the source hung under the
destination's. The from and to are the decisions' places in the memory's words — the
labels of the answers that activate them, root first. A pair removed with no new home is
`answer-removed`; a pair added with no old one is `answer-added`. The recorded shape
answers even after the live memory forgot the parked decision.

## The file changes on disk

*imposed · many*

The head re-parses; the harvest runs again only when the memory or the keep changed.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text — including the view's own write
coming back — and the Studio re-reads unless its autosave is dirty, saving or in error.
The head re-parses. The harvest runs again only when `memory` or `keep` changed; a tail
edited by hand is simply read on the next harvest, and the store moving is not watched at
all — reopen the file to look again.

## Another kind reads it

*imposed · many*

The log is a record; the pulse is the other face of the same movement.

A `.pulse` draws the same memory's movement from the store's timestamps — derived live,
never harvested — and departures leave no trace there; this log owns them. The pressure
contexts on node events are what a policy over the working memory's pressure is fitted
from. Nothing reads the tail but this view and that fitting.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses.

### What the checker does

The order it runs in, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseMoves` — it never throws. No summary line.

#### Not checked

That `memory` is present or exists (the view says so). That `keep` was in range (it
is clamped or defaulted, quietly). That the tail is well-formed (a bad snapshot reads
as none, and the next open lays a new baseline).

## A moves log is started

*chosen*

### Start a moves log

Three lines, then look.

#### Start from the template

`studio-check --template moves > desk.moves`:

```yaml
title: "desk"
description: "What moved in a working memory, harvested by looking: …"
memory: /desk.memory   # the .memory this log follows — an absolute store path
keep: 200
```

Point `memory` at the memory, as an absolute store path.

#### Open it once

The first open lays the baseline: the tail is written under the banner and "Baseline
recorded" shows. Nothing is an event yet.

#### Open it after things move

Every later open harvests the differences and appends them. Never edit below the
banner; the head above it is yours and survives every write.
