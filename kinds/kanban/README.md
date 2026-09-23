# How a kanban works

<!-- Generated from kinds/kanban/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

A board whose columns are status and whose rows are derived from dependency edges — what a card holds and opens, how an edit or an Ask goes through the same mutators, and what else reads a board.

This is the `.kanban` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Where is it open?** (`host`) — The same board draws everywhere; only a host that lets it author shows the controls.

- `surface` — The Studio, the desktop app, VS Code. One surface per document, the preview with `editable={false}` — the board is read here; the file is edited as text.
- `authoring` — A host that lets it author. A project's file pane — an `onChange` and no `editable={false}`; columns, tasks and the Ask panel write the file.

## Always

*imposed*

What holds at every moment — the shape of the file, why rows and dates are never authored, and where the engine lives.

### The shape of the file

Columns and tasks are authored; rows and dates are facts about the edges.

#### Top-level keys

| key | what it is |
|---|---|
| `title` | the board's heading |
| `description` | one line under it |
| `due` | the day everything must be done by — the anchor backward scheduling chains from |
| `columns` | the statuses in order — a string, or `{title, color}` (`label` reads as `title`) |
| `tasks` | the cards |

A date is `YYYY-MM-DD`: a bare
`2026-09-09` is read as a date by YAML and kept as the day written; quoted, it is the
same day. A column's `color` is any CSS colour (`"#3b82f6"`, `tomato`).

#### A task

```yaml
tasks:
  - key: print-badges          # the stable key `needs:` edges point at; the title when absent
    title: Print the badge sheets
    status: Done               # a column TITLE, case-insensitive; unset or unknown = first column
    content:                   # one whole document, written into the task
      kind: brief              # any kind the Studio knows
      doc:
        title: The round
        sections:
          - {title: Round 1, body: What this round is.}
    note: one line under the title
    body: |                    # the task's own markdown — the dialog's main content
      What doing this means, in this task's words.
    needs: [order-badges]      # prerequisites, by key
    duration: 2                # calendar days (default 1) — a weekend inside a task is part of it
    due: 2026-09-08            # a cap tighter than the board's
```

A task with neither `title` nor `key` is dropped; a second task with a key already
seen is dropped, because a duplicate key would fork every edge to it; a `needs`
entry naming the task itself is dropped.

#### Rows are derived

Row one is every task that needs nothing; each later row is what builds on the rows
above, by longest prerequisite chain (Kahn's order, so a diamond sits as deep as its
longest path). Edges to unknown keys are ignored. Tasks caught in a cycle cannot be
layered honestly, so they land together in one final row rather than vanishing. A
board with no `needs` is one row — the plain kanban it degenerates to. Authoring
depth separately would let it drift from the edges, so it is computed on every draw.

#### Dates are derived

`scheduleTasks` chains backward from the due date: a task ends at the earliest of its
own `due`, the board's `due`, and the day before its earliest dependent starts, then
runs `duration` days back from there. A task with no anchor anywhere downstream, or in
a cycle, is unscheduled rather than given an invented date. The `.calendar` lens draws
exactly this.

#### Where the engine lives

`python/studio_kinds/kinds/kanban.py` — `parse`, `dependency_rows`, `problems`,
`content_problems`, `summary`; its header comment is what `studio-check --spec
kanban` prints, and the shape is `kinds/kanban/v1.schema.json`. In a host that
authors, the mutators are `kanbanEdit.ts` (`addTask`, `updateTask`, `removeTask`,
`moveTask`, `addColumn`, `renameColumn`, `removeColumn`, `moveColumn`,
`setBoardMeta`, `dumpKanban`) and the Ask vocabulary `kanbanAsk.ts`; the view is
`components/kanban/KanbanBoardView.tsx` with `TaskDialog.tsx`,
`KanbanEditDialogs.tsx` and `KanbanAsk.tsx`.

## The file is opened

*imposed*

parseKanban reads the YAML once and never throws; the rows are computed and the columns drawn.

**The parse.** An unparseable file opens as an empty board. Columns keep a `title` and an
optional `color`; a column with neither `title` nor `label` is nothing to draw. Each task
keeps the fields the shape lists; `duration` only when a positive number, `due` only when
a date. A board with no columns draws one column called "Tasks".

**What is drawn.** The title and description. The column headers, each with its colour
dot (grey when none). Then one section per dependency row — "Row 1 · nothing blocks
these", "Row 2 · builds on row 1" — and inside it the columns again, each card standing
under its status column (case-insensitive; unset or unknown lands in the first column).
A card shows the title, the note, an icon when it holds a document, "⇠ N" for the
prerequisites it needs and "N ⇢" for the tasks that depend on it. No tasks: "No tasks
yet."

**The controls.** Only in a host that lets the board author: "+ Column" and "Ask" in the
header, pencil and trash on each column header, "Add task" under every column. In the
Studio, the desktop app and VS Code the surface passes `editable={false}`, so none of
them show and the file is edited as text.

## A card is clicked

*chosen · many*

The task dialog — facts, edges as jumps, the task's own words, and its document rendered by kind.

The title, then — when the board authors — a pencil ("Edit this task") and a trash
("Delete this task…"). A line of facts: the note; "needs" with one chip per prerequisite
and "depended on by" with one per dependent, each chip a colour dot, the task's title and
its column, and a click JUMPS the dialog to that task; "no dependency edges" when there
are none.

Then the body, rendered as markdown, leading. Then, when the task holds a `content`
document, that document under the prose, rendered by its own kind's viewer from the text
in this file — nothing is read from disk, so it draws at once and carries no annotations.
A task with neither body nor document: "No content authored — the card is the whole
task." The card clicked also becomes where the Ask panel aims.

## A column or a task is edited

*chosen · many* — only when `host=authoring`

Every dialog goes through kanbanEdit; a refusal is a strip on the board, never a throw; the file is written through the host.

### What each control does

The dialogs, the mutators behind them, and what reaches the file.

#### Columns

"+ Column" opens the column dialog (title, colour) and `addColumn` appends it; refused
when the title is empty or already taken, case-insensitively. The pencil on a header
opens the same dialog on that column and `renameColumn` retitles or recolours it — the
tasks standing in it follow. The trash asks: "Delete the column "X"? N tasks in it
fall back to "First column". This cannot be undone." — `removeColumn` drops their
`status`. Clicking a header aims the Ask panel at that column.

#### Tasks

"Add task" under a column opens the task dialog with that status; the fields are the
title, the description (the file's `note`), the details (the file's `body`), the
column and the prerequisites. `addTask` slugs the key from the
title (lower-case, dashes, at most 48 characters; `-2`, `-3` when taken), drops and
names any `needs` that is unknown or the task itself, refuses an empty title, an
unknown column, or a `due` that is not an ISO date. The dialog's pencil opens the
same dialog on the task and `updateTask` applies the patch — an empty field removes
it; a new key re-points every edge to it. The trash asks: "Delete "T"? N tasks
depend on it — those edges are cut. This cannot be undone." — `removeTask` unlinks them.

#### A task's document

`content` is written and edited as text, not through a dialog: it is a whole
document of another kind, and its own editor is the one that knows it. An edit
through the dialogs leaves it untouched, and the dump writes it back as it was.

#### What reaches the file

Every accepted edit is made to the file's document, dumped by `dumpKanban` —
`title`, `description`, `due`, `columns` (a string,
or `{title, color}`), then each task's `key` and only the fields it has; a title equal
to the key is left out and the parser restores it — and handed to the host's
`onChange`. The host's autosave writes it (800 ms debounce, retried after an error)
and the new text comes back as content, so the board redraws from the file. Comments
in the YAML do not survive a dump. A refused edit shows in a strip with "dismiss" and
writes nothing.

## The board is asked to change

*chosen · many* — only when `host=authoring`

One line of instruction, answered with ops from a closed vocabulary and applied through the same mutators.

"Ask" shows only when the host has configured the ask worker (the panel checks its
health on port 9250 and says whether it answers through the API or the CLI, or is
offline). The panel opens beside the board; a card opened or a column header clicked
becomes the target it aims at. The model reads a compact listing of the board plus the
target and answers with `say` and `ops` from `add_task`, `update_task`, `remove_task`,
`move_task`, `add_column`, `rename_column`, `remove_column`, `move_column`, `set_title`.
It speaks the user's words for a task's parts — `description` is the file's `note`,
`details` its `body` — names a task by key, exact title or a handle set with `as` earlier
in the same reply, and places with `after` ("" for first).

`applyKanbanOps` runs the ops through `kanbanEdit`, so nothing a model says can produce a
shape the board could not read; a refusal (an unknown column, an unknown task) becomes a
skipped line the panel shows. The resulting text goes to the host's `onChange` like a
dialog edit; the last four turns stay as history, and Undo restores the snapshot taken
before a turn and marks that turn and the later ones undone.

## The file changes on disk

*imposed · many*

The host re-reads; the board re-parses and keeps the open card if its key survived.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text; the Studio re-reads unless its
autosave is dirty, saving or in error, and the board's own saves come back the same way.
The board re-parses and recomputes the rows — everything it draws is in the new text,
documents in the cards included, so nothing else has to be re-read. The open dialog stays
on its key and closes if the key is gone; the Ask target stays.

## Another kind reads it

*imposed · many*

A board is a document another document can hold, and a shape a schema can name.

- A `.brief` section, a `.playbook` event and another board's task can hold a board as
  their written document — `content: {kind: kanban, doc: …}`, the board's own YAML — and
  the checker runs it through this engine, so a broken board inside a brief is a broken
  brief.
- A `.schema` of `type: kanban` describes the pipeline a structured node's content follows;
  a plain `.kanban` file never carries a schema.
- A journey's fanout stage projects its columns as a board of its own (`FanKanban`), but
  that is not this file.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses, so the checker names everything it silently dropped or defaulted.

### What the checker does

The order it runs in, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `problems` — the field table's required rows, and every fallback the lenient
   parser takes: no `title`, no `columns` (or an empty list, or a column without a
   title), no `tasks` (`tasks: []` is an empty board and passes), a task with no `key`
   or no `title`, a second task with a key already used, a `needs` entry naming no
   task or the task itself, a `status` that is not a column title, a `duration` that
   is not a positive number, a `due` (on the board or a task) that is not a date, a
   cycle, and what a task's `content` cannot be. Each is one line, naming the task.
3. Every task's written document through its own kind's engine, its problems prefixed
   with the task and the kind.
4. The summary line: `ok <name>  Kanban  5 tasks in 4 rows, 3 columns, due
   2026-11-13, 2 documents` — what the board shows, so a file that parsed to nothing
   is visible at once.

#### Nothing beside it

There is nothing beside a board to check: everything a card opens is written into the
file, so the verdict is the same wherever the file is read.

## A board is written

*chosen*

### Write a kanban

From the template to a board with edges, dates and whatever a card has to open.

#### Start from the template

`studio-check --template kanban > new.kanban`:

```yaml
title: new
due: 2026-12-31
columns: [To do, Doing, Done]
tasks:
  - key: first
    title: The first thing
    status: Doing
    duration: 2
  - key: second
    title: What follows it
    needs: [first]
    due: 2026-12-24
```

Two tasks and one edge, so the rows and the schedule have something to show;
replace them.

#### Write the tasks with keys

`key` first, then `title` and `status` (a column title, spelled as the column is).
Keep keys stable: edges point at them, and a rename by hand does not re-point edges
the way the dialog does.

#### Say what needs what

`needs: [key, …]` on the task that waits. The rows follow from this alone; do not
write a row anywhere.

#### Add the schedule's inputs

`due` on the board, `duration` on tasks longer than a day, `due` on a task with a
tighter cap.

#### Write in what a card has to open

A task that holds more than its card shows takes `content: {kind, doc}` — the whole
document, in the task. `kind` is any kind the Studio knows and `doc` is that kind's
YAML (a block string for `md`); the checker runs it through that kind's engine. One
document per task: a task that needs two is two tasks.

#### Check it

`studio-check new.kanban` — a `needs` to no task, a `status` that is no column, a
duplicate key, a cycle, a date or duration that is not one, and anything wrong in a
task's document: each is a line naming the task, and the summary line counts the
tasks, rows, columns and documents the board shows.
