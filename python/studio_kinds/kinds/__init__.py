"""The kinds, by extension: a label, and the check — the engine that reads a document of the kind
and names every problem.

Sixteen are the AUTHORING kinds, each with a check, a spec, a book, a field table and a template:
brief, playbook, kanban, calendar, policy, flow, jsonl, pipeline, collection, clip, song, finance,
script, views, page and md (nothing to validate). The rest are the Studio's own — written by its editors, read by its views —
and are known here by name only: a document of one written inside a brief or a playbook is accepted
without a check.

A check takes the document's TEXT and nothing else: every kind is one self-contained file, so no
engine has a folder to read, and a document written inside another is checked the same way as one
that is a file of its own. A brief's section, a kanban's task and a views item hold one such
document as `content: {kind, doc}`: `read_content` takes it leniently, `content_problems` names what
its shape cannot be, and `written_doc_problems` runs it through its own kind's engine.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from .. import _yaml
from .._js import defined, get, is_obj


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
    "clip", "song", "finance", "script", "views", "page", "md",
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
    "finance": Kind("finance", "Finance", _lazy("finance")),
    "script": Kind("script", "Script", _lazy("script")),
    "views": Kind("views", "Views", _lazy("views")),
    "page": Kind("page", "Page", _lazy("page")),
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


def read_content(raw: Any) -> dict | None:
    """A `content: {kind, doc}` as the lenient read takes it — `{"kind": str, "doc": Any}`, the kind
    `""` when none is named — or `None` when it is not a mapping."""
    if not is_obj(raw):
        return None
    return {"kind": written_kind(raw.get("kind")) or "", "doc": raw.get("doc")}


def content_problems(holder: dict, one: str, whole: str, kinds: str) -> list[str]:
    """What the `content` of `holder` cannot be, read as written: `one` names the holder (`a task`),
    `whole` the document around it (`a board`), `kinds` the kinds a `content` without one is pointed to."""
    if not defined(get(holder, "content")):
        return []
    c = holder["content"]
    if not is_obj(c):
        return ["`content` is not a mapping — write `kind` and `doc`"]
    out: list[str] = []
    kind = written_kind(c.get("kind"))
    if not kind:
        out.append(f"`content` has no `kind` — say which kind renders it ({kinds}, …)")
    if not defined(get(c, "doc")):
        out.append("`content` has no `doc` — the document itself, as a file of that kind would hold it")
    for k in ("by", "docs", "file"):
        if defined(get(c, k)):
            out.append(f"`content` has `{k}` — {one} holds one document written in; {whole} has no answers to vary by and names no file")
    if kind == "md" and defined(get(c, "doc")) and not isinstance(c["doc"], str):
        out.append("an `md` document is its text — write it as a block string")
    return out


def written_doc_problems(name: str, content: dict | None) -> list[str]:
    """A written document through its own kind's engine, each problem under `<name> (<kind>): `;
    nothing when there is none or it names no kind — `content_problems` says that."""
    if not content or not content["kind"]:
        return []
    kind = content["kind"]
    known, r = check_written(kind, content["doc"])
    if not known:
        return [f"{name} ({kind}): not a kind the Studio knows — `--kinds` lists them"]
    return [f"{name} ({kind}): {p}" for p in r.problems]
