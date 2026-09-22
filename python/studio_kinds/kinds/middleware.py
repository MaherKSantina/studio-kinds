"""`.middleware` — rows AMENDED on their way to a view: a `source` (a .json with `#key`, a .jsonl, a
.csv, or another .middleware — chains, no cycles) and `rules` that each pick rows by clauses
(`where`, all must hold; none = every row) and SET fields on them (`set: {field: value}`, dot paths
allowed, or one `key`/`value`).

The check: no source, a rule without a field or an op, a rule that sets nothing; then, with the
source read from disk, a rule that matches NO row is a problem (the link changed, the row is gone).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .. import _yaml
from .._js import arr, defined, get, is_list, opt_str, rec, trimmed
from .._rows import Row, with_value
from . import CheckResult
from .policy import Clause, holds_all, read_clauses


@dataclass
class Rule:
    where: list[Clause]
    set: dict[str, Any]


@dataclass
class Middleware:
    title: str
    source: Any  # SourceRef | None
    rules: list[Rule]
    problems: list[str]


def read_rule(o: dict, problems: list[str], at: str) -> Rule:
    """One rule as written — its clauses, its set (`set:` and `key`/`value` merged); `at` names it in a problem."""
    where = read_clauses(get(o, "where"), problems, f"{at} where")
    st: dict[str, Any] = dict(rec(get(o, "set")))
    key = get(o, "key")
    if isinstance(key, str) and key.strip():
        st[key.strip()] = o.get("value")
    if not st:
        problems.append(f"{at}: sets nothing — give it set: {{field: value}} or key/value")
    return Rule(where, st)


def parse(text: str) -> Middleware:
    from .jsonl import parse_source_ref
    problems: list[str] = []
    try:
        raw = rec(_yaml.load(text))
    except _yaml.YamlError as e:
        raw = {}
        problems.append(f"YAML: {e}")
    source = None if not defined(get(raw, "source")) else parse_source_ref(raw["source"])
    if defined(get(raw, "source")) and not source:
        problems.append("source: not a file ref")
    rules = [read_rule(rec(r), problems, f"rule {i + 1}") for i, r in enumerate(arr(get(raw, "rules")))]
    if defined(get(raw, "rules")) and not is_list(raw["rules"]):
        problems.append("rules: must be a list")
    return Middleware(opt_str(get(raw, "title")) or "", source, rules, problems)


@dataclass
class Applied:
    rows: list[Row]
    matches: list[list[int]]
    amended: int
    problems: list[str]


def apply(doc: Middleware, source: list[Row], own_problems: list[str] | None = None) -> Applied:
    """The rules applied in order to copies of the rows; later rules see earlier rules' values."""
    rows = list(source)
    touched: set[int] = set()
    problems = list(doc.problems if own_problems is None else own_problems)
    matches: list[list[int]] = []
    for r, rule in enumerate(doc.rules):
        hit: list[int] = []
        for i, row in enumerate(rows):
            if not holds_all(rule.where, row):
                continue
            nxt = row
            for k, v in rule.set.items():
                nxt = with_value(nxt, k, v)
            rows[i] = nxt
            hit.append(i)
            touched.add(i)
        if not hit and source:
            problems.append(f"rule {r + 1} matches no row")
        matches.append(hit)
    return Applied(rows, matches, len(touched), problems)


def check(text: str, file: str | None = None) -> CheckResult:
    from .jsonl import chain_text, disk_reader, read_source_rows
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    d = parse(text)
    problems = list(d.problems)
    if not d.source:
        return CheckResult([*problems, "no source"], f"{len(d.rules)} rules, no source")
    if not file:
        return CheckResult(problems, f"{len(d.rules)} rules over {d.source.file}")
    src = read_source_rows(d.source, file, disk_reader)
    problems.extend(src.problems)
    r = apply(d, src.rows, own_problems=[])
    problems.extend(r.problems)
    runs = ", ".join(f"rule {i + 1} → {len(m)}" for i, m in enumerate(r.matches)) or "no rules"
    return CheckResult(problems, f"over {chain_text(src)}: {runs}")
