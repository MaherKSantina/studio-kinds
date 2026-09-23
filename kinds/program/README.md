# How a version-1 program works

<!-- Generated from kinds/program/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

Code as execution — what it reads from the store, what it writes back, the code between, and a Run button that executes it on the host's runner with the outputs landing in the store.

This is the `.program` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Does the host have a runner?** (`host`)

- `runner` — Yes — the nodes worker is configured. Run executes the program; the result panel shows exit, stdout, stderr and the output handles.
- `none` — No runner. The same page, read-only; Run is disabled and says to open the file in Nodes.

## Always

*imposed*

What holds at every moment — the contract, why it is the only doorway, and where the engine lives.

### The shape of the file

A contract and the code it bounds.

#### Top-level keys

```yaml
title: Timesheet → shift-notes CSV
description: one line
language: python                  # the interpreter family; default python
inputs:
  - {handle: /Fatin/timesheet.xlsx, as: timesheet.xlsx}   # `as` defaults to the file name
outputs:
  - {from: converted.csv, handle: /Fatin/converted.csv}
code: |
  ...
```

A handle is an absolute store path; an input or output whose handle does not start
with `/` is dropped. `inputs` are materialised into the run's working directory
under their `as` names (bytes for binary nodes, text otherwise); the code runs there;
each output's `from` file is read back and written to its `handle` (an upsert).

#### Why the contract

The program never touches the store directly — the contract is the only doorway,
which is what keeps a run explainable and repeatable. It is the executable step of a
journey: a bounded, step-local transformer the person runs on demand, with the output
landing in the store as an ordinary node.

#### Where the engine lives

`packages/filekinds/src/lib/programDoc.ts` — `parseProgram`; its header comment is
what `studio-check --spec program` prints. The view is
`components/program/ProgramView.tsx`; the runner is the host's `configuredRunner`
(the nodes worker); the checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

parseProgram reads the YAML once and never throws; the contract and the code are drawn, with Run.

> Say whether the host has a runner — the page is the same; only Run differs.

### When `host=runner`

**The parse.** The title ("Program"), the description, the language lower-cased
(`python` when absent), the inputs and outputs with relative handles dropped, the code
(empty when absent).

**What is drawn.** The title, a chip with the language, a copy-handle button for this
file's path, and Run ("Execute the program on the nodes worker — outputs land in the
store"). The contract in a card: one line per input, `nodes:/path → as`, and per
output, `from → nodes:/path`; "No contract declared — the run would read and write
nothing." when there are neither. The code in a monospace block ("(no code)"). No
result yet.

### When `host=none`

**The parse.** The title ("Program"), the description, the language lower-cased
(`python` when absent), the inputs and outputs with relative handles dropped, the code
(empty when absent).

**What is drawn.** The same page — title, language chip, copy handle, the contract
card, the code block — with Run disabled and titled "This host has no runner configured
— open it in Nodes to run". The Studio, the desktop app and VS Code show it this way
unless a runner is wired in; nothing here writes.

## Run is clicked

*chosen · many* — only when `host=runner`

The runner executes the program by its path; the outputs land in the store; the panel reports.

The button reads "Running…" with a spinner while the runner is handed this file's path.
The runner materialises the inputs, runs the code in the working directory, reads each
output's `from` file and writes it to its handle. The panel then shows "Run succeeded" or
"Run failed" with `exit N · N.Ns`, one line per output handle written with an "open" link
into Nodes, the standard output, and the standard error in red. A failure to reach the
runner shows its message in red instead. The last result stays on the page until the next
run; the file itself is never changed by running.

## The file changes on disk

*imposed · many*

The host re-reads; the contract and the code redraw; the last result stays.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The program re-parses and the page redraws; the
result panel from the last run stays until Run is pressed again.

## A journey runs it

*imposed · many*

The program is the step a person presses play on.

A journey or a workup names the program as a step's file; the step opens this view in a
dialog, and the outputs — ordinary nodes at their handles — are what the next step reads.
A project lists it as an item like any document. Nothing runs it but a person pressing
Run.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses.

### What the checker does

The order it runs in, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseProgram` — it never throws. No summary line.

#### Not checked

That the input handles exist. That the runner knows the language (it refuses at run
time). That the code writes every `from` file. An input or output dropped for a
relative handle.

## A program is written

*chosen*

### Write a program

The contract first, then the code that honours it.

#### Start from the template

`studio-check --template program > new.program` — Python, one input `/input.csv` as
`input.csv`, one output `output.csv` to `/output.csv`, and code that copies the rows.

#### Write the contract

One input per store file the code needs, with the name it will open; one output per
file it writes, with the store path it should land on. Absolute handles only.

#### Write the code against the `as` names

Open inputs by their `as` names in the working directory and write outputs by their
`from` names; touch nothing else.

#### Check it, then run it in Nodes

`studio-check new.program` — only YAML can fail. Open it where a runner is configured
and press Run; read the outputs where everything else lives.
