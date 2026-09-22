"""`.jsonl` — DATA ROWS: one JSON object per line, shown as a table whose columns are found, not
declared. A line that is not a JSON object is a problem (the row skipped); a file whose whole text is
one JSON array of objects is accepted too.

A line whose keys start with `$` is a DIRECTIVE, not a row: `$sources` (files whose rows are read
live — a .json array, a .json object with `#key`, a .jsonl, a .csv, a .middleware whose chain is
followed, a .pipeline), `$policy` (the table policy the rows pass through), `$title`,
`$description`, `$labels`. Refs resolve against the file's own folder. This module is also the one
resolver every kind that names a source shares (`read_source_rows`).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Callable

from .. import _yaml
from .._js import MISSING, as_str, is_list, is_obj, is_str, locale, plural, trimmed
from .._rows import Row, parse_csv, value_at
from . import CheckResult


@dataclass
class SourceRef:
    file: str
    path: str | None = None

    @property
    def label(self) -> str:
        return f"{self.file}#{self.path}" if self.path else self.file


@dataclass
class Compose:
    sources: list[SourceRef] = field(default_factory=list)
    policy: str | None = None
    title: str | None = None
    description: str | None = None
    labels: dict[str, str] | None = None


@dataclass
class DataRows:
    rows: list[Row]
    columns: list[str]
    problems: list[str]
    compose: Compose | None = None


def parse_source_ref(v: Any) -> SourceRef | None:
    """`"accommodation.json#properties"` → the file and the key; `{file, path}` read as is."""
    if is_str(v) and v.strip():
        h = v.rfind("#")
        if h > 0:
            return SourceRef(v[:h].strip(), v[h + 1:].strip() or None)
        return SourceRef(v.strip())
    if is_obj(v) and is_str(v.get("file")) and v["file"].strip():
        return SourceRef(v["file"].strip(), trimmed(v.get("path")))
    return None


def _json_line(line: str) -> Any:
    def constant(name: str) -> Any:
        raise ValueError(f"Unexpected token {name}")
    return json.loads(line, parse_constant=constant)


def _json_error(e: Exception) -> str:
    return str(e).splitlines()[0]


_KNOWN = ("$sources", "$policy", "$title", "$description", "$labels")


def parse_data_rows(content: str) -> DataRows:
    """Lenient parse — never fails."""
    rows: list[Row] = []
    problems: list[str] = []
    text = content or ""
    compose: Compose | None = None

    def directive(v: Row, where: str) -> None:
        nonlocal compose
        for k in v.keys():
            if not k.startswith("$"):
                problems.append(f'{where}: a directive line carries no row fields — "{k}" ignored')
            elif k not in _KNOWN:
                problems.append(f'{where}: unknown directive "{k}" (known: $sources, $policy, $title, $description, $labels)')
        if compose is None:
            compose = Compose()

        def scalar(key: str, what: str) -> None:
            raw = v.get(f"${key}", MISSING)
            if raw is MISSING:
                return
            if not is_str(raw) or not raw.strip():
                problems.append(f"{where}: ${key} must be {what}")
                return
            if getattr(compose, key):
                problems.append(f"{where}: a second ${key} — this one applies")
            setattr(compose, key, raw.strip())

        scalar("policy", "a file ref")
        scalar("title", "text")
        scalar("description", "text")
        if "$labels" in v:
            if not is_obj(v["$labels"]):
                problems.append(f"{where}: $labels must be an object of field: label")
            else:
                if compose.labels is None:
                    compose.labels = {}
                for fld, label in v["$labels"].items():
                    if is_str(label) and label.strip():
                        compose.labels[fld] = label.strip()
                    else:
                        problems.append(f'{where}: $labels."{fld}" must be text')
        if "$sources" in v:
            if not is_list(v["$sources"]):
                problems.append(f"{where}: $sources must be a list of files")
            else:
                for i, x in enumerate(v["$sources"]):
                    ref = parse_source_ref(x)
                    if ref:
                        compose.sources.append(ref)
                    else:
                        problems.append(f"{where}: $sources entry {i + 1} is not a file ref")

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
    return DataRows(rows, columns, problems, compose)


@dataclass
class SourceRows:
    rows: list[Row]
    problems: list[str]
    path: str | None = None


def rows_of_source(content: str, source_name: str, path: str | None = None) -> SourceRows:
    """The rows a source file holds, by its name's extension."""
    ext = source_name[source_name.rfind(".") + 1:].lower()
    if ext in ("csv", "tsv"):
        grid = parse_csv(content or "")
        header = grid[0] if grid else []
        body = grid[1:]
        rows = [{(h or f"column {i + 1}"): (r[i] if i < len(r) else "") for i, h in enumerate(header)}
                for r in body if any(c != "" for c in r)]
        return SourceRows(rows, [] if header else ["the csv has no header row"])
    stripped = (content or "").strip()
    obj: Any = None
    if ext != "jsonl" and stripped.startswith("{"):
        try:
            obj = _json_line(stripped)
        except ValueError:
            obj = None
    if is_obj(obj):
        if path:
            at = value_at(obj, path)
            if not is_list(at):
                return SourceRows([], [f'"{path}" is not a list in {source_name}'])
            return SourceRows([r for r in at if is_obj(r)],
                              [] if all(is_obj(r) for r in at) else [f"{source_name}#{path}: some entries are not objects"], path)
        best: str | None = None
        for k, v in obj.items():
            if is_list(v) and any(is_obj(r) for r in v) and (best is None or len(v) > len(obj[best])):
                best = k
        if best is None:
            return SourceRows([], [f"{source_name} holds no list of objects — name one with #key"])
        return SourceRows([r for r in obj[best] if is_obj(r)], [], best)
    d = parse_data_rows(content or "")
    problems = [f"{source_name}: {p}" for p in d.problems]
    if d.compose:
        problems.append(f"{source_name} composes rows itself — only its raw lines were read")
    return SourceRows(d.rows, problems)


@dataclass
class Resolved:
    rows: list[Row]
    problems: list[str]
    files: list[str]
    chain: list[str]
    amended: int
    columns: list[str] | None = None


Reader = Callable[[str], str]
MAX_DEPTH = 8


def resolve_ref(from_file: str, ref: str) -> str:
    """A ref found inside a document: absolute stays, relative is against the referencing file's folder."""
    if ref.startswith(("/", "\\")) or (len(ref) > 1 and ref[1] == ":"):
        return os.path.normpath(ref)
    return os.path.normpath(os.path.join(os.path.dirname(from_file), ref))


def disk_reader(abs_path: str) -> str:
    with open(abs_path, encoding="utf-8") as f:
        return f.read()


def read_source_rows(ref: SourceRef, base: str, read: Reader, seen: list[str] | None = None) -> Resolved:
    """The rows behind `ref`, relative to `base` (the file naming it); a middleware's chain followed."""
    seen = seen or []
    abs_path = resolve_ref(base, ref.file)
    label = ref.label
    if abs_path in seen:
        return Resolved([], [f"{ref.file}: a cycle — it is already being read ({' → '.join(os.path.basename(s) for s in seen)})"], [], [label], 0)
    if len(seen) >= MAX_DEPTH:
        return Resolved([], [f"{ref.file}: the chain is deeper than {MAX_DEPTH}"], [], [label], 0)
    try:
        content = read(abs_path)
    except OSError:
        return Resolved([], [f"could not read {ref.file}"], [], [label], 0)
    ext = ref.file[ref.file.rfind(".") + 1:].lower()
    if ext == "pipeline":
        from .pipeline import parse as parse_pipeline, rows_at, run as run_pipeline
        doc = parse_pipeline(content)
        r = run_pipeline(doc)
        at = rows_at(r, ref.path)
        return Resolved(at.rows, [f"{ref.file}: {p}" for p in [*r.problems, *at.problems]], [abs_path], [label],
                        sum(s.amended for s in r.stages), at.columns)
    if ext != "middleware":
        got = rows_of_source(content, ref.file, ref.path)
        tail = f"#{ref.path}" if ref.path else (f"#{got.path}" if got.path else "")
        return Resolved(got.rows, got.problems, [abs_path], [f"{ref.file}{tail}"], 0)
    from .middleware import apply as apply_middleware, parse as parse_middleware
    doc = parse_middleware(content)
    own = [f"{ref.file}: {p}" for p in doc.problems]
    if not doc.source:
        return Resolved([], [*own, f"{ref.file}: no source"], [abs_path], [label], 0)
    inner = read_source_rows(doc.source, abs_path, read, [*seen, abs_path])
    r = apply_middleware(doc, inner.rows, own_problems=[])
    return Resolved(r.rows, [*inner.problems, *own, *(f"{ref.file}: {p}" for p in r.problems)],
                    [abs_path, *inner.files], [ref.file, *inner.chain], inner.amended + r.amended)


def chain_text(r: Resolved) -> str:
    """"corrections.middleware → accommodation.json#properties (483 rows, 1 amended)"."""
    return f"{' → '.join(r.chain)} ({locale(len(r.rows))} rows{f', {locale(r.amended)} amended' if r.amended else ''})"


def check(text: str, file: str | None = None) -> CheckResult:
    from .policy import Run, apply_table, parse_file, parse_table, role_of
    d = parse_data_rows(text)
    if not d.compose:
        return CheckResult(list(d.problems), f"{len(d.rows)} rows × {len(d.columns)} columns")
    problems = list(d.problems)
    folder = os.path.dirname(file) if file else None
    rows = list(d.rows)
    notes: list[str] = []
    for src in d.compose.sources:
        if not folder:
            problems.append(f"source {src.file}: no folder to read it from")
            continue
        got = read_source_rows(src, file or "", disk_reader)
        rows.extend(got.rows)
        problems.extend(got.problems)
        notes.append(chain_text(got))
    kept = len(rows)
    policy_ref = d.compose.policy
    if policy_ref:
        abs_path = resolve_ref(file, policy_ref) if folder else None
        if not abs_path or not os.path.exists(abs_path):
            problems.append(f"policy {policy_ref}: not found beside this file")
        else:
            ptext = disk_reader(abs_path)
            role = role_of(ptext)
            if role != "table":
                name = "tags" if role in ("tags", "decisions") else "order" if role == "order" else                     "run" if isinstance(parse_file(ptext), Run) else "policy"
                problems.append(f"policy {policy_ref}: role is {name}, not table")
            else:
                parsed = parse_table(ptext)
                r = apply_table(parsed, rows, parsed.problems)
                problems.extend(f"policy {policy_ref}: {x}" for x in r.problems)
                kept = len(r.rows)
    summary = f"composed: {kept} of {len(rows)} rows from {', '.join(notes) or 'no sources'}" + \
        (f" + {len(d.rows)} raw" if d.rows else "") + (f" through {policy_ref}" if policy_ref else "")
    return CheckResult(problems, summary)
