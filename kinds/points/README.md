# How a version-1 points works

<!-- Generated from kinds/points/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

The points store — the pipeline under every document, from literature through distillation to points with cited keys; one pane per stage on a trail, a point's stream on click, files opened whole, connected streams stacked in dialogs.

This is the `.points` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Always

*imposed*

What holds at every moment — the shape of the file, what a point is, the roles a point plays, and where the engine lives.

### The shape of the file

Stages, connections and points; every key a claim with citations.

#### Top-level keys

| key | what it is |
|---|---|
| `title`, `description` | the heading and one line under it |
| `stages` | the pipeline, authored per stream; absent, the classic three — `literature`, `distillation`, `points` — from the `literature:` and `distillation:` blocks |
| `exports` | stage keys the outside sees — a project shows them as children of the points item |
| `connections` | edges to other streams: `{at: <stage key>, role: source | via | feeds, stream: x.points, label}` |
| `literature`, `distillation` | the classic shelves — `{file, label}` entries, or bare paths |
| `points` | the points |

#### A stage

```yaml
stages:
  - {key: sweep, label: Sweep, hint: The sites we looked at., kind: shelf, entries: [{file: seek.md, label: Seek}]}
  - {key: shortlist, label: Shortlist, kind: shelf, node: leads.list}      # a .list node feeds the entries live
  - {key: points, label: Points, kind: points}
```

`kind` is `shelf` (a list of files, each opening whole) or `points` (the points
list — exactly one; appended when forgotten and the file has points). A shelf's
`nodes` (or a single `node`/`source`) are references to shared nodes: one `.list`
feeds the entries, an `element` ref (`decision:<key>`, `event:<key>`,
`stage:<key>`) shows just that element, anything else renders whole; several list
the stage's inputs. Nodes are written by the streams that target them and read-only
here.

#### A point

```yaml
points:
  - id: p-annual-return-7f3a       # stable forever; references use this, labels are just keys
    label: The annual return
    type: obligation                 # the one lens it appears through; untyped is legitimate
    of: p-return-def                 # an INSTANCE: its keys fill that definition's slots
    defines: [due, fee]              # a DEFINITION: empty slots for instances to fill
    target: {file: company.playbook, element: event:file-return}   # the node this point IS
    keys:
      - {key: due, value: 12 months from incorporation,
         from: [{file: act.pdf, quote: "…within 12 months…"}],   # literature the claim is set FROM
         via: [{file: obligations.brief}]}                       # distillation it travelled THROUGH
    note: free text
```

A point starts as identity only — an id minted before its shape is known — and
accretes keys. A definition's own keys are facts about the general concept and are
NEVER inherited: nothing is overridable, there are no defaults. The demotion move
costs nothing: a point later found to be one manifestation of something general gains
`of` and keeps its id, so every reference survives.

#### The role of a point

| `defines` | `of` | role |
|---|---|---|
| yes | yes | definition · instance — a shape that shifted up a level |
| yes | no | definition |
| no | yes | instance |
| no | no | a point, itself |

#### Where the engine lives

`packages/filekinds/src/lib/pointsDoc.ts` — `parsePoints`, `dumpPoints`, `roleOf`,
`definitionOf`, `instancesOf`, `strayKeys`, `emptySlots`, `stageEntries`,
`exportedStages`, `distillationFiles`, `usesOfFile`, `filesBehind`, `mintPointId`;
its header comment is what `studio-check --spec points` prints. The views are
`components/points/PointsView.tsx` (the trail, the shelf and points panes, the
stream and node dialogs), `PointStream.tsx` and `FileContentDialog.tsx`, over the
shared `PaneTrail`; the checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

parsePoints reads the YAML once and never throws; the trail is laid out, one pane per stage in stage order.

### What the parser keeps, and what is drawn

The stages as positions on a trail; the points as a filtered list.

#### The parse

Authored `stages` are kept verbatim (a stage with neither key nor label is "Stage N";
a `kind` other than `points` is `shelf`), with a `points` stage appended when none
is declared and the file has points; otherwise the classic three, with their hints.
`exports` keeps only known stage keys, once each. A connection needs `at` (a known
stage), a `role` of `source`, `via` or `feeds`, and a `stream`. A point needs an
`id`; a key needs a `key`; a citation is a path or `{file, quote, label}`.

#### A shelf stage

Several entries: the stage's label and hint, then one row per file — its label (else
the path), a kind chip, the path, and "feeds N keys on N points" or "not cited yet"
(the citations run backward). ONE entry: the stage IS the document — a consolidated
header (the label, the kind chip, "feeds N keys · N points", the path, an open-full
button, the hint) and the document rendered by its kind filling the pane; a drill
inside it (a brief section, a guide step) stays in the pane behind "‹ back". A lone
node ref shows `node · <path>` as a chip; several show "N inputs" and list them, each
previewing in a dialog. Empty: "Nothing here yet." — or, for the classic
distillation stage, "No stages — literature went straight to points, which is
allowed." That stage also lists every `via` file a key cites that nobody declared.
The first pane carries the stream's own title and description unless it is a lone
document. Connection chips sit under the header: "⟵ output of: x", "from <previous
stage> via: x", "feeds: x ⟶".

#### The points stage

The label and hint ("Stable identities. Keys are claims with citations; definitions
declare slots their instances fill."), then the points as a list filtered by type
(pills per type, "untyped" as the fallback) with "Search points" over labels, ids and
keys. Instances sort under their definition, indented. A row shows the label (else
the id), "N keys" or "identity only", a type chip ("untyped" in italics: "Identity
before shape — it exists; nobody has typed it yet"), a role chip with its tooltip,
and the id. "No points yet — mint the first the moment something exists."

#### The trail

Moving forward collapses the previous stage to its rail, like every other drill in
the suite — one flat trail, one centred seek. With the `stage` prop (how a project
opens an exported stage) only that stage is on the trail; a point's stream and the
file dialogs still work.

## A point is clicked

*chosen · many*

The point's stream opens as the next pane — its keys, its definition, every citation, its siblings.

A pane titled with the point's label opens after the stages, reading bottom-up: the
instance's filled values, the definition whose slots they fill — declared slots not yet
filled listed as the honest gap list, keys outside the declared slots flagged as stray —
every key's citations back through the distillation files (`via`, grey) into the
literature (`from`, teal), quotes shown, each opening its file; and the sibling instances
that manifest the same definition, each a jump. A point with a `target` renders the
referenced node itself in place — the decision or event out of a playbook, or the file —
because the stream's output and the policy's child are one thing. Clicking the row again
closes the stream; a jump swaps the point. Nothing is written.

## A file is opened

*chosen · many*

A shelf row, a citation or an open-full button shows the file whole in a dialog over the trail.

The file, whole, by what it is: a PDF in the browser's own viewer over the raw bytes
(scroll, zoom, search), a `.docx` converted to HTML in the browser, a structured `.node`
folder in the split view, anything else through its kind's renderer or as plain text. The
title is the entry's label, with a chip "feeds N keys · N points" when the file is cited.
The bytes come from the host's raw file URL; text through the same reader every viewer
uses.

## A connection chip is clicked

*chosen · many*

The other stream, whole, in a dialog over this one — with this stream's stage as its visible boundary.

The connected `.points` file is read relative to this one and rendered with the same
view inside a dialog headed "stream · <label>". The connection decides which of THIS
stream's stages frame it: `via` puts the previous stage first as "input — <title>" and the
stage it lands on last as "output — <title>"; `source` adds the stage as the output;
`feeds` adds it as the input. A boundary pane lists that stage's files or points and opens
them against this stream's base. The opened stream's own connections open further
dialogs — streams chain by stacking, never by merging into one long trail.

## The file changes on disk

*imposed · many*

The host re-reads; the trail is rebuilt and the selected point kept by id.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The store re-parses; the selected point stays by
id (its pane closes if the id is gone); the open file dialog stays. A shelf file or a
referenced node edited on its own shows when its pane is next drawn.

## Another kind reads it

*imposed · many*

A stream's stages and points are data to projects, boards and playbooks.

- A project shows the `exports` stages as children of the points item and opens each on
  its own (`stage:<key>`); its DAG draws the stream's inputs → the stream → its point
  targets as production edges, and finds which point produced a policy node.
- A `.kanban` with `source: x.points` makes one task per point — the id its key, the label
  its title, the `status` key its column, the `description` key its body.
- A playbook drills a point's stream from an event it projects; a stage's `element` ref
  shows one decision or event out of a playbook here.
- A stream's output points target `item:N` of a `.list` and save documents into it; a
  workup's analyses sit beside their source, where a shelf stage lists them.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses.

### What the checker does

The order it runs in, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parsePoints` — it never throws. No summary line. The page does not know the
   points kind.

#### Not checked

That a cited or shelved file exists. That `of` names a point in this store. Stray
keys and empty slots (the stream pane shows them). A connection dropped for an
unknown stage or role. A point dropped for having no id.

## A points store is written

*chosen*

### Write a points store

Identity first; shape and citations as the literature says what things are.

#### Start from the template

`studio-check --template points > new.points` — the classic shape: empty
`literature` and `distillation`, and one point with an id, a label, no keys and a
note saying to type and key it once the literature says what it is.

#### Shelve the literature

`{file, label}` per source document beside the store, or declare `stages:` when the
pipeline is not literature → distillation → points.

#### Mint a point the moment something exists

An `id` that will never change (`p-<slug>-<4 chars>`), a label, `keys: []`. Type it
later; typing is a lens, not a requirement.

#### Add keys with citations

Every `key: value` with `from` naming the literature and, when it travelled through
a brief or a list, `via`. The distillation stage lists those files even undeclared.

#### Let the shape shift up when it does

When two points turn out to be manifestations of one thing, mint the definition with
`defines` and give each instance `of`; ids stay.

#### Check it

`studio-check new.points` — only YAML can fail. Open it: "not cited yet" on a shelf
row is literature nothing claims from; empty slots in a stream are the gap list.
