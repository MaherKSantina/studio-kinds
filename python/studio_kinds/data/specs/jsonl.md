# .jsonl — Data

## The engine's account

The check is `python/studio_kinds/kinds/jsonl.py` in the studio-kinds repository; the account below is that engine's own.

The `.jsonl` file kind — DATA ROWS: one JSON object per line (JSON Lines),
shown as a table whose columns are FOUND, not declared — the union of the
objects' keys, in the order they first appear. Made for LOOKING THROUGH
data: thousands of rows paged, one search box over every field, a click on
a header to sort — the way the csv kind is made for examining cells and the
pdf kind for reading pages. Nothing is authored here: a `.jsonl` is written
by whatever produced the data (an export, a program's output, a log).

Lenient: blank lines are skipped; a line that is not a JSON object is a
PROBLEM (reported with its line number, the row skipped); a file whose
whole text is one JSON array of objects is accepted as well. Values render
as text — strings as they are, numbers and booleans as written, null and
missing empty, objects and arrays as compact JSON — and that text is what
the search and the sort see.

WHAT IS KNOWN ABOUT THE ROWS lives in the same file — a line whose keys
start with `$` is a DIRECTIVE, not a row:

  {"$title": "Stays by price", "$description": "Thu 1 - Mon 5 Oct, 4 nights, two adults"}
  {"$labels": {"best_offer.price_total_aud": "Total (4 nights, AUD)", "distance_from_narooma_km": "km from Narooma"}}

`$title` and `$description` name the table, `$labels` give the header
names (by field, dot paths included). Directive lines may be split as
above; they merge (`$labels` accumulates, a second scalar replaces the
first with a note).

The rows are THIS file's: a `.jsonl` is written by whatever produced them
and holds them, so what the table shows is what the file holds, and a
copy of the file is a copy of the table. A list curated from several
places at several times, with rules that amend, filter and sort it, is a
`.pipeline` — one file too.


## A fresh document (what the Studio creates)

```yaml
{"id":1,"name":"First row","amount":10,"done":true}
{"id":2,"name":"Second row","amount":20,"done":false,"note":"any key becomes a column"}
```

