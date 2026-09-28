"""`.analysis` — a decision over CLOSED INPUTS. `dimensions` name the inputs and every value each can
take; `rules`, in precedence order, say what follows from a combination — `when` over the inputs,
`then` the outputs; the FIRST rule whose `when` holds decides — and `outcome` names the output key that
is the result. Opened, every combination of the inputs is drawn as a tree, nested in the order the
inputs are dragged into, each leaf the rule that decides there and coloured by its outcome; locking
input values and pinning output values narrow the tree. The order, the locks, the pins and the folds
are the page's for the session: nothing on the page writes the file.

    title: Message list banner
    description: one line
    dimensions:                 # the inputs — each a list of the values it can take
      party: [buyer, seller]
      offer: [none, sent, accepted]
    rules:                      # in precedence order — the FIRST rule whose `when` holds decides
      - label: Pay now
        when: {party: buyer, offer: accepted}
        then: {type: button, title: Pay now}
      - label: Waiting
        when: {party: buyer, offer: sent}
        then: {type: ribbon, title: Waiting for the seller}
      - label: Respond
        when: {party: seller, offer: "!none"}
        then: {type: ribbon, title: Respond to the offer}
    outcome: type               # the key of `then` that names the result (default `type`)

A value is text, a number or a boolean. `when` is a mapping of dimension → condition: a bare value
equals, `[a, b]` one of, `"*"` any, `"!x"` not equal (on the value's text); every key must hold, and no
`when` — or `{}` — is always. `then` is a mapping of output key → value; an output a rule does not set
is `—`, and so is every output of a combination no rule decides. A rule under an earlier rule that
already takes every combination it matches is never reached.

The check: not a mapping, no `title`, no `dimensions` or one that is not a mapping, a dimension that is
not a non-empty list of scalars or repeats a value, no `rules` or `rules` that is not a list, a rule
that is not a mapping, a `label` that is not text, a `when` that is not a mapping, a `when` on a
dimension that is not declared, a condition that is not a scalar or a list of them, an empty list, a
value not in the dimension, no `then` or a `then` that is not a mapping, an output that is not a
scalar, an `outcome` that is not text or one no rule sets — and, when the space is small enough to
enumerate (200,000 combinations), a rule that matches no combination or that is never reached.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from itertools import product
from typing import Any

from .. import _yaml
from .._js import as_str, defined, get, is_bool, is_list, is_num, is_obj, is_str, js_str, json_of, key_of, plural
from . import CheckResult

MAX_COMBINATIONS = 200_000
"""Past this many combinations the space is not enumerated: the view says so, and the checker skips the rules it would need it for."""

NONE = "—"
"""The token of an output a rule does not set, and of a combination no rule decides."""


@dataclass
class Rule:
    label: str
    when: dict[str, Any]
    """Dimension → a scalar, a list of scalars, `"*"` or `"!x"`."""
    then: dict[str, Any]
    """Output key → scalar."""


@dataclass
class Analysis:
    title: str
    dimensions: dict[str, list]
    """Dimension → its values in the order written, scalars only, no repeats."""
    rules: list[Rule]
    outcome: str
    description: str | None = None


def _scalar(v: object) -> bool:
    return is_str(v) or is_num(v) or is_bool(v)


def parse(text: str) -> Analysis:
    """The lenient read — never refuses: an unparseable file is an empty analysis."""
    raw = _yaml.load_or_none(text)
    if not is_obj(raw):
        return Analysis("", {}, [], "type")
    dims: dict[str, list] = {}
    for name, values in (raw["dimensions"].items() if is_obj(raw.get("dimensions")) else []):
        if not is_list(values):
            continue
        kept: list = []
        seen: set = set()
        for v in values:
            if _scalar(v) and key_of(v) not in seen:
                seen.add(key_of(v))
                kept.append(v)
        dims[str(name)] = kept
    rules: list[Rule] = []
    for i, r in enumerate(raw["rules"] if is_list(raw.get("rules")) else []):
        ro = r if is_obj(r) else {}
        when: dict[str, Any] = {}
        for dim, cond in (ro["when"].items() if is_obj(ro.get("when")) else []):
            if is_list(cond):
                when[str(dim)] = [c for c in cond if _scalar(c)]
            elif _scalar(cond):
                when[str(dim)] = cond
        then = {str(k): v for k, v in (ro["then"].items() if is_obj(ro.get("then")) else []) if _scalar(v)}
        rules.append(Rule(as_str(ro.get("label")) or f"Rule {i + 1}", when, then))
    return Analysis(
        as_str(raw.get("title")),
        dims,
        rules,
        as_str(raw.get("outcome")) or "type",
        as_str(raw.get("description")) or None,
    )


def match_cond(cond: Any, value: Any) -> bool:
    """One condition on one value: a list is one of; `"*"` any; `"!x"` not equal on the value's text; else equal."""
    if is_list(cond):
        return any(key_of(c) == key_of(value) for c in cond)
    if is_str(cond):
        if cond == "*":
            return True
        if cond.startswith("!"):
            return js_str(value) != cond[1:]
    return key_of(cond) == key_of(value)


def match_when(when: dict[str, Any], values: dict[str, Any]) -> bool:
    return all(dim in values and match_cond(cond, values[dim]) for dim, cond in when.items())


def decide(doc: Analysis, values: dict[str, Any]) -> int:
    """The rule that decides a combination — the first whose `when` holds — or -1."""
    for i, r in enumerate(doc.rules):
        if match_when(r.when, values):
            return i
    return -1


def combinations(doc: Analysis) -> int:
    """The size of the space — a product over the dimensions; no dimensions is no combination."""
    if not doc.dimensions:
        return 0
    n = 1
    for values in doc.dimensions.values():
        n *= len(values)
    return n


@dataclass
class Compiled:
    total: int
    enumerated: bool
    unmatched: int = 0
    fired: set[int] = field(default_factory=set)
    """Rule indices that decide at least one combination."""
    matched: set[int] = field(default_factory=set)
    """Rule indices whose `when` holds for at least one combination, whether or not an earlier rule took it."""


def compile(doc: Analysis) -> Compiled:  # noqa: A001 — the engine's name for it
    total = combinations(doc)
    c = Compiled(total, total <= MAX_COMBINATIONS)
    if not c.enumerated or not doc.dimensions:
        return c
    names = list(doc.dimensions)
    for combo in product(*(doc.dimensions[n] for n in names)):
        values = dict(zip(names, combo))
        decided = -1
        for i, r in enumerate(doc.rules):
            if match_when(r.when, values):
                c.matched.add(i)
                if decided < 0:
                    decided = i
        if decided < 0:
            c.unmatched += 1
        else:
            c.fired.add(decided)
    return c


def problems(text: str) -> list[str]:
    raw = _yaml.load_or_none(text)
    out: list[str] = []
    if not is_obj(raw):
        return ["not a mapping — an analysis is `dimensions`, `rules` and the `outcome` key"]
    if not as_str(raw.get("title")):
        out.append("no `title` — the analysis's heading")

    dims: dict[str, set] = {}
    texts: dict[str, set[str]] = {}
    if not defined(get(raw, "dimensions")):
        out.append("no `dimensions` — the inputs, each a list of the values it can take")
    elif not is_obj(raw["dimensions"]):
        out.append(f"`dimensions` is not a mapping — a name to the list of its values (got {json_of(raw['dimensions'])})")
    else:
        for name, values in raw["dimensions"].items():
            where = f"dimensions.{name}"
            if not is_list(values) or not values:
                out.append(f"{where} is not a non-empty list of values (got {json_of(values)})")
                dims[str(name)] = set()
                texts[str(name)] = set()
                continue
            keys: set = set()
            for v in values:
                if not _scalar(v):
                    out.append(f"{where} holds a value that is not text, a number or a boolean (got {json_of(v)})")
                elif key_of(v) in keys:
                    out.append(f"{where} repeats the value {json_of(v)}")
                else:
                    keys.add(key_of(v))
            dims[str(name)] = keys
            texts[str(name)] = {js_str(v) for v in values if _scalar(v)}

    # Rules whose `when` the checker already faulted are never also reported as idle.
    broken: set[int] = set()
    sets: set[str] = set()
    if not defined(get(raw, "rules")):
        out.append("no `rules` — what follows from each combination, first match wins")
    elif not is_list(raw["rules"]):
        out.append(f"`rules` is not a list (got {json_of(raw['rules'])})")
    else:
        for i, r in enumerate(raw["rules"]):
            where = f"rules[{i}]"
            if not is_obj(r):
                out.append(f"{where} is not a mapping — `label`, `when` and `then` (got {json_of(r)})")
                broken.add(i)
                continue
            label = as_str(r.get("label")) or f"Rule {i + 1}"
            if defined(get(r, "label")) and not is_str(r["label"]):
                out.append(f"{where}.label is not text (got {json_of(r['label'])})")
            if defined(get(r, "when")):
                if not is_obj(r["when"]):
                    out.append(f"{where}.when is not a mapping of dimension → value (got {json_of(r['when'])})")
                    broken.add(i)
                else:
                    for dim, cond in r["when"].items():
                        cw = f"{where}.when.{dim}"
                        if str(dim) not in dims:
                            out.append(f"{cw} is not a declared dimension")
                            broken.add(i)
                            continue
                        if is_list(cond) and not cond:
                            out.append(f"{cw} is an empty list — nothing would match")
                            broken.add(i)
                            continue
                        for c in (cond if is_list(cond) else [cond]):
                            if not _scalar(c):
                                out.append(f"{cw} holds a condition that is not text, a number or a boolean (got {json_of(c)})")
                                broken.add(i)
                            elif not is_list(cond) and c == "*":
                                continue
                            elif not is_list(cond) and is_str(c) and c.startswith("!"):
                                if c[1:] not in texts[str(dim)]:
                                    out.append(f"{cw} value {json_of(c[1:])} is not in dimension {dim}")
                                    broken.add(i)
                            elif key_of(c) not in dims[str(dim)]:
                                out.append(f"{cw} value {json_of(c)} is not in dimension {dim}")
                                broken.add(i)
            if not defined(get(r, "then")):
                out.append(f"{where} ({label}) has no `then` — nothing it decides")
            elif not is_obj(r["then"]):
                out.append(f"{where}.then is not a mapping of output key → value (got {json_of(r['then'])})")
            else:
                for k, v in r["then"].items():
                    if not _scalar(v):
                        out.append(f"{where}.then.{k} is not text, a number or a boolean (got {json_of(v)})")
                    else:
                        sets.add(str(k))

    outcome = "type"
    if defined(get(raw, "outcome")):
        if not is_str(raw["outcome"]):
            out.append(f"`outcome` is not text — the key of `then` that names the result (got {json_of(raw['outcome'])})")
        else:
            outcome = raw["outcome"]
    if sets and outcome not in sets:
        out.append(f"`outcome` {json_of(outcome)} is a key no rule's `then` sets")

    doc = parse(text)
    if doc.dimensions and doc.rules and all(doc.dimensions.values()):
        c = compile(doc)
        if c.enumerated:
            for i, r in enumerate(doc.rules):
                if i in broken:
                    continue
                if i not in c.matched:
                    out.append(f"rules[{i}] ({r.label}) matches no combination")
                elif i not in c.fired:
                    out.append(f"rules[{i}] ({r.label}) is never reached — every combination it matches is decided by an earlier rule")
    return out


def summary(doc: Analysis) -> str:
    c = compile(doc)
    parts = [plural(len(doc.dimensions), "dimension"), plural(c.total, "combination"), plural(len(doc.rules), "rule")]
    if c.enumerated and c.unmatched:
        parts.append(f"{c.unmatched} unmatched")
    return " · ".join(parts)


def check(text: str) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    return CheckResult(problems(text), summary(parse(text)))
