"""studio-kinds — the Studio's document kinds, checked from Python.

    from studio_kinds import check, check_path
    r = check(text, "kanban")            # a document as text
    r = check_path("launch.kanban")      # a file on disk — kinds that name other files read them beside it
    r.ok, r.problems, r.summary

The kinds: brief, playbook, kanban, calendar, policy, flow, jsonl, middleware, pipeline, collection,
clip, song, md. Each has a JSON Schema (`schema_path`), a book (`book_path`), a field table
(`fields_path`), a spec (`spec`) and a template (`template`) shipped as data. `studio-check` is the
command over all of it.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from importlib import resources

from .kinds import AUTHORING, KINDS, Kind, kind_of

__version__ = "1.0.0"

_DATA = resources.files("studio_kinds") / "data"


@dataclass
class Result:
    file: str | None
    ext: str
    ok: bool
    problems: list[str] = field(default_factory=list)
    summary: str | None = None
    label: str | None = None
    note: str | None = None

    def as_dict(self) -> dict:
        out: dict = {"file": self.file, "ext": self.ext, "ok": self.ok, "problems": list(self.problems)}
        if self.summary is not None:
            out["summary"] = self.summary
        if self.label is not None:
            out["label"] = self.label
        if self.note is not None:
            out["note"] = self.note
        return out


def check(text: str, kind: str, file: str | None = None) -> Result:
    """One document as text, by its kind. `file` is its absolute path when it has one, so a kind that
    names other files (a calendar's board, a jsonl's sources, a song's clips, a playbook's `by` files)
    can read them beside it."""
    ext = kind.lstrip(".").lower()
    k = KINDS.get(ext)
    if not k:
        return Result(file, ext, True, [], None, None, f"no kind for .{ext} — not checked")
    if not k.check:
        if k.studio_own:
            return Result(file, ext, True, [], None, k.label, f"{k.label} — the Studio's own kind; nothing checked here")
        return Result(file, ext, True, [], None, k.label, f"{k.label} — nothing to validate")
    r = k.check(text, file)
    return Result(file, ext, not r.problems, list(r.problems), r.summary, k.label)


def check_path(path: str) -> Result:
    """A file on disk, by its extension."""
    abs_path = os.path.abspath(path)
    ext = os.path.splitext(abs_path)[1][1:].lower()
    if not os.path.exists(abs_path):
        return Result(abs_path, ext, False, ["file not found"])
    with open(abs_path, encoding="utf-8") as f:
        text = f.read()
    return check(text, ext, abs_path)


def latest_version(ext: str) -> int:
    """The newest version of a kind; every version has a book."""
    return 2 if ext == "playbook" else 1


def book_path(ext: str, version: int | None = None) -> str:
    return str(_DATA / "books" / ext / f"v{version or latest_version(ext)}.playbook")


def fields_path(ext: str, version: int | None = None) -> str:
    return str(_DATA / "fields" / ext / f"v{version or latest_version(ext)}.fields.yaml")


def schema_path(ext: str, version: int | None = None) -> str:
    return str(_DATA / "schemas" / ext / f"v{version or latest_version(ext)}.schema.json")


def template(ext: str) -> str | None:
    """A fresh document of the kind, as the Studio would create it; `None` for a kind without one."""
    p = _DATA / "templates" / f"untitled.{ext}"
    return p.read_text(encoding="utf-8") if p.is_file() else None


def spec(ext: str) -> str:
    """The kind's specification — the engine's account of the format, plus the template."""
    p = _DATA / "specs" / f"{ext}.md"
    if not p.is_file():
        return f"No kind for .{ext}. Kinds: {', '.join(AUTHORING)}"
    return p.read_text(encoding="utf-8")


__all__ = ["AUTHORING", "KINDS", "Kind", "Result", "book_path", "check", "check_path", "fields_path",
           "kind_of", "latest_version", "schema_path", "spec", "template"]
