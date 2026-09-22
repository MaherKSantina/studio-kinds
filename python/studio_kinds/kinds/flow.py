"""`.flow` — a walkthrough whose screens and edges are PARAMETERISED: `dimensions` (named, finite,
ordered value sets), `derived` dimensions (first-match-wins rules), `screens` with `variants` over
that space and `edges` (unconditional `to`, or a `dispatch` of when/to branches; `sets` writes
dimension values), `entries` (start events), `sources` for file panels. The `when` grammar: a bare
value equals, `[a, b]` one-of, `"*"` any, `"!x"` not-equal; a LIST of mappings is alternatives.

FILE SHAPE: two YAML documents separated by a line that is exactly `---`. Doc 1 is the model
(hand-authored); doc 2 the views (saved parameter sets and layout) — checked structurally only.

The check is `validate_flow_file`: every rule the Studio's flow validator applied, the first 40.
"""
from __future__ import annotations

import re
from typing import Any

from .. import _yaml
from .._js import MISSING, arr, defined, get, is_bool, is_list, is_num, is_obj, is_str, js_str, json_of, rec, key_of
from . import CheckResult


def _as_str(v: Any) -> str:
    return v if is_str(v) else "" if (v is None or v is MISSING) else js_str(v)


def _clean(v: Any) -> str:
    return _as_str(v).strip()


def _objects(v: Any) -> list[dict]:
    return [x for x in v if is_obj(x)] if is_list(v) else []


def _is_scalar(v: Any) -> bool:
    return is_str(v) or is_num(v) or is_bool(v)


def split_file(content: str) -> tuple[str, str]:
    """The model doc and the views doc, split on the FIRST bare `---` line."""
    lines = content.replace("\r\n", "\n").split("\n")
    for i, line in enumerate(lines):
        if re.match(r"^---\s*$", line):
            return "\n".join(lines[:i]), "\n".join(lines[i + 1:])
    return content, ""


def _read_sources(raw: Any) -> list[str]:
    if is_list(raw):
        return [n for n in (_clean(s.get("name")) for s in _objects(raw)) if n]
    if is_obj(raw):
        return [str(n) for n in raw.keys() if str(n)]
    return []


Domain = dict[str, set]


def _validate_when(raw: Any, dims: Domain, where: str, problems: list[str]) -> None:
    if raw is MISSING or raw == "*":
        return
    if is_list(raw):
        if not raw:
            problems.append(f'{where} is an empty list of alternatives; write "*" for "always".')
            return
        for i, group in enumerate(raw):
            if group != "*" and not is_obj(group):
                problems.append(f"{where}[{i}] must be a mapping of dimension → value: a list `when` is a list of ALTERNATIVE conditions, not a list of values.")
                continue
            _validate_when(group, dims, f"{where}[{i}]", problems)
        return
    if not is_obj(raw):
        problems.append(f'{where} must be a mapping of dimension → value, a list of such mappings, or the string "*".')
        return
    for dim, cond in raw.items():
        domain = dims.get(str(dim))
        if domain is None:
            problems.append(f"{where}.{dim} is not a declared dimension.")
            continue

        def check(val: Any) -> None:
            if is_str(val) and (val == "*" or val.startswith("!")):
                return
            if not _is_scalar(val):
                problems.append(f"{where}.{dim} has a non-scalar value.")
                return
            if key_of(val) not in domain:
                problems.append(f'{where}.{dim} value "{js_str(val)}" is not in dimension "{dim}".')

        if is_list(cond):
            for c in cond:
                check(c)
        else:
            check(cond)


def _validate_sets(raw: Any, dims: Domain, where: str, problems: list[str]) -> None:
    if raw is MISSING:
        return
    if not is_obj(raw):
        problems.append(f"{where} must be a mapping of dimension → value.")
        return
    for dim, val in raw.items():
        domain = dims.get(str(dim))
        if domain is None:
            problems.append(f"{where}.{dim} is not a declared dimension.")
            continue
        if not _is_scalar(val):
            problems.append(f"{where}.{dim} must be a scalar.")
            continue
        if key_of(val) not in domain:
            problems.append(f'{where}.{dim} value "{js_str(val)}" is not in dimension "{dim}".')


def _validate_content(raw: dict, where: str, sources: set[str], problems: list[str]) -> None:
    if defined(get(raw, "screenshot")) and not is_str(raw["screenshot"]):
        problems.append(f"{where}.screenshot must be a string Storage key.")
    if defined(get(raw, "screenshots")) and (not is_list(raw["screenshots"]) or any(not is_str(k) for k in raw["screenshots"])):
        problems.append(f"{where}.screenshots must be an array of string Storage keys, ordered top→bottom.")
    if not defined(get(raw, "content")):
        return
    if not is_list(raw["content"]):
        problems.append(f"{where}.content must be an array of panels (`{{ screenshot: <key> }}` or `{{ file: <path> }}`).")
        return
    for i, item in enumerate(raw["content"]):
        cw = f"{where}.content[{i}]"
        if is_str(item):
            if not item.strip():
                problems.append(f"{cw} is an empty screenshot key.")
            continue
        if not is_obj(item):
            problems.append(f"{cw} must be a string Storage key or an object.")
            continue
        has_file = _clean(item.get("file")) != ""
        has_shot = _clean(item.get("screenshot")) != ""
        if has_file and has_shot:
            problems.append(f"{cw} sets both `file` and `screenshot` — a panel is one or the other.")
        elif not has_file and not has_shot:
            problems.append(f"{cw} needs a `file` (another file to render) or a `screenshot` (a Storage key).")
        if defined(get(item, "label")) and not is_str(item["label"]):
            problems.append(f"{cw}.label must be a string.")
        if not has_file:
            for k in ("source", "agent"):
                if defined(get(item, k)):
                    problems.append(f"{cw}.{k} only applies to a `file` panel.")
            continue
        src = _clean(item.get("source"))
        if src and src not in sources:
            problems.append(f'{cw}.source "{src}" is not a declared source. Add it under top-level `sources:`.')
        if defined(get(item, "agent")) and not is_str(item["agent"]):
            problems.append(f"{cw}.agent must be a directory agent uuid.")


def _scalars(values: Any) -> set:
    return {key_of(v) for v in arr(values) if _is_scalar(v)}


def _validate_body(doc: dict, prefix: str, problems: list[str]) -> None:
    for key in ("title", "description"):
        if defined(get(doc, key)) and not is_str(doc[key]):
            problems.append(f"{prefix}`{key}` must be a string.")
    sm = get(doc, "start_mode")
    if defined(sm) and sm not in ("screen", "entries"):
        problems.append(f"{prefix}`start_mode` must be `screen` or `entries`.")

    source_names: set[str] = set()
    if defined(get(doc, "sources")):
        if not is_list(doc["sources"]) and not is_obj(doc["sources"]):
            problems.append(f"{prefix}`sources` must be an array of `{{ name, path }}` or a mapping of name → path.")
        else:
            for name in _read_sources(doc["sources"]):
                if name in source_names:
                    problems.append(f'{prefix}`sources` names "{name}" twice.')
                source_names.add(name)
            if is_list(doc["sources"]) and len(_objects(doc["sources"])) != len(doc["sources"]):
                problems.append(f"{prefix}`sources` entries must be objects with a `name`.")
    default_source = _clean(get(doc, "default_source")) if defined(get(doc, "default_source")) else ""
    if default_source and default_source not in source_names:
        problems.append(f'{prefix}`default_source` "{default_source}" is not a declared source.')

    dims: Domain = {}
    if defined(get(doc, "dimensions")):
        if not is_obj(doc["dimensions"]):
            problems.append(f"{prefix}`dimensions` must be a mapping of name → value list.")
        else:
            for name, values in doc["dimensions"].items():
                if not is_list(values) or not values:
                    problems.append(f"{prefix}dimensions.{name} must be a non-empty array of scalars.")
                    continue
                if any(not _is_scalar(v) for v in values):
                    problems.append(f"{prefix}dimensions.{name} must contain only scalars.")
                dims[str(name)] = _scalars(values)

    if defined(get(doc, "derived")):
        if not is_list(doc["derived"]):
            problems.append(f"{prefix}`derived` must be an array.")
        else:
            for i, raw in enumerate(doc["derived"]):
                where = f"{prefix}derived[{i}]"
                if not is_obj(raw):
                    problems.append(f"{where} must be an object.")
                    continue
                name = _clean(raw.get("name"))
                if not name:
                    problems.append(f"{where}.name is required.")
                    continue
                if name in dims:
                    problems.append(f'{where}.name "{name}" is already a declared dimension.')
                if not is_list(get(raw, "values")) or not raw["values"]:
                    problems.append(f"{where}.values must be a non-empty array of scalars.")
                dims[name] = _scalars(get(raw, "values")) if is_list(get(raw, "values")) else set()
            for i, raw in enumerate(doc["derived"]):
                if not is_obj(raw):
                    continue
                where = f"{prefix}derived[{i}]"
                domain = dims.get(_clean(raw.get("name")), set())
                if defined(get(raw, "rules")) and not is_list(raw["rules"]):
                    problems.append(f"{where}.rules must be an array.")
                    continue
                for j, rule in enumerate(_objects(get(raw, "rules"))):
                    rw = f"{where}.rules[{j}]"
                    _validate_when(get(rule, "when"), dims, f"{rw}.when", problems)
                    v = get(rule, "value")
                    if is_str(v) and v.startswith("="):
                        src = v[1:].strip()
                        if src not in dims:
                            problems.append(f'{rw}.value "= {src}" does not name a dimension.')
                    elif not _is_scalar(v):
                        problems.append(f'{rw}.value must be a scalar or "= <dimension>".')
                    elif key_of(v) not in domain:
                        problems.append(f'{rw}.value "{js_str(v)}" is not in "{_clean(raw.get("name"))}".')

    _validate_sets(get(doc, "defaults"), dims, f"{prefix}defaults", problems)

    if defined(get(doc, "edges")):
        problems.append(f"{prefix}`edges` is no longer a top-level key — a control belongs to the screen it sits on. Move each edge into that screen's `edges` array and drop its `from`.")

    screens = get(doc, "screens")
    screen_ids: set[str] = set()
    screen_titles: set[str] = set()
    screen_locals: dict[str, Domain] = {}
    if not is_list(screens):
        if defined(screens):
            problems.append(f"{prefix}`screens` must be an array.")
    else:
        for i, raw in enumerate(screens):
            where = f"{prefix}screens[{i}]"
            if not is_obj(raw):
                problems.append(f"{where} must be an object.")
                continue
            id_ = raw["id"] if is_str(get(raw, "id")) else ""
            if not id_.strip():
                problems.append(f"{where}.id is required (a unique non-empty string).")
            elif id_ in screen_ids:
                problems.append(f'{where}.id "{id_}" is duplicated.')
            else:
                screen_ids.add(id_)
            title = raw["title"] if is_str(get(raw, "title")) else ""
            if not title.strip():
                problems.append(f"{where}.title is required (a non-empty string).")
            elif title in screen_titles:
                problems.append(f'{where}.title "{title}" is duplicated; screen titles must be unique.')
            else:
                screen_titles.add(title)
            own: Domain = {}
            if defined(get(raw, "locals")):
                if not is_obj(raw["locals"]):
                    problems.append(f"{where}.locals must be a mapping of name → value list.")
                else:
                    for name, values in raw["locals"].items():
                        if str(name) in dims:
                            problems.append(f"{where}.locals.{name} is already a global dimension — rename one of them.")
                            continue
                        if not is_list(values) or not values:
                            problems.append(f"{where}.locals.{name} must be a non-empty array of scalars.")
                            continue
                        if any(not _is_scalar(v) for v in values):
                            problems.append(f"{where}.locals.{name} must contain only scalars.")
                        own[str(name)] = _scalars(values)
            if id_.strip():
                screen_locals[id_] = own
            _validate_sets(get(raw, "local_defaults"), own, f"{where}.local_defaults", problems)

        for i, raw in enumerate(screens):
            where = f"{prefix}screens[{i}]"
            if not is_obj(raw):
                continue
            id_ = raw["id"] if is_str(get(raw, "id")) else ""
            scoped = {**dims, **screen_locals.get(id_, {})}
            if defined(get(raw, "description")) and not is_str(raw["description"]):
                problems.append(f"{where}.description must be a string.")
            _validate_content(raw, where, source_names, problems)
            if defined(get(raw, "variants")):
                if not is_list(raw["variants"]):
                    problems.append(f"{where}.variants must be an array.")
                else:
                    for j, v in enumerate(raw["variants"]):
                        vw = f"{where}.variants[{j}]"
                        if not is_obj(v):
                            problems.append(f"{vw} must be an object.")
                            continue
                        if not is_str(get(v, "label")) or not v["label"].strip():
                            problems.append(f"{vw}.label is required (a non-empty string).")
                        _validate_when(get(v, "when"), scoped, f"{vw}.when", problems)
                        _validate_content(v, vw, source_names, problems)

    initial = doc["initial"] if is_str(get(doc, "initial")) else ""
    if initial and initial not in screen_ids:
        problems.append(f'{prefix}`initial` "{initial}" does not match any screen id.')

    def with_target_locals(scoped: Domain, targets: set[str]) -> Domain:
        out = dict(scoped)
        for t in targets:
            for k, v in screen_locals.get(t, {}).items():
                if k not in out:
                    out[k] = v
        return out

    def check_targets(raw: dict, where: str, scoped: Domain, allow_stay: bool) -> None:
        to = get(raw, "to")
        has_to = bool(is_str(to) and to.strip())
        dispatch = get(raw, "dispatch")
        has_dispatch = is_list(dispatch) and len(dispatch) > 0
        if has_to and has_dispatch:
            problems.append(f"{where} has both `to` and `dispatch` — use one. `to` is unconditional; `dispatch` branches on parameters.")
        if not has_to and not has_dispatch and not allow_stay:
            problems.append(f"{where} needs either `to` (a screen id) or `dispatch` (a list of when/to branches).")
        if has_to and _as_str(to) not in screen_ids:
            problems.append(f'{where}.to "{_as_str(to)}" does not match any screen id.')
        targets: set[str] = set()
        if has_to:
            targets.add(_as_str(to))
        if defined(dispatch) and not is_list(dispatch):
            problems.append(f"{where}.dispatch must be an array of {{ when, to }} branches.")
        else:
            for k, b in enumerate(_objects(dispatch)):
                bw = f"{where}.dispatch[{k}]"
                _validate_when(get(b, "when"), scoped, f"{bw}.when", problems)
                bto = _as_str(get(b, "to")) if defined(get(b, "to")) else ""
                if bto.strip() and bto not in screen_ids:
                    problems.append(f'{bw}.to "{bto}" does not match any screen id.')
                elif not bto.strip() and not allow_stay:
                    problems.append(f"{bw}.to is required (a screen id).")
                if bto.strip():
                    targets.add(bto)
                _validate_sets(get(b, "sets"), with_target_locals(scoped, targets), f"{bw}.sets", problems)
        _validate_sets(get(raw, "sets"), with_target_locals(scoped, targets), f"{where}.sets", problems)

    entries = get(doc, "entries")
    entry_ids: set[str] = set()
    entry_labels: set[str] = set()
    if defined(entries) and not is_list(entries):
        problems.append(f"{prefix}`entries` must be an array.")
    elif is_list(entries):
        for i, raw in enumerate(entries):
            where = f"{prefix}entries[{i}]"
            if not is_obj(raw):
                problems.append(f"{where} must be an object.")
                continue
            id_ = raw["id"] if is_str(get(raw, "id")) else ""
            event = raw["event"] if is_str(get(raw, "event")) else ""
            if not id_.strip():
                problems.append(f"{where}.id is required (a unique non-empty string).")
            elif id_ in entry_ids:
                problems.append(f'{where}.id "{id_}" is duplicated.')
            else:
                entry_ids.add(id_)
            if not event.strip():
                problems.append(f"{where}.event is required (a non-empty string).")
            elif event in entry_labels:
                problems.append(f'{where} duplicates start event "{event}".')
            else:
                entry_labels.add(event)
            check_targets(raw, where, dims, False)

    edge_ids: set[str] = set()
    if is_list(screens):
        for i, sraw in enumerate(screens):
            if not is_obj(sraw):
                continue
            sid = sraw["id"] if is_str(get(sraw, "id")) else ""
            scoped = {**dims, **screen_locals.get(sid, {})}
            swhere = f"{prefix}screens[{i}]"
            if not defined(get(sraw, "edges")):
                continue
            if not is_list(sraw["edges"]):
                problems.append(f"{swhere}.edges must be an array of controls.")
                continue
            by_event: dict[str, list[str]] = {}
            for j, raw in enumerate(sraw["edges"]):
                where = f"{swhere}.edges[{j}]"
                if not is_obj(raw):
                    problems.append(f"{where} must be an object.")
                    continue
                if defined(get(raw, "from")):
                    problems.append(f"{where}.from is not a field any more — a control's screen is where it is written.")
                id_ = raw["id"] if is_str(get(raw, "id")) else ""
                event = raw["event"] if is_str(get(raw, "event")) else ""
                if not id_.strip():
                    problems.append(f"{where}.id is required (a unique non-empty string).")
                elif id_ in edge_ids:
                    problems.append(f'{where}.id "{id_}" is duplicated.')
                else:
                    edge_ids.add(id_)
                if not event.strip():
                    problems.append(f"{where}.event is required (a non-empty string).")
                if defined(get(raw, "description")) and not is_str(raw["description"]):
                    problems.append(f"{where}.description must be a string.")
                _validate_when(get(raw, "when"), scoped, f"{where}.when", problems)
                check_targets(raw, where, scoped, True)
                if event.strip():
                    seen = by_event.setdefault(event, [])
                    w = get(raw, "when")
                    key = json_of({} if (w is MISSING or w is None) else w)
                    if key in seen:
                        problems.append(f'{where} repeats event "{event}" with the same `when` as an earlier control on this screen. Give them different conditions, or branch one with `dispatch`.')
                    seen.append(key)


def validate_flow(doc: Any) -> list[str]:
    if not is_obj(doc):
        return ["doc must be a mapping with `screens` and `edges` arrays."]
    problems: list[str] = []
    _validate_body(doc, "", problems)
    if defined(get(doc, "version_name")) and not is_str(doc["version_name"]):
        problems.append("`version_name` must be a string.")
    if defined(get(doc, "versions")):
        if not is_list(doc["versions"]):
            problems.append("`versions` must be an array of version snapshots.")
        else:
            for i, raw in enumerate(doc["versions"]):
                where = f"versions[{i}]"
                if not is_obj(raw):
                    problems.append(f"{where} must be an object.")
                    continue
                if defined(get(raw, "name")) and not is_str(raw["name"]):
                    problems.append(f"{where}.name must be a string.")
                _validate_body(raw, f"{where}.", problems)
    return problems[:40]


def _dimension_names(doc: Any) -> set[str]:
    d = rec(doc)
    names = [str(k) for k, v in rec(get(d, "dimensions")).items() if is_list(v)]
    names += [_as_str(x.get("name")) for x in _objects(get(d, "derived"))]
    return set(names)


def validate_flow_file(content: str) -> list[str]:
    """Validate the whole two-document file. Views are checked structurally only."""
    model_text, views_text = split_file(content)
    try:
        doc = _yaml.load(model_text) if model_text.strip() else {}
    except _yaml.YamlError as e:
        return [f"model YAML parse error: {e}"]
    problems = validate_flow(doc)
    if views_text.strip():
        try:
            views = _yaml.load(views_text)
        except _yaml.YamlError as e:
            problems.append(f"views YAML parse error: {e}")
            return problems[:40]
        if not is_obj(views):
            problems.append("views doc must be a mapping with `active` and `views`.")
        else:
            known = _dimension_names(doc)
            if defined(get(views, "views")) and not is_list(views["views"]):
                problems.append("views.`views` must be an array.")
            else:
                ids: set[str] = set()
                for i, v in enumerate(_objects(get(views, "views"))):
                    where = f"views[{i}]"
                    if not is_str(get(v, "id")) or not v["id"].strip():
                        problems.append(f"{where}.id is required.")
                    else:
                        ids.add(v["id"])
                    layout = v["layout"] if is_obj(get(v, "layout")) else {}
                    if defined(get(layout, "params")):
                        if not is_obj(layout["params"]):
                            problems.append(f"{where}.layout.params must be a mapping of dimension → value.")
                        else:
                            for dim in layout["params"].keys():
                                if str(dim) not in known:
                                    problems.append(f"{where}.layout.params.{dim} is not a declared dimension.")
                active = _clean(get(views, "active")) if defined(get(views, "active")) else ""
                if active and ids and active not in ids:
                    problems.append(f'views.`active` "{active}" does not match a view id.')
    return problems[:40]


def check(text: str, file: str | None = None) -> CheckResult:
    model_text, _ = split_file(text)
    try:
        parsed = _yaml.load(model_text) if model_text.strip() else {}
    except _yaml.YamlError as e:
        return CheckResult([f"model YAML parse error: {e}"])
    if parsed is not None and not is_obj(parsed):
        return CheckResult(["model YAML parse error: expected a mapping at the top level"])
    doc = rec(parsed)
    problems = validate_flow_file(text)
    screens = _objects(get(doc, "screens"))
    states = sum(len(_objects(get(s, "variants"))) for s in screens)
    frames = sum(1 for v in rec(get(doc, "frames")).values() if is_obj(v))
    return CheckResult(problems, f"{len(screens)} screens, {states} states" + (f", {frames} inline frames" if frames else ""))
