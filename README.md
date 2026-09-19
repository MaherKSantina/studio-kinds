# studio-kinds

The Studio: one editor for every kind of document, as a pnpm workspace.

```
packages/crosscut      the shell kit: pickers, panes, autosave, the fs contract, decision tables, the Ask panel
packages/filekinds     the file-kind layer: the registry, a viewer per kind, editors for frame/flow/playbook/project, the document engines
apps/studio/frontend   the Studio — one App over a store: web (/studio), desktop (over a folder), VS Code (one document)
apps/desktop           the Electron shell: the Studio over a real folder on disk; the Windows installer
apps/vscode            the VS Code extension: the Studio as a custom editor and side preview
apps/cli               studio-check: validate documents, print a kind's spec or a fresh template
apps/page              the paste-and-check page and the stateless POST /api/check endpoint (Cloudflare Pages)
skills/studio-files    the studio-files skill for Claude Code — generated from claude/claude.playbook by pnpm skill:export, shipped in the release zip
claude/                Claude's master playbook for this repository (claude.playbook) and its memory (memory.playbook, never committed)
examples/              a playbook and a brief to paste
```

Every surface renders through the same components: what the page shows on the right is what the web
Studio, the desktop app and the VS Code extension show.

## The kinds

`studio-check --kinds` lists them. Each kind is a YAML file whose extension picks its engine; the engine
file's header comment is the specification (`studio-check --spec <ext>`) and every kind has a template
(`studio-check --template <ext>`).

**Every kind, at every version, has a book**: `kinds/<ext>/v<N>.playbook`, a playbook in the version-2
form that explains how the kind works at that version — `kinds/playbook/v2.playbook` for the current
playbook, `kinds/playbook/v1.playbook` for the one before it, `kinds/brief/v1.playbook`, and so on.
`studio-check --book <ext> [N]` prints the path (the latest version when N is not given);
`studio-check --books` lists them all. `node scripts/kind-books.mjs` writes the book of any kind or
version that has none — the engine's own account under an always-on event — and never overwrites one;
`--check` (run by CI) fails when a book is missing or does not pass the checker. A kind that gains a
version gains a book.

**Beside the book, the schema**: `kinds/<ext>/v<N>.fields.yaml`, the kind's field table — every field
(dot paths for nested ones, `[]` for a list's entries), its type, whether it is required, and what it
is. `studio-check --fields <ext> [N]` prints the path; `--check` requires one for every kind the page
offers. The book says how the kind works; the field table says what is in the file.

The page offers the kinds "Which kind for what" names — brief, playbook, kanban, calendar, policy, flow,
data (`.jsonl`), middleware, collection, clip, song and markdown — and checks a guide written inside a
playbook. Beside the kind menu, "How .<ext> works" opens the kind's book and "Schema" its field table,
each in a dialog over the document.

## Run it

```bash
pnpm install
pnpm test                 # every package's tests
pnpm page:dev             # the paste-and-check page, live
pnpm cli:build            # apps/cli/dist/check.cjs — studio-check
pnpm desktop              # build the desktop renderer and start the Electron shell
pnpm vscode:vsix          # apps/vscode/*.vsix — install with: code --install-extension <file> --force
pnpm desktop:dist         # apps/desktop/out/Studio-Setup-<v>.exe
```

The endpoint runs locally with `pnpm page:build` then `npx wrangler pages dev dist` from `apps/page`;
`pnpm page:deploy` publishes page and endpoint to Cloudflare Pages.

## Releases

`git tag studio-v<major>.<minor>.<patch> && git push origin studio-v<version>` runs the Studio release
workflow on a Windows runner: the installer, the `.vsix`, the `studio-check` package and the skill zip are
attached to a GitHub Release, with `install-studio.ps1`, which installs all four on a PC.

## License

MIT.
