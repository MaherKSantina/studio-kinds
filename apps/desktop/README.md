# Studio — desktop

The Studio as a desktop app: the same editors (frames, flows, playbooks,
projects, every registered kind) over a **real folder on disk**. Electron
shell; the renderer is `apps/studio` built with `--mode desktop`.

## Try it

From the workspace root:

```bash
pnpm desktop
```

That builds the desktop renderer (`apps/studio` → `apps/desktop/renderer/`)
and launches the app. Then File › Open Folder… (Ctrl+Shift+O), or start it on
a folder:

```bash
pnpm --filter studio-desktop start -- --folder "C:\Github\Neogrids"
```

A file given on the command line opens its folder and then the file — which is
what a file association delivers. `STUDIO_FOLDER=<path>` works as well.
The app fetches nothing a document names from off this machine unless
`STUDIO_REMOTE_CONTENT=on`: without it the main process refuses every request
that is not the app's own files or the suite's ask worker on `127.0.0.1`
(`webRequest.onBeforeRequest`), and the page shows a placeholder where a
`.collection`'s picture or a markdown body's remote image would load. Links
still open in the browser by hand.

A folder opens on its **root memory**: the first `.memory` file sitting in the
root. A folder without one gets an empty `<folder>.memory` made for it on
open — an empty memory is the folder split itself, every sub-folder a focus and
the files beside them Everything else.

## How it works

- `main.cjs` owns the open folder and implements the suite's file-system
  contract over it (list / read / write / mkdir / rename / remove, bytes,
  the flat index) behind IPC. Every path the editors see is a store path from
  `/` — the open folder is the root — so document-relative references
  (`<stem>-assets/`, embeds, sources) resolve exactly as on the shared drive.
  Nothing can reach outside the folder.
- `preload.cjs` exposes that as `window.studioDesktop`.
- `apps/studio/frontend/src/desktop.tsx` wires the kit's adapters
  (`configureFileKinds`) to the bridge and mounts the App with a folder store.
  Bytes load through the `studio-local://` scheme.
- Ask panels reach the suite's ask worker at `127.0.0.1:9250` when it runs;
  otherwise they say so.
- The last folder reopens on the next start (`%APPDATA%/studio-desktop/studio.json`).

## The icon

`build/icon.ico` and `build/icon.png` (and the VS Code extension's `icon.png`)
are drawn by `scripts/make-icon.mjs` from the in-app logo — the primary-colour
rounded square with the layout glyph — with no image tooling. Re-run it after
changing the colour or the glyph; the window, the taskbar, the installer, the
Explorer entries and the file kinds all use it. The packaged `Studio.exe` gets
it from `scripts/after-pack.cjs` (standalone rcedit), since the build does not
edit the executable itself — see `win.signAndEditExecutable`.

## Open-with, without an installer

One-off, user-level file associations (HKCU) pointing at the workspace's Electron:

```powershell
powershell -ExecutionPolicy Bypass -File apps\desktop\scripts\register-dev-associations.ps1
```

Double-clicking any Studio document then opens the app on its folder with the
file, and right-clicking a folder (or the background of an open one) offers
**Open with Studio** — on Windows 11 under "Show more options", where VS Code's
entry sits. `-Remove` undoes it. Rebuild the renderer (`pnpm desktop:renderer`)
after Studio changes.

## Installer and Open-with

`pnpm --filter studio-desktop dist` builds an NSIS installer under `out/`
with file associations for every text kind (see `build.fileAssociations` in
`package.json`); double-clicking a `.frame` then opens the Studio on its
folder with that file. `build/installer.nsh` adds the folder entry ("Open with
Studio" on a folder and inside one) and removes it on uninstall. The installer
step downloads its tooling on first run.

## Dev loop

Run the Studio's Vite dev server and point the shell at it:

```bash
STUDIO_DEV_URL=http://localhost:9260/studio/desktop.html pnpm --filter studio-desktop start
```
