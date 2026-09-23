# How a version-1 markdown works

<!-- Generated from kinds/md/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

Plain markdown, rendered — no fields, nothing to validate; what the renderer does with links and images, and where the same pane draws every other kind's prose.

This is the `.md` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Always

*imposed*

What holds at every moment — there is no shape, and where the renderer lives.

### The shape of the file

Markdown, and nothing the Studio parses.

#### No fields

A `.md` is text. There is no version line, no key the Studio reads, no engine that
turns it into a document. The template is one heading: `# <stem>` and a blank line.
Anything else in a document store that fits no other kind is a `.md`.

#### The dialect

GitHub-flavoured markdown: tables, task lists, strikethrough, autolinks, fenced code.
Line breaks inside a paragraph are joined unless the host asks for hard breaks.

#### Where the renderer lives

`packages/filekinds/src/lib/MarkdownPane.tsx` — `react-markdown` with `remark-gfm`
(and `remark-breaks` when a host asks), styled by `markdown.css`. It is registered
under `.md` in `lib/filePreviews.tsx`. `studio-check --spec md` prints only "Plain
markdown; the Studio renders it, nothing to validate."

## The file is opened

*imposed*

The text is rendered; relative targets are resolved into the store beside the file.

The whole text goes through the markdown pane. Given the file's store path, a relative
image or link target — `diagram.png`, `../notes/plan.md` — is turned into the store's raw
file URL beside this document, so a handover page shows the PNGs saved next to it. A
target that starts with a scheme, `//`, `/` or `#` passes through untouched: web, data
and anchor URLs are left alone.

In the Studio, the desktop app and VS Code's "Open with Studio" there is one surface per
document — the rendered pane inside `DocumentPreview`, with the file's name in the strip
and a "Notes" pill when an annotations sidecar, `<file>.annotations`, sits beside it. Nothing is parsed, so
nothing can fail to open.

## A link or an image is followed

*chosen · many*

A relative target opens the store file; a web target opens the browser.

A relative link resolves to the store's raw URL for that path, so it opens the bytes the
store holds — a `.md` beside this one opens as text, not as a rendered document. A web
link opens in the browser. An anchor jumps within the pane. An image with a relative
source is shown from the store; one that is not there shows as a broken image, with no
problem reported anywhere.

## The file changes on disk

*imposed · many*

The host re-reads and the pane re-renders; there is no state to keep.

The desktop watcher (250 ms debounce, then `studio:fs-changed`), the web folder entry's
server events, or VS Code's text document deliver the new text. The Studio re-reads unless
its autosave is dirty, saving or in error. The pane renders the new text; the scroll
position is whatever the browser keeps.

## Another kind renders prose

*imposed · many*

Every markdown field in every other kind goes through the same pane.

### Where the same pane draws

The pane is one component; the kinds hand it their prose.

#### Fields that are markdown

A brief section's `body`. A guide step's `detail`. A kanban task's `body`. A
playbook's `kind: md` documents (block strings) and every `hint`. A policy's `note`.
A workup step's instructions. Each renders through `previewForPath("section.md")`
— the registry's `.md` renderer — with the host's path, so relative images resolve
beside the host file.

#### Files the kit writes as markdown

`CLAUDE.md` beside a memory, written by "Prepare for Claude Code". `README.md` in
a new project's folder. `versions.md`, the changelog in a versioned file's folder.
`handover.md` in a frame's handover export, beside the PNGs it links.

## studio-check runs on it

*imposed*

Nothing to validate — the checker says so and passes.

The command line prints `ok <name>  Markdown — nothing to validate` and never counts it
as a problem; a folder walk skips `.md` files altogether, since the kind has no check. A playbook
with `kind: md` content is checked only for the document being a string.

## A note is written

*chosen*

### Write a markdown note

The one kind with nothing to get right.

#### Start from the template

`studio-check --template md > new.md`, or Ctrl+N in the Studio — `# new` and a
blank line. A project's "New file" and the project Ask accept content for a `.md`
and put it under the heading.

#### Keep images beside it

Save the image in the same folder, or under it, and write the relative path — the
pane resolves it into the store. An absolute web URL works too.

#### Ask whether it should be another kind

A hierarchy of content is a `.brief`; content under events and answers is a
`.playbook`; rules are a `.policy`; rows are a `.jsonl`. A `.md` is for what fits
nothing else.
