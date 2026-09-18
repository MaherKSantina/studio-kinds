# Studio

ONE authoring app for every file kind of the suite — on the web over the shared
nodes file system, and as a DESKTOP APP over any folder on disk (`apps/desktop`,
`pnpm desktop` at the workspace root; entry `src/desktop.tsx`, built with
`vite build --mode desktop`). The App takes a `StudioStore` (`src/store.ts`) and
never knows which. It replaced the per-kind studios on 2026-09-12 — Playbook,
Points, Frame, Flow, Policy and Journey Studio and the Projects app — which
each carried a whole frontend stack for one editor.

- frontend :9260 (`pnpm dev`, in the `C:Githubsuite` workspace), Vite base `/studio/`; **no worker of its own**
  — files through the nodes worker (`/studio/nodes-api` → :9111), the Ask
  panels through the suite's ask worker (`/studio/ask-api` → :9250), recents
  in the browser.
- served at `http://localhost:9190/studio/` and publicly at
  `https://orchestration-digitalsymphony.ngrok.pizza/studio/` (suite-router).
  The retired prefixes (`/frame/`, `/flow/`, `/playbook/`, `/points/`,
  `/policy/`, `/journey/`, `/projects/`) redirect here with their query.
- deep links: `/studio/?path=/Design/dashboard.frame`; a frame kept inside a
  flow: `/studio/?path=/Design/checkout.flow&frame=login` (edited in place,
  saves go back into the flow; Save as / Rename are off for it); the journey
  catalog: `/studio/?catalog=journey&story=steps-stage`.
- **a folder on disk, in the browser — the front door**: `/studio/folder.html`
  (entry `src/folder.tsx`) is the same App over the folder worker
  (`apps/folder-worker`, `/studio/folder-api` → :9112), which serves ONE folder
  — Mission Control starts it on `C:/Github` — and the router serves this page
  as the domain root, so `https://orchestration-digitalsymphony.ngrok.pizza/`
  IS it (`/?path=/x.flow` is a deep link into the folder; the same page reached
  directly is `/studio/folder.html?path=…`). Its start page is the folder's
  ROOT MEMORY (`StudioStore.homeMemory`, `components/HomeMemory.tsx`): the
  first `.memory` in the root when there is one, else a virtual memory this
  browser keeps (`lib/folderHome.ts`, tested) — every sub-folder a focus, the
  files beside them Everything else, exactly what an empty `.memory` shows on
  the desktop and in VS Code, with nothing written into the folder unasked. It
  reads LAZILY: one listing of where you are, one more per folder pill taken,
  nothing under the folders not taken (filekinds `memoryLoad.ts`) — over
  `C:\Github` that is 50 pills and 9 files from one call, not a 13,000-row index.
  A search field above the pills filters the foci by name. **Prepare for Claude
  Code** (a button on any memory whose host can write) writes a `CLAUDE.md` beside
  it — a pointer at the master playbook's guide, the which-kind-for-what answer, the checker — so a
  Claude Code session started in that folder, even an empty one, knows the Studio;
  `C:\Github\CLAUDE.md` already covers every folder under it. **Remote control**
  (a chip in the start page's corner, `components/RemoteControl.tsx`, mounted by
  the folder entry alone as `StudioStore.homeActions`) shows the `claude rc`
  servers alive on the PC and restarts them through the folder worker
  (`api/remote-control`, `remote-control.ps1` at the checkout's root): the way
  back in when the Claude app's link to the PC has dropped while Maher is out. A
  change on disk streams in as a server-sent event: the open document re-reads
  itself, the start page re-reads the store (a folder made in the file manager
  shows up as a focus), and a `.memory` made in the root takes over as the
  start page. Its own page rather than a `?store=` flag because the App
  rebuilds the query on every navigation (`lib/studioUrl.ts`).

## How a document opens

The extension picks the surface (golden table `studio-surface`):

| kind | surface |
| --- | --- |
| every registered text kind — frame, flow, playbook, project included | the kind's **preview** (`DocumentPreview`: the name strip with Diff for playbooks and Notes when annotated, the kind's renderer under it) — the surface a memory's card shows. No editor, no source pane. What the preview offers (a lock taken in a memory, a box ticked in a list) still persists |
| `.pdf`, `.xlsx` | bytes — a pointer to Nodes |
| unregistered extension | its text, inside the preview |

Since 2026-09-13 this is the one surface in EVERY host — the web Studio over the
drive or a folder, the desktop app, the VS Code extension. Documents are changed
by an agent (the chat) on the store, and the open preview re-reads them as they
land. The registry's `Editor` column (frame, flow, playbook, project) stays
authored and tested; the Studio no longer mounts it.

What a kind looks like here is its `Renderer` in the registry
(`filekinds/src/lib/filePreviews.tsx`); nothing in this app changes when a
kind is added. Its `Editor` column, when filled, is not mounted by the Studio. A new
kind the Studio can *start* is one entry in filekinds `TEMPLATE_KINDS` plus
its template.

## The welcome page

New <kind> for every startable kind, Open…, the recent list, the projects
(cards read live from `/projects`, "New project" creates the `.project` and
the folder it stands on), and the journey catalog.

## Where the logic lives

See `LOGIC.md`. The kit does the work: `crosscut` (shell, pickers, autosave,
Ask panel) ← `filekinds` (every kind's model, viewer and editor) ← this app.
