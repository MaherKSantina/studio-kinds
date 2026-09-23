# How a brief works

<!-- Generated from kinds/brief/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

A titled tree of sections, each with a one-line description, a markdown body and, where it holds one, a document of another kind written in — what the parser keeps, what a click shows, where a brief turns up inside other kinds, and what the checker judges.

This is the `.brief` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**How wide is the surface it renders in?** (`width`) — Measured on the component itself, not the window — a narrow trail pane on a big monitor is narrow.

- `wide` — 480px or more. The tree and the selected section stand side by side.
- `narrow` — Under 480px. The tree fills the width; a section's content opens as the next step.

## Always

*imposed*

What holds at every moment — the shape of the file, what a section is, and where the engine lives.

### The shape of the file

*Three top-level keys and one recursive node shape. A brief names no other file.*

#### Top-level keys

| key | what it is |
|---|---|
| `title` | the heading; "Untitled brief" when absent |
| `description` | **not drawn** — a one-line summary of the brief, read and kept on a dump. A section's own `description` is drawn; this one never is |
| `sections` | the tree: a list of sections, each the same shape at any depth |

`features` and `items` are read in place of `sections`, so a features payload pasted
in as-is is a brief. There is no version line: a brief has one shape.

#### A section

```yaml
sections:
  - title: Money                # also read as `name` or `heading`
    description: One line under the title.
    body: |                     # markdown; also read as `prose`
      Bootstrapped. A **business account** opens the day the company does.
    children:                   # the same shape, nested; written last on a dump
      - title: Banking
        body: One account, one card.
```

A section has no id. Its handle is the chain of titles above it
(`Money › Banking`), which is why a diff over two briefs reports a renamed section
as a removal plus an addition rather than pretending to track it.

#### A document in a section

```yaml
sections:
  - title: The master is read
    body: What happens, in prose.
    content:                    # one document of another kind, written here
      kind: playbook            # any kind the Studio knows — brief, kanban, guide, policy, jsonl, md, …
      doc:                      # the document, exactly as a file of that kind would hold it
        version: 2
        events:
          - key: missing
            label: The master playbook is missing
            content: {kind: md, doc: The missing note goes out, exit 0.}
```

`content` is one mapping: `kind` names the engine that renders `doc`, since there is
no file extension to pick it from; `doc` is that kind's YAML, or a block string for
`md`. One document per section — a section that needs two has two children. The
document has no path: nothing is read from disk to show it, so it carries no
annotations and is never pinned, and a document two briefs share is written in each.
The kind's own viewer draws it under the section's prose; the kind's own engine
checks it. Refused: a `content` that is not a mapping, one without `kind` or without
`doc`, an `md` document that is not a string, and `by`, `docs` or `file` on it — a
brief has no answers to vary by and names no file.

#### Provenance keys

A brief that arrived through an applied diff carries marks the viewer colours:

| key | read as |
|---|---|
| `change` | `add`, `edit` or `remove` — the chip at the end of the tree row |
| `__change` | the diff engine's spelling of the same; `delete` reads as `remove` |
| `__op` | which change did it; kept in memory as `opId`, never written back |
| `__note` | why the section changed |
| `__was` | the previous `body` (or `prose`) and `description` |

Any other key on a section — an id, a tag — survives a round trip through the
viewer untouched, so a hand-added key is not eaten the first time the tree is saved.

#### Not a brief

A file with no section list but `select: {epic: N}` is a LENS over Shortcut, not
authored prose: `briefLensOf` recognises it and the kit leaves it to a host that
resolves lenses. A file carrying `sections` is never a lens, whatever else it holds.

#### Where the engine lives

`packages/filekinds/src/lib/briefDoc.ts` — `parseBrief`, `dumpBrief`, `withSections`,
`flattenBrief`, `briefLensOf`, `briefProblems`, `writtenSections`; its header comment
is what `studio-check --spec brief` prints. The node shape is `featureTree.ts`. The
written-document shape — `kind` + `doc`, the synthetic path, the text a renderer
takes — is `writtenDocument.ts`, shared with the playbook. The viewer is
`components/brief/BriefViewer.tsx`, registered under `.brief` in
`lib/filePreviews.tsx`; a written document is drawn through
`components/WrittenDocumentView.tsx`; the checker is `python/studio_kinds/kinds/brief.py`.

## The file is opened

*imposed*

parseBrief reads the YAML once and never throws; the tree is drawn with every root open and the first section selected.

**The parse.** An empty file, a YAML error, or a root that is not a mapping reads as an
empty brief — no title, no sections — so a half-written file still renders. For every
section: the first non-empty of `title`, `name`, `heading` is the name; `description`
is kept when non-empty; the first non-empty of `body`, `prose` is the prose; `content`
is kept when it is a mapping — its `kind` lower-cased with a leading dot dropped, its
`doc` as parsed, whatever shape, for the kind's own engine to judge; `children` is kept
only when it holds at least one mapping. A list entry that is not a mapping is dropped.
A value that is not a string reads as empty.

**The surface.** In the Studio, the desktop app and VS Code there is one surface per
document — the kind's preview, inside `DocumentPreview` — so this viewer is what opens,
with no authoring editor beside it. The strip above it carries the file's name and a
"Notes" pill when an annotations sidecar sits beside the file.

**What is drawn.** A header with the title ("Untitled brief" when there is none) and
nothing else — the brief's own `description` is not drawn. The tree, with every root
open: the roots' children show, and anything deeper stays folded until its chevron opens
it; a row with children carries a chevron. The section at path `0` is selected: its name
("Untitled" when empty), the section's `description` (drawn, unlike the brief's), its
prose rendered as markdown — or "No prose on this section." when it has neither prose nor
a document — and, when it holds a document, that document under the prose, drawn by its
own kind's viewer. A brief with no sections shows "No sections yet" in the tree, and at
480px or more the content pane beside it shows "Select a section". A `change` mark draws
a chip at the row's end: green `add`, amber `edit`, red `remove`.

**The width.** A `ResizeObserver` on the component decides the layout the moment it
mounts: 480px or more splits the tree and the content; under it the tree takes the full
width. It is the component's width, so half a desktop trail still splits and a phone
never does.

## A section is clicked

*chosen · many*

The label selects; the chevron only folds. Nothing is written.

> Say how wide the surface is — the same click opens the section beside the tree or as the next step.

### When `width=wide`

The row's label selects the section: the right pane shows its name, description and
prose, and under them the document written in it, drawn by that kind's own viewer —
markdown, a brief and a guide at their natural height, any other kind in a box of its
own that lays out and scrolls as a pane would. The chevron is its own target — it opens
or closes the children and never changes the selection. Which rows are open and which
is selected live in the viewer's state for the session; the file is untouched.

### When `width=narrow`

The row's label selects the section and, when the section has prose, a description or
a document written in, opens it as the next step:

- **Inside a pane trail** — a points store, a workup, a project lens, any host that
  passes `onDrill`: a pane keyed `section:<path>` and titled with the section's name
  opens in the trail, holding the description and the prose.
- **Standalone**: the content replaces the tree in place, behind a "‹ back" chip that
  returns to it.

A section with neither prose, description nor document only becomes selected. The
chevron only folds. Nothing is written.

## The file changes on disk

*imposed · many*

The host re-reads; the viewer re-parses and keeps its place where it can.

Every host watches the file: the desktop app's recursive watcher (250 ms debounce per
path, then `studio:fs-changed`), the web folder entry's server events, VS Code's own text
document (a "content" message unless the change was the webview's). The Studio re-reads
unless its autosave is dirty, saving, or in error, so an open document refreshes from
disk by itself.

The viewer re-parses the new text. The selected path stays — section `0.1` stays
selected while it exists; a path that no longer exists falls back to the first section.
The folded state stays too, which means a root section that arrives after the open
starts folded. A narrow in-place detail closes on any change to the content.

## Another kind shows it

*imposed · many*

The brief is the prose kind other documents point at; each renders it through the same viewer.

### Where a brief turns up

*Five places a brief is opened by something other than its own file.*

#### A section of another brief

A section written as `content: {kind: brief, doc: {title, sections}}` holds a whole
brief, drawn under the section's prose through this same viewer, at its natural
height. Any depth: that brief's sections may hold documents of their own.

#### A kanban task

`file: notes.brief` on a task opens the whole brief in the task dialog, rendered by
kind. `section: Banking` beside it opens only the first section whose title contains
that text, as a brief of one root.

#### A playbook event

A version-2 playbook writes a brief in as `content: {kind: brief, doc: {title, sections}}`.
The walk renders it through this viewer under the synthetic name `inline.brief`, with
no file on disk, and the playbook's checker runs `parseBrief` over it, named
`event <key>: <label> (brief)`.

#### A points store, a workup, a list

A row that names a `.brief` opens it whole in the file-content dialog, by kind. A
workup step whose output is a brief (`audit.brief`) lands one beside the source and
opens it the same way once the step has run.

#### A definition

A slot with `kind: brief` expects its fill to be one; the instance opens the fill by
path, and a project shows an exported slot's fill as a child of the node.

## studio-check runs on it

*imposed*

One file in, one verdict out — the YAML, what a section's content cannot be, and every written document through its own kind.

### What the checker does

*The order it runs in, the summary line, and what it leaves alone.*

#### In order

1. Parse the YAML — a parse error is the only problem reported; the page adds its line.
2. `parseBrief` — it never throws, so the prose and the tree never fail here.
3. `briefProblems` — a `content` that is not a mapping; one without `kind` or
   without `doc`; an `md` document that is not a string; `by`, `docs` or `file` on
   it. Each named by the section's title chain: `section Money › Tax: …`.
4. Each written document through its own kind's check, named
   `section <title chain> (<kind>)` — a broken playbook in a section fails the brief,
   and a kind the checker does not know is a problem of its own.

#### The summary line

Every section at every depth, then the written documents when there are any:
`N sections` or `N sections, M documents`.

#### Not checked

A section with no title (it renders as "Untitled"). An empty `sections` list. A
body that is not a string (it reads as empty). Whether `children` sit where they were
meant to, or a written document where it belongs. The checker judges the file, never
the prose.

## A brief is written

*chosen*

### Write a brief

*From the template to a tree the viewer draws — one file, nothing beside it.*

#### Start from the template

`studio-check --template brief > new.brief`, or Ctrl+N in the Studio, or a project's
"New file". It is three keys and one section:

```yaml
title: new
description: ""
sections:
  - title: First section
    body: ""
```

#### Write the sections

One `title` per section, `description` for the line under it, `body` for the prose
as a block string. Nest with `children`, to any depth. Write `title`, not `name` or
`heading` — all three are read, but a dump writes `title`.

#### Write a document into a section

Where what a section holds is a document of another kind — the moments that can
arise while a step runs are a playbook, the work it tracks is a kanban — write it in:
`content:` under the section, `kind: <kind>`, then `doc:` holding the document
exactly as a file of that kind would. A block string for `md`. Indentation is the
only thing to get right; the kind's own checker judges the rest.

#### Put the hierarchy in the order it reads

The tree opens every root and selects the first section, so the first root is what a
reader sees first. A section that is only a heading over its children needs no body.

#### Check it

`studio-check new.brief`. The YAML, a section's `content`, and every written
document through its own kind can fail. Then open it: a section that shows as
"Untitled" was parsed but is missing its `title` key.
