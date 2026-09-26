"""`.views` — one list of items in the file and the views over it. `items` are mappings, each with an id;
`fields` says which item key plays which ROLE — `id`, `title`, `status`, `start`, `end`, `previous`,
`parent` — and `views` says which views the file offers, each over the items its own `filter` keeps.
Without `views`, the roles decide: a table always; a kanban when a key is the `status`; a calendar when
a key is the `start` (the `end` too, when there is one); a gantt when `start`, `end` and `previous` or
`parent` are named; a dependency tree when `previous` is. A page is a view the file names with a Nunjucks
`template` of its own: it renders the view's items as HTML, the way a `.page` renders its model, and the
roles never offer one. The views are read: nothing on the page writes the file, and which view is open
is kept for the session only.

    title: Launch
    description: one line
    fields:                # item key → role; a role absent means the views that need it are absent
      id: id               # what identifies an item (default `id`)
      title: title         # what an item is labelled by (default `title`)
      status: status       # a kanban column                     → Kanban
      start: start         # a date, YYYY-MM-DD                  → Calendar; with `end` and `previous` or `parent`, Gantt
      end: end             # a date
      previous: after      # the id(s) of what comes before      → Tree; with the dates, Gantt
      parent: under        # the id of the item this one is part of — the gantt nests it there
    columns: [To do, Doing, Done]   # the statuses in order; absent = the values found, first seen first
    views:                 # optional — absent = every view the roles allow, the table first
      - key: open
        kind: kanban       # table | kanban | calendar | gantt | tree | page
        label: Open work
        filter: [{field: status, op: not_equals, value: Done}]   # the suite's clause vocabulary
        sort: [{field: start, dir: asc}]
      - key: plan
        kind: gantt
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
      - id: build
        title: Build it
        status: Doing
        start: 2026-10-04
        end: 2026-10-10
        after: plan          # one id, or a list
      - id: build-api
        title: The API
        status: Doing
        start: 2026-10-04
        end: 2026-10-07
        under: build         # a child of `build`

A date is `YYYY-MM-DD`, bare or quoted. `previous` is one id or a list of ids, `parent` one id, every one
an item of this file. A view's `filter` is clauses over the items' own keys (`equals`, `not_equals`,
`contains`, `gt`, `between`, `in`, `is_empty`, … — one value or a list); `sort` is `{field, dir}`, first
key first; `limit` caps the rows. Every other key an item carries is shown as it is — in the table's
columns and in the item's dialog. A page view's template is handed `items` — the view's items after its
filter, sort and limit, each a mapping of its own keys as written, a date as `YYYY-MM-DD` — with `title`
(the document's), `fields` (the role → key map, defaults filled), `columns` (the kanban's) and `view` (its
`key` and `label`); its `partials` are the templates its `include`, `import`, `from` and `extends` name.

The check names what the lenient reader dropped or defaulted: not a mapping, no `title`, `fields` that is
not a mapping, a role that is not one of the seven or mapped to something that is not a key name,
`columns` that is not a list of text, `views` that is not a list, a view without a key or a kind, a key
used twice, a kind that is not one of the six or whose roles are not named, a page view whose
`template` is missing, not text or blank, whose `partials` are not a mapping of text, or whose templates
name a partial it does not hold, a `template` or `partials` on a view that is not a page, a clause
without a field or with an op outside the vocabulary, `items` that is not a list, an item that is not a mapping or has
no id, an id used twice, a status that is not a column when columns are given, a start or end that is
not a date, an end before its start, a `previous` that is not an id or a list of ids, a `parent` that is
not an id, one naming no item or the item itself, and items caught in a cycle.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .. import _yaml
from .._js import as_str, defined, get, is_list, is_obj, js_str, json_of, plural
from .._rows import TableRules, apply_table, read_table_rules
from . import CheckResult
from .kanban import as_date
from .page import template_problems

ROLES: tuple[str, ...] = ("id", "title", "status", "start", "end", "previous", "parent")
"""The roles an item key can play, and the only keys `fields` takes."""

VIEW_KINDS: tuple[str, ...] = ("table", "kanban", "calendar", "gantt", "tree", "page")
"""The views a file can name."""

ROLE_VIEWS: tuple[str, ...] = ("table", "kanban", "calendar", "gantt", "tree")
"""The views the roles allow, in the order the page offers them when the file names none — a page is a
view only a file names, with its template."""

DEFAULT_FIELDS: dict[str, str] = {"id": "id", "title": "title"}


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
    if kind == "tree":
        return "previous" in fields
    return False


def view_needs(kind: str) -> str:
    """What a view of this kind needs under `fields`, in words — for the checker's line."""
    return {"table": "nothing", "page": "nothing", "kanban": "a `status` role", "calendar": "a `start` role",
            "gantt": "`start`, `end` and `previous` or `parent` roles", "tree": "a `previous` role"}.get(kind, "")


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
        previous = [p for p in _ids(it.get(fields["previous"])) if p != id_] if "previous" in fields else []
        parent = _id_text(it.get(fields["parent"])) if "parent" in fields else ""
        items.append(Item(id_, title, dict(it), status or None, start or None, end or None, previous,
                          parent if parent and parent != id_ else None))
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


def available_views(doc: Views) -> list[View]:
    """The views the file offers: its own, else one of every kind the roles allow, the table first."""
    if doc.views is not None:
        return doc.views
    return [View(k, k, k.capitalize()) for k in ROLE_VIEWS if view_offered(k, doc.fields)]


def rows_of_view(doc: Views, view: View) -> list[Item]:
    """The items a view shows — its filter, sort and limit applied over the items' own fields."""
    by_row = {id(it.fields): it for it in doc.items}
    kept = apply_table(TableRules(view.rules.where, view.rules.sort, None, [], view.rules.limit), [it.fields for it in doc.items]).rows
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
        start = end = ""
        for role in ("start", "end"):
            if role in fields and defined(get(it, fields[role])):
                v = it[fields[role]]
                d = as_date(v)
                if not d:
                    out.append(f"{name}: `{fields[role]}` is not a date — write `YYYY-MM-DD` (got {json_of(v)})")
                elif role == "start":
                    start = d
                else:
                    end = d
        if start and end and end < start:
            out.append(f"{name}: `{fields['end']}` {end} is before `{fields['start']}` {start}")
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
    return out


def summary(doc: Views) -> str:
    n = plural(len(doc.items), 'item')
    if doc.views is None:
        views = []
        for v in available_views(doc):
            views.append(f"kanban ({plural(len(columns_of(doc)), 'column')})" if v.kind == "kanban" else v.kind)
        return f"{n} · {', '.join(views)}"
    parts = []
    for v in doc.views:
        kind = f"kanban, {plural(len(columns_of(doc)), 'column')}" if v.kind == "kanban" else v.kind
        shown = len(rows_of_view(doc, v))
        parts.append(f"{v.key} ({kind}) {shown}" if shown != len(doc.items) else f"{v.key} ({kind})")
    return f"{n} · views: {', '.join(parts) or 'none'}"


def check(text: str) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    return CheckResult(problems(text), summary(parse(text)))
