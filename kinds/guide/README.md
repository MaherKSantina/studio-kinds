# How a version-1 guide works

<!-- Generated from kinds/guide/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

One procedure, narrowed by questions — what a step is, how answering removes steps without saving anything, and how the order is a graph rather than a position.

This is the `.guide` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Where is it rendering?** (`host`) — The same step click expands in place or opens a pane, depending on the host.

- `preview` — The kind's preview. The Studio, the desktop app, VS Code, a file-content dialog — a step's detail expands under its row.
- `trail` — Inside a pane trail. A points store, a workup, a project lens — a step's detail drills into the next pane.

## Always

*imposed*

What holds at every moment — the shape of the file, why the order is a graph, what is never in the file, and where the engine lives.

### The shape of the file

Decisions as a playbook has them, and steps that carry conditions and edges.

#### Top-level keys

| key | what it is |
|---|---|
| `title` | the heading; "Guide" when absent |
| `description` | one line under the title |
| `decisions` | the questions — the same shape as a playbook's: `key`, `label`, `detail`, `values` of `key`, `label`, `detail`, `activates`, `when` |
| `steps` | the procedure |

Nothing else is read. There is no version line and no place for an answer.

#### A step

```yaml
steps:
  - key: lodge               # identity; slugged from the label when absent
    label: Lodge the transfer
    detail: |                # markdown; `body` reads the same
      What doing it involves. The label on its own is the task.
    when: [resident=yes]     # part of the procedure only where this holds
    after: [sign]            # keys this step comes after
    effort: 2d               # consumed by a plan's schedule
    negotiable: fixed        # fixed | scope | date — how a schedule may move it
    emphasis: true           # drawn as a warning
```

#### Order is a graph

A step declares what it comes `after`; it has no position. A conditional step
slipped into the middle renumbers nothing, and a branch that runs in a different
sequence says so without disturbing its neighbours. An edge to a step that did not
survive the answers is dropped rather than blocking, so a branch that removes a step
never strands what followed it. The same edges are the dependency graph a plan
schedules from — authored once here, not restated as tasks elsewhere.

#### What is never in the file

The answers. A guide's assignment is how a reader narrowed a page, not a fact about
the business, and next week the facts differ. That is the whole difference between a
guide and a playbook, which shares every other part.

#### Where the engine lives

`packages/filekinds/src/lib/guideDoc.ts` — `parseGuide`, `dumpGuide`, `stepsAt`,
`narrowing`, `slugKey`; its header comment is what `studio-check --spec guide` prints.
The decision algebra is the shared `crosscut/decisions/decisionSpace.ts` (`pruneLocks`,
`impliedLocks`, `applyRefs`, `splitRef`). The preview is
`components/guide/GuidePreview.tsx`, built from `DecisionPills`, `EventRow` and
`OneDList`; the checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

parseGuide reads the YAML once and never throws; every step shows, because nothing is answered.

**The parse.** An unparseable file opens as a guide titled "Guide" with no steps. A
decision with no `label` takes its `key`, then "Question N"; a `key` missing is slugged
from the label (lower-case, runs of anything but letters and digits become `-`, at most
48 characters). Answers do the same with "Answer N". A step with no `label` reads "Step N";
`body` is read as `detail`; `negotiable` is kept only as `fixed`, `scope` or `date`;
`emphasis` only when exactly `true`; `when`, `after` and `activates` only when non-empty.

**What is drawn.** When the guide has decisions, a strip at the top: "Narrow this · N of
M steps apply" and one pill per answer on the table. Under it, the steps as numbered rows
— the number, the label, `effort` as the row's meta, a `fixed` badge ("Cannot be dropped
or moved — a schedule works around it"), an amber number and border for `emphasis`. Every
step shows on open: a step stays while its questions are unanswered, so the procedure
opens whole and narrowing REMOVES. The rows come in dependency order — `after` edges
walked Kahn-style, document order as the tie-break — so an unconstrained procedure reads
exactly as written.

**The surface.** One surface per document in every host, the kind's preview inside
`DocumentPreview`; a step's detail is markdown rendered by the same pane a `.md` uses.

## An answer is taken

*chosen · many*

Steps whose conditions no longer hold leave the list; the file is untouched.

A pill click adds `decision=answer` to the MANUAL answers (replacing any other answer to
the same decision); clicking the taken pill again removes it. The effective assignment is
derived every time: `pruneLocks` drops answers to questions no longer on the table, to a
fixed point, then `impliedLocks` takes any decision down to one available answer without
showing it. A "reset" chip appears once anything is answered and drops the manual answers.

`stepsAt` then keeps a step while every ref in its `when` is either taken or belongs to a
question still unanswered — a step goes only once one of its questions has been answered
differently. Steps ACCUMULATE: a procedure is not a branch you pick but every instruction
that applies to you. The survivors are re-ordered by `after`, edges to removed steps
dropped; if what is left has a cycle, the remainder is emitted in document order rather
than hidden. The count in the strip updates ("3 of 7 steps apply"). When nothing survives:
"No steps for these answers. Either a combination nobody has written a procedure for, or
one that cannot happen — worth knowing which."

None of it is written. The host's `onChange` is never called; reload the file and every
question is open again.

## A step is clicked

*chosen · many*

Only a step with a detail is expandable; the detail renders as markdown.

> Say where the guide is rendering — the detail expands under the row or opens as a pane.

### When `host=preview`

The row toggles: its detail renders as markdown under it, inside the row's border, and
a second click folds it. One step is open at a time. A step with no `detail` has no
toggle — the label is the whole task.

### When `host=trail`

The row drills: a pane keyed `step:<key>` and titled with the step's label opens in the
trail with the detail rendered as markdown, and the row is marked open. A step with no
`detail` has no toggle.

## Another kind uses it

*imposed · many*

A playbook narrows it with its own answers; a plan reads its steps as work.

### Where a guide turns up

Two hosts read a guide for what it says, not only to draw it.

#### Inside a playbook

A version-1 playbook shows guide files beside it and hands them the playbook's own
assignment as `context`; a guide conditions on it without owning it — a ref in
`context` counts as taken by `stepsAt`, and the pills show it as given rather than
chosen. A version-2 playbook writes a guide in as `content: {kind: guide, doc: {...}}`
and renders it under the synthetic name `inline.guide`; the playbook's checker runs
`parseGuide` over it, named `event <key>: <label> (guide)`.

#### In a plan

A `.plan` reads the guides its playbooks show and turns their steps into tasks —
`effort` is the duration, `after` the dependencies, `negotiable` how far the schedule
may move each one. The guide is the single copy of the procedure; the plan never
restates it.

#### Annotations

Each row is an annotation target `step:<key>`, so a sidecar of notes can ring a step
and explain it on click.

## The file changes on disk

*imposed · many*

The host re-reads; the answers taken so far are kept and re-pruned against the new questions.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text; the Studio re-reads unless its
autosave is dirty, saving or in error. The preview re-parses. The manual answers are state,
so they survive — pruned against the new decisions, so an answer to a question that was
removed disappears — and the open step stays open if its key still exists.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses, so the verdict is about the YAML.

### What the checker does

The order it runs in, the summary line, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseGuide` — it never throws.

#### The summary line

The command line prints `N steps`. The page prints `N steps, N decisions`; there the
guide is not offered in the menu — it is checked because a playbook may carry one
written in — so a guide reaches the page only inside a playbook.

#### Not checked

An `after` naming a key that does not exist (the edge is dropped, quietly). A `when`
naming a decision the guide does not have (the step stays forever, since that question
is never answered). A cycle in `after` (the order degrades to document order). Whether
`effort` is a duration a plan can read.

## A guide is written

*chosen*

### Write a guide

From the template to a procedure that narrows — one file, no answers in it.

#### Start from the template

`studio-check --template guide > new.guide`:

```yaml
title: new
description: One explanation, narrowed by questions.
decisions: []
steps:
  - label: First step
    detail: What to do and why.
```

#### Write every step that could apply

One row per instruction, with a `key` so edges can name it. Put the whole procedure
in — every branch's steps — because narrowing removes; nothing is revealed later.

#### Write the questions that remove steps

One decision per question whose answer makes some steps not apply, then `when:
[decision=answer]` on those steps. A step with no `when` always applies.

#### Say what comes after what

`after: [key]` where the order matters; leave it off where document order is the
order. An edge to a step another branch removes is fine — it is dropped with it.

#### Add what a schedule needs

`effort` and `negotiable` on steps a plan will schedule; `emphasis: true` on the step
the guide exists for.

#### Check it

`studio-check new.guide` prints the step count. Then open it and answer each question
both ways: a step that never leaves has a `when` naming a decision that is not there.
