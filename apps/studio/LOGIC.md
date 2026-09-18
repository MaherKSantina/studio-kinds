# Studio — where the logic lives

The shell (frontend/src/App.tsx) decides nothing about documents. Every
behaviour comes from a table or a pure module:

| behaviour | where |
| --- | --- |
| which surface a document gets (the preview for every text kind / bytes) | `studio-surface` — `frontend/src/lib/surfaceRules.ts` (golden: `surfaceRules.golden.test.ts`) |
| what the URL shows: welcome, a document, a frame inside a flow, the catalog | `frontend/src/lib/studioUrl.ts` (tests: `studioUrl.test.ts`) |
| the folder entry's start page: the root memory — the first `.memory` in the root, else a virtual one this browser keeps | `frontend/src/lib/folderHome.ts` (tests: `folderHome.test.ts`); the surface `frontend/src/components/HomeMemory.tsx`, mounted by App when the store carries `homeMemory` |
| which kinds a document can be started as | `frontend/src/lib/kinds.ts` over filekinds `TEMPLATE_KINDS` (tests: `kinds.test.ts`) |
| the preview every document opens as: name strip (Diff, Notes), the kind's renderer, interactions persisting | filekinds `components/DocumentPreview.tsx`, mounted by `frontend/src/components/KindSurface.tsx` |
| a fresh document's text | filekinds `lib/fileTemplates.ts` (`fileTemplate`, `newProjectText`) |
| which app authors a kind (nodes' "Open in Studio") | `open-with` — `filekinds/src/openWith.ts`, generated from the registry |
| a frame kept inside a flow: read out, write back | filekinds `lib/flowFrames.ts` (`inlineFrameText`, `withInlineFrameText`; golden: `flowFrames.golden.test.ts`) |
| the journey catalog | filekinds `components/definition/journeyCatalog.ts` (golden: `journeyCatalog.golden.test.ts`) + `JourneyCatalog.tsx` |
| Ask (frame, flow, playbook): what the model is told, the closed ops, applying a reply | filekinds `lib/frameAsk.ts`, `flowAsk.ts`, `playbookAsk.ts` (golden tests in `src/logic/`); transport = `C:/Github/ask-worker` |
| Export handover (frame): view → PNG, the YAML copy, the page | filekinds `lib/frameHandover.ts` (rendering host: `HiddenRender` in `FrameEditor.tsx`) |
| picker rows, legal names, autosave chip | crosscut tables `picker-row`, `fs-name`, `autosave` |
| where documents live (drive vs folder) | `frontend/src/store.ts` — `StudioStore`; web = `main.tsx` (nodes worker), desktop = `desktop.tsx` over `lib/desktopFs.ts` (the shell bridge, `apps/desktop/main.cjs`) |
| a frame edited from inside a flow (inline or a file beside it) | filekinds `components/flow/FrameEditDialog.tsx`, wired through FlowPreview → FlowScreenPage → FlowContentPane / FlowFramesList |

Golden tests: `npm test` here, in `../crosscut` and in `../filekinds`.
