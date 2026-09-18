/**
 * Lazy-loading folder tree (the Explorer left rail). Folders load children on
 * first expand; files are optional. Selection reports the full entry.
 */
import * as React from "react";
import { Boxes, ChevronDown, ChevronRight, File as FileIcon, FileClock, Folder } from "lucide-react";
import { cn } from "../lib/cn";
import { FileSystemAdapter, FsEntry } from "../fs/types";
import { presentEntry } from "../fs/entryRules";

interface TreeNodeProps {
  fs: FileSystemAdapter;
  entry: FsEntry;
  depth: number;
  showFiles: boolean;
  selectedPath?: string | null;
  onSelect: (entry: FsEntry) => void;
  refreshKey?: number;
}

function TreeNode({ fs, entry, depth, showFiles, selectedPath, onSelect, refreshKey }: TreeNodeProps) {
  const [open, setOpen] = React.useState(false);
  const [children, setChildren] = React.useState<FsEntry[] | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let stale = false;
    fs.list(entry.path).then((es) => { if (!stale) setChildren(es); }, () => { if (!stale) setChildren([]); });
    return () => { stale = true; };
  }, [fs, entry.path, open, refreshKey]);

  const isSel = selectedPath === entry.path;
  // The entry-presentation table decides folder vs file vs versioned file —
  // a versioned file is a FOLDER on the fs but reads as one document here.
  const pres = presentEntry(entry);
  return (
    <div>
      <button
        type="button"
        style={{ paddingLeft: depth * 14 + 4 }}
        className={cn(
          "flex w-full items-center gap-1 rounded px-1 py-1 text-left text-sm",
          isSel ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
        )}
        onClick={() => { onSelect(entry); if (pres.expands) setOpen((o) => !o); }}
      >
        {pres.expands ? (
          open ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {pres.presents === "folder"
          ? <Folder className="size-4 shrink-0 fill-info/15 text-info" />
          : pres.presents === "versioned"
            ? <FileClock className="size-4 shrink-0 text-primary" />
            : pres.presents === "structured"
              ? <Boxes className="size-4 shrink-0 text-primary" />
              : <FileIcon className="size-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      </button>
      {open && children !== null && (
        <div>
          {children
            .filter((c) => showFiles || presentEntry(c).presents === "folder")
            .map((c) => (
              <TreeNode key={c.path} fs={fs} entry={c} depth={depth + 1} showFiles={showFiles}
                selectedPath={selectedPath} onSelect={onSelect} refreshKey={refreshKey} />
            ))}
        </div>
      )}
    </div>
  );
}

export interface DirectoryTreeProps {
  fs: FileSystemAdapter;
  showFiles?: boolean;
  selectedPath?: string | null;
  onSelect: (entry: FsEntry) => void;
  refreshKey?: number;
  /** Where the tree starts. Default "/" — a project view roots at the project. */
  rootPath?: string;
  /** Render the clickable root row above the entries. Default true. */
  showRoot?: boolean;
  className?: string;
}

export function DirectoryTree({ fs, showFiles = false, selectedPath, onSelect, refreshKey, rootPath = "/", showRoot = true, className }: DirectoryTreeProps) {
  const [roots, setRoots] = React.useState<FsEntry[] | null>(null);
  React.useEffect(() => {
    let stale = false;
    fs.list(rootPath).then((es) => { if (!stale) setRoots(es); }, () => { if (!stale) setRoots([]); });
    return () => { stale = true; };
  }, [fs, refreshKey, rootPath]);

  return (
    <div className={cn("min-h-0 overflow-y-auto p-1", className)}>
      {showRoot && (
        <button
          type="button"
          className={cn(
            "mb-0.5 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm font-medium",
            selectedPath === rootPath ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
          )}
          onClick={() => onSelect({ path: rootPath, name: rootPath === "/" ? "Files" : rootPath.slice(rootPath.lastIndexOf("/") + 1), kind: "folder" })}
        >
          <Folder className="size-4 fill-info/15 text-info" /> {rootPath === "/" ? "Files" : rootPath.slice(rootPath.lastIndexOf("/") + 1)}
        </button>
      )}
      {(roots ?? [])
        .filter((c) => showFiles || presentEntry(c).presents === "folder")
        .map((r) => (
          <TreeNode key={r.path} fs={fs} entry={r} depth={0} showFiles={showFiles}
            selectedPath={selectedPath} onSelect={onSelect} refreshKey={refreshKey} />
        ))}
    </div>
  );
}
