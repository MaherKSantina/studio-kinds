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
skills/studio-files    the studio-files skill for Claude Code, shipped in the release zip
examples/              a playbook and a brief to paste
```

Every surface renders through the same components: what the page shows on the right is what the web
Studio, the desktop app and the VS Code extension show.

## The kinds

`studio-check --kinds` lists them. Each kind is a YAML file whose extension picks its engine; the engine
file's header comment is the specification (`studio-check --spec <ext>`) and every kind has a template
(`studio-check --template <ext>`). `how-a-version-2-playbook-works.playbook` at the root is a playbook
about the playbook kind, itself one version-2 file.

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
