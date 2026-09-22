"""`.kanban` — a task board whose COLUMNS are status and whose ROWS are derived dependency groups:
each task may name prerequisites (`needs:`), and the board layers tasks by longest prerequisite
chain. Dates are `YYYY-MM-DD`, bare or quoted; `duration` is calendar days (default 1).

The parser is lenient so a half-written board still renders; the check is strict — it names what
the parser silently dropped or defaulted: a missing title, columns or tasks, a task with no key, a
duplicate key, a `needs` edge to no task, a status that is not a column, a duration that is not a
positive number, a due that is not a date, and tasks caught in a cycle.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .. import _yaml
from .._js import as_str, finite_number, get, is_list, is_obj, json_of, number, plural, defined
from . import CheckResult

# What `Date.parse` takes: an ISO day (`2026-9-9` included), a US slash date, a month name.
_DATE = re.compile(r"^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}/\d{1,2}/\d{4}|(?:[A-Za-z]{3,9}\.? \d{1,2},? \d{4})|\d{1,2} [A-Za-z]{3,9}\.? \d{4})")


@dataclass
class Column:
    title: str


@dataclass
class Task:
    key: str
    title: str
    needs: list[str] = field(default_factory=list)
    status: str | None = None


@dataclass
class Board:
    title: str
    columns: list[Column]
    tasks: list[Task]
    due: str | None = None
    source: str | None = None


def as_date(v: Any) -> str:
    """An ISO day: a bare date scalar, or text `Date.parse` takes, cut to `YYYY-MM-DD`."""
    if _yaml.is_date(v):
        return _yaml.iso_date(v)
    if isinstance(v, str) and _DATE.match(v):
        return v[:10]
    return ""


def parse(text: str) -> Board:
    raw = _yaml.load_or_none(text)
    if not is_obj(raw):
        return Board("", [], [])
    columns: list[Column] = []
    for c in (raw["columns"] if is_list(raw.get("columns")) else []):
        if isinstance(c, str):
            if c:
                columns.append(Column(c))
            continue
        if not is_obj(c):
            continue
        title = as_str(c.get("title")) or as_str(c.get("label"))
        if title:
            columns.append(Column(title))
    seen: set[str] = set()
    tasks: list[Task] = []
    for t in (raw["tasks"] if is_list(raw.get("tasks")) else []):
        if not is_obj(t):
            continue
        title = as_str(t.get("title")) or as_str(t.get("key"))
        key = as_str(t.get("key")) or title
        if not key or key in seen:
            continue
        seen.add(key)
        needs = [k for k in (as_str(n) for n in (t["needs"] if is_list(t.get("needs")) else [])) if k and k != key]
        tasks.append(Task(key, title, needs, as_str(t.get("status")) or None))
    return Board(as_str(raw.get("title")), columns, tasks,
                 as_date(raw.get("due")) or None, as_str(raw.get("source")) or None)


def _layers(tasks: list[Task]) -> dict[str, int]:
    """Each task's dependency depth by Kahn's order; tasks in a cycle are absent."""
    by_key = {t.key: t for t in tasks}
    needs_of = lambda t: [k for k in t.needs if k in by_key]
    layer: dict[str, int] = {}
    pending = {t.key: len(needs_of(t)) for t in tasks}
    queue = [t.key for t in tasks if not needs_of(t)]
    while queue:
        key = queue.pop(0)
        t = by_key[key]
        deps = needs_of(t)
        layer[key] = (max(layer.get(k, 0) for k in deps) + 1) if deps else 0
        for other in tasks:
            if other.key in layer or key not in other.needs:
                continue
            left = pending.get(other.key, 0) - 1
            pending[other.key] = left
            if left == 0:
                queue.append(other.key)
    return layer


def dependency_rows(tasks: list[Task]) -> list[list[Task]]:
    layer = _layers(tasks)
    depth = max([-1, *layer.values()])
    rows: list[list[Task]] = [[] for _ in range(depth + 1)]
    for t in tasks:
        if t.key in layer:
            rows[layer[t.key]].append(t)
    cyclic = [t for t in tasks if t.key not in layer]
    if cyclic:
        rows.append(cyclic)
    return [r for r in rows if r]


def _positive(v: Any) -> bool:
    return finite_number(v) and number(v) > 0


def problems(text: str) -> list[str]:
    raw = _yaml.load_or_none(text)
    out: list[str] = []
    if not is_obj(raw):
        return ["not a mapping — a board is `title`, `columns` and `tasks`"]
    if not as_str(raw.get("title")):
        out.append("no `title` — the board's heading")
    if defined(get(raw, "due")) and not as_date(raw["due"]):
        out.append(f"`due` is not a date — write `YYYY-MM-DD`, bare or quoted (got {json_of(raw['due'])})")
    if not is_list(raw.get("columns")):
        out.append("no `columns` — the statuses in order, a string or `{title, color?}` each")
    else:
        for i, c in enumerate(raw["columns"]):
            bad = (not c) if isinstance(c, str) else (not is_obj(c) or not (as_str(c.get("title")) or as_str(c.get("label"))))
            if bad:
                out.append(f"column {i + 1}: no title — a string, or `{{title, color?}}`")
        if not raw["columns"]:
            out.append("`columns` is empty — a board needs at least one status")
    parsed = parse(text)
    columns = [c.title.lower() for c in parsed.columns]
    if not is_list(raw.get("tasks")):
        out.append("no `tasks` — the cards; `tasks: []` is an empty board")
        return out
    keys: set[str] = set()
    tasks: list[tuple[str, list[str]] | None] = []
    for i, t in enumerate(raw["tasks"]):
        where = f"task {i + 1}"
        if not is_obj(t):
            out.append(f"{where}: not a mapping — write `key`, `title` and the rest")
            tasks.append(None)
            continue
        key = as_str(t.get("key")) or as_str(t.get("title"))
        name = f"task {key}" if key else where
        if not as_str(t.get("key")):
            out.append(f"{name}: no `key` — the stable key `needs` edges point at")
        if not as_str(t.get("title")):
            out.append(f"{name}: no `title` — the card's heading")
        if not key:
            tasks.append(None)
            continue
        if key in keys:
            out.append(f"{name}: duplicate key — every edge to it would fork; keys are identity")
        keys.add(key)
        if defined(get(t, "needs")) and not is_list(t["needs"]):
            out.append(f"{name}: `needs` is not a list — the keys of its prerequisites")
        if defined(get(t, "duration")) and not _positive(t["duration"]):
            out.append(f"{name}: `duration` is not a positive number of days (got {json_of(t['duration'])})")
        if defined(get(t, "due")) and not as_date(t["due"]):
            out.append(f"{name}: `due` is not a date — write `YYYY-MM-DD` (got {json_of(t['due'])})")
        status = as_str(t.get("status"))
        if status and columns and status.lower() not in columns:
            out.append(f"{name}: status `{status}` is not a column — it would land in the first column; columns are {', '.join(c.title for c in parsed.columns)}")
        tasks.append((key, [as_str(n) for n in (t["needs"] if is_list(t.get("needs")) else [])]))
    for entry in tasks:
        if not entry:
            continue
        key, needs = entry
        for n in needs:
            if not n:
                out.append(f"task {key}: a `needs` entry is not a key")
            elif n == key:
                out.append(f"task {key}: needs itself")
            elif n not in keys:
                out.append(f"task {key}: needs `{n}` — no task has that key")
    layer = _layers(parsed.tasks)
    cyclic = [t.key for t in parsed.tasks if t.key not in layer]
    if cyclic:
        out.append(f"cycle: {' → '.join(cyclic)} — tasks that need each other cannot be rowed or scheduled")
    return out


def summary(doc: Board) -> str:
    rows = len(dependency_rows(doc.tasks))
    return f"{plural(len(doc.tasks), 'task')} in {plural(rows, 'row')}, {plural(len(doc.columns), 'column')}" + \
        (f", due {doc.due}" if doc.due else "") + (f", from {doc.source}" if doc.source else "")


def check(text: str, file: str | None = None) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    return CheckResult(problems(text), summary(parse(text)))
