"""`.jsonl` — DATA ROWS: one JSON object per line, shown as a table whose columns are found, not
declared. A line that is not a JSON object is a problem (the row skipped); a file whose whole text is
one JSON array of objects is accepted too.

A line whose keys start with `$` is a DIRECTIVE, not a row, and says what is known about THESE rows:
`$title`, `$description`, `$labels` (header names by field, dot paths included). The rows are the
file's own — nothing is read from anywhere else, so what the table shows is what the file holds.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from .._js import MISSING, is_list, is_obj, is_str
from .._rows import Row
from . import CheckResult


@dataclass
class About:
    """What the directive lines say about the rows."""
    title: str | None = None
    description: str | None = None
    labels: dict[str, str] | None = None


@dataclass
class DataRows:
    rows: list[Row]
    columns: list[str]
    problems: list[str]
    about: About | None = None


def _json_line(line: str) -> Any:
    def constant(name: str) -> Any:
        raise ValueError(f"Unexpected token {name}")
    return json.loads(line, parse_constant=constant)


def _json_error(e: Exception) -> str:
    return str(e).splitlines()[0]


_KNOWN = ("$title", "$description", "$labels")
_GONE = {
    "$sources": "$sources — a .jsonl holds its own rows; a list curated from several places at several times is a .pipeline",
    "$policy": "$policy — rules over rows live with the rows: a .pipeline's stages filter and sort, its views pick the columns",
}


def parse_data_rows(content: str) -> DataRows:
    """Lenient parse — never fails."""
    rows: list[Row] = []
    problems: list[str] = []
    text = content or ""
    about: About | None = None

    def directive(v: Row, where: str) -> None:
        nonlocal about
        for k in v.keys():
            if not k.startswith("$"):
                problems.append(f'{where}: a directive line carries no row fields — "{k}" ignored')
            elif k in _GONE:
                problems.append(f"{where}: {_GONE[k]}")
            elif k not in _KNOWN:
                problems.append(f'{where}: unknown directive "{k}" (known: $title, $description, $labels)')
        if about is None:
            about = About()

        def scalar(key: str, what: str) -> None:
            raw = v.get(f"${key}", MISSING)
            if raw is MISSING:
                return
            if not is_str(raw) or not raw.strip():
                problems.append(f"{where}: ${key} must be {what}")
                return
            if getattr(about, key):
                problems.append(f"{where}: a second ${key} — this one applies")
            setattr(about, key, raw.strip())

        scalar("title", "text")
        scalar("description", "text")
        if "$labels" in v:
            if not is_obj(v["$labels"]):
                problems.append(f"{where}: $labels must be an object of field: label")
            else:
                if about.labels is None:
                    about.labels = {}
                for fld, label in v["$labels"].items():
                    if is_str(label) and label.strip():
                        about.labels[fld] = label.strip()
                    else:
                        problems.append(f'{where}: $labels."{fld}" must be text')

    def take(v: Any, where: str) -> None:
        if not is_obj(v):
            problems.append(f"{where}: not a JSON object")
        elif any(k.startswith("$") for k in v.keys()):
            directive(v, where)
        else:
            rows.append(v)

    stripped = text.strip()
    whole: Any = None
    if stripped.startswith("["):
        try:
            whole = _json_line(stripped)
        except ValueError:
            whole = None
    if is_list(whole):
        for i, v in enumerate(whole):
            take(v, f"row {i + 1}")
    else:
        for i, line in enumerate(text.replace("\r\n", "\n").split("\n")):
            if not line.strip():
                continue
            try:
                take(_json_line(line), f"line {i + 1}")
            except ValueError as e:
                problems.append(f"line {i + 1}: {_json_error(e)}")
    seen: set[str] = set()
    columns: list[str] = []
    for r in rows:
        for k in r.keys():
            if k not in seen:
                seen.add(k)
                columns.append(k)
    return DataRows(rows, columns, problems, about)


def check(text: str) -> CheckResult:
    d = parse_data_rows(text)
    labels = len(d.about.labels) if d.about and d.about.labels else 0
    summary = f"{len(d.rows)} rows × {len(d.columns)} columns" + (f", {labels} labelled" if labels else "")
    return CheckResult(list(d.problems), summary)
