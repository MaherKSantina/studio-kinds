/** In-memory FileSystemAdapter for Storybook and tests. */
import { FileSystemAdapter, FsEntry, joinPath, nameOf, parentOf } from "./types";

export function memoryFs(seed: Record<string, string | null> = {}): FileSystemAdapter & { dump(): Record<string, string | null> } {
  /** path -> content for files, null for folders. Root implicit. */
  const store = new Map<string, string | null>(Object.entries(seed));

  const ensureFolders = (path: string) => {
    let dir = parentOf(path);
    while (dir !== "/") {
      if (!store.has(dir)) store.set(dir, null);
      dir = parentOf(dir);
    }
  };

  const entryOf = (path: string): FsEntry => ({
    path,
    name: nameOf(path),
    kind: store.get(path) === null ? "folder" : "file",
    size: store.get(path)?.length,
  });

  return {
    async list(path) {
      const prefix = path === "/" ? "/" : path + "/";
      const children = [...store.keys()].filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"));
      return children
        .map(entryOf)
        .sort((a, b) => (a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : a.name.localeCompare(b.name)));
    },
    async read(path) {
      const c = store.get(path);
      if (typeof c !== "string") throw new Error(`file ${path} not found`);
      return { path, content: c };
    },
    async write(path, content) {
      ensureFolders(path);
      store.set(path, content);
    },
    async mkdir(path) {
      ensureFolders(path);
      store.set(path, null);
    },
    async rename(path, newName) {
      const next = joinPath(parentOf(path), newName);
      for (const [p, c] of [...store.entries()]) {
        if (p === path || p.startsWith(path + "/")) {
          store.delete(p);
          store.set(next + p.slice(path.length), c);
        }
      }
      return { path: next };
    },
    async remove(path) {
      for (const p of [...store.keys()]) if (p === path || p.startsWith(path + "/")) store.delete(p);
    },
    dump: () => Object.fromEntries(store),
  };
}
