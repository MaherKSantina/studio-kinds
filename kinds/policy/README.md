# How a policy works

<!-- Generated from kinds/policy/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

One extension, three documents — the bucket machine, a tags policy and an order policy — how the file's role is picked, what each role draws, what each click does, and why the rules carry nothing about the data they run over.

This is the `.policy` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Which role does the file play?** (`role`) — Picked from the text before anything is drawn — see "How the role is picked" under Always.

- `bucket` — The bucket machine. No `role`, no `policy`+`items` — params, an ordered switch of cases, buckets. The default.
- `tags` — A tags policy. `role: tags` — dimensions with derive rules; stage one of the chain.
- `order` — An order policy. `role: order` — a ranking over tag combinations; stage two of the chain.

## Always

*imposed*

What holds at every moment — how the role is picked, the shape of each, the one clause vocabulary, and where the engines live.

### The shapes of the file

Three documents share the extension; the text decides which one it is.

#### How the role is picked

In this order, before anything is drawn:

1. `role: tags` (or `role: decisions`) → a tags policy; `role: order` → an order
   policy.
2. Anything else → the bucket machine.

The parser never throws in any branch. Whichever role it plays, the file carries its
own rules and the dimensions they read, and NOTHING about the data they will run
over: `role: table`, `policy:`, `items:` and `map:` are named as gone, and a `tags:`
that is a path instead of the dimensions is too.

#### The bucket machine

```yaml
title: Triage
params:
  - {key: name, label: Name, type: string}      # string (default) | number | boolean
buckets:
  - {key: "yes", label: "Yes", start: "09:00", end: "10:30"}   # start/end optional — a timeslot
  - {key: "no", label: "No"}
default: "no"                                   # omitted = the built-in "unmatched"
cases:                                          # an ordered SWITCH; first match wins and stops
  - label: The first filter
    when: [{param: name, op: not_empty}]        # ALL clauses must hold; empty = always
    bucket: "yes"
```

Deterministic: no dates, no randomness, no IO. A case without a `bucket` is dropped;
a clause without a `param` or with an unknown `op` is dropped from its case — the
switch stays strict so it never guesses.

#### A tags policy

```yaml
role: tags
title: Lead facts
params: [{key: text, type: string}]
tags:                                   # `decisions:` reads the same
  - key: platform
    label: Platform
    values: [ios, android, {key: other, label: Other}]
    derive:                             # ordered; first match tags; no `when` = the default
      - {value: ios, when: [{param: text, op: contains, value: [swift, ios]}]}
      - {value: other}
  - key: fit
    label: Fit
    values: [good, poor]
    from:                               # COMPUTED from dimensions ABOVE it — refs, or a mapping
      - {value: good, when: {platform: ios}}
      - {value: poor}
    hidden: true                        # plumbing: tags, but Input panes skip it
```

A clause in `derive` without an `op` means `contains`. A `from` mapping value may be
a list — `{seniority: [senior, unstated]}` — the value-OR ref `seniority=senior|unstated`.

#### An order policy

```yaml
role: order
title: What to chase first
tags:                       # the dimensions this ranking reads, written in
  - key: platform
    label: Platform
    derive:
      - {value: ios, when: [{param: text, op: contains, value: swift}]}
      - {value: android}
order:                      # best first; position IS rank; first match wins
  - {label: iOS, when: [platform=ios]}
  - {when: [platform=android]}
  - {}                      # no refs: everything left — least priority IS excluded
```

The dimensions are in the file, in the same shape a tags policy declares them, so
the ranking says what it ranks over and a ref naming a dimension or a value it does
not declare is a problem. There is no veto lane. Items nothing claims are UNRANKED —
parked, never discarded — which only happens without a catch-all entry.

#### The clause vocabulary

One vocabulary everywhere a clause is written — cases, derive rules, a pipeline's
rules and filters, a memory's include: `equals`, `not_equals`, `contains`,
`not_contains`, `starts_with`, `ends_with`, `matches` (regex, case-insensitive), `gt`,
`gte`, `lt`, `lte`, `between` (`[low, high]`, inclusive), `in`, `not_in`, `is_empty`,
`not_empty`, `is_true`, `is_false`. String matching is case-insensitive; a text op
takes one value or a list (any of them; none of them for the `not_` ops); an empty
value is unknown, so numeric clauses fail on it; a bad regex simply fails. YAML
booleans as values read as `yes`/`no`.

#### Where the engines live

`python/studio_kinds/kinds/policy.py` — `parse_file`, `bucket_problems`,
`tag_problems`, `gone_problems`, `role_of`, `slot_minutes` — over the one clause
vocabulary in `_rows.py` (`Clause`, `clause_holds`, `holds_all`, `read_clauses`); its
header comment is what `studio-check --spec policy` prints, and the shape is
`kinds/policy/v1.schema.json`. The view is `components/policy/PolicyView.tsx`, which
hands the chain roles to `TagsPolicyView` and `OrderPolicyView`.

## The file is opened

*imposed*

The role is picked, the parse never throws, and the role's own view is drawn — with nothing read from disk.

> Say which role the file plays — each is parsed and drawn differently.

### When `role=bucket`

**The parse.** `parsePolicy`: the title ("Policy" when absent), the params (a `key` is
required; `type` other than `number` or `boolean` reads as `string`), the cases (a
`bucket` is required; each clause needs a `param` and a known `op`, else it is dropped
from the case), the buckets (a `key` is required; `start`/`end` kept only as `HH:MM`),
and `default`.

**What is drawn.** Three panes under the title. "Input parameters": one field per param
— a checkbox for a boolean, a number box, a multi-line text box — or "No params
declared.", and "Apply policy". "Switch — first match wins": every case numbered, its
label (or "case N"), a `→ bucket` chip, and its clauses as `when name not empty` lines
("always" for none); under them a dashed "no case matches → <default>" row. "Buckets":
"Apply the policy to an input — it lands here, grouped by bucket." until something is
applied. Nothing is read from disk.

### When `role=tags`

**The parse.** `parseTagsPolicy`: `tags` (or `decisions`) → dimensions with a `key`
(required), label, detail, values (a bare string, or `{key, label, detail}`), `derive`
rules (a `value` is required; clauses lenient — no `op` means `contains`, an unknown op
drops the clause), `from` rules (refs, or a mapping; a list value becomes a value-OR
ref), and `hidden`. The params are read the bucket machine's way.

**What is drawn.** The header: the title and "tags policy — rules are tested top to
bottom within each dimension; the first match tags it". One card per dimension: its
label, one chip per value, "computed" when it has `from` rules ("Computed from the
answers of the dimensions above it, not from the item's params"), "hidden" when it is
plumbing, its detail, then the rules numbered — a clause line in monospace (or the refs
in the dimensions' words for a computed rule; "otherwise (default)" for a rule with
none) and a `→ value` chip; "No rules — this dimension is never tagged."; "no rule
matches → untagged" when no rule is a default. Under the cards, "What it reads": the
params with their types. Nothing is read from disk.

### When `role=order`

**The parse.** The title ("Order"), the dimensions under `tags` (read exactly as a tags
policy's), and the entries — label, detail, `when` as refs or a mapping (a list value →
value-OR).

**What is drawn.** The header: the title and "order policy — tag combinations ranked,
position is priority". Left, "Input — tags": "pick values to watch where the combination
ranks", then the visible dimensions as playbook-style pills. Right, "Output — the order,
best first": every
entry numbered with its label, one chip per ref (`Platform: iOS`, "or" for a value-OR
ref), and its detail; "anything" for an entry with no refs; "No entries — nothing is
ranked." when empty; and, only when no entry is a catch-all, a dashed "anything left —
unranked, parked" row.

## An input is applied

*chosen · many* — only when `role=bucket`

The form is sent through the switch; the item lands in its bucket; nothing is written.

The form's values become one input — a boolean from its checkbox, a number from its box
(empty stays empty, and a numeric clause then fails), text as typed. `applyPolicy` walks
the cases in order; the first whose clauses all hold wins and the switch stops; none, and
the item takes `default` (or "unmatched"). The winning case lights up in the middle pane
(or the dashed "no case matches" row). The item joins the right pane under its bucket's
heading, labelled with the first string param's value (or "item N") and `case N` or
"default". Apply again and the items accumulate — the same 1-D grouping a project gets
as a list of items sorted by the switch. "clear" empties them. The file is untouched.

## A combination is picked

*chosen · many* — only when `role=order`

Tag pills build a combination; the order says where it lands.

Each pill click takes or drops one answer (one per dimension). With any answer taken,
`applyOrder` walks the entries top to bottom; the first whose refs all hold — a value-OR
ref holding when any alternative is taken — "claims it" and is outlined; an entry lower
down that would also hold reads "also matches" ("the order stops at the first match");
entries that accept every chosen answer but are not yet satisfied are lightly outlined
as candidates; with nothing claiming it, the dashed row reads "lands here". "clear" drops
the answers. The dimensions the pills show are this file's own, so what a combination
means is read here and nowhere else. Nothing is written.

## A value is clicked

*chosen · many* — only when `role=tags`

The rules that produce that value stay bright; the others dim.

"Where does Platform = iOS come from?" is one click: the value's chip turns solid and
every rule in the card that does not yield it fades, so the ordered rules that produce it
read on their own. A second click clears it. One value per card; nothing is written.

## Another kind applies it

*imposed · many*

A policy is rules; the data lives wherever the data is, and the two never meet in a ref.

### Who applies a policy

The same engines, called from other kinds.

#### A pipeline

A `.pipeline` holds its items, the rules that amend them, the filters that drop them
and the sorts that order them — the same clause vocabulary, written where the rows
are. Rules over rows live with the rows; a policy is the rules that are ABOUT
nothing in particular.

#### A memory

A `.memory`'s `decisions` block declares dimensions the same way a tags policy does —
the same `derive` rules and clause engine decide which focus a unit falls under.

#### A collection

A `.collection` is where a ranking comes FROM: its decisions log the reasons a later
policy is written to reproduce.

## A file changes on disk

*imposed · many*

This file re-parses and the role is picked again; there is nothing else to read.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The file re-parses and its role is picked again;
everything it draws came with the text, so an edited rule shows at once. The bucket
machine's applied items, the order view's combination and the tags view's highlight are
state and stay.

## studio-check runs on it

*imposed*

One file in, one verdict out — the bucket machine and the chain roles each have their own problem list.

### What the checker does

The order it runs in, the summary line, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `role: tags` or `role: order` → the dimensions: one with no `key`, a duplicate
   key, a dimension with no rules, a rule with no `value`; and, for an order policy,
   every entry's refs against the dimensions this file declares. Summary `tags
   policy: N dimensions` / `order policy: N dimensions, N ranked entries`.
3. Anything else → the bucket machine: the field table's required rows and every
   fallback the lenient parser takes. For the bucket machine: no `title`; a param with
   no `key`, a duplicate key, or a `type` outside string / number / boolean; a bucket
   with no `key`, a duplicate, or a `start`/`end` that is not `HH:MM`; a `default`
   that is no declared bucket; no `cases`; a case with no `bucket`, a bucket no
   `buckets:` entry declares (when any is), no `when` (write `when: []` to say
   "always"); a clause with no `param`, a param `params:` does not declare (when any
   is), no `op`, an `op` outside the vocabulary — each of these drops the clause, and
   a case with no clauses left matches EVERYTHING, so the line says so — or a `value`
   the op cannot use: `gt`/`gte`/`lt`/`lte` without a number, `between` without
   `[low, high]`, `in`/`not_in` without a list, `is_*`/`*_empty` with one, a text op
   without one.
4. In every role, the keys that made a policy read another file: `role: table`,
   `policy:`, `items:`, `map:`, and a `tags:` that is a path.
5. The summary line: `N params, N cases, N buckets, default x` for the bucket
   machine.

#### Nothing beside it

There is nothing beside a policy to read: the rules and the dimensions they name are
in the file, so the verdict is the same wherever it is checked. Not checked: a derive
rule's unknown op (the clause is dropped, and the rule still tags).

## A policy is written

*chosen*

### Write a policy

From the template to rules that run — the role decides the shape.

#### Start from the template

`studio-check --template policy > new.policy` — the bucket machine, with one param,
two buckets, a default and one case. Every other role starts from it by replacing
the body.

#### Write the params, the buckets, then the cases in order

Declare every param the clauses read, every bucket a case names, and the cases from
most specific to least — the first match wins and stops. Give buckets `start` and
`end` when the buckets are timeslots in a day.

#### Split the criteria from the judgement

A tags policy (`role: tags`) with one dimension per fact and ordered derive rules, a
default rule last, for what an item IS; then an order policy (`role: order`) for what
to do about it — its own `tags:` dimensions written in, its entries best first, and a
catch-all `{}` at the bottom so nothing is parked.

#### Check it

`studio-check new.policy` — each role prints its problems and a summary line; a
misspelled `op`, an undeclared param or bucket, a case without a bucket, a dimension
with no rules, a ranking's ref to a dimension it does not declare are each one line
naming where. Then open it and pick a combination.
