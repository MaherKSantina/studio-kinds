# How a flow works

<!-- Generated from kinds/flow/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

A walkthrough whose screens and edges are parameterised — two YAML documents in one file, a closed parameter space, screens with variants and controls, a walk that keeps its trail in the session and its pins in the views half, and an Ask that edits only the model.

This is the `.flow` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Where is it open?** (`host`)

- `surface` — The Studio's surface. The desktop app, VS Code, the web Studio — the preview with `editable={false}`; the walk and the pins work, the model is edited as text.
- `authoring` — An authoring host. A project pane, Flow Studio — an `onChange` and no `editable={false}`; the dialogs, the Raw editor, uploads and Ask write the model half.

## Always

*imposed*

What holds at every moment — the two documents, the model's shape, the when grammar, what it deliberately is not, and where the engine lives.

### The shape of the file

*The model, a line that is exactly `---`, then the views the preview writes back.*

#### Two documents

The file is split on the FIRST bare `---` line. Document 1 is the MODEL,
hand-authored. Document 2 is the VIEWS — the saved parameter set and layout; the
preview writes back only this half. The thing you explore with is not the thing you
author. A broken views document never makes the model unreadable: it reads as empty.

#### The model

| key | what it is |
|---|---|
| `title` | the heading |
| `dimensions` | the closed parameter space — name → an ordered, finite list of scalar values |
| `defaults` | the starting assignment |
| `derived` | dimensions produced by first-match-wins rules — `{name, values, rules: [{when, value}]}`; `value: "= other"` copies a dimension |
| `initial` | the screen a walk starts on |
| `start_mode`, `entries` | start on `initial`, or from one of the `entries` start events |
| `frames` | the frames this flow holds, by name — a state shows one as `frame: <name>` at one of its views |
| `screens` | the screens |

A screen: `id` (what edges point at), `title` (unique), `description`, `locals`
(its own UI state — reset on every arrival, seen by no other screen), `content`
(panels: `{screenshot}` — an image in `<stem>-assets/` — or `{frame, view}`, one
of this flow's own frames; `screenshot` and `screenshots` are shorthands), `variants` (`{when, title?, content}` — the same
screen under a condition), `edges` (its controls: `id`, `event`, `to` or
`dispatch` — a precedence-ordered list of `{when, to}`, first match wins — `sets`
dimension values established by walking, `when` the control is present only while
it holds). A screen that renders differently under different data is ONE screen
with variants, and unconditional versus dispatch is a type distinction, not a naming
convention.

#### The when grammar

A mapping of dimension → condition: a bare value equals; `[a, b]` one of; `"*"`
any; `"!x"` not equal. Separate keys AND together; a LIST of mappings ORs
alternatives (the only way to say OR across dimensions); `"*"` or `{}` alone is
always.

#### The views half

```yaml
active: v1
views:
  - id: v1
    name: default
    layout: {params: {type: a}, tab: screens, focus: checkout, labelVariants: false}
```

One entry, never surfaced as something to manage: the global pins, the open tab and
the focused screen. A pin whose dimension was renamed away is dropped on read; old
tab names (`graph`, `navigate`, `play`) map forward. Locals are never persisted.

#### Deliberately not a simulator

Derived values are first-match rules over declared literals; there is no
arithmetic, no strings, no functions. The point is to validate what is about to be
built and stay cheap to author — the moment this needs a real evaluator, the app
should be running instead.

#### Where the engine lives

`packages/filekinds/src/lib/flowOps.ts` — `splitFlowFile`, `joinFlowFile`,
`parseFlow`, `dumpFlow`, `parseFlowViews`, `matchWhen`, `readFlow`, `applyDerived`,
`resolveVariant`, `resolveEdge`, `availableEdges`, `isOffered`, `traverse`,
`reachFlow`, `simulateFlow`, `coverFlow`, `validateFlow`, `validateFlowFile`, and
the mutators (`addScreen`, `updateScreen`, `deleteScreen`, `addVariant`,
`updateVariant`, `deleteVariant`, `addEdge`, `updateEdge`, `deleteEdge`,
`setDimension`, `setScreenLocal`); its header comment is what `studio-check --spec
flow` prints. The browser half is `flowEngine.ts` (`parseFlowFile`, `withModel`,
`withViews`, `diffFlow`); inline frames `flowFrames.ts`; the Ask vocabulary
`flowAsk.ts`. The views are `components/flow/FlowKindView.tsx` → `FlowFileView`,
`FlowPreview`, `FlowScreenPage`, `FlowParamBar`, `FlowContentPane`, `FlowMap`,
`FlowGapsList`, `FlowFramesList`, the dialogs, `FlowAsk`; the checker is `python/studio_kinds/kinds/flow.py`.

## The file is opened

*imposed*

The two halves are parsed, the saved view is read, and the Screens tab is drawn under the parameter bar.

> Say where the flow is open — the walk is the same; only the authoring controls differ.

### When `host=surface`

**The parse.** The model half through YAML — an error is reported and the preview
cannot draw until it is fixed; the views half never throws. The saved view's pins are
kept where their dimensions still exist, the tab mapped forward, the focus kept.

**What is drawn.** A Raw / Preview toggle (Raw a read-only editor here; absent when the
host is chromeless) and the tabs: Screens, Map, Missing, Frames, and Changes when the
flow is one half of a diff. Above them the PARAMETER BAR — every global dimension with
its values, the derived ones read-only. Screens: the list down the side; the focused
screen's page shows its resolved rendering — the variant whose `when` holds first, its
panels stepped one at a time: a screenshot from `<stem>-assets/`, or one of the flow's
own frames drawn through the canvas fitted to the pane — its STATES listed (a
state that does not apply is only dimmed: looking is not walking), its CONTROLS (a dead
one dimmed with why it is not offered), and where it was reached from. The trail of
crumbs sits above. An empty model shows the empty-flow page; validation problems show
in a strip. Nothing here authors: dialogs, uploads and Ask are absent.

### When `host=authoring`

**The same parse and page**, plus the authoring surface: the Raw editor writes the model
text; on the screen page, add / edit / delete for states and controls through dialogs
(a state's `when` and panels; a control's event, `to` or `dispatch`, `sets`, `when`);
screenshot uploads that land beside the flow as `<name>-<hash>.<ext>` in
`<stem>-assets/`; the frame dialog for one of the flow's own frames; on the
Changes tab, revert and promote per change; and the Ask panel (Ctrl+K). Every mutation
runs through `flowOps` on the model half and is re-serialised with `withModel`, so the
views half survives every edit.

## A control is pressed

*chosen · many*

The edge resolves under the assignment, its sets apply, the next screen's locals reset, and a crumb is appended; nothing is written.

Only a LIVE control can be pressed — one whose `when` holds under the current
assignment. `resolveEdge` takes `to`, or the first `dispatch` branch whose `when` holds;
`sets` moves the assignment (a parameter established by walking, like the seller
countering); arrival resets the destination's locals; a crumb — the screen, the whole
assignment, the event — is appended to the trail. Clicking a crumb rewinds to it and
restores the parameters you had then, locals included; restart clears the trail; picking a
screen from the list starts a fresh walk there. The trail is session state, kept here
because walking is the one thing that spans screens; the file does not change.

## A parameter is set

*chosen · many*

A global pin is written to the views half; a local is session-only; everything re-resolves.

A global dimension picked in the bar becomes a pin in the single view's `params`, written
back through `withViews` — the model half untouched — and persisted by the host's
autosave, so a reload opens on the same data. A screen's local is set on its page and
never saved: locals reset on arrival by definition. Either way the derived dimensions
recompute first-match, the screen re-resolves its variant and panels, dead controls dim,
the map recolours what is reachable, and "Set parameters to this" on a state applies the
assignment that would show it.

## A tab is switched

*chosen · many*

Map, Missing, Frames and Changes — four other places to stand; the open tab is saved in the views half.

### What each tab shows

*Orientation, gaps, frames and the diff.*

#### Map

The whole graph at once — screens as nodes, controls as edges, a dispatch drawn
dashed — for orientation rather than detail; with `labelVariants` on, each node
shows its resolved variant's label under the pinned parameters, and reachability
under them colours the graph.

#### Missing

Every state with no capture of its own — "no capture" or "inherits" the screen's —
with the minimal pins that reach it and a "take from original" that copies the
screen's panels when authoring.

#### Frames

The frames beside the flow and the ones kept inline, with their views; each opens
the frame dialog in an authoring host.

#### Changes

When the flow is one half of a diff: a typed diff of the model against the base —
screens, states, controls, dimensions — with revert and promote per change where the
host allows it.

## The model is edited

*chosen · many* — only when `host=authoring`

A dialog, the Raw editor, an upload or a frame edit — each rewrites the model half only.

A dialog's submit calls the matching mutator — `addScreen`, `updateScreen`,
`deleteScreen`, `addVariant`, `updateVariant`, `deleteVariant`, `addEdge`, `updateEdge`,
`deleteEdge`, `setDimension`, `setScreenLocal` — on a clone; a refusal (a duplicate title,
an unknown screen) shows in the dialog and writes nothing. The Raw editor replaces the
model text as typed. An uploaded screenshot is written beside the flow and its key put in
the panel. A frame edit is written back under `frames.<name>` or to the file beside. In
every case `withModel` re-serialises the model and keeps the views text, the result goes
to the host's `onChange`, and the host's autosave writes it (800 ms debounce).

## The flow is asked to change

*chosen · many* — only when `host=authoring`

One line of instruction from where the reader stands; ops from a closed vocabulary on the model half only.

The model reads the flow's MODEL half (the views half stays out), the target — the
screen the reader stands on and the state they look at — and the frames beside the flow
with their views, and answers with ops from `add_screen`, `update_screen`,
`remove_screen`, `add_state`, `update_state`, `remove_state`, `add_control`,
`update_control`, `remove_control`, `set_dimension`, `remove_dimension`, `set_local`,
`remove_local`, `set_initial`, `set_title`. Screens are named by id or title, states by
label or 1-based index, controls by id or event label; conditions and assignments are
text in the file's own grammar (`flag: true; type: a|b`; `when -> screen; * -> screen`
for a dispatch); a state's `frame` names one of this flow's own frames, at one of its
views.
`applyFlowOps` runs them through the same mutators on a clone and re-serialises only the
model, so the views survive every turn; refusals become skipped lines. Ctrl+K opens the
panel.

## The file changes on disk

*imposed · many*

Both halves re-parse; the trail is session state and stays; the pins come from the file.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text — the preview's own pin writes
included — and the Studio re-reads unless its autosave is dirty, saving or in error. The
model and the views re-parse; the trail and the focused screen stay while their ids exist;
the pins are whatever the views half now says. A frame or a file a panel renders is read
when the panel is next drawn.

## Another kind meets it

*imposed · many*

A frame moves INTO it; the Studio opens the flow's own frames by name.

- "Move into flow" — from a project pane or a project's Ask — folds a `.frame` file
  under `frames.<stem>` and adds a screen when no state showed it. The frame is then this
  flow's, edited from its frame dialog, and the file it came from is no longer read.
- The Studio opens one of the flow's frames as `?path=<flow>&frame=<name>`.
- A `.diff` of two flows renders one as the Changes tab of the other.

## studio-check runs on it

*imposed*

One file in, one verdict out — the model's parse error, or the validation catalogue.

### What the checker does

*The order it runs in, the summary line, and what it leaves alone.*

#### In order

1. `parseFlowFile` — a model YAML error is the only problem: `model YAML parse
   error: …`.
2. `validateFlowFile` — the catalogue: a top-level `edges` (`a control belongs to the
   screen it sits on`); `dimensions` not a mapping, a dimension empty or non-scalar;
   `derived` names clashing with dimensions, rules whose `value` is not in the
   dimension or `"= x"` naming nothing; `initial` not a screen; `start_mode` not
   `screen` or `entries`; `sources` and `default_source`, named as gone (a panel
   drew a document from another folder); a screen without `id` or `title`, a
   duplicated id or title, `locals` clashing with a dimension or non-scalar; a
   variant without a label; a panel with both `frame` and `screenshot` or neither, a
   `frame` this flow does not hold, a `file`, `source` or `agent` on it, `label` not
   a string; a `when` naming an undeclared dimension or a value not in it, a list
   `when` whose entries are not mappings, an empty list of alternatives; an edge with
   both `to` and `dispatch` or neither, a `to` or a branch's `to` naming no screen,
   a `dispatch` that is not a list; a duplicate `event` + `when` on one screen.
3. The views half's YAML — `views YAML parse error: …` when it does not parse.

At most 40 problems are reported.

#### The summary line

`N screens, N states` and `, N frames` when the model holds frames — on the command
line and on the page alike.

#### Not checked

That a screenshot key exists in `<stem>-assets/` (the Missing tab shows it) — the
images are the one thing a flow keeps beside itself. That every screen is reachable
(the Map shows it). The content of the views half — a pin, a tab, a focus — beyond
its YAML parsing.

## A flow is written

*chosen*

### Write a flow

*From the template to a walk that validates what is about to be built.*

#### Start from the template

`studio-check --template flow > new.flow`, or Ctrl+N in the Studio — a commented
model with two dimensions, a derived one, defaults, a frame and screens with their
controls, then the `---` and the views half.

#### Declare the parameter space

Every dimension with its finite values and a default; a derived one where several
collapse into one the screens care about.

#### Write one screen per page

A stable `id`, a unique `title`, and a screenshot or one of the flow's own frames;
a VARIANT with a `when` wherever the same page renders differently under data, never
a second screen.

#### Put each control on its screen

`to` for one button one place; `dispatch` when the same button branches on data;
`sets` for what walking establishes; `when` for a control only sometimes present.

#### Check it, then walk it

`studio-check new.flow` prints the counts and every catalogue problem. Open it, pin
the parameters, press the controls; the Missing tab is the capture list.
