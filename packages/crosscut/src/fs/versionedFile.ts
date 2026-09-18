/**
 * VERSIONED FILE vocabulary — the one place that knows what lives INSIDE a
 * versioned folder (entryRules: folder whose name carries an extension IS the
 * document; see `presentEntry`).
 *
 * Inside such a folder:
 *  - child FILES are the versions; NAME order (numeric-aware) is version
 *    order, oldest → newest — the last one is the LATEST;
 *  - the reserved child `versions.md` is the CHANGELOG (why each version
 *    changed) and is never itself a version.
 *
 * PINNING: a ref may point INSIDE a versioned folder at one concrete version
 * (`…/notes.md/02 tightened.md`). The tell is the PARENT segment carrying an
 * extension. Such a ref is frozen — later versions never move it. A ref to the
 * folder itself is UNPINNED: it reads as whatever the latest version is.
 */
import { isStructuredName } from "./entryRules";
import { FsEntry, extensionOf, joinPath, nameOf, parentOf } from "./types";

/** The reserved changelog file inside a versioned folder. */
export const VERSIONS_META = "versions.md";

export const isVersionsMeta = (name: string): boolean => name === VERSIONS_META;

/** Version order = name order, numeric-aware ("2 b" before "10 a"). */
export const compareVersionNames = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true });

/** The versions of a versioned folder, oldest → newest. Folders and the
 *  changelog are not versions. */
export const versionFilesOf = (children: FsEntry[]): FsEntry[] =>
  children
    .filter((c) => c.kind === "file" && !isVersionsMeta(c.name))
    .sort((a, b) => compareVersionNames(a.name, b.name));

export const latestVersionOf = (children: FsEntry[]): FsEntry | null => {
  const versions = versionFilesOf(children);
  return versions.length ? versions[versions.length - 1] : null;
};

/** Leading integer of a version name ("02 tightened.md" → 2), null if none. */
export const versionNumberOf = (name: string): number | null => {
  const m = /^(\d+)/.exec(name);
  return m ? parseInt(m[1], 10) : null;
};

/** Compose the next version's file name: zero-padded successor of the highest
 *  numeric prefix among the existing versions, then the label, then the
 *  folder's own extension. `nextVersionName(children, "tightened", "md")` →
 *  "03 tightened.md". */
export const nextVersionName = (children: FsEntry[], label: string, ext: string): string => {
  const numbers = versionFilesOf(children)
    .map((v) => versionNumberOf(v.name))
    .filter((n): n is number => n !== null);
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  const nn = String(next).padStart(2, "0");
  const stem = label.trim() ? `${nn} ${label.trim()}` : nn;
  return ext ? `${stem}.${ext}` : stem;
};

/** "02 tightened.md" → "02 tightened" — how a version displays. */
export const versionLabelOf = (name: string): string => {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
};

/** If `path` points INSIDE a versioned folder (its parent segment carries an
 *  extension), the folder's path — the pin tell. Null for ordinary paths,
 *  and null inside a structured `*.node` folder: its children are schema
 *  and content, never versions. */
export const versionedParentOf = (path: string): string | null => {
  const parent = parentOf(path);
  if (parent === "/" || !extensionOf(parent) || isStructuredName(parent)) return null;
  return parent;
};

/** The changelog's path for a versioned folder. */
export const versionsMetaPathOf = (folder: string): string => joinPath(folder, VERSIONS_META);

/** True when `path` names a version child rather than a standalone file —
 *  sugar over versionedParentOf for call sites that only branch. */
export const isVersionPath = (path: string): boolean => versionedParentOf(path) !== null;

/** For a pinned path, the pieces a UI wants: the folder, the version file
 *  name, and its display label. Null when not pinned. */
export const pinnedRefOf = (
  path: string,
): { folder: string; version: string; label: string } | null => {
  const folder = versionedParentOf(path);
  if (!folder) return null;
  const version = nameOf(path);
  return { folder, version, label: versionLabelOf(version) };
};
