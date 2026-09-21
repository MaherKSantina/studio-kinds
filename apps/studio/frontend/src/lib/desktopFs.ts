/**
 * The desktop shell's bridge (`window.studioDesktop`, see apps/desktop/
 * preload.cjs) as the suite's file-system contract, plus the adapters the
 * kit's viewers and editors need. Every path is a store path from "/" —
 * the open folder is the root.
 */
import type { FileSystemAdapter, FsEntry } from "crosscut";

export interface DesktopBridge {
  /** True only when the app runs with STUDIO_REMOTE_CONTENT=on — otherwise the main process refuses every request off this machine. */
  remoteContent?: boolean;
  getRoot(): Promise<string | null>;
  chooseFolder(): Promise<string | null>;
  onRoot(cb: (root: string | null) => void): () => void;
  onOpenPath(cb: (storePath: string) => void): () => void;
  /** The native menu asked for a document action: new, open, save-as, rename, close, catalog. */
  onMenu(cb: (action: string) => void): () => void;
  /** A file inside the folder changed on disk: its store path, and whether content was written
   *  ("change") or an entry was made, removed or renamed ("rename" — the folder's shape). */
  onFsChanged(cb: (storePath: string, type: "change" | "rename") => void): () => void;
  fs: {
    list(p: string): Promise<FsEntry[]>;
    read(p: string): Promise<{ path: string; content: string; updatedAt?: string }>;
    write(p: string, content: string): Promise<void>;
    writeBinary(p: string, base64: string): Promise<void>;
    mkdir(p: string): Promise<void>;
    rename(p: string, newName: string): Promise<{ path: string }>;
    remove(p: string): Promise<void>;
    /** The flat store, or only the rows under `from` when given. */
    index(from?: string): Promise<FsEntry[]>;
  };
  rawUrl(p: string): string;
  openExternal(url: string): Promise<void>;
  showInFolder(p: string): Promise<void>;
}

declare global {
  interface Window { studioDesktop?: DesktopBridge }
}

export function bridge(): DesktopBridge {
  const b = window.studioDesktop;
  if (!b) throw new Error("The desktop bridge is missing — this page only runs inside the Studio desktop shell.");
  return b;
}

export function desktopFs(): FileSystemAdapter {
  const b = bridge();
  return {
    list: (p) => b.fs.list(p),
    read: (p) => b.fs.read(p),
    write: (p, c) => b.fs.write(p, c),
    mkdir: (p) => b.fs.mkdir(p),
    rename: (p, n) => b.fs.rename(p, n),
    remove: (p) => b.fs.remove(p),
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
