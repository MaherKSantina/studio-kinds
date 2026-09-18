/**
 * One folder of the shared file system, as a navigable listing.
 *
 * Presentation only: what a row DOES comes from `pickerRules` (selection,
 * double-click, dimming) and the caller's callbacks. The same component backs
 * the nodes explorer (`mode="browse"`) and both picker modes in the dialog.
 */
import * as React from "react";
import { ChevronRight, File as FileIcon, Folder, FolderOpen, RefreshCw } from "lucide-react";
import { cn } from "../lib/cn";
import { decide } from "../decision/decisionTable";
import { pickerRules } from "../fs/pickerRules";
import { FileSystemAdapter, FsEntry, extensionOf } from "../fs/types";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

export interface FileBrowserProps {
  fs: FileSystemAdapter;
  path: string;
  onNavigate: (path: string) => void;
  mode: "open" | "save" | "browse";
  /** Lowercased extensions the current app understands; empty/undefined = all. */
  extensions?: string[];
  selected?: FsEntry | null;
  onSelect?: (entry: FsEntry | null) => void;
  /** A row was activated (double-click / Enter) and the rules said `choose`. */
  onChooseFile?: (entry: FsEntry) => void;
  /** Save mode: rules said `prefill` — put this name in the name box. */
  onPrefillName?: (name: string) => void;
  /** Bump to force a reload (after external writes). */
  refreshKey?: number;
  className?: string;
}

export function Breadcrumbs({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const parts = path.split("/").filter(Boolean);
  const crumbs = [{ name: "Files", path: "/" }, ...parts.map((name, i) => ({ name, path: "/" + parts.slice(0, i + 1).join("/") }))];
  return (
    <nav className="flex min-w-0 items-center gap-0.5 text-sm">
      {crumbs.map((c, i) => (
        <React.Fragment key={c.path}>
          {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
          <button
            type="button"
            onClick={() => onNavigate(c.path)}
            className={cn(
              "max-w-40 truncate rounded px-1.5 py-0.5 hover:bg-accent hover:text-accent-foreground",
              i === crumbs.length - 1 ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {c.name}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

export function FileBrowser({
  fs, path, onNavigate, mode, extensions, selected, onSelect, onChooseFile, onPrefillName, refreshKey, className,
}: FileBrowserProps) {
  const [entries, setEntries] = React.useState<FsEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let stale = false;
    setEntries(null);
    setError(null);
    fs.list(path).then(
      (es) => { if (!stale) setEntries(es); },
      (e: unknown) => { if (!stale) setError(e instanceof Error ? e.message : String(e)); },
    );
    return () => { stale = true; };
  }, [fs, path, refreshKey]);

  const verdictOf = (e: FsEntry) =>
    decide(pickerRules, {
      mode,
      kind: e.kind,
      extAllowed: e.kind === "folder" || !extensions?.length || extensions.includes(extensionOf(e.path)),
    }).outcome;

  const activate = (e: FsEntry) => {
    const v = verdictOf(e);
    if (v.onActivate === "enter") onNavigate(e.path);
    else if (v.onActivate === "choose") onChooseFile?.(e);
    else if (v.onActivate === "prefill") onPrefillName?.(e.name);
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {error && (
        <div className="m-3 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span className="truncate">{error}</span>
          <Button size="xs" variant="outline" onClick={() => onNavigate(path)}>
            <RefreshCw /> Retry
          </Button>
        </div>
      )}
      {!error && entries === null && (
        <div className="space-y-2 p-3" data-testid="file-browser-loading">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      )}
      {!error && entries !== null && entries.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center text-sm text-muted-foreground">
          <FolderOpen className="size-8 opacity-40" />
          This folder is empty
        </div>
      )}
      {!error && entries !== null && entries.length > 0 && (
        <ul className="min-h-0 flex-1 overflow-y-auto p-1" role="listbox" aria-label={path}>
          {entries.map((e) => {
            const v = verdictOf(e);
            const isSel = selected?.path === e.path;
            return (
              <li key={e.path}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    v.dimmed && "opacity-45",
                    isSel ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                  )}
                  onClick={() => {
                    if (v.selectable) onSelect?.(isSel ? null : e);
                    if (v.onActivate === "prefill") onPrefillName?.(e.name);
                  }}
                  onDoubleClick={() => activate(e)}
                  onKeyDown={(ev) => { if (ev.key === "Enter") activate(e); }}
                >
                  {e.kind === "folder"
                    ? <Folder className="size-4 shrink-0 fill-info/15 text-info" />
                    : <FileIcon className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  {e.kind === "file" && e.updatedAt && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(e.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
