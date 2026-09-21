# Studio for VS Code

The Studio's document PREVIEWS as a VS Code **custom editor**: open a `.flow`,
`.frame`, `.playbook`, `.project` (or any other Studio kind) with the Studio,
or keep the YAML in the text editor and open the Studio **preview to the
side**. Every kind opens as its preview — the same surface as the web Studio
and the desktop app since 2026-09-13; the YAML is changed in the text editor
or by an agent; VS Code owns
the document, so undo, redo, dirty state, save and hot exit are VS Code's.

## Try it

From the workspace root:

```bash
pnpm vscode:vsix
code --install-extension apps/vscode/studio-vscode-0.1.0.vsix
```

Then in VS Code, with a folder such as `C:\Github\Neogrids` open:

- click the **Open Preview to the Side** button in the editor title of a
  `.flow` (the same spot as Markdown's preview), or
- right-click a file in the Explorer → **Open with Studio**, or
- right-click → Open With… → **Studio** (and "Configure default editor" to
  make it the default for that kind).

A Studio tab has an **Open Source (text)** button to bring the YAML back beside it.

## How it works

- `extension.js` registers the custom editor for every text kind and three
  commands. The webview is `media/vscode.html`, the Studio renderer built with
  `vite build --mode vscode` (`apps/studio/frontend/src/vscode.tsx`).
- Edits flow both ways as whole documents: the surface posts the new text,
  the extension applies a `WorkspaceEdit`; a change made in the text editor
  goes to the webview as new content.
- Everything else a document reaches for — referenced files, screenshots
  beside it, uploads, the flat index for a `.memory` — goes through an RPC
  onto `vscode.workspace.fs`, rooted at the document's **workspace folder**
  (so remote workspaces work too). Store paths look exactly as on the shared
  drive: `/sub/file.frame`.
- Images and other bytes load through `webview.asWebviewUri` under the same
  root. The webview's CSP allows no script, style or font from anywhere but the
  bundle; the one network it may open is the suite's ask worker at
  `127.0.0.1:9250` when it runs. `img-src https:` is for a `.collection`'s item
  images, which live where the listing does — the host serving an image sees the
  request, as with any image viewer; a document that references no remote image
  makes no request.

## Development

`pnpm vscode:renderer` rebuilds `media/` after Studio changes. Open
`apps/vscode` in VS Code and press F5 for an Extension Development Host.
