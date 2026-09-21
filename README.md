# studio-kinds

The Studio: one editor for every kind of document, as a pnpm workspace.

```
packages/crosscut      the shell kit: pickers, panes, autosave, the fs contract, decision tables, the Ask panel
packages/filekinds     the file-kind layer: the registry, a viewer per kind, editors for frame/flow/playbook/project, the document engines
apps/studio/frontend   the Studio — one App over a store: web (/studio), desktop (over a folder), VS Code (one document)
apps/desktop           the Electron shell: the Studio over a real folder on disk; the Windows installer
apps/vscode            the VS Code extension: the Studio as a custom editor and side preview
apps/cli               studio-check: validate documents, print a kind's spec, book, field table or a fresh template
apps/page              the paste-and-check page and the stateless POST /api/check endpoint — https://studio-kinds.pages.dev
kinds/                 every kind's book (v<N>.playbook) and field table (v<N>.fields.yaml)
skills/studio-files    the studio-files skill for Claude Code — generated from claude/claude.playbook by pnpm skill:export, shipped in the release zip
claude/                Claude's master playbook for this repository (claude.playbook) and its memory (memory.brief, never committed)
examples/              a brief, a playbook, a kanban with its calendar, and a policy — every one passes the checker
```

Every surface renders through the same components: what the page shows on the right is what the web
Studio, the desktop app and the VS Code extension show.

## Get the checker

`studio-check` is the command every section below uses. From a checkout:

```bash
pnpm install && pnpm cli:build      # builds apps/cli/dist/check.cjs
pnpm check examples/                # from the repository root — or: node apps/cli/dist/check.cjs <files>
```

Without a checkout, from the latest [GitHub Release](https://github.com/MaherKSantina/studio-kinds/releases):
`npm install -g studio-cli-<version>.tgz` puts `studio-check` on the PATH, with every kind's book,
field table and spec inside the package. Or `install-studio.ps1` from the same release, which also
installs the desktop app, the VS Code extension and the skill.

Without any install, the endpoint — the same engines, stateless, CORS-open, nothing logged:

```bash
curl -X POST "https://studio-kinds.pages.dev/api/check?kind=kanban" --data-binary @launch.kanban
curl -X POST "https://studio-kinds.pages.dev/api/check" -H "content-type: application/json" -d '{"kind":"policy","text":"title: t\ncases: []"}'
curl "https://studio-kinds.pages.dev/api/check"        # lists the kinds it takes
```

It answers `{ok, kind, version?, summary?, problems: [{message, line?, column?}], notes}`. It sees the
one document only — a file the document names (a playbook's file entry, a calendar's board, a data
view's sources) is listed under `notes`, not read; `studio-check` on a machine reads them.

## The kinds

A kind is a YAML file whose extension picks its engine (`packages/filekinds/src/lib/<kind>Doc.ts`).
Twelve are the **authoring kinds** — the ones "Which kind for what" in the
[studio-files skill](skills/studio-files/SKILL.md) hands out, the page offers and a folder's `CLAUDE.md`
names: `brief`, `playbook`, `kanban`, `calendar`, `policy`, `flow`, `jsonl`, `middleware`, `collection`,
`clip`, `song` and `md`. The rest of `studio-check --kinds` (`frame`, `plan`, `guide`, `list`, `points`,
`definition`, `memory`, `project`, `schema`, `workup`, `program`, `pulse`, `moves`, `tablediff`) are the
Studio's own — written by its editors, read by its views, not meant to be authored by hand.

Each kind has three layers, from the words to the code:

| layer | where | command |
|---|---|---|
| the **book** — how the kind works, as a version-2 playbook | `kinds/<ext>/v<N>.playbook` | `studio-check --book <ext> [N]` prints the path; `--books` lists all |
| the **field table** — every field, its type, whether it is required, what it is | `kinds/<ext>/v<N>.fields.yaml` | `studio-check --fields <ext> [N]` |
| the **spec** — the engine file's header comment, plus the template | `packages/filekinds/src/lib/<kind>Doc.ts` | `studio-check --spec <ext>`; `--template <ext>` for a fresh file |

Every kind, at every version, has a book (`node scripts/kind-books.mjs` writes a missing one; `--check`,
run by CI, fails when one is missing or does not pass the checker), and every authoring kind has a field
table. The book says how the kind works; the field table says what is in the file; the checker says
whether a file is one — `ok` from `studio-check` means the engine runs the file as written, and every
fallback the lenient parser would take (a `needs` to no task, an `op` outside the vocabulary, a required
field missing) is a problem line naming where.

**Pointing an AI at a kind.** Give it the field table and the book as raw URLs, and the checker or the
endpoint to verify with:

```
https://raw.githubusercontent.com/MaherKSantina/studio-kinds/master/kinds/kanban/v1.fields.yaml
https://raw.githubusercontent.com/MaherKSantina/studio-kinds/master/kinds/kanban/v1.playbook
https://raw.githubusercontent.com/MaherKSantina/studio-kinds/master/examples/launch.kanban
```

Claude Code with this repository on disk needs none of that: the `studio-files` skill (and every
`CLAUDE.md` the Studio's "Prepare for Claude Code" button writes) walks it through `--book`, `--fields`,
`--spec`, `--template` and the check.

On the page, beside the kind menu, "How .<ext> works" opens the kind's book and "Schema" its field
table, each in a dialog over the document.

## Run it

```bash
pnpm install
pnpm test                 # every package's tests
pnpm page:dev             # the paste-and-check page, live
pnpm cli:build            # apps/cli/dist/check.cjs — studio-check
pnpm desktop              # build the desktop renderer and start the Electron shell
pnpm vscode:vsix          # apps/vscode/*.vsix — install with: code --install-extension <file> --force
pnpm desktop:dist         # apps/desktop/out/Studio-Setup-<v>.exe
pnpm cli:pack             # apps/cli/out/studio-cli-<v>.tgz — the command with the books, field tables and specs inside
```

The endpoint runs locally with `pnpm page:build` then `npx wrangler pages dev dist` from `apps/page`;
a push to `master` deploys page and endpoint to https://studio-kinds.pages.dev (`pnpm page:deploy` does
the same by hand).

## Releases

`git tag studio-v<major>.<minor>.<patch> && git push origin studio-v<version>` runs the Studio release
workflow on a Windows runner: the installer, the `.vsix`, the `studio-check` package and the skill zip are
attached to a GitHub Release, with `install-studio.ps1`, which installs all four on a PC.

## License

MIT.
