# .brief — Brief

## The engine's account

The check is `python/studio_kinds/kinds/brief.py` in the studio-kinds repository; the account below is the Studio's engine's own (`packages/filekinds/src/lib/briefDoc.ts`), which the check reproduces.

The `.brief` file kind: a nested set of titled sections, each with a one-line
description, a markdown body, and — where what the section holds is a document
of another kind — that document, written in.

It exists because the shape kept being wanted outside the one place it grew. The foundry
FEATURES stage renders exactly this — a tree on the left, and a title + description +
rendered markdown for whichever node you click — and there was no way to author one as an
ordinary file, or to point a loom role at it.

So `.brief` is that UI made into a file, and it renders through the SAME component
(`FeatureTreeExplorer`), not a copy of it. The only thing this module does is translate
between the readable YAML spelling and the node shape that explorer already takes:

    YAML          in memory
    title    ↔    name
    body     ↔    prose
    content  ↔    content
    children ↔    children

The YAML spelling wins on the file side because `title`/`description`/`body` is what every
other authored kind here uses (`.list`, `.kanban`, `.email`), and a file people and agents
write should not inherit a vocabulary from the one stage that happened to need it first.

A SECTION CAN HOLD ONE DOCUMENT OF ANY KIND the Studio knows — a playbook, a kanban, a
guide, a policy, a data table, markdown — written in the section as `content: {kind, doc}`
(writtenDocument.ts): `kind` names the engine, `doc` is the document exactly as a file of
that kind would hold it. The viewer shows it under the section's prose through that kind's
own viewer, and the checker runs it through that kind's own engine, so a broken document in
a section is a broken brief. One document per section: a section that needs two has two
children. Refused (`briefProblems`): a `content` that is not a mapping, one without `kind`
or without `doc`, an `md` document that is not a string, and `by`, `docs` or `file` on it —
a brief has no answers to vary by and names no file.

    sections:
      - title: The master is read
        body: What happens, in prose; the moments that can arise are the book below.
        content:
          kind: playbook
          doc:
            version: 2
            events:
              - key: missing
                label: The master playbook is missing
                content: {kind: md, doc: The missing note goes out, exit 0.}

Parsing is LENIENT and never throws — a half-written file still has to render. It also
accepts the in-memory spelling (`name`/`prose`) and the foundry array key (`features`), so
a features payload pasted into a `.brief` just works.

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
title: untitled
description: ""
sections:
  - title: First section
    body: ""
```

