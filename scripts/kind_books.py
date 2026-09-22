"""Every authoring kind, at every version, has a BOOK (kinds/<ext>/v<N>.playbook — a playbook, in the
version-2 form, that explains how the kind works), a FIELD TABLE (v<N>.fields.yaml) and a JSON SCHEMA
(v<N>.schema.json); the Python package ships copies of all three under studio_kinds/data.

  python scripts/kind_books.py           write the book of every kind and version that has none yet —
                                         the spec under an always-on event; never overwrites a book
  python scripts/kind_books.py --check   every book exists and passes the checker; every field table is
                                         present and well-formed; every schema is present; and the package's
                                         copies of books, field tables, schemas and templates are the
                                         repository's (exit 1 otherwise) — CI
  python scripts/kind_books.py --sync    copy the repository's books, field tables and schemas into the package

Needs the package importable: `pip install -e python` (or run from the repository with PYTHONPATH=python).
"""
from __future__ import annotations

import filecmp
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "python"))

from studio_kinds import AUTHORING, _yaml, check_path, latest_version, spec  # noqa: E402

KINDS_DIR = os.path.join(ROOT, "kinds")
DATA = os.path.join(ROOT, "python", "studio_kinds", "data")


def repo_paths(ext: str, v: int) -> dict[str, str]:
    return {
        "book": os.path.join(KINDS_DIR, ext, f"v{v}.playbook"),
        "fields": os.path.join(KINDS_DIR, ext, f"v{v}.fields.yaml"),
        "schema": os.path.join(KINDS_DIR, ext, f"v{v}.schema.json"),
    }


def package_paths(ext: str, v: int) -> dict[str, str]:
    return {
        "book": os.path.join(DATA, "books", ext, f"v{v}.playbook"),
        "fields": os.path.join(DATA, "fields", ext, f"v{v}.fields.yaml"),
        "schema": os.path.join(DATA, "schemas", ext, f"v{v}.schema.json"),
    }


def rel(p: str) -> str:
    return os.path.relpath(p, ROOT).replace(os.sep, "/")


def write_missing() -> int:
    written = 0
    for ext in AUTHORING:
        for v in range(1, latest_version(ext) + 1):
            book = repo_paths(ext, v)["book"]
            if os.path.exists(book):
                continue
            text = spec(ext).strip()
            m = re.search(r"^# \.\w+ — (.+)$", text, re.M)
            label = m.group(1) if m else ext
            doc = {
                "version": 2,
                "title": f"How a version-{v} {label.lower()} works",
                "description": f"The .{ext} kind at version {v}: the engine's own account, and the document a fresh file starts from.",
                "events": [{
                    "key": "always", "label": "Always", "trigger": "imposed", "domain": "Always",
                    "detail": "What holds at every moment — the engine's account of the kind, the same text studio-check --spec prints.",
                    "content": {"key": "spec", "label": "The engine's account", "kind": "md", "doc": text + "\n"},
                }],
            }
            os.makedirs(os.path.dirname(book), exist_ok=True)
            with open(book, "w", encoding="utf-8", newline="\n") as f:
                f.write(_yaml.dump(doc))
            written += 1
            print(f"wrote {rel(book)}")
    return written


def sync() -> None:
    for ext in AUTHORING:
        for v in range(1, latest_version(ext) + 1):
            src, dst = repo_paths(ext, v), package_paths(ext, v)
            for k in src:
                if os.path.exists(src[k]):
                    os.makedirs(os.path.dirname(dst[k]), exist_ok=True)
                    shutil.copyfile(src[k], dst[k])
    print("package data synced from kinds/")


def check() -> int:
    problems = 0
    for ext in AUTHORING:
        for v in range(1, latest_version(ext) + 1):
            src, dst = repo_paths(ext, v), package_paths(ext, v)
            if not os.path.exists(src["book"]):
                problems += 1
                print(f"missing: {rel(src['book'])}")
            else:
                r = check_path(src["book"])
                if not r.ok:
                    problems += 1
                    print(f"{rel(src['book'])}: {len(r.problems)} problems")
                    for p in r.problems:
                        print(f"      {p}")
            if not os.path.exists(src["fields"]):
                problems += 1
                print(f"missing field table: {rel(src['fields'])}")
            else:
                try:
                    with open(src["fields"], encoding="utf-8") as f:
                        doc = _yaml.load(f.read())
                    fields = doc.get("fields") if isinstance(doc, dict) else None
                    if not isinstance(fields, list) or not fields:
                        raise ValueError("no `fields` list")
                    for entry in fields:
                        if not isinstance(entry, dict) or not isinstance(entry.get("field"), str) or not entry["field"]:
                            raise ValueError("an entry without a `field`")
                    if doc.get("kind") != ext or doc.get("version") != v:
                        raise ValueError(f"says kind {doc.get('kind')} v{doc.get('version')}, sits under {ext} v{v}")
                except Exception as e:  # noqa: BLE001
                    problems += 1
                    print(f"{rel(src['fields'])}: {e}")
            if not os.path.exists(src["schema"]):
                problems += 1
                print(f"missing schema: {rel(src['schema'])}")
            for k in src:
                if os.path.exists(src[k]) and not (os.path.exists(dst[k]) and filecmp.cmp(src[k], dst[k], shallow=False)):
                    problems += 1
                    print(f"package copy out of step: {rel(dst[k])} — run `python scripts/kind_books.py --sync`")
        tmpl = os.path.join(DATA, "templates", f"untitled.{ext}")
        if not os.path.exists(tmpl):
            problems += 1
            print(f"missing template: {rel(tmpl)}")
    print(f"{problems} problems" if problems else "books, field tables, schemas and package copies all in step")
    return 1 if problems else 0


if __name__ == "__main__":
    if "--sync" in sys.argv:
        sync()
        sys.exit(0)
    if "--check" not in sys.argv:
        write_missing()
    sys.exit(check())
