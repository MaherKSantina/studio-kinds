/* filekinds — the suite's file-kind registry and read-only viewers.
 * crosscut (shell, fs, decision engine) ← filekinds (kinds) ← tools. */

export { configureFileKinds, configuredAsk, configuredFs, configuredReader, readVirtualDirectoryFile } from "./api";
export type { FileReader, DirFileContent } from "./api";
export * from "./lib/filePreviews";
export * from "./openWith";

// Doc engines — pure, host apps use them for authoring and tests.
export * from "./lib/playbookDoc";
// The kanban board — its document, the edits behind its controls, its Ask.
export {
  parseKanban, emptyKanban, columnIndexOf, dependencyRows, dependentsOf, resolveBoardSource, scheduleTasks,
} from "./lib/kanbanDoc";
export type { KanbanBoardDoc, KanbanColumn, KanbanTask, ScheduledTask } from "./lib/kanbanDoc";
export * from "./lib/kanbanEdit";
export * from "./lib/kanbanAsk";
export * as playbookPlan from "./lib/playbookPlan";
export * from "./lib/planDoc";
export { parseGuide, dumpGuide, stepsAt, narrowing } from "./lib/guideDoc";
export type { GuideDoc, GuideStep } from "./lib/guideDoc";
export { parseBrief, dumpBrief } from "./lib/briefDoc";
export type { BriefDoc } from "./lib/briefDoc";
export type { FeatureNode } from "./lib/featureTree";
export { MarkdownPane } from "./lib/MarkdownPane";
export { parseAnnotations, annotationsPathFor } from "./lib/annotationsDoc";
export { annotationRendererFor, InlineFile } from "./lib/AnnotationContent";
export { DocumentPreview } from "./components/DocumentPreview";
export { VersionedFileView } from "./components/VersionedFileView";
export type { FileVersion } from "./components/VersionedFileView";
export { SplitNodeView } from "./components/SplitNodeView";
export * from "./lib/schemaDoc";
export * from "./lib/pointsDoc";
export * from "./lib/workupDoc";
export type { WorkupRunInfo } from "./components/workup/WorkupView";
export * from "./lib/projectDoc";
export * from "./lib/projectAsk";
export * from "./lib/fileTemplates";
export * from "./lib/listDoc";
export { parseJourneyStages, parseJourneyVariants, embedStages } from "./lib/journeyStages";
export type { JourneyStagesDoc, JourneyVariantsDoc, JStage as JourneyStage } from "./lib/journeyStages";
// The frame and flow kinds — engines. Their canvases, viewers and editors are NOT exported here:
// the registry lazy-loads them, and a host that needs one directly imports its file (or the
// "filekinds/catalog" subpath), so importing the kit never pulls Monaco, xyflow or MUI eagerly.
export * from "./lib/frameDoc";
export * from "./lib/frameEdit";
export * from "./lib/frameAsk";
export type { FrameCanvasProps } from "./components/frame/FrameCanvas";
// The flow kind — the legacy orchestration flow engine and surface, ported as they were.
// `When` stays the playbook's; the flow grammar's condition type is `FlowWhen` here.
export * from "./lib/flowEngine";
export type { When } from "./lib/playbookDoc";
export type { When as FlowWhen } from "./lib/flowEngine";
export * as flowOps from "./lib/flowOps";
export * from "./lib/flowAsk";
export * from "./lib/flowFrames";
export * from "./lib/studioDialog";
export { StudioDialog } from "./components/StudioDialog";
export { framePanelOf, mergeStatePanels, type FlowFramePanel } from "./lib/flowOps";
export type { FlowFocus } from "./components/flow/FlowKindView";
export { ITEM_FILE_TEMPLATES as FLOW_TEMPLATES, legacyTheme as flowTheme } from "./components/flow/flowHost";
// The document head as fields (title/description by line replacement), the
// kind icons every card and tree row draws, and the journey catalog page —
// what the Studio's welcome, generic editor and catalog are built from.
export * from "./lib/docHead";
export { KIND_ICONS, iconForFsPath } from "./components/kindIcons";
export * from "./components/definition/journeyCatalogData";

/** A host tells an open memory the store moved underneath (an entry made, removed or renamed); the view re-reads in place. */
export { STORE_CHANGED_EVENT } from "./components/memory/memoryLoad";
