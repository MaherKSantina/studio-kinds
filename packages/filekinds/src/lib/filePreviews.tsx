/**
 * THE FILE-KIND REGISTRY — one row per kind the suite can render.
 *
 * Every tool renders files through this table. Since 2026-09-12 ONE Studio
 * authors every text kind: `studioPath` names it for all of them (binary
 * kinds have none and are viewed only), and a kind with an authoring surface
 * of its own carries it in the `Editor` column — the Studio mounts it; kinds
 * without one get the Studio's generic editor (the interactive preview with
 * edits that persist, and the source). Adding a kind = a components/<kind>/
 * folder + one row here; every tool and the playbook's nested materials pick
 * it up at once. Viewers are READ-ONLY unless the host passes onChange.
 */
import React, { Suspense, lazy } from "react";
import { SUITE_APPS } from "crosscut";
import { MarkdownPane } from "./MarkdownPane";

export interface ViewerProps {
  content: string;
  height?: number | string;
  editable?: boolean;
  onChange?: (next: string) => void;
  onPersistNow?: (next: string) => void | Promise<void>;
  /** Absolute path of the document, used as the base for refs it contains. */
  agentId?: string;
  path?: string;
  hostAgentId?: string;
  hostPath?: string;
  /** Presentation context (a preview dialog): renderers that carry their own
   *  toolbar chrome hide it and show just the document. */
  chromeless?: boolean;
  /** The renderer IS the host's whole surface and may mirror its own
   *  navigation state (the selected item) into the page URL, so a reload
   *  restores it. Never set for embedded previews. */
  urlSync?: boolean;
  /** A viewer can ask its host to open deeper content as another pane (the
   *  PaneTrail drill contract). Hosts that don't drill omit it, and viewers
   *  fall back to inline expansion. */
  onDrill?: (pane: { key: string; title: string; render: () => React.ReactNode }) => void;
  /** Policy hosts: every element in the document is an ADDRESSABLE NODE, and
   *  the viewer decorates each piece of content with a jump icon calling
   *  this. Omitted = no icons. */
  onElementJump?: (el: { kind: "decision" | "event"; key: string; label: string }) => void;
  /** A viewer asks its host to open ANOTHER document (a memory's card, a folder). Hosts that
   *  navigate (the Studio, VS Code) pass it; without it, viewers link to Nodes. */
  onOpenPath?: (path: string) => void;
}

/** What a kind's EDITOR takes from the Studio: the text, the write-back, and
 *  where the document stands — for a frame kept inside a flow, a stand-in
 *  beside the flow whose FOLDER is what the canvas resolves against. */
export interface KindEditorProps {
  content: string;
  onChange: (next: string) => void;
  docPath: string;
}

export interface FileKindDef {
  /** Stable kind key. */
  key: string;
  /** Toolbar label for the rendered view. */
  label: string;
  /** Lowercased extensions (no leading dot). */
  extensions: string[];
  /** Path (on the suite origin) of the app that AUTHORS this kind — the one
   *  Studio for every text kind; null = bytes, viewed only. */
  studioPath: string | null;
  /** Bytes, not text: there is no source to edit anywhere. */
  binary?: boolean;
  Renderer: React.FC<ViewerProps>;
  /** The kind's own authoring surface in the Studio; absent = the Studio's
   *  generic editor (the interactive preview with edits that persist, and
   *  the source). */
  Editor?: React.FC<KindEditorProps>;
}

/** Back-compat alias for the ported orchestration components. */
export type FilePreview = FileKindDef;

const lazyViewer = (key: string, C: React.LazyExoticComponent<React.FC<ViewerProps>>): React.FC<ViewerProps> => {
  const L: React.FC<ViewerProps> = (props) => (
    <Suspense fallback={<div style={{ padding: 16, fontSize: 13, color: "#888" }}>Loading {key}…</div>}>
      <C {...props} />
    </Suspense>
  );
  return L;
};

const lazyEditor = (key: string, C: React.LazyExoticComponent<React.FC<KindEditorProps>>): React.FC<KindEditorProps> => {
  const L: React.FC<KindEditorProps> = (props) => (
    <Suspense fallback={<div style={{ padding: 16, fontSize: 13, color: "#888" }}>Loading the {key} editor…</div>}>
      <C {...props} />
    </Suspense>
  );
  return L;
};

const PlaybookR = lazyViewer("playbook", lazy(() => import("../components/playbook/PlaybookPreview")));
const PlanR = lazyViewer("plan", lazy(() => import("../components/plan/PlanPreview")));
const GuideR = lazyViewer("guide", lazy(() => import("../components/guide/GuidePreview")));
const BriefR = lazyViewer("brief", lazy(() => import("../components/brief/BriefViewer")));
const PointsR = lazyViewer("points", lazy(() => import("../components/points/PointsView")));
const ProjectR = lazyViewer("project", lazy(() => import("../components/project/ProjectView")));
const WorkupR = lazyViewer("workup", lazy(() => import("../components/workup/WorkupView")));
const DocListR = lazyViewer("list", lazy(() => import("../components/list/DocListView")));
const KanbanR = lazyViewer("kanban", lazy(() => import("../components/kanban/KanbanBoardView")));
const CalendarR = lazyViewer("calendar", lazy(() => import("../components/kanban/CalendarLensView")));
const HtmlR = lazyViewer("html", lazy(() => import("../components/html/HtmlViewer")));
const PdfR = lazyViewer("pdf", lazy(() => import("../components/pdf/PdfViewer")));
const DefinitionR = lazyViewer("definition", lazy(() => import("../components/definition/DefinitionView")));
const PolicyR = lazyViewer("policy", lazy(() => import("../components/policy/PolicyView")));
const SchemaR = lazyViewer("schema", lazy(() => import("../components/schema/SchemaView")));
const MemoryR = lazyViewer("memory", lazy(() => import("../components/memory/MemoryView")));
const TableR = lazyViewer("table", lazy(() => import("../components/table/TableView")));
const DataR = lazyViewer("jsonl", lazy(() => import("../components/data/DataTableView")));
const MiddlewareR = lazyViewer("middleware", lazy(() => import("../components/middleware/MiddlewareView")));
const CollectionR = lazyViewer("collection", lazy(() => import("../components/collection/CollectionView")));
const PipelineR = lazyViewer("pipeline", lazy(() => import("../components/pipeline/PipelineView")));
const PulseR = lazyViewer("pulse", lazy(() => import("../components/pulse/PulseView")));
const MovesR = lazyViewer("moves", lazy(() => import("../components/moves/MovesView")));
const ProgramR = lazyViewer("program", lazy(() => import("../components/program/ProgramView")));
const TableDiffR = lazyViewer("tablediff", lazy(() => import("../components/tablediff/TableDiffView")));
const FrameR = lazyViewer("frame", lazy(() => import("../components/frame/FrameViewer")));
const FlowR = lazyViewer("flow", lazy(() => import("../components/flow/FlowKindView")));
const ClipR = lazyViewer("clip", lazy(() => import("../components/music/ClipView")));
const SongR = lazyViewer("song", lazy(() => import("../components/music/SongView")));
const ScriptR = lazyViewer("script", lazy(() => import("../components/script/ScriptView")));
const ViewsR = lazyViewer("views", lazy(() => import("../components/views/ViewsView")));
const PageR = lazyViewer("page", lazy(() => import("../components/page/PageView")));

// Authoring surfaces — loaded only when the Studio mounts them.
const FrameE = lazyEditor("frame", lazy(() => import("../components/frame/FrameEditor")));
const FlowE = lazyEditor("flow", lazy(() => import("../components/flow/FlowAuthoring")));
const ProjectE = lazyEditor("project", lazy(() => import("../components/project/ProjectEditor")));

/** The one Studio — every text kind is authored there. */
const STUDIO = SUITE_APPS.studio.origin;

export const FILE_KINDS: FileKindDef[] = [
  { key: "markdown", label: "Markdown", extensions: ["md", "markdown", "mdx"], studioPath: STUDIO, Renderer: MarkdownPane },
  // Decisions, and the events that are live while they hold; the plan ranks
  // what to do next over playbooks; the guide walks one thing through.
  { key: "playbook", label: "Playbook", extensions: ["playbook"], studioPath: STUDIO, Renderer: PlaybookR },
  { key: "plan", label: "Plan", extensions: ["plan"], studioPath: STUDIO, Renderer: PlanR },
  { key: "guide", label: "Guide", extensions: ["guide"], studioPath: STUDIO, Renderer: GuideR },
  // Titled section tree; authored as YAML, renders everywhere, including
  // inside a playbook material.
  { key: "brief", label: "Brief", extensions: ["brief"], studioPath: STUDIO, Renderer: BriefR },
  // The stream under every document: literature -> distillation -> points
  // (stable identity, sourced keys, definition/instance roles). The preview
  // shows the chain as stages on one trail.
  { key: "points", label: "Points", extensions: ["points"], studioPath: STUDIO, Renderer: PointsR },
  // One document's examination: source + ordered steps, each landing one
  // output file of an ordinary kind. Authored as YAML since Workup Studio
  // was retired (2026-09-10).
  { key: "workup", label: "Workup", extensions: ["workup"], studioPath: STUDIO, Renderer: WorkupR },
  // The project container: a tree of typed items (icons, no extensions) plus
  // node references, over every tool's files. The Studio's project editor
  // is the old Projects app's whole surface.
  { key: "project", label: "Project", extensions: ["project"], studioPath: STUDIO, Renderer: ProjectR, Editor: ProjectE },
  // A LIST NODE: a list of documents that is an entity by itself — streams
  // write into it item by item (point targets item:0 … item:last), other
  // streams source a whole stage from it.
  { key: "list", label: "List", extensions: ["list"], studioPath: STUDIO, Renderer: DocListR },
  // A task board: columns are status, ROWS are derived dependency groups —
  // tasks layered by longest `needs:` chain, so what blocks sits above what
  // waits. A card opens its backing document by that document's own kind.
  { key: "kanban", label: "Kanban", extensions: ["kanban"], studioPath: STUDIO, Renderer: KanbanR },
  // A kanban board's DERIVED schedule on a month grid — a lens, not a
  // snapshot: dependency edges chain tasks backward from the due date on
  // every open, so the calendar can never drift from the board.
  { key: "calendar", label: "Calendar", extensions: ["calendar"], studioPath: STUDIO, Renderer: CalendarR },
  // A standalone page rendered as itself in a sandboxed iframe — CVs,
  // interactive explainers, exported designs. The file is the app.
  { key: "html", label: "Page", extensions: ["html", "htm"], studioPath: STUDIO, Renderer: HtmlR },
  // Binary bytes shown by the browser's own viewer over the host's raw
  // endpoint — the registry route for hosts that aren't the points shelf
  // (which special-cases PDFs itself).
  { key: "pdf", label: "PDF", extensions: ["pdf"], studioPath: null, binary: true, Renderer: PdfR },
  // A FIXED PROCESS with slots (definition role) or one project's adoption
  // of it (instance role: definition + fills). Renders as the laned DAG.
  // Authored as YAML since Definition Studio was retired (2026-09-10).
  { key: "definition", label: "Definition", extensions: ["definition"], studioPath: STUDIO, Renderer: DefinitionR },
  // A SINGLE-frame UI-design canvas: one screen plus a node hierarchy laid
  // out with CSS flexbox, views as UI states, versions as snapshots. Ported
  // from the legacy design model; the frame editor is its Studio surface.
  { key: "frame", label: "Frame", extensions: ["frame"], studioPath: STUDIO, Renderer: FrameR, Editor: FrameE },
  // A PARAMETERISED walkthrough: screens with variants picked by closed
  // dimensions, controls that are offered / lead / dispatch / assign, and a
  // finite space so coverage is computable. The legacy orchestration flow
  // surface, ported as it was; authoring = the same surface with Ask beside it.
  { key: "flow", label: "Flow", extensions: ["flow"], studioPath: STUDIO, Renderer: FlowR, Editor: FlowE },
  // A deterministic input → switch → bucket machine: typed params, ordered
  // filter cases (first match wins), mutually exclusive buckets.
  { key: "policy", label: "Policy", extensions: ["policy"], studioPath: STUDIO, Renderer: PolicyR },
  // The SHAPE half of a structured node (`*.node` folder): a type (kanban,
  // gantt, …) plus entries with stable ids the content half references.
  // Drawn by its type; unknown types render the entries generically.
  { key: "schema", label: "Schema", extensions: ["schema"], studioPath: STUDIO, Renderer: SchemaR },
  // WORKING MEMORY over the flat store: decisions + answers as retrieval
  // cues — answered decisions filter the node set, the first unanswered one
  // groups it, and the assignment saves back into the file. A saved query,
  // never a container: it owns no nodes.
  { key: "memory", label: "Memory", extensions: ["memory"], studioPath: STUDIO, Renderer: MemoryR },
  // Tabular files rendered as THEMSELVES — an A1 grid of cells and rows,
  // like the pdf kind renders pages. Text tables parse in place; workbooks
  // decode from the host's raw-bytes endpoint (sheet tabs when several).
  { key: "csv", label: "Table", extensions: ["csv", "tsv"], studioPath: STUDIO, Renderer: TableR },
  { key: "xlsx", label: "Workbook", extensions: ["xlsx", "xls"], studioPath: null, binary: true, Renderer: TableR },
  // DATA ROWS — one JSON object per line, as a table whose columns are FOUND
  // (the union of keys, first-seen order): paged, searched across every
  // field, sorted by a header click, a row opened whole. A directive line
  // (`$sources`, `$policy`) composes the rows LIVE from other files through
  // a table policy (a .policy with role: table) — never cached.
  { key: "jsonl", label: "Data", extensions: ["jsonl"], studioPath: STUDIO, Renderer: DataR },
  // MIDDLEWARE — rows amended on their way to a view: a source, and rules
  // that pick rows by clauses and set fields on them ("this listing's page
  // said not available"). A .jsonl names it among its $sources instead of
  // the raw file; read live through the chain, never cached.
  { key: "middleware", label: "Middleware", extensions: ["middleware"], studioPath: STUDIO, Renderer: MiddlewareR },
  // COLLECTION — a snapshot of a view's rows to decide over one at a time: a
  // gallery flow with each item's images, facts, link and directions; push
  // up / push down / hide with a reason, appended to the file's log at once.
  { key: "collection", label: "Collection", extensions: ["collection"], studioPath: STUDIO, Renderer: CollectionR },
  // PIPELINE — one curated list in the file, the stages that transform it
  // (rules that set fields, a filter, a sort — each under a circumstance the
  // decisions name) and the views that show the output. The rows as of any
  // stage, and the logic that made them, one click apart; nothing cached.
  { key: "pipeline", label: "Pipeline", extensions: ["pipeline"], studioPath: STUDIO, Renderer: PipelineR },
  // CODE AS EXECUTION — a bounded transformer with a declared store contract
  // (inputs in, outputs back) and a Run button. The journey references it as
  // a step; the person presses play; the result is an ordinary node.
  { key: "program", label: "Program", extensions: ["program"], studioPath: STUDIO, Renderer: ProgramR },
  // Two tables diffed LIVE by key — green rows only in the left (proposed)
  // table, red only in the right (base), amber cells for changed values.
  // A lens, not a snapshot: it recomputes from its sources on every open.
  { key: "tablediff", label: "Diff", extensions: ["tablediff"], studioPath: STUDIO, Renderer: TableDiffR },
  // A memory's MOVEMENT: arrivals per focus per day (derived live from the
  // store's timestamps) + the attention trail (the memory's journal). Points
  // at a `.memory`; caches nothing.
  { key: "pulse", label: "Pulse", extensions: ["pulse"], studioPath: STUDIO, Renderer: PulseR },
  // A memory's MOVEMENT LOG, harvested by looking: each open diffs the live
  // "unit → answer path" mapping against the snapshot in its own tail and
  // appends what changed — nodes moving between foci, answers parked under
  // Everything else or retrieved. Points at a `.memory`.
  { key: "moves", label: "Moves", extensions: ["moves"], studioPath: STUDIO, Renderer: MovesR },
  // MUSIC — a clip is the NOTES of one MIDI clip (pitches by name or
  // number, beats, velocities, drum lanes as step strings), drawn as a
  // piano roll; a song places clips on tracks, drawn as an arrangement.
  // Both export a Standard MIDI File beside themselves — the song's is
  // multi-track, one named track per song track: the Ableton handover.
  { key: "clip", label: "Clip", extensions: ["clip"], studioPath: STUDIO, Renderer: ClipR },
  { key: "song", label: "Song", extensions: ["song"], studioPath: STUDIO, Renderer: SongR },
  // A SCRIPT as a document: the code, its interpreter and the environment
  // variables the run gets, read before it runs; Run starts it on the host.
  { key: "script", label: "Script", extensions: ["script"], studioPath: STUDIO, Renderer: ScriptR },
  // ONE LIST of items and the views over it — a table, and a kanban, a
  // calendar, a gantt and a tree as the roles the file names allow. Read only.
  { key: "views", label: "Views", extensions: ["views"], studioPath: STUDIO, Renderer: ViewsR },
  // A PAGE made from its own data: a Nunjucks template, its model and its
  // partials, rendered inside the sandboxed frame an `.html` file opens in.
  { key: "page", label: "Page", extensions: ["page"], studioPath: STUDIO, Renderer: PageR },
];

export const extensionOfPath = (path: string): string => {
  const i = path.lastIndexOf(".");
  const j = path.lastIndexOf("/");
  return i <= j ? "" : path.slice(i + 1).toLowerCase();
};

export function kindForPath(path: string): FileKindDef | undefined {
  const ext = extensionOfPath(path);
  return FILE_KINDS.find((p) => p.extensions.includes(ext));
}

/** Ported name — the orchestration components call it this. */
export const previewForPath = kindForPath;
