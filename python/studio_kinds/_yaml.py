"""YAML the way the Studio's engines read it.

The engines grew up on js-yaml (YAML 1.2 core schema plus timestamps), and a checker that read the
same text differently would pass files the Studio rejects, or the reverse. So this loader is
PyYAML's safe loader with its scalar resolution replaced by js-yaml's:

- `yes`, `no`, `on`, `off`, `y`, `n` are STRINGS (only `true`/`false` in three casings are booleans),
  so a decision answer written `key: yes` stays the text `yes`;
- integers are decimal with leading zeros allowed (`010` is ten), or `0b`, `0o`, `0x`; no `_` separators;
- floats need a digit or a dot, `.inf` and `.nan` are floats;
- a bare `2026-09-09` is a date (js-yaml gives a Date; here a `datetime.date`), a bare
  `2026-09-09T10:00:00Z` a datetime;
- a duplicated mapping key is an ERROR, as it is in js-yaml, not a silent override;
- `<<` merge keys work.

`load(text)` returns the one document, `None` for an empty text; it raises `YamlError` with a one-line
message. `error_line(text)` is the checker's "YAML: …" problem, or `None` when the text parses.
"""
from __future__ import annotations

import datetime as _dt
import re
from typing import Any

import yaml
from yaml.constructor import ConstructorError


class YamlError(Exception):
    """The text is not YAML the engines can read; `str(e)` is one line."""


class _Loader(yaml.SafeLoader):
    pass


# Start from a clean slate: PyYAML's YAML 1.1 resolvers would read `yes` as True.
_Loader.yaml_implicit_resolvers = {}

_Loader.add_implicit_resolver(
    "tag:yaml.org,2002:null", re.compile(r"^(?:~|null|Null|NULL|)$"), ["~", "n", "N", ""])
_Loader.add_implicit_resolver(
    "tag:yaml.org,2002:bool", re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$"), list("tTfF"))
_Loader.add_implicit_resolver(
    "tag:yaml.org,2002:int",
    re.compile(r"^[-+]?(?:0b[01]+|0o[0-7]+|0x[0-9a-fA-F]+|[0-9]+)$"), list("-+0123456789"))
_Loader.add_implicit_resolver(
    "tag:yaml.org,2002:float",
    re.compile(r"""^(?:[-+]?(?:[0-9]+\.[0-9]*(?:[eE][-+]?[0-9]+)?
                   |[0-9]+[eE][-+]?[0-9]+
                   |\.[0-9]+(?:[eE][-+]?[0-9]+)?)
                   |[-+]?\.(?:inf|Inf|INF)
                   |\.(?:nan|NaN|NAN))$""", re.X), list("-+0123456789."))
_Loader.add_implicit_resolver(
    "tag:yaml.org,2002:timestamp",
    re.compile(r"""^(?:[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]
                   |[0-9][0-9][0-9][0-9]-[0-9][0-9]?-[0-9][0-9]?
                    (?:[Tt]|[ \t]+)[0-9][0-9]?:[0-9][0-9]:[0-9][0-9]
                    (?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9][0-9]?(?::[0-9][0-9])?))?)$""", re.X),
    list("0123456789"))
_Loader.add_implicit_resolver("tag:yaml.org,2002:merge", re.compile(r"^(?:<<)$"), ["<"])


def _construct_int(loader: yaml.SafeLoader, node: yaml.Node) -> int:
    s = loader.construct_scalar(node)
    sign = -1 if s.startswith("-") else 1
    body = s.lstrip("+-")
    if body.startswith("0b"):
        return sign * int(body[2:], 2)
    if body.startswith("0o"):
        return sign * int(body[2:], 8)
    if body.startswith("0x"):
        return sign * int(body[2:], 16)
    return sign * int(body, 10)


def _construct_float(loader: yaml.SafeLoader, node: yaml.Node) -> float:
    s = loader.construct_scalar(node).lower()
    if s.endswith(".inf"):
        return float("-inf") if s.startswith("-") else float("inf")
    if s.endswith(".nan"):
        return float("nan")
    return float(s)


def _construct_mapping(loader: yaml.SafeLoader, node: yaml.Node, deep: bool = False) -> dict:
    if not isinstance(node, yaml.MappingNode):
        raise ConstructorError(None, None, f"expected a mapping node, but found {node.id}", node.start_mark)
    loader.flatten_mapping(node)
    out: dict = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if isinstance(key, (dict, list)):
            key = str(key)
        if key in out:
            raise ConstructorError(None, None, "duplicated mapping key", key_node.start_mark)
        out[key] = loader.construct_object(value_node, deep=deep)
    return out


_TIMESTAMP = re.compile(
    r"""^(?P<year>[0-9][0-9][0-9][0-9])-(?P<month>[0-9][0-9]?)-(?P<day>[0-9][0-9]?)
        (?:(?:[Tt]|[ 	]+)(?P<hour>[0-9][0-9]?):(?P<minute>[0-9][0-9]):(?P<second>[0-9][0-9])
        (?:\.(?P<fraction>[0-9]*))?(?:[ 	]*(?P<tz>Z|(?P<tz_sign>[-+])(?P<tz_hour>[0-9][0-9]?)(?::(?P<tz_minute>[0-9][0-9]))?))?)?$""", re.X)


def _construct_timestamp(loader: yaml.SafeLoader, node: yaml.Node) -> _dt.date | _dt.datetime:
    """A timestamp as js-yaml builds it — `Date.UTC(year, month - 1, day, …)`, which ROLLS OVER rather
    than refusing: `2026-13-01` is 2027-01-01, `2026-02-30` is 2026-03-02, a two-digit year is 1900+."""
    m = _TIMESTAMP.match(loader.construct_scalar(node))
    if not m:
        raise ConstructorError(None, None, "not a timestamp", node.start_mark)
    year, month, day = int(m.group("year")), int(m.group("month")), int(m.group("day"))
    if 0 <= year <= 99:
        year += 1900
    months = year * 12 + (month - 1)
    y, mo = divmod(months, 12)
    try:
        base = _dt.date(y, mo + 1, 1) + _dt.timedelta(days=day - 1)
    except (ValueError, OverflowError):
        raise ConstructorError(None, None, "a timestamp out of range", node.start_mark) from None
    if m.group("hour") is None:
        return base
    frac = m.group("fraction") or ""
    micro = int((frac + "000000")[:6]) if frac else 0
    when = _dt.datetime(base.year, base.month, base.day, tzinfo=_dt.timezone.utc) + _dt.timedelta(
        hours=int(m.group("hour")), minutes=int(m.group("minute")), seconds=int(m.group("second")), microseconds=micro)
    if m.group("tz") and m.group("tz") != "Z":
        delta = _dt.timedelta(hours=int(m.group("tz_hour")), minutes=int(m.group("tz_minute") or 0))
        when = when - delta if m.group("tz_sign") == "+" else when + delta
    return when


_Loader.add_constructor("tag:yaml.org,2002:int", _construct_int)
_Loader.add_constructor("tag:yaml.org,2002:float", _construct_float)
_Loader.add_constructor("tag:yaml.org,2002:timestamp", _construct_timestamp)
_Loader.construct_mapping = _construct_mapping  # type: ignore[assignment]


def _one_line(e: BaseException) -> str:
    if isinstance(e, yaml.MarkedYAMLError):
        parts = []
        if e.context:
            parts.append(e.context)
        if e.problem:
            parts.append(e.problem)
        mark = e.problem_mark or e.context_mark
        msg = " ".join(parts) if parts else str(e).splitlines()[0]
        if mark is not None:
            msg = f"{msg} ({mark.line + 1}:{mark.column + 1})"
        return msg
    return str(e).splitlines()[0] if str(e) else e.__class__.__name__


def load(text: str) -> Any:
    """The one document in `text`, as js-yaml would read it; `None` for an empty text."""
    try:
        return yaml.load(text, Loader=_Loader)
    except yaml.YAMLError as e:
        raise YamlError(_one_line(e)) from None
    except (ValueError, TypeError, RecursionError) as e:  # a scalar the constructors refuse
        raise YamlError(_one_line(e)) from None


def error_line(text: str) -> str | None:
    """The checker's problem line for a text that is not YAML, else `None`."""
    try:
        load(text)
        return None
    except YamlError as e:
        return f"YAML: {e}"


def load_or_none(text: str) -> Any:
    """`load`, with a parse error read as `None` — the lenient parsers' habit."""
    try:
        return load(text)
    except YamlError:
        return None


def is_date(v: Any) -> bool:
    """A bare date or datetime scalar — what js-yaml hands over as a `Date`."""
    return isinstance(v, (_dt.date, _dt.datetime))


def iso_date(v: Any) -> str:
    """`YYYY-MM-DD` of a date scalar, in UTC as `Date.toISOString().slice(0, 10)` gives it."""
    if isinstance(v, _dt.datetime):
        if v.tzinfo is not None:
            v = v.astimezone(_dt.timezone.utc)
        return v.date().isoformat()
    if isinstance(v, _dt.date):
        return v.isoformat()
    return ""


def iso_full(v: Any) -> str:
    """The `Date.toISOString()` form of a date scalar, for JSON."""
    if isinstance(v, _dt.datetime):
        u = v.astimezone(_dt.timezone.utc) if v.tzinfo is not None else v
        return u.strftime("%Y-%m-%dT%H:%M:%S.") + f"{u.microsecond // 1000:03d}Z"
    if isinstance(v, _dt.date):
        return f"{v.isoformat()}T00:00:00.000Z"
    return ""


def dump(value: Any) -> str:
    """A document as text, the way `docText` re-emits a written document for its kind's engine.

    Plain block style, no anchors, keys in the order the mapping has them, unlimited line width —
    `yaml.dump(v, {lineWidth: -1, noRefs: true})`.
    """
    class _Dumper(yaml.SafeDumper):
        def ignore_aliases(self, data: Any) -> bool:  # noRefs
            return True

    def _str(dumper: yaml.SafeDumper, data: str) -> yaml.Node:
        style = "|" if "\n" in data else None
        return dumper.represent_scalar("tag:yaml.org,2002:str", data, style=style)

    _Dumper.add_representer(str, _str)
    # Quote exactly what THIS loader would read as something other than text.
    _Dumper.yaml_implicit_resolvers = _Loader.yaml_implicit_resolvers
    return yaml.dump(value if value is not None else {}, Dumper=_Dumper, sort_keys=False,
                     allow_unicode=True, width=float("inf"), default_flow_style=False)
