---
name: studio-files
description: Author and edit Studio documents on DISK — every kind of the Digital Symphony suite (.brief, .playbook, .kanban, .calendar, .policy, .flow, .jsonl, .pipeline, .collection, .clip, .song, .script, .views, .page, and .md for anything else), each one self-contained file — in any folder the Studio opens. Use whenever a task touches one of these files by extension, asks to create, change or validate one, mentions the Studio, the desktop app or the VS Code preview, or asks WHICH file type to use for something.
---
# Studio documents on disk — how to edit them safely

**The load-bearing fact:** a Studio document is a YAML file whose EXTENSION picks its engine. The
engine — the check in `python/studio_kinds/kinds/<kind>.py` of this repository, the `studio-check`
command — is the specification, and beside it every kind has a JSON Schema (`studio-check --schema
<ext>`), a book and a field table. Edit the text directly — no API, no worker — and let the engine
judge the result.

**Where this applies.** This event is the whole guide for a Studio document. A `CLAUDE.md` above the documents' folder,
read by every Claude Code session in any folder under it, and the `CLAUDE.md` the Studio's "Prepare for
Claude Code" button writes both point here, so a session opens this event before touching a document —
in the VS Code extension, the terminal, or the Code tab of the Claude desktop app. A session started
inside a folder starts with an EMPTY memory of its own, so this event and the folder's `CLAUDE.md` are
what it knows. On a PC without this repository, and in **Claude.ai chat** and **Cowork**, which never
read `CLAUDE.md` or this book on their own, the same text travels as a skill: a release ships
`studio-files-skill.zip`, exported from this event by `pnpm skill:export` in this repository (`skills/studio-files/SKILL.md`), to unzip into
`~/.claude/skills` or upload under Settings › Skills. Cowork given the folder DOES read the `CLAUDE.md`
in it and follows it. Neither runs the checker; what they write is validated with `studio-check`
(`pip install studio-kinds` puts it on any machine with Python — nothing leaves the machine) or by
opening it in the Studio. Without the checker, the kind's JSON Schema — `studio-check --schema <ext>`,
or the raw file `kinds/<ext>/v<N>.schema.json` on GitHub — says the shape; the references between
fields (a `needs` to a task key, a `status` to a column) are the checker's alone.

## 0 · Which kind for what

The question "what file type should this be?" is answered by what the thing IS, never by what
looks easiest to write. These are the kinds; when none fits, the file is markdown. One row each;
combine them (a brief feeding a playbook feeding a board).

EVERY KIND IS ONE FILE. A document holds everything it shows — its own rows, its own
tasks, its own clips, and any document of another kind it needs, written in — and names no
other file. Nothing is read from beside it, so a document can be pasted, checked and
rendered anywhere, and two documents can never drift apart.

| you want | kind | because |
|---|---|---|
| a hierarchical group of content — the facts of a situation, in sections | `.brief` | a titled tree of sections with prose; a section may hold one whole document of another kind, written in as `content: {kind, doc}` |
| event-based content: what applies when a specific event happens, under given criteria; an event is something that happens intentionally or is imposed, and its content is the event's information given a context | `.playbook` | one file: decisions, and events on the table while their `when` holds, each showing one document, written in, that follows the answers; start from the template |
| several workflows that follow the same process, each one's progress tracked | `.kanban` | columns are the stages, tasks the items; rows are derived from `needs:` edges — never hand-ordered; a task that holds more than its card shows writes that document into itself |
| workflow items with a start date and an end date, seen on a calendar | `.calendar` | its own tasks with `needs:`, `duration:` and a `due:` to chain back from; every date drawn is derived, none written down |
| a set of rules that sorts and filters, agnostic of the actual data | `.policy` | params → ordered cases (first match wins) → buckets; or the chain — `role: tags` dimensions, and `role: order` ranking over them with those dimensions written in |
| a system that follows a state machine — states, and the events that move between them; states clicked through are kept until the page refreshes | `.flow` | screens with variants and edges; a state shows one of the flow's own `frames:` or a screenshot beside it; the walkthrough keeps its pins for the session |
| a data table over JSON rows | `.jsonl` | one JSON object per line — the file's own rows — plus `$title`, `$description` and `$labels` for what is known about them; columns found from the rows, paged, searched, sorted |
| a list curated from several places at several times — the items in the file, each with an id; what came later as stages (rules that set fields, a filter, a sort — each under a circumstance the decisions name); the output shown through views | `.pipeline` | one file: the rows as of any stage and the logic that made them one click apart; the pills are taken for the session only |
| a gallery view of data — each item with its images, facts and link, decided over one at a time | `.collection` | the rows copied in, and a log of decisions with reasons; the copy is a handover — nothing points back at where the rows came from |
| the notes of one MIDI clip — a beat, a bass line, chords, a hook — on a piano roll, handed to a DAW | `.clip` | pitches by name (`C2`, `F#3`) or number, `start`/`length` in beats from 0, velocities, drum `lanes:` as step strings (`x...x...`); Export .mid writes the Standard MIDI File beside it |
| clips placed on tracks — the arrangement, and the ONE file to drop on Ableton | `.song` | the clips written in under `clips:`, placed by `{clip: <name>, at: <bar>, repeat, transpose}`; drawn as tracks against bars; Export .mid = one multi-track MIDI file, a named track per song track |
| one pot of money and the ways it could be placed, weighed against each other — a deposit, a property, a business | `.finance` | the `capital` there is to place, one `horizon_years` every option is judged over, and a `benchmark` the rest have to beat; each option states the capital it takes, its `loan`, its `growth_pct`, its `flows` in and out and what its `exit` costs. The shape of the comparison, never its verdict: no return is computed and none is stored |
| a script you press play on — the code, the interpreter and the environment variables it needs, in one file you can read before running | `.script` | `language` (powershell, pwsh, bash, sh, python, node, cmd), `env:` (the variables the run gets, shown on open), `cwd:`, `code:`; Run starts the interpreter on the host and shows the exit code, the output and the errors; the file is never changed by running |
| one list of items seen several ways — as a table, on a kanban, on a calendar, as a gantt, as a dependency tree, as a page of its own — from one file | `.views` | `items:` (mappings, each with an id), `fields:` saying which key plays which role — `status` allows the Kanban, `start`/`end` the Calendar, `previous` the Tree, the dates with `previous` or `parent` the Gantt, which nests children under their `parent` — and `views:` naming the views to offer, each with a `filter` over the items (the pipeline's clauses) — a `kind: page` view carries a Nunjucks `template` that renders the view's `items`; the views are read, nothing is written, the open view lasts the session |
| an HTML page made from its own data — a Nunjucks template and the model it renders, shown rendered when opened | `.page` | `model:` (the data — each key a variable of the template), `template:` (Nunjucks: `{{ }}`, `{% for %}`, `{% if %}`, filters, macros, `extends`), `partials:` (what the template's `include`, `import` and `extends` name, by name, in the file); rendered in a sandboxed frame, the engine's message in its place when it fails; nothing is written |
| anything else | `.md` | plain markdown — the default whenever no kind above fits |

Worked example — "a process for managing a trip, from the input markdown": `trip.brief` (the
facts: party, dates, car, stay, budget), `trip.playbook` (decisions such as *where to stay*
with answers Narooma / Tilba / further out, *car* pickup and return, *days* — each answer
holding the events that only matter then) and `todo.kanban` (book the car → book the stay →
pack, with `needs:`, `duration:` and `due:`), or `todo.calendar` when the dates are what
matters. Notes that fit none of these are `.md`.

## 1 · The protocol

1. **Read the kind's book first**, once per kind. Every kind has a playbook that explains how it
   works, one per version, at a predictable path in studio-kinds:
   ```bash
   studio-check --book playbook        # prints kinds/playbook/v2.playbook, in the checkout the command links to
   studio-check --book playbook 1      # an earlier version's book
   studio-check --books                # every kind and version, with its book
   ```
   The path is always `kinds/<ext>/v<N>.playbook` in this repository; open it and walk it. Beside it,
   the kind's JSON SCHEMA — the shape, every field's type, what is required, a description on each —
   and the same as a table, the FIELD TABLE:
   ```bash
   studio-check --schema playbook      # prints kinds/playbook/v2.schema.json (draft 2020-12)
   studio-check --fields playbook      # prints kinds/playbook/v2.fields.yaml
   ```
   Then the spec, from the engine itself:
   ```bash
   studio-check --spec playbook
   ```
   (`brief`, `kanban`, `policy`, `flow`, …). The spec is the engine file's header plus the template
   every kind carries. Do not guess fields from another file; a field the parser does not know is
   silently dropped on the next UI save.
2. **Start new files from the template** — every kind has one — then edit:
   ```bash
   studio-check --template playbook > new.playbook
   ```
3. **Write only what the engine needs.** No informational text in a document: no `description:` prose
   restating the rules, no `note:` explanations, no comment trails — a file is its rules or its
   data, and a `title:` only where the view needs a heading. The owner reads the files; explanation
   belongs in the spec (`--spec`), not in his documents.
4. **Edit with the smallest change** — targeted line edits, never a rewrite of the whole file. Ids
   are identity (`id:` on screens and views; `key:` on decisions and events): keep them stable, add
   new ones, never renumber. Comments and formatting survive your text edits but NOT a save from the
   Studio UI (parse→dump), so anything that must persist goes in a field, not a comment.
5. **Check after every edit** — always, before reporting done:
   ```bash
   studio-check org-structure.flow
   studio-check .                      # the whole folder
   ```
   Exit 1 = problems, printed per file. Fix them; a document that fails here fails in the Studio.
   Without the checker (another PC, Claude.ai, Cowork), validate the shape against the kind's JSON
   Schema; only the checker sees the references between fields inside the document.
6. **Refer to documents by path** in replies, exactly as on disk.

## 2 · The kinds

| ext | what it is | the check (in `python/studio_kinds/kinds`) |
|---|---|---|
| `.brief` | a titled tree of sections with prose; a section may hold one document of another kind, written in as `content: {kind, doc}` | `brief.py` |
| `.playbook` | decisions, and events on the table while their `when` holds, each with one document written in | `playbook.py` |
| `.kanban` | columns + tasks (`needs:` for dependencies); a task may hold one document written in as `content: {kind, doc}` | `kanban.py` |
| `.calendar` | its own tasks, and the `due:` the schedule chains backward from — every date derived, none authored | `calendar.py` |
| `.policy` | params → ordered cases (first match wins) → buckets; or the chain: `role: tags` (dimensions with ordered `derive` rules) and `role: order` (a ranking over their combinations, with those dimensions written in under `tags:`). The one clause vocabulary — equals/not_equals/contains/not_contains/starts_with/ends_with/matches/gt/gte/lt/lte/between `[lo, hi]`/in `[...]`/not_in/is_empty/not_empty/is_true/is_false; a text op takes one value or a LIST = any of them. A policy knows nothing about any data: no source, no rows | `policy.py` |
| `.flow` | a walkthrough of screens: states with variants and edges; a state shows one of the flow's own `frames:` at a view, or a screenshot from `<stem>-assets/` | `flow.py` (two YAML docs: model `---` views) |
| `.jsonl` | data rows: one JSON object per line, shown as a paged table with the columns found, a search over every field, a sort per header, a row opened whole on click (links open in the browser, copy with a click). The rows are the file's own — written by whatever PRODUCES the data (a scrape, an export, a script you write), one `JSON.stringify(row)` per line, same keys per row where you can; not hand-edited row by row. What is known ABOUT them lives here too, on directive lines — a line whose keys start with `$` is not a row: `{"$title": "Stays by price", "$description": "…"}` and `{"$labels": {"best_offer.price_total_aud": "Total (4 nights, AUD)"}}` (header names by field) | `jsonl.py` |
| `.pipeline` | ONE curated list and its stages, in one file: `decisions:` (a playbook's — `{key, label, values: [{key, label}]}`), `labels:` (header names by field), `items:` (mappings, each with an `id` — a uuid, its identity, what a rule's `item:` names; mint one with `crypto.randomUUID()` when adding an item), `stages:` in order, each `key` + ONE verb — `rules:` (`item:` an id or a list and/or `where:` clauses → `set:` fields, a `note`; a rule matching no item is a problem), `filter:` (clauses every kept item holds; the rest dropped for the stages after and the output), `sort:` (`{field, dir}`, first key first) — with an optional `label:` and `when:`; `views:` the output shown, each `key`, `label`, `filter`/`sort`/`columns`/`hide`/`limit` (a view's filter hides for that view only), `when:`. `when:` on a rule, a stage or a view = refs `decision=answer` into `decisions`, holding while no taken answer contradicts it: nothing taken, everything applies and a later rule wins; the pills are taken on the page for the session, never saved. A value a rule set carries its refs as a badge; one key set by two rules under different circumstances shows every value on the table in the cell (the row's, then the others muted) until an answer decides — write one rule per circumstance, never one rule with two values; the row dialog shows the id and every field's trail. Nothing cached, nothing written back. `studio-check --collect stays.pipeline` (or `#<view>`) copies the output into a `.collection` of its own | `pipeline.py` |
| `.collection` | rows to decide over, one at a time: `to:` (where directions go), `fields:`/`labels:` (the columns shown), `stats:` (the fields shown as big cards), `items:` (the rows themselves, each with an `id`; `featured:` the picture chosen for it), `decisions:` a LOG of `{item, op: up\|down\|hide\|show, reason}` in the order taken — never applied to the items; the order shown is derived (rank = ups − downs, hidden out). An item's fields may be edited in place (no reason). Made by Collect on a table, `studio-check --collect stays.jsonl` or `--collect stays.pipeline#<view>`; not hand-written. The rows are COPIED in — nothing points back — so read the reasons to write the rules that yield the same order | `collection.py` |
| `.clip` | the NOTES of one MIDI clip: `tempo`, `time: 4/4`, `bars`, `channel`, `velocity`, `naming` (scientific = C4 is 60, the default; `ableton` = C3 is 60, what Live shows), `notes: [{pitch, start, length, velocity}]` (pitch = a name, a number, or a LIST for a chord; start/length in beats — quarter notes — from 0), `grid` (steps per bar, 16) + `lanes: [{name, pitch, steps: "x...X...o...", length?, velocity?}]` (`x` a hit, `X` accent 127, `o` ghost 50, `1`–`9` ninths of 127, `.`/`-` rest, `\|` and spaces ignored). Drawn as a piano roll (lanes coloured apart, a note past the clip's end shaded); Export .mid writes `<stem>.mid` beside it, or `studio-check --midi x.clip` | `clip.py` |
| `.song` | an arrangement, whole: `tempo`/`time` (default: the first placed clip's), `clips: [{name, …the clip's own fields}]` — the clips this song is made of, written in — and `tracks: [{name, channel?, clips: [{clip: <name>, at?, repeat?, transpose?}]}]` placing them; `at` a BAR from 0 (default: right after the previous placement), `repeat` back-to-back passes, `transpose` semitones. A riff played twice is written once and placed twice; a placement naming no clip is a problem, the rest still renders. Drawn as an arrangement (blocks with note thumbnails; a block opens its clip; a track's name lays its notes on a roll); Export .mid = ONE format-1 MIDI file, a named track per song track, or `studio-check --midi x.song` — drop it on Ableton Live's Arrangement for one track per song track at the song's tempo | `song.py` |
| `.finance` | one pot of money and the ways it could be placed, side by side: `capital` (the money there is to place), `horizon_years` (the one window every option is judged over), `currency` (the document's — never an option's), `as_of`, `assumptions:` (`inflation_pct`, `tax_rate_pct` — what is true of every option alike), `benchmark:` (the id of the option the rest have to beat) and `options:` — each `{id, label, capital, loan: {amount, rate_pct, term_years, interest_only}, growth_pct, flows: [...], exit: {sell, cost_pct}, effort_hours_per_week, risk: low\|medium\|high\|speculative, liquidity: days\|weeks\|months\|years, note}`. Options are ALTERNATIVES, not a portfolio: their capital is never added up. A FLOW is money moving each year, `direction: in\|out` (money out is a direction, never a negative amount), sized by an `amount` (repeating, compounding at its own `growth_pct`) or a `schedule: [year 1, year 2, …]` for a ramp a rate cannot say — one or the other, never both — and bounded by `start_year`/`end_year`, counted from 1. Every rate is a PERCENT (`4.5`, not `0.045`). The document holds the SHAPE of the comparison and never its verdict: no return is computed and none is stored, the figures are worked out elsewhere and written in as they stand, and the check reads STRUCTURE only — whether a figure is a number, never what the number says | `finance.py` |
| `.script` | a script as a document: `title`, `language` (`powershell` — `powershell.exe` on Windows, `pwsh` elsewhere — `pwsh`, `bash`, `sh`, `python`, `node`, `cmd`; the command on the host's PATH), `env:` (name → text, number or boolean; the environment variables the run gets, saved in the file and shown on open; a name is `[A-Za-z_][A-Za-z0-9_]*`), `cwd:` (a folder relative to the file's, default the file's folder; the run cannot leave the opened folder), `code:` (a block string). Opened: the variables and the code with line numbers, and Run; pressed, the host writes the code to a temporary file and starts the interpreter with the host's environment plus `env`, in `cwd`, and the panel shows `exit N · N.Ns`, the output and the errors. The web Studio's folder worker re-reads the file from disk and runs what it holds — nothing a page sends reaches the shell; the desktop app and VS Code run what the page parsed. Secrets stay in the host's environment, which the run inherits | `script.py` |
| `.views` | one list and the views over it: `items:` (mappings, each with an id — a string, or a whole number), `fields:` (role → the item key that plays it: `id` and `title` default to those names; `status` → a Kanban; `start` — and `end` — → a Calendar; `previous` (one id or a list, of items in this file) → a Tree; `start` + `end` + `previous` or `parent` → a Gantt; `parent` (one id) nests an item under another in the Gantt, and a parent with no dates of its own spans its children), `columns:` (the statuses in order; absent = the values found, first seen first), `views:` (the views to offer, in order — each `{key, kind: table|kanban|calendar|gantt|tree|page, label?, filter?, sort?, limit?}`, a `page` with a Nunjucks `template:` and its `partials:`, the template handed `items` — the view's items as written — with `title`, `fields`, `columns` and `view`; `filter` is the suite's clause vocabulary over the items' own keys and hides for that view only; absent = one view of every kind the roles allow, the table first). A view whose roles are not named is a problem. Every other key an item carries is shown as it is — a table column, a line in the item's dialog. Dates `YYYY-MM-DD`. Read only: nothing on the page writes the file, and which view is open is the session's | `views.py` |
| `.page` | an HTML page made from its own data: `title`, `model:` (a mapping — each key a variable of the template; a value is the YAML as written, a date as the text it is written as), `partials:` (name → Nunjucks template: what `include`, `import`, `from … import` and `extends` name — never a path), `template:` (Nunjucks; its output is the page, a `<!doctype html>` put first when it has none). Opened, it renders in a sandboxed frame — scripts allowed, the host's origin withheld — and a template the engine refuses shows its message in place of the page. The checker reads the structure and the partials named; the template's syntax is the engine's to judge. The web Studio and the desktop app render it; VS Code opens it as text | `page.py` |
| `.md` | markdown — rendered, edited as text; the default when no kind fits | — |

## 3 · Conventions that bite

- **`.flow` is TWO YAML documents** separated by a line that is just `---`: doc 1 = the MODEL
  (`dimensions`, `derived`, `frames`, `screens` with their own `variants` and `edges`), doc 2 =
  the VIEWS (saved pins; the preview writes only this half, and they are the states kept while
  clicking through — gone on refresh). Screen `id`s and titles are the diff identity — unique,
  stable. A screen that looks different under different data is ONE screen with `variants`, never
  two screens. A control that goes somewhere different is ONE edge with `dispatch`. A panel is a
  `frame` of this flow at one of its views, or a `screenshot`; the images live in
  `<stem>-assets/` beside the flow, the one thing a document keeps outside itself.
- **`.playbook`** — one file, `version: 2` on the first line
  (`studio-check --template playbook > new.playbook`): `decisions` + `events`. ON THE EVENT:
  `when` (on the table only where it holds; absent = always), `hint` (what to do before its
  document shows — the ask while a `by` answer is open; the response when it shows nothing).
  Every decision opens unanswered, and answering or folding a panel changes the screen and never
  the file — no host saves a book from the walk. What is always true is the content of an
  always-on event. Each event has ONE content entry IN THE BOOK — a mapping, not a list:
  `content: {key?, label?, kind, doc}` for one document, or `content: {key?, label?, kind, by,
  docs}` for a closed set that FOLLOWS the answer — one document per combination of the `by`
  answers, keyed `decision=answer,...` in `by` order (`{kind: brief, by: [push], docs: {push=yes:
  {title, sections}, push=no: {...}}}`). `kind` names the renderer, a document is that kind's YAML
  (a block string for `md`). While a `by` decision is unanswered the pane shows the event's
  `hint` and asks for the answer; once taken, the member for that answer shows. A nested book is
  `kind: playbook` with the whole book under `doc`. Paste it, validate it, render it with nothing
  beside it. Content has no path, so no annotations and no pinning; a document two books need is
  written in each.
  `studio-check` runs the kind's own engine over each document and refuses `doc`/`docs` without
  `kind`, `doc` and `docs` together, `by` on a `doc`, `docs` without `by`, a `docs` set that is
  not exactly the closed set of its `by` answers, and an `md` document that is not a string. It
  names as gone: a `content` list, a `file` on an entry, `topics:`, `rules:`, `view:`, `status`
  and `sets` on an event, `library:`, `compare:`, `materials:`, `scales:`. Nesting is unlimited
  (a cycle is refused). Never author steps as events — a procedure is markdown.
- **`.policy`**: `params` → `cases` in order, the FIRST matching case wins → buckets. Every param a
  clause names is declared under `params`, every bucket a case names under `buckets`, and `op` is one
  of the vocabulary in the kinds table — the checker names a misspelled one, because the engine
  would drop the clause and the case would match everything. An `order` policy writes the
  dimensions it ranks over into itself under `tags:`, so the ranking says what it reads;
  `role: table`, `policy:`, `items:` and `map:` are named as gone.
- **`.kanban`** `columns` + `tasks` (`needs:` for dependencies — keys of tasks in the same board;
  `duration:` in calendar days; `due:` as `YYYY-MM-DD`; `status:` spelled as a column title). The
  checker names a `needs` to no task, a status that is no column, a duplicate key, a cycle.
  **`.calendar`** is the same tasks without columns, and a `due:` to chain back from.
  **`.brief`** `sections: [{title, description?, body?, children?}]`.
- **A document inside a document** — a brief's section, a kanban's task, a playbook's event:
  `content: {kind, doc}`, where `kind` is any kind the Studio knows and `doc` is that kind's YAML
  (a block string for `md`). The checker runs it through that kind's own engine, so a broken
  kanban inside a brief is a broken brief. One document per section or task; a document two
  places need is written in both.
- **`.pipeline`**: every item has a uuid `id` — mint one when adding an item, never renumber; a stage's
  `key` is its identity; ONE verb per stage (`rules`, `filter` or `sort`) and no `kind:` — the verb says
  what the stage is; a rule that means one item says `item: <id>`, not a `where` on its name; every
  `when` ref names a declared decision and answer (the checker refuses the rest); a stage's filter
  drops for good, a view's filter hides for that view only. `studio-check` prints every stage's counts.
- **`.clip` / `.song`** count in BEATS (quarter notes) and BARS from 0, whatever the time signature
  (a bar of 6/8 is 3 beats). Pitch names are scientific — `C4` = 60, a GM kick is `C2` = 36 — unless the
  file says `naming: ableton` (Live labels 60 as `C3`, its drum-rack kick `C1`); the roll shows the name
  AND the number, so check the number when in doubt. Nothing plays in the Studio: the piano roll is
  the check, the `.mid` is the handover. To Ableton: drop the exported `.mid` on a track (a song's on
  the Arrangement), or add the folder to Live's browser (Places › Add Folder) so every export shows
  up there as it lands. No `.als`/`.alc` is written — that format is undocumented and version-bound.
- **`.finance` checks STRUCTURE, never the figures.** The numbers are worked out elsewhere — a
  script, a spreadsheet, an agent — and written in as they stand, so the engine asks whether a figure
  is a number and never what the number says. An option taking triple the pot, a schedule running
  past the horizon, an `end_year` before its `start_year`, a cost written as a negative, a rate of
  4000%: every one of those passes. Do not add a rule that judges a value — a figure that makes no
  sense is the author's, and the author computed it. What IS refused is structure: a missing or
  repeated `id`, no `label`, a `benchmark` naming no option, a `loan` with no `rate_pct`, an unknown
  `risk`/`liquidity`/`direction`, a flow with both an `amount` and a `schedule` or with neither.
- **`.finance` compares over ONE ground.** The currency, the `capital` and the `horizon_years` are the
  document's, never an option's — two options written over different windows or different money are
  two documents, not a comparison. Every rate is a percent (`4.5`, not `0.045`), and money leaving is
  a flow's `direction: out`, never a negative amount (a convention the engine does not enforce). An
  option's `capital` is what it takes OF the pot, so options never sum: each is a way to spend the
  same money. A `loan` is what makes leverage sayable — a property taking a small deposit and
  controlling a whole asset reads differently from a deposit taking the lot. A flow's `amount` (and a
  `schedule`'s first entry) is its FIRST RUNNING year, not year 1: `{amount: 82000, growth_pct: 3,
  start_year: 3}` is 82,000 in year 3, so a late flow is authored at a figure you can check against a
  quote. Nothing in the file is a return: the kind states the comparison and leaves the arithmetic to
  whatever reads it.
- **`.script` runs on the host, as the host.** Run starts the interpreter named by `language` with the
  host's own environment plus `env`, in `cwd` under the opened folder — so a script does whatever the
  person running the Studio can do. The variables belong in the file when they describe the run (a
  folder, a name, a flag) and in the host's environment when they must stay off disk (a key, a
  password): the run inherits the host's and the file overrides only what it names. The checker
  refuses a `language` no host can start, a variable whose name is not an identifier or whose value
  is not one string's worth (a list, a mapping), and blank code; it never runs anything.
- **`.views` roles unlock views; `views:` picks them.** A kanban needs a `status` role, a calendar a
  `start`, a tree a `previous`, a gantt `start`, `end` and `previous` or `parent`. Name under `fields`
  only the roles the items really carry, and name them by the item's OWN keys (`status: stage` when
  the items say `stage:`) — the items are data as they came, the roles are the reading. Without
  `views:` every view the roles allow is offered; with it, only those, in that order, and a view
  whose roles are not named is a problem, not a silent absence. A view's `filter` hides items for
  that view only — write one view per way of looking (`open` = a kanban of what is not Done, `plan`
  = the gantt of everything), never a filter on the items themselves. `previous` names ids, one or
  a list, and `parent` one id, of items in the same file; an id no item has, the item itself, or a
  cycle is a problem. The kanban's `columns` are optional: absent, the statuses found are the
  columns, first seen first. A `page` view is named, never offered by the roles: `kind: page` with a
  `template` of its own, handed the view's `items` as written — `{% for item in items %}` and the
  items' own keys, `item[fields.title]` for the label whatever its key.
- **`.page` is data and a template; the engine judges the template.** The facts go under `model`,
  the HTML in `template`, and a piece used twice is a partial, named by its key under `partials` —
  never a path. The checker reads the structure and the partials named; the template's syntax is
  Nunjucks' to judge, and a page that fails to render says why in its place. Output is escaped
  unless the template says `safe`; `groupby` gives a mapping (`for team, members in people |
  groupby("team")`); there is no `break`.
- **No document names another.** Every kind is one self-contained file: what a document
  shows is in it, written in where it is a document of another kind. The one thing kept
  outside a file is an image — a flow's screenshots in `<stem>-assets/` beside it.

## 4 · How the previews pick up your edits

- **VS Code extension** (Studio tab, or "Open Preview to the Side"): VS Code reloads the document
  from disk when it changes and the Studio tab re-renders — no action needed. If the Studio tab has
  unsaved edits of its own, VS Code's usual conflict handling applies.
- **Desktop app**: it watches the open folder; the open document re-reads itself when the file
  changes on disk and no edit of its own is pending. The folder tree on the welcome page refreshes.
- **Web Studio / Nodes** work over the shared drive (`nodes.entries`), not disk — that is the
  `suite-nodes` skill's territory.

## 5 · Where things are

- The checks: `python/studio_kinds/kinds/<kind>.py` in this repository — one module per kind, the
  Python package `studio-kinds`. The schemas, books and field tables: `kinds/<ext>/v<N>.schema.json`,
  `v<N>.playbook`, `v<N>.fields.yaml`, shipped inside the package as data. The Studio's own renderers
  (parked): `packages/filekinds/src/lib/` and `src/components`.
- The checker is the global command `studio-check` (`--spec <ext>`, `--schema <ext>`, `--template <ext>`,
  `--collect <file.jsonl|file.pipeline[#view]>`, `--midi <file.clip|file.song> [name.mid]`, `<files or folders>`).
  On the dev machine it is `pip install -e python` from a checkout of this repository; on any other
  machine `pip install studio-kinds`, the wheel from a GitHub Release of this repository, or
  `install-studio.ps1` from the release, which also installs the desktop app, the VS Code extension and
  this guide as a skill; the package carries every kind's schema, book, field table, spec and template,
  so `--schema`, `--book`, `--fields`, `--spec` and `--template` answer without a checkout. If
  `studio-check` is not on the PATH, say so and install it before editing documents.
- Samples: `examples/` in this repository — a brief, a playbook, a kanban with its calendar, a policy, a
  script, a views document, a page — every one passing the checker.
