"""`.brief` — a nested set of titled sections, each with a one-line description, a markdown body,
and, where what the section holds is a document of another kind, that document written in as
`content: {kind, doc}`.

Parsing is lenient and never fails — a half-written file still renders — and accepts the
in-memory spelling (`name`/`prose`), `heading` for a title, and `features` or `items` for the root
list. The check names what the lenient parse silently took: a `content` that is not a mapping,
one without `kind` or `doc`, an `md` document that is not a string, and `by`, `docs` or `file` on
it — a brief has no answers to vary by and names no file. Each written document is then run through
its own kind's engine, so a broken kanban inside a brief is a broken brief.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .. import _yaml
from .._js import as_str, is_obj, is_list
from . import CheckResult, content_problems, read_content, written_doc_problems


@dataclass
class Section:
    name: str
    content: dict | None = None
    """`{"kind": str, "doc": Any}` when the section holds a written document."""
    children: list["Section"] = field(default_factory=list)


def _coerce(raw: Any) -> Section | None:
    if not is_obj(raw):
        return None
    node = Section(name=as_str(raw.get("title")) or as_str(raw.get("name")) or as_str(raw.get("heading")))
    node.content = read_content(raw.get("content"))
    node.children = [n for n in (_coerce(c) for c in (raw.get("children") if is_list(raw.get("children")) else [])) if n]
    return node


def _root_list(raw: dict) -> list:
    for key in ("sections", "features", "items"):
        if is_list(raw.get(key)):
            return raw[key]
    return []


def parse(text: str) -> list[Section]:
    """The tree; empty for an unparseable or non-mapping text."""
    if not text.strip():
        return []
    loaded = _yaml.load_or_none(text)
    if not is_obj(loaded):
        return []
    return [n for n in (_coerce(s) for s in _root_list(loaded)) if n]


def problems(text: str) -> list[str]:
    """What a section's `content` cannot be, read from the text as written."""
    loaded = _yaml.load_or_none(text)
    if not is_obj(loaded):
        return []
    out: list[str] = []

    def walk(items: list, prefix: str) -> None:
        for raw in items:
            if not is_obj(raw):
                continue
            name = as_str(raw.get("title")) or as_str(raw.get("name")) or as_str(raw.get("heading")) or "Untitled"
            path = f"{prefix} › {name}" if prefix else name
            out.extend(f"section {path}: {p}" for p in content_problems(raw, "a section", "a brief", "playbook, kanban, md"))
            walk(raw["children"] if is_list(raw.get("children")) else [], path)

    walk(_root_list(loaded), "")
    return out


def _flatten(sections: list[Section], prefix: str = "") -> list[tuple[str, Section]]:
    out: list[tuple[str, Section]] = []
    for s in sections:
        path = f"{prefix} › {s.name}" if prefix else s.name
        out.append((path, s))
        out.extend(_flatten(s.children, path))
    return out


def _count(sections: list[Section]) -> int:
    return sum(1 + _count(s.children) for s in sections)


def check(text: str) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    sections = parse(text)
    out = problems(text)
    written = 0
    for path, node in _flatten(sections):
        if node.content and node.content["kind"]:
            written += 1
        out.extend(written_doc_problems(f"section {path}", node.content))
    summary = f"{_count(sections)} sections" + (f", {written} documents" if written else "")
    return CheckResult(out, summary)
