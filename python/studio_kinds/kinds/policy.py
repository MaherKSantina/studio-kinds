"""`.policy` — rules, in one of three roles, and nothing beyond the file they are written in.

The BUCKET policy (`role` absent): `params` (typed inputs), `cases` (an ordered switch — each a
filter of clauses ANDed, plus the bucket it assigns; first match wins) and `buckets` (the declared
outputs; `default` names the one for items no case claims). The chain roles: `tags` — dimensions,
each with ordered rules that tag an item — and `order`, a ranking over tag combinations whose
dimensions are written in under `tags:`, so the ranking says what it ranks over.

One clause vocabulary everywhere (`_rows.py`): equals, not_equals, contains, not_contains,
starts_with, ends_with, matches, gt, gte, lt, lte, between (`[low, high]`), in, not_in (a list),
is_empty, not_empty, is_true, is_false — text ops case-insensitive, taking one value or a list (any
of them; none of them for the negated ops).

The check names a case with no bucket, a bucket or default no `buckets:` entry declares, a clause on
a param `params:` does not declare, an op not in the list, a value the op cannot use, a param type
outside the three, and a duplicate param or bucket key — because a dropped clause leaves its case
matching EVERYTHING. It also names the keys that made a policy read another file: `role: table`,
`policy:`/`items:`/`map:`, and a `tags:` that is a path instead of the dimensions.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .. import _yaml
from .._js import (arr, defined, finite_number, get, is_list, is_obj, is_str, js_str, json_of, opt_str,
                   plural, rec)
from .._rows import BARE_OPS, LIST_OPS, NUMERIC_OPS, OP_SET, TEXT_OPS, OPS
from . import CheckResult

_PARAM_TYPES = {"string", "number", "boolean"}


def slot_minutes(s: Any) -> int | None:
    """"HH:MM" → minutes since midnight; anything else → None."""
    m = re.match(r"^(\d{1,2}):(\d{2})$", s if isinstance(s, str) else "")
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    return h * 60 + mi if h < 24 and mi < 60 else None


# ── the bucket policy ──────────────────────────────────────────

@dataclass
class Bucket:
    params: int
    cases: int
    buckets: int
    default: str | None


def parse_file(text: str) -> Bucket:
    """The bucket machine as written: how many params, cases and buckets it has, and its default."""
    raw = rec(_yaml.load_or_none(text))
    params = [o for o in (rec(x) for x in arr(get(raw, "params"))) if opt_str(get(o, "key"))]
    cases = [o for o in (rec(x) for x in arr(get(raw, "cases"))) if opt_str(get(o, "bucket"))]
    buckets = [o for o in (rec(x) for x in arr(get(raw, "buckets"))) if opt_str(get(o, "key"))]
    return Bucket(len(params), len(cases), len(buckets), opt_str(get(raw, "default")))


def bucket_problems(text: str) -> list[str]:
    raw = rec(_yaml.load_or_none(text))
    out: list[str] = gone_problems(raw)
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
            if op not in OP_SET:
                out.append(f"{where}: op `{op}` is not one — the clause is dropped, and a case with no clauses left matches everything; ops are {', '.join(OPS)}")
                continue
            v = get(co, "value")
            if op in NUMERIC_OPS and not finite_number(v):
                out.append(f"{where}: `{op}` needs a number (got {json_of(v)})")
            if op == "between" and not (is_list(v) and len(v) == 2 and all(finite_number(n) for n in v)):
                out.append(f"{where}: `between` needs `value: [low, high]` (got {json_of(v)})")
            if op in LIST_OPS and not is_list(v):
                out.append(f"{where}: `{op}` needs `value:` as a list (got {json_of(v)})")
            if op in BARE_OPS and defined(v):
                out.append(f"{where}: `{op}` takes no value")
            if op in TEXT_OPS and not defined(v):
                out.append(f"{where}: `{op}` needs a `value` — one, or a list meaning any of them")
    return out


def bucket_summary(doc: Bucket) -> str:
    return f"{plural(doc.params, 'param')}, {plural(doc.cases, 'case')}, {plural(doc.buckets, 'bucket')}" + \
        (f", default {doc.default}" if doc.default else "")


# ── the check ──────────────────────────────────────────────────────────────────

def role_of(text: str) -> str | None:
    """`role:` as written, or None."""
    return opt_str(get(rec(_yaml.load_or_none(text)), "role"))


def gone_problems(raw: dict) -> list[str]:
    """The keys that made a policy reach for another file, and what holds the rules now."""
    out: list[str] = []
    if opt_str(get(raw, "role")) == "table":
        out.append("`role: table` — rules over rows belong to the `.pipeline` that holds the rows: a stage's `filter` and `sort`, a view's `columns`")
    named = [k for k in ("policy", "items", "map") if defined(get(raw, k))]
    if named:
        out.append(f"{', '.join(f'`{k}:`' for k in named)} — a run applied a policy to a list in another file; a `.pipeline` holds the list, the rules that transform it and the views over it, in one file")
    if is_str(get(raw, "tags")):
        out.append("`tags:` is a path — write the dimensions this ranking reads in, as a list under `tags:`")
    return out


def tag_problems(text: str) -> list[str]:
    """The tags and order roles: the dimensions are in the file, and every ref names one of them."""
    raw = rec(_yaml.load_or_none(text))
    out: list[str] = gone_problems(raw)
    dims: dict[str, list[str]] = {}
    for i, d in enumerate(arr(get(raw, "tags"))):
        o = rec(d)
        key = opt_str(get(o, "key")) or opt_str(get(o, "name"))
        if not key:
            out.append(f"dimension {i + 1}: no `key` — the name a ranking's refs use")
            continue
        if key in dims:
            out.append(f"dimension {key}: duplicate key")
        values: list[str] = []
        rules = arr(get(o, "derive")) or arr(get(o, "from"))
        for j, r in enumerate(rules):
            v = opt_str(get(rec(r), "value"))
            if not v:
                out.append(f"dimension {key}, rule {j + 1}: no `value` — the tag the rule gives")
            elif v not in values:
                values.append(v)
        if not rules:
            out.append(f"dimension {key}: no rules — ordered `derive` clauses, the last with none as the default")
        dims[key] = values
    for i, e in enumerate(arr(get(raw, "order"))):
        label = opt_str(get(rec(e), "label"))
        where = f"entry {i + 1}" + (f" ({label})" if label else "")
        for ref in arr(get(rec(e), "when")):
            text_ref = opt_str(ref) or js_str(ref)
            dim, sep, val = text_ref.partition("=")
            if not sep or not dim or not val:
                out.append(f"{where}: `{text_ref}` is not a `dimension=value` ref")
            elif dim not in dims:
                out.append(f'{where}: no dimension "{dim}" — every dimension a ranking reads is written in under `tags:`')
            elif dims[dim] and val not in dims[dim]:
                out.append(f'{where}: dimension "{dim}" has no value "{val}" — its rules give {", ".join(dims[dim])}')
    return out


def check(text: str) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    role = role_of(text)
    if role in ("tags", "decisions", "order"):
        raw = rec(_yaml.load_or_none(text))
        name = "tags" if role == "decisions" else role
        dims = len([d for d in arr(get(raw, "tags")) if is_obj(d)])
        summary = f"{name} policy: {plural(dims, 'dimension')}"
        if role == "order":
            n = len(arr(get(raw, "order")))
            summary += f", {n} ranked {'entry' if n == 1 else 'entries'}"
        return CheckResult(tag_problems(text), summary)
    return CheckResult(bucket_problems(text), bucket_summary(parse_file(text)))
