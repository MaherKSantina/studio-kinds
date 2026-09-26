# .page — Page

## The engine's account

The check is `python/studio_kinds/kinds/page.py` in the studio-kinds repository; the account below is that engine's own.

The `.page` file kind: an HTML page made from its own data — a Nunjucks
template, the model it renders and the partials it includes, in one file.
Opened, the template is rendered with the model inside a sandboxed frame —
scripts allowed, the host's origin withheld, the frame an `.html` file opens
in — and what the template wrote is the page shown. Nothing is read from
beside the file, and nothing writes to it.

Authoring shape (YAML, lenient — a half-written file still renders):

  title: Team roster
  model:                      # the template's variables, by name
    team: Platform
    people:
      - {name: Ada Lovelace, role: Lead}
      - {name: Alan Turing, role: Research}
  partials:                   # what the template includes, imports or extends, by name
    card: |
      <li><b>{{ person.name }}</b> — {{ person.role }}</li>
  template: |
    <h1>{{ team }}</h1>
    <ul>{% for person in people %}{% include "card" %}{% endfor %}</ul>

`template` is Nunjucks — Jinja's syntax: `{{ }}` writes a value, `{% %}` is a
tag (`for`, `if`, `set`, `macro`, `call`, `block`), `|` applies a filter.
Every key of `model` is a variable of the template and of every partial; a
value is the YAML as written — text, a number, a boolean, a list, a mapping,
and a date as the text it is written as. Output is escaped unless the `safe`
filter says otherwise. `include`, `import`, `from … import` and `extends`
name a partial of this file, never a path: the page holds everything it
shows.

The CHECKER names: not a mapping, a `title` that is not text, a `model` that
is not a mapping, `partials` that is not a mapping or a partial that is not
text, no `template` (or one that is not text, or blank), and an `include`,
`import`, `from` or `extends` naming a partial the file does not hold. The
template's syntax is the renderer's to judge: a page that fails to render
shows the engine's message in its place.

## A fresh document (what the Studio creates)

```yaml
title: "untitled"
model:
  heading: Hello
  items:
    - {name: First, note: the first thing}
    - {name: Second, note: what follows it}
partials:
  item: |
    <li><b>{{ item.name }}</b> — {{ item.note }}</li>
template: |
  <style>
    body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem; }
  </style>
  <h1>{{ heading }}</h1>
  <ul>
  {% for item in items %}{% include "item" %}{% endfor %}
  </ul>
```
