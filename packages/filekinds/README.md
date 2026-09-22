# filekinds

The suite's file-kind layer: one registry, a viewer per kind, an EDITOR for
the kinds that have one, and the doc engines behind them. Sits between
crosscut and the tools:

    crosscut (shell, fs, decision engine)  ←  filekinds (kinds)  ←  tools

Kinds today: markdown, playbook, plan, guide, brief, points, workup, project,
list, kanban, calendar, html, pdf, definition, frame, flow, policy, schema,
memory, csv/xlsx, jsonl (data rows — raw, or composed live through a policy's table role), middleware (rows amended on their way to a view), pipeline (one curated list, its stages and its views, in one file), collection (a snapshot to decide over), program, tablediff, pulse, moves, clip (the notes of one MIDI clip, a piano roll) and song (clips on tracks, an arrangement) — both export a Standard MIDI File beside themselves, the song's multi-track for Ableton. Every text kind is
authored in the one **Studio** (`apps/studio` in this workspace, mounted at /studio);
binary kinds (pdf, xlsx) are viewed only. The catalog Storybook runs on :9140
(`npm run storybook`) and is served on the domain at **/kinds/** as a static
build (`npm run build-storybook`, hosted by mc-server).

**Versions.** A kind that changes shape carries `version: N` at the top of the file
(`src/lib/docVersion.ts`): absent means 1, every version stays readable as it was, and a
version the engine does not know is named by the checker and never written back. Today
only `.playbook` is versioned — version 1 is decisions, events, topics and rules, with
content entries as files beside the book (`file`, varying `by` answer as
`<file>.variants/...`); version 2 is decisions and events (an event carries its own `when` and
`hint`), and every event shows one document in the book
(`content: {kind, doc}`), so a version-2 book is one file, and its walk is session-only:
nothing clicked is ever saved. A `.brief` section holds the same shape — one document of any
kind, written in under its prose (`src/lib/writtenDocument.ts` is the shape both share).
The pure engines (`playbookDoc`, `briefDoc`, `docVersion`, the decision space) are
mirrored into the public `studio-kinds` repository by `pnpm kinds:sync` from `suite/`.

## The contract

- The **Studio** authors every text kind (`studioPath` in the registry,
  rendered into the `open-with` golden table). Every OTHER tool opens the
  same file **read-only** through the registry — the nodes explorer does
  this for all kinds via its Preview tab.
- A kind with an authoring surface of its own fills the registry's `Editor`
  column (`KindEditorProps` = `content`, `onChange`, `docPath`); the Studio
  mounts it. Kinds without one get the Studio's generic editor: the
  interactive preview (edits persist) and the source. Editors today: frame,
  flow, project.
- Viewers and editors reach the store through ONE host-configured adapter:

      configureFileKinds({ readFile, listFiles, writeFile, writeBinary, mkdir,
                           renameFile, removeFile, indexFiles, runProgram,
                           rawFileUrl, ask })

  Tools point it at the nodes worker; Storybook and tests point it at an
  in-memory fixture tree. The package never touches storage itself. Inside
  the package `configuredFs()` composes the pieces into a crosscut
  `FileSystemAdapter` for picker dialogs, and `configuredAsk()` is the model
  bridge for Ask panels (absent = the panel says so instead of rendering).

## Adding a file kind

1. `src/lib/<kind>Doc.ts` — lenient parse (+ dump if authored), pure.
2. `src/components/<kind>/<Kind>Viewer.tsx` — read-only renderer taking
   `ViewerProps` (`content`, `agentId` = the document's absolute path for refs).
3. One row in `src/lib/filePreviews.tsx` (`FILE_KINDS`) — extensions;
   `studioPath` is the Studio for text, null plus `binary: true` for bytes.
4. Optional: `src/components/<kind>/<Kind>Editor.tsx` taking `KindEditorProps`,
   lazy-loaded into the row's `Editor` column — only when the generic
   preview-plus-source editor is not enough.
5. Optional: a template in `src/lib/fileTemplates.ts` plus a `TEMPLATE_KINDS`
   entry, so the Studio (and the project Ask) can start one.
6. A story in `stories/` and golden tests in `src/logic/`.
7. Rebuild the catalog: `npm run build-storybook`.

Nothing else: the nodes Preview tab, the Studio, the playbook's nested
content, and open-with routing all read the registry.

## Logic

- `src/components/playbook/eventDetailRules.ts` — the `event-detail` golden
  table: an expanded event shows ONE thing. Its single `content` file renders
  BARE (no header, no box, no prose above it); inline `hint` (version 2) or rule `process` (version 1) prose is the
  fallback for events without a file; several files keep their headers;
  compare mode shows everything because the diff is the point.
- `src/lib/compositeDoc.ts` — the `stream-status` golden table for `type:
  composite` structured nodes: one entity assembled from streams, each judged
  by WHO authors its changes. Observed streams age against their declared
  cadence; derived streams go "input moved" the moment their `of:` stream
  outruns them; authored streams are the primary record and cannot go stale;
  empty and driverless streams say so instead of pretending. The fold
  (`compositeStreams`) accretes `content.list` arrivals per stream, later
  rows winning; `at:`/`of:`/`rules:` are arrival metadata, not payload.
  `flattenStreamFields` exposes the folded slices as clause-ready fields
  (`tags.platform`, `status.status`, meta under `<stream>._status`).
- `src/lib/memoryDoc.ts` — the `.memory` kind: WORKING MEMORY as a saved
  query over the flat node store (`readNodeIndex` in api.ts; per-entry facts
  from `src/lib/nodeIndex.ts`). `include` clauses admit units, decisions
  (the ranking's decisions block, plus decisionSpace `activates`/`when`
  hierarchy) derive each unit's answers, `locks` are the answers taken —
  saved in the file via `writeLocks`, head preserved byte-for-byte. Answered
  decisions FILTER, the first unanswered active one GROUPS, unanswerable
  units land in a visible residue. A memory owns no nodes: nothing moves
  when attention moves, and a node in no memory is just unmatched.
  OVER A FOLDER (the desktop app, VS Code): a memory looks at the folder it
  sits in (`scope:` widens it — `/` is the whole store); its units are the
  documents under it (never plain folders or `.memory` files). With no
  decisions — an empty file will do — the sub-folders are the foci and the
  files sitting directly in the folder are Everything else; taking a focus
  brings that folder's own split onto the table: the first `.memory` inside
  it when there is one, its sub-folders otherwise (`memoryOverFolder`,
  `folderSpace`; `components/memory/memoryLoad.ts` reads the store).
- `src/lib/frameDoc.ts` + `frameEdit.ts` — the `.frame` kind: ONE frame, a
  node tree laid out with flexbox (hug / fixed / expand, cross axis
  stretches), views as hidden-id sets, versions as full snapshots, embeds
  with slot injection. `components/frame/FrameCanvas.tsx` is the layout
  engine (the browser's flexbox, one div per node); the studio edits through
  the pure functions in `frameEdit.ts`. Every dump opens with `FRAME_LEGEND`
  (the file explains its own vocabulary — it is a handover artifact).
  `frameAsk.ts` is the live-edit vocabulary: the system prompt, the closed
  JSON schema of OPS a small model answers with, and `applyFrameOps`, which
  turns them into the same pure edits (golden: `frameAsk.golden.test.ts`).
  The transport is the suite's `ask-worker` (:9250) behind crosscut's
  `askApi` + `AskPanel`; the prompt never leaves this package.
- `src/lib/flowAsk.ts` — the same for a `.flow`: ops on screens, states,
  controls, dimensions and locals, applied through `flowOps`' mutators on
  the model half only (golden: `flowAsk.golden.test.ts`). A flow state may
  show a FRAME at one of its views (`FlowPanel` kind `frame`, golden:
  `flowFrame.golden.test.ts`), drawn live by `FrameCanvas` inside
  `FlowContentPane`. `flowFrames.ts` keeps whole frames INSIDE a flow
  (`frames:` by name): `moveFrameIntoFlow` is the pure text transform behind
  the directory view's "Move into flow…" and the project Ask's
  `move_into_flow` (write the flow, then remove the file). A moved frame is
  a SCREEN of the flow: states that showed the file are re-pointed at the
  name, and when none did a new screen showing it is added
  (`addScreenForInlineFrame`, also the Frames tab's "Add as a screen");
  `removeInlineFrameFromDoc` takes one out again. `inlineFrameText` /
  `withInlineFrameText` are how Frame Studio edits one in place (golden:
  `flowFrames.golden.test.ts`). `FlowFramesList` is the preview's Frames tab.
- `src/lib/studioDialog.ts` + `components/StudioDialog.tsx` — a studio
  opened from inside another app (`openInStudio`, `studioUrlFor`) runs in a
  DIALOG (an iframe) when the host mounts `StudioDialog`, in a new tab
  otherwise; the host flushes its unsaved edits on open and re-reads the
  file on close. Nodes, Flow Studio and the Projects directory mount it.
- `src/lib/projectAsk.ts` + `fileTemplates.ts` — a project folder's Ask:
  create files from each kind's template, folders, renames; a PURE plan
  (`planProjectOps`) then effects through the host (`runProjectPlan`);
  nothing deletes — deleting is a person's click: the directory view's
  "Delete…" on a file and the trash on a targeted folder, each behind a
  confirm, through the host's `removeFile` (golden: `projectAsk.golden.test.ts`). `ProjectView`'s
  directory mode shows the panel when the host configured `ask`; the LAST
  click in the tree is the target — a folder, or a file (then "it" means
  that file, its first lines go to the model, bare names land beside it).
  Paths with a slash are tree paths (root-relative); the picked file also
  lives in the URL (`?file=`) so a reload reopens it.
- `src/lib/flowOps.ts` + `flowEngine.ts` + `components/flow/` — the `.flow`
  kind: the legacy orchestration flow engine (the worker's `flow_ops.ts`,
  verbatim), its browser half (views document, typed diff, revert/promote)
  and its whole surface (Raw/Preview host, Screens/Map/Missing, the walk,
  the dialogs), ported unchanged. `components/flow/flowHost.ts` is the one
  adapter: a directory agent is the flow's folder in the store, screenshot
  keys are paths under it, uploads go through the host's `writeBinary`.
- `src/lib/projectDoc.ts` — a project's MODE: `directory` (the project IS a
  folder — `root`), `memory` (a `.memory` lens over it — `memory`), or the
  item tree. `writeProjectTop` flips by line surgery; `memoryDoc.ts`'s
  `newProjectMemory` / `addValue` / `assignUnit` / `addSubFocus` /
  `writeDecisions` are the lens authoring the memory view exposes to a
  project host (`authoring`), replacing only the `decisions:` block.
- `src/openWith.ts` — golden table GENERATED from the registry (kind → studio).
- `src/logic/*.golden.test.ts` — playbook engine, brief parse, registry shape.
- Doc engines: playbookDoc / playbookPlan / planDoc / guideDoc / briefDoc /
  decisionSpace — pure, imported by studios for authoring.

## Type scale (audited 2026-09-12)

UI chrome across the kit and the apps sits on one scale, and nothing renders
below it — the desktop app has no browser zoom to lean on:

| role | size | examples |
| --- | --- | --- |
| micro | 12px | chips, uppercase section labels, ids, kind badges |
| caption / meta | 13px | secondary rows, hints, tooltips' body |
| body / controls | 14px | list rows, inputs, buttons, prose in panes |
| titles | 15–20px | pane titles, page headings |

Rules: no text under 12px anywhere in UI chrome; a MUI `Chip` box is at least
20px tall (12px text needs it); the flow surface's MUI theme pins `caption` and
`overline` to 12px because MUI scales them off the 13px base. What a document
DRAWS (the frame canvas, rendered markdown) keeps the sizes the author chose.
The audit that enforced this raised 792 declarations in 75 files; re-run
`node scratch typescale-codemod` style checks by grepping for `text-[1?[0-9](\.5)?px]`
and `fontSize: (?:[0-9]|1[01])(\.5)?\b` before adding new surfaces.
