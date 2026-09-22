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
from .._js import as_str, get, is_obj, defined, is_list
from . import CheckResult, check_written, written_kind


@dataclass
class Section:
    name: str
    content: dict | None = None
    """`{"kind": str, "doc": Any}` when the section holds a written document."""
    children: list["Section"] = field(default_factory=list)


def _coerce_content(raw: Any) -> dict | None:
    if not is_obj(raw):
        return None
    return {"kind": written_kind(raw.get("kind")) or "", "doc": raw.get("doc")}


def _coerce(raw: Any) -> Section | None:
    if not is_obj(raw):
        return None
    node = Section(name=as_str(raw.get("title")) or as_str(raw.get("name")) or as_str(raw.get("heading")))
    node.content = _coerce_content(raw.get("content"))
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
            if defined(get(raw, "content")):
                where = f"section {path}"
                c = raw["content"]
                if not is_obj(c):
                    out.append(f"{where}: `content` is not a mapping — write `kind` and `doc`")
                else:
                    kind = written_kind(c.get("kind"))
                    if not kind:
                        out.append(f"{where}: `content` has no `kind` — say which kind renders it (playbook, kanban, md, …)")
                    if not defined(get(c, "doc")):
                        out.append(f"{where}: `content` has no `doc` — the document itself, as a file of that kind would hold it")
                    for k in ("by", "docs", "file"):
                        if defined(get(c, k)):
                            out.append(f"{where}: `content` has `{k}` — a section holds one document written in; a brief has no answers to vary by and names no file")
                    if kind == "md" and defined(get(c, "doc")) and not isinstance(c["doc"], str):
                        out.append(f"{where}: an `md` document is its text — write it as a block string")
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


def check(text: str, file: str | None = None) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    sections = parse(text)
    out = problems(text)
    written = 0
    for path, node in _flatten(sections):
        if not node.content or not node.content["kind"]:
            continue
        written += 1
        kind = node.content["kind"]
        name = f"section {path} ({kind})"
        known, r = check_written(kind, node.content["doc"], file)
        if not known:
            out.append(f"{name}: not a kind the Studio knows — `--kinds` lists them")
            continue
        out.extend(f"{name}: {p}" for p in r.problems)
    summary = f"{_count(sections)} sections" + (f", {written} documents" if written else "")
    return CheckResult(out, summary)
