/**
 * WHERE THE DOCUMENTS LIVE — the one thing that differs between the Studio
 * on the web (the suite's shared drive, through the nodes worker), the Studio
 * over a folder on disk through the folder worker, and the Studio on the
 * desktop (a folder on disk, through the shell's bridge). The editors never
 * know: they read and write through the file-system contract and the kit's
 * configured adapters. This is what the shell passes to App.
 */
import type { ReactNode } from "react";
import type { FileSystemAdapter } from "crosscut";

/** A folder's START PAGE: its root memory — every sub-folder a focus, the
 *  files beside them Everything else, a `.memory` inside a folder dictating
 *  that folder's split. The text is a `.memory` file in the root when there
 *  is one, else a VIRTUAL memory the entry keeps for this browser, so a folder
 *  with no `.memory` behaves as an empty one does on the desktop and in VS
 *  Code without anything being written into it. */
export interface HomeMemory {
  /** The memory's store path — the file's, or `/<folder>.memory` for a virtual one (its scope is the root either way). */
  path: string;
  /** Kept by this browser only, not on disk. */
  virtual: boolean;
  read(): Promise<string>;
  /** What the memory offers (a lock taken) persists through this. */
  write(text: string): Promise<void>;
}

export interface StudioStore {
  /** Scopes what is remembered per store (recents). */
  id: string;
  /** Files and folders, absolute store paths from "/". */
  fs: FileSystemAdapter;
  /** What to call the store — "the shared drive", or the folder's path. */
  label: string;
  /** The welcome page's home section: the drive lists projects; a folder shows its tree. */
  home: "projects" | "folder";
  /** Present = the start page is this memory as the whole window, in place of the welcome page. */
  homeMemory?: HomeMemory;
  /** The entry's own controls on the start page, in a corner over the memory (the folder entry's remote-control chip). */
  homeActions?: ReactNode;
  /** A link to the same path in Nodes, when the store is the shared drive. */
  nodesUrl?: (path: string) => string;
  /** Desktop: pick another folder. */
  chooseFolder?: () => Promise<unknown>;
  /** Desktop: reveal a path in the OS file manager. */
  showInFolder?: (path: string) => Promise<unknown>;
}
