/**
 * The `.brief` file kind: a nested set of titled sections, each with a one-line
 * description, a markdown body, and — where what the section holds is a document
 * of another kind — that document, written in.
 *
 * It exists because the shape kept being wanted outside the one place it grew. The foundry
 * FEATURES stage renders exactly this — a tree on the left, and a title + description +
 * rendered markdown for whichever node you click — and there was no way to author one as an
 * ordinary file, or to point a loom role at it.
 *
 * So `.brief` is that UI made into a file, and it renders through the SAME component
 * (`FeatureTreeExplorer`), not a copy of it. The only thing this module does is translate
 * between the readable YAML spelling and the node shape that explorer already takes:
 *
 *     YAML          in memory
 *     title    ↔    name
 *     body     ↔    prose
 *     content  ↔    content
 *     children ↔    children
 *
 * The YAML spelling wins on the file side because `title`/`description`/`body` is what every
 * other authored kind here uses (`.list`, `.kanban`, `.email`), and a file people and agents
 * write should not inherit a vocabulary from the one stage that happened to need it first.
 *
 * A SECTION CAN HOLD ONE DOCUMENT OF ANY KIND the Studio knows — a playbook, a kanban, a
 * guide, a policy, a data table, markdown — written in the section as `content: {kind, doc}`
 * (writtenDocument.ts): `kind` names the engine, `doc` is the document exactly as a file of
 * that kind would hold it. The viewer shows it under the section's prose through that kind's
 * own viewer, and the checker runs it through that kind's own engine, so a broken document in
 * a section is a broken brief. One document per section: a section that needs two has two
 * children. Refused (`briefProblems`): a `content` that is not a mapping, one without `kind`
 * or without `doc`, an `md` document that is not a string, and `by`, `docs` or `file` on it —
 * a brief has no answers to vary by and names no file.
 *
 *     sections:
 *       - title: The master is read
 *         body: What happens, in prose; the moments that can arise are the book below.
 *         content:
 *           kind: playbook
 *           doc:
 *             version: 2
 *             events:
 *               - key: missing
 *                 label: The master playbook is missing
 *                 content: {kind: md, doc: The missing note goes out, exit 0.}
 *
 * Parsing is LENIENT and never throws — a half-written file still has to render. It also
 * accepts the in-memory spelling (`name`/`prose`) and the foundry array key (`features`), so
 * a features payload pasted into a `.brief` just works.
 */
import yaml from "js-yaml";
import type { FeatureNode } from "./featureTree";
import { writtenKind, type WrittenDocument } from "./writtenDocument";

/** A parsed `.brief`. `sections` is the tree, in the explorer's own node shape. */
export interface BriefDoc {
  title: string;
  description: string;
  sections: FeatureNode[];
}

/** Keys this module owns on a node; anything else is carried through untouched.
 *
 *  `opId` is listed so it is NOT written back out: it is provenance stamped by the diff engine
 *  (`__op`), not something the document says about itself, and a marked view being edited must not
 *  bake it into the file. */
const NODE_KEYS = new Set([
  "title", "name", "heading", "description", "body", "prose", "content", "children",
  "change", "__change", "__was", "__op", "opId", "__note", "note",
]);

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

export const emptyBrief = (): BriefDoc => ({ title: "", description: "", sections: [] });

/** A section's written document: kept when it is a mapping — its kind normalised, its doc as
 *  parsed, whatever shape; the kind's own engine judges it. Anything else is not content. */
const coerceContent = (raw: unknown): WrittenDocument | null =>
  isObj(raw) ? { kind: writtenKind(raw.kind) ?? "", doc: raw.doc } : null;

function coerceNode(raw: unknown): FeatureNode | null {
  if (!isObj(raw)) return null;
  // `title` is the authored spelling, `name` the in-memory one — accept either so a
  // foundry features payload can be pasted in as-is.
  // `heading` is accepted alongside `title`/`name` because an agent writing a brief reaches for it
  // naturally — the schema's own wording for `title` is "the section heading" — and a section whose
  // name silently reads as empty renders as "Untitled" with its content intact but unusable.
  const node: FeatureNode = { name: asStr(raw.title) || asStr(raw.name) || asStr(raw.heading) };
  const description = asStr(raw.description);
  if (description) node.description = description;
  const body = asStr(raw.body) || asStr(raw.prose);
  if (body) node.prose = body;
  const content = coerceContent(raw.content);
  if (content) node.content = content;
  // `__change` is what the diff engine stamps when contributions are applied; `change` is
  // the authored spelling. Reading both is what makes a contributed section arrive already
  // coloured in the explorer, with no separate provenance channel to keep in step.
  const change = raw.change ?? (raw.__change === "delete" ? "remove" : raw.__change);
  if (change === "add" || change === "edit" || change === "remove") node.change = change;
  // Which op did this, when the section arrived through an applied diff. Carried into the node so
  // the UI can go from a coloured section back to the change that caused it.
  const opId = asStr(raw.__op);
  if (opId) node.opId = opId;
  // Why this section changed, when it came from a diff. Read here so the explanation can be shown
  // beside the coloured tree rather than only existing in the raw YAML.
  const note = asStr(raw.__note);
  if (note) node.note = note;
  // The previous wording, stamped alongside `__change` by the diff marker. Both
  // spellings of the body field are read, for the same reason `body`/`prose` are
  // above: the marker copies whatever the document happened to use.
  const was = raw.__was as Record<string, unknown> | undefined;
  if (was && typeof was === "object") {
    const wasProse = asStr(was.body) || asStr(was.prose);
    const wasDesc = asStr(was.description);
    if (wasProse || wasDesc) {
      node.was = { ...(wasDesc ? { description: wasDesc } : {}), ...(wasProse ? { prose: wasProse } : {}) };
    }
  }
  const children = Array.isArray(raw.children) ? raw.children.map(coerceNode).filter((n): n is FeatureNode => !!n) : [];
  if (children.length) node.children = children;
  // Unknown keys survive the round trip, so an id or a tag someone adds by hand is not
  // silently eaten the first time the tree is edited in the UI.
  for (const [key, value] of Object.entries(raw)) {
    if (!NODE_KEYS.has(key)) (node as unknown as Record<string, unknown>)[key] = value;
  }
  return node;
}

/** Parse a `.brief` body. Never throws: an unparseable file reads as empty. */
export function parseBrief(content: string): BriefDoc {
  if (!content.trim()) return emptyBrief();
  let loaded: unknown;
  try { loaded = yaml.load(content); } catch { return emptyBrief(); }
  if (!isObj(loaded)) return emptyBrief();
  // `sections` is the documented key; `features` is accepted so the foundry stage's own
  // output drops straight in.
  const list = Array.isArray(loaded.sections) ? loaded.sections
    : Array.isArray(loaded.features) ? loaded.features
    : Array.isArray(loaded.items) ? loaded.items
    : [];
  return {
    title: asStr(loaded.title),
    description: asStr(loaded.description),
    sections: list.map(coerceNode).filter((n): n is FeatureNode => !!n),
  };
}

function nodeToRaw(node: FeatureNode): Record<string, unknown> {
  const out: Record<string, unknown> = { title: node.name };
  if (node.description) out.description = node.description;
  if (node.prose) out.body = node.prose;
  if (node.content) {
    const c: Record<string, unknown> = {};
    if (node.content.kind) c.kind = node.content.kind;
    if (node.content.doc !== undefined) c.doc = node.content.doc;
    out.content = c;
  }
  if (node.change) out.change = node.change;
  for (const [key, value] of Object.entries(node)) {
    if (!NODE_KEYS.has(key)) out[key] = value;
  }
  // Written last so the nested block sits at the bottom of the node, where it reads.
  if (node.children?.length) out.children = node.children.map(nodeToRaw);
  return out;
}

/** Serialize back to YAML, dropping empty optionals so the stored file stays clean. */
export function dumpBrief(doc: BriefDoc): string {
  const out: Record<string, unknown> = {};
  if (doc.title.trim()) out.title = doc.title.trim();
  if (doc.description.trim()) out.description = doc.description.trim();
  out.sections = doc.sections.map(nodeToRaw);
  return yaml.dump(out, { lineWidth: 120, noRefs: true });
}

/** Replace just the tree, keeping the document-level title/description. */
export const withSections = (doc: BriefDoc, sections: FeatureNode[]): BriefDoc => ({ ...doc, sections });

/**
 * Is this `.brief` body a LENS over Shortcut rather than authored prose?
 *
 * The test is `select.epic`, not `source: shortcut` — the epic is the only key a
 * lens cannot do without, and requiring the source line would make a lens that
 * omitted it render as an empty brief with no explanation. A file carrying
 * `sections` is authored prose and is never treated as a lens, even if someone
 * has also left a `select` in it: the prose is right there, and resolving over
 * the top of it would silently discard what they wrote.
 */
export function briefLensOf(content: string): Record<string, unknown> | null {
  if (!content.trim()) return null;
  let loaded: unknown;
  try { loaded = yaml.load(content); } catch { return null; }
  if (!isObj(loaded)) return null;
  if (Array.isArray(loaded.sections) || Array.isArray(loaded.features) || Array.isArray(loaded.items)) return null;
  const select = loaded.select;
  if (!isObj(select) || typeof select.epic !== "number") return null;
  return loaded;
}

/** The section list a node holds, in the spellings the parser reads: `sections`, `features` or
 *  `items` at the root, `children` below. */
const listOf = (raw: Record<string, unknown>, root: boolean): unknown[] => {
  if (!root) return Array.isArray(raw.children) ? raw.children : [];
  return Array.isArray(raw.sections) ? raw.sections
    : Array.isArray(raw.features) ? raw.features
    : Array.isArray(raw.items) ? raw.items
    : [];
};

/**
 * What a section's `content` cannot be, read from the text as written: not a mapping; no
 * `kind`; no `doc`; an `md` document that is not a string; `by`, `docs` or `file` on it — a
 * brief has no answers to vary by and names no file. Each is named by the section's title
 * chain. A YAML error is not reported here: the checker reports it first, and a lenient
 * parse has nothing to say about it.
 */
export function briefProblems(text: string): string[] {
  let loaded: unknown;
  try { loaded = yaml.load(text); } catch { return []; }
  if (!isObj(loaded)) return [];
  const out: string[] = [];
  const walk = (list: unknown[], prefix: string) => {
    for (const raw of list) {
      if (!isObj(raw)) continue;
      const name = asStr(raw.title) || asStr(raw.name) || asStr(raw.heading) || "Untitled";
      const path = prefix ? `${prefix} › ${name}` : name;
      if (raw.content !== undefined) {
        const where = `section ${path}`;
        const c = raw.content;
        if (!isObj(c)) out.push(`${where}: \`content\` is not a mapping — write \`kind\` and \`doc\``);
        else {
          const kind = writtenKind(c.kind);
          if (!kind) out.push(`${where}: \`content\` has no \`kind\` — say which kind renders it (playbook, kanban, md, …)`);
          if (c.doc === undefined) out.push(`${where}: \`content\` has no \`doc\` — the document itself, as a file of that kind would hold it`);
          for (const k of ["by", "docs", "file"]) {
            if (c[k] !== undefined) out.push(`${where}: \`content\` has \`${k}\` — a section holds one document written in; a brief has no answers to vary by and names no file`);
          }
          if (kind === "md" && c.doc !== undefined && typeof c.doc !== "string") out.push(`${where}: an \`md\` document is its text — write it as a block string`);
        }
      }
      walk(listOf(raw, false), path);
    }
  };
  walk(listOf(loaded, true), "");
  return out;
}

/** Every section holding a written document, with where it sits (`section Money › Banking`). */
export const writtenSections = (doc: BriefDoc): { where: string; node: FeatureNode; content: WrittenDocument }[] =>
  [...flattenBrief(doc.sections)]
    .filter(([, node]) => !!node.content)
    .map(([path, node]) => ({ where: `section ${path}`, node, content: node.content! }));

/** Flatten to `path → node` for diffing, where a path is the chain of titles. A title
 *  is the only stable-ish handle a `.brief` node has (it has no id), which is also why
 *  the diff reports a rename as a delete plus an add rather than pretending to track it. */
export function flattenBrief(sections: FeatureNode[], prefix = ""): Map<string, FeatureNode> {
  const out = new Map<string, FeatureNode>();
  for (const node of sections) {
    const path = prefix ? `${prefix} › ${node.name || "Untitled"}` : (node.name || "Untitled");
    out.set(path, node);
    if (node.children?.length) for (const [key, value] of flattenBrief(node.children, path)) out.set(key, value);
  }
  return out;
}
