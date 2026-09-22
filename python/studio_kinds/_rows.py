"""Data rows and the rules over them — the shape a `.jsonl` and a `.pipeline` hand around: a list
of mappings. A `field` is a key of the row or a DOT PATH into nested objects.

Here too: the ONE clause vocabulary (equals, contains, between, in, is_true, …), the rules that SET
fields on the rows a clause picks, and the rules that filter, sort, trim and pick the columns of a
table. A document brings its own rows; nothing here reads a file.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field as dc_field
from typing import Any

from ._js import (MISSING, arr, defined, get, is_bool, is_list, is_num, is_str, js_str, json_of, number,
                  opt_str, rec)

Row = dict


def value_at(row: Row, path: str) -> Any:
    """The row's value at `path`: the key itself when the row carries it, else a dot path; `MISSING` anywhere."""
    if path in row:
        return row[path]
    at: Any = row
    for seg in path.split("."):
        if not isinstance(at, dict):
            return MISSING
        at = at.get(seg, MISSING)
        if at is MISSING:
            return MISSING
    return at


def cell_text(v: Any) -> str:
    """A value as the text a cell shows — and the search and sort read."""
    if v is None or v is MISSING:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, bool):
        return "true" if v else "false"
    if is_num(v):
        from ._js import num_str
        return num_str(v)
    return json_of(v)


def columns_of(rows: list[Row]) -> list[str]:
    """The columns a set of rows carries, first-seen order."""
    found: list[str] = []
    seen: set[str] = set()
    for r in rows:
        for k in r.keys():
            if k not in seen:
                seen.add(k)
                found.append(k)
    return found


def _number_of(v: Any) -> float | None:
    if is_num(v):
        return float(v) if math.isfinite(v) else None
    if isinstance(v, str) and v.strip() != "" and not math.isnan(number(v)):
        return number(v)
    return None


_NUM_RUN = re.compile(r"(\d+)")


def _natural(s: str) -> list:
    return [int(p) if p.isdigit() else p.lower() for p in _NUM_RUN.split(s)]


def compare_values(va: Any, vb: Any, dir: str) -> int:
    """Two cell values in `dir` order: numbers before text, text numeric-aware, empties LAST either way."""
    sign = 1 if dir == "asc" else -1
    ta, tb = cell_text(va), cell_text(vb)
    if not ta and not tb:
        return 0
    if not ta:
        return 1
    if not tb:
        return -1
    na, nb = _number_of(va), _number_of(vb)
    if na is not None and nb is not None:
        c = (na > nb) - (na < nb)
    elif na is not None:
        c = -1
    elif nb is not None:
        c = 1
    else:
        ka, kb = _natural(ta), _natural(tb)
        try:
            c = (ka > kb) - (ka < kb)
        except TypeError:
            c = (ta.lower() > tb.lower()) - (ta.lower() < tb.lower())
    return c * sign


def with_value(row: Row, path: str, value: Any) -> Row:
    """The row with `value` at `path` (a dot path builds or copies the objects along it); the row itself untouched."""
    segs = path.split(".")

    def build(at: Any, i: int) -> Row:
        base = dict(at) if isinstance(at, dict) else {}
        if i == len(segs) - 1:
            base[segs[i]] = value
        else:
            base[segs[i]] = build(base.get(segs[i]), i + 1)
        return base

    return build(row, 0)


OPS: list[str] = [
    "equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with",
    "matches", "gt", "gte", "lt", "lte", "between", "in", "not_in", "is_empty", "not_empty", "is_true", "is_false",
]
OP_SET = set(OPS)
NUMERIC_OPS = {"gt", "gte", "lt", "lte"}
LIST_OPS = {"in", "not_in"}
BARE_OPS = {"is_empty", "not_empty", "is_true", "is_false"}
TEXT_OPS = {"contains", "not_contains", "starts_with", "ends_with", "matches"}


@dataclass
class Clause:
    param: str
    op: str
    value: Any = MISSING
    """A string, a number, a list of those; `MISSING` when the clause has none."""


def clause_value(v: Any) -> Any:
    """A clause value as authored: a string, a number, or a list of those (booleans read as yes/no)."""
    def one(x: Any) -> Any:
        if is_bool(x):
            return "yes" if x else "no"
        if is_str(x) or is_num(x):
            return x
        return MISSING
    if is_list(v):
        return [x for x in (one(y) for y in v) if x is not MISSING]
    return one(v)


def parse_clauses(x: Any) -> list[Clause]:
    """Lenient clause-list parsing: no op means `contains`; an unknown op drops the clause."""
    out: list[Clause] = []
    for c in (rec(c) for c in arr(x)):
        param = opt_str(get(c, "param"))
        op = opt_str(get(c, "op")) or "contains"
        if not param or op not in OP_SET:
            continue
        out.append(Clause(param, op, clause_value(get(c, "value"))))
    return out


def _needles(clause: Clause) -> list[str]:
    v = clause.value
    items = v if is_list(v) else ([] if v is MISSING else [v])
    return [s for s in (js_str(x).lower() for x in items) if s != ""]


def clause_holds(clause: Clause, value: Any) -> bool:
    """One clause against one input value. Malformed regexes never throw — the clause simply fails."""
    v = value
    s = "" if v is None or v is MISSING else js_str(v).lower()
    needles = _needles(clause)
    any_ = lambda test: any(test(x) for x in needles)
    n = float(v) if is_num(v) else (math.nan if s.strip() == "" else number(v))
    cmp = float(clause.value) if is_num(clause.value) else number(clause.value)
    op = clause.op
    if op == "equals":
        return any_(lambda x: s == x) if needles else s == ""
    if op == "not_equals":
        return (not any_(lambda x: s == x)) if needles else s != ""
    if op == "contains":
        return any_(lambda x: x in s)
    if op == "not_contains":
        return not any_(lambda x: x in s)
    if op == "starts_with":
        return any_(lambda x: s.startswith(x))
    if op == "ends_with":
        return any_(lambda x: s.endswith(x))
    if op == "matches":
        if not needles:
            return False
        raw = clause.value if is_list(clause.value) else [clause.value]
        text = "" if v is None or v is MISSING else js_str(v)
        for p in raw:
            try:
                if re.search(js_str(p), text, re.I):
                    return True
            except re.error:
                continue
        return False
    if op in NUMERIC_OPS:
        if not (math.isfinite(n) and math.isfinite(cmp)):
            return False
        return {"gt": n > cmp, "gte": n >= cmp, "lt": n < cmp, "lte": n <= cmp}[op]
    if op == "between":
        pair = [number(x) for x in (clause.value if is_list(clause.value) else [])]
        lo, hi = (pair + [math.nan, math.nan])[:2]
        return math.isfinite(n) and math.isfinite(lo) and math.isfinite(hi) and min(lo, hi) <= n <= max(lo, hi)
    if op == "in":
        return any(js_str(x).lower() == s for x in (clause.value if is_list(clause.value) else []))
    if op == "not_in":
        return not any(js_str(x).lower() == s for x in (clause.value if is_list(clause.value) else []))
    if op == "is_empty":
        return s.strip() == ""
    if op == "not_empty":
        return s.strip() != ""
    if op == "is_true":
        return v is True or s == "true"
    if op == "is_false":
        return v is False or s == "false" or v is MISSING
    return False


def clause_input(row: Row, clauses: list[Clause]) -> dict[str, Any]:
    """A row as the clauses see it: the clause's fields resolved (dot paths included), objects as text."""
    out: dict[str, Any] = {}
    for c in clauses:
        v = value_at(row, c.param)
        out[c.param] = v if (is_num(v) or is_bool(v) or is_str(v)) else cell_text(v)
    return out


def holds_all(clauses: list[Clause], row: Row) -> bool:
    inp = clause_input(row, clauses)
    return all(clause_holds(c, inp.get(c.param, MISSING)) for c in clauses)


@dataclass
class Sort:
    field: str
    dir: str


@dataclass
class TableRules:
    where: list[Clause] = dc_field(default_factory=list)
    sort: list[Sort] = dc_field(default_factory=list)
    columns: list[str] | None = None
    hide: list[str] = dc_field(default_factory=list)
    limit: int | None = None


def read_clauses(raw: Any, problems: list[str], at: str) -> list[Clause]:
    """The clauses of a list as written, checked: `field` (or `param`) and an op from the vocabulary."""
    clauses_raw = []
    for c in arr(raw):
        o = dict(rec(c))
        o["param"] = opt_str(get(o, "param")) or opt_str(get(o, "field"))
        clauses_raw.append(o)
    for i, o in enumerate(clauses_raw):
        if not o["param"]:
            problems.append(f"{at} {i + 1}: no field")
        elif not defined(get(o, "op")):
            problems.append(f"{at} {i + 1}: no op")
        elif not (is_str(o["op"]) and o["op"] in OP_SET):
            problems.append(f'{at} {i + 1}: unknown op "{js_str(o["op"])}"')
    return parse_clauses(clauses_raw)


def _str_list(x: Any) -> list[str]:
    return [x] if is_str(x) else [s for s in (opt_str(y) for y in arr(x)) if s]


def read_table_rules(raw: dict, problems: list[str], key: str = "where", at: str = "") -> TableRules:
    """The rules over rows every host reads the same way: the clauses under `key`, `sort`, `columns`, `hide`, `limit`."""
    p = f"{at} " if at else ""
    where = read_clauses(get(raw, key), problems, f"{p}{key}")
    sort: list[Sort] = []
    for i, s in enumerate(arr(get(raw, "sort"))):
        o = {"field": s} if is_str(s) else rec(s)
        fld = opt_str(get(o, "field")) or opt_str(get(o, "param"))
        d = opt_str(get(o, "dir")) or "asc"
        if not fld:
            problems.append(f"{p}sort {i + 1}: no field")
            continue
        if d not in ("asc", "desc"):
            problems.append(f'{p}sort {i + 1}: dir must be asc or desc, not "{d}"')
            continue
        sort.append(Sort(fld, d))
    limit_raw = get(raw, "limit")
    limit = int(math.floor(limit_raw)) if is_num(limit_raw) and limit_raw > 0 else None
    if defined(limit_raw) and limit is None:
        problems.append(f"{p}limit: must be a positive number")
    columns = None if not defined(get(raw, "columns")) else _str_list(raw["columns"])
    return TableRules(where, sort, columns, _str_list(get(raw, "hide")), limit)


@dataclass
class TableResult:
    rows: list[Row]
    total: int
    columns: list[str]
    problems: list[str]


def apply_table(doc: TableRules, source: list[Row], own_problems: list[str] | None = None) -> TableResult:
    """The rules applied: filter, sort (first key first), cap; then the columns to show."""
    from functools import cmp_to_key
    kept = [row for row in source if holds_all(doc.where, row)]
    indexed = list(enumerate(kept))

    def cmp(a: tuple[int, Row], b: tuple[int, Row]) -> int:
        for s in doc.sort:
            c = compare_values(value_at(a[1], s.field), value_at(b[1], s.field), s.dir)
            if c != 0:
                return c
        return a[0] - b[0]

    ordered = [r for _, r in sorted(indexed, key=cmp_to_key(cmp))]
    rows = ordered[:doc.limit] if doc.limit else ordered
    hidden = set(doc.hide)
    found = columns_of(rows)
    listed = doc.columns
    if listed is not None:
        expanded: list[str] = []
        for c in listed:
            expanded.extend([f for f in found if f not in listed] if c == "*" else [c])
    else:
        expanded = found
    columns = [c for i, c in enumerate(expanded) if c not in hidden and expanded.index(c) == i]
    problems = list(own_problems or [])
    if listed is not None:
        for c in listed:
            if c != "*" and rows and not any(value_at(r, c) is not MISSING for r in rows):
                problems.append(f'column "{c}": no row carries it')
    for s in doc.sort:
        if rows and not any(value_at(r, s.field) is not MISSING for r in rows):
            problems.append(f'sort "{s.field}": no row carries it')
    return TableResult(rows, len(source), columns, problems)
