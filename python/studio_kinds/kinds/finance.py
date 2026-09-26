"""`.finance` — the ways one pot of money could be placed, side by side: the `capital` there is to
place, the `horizon_years` every option is judged over, the `benchmark` the rest are measured
against, and the `options` themselves — each with the capital it takes, what it borrows, what the
asset gains, the money flowing in and out year by year, and what getting out of it costs.

A document holds the SHAPE of the comparison, never its verdict: no return is computed here and none
is stored. The figures are worked out elsewhere — a script, a spreadsheet, an agent — and written in
as they stand.

So the check judges STRUCTURE and nothing else. It asks whether a figure is a number, never what the
number says: an option taking more capital than the pot holds, a schedule running past the horizon,
a cost written as a negative, a rate of 4000% — every one of those passes. A figure that makes no
sense is the author's business, and the author is the one who computed it.

The check: an option with no id or a repeated one, an option with no label, a benchmark naming no
option, an amount or a percent that is not a number, an unknown risk, liquidity or direction, a loan
with no rate, and a flow with neither an amount nor a schedule or with both.
"""
from __future__ import annotations

from dataclasses import dataclass

from .. import _yaml
from .._js import (arr, get, is_finite, is_integer, is_list, js_str, plural, present, rec,
                   trimmed)
from . import CheckResult

RISKS = ("low", "medium", "high", "speculative")
LIQUIDITY = ("days", "weeks", "months", "years")
DIRECTIONS = ("in", "out")


def _at(where: str | None, field: str) -> str:
    """A problem's subject: the field on its own at the top level, under its option otherwise."""
    return f"{where}: {field}" if where else field


def _amount(problems: list[str], where: str | None, field: str, v: object) -> None:
    """Money — is it a number. Absent is fine, and what the number says is never judged: a negative
    cost or a figure larger than the pot is the author's business, not the engine's."""
    if present(v) and not is_finite(v):
        problems.append(f'{_at(where, field)} "{js_str(v)}" is not an amount')


def _percent(problems: list[str], where: str | None, field: str, v: object) -> None:
    """A rate, written as a percent — `4.5`, not `0.045`. Is it a number; never how big."""
    if present(v) and not is_finite(v):
        problems.append(f'{_at(where, field)} "{js_str(v)}" is not a percent')


def _whole(problems: list[str], where: str | None, field: str, v: object, unit: str = " of years") -> None:
    """A year — a count of them, or one of the horizon's. Is it whole; never whether it lands in
    range. Absent is fine, and zero and the far future both pass."""
    if present(v) and not is_integer(v):
        problems.append(f'{_at(where, field)} "{js_str(v)}" is not a whole number{unit}')


@dataclass
class Finance:
    horizon: object
    benchmark: str | None
    count: int
    """The options in the document — not `len(ids)`, which leaves out an option with no id."""
    ids: list[str]
    labels: dict[str, str]
    flows: int
    problems: list[str]


def parse(text: str) -> Finance:
    problems: list[str] = []
    try:
        raw = rec(_yaml.load(text))
    except _yaml.YamlError as e:
        raw = {}
        problems.append(f"YAML: {e}")

    _amount(problems, None, "capital", get(raw, "capital"))

    horizon = get(raw, "horizon_years")
    if not present(horizon):
        problems.append("no horizon_years — the window every option is judged over")
    else:
        _whole(problems, None, "horizon_years", horizon)

    a = rec(get(raw, "assumptions"))
    _percent(problems, None, "assumptions.inflation_pct", get(a, "inflation_pct"))
    _percent(problems, None, "assumptions.tax_rate_pct", get(a, "tax_rate_pct"))

    ids: list[str] = []
    labels: dict[str, str] = {}
    flows = 0
    raw_options = arr(get(raw, "options"))
    for i, x in enumerate(raw_options):
        o = rec(x)
        id_ = trimmed(get(o, "id"))
        if not id_:
            problems.append(f"option {i + 1}: no id")
        elif id_ in ids:
            problems.append(f'option {i + 1}: id "{id_}" is already used')
        where = f'option "{id_}"' if id_ else f"option {i + 1}"
        if id_:
            ids.append(id_)

        label = trimmed(get(o, "label"))
        if not label:
            problems.append(f"{where}: no label")
        elif id_ and id_ not in labels:
            labels[id_] = label

        _amount(problems, where, "capital", get(o, "capital"))
        _percent(problems, where, "growth_pct", get(o, "growth_pct"))
        _amount(problems, where, "effort_hours_per_week", get(o, "effort_hours_per_week"))

        risk = get(o, "risk")
        if present(risk) and risk not in RISKS:
            problems.append(f'{where}: unknown risk "{js_str(risk)}" — low, medium, high or speculative')
        liq = get(o, "liquidity")
        if present(liq) and liq not in LIQUIDITY:
            problems.append(f'{where}: unknown liquidity "{js_str(liq)}" — days, weeks, months or years')

        if present(get(o, "loan")):
            loan = rec(get(o, "loan"))
            _amount(problems, where, "loan amount", get(loan, "amount"))
            if not present(get(loan, "rate_pct")):
                problems.append(f"{where}: a loan with no rate_pct")
            else:
                _percent(problems, where, "loan rate_pct", get(loan, "rate_pct"))
            _whole(problems, where, "loan term_years", get(loan, "term_years"))

        if present(get(o, "exit")):
            _percent(problems, where, "exit cost_pct", get(rec(get(o, "exit")), "cost_pct"))

        for j, fx in enumerate(arr(get(o, "flows"))):
            flows += 1
            f = rec(fx)
            fw = f"{where}, flow {j + 1}"
            if not trimmed(get(f, "label")):
                problems.append(f"{fw}: no label")
            d = get(f, "direction")
            if not present(d):
                problems.append(f"{fw}: no direction — in or out")
            elif d not in DIRECTIONS:
                problems.append(f'{fw}: unknown direction "{js_str(d)}" — in or out')

            amount, schedule = get(f, "amount"), get(f, "schedule")
            if present(amount) and present(schedule):
                problems.append(f"{fw}: both amount and schedule — one or the other")
            elif not present(amount) and not present(schedule):
                problems.append(f"{fw}: neither amount nor schedule")
            if present(amount):
                _amount(problems, fw, "amount", amount)
                _percent(problems, fw, "growth_pct", get(f, "growth_pct"))
            if present(schedule):
                if not is_list(schedule):
                    problems.append(f'{fw}: schedule "{js_str(schedule)}" is not a list of amounts')
                else:
                    for k, sv in enumerate(schedule):
                        if not is_finite(sv):
                            problems.append(f'{fw}: schedule year {k + 1} "{js_str(sv)}" is not an amount')

            _whole(problems, fw, "start_year", get(f, "start_year"), "")
            _whole(problems, fw, "end_year", get(f, "end_year"), "")

    benchmark = trimmed(get(raw, "benchmark"))
    if not benchmark:
        if raw_options:
            problems.append("no benchmark — name the option the others are measured against")
    elif benchmark not in ids:
        problems.append(f'benchmark "{benchmark}" is not an option')

    return Finance(horizon, benchmark, len(raw_options), ids, labels, flows, problems)


def check(text: str) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    d = parse(text)
    bench = d.labels.get(d.benchmark or "", d.benchmark)
    return CheckResult(d.problems, " · ".join([
        plural(d.count, "option"),
        f"{js_str(d.horizon)} years" if is_integer(d.horizon) else "no horizon",
        f'benchmark "{bench}"' if bench else "no benchmark",
        plural(d.flows, "flow"),
    ]))
