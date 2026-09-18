---
name: studio-files
description: Author and edit Studio documents on DISK — every kind of Maher's Digital Symphony suite (.brief, .playbook, .kanban, .calendar, .policy, .flow, .jsonl, .middleware, .collection, .clip, .song, and .md for anything else) — in any folder the Studio opens. Use whenever a task touches one of these files by extension, asks to create, change or validate one, mentions the Studio, the desktop app or the VS Code preview, or asks WHICH file type to use for something.
---
# Studio documents on disk — how to edit them safely

**The load-bearing fact:** a Studio document is a YAML file whose EXTENSION picks its engine. The
engine (`C:\Github\orchestration\suite\packages\filekinds\src\lib\<kind>Doc.ts`) is the specification; the same
engine renders the file in the web Studio, the desktop app and the VS Code extension. Edit the text
directly — no API, no worker — and let the engine judge the result.

**Where this applies.** This event is the whole guide for a Studio document. `C:\Github\CLAUDE.md`,
read by every Claude Code session in any folder under it, and the `CLAUDE.md` the Studio's "Prepare for
Claude Code" button writes both point here, so a session opens this event before touching a document —
in the VS Code extension, the terminal, or the Code tab of the Claude desktop app. A session started
inside a folder starts with an EMPTY memory of its own, so this event and the folder's `CLAUDE.md` are
what it knows. On a PC without this repository, and in **Claude.ai chat** and **Cowork**, which never
read `CLAUDE.md` or this book on their own, the same text travels as a skill: a release ships
`studio-files-skill.zip`, exported from this event by `pnpm skill:export` in `suite`, to unzip into
`~/.claude/skills` or upload under Settings › Skills. Cowork given the folder DOES read the `CLAUDE.md`
in it and follows it. Neither runs the checker — validate what they write with `studio-check` from
Claude Code or by opening it in the Studio.

## 0 · Which kind for what

The question "what file type should this be?" is answered by what the thing IS, never by what
looks easiest to write. These are the kinds; when none fits, the file is markdown. One row each;
combine them (a brief feeding a playbook feeding a board).

| you want | kind | because |
|---|---|---|
| a hierarchical group of content — the facts of a situation, in sections | `.brief` | a titled tree of sections with prose — the source everything else points at |
| event-based content: what applies when a specific event happens, under given criteria; an event is something that happens intentionally or is imposed, and its content is the event's information given a context — the decision answers | `.playbook` | version 2, one file: decisions, and events on the table while their `when` holds, each showing one document that follows the answers; start from the template |
| several workflows that follow the same process, each one's progress tracked | `.kanban` | columns are the stages, tasks the items; rows are derived from `needs:` edges — never hand-ordered |
| workflow items with a start date and an end date, seen on a calendar | `.calendar` beside the board | a lens: the schedule the board's edges, durations and `due` produce; nothing stored |
| a set of rules that sorts and filters, agnostic of the actual data | `.policy` | params → ordered cases (first match wins) → buckets; or, with `role: table`, the rules a data view applies |
| a system that follows a state machine — states, and the events that move between them; states clicked through are kept until the page refreshes | `.flow` | screens with variants and edges; the walkthrough keeps its pins for the session |
| a data table over JSON rows, with an optional policy applied | `.jsonl` | one JSON object per line, or directive lines that read rows from other files and pass them through a table policy; columns found from the rows, paged, searched, sorted |
| parameters added to existing data by specific filters — information for some items arriving in stages, without touching the data file | `.middleware` beside the data | a source + rules: clauses pick the rows, `set:` gives fields their values; a `.jsonl` names the middleware among its `$sources` and sees the amended rows, live |
| a gallery view of data — each item with its images, facts and link, decided over one at a time | `.collection` made from a `.jsonl` view | a snapshot of the rows and a log of decisions with reasons |
| the notes of one MIDI clip — a beat, a bass line, chords, a hook — on a piano roll, handed to a DAW | `.clip` | pitches by name (`C2`, `F#3`) or number, `start`/`length` in beats from 0, velocities, drum `lanes:` as step strings (`x...x...`); Export .mid writes the Standard MIDI File beside it |
| clips placed on tracks — the arrangement, and the ONE file to drop on Ableton | `.song` | tracks of `{file: x.clip, at: <bar>, repeat, transpose}`; drawn as tracks against bars; Export .mid = one multi-track MIDI file, a named track per song track |
| anything else | `.md` | plain markdown — the default whenever no kind above fits |

Worked example — "a process for managing a trip, from the input markdown": `trip.brief` (the
facts: party, dates, car, stay, budget), `trip.playbook` (decisions such as *where to stay*
with answers Narooma / Tilba / further out, *car* pickup and return, *days* — each answer
holding the events that only matter then), `todo.kanban` (book the car → book the stay → pack,
with `needs:`, `duration:` and `due:`) and `todo.calendar` over it. Notes that fit none of these
are `.md`.

## 1 · The protocol

1. **Read the spec first**, once per kind, from the engine itself:
   ```bash
   studio-check --spec playbook
   ```
   (`brief`, `kanban`, `policy`, `flow`, …). The spec is the engine file's header plus the template
   every kind carries. Do not guess fields from another file; a field the parser does not know is
   silently dropped on the next UI save.
2. **Start new files from the template** — every kind has one — then edit:
   ```bash
   studio-check --template playbook > "C:/Github/Neogrids/new.playbook"
   ```
3. **Write only what the engine needs.** No informational text in a document: no `description:` prose
   restating the rules, no `note:` explanations, no comment trails — a file is its rules or its
   data, and a `title:` only where the view needs a heading. Maher reads the files; explanation
   belongs in the spec (`--spec`), not in his documents.
4. **Edit with the smallest change** — targeted line edits, never a rewrite of the whole file. Ids
   are identity (`id:` on screens and views; `key:` on decisions and events): keep them stable, add
   new ones, never renumber. Comments and formatting survive your text edits but NOT a save from the
   Studio UI (parse→dump), so anything that must persist goes in a field, not a comment.
5. **Check after every edit** — always, before reporting done:
   ```bash
   studio-check "C:/Github/Neogrids/org-structure.flow"
   studio-check C:/Github/Neogrids          # the whole folder
   ```
   Exit 1 = problems, printed per file. Fix them; a document that fails here fails in the Studio.
6. **Refer to documents by path** in replies, exactly as on disk.

## 2 · The kinds

| ext | what it is | spec file (in `packages/filekinds/src/lib`) |
|---|---|---|
| `.brief` | a titled tree of sections with prose | `briefDoc.ts` |
| `.playbook` | decisions, and events on the table while their `when` holds, each with one document | `playbookDoc.ts` |
| `.kanban` | columns + tasks (`needs:` for dependencies) | `kanbanDoc.ts` |
| `.calendar` | a lens over one `.kanban`: its schedule, nothing stored | `calendarDoc.ts` |
| `.policy` | params → ordered cases (first match wins) → buckets | `policyDoc.ts` |
| `.policy` with `role: table` | a policy over ROWS — the rules a composed .jsonl applies, and NOTHING about the data (no source, no title for the rows, no header labels — the checker refuses `source:`/`rename:`): `where:` clauses (all must hold; `field` may be a dot path like `best_offer.price_total_aud`; ops equals/not_equals/contains/not_contains/starts_with/ends_with/matches/gt/gte/lt/lte/between `[lo, hi]`/in `[...]`/not_in/is_empty/not_empty/is_true/is_false; a text op takes one value or a LIST = any of them, e.g. `{field: name, op: contains, value: [caravan, truck]}`), `sort:` keys (first key first, `dir: asc\|desc`), `columns:` = the fields shown IN THAT ORDER (omitted = every column; `"*"` = every other column, after the named ones), `hide:`, `limit:`; `title:`/`description:` name the RULES ("within the band, cheapest first"). Its preview says the rules in words; the row dialog lists the columns first in that order, then the rest | `tablePolicy.ts` |
| `.flow` | a walkthrough of screens: states with variants and edges | `flowOps.ts` (two YAML docs: model `---` views) |
| `.jsonl` | data rows: one JSON object per line, shown as a paged table with the columns found, a search over every field, a sort per header, a row opened whole on click (links open in the browser, copy with a click). Written by whatever PRODUCES the data — a scrape, an export, a script you write — one `JSON.stringify(row)` per line, same keys per row where you can; not hand-edited row by row. COMPOSED: a line whose keys start with `$` is a directive, not a row — `{"$sources": ["accommodation.json#properties", "more.jsonl"], "$policy": "stays.policy"}` reads the rows from those files when the .jsonl opens (a .json array; a .json object, `#key` naming the list, else its longest list of objects; a .jsonl; a .csv), adds raw lines beside it, and passes them through the table policy; nothing is cached. Either key alone works. Everything said ABOUT the data lives here too, on further directive lines: `{"$title": "Stays by price", "$description": "…"}` and `{"$labels": {"best_offer.price_total_aud": "Total (4 nights, AUD)"}}` (header names by field) | `dataRows.ts` |
| `.middleware` | rows AMENDED on their way to a view: `source:` (a .json `#key`, .jsonl, .csv, or another .middleware — chains), `rules:` each `where:` clauses (all must hold; none = every row) + `set: {field: value}` (dot paths allowed; or `key:`/`value:` for one). The data file stays untouched; the amendment lives here. A `.jsonl` names the middleware among its `$sources` instead of the raw file. A rule matching NO row is a problem (the link changed, the row is gone) — the checker prints each rule's match count | `middlewareDoc.ts` |
| `.collection` | a SNAPSHOT of a `.jsonl` view's rows to decide over: `source:`, `to:` (where directions go), `fields:`/`labels:` (copied from the view), `stats:` (the fields shown as big cards), `items:` (the rows, each with an `id`; `featured:` the picture chosen for it), `decisions:` a LOG of `{item, op: up\|down\|hide\|show, reason}` in the order taken — never applied to the items; the order shown is derived (rank = ups − downs, hidden out). An item's fields may be edited in place (no reason). Made by Collect on the `.jsonl` view or `studio-check --collect stays.jsonl`; not hand-written. Read the reasons to write the policy/middleware that yields the same order | `collectionDoc.ts` |
| `.clip` | the NOTES of one MIDI clip: `tempo`, `time: 4/4`, `bars`, `channel`, `velocity`, `naming` (scientific = C4 is 60, the default; `ableton` = C3 is 60, what Live shows), `notes: [{pitch, start, length, velocity}]` (pitch = a name, a number, or a LIST for a chord; start/length in beats — quarter notes — from 0), `grid` (steps per bar, 16) + `lanes: [{name, pitch, steps: "x...X...o...", length?, velocity?}]` (`x` a hit, `X` accent 127, `o` ghost 50, `1`–`9` ninths of 127, `.`/`-` rest, `\|` and spaces ignored). Drawn as a piano roll (lanes coloured apart, a note past the clip's end shaded); Export .mid writes `<stem>.mid` beside it, or `studio-check --midi x.clip` | `clipDoc.ts` + `midiFile.ts` |
| `.song` | clips on tracks: `tempo`/`time` (default: the first clip's), `tracks: [{name, channel?, clips: [{file, at?, repeat?, transpose?}]}]` — `at` a BAR from 0 (default: right after the previous clip on the track), `repeat` back-to-back passes, `transpose` semitones; refs relative to the song's folder; a missing clip is a problem, the rest still renders. Drawn as an arrangement (blocks with note thumbnails; a block opens its clip; a track's name lays its notes on a roll); Export .mid = ONE format-1 MIDI file, a named track per song track, or `studio-check --midi x.song` — drop it on Ableton Live's Arrangement for one track per song track at the song's tempo | `songDoc.ts` + `clipDoc.ts` + `midiFile.ts` |
| `.md` | markdown — rendered, edited as text; the default when no kind fits | — |

## 3 · Conventions that bite

- **`.flow` is TWO YAML documents** separated by a line that is just `---`: doc 1 = the MODEL
  (`dimensions`, `derived`, `sources`, `screens` with their own `variants` and `edges`), doc 2 =
  the VIEWS (saved pins; the preview writes only this half, and they are the states kept while
  clicking through — gone on refresh). Screen `id`s and titles are the diff identity — unique,
  stable. A screen that looks different under different data is ONE screen with `variants`, never
  two screens. A control that goes somewhere different is ONE edge with `dispatch`. Screenshots
  live in `<stem>-assets/` beside the flow and are referenced by that relative path.
- **`.playbook`** — a NEW playbook is always version 2: `studio-check --template playbook > new.playbook` and keep
  its `version: 2` line. The `version:` line at the top picks one of two shapes, never mixed:
  - **Version 1** (no `version:` line) = `decisions` (key, label, values with keys) + `events` (each with
    optional `content: [...]`) + `topics` (`when?`, `content: [...]`) + `rules` (`event`, `when`, `status`,
    `process`, `sets`). Answers CHOOSE content, content never reads answers. Every entry is a FILE beside the
    book — `{label?, file, by?}`. `{file: funding.playbook, by: [entity]}` shows
    `funding.playbook.variants/entity=<answer>.playbook` (the base's own extension — `steps.brief` by `push`
    shows `steps.brief.variants/push=yes.brief`) — one whole, self-contained document per answer combination,
    authored up front as a closed set (`studio-check` lists the missing ones). Refs are relative to the ROOT
    playbook's folder.
  - **Version 2** (`version: 2` at the top) = `decisions` + `events`, SESSION-ONLY and ONE FILE. ON THE
    EVENT: `when` (on the table only where it holds; absent = always), `hint` (what to do before its
    document shows — the ask while a `by` answer is open; the response when it shows nothing). Every
    decision opens unanswered, and answering or folding a panel changes the screen and never the file — no host saves a version-2 book from the walk.
    What is always true is the content of an always-on event. Each event has ONE content entry IN THE BOOK — a
    mapping, not a list: `content: {key?, label?, kind, doc}` for one document, or `content: {key?, label?,
    kind, by, docs}` for a closed set that FOLLOWS the answer — one document per combination of the `by`
    answers, keyed `decision=answer,...` in `by` order (`{kind: brief, by: [push], docs: {push=yes: {title,
    sections}, push=no: {...}}}`). `kind` names the renderer, a document is that kind's YAML (a block string for
    `md`). While a `by` decision is unanswered the pane shows the event's `hint` and asks for the answer;
    once taken, the member for that answer shows. A nested book is `kind: playbook` with the whole book under
    `doc`. Paste it, validate it, render it with nothing beside it. Content has no path, so no
    annotations and no pinning.
  `studio-check` runs the kind's own engine over each document and refuses `doc`/`docs` without `kind`,
  `doc` and `docs` together, `by` on a `doc`, `docs` without `by`, a `docs` set that is not exactly the closed set
  of its `by` answers, an `md` document that is not a string, a written entry or `when`/`hint` on an
  event in a version-1 file (it says: add `version: 2`, or move them to a rule), and — in a version-2 file —
  a `content` list or a `file` on an entry (it says: write it into the book, or take `version: 2` off). A `key` on an entry
  is what the walk collapses by (the file, then the label, stand in). A version-1 file the engine cannot carry —
  a newer `version`, or version 1 holding written content — is never saved by any host: the walk is held for the
  session and a line at the top says "Not saved"; fix the file rather than clicking on. Nesting is unlimited
  (a cycle is refused). No
  `library:`, no topic `variants:`, no `compare:` — the checker names them if a file still has
  them. Never author steps as events — a procedure is markdown.
- **`.policy`**: `params` → `cases` in order, the FIRST matching case wins → buckets. With
  `role: table` it is the rules a data view applies — see the kinds table.
- **`.kanban`** `columns` + `tasks` (`needs:` for dependencies, `duration:`, `due:`); **`.brief`**
  `sections: [{title, description?, body?, children?}]`.
- **`.clip` / `.song`** count in BEATS (quarter notes) and BARS from 0, whatever the time signature
  (a bar of 6/8 is 3 beats). Pitch names are scientific — `C4` = 60, a GM kick is `C2` = 36 — unless the
  file says `naming: ableton` (Live labels 60 as `C3`, its drum-rack kick `C1`); the roll shows the name
  AND the number, so check the number when in doubt. Nothing plays in the Studio: the piano roll is
  the check, the `.mid` is the handover. To Ableton: drop the exported `.mid` on a track (a song's on
  the Arrangement), or add the folder to Live's browser (Places › Add Folder) so every export shows
  up there as it lands. No `.als`/`.alc` is written — that format is undocumented and version-bound.
- **Refs** between documents are **document-relative** (`money/funding.playbook`,
  `../events.playbook`) or absolute from the folder root (`/Meme XP/events.playbook`).

## 4 · How the previews pick up your edits

- **VS Code extension** (Studio tab, or "Open Preview to the Side"): VS Code reloads the document
  from disk when it changes and the Studio tab re-renders — no action needed. If the Studio tab has
  unsaved edits of its own, VS Code's usual conflict handling applies.
- **Desktop app**: it watches the open folder; the open document re-reads itself when the file
  changes on disk and no edit of its own is pending. The folder tree on the welcome page refreshes.
- **Web Studio / Nodes** work over the shared drive (`nodes.entries`), not disk — that is the
  `suite-nodes` skill's territory.

## 5 · Where things are

- Engines / specs: `C:\Github\orchestration\suite\packages\filekinds\src\lib\` (`briefDoc.ts`,
  `playbookDoc.ts`, `kanbanDoc.ts`, `policyDoc.ts`, `flowOps.ts` for flows, …); editors:
  `packages/filekinds/src/components`.
- The checker is the global command `studio-check` (`--spec <ext>`, `--template <ext>`,
  `--collect <file.jsonl>`, `--midi <file.clip|file.song> [name.mid]`, `<files or folders>`). On the dev machine it links to
  `C:\Github\orchestration\suite\apps\cli\dist\check.cjs` (`pnpm cli:build` refreshes it); on any other
  machine it comes from a GitHub Release of the orchestration repository — `npm install -g
  studio-cli-<version>.tgz`, or `install-studio.ps1` from the release, which also installs the desktop
  app, the VS Code extension and this guide as a skill. If `studio-check` is not on the PATH, say so and install it
  before editing documents.
- Samples: `C:\Github\studio-demo` (a git repo with a README) — playbooks, a kanban and its calendar,
  and `Music/` (four `.clip` files — drums as lanes, bass, chords, a lead — under `demo.song`).
