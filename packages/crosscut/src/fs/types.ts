/**
 * The file-system contract every tool shares. The nodes app SERVES it over
 * HTTP; other tools consume it through `httpFs`; Storybook and tests use
 * `memoryFs`. Components in this kit only ever see this interface.
 *
 * Paths are absolute, "/"-separated, no trailing slash; the root is "/".
 */

export type FsKind = "folder" | "file";

export interface FsEntry {
  path: string;
  name: string;
  kind: FsKind;
  updatedAt?: string;
  size?: number;
}

export interface FileSystemAdapter {
  /** Children of a folder, folders first then files, each alphabetical. */
  list(path: string): Promise<FsEntry[]>;
  read(path: string): Promise<{ path: string; content: string; updatedAt?: string }>;
  /** Upsert — creates missing parent folders. */
  write(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  rename(path: string, newName: string): Promise<{ path: string }>;
  remove(path: string): Promise<void>;
}

/** Where the last separator sits. A path handed in by a Windows host (a file
 *  association, VS Code's fsPath, a pasted `C:\...`) arrives "\"-separated;
 *  treating it as one name made every relative ref resolve against the root. */
const lastSep = (path: string): number => Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));

export const parentOf = (path: string): string => {
  const i = lastSep(path);
  return i <= 0 ? "/" : path.slice(0, i);
};

export const nameOf = (path: string): string => path.slice(lastSep(path) + 1);

export const joinPath = (dir: string, name: string): string => (dir === "/" ? `/${name}` : `${dir}/${name}`);

export const extensionOf = (path: string): string => {
  const n = nameOf(path);
  const i = n.lastIndexOf(".");
  return i <= 0 ? "" : n.slice(i + 1).toLowerCase();
};

/** Resolve a reference found inside a document: absolute stays, relative is
 *  against the referencing file's folder. `..` collapses. */
export const resolveRef = (fromFile: string, ref: string): string => {
  const base = ref.startsWith("/") ? [] : parentOf(fromFile).split(/[\\/]/).filter(Boolean);
  for (const part of ref.split(/[\\/]/)) {
    if (!part || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return "/" + base.join("/");
};
