/**
 * The suite's Open / Save-As dialog over the shared file system.
 *
 * Behaviour is entirely table-driven: row affordances from `pickerRules`,
 * name validation from `nameRules`. This component wires them to a Dialog.
 */
import * as React from "react";
import { FolderPlus } from "lucide-react";
import { decide } from "../decision/decisionTable";
import { validateName } from "../fs/nameRules";
import { pickerRules } from "../fs/pickerRules";
import { FileSystemAdapter, FsEntry, extensionOf, joinPath, parentOf } from "../fs/types";
import { Breadcrumbs, FileBrowser } from "./FileBrowser";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

export interface FilePickerDialogProps {
  fs: FileSystemAdapter;
  mode: "open" | "save";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lowercased extensions this app reads/writes; empty = everything. */
  extensions?: string[];
  title?: string;
  initialPath?: string;
  /** Save mode: prefilled file name. */
  defaultName?: string;
  onPick: (path: string) => void;
}

export function FilePickerDialog({
  fs, mode, open, onOpenChange, extensions, title, initialPath = "/", defaultName = "", onPick,
}: FilePickerDialogProps) {
  const [path, setPath] = React.useState(initialPath);
  const [selected, setSelected] = React.useState<FsEntry | null>(null);
  const [name, setName] = React.useState(defaultName);
  const [siblings, setSiblings] = React.useState<FsEntry[]>([]);
  const [creatingFolder, setCreatingFolder] = React.useState(false);
  const [folderName, setFolderName] = React.useState("");
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    if (open) { setPath(initialPath); setSelected(null); setName(defaultName); setCreatingFolder(false); }
  }, [open, initialPath, defaultName]);

  React.useEffect(() => {
    if (!open) return;
    let stale = false;
    fs.list(path).then((es) => { if (!stale) setSiblings(es); }, () => { if (!stale) setSiblings([]); });
    return () => { stale = true; };
  }, [fs, path, open, refreshKey]);

  const navigate = (p: string) => { setPath(p); setSelected(null); };

  /** Save name with the app's extension guaranteed. */
  const finalName = React.useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed || !extensions?.length) return trimmed;
    return extensions.includes(extensionOf("/" + trimmed)) ? trimmed : `${trimmed}.${extensions[0]}`;
  }, [name, extensions]);

  const existingFolders = siblings.filter((s) => s.kind === "folder").map((s) => s.name);
  const nameVerdict = validateName(name.trim(), []);
  const wouldReplace = siblings.some((s) => s.kind === "file" && s.name.toLowerCase() === finalName.toLowerCase());
  const clashesFolder = existingFolders.some((f) => f.toLowerCase() === finalName.toLowerCase());
  const folderVerdict = validateName(folderName.trim(), siblings.map((s) => s.name));

  const confirm = () => {
    if (mode === "open") {
      if (selected) { onPick(selected.path); onOpenChange(false); }
      return;
    }
    if (!nameVerdict.ok || !finalName || clashesFolder) return;
    onPick(joinPath(path, finalName));
    onOpenChange(false);
  };

  const chooseFile = (e: FsEntry) => {
    const v = decide(pickerRules, { mode, kind: e.kind, extAllowed: true }).outcome;
    if (mode === "open" && v.onActivate === "choose") { onPick(e.path); onOpenChange(false); }
  };

  const createFolder = async () => {
    if (!folderVerdict.ok || !folderName.trim()) return;
    await fs.mkdir(joinPath(path, folderName.trim()));
    setFolderName("");
    setCreatingFolder(false);
    setRefreshKey((k) => k + 1);
  };

  const canConfirm = mode === "open" ? !!selected : !!finalName && nameVerdict.ok && !clashesFolder;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[70dvh] max-h-[560px] flex-col gap-0 p-0 sm:max-w-2xl" showCloseButton>
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>{title ?? (mode === "open" ? "Open" : "Save as")}</DialogTitle>
          <DialogDescription className="sr-only">
            {mode === "open" ? "Pick a file to open" : "Pick a folder and a name to save"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <Breadcrumbs path={path} onNavigate={navigate} />
          <Button size="xs" variant="outline" onClick={() => setCreatingFolder((v) => !v)}>
            <FolderPlus /> New folder
          </Button>
        </div>
        {creatingFolder && (
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
            <Input
              autoFocus
              value={folderName}
              placeholder="Folder name"
              className="h-8"
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void createFolder(); if (e.key === "Escape") setCreatingFolder(false); }}
            />
            <Button size="sm" disabled={!folderName.trim() || !folderVerdict.ok} onClick={() => void createFolder()}>Create</Button>
            {!folderVerdict.ok && folderName.trim() && (
              <span className="text-xs text-destructive">{folderVerdict.error}</span>
            )}
          </div>
        )}
        <FileBrowser
          fs={fs}
          path={path}
          onNavigate={navigate}
          mode={mode}
          extensions={extensions}
          selected={selected}
          onSelect={setSelected}
          onChooseFile={chooseFile}
          onPrefillName={(n) => setName(n)}
          refreshKey={refreshKey}
          className="flex-1"
        />
        <DialogFooter className="items-center gap-2 border-t px-4 py-3 sm:justify-between">
          {mode === "save" ? (
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <Input
                  value={name}
                  placeholder={extensions?.length ? `name.${extensions[0]}` : "File name"}
                  className="h-8"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirm(); }}
                />
              </div>
              {!nameVerdict.ok && name.trim() && <span className="text-xs text-destructive">{nameVerdict.error}</span>}
              {nameVerdict.ok && clashesFolder && <span className="text-xs text-destructive">A folder already has this name</span>}
              {nameVerdict.ok && !clashesFolder && wouldReplace && (
                <span className="text-xs text-warning">Will replace the existing “{finalName}”</span>
              )}
            </div>
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {selected ? selected.path : "Select a file"}
            </span>
          )}
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!canConfirm} onClick={confirm}>{mode === "open" ? "Open" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
