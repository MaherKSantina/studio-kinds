# How a finance document works

<!-- Generated from kinds/finance/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

One pot of money and the ways it could be placed, weighed against each other — the capital there is to place, the one horizon they are all judged over, the benchmark the rest have to beat, and how an option states what it takes, what it borrows, what flows in and out of it and what leaving it costs. Structure is checked; the figures never are.

This is the `.finance` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Always

*imposed*

What holds at every moment — the engine's account of the kind, the same text studio-check --spec prints.

# .finance — Finance

## The engine's account

The check is `python/studio_kinds/kinds/finance.py` in the studio-kinds repository; the account below is that engine's own.

The `.finance` kind — one pot of money, and the ways it could be placed,
side by side. The document names the `capital` there is to place, the
`horizon_years` every option is judged over, and a `benchmark`: the one
option the others have to beat. Then the options — a term deposit, a
property, a business, whatever else — each written the same way, so the
only thing that differs between two of them is what is actually different
about them.

A document holds the SHAPE of the comparison and never its verdict: no
return is computed here and none is stored. The figures are worked out
elsewhere — a script, a spreadsheet, an agent — and written in as they
stand. What the kind guarantees is that they are all there, in one
currency, over one window, for every option, so whatever does the
arithmetic has nothing left to guess and two options can never be compared
over different ground.

So the check judges STRUCTURE and nothing else. It asks whether a figure
is a number, never what the number says: an option taking more capital
than the pot holds, a schedule running past the horizon, a cost written as
a negative, a rate of 4000% — every one of those passes. A figure that
makes no sense is the author's business, and the author is the one who
computed it.

Shape (YAML):

  title: Where the savings go
  currency: AUD
  capital: 300000                   # the money there is to place
  horizon_years: 10                 # the window every option is judged over
  as_of: 2026-09-24
  assumptions:                      # what is true of every option alike
    inflation_pct: 3.0
    tax_rate_pct: 32.0
  benchmark: bank                   # the option the others have to beat
  options:
    - id: bank                      # unique; what `benchmark` names
      label: Term deposit
      capital: 300000               # what this option takes of the pot
      loan: {amount: 0, rate_pct: 0, term_years: 0, interest_only: false}
      growth_pct: 0                 # what the asset itself gains per year
      flows:                        # money moving each year
        - {label: Interest, direction: in, amount: 13500, growth_pct: 0, taxable: true}
        - {label: Council rates, direction: out, amount: 2400, growth_pct: 3}
        - {label: Revenue, direction: in, schedule: [0, 40000, 90000, 120000]}
        - {label: Loan interest, direction: out, amount: 23200, start_year: 1, end_year: 5}
      exit: {sell: true, cost_pct: 2.5}   # sold at the horizon, and what getting out costs
      effort_hours_per_week: 0      # the time it takes — a cost that is not money
      risk: low                     # low | medium | high | speculative
      liquidity: days               # days | weeks | months | years
      note: Rolls over every 12 months.

Every rate is a PERCENT — `4.5`, not `0.045`. Every amount is in the
document's `currency`, and the currency is the document's, never an
option's: a comparison across two currencies is a comparison of nothing.

CAPITAL is the pot; an option's `capital` is what that option takes of it.
Options are ALTERNATIVES, not a portfolio — their capital is not added up,
and one taking less than the pot holds leaves the rest unplaced. Whether
an option's capital fits the pot at all is not asked here.

A LOAN is what makes leverage sayable: a property bought with a deposit
and a mortgage takes little of the pot and controls a whole asset, while a
term deposit takes all of it and controls exactly itself. `amount` is
borrowed on top of the option's capital. A `loan` written without a
`rate_pct` is a PROBLEM — the block is incomplete, which is structure, not
a judgement about its figures.

A FLOW is money moving each year of the horizon, `in` or `out`. Its size
is written one of two ways, never both and never neither: an `amount`
repeating every year it runs, optionally compounding at its own
`growth_pct`; or a `schedule`, one figure per year in order — what a
business's ramp needs and a rate cannot say. `start_year` and `end_year` bound a flow
that does not run the whole window; both count from 1. Whether either
reaches past the horizon, or whether an end falls before its start, is not
asked here — only that they are whole numbers.

An `amount` is the amount in the flow's FIRST RUNNING year and compounds
from there, not from year 1 — a hire written `{amount: 82000, growth_pct:
3, start_year: 3}` costs 82,000 in year 3, not 82,000 grown by two years.
A `schedule`'s first entry is likewise its first running year. Written the
other way round, a flow that starts late would be authored at a figure it
is never worth, which is a figure nobody can check against a quote.

The check, structure only: an option with no id or a repeated one, an
option with no label, a `benchmark` naming no option, an amount or a
percent that is not a number, a count of years that is not whole, an
unknown `risk`, `liquidity` or `direction`, a `loan` with no `rate_pct`, a
flow with no label, and a flow with neither an amount nor a schedule or
with both.

By convention money out is a flow's `direction`, never a negative amount —
but a negative amount is not refused, only unread by anything expecting
the convention.

## A fresh document (what the Studio creates)

```yaml
title: Untitled comparison
currency: AUD
capital: 100000
horizon_years: 10
benchmark: bank
options:
  - id: bank
    label: Leave it in the bank
    capital: 100000
    growth_pct: 0
    flows:
      - {label: Interest, direction: in, amount: 4500, growth_pct: 0}
    exit: {sell: true, cost_pct: 0}
    risk: low
    liquidity: days
```
