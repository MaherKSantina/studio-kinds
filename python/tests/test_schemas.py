"""The JSON Schemas (`kinds/<ext>/v<N>.schema.json`, shipped as `studio_kinds/data/schemas`) agree with
the engines: every schema is a valid draft 2020-12 schema, and every document the engine passes —
the templates, the examples, the corpus's ok cases — validates against its kind's schema.

The schemas describe the AUTHORING shape. The engines are lenient beyond it — a brief written with
`features:` or `name:`, a bare list, an empty file, a `.jsonl` that is one JSON array — and those
cases are listed here as what the schema deliberately does not advertise.
"""
from __future__ import annotations

import datetime as dt
import glob
import json
import os

import pytest

jsonschema = pytest.importorskip("jsonschema")
from jsonschema import Draft202012Validator  # noqa: E402

from studio_kinds import AUTHORING, _yaml, schema_path, versions  # noqa: E402
from studio_kinds.kinds.flow import split_file  # noqa: E402

HERE = os.path.dirname(__file__)
REPO = os.path.join(HERE, "..", "..")

LENIENT = {
    "brief/features-spelling.brief": "the engine reads `features`/`name`/`prose` as `sections`/`title`/`body`",
    "brief/not-mapping.brief": "a non-mapping renders as an empty brief",
    "brief/untitled.brief": "no title renders as \"Untitled brief\" and an untitled section as \"Untitled\"; the schema asks for both",
    "brief/no-sections.brief": "no `sections` renders as an empty brief; the schema asks for the key",
    "playbook/empty.playbook": "an empty file opens as an empty book",
    "jsonl/array.jsonl": "one JSON array of objects is accepted as the rows",
    "kanban/date-rollover.kanban": "a datetime, or a date that rolls over, is cut to its day; the schema says `YYYY-MM-DD`",
}


def to_json(v):
    """A parsed YAML document as JSON data: dates become `YYYY-MM-DD` strings, as a JSON writer would."""
    if isinstance(v, dt.datetime):
        return v.isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, dict):
        return {str(k): to_json(x) for k, x in v.items()}
    if isinstance(v, list):
        return [to_json(x) for x in v]
    return v


def schemas() -> list[tuple[str, int]]:
    return [(ext, v) for ext in AUTHORING for v in versions(ext)]


@pytest.mark.parametrize("ext,version", schemas(), ids=[f"{e}-v{v}" for e, v in schemas()])
def test_schema_is_valid(ext: str, version: int) -> None:
    p = schema_path(ext, version)
    assert os.path.exists(p), p
    with open(p, encoding="utf-8") as f:
        schema = json.load(f)
    Draft202012Validator.check_schema(schema)
    assert schema["$id"].endswith(f"/{ext}/v{version}.schema.json")
    repo_copy = os.path.join(REPO, "kinds", ext, f"v{version}.schema.json")
    with open(repo_copy, encoding="utf-8") as f:
        assert json.load(f) == schema, "the package's copy must be the repository's"


def ok_documents() -> list[str]:
    out: list[str] = []
    for ext in AUTHORING:
        for f in glob.glob(os.path.join(REPO, "conformance", ext, f"*.{ext}")):
            with open(f + ".expected.json", encoding="utf-8") as e:
                if json.load(e)["ok"]:
                    out.append(f)
        out.extend(glob.glob(os.path.join(REPO, "examples", f"*.{ext}")))
    return sorted(out)


def _id(f: str) -> str:
    return os.path.relpath(f, REPO).replace(os.sep, "/")


@pytest.mark.parametrize("path", ok_documents(), ids=_id)
def test_ok_document_validates(path: str) -> None:
    rel = "/".join(_id(path).split("/")[-2:])
    if rel in LENIENT:
        pytest.skip(LENIENT[rel])
    ext = os.path.splitext(path)[1][1:]
    with open(path, encoding="utf-8") as f:
        text = f.read()
    if ext == "md":
        instances = [text]
        version = 1
    elif ext == "jsonl":
        instances = [json.loads(line) for line in text.splitlines() if line.strip()]
        version = 1
    elif ext == "flow":
        instances = [to_json(_yaml.load(split_file(text)[0]) or {})]
        version = 1
    else:
        doc = _yaml.load(text)
        instances = [to_json(doc)]
        version = versions(ext)[-1] if ext == "playbook" else 1
    with open(schema_path(ext, version), encoding="utf-8") as f:
        validator = Draft202012Validator(json.load(f))
    for instance in instances:
        errors = list(validator.iter_errors(instance))
        assert not errors, f"{_id(path)}: {errors[0].message} at {list(errors[0].absolute_path)}"
