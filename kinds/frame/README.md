# How a version-1 frame works

<!-- Generated from kinds/frame/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

A single-screen UI design as a tree of nodes laid out with real CSS flexbox — the legend every saved file carries, what the canvas draws, what the editor writes, what the checker refuses, and where a frame turns up inside a flow.

This is the `.frame` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Where is it open?** (`host`)

- `viewer` — A preview. The Studio's surface, the desktop app, VS Code, a flow's content pane, a project pane — the read-only viewer.
- `editor` — The frame editor. A flow's frame dialog, or any host that mounts the registry Editor with an `onChange` — layers, inspector, Ask, versions, export.

## Always

*imposed*

What holds at every moment — the legend, the node tree, the sizing rules, and where the engine lives.

### The shape of the file

What the legend on top of every saved frame says, in a table.

#### The legend

Every dump opens with a comment block, the same text `studio-check --spec frame`
prints:

| key | what it is |
|---|---|
| `frames` | exactly one `{id, name, width, height, image?}` — `image` a screenshot drawn behind the nodes |
| `nodes` | a flat list; `parent` nests a node (omit it = sits on the frame); siblings lay out in FILE ORDER |
| kinds | containers `vstack` (column), `hstack` (row), `box` (column group), `grid` (`props.columns`, child `props.span`), `scroll` (a viewport that scrolls its children); leaves `text`, `button`, `image`, `input`, `divider`, `spacer`; references `embed` (`props.ref_path` another `.frame` drawn live, `props.view`), `slot` (`props.name`, filled by an embedder) |
| sizing | hug by default; `expand: true` grows to fill the parent's MAIN axis; `fixed: true` pins the main-axis size (height in a column, width in a row); the CROSS axis always stretches unless the parent sets `align` |
| `props` | containers: `gap`, `padding`, `align`, `justify`, `wrap`; text: `text`, `fontSize`, `color`, `fontWeight`, `textAlign`, `fontStyle`; button: `text`, `background`, `color`, `fontSize`; input: `placeholder`; image: `src`, `fit`; divider: `color`; any: `background`, `borderWidth`, `borderColor`, `borderRadius`, `opacity` |
| `views` | UI states over the SAME tree: each lists the node ids it hides (a hidden node hides its subtree); nothing is copied, so a Base edit shows in every view |
| `meta` | free notes per node as key: value strings |
| `versions` | older full snapshots, oldest first; the top level is the latest, named by `version_name` |

#### Why one frame

A `.design` held many frames; a `.frame` holds at most ONE, which is what makes it
embeddable — another frame's `embed` node renders it read-only, live, and injects
children into its named slots (a child of an embed carrying `props.slot`).

#### Where the engine lives

`packages/filekinds/src/lib/frameDoc.ts` — `parseFrame`, `parseFrameObject`,
`dumpFrame` (legend on by default), `dumpFrameCompact`, `newFrameDoc`,
`frameProblems`, `childrenOf`, `frameOf`, `hiddenIn`, `viewById`, `frameSnapshotAt`,
`createFrameVersion`, `slotsOf`, `injectionsOf`, and `FRAME_LEGEND`. The mutations are
`frameEdit.ts`, the Ask vocabulary `frameAsk.ts`, the export `frameHandover.ts`,
the flow side `flowFrames.ts`. The views are `components/frame/FrameViewer.tsx`,
`FrameCanvas.tsx`, `FrameEditor.tsx`, `FrameInspector.tsx` and `FrameAsk.tsx`; the
checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

parseFrame reads the YAML once and never throws; the canvas lays the tree out with the browser's own flexbox.

> Say where the frame is open — the viewer shows; the editor also writes.

### When `host=viewer`

**The parse.** A frame rect needs an `id` (name "Frame N", 390 × 844 by default); a node
needs an `id` and sits on the one frame; `props` and `meta` are kept as given; views and
versions as listed. A half-written file still renders.

**The canvas.** The layout engine IS the browser: every node is one `div` whose flex
properties come from the model — hug (`flex: 0 0 auto`), fixed (`flex: 0 0 Npx` on the
parent's main axis; 44px when the size is not given), expand and spacer (`flex: 1 1
0`) — and the cross axis stretches unless the parent says otherwise; the frame itself
is a column. Leaves render their props; an image's `src` and the frame's `image`
resolve through the store's raw URL; an `embed` renders the referenced `.frame`
read-only through the host's reader, at most four deep; a `slot` in it shows the nodes
the embedding document injected.

**Around it.** Base and one tab per view; a versions picker when there are snapshots (a
snapshot renders as it was); a layer tree of the nodes — name, kind chip, hidden ones
dimmed with an eye-off — where a click highlights the node on the canvas; zoom steps
and fit; a problems chip listing `frameProblems`. "No nodes yet" when empty. Nothing is
edited here.

### When `host=editor`

**The same parse and canvas**, with click-to-select. Left, the layers with an add menu
of the thirteen kinds, each born with default props (a `vstack` gap 8 and align
stretch, a `text` reading "Text", a `button` reading "Button", an `embed` with an empty
`ref_path`, a `slot` named `content`). Right, the inspector for the selected node — name,
kind, `fixed`/`expand`, width and height, every prop, the meta notes — with an image
upload that lands the file under `<stem>-assets/` beside the frame; or the Ask panel.
Above the canvas, the view tabs with add, rename, delete and reorder, a per-node
hide/show in the active view, the zoom, "+ version" (a snapshot of the current body,
named), and "Export".

Every edit is a pure function over the parsed document (`frameEdit`): document order is
the layout order, so a move or a reparent reflows the node list as a depth-first walk
of the intended tree. The result is dumped with the legend and handed to the host's
`onChange` — the YAML lives with the host, so there is no raw pane here. Keys: Delete
removes the selection, Ctrl+D duplicates it, Alt+↑/↓ moves it among its siblings. A
selected snapshot is read-only.

## The structure is judged

*imposed · many*

frameProblems runs on every draw and on every check; the canvas still draws.

- `a .frame holds ONE frame; this file has N`
- `node id "x" appears N times`
- `node "x" sits on unknown frame "f"`
- `node "x" has unknown parent "p"`
- `node "x" is both fixed and expand`
- `embed "x" names no ref_path`
- `slot "x" has no name`
- `node "x" is inside a parent cycle` — a parent chain must end at the frame
- `view "v" hides unknown node "x"`

The viewer shows them in a chip; the checker prints them and, first, `no frame declared —
\`frames:\` needs one entry with id, name, width, height` when there is none.

## The frame is asked to change

*chosen · many* — only when `host=editor`

One line of instruction against a compact dump; ops from a closed vocabulary through the same mutations.

The model reads the frame compactly — one line per node, no legend, no versions, a
fraction of the stored file's tokens — and the selected node, and answers with `say` and
ops from `add`, `update`, `remove`, `duplicate`, `move`, `hide`, `show`, `add_view`,
`frame`, `doc`; a node is named by id, and `as` on an `add` or `duplicate` gives a handle
later ops in the same reply may use as `id`, `parent` or `after`. The ops run through
`frameEdit`, so nothing a model says can produce a tree the canvas cannot lay out; a
refusal becomes a skipped line the panel shows. The result goes to `onChange` like any
edit; Undo restores the snapshot taken before a turn.

## Export is clicked

*chosen · many* — only when `host=editor`

The handover — one PNG per view, the YAML, and a markdown page — written beside the frame.

Each view is mounted off-screen at 1:1, its images (and any embedded frames' images)
awaited, and rasterised to PNG at 2× — `base.png` first, then one per view named by its
slug (a collision suffixed by the view id). With them, the YAML with the legend and the
latest version only, and `handover.md` putting each picture beside the text. Everything
lands in `<stem>-handover/` next to the frame through the host's configured writers,
overwriting the last export; the editor reports the folder and its files.

## A flow shows it

*imposed · many*

A state's panel names a frame beside the flow, or one kept inside it.

### The frame in a flow

Beside the flow, or under its `frames:` map.

#### A panel

A state's panel `{frame: login.frame, view: Loading}` draws the frame live through
the canvas, fitted to the pane, at that view; `frame: login` with no extension names
an inline frame under the flow's top-level `frames:` map, and the name wins when
both exist. The Studio opens an inline frame as `?path=<flow>&frame=<name>`.

#### Move into flow

A text transform: the frame file's body goes under `frames.<stem>`, every state
that showed the file is re-pointed at the name, and when no state did, a new screen
showing the frame is added — a moved frame is a screen of the flow, never an
invisible child. The file is removed only after the new text is saved.

#### Editing from the flow

The flow's frame dialog mounts the editor on a frame beside the flow or an inline
one — `inlineFrameText` hands it the frame as `.frame` text and `withInlineFrameText`
writes the edit back into the model half; the flow's views half is never touched.

#### Elsewhere

Another frame's `embed` node draws it live. A project's Ask creates a frame from a
title as an empty screen. A flow's Ask lists the frames beside the flow with their
views when asked to show one.

## The file changes on disk

*imposed · many*

The host re-reads; the canvas redraws; the view tab and the version pick stay while they exist.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text — the editor's own saves included
— and the Studio re-reads unless its autosave is dirty, saving or in error. The frame
re-parses and the canvas redraws; the selected view and version stay while their ids
exist. An embedded frame edited on its own redraws when the embed is next mounted.

## studio-check runs on it

*imposed*

One file in, one verdict out — the structure rules are the check.

### What the checker does

The order it runs in, the summary line, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseFrame`, then `frameProblems`; `no frame declared — …` first when there is no
   frame.

#### The summary line

`1 frame, N nodes, N views` and `, N versions` when there are snapshots. The page
does not know the frame kind.

#### Not checked

That an embed's `ref_path` exists (the canvas shows nothing there). That an image
exists. That props make sense for the kind. Whether a view hides everything.

## A frame is written

*chosen*

### Write a frame

From an empty screen to views and a handover.

#### Start from the template

`studio-check --template frame > login.frame`, or Ctrl+N in the Studio, or a
project's Ask with a title: an empty 390 × 844 screen named after the file, the
legend on top, no nodes.

#### Write the tree in layout order

A `vstack` on the frame, then its children in the order they should stack, each
with `parent`; `expand: true` on what should fill, `fixed: true` with a height on
what should not move.

#### Add views for the UI states

One view per state, listing the ids it hides — a loading spinner shown, a list
hidden. The Base is the everything-visible tree; nothing is copied.

#### Check it, then open it in a flow

`studio-check login.frame` prints the counts and the structure problems. Put it
beside a flow and point a state at it with `{frame: login.frame, view: Loading}`.
