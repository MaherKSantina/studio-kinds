/* crosscut — shared kit for the tool suite. */

// Decision tables (golden rules)
export * from "./decision/decisionTable";

// Hierarchical decision spaces + the DecisionPills component
export * from "./decisions/decisionSpace";
export * from "./components/DecisionPills";
export * from "./components/EventRow";
export * from "./lists/oneD";
export * from "./components/OneDList";
export * from "./components/SidePanel";
export * from "./panes/paneTrail";
export * from "./components/PaneTrail";
export * from "./diff/diffRules";
export * from "./annotations/annotations";
export * from "./components/AnnotationLayer";

// File system contract + adapters + rules
export * from "./fs/types";
export * from "./fs/memoryFs";
export * from "./fs/httpFs";
export * from "./fs/nameRules";
export * from "./fs/pickerRules";
export * from "./fs/entryRules";
export * from "./fs/versionedFile";
export * from "./fs/suiteApps";
export * from "./fs/handles";
export * from "./components/CopyHandle";

// Autosave
export * from "./autosave/autosaveRules";
export * from "./autosave/useAutosave";

// Components
export * from "./components/AppShell";
export * from "./components/FileBrowser";
export * from "./components/DirectoryTree";
export * from "./components/FilePickerDialog";

// UI primitives
export * from "./components/ui/button";
export * from "./components/ui/input";
export * from "./components/ui/label";
export * from "./components/ui/textarea";
export * from "./components/ui/dialog";
export * from "./components/ui/dropdown-menu";
export * from "./components/ui/tooltip";
export * from "./components/ui/badge";
export * from "./components/ui/scroll-area";
export * from "./components/ui/separator";
export * from "./components/ui/card";
export * from "./components/ui/table";
export * from "./components/ui/skeleton";
export * from "./components/ui/menubar";

export { cn } from "./lib/cn";
export * from "./components/NamePromptDialog";
export { useIsMobile } from "./lib/useIsMobile";

// Ask — the one model bridge every studio's Ask panel talks to, and the panel itself
export * from "./ask/askClient";
export * from "./components/AskPanel";
