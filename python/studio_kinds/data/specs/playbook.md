# .playbook — Playbook

## The engine's account

The check is `python/studio_kinds/kinds/playbook.py` in the studio-kinds repository; the account below is the Studio's engine's own (`packages/filekinds/src/lib/playbookDoc.ts`), which the check reproduces.

`.playbook` — where we are, what can happen, and what is true while it does.

THREE lists, and one derived thing.

DECISIONS are the state space. A state is not an entry in a list, it is an
ASSIGNMENT — which answer is currently taken for each decision. Enumerating
states collapses a composition onto a line, and the line is always a lie:
"partnership" and "company, no users" differ on one decision, "company with
users" differs on two, and no ordering makes those the same distance apart.
Decisions nest, because an answer can bring a further question into
existence (`activates`) that has no meaning otherwise.

EVENTS are global and unowned. They arrive regardless of where you stand.
What varies is whether they CAN arise and what you do about them — version
1 says so in `rules`, version 2 on the event itself — and, at version 1,
whether they move you (`sets`). An event's `content` is what it shows when
taken — a markdown file, a guide, another playbook.

TOPICS are the content that is true while you stand here. A topic exists
everywhere unless `when` says otherwise, and shows its `content`.

CONTENT is chosen by answers, never read under them. A content entry is one
document, or a closed set that VARIES `by: [decision, ...]`: one whole
document per answer combination, authored up front (`studio-check` lists the
missing ones) and handed nothing from here — a child playbook is
self-contained. Nothing is generated while walking. Where the documents
live is what the version says, below.

The derived thing is the state itself. Nothing in the file names one.

VERSIONS — `version: N` at the top level says which playbook this is
(see docVersion.ts). Absent means 1. Every version stays readable as it was.
A file this engine cannot carry — a newer version, or a file holding what
its version has not got — is never written back: `versionProblems` names
it, and a host holds the walk for the session instead of saving, because a
save re-emits what was read and would lose the rest.

Version 1 is the book above — decisions, events, topics, rules — and a
content entry is a FILE beside the book: `{file, label?, by?}`, one or more
per event or topic. `file` is a base when it varies `by`: the one shown is
`<file>.variants/<decision=answer,...>.<same extension>`, segments in `by`
order — `steps.brief` by `push` shows `steps.brief.variants/push=yes.brief`.
Every path is relative to the root book's folder.

Version 2 is DECISIONS and EVENTS, each event showing ONE document IN THE
BOOK, and the walk over it is SESSION-ONLY. Decisions, their answers,
`activates` and `when` are as at version 1. An event's document shows when
the answers it follows are taken, and until then the pane shows the event's
`hint` and asks for them. ON THE EVENT: `when` — present only where it
holds; absent, the event is always on the table — `hint`, markdown shown
while an answer the document follows is still open (or as the whole detail,
when the event has no document). The book is stateless: it links answers
to what each event shows, and answering changes which events are on the
table and which document shows — on screen. Nothing is written back: every
decision starts unanswered each time the file opens, and a host never saves
a version-2 book from the walk. What is always true is the content of an
always-on event. An event's `content` is ONE entry, a mapping, not a list:
`kind` names the renderer (there is no extension to pick it); then either
`doc`, one document as that kind's YAML parses it (a string for `md`), or
`by` + `docs`, a closed set of them — one per combination of the `by`
answers, keyed `decision=answer,...` in `by` order — so the document shown
FOLLOWS the answer.

  decisions:
    - key: push
      label: Push to origin?
      values: [{key: yes, label: Yes}, {key: no, label: No}]
  events:
    - key: always
      label: Always
      hint: Ask whether to push.      # shown while push is unanswered
      content:
        key: steps               # optional: what the view collapses by
        label: What to do        # optional: the panel header
        kind: brief              # the kind of every member
        by: [push]               # the set follows this answer
        docs:
          push=yes: {title: Push and release, sections: [...]}
          push=no: {title: Nothing leaves the machine, sections: [...]}
    - key: tag
      label: Cut a release
      when: [push=yes]           # on the table only under this answer
      content: {kind: md, doc: Tag the commit and push the tag.}

A version-2 book is ONE FILE: paste it, validate it, render it with nothing
else on disk, and the checker runs each document through its own kind's
engine. Content has no path, so it carries no annotations and is never
pinned; a document shared between books is a version-1 `file`.
Refused: `doc` or `docs` without `kind`, both `doc` and `docs`, `by` on a
`doc`, `docs` without `by`, a `docs` key that is not a combination of the
`by` answers, a combination with no document, an `md` document that is not
a string. Each version drops what only the other has and `versionProblems`
names it — in a version-1 file a written entry, or `when` or `hint` on an
event (add `version: 2`, or move them to a rule); in a
version-2 file a `content` list or a `file` on an entry (write the document
into the book, or take `version: 2` off).

## Also (writtenDocument.ts)

A DOCUMENT WRITTEN INSIDE ANOTHER — the shape a playbook event's `content`
and a brief section's `content` share.

There is no file, so there is no extension to pick a renderer from: `kind`
names the engine that renders `doc`, and `doc` is the document exactly as a
file of that kind would hold it — as that kind's YAML parses it, or its text
for `md`. A viewer takes the text back (`docText`) under a synthetic path
(`writtenPath`, `inline.brief`) that the file-kind registry resolves as it
would a real `x.brief`. Nothing is read from disk to show it, so a written
document carries no annotations and is never pinned; a document two files
share is written in each.

    content:
      kind: playbook          # any kind the Studio knows: brief, playbook, kanban, md, …
      doc:                    # the document, as a file of that kind would hold it
        version: 2
        events: [...]

The checker runs each written document through its own kind's engine, so a
broken kanban inside a brief fails the brief.

## A fresh document (what the Studio creates)

```yaml
version: 2
title: untitled
description: The questions, the events, and what each event shows — every document in this file; answers are session-only.
decisions:
  - key: example
    label: An example decision
    values:
      - { key: not-yet, label: Not yet }
      - { key: done, label: Done }
events:
  - key: example
    label: An example event
    trigger: imposed
    hint: Ask which.
    content:
      kind: md
      by: [example]
      docs:
        example=not-yet: ""
        example=done: ""
```

