# How a version-1 project works

<!-- Generated from kinds/project/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

The entry point of a project — a tree of items, a folder, or a working-memory lens, depending on its mode; children derived from the documents, production drawn as a DAG, files made from templates by hand or by Ask.

This is the `.project` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Which mode is the project in?** (`mode`) — The `mode:` key; absent means the item tree.

- `items` — The item tree. No `mode` — the classic container; items iconed by kind on the left, the selected one on the right.
- `directory` — A directory. `mode: directory` — the project IS the folder `root`; a file browser over it, files of any kind added as you go.
- `memory` — A working memory. `mode: memory` — the same material as a `.memory` lens, everything in Everything else until foci are authored.

## Always

*imposed*

What holds at every moment — the shape of the file, what an item is, how links are edges, and where the engine lives.

### The shape of the file

Items, links, and a mode.

#### Top-level keys

| key | what it is |
|---|---|
| `name`, `description` | the heading and one line under it |
| `items` | the tree |
| `links` | typed edges between items — the project's dependency DAG, as data |
| `mode` | `directory` or `memory`; absent, the item tree |
| `root` | the folder a directory project is |
| `memory` | the `.memory` lens a memory project shows; default `/memory/<name>.memory` |

#### An item

```yaml
items:
  - {label: Notes, file: notes.md}                 # one document, shown without its extension, iconed by kind
  - {label: Inputs, node: /Fatin/inputs}           # a whole nodes folder, as one item
  - {label: Shared, project: ../shared.project}    # another project — its exported items show as children
  - {label: Leads, file: hunt.points, stage: shortlist}   # one stage of a stream, standing alone
  - label: Legal
    items: [{file: incorporation.brief, export: true}]   # grouping; `export` shows it to referencing projects
```

Exactly one of `file`, `node`, `project`, `items` per item. A fresh directory project
is `name`, `description`, `mode: directory`, `root: /<name>`, `items: []`.

#### Links

```yaml
links:
  - {from: {file: act.pdf}, to: {file: act.workup}, kind: feeds}
  - {from: {file: hunt.points, stage: shortlist}, to: {file: company.playbook, element: decision:incorporation}}
```

An end is a file, optionally narrowed to a `stage` or an `element`. The view shows
them on the selected item as "feeds ⟵ x" / "feeds ⟶ y" chips, and the DAG draws them
beside the edges derived from the documents.

#### Where the engine lives

`packages/filekinds/src/lib/projectDoc.ts` — `parseProject`, `projectRoot`,
`projectMemoryPath`, `writeProjectTop`, `itemKind`, `itemLabel`, `fileItemsOf`,
`linksTouching`, `exportedProjectItems`; its header comment is what `studio-check
--spec project` prints. The DAG is `projectGraph.ts` (`assembleLanedGraph`,
`localizeGraph`) with `projectGraphLoad.ts`; the Ask vocabulary `projectAsk.ts`;
versions `nodeHistory.ts`. The view is `components/project/ProjectView.tsx` with
`ProjectDagView`, `ProjectLensView`, `ProjectAsk`, `MoveIntoFlow`,
`NodeHistoryDialog`; the checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

parseProject reads the YAML once and never throws; the mode decides the surface.

> Say which mode the project is in — three different surfaces stand on the same file.

### When `mode=items`

**Left, the project's tree.** Every item iconed by KIND with no extension anywhere — a
stage item by the stage icon, a `.node` folder by the structured icon — and, under an
item, the children its document exports: a workup's landed analyses, a stream's
exported stages, a list's exported rows, a playbook's decisions and events, a definition
instance's params and exported slots, a referenced project's exported items. Each row
has a lens button ("where did this come from" / "what does this produce") and a history
button when the file keeps versions. "Nothing in this project yet." when empty. The pane
collapses to a rail; on a phone it is a drawer over the content. The header holds the
mode switch, "DAG" and "Lens".

**Right, the selected item.** A file: the shared `DocumentPreview` with autosave through
the configured writer — so a board's or a plan's controls are live here — plus "Open in
<studio>", "Move into flow" and Delete. A node: a raw browser of that folder, extensions
visible, no per-file preview. A stage: the stream focused on that stage. An element: the
decision or event out of its playbook, with the stream point that produced it. A list's
document: rendered by kind. Above it, the links touching the file. "Select an item from
the project" until one is picked. Where the host says so, the pick lives in the URL as
`?item=`, so reload restores it and Back walks to the previous one.

**Read live.** The production graph and the producer index are built once per open from
the documents, so lenses and provenance resolve on demand.

### When `mode=directory`

**Left, the folder.** A tree over `root` (else the first node reference, else `/`) —
folders and files as they are — with the root's path, and buttons: Ask (when the host
configured the ask worker; "click a folder to aim there"), "New file in this folder",
"Refresh", "Delete the folder … and everything in it…" (when a folder is aimed at and
the host has a remover), and "Open in Nodes". A directory project has no groups; its
items, if any, wait for the item-tree mode.

**Right, the pick.** "Pick a file, or add one." with a "New file" button until a pick; a
file opens in the file pane (the shared preview with autosave, "Open in <studio>", "Move
into flow", Delete); a `.node` folder or a name with no extension opens the node
browser. Where the host says so the pick lives in the URL as `?file=`. A studio opened
from here runs in a dialog, and when it closes the pane and the tree re-read.

### When `mode=memory`

**The lens.** The `.memory` at `memory` (else `/memory/<name>.memory`) is created empty
when it does not exist — a memory whose folder split covers the project's material —
and rendered by the memory view with authoring on: pills, options, the working set as
cards, "+ focus" and "+ sub-focus", the side pulse. The header holds the project's name,
the mode switch and a "Nodes" link that opens the lens in Nodes. Everything lands in
"Everything else" until foci are authored.

## The mode is switched

*chosen · many*

One line of the file changes; the items and every comment survive.

The switch in the header sets or clears `mode`, `root` and `memory` by LINE SURGERY
(`writeProjectTop`): an existing line is replaced in place, a new one goes right after
`description:` (else `name:`, else the top), a cleared key is removed. Flipping to memory
creates the lens file when it is missing; flipping back keeps `memory`, so the lens keeps
its foci while the project is in directory mode. The text goes to the host's `onChange`
and its autosave writes it.

## DAG, Lens or History is opened

*chosen · many*

The project as production — hierarchy by containment, arrows for what produced what.

### What the dialogs show

Three windows onto the same graph.

#### The DAG

"<name> — the DAG": every item a node, every exported child its own node indented
under its parent in the parent's lane; lanes are invisible columns ordered by
production, an item one lane right of what produced it (a feedback edge just draws
leftward). Edges are the authored `links` plus edges DERIVED live — a stream's inputs
→ the stream, the stream → its point targets, a source document → its workup — each
anchored at the finest node that really is the source or target. A definition
instance's next step is drawn solid amber. Clicking a node opens its content.

#### The lens

"<name> — the lens": one item's children with their provenance, each traceable to
its localized DAG. A row's own lens button asks "Where “x” came from" — preferring
the node's BIRTH when its file keeps versions and one of them was produced, else the
other side's unrolled stream, else the one-hop localized graph — or "What “x”
produces".

#### History

The versions of a file kept in `<stem> versions.<ext>/` beside it, oldest to newest,
each openable, with a lens onto the version's own production; a version pinned by a
journey resolves through the same folder.

#### The producer

A policy element's producer — which stream point targeted it — opens the point's
stream in a dialog, found by scanning the project's points items once per open.

## The folder is asked to change

*chosen · many* — only when `mode=directory`

One line of instruction; files are made from each kind's template; nothing is ever deleted.

Ask (Ctrl+K) opens beside the tree, aimed at the folder last clicked — or at the file, so
"this" and "it" mean that file. The model reads the tree relative to the root and answers
with ops from `create_file`, `create_folder`, `rename`, `move_into_flow`. `planProjectOps`
is pure: it resolves paths under the target, refuses anything outside the project or
already there, and yields actions with reasons; `runProjectPlan` performs them through
the host's writers. A file is created from its kind's TEMPLATE — the model names the kind
and the title and never writes YAML for a kind it does not know; content is honoured for
`.md` and `.txt`. A rename takes no slashes. `move_into_flow` moves a `.frame` into a
`.flow`, adding a screen when no state showed it. Nothing deletes: a folder is the user's
material. The tree re-reads and the first created file is picked.

## A file is made or removed here

*chosen · many*

New file, Delete, Move into flow — through the host's writer and remover.

"New file" asks for a name ("a slash makes a subfolder"), refuses one that exists ("That
file already exists.") by picking it instead, writes the kind's template for the
extension, refreshes the tree and picks it. Delete on a file pane removes the file (to
the trash where the host has one) and clears the pick; "Delete the folder" removes the
aimed folder and everything in it, behind a confirmation. "Move into flow" on a frame
moves it into a flow beside it and picks the flow. Every write goes through the
configured writer; none touches the project file itself unless an item is inserted after
another (`insertItemAfterFile`).

## A file changes on disk

*imposed · many*

The project re-parses; the graph and the producer index are rebuilt; the directory tree refreshes on demand.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The project re-parses, the production graph and
the producer index are built again, and the selected item stays by key when it still
exists. The file pane follows its own document's changes. The directory tree re-reads on
"Refresh", after a New file, a Delete, an Ask, and when a studio dialog closes.

## Another project references it

*imposed · many*

A project is a node to other projects and to the hosts' start pages.

- Another project's `project:` item shows this project's `export: true` items as children
  and opens them as if they were its own — shared inputs reused across many projects.
- Ctrl+N in the Studio with the project kind writes the file and `/<stem>/README.md`
  beside it, since a project stands on a folder of the same name.
- A memory-mode project's lens is an ordinary `.memory` a pulse or a moves log can name.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses.

### What the checker does

The order it runs in, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseProject` — it never throws. No summary line. The page does not know the
   project kind.

#### Not checked

That an item's file or node exists. That a link's ends name items. That `root`
exists. An item with none of `file`, `node`, `project`, `items`.

## A project is written

*chosen*

### Write a project

From the template to a folder with a front door.

#### Start from the template

`studio-check --template project > new.project`, or Ctrl+N in the Studio (which also
makes the folder and its README):

```yaml
name: "new"
description: ""
mode: directory
root: "/new"
items: []
```

#### Point `root` at the folder

An absolute store path. Open the project: the directory mode browses it, and New
file or Ask adds documents from templates.

#### Add items when the tree should say more than the folder

Drop `mode` (or switch it in the header) and list items with labels, grouped with
`items`; mark `export: true` on what other projects may reuse; add `links` for
production the documents do not already declare.

#### Check it

`studio-check new.project` — only YAML can fail. Open it and press DAG: an item with
no edges is one the documents do not connect.
