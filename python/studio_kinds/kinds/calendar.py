"""`.calendar` — dated work on a month grid: its own `tasks`, each with a `duration` in calendar
days, the prerequisites it `needs` and an optional `due` of its own, and the calendar’s own `due` the
schedule chains backward from. Dates are derived, never authored — a task ends at the earliest of
its own `due`, the calendar's `due` and the day before its earliest dependent starts, and runs
`duration` days back from there — so the grid is always exactly what the edges and durations imply.

The check: no title, no `due` (nothing to chain back from), a task with no key or title, a duplicate
key, a `needs` edge to no task, a duration that is not a positive number, a date that is not one, and
tasks caught in a cycle.
"""
from __future__ import annotations

from .. import _yaml
from .._js import as_str, defined, get, is_list, is_obj, json_of, plural
from . import CheckResult
from .kanban import Task, _layers, _positive, as_date, dependency_rows


def parse(text: str) -> tuple[str, str | None, list[Task]]:
    """The title, the anchor date and the tasks; an unparseable file is an empty calendar."""
    raw = _yaml.load_or_none(text)
    if not is_obj(raw):
        return "", None, []
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
        tasks.append(Task(key, title, needs))
    return as_str(raw.get("title")), as_date(raw.get("due")) or None, tasks


def problems(text: str) -> list[str]:
    raw = _yaml.load_or_none(text)
    out: list[str] = []
    if not is_obj(raw):
        return ["not a mapping — a calendar is `title`, `due` and `tasks`"]
    if defined(get(raw, "board")):
        out.append("`board:` is gone — a calendar holds its own tasks; write them under `tasks`")
    if not as_str(raw.get("title")):
        out.append("no `title` — the calendar's heading")
    if not defined(get(raw, "due")):
        out.append("no `due` — the day everything must be done by, the anchor the schedule chains backward from")
    elif not as_date(raw["due"]):
        out.append(f"`due` is not a date — write `YYYY-MM-DD`, bare or quoted (got {json_of(raw['due'])})")
    if not is_list(raw.get("tasks")):
        out.append("no `tasks` — the dated work; `tasks: []` is an empty calendar")
        return out
    keys: set[str] = set()
    edges: list[tuple[str, list[str]]] = []
    for i, t in enumerate(raw["tasks"]):
        where = f"task {i + 1}"
        if not is_obj(t):
            out.append(f"{where}: not a mapping — write `key`, `title` and the rest")
            continue
        key = as_str(t.get("key")) or as_str(t.get("title"))
        name = f"task {key}" if key else where
        if not as_str(t.get("key")):
            out.append(f"{name}: no `key` — the stable key `needs` edges point at")
        if not as_str(t.get("title")):
            out.append(f"{name}: no `title` — the chip's heading")
        if not key:
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
        edges.append((key, [as_str(n) for n in (t["needs"] if is_list(t.get("needs")) else [])]))
    for key, needs in edges:
        for n in needs:
            if not n:
                out.append(f"task {key}: a `needs` entry is not a key")
            elif n == key:
                out.append(f"task {key}: needs itself")
            elif n not in keys:
                out.append(f"task {key}: needs `{n}` — no task has that key")
    _, _, tasks = parse(text)
    layer = _layers(tasks)
    cyclic = [t.key for t in tasks if t.key not in layer]
    if cyclic:
        out.append(f"cycle: {' → '.join(cyclic)} — tasks that need each other cannot be scheduled")
    return out


def summary(title: str, due: str | None, tasks: list[Task]) -> str:
    depth = len(dependency_rows(tasks))
    return f"{plural(len(tasks), 'task')}, longest chain {depth}" + (f", due {due}" if due else "")


def check(text: str) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    return CheckResult(problems(text), summary(*parse(text)))
