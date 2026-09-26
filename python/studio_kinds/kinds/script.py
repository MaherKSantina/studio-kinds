"""`.script` — a script as a document: the code, the language it runs in, the environment variables the
run gets, and where it runs. Opened, it shows the source and the variables and offers Run; pressed, the
host writes the code to a file and starts the interpreter with those variables in its environment, in
the folder named by `cwd` (this file's folder when absent), and shows the exit code, the output and the
errors. The file is never changed by running.

    title: Rebuild the index
    description: one line
    language: powershell        # powershell | pwsh | bash | sh | python | node | cmd
    env:                        # the environment variables the run gets — saved here, shown on open
      INDEX_DIR: C:\\Github\\index
      DRY_RUN: "1"
    cwd: .                      # where the code runs, relative to this file's folder
    code: |
      Write-Host "Rebuilding $env:INDEX_DIR"

`language` names the interpreter the host starts (`powershell` is `powershell.exe` on Windows and `pwsh`
elsewhere; `python` and `node` are the commands on the host's PATH; `cmd` is Windows only). A variable's
name is an identifier (`[A-Za-z_][A-Za-z0-9_]*`) and its value text, a number or a boolean — anything
else cannot be an environment variable. A variable written in the file overrides the host's own of the
same name for the run and nothing else.

The check: not a mapping, no `title`, no `language` or one the hosts do not know, `env` that is not a
mapping, a variable with a name that is not an identifier or a value that is not a scalar, a `cwd` that is
not text, and no `code` (or code that is not text, or blank).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .. import _yaml
from .._js import as_str, defined, get, is_bool, is_num, is_obj, js_str, json_of, plural
from . import CheckResult

LANGUAGES: tuple[str, ...] = ("powershell", "pwsh", "bash", "sh", "python", "node", "cmd")
"""The interpreters a host knows how to start, by the name the file uses."""

_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


@dataclass
class Script:
    title: str
    language: str
    code: str
    description: str | None = None
    cwd: str | None = None
    env: dict[str, str] = field(default_factory=dict)
    """Every variable as the text the run gets — a number or a boolean written as JavaScript would."""


def _scalar(v: object) -> bool:
    return isinstance(v, str) or is_num(v) or is_bool(v)


def parse(text: str) -> Script:
    """The lenient read — never refuses: an unparseable file is an empty script."""
    raw = _yaml.load_or_none(text)
    if not is_obj(raw):
        return Script("", "", "")
    env: dict[str, str] = {}
    for k, v in (raw["env"].items() if is_obj(raw.get("env")) else []):
        if isinstance(k, str) and _NAME.match(k) and _scalar(v):
            env[k] = js_str(v)
    return Script(
        as_str(raw.get("title")),
        as_str(raw.get("language")).strip().lower(),
        raw["code"] if isinstance(raw.get("code"), str) else "",
        as_str(raw.get("description")) or None,
        as_str(raw.get("cwd")) or None,
        env,
    )


def problems(text: str) -> list[str]:
    raw = _yaml.load_or_none(text)
    out: list[str] = []
    if not is_obj(raw):
        return ["not a mapping — a script is `title`, `language`, `env` and `code`"]
    if not as_str(raw.get("title")):
        out.append("no `title` — the script's heading")
    language = as_str(raw.get("language")).strip().lower()
    if not defined(get(raw, "language")):
        out.append(f"no `language` — which interpreter runs the code: {', '.join(LANGUAGES)}")
    elif language not in LANGUAGES:
        out.append(f"`language` {json_of(raw['language'])} is not one a host can start — {', '.join(LANGUAGES)}")
    if defined(get(raw, "env")):
        if not is_obj(raw["env"]):
            out.append("`env` is not a mapping — variable names to their values")
        else:
            for k, v in raw["env"].items():
                name = k if isinstance(k, str) else js_str(k)
                if not isinstance(k, str) or not _NAME.match(k):
                    out.append(f"env {json_of(name)}: not a variable name — letters, digits and underscores, not starting with a digit")
                if not _scalar(v):
                    out.append(f"env {name}: the value is not text, a number or a boolean (got {json_of(v)}) — an environment variable is one string")
    if defined(get(raw, "cwd")) and not isinstance(raw["cwd"], str):
        out.append(f"`cwd` is not text — a folder relative to this file's (got {json_of(raw['cwd'])})")
    if not defined(get(raw, "code")):
        out.append("no `code` — the script itself, as a block string")
    elif not isinstance(raw["code"], str):
        out.append(f"`code` is not text — write it as a block string (got {json_of(raw['code'])})")
    elif not raw["code"].strip():
        out.append("`code` is blank — nothing would run")
    return out


def summary(doc: Script) -> str:
    lines = len(doc.code.strip().splitlines()) if doc.code.strip() else 0
    return f"{doc.language or 'no language'} · {plural(len(doc.env), 'variable')} · {plural(lines, 'line')}"


def check(text: str) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    return CheckResult(problems(text), summary(parse(text)))
