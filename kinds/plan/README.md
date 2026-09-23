# How a version-1 plan works

<!-- Generated from kinds/plan/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

A policy over playbooks and the schedule it produces — rules as a list of single instructions, the books and their guides read live, the frontier simulated forward on every edit, and what did not fit shown rather than dropped.

This is the `.plan` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Does the host write?** (`host`)

- `writes` — Yes — an `onChange` is passed. The Studio's surface, the desktop app, VS Code, a project pane — every rule edit is dumped and saved.
- `reads` — No — a read-only host. Edits land locally, the plan still recomputes, and they are dropped when the host's content moves on.

## Always

*imposed*

What holds at every moment — the shape of the file, why rules are a list, what is deliberately not here, and where the engine lives.

### The shape of the file

Where the plan starts, how far it reaches, and one instruction per rule.

#### Top-level keys

| key | what it is |
|---|---|
| `title`, `description` | the heading and one line under it |
| `playbooks` | the books this plans over — several, because decisions and events are often in separate files (`playbook:` singular is accepted) |
| `locks` | where we are standing when the plan starts — `decision=answer` refs |
| `horizon` | working days the plan covers; also the deadline — work past it is dropped; default 120 |
| `rules` | the policy, as a list |

#### A rule

```yaml
rules:
  - note: Rules are a list; each carries one instruction.
    capacity: 1                           # working days of effort available per working day
  - order: [incorporate, open-account]    # these, in this order, relative to each other — a constraint
  - exclude: [move-office]                # never plan these, whatever they score
  - boost: {hire: 2, audit: -1}           # a thumb on the scale, per event key
  - weights: {closesGaps: 1, opens: 1, cheap: 0.5}
  - off: true                             # off without being deleted — the point of a playground
    order: [audit, hire]
```

Exactly one instruction per rule. A rule with nothing in it is dropped, but one that
is merely `off` is a rule you are still holding. Adding a kind adds a case; it never
reshapes the file.

#### How the rules fold

`compilePlan` walks the live rules in order: later rules WIN on scalars (`weights`,
`capacity`) because editing a policy means appending to it; `boost` entries and
`exclude` lists ACCUMULATE, since a second exclusion cancelling the first would
surprise; every `order` rule adds its consecutive pairs as before/after constraints.
Order rules are constraints, not the answer: pinning three events leaves everything
else to be ranked around them, so a half-specified policy is usable rather than a
stub.

#### What is deliberately not here

Work — steps live in an event's guide, authored once with their own conditions and
dependencies; a plan schedules them and never invents them. Effort and negotiability
— facts about the work, authored with it; a policy reads them. Imposed events — you
have no say in them, so they are not ranked.

#### Where the engine lives

`packages/filekinds/src/lib/planDoc.ts` — `parsePlan`, `dumpPlan`, `ruleKind`,
`compilePlan`; its header comment is what `studio-check --spec plan` prints. The
planner is `playbookPlan.ts` — `effortDays`, `ratePerDay`, `frontier`, `scoreEvent`,
`tasksFor`, `operations`, `plan`. The view is `components/plan/PlanPreview.tsx`; the
checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

parsePlan reads the YAML once and never throws; the books and their guides are read, and the plan is computed.

### What is read, and what is drawn

The parse, the books, the guides, then the playground.

#### The parse

The title ("Plan"), `playbooks` (or the single `playbook`), `locks`, `horizon`
(120 when not a number), and the rules — `weights` keeping only numeric terms,
`boost` only numeric values, empty rules dropped unless `off`.

#### The books and the guides

Every book in `playbooks` is read relative to this file and MERGED the way the walk
merges them: the first book's head, every book's decisions, events and rules
concatenated. Then every guide a version-1 event shows — a `file` entry ending in
`.guide`, not a `by` set — is read; a missing guide costs its steps, not the plan.
A version-2 book contributes its events but no work, since its documents are written
in rather than files. No `playbooks`: "Set `playbooks:` to the books this plans
over." An unreadable book shows its error in red.

#### What is drawn

Left, "Policy · N of M live" with a "+" that adds an order rule, and one card per
rule in file order labelled by its kind — `order`, `exclude`, `boost`, `weights`,
`capacity` — an off rule dimmed; an order rule shows its events as numbered chips
(an event the books do not have in red) and, where the host writes, dashed "+
<event>" chips for every move not yet in the sequence; the others read "never: a, b",
"hire +2 · audit -1", "closesGaps 1 · cheap 0.5", "1 days of effort per day", and the
note in italics. "No rules yet. Everything is ranked by the defaults — add an order
rule to pin the parts you already know." Right, the plan the rules produce.

## The plan is computed

*imposed · many*

On open and on every edit — the frontier is ranked, the winner taken, the assignment moved, and the frontier recomputed.

### How the right-hand side is made

Simulated forward, never sorted once.

#### The frontier

The MOVES available here: events that are `chosen`, once-only, not already taken, not
excluded, not blocked by an order rule whose predecessor has not happened, and that
can arise under the current assignment (a version-1 `n/a` rule or a version-2 `when`
that does not hold takes an event out; a `gap` stays in — the work is finding out).
Operations (`arity: many`) never leave the frontier, so they are not ranked; they go
in the capacity budget.

#### The score

`closesGaps × w` (how many `gap` events stop being gaps once the event's `sets` move
the assignment) + `opens × w` (how many more events become available) − `effort ×
cheap` (the guide steps' effort in working days: `s`, `m`, `h`, `d`, `w`, `mo`;
unstated is half a day) + `boost`. Weights default to 1, `cheap` to 0. Ties keep
document order, so an unweighted policy reads as the book was written.

#### The winner, and the work

The top event is taken; its guide's surviving steps become tasks — effort over
capacity, dependencies inside one event serialised by `after`, everything else free
to weave — from the anchor a version-1 rule gives (`from` an event's finish, plus
`offset` days) and once per recurrence (`every` months, 21 days each) inside the
horizon. A task starting at or past the horizon is kept and marked dropped. The
winner's `sets` move the assignment and the frontier is recomputed; it stops when
nothing can be taken.

#### Ongoing load

Every operation that can arise: its rate per working day (`200/d`, `5/w`, `10/mo`)
times the effort of the guide steps the CURRENT answers select is its cost per day;
the sum over capacity is the utilisation. Over 1 means the plan is fiction.

#### What is drawn

A red box "Order rules that can never be satisfied" — `b waits on a`, or `a (no
such event)`. "Order · N moves", each with its score (hover: closes N gaps · opens
N · N.Nd). "Work · N tasks · N past the deadline" with `dN.N–N.N` day ranges, a
dropped task in red, `fixed` in amber. "Ongoing load · N% of capacity" with each
operation's share and rate, and "underwater — there is no time for the plan above"
past 100%.

## A rule is edited

*chosen · many*

The plan recomputes on every change; whether the file changes depends on the host.

> Say whether the host writes — the controls are the same; only where the edit goes differs.

### When `host=writes`

"+" adds an empty order rule; the eye turns a rule off and back on; the arrows swap it
with its neighbour; the bin deletes it. On an order rule, the "×" on a chip drops that
event from the sequence and a dashed "+ <event>" chip appends it — typing keys by hand
is how a rule silently names nothing, so the events come from the books. The other
kinds are edited as YAML. Every change is `dumpPlan` of the whole document
(`title`, `description`, `playbooks`, `locks`, `horizon`, `rules` with only the keys
each rule has; comments do not survive) handed to `onChange`; the host's autosave writes
it and the new text comes back as content. The plan on the right recomputes at once.

### When `host=reads`

The same controls appear only where the host passes `onChange`; a read-only host shows
the rules and the plan and keeps the "+" — an added rule, and any edit reached through
the YAML, lands in local state, the plan on the right recomputes, and the local text is
dropped the moment the host's content moves on. The file is never written from here.

## A file changes on disk

*imposed · many*

This file re-parses and the plan recomputes; the books are re-read only when their list changes.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The plan re-parses, local edits are dropped, and
the plan recomputes. The books and guides are read again only when the `playbooks` list
changes; a book edited elsewhere shows on the next open.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses and the books are not read.

### What the checker does

The order it runs in, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parsePlan` — it never throws. No summary line. The page does not know the plan
   kind.

#### Not checked

That the books exist. That an `order` names events the books have (the view marks a
stranger red and reports "no such event"). A rule dropped for carrying nothing. A
`horizon` that is not a number (120).

## A plan is written

*chosen*

### Write a plan

From the template to a policy tuned against the plan it produces.

#### Start from the template

`studio-check --template plan > new.plan`:

```yaml
title: new
description: A policy over a playbook, and the schedule it produces.
playbooks:
  - some.playbook
locks: []
horizon: 120
rules:
  - note: Rules are a list; each carries one instruction.
    capacity: 1
```

#### Point it at the books

Every version-1 book whose events and guides the plan should schedule, relative to
this file. Set `locks` to where you stand today.

#### Pin what you already know

One `order` rule naming the events in sequence; leave the rest to the ranking.
Exclude what you will not do; boost what a formula misses.

#### Tune against the right-hand side

Turn a rule off and watch the order move; raise `cheap` to prefer small events
first; set `capacity` to the days you really have and read the utilisation.

#### Check it

`studio-check new.plan` — only YAML can fail. The view is the check that matters: a
red chip is an event the books do not have; a red box is an order that can never
hold.
