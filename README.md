# studio-kinds

Twelve document kinds — `.brief`, `.playbook`, `.kanban`, `.calendar`, `.policy`, `.flow`,
`.jsonl`, `.pipeline`, `.collection`, `.clip`, `.song`, `.md` — each defined three ways
that never drift: a **JSON Schema** (the shape), a **book** (how the kind works), and a **checker**
(the engine that reads a file and names every problem, references between fields included). The
checker is a Python package, `studio-kinds`, with the `studio-check` command; the schemas and books
ship inside it and sit here as plain files, fetchable by URL.

**A document is ONE FILE.** Every kind holds everything it shows — its own rows, its own tasks, its
own clips — and a document of another kind is WRITTEN IN, as `content: {kind, doc}`, never named as
a path. So a document can be pasted, checked and rendered anywhere, two documents can never drift
apart, and a check reads the text and nothing beside it.

```
kinds/<ext>/           every kind: v<N>.schema.json (the shape), v<N>.playbook (the book), v<N>.fields.yaml (the field table), README.md (the book as markdown)
python/                the checker — pip install studio-kinds — one module per kind, the schemas/books/templates as data
conformance/           the corpus: a document and its expected verdict per rule, what proves the checker
examples/              a brief, a playbook, a kanban with its calendar, a policy — every one passes the checker
skills/studio-files    the studio-files skill for Claude Code — generated from claude/claude.playbook
skills/studio-file-artifact  renders a .brief, .playbook or .pipeline as a shareable Claude artifact
claude/                Claude's master playbook for this repository (claude.playbook) and its memory (memory.brief, never committed)
packages/, apps/       the Studio's front end — parked: the crosscut kit, the file-kind layer, the web Studio, the desktop app, the VS Code extension
```

**Implementing a kind?** Start at [`kinds/README.md`](kinds/README.md). Each kind's `README.md` is
its book rendered as plain markdown — what a parser keeps from a file, what every interaction shows
and changes, how the kind behaves when embedded in another, and what the checker judges — so it can
be read without first implementing the `playbook` kind the books are written in.

## The checker

```bash
pip install studio-kinds                          # or: pip install -e python   (from a checkout)
studio-check launch.kanban pitches.policy         # specific files
studio-check .                                    # every document under a folder — exit 1 when any has problems
studio-check --json a.kanban                      # machine-readable: {file, ext, ok, problems, summary}
```

`ok` means the engine runs the file as written: every fallback a lenient reader would take (a `needs`
to no task, an `op` outside the vocabulary, a required field missing, a `status` that is no column, a
cycle) is a problem line naming where. Each document written inside another — a brief's section, a
kanban task's, a playbook event's — goes through its own kind's engine too, so a broken kanban
inside a brief is a broken brief.

From Python:

```python
from studio_kinds import check, check_path
r = check_path("launch.kanban")      # or check(text, "kanban") — the text is the whole document
r.ok, r.problems, r.summary
```

Nothing leaves the machine: the checker has no network, no telemetry, no server.

## The kinds, three ways

| layer | where | command |
|---|---|---|
| the **schema** — JSON Schema draft 2020-12: every field, its type, what is required, a description on each; `x-studio-*` keywords name the references the schema cannot express | `kinds/<ext>/v<N>.schema.json` | `studio-check --schema <ext> [N]` prints the path |
| the **book** — how the kind works, as a version-2 playbook | `kinds/<ext>/v<N>.playbook` | `studio-check --book <ext> [N]`; `--books` lists all |
| the **book as markdown** — the same book, rendered flat so it reads without the `playbook` kind; generated, never edited | `kinds/<ext>/README.md` | `pnpm kinds:readme` writes them; `kinds:readme:check` fails when stale |
| the **field table** — the schema as a table | `kinds/<ext>/v<N>.fields.yaml` | `studio-check --fields <ext> [N]` |
| the **spec** and the **template** — the engine's account of the format; a fresh document | inside the package | `studio-check --spec <ext>`; `--template <ext> > new.<ext>` |

**Pointing an AI (or an editor) at a kind** needs no checkout: the raw URLs.

```
https://raw.githubusercontent.com/MaherKSantina/studio-kinds/master/kinds/kanban/v1.schema.json
https://raw.githubusercontent.com/MaherKSantina/studio-kinds/master/kinds/kanban/v1.playbook
https://raw.githubusercontent.com/MaherKSantina/studio-kinds/master/examples/launch.kanban
```

A `# yaml-language-server: $schema=<that URL>` line at the top of a file gives autocomplete and
hover descriptions in any editor with a YAML language server. The schema is the shape; the
references between fields inside the document are the checker's — a document valid against the
schema can still fail `studio-check`, never the reverse.

Claude Code with this repository on disk needs none of that: the `studio-files` skill (and every
`CLAUDE.md` the Studio's "Prepare for Claude Code" button writes) walks it through `--book`,
`--schema`, `--fields`, `--spec`, `--template` and the check.

To show a document to someone who has no Studio, the `studio-file-artifact` skill renders a
`.brief`, `.playbook` or `.pipeline` as an interactive Claude artifact: private until you share
its link, and built the way the kind's README says the kind behaves. It reads that README from
this repository each time, so it follows the books without being reinstalled. Copy
`skills/studio-file-artifact` into `~/.claude/skills/` (`%USERPROFILE%\.claude\skills\` on
Windows); it needs `node` and `curl`.

## What proves the checker

`conformance/<ext>/` holds, per kind, documents that exercise every rule the engine has — the
templates, the examples, and deliberately broken files — each beside its `.expected.json`: the
verdict (`ok`, the problem lines, the summary). `python -m pytest python/tests` runs every case and
compares word for word (a message that quotes the YAML or JSON parser's own words compares on its
prefix). A rule without a case is a rule nothing proves; add the case with the rule.

`tests/test_schemas.py` then checks every document the engine passes against its kind's schema, so
the schema never advertises a shape the checker refuses.

## Run it

```bash
pip install -e "python[test]"
python -m pytest python/tests -q          # the corpus and the schemas
python scripts/kind_books.py --check      # every book, field table and schema present and in step with the package's copies
python scripts/export_skill.py --check    # the skill in step with the master playbook
```

The Studio's front end is parked in `packages/` and `apps/` — it still builds (`pnpm install`,
`pnpm typecheck`, `pnpm test`, `pnpm vscode:vsix`, `pnpm desktop:dist`) and its release still ships,
but the engines it renders with are its own and are not the checker.

## Releases

`git tag studio-v<major>.<minor>.<patch> && git push origin studio-v<version>` runs the Studio release
workflow on a GitHub-hosted Windows runner, from the tag's own source: the desktop installer, the
`.vsix`, the `studio-kinds` wheel (the `studio-check` command) and the skill zip are attached to a
GitHub Release, with `install-studio.ps1`, which installs all four on a PC, and `SHA256SUMS`, the
digest of each. Every file carries a [build provenance attestation](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations):

```bash
gh attestation verify studio_kinds-1.0.0-py3-none-any.whl --repo MaherKSantina/studio-kinds
sha256sum -c SHA256SUMS
```

## What leaves your machine

Nothing, by default. The checker, the desktop app and the VS Code extension are offline — no
telemetry, no update check, no install hooks in any package. The VS Code webview's CSP allows no
script, style or font from outside the bundle.

One thing reaches out, and only when a document names something remote: an `https:` image in a
`.collection` item or in any markdown body, and the directions map a `.collection` can open. Showing
one is a request to wherever it lives, so **every host holds it back by default** — a placeholder
stands where the image would load — and each host has a switch that turns it on:

| host | to turn it on | enforced where, while off |
|---|---|---|
| VS Code | setting `studio.remoteContent: true` | the webview's CSP has no `https:` in `img-src` and no map in `frame-src`; the page holds the images |
| desktop app | `STUDIO_REMOTE_CONTENT=on` in the environment | every request off this machine is refused in the main process (`webRequest`), whatever the page asks; the page holds the images |
| web Studio | `VITE_STUDIO_REMOTE_CONTENT=on` at build or dev time | the page holds the images; a `Content-Security-Policy` header on your server enforces it |

A document written as plain YAML with no URL in it makes no request in any host, switch or no switch.

## License

MIT — the whole repository: the schemas, the books, the checker, the kits, the Studio, the desktop
app, the VS Code extension and the skill. Clone it, build it, redistribute what you build.
