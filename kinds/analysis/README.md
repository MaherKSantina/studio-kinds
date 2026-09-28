# How an analysis works

<!-- Generated from kinds/analysis/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

A decision over closed inputs — the inputs and their values, the rules in precedence order that say what follows from each combination, and the output key that names the result; opened as a tree nested over the inputs in the order they are dragged into, narrowed by locking input values and pinning output values; read only, the order, the locks, the pins and the folds kept for the session.

This is the `.analysis` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Always

*imposed*

What holds at every moment — the shape of the file, how a combination is decided, what the tree is, and where the engine lives.

### The shape of the file

The inputs, the rules and the outcome — everything the tree is drawn from, in one file.

#### Top-level keys

| key | what it is |
|---|---|
| `title` | the heading |
| `description` | one line under it |
| `dimensions` | the inputs — name → the non-empty list of values it can take, in order |
| `rules` | in precedence order — each `label`, `when` over the inputs, `then` the outputs |
| `outcome` | the output key that names the result; `type` when absent |

```yaml
title: Message list banner
dimensions:
  party: [buyer, seller]
  offer: [none, sent, accepted]
rules:
  - label: Pay now
    when: {party: buyer, offer: accepted}
    then: {type: button, title: Pay now}
  - label: Waiting
    when: {party: buyer, offer: sent}
    then: {type: ribbon, title: Waiting for the seller}
  - label: Respond
    when: {party: seller, offer: "!none"}
    then: {type: ribbon, title: Respond to the offer}
outcome: type
```

A value is text, a number or a boolean, and a dimension repeats none. `then` is a
mapping of output key → value; the output keys of the document are the `outcome`
first, then every key any rule sets, first seen first.

#### How a combination is decided

A combination is one value of every dimension. The rules are read in order and the
FIRST whose `when` holds decides it: its `then` is the combination's output, an output
the rule does not set reading `—`. A combination no rule decides has `—` for every
output. `when` is a mapping of dimension → condition, every key of which must hold:
a bare value equals; `[a, b]` is one of; `"*"` is any; `"!x"` is not equal, on the
value's text. No `when`, or `{}`, holds always — a catch-all, which decides everything
the rules above it left, so a rule written under it is never reached.

#### The tree

Every combination, nested over the inputs in the order of the rail. A set of
combinations that one rule decides is a leaf — that rule's label, tinted by the value
of its `outcome`; otherwise the set branches on the first input in the order whose
values separate the leaves, or, when none does, on the first that varies, and children
that all reach the same leaf fold into one. An input the tree never branches on is one
that changes nothing here; the rail says "no effect".

#### Deliberately not a calculator

Outputs are literals and conditions are memberships: there is no arithmetic, no
expression, no derived value. The point is to see, for a decision the code will
make, which combinations of inputs lead where and which rules never fire — and to
stay cheap to author. Past 200,000 combinations the page stops enumerating and says so;
locking values brings the space back under it.

#### Where the engine lives

`python/studio_kinds/kinds/analysis.py` — `parse`, `decide`, `compile`, `problems`,
`summary`; its header comment is what `studio-check --spec analysis` prints. The shape
is `kinds/analysis/v1.schema.json` and the field table `v1.fields.yaml`. The view is
`components/analysis/AnalysisView.tsx` over `lib/analysisDoc.ts` (`parseAnalysis`,
`compileAnalysis`, `buildTree`, `buildKeptTree`, `matchTarget`, `analysisSummary`).

## The file is opened

*imposed*

parseAnalysis reads the YAML once and never throws; every combination is decided and the tree is drawn in the file's order.

**The parse.** The title, the description, the dimensions in the order written with their
scalar values (a repeat dropped), the rules with their `label` ("Rule N" when absent), `when`
and `then`, and the `outcome` ("type" when absent). A file that does not parse opens empty
with the error in red; a file with neither dimensions nor rules says what to write.

**What is drawn.** The title, and beside it `N dimensions · N combinations · N rules`. Then
the rail and three panels — side by side on a wide pane, stacked on a narrow one:

- **Order** — the rail: the dimensions in the order the tree nests them, the first marked
  `root`; each can be dragged, or stepped with the arrows; one whose value never changes an
  output reads `no effect`.
- **Inputs** — one row per dimension: `any` and each of its values as chips, none lit; under
  them the count of combinations.
- **Outputs** — one row per output key, the `outcome` marked ★: every value the rules write
  for it as a chip, and `(none)` for `—`; the outcome's chips carry a swatch of the tint its
  leaves take.
- **The tree** — the root input with `N values · N combinations`, its values down the left,
  each leading to a leaf — the deciding rule's label in its outcome's tint, `no rule` muted —
  or to the next input. The two levels under the root are open; deeper ones are folded.

Nothing here writes: no dialog, no editor, no save.

## A dimension is dragged in the rail

*chosen · many*

The tree nests in the new order — the top of the rail is the root; the order is the session's.

The dragged dimension takes the slot it is dropped on ("drop here for last" under the rail
puts it last), or moves one step with its arrows. The tree is rebuilt at once over the new
order: the root is the first input in the rail whose values separate the leaves, and so on
down. The locks, the pins and the selection stay; the folds are keyed by the path, so a path
that still exists stays folded. The order is the page's for the session — reopening the file
starts from the file's order, and **Reset** does the same at once.

## An input value is locked

*chosen · many*

Only combinations holding a locked value are enumerated; the count, the tree and "no effect" follow.

A value chip lit locks its dimension to that value; a second lit value widens the lock to
either; `any` clears it. Every locked dimension must hold, so the combinations enumerated
are the product of the locked values and the free dimensions' whole lists — the count reads
`N of M combinations match the locks`, and the rail badges the dimension `k of n`. The tree
redraws over those combinations alone, and "no effect" is judged among them: an input that
matters only when another is `seller` shows no effect once `buyer` is locked. Locking is
also how a space past 200,000 combinations is brought under the line. "clear locks" removes
them all; nothing is written.

## An output value is pinned

*chosen · many*

The tree keeps only the combinations whose output carries the pinned values; branches that never reach them are dropped.

A pinned value asks "which inputs lead here?". Within one output key any pinned value
satisfies; across keys every pinned key must — `type: ribbon` and `style: warning` together
is the warning ribbon. The tree is rebuilt from the combinations that reach the pins, a
branch none of whose combinations qualify dropped, the count reading `N reach the pinned
outputs`. Pinning `(none)` on the outcome shows the combinations no rule decides. When no
combination carries the pinned values together the pane says they never co-occur. "clear
pins" removes them all; nothing is written.

## A node of the tree is clicked

*chosen · many*

A chevron folds or unfolds a branch; an input or a leaf opens the Position panel for what holds there.

The chevron before an input folds its values away or opens them; the two levels under the
root start open, deeper ones start folded. Clicking the input's name, or a leaf, outlines it
and opens **Position** under the tree: how many combinations sit there; the inputs fixed on
the path down to it and the ones still free; every output key with each value it takes in
that region (the outcome's in its tints); and the rules deciding there. × closes it; a
different node replaces it. Folds and the selection are the session's.

## The file changes on disk

*imposed · many*

The host re-reads; the page redraws from the new text with the order, locks and pins reconciled.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The analysis re-parses and every combination is
decided again. The session's state is reconciled against the new text: a dimension that
vanished leaves the order and its locks, a new one joins the end of the order, a lock or a
pin on a value the file no longer has is dropped, a fold on a path that still exists stays.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses, so the checker names what it dropped, and the rules the space proves idle.

### What the checker does

The order it runs in, the summary line, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `problems`, in document order: not a mapping; no `title`; no `dimensions`, or one
   that is not a mapping; a dimension that is not a non-empty list, a value in it that
   is not text, a number or a boolean, a value repeated; no `rules`, or `rules` that is
   not a list; a rule that is not a mapping; a `label` that is not text; a `when` that
   is not a mapping, a key of it that is not a declared dimension, a condition that is
   not a scalar or a list of them, an empty list, a value not in the dimension (for
   `"!x"`, `x` as text); no `then`, a `then` that is not a mapping, an output that is
   not a scalar; an `outcome` that is not text, or one no rule's `then` sets.
3. When the space is 200,000 combinations or fewer, every combination is decided:
   a rule whose `when` holds for none `matches no combination`; one that holds for
   some but is never the first to `is never reached — every combination it matches is
   decided by an earlier rule`. A rule whose `when` was already faulted is not
   reported twice.

#### The summary line

`N dimensions · N combinations · N rules`, and `· N unmatched` when some combination
no rule decides — on the command line and in the Studio's strip alike. The
combinations are counted whether or not they were enumerated.

#### Not checked

Whether an input has an effect (the rail shows it). Whether the rules cover every
combination — an unmatched combination is a fact the summary counts, not a fault.
What the outputs mean to the code that will read them.

## An analysis is written

*chosen*

### Write an analysis

The inputs, the rules in order, the outcome — then read the tree.

#### Start from the template

`studio-check --template analysis > new.analysis` — two dimensions and four rules that
decide a banner; replace them.

#### Name the inputs and every value each can take

One entry per input the decision reads — who is looking (`party: [buyer, seller]`),
what state a thing is in — with its whole value list; the tree is over the product of
these lists, so a value the code can see belongs here even when no rule names it yet.

#### Write the rules from the most specific down

Each rule a `label`, its `when` over the inputs and its `then` — every output the code
will read, the `outcome` key among them. The first rule that holds decides, so the
specific case goes above the general one and a catch-all, with no `when`, goes last.

#### Name the outcome

`outcome` is the output key whose value IS the result — the kind of banner, the state
reached. Leaves take one tint per value of it, so choose the key whose values you want
to tell apart at a glance. `type` is assumed when the line is absent.

#### Check it, then read it

`studio-check new.analysis` — a rule that is never reached, a value no dimension
holds, an outcome no rule sets: each is a line. Open the file, drag the input you care
about to the top of the rail, and read which rule each combination reaches; pin an
output to see what leads there.
