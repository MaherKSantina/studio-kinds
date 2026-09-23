# How a version-1 definition works

<!-- Generated from kinds/definition/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

One extension, six documents — a fixed process with slots, an instance of it, a board of instances, a journey of boards, a staged journey of lanes and boundaries, and a set of journey variants; how the role is picked, what each draws, and what a click opens.

This is the `.definition` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Which role does the file play?** (`role`) — Picked from the keys — see "How the role is picked" under Always.

- `definition` — A definition. The reusable process — inputs, params, slots with `from` edges, variants.
- `instance` — An instance. `definition:` and `fills:` — one project's adoption, its status derived from the fills.
- `board` — A board. `definition:` and `instances:` — many instances of one definition, tracked together.
- `journey` — A journey of boards. `journey:` — a list of board files, stacked as stages.
- `staged` — A staged journey. `stages:` — vertical stages of side-by-side lanes, collate and fanout on the boundaries.
- `variants` — Journey variants. `variants:` — sibling staged journeys that answer the same question differently; pills flip whole journeys.

## Always

*imposed*

What holds at every moment — how the role is picked, the shape of each, why status is never stored, and where the engines live.

### The shapes of the file

*Six documents share the extension; the keys decide which one it is.*

#### How the role is picked

A `stages:` list is a staged journey (`parseJourneyStages`); a `variants:` list names
journey variants. Otherwise `parseDefinitionFile`: a `journey:` list → a journey of
boards; `definition:` with `instances:` → a board; `definition:` alone → an instance;
anything else → the definition itself. The checker only runs `parseDefinitionFile`,
which never throws.

#### A definition

```yaml
title: Job application
rules: [Every slot cites the ad it answers.]      # standing rules every slot's authoring honours
inputs: [{key: cv, label: The CV, node: /me/cv.md}]           # fixed for every instance
params: [{key: ad, label: The ad, hint: Paste the listing., optional: false}]   # per-instance source material
slots:
  - {key: analysis, label: Analysis, kind: brief, from: [ad, cv], hint: What they want and what fits.}
  - {key: letter, label: Cover letter, kind: md, from: [analysis], export: true}
  - {key: outcome, label: Outcome, from: [letter], optional: true}
variants:
  - {key: short, label: Short form, slots: [analysis, letter], rewire: {letter: [ad]}}
defaultVariant: short
```

The slots' `from` edges are the DAG. A variant is one polymorphic shape: which of
the declared slots exist, in the union's order, with `rewire` replacing a slot's
`from`; edges to slots outside the shape are dropped, params and inputs are shared.
The definition is the single source of truth: refining it updates every instance's
DAG and instructions; an instance owns no process logic.

#### An instance, a board, a journey

```yaml
title: Acme, iOS lead          # an instance
definition: ../job.definition
variant: short
fills: {ad: acme-ad.md, analysis: acme-analysis.brief}
```

```yaml
title: September applications  # a board
definition: job.definition
instances: [acme.definition, globex.definition]
```

```yaml
title: The hunt                # a journey of boards
journey: [leads.definition, applications.definition]
```

Status is DERIVED: an instance stands at its first unfilled required slot
(`firstGap`); `fillProgress` is the card's N/M over the resolved shape; optional
slots never block. Refs resolve against the file that names them.

#### A staged journey

```yaml
title: Hunt
stages:
  - key: gather
    label: Gather
    lanes:
      - {label: Seek, process: scrape.definition, out: seek.list, status: done}
      - {label: LinkedIn, out: linkedin.list, flow: true}          # flow: show the list's rows in the lane
  - {key: pool, label: The pool, collate: pool.list}                # ⇒ every lane above, pooled
  - key: apply
    label: Apply
    fanout: {run: chain.policy, ranks: [1, 3]}                      # ⇉ per-item columns, by a run's ranks
    steps: [{key: draft, label: Draft, file: draft.md}]             # spine steps span every column
    items: {"Acme": {steps: [{label: Call them}], results: {draft: acme-draft.md}}}
  - {key: when, label: When, calendar: {sources: [tasks.list]}}     # a month grid over start/end fields
  - {key: shared, label: Shared, journey: common.definition}        # a portal: this stage IS another journey
  - {embed: common.definition, at: pool}                           # splice another journey's stages in, by reference
```

Lanes are parallel strands; `grid` lays lane cells in aligned rows where position
carries meaning. A lane's `answers:` evaluates a run's chain for one `item`. A step's
`journey` is the mini journey that produced it. Refs are relative to this file.

#### Journey variants

```yaml
description: Two ways to pitch it.
variants:
  - {label: Technical, journey: technical.definition}
  - {label: Commercial, journey: commercial.definition}
```

#### Where the engines live

`packages/filekinds/src/lib/definitionDoc.ts` — `parseDefinitionFile`,
`resolveVariant`, `firstGap`, `fillProgress`, `laneByKey`, `definitionChildren`,
`instanceChildren`; `journeyStages.ts` — `parseJourneyStages`,
`parseJourneyVariants`, `monthGrid`, `rewriteRef`, `embedStages`. Both headers are
what `studio-check --spec definition` prints. The views are
`components/definition/DefinitionView.tsx` (which picks the role), `BoardView.tsx`,
`JourneyView.tsx`, `JourneyKanban.tsx`, `JourneyStagesView.tsx`,
`JourneyVariantsView.tsx` and `JourneyCatalog.tsx`; the checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

The role is picked, the parse never throws, the files it names are read live, and the role's own view is drawn.

> Say which role the file plays — each reads and draws differently.

### When `role=definition`

**The parse.** The title ("Definition"), rules, inputs (a `key` and a `node`), params,
slots (a `key`; `from` as a list), variants (a `key`; `slots`; `rewire` lists), and
`defaultVariant`.

**What is drawn.** The header with the title and the standing rules. Two modes: STREAMS
— the process unrolled, one row per slot with its inputs stacked on the left and the
slot on the right, shared dependencies duplicated per row so a repeated pattern reads as
the abstraction it is; GRAPH — the laned DAG on the project-lens canvas, lanes by
`laneByKey` (inputs and params at lane 0, a slot one past its deepest dependency;
unknown or cyclic refs never block). Every node carries a chip: an input's file kind, a
param as `param · pending` (or `optional`), a slot as `<kind> · pending` (or
`optional`). Clicking an empty node explains it; there is nothing to open.

### When `role=instance`

**The read.** The `definition` is read relative to this file and resolved to the
instance's `variant` (the default, else the full union). Each fill resolves relative
to this file.

**What is drawn.** The same Streams and Graph modes with live fill state: a filled node
carries its file's kind chip and opens the document; the first unfilled REQUIRED slot is
NEXT — solid amber, its label the card's kanban column; other required gaps dashed
amber; optional ones whisper grey. Related pipelines show as chips.

### When `role=board`

**The read.** The definition, then every instance file (an unreadable one never blocks
the board), each resolved to its variant.

**What is drawn.** Columns are the resolved shape's WORKING slots — required and
consumed by another slot — in order, plus Done; a terminal slot (one nothing reads) is
not a column, it is the done condition. A card stands at the step it has most recently
COMPLETED ("Not started" for nothing yet), "waiting" when every working slot is filled
and only the terminal outcome is outstanding, with its `N/M` progress and the optional
slots it has filled. Cards never cross variants: each shape has its own group of
columns, and a shape with no instances stays off the board. Status is derived from the
fills, never stored.

### When `role=journey`

**The read.** Every board in `journey`, its definition, and its instances.

**What is drawn.** Stages (boards) stack horizontally; every instance is a compact
strip — one small box per slot coloured by state (filled, next, pending, optional) —
and an instance fanning out into the next stage stacks its destinations vertically
beside it. Links are DERIVED, never authored: a terminal list-fill's rows point forward,
a param fill naming an upstream instance points back. Instances of a later stage nobody
upstream produced show in a "direct" band so the funnel's second mouth stays visible. A
Journey / Kanban toggle: the kanban merges every stage's board into one row of columns
under stage captions — a variant its own group — with "Each card sits under the step it
has most recently completed; the amber “next” box in its DAG is what it owes."; "Reading
the boards…" meanwhile.

### When `role=staged`

**The read.** "Resolving embedded journeys…" while `- embed:` entries are replaced in
place by the embedded journey's stages, by reference, up to three deep, each marked with
its owner; then every stage's data — a lane's `out` file (a policy flows its structure,
a list its rows when `flow: true`, a text document its text), a collate's pool, a
fanout's columns (from a list, a run's ranks, or a group-by), a calendar's task lists —
and the version pins of every versioned ref.

**What is drawn.** The description, then one block per stage: a header with `▾ label`,
the detail, a "⑂ <owner>" chip on a shared stage, "N need attention", Columns / Board
faces on a fanout, "open journey" on a portal. Inside: lanes side by side — a compact
card (`✓` done, `●` next, a "process" chip, the `out` file chip, a pin bar) or a wide
content column with the artifact's rows or text under a band that opens it — or the
grid's rows of aligned cells; a collate as a `⇒` cell (a folder collate opens a pick-list
of the pooled items with "browse the folder ↗"); steps as cells; a pooled list flowing as
rows; a run's items under bucket bands; a fanout as columns of spine and item steps with
result cards, or as a kanban; a calendar as a month grid legended by group and source.
Between stages, a boundary with its operation (`⇒`, `⇉`, `→`). An embedded run is
bracketed "⑂ <title> embedded — by reference, edited there ↗" and "this journey's own
steps continue".

### When `role=variants`

**The read.** The picked variant's journey is read relative to this file and parsed as
a staged journey — "x is not a staged journey (no stages:)" or "could not read x"
otherwise.

**What is drawn.** The description, one pill per variant, and "N versions — flip to
compare". Below, the picked journey full-size and fully interactive, keyed by its path
so every policy, list and embed re-derives on a flip. Comparing versions is flipping,
not diffing.

## A node, lane, step or card is clicked

*chosen · many*

The thing behind it opens in a dialog; a web address opens a tab.

A filled node, a lane's `out` or `process`, a step's `file`, a board card, a strip's box
— each opens the node-ref dialog: a file rendered by its kind, a `decision:`/`event:`
element out of a playbook, a `stage:` element as the stream focused on that stage, an
instance whole with its DAG. A lane row carrying `url` opens the address in a new tab; a
row with fields opens them in a dialog. A boundary's operation opens the "what happened"
dialog, except a policy step with a mini `journey`, which opens that journey directly —
the exploration is the explanation. Refs inside a shared stage resolve against the journey
that owns it. Nothing here writes.

## A version is pinned or updated

*chosen · many* — only when `role=staged`

The journey's own text is rewritten by ref surgery; a shared stage's pins stay read-only.

A ref that names a versioned file shows a pin bar with the versions; pinning or updating
one calls `rewriteRef` on the journey's raw text — that one ref replaced, nothing else
touched — and hands the text to the host's `onChange`, whose autosave writes it. Without
`raw` and `onChange` the chips still show, read-only; a stage embedded from another journey
keeps its refs in its owner, so its bars are read-only here.

## A file changes on disk

*imposed · many*

This file re-parses and everything it names is read again; a named file changing on its own is not watched.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The file re-parses, the role is picked again, and
the definition, instances, boards, journeys and stage data it names are read afresh. A
fill, an instance or a lane's artifact edited on its own shows on the next open, or on a
stage's Reload chip where one is offered. The mode, the open block and the picked variant
are state and stay.

## Another kind reads it

*imposed · many*

A definition's shape is what a project, a kanban and the catalog read.

- A project shows an instance's children — the params, then the exported slots, each with
  its fill when the document exists — as children of the node, and draws the instance's
  next slot solid amber in its DAG.
- The journey catalog page lists the journeys of a store and opens them.
- A calendar stage and the `.calendar` kind share one month grid; a fanout's run reads a
  `.policy` chain; a collate writes a `.list`.

## studio-check runs on it

*imposed*

One file in, one verdict out — only the role's keys are read.

### What the checker does

*The order it runs in, and what it leaves alone.*

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseDefinitionFile` — it never throws. No summary line. A staged journey and a
   variants file pass as an (empty) definition. The page does not know the
   definition kind.

#### Not checked

That a `definition`, an instance, a board, a journey or a fill exists. A `from` key
that names nothing (the lane walk never blocks). A `variant` the definition does not
declare (the full union is used). A stage's refs, embeds and pins.

## A definition is written

*chosen*

### Write a definition

*The template is a staged journey; the process roles are written by hand.*

#### Start from the template

`studio-check --template definition > new.definition` — a staged journey in its
smallest complete form: a Gather stage with two lanes, then a pool stage collating
them, with comments explaining `collate`, `fanout` and `embed`.

#### Stack the stages

One stage per phase, lanes for parallel strands, `collate` where they pool, `fanout`
where a pool splits per item; `embed` a journey that other journeys share. Refs are
relative to this file.

#### Write the definition, then instances

Replace the body with `inputs`, `params` and `slots` with `from` edges; then one
instance file per adoption with `definition:` and `fills:`, and a board listing the
instances. Status follows from the fills.

#### Check it, then open it

`studio-check new.definition` — only YAML can fail. Open it: a slot with an unknown
`from` lands at the end of the lanes; an instance's amber node is what it owes.
