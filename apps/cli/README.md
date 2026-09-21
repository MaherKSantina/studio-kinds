# studio-check

The Studio's file kinds from the command line — for people, and for agents
(Claude Code in VS Code) editing documents as text.

```bash
pnpm check examples/                          # every document under a folder
pnpm check launch.kanban pitches.policy       # specific files
pnpm check --kinds                            # what the Studio knows
pnpm check --book kanban                      # the path of the kind's book: how it works
pnpm check --fields kanban                    # the path of its field table: what is in the file
pnpm check --spec kanban                      # the engine header + the template
pnpm check --template policy > new.policy     # a fresh document
pnpm check --json a.kanban b.policy           # machine-readable results
```

`node apps/cli/dist/check.cjs …` works from anywhere. Exit status 1 when a
checked document has problems. The checks are the kit's own engines
(`packages/filekinds/src/lib`), so what passes here renders in the Studio, the
desktop app and the VS Code extension — and `ok` means the engine runs the file
as written: every fallback the lenient parsers take (a `needs` to no task, an
`op` outside the vocabulary, a required field missing) is a problem line.

Rebuild after changing the kit: `pnpm cli:build`.

Installed from a release (`npm install -g studio-cli-<version>.tgz`) the package
carries `kinds/` (every book and field table) and `specs/` (every engine header)
beside `dist/`, so `--book`, `--fields`, `--books` and `--spec` answer without a
checkout; `pnpm cli:pack` (`scripts/cli-pack.mjs`) puts them there.
