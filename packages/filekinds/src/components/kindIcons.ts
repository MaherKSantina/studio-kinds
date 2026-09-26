/**
 * One icon per FILE KIND — shared by every surface that draws a node as a
 * card or tree row (ProjectView's item tree, MemoryView's node cards). Kept
 * beside the components because icons are presentation, not document model.
 */
import {
  Activity, AlignLeft, AppWindow, ArrowRightLeft, BookOpen, Boxes, Brain, CalendarDays, CircleDot, Database, File as FileIcon, FileText, Folder, Frame,
  GalleryHorizontal, GitCompareArrows, Layers, List as ListIcon, ListChecks, ListMusic, Music, Package, Replace, Route, Shapes, SlidersHorizontal, Kanban, SquareTerminal, Stethoscope, Table, Waypoints, Workflow,
  LayoutGrid, LayoutTemplate, ScrollText,
} from "lucide-react";
import { isStructuredName } from "crosscut";
import { previewForPath } from "../lib/filePreviews";

export const KIND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  playbook: Waypoints,
  plan: ListChecks,
  guide: BookOpen,
  brief: AlignLeft,
  points: CircleDot,
  markdown: FileText,
  list: ListIcon,
  kanban: Kanban,
  calendar: CalendarDays,
  workup: Stethoscope,
  html: AppWindow,
  definition: Workflow,
  policy: SlidersHorizontal,
  project: Package,
  schema: Shapes,
  memory: Brain,
  csv: Table,
  xlsx: Table,
  jsonl: Database,
  middleware: Replace,
  collection: GalleryHorizontal,
  pipeline: Layers,
  program: SquareTerminal,
  tablediff: GitCompareArrows,
  pulse: Activity,
  moves: ArrowRightLeft,
  frame: Frame,
  flow: Route,
  clip: Music,
  song: ListMusic,
  script: ScrollText,
  views: LayoutGrid,
  page: LayoutTemplate,
};

/** The icon for a PATH on the shared fs: structured nodes read as one boxed
 *  document whatever their fs kind; plain folders as folders; files by their
 *  registry kind. */
export function iconForFsPath(path: string, kind: "folder" | "file"): React.ComponentType<{ className?: string }> {
  if (isStructuredName(path)) return Boxes;
  if (kind === "folder") return Folder;
  const k = previewForPath(path);
  return (k && KIND_ICONS[k.key]) || FileIcon;
}
