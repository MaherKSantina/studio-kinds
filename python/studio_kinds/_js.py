"""The JavaScript the engines were written in, where Python would read a value differently.

The problem lines the checker prints quote values the way the original engines did — `Number()`
coercion, `String()`, `JSON.stringify` — and a line that reads `got 4.0` where the Studio said
`got 4` is a line an agent cannot match against the book. These helpers keep the wording, and the
few type distinctions (a boolean is not a number; `1` is not `"1"`) that JavaScript makes and Python
blurs.
"""
from __future__ import annotations

import json
import math
import re
from typing import Any

from ._yaml import is_date, iso_full

MISSING = object()
"""A key that is not there — JavaScript's `undefined` where `None` would mean YAML's `null`."""


def get(o: Any, key: str) -> Any:
    """`o[key]` as JavaScript reads it: `MISSING` for a key that is not there."""
    return o.get(key, MISSING) if isinstance(o, dict) else MISSING


def present(v: Any) -> bool:
    """`v !== undefined && v !== null`."""
    return v is not MISSING and v is not None


def defined(v: Any) -> bool:
    """`v !== undefined`."""
    return v is not MISSING


def is_obj(v: Any) -> bool:
    """A mapping — `typeof v === "object" && !Array.isArray(v)`, nulls excluded."""
    return isinstance(v, dict)


def is_list(v: Any) -> bool:
    return isinstance(v, list)


def is_str(v: Any) -> bool:
    return isinstance(v, str)


def is_bool(v: Any) -> bool:
    return isinstance(v, bool)


def is_num(v: Any) -> bool:
    """`typeof v === "number"` — a boolean is not one; NaN and infinities are."""
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def is_finite(v: Any) -> bool:
    """`typeof v === "number" && Number.isFinite(v)`."""
    return is_num(v) and math.isfinite(v)


def is_integer(v: Any) -> bool:
    """`Number.isInteger(v)`."""
    return is_finite(v) and float(v).is_integer()


def rec(v: Any) -> dict:
    """The mapping, or an empty one."""
    return v if isinstance(v, dict) else {}


def arr(v: Any) -> list:
    """The list, or an empty one."""
    return v if isinstance(v, list) else []


def as_str(v: Any) -> str:
    """The string, or empty."""
    return v if isinstance(v, str) else ""


def opt_str(v: Any) -> str | None:
    """The string, or `None`."""
    return v if isinstance(v, str) else None


def trimmed(v: Any) -> str | None:
    """A non-blank string, trimmed; else `None`."""
    return v.strip() if isinstance(v, str) and v.strip() else None


_NUMERIC = re.compile(r"^[-+]?(?:(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|Infinity)$")
_HEX = re.compile(r"^0[xX][0-9a-fA-F]+$")
_OCT = re.compile(r"^0[oO][0-7]+$")
_BIN = re.compile(r"^0[bB][01]+$")


def number(v: Any) -> float:
    """`Number(v)` — NaN where JavaScript would give NaN."""
    if v is MISSING:
        return math.nan
    if v is None:
        return 0.0
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip()
        if s == "":
            return 0.0
        if _HEX.match(s):
            return float(int(s[2:], 16))
        if _OCT.match(s):
            return float(int(s[2:], 8))
        if _BIN.match(s):
            return float(int(s[2:], 2))
        if _NUMERIC.match(s):
            try:
                return float(s)
            except ValueError:
                return math.nan
        return math.nan
    if isinstance(v, list):
        if not v:
            return 0.0
        if len(v) == 1:
            return number(v[0])
        return math.nan
    if is_date(v):
        return math.nan  # the engines never coerce a date; NaN keeps the check honest
    return math.nan


def finite_number(v: Any) -> bool:
    """`Number.isFinite(Number(v))`."""
    return math.isfinite(number(v))


def num_str(n: float | int) -> str:
    """`String(n)` for a number: `4`, not `4.0`; `0.75`; `1e+21`."""
    if isinstance(n, bool):
        return "true" if n else "false"
    if isinstance(n, int):
        return str(n)
    if math.isnan(n):
        return "NaN"
    if math.isinf(n):
        return "Infinity" if n > 0 else "-Infinity"
    if n.is_integer() and abs(n) < 1e21:
        return str(int(n))
    s = repr(n)
    if "e" in s:
        mant, exp = s.split("e")
        exp_n = int(exp)
        return f"{mant}e{'+' if exp_n >= 0 else '-'}{abs(exp_n)}"
    return s


def js_str(v: Any) -> str:
    """`String(v)`."""
    if v is MISSING:
        return "undefined"
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return num_str(v)
    if isinstance(v, str):
        return v
    if isinstance(v, list):
        return ",".join("" if x is None or x is MISSING else js_str(x) for x in v)
    if isinstance(v, dict):
        return "[object Object]"
    if is_date(v):
        return iso_full(v)
    return str(v)


def _jsonable(v: Any) -> Any:
    if v is MISSING:
        return None
    if isinstance(v, bool) or v is None or isinstance(v, str):
        return v
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        if not math.isfinite(v):
            return None
        return int(v) if v.is_integer() and abs(v) < 1e21 else v
    if isinstance(v, list):
        return [_jsonable(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _jsonable(x) for k, x in v.items() if x is not MISSING}
    if is_date(v):
        return iso_full(v)
    return str(v)


def json_of(v: Any) -> str:
    """`JSON.stringify(v)` — `undefined` for a missing value, compact, non-ASCII kept."""
    if v is MISSING:
        return "undefined"
    return json.dumps(_jsonable(v), separators=(",", ":"), ensure_ascii=False)


def locale(n: int) -> str:
    """`n.toLocaleString()` — thousands separated."""
    return f"{n:,}"


def plural(n: int, one: str, many: str | None = None) -> str:
    """`${n} ${one}${n === 1 ? "" : "s"}`."""
    return f"{n} {one if n == 1 else (many or one + 's')}"


def slug_key(s: str, cap: int = 48) -> str:
    """The playbook's `slugKey`: lower-case, runs of non-alphanumerics to `-`, trimmed, capped."""
    out = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:cap]
    return out or "x"


def key_of(v: Any) -> Any:
    """A value as a dictionary/set key that keeps JavaScript's `===`: `1`, `"1"` and `true` stay apart."""
    if isinstance(v, bool):
        return ("bool", v)
    if isinstance(v, (int, float)):
        return ("num", float(v))
    if isinstance(v, str):
        return ("str", v)
    return ("other", id(v))
