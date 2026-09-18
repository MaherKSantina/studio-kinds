/**
 * THE HISTORY OF A NODE — reconstructed from the versioned-entry convention:
 * the versions of `/a/b/x.playbook` live in the FOLDER
 * `/a/b/x versions.playbook/` (a folder named like a file), child files in
 * name order oldest → newest, the LIVE file being the current state. History
 * is each version diffed against the one before it — ONLY what changed —
 * plus a "current" entry when the live file has moved past the last snapshot.
 */

export interface HistoryTarget {
  label: string;
  /** The LIVE file's abs path — its versions folder derives from it. */
  path: string;
}

export interface HistoryEntry {
  /** The live file this state belongs to. */
  file: string;
  fileLabel: string;
  /** Display name: the version file's stem, or "current". */
  version: string;
  /** What to open for THIS state: the snapshot file, or the live file. */
  path: string;
  current?: boolean;
  /** The first recorded state — there is nothing before it to diff against. */
  initial?: boolean;
  added: string[];
  removed: string[];
}

/** `/a/b/x.playbook` → `/a/b/x versions.playbook`; extensionless keeps the
 *  ` versions` suffix alone. */
export function versionsFolderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  return `${path.slice(0, slash + 1)}${stem} versions${ext}`;
}

const stripExt = (name: string) => {
  const i = name.lastIndexOf(".");
  return i <= 0 ? name : name.slice(0, i);
};

/** ONLY what changed between two states: common prefix/suffix lines fall
 *  away, and the middles diff as order-preserving multisets — exact for the
 *  single-hunk edits versions mostly are, and honest for anything larger
 *  (never misses a changed line; unchanged lines BETWEEN hunks stay out). */
export function changeSummary(prev: string, next: string): { added: string[]; removed: string[] } {
  const a = prev.split("\n"), b = next.split("\n");
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const am = a.slice(s, a.length - e), bm = b.slice(s, b.length - e);
  const inPrev = new Map<string, number>();
  for (const l of am) inPrev.set(l, (inPrev.get(l) ?? 0) + 1);
  const added: string[] = [];
  for (const l of bm) {
    const c = inPrev.get(l) ?? 0;
    if (c > 0) inPrev.set(l, c - 1);
    else added.push(l);
  }
  const inNext = new Map<string, number>();
  for (const l of bm) inNext.set(l, (inNext.get(l) ?? 0) + 1);
  const removed: string[] = [];
  for (const l of am) {
    const c = inNext.get(l) ?? 0;
    if (c > 0) inNext.set(l, c - 1);
    else removed.push(l);
  }
  return { added, removed };
}

/** Walk each target's versions folder (targets without one contribute
 *  nothing) and build the change-by-change history, oldest → newest per
 *  target, targets in the order given (the node itself first, then its
 *  children). */
export async function gatherNodeHistory(
  targets: HistoryTarget[],
  list: (abs: string) => Promise<{ path: string; name: string; kind: "folder" | "file" }[]>,
  read: (abs: string) => Promise<string>,
): Promise<HistoryEntry[]> {
  const out: HistoryEntry[] = [];
  for (const t of targets) {
    let versions: { path: string; name: string }[];
    try {
      versions = (await list(versionsFolderOf(t.path))).filter((v) => v.kind === "file");
    } catch {
      continue; // no versions folder — this node has no recorded history
    }
    versions.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
    if (!versions.length) continue;
    let prev: string | null = null;
    for (const v of versions) {
      const content = await read(v.path);
      const d = prev === null ? { added: [], removed: [] } : changeSummary(prev, content);
      out.push({
        file: t.path, fileLabel: t.label, version: stripExt(v.name), path: v.path,
        ...(prev === null ? { initial: true } : {}), added: d.added, removed: d.removed,
      });
      prev = content;
    }
    try {
      const live = await read(t.path);
      if (prev !== null && live !== prev) {
        const d = changeSummary(prev, live);
        out.push({ file: t.path, fileLabel: t.label, version: "current", path: t.path, current: true, added: d.added, removed: d.removed });
      }
    } catch {
      /* live file unreadable — the snapshots alone tell the story */
    }
  }
  return out;
}
