# .playbook — Playbook

## The engine's account

The check is `python/studio_kinds/kinds/playbook.py` in the studio-kinds repository; the account below is that engine's own.

`.playbook` — where we are, what can happen, and what is true while it
does, in ONE file.

TWO lists, and one derived thing.

DECISIONS are the state space. A state is not an entry in a list, it is an
ASSIGNMENT — which answer is currently taken for each decision. Enumerating
states collapses a composition onto a line, and the line is always a lie:
"partnership" and "company, no users" differ on one decision, "company with
users" differs on two, and no ordering makes those the same distance apart.
Decisions nest, because an answer can bring a further question into
existence (`activates`) that has no meaning otherwise.

EVENTS are global and unowned. They arrive regardless of where you stand.
What varies is whether they CAN arise, which the event's own `when` says,
and what you do about them, which its document shows. What is always true
is the content of an always-on event.

CONTENT is WRITTEN IN, and chosen by answers, never read under them. An
event's `content` is ONE entry, a mapping, not a list: `kind` names the
renderer (there is no extension to pick it); then either `doc`, one
document as that kind's YAML parses it (a string for `md`), or `by` +
`docs`, a closed set of them — one per combination of the `by` answers,
keyed `decision=answer,...` in `by` order — so the document shown FOLLOWS
the answer. Nothing is generated while walking, and nothing is fetched: a
book carries every document it can show.

The derived thing is the state itself. Nothing in the file names one.

  version: 2
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

ON THE EVENT: `when` — present only where it holds; absent, the event is
always on the table — and `hint`, markdown shown while an answer the
document follows is still open (or as the whole detail, when the event has
no document).

THE WALK IS SESSION-ONLY. The book is stateless: it links answers to what
each event shows, and answering changes which events are on the table and
which document shows — on screen. Nothing is written back: every decision
starts unanswered each time the file opens, and no host saves a book from
the walk.

ONE FILE, whole: paste it, validate it, render it with nothing else on
disk, and the checker runs each document through its own kind's engine. A
document two books need is written in each. Content has no path, so it
carries no annotations and is never pinned.

`version: 2` at the top is the line a book carries; a file without it reads
the same way. A file the engine cannot carry — a newer version, or one
holding what the format has not got — is never written back: the checker
names it, and a host holds the walk for the session instead of saving,
because a save re-emits what was read and would lose the rest.

Refused: `doc` or `docs` without `kind`, both `doc` and `docs`, `by` on a
`doc`, `docs` without `by`, a `docs` key that is not a combination of the
`by` answers, a combination with no document, an `md` document that is not
a string. Named as gone: `topics:` (what is always true is an always-on
event's content), `rules:` (an event carries its own `when` and `hint`),
`view:` (the walk writes nothing), `status`/`sets` on an event, a `content`
list, and a `file` on an entry — the document goes in the book.

## Also — a document written inside another

A DOCUMENT WRITTEN INSIDE ANOTHER — the shape a brief's section, a kanban
task's and a playbook event's `content` share.

There is no file, so there is no extension to pick a renderer from: `kind`
names the engine that renders `doc`, and `doc` is the document exactly as a
file of that kind would hold it — as that kind's YAML parses it, or its text
for `md`. A viewer takes the text back under a synthetic path that the
file-kind registry resolves as it would a real `x.brief`. Nothing is read
from disk to show it, so a written document carries no annotations and is
never pinned; a document two files need is written in each.

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

