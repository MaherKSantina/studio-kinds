"""`.collection` — a SNAPSHOT of rows to decide over, one at a time: the rows copied in (`items`,
each with an `id`), the view's `fields`, `stats` and `labels`, and `decisions` — a log of `up`,
`down`, `hide`, `show`, each with a reason.

The check: an id used twice, a decision with no item, an unknown op, an item not in the collection,
a missing reason (a `show` needs none).
"""
from __future__ import annotations

from dataclasses import dataclass

from .. import _yaml
from .._js import arr, get, is_num, js_str, opt_str, rec, MISSING
from . import CheckResult

OPS = ("up", "down", "hide", "show")


@dataclass
class Collection:
    items: list[dict]
    decisions: list[tuple[float, str]]
    problems: list[str]


def parse(text: str) -> Collection:
    problems: list[str] = []
    try:
        raw = rec(_yaml.load(text))
    except _yaml.YamlError as e:
        raw = {}
        problems.append(f"YAML: {e}")
    items: list[dict] = []
    ids: list[float] = []
    for i, x in enumerate(arr(get(raw, "items"))):
        o = rec(x)
        id_ = float(o["id"]) if is_num(get(o, "id")) else float(i + 1)
        if id_ in ids:
            problems.append(f"item {i + 1}: id {js_str(id_)} is already used")
        ids.append(id_)
        items.append({**o, "id": id_})
    decisions: list[tuple[float, str]] = []
    for i, x in enumerate(arr(get(raw, "decisions"))):
        o = rec(x)
        item = get(o, "item")
        op = opt_str(get(o, "op"))
        if not is_num(item) or item != item or item in (float("inf"), float("-inf")):
            problems.append(f"decision {i + 1}: no item")
            continue
        if not op or op not in OPS:
            raw_op = get(o, "op")
            problems.append(f'decision {i + 1}: unknown op "{"" if raw_op is MISSING or raw_op is None else js_str(raw_op)}"')
            continue
        if float(item) not in ids:
            problems.append(f"decision {i + 1}: item {js_str(item)} is not in the collection")
        reason = opt_str(get(o, "reason"))
        reason = reason.strip() if reason else None
        if not reason and op != "show":
            problems.append(f"decision {i + 1}: no reason")
        decisions.append((float(item), op))
    return Collection(items, decisions, problems)


def check(text: str, file: str | None = None) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    d = parse(text)
    rank: dict[float, int] = {it["id"]: 0 for it in d.items}
    hidden: dict[float, bool] = {it["id"]: False for it in d.items}
    for item, op in d.decisions:
        if item not in rank:
            continue
        if op == "up":
            rank[item] += 1
        elif op == "down":
            rank[item] -= 1
        elif op == "hide":
            hidden[item] = True
        elif op == "show":
            hidden[item] = False
    shown = sum(1 for i in rank if not hidden[i])
    up = sum(1 for i in rank if not hidden[i] and rank[i] > 0)
    down = sum(1 for i in rank if not hidden[i] and rank[i] < 0)
    hid = sum(1 for i in rank if hidden[i])
    return CheckResult(d.problems,
                       f"{len(d.items)} items · {shown} shown, {up} up, {down} down, {hid} hidden · {len(d.decisions)} decisions")
