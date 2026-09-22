# studio-kinds

The Studio's document kinds — `.brief`, `.playbook`, `.kanban`, `.calendar`, `.policy`, `.flow`,
`.jsonl`, `.middleware`, `.pipeline`, `.collection`, `.clip`, `.song`, `.md` — checked from Python:
the `studio-check` command, the `check` function, and every kind's JSON Schema, book, field table,
spec and template as package data. Nothing leaves the machine.

```bash
pip install studio-kinds
studio-check launch.kanban          # one file: ok, or every problem line
studio-check .                      # a folder; exit 1 when any document has problems
studio-check --json a.kanban        # {file, ext, ok, problems, summary}
studio-check --schema kanban        # the path of the kind's JSON Schema (draft 2020-12)
studio-check --book kanban          # the path of the kind's book — how it works
studio-check --fields kanban        # the path of its field table
studio-check --spec kanban          # the engine's account of the format, plus the template
studio-check --template policy > new.policy
studio-check --collect stays.jsonl  # copy a view's rows into a .collection
studio-check --midi bass.clip       # write a Standard MIDI File beside a clip or a song
```

```python
from studio_kinds import check, check_path, schema_path, template

r = check_path("launch.kanban")            # reads files the document names beside it
r = check(text, "kanban")                  # a document as text
r.ok, r.problems, r.summary
schema_path("playbook")                    # .../data/schemas/playbook/v2.schema.json
template("brief")                          # a fresh document
```

`ok` means the engine runs the file as written: every fallback a lenient reader would take — a
`needs` to no task, an `op` outside the vocabulary, a required field missing, a `status` that is no
column, a cycle — is a problem line naming where. The JSON Schema is the shape; the references
between fields and the files beside a document are the checker's alone.

The engines are proven against a conformance corpus — a document and its expected verdict per rule —
in the repository: https://github.com/MaherKSantina/studio-kinds.
