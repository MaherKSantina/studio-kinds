# How a page works

<!-- Generated from kinds/page/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

An HTML page made from its own data — a Nunjucks template, the model it renders and the partials it names, in one file; rendered on open inside a sandboxed frame, the engine's message in its place when it fails, nothing read from beside the file and nothing written to it.

This is the `.page` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Did the template render?** (`render`) — The pane is the page, or the engine's message in its place.

- `rendered` — Yes — the page shows. The template and its partials rendered with the model; the output fills the pane.
- `failed` — No — the engine refused it. A syntax error, a partial the file does not hold, a filter Nunjucks does not have, or an error raised while rendering. The pane shows the engine's message.

## Always

*imposed*

What holds at every moment — the shape of the file, the template language, where the page renders and why there, and where the engine lives.

### The shape of the file

A template, the model it renders and the partials it names — everything the page shows, in one file.

#### Top-level keys

| key | what it is |
|---|---|
| `title` | not drawn — the page is what shows; the page's name, and the frame's accessible name ("Page" when absent) |
| `description` | not drawn; a one-line summary of the page, read and kept on a dump |
| `model` | the data the template renders — every key a variable of the template and of every partial |
| `partials` | the templates `include`, `import`, `from … import` and `extends` name, by name |
| `template` | the Nunjucks template whose output is the page, as a block string |

```yaml
title: Team roster
model:
  team: Platform
  people:
    - {name: Ada Lovelace, role: Lead}
    - {name: Alan Turing, role: Research}
partials:
  card: |
    <li><b>{{ person.name }}</b> — {{ person.role }}</li>
template: |
  <h1>{{ team }}</h1>
  <ul>{% for person in people %}{% include "card" %}{% endfor %}</ul>
```

#### The model

A mapping; each key is a variable of the template and of every partial. An included
partial also sees the variables where it is included (`person` above); an imported one
sees only what its macros are handed, unless the import says `with context`. A value is
the YAML as written — text, a number, a boolean, a list, a mapping — and a date stays the
text it is written as (`2026-10-01`), never a timestamp. Anchors, aliases and `<<` merge
keys work. A key the template cannot write as a name (`first-name`) is reached one level
down: `person["first-name"]`. A variable the model does not hold renders as nothing.

#### The template language

Nunjucks 3.2.4 — Jinja's syntax, run in JavaScript.

| write | for |
|---|---|
| `{{ person.name }}` | a value, escaped — markup in the data shows as text; `{{ html \| safe }}` writes trusted markup as it is |
| `{{ name \| upper }}`, `{{ items \| join(", ") }}` | a filter: `upper`, `lower`, `title`, `trim`, `truncate`, `replace`, `default`, `join`, `length`, `sort`, `reverse`, `first`, `last`, `sum`, `round`, `dictsort`, `selectattr`, `dump`; `groupby("team")` gives a mapping, so `for team, members in people \| groupby("team")` |
| `{% for x in xs %}…{% else %}…{% endfor %}` | a loop — `loop.index`, `loop.first`, `loop.last`; `for key, value in mapping`; there is no `break` |
| `{% if %}…{% elif %}…{% else %}…{% endif %}` | a condition; `a if c else b` inline |
| `{% set total = a + b %}` | a variable — `+ - * / // % **`, `~` joins text, `and`, `or`, `not`, `in`, `range(n)` |
| `{% macro card(title) %}…{{ caller() }}…{% endmacro %}` | a component; `{% call card("Links") %}…{% endcall %}` hands it a block of HTML |
| `{% extends "layout" %}` and `{% block body %}…{% endblock %}` | a layout the page fills; `{{ super() }}` keeps the layout's own |
| `{% include "row" %}`, `{% import "ui" as ui %}`, `{% from "ui" import card %}` | a partial of this file, by name |
| `{# … #}`, `{% raw %}…{% endraw %}` | a comment; text kept as written |

The output is the whole page: a `<!doctype html>` is put first when it starts with none,
and `<style>`, `<script>` and `<link>` are the page's own, written in the template like
any HTML.

#### Where the page renders, and why there

In a sandboxed frame — scripts allowed, popups allowed, the host's origin withheld — the
frame an `.html` file opens in. The frame is handed the engine, the template, the
partials and the model; it renders them and replaces itself with the output. A template
can reach JavaScript, so it runs where JavaScript cannot reach the Studio: nothing a page
does touches the folder, the Studio's page or the desktop app's shell. A page's own
scripts run as an `.html` file's do; a link opens inside the frame, and one with
`target="_blank"` in a new window.

#### Where the engine lives

`python/studio_kinds/kinds/page.py` — `parse`, `problems`, `named_partials`, `summary`;
its header comment is what `studio-check --spec page` prints. The shape is
`kinds/page/v1.schema.json` and the field table `v1.fields.yaml`. The view is
`components/page/PageView.tsx`, and the frame `PageFrame.tsx` beside it — the frame a
`.views` page view renders in too — over `lib/pageDoc.ts`, which builds the frame's document:
Nunjucks' browser build (`nunjucks/browser/nunjucks.min.js`) as a script, the page as
JSON, and `RENDER_PAGE`, the code that renders it — the code the tests run. The web
Studio over a folder and the desktop app render a page; VS Code opens a `.page` file as
text.

## The file is opened

*imposed*

parsePage reads the YAML once and never throws; the frame renders the page and says whether it did.

> Say whether the template rendered — the pane is the page, or the engine's message in its place.

### When `render=rendered`

#### The page

##### The parse

The title ("Page" when absent), the model when it is a mapping (none otherwise), every
partial that is text (the rest are dropped — the checker names them), and the
template (empty when absent). The model is read as written: a date stays text.

##### What is drawn

The frame, filling the pane and named by the title, white until the page paints a
background of its own. In it, the template's output as a page of its own — its
styles, its scripts, its links. Nothing else: no heading and no toolbar; the host's
strip names the file.

### When `render=failed`

#### The engine's message

##### The parse

The same parse — the title, the model, the partials that are text, the template.

##### What is drawn

A panel in place of the page, "The page did not render", and the engine's message
under it in monospace: the template or partial it came from in brackets, with the
line and column when the engine gives them — `(template) [Line 3, Column 12]` — and
what it refused: `unknown block tag: endfo`, `template not found: footer`, `filter
not found: money`. The frame stays hidden until a text renders.

## The file changes on disk

*imposed · many*

The host re-reads; the frame is rebuilt from the new text and renders again.

The desktop watcher (250 ms debounce, `studio:fs-changed`) or the web folder entry's server
events deliver the new text, and the Studio re-reads unless its autosave is dirty, saving or
in error. The page re-parses and the frame is rebuilt from the new text: it renders from the
top, so what the last page held — its scroll position, what its scripts kept — is gone. A
page that failed renders again, and the message goes once it renders.

## A page is written into another document

*imposed · many*

A brief's section, a kanban's task or a playbook's event holds a page as its content — the same frame.

`content: {kind: page, doc: {title, model, partials, template}}` — the page written in whole,
as every kind is. The checker runs `page.py` over it, so a partial the page names and does not
hold is a problem of the document that holds it. The view is the same frame, at the height
the host gives the content.

## studio-check runs on it

*imposed*

One file in, one verdict out — the structure, and the partials the templates name; the template's syntax is the renderer's.

### What the checker does

The order it runs in, and what it leaves to the renderer.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `problems`: not a mapping; a `title` that is not text; a `model` that is not a
   mapping; `partials` that is not a mapping, or a partial that is not text; no
   `template`, a `template` that is not text, or one that is blank.
3. The partials named: in the template and in every partial, each `include`, `import`,
   `from` and `extends` that names a partial by a literal, outside `{# comments #}` and
   `{% raw %}` blocks, names one the file holds. Each that does not is a line —
   `` template: `include "footer"` names no partial of this page — write it under `partials` ``.
   A computed name, and an `include … ignore missing`, are left alone.
4. The summary line: `ok <name>  Page  2 variables · 1 partial · 7 lines` — the model's
   keys, the partials that are text, the template's lines.

#### Not checked

The template's syntax, the filters and variables it uses, and the HTML it writes:
Nunjucks is the page's engine and runs in the frame, so a page that does not render
says why there, in its place. What the page's scripts do.

## A page is written

*chosen*

### Write a page

The data, the HTML, the pieces used twice.

#### Start from the template

`studio-check --template page > new.page` — a heading and a list of two items, with a
partial for an item; replace them.

#### Write the data under model

The facts the page shows, as YAML — one key per thing the template names, a list for
what repeats. Data, not markup: a value is escaped unless the template writes it with
`safe`.

#### Write the HTML against the model

`template` is the page: `{{ }}` for a value, `{% for %}` for what repeats, `{% if %}` for
what depends, a filter for how a value reads. Styles and scripts go in it too — the
output is the whole page.

#### Pull out what is used twice

A piece used twice is a partial under `partials`, written in with `include`; a set of
components is a partial of macros, `import`ed; a layout is a partial the page
`extends`, filling its `block`s. Each is named by its key under `partials`, never by a
path.

#### Check it, then open it

`studio-check new.page` — a partial named and not written, a template that is not
text: each is a line. Open the file in the Studio over a folder or the desktop app; a
template the engine refuses shows its message in place of the page.
