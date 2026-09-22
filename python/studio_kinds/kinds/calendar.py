"""`.calendar` — a LENS over one `.kanban` board: it recomputes the schedule from the board on every
open and stores no dates of its own. The file says which board (`board:` — a ref resolved against
this file's folder) and, optionally, overrides the anchor (`due:`).

The check: the board must be named, and on disk it must be there.
"""
from __future__ import annotations

import os

from .. import _yaml
from .._js import as_str, is_obj
from . import CheckResult
from .kanban import as_date


def check(text: str, file: str | None = None) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    raw = _yaml.load_or_none(text)
    raw = raw if is_obj(raw) else {}
    board = as_str(raw.get("board"))
    due = as_date(raw.get("due"))
    out: list[str] = []
    if not board:
        out.append("no `board` — the `.kanban` this calendar is a lens over, a ref resolved against this file's folder")
    elif file and not os.path.exists(os.path.join(os.path.dirname(file), board)):
        out.append(f"board {board}: not found beside this file")
    summary = (f"over {board}" + (f", due {due}" if due else "")) if board else None
    return CheckResult(out, summary)
