/**
 * GOLDEN RULES — how one directory entry PRESENTS in a tree.
 *
 * A folder whose name carries a file extension is a VERSIONED FILE: the folder
 * is the document, its child files are its versions. It reads as a single
 * file-like row (own icon, no chevron), never expands in the tree, and opens
 * as a document. The file system itself stays plain — presentation is derived,
 * so any tool listing the same store sees the same thing.
 *
 * One extension is claimed above versioning: a folder named `*.node` is a
 * STRUCTURED NODE — a document split into a `schema` child (the shape, with
 * stable ids) and a `content` child (the data, referencing those ids).
 * It too reads as one document; its faces (structured / schema / content)
 * live inside its open surface, not in the tree.
 */
import { DecisionTable, decide } from "../decision/decisionTable";
import { FsKind, extensionOf } from "./types";

/** The folder extension that marks a structured (schema + content) node. */
export const STRUCTURED_EXTENSION = "node";

export interface EntryCtx {
  kind: FsKind;
  /** Does the entry's NAME carry a file extension (".playbook", ".brief", …)? */
  hasExtension: boolean;
  /** The extension itself (lowercased, "" when none) — one folder extension
   *  (`node`) means structured, every other one means versioned. */
  extension: string;
}

export interface EntryPresentation {
  presents: "folder" | "file" | "versioned" | "structured";
  /** Tree click toggles children. */
  expands: boolean;
  /** What opening the entry means for a host app. */
  opensAs: "folder" | "document";
}

export const entryRules: DecisionTable<EntryCtx, EntryPresentation> = {
  name: "entry-presentation",
  answers: "Does one tree entry present as a folder, a file, a versioned file, or a structured node?",
  rules: [
    { rule: "structured",
      because: "a `*.node` folder is one document split into schema + content — its children are its two halves, not places to navigate and not versions",
      when: { kind: "folder", extension: STRUCTURED_EXTENSION },
      then: { presents: "structured", expands: false, opensAs: "document" } },
    { rule: "versioned",
      because: "a folder named like a file holds versions OF that file — it reads as one document and its children are its history, not places to navigate",
      when: { kind: "folder", hasExtension: true },
      then: { presents: "versioned", expands: false, opensAs: "document" } },
    { rule: "folder",
      because: "plain folders are for navigation",
      when: { kind: "folder" },
      then: { presents: "folder", expands: true, opensAs: "folder" } },
  ],
  otherwise: { presents: "file", expands: false, opensAs: "document" },
};

/** Convenience over the table for callers holding an FsEntry-shaped object. */
export const presentEntry = (e: { kind: FsKind; path: string }): EntryPresentation => {
  const ext = extensionOf(e.path);
  return decide(entryRules, { kind: e.kind, hasExtension: !!ext, extension: ext }).outcome;
};

export const isVersionedEntry = (e: { kind: FsKind; path: string }): boolean =>
  presentEntry(e).presents === "versioned";

/** Is this path's NAME a structured node's (`*.node`)? Pure string check —
 *  callers that only have a path (no kind) use it to keep versioned-file
 *  machinery (latest-fallbacks, pin probes) off structured nodes. */
export const isStructuredName = (path: string): boolean =>
  extensionOf(path) === STRUCTURED_EXTENSION;
