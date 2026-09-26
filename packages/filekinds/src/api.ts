/**
 * How file-kind viewers read OTHER files (a playbook material pointing at a
 * .brief, a plan loading its playbooks). The package is storage-agnostic: the
 * HOST configures one reader at startup and viewers resolve references
 * relative to the document that made them.
 *
 *   configureFileKinds({ readFile: (abs) => fs.read(abs).then(r => r.content) })
 *
 * The (refBase, path) signature is kept from the orchestration port: `refBase`
 * is the ABSOLUTE PATH of the referencing document, `path` the ref as written.
 */
import { type AskApi, type FileSystemAdapter, type FsEntry, extensionOf, isStructuredName, joinPath, latestVersionOf, parentOf, pinnedRefOf, resolveRef } from "crosscut";
import type { IndexEntry } from "./lib/nodeIndex";

export interface DirFileContent {
  path: string;
  content: string;
  binary: boolean;
  tooLarge: boolean;
  size: number;
}

export type FileReader = (absPath: string) => Promise<string>;
/** URL that serves a file's BYTES with a real content-type — how binary
 *  literature (PDF, DOCX) is fetched. Hosts point it at their fs proxy's
 *  /fs/raw endpoint; viewers get it through `rawFileUrlFor`. */
export type RawFileUrl = (absPath: string) => string;
/** Folder listing — what a project's NODE REFERENCE browser walks. */
export type FileLister = (absPath: string) => Promise<{ path: string; name: string; kind: "folder" | "file" }[]>;
/** Write-back for viewers whose host allows editing (autosave rides this). */
export type FileWriter = (absPath: string, content: string) => Promise<void>;
/** THE FLAT STORE in one call — every entry as an index row, or only the
 *  rows under `folder` when one is given (a memory that authors decisions
 *  over one sub-folder wants that subtree, not the whole drive). Hosts with a
 *  worker point it at the index endpoint; without one, `readNodeIndex`
 *  derives the same rows by walking the lister. An indexer that ignores
 *  `folder` still works — the caller narrows the rows itself. */
export type FileIndexer = (folder?: string) => Promise<IndexEntry[]>;
/** Execute a `.program` node's declared contract (the nodes worker's
 *  /api/run/program). Hosts without a runner render programs read-only. */
export interface ProgramRunResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  outputs: string[];
  durationMs: number;
}
export type ProgramRunner = (absPath: string) => Promise<ProgramRunResult>;
/** What a `.script` run is handed — the document's executable half, parsed by the page. A host that
 *  can read the file itself (the folder worker) re-reads it at `absPath` and runs what it holds;
 *  the desktop shell and the VS Code extension run what they are handed. */
export interface ScriptRun {
  language: string;
  code: string;
  env: Record<string, string>;
  cwd?: string;
}
export interface ScriptRunResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}
/** Run a `.script` document on the host. Hosts without one render scripts with Run disabled. */
export type ScriptRunner = (absPath: string, run: ScriptRun) => Promise<ScriptRunResult>;
/** Write BYTES (a screenshot a flow state captures) — hosts point it at the
 *  nodes worker's binary upsert; without one, upload controls stay hidden. */
export type BinaryWriter = (absPath: string, blob: Blob) => Promise<void>;
/** Create an empty folder (a project Ask's `create_folder`). */
export type FolderMaker = (absPath: string) => Promise<void>;
/** Rename a file or folder in place. */
export type FileRenamer = (absPath: string, newName: string) => Promise<unknown>;
/** Remove a file — the second half of a MOVE, after its contents were written elsewhere. */
export type FileRemover = (absPath: string) => Promise<void>;

// On globalThis, not module scope: vite HMR can leave two live instances of
// this module (one `?t=`-stamped, one not) and a module-local singleton then
// gets configured on one and read on the other. One shared slot survives that.
const slot = globalThis as {
  __filekindsReader?: FileReader;
  __filekindsRawUrl?: RawFileUrl;
  __filekindsLister?: FileLister;
  __filekindsWriter?: FileWriter;
  __filekindsIndexer?: FileIndexer;
  __filekindsRunner?: ProgramRunner;
  __filekindsScriptRunner?: ScriptRunner;
  __filekindsBinaryWriter?: BinaryWriter;
  __filekindsMkdir?: FolderMaker;
  __filekindsRenamer?: FileRenamer;
  __filekindsRemover?: FileRemover;
  __filekindsAsk?: AskApi;
  __filekindsRemoteContent?: boolean;
};

export function configureFileKinds(opts: {
  readFile: FileReader;
  rawFileUrl?: RawFileUrl;
  listFiles?: FileLister;
  writeFile?: FileWriter;
  indexFiles?: FileIndexer;
  runProgram?: ProgramRunner;
  runScript?: ScriptRunner;
  writeBinary?: BinaryWriter;
  mkdir?: FolderMaker;
  renameFile?: FileRenamer;
  removeFile?: FileRemover;
  /** The suite's ask worker, through the host's proxy — views with an Ask panel show it only when this is set. */
  ask?: AskApi;
  /** Whether a document's REMOTE content — an `https:` image a `.collection` item or a markdown body
   *  names, the directions map — is fetched. Off, a placeholder stands where it would load and nothing
   *  a document names reaches the network; links still open by hand. OFF unless the host turns it on. */
  remoteContent?: boolean;
}): void {
  slot.__filekindsReader = opts.readFile;
  if (opts.rawFileUrl) slot.__filekindsRawUrl = opts.rawFileUrl;
  if (opts.listFiles) slot.__filekindsLister = opts.listFiles;
  if (opts.writeFile) slot.__filekindsWriter = opts.writeFile;
  if (opts.indexFiles) slot.__filekindsIndexer = opts.indexFiles;
  if (opts.runProgram) slot.__filekindsRunner = opts.runProgram;
  if (opts.runScript) slot.__filekindsScriptRunner = opts.runScript;
  if (opts.writeBinary) slot.__filekindsBinaryWriter = opts.writeBinary;
  if (opts.mkdir) slot.__filekindsMkdir = opts.mkdir;
  if (opts.renameFile) slot.__filekindsRenamer = opts.renameFile;
  if (opts.removeFile) slot.__filekindsRemover = opts.removeFile;
  if (opts.ask) slot.__filekindsAsk = opts.ask;
  if (opts.remoteContent !== undefined) slot.__filekindsRemoteContent = opts.remoteContent;
}

/** Whether remote content a document names is fetched — only when the host turned it on. */
export const remoteContentAllowed = (): boolean => slot.__filekindsRemoteContent === true;
/** A URL that would leave the machine: http(s) to anything but this machine. */
export const isRemoteUrl = (url: string): boolean => /^https?:\/\//i.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(url);

export const configuredMkdir = (): FolderMaker | null => slot.__filekindsMkdir ?? null;
export const configuredRenamer = (): FileRenamer | null => slot.__filekindsRenamer ?? null;
export const configuredRemover = (): FileRemover | null => slot.__filekindsRemover ?? null;
export const configuredAsk = (): AskApi | null => slot.__filekindsAsk ?? null;

export const configuredBinaryWriter = (): BinaryWriter | null => slot.__filekindsBinaryWriter ?? null;

export const configuredLister = (): FileLister | null => slot.__filekindsLister ?? null;
export const configuredWriter = (): FileWriter | null => slot.__filekindsWriter ?? null;
export const configuredRunner = (): ProgramRunner | null => slot.__filekindsRunner ?? null;
export const configuredScriptRunner = (): ScriptRunner | null => slot.__filekindsScriptRunner ?? null;

/**
 * Every entry of the store, flat. The configured indexer when the host wired
 * one (one SQL select on the nodes worker); otherwise a breadth-first walk of
 * the configured lister — same rows, more round-trips, so fixtures and hosts
 * without the endpoint still get the whole store. Lister entries that carry
 * `updatedAt` keep it; age fields simply stay unknown where they don't.
 */
/** A lister's entry as an index row — the one shape the flat store uses everywhere. */
export function asIndexEntry(e: { path: string; name: string; kind: "folder" | "file" }): IndexEntry {
  const extra = e as { updatedAt?: string; createdAt?: string; size?: number; binary?: boolean };
  return {
    path: e.path, name: e.name, kind: e.kind,
    ...(extra.updatedAt ? { updatedAt: extra.updatedAt } : {}),
    ...(extra.createdAt ? { createdAt: extra.createdAt } : {}),
    ...(typeof extra.size === "number" ? { size: extra.size } : {}),
    ...(extra.binary ? { binary: true } : {}),
  };
}

/** Everything strictly under `folder` ("/" = the whole store). */
const under = (folder: string) => (e: { path: string }): boolean =>
  folder === "/" ? e.path !== "/" : e.path.startsWith(`${folder}/`);

/** The rows under `folder` — "/" (the default) is the whole store. */
export async function readNodeIndex(folder = "/"): Promise<IndexEntry[]> {
  const indexer = slot.__filekindsIndexer;
  // Narrowed here as well: an indexer is free to hand back the whole store regardless.
  if (indexer) return (await indexer(folder)).filter(under(folder));
  const lister = slot.__filekindsLister;
  if (!lister) throw new Error("filekinds: configure indexFiles or listFiles before reading the node index");
  const out: IndexEntry[] = [];
  let level = [folder];
  while (level.length) {
    const listings = await Promise.all(level.map(async (p) => {
      try { return await lister(p); } catch { return []; }
    }));
    const next: string[] = [];
    for (const entries of listings) {
      for (const e of entries) {
        out.push(asIndexEntry(e));
        if (e.kind === "folder") next.push(e.path);
      }
    }
    level = next;
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Resolve a doc-relative ref to a bytes URL, or null when the host has not
 *  configured one (viewers then fall back to text rendering only). */
export function rawFileUrlFor(refBase: string, filePath: string): string | null {
  const f = slot.__filekindsRawUrl;
  return f ? f(resolveRef(refBase, filePath)) : null;
}

export async function readVirtualDirectoryFile(refBase: string, filePath: string): Promise<DirFileContent> {
  const reader = slot.__filekindsReader;
  if (!reader) throw new Error("filekinds: the host app must call configureFileKinds({ readFile }) before rendering viewers");
  const abs = resolveRef(refBase, filePath);
  try {
    // A binary entry's text channel can come back null — normalize to "" so
    // renderers that read bytes themselves (workbooks, pdf) still mount.
    const content = (await reader(abs)) ?? "";
    return { path: filePath, content, binary: false, tooLarge: false, size: content.length };
  } catch (err) {
    // A ref may land on a VERSIONED FOLDER (folder named like a file). That is
    // an UNPINNED ref: it reads as the folder's latest version. Only paths that
    // could be versioned folders get the retry; everything else rethrows —
    // including structured `*.node` folders, whose children are halves, not
    // versions.
    const lister = slot.__filekindsLister;
    if (!lister || !extensionOf(abs) || isStructuredName(abs)) throw err;
    let latest: { name: string } | null;
    try {
      latest = latestVersionOf(await lister(abs));
    } catch {
      throw err; // not listable either — the original failure stands
    }
    if (!latest) throw err;
    const content = await reader(joinPath(abs, latest.name));
    return { path: filePath, content, binary: false, tooLarge: false, size: content.length };
  }
}

/** How a journey (or any view with pin semantics) sees one file ref:
 *  - "pinned"   — the path points INSIDE a versioned folder at one concrete
 *                 version; `behind` says newer versions exist;
 *  - "unpinned" — the path IS a versioned folder; reads resolve to `latest`;
 *  - "plain"    — an ordinary file, no version machinery involved.
 *  Needs the host's lister; without one everything reports "plain". */
export type VersionRefState =
  | { state: "plain" }
  | { state: "pinned"; folder: string; version: string; label: string; latest: string | null; behind: boolean }
  | { state: "unpinned"; folder: string; latest: string | null; latestPath: string | null };

export async function probeVersionRef(abs: string): Promise<VersionRefState> {
  const lister = slot.__filekindsLister;
  if (!lister) return { state: "plain" };
  const pinned = pinnedRefOf(abs);
  if (pinned) {
    try {
      const latest = latestVersionOf(await lister(pinned.folder));
      return {
        state: "pinned",
        folder: pinned.folder,
        version: pinned.version,
        label: pinned.label,
        latest: latest?.name ?? null,
        behind: !!latest && latest.name !== pinned.version,
      };
    } catch {
      return { state: "plain" }; // parent is not actually a listable folder
    }
  }
  if (!extensionOf(abs) || isStructuredName(abs)) return { state: "plain" };
  try {
    const latest = latestVersionOf(await lister(abs));
    return {
      state: "unpinned",
      folder: abs,
      latest: latest?.name ?? null,
      latestPath: latest ? joinPath(abs, latest.name) : null,
    };
  } catch {
    return { state: "plain" }; // a real file (or missing) — listing throws
  }
}

export const configuredReader = (): FileReader | null => slot.__filekindsReader ?? null;

/** The configured pieces as ONE file-system adapter — what a picker dialog
 *  inside a kind's editor takes — or null until the host has configured
 *  listing and writing. Folder, rename and remove operations throw when the
 *  host wired none. */
export function configuredFs(): FileSystemAdapter | null {
  const read = slot.__filekindsReader;
  const list = slot.__filekindsLister;
  const write = slot.__filekindsWriter;
  if (!read || !list || !write) return null;
  const missing = (what: string) => new Error(`filekinds: this host configured no ${what}`);
  return {
    list: (p) => list(p) as Promise<FsEntry[]>,
    read: async (p) => ({ path: p, content: await read(p) }),
    write,
    mkdir: (p) => { const f = slot.__filekindsMkdir; if (!f) throw missing("mkdir"); return f(p); },
    rename: async (p, n) => {
      const f = slot.__filekindsRenamer;
      if (!f) throw missing("renameFile");
      const r = await f(p, n);
      return r && typeof r === "object" && "path" in r ? (r as { path: string }) : { path: joinPath(parentOf(p), n) };
    },
    remove: (p) => { const f = slot.__filekindsRemover; if (!f) throw missing("removeFile"); return f(p); },
  };
}
