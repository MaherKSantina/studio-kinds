# studio-kinds — how Claude works here

`claude/claude.playbook` is Claude's master playbook for this repository, a version-2 book: its
events are things that happen while working on the Studio — the kinds and their engines, the
checker, the page, the desktop app, the VS Code extension, the skill, the kits — and each event's
content, a checklist or a child playbook, is written in the file itself. Consult it:

- at the start of every task, to know which events to watch for;
- whenever one of its events happens, open that event's content in the book and do every item;
- when the content is a child playbook (After a change lands, Committing to memory, After a
  refactor), its decisions have NO standing answer: a version-2 walk is session-only and nothing
  clicked in the Studio is ever saved. Ask Maher each question in chat and act on the answer he
  gives there: the event's content follows his answer (`docs`, one document per answer), and
  until he answers the event's own `hint` says what to do.

Maher adds events and content in the Studio; Claude keeps the checklists true to how the Studio
actually works. After every edit to these files: `studio-check <file>`.

Memory is IN a playbook: `claude/memory.playbook` (version 2, one file). Its `Working on: <area>`
events each hold one brief, one section per remembered fact. Take an area's event and read its
document before working there. Writing to `memory.playbook` or to `claude.playbook` happens only
through the master's event "Something should be committed to memory": show the write, ask, write
only on a yes, and show every write in full in the report. Never write to
`~/.claude/projects/*/memory` — auto-memory is off for this repo. `memory.playbook` is listed in
`.gitignore`: this repository is public and the memory is Maher's private notes, so it never
leaves the machine.

The suite around the Studio — `C:\Github\orchestration`, which embeds this repository as the
submodule `suite/studio-kinds` — has its own pair of books under `claude/` there. What is the
suite's (its apps, servers, drive, data, Maher's own areas) lives in those; the suite's master reads
this one where a Studio matter comes up, and this one never depends on the suite's. A fact about
the suite learned here belongs to its memory, not this one.
