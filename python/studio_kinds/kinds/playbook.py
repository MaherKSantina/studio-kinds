"""`.playbook` — where we are, what can happen, and what is true while it does.

DECISIONS are the state space (an assignment of answers, never enumerated; an answer can
`activate` further decisions). EVENTS are what can happen. Version 1 adds TOPICS and RULES and
keeps content as FILES beside the book (`{file, label?, by?}`, a `by` file varying as
`<file>.variants/<decision=answer,...>.<ext>`); version 2 writes ONE document into each event
(`content: {kind, doc}` or `{kind, by, docs}`), carries `when` and `hint` on the event, and its
walk is session-only. `version: N` at the top says which; absent means 1.

The check runs, in order: the YAML; the version (`version_problems` — what the file's version
cannot carry, named so the author moves it rather than losing it); keys the format no longer has
(`legacy_problems`); `by` decisions that are not decisions of the book; what a written entry cannot
be (`inline_problems`); the `by` files a version-1 entry expects beside the book; and every written
document through its own kind's engine.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from itertools import product
from typing import Any

from .. import _yaml
from .._decisions import ref_of
from .._js import arr, get, is_integer, is_list, is_str, js_str, present, rec, slug_key, trimmed
from . import KINDS, CheckResult, check_written, written_kind

LATEST = 2


@dataclass
class Content:
    key: str | None = None
    label: str | None = None
    file: str | None = None
    by: list[str] = field(default_factory=list)
    kind: str | None = None
    doc: Any = None
    has_doc: bool = False
    docs: dict | None = None


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
class Event:
    key: str
    label: str
    content: list[Content]


@dataclass
class Topic:
    key: str
    label: str
    content: list[Content]


@dataclass
class Playbook:
    version: int
    decisions: list[Decision]
    events: list[Event]
    topics: list[Topic]


def _str(x: Any) -> str | None:
    return trimmed(x)


def _refs(x: Any) -> list[str]:
    return [s for s in (_str(r) for r in arr(x)) if s]


def _raw_inline(o: dict) -> bool:
    return present(get(o, "doc")) or present(get(o, "docs"))


def _raw_one(x: Any) -> dict:
    return rec(x[0] if is_list(x) and x else x)


def read_version(raw: dict, kind: str, latest: int) -> tuple[int, str | None]:
    """`version:` off a parsed root, against the versions a kind has: `(version, problem)`."""
    v = get(raw, "version")
    if not present(v):
        return 1, None
    if not is_integer(v) or v < 1:
        return latest, f"`version: {js_str(v)}` is not a whole number from 1 — read as version {latest}"
    if v > latest:
        return latest, f"`version: {js_str(v)}` — this Studio knows {kind} up to version {latest}; read as {latest}, so newer content may not show"
    return int(v), None


def _parse_content(x: Any, version: int) -> list[Content]:
    if version >= 2:
        o = _raw_one(x)
        if not _raw_inline(o) or _str(get(o, "file")):
            return []
        c = Content(key=_str(get(o, "key")), label=_str(get(o, "label")))
        kind = _str(get(o, "kind"))
        if kind:
            c.kind = written_kind(kind)
        c.by = _refs(get(o, "by"))
        if present(get(o, "doc")):
            c.doc, c.has_doc = o["doc"], True
        if present(get(o, "docs")):
            c.docs = rec(o["docs"])
        return [c]
    out: list[Content] = []
    for e in arr(x):
        o = rec(e)
        file = _str(get(o, "file"))
        if not file:
            continue
        out.append(Content(label=_str(get(o, "label")), file=file, by=_refs(get(o, "by"))))
    return out


def parse(text: str) -> Playbook:
    raw = rec(_yaml.load_or_none(text))
    version, _ = read_version(raw, "playbook", LATEST)
    decisions: list[Decision] = []
    for i, d in enumerate(arr(get(raw, "decisions"))):
        o = rec(d)
        label = _str(get(o, "label")) or _str(get(o, "key")) or f"Decision {i + 1}"
        values: list[Value] = []
        for j, v in enumerate(arr(get(o, "values"))):
            w = rec(v)
            vl = _str(get(w, "label")) or _str(get(w, "key")) or f"Answer {j + 1}"
            values.append(Value(key=_str(get(w, "key")) or slug_key(vl), label=vl))
        decisions.append(Decision(key=_str(get(o, "key")) or slug_key(label), label=label, values=values))
    events: list[Event] = []
    for i, e in enumerate(arr(get(raw, "events"))):
        o = rec(e)
        label = _str(get(o, "label")) or _str(get(o, "key")) or f"Event {i + 1}"
        events.append(Event(key=_str(get(o, "key")) or slug_key(label), label=label,
                            content=_parse_content(get(o, "content"), version)))
    topics: list[Topic] = []
    if version < 2:
        for i, t in enumerate(arr(get(raw, "topics"))):
            o = rec(t)
            label = _str(get(o, "label")) or _str(get(o, "key")) or f"Topic {i + 1}"
            topics.append(Topic(key=_str(get(o, "key")) or slug_key(label), label=label,
                                content=_parse_content(get(o, "content"), version)))
    return Playbook(version, decisions, events, topics)


def legacy_problems(text: str) -> list[str]:
    """Keys the format no longer has, and what replaced them."""
    raw = rec(_yaml.load_or_none(text))
    out: list[str] = []
    if arr(get(raw, "library")):
        out.append("`library:` is gone — put each entry on its event under `content:`")
    if arr(get(raw, "compare")):
        out.append("`compare:` is gone — there is no A/B view any more")
    if any(arr(get(rec(t), "variants")) for t in arr(get(raw, "topics"))):
        out.append("topic `variants:` are gone — a topic has `content:` directly; content that differs by answer is a `by` entry with one whole document per answer")
    if any(arr(get(rec(e), "inputs")) for e in arr(get(raw, "events"))):
        out.append("event `inputs:` is gone — what an event needs or captures belongs in its content")
    view = rec(get(raw, "view"))
    if _str(get(view, "against")):
        out.append("`view.against` is gone with the A/B view")
    if _str(get(view, "tab")):
        out.append("`view.tab` is gone — the walk is the only view")
    if arr(get(raw, "materials")) or arr(get(raw, "scales")) or rec(get(view, "thresholds")):
        out.append("`materials:`, `scales:` and `view.thresholds` are gone — nothing damps a branch any more; a document that was a material belongs on an event or topic under `content:`")
    return out


def version_problems(text: str) -> list[str]:
    """What the file's version cannot carry."""
    raw = rec(_yaml.load_or_none(text))
    version, problem = read_version(raw, "playbook", LATEST)
    out: list[str] = [problem] if problem else []

    def at(what: str, o: dict, i: int) -> str:
        return f"{what} {_str(get(o, 'key')) or _str(get(o, 'label')) or i + 1}"

    if version < 2:
        for lst, what in ((get(raw, "events"), "event"), (get(raw, "topics"), "topic")):
            for i, x in enumerate(arr(lst)):
                for c in (rec(c) for c in arr(get(rec(x), "content"))):
                    if _raw_inline(c):
                        out.append(f"{at(what, rec(x), i)}: {_str(get(c, 'label')) or _str(get(c, 'key')) or 'a content entry'} is written in the book — version 1 has no such thing; add `version: 2` at the top")
        for i, x in enumerate(arr(get(raw, "events"))):
            o = rec(x)
            on_event = [k for k in ("when", "hint") if present(get(o, k))]
            if on_event:
                out.append(f"{at('event', o, i)}: {', '.join(f'`{k}`' for k in on_event)} on the event — version 1 says this in a rule; move it to `rules:`, or add `version: 2` at the top")
        return out

    off = "or take `version: 2` off"
    if arr(get(raw, "rules")):
        out.append(f"`rules:` — at version 2 an event carries its own `when` and `hint`, and its document shows once the answers it follows are taken. Move each rule's `process` onto its event as `hint`, a `when` where the event is on the table only under an answer, {off}")
    if arr(get(raw, "topics")):
        out.append(f"`topics:` — at version 2 what is always true is the content of an always-on event, {off}")
    if rec(get(raw, "view")):
        out.append("`view:` — a version-2 walk is session-only and writes nothing; every decision opens unanswered. Delete the view")
    for i, x in enumerate(arr(get(raw, "events"))):
        o = rec(x)
        where = at("event", o, i)
        if present(get(o, "status")):
            out.append(f"{where}: `status` — at version 2 the document shows when its answers are taken, and `hint` shows until then. Delete it")
        if present(get(o, "sets")):
            out.append(f"{where}: `sets` — at version 2 an answer is taken on the rail, never by an event. Delete it")
        if not present(get(o, "content")):
            continue
        if is_list(o["content"]):
            out.append(f"{where}: `content` is one document at version 2 — a mapping, not a list; several sections belong in one brief")
        c = _raw_one(o["content"])
        name = _str(get(c, "label")) or _str(get(c, "key")) or _str(get(c, "file")) or "the content"
        if _str(get(c, "file")):
            out.append(f"{where}: {name} is a file beside the book — at version 2 the document is in the book; write it as `kind` + `doc`, {off}")
        if not _raw_inline(c) and not _str(get(c, "file")) and c:
            out.append(f"{where}: {name} has neither `doc` nor `docs` — write the document under it")
    return out


def _variant_key(segs: list[str]) -> str:
    return ",".join(segs)


def variation_keys(doc: Playbook, entry: Content) -> list[str]:
    """The closed set a `by` entry expects: one key per combination of its decisions' answers."""
    if not entry.by:
        return []
    axes = []
    for d in entry.by:
        dec = next((x for x in doc.decisions if x.key == d), None)
        axes.append([ref_of(d, v.key) for v in dec.values] if dec else [])
    return [_variant_key(list(c)) for c in product(*axes)]


def _ext_of(file: str) -> str:
    n = file[file.rfind("/") + 1:]
    i = n.rfind(".")
    return "" if i <= 0 else n[i:]


def variations_of(doc: Playbook, entry: Content) -> list[str]:
    """The files a version-1 file entry expects beside the book."""
    if not entry.file:
        return []
    if not entry.by:
        return [entry.file]
    return [f"{entry.file}.variants/{k}{_ext_of(entry.file)}" for k in variation_keys(doc, entry)]


def content_entries(doc: Playbook) -> list[tuple[str, Content]]:
    return [(f"event {e.key}", c) for e in doc.events for c in e.content] + \
           [(f"topic {t.key}", c) for t in doc.topics for c in t.content]


def by_entries(doc: Playbook) -> list[tuple[str, Content]]:
    return [(w, c) for w, c in content_entries(doc) if c.by]


def inline_entries(doc: Playbook) -> list[tuple[str, Content]]:
    return [(w, c) for w, c in content_entries(doc) if c.has_doc or c.docs is not None]


def variation_problems(doc: Playbook) -> list[str]:
    """`by` decisions that are not decisions of this book."""
    return [f"{where}: `by` names {d}, which is not a decision of this book"
            for where, entry in by_entries(doc) for d in entry.by
            if not any(x.key == d for x in doc.decisions)]


def written_docs(c: Content) -> list[tuple[str, Any]]:
    if c.docs is not None:
        return list(c.docs.items())
    return [("", c.doc)] if c.has_doc else []


def inline_problems(doc: Playbook) -> list[str]:
    """What a written entry cannot be."""
    out: list[str] = []
    for where, entry in inline_entries(doc):
        name = entry.label or entry.key or "inline content"
        form = "`docs`" if entry.docs is not None else "`doc`"
        if not entry.kind:
            out.append(f"{where}: {name} has {form} but no `kind` — say which kind renders it (brief, guide, md, …)")
        if entry.has_doc and entry.docs is not None:
            out.append(f"{where}: {name} has both `doc` and `docs` — one document, or one per answer combination")
        if entry.has_doc and entry.by:
            out.append(f"{where}: {name} is one document, so it cannot vary `by` — write one per answer combination under `docs`")
        if entry.docs is not None:
            if not entry.by:
                out.append(f"{where}: {name} has `docs` but no `by` — say which decisions key the documents")
            elif all(any(x.key == d for x in doc.decisions) for d in entry.by):
                expected = variation_keys(doc, entry)
                have = [str(k) for k in entry.docs.keys()]
                for k in expected:
                    if k not in have:
                        out.append(f"{where}: {name}: docs has no `{k}` — every answer combination of `by` is a document of its own")
                for k in have:
                    if k not in expected:
                        out.append(f"{where}: {name}: docs has `{k}`, which is not a combination of {', '.join(entry.by)} answers in `by` order")
        if entry.kind == "md":
            for at, d in written_docs(entry):
                if not is_str(d):
                    out.append(f"{where}: {name}{f' [{at}]' if at else ''}: an `md` document is its text — write it as a block string")
    return out


def check(text: str, file: str | None = None) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    doc = parse(text)
    base = f"v{doc.version} · {len(doc.decisions)} decisions, {len(doc.events)} events" + \
           (f", {len(doc.topics)} topics" if doc.version < 2 else "")
    out = [*version_problems(text), *legacy_problems(text), *variation_problems(doc), *inline_problems(doc)]
    # A `by` FILE is a closed set authored up front: every answer combination is a file beside this one.
    folder = os.path.dirname(file) if file else None
    expected = present_count = 0
    for _, entry in by_entries(doc):
        if not entry.file:
            continue
        for f in variations_of(doc, entry):
            expected += 1
            if folder and os.path.exists(os.path.join(folder, f)):
                present_count += 1
            else:
                out.append(f"{f}: missing — every answer combination of `by` is a book of its own")
    # Content written in the book is checked by its own kind's engine, handed THIS file's path.
    inline = 0
    for where, entry in inline_entries(doc):
        if not entry.kind:
            continue
        inline += 1
        name = f"{where}: {entry.label or entry.key or 'inline content'} ({entry.kind})"
        if entry.kind not in KINDS:
            out.append(f"{name}: not a kind the Studio knows — `--kinds` lists them")
            continue
        for at, d in written_docs(entry):
            _, r = check_written(entry.kind, d, file)
            out.extend(f"{name}{f' [{at}]' if at else ''}: {p}" for p in r.problems)
    summary = base + (f", {present_count} of {expected} child variations present" if expected else "") + \
        (f", {inline} documents" if inline else "")
    return CheckResult(out, summary)
