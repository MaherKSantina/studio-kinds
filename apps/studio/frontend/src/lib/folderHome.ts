/**
 * What a folder Studio starts on: the folder's ROOT MEMORY — the first
 * `.memory` file sitting directly in the root. When there is none, the
 * desktop app MAKES one (an empty file, named after the folder — an empty
 * memory is the folder split itself: each sub-folder a focus, the files
 * beside it Everything else) and the web folder entry keeps a virtual one in
 * the browser instead, since a page over someone's folder writes nothing
 * unasked. Either way the window opens on a working view of the whole folder.
 */
import type { FileSystemAdapter, FsEntry } from "crosscut";
import type { HomeMemory } from "../store";

/** The first `.memory` file directly in the root, in the listing's order (folders first, then files, alphabetical). */
export function rootMemoryOf(entries: FsEntry[]): string | null {
  const hit = entries.find((e) => e.kind === "file" && e.name.toLowerCase().endsWith(".memory"));
  return hit ? hit.path : null;
}

type HomeFs = Pick<FileSystemAdapter, "list" | "read" | "write">;

/** The root memory as a file on disk: reads and writes go to it. */
export const fileHomeMemory = (fs: HomeFs, path: string): HomeMemory => ({
  path,
  virtual: false,
  read: () => fs.read(path).then((r) => r.content),
  write: (t) => fs.write(path, t),
});

/** The root's `.memory` file when there is one. */
export async function findRootMemory(fs: HomeFs): Promise<HomeMemory | null> {
  const real = rootMemoryOf(await fs.list("/"));
  return real ? fileHomeMemory(fs, real) : null;
}

/** The root's `.memory` file — made as an EMPTY `/<folder>.memory` when there is none (the desktop app). */
export async function ensureRootMemory(fs: HomeFs, root: string): Promise<HomeMemory> {
  const found = await findRootMemory(fs);
  if (found) return found;
  const path = defaultMemoryPath(root);
  await fs.write(path, "");
  return fileHomeMemory(fs, path);
}

/** The folder's last path segment — `C:\Github\Neogrids` → `Neogrids`; a bare drive or root → "folder". */
export function folderStem(root: string): string {
  const segs = root.replace(/\\/g, "/").split("/").filter(Boolean);
  const last = segs[segs.length - 1] ?? "";
  return last && !/^[A-Za-z]:$/.test(last) ? last : "folder";
}

/** Where a virtual root memory stands: `/<folder name>.memory` — its scope is the root, like a file's would be. */
export const defaultMemoryPath = (root: string): string => `/${folderStem(root)}.memory`;

/** A `.memory` directly in the root — made or removed, the start page follows it. */
export const isRootMemoryPath = (storePath: string): boolean => /^\/[^/]+\.memory$/i.test(storePath);

/** Where this browser keeps a virtual root memory's text (its locks and journal), per folder. */
export const homeStorageKey = (root: string): string => `studio:home-memory:${root}`;
