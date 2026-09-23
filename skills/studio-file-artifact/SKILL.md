---
name: studio-file-artifact
description: Render a studio-kinds document — a .brief, .playbook or .pipeline file — as an interactive, shareable HTML artifact that behaves exactly as the kind's book specifies and looks like one consistent viewer. Use whenever the user gives or points to a .brief, .playbook or .pipeline file and wants to see it, preview it, render it, click through it, share it with teammates, send someone a link, or "make an artifact / page / viewer" of it, and whenever they want an artifact made from such a file updated — even if they never say "artifact" or "studio-kinds".
compatibility: Needs node for the two helper scripts, curl (or Invoke-WebRequest) to fetch the kind's book, and the Artifact tool to publish.
---

# Studio file → artifact

One studio-kinds document in; one private, interactive artifact out, which the user
opens and shares with their team. Three things make the result worth sharing, and every
step below exists to protect one of them:

1. **It behaves as the kind's book says.** Each kind's behaviour — what the parser keeps
   from a file, what is drawn when it opens, what every click does — is specified in the
   kind's *book*, published as plain markdown in the studio-kinds repository. The book is
   the specification. This skill deliberately does not restate it: a second copy would
   quietly drift from the first. Read the book every time.
2. **It looks like the same viewer every time.** The user chose one consistent look for
   every document, so a teammate who opens five of these sees one product. That look lives
   in `assets/viewer-shell.html`. Build on it; don't redesign it.
3. **Its link is stable.** Rendering a file again republishes to the same URL, so a link
   already shared keeps working and shows the latest version.

## Workflow

### 1. Read the file and name its kind

The kind is the file's extension: `brief`, `playbook` or `pipeline`. Read the file.

Any other kind is outside what this skill was built and tested for. Say so; if the user
still wants it, the same method works for any kind that has a book, but tell them the
result is untested.

### 2. Learn the kind from its book

Fetch these verbatim — use `curl` (or `Invoke-WebRequest`), not a summarising web tool,
because a specification has to be read word for word:

```
https://raw.githubusercontent.com/MaherKSantina/studio-kinds/master/kinds/README.md
https://raw.githubusercontent.com/MaherKSantina/studio-kinds/master/kinds/<kind>/README.md
```

…and the README of **every kind the file embeds**. Walk the document for every `content`
entry and collect its `kind` (including the documents under a `docs` map, and documents
embedded inside those). Section bodies and hints are markdown, so read `kinds/md/README.md`
whenever the file has prose — it fixes the markdown dialect. Without network access, fall
back to a local studio-kinds checkout if the user has one, and say which you used.

Read each README in full, then take from it:

| event in the book | gives you |
|---|---|
| **Always** | the shape, and exactly how the parser reads a file — aliases, fallbacks, what it drops |
| **The file is opened** | the initial state and *what is drawn* |
| each **… is clicked**, **… is taken**, **… is answered** | what every interaction does, and what it doesn't |
| **Another kind shows it** | only for a kind that appears embedded in this file |

Skip **studio-check runs on it** and **… is written**: they cover checking and authoring,
not viewing.

Four things trip people who implement from these books:

- **The schema is the authoring shape; a reader is lenient beyond it.** Never refuse to
  render a document for failing the schema. A missing title, an older spelling, an empty
  file all still open, and the book says how each reads — follow that.
- **An artifact is a standalone page.** Where a book describes a host with a "pane trail",
  take its standalone branch instead. Where it measures *the component's* width, measure
  the working area with `onWidth`, not the window. Build every width the book describes:
  artifacts are opened on phones.
- **The book's "strip" is the shell's strip.** The Studio shows the file's name above the
  viewer; the shell already draws that. There is no sidecar beside an artifact, so no Notes
  pill.
- **Nothing the reader does is saved.** Selections, folds and answers are session state in
  every one of these books. Keep them in memory; don't write them to `localStorage`.

### 3. Look for the link made last time

```bash
node <skill-dir>/scripts/links.mjs get "<file>"
```

It prints the artifact URL made from this file before, or nothing. A URL here is exact —
update that artifact.

If it prints nothing — say, on a machine that has never rendered this file — call the
Artifact tool with `action: "list"` and look for artifacts titled exactly what this page
will be titled. A title match is only a guess: another document can share a title, and
republishing replaces what that artifact shows. So name what you found (title and when it
was last updated) and ask the user whether to update it or make a new one. No match: this
is a new artifact.

### 4. Build the page

Decide the title first: the document's own title, read the way its book reads it (the
brief and playbook books give their fallbacks; for a pipeline with no title use the file's
stem). A document's title is a real name, which is what an artifact's title should be.

Then start the page from the shell — this embeds the file verbatim and safely, so never
paste or retype the file's contents into the page yourself:

```bash
node <skill-dir>/scripts/prepare_page.mjs "<file>" "<out-dir>/<stem>.html" "<title>"
```

Now replace `renderKind(parsed, root)` — the marked section near the end of the page —
with the view the book specifies. `parsed` is `{ doc, error }`; draw into `root`, the
working area. Implement what the book says is drawn on open and what each interaction
does, exactly. Where the book is silent, choose the simplest reasonable thing and keep a
note of it for your report.

Use the shell's helpers and classes rather than writing your own, so every page stays one
product:

| helper | for |
|---|---|
| `h(tag, props, ...kids)` | building elements; `props`: `class`, `text`, `html` (only for `md()` output), `on`, `attrs` |
| `md(text)` | markdown in the md kind's dialect, sanitised; returns HTML for `h(…, { html })` |
| `str(v)`, `firstText(obj, keys)` | a non-string reads as empty; the first non-empty of several spellings |
| `onWidth(el, px, fn)` | `fn(isWide)` now and whenever `el` crosses the book's threshold |
| `caret(expanded, onClick, label)` | a disclosure button, rotated when expanded |

| class | for |
|---|---|
| `.head` (with `h1`, `.meta`), `.bar` | the kind's own header; a band under it (e.g. decision pills) |
| `.split` › `.rail` + `.pane` | a list beside a detail |
| `.split.is-drill` (+ `.is-detail`) | narrow, drilling: the list fills the width; `.is-detail` shows the pane in its place, with a `.back` |
| `.split.is-stacked` | narrow, stacked: the list above the detail |
| `.row` (`.label`, `.meta`, `.is-on`, `.is-off`) | a row that is one target |
| `.item` › `caret` + `.pick` (`.is-on`), `.caret-gap` | a tree row whose caret folds and whose label selects; indent it with `style="--depth: N"` |
| `.group`, `.question`, `.pills` › `.pill[aria-pressed]`, `.search`, `.back` | rail headings, answers, search, the narrow back control |
| `.title`, `.lede`, `.tags`, `.hint`, `.logic`, `.skipped`, `.doc` › `.doc-kind` | an item's detail; rules written out; an embedded document |
| `.badge`, `.ref`, `.change.add/.edit/.remove`, `.kw`, `.field`, `.val` | what is literally in the file |
| `.grid-wrap` › `table.grid`, `td.is-set`, `td.is-open`, `tr.is-dropped`, `.opts` › `.opt` › `.v`, `.grid-note` | data grids and claimed cells |
| `.md`, `.empty`, `.problem` | prose; an empty region; a document that could not be read |

If the book needs something the shell lacks, add it in the page's own `<style>` using the
shell's tokens (`var(--accent)` and friends) — never a literal colour, which works in one
theme and breaks in the other.

You may look at the page once before publishing. Don't build a test loop around it; the
live artifact is where the user reviews it.

### 5. Publish

**New artifact.** Call the Artifact tool with `action: "quickstart"`, `intent: "other"`
first — the tool requires that for every new artifact, and its page contract applies. Its
design guidance does not: the look is already fixed by the shell. It may also list
artifact types, a Docs type among them; ignore them — a `.brief` is a studio-kinds YAML
file, not a Claude Doc, and every kind here publishes as this plain page. Then publish with
`file_path`, a one-sentence `description` (for example "The email-triggers.brief document
as an interactive brief viewer."), and an `icon`: `document` for a brief, `map` for a
playbook, `table` for a pipeline.

**Existing artifact.** Call `action: "read"` on its URL first — the tool refuses to publish
to an artifact this conversation has not read or published — then publish with `url` and
`file_path`. Leave out `icon`, so it keeps the one it has.

Then remember the link:

```bash
node <skill-dir>/scripts/links.mjs set "<file>" "<url>" "<title>"
```

### 6. Report

Give the link, and say it is private until the user shares it from the artifact's page. Add
one line on what the viewer does, and list anything the book left you to decide — those
are where the book could be clearer.

## Decisions the user has made

These override the book where the two differ. The user made each one after seeing the
alternative.

**One look for every document.** Keep the shell's tokens, type and components. A document
never gets its own palette or typefaces. Teammates open many of these, and they should all
read as the same viewer.

**A pipeline cell claimed under more than one circumstance shows every value as equals.**
The pipeline book says such a cell shows the value the row carries — the later rule's —
with its badge, then the other values *muted*. The user rejected that. While the decisions
are unanswered, none of those values has been chosen; the later one comes last only
because of the order the rules happen to be written in, which says nothing about which is
true. So draw every value on the table the same way — same weight, same badge style, in
the order the rules are written — in a `td.is-open` cell, and prefer none. Once the answers
leave a single value, draw that one value with its badge in a `td.is-set` cell. Keep the
book's rule that the *row* carries the last-written value into later stages; that is how
stages run. Only the cell's display changes.

**Rendering a file again updates the same link.** Steps 3 and 5 do this. Make a new
artifact for a file already rendered only when the user asks for one.
