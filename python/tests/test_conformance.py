"""The conformance corpus: every case under `conformance/<ext>/` is a document with a sibling
`<name>.expected.json` — the verdict the Studio's original engines gave it (`ok`, `problems`,
`summary`, `note`). The Python engines must give the same, word for word.

The one allowance: a message that quotes the parser's own words — a YAML error, a JSON error —
compares on its prefix only, since js-yaml and PyYAML, V8 and Python, phrase a parse error differently.
"""
from __future__ import annotations

import json
import os
import re

import pytest

from studio_kinds import check_path

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "conformance")
CASES = sorted(
    os.path.join(dirpath, name[: -len(".expected.json")])
    for dirpath, _, files in os.walk(ROOT)
    for name in files
    if name.endswith(".expected.json")
)

_NATIVE = [
    re.compile(r"^(YAML: ).*$", re.S),
    re.compile(r"^((?:model|views) YAML parse error: ).*$", re.S),
    # a `.jsonl` line the JSON parser refused — anything but the engine's own line messages
    re.compile(r"^((?:.*: )?line \d+: )(?!not a JSON object|a directive line|unknown directive|\$|a second ).*$", re.S),
]


def normalise(message: str) -> str:
    for rx in _NATIVE:
        m = rx.match(message)
        if m:
            return m.group(1) + "<parser>"
    return message


@pytest.mark.parametrize("case", CASES, ids=[os.path.relpath(c, ROOT).replace(os.sep, "/") for c in CASES])
def test_case(case: str) -> None:
    with open(case + ".expected.json", encoding="utf-8") as f:
        expected = json.load(f)
    got = check_path(case)
    assert [normalise(p) for p in got.problems] == [normalise(p) for p in expected["problems"]]
    assert got.ok == expected["ok"]
    assert got.summary == expected.get("summary")
    assert got.note == expected.get("note")


def test_corpus_present() -> None:
    assert len(CASES) >= 75
