/**
 * THE STORE, AS A MEMORY SEES IT — shared by the memory, pulse and moves
 * views: index rows as units (composite nodes enriched with their folded
 * stream slices), the memories nested under the scope, and the memory itself
 * over its folder (`memoryOverFolder`). Nothing here caches: every open
 * reads the live store.
 *
 * TWO WAYS TO READ IT. A memory that AUTHORS decisions needs everything under
 * its scope — its rules look at every unit — so it reads one scoped index.
 * A memory with no decisions is the FOLDER SPLIT (sub-folders as foci, the
 * files sitting in the folder as Everything else) and reads LAZILY: one
 * listing of the scope, then one listing per folder the taken answers open
 * (`takenFolderChain`), and nothing under the folders not taken. Over
 * C:\Github that is a 60-entry listing instead of a 13,000-row index, and a
 * click on a folder pill is what reads that folder. A folder on the taken
 * path with a memory of its own that authors decisions is read the first way
 * from there down.
 */
import { isStructuredName, joinPath } from "crosscut";
import { asIndexEntry, configuredLister, readNodeIndex, readVirtualDirectoryFile } from "../../api";
import {
  memoryOverFolder, parseMemory, takenFolderChain, underFolder, type MemoryDoc, type MemoryOverFolder, type NestedMemories,
} from "../../lib/memoryDoc";
import { indexFields, type IndexEntry } from "../../lib/nodeIndex";
import { parseSchemaDoc, splitHalvesOf } from "../../lib/schemaDoc";
import { compositeStreams, flattenStreamFields } from "../../lib/compositeDoc";
import { readListRows } from "../../lib/listCollate";
import { parentOf } from "crosscut";

export interface Unit { entry: IndexEntry; fields: Record<string, string> }

/** A host dispatches this window event when the store changed underneath an open memory — an
 *  entry made, removed or renamed — and the view re-reads the store in place, the current
 *  selection staying up until the new one lands. Content writes are not a reason to send it. */
export const STORE_CHANGED_EVENT = "studio:store-changed";

/** Index rows as units — for composite structured nodes, with their folded
 *  stream slices. Enrichment failures degrade to plain rows. Without `entries`
 *  the whole store is read. */
export async function loadUnits(today: string, entries?: IndexEntry[]): Promise<Unit[]> {
  const rows = entries ?? await readNodeIndex();
  const lister = configuredLister();
  return Promise.all(rows.map(async (entry) => {
    const base = indexFields(entry, today);
    if (entry.kind !== "folder" || !entry.name.endsWith(".node") || !lister) return { entry, fields: base };
    try {
      const halves = splitHalvesOf(await lister(entry.path) as { name: string; kind: "folder" | "file" }[]);
      if (!halves.schema || !halves.content) return { entry, fields: base };
      const schemaAbs = joinPath(entry.path, halves.schema);
      const schema = parseSchemaDoc((await readVirtualDirectoryFile(schemaAbs, schemaAbs)).content);
      if (schema.type !== "composite") return { entry, fields: base };
      const contentAbs = joinPath(entry.path, halves.content);
      const rows = halves.content.endsWith(".list") ? (await readListRows(contentAbs)).rows : [];
      const { streams } = compositeStreams(schema, rows, today);
      return { entry, fields: { ...base, ...flattenStreamFields(streams) } };
    } catch {
      return { entry, fields: base };
    }
  }));
}

/** The first `.memory` by name in every folder strictly inside the scope,
 *  parsed. One that cannot be read leaves its folder to split by
 *  sub-folders. The scope's own folder is skipped: the opened document
 *  speaks for it. */
export async function loadNestedMemories(entries: IndexEntry[], scope: string): Promise<NestedMemories> {
  const first = new Map<string, IndexEntry>();
  for (const e of entries) {
    if (e.kind !== "file" || !/\.memory$/i.test(e.name) || !underFolder(e.path, scope)) continue;
    const folder = parentOf(e.path);
    if (folder === scope) continue;
    const cur = first.get(folder);
    if (!cur || e.name.localeCompare(cur.name, undefined, { sensitivity: "base", numeric: true }) < 0) first.set(folder, e);
  }
  const out = new Map<string, { path: string; doc: MemoryDoc }>();
  await Promise.all([...first].map(async ([folder, e]) => {
    try {
      out.set(folder, { path: e.path, doc: parseMemory((await readVirtualDirectoryFile(e.path, e.path)).content) });
    } catch { /* unreadable: the folder splits by its sub-folders */ }
  }));
  return out;
}

export interface MemoryStore {
  units: Unit[];
  nested: NestedMemories;
  /** Folders known from the listings read (a lazy store) — foci before anything under them is read. */
  folders: string[];
  /** Only the scope and the folders the taken answers open were read. */
  lazy: boolean;
}

/** The first `.memory` by name among one folder's entries. */
function firstMemoryIn(entries: IndexEntry[]): IndexEntry | null {
  const mems = entries.filter((e) => e.kind === "file" && /\.memory$/i.test(e.name));
  mems.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  return mems[0] ?? null;
}

export interface LoadOptions {
  /** The memory being shown — with no decisions it is the folder split and reads lazily. */
  doc?: MemoryDoc;
  /** The answers taken: which folders the lazy read opens. */
  locks?: readonly string[];
}

/** Everything a memory with this scope needs from the store. */
export async function loadMemoryStore(scope: string, today: string, opts: LoadOptions = {}): Promise<MemoryStore> {
  const lister = configuredLister();
  const lazy = !!opts.doc && opts.doc.decisions.length === 0 && !!lister;
  if (!lazy) {
    const entries = await readNodeIndex(scope);
    return { units: await loadUnits(today, entries), nested: await loadNestedMemories(entries, scope), folders: [], lazy: false };
  }
  const entries: IndexEntry[] = [];
  const folders: string[] = [];
  const nested = new Map<string, { path: string; doc: MemoryDoc }>();
  for (const folder of [scope, ...takenFolderChain(scope, opts.locks ?? [])]) {
    let listing: IndexEntry[];
    try { listing = (await lister!(folder)).map(asIndexEntry); } catch { break; } // gone or unreadable: the path ends here
    for (const e of listing) if (e.kind === "folder" && !isStructuredName(e.name)) folders.push(e.path);
    if (folder !== scope) {
      const mem = firstMemoryIn(listing);
      let doc: MemoryDoc | null = null;
      if (mem) {
        try { doc = parseMemory((await readVirtualDirectoryFile(mem.path, mem.path)).content); } catch { /* unreadable: the sub-folders split it */ }
      }
      if (mem && doc) {
        nested.set(folder, { path: mem.path, doc });
        if (doc.decisions.length) {
          // Its rules look at everything under this folder: from here down, the whole subtree.
          const sub = await readNodeIndex(folder);
          entries.push(...sub);
          for (const [k, v] of await loadNestedMemories(sub, folder)) nested.set(k, v);
          break;
        }
      }
    }
    // The documents sitting in this folder itself — files and structured `.node` folders.
    entries.push(...listing.filter((e) => e.kind === "file" || isStructuredName(e.name)));
  }
  return { units: await loadUnits(today, entries), nested, folders, lazy: true };
}

/** The memory over its folder, from a loaded store — what the views hand to
 *  `memorySelection`, `pulseGrid` and `computeSnapshot`. */
export const memoryOver = (doc: MemoryDoc, docPath: string | null, store: MemoryStore): MemoryOverFolder<Unit> =>
  memoryOverFolder(doc, docPath, store.units.map((u) => ({ item: u, fields: u.fields })), store.nested, store.folders);
