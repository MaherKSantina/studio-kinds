"""The kinds, by extension: a label, and the check — the engine that reads a document of the kind
and names every problem.

Twelve are the AUTHORING kinds, each with a check, a spec, a book, a field table and a template:
brief, playbook, kanban, calendar, policy, flow, jsonl, pipeline, collection, clip, song and md
(nothing to validate). The rest are the Studio's own — written by its editors, read by its views —
and are known here by name only: a document of one written inside a brief or a playbook is accepted
without a check.

A check takes the document's TEXT and nothing else: every kind is one self-contained file, so no
engine has a folder to read, and a document written inside another is checked the same way as one
that is a file of its own.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from .. import _yaml


@dataclass
class CheckResult:
    problems: list[str] = field(default_factory=list)
    summary: str | None = None


Check = Callable[[str], CheckResult]


@dataclass(frozen=True)
class Kind:
    ext: str
    label: str
    check: Check | None
    """`None` for a kind with nothing to validate (md) or one the Studio keeps to itself."""
    studio_own: bool = False


def _lazy(module: str, name: str = "check") -> Check:
    def run(text: str) -> CheckResult:
        import importlib
        return getattr(importlib.import_module(f"studio_kinds.kinds.{module}"), name)(text)
    return run


AUTHORING: tuple[str, ...] = (
    "brief", "playbook", "kanban", "calendar", "policy", "flow", "jsonl", "pipeline", "collection",
    "clip", "song", "md",
)

KINDS: dict[str, Kind] = {
    "frame": Kind("frame", "Frame", None, True),
    "flow": Kind("flow", "Flow", _lazy("flow")),
    "playbook": Kind("playbook", "Playbook", _lazy("playbook")),
    "plan": Kind("plan", "Plan", None, True),
    "guide": Kind("guide", "Guide", None, True),
    "brief": Kind("brief", "Brief", _lazy("brief")),
    "list": Kind("list", "List", None, True),
    "kanban": Kind("kanban", "Kanban", _lazy("kanban")),
    "calendar": Kind("calendar", "Calendar", _lazy("calendar")),
    "points": Kind("points", "Points", None, True),
    "policy": Kind("policy", "Policy", _lazy("policy")),
    "definition": Kind("definition", "Definition", None, True),
    "memory": Kind("memory", "Memory", None, True),
    "project": Kind("project", "Project", None, True),
    "schema": Kind("schema", "Schema", None, True),
    "workup": Kind("workup", "Workup", None, True),
    "program": Kind("program", "Program", None, True),
    "pulse": Kind("pulse", "Pulse", None, True),
    "moves": Kind("moves", "Moves", None, True),
    "tablediff": Kind("tablediff", "Table diff", None, True),
    "jsonl": Kind("jsonl", "Data", _lazy("jsonl")),
    "pipeline": Kind("pipeline", "Pipeline", _lazy("pipeline")),
    "collection": Kind("collection", "Collection", _lazy("collection")),
    "clip": Kind("clip", "Clip", _lazy("clip")),
    "song": Kind("song", "Song", _lazy("song")),
    "md": Kind("md", "Markdown", None),
}


def kind_of(ext: str) -> Kind | None:
    return KINDS.get(ext.lstrip(".").lower())


def written_kind(v: object) -> str | None:
    """A kind as written (`.Brief`, `brief`) to the key the registry knows; `None` when absent."""
    return v.lstrip(".").lower() if isinstance(v, str) and v else None


def doc_text(d: object) -> str:
    """The text a kind's engine takes for a written document: as YAML, or as is when it is a string."""
    return d if isinstance(d, str) else _yaml.dump(d if d is not None else {})


def check_written(kind: str, doc: object) -> tuple[bool, CheckResult]:
    """A document written inside another, checked by its own kind: `(known, result)`.

    A kind the registry does not know is `(False, …)`; a kind of the Studio's own has no check
    here and passes.
    """
    k = KINDS.get(kind)
    if not k:
        return False, CheckResult()
    if not k.check:
        return True, CheckResult()
    return True, k.check(doc_text(doc))
