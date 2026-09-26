"""`.page` — an HTML page made from its own data: a Nunjucks template, the model it renders and the
partials it includes, in one file. Opened, the template is rendered with the model inside a sandboxed
frame — scripts allowed, the host's origin withheld, the frame an `.html` file opens in — and what the
template wrote is the page shown. Nothing is read from beside the file, and nothing writes to it.

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

`template` is Nunjucks — Jinja's syntax: `{{ }}` writes a value, `{% %}` is a tag (`for`, `if`, `set`,
`macro`, `call`, `block`), `|` applies a filter. Every key of `model` is a variable of the template and
of every partial; a value is the YAML as written — text, a number, a boolean, a list, a mapping, and a
date as the text it is written as. Output is escaped unless the `safe` filter says otherwise.
`include`, `import`, `from … import` and `extends` name a partial of this file, never a path: the page
holds everything it shows.

The check: not a mapping, a `title` that is not text, a `model` that is not a mapping, `partials` that is
not a mapping or a partial that is not text, no `template` (or one that is not text, or blank), and an
`include`, `import`, `from` or `extends` naming a partial the file does not hold. The template's syntax
is the renderer's to judge: a page that fails to render shows the engine's message in its place.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .. import _yaml
from .._js import as_str, defined, get, is_obj, js_str, json_of, plural
from . import CheckResult

_RAW = re.compile(r"\{%-?\s*(raw|verbatim)\s*-?%\}.*?\{%-?\s*end\1\s*-?%\}", re.S)
_COMMENT = re.compile(r"\{#.*?#\}", re.S)
_NAMING = re.compile(r"""\{%-?\s*(include|import|from|extends)\s+(?:"([^"]*)"|'([^']*)')(.*?)-?%\}""", re.S)
_LITERAL_REST = re.compile(r"^(?:$|(?:as|import|with|without)\b)")
_IGNORE_MISSING = re.compile(r"^ignore\s+missing\b")


@dataclass
class Page:
    title: str
    template: str
    model: dict[str, Any] = field(default_factory=dict)
    partials: dict[str, str] = field(default_factory=dict)
    """Every partial that is text, by its name as the template writes it."""
    description: str | None = None


def _name(k: object) -> str:
    return k if isinstance(k, str) else js_str(k)


def parse(text: str) -> Page:
    """The lenient read — never refuses: an unparseable file is an empty page."""
    raw = _yaml.load_or_none(text)
    if not is_obj(raw):
        return Page("", "")
    partials = {
        _name(k): v
        for k, v in (raw["partials"].items() if is_obj(raw.get("partials")) else [])
        if isinstance(v, str)
    }
    return Page(
        as_str(raw.get("title")),
        raw["template"] if isinstance(raw.get("template"), str) else "",
        raw["model"] if is_obj(raw.get("model")) else {},
        partials,
        as_str(raw.get("description")) or None,
    )


def named_partials(source: str) -> list[tuple[str, str]]:
    """Every `(tag, name)` where an `include`, `import`, `from` or `extends` names a partial by a literal —
    outside comments and `raw` blocks. A computed name, and an `include … ignore missing`, name nothing
    the check can hold the file to."""
    text = _COMMENT.sub("", _RAW.sub("", source))
    out: list[tuple[str, str]] = []
    for m in _NAMING.finditer(text):
        tag, rest = m.group(1), m.group(4).strip()
        if tag == "include" and _IGNORE_MISSING.match(rest):
            continue
        if not _LITERAL_REST.match(rest):
            continue
        out.append((tag, m.group(2) if m.group(2) is not None else m.group(3)))
    return out


def template_problems(raw: dict, holder: str = "page", renders: str = "the page renders", at: str = "") -> list[str]:
    """What is wrong with the `template` and the `partials` a mapping holds — a page's, or a `.views` page
    view's: `partials` not a mapping or a partial not text; no `template`, one not text, or blank; and an
    `include`, `import`, `from` or `extends` naming a partial the mapping does not hold. `holder` names
    what holds them, `renders` what the template renders, and `at` goes before every line."""
    out: list[str] = []
    partials = get(raw, "partials")
    if defined(partials):
        if not is_obj(partials):
            out.append(f"{at}`partials` is not a mapping — partial names to their templates (got {json_of(partials)})")
        else:
            for k, v in partials.items():
                if not isinstance(v, str):
                    out.append(f"{at}partial {json_of(_name(k))}: not text — write it as a block string (got {json_of(v)})")
    template = get(raw, "template")
    if not defined(template):
        out.append(f"{at}no `template` — the Nunjucks template {renders}, as a block string")
    elif not isinstance(template, str):
        out.append(f"{at}`template` is not text — write it as a block string (got {json_of(template)})")
    elif not template.strip():
        out.append(f"{at}`template` is blank — the {holder} would be empty")

    # Every partial a template names is one it holds: a document names no other file.
    held = {_name(k) for k in partials} if is_obj(partials) else set()
    sources = [("template", template)] if isinstance(template, str) else []
    if is_obj(partials):
        sources += [(f"partial {json_of(_name(k))}", v) for k, v in partials.items() if isinstance(v, str)]
    for where, source in sources:
        for tag, name in named_partials(source):
            line = f"{at}{where}: `{tag} {json_of(name)}` names no partial of this {holder} — write it under `partials`"
            if name not in held and line not in out:
                out.append(line)
    return out


def problems(text: str) -> list[str]:
    raw = _yaml.load_or_none(text)
    if not is_obj(raw):
        return ["not a mapping — a page is a `template` and the `model` it renders"]
    out: list[str] = []
    if defined(get(raw, "title")) and not isinstance(raw["title"], str):
        out.append(f"`title` is not text (got {json_of(raw['title'])})")
    if defined(get(raw, "model")) and not is_obj(raw["model"]):
        out.append(f"`model` is not a mapping — the template's variables, by name (got {json_of(raw['model'])})")
    return out + template_problems(raw)


def summary(doc: Page) -> str:
    lines = len(doc.template.strip().splitlines()) if doc.template.strip() else 0
    return f"{plural(len(doc.model), 'variable')} · {plural(len(doc.partials), 'partial')} · {plural(lines, 'line')}"


def check(text: str) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    return CheckResult(problems(text), summary(parse(text)))
