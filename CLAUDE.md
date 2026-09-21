# studio-kinds — how Claude works here

`claude/claude.playbook` is Claude's master playbook for this repository, a version-2 book: its
events are things that happen while working on the Studio — the kinds and their engines, the
checker, the page, the desktop app, the VS Code extension, the skill, the kits — and each event's
content, a checklist or a child playbook, is written in the file itself. Consult it:

- at the start of every task, to know which events to watch for;
- whenever one of its events happens, open that event's content in the book and do every item;
- when the content is a child playbook (After a change lands, Committing to memory, After a
  refactor), its decisions have NO standing answer: a version-2 walk is session-only and nothing
  clicked in the Studio is ever saved. Ask the repository's owner each question in chat and act on
  the answer given there: the event's content follows the answer (`docs`, one document per
  answer), and until it is answered the event's own `hint` says what to do.

The owner adds events and content in the Studio; Claude keeps the checklists true to how the
Studio actually works. After every edit to these files: `studio-check <file>`.

Memory is IN a brief: `claude/memory.brief` (one file, listed in `.gitignore` — this repository is
public and the memory is the owner's private notes, so it never leaves the machine). Its top
sections are the areas, each holding one child section per remembered fact. Take an area's
section and read its facts before working there. Writing to `memory.brief` or to
`claude.playbook` happens only through the master's event "Something should be committed to
memory": show the write, ask, write only on a yes, and show every write in full in the report.
Never write to `~/.claude/projects/*/memory` — auto-memory is off for this repo.

A suite may embed this repository as a submodule and keep its own books; what is the suite's (its
apps, servers, drive, data) lives in those, and this book never depends on them.
