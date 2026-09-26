"""The studio-files skill for OTHER surfaces — a PC without this repository, Claude.ai chat, Cowork — is
GENERATED from the master playbook's event "A Studio document is asked for" (claude/claude.playbook):
the event is the source, skills/studio-files/SKILL.md is what the release zips (studio-files-skill.zip).

  python scripts/export_skill.py           write skills/studio-files/SKILL.md from the event
  python scripts/export_skill.py --check   exit 1 when the file on disk differs from the event — CI
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "python"))

from studio_kinds import _yaml  # noqa: E402

MASTER = os.path.join(ROOT, "claude", "claude.playbook")
OUT = os.path.join(ROOT, "skills", "studio-files", "SKILL.md")

FRONTMATTER = """---
name: studio-files
description: Author and edit Studio documents on DISK — every kind of the Digital Symphony suite (.brief, .playbook, .kanban, .calendar, .policy, .flow, .jsonl, .pipeline, .collection, .clip, .song, .script, .views, .page, and .md for anything else), each one self-contained file — in any folder the Studio opens. Use whenever a task touches one of these files by extension, asks to create, change or validate one, mentions the Studio, the desktop app or the VS Code preview, or asks WHICH file type to use for something.
---
"""


def main() -> int:
    with open(MASTER, encoding="utf-8") as f:
        doc = _yaml.load(f.read())
    event = next((e for e in (doc.get("events") or []) if e.get("key") == "studio-document"), None)
    content = (event or {}).get("content") or {}
    if not content.get("doc"):
        print(f'no "studio-document" event with a document in {MASTER}', file=sys.stderr)
        return 2
    text = FRONTMATTER + str(content["doc"]).rstrip() + "\n"
    rel = os.path.relpath(OUT, ROOT).replace(os.sep, "/")
    if "--check" in sys.argv:
        current = open(OUT, encoding="utf-8").read().replace("\r\n", "\n") if os.path.exists(OUT) else ""
        if current == text:
            print(f"skill in step with the master: {rel}")
            return 0
        print(f'{rel} differs from the event "A Studio document is asked for" in claude/claude.playbook — run python scripts/export_skill.py and commit it', file=sys.stderr)
        return 1
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"skill exported from the master → {rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
