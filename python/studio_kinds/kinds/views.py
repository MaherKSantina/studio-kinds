"""`.views` — one list of items in the file and the views over it. `items` are mappings, each with an id;
`fields` says which item key plays which ROLE — `id`, `title`, `status`, `start`, `end`, `previous`,
`parent` — and `views` says which views the file offers, each over the items its own `filter` keeps.
Without `views`, the roles decide: a table always; a kanban when a key is the `status`; a calendar when
a key is the `start` (the `end` too, when there is one); a gantt when `start`, `end` and `previous` or
`parent` are named; a sequence — the gantt's rows on steps of what comes after what, not days — when
`previous` or `parent` is; a dependency tree when `previous` is. A page is a view the file names with a Nunjucks
`template` of its own: it renders the view's items as HTML, the way a `.page` renders its model, and the
roles never offer one. The views are read: nothing on the page writes the file, and which view is open
is kept for the session only.

    title: Launch
    description: one line
    fields:                # item key → role; a role absent means the views that need it are absent
      id: id               # what identifies an item (default `id`)
      title: title         # what an item is labelled by (default `title`)
      status: status       # a kanban column                     → Kanban
      start: start         # a day, YYYY-MM-DD, or a time, YYYY-MM-DD HH:MM → Calendar; with `end` and `previous` or `parent`, Gantt
      end: end             # a day or a time, as `start`
      previous: after      # the id(s) of what comes before      → Tree, Sequence; with the dates, Gantt
      parent: under        # the id of the item this one is part of → Sequence; nested under it there and in the gantt
    columns: [To do, Doing, Done]   # the statuses in order; absent = the values found, first seen first
    views:                 # optional — absent = every view the roles allow, the table first
      - key: open
        kind: kanban       # table | kanban | calendar | gantt | sequence | tree | page
        label: Open work
        filter: [{field: status, op: not_equals, value: Done}]   # the suite's clause vocabulary
        sort: [{field: start, dir: asc}]
        group: owner       # a kanban's LANES: the values this item key takes, first seen first
      - key: plan
        kind: gantt
      - key: steps
        kind: sequence     # the gantt's rows on steps of what comes after what — no dates
        group: owner       # a gantt's or a sequence's GROUPS: a row per value over the top rows carrying it
      - key: report
        kind: page         # the view's items through a Nunjucks template of its own
        template: |
          {% for item in items %}<p>{{ item.title }} — {{ item.status }}</p>{% endfor %}
    items:
      - id: plan
        title: Plan the launch
        status: Done
        start: 2026-10-01
        end: 2026-10-03
        owner: Ana
        content:             # a document written into the item — its dialog draws it by its kind
          kind: md
          doc: |
            Scope, owners and the date.
      - id: build
        title: Build it
        status: Doing
        start: 2026-10-04
        end: 2026-10-10
        owner: Bo
        after: plan          # one id, or a list
      - id: build-api
        title: The API
        status: Doing
        start: 2026-10-04
        end: 2026-10-07
        under: build         # a child of `build`
      - id: demo
        title: Demo the API
        status: To do
        start: 2026-10-07 14:00   # a time: the week and the day place it by the clock
        end: 2026-10-07 15:30
        after: build-api

A start or an end is a day, `YYYY-MM-DD`, or a time on it, `YYYY-MM-DD HH:MM` — a `T` or a space
between, a 24-hour clock, no zone: the time the calendar shows; bare or quoted. An item with a time at
either end is timed — a start with no time is the start of its day, an end with none the end of its
day, a start with a time and no end a moment — and the calendar's week and day place it by the clock;
an item with days alone is all-day. The gantt reads the days. `previous` is one id or a list of ids,
`parent` one id, every one an item of this file. A view's `filter` is clauses over the items' own keys (`equals`, `not_equals`,
`contains`, `gt`, `between`, `in`, `is_empty`, … — one value or a list); `sort` is `{field, dir}`, first
key first; `limit` caps the rows. The rules read the keys as the table shows them — a date as its day,
with its time when it has one — so a day and the times on it sort together, the day first. A KANBAN view may also name a `group`: an item key whose values
become the board's LANES — rows of the board, the status columns running across each, in the order
the values are first seen among that view's items, and a last lane for the items carrying no value
for that key. Lanes are derived from the items, never listed: a lane is a value that is there. A
GANTT or a SEQUENCE may name a `group` too: its top rows gathered under a row per value, in the same
order, and a last row for those carrying none — each row spanning its rows and folding them away as a
parent does, a part staying under its whole whatever it carries. A
SEQUENCE lays the gantt's rows on steps instead of days: an item stands one step past everything it
comes after, and no earlier than its parent may start; an item takes one step and a parent spans its
parts, so what a whole comes after holds for every part and what comes after a whole comes after all
of them. Every other key an item carries is shown as it is — in the table's
columns and in the item's dialog — but `content`: an item that holds more than its line shows writes
that document into itself, `content: {kind, doc}`, the shape a brief's section and a kanban's task
carry; the item's dialog draws it by its own kind, and the table names its kind. A page view's
template is handed `items` — the view's items after its filter, sort and limit, each a mapping of its
own keys as written, a date as `YYYY-MM-DD` — with `title` (the document's), `fields` (the role → key
map, defaults filled), `columns` (the kanban's) and `view` (its `key` and `label`); its `partials` are
the templates its `include`, `import`, `from` and `extends` name.

The check names what the lenient reader dropped or defaulted: not a mapping, no `title`, `fields` that is
not a mapping, a role that is not one of the seven or mapped to something that is not a key name,
`columns` that is not a list of text, `views` that is not a list, a view without a key or a kind, a key
used twice, a kind that is not one of the seven or whose roles are not named, a page view whose
`template` is missing, not text or blank, whose `partials` are not a mapping of text, or whose templates
name a partial it does not hold, a `template` or `partials` on a view that is not a page, a `group` on a
view that is not a kanban, a gantt or a sequence, one that is not an item key name, or one no item carries, a clause
without a field or with an op outside the vocabulary, `items` that is not a list, an item that is not a mapping or has
no id, an id used twice, a status that is not a column when columns are given, a start or end that is
not a date, a time after its day the calendar cannot read, a bare timestamp written in a zone — read in
UTC, so the calendar would show another time — an end before its start, a `previous` that is not an id
or a list of ids, a `parent` that is
not an id, one naming no item or the item itself, items caught in a cycle, a part and its whole out of
order — a part after its own whole or after what comes after it, a whole after its own part, which no
step can hold — and what an item's `content`
cannot be — not a mapping, no `kind` or `doc`, an `md` document that is not text, `by`, `docs` or `file`
on it. Each written document is then run through its own kind's engine, so a broken brief inside an
item is a broken views document.
"""
from __future__ import annotations

import datetime as _dt
import re
from dataclasses import dataclass, field
from typing import Any

from .. import _yaml
from .._js import as_str, defined, get, is_list, is_obj, js_str, json_of, plural
from .._rows import TableRules, apply_table, read_table_rules
from . import CheckResult, content_problems, read_content, written_doc_problems
from .kanban import as_date
from .page import template_problems

ROLES: tuple[str, ...] = ("id", "title", "status", "start", "end", "previous", "parent")
"""The roles an item key can play, and the only keys `fields` takes."""

VIEW_KINDS: tuple[str, ...] = ("table", "kanban", "calendar", "gantt", "sequence", "tree", "page")
"""The views a file can name."""

GROUP_KINDS: tuple[str, ...] = ("kanban", "gantt", "sequence")
"""The views a `group` key gathers: the kanban into lanes, the gantt and the sequence into groups."""

ROLE_VIEWS: tuple[str, ...] = ("table", "kanban", "calendar", "gantt", "sequence", "tree")
"""The views the roles allow, in the order the page offers them when the file names none — a page is a
view only a file names, with its template."""

DEFAULT_FIELDS: dict[str, str] = {"id": "id", "title": "title"}

_CLOCK = re.compile(r"^\d{4}-\d{2}-\d{2}[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$")
"""A day and a time on it: `YYYY-MM-DD HH:MM`, a `T` or a space between, seconds allowed and not read."""

_CLOCK_LIKE = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}")
"""Text that writes a time after its day — one the calendar reads, or not."""


def as_time(v: Any) -> str:
    """The time of day a start or an end carries, `HH:MM` — "" for a day alone. A bare timestamp's clock is read in
    UTC, the way js-yaml hands it over, and at midnight it is its day alone, since a bare date reads the same; a
    text's is the time written after its day, on a 24-hour clock."""
    if isinstance(v, _dt.datetime):
        u = v.astimezone(_dt.timezone.utc) if v.tzinfo else v
        return "" if (u.hour, u.minute, u.second, u.microsecond) == (0, 0, 0, 0) else f"{u.hour:02d}:{u.minute:02d}"
    if isinstance(v, str):
        m = _CLOCK.match(v)
        if m and int(m.group(1)) < 24 and int(m.group(2)) < 60 and int(m.group(3) or 0) < 60:
            return f"{int(m.group(1)):02d}:{m.group(2)}"
    return ""


def when_text(day: str, time: str) -> str:
    """A start or an end in words: its day, and its time when it has one."""
    return f"{day} {time}" if time else day


@dataclass
class Item:
    id: str
    title: str
    fields: dict[str, Any]
    status: str | None = None
    start: str | None = None
    end: str | None = None
    previous: list[str] = field(default_factory=list)
    parent: str | None = None
    content: dict | None = None
    """`{"kind": str, "doc": Any}` when the item holds a written document."""
    start_time: str | None = None
    end_time: str | None = None
    """The time on the start's and the end's day, `HH:MM`, when there is one — the item is timed."""


@dataclass
class View:
    key: str
    kind: str
    label: str
    rules: TableRules = field(default_factory=TableRules)
    template: str = ""
    """A page view's Nunjucks template; empty for every other kind."""
    partials: dict[str, str] = field(default_factory=dict)
    """A page view's partials that are text, by name."""
    group: str = ""
    """The item key whose values gather the view's items — a kanban's lanes, a gantt's or a sequence's groups; empty =
    none."""


@dataclass
class Views:
    title: str
    fields: dict[str, str]
    items: list[Item]
    columns: list[str] | None = None
    description: str | None = None
    views: list[View] | None = None
    """The file's own views; `None` when it names none and the roles decide."""


def read_fields(raw: Any) -> dict[str, str]:
    """The role → key mapping, defaults filled: `id` and `title` always have a key."""
    out = dict(DEFAULT_FIELDS)
    for role, key in (raw.items() if is_obj(raw) else []):
        if role in ROLES and isinstance(key, str) and key:
            out[role] = key
    return out


def view_offered(kind: str, fields: dict[str, str]) -> bool:
    """Whether the roles named allow a view of this kind — a table and a page need none."""
    if kind in ("table", "page"):
        return True
    if kind == "kanban":
        return "status" in fields
    if kind == "calendar":
        return "start" in fields
    if kind == "gantt":
        return "start" in fields and "end" in fields and ("previous" in fields or "parent" in fields)
    if kind == "sequence":
        return "previous" in fields or "parent" in fields
    if kind == "tree":
        return "previous" in fields
    return False


def view_needs(kind: str) -> str:
    """What a view of this kind needs under `fields`, in words — for the checker's line."""
    return {"table": "nothing", "page": "nothing", "kanban": "a `status` role", "calendar": "a `start` role",
            "gantt": "`start`, `end` and `previous` or `parent` roles", "sequence": "a `previous` or a `parent` role",
            "tree": "a `previous` role"}.get(kind, "")


def _id_text(v: Any) -> str:
    """An id as text: a string, or a whole number written as one; anything else is no id."""
    if isinstance(v, bool):
        return ""
    if isinstance(v, int):
        return str(v)
    return v if isinstance(v, str) else ""


def _ids(v: Any) -> list[str]:
    if isinstance(v, (str, int)):
        return [_id_text(v)] if _id_text(v) else []
    if is_list(v):
        return [_id_text(x) for x in v if _id_text(x)]
    return []


def _read_views(raw: Any, fields: dict[str, str]) -> list[View] | None:
    """The file's views, leniently: a view without a key or a kind, or with a kind the roles do not allow, is left out."""
    if not is_list(raw):
        return None
    out: list[View] = []
    seen: set[str] = set()
    for v in raw:
        if not is_obj(v):
            continue
        key, kind = as_str(v.get("key")), as_str(v.get("kind")).strip().lower()
        if not key or key in seen or kind not in VIEW_KINDS or not view_offered(kind, fields):
            continue
        seen.add(key)
        view = View(key, kind, as_str(v.get("label")) or kind.capitalize(), read_table_rules(v, [], "filter"))
        if kind == "page":
            view.template = v["template"] if isinstance(v.get("template"), str) else ""
            view.partials = {(k if isinstance(k, str) else js_str(k)): p
                             for k, p in (v["partials"].items() if is_obj(v.get("partials")) else []) if isinstance(p, str)}
        elif kind in GROUP_KINDS:
            view.group = as_str(v.get("group"))
        out.append(view)
    return out


def parse(text: str) -> Views:
    """The lenient read — never refuses; an item with no id is given `#N`, a second id is dropped."""
    raw = _yaml.load_or_none(text)
    if not is_obj(raw):
        return Views("", dict(DEFAULT_FIELDS), [])
    fields = read_fields(raw.get("fields"))
    columns = [c for c in raw["columns"] if isinstance(c, str) and c] if is_list(raw.get("columns")) else None
    items: list[Item] = []
    seen: set[str] = set()
    for i, it in enumerate(raw["items"] if is_list(raw.get("items")) else []):
        if not is_obj(it):
            continue
        id_ = _id_text(it.get(fields["id"])) or f"#{i + 1}"
        if id_ in seen:
            continue
        seen.add(id_)
        title = as_str(it.get(fields["title"])) or id_
        status = as_str(it.get(fields["status"])) if "status" in fields else ""
        start = as_date(it.get(fields["start"])) if "start" in fields else ""
        end = as_date(it.get(fields["end"])) if "end" in fields else ""
        start_time = as_time(it.get(fields["start"])) if start else ""
        end_time = as_time(it.get(fields["end"])) if end else ""
        previous = [p for p in _ids(it.get(fields["previous"])) if p != id_] if "previous" in fields else []
        parent = _id_text(it.get(fields["parent"])) if "parent" in fields else ""
        items.append(Item(id_, title, dict(it), status or None, start or None, end or None, previous,
                          parent if parent and parent != id_ else None, read_content(it.get("content")),
                          start_time or None, end_time or None))
    for it in items:
        it.previous = [p for p in it.previous if p in seen]
        if it.parent and it.parent not in seen:
            it.parent = None
    return Views(as_str(raw.get("title")), fields, items, columns, as_str(raw.get("description")) or None,
                 _read_views(raw.get("views"), fields))


def columns_of(doc: Views) -> list[str]:
    """The kanban's columns: the file's, else every status found, first seen first."""
    if doc.columns is not None:
        return doc.columns
    out: list[str] = []
    for it in doc.items:
        if it.status and it.status not in out:
            out.append(it.status)
    return out


def lanes_of(view: View, items: list[Item]) -> list[tuple[str, list[Item]]]:
    """A kanban's lanes: the values its `group` key takes among these items, first seen first, and
    last the items carrying none, under an empty label. One unlabelled lane when it groups by
    nothing — the plain board a kanban degenerates to."""
    if not view.group:
        return [("", items)]
    lanes: list[tuple[str, list[Item]]] = []
    at: dict[str, list[Item]] = {}
    rest: list[Item] = []
    for it in items:
        v = it.fields.get(view.group)
        label = "" if v is None or v == "" or isinstance(v, bool) else (v if isinstance(v, str) else js_str(v))
        if not label:
            rest.append(it)
            continue
        if label not in at:
            at[label] = []
            lanes.append((label, at[label]))
        at[label].append(it)
    if rest:
        lanes.append(("", rest))
    return lanes


def top_items(items: list[Item]) -> list[Item]:
    """The items at the top of a view's outline: those whose parent is not among them — what a gantt's or a sequence's
    `group` gathers, their parts staying under them."""
    ids = {it.id for it in items}
    return [it for it in items if not (it.parent and it.parent in ids)]


def available_views(doc: Views) -> list[View]:
    """The views the file offers: its own, else one of every kind the roles allow, the table first."""
    if doc.views is not None:
        return doc.views
    return [View(k, k, k.capitalize()) for k in ROLE_VIEWS if view_offered(k, doc.fields)]


def _as_shown(fields: dict[str, Any]) -> dict[str, Any]:
    """An item's keys as a view's rules read them — as the table shows them, a date as its day and its time when it
    has one — so a bare day and a time written as text sort together."""
    return {k: when_text(_yaml.iso_date(v), as_time(v)) if _yaml.is_date(v) else v for k, v in fields.items()}


def rows_of_view(doc: Views, view: View) -> list[Item]:
    """The items a view shows — its filter, sort and limit applied over the items' own fields, as the table shows
    them."""
    rows = [_as_shown(it.fields) for it in doc.items]
    by_row = {id(r): it for r, it in zip(rows, doc.items)}
    kept = apply_table(TableRules(view.rules.where, view.rules.sort, None, [], view.rules.limit), rows).rows
    return [by_row[id(r)] for r in kept]


def layers(items: list[Item]) -> dict[str, int]:
    """Each item's depth by longest chain of `previous` (Kahn's order); items in a cycle are absent."""
    by_id = {it.id: it for it in items}
    layer: dict[str, int] = {}
    pending = {it.id: len(it.previous) for it in items}
    queue = [it.id for it in items if not it.previous]
    while queue:
        id_ = queue.pop(0)
        prev = by_id[id_].previous
        layer[id_] = (max(layer.get(p, 0) for p in prev) + 1) if prev else 0
        for other in items:
            if other.id in layer or id_ not in other.previous:
                continue
            pending[other.id] -= 1
            if pending[other.id] == 0:
                queue.append(other.id)
    return layer


def parent_cycle(items: list[Item]) -> list[str]:
    """The items whose parent chain never reaches a root — the ids caught in a cycle of `parent`."""
    by_id = {it.id: it for it in items}
    bad: list[str] = []
    for it in items:
        seen: set[str] = set()
        at: Item | None = it
        while at and at.parent:
            if at.id in seen:
                bad.append(it.id)
                break
            seen.add(at.id)
            at = by_id.get(at.parent)
    return bad


def unplaced(items: list[Item]) -> list[str]:
    """The items a sequence gives no step, in the file's order. An item stands one step past everything it comes
    after and no earlier than its parent may start, and a parent spans its parts — so an item's start waits for the
    end of what it comes after and for its parent's start, and a parent's end for its parts' ends. Two points per
    item (its start 2i, its end 2i + 1) in Kahn's order: a point in a loop, or after one, is never reached — a cycle
    of `previous`, a part after its own whole or after what comes after it, a whole after its own part. Items in a
    cycle of `parent` are `parent_cycle`'s and left out."""
    nested = set(parent_cycle(items))
    kept = [it for it in items if it.id not in nested]
    at = {it.id: i for i, it in enumerate(kept)}
    parts: dict[str, list[Item]] = {}
    for it in kept:
        if it.parent and it.parent in at:
            parts.setdefault(it.parent, []).append(it)
    n = len(kept) * 2
    after: list[list[int]] = [[] for _ in range(n)]
    waiting = [0] * n

    def link(a: int, b: int) -> None:
        after[a].append(b)
        waiting[b] += 1

    for i, it in enumerate(kept):
        if it.id in parts:
            for c in parts[it.id]:
                link(2 * i, 2 * at[c.id])
                link(2 * at[c.id] + 1, 2 * i + 1)
        else:
            link(2 * i, 2 * i + 1)
        for p in it.previous:
            if p in at:
                link(2 * at[p] + 1, 2 * i)
    reached = [False] * n
    queue = [v for v in range(n) if not waiting[v]]
    while queue:
        v = queue.pop()
        reached[v] = True
        for w in after[v]:
            waiting[w] -= 1
            if waiting[w] == 0:
                queue.append(w)
    return [it.id for it in kept if not (reached[2 * at[it.id]] and reached[2 * at[it.id] + 1])]


def problems(text: str) -> list[str]:
    raw = _yaml.load_or_none(text)
    out: list[str] = []
    if not is_obj(raw):
        return ["not a mapping — a views document is `title`, `fields`, `views` and `items`"]
    if not as_str(raw.get("title")):
        out.append("no `title` — the heading")
    if defined(get(raw, "fields")):
        if not is_obj(raw["fields"]):
            out.append(f"`fields` is not a mapping — a role to the item key that plays it: {', '.join(ROLES)}")
        else:
            for role, key in raw["fields"].items():
                if role not in ROLES:
                    out.append(f"fields.{role}: not a role — the roles are {', '.join(ROLES)}")
                elif not isinstance(key, str) or not key:
                    out.append(f"fields.{role}: not a key name (got {json_of(key)}) — the item key that plays this role")
    fields = read_fields(raw.get("fields"))
    if defined(get(raw, "columns")):
        if not is_list(raw["columns"]):
            out.append("`columns` is not a list — the statuses in order")
        else:
            for i, c in enumerate(raw["columns"]):
                if not isinstance(c, str) or not c:
                    out.append(f"column {i + 1}: not text (got {json_of(c)})")
            if "status" not in fields:
                out.append("`columns` without a `status` role — say which item key is the status under `fields`")
    item_keys = {k for it in (raw["items"] if is_list(raw.get("items")) else []) if is_obj(it) for k in it}
    if defined(get(raw, "views")):
        if not is_list(raw["views"]):
            out.append(f"`views` is not a list — the views to offer, each `key`, `kind` ({', '.join(VIEW_KINDS)}) and its `filter`")
        else:
            keys: set[str] = set()
            for i, v in enumerate(raw["views"]):
                where = f"view {i + 1}"
                if not is_obj(v):
                    out.append(f"{where}: not a mapping — write `key`, `kind` and the rest")
                    continue
                key = as_str(v.get("key"))
                name = f"view {key}" if key else where
                if not key:
                    out.append(f"{where}: no `key` — the view's identity")
                elif key in keys:
                    out.append(f"{name}: key twice")
                keys.add(key)
                kind = as_str(v.get("kind")).strip().lower()
                if not defined(get(v, "kind")):
                    out.append(f"{name}: no `kind` — one of {', '.join(VIEW_KINDS)}")
                elif kind not in VIEW_KINDS:
                    out.append(f"{name}: kind {json_of(v['kind'])} is not a view — one of {', '.join(VIEW_KINDS)}")
                elif not view_offered(kind, fields):
                    out.append(f"{name}: a {kind} needs {view_needs(kind)} under `fields`")
                if kind == "page":
                    out.extend(template_problems(v, "view", "that renders the view's items", f"{name}: "))
                elif kind in VIEW_KINDS:
                    for k in ("template", "partials"):
                        if defined(get(v, k)):
                            out.append(f"{name}: `{k}` is a page view's — a {kind} draws the items itself")
                if defined(get(v, "group")):
                    if kind in VIEW_KINDS and kind not in GROUP_KINDS:
                        out.append(f"{name}: `group` is a kanban's, a gantt's or a sequence's — a {kind} has no lanes or groups")
                    elif kind in GROUP_KINDS:
                        g = v["group"]
                        lanes = kind == "kanban"
                        if not isinstance(g, str) or not g:
                            out.append(f"{name}: `group` is not an item key (got {json_of(g)}) — the key whose values are the "
                                       + ("lanes" if lanes else "groups"))
                        elif item_keys and g not in item_keys:
                            out.append(f"{name}: group `{g}` — no item carries that key, so "
                                       + ("the board would be one lane" if lanes else "every row would sit in one group"))
                read_table_rules(v, out, "filter", name)
    if not is_list(raw.get("items")):
        out.append("no `items` — the list itself; `items: []` is an empty one")
        return out
    doc = parse(text)
    columns = [c.lower() for c in (doc.columns or [])]
    seen: set[str] = set()
    edges: list[tuple[str, list[Any]]] = []
    parents: list[tuple[str, Any]] = []
    for i, it in enumerate(raw["items"]):
        where = f"item {i + 1}"
        if not is_obj(it):
            out.append(f"{where}: not a mapping — the item's fields")
            continue
        id_ = _id_text(it.get(fields["id"]))
        name = f"item {id_}" if id_ else where
        if not id_:
            out.append(f"{where}: no `{fields['id']}` — what identifies the item, and what `{fields.get('previous', 'previous')}` names")
            continue
        if id_ in seen:
            out.append(f"{name}: id used twice — an id is identity, and a second item with it is dropped")
            continue
        seen.add(id_)
        if defined(get(it, fields["title"])) and not isinstance(it[fields["title"]], str):
            out.append(f"{name}: `{fields['title']}` is not text (got {json_of(it[fields['title']])})")
        if "status" in fields and defined(get(it, fields["status"])):
            s = it[fields["status"]]
            if not isinstance(s, str):
                out.append(f"{name}: `{fields['status']}` is not text (got {json_of(s)})")
            elif columns and s.lower() not in columns:
                out.append(f"{name}: status `{s}` is not a column — it would land in the first column; columns are {', '.join(doc.columns or [])}")
        # A start with no time is the start of its day and an end with none the end of its day, so a day and a
        # time on it compare as the moments they stand for.
        start = end = None
        for role in ("start", "end"):
            if role in fields and defined(get(it, fields[role])):
                v = it[fields[role]]
                d = as_date(v)
                if not d:
                    out.append(f"{name}: `{fields[role]}` is not a date — write `YYYY-MM-DD`, or `YYYY-MM-DD HH:MM` for a "
                               f"time (got {json_of(v)})")
                    continue
                t = as_time(v)
                if isinstance(v, str) and not t and _CLOCK_LIKE.match(v):
                    out.append(f"{name}: `{fields[role]}` has a time the calendar cannot read — write `YYYY-MM-DD HH:MM`, "
                               f"on a 24-hour clock and in no zone (got {json_of(v)})")
                elif isinstance(v, _dt.datetime) and v.utcoffset():
                    out.append(f"{name}: `{fields[role]}` {v.isoformat()} is written in a zone — the calendar reads it in "
                               f"UTC, as {when_text(d, t)}; write the time it shows, `{v.strftime('%Y-%m-%d %H:%M')}`")
                when = (d, t or ("00:00" if role == "start" else "24:00"), when_text(d, t))
                if role == "start":
                    start = when
                else:
                    end = when
        if start and end and end[:2] < start[:2]:
            out.append(f"{name}: `{fields['end']}` {end[2]} is before `{fields['start']}` {start[2]}")
        if "previous" in fields and defined(get(it, fields["previous"])):
            p = it[fields["previous"]]
            if not (isinstance(p, (str, int)) or (is_list(p) and all(isinstance(x, (str, int)) for x in p))) or isinstance(p, bool):
                out.append(f"{name}: `{fields['previous']}` is not an id or a list of ids (got {json_of(p)})")
            else:
                edges.append((id_, [p] if not is_list(p) else p))
        if "parent" in fields and defined(get(it, fields["parent"])):
            p = it[fields["parent"]]
            if not _id_text(p):
                out.append(f"{name}: `{fields['parent']}` is not an id (got {json_of(p)}) — one item this one is part of")
            else:
                parents.append((id_, _id_text(p)))
        out.extend(f"{name}: {p}" for p in content_problems(it, "an item", "a views document", "brief, md, playbook"))
    for id_, prev in edges:
        for p in prev:
            p_text = _id_text(p)
            if not p_text:
                out.append(f"item {id_}: a `{fields['previous']}` entry is empty")
            elif p_text == id_:
                out.append(f"item {id_}: comes after itself")
            elif p_text not in seen:
                out.append(f"item {id_}: after `{p_text}` — no item has that id")
    for id_, p in parents:
        if p == id_:
            out.append(f"item {id_}: is its own parent")
        elif p not in seen:
            out.append(f"item {id_}: parent `{p}` — no item has that id")
    layer = layers(doc.items)
    cyclic = [it.id for it in doc.items if it.id not in layer]
    if cyclic:
        out.append(f"cycle: {' → '.join(cyclic)} — items that come after each other cannot be ordered")
    nested = parent_cycle(doc.items)
    if nested:
        out.append(f"parent cycle: {' → '.join(nested)} — items inside each other have no top")
    if not cyclic and not nested:
        looped = unplaced(doc.items)
        if looped:
            out.append(f"part and whole out of order: {' → '.join(looped)} — a part cannot come after its own whole, "
                       "or after what comes after it, nor a whole after its own part")
    return out


def summary(doc: Views) -> str:
    written = sum(1 for it in doc.items if it.content and it.content["kind"])
    n = plural(len(doc.items), 'item') + (f", {plural(written, 'document')}" if written else "")
    if doc.views is None:
        views = []
        for v in available_views(doc):
            views.append(f"kanban ({plural(len(columns_of(doc)), 'column')})" if v.kind == "kanban" else v.kind)
        return f"{n} · {', '.join(views)}"
    parts = []
    for v in doc.views:
        rows = rows_of_view(doc, v)
        kind = v.kind
        if v.kind == "kanban":
            kind = f"kanban, {plural(len(columns_of(doc)), 'column')}"
            if v.group:
                kind += f", {plural(len(lanes_of(v, rows)), 'lane')}"
        elif v.group:
            kind += f", {plural(len(lanes_of(v, top_items(rows))), 'group')}"
        shown = len(rows)
        parts.append(f"{v.key} ({kind}) {shown}" if shown != len(doc.items) else f"{v.key} ({kind})")
    return f"{n} · views: {', '.join(parts) or 'none'}"


def check(text: str) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    doc = parse(text)
    out = problems(text)
    for it in doc.items:
        out.extend(written_doc_problems(f"item {it.id}", it.content))
    return CheckResult(out, summary(doc))
