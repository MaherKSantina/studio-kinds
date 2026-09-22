"""`.pipeline` — ONE curated list, the stages that transform it, and the views that show the result,
all in one file: `decisions` (the circumstances values can be given under), `labels`, `items` (each
with an `id`), `stages` (each `key` + ONE verb: `rules`, `filter` or `sort`) and `views` (the output
shown — its own filter, sort, columns). `when` on a rule, a stage or a view is the circumstance: refs
`decision=answer` into `decisions`.

The check reads the shape (a stage with no verb or two, a duplicate key, an item without an id, an id
twice, a ref to a decision or answer the file does not declare, a rule naming an item that is not
there) and then RUNS the pipeline with nothing taken: a rule that matches no item, a sort key or a
view column no row carries.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .. import _yaml
from .._decisions import ref_of, split_ref
from .._js import MISSING, arr, defined, get, is_bool, is_list, is_num, is_obj, is_str, num_str, opt_str, rec
from .._rows import (Clause, Row, Sort, TableRules, apply_table, holds_all, read_clauses, read_table_rules,
                     with_value)
from . import CheckResult

VERBS = ("rules", "filter", "sort")


def _text(x: Any) -> str | None:
    if is_str(x):
        return x
    if is_bool(x):
        return "yes" if x else "no"
    if is_num(x):
        return num_str(x)
    return None


def _slug(s: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


@dataclass
class Value:
    key: str
    label: str


@dataclass
class Decision:
    key: str
    label: str
    values: list[Value]


@dataclass
class Rule:
    """A rule of a `rules` stage: the items it picks, the clauses they must hold, the fields it sets."""
    where: list[Clause] = field(default_factory=list)
    set: dict[str, Any] = field(default_factory=dict)
    items: list[str] = field(default_factory=list)
    when: list[str] = field(default_factory=list)


def read_rule(o: dict, problems: list[str], at: str) -> tuple[list[Clause], dict[str, Any]]:
    """One rule as written — its clauses, and its `set` (`set:` and `key`/`value` merged)."""
    where = read_clauses(get(o, "where"), problems, f"{at} where")
    st: dict[str, Any] = dict(rec(get(o, "set")))
    key = get(o, "key")
    if is_str(key) and key.strip():
        st[key.strip()] = o.get("value")
    if not st:
        problems.append(f"{at}: sets nothing — give it set: {{field: value}} or key/value")
    return where, st


def apply_rules(rules: list[Rule], rows: list[Row]) -> tuple[list[Row], list[list[int]], int]:
    """The rules applied in order to copies of the rows; later rules see earlier rules' values."""
    out = list(rows)
    touched: set[int] = set()
    matches: list[list[int]] = []
    for rule in rules:
        hit: list[int] = []
        for i, row in enumerate(out):
            if rule.items and str(row.get("id", "")) not in rule.items:
                continue
            if not holds_all(rule.where, row):
                continue
            nxt = row
            for k, v in rule.set.items():
                nxt = with_value(nxt, k, v)
            out[i] = nxt
            hit.append(i)
            touched.add(i)
        matches.append(hit)
    return out, matches, len(touched)


@dataclass
class Stage:
    key: str
    label: str | None
    when: list[str]
    verb: str
    rules: list[Rule]
    filter: list[Clause]
    sort: list[Sort]


@dataclass
class View(TableRules):
    key: str = ""
    label: str | None = None
    when: list[str] = field(default_factory=list)


@dataclass
class Pipeline:
    title: str
    decisions: list[Decision]
    labels: dict[str, str]
    items: list[Row]
    stages: list[Stage]
    views: list[View]
    problems: list[str]


def read_when(x: Any) -> list[str]:
    """`when` as written — a ref, a list of refs, or a mapping `{decision: answer}` — as refs."""
    if x is None or x is MISSING:
        return []
    if is_list(x):
        return [s for s in (_text(v) for v in x) if s and "=" in s]
    if is_obj(x):
        return [ref_of(str(d), _text(v) or "") for d, v in x.items()]
    s = _text(x)
    return [s] if s and "=" in s else []


def holds_under(taken: list[str], when: list[str]) -> bool:
    """While no taken answer contradicts a ref — nothing taken, everything holds."""
    for ref in when:
        d, v = split_ref(ref)
        t = next((x for x in taken if split_ref(x)[0] == d), None)
        if t and split_ref(t)[1] != v:
            return False
    return True


def parse(source: str) -> Pipeline:
    problems: list[str] = []
    try:
        raw = rec(_yaml.load(source))
    except _yaml.YamlError as e:
        raw = {}
        problems.append(f"YAML: {e}")

    decisions: list[Decision] = []
    for i, d in enumerate(arr(get(raw, "decisions"))):
        o = rec(d)
        label = opt_str(get(o, "label")) or _text(get(o, "key")) or f"Decision {i + 1}"
        key = _text(get(o, "key")) or _slug(label)
        values: list[Value] = []
        for j, v in enumerate(arr(get(o, "values"))):
            if not is_obj(v):
                k = _text(v) or f"answer-{j + 1}"
                values.append(Value(k, k))
                continue
            vl = opt_str(get(v, "label")) or _text(get(v, "key")) or f"Answer {j + 1}"
            values.append(Value(_text(get(v, "key")) or _slug(vl), vl))
        if not values:
            problems.append(f"decision {key}: no values")
        decisions.append(Decision(key, label, values))
    if defined(get(raw, "decisions")) and not is_list(raw["decisions"]):
        problems.append("decisions: must be a list")

    labels: dict[str, str] = {}
    for f, l in rec(get(raw, "labels")).items():
        if is_str(l) and l.strip():
            labels[str(f)] = l.strip()
        else:
            problems.append(f"labels.{f}: must be text")

    ids: list[str] = []
    items: list[Row] = []
    for i, it in enumerate(arr(get(raw, "items"))):
        row = dict(rec(it))
        if not is_obj(it):
            problems.append(f"item {i + 1}: not a mapping")
        id_ = _text(get(row, "id"))
        if not id_:
            problems.append(f"item {i + 1}: no id")
            row["id"] = f"#{i + 1}"
        elif id_ in ids:
            problems.append(f"item {i + 1}: id {id_} is item {ids.index(id_) + 1}'s too")
        else:
            row["id"] = id_
        ids.append(str(row["id"]))
        items.append(row)
    if defined(get(raw, "items")) and not is_list(raw["items"]):
        problems.append("items: must be a list")
    id_set = set(ids)

    def check_when(when: list[str], at: str) -> None:
        for ref in when:
            d, v = split_ref(ref)
            dec = next((x for x in decisions if x.key == d), None)
            if not dec:
                problems.append(f'{at} when: no decision "{d}"')
            elif not any(x.key == v for x in dec.values):
                problems.append(f'{at} when: {d} has no answer "{v}"')

    keys: set[str] = set()
    stages: list[Stage] = []
    for i, s in enumerate(arr(get(raw, "stages"))):
        o = rec(s)
        key = _text(get(o, "key")) or f"stage-{i + 1}"
        at = f"stage {key}"
        if not _text(get(o, "key")):
            problems.append(f"stage {i + 1}: no key")
        elif key in keys:
            problems.append(f"{at}: key twice")
        keys.add(key)
        verbs = [v for v in VERBS if defined(get(o, v))]
        if not verbs:
            problems.append(f"{at}: no verb — give it rules, filter or sort")
        elif len(verbs) > 1:
            problems.append(f"{at}: {' and '.join(verbs)} — one verb per stage")
        verb = verbs[0] if verbs else "rules"
        when = read_when(get(o, "when"))
        check_when(when, at)
        rules: list[Rule] = []
        if verb == "rules":
            for j, r in enumerate(arr(get(o, "rules"))):
                ro = rec(r)
                rule_at = f"{at} rule {j + 1}"
                where, st = read_rule(ro, problems, rule_at)
                item = get(ro, "item")
                named = [x for x in (_text(v) for v in item) if x] if is_list(item) else ([_text(item)] if _text(item) else [])
                for id_ in named:
                    if id_ not in id_set:
                        problems.append(f"{rule_at}: item {id_} is no item")
                rw = read_when(get(ro, "when"))
                check_when(rw, rule_at)
                rules.append(Rule(where, st, named, rw))
        if verb == "rules" and defined(get(o, "rules")) and not is_list(o["rules"]):
            problems.append(f"{at}: rules must be a list")
        table = read_table_rules(o, problems, "filter", at) if verb in ("filter", "sort") else TableRules()
        if verb == "filter" and not is_list(get(o, "filter")):
            problems.append(f"{at}: filter must be a list of clauses")
        if verb == "sort" and not is_list(get(o, "sort")):
            problems.append(f"{at}: sort must be a list of keys")
        stages.append(Stage(key, opt_str(get(o, "label")), when, verb, rules, table.where, table.sort))
    if defined(get(raw, "stages")) and not is_list(raw["stages"]):
        problems.append("stages: must be a list")

    view_keys: set[str] = set()
    views: list[View] = []
    for i, v in enumerate(arr(get(raw, "views"))):
        o = rec(v)
        key = _text(get(o, "key")) or f"view-{i + 1}"
        at = f"view {key}"
        if not _text(get(o, "key")):
            problems.append(f"view {i + 1}: no key")
        elif key in view_keys:
            problems.append(f"{at}: key twice")
        elif key in keys:
            problems.append(f"{at}: a stage has this key")
        view_keys.add(key)
        when = read_when(get(o, "when"))
        check_when(when, at)
        t = read_table_rules(o, problems, "filter", at)
        views.append(View(t.where, t.sort, t.columns, t.hide, t.limit, key, opt_str(get(o, "label")), when))
    if defined(get(raw, "views")) and not is_list(raw["views"]):
        problems.append("views: must be a list")

    return Pipeline(opt_str(get(raw, "title")) or "", decisions, labels, items, stages, views, problems)


@dataclass
class StageRun:
    key: str
    verb: str
    applied: bool
    rows: list[Row]
    before: int
    matches: list[list[int]]
    amended: int
    problems: list[str]


@dataclass
class ViewRun:
    key: str
    applied: bool
    rows: list[Row]
    columns: list[str]
    problems: list[str]


@dataclass
class Run:
    items: list[Row]
    stages: list[StageRun]
    output: list[Row]
    views: list[ViewRun]
    problems: list[str]


def run(doc: Pipeline, taken: list[str] | None = None) -> Run:
    """The stages applied in order to the items under the answers `taken`, then every view over the output."""
    taken = taken or []
    rows = doc.items
    stages: list[StageRun] = []
    for stage in doc.stages:
        applied = holds_under(taken, stage.when)
        before = len(rows)
        problems: list[str] = []
        matches: list[list[int]] = [[] for _ in stage.rules]
        amended = 0
        if applied and stage.verb == "rules":
            live = [(r, i) for i, r in enumerate(stage.rules) if holds_under(taken, r.when)]
            rows, hits, amended = apply_rules([r for r, _ in live], rows)
            for k, (_, i) in enumerate(live):
                matches[i] = hits[k]
                if not hits[k] and rows:
                    problems.append(f"stage {stage.key} rule {i + 1} matches no item")
        elif applied and stage.verb == "filter":
            rows = apply_table(TableRules(stage.filter, []), rows).rows
        elif applied and stage.verb == "sort":
            out = apply_table(TableRules([], stage.sort), rows)
            problems.extend(f"stage {stage.key}: {p}" for p in out.problems)
            rows = out.rows
        stages.append(StageRun(stage.key, stage.verb, applied, rows, before, matches, amended, problems))
    output = rows
    views: list[ViewRun] = []
    for v in doc.views:
        applied = holds_under(taken, v.when)
        out = apply_table(TableRules(v.where, v.sort, v.columns, v.hide, v.limit), output) if applied else None
        cols = [c for c in (out.columns if out else []) if c != "id" or (v.columns is not None and "id" in v.columns)]
        views.append(ViewRun(v.key, applied, out.rows if out else [], cols,
                             [f"view {v.key}: {p}" for p in (out.problems if out else [])]))
    return Run(doc.items, stages, output, views,
               [*doc.problems, *(p for s in stages for p in s.problems), *(p for v in views for p in v.problems)])


def _stage_text(s: StageRun) -> str:
    if not s.applied:
        return f"{s.verb} · skipped"
    if s.verb == "rules":
        return f"rules · {s.amended} set"
    if s.verb == "filter":
        return f"filter · {s.before} → {len(s.rows)}"
    return f"sort · {len(s.rows)}"


def summary(doc: Pipeline, r: Run) -> str:
    stages = []
    for s in r.stages:
        rules = ""
        if s.verb == "rules" and s.applied:
            rules = "; " + (", ".join(f"rule {i + 1} → {len(m)}" for i, m in enumerate(s.matches)) or "no rules")
        stages.append(f"{s.key} ({_stage_text(s)}{rules})")
    views = [f"{v.key} {len(v.rows) if v.applied else 'skipped'}" for v in r.views]
    n = len(doc.decisions)
    return f"{len(r.items)} items" + (f" → {' → '.join(stages)}" if stages else "") + f" → {len(r.output)} out" + \
        (f" · views: {', '.join(views)}" if views else "") + (f" · {n} decision{'' if n == 1 else 's'}" if n else "")


@dataclass
class At:
    rows: list[Row]
    problems: list[str]
    columns: list[str] | None = None


def rows_at(r: Run, at: str | None) -> At:
    """The rows a ref into the file names: none = the output; a stage's key; a view's key (with its columns)."""
    if not at:
        return At(r.output, [])
    stage = next((s for s in r.stages if s.key == at), None)
    if stage:
        return At(stage.rows, [])
    view = next((v for v in r.views if v.key == at), None)
    if view:
        return At(view.rows, [], view.columns)
    return At([], [f'no stage or view "{at}"'])


def check(text: str) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    d = parse(text)
    r = run(d)
    return CheckResult(r.problems, summary(d, r))
