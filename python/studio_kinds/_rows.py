"""Data rows — the shape a `.jsonl`, a `.csv` source, a middleware and a pipeline all hand around:
a list of mappings. A `field` is a key of the row or a DOT PATH into nested objects.
"""
from __future__ import annotations

import math
import re
from typing import Any

from ._js import MISSING, is_num, json_of, number

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


def parse_csv(text: str) -> list[list[str]]:
    """RFC-4180-flavoured grid. Delimiter is auto-picked: a tab in the first line means TSV, else comma."""
    rows: list[list[str]] = []
    if not text.strip():
        return rows
    first = text.split("\n", 1)[0]
    delim = "\t" if "\t" in first else ","
    row: list[str] = []
    cell = ""
    quoted = False
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if quoted:
            if ch == '"':
                if i + 1 < n and text[i + 1] == '"':
                    cell += '"'
                    i += 1
                else:
                    quoted = False
            else:
                cell += ch
        elif ch == '"' and cell == "":
            quoted = True
        elif ch == delim:
            row.append(cell)
            cell = ""
        elif ch in "\n\r":
            if ch == "\r" and i + 1 < n and text[i + 1] == "\n":
                i += 1
            row.append(cell)
            cell = ""
            rows.append(row)
            row = []
        else:
            cell += ch
        i += 1
    if cell != "" or row:
        row.append(cell)
        rows.append(row)
    while rows and all(c == "" for c in rows[-1]):
        rows.pop()
    return rows


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
