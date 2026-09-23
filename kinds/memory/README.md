# How a version-1 memory works

<!-- Generated from kinds/memory/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

A working memory over the store — a saved query whose answers narrow and group the units, split by the folder it sits in until it authors decisions; the taken answers written back under a banner, the attention trail recording itself.

This is the `.memory` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Does the memory author decisions?** (`split`)

- `folder` — No — the folder splits it. An empty file is enough; each sub-folder holding units is a focus and the files sitting directly here are Everything else.
- `own` — Yes — a `decisions:` block. The criteria and their derive rules replace the folder split from here down.

## Always

*imposed*

What holds at every moment — the shape of the file, what a unit is, the structural else, and where the engine lives.

### The shape of the file

*A lens, not a container — it owns no nodes.*

#### Top-level keys

| key | what it is |
|---|---|
| `title`, `description` | the heading and one line under it |
| `scope` | the folder it looks at: absolute (`/` is the whole store) or relative to its own folder; absent, its own folder |
| `include` | clauses over the index fields — `path`, `name`, `stem`, `ext`, `area`, `parent`, `depth`, `age_days` — saying what counts as a unit; empty, everything |
| `options` | togglable slices: `{key, label, on, matches}` — while `on` is false the matching units drop out with the include step |
| `decisions` | the criteria — the ranking's decisions block, plus `activates` and `when` on answers |
| `locks` | the answers currently taken, `decision=answer` |
| `journal` | the attention trail — every state the locks passed through, oldest first, capped at 50; written, never authored |

#### What a unit is

Every document under the scope — files and structured `.node` folders, never plain
folders or other `.memory` files. A composite node contributes its folded stream
slices as fields (`status.status`, `tags.platform`, `<stream>._status`), so
criteria can select on slice data beside intrinsic facts. A unit can sit in many
memories at once, and one in none is simply unmatched, by design.

#### Selection

A unit is VISIBLE when its derived answer agrees with every lock. The first active
decision still unanswered GROUPS the visible set; answering it filters, and the next
question takes over the grouping. Every decision also carries the structural else —
`~else`, "Everything else" — the complement of its named answers, synthesised so it
never has to be authored: groupable, takeable as a lock, never silently dropped.

#### The banner

```yaml
# The answers currently taken. Written by the memory view — keep last.
locks: [focus=jobs]
journal:
  - {at: 2026-09-19T08:00:00.000Z, locks: [focus=jobs]}
```

Everything above it is the author's and is never re-serialised.

#### Where the engine lives

`packages/filekinds/src/lib/memoryDoc.ts` — `parseMemory`, `writeLocks`,
`writeOption`, `writeDecisions`, `memoryScope`, `memorySelection`, `answerPath`,
`withElse`, `folderSpace`, `memoryOverFolder`, `takenFolderChain`; its header
comment is what `studio-check --spec memory` prints. The store is read by
`components/memory/memoryLoad.ts` (`loadMemoryStore`, `memoryOver`, `loadUnits`);
the view is `components/memory/MemoryView.tsx` with `pillFilter.ts`, the pills the
shared `DecisionPills`; the checker (`studio-check`, the Python package) knows the kind by name only and does not check it.

## The file is opened

*imposed*

parseMemory reads the YAML once and never throws; the store is read live and the working set drawn.

> Say whether the memory authors decisions — the store is read two different ways.

### When `split=folder`

**The read is lazy.** One listing of the scope: every sub-folder holding units becomes
an answer of a `folder` decision, the files sitting directly in the folder are
"Everything else", and nothing under the folders not taken is read. Taking a focus lists
that folder and brings its own split onto the table — the decisions of the first
`.memory` found in it when there is one, its sub-folders otherwise (`folder/<path>`
decisions, activated by the parent answer), down to the leaves. Over `C:\Github` that is
a 60-entry listing instead of a 13,000-row index, and a click on a folder pill is what
reads that folder.

**What is drawn.** The pills at the top, hierarchy included — a folder icon on folder
foci, "Everything else" dimmed — with a filter box when there are many; the options as
checkboxes; the counts. Below, the working set in the projects idiom: groups under the
grouping question's answers, each unit a card with its kind icon, its stem without
extension, its parent folder, its age ("3d ago") and its pipeline status when it has
one. A side pulse — 21 days, reading minutes as the weight — shows the lowest sub-focus
on the table beside its siblings. A "Prepare for Claude Code" button and a Nodes link
sit in the header.

### When `split=own`

**The read is whole.** One scoped index of everything under the scope, since the rules
look at every unit; composite nodes are enriched with their folded slices. A folder on
the taken path with a memory of its own that authors decisions is read the same way
from there down. Then `memorySelection`: include clauses, unticked options, each unit's
answer per decision (a field named like the decision, else the first derive rule that
holds, else the structural else), the locks pruned against the decisions on the table,
and the visible set grouped by the first active unanswered decision.

**What is drawn.** The pills at the top — every decision on the table with its answers,
the else dimmed, a decision with one answer included — with a filter box when there are
many; the options as checkboxes; the counts. Below, the working set: groups under the
grouping question's answers, each unit a card with its kind icon, its stem, its parent,
its age and its pipeline status. A side pulse of the lowest sub-focus on the table. A
"Prepare for Claude Code" button and a Nodes link in the header.

## An answer is taken

*chosen · many*

The locks are written back under the banner and the journal records the state; attention is a fact worth keeping.

A pill click replaces any other answer to that decision, prunes answers to questions no
longer on the table, and the working set re-filters and re-groups. Then `writeLocks`:
the file is READ AGAIN first so the latest text wins, everything above the banner is kept
byte-for-byte, and `locks:` plus `journal:` are rewritten under it — one `{at, locks}`
entry appended whenever the locks differ from the journal's last state, the journal cut
to its last 50. The text is written through the configured writer. An empty memory file
stays empty until the first lock. An agent can steer attention by editing `locks` in the
same file; the view follows on the next re-read.

## An option is ticked or unticked

*chosen · many*

One line changes; the slice drops out or comes back before any decision sees it.

`writeOption` flips the option's one-line `on:` in place — `on: false` written, `on:
true` restored — and nothing else in the file moves. Unticked, the units the option's
clauses match leave with the include step: nothing groups by it, nothing parks in an
else. It is display machinery, not attention, so the journal does not record it.

## A unit is clicked

*chosen · many*

The document opens in a dialog through the shared preview; Nodes is one click further.

A dialog with the unit's content through `DocumentPreview` — a structured `.node` folder
through the split view — and an "Open in Nodes" link. In an authoring host a card also
carries a picker of the grouping decision's answers, so a unit can be moved to another
answer from where it stands. Nothing is written by opening.

## A focus is authored on the lens

*chosen · many*

On a project's memory lens the foci are added, renamed and resolved in place; only the decisions block is rewritten.

A project in memory mode opens its lens with authoring on: "+ focus" adds an answer to
the root decision, "+ sub-focus" adds a decision the current answer activates, a focus
can be renamed, a unit can be resolved to an answer, and a picker moves a card between
answers. Each goes through `writeDecisions`, which replaces only the `decisions:` block
in the text and leaves the head and the banner alone. Authoring the first decision is
what replaces the folder split from here down.

## Prepare for Claude Code is clicked

*chosen*

A CLAUDE.md beside the memory, written once.

The button writes `CLAUDE.md` in the memory's folder with the preamble the suite carries
— what every file under the folder is (a Studio document picked by its extension), where
the event "A Studio document is asked for" lives, the check-after-every-edit rule, and
that documents refresh from disk by themselves. Once the file exists the button stands
down; Claude Code loads the CLAUDE.md of every parent folder, so every folder under here
reads it.

## The store changes underneath it

*imposed · many*

An entry made, removed or renamed re-reads the store in place; the selection stays up until the new one lands.

The host dispatches `studio:store-changed` when an entry is made, removed or renamed —
content writes are not a reason — and the view re-reads the store the same way it opened
it, the current selection staying on screen until the new one lands. The root memory a
folder opens on (the desktop app's and the web folder's start page) re-reads on
`studio:fs-entries-changed` after a three-second settle and at most every thirty seconds.
The memory file's own change re-parses it, so locks set by hand or by an agent apply.

## Another kind reads it

*imposed · many*

The memory is the lens a pulse, a moves log and a project stand on.

- A `.pulse` draws its foci as rows and its journal as the attention trail.
- A `.moves` log snapshots its units' answer paths and diffs them on every open.
- A project in memory mode shows its lens — `/memory/<name>.memory`, created empty when
  missing — and keeps it while the project is back in directory mode.
- The desktop app and the web folder open a folder on its root memory: the first
  `.memory` in the root, else an empty `/<folder>.memory` (virtual in the browser).

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses.

### What the checker does

*The order it runs in, the summary line, and what it leaves alone.*

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseMemory` — it never throws.

#### The summary line

`N decisions, N include clauses, locks [focus=jobs, …]`. The page does not know the
memory kind.

#### Not checked

That a lock names a real answer (it is pruned on open). That `scope` exists. An
include clause with an unknown op (dropped). Whether the folder split will find any
units.

## A memory is written

*chosen*

### Write a memory

*An empty file already works; decisions come when the folders stop being the right split.*

#### Start from the template

`studio-check --template memory > desk.memory` in the folder it should look at —
a title, a description, and commented explanations of `scope`, `include` and
`decisions`, all empty. Open it: the folders are the foci.

#### Widen or narrow the scope

`scope: /` for the whole store, `..` for the parent, a path for another folder;
`include` clauses over the index fields when only some documents count.

#### Author decisions when the folders are not the split

A `decisions:` block as a ranking carries it — `key`, `label`, `values`, `derive`
rules — and `activates` on an answer for the narrower question under it, or
`folder` to split by the sub-folders from there.

#### Check it, then take an answer

`studio-check desk.memory` prints the counts and the locks. Open it and click a pill:
the banner and the journal appear at the bottom, and the head is untouched.
