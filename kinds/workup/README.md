# How a version-1 workup works

<!-- Generated from kinds/workup/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

The ordered steps one document's examination goes through, each producing one output file — the trail from the source through every landed analysis to the next step, statuses stepped by line replacement, templates stamped onto documents.

This is the `.workup` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Which role does the file play?** (`role`) — A `source:` decides it.

- `workup` — An examination. `source:` binds the steps to one document — this is that document's workup.
- `template` — A template. No `source:` — the regimen itself, stamped onto documents by a project bench.

## Always

*imposed*

What holds at every moment — the shape of the file, the two roles, where companions land, and where the engine lives.

### The shape of the file

One source, ordered steps, one output each.

#### Top-level keys

| key | what it is |
|---|---|
| `title`, `description` | the heading and one line under it |
| `source` | the document under examination; absent, this file is a TEMPLATE |
| `template` | the template this workup was stamped from — the way home |
| `outdir` | where relative outputs land; default `<stem> workup/` beside the file |
| `exports` | step keys whose landed outputs the outside sees; absent, everything landed |
| `steps` | the examination, in order |

#### A step

```yaml
steps:
  - key: extract                       # stable; outputs and runs hang off it (the label when absent)
    label: Extract the obligations
    instructions: "List every obligation the document imposes, one row each."
    output: obligations.list           # ONE file; relative = under the outdir
    status: pending                    # pending | running | done | failed; anything else reads pending
    note: free text
```

A step with neither `key` nor `label` is dropped.

#### Two roles

A workup WITH a `source` is that document's examination. Without one it is the
regimen: a template. Stamping a template onto a document copies the steps with every
status reset, titles the instance `<document stem> — <template title>`, sets `source`
and points `template` home, so the regimen can evolve and instances know where they
came from.

#### Companions, by convention

The workup of `/a/b/act.md` sits next to it as `/a/b/act.workup`, so "the analyses
of this file" needs no registry — the path is the link. Relative outputs land in
`/a/b/act workup/`, a sibling folder spelled with a space so it can never collide
with a versioned entry (a folder named exactly like a file). A relative `source`
resolves beside the workup.

#### The overall status

| rule | when | status |
|---|---|---|
| empty | no steps | `empty` |
| attention | any step failed | `attention` — a human before more running |
| done | every step done | `done` |
| in-progress | any step done or running | `in-progress` |
| otherwise | | `pending` |

The NEXT step is the first not done — a failed step is the next thing to look at.

#### Where the engine lives

`packages/filekinds/src/lib/workupDoc.ts` — `parseWorkup`, `dumpWorkup`,
`roleOfWorkup`, `statusOfWorkup`, `nextStep`, `workupPathFor`, `outdirOf`,
`outputPathOf`, `sourcePathOf`, `analysesOf`, `exportedAnalyses`, `setStepStatus`,
`instantiateWorkup`; its header comment is what `studio-check --spec workup` prints.
The view is `components/workup/WorkupView.tsx` over the shared `PaneTrail` and
`components/points/FileContentDialog.tsx`; the checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

parseWorkup reads the YAML once and never throws; the trail is laid out from the source to the next step.

> Say which role the file plays — an examination lays a trail; a template shows the regimen.

### When `role=workup`

**The trail.** A pane trail, left to right: the SOURCE pane — the title, a status chip
(`empty`, `pending`, `in-progress`, `attention`, `done`), the source's path with an
open-full button, the document itself rendered by its kind, and, when the host reports
agent runs, a bill so far (`N agent runs · 12.3k in · 2.1k out · $0.14 · 1m 12s`). Then
one pane per LANDED step — done with an output — titled by its label and showing the
output rendered by its own kind, so each analysis is a stage of its own. Then the NEXT
step: its label, `step N of M`, its status chip, instructions and note, and its body —
"Pending.", "Running — the output has not landed yet.", or "Failed — needs a human
before it needs more running.", with "The output lands at <path> when this step
completes." or "No output declared — this step leaves no analysis behind." When every
step has landed the trail ends on the Examination pane: "Examination complete — every
step landed its output" and the analyses listed with their paths; "No steps yet" when
there are none; "Steps completed without declared outputs — nothing to list."

Steps whose turn has not come stay out of sight. Moving forward collapses the previous
pane to its rail, like every other drill in the suite. "No source declared — this
workup examines nothing yet." when the source is empty.

### When `role=template`

**The trail** starts on the SOURCE pane with a violet "template" chip and "A regimen —
no source of its own. The project bench stamps it onto documents." in place of a
document; then, since no step has landed, the first step as the next one — its label,
`step 1 of M`, status, instructions — and the trail continues as an examination would,
for reading the regimen through. Nothing is examined.

## A status chip is clicked

*chosen · many*

One click steps the status; the file is edited by line replacement, never parse-and-dump.

Only where the host passes `onChange` — the Studio's surface, the desktop app, VS Code,
a project pane with a writer — and never while the step is running. The cycle is `pending
→ running → done → failed → pending` (the tooltip says "Click: pending → running").
`setStepStatus` finds the step's block — from its `- key:` line to the next line at the
same indent or shallower — and replaces its `status:` line, or inserts one right after
the key line when the block has none; every comment elsewhere survives. The text goes to
the host's `onChange`, its autosave writes it (800 ms debounce), and the trail is rebuilt
from the new content: a step stepped to done with an output becomes a landed pane, and the
next pane moves on.

## A step is run as an agent session

*chosen · many*

Only in a host that runs steps; the output lands when the session finishes.

A host that passes `onRunStep` (the Workup Studio) shows a green play button on the next
step: "Run this step as an agent session — the output lands when it finishes". The host
reports the run's telemetry and the pane shows it — "agent running · 1m 12s · <model>"
with a live clock, "run failed — <error>", or `12.3k in · 2.1k out · $0.14 · 1m 12s`
once done — and the source pane sums every landed run. The output file appears at its
path and the step's status follows. Without a runner there is no button.

## An open-full button is clicked

*chosen · many*

The source or an analysis, full size, in the file-content dialog.

The file-content dialog renders the file by its kind — a PDF in a frame, a `.docx` as
text, any Studio kind through its preview — titled "Source" or the step's label. Nothing
is written.

## A template is stamped onto a document

*chosen* — only when `role=template`

A project bench copies the regimen beside the document.

`instantiateWorkup` makes a new workup at `workupPathFor(source)` — beside the document,
named after its stem — titled `<stem> — <template title>`, with `source` set, `template`
pointing at this file, and every step copied with its status `pending`. The template is
untouched; edit it later and every instance still knows where it came from.

## The file changes on disk

*imposed · many*

The host re-reads; the trail is rebuilt from the new statuses.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text — the view's own status edits
included — and the Studio re-reads unless its autosave is dirty, saving or in error. The
workup re-parses and the trail is laid out again: landed panes stay as long as their
steps are done with an output; the open dialog stays. An output file landing on its own
shows when the pane that renders it is drawn.

## Another kind reads the analyses

*imposed · many*

The outputs are ordinary files; the workup says which of them count.

- A project shows the exported analyses — landed outputs, narrowed by `exports` when
  declared — as children of the source's node.
- A points stream's stage, or a distillation run, reads the source with its analyses
  beside it, since the path is the link.
- A classify step's `.list` output stamps typed fields onto rows, which is where a list's
  filter dimensions come from.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses.

### What the checker does

The order it runs in, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseWorkup` — it never throws. No summary line.

#### Not checked

That the source exists. That a landed output exists at its path. Two steps with one
key (status stepping edits the first). A `status` outside the four (it reads
`pending`). A step dropped for having neither key nor label.

## A workup is written

*chosen*

### Write a workup

The regimen once, then an instance beside each document.

#### Start from the template

`studio-check --template workup > new.workup` — two steps (extract, audit) with
instructions and outputs, `source` and `outdir` commented out.

#### Write the steps in order

A stable `key`, the `instructions` an agent or a person follows, and ONE `output`
file of an ordinary kind — `.list` for rows, `.brief` for prose.

#### Leave `source` out

Without a source the file is the template; a project bench stamps it onto documents
and each instance points back with `template`.

#### Name the source, beside it

Save the file as `<document stem>.workup` next to the document and set `source` to
the document's name; relative outputs land in `<stem> workup/`.

#### Check it, then step it

`studio-check new.workup` — only YAML can fail. Open it and click a status chip as
each step lands; the trail grows a pane per analysis.
