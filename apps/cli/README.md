# studio-check

The Studio's file kinds from the command line — for people, and for agents
(Claude Code in VS Code) editing documents as text.

```bash
pnpm check C:\Github\Neogrids                 # every document under a folder
pnpm check some.flow other.frame              # specific files
pnpm check --spec flow                        # the kind's spec: engine header + legend/template
pnpm check --template playbook > new.playbook # a fresh document
pnpm check --kinds                            # what the Studio knows
```

`node apps/cli/dist/check.cjs …` works from anywhere. Exit status 1 when a
checked document has problems. The checks are the kit's own engines
(`packages/filekinds/src/lib`), so what passes here renders in the Studio, the
desktop app and the VS Code extension.

Rebuild after changing the kit: `pnpm cli:build`.
