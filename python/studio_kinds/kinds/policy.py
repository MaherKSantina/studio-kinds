"""`.policy` — rules, in one of several roles.

The BUCKET policy (`role` absent): `params` (typed inputs), `cases` (an ordered switch — each a
filter of clauses ANDed, plus the bucket it assigns; first match wins) and `buckets` (the declared
outputs; `default` names the one for items no case claims). A RUN (`policy` + `items`) applies a
policy to a list through a column `map`. The chain roles `tags` and `order` tag items along
dimensions and rank the combinations. The TABLE role (`role: table`) is a policy over rows: `where`
clauses, `sort` keys, `columns`, `hide`, `limit` — applied by the `.jsonl` that names it.

One clause vocabulary everywhere: equals, not_equals, contains, not_contains, starts_with,
ends_with, matches, gt, gte, lt, lte, between (`[low, high]`), in, not_in (a list), is_empty,
not_empty, is_true, is_false — text ops case-insensitive, taking one value or a list (any of them;
none of them for the negated ops).

The bucket check names a case with no bucket, a bucket or default no `buckets:` entry declares, a
clause on a param `params:` does not declare, an op not in the list, a value the op cannot use, a
param type outside the three, and a duplicate param or bucket key — because a dropped clause leaves
its case matching EVERYTHING. The table check names a clause without a field or op, an unknown op, a
sort direction that is not asc/desc, a limit that is not positive, and `rename`/`source`, which
belong to the `.jsonl`.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

from .. import _yaml
from .._js import (MISSING, arr, as_str, defined, finite_number, get, is_bool, is_list, is_num, is_obj,
                   is_str, js_str, json_of, number, opt_str, plural, rec, trimmed)
from .._rows import Row, cell_text, columns_of, compare_values, value_at
from . import CheckResult

OPS: list[str] = [
    "equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with",
    "matches", "gt", "gte", "lt", "lte", "between", "in", "not_in", "is_empty", "not_empty", "is_true", "is_false",
]
_OPS = set(OPS)
_NUMERIC = {"gt", "gte", "lt", "lte"}
_LIST = {"in", "not_in"}
_BARE = {"is_empty", "not_empty", "is_true", "is_false"}
_TEXT = {"contains", "not_contains", "starts_with", "ends_with", "matches"}
_PARAM_TYPES = {"string", "number", "boolean"}


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
        if not param or op not in _OPS:
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
    if op in _NUMERIC:
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


def slot_minutes(s: Any) -> int | None:
    """"HH:MM" → minutes since midnight; anything else → None."""
    m = re.match(r"^(\d{1,2}):(\d{2})$", s if isinstance(s, str) else "")
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    return h * 60 + mi if h < 24 and mi < 60 else None


# ── the bucket policy and the run ─────────────────────────────────────────────

_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass
class Run:
    policy: str
    items: str
    map: dict[str, list[str]]
    date: str | None


@dataclass
class Bucket:
    params: int
    cases: int
    buckets: int
    default: str | None


def parse_file(text: str) -> Run | Bucket:
    """Which role a `.policy` file plays: a run names a policy AND a list."""
    raw = rec(_yaml.load_or_none(text))
    policy, items = opt_str(get(raw, "policy")), opt_str(get(raw, "items"))
    if policy and items:
        m: dict[str, list[str]] = {}
        for k, v in rec(get(raw, "map")).items():
            cols = [v] if is_str(v) else [s for s in (opt_str(x) for x in arr(v)) if s]
            if cols:
                m[str(k)] = cols
        d = get(raw, "date")
        date = _yaml.iso_date(d) if _yaml.is_date(d) else opt_str(d)
        return Run(policy, items, m, date if date and _ISO.match(date) else None)
    params = [o for o in (rec(x) for x in arr(get(raw, "params"))) if opt_str(get(o, "key"))]
    cases = [o for o in (rec(x) for x in arr(get(raw, "cases"))) if opt_str(get(o, "bucket"))]
    buckets = [o for o in (rec(x) for x in arr(get(raw, "buckets"))) if opt_str(get(o, "key"))]
    return Bucket(len(params), len(cases), len(buckets), opt_str(get(raw, "default")))


def bucket_problems(text: str) -> list[str]:
    raw = rec(_yaml.load_or_none(text))
    out: list[str] = []
    doc = parse_file(text)
    if isinstance(doc, Run):
        for k, v in rec(get(raw, "map")).items():
            if not is_str(v) and not (is_list(v) and all(is_str(x) for x in v)):
                out.append(f"map {k}: a field name or a list of them")
        if defined(get(raw, "date")) and not doc.date:
            out.append("`date` is not `YYYY-MM-DD`")
        return out
    if is_str(get(raw, "policy")) or is_str(get(raw, "items")):
        out.append("a run names both `policy` and `items` — one without the other is a bucket policy missing its cases")
    if not opt_str(get(raw, "title")):
        out.append("no `title` — a name for the rules")
    params: list[str] = []
    for i, x in enumerate(arr(get(raw, "params"))):
        o = rec(x)
        key = opt_str(get(o, "key"))
        if not key:
            out.append(f"param {i + 1}: no `key`")
            continue
        if key in params:
            out.append(f"param {key}: duplicate key")
        else:
            params.append(key)
        if defined(get(o, "type")) and js_str(o["type"]) not in _PARAM_TYPES:
            out.append(f"param {key}: type `{js_str(o['type'])}` is not one of string, number, boolean")
    buckets: list[str] = []
    for i, x in enumerate(arr(get(raw, "buckets"))):
        o = rec(x)
        key = opt_str(get(o, "key"))
        if not key:
            out.append(f"bucket {i + 1}: no `key`")
            continue
        if key in buckets:
            out.append(f"bucket {key}: duplicate key")
        else:
            buckets.append(key)
        for k in ("start", "end"):
            if defined(get(o, k)) and slot_minutes(opt_str(o[k])) is None:
                out.append(f"bucket {key}: `{k}` is not a time — write `HH:MM`")
    default_key = opt_str(get(raw, "default"))
    if defined(get(raw, "default")) and not default_key:
        out.append("`default` is not a bucket key")
    if default_key and buckets and default_key not in buckets:
        out.append(f"default `{default_key}` is not a declared bucket — one of {', '.join(buckets)}")
    if not is_list(get(raw, "cases")):
        out.append("no `cases` — the ordered switch; `cases: []` claims nothing")
    for i, x in enumerate(arr(get(raw, "cases"))):
        o = rec(x)
        label = opt_str(get(o, "label"))
        name = f"case {i + 1}" + (f" ({label})" if label else "")
        if not is_obj(x):
            out.append(f"{name}: not a mapping — write `when` and `bucket`")
            continue
        bucket = opt_str(get(o, "bucket"))
        if not bucket:
            out.append(f"{name}: no `bucket` — the case is dropped and can never claim an item")
        elif buckets and bucket not in buckets:
            out.append(f"{name}: bucket `{bucket}` is not declared — one of {', '.join(buckets)}")
        if not defined(get(o, "when")):
            out.append(f"{name}: no `when` — an empty `when: []` says \"always\" on purpose")
        elif not is_list(o["when"]):
            out.append(f"{name}: `when` is not a list of clauses")
        for j, c in enumerate(arr(get(o, "when"))):
            co = rec(c)
            where = f"{name}, clause {j + 1}"
            param = opt_str(get(co, "param"))
            op = opt_str(get(co, "op"))
            if not param:
                out.append(f"{where}: no `param` — the clause is dropped, and a case with no clauses left matches everything")
            elif params and param not in params:
                out.append(f"{where}: param `{param}` is not declared — one of {', '.join(params)}")
            if not op:
                out.append(f"{where}: no `op` — the clause is dropped, and a case with no clauses left matches everything")
                continue
            if op not in _OPS:
                out.append(f"{where}: op `{op}` is not one — the clause is dropped, and a case with no clauses left matches everything; ops are {', '.join(OPS)}")
                continue
            v = get(co, "value")
            if op in _NUMERIC and not finite_number(v):
                out.append(f"{where}: `{op}` needs a number (got {json_of(v)})")
            if op == "between" and not (is_list(v) and len(v) == 2 and all(finite_number(n) for n in v)):
                out.append(f"{where}: `between` needs `value: [low, high]` (got {json_of(v)})")
            if op in _LIST and not is_list(v):
                out.append(f"{where}: `{op}` needs `value:` as a list (got {json_of(v)})")
            if op in _BARE and defined(v):
                out.append(f"{where}: `{op}` takes no value")
            if op in _TEXT and not defined(v):
                out.append(f"{where}: `{op}` needs a `value` — one, or a list meaning any of them")
    return out


def bucket_summary(doc: Run | Bucket) -> str:
    if isinstance(doc, Run):
        return f"run: {doc.policy} over {doc.items}, {len(doc.map)} params mapped"
    return f"{plural(doc.params, 'param')}, {plural(doc.cases, 'case')}, {plural(doc.buckets, 'bucket')}" + \
        (f", default {doc.default}" if doc.default else "")


# ── the table role ─────────────────────────────────────────────────────────────

@dataclass
class Sort:
    field: str
    dir: str


@dataclass
class TableRules:
    where: list[Clause] = field(default_factory=list)
    sort: list[Sort] = field(default_factory=list)
    columns: list[str] | None = None
    hide: list[str] = field(default_factory=list)
    limit: int | None = None


@dataclass
class TablePolicy(TableRules):
    title: str = ""
    problems: list[str] = field(default_factory=list)


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
        elif not (is_str(o["op"]) and o["op"] in _OPS):
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


def parse_table(text: str) -> TablePolicy:
    problems: list[str] = []
    try:
        raw = rec(_yaml.load(text))
    except _yaml.YamlError as e:
        raw = {}
        problems.append(f"YAML: {e}")
    rules = read_table_rules(raw, problems)
    if defined(get(raw, "rename")):
        problems.append("rename: header labels belong to the .jsonl that applies this policy ($labels), not to the rules")
    if defined(get(raw, "source")) or defined(get(raw, "sources")):
        problems.append("source: the data is named by the .jsonl that applies this policy ($sources), not by the rules")
    return TablePolicy(rules.where, rules.sort, rules.columns, rules.hide, rules.limit,
                       opt_str(get(raw, "title")) or "", problems)


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


def table_summary(d: TablePolicy) -> str:
    return f"table policy: {len(d.where)} filters, {len(d.sort)} sort keys" + \
        (f", {len(d.columns)} columns" if d.columns is not None else "") + (f", first {d.limit}" if d.limit else "")


# ── the check ──────────────────────────────────────────────────────────────────

def role_of(text: str) -> str | None:
    """`role:` as written, or None."""
    return opt_str(get(rec(_yaml.load_or_none(text)), "role"))


def check(text: str, file: str | None = None) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    role = role_of(text)
    if role == "table":
        d = parse_table(text)
        return CheckResult(list(d.problems), table_summary(d))
    if role in ("tags", "decisions", "order"):
        # The chain's tags and order roles have their own lenient parser; nothing in them is refused.
        return CheckResult([], f"{'tags' if role == 'decisions' else role} policy")
    return CheckResult(bucket_problems(text), bucket_summary(parse_file(text)))
