/**
 * A `.project` file — the ENTRY POINT of a project. Nodes folders store
 * files; a project is the container that gathers every tool's artifacts
 * into one place, whatever nodes folders they live in.
 *
 * Its body is a tree of items:
 *   file   — one document, shown WITHOUT its extension, iconed by its KIND
 *            (a points item, a policy item, ...); opens as its preview
 *   node   — a REFERENCE to a whole nodes folder, shown as ONE item; opens
 *            as a raw folder browser (extensions visible there)
 *   folder — grouping inside the project itself
 *
 * A project also has a MODE — how its surface is drawn:
 *   (none)     — the item tree above; the classic container
 *   directory  — the project IS a folder (`root`): a file browser over it,
 *                files of any kind added as you go, no groups; items, if
 *                any, only show in the item-tree mode
 *   memory     — the same material as WORKING MEMORY: a `.memory` lens
 *                (`memory`) over the root (or the items), everything
 *                landing in Everything else until foci are authored
 * The mode flips both ways; the lens keeps its foci while the project is
 * back in directory mode.
 */
import yaml from "js-yaml";

export type ProjectMode = "directory" | "memory";

export interface ProjectItem {
  label?: string;
  /** Exactly one of these four. */
  file?: string;
  node?: string;
  items?: ProjectItem[];
  /** A whole OTHER PROJECT as one node: its EXPORTED items show as children
   *  of this reference and open as if they were this project's own
   *  documents — shared inputs reused across many projects. */
  project?: string;
  /** With `file` pointing at a stream: this item IS one STAGE of it, standing
   *  alone in the hierarchy — the stream itself needs no node of its own. */
  stage?: string;
  /** Exported to the outside — a project REFERENCING this project shows this
   *  item as a child of its reference node. */
  export?: boolean;
}

/** One end of a project link: an item's file, optionally narrowed to one of
 *  its stages (the points-stream / workup `stage` addressing) or to one
 *  policy element (`element: decision:incorporation`). */
export interface ProjectLinkEnd {
  file: string;
  stage?: string;
  element?: string;
}

/**
 * A typed EDGE between project items — the project's dependency DAG,
 * carried as data. `from` came before / produced / feeds `to`. A future
 * DAG rendering of the project draws exactly these; until then the views
 * surface them as "feeds → / fed by ←" affordances.
 */
export interface ProjectLink {
  from: ProjectLinkEnd;
  to: ProjectLinkEnd;
  /** Edge type; default "feeds". */
  kind?: string;
  label?: string;
}

export interface ProjectDoc {
  name: string;
  description?: string;
  items: ProjectItem[];
  /** The dependency edges between items (see ProjectLink). */
  links?: ProjectLink[];
  /** How the surface is drawn; absent = the item tree. */
  mode?: ProjectMode;
  /** The folder a directory-mode project IS. */
  root?: string;
  /** The `.memory` lens a memory-mode project shows (kept across flips). */
  memory?: string;
}

/** The folder a project stands on: its declared root, else its first node reference. */
export function projectRoot(doc: ProjectDoc): string | null {
  if (doc.root) return doc.root;
  const walk = (items: ProjectItem[]): string | null => {
    for (const it of items) {
      if (it.node) return it.node;
      if (it.items) { const r = walk(it.items); if (r) return r; }
    }
    return null;
  };
  return walk(doc.items);
}

/** Where a project's lens lives by default: beside the other working memories. */
export const projectMemoryPath = (doc: ProjectDoc): string => doc.memory ?? `/memory/${doc.name.replace(/[/\\]+/g, " ").trim() || "project"}.memory`;

/**
 * Set or clear top-level scalars (`mode`, `root`, `memory`) by LINE
 * surgery, so the items and every comment survive byte-for-byte: an
 * existing line is replaced in place, a new one goes right after
 * `description:` (else `name:`, else the top), `undefined` removes the line.
 */
export function writeProjectTop(text: string, patch: { mode?: ProjectMode; root?: string; memory?: string }): string {
  const KEYS = ["mode", "root", "memory"] as const;
  const lineRe = (key: string) => new RegExp(`^${key}:(\\s|$)`);
  const lines = text.split("\n");
  // Removals first, so the insertion point is measured on the final text.
  for (const key of KEYS) {
    if (key in patch && patch[key] === undefined) {
      const at = lines.findIndex((l) => lineRe(key).test(l));
      if (at >= 0) lines.splice(at, 1);
    }
  }
  // New keys go after the last of these keys already present, else after
  // the description (or the name) — in the order given, each after the last.
  const anchor = lines.findIndex((l) => /^description:/.test(l));
  const nameAt = lines.findIndex((l) => /^name:/.test(l));
  let cursor = anchor >= 0 ? anchor + 1 : nameAt >= 0 ? nameAt + 1 : 0;
  // A multi-line description (block scalar) keeps its indented lines together.
  if (anchor >= 0) while (cursor < lines.length && /^\s+\S/.test(lines[cursor])) cursor++;
  for (const key of KEYS) {
    const at = lines.findIndex((l) => lineRe(key).test(l));
    if (at >= 0) cursor = Math.max(cursor, at + 1);
  }
  for (const key of KEYS) {
    if (!(key in patch) || patch[key] === undefined) continue;
    const line = `${key}: ${yScalar(patch[key]!)}`;
    const at = lines.findIndex((l) => lineRe(key).test(l));
    if (at >= 0) { lines[at] = line; continue; }
    lines.splice(cursor, 0, line);
    cursor++;
  }
  return lines.join("\n");
}

export type ProjectItemKind = "file" | "node" | "folder" | "project";

export const itemKind = (it: ProjectItem): ProjectItemKind =>
  it.file ? "file" : it.node ? "node" : it.project ? "project" : "folder";

/** The display name: label wins; a file falls back to its name WITHOUT the
 *  extension (the kind icon carries that information); a node to its folder
 *  name. */
export function itemLabel(it: ProjectItem): string {
  if (it.label) return it.label;
  const path = it.file ?? it.node ?? it.project ?? "";
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (it.file || it.project) {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(0, i) : name;
  }
  return name || "Untitled";
}

/** Every FILE item of the project, depth-first — the flat list benches and
 *  pickers work from. Node references are folders, not files: not included. */
export function fileItemsOf(doc: ProjectDoc): { file: string; label: string }[] {
  const out: { file: string; label: string }[] = [];
  const walk = (items: ProjectItem[]) => {
    for (const it of items) {
      if (it.file) out.push({ file: it.file, label: itemLabel(it) });
      if (it.items) walk(it.items);
    }
  };
  walk(doc.items);
  return out;
}

/** The items a REFERENCING project shows as children of its reference node —
 *  exported file items, depth-first. */
export function exportedProjectItems(doc: ProjectDoc): { file: string; label: string }[] {
  const out: { file: string; label: string }[] = [];
  const walk = (items: ProjectItem[]) => {
    for (const it of items) {
      if (it.export && it.file) out.push({ file: it.file, label: itemLabel(it) });
      if (it.items) walk(it.items);
    }
  };
  walk(doc.items);
  return out;
}

/** Single-line YAML scalar, quoted only when it needs to be. */
const yScalar = (v: string) => {
  const special = [":", "#", "'", '"', "\n", "\\"].some((c) => v.includes(c)) || v !== v.trim();
  return special ? JSON.stringify(v) : v;
};

/**
 * Insert one file item as the NEXT SIBLING of the item whose `file:` is
 * `afterFile` — by LINE insertion, so comments and formatting elsewhere in
 * the project survive. Idempotent: if `item.file` already appears anywhere,
 * the text returns unchanged. Falls back to appending under a top-level
 * `items:` when `afterFile` is not found.
 */
export function insertItemAfterFile(text: string, afterFile: string, item: { file: string; label?: string }): string {
  if (text.includes(item.file)) return text;
  const lines = text.split("\n");
  const fileRe = new RegExp("^(\\s*)(-\\s+)?file:\\s*([\"']?)" + afterFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\3\\s*$");
  const hit = lines.findIndex((l) => fileRe.test(l));
  const emit = (ws: string) => [
    `${ws}- label: ${yScalar(item.label ?? item.file)}`,
    `${ws}  file: ${yScalar(item.file)}`,
  ];
  if (hit < 0) {
    // Append as a last top-level item.
    const itemsAt = lines.findIndex((l) => /^items:\s*$/.test(l));
    if (itemsAt < 0) return text + (text.endsWith("\n") ? "" : "\n") + "items:\n" + emit("  ").join("\n") + "\n";
    let end = lines.length;
    for (let i = itemsAt + 1; i < lines.length; i++) {
      if (lines[i].trim() && !/^\s/.test(lines[i])) { end = i; break; }
    }
    lines.splice(end, 0, ...emit("  "));
    return lines.join("\n");
  }
  // The owning item's dash line: the file line itself, or the nearest dash
  // line above it at a shallower indent.
  let dash = hit;
  if (!/^\s*-\s/.test(lines[hit])) {
    const propIndent = (lines[hit].match(/^(\s*)/)?.[1] ?? "").length;
    for (let i = hit - 1; i >= 0; i--) {
      const m = lines[i].match(/^(\s*)-\s/);
      if (m && m[1].length < propIndent) { dash = i; break; }
    }
  }
  const ws = lines[dash].match(/^(\s*)/)?.[1] ?? "";
  let end = lines.length;
  for (let i = dash + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const indent = (l.match(/^(\s*)/)?.[1] ?? "").length;
    if (indent <= ws.length) { end = i; break; }
  }
  while (end > dash + 1 && !lines[end - 1].trim()) end--;
  lines.splice(end, 0, ...emit(ws));
  return lines.join("\n");
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

function parseItems(x: unknown): ProjectItem[] {
  return arr(x).map((raw) => {
    const o = rec(raw);
    const file = str(o.file);
    const node = str(o.node);
    const project = str(o.project);
    const kids = parseItems(o.items);
    if (!file && !node && !project && !kids.length && !str(o.label)) return null;
    return {
      ...(str(o.label) ? { label: str(o.label)! } : {}),
      ...(file ? { file } : node ? { node } : project ? { project } : { items: kids }),
      ...(file && str(o.stage) ? { stage: str(o.stage)! } : {}),
      ...(o.export === true ? { export: true } : {}),
    };
  }).filter(Boolean) as ProjectItem[];
}

function parseLinkEnd(x: unknown): ProjectLinkEnd | null {
  if (typeof x === "string") return { file: x };
  const o = rec(x);
  const file = str(o.file);
  return file ? {
    file,
    ...(str(o.stage) ? { stage: str(o.stage)! } : {}),
    ...(str(o.element) ? { element: str(o.element)! } : {}),
  } : null;
}

export function parseProject(text: string): ProjectDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  const links = arr(raw.links).map((x) => {
    const o = rec(x);
    const from = parseLinkEnd(o.from);
    const to = parseLinkEnd(o.to);
    if (!from || !to) return null;
    return {
      from, to,
      ...(str(o.kind) ? { kind: str(o.kind)! } : {}),
      ...(str(o.label) ? { label: str(o.label)! } : {}),
    };
  }).filter(Boolean) as ProjectLink[];
  const mode = raw.mode === "directory" || raw.mode === "memory" ? raw.mode : undefined;
  return {
    name: str(raw.name) ?? "Project",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    items: parseItems(raw.items),
    ...(links.length ? { links } : {}),
    ...(mode ? { mode } : {}),
    ...(str(raw.root) ? { root: str(raw.root)! } : {}),
    ...(str(raw.memory) ? { memory: str(raw.memory)! } : {}),
  };
}

/** The edges touching one item's file: what it feeds, and what fed it. */
export function linksTouching(doc: ProjectDoc, file: string): { outgoing: ProjectLink[]; incoming: ProjectLink[] } {
  const links = doc.links ?? [];
  return {
    outgoing: links.filter((l) => l.from.file === file),
    incoming: links.filter((l) => l.to.file === file),
  };
}

export function dumpProject(doc: ProjectDoc): string {
  const items = (list: ProjectItem[]): unknown[] => list.map((it) => ({
    ...(it.label ? { label: it.label } : {}),
    ...(it.file ? { file: it.file } : {}),
    ...(it.stage ? { stage: it.stage } : {}),
    ...(it.node ? { node: it.node } : {}),
    ...(it.project ? { project: it.project } : {}),
    ...(it.export ? { export: true } : {}),
    ...(it.items ? { items: items(it.items) } : {}),
  }));
  const end = (e: ProjectLinkEnd) => ({
    file: e.file,
    ...(e.stage ? { stage: e.stage } : {}),
    ...(e.element ? { element: e.element } : {}),
  });
  return yaml.dump({
    name: doc.name,
    ...(doc.description ? { description: doc.description } : {}),
    ...(doc.mode ? { mode: doc.mode } : {}),
    ...(doc.root ? { root: doc.root } : {}),
    ...(doc.memory ? { memory: doc.memory } : {}),
    items: items(doc.items),
    ...(doc.links?.length ? {
      links: doc.links.map((l) => ({
        from: end(l.from), to: end(l.to),
        ...(l.kind ? { kind: l.kind } : {}),
        ...(l.label ? { label: l.label } : {}),
      })),
    } : {}),
  }, { lineWidth: -1, noRefs: true });
}
