/**
 * The `.memory` kind — a WORKING MEMORY over the flat node store.
 *
 * The store keeps everything and may grow without limit; a memory is a LENS
 * that retrieves a working set from it on demand. It owns no nodes — it is a
 * saved query, so nothing moves when attention moves, a node can sit in many
 * memories at once, and a node in none is simply unmatched, by design.
 *
 *   include   — clauses over a node's index fields saying what counts as a
 *               UNIT of this memory at all (empty = every entry).
 *   options   — togglable slices, checkboxes OUTSIDE the decisions: while
 *               one is off, units matching its clauses drop out with the
 *               include step. Display machinery, not attention — nothing
 *               groups by it and nothing parks in an else.
 *   decisions — the criteria, each with answers and derive rules — the same
 *               decisions block a ranking carries, PLUS the decisionSpace
 *               hierarchy: an answer can `activate` further decisions that
 *               are LOCALIZED to it, and answers can be gated with `when`.
 *               Levels, not removal: each answer narrows the set and brings
 *               the next, narrower question onto the table.
 *   locks     — the answers currently taken (`decision=answer` refs). Saved
 *               in the file: attention is a fact worth keeping, and an agent
 *               can set it by editing the document.
 *
 * Selection: a unit is VISIBLE when its derived answer agrees with every
 * lock. The first active decision still unanswered GROUPS the visible set —
 * answering it filters, and the next question takes over the grouping.
 *
 * Every decision also carries the STRUCTURAL ELSE (`~else`, "Everything
 * else"): the complement of its named answers, synthesized by the engine so
 * it never has to be authored. The named answers are the known parameters;
 * the else is the information not needed at this stage — groupable, takeable
 * as a lock, never silently dropped.
 *
 * OVER A FOLDER (the desktop app, the VS Code extension, any store): a memory
 * looks at the folder it sits in (`scope:` widens or moves that — `/` is
 * the whole store). Its units are the DOCUMENTS under the scope: files and
 * structured folders, never plain folders or other `.memory` files. When it
 * authors no decisions — an EMPTY file is enough — the folder itself splits
 * it: each sub-folder holding units is a focus, the files sitting directly in
 * the folder are Everything else, and taking a focus brings that sub-folder's
 * own split onto the table: the decisions of the first `.memory` found in it
 * when there is one, its sub-folders otherwise, down to the leaves. So the
 * folder tree is the default hierarchy, and a memory dropped into a folder
 * replaces the split from there down. See `folderSpace`.
 */
import yaml from "js-yaml";
import {
  activeDecisions, decisionRows, isStructuredName, joinPath, parentOf, pruneLocks, refOf, resolveRef, splitRef,
  type SpaceDecision,
} from "crosscut";
import { clauseHolds, parseClauses, type PolicyClause, type PolicyInput } from "./policyDoc";
import { answerFor, parseRankingDecisions, type Answer, type RankDerive, type RankingDecision } from "./rankingDoc";

/** One saved state of attention: what was taken, when. */
export interface JournalEntry {
  at: string;
  locks: string[];
}

/** One togglable slice — a checkbox OUTSIDE the decisions. `matches` names
 *  the units it governs (ALL clauses must hold); while `on` is false they
 *  drop out with the include step, before any decision sees them. Unlike a
 *  lock this is not attention — nothing groups by it, nothing parks in an
 *  else — it is display machinery, so it lives beside `include`, not among
 *  the decisions. An absent `on` reads true: declaring an option never
 *  hides anything until someone unticks it. */
export interface MemoryOption {
  key: string;
  label: string;
  on: boolean;
  matches: PolicyClause[];
}

export interface MemoryDoc {
  title: string;
  description?: string;
  /** The folder this memory looks at, as authored: an absolute store path
   *  (`/` = the whole store) or one relative to the memory's own folder.
   *  Absent = the memory's own folder. Resolved by `memoryScope`. */
  scope?: string;
  /** ALL clauses must hold for an entry to be a unit. Empty = everything. */
  include: PolicyClause[];
  /** Togglable slices, checkboxes in the view — see MemoryOption. */
  options: MemoryOption[];
  decisions: RankingDecision[];
  /** The taken assignment — `decision=answer` refs, saved with the doc. */
  locks: string[];
  /** The attention trail — every state the locks have passed through, oldest
   *  first, capped. Written by `writeLocks`, never authored: attention
   *  movement is process-authored fact, and this is its event log. */
  journal: JournalEntry[];
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

const parseRefs = (x: unknown): string[] =>
  arr(x).map(str).filter((r): r is string => !!r && r.includes("="));

export function parseMemory(text: string): MemoryDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  return {
    title: str(raw.title) ?? "Memory",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    ...(str(raw.scope)?.trim() ? { scope: str(raw.scope)!.trim() } : {}),
    include: parseClauses(raw.include),
    options: arr(raw.options).map(rec).flatMap((o) => {
      const key = str(o.key);
      return key
        ? [{ key, label: str(o.label) ?? key, on: o.on !== false, matches: parseClauses(o.matches) }]
        : [];
    }),
    decisions: parseRankingDecisions(raw.decisions),
    locks: parseRefs(raw.locks),
    journal: arr(raw.journal).map(rec).flatMap((j) => {
      const at = str(j.at) ?? (j.at instanceof Date ? j.at.toISOString() : undefined);
      return at ? [{ at, locks: parseRefs(j.locks) }] : [];
    }),
  };
}

const LOCKS_BANNER = "# The answers currently taken. Written by the memory view — keep last.";

/** The journal keeps this many states — enough to see the movement, never
 *  enough to become an archive (the store's own timestamps are that). */
const JOURNAL_CAP = 50;

/**
 * The document with new `locks:` and `journal:` blocks, as TEXT. Everything
 * above the banner returns byte-for-byte — the authored criteria and their
 * comments are never re-serialized (same contract as a ranking's
 * `writeTags`). Each save whose locks DIFFER from the journal's last state
 * appends one `{at, locks}` entry, so the attention trail records itself as
 * a side effect of using the pills. `now` is injectable for tests.
 */
export function writeLocks(text: string, locks: string[], now?: string): string {
  const lines = text.split("\n");
  const banner = lines.findIndex((l) => l.trim() === LOCKS_BANNER);
  const at = banner >= 0 ? banner : lines.findIndex((l) => /^locks:/.test(l));
  const head = (at < 0 ? lines : lines.slice(0, at)).join("\n").replace(/\s*$/, "");

  const prior = parseMemory(text).journal;
  const last = prior[prior.length - 1];
  const changed = !last || last.locks.join("|") !== locks.join("|");
  const journal = (changed ? [...prior, { at: now ?? new Date().toISOString(), locks }] : prior)
    .slice(-JOURNAL_CAP);

  // An empty file (a memory that is just its folder) stays empty until an
  // answer is taken, and then starts at the banner — no blank lead-in.
  if (!locks.length && !journal.length) return head ? `${head}\n` : "";
  const jLines = journal.map((j) => `  - {at: "${j.at}", locks: [${j.locks.join(", ")}]}`).join("\n");
  return `${head ? `${head}\n\n` : ""}${LOCKS_BANNER}\nlocks: [${locks.join(", ")}]\n` +
    (journal.length ? `journal:\n${jLines}\n` : "");
}

/**
 * The document with one option's `on:` flipped, as TEXT. A targeted edit of
 * that entry's `on:` value alone — the authored head is not re-serialized,
 * so every comment survives byte-for-byte (same contract as writeLocks).
 * It relies on the authoring convention that each option is a ONE-LINE flow
 * map (`- {key: …, on: false, matches: […]}`); an option written otherwise
 * is left unchanged rather than guessed at.
 */
export function writeOption(text: string, key: string, on: boolean): string {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^(\\s*-\\s*\\{\\s*key:\\s*${esc}\\b[^\\n]*?\\bon:\\s*)(true|false)`, "m");
  return text.replace(re, `$1${on}`);
}

/* ── The structural else ─────────────────────────────────────────────────── */

/** The built-in answer EVERY decision offers: the complement of the named
 *  ones. Authored answers are the known parameters; `~else` is everything
 *  they don't claim — the information not needed at this stage, still one
 *  click away, never silently dropped. Synthesized here, never written in
 *  the file. */
export const ELSE = "~else";
export const ELSE_LABEL = "Everything else";

/** Decisions with the structural else on each, always last, for pills and
 *  lock pruning. The else is synthesized — but an author MAY declare it
 *  (`- {key: "~else", activates: [ ... ]}`) purely to hang a deeper
 *  sub-focus under the complement: a resolved grouping parks there without
 *  being deleted, retrievable when it's needed again. A declared else keeps
 *  the canonical label unless the author spells a different one. */
export function withElse(decisions: RankingDecision[]): RankingDecision[] {
  return decisions.map((d) => {
    const declared = d.values.find((v) => v.key === ELSE);
    const named = d.values.filter((v) => v.key !== ELSE);
    const els = declared
      ? { ...declared, label: declared.label === ELSE ? ELSE_LABEL : declared.label }
      : { key: ELSE, label: ELSE_LABEL };
    return { ...d, values: [...named, els] };
  });
}

/* ── Selection ───────────────────────────────────────────────────────────── */

export interface MemoryUnit<T> {
  item: T;
  fields: Record<string, string>;
  answers: Answer[];
}

export interface MemoryGroup<T> {
  /** The answer key; ELSE for the structural everything-else group. */
  key: string;
  label: string;
  units: MemoryUnit<T>[];
}

export interface MemorySelection<T> {
  /** The taken assignment, PRUNED — answers to questions no longer on the
   *  table (a decision was deleted, its enabler cleared) drop out. */
  locks: string[];
  /** Everything the include clauses admit as a unit. */
  included: MemoryUnit<T>[];
  /** Units whose answers agree with every lock. */
  visible: MemoryUnit<T>[];
  /** The first active decision not yet answered — what groups the view.
   *  Null when every active decision is answered. */
  groupBy: RankingDecision | null;
  /** Visible units by the grouping decision's answers, declared order, the
   *  structural else always last. Without a groupBy, one group carries
   *  everything visible. */
  groups: MemoryGroup<T>[];
}

/** Whether an unticked option removes this unit — the one rule every lens
 *  over the memory shares (selection and pulse alike): a unit matching ALL
 *  of an off option's clauses leaves the working set with the include step.
 *  Clauseless options govern nothing — never "everything". */
export const hiddenByOptions = (options: MemoryOption[], fields: Record<string, string>): boolean =>
  options.some((o) => !o.on && o.matches.length > 0
    && o.matches.every((c) => clauseHolds(c, fields as PolicyInput)));

/** A unit's answer to one decision, by the ranking's precedence (its own
 *  field wins over derive rules; a memory has no hand-tags — overriding a
 *  node's answer belongs on the node, not in the lens). */
const answersOf = (decisions: RankingDecision[], fields: Record<string, string>): Answer[] =>
  decisions.map((d) => answerFor(d, { fields }, fields as PolicyInput));

export function memorySelection<T>(
  doc: MemoryDoc,
  items: { item: T; fields: Record<string, string> }[],
): MemorySelection<T> {
  // Pruning and activation run over the else-extended space, so a taken
  // `d=~else` survives exactly as long as its decision is on the table.
  const spaced = withElse(doc.decisions);
  const locks = pruneLocks(spaced, doc.locks);

  const included: MemoryUnit<T>[] = items
    .filter(({ fields }) => doc.include.every((c) => clauseHolds(c, fields as PolicyInput)))
    .filter(({ fields }) => !hiddenByOptions(doc.options, fields))
    .map(({ item, fields }) => ({ item, fields, answers: answersOf(doc.decisions, fields) }));

  const visible = included.filter((u) =>
    locks.every((ref) => {
      const [dk, vk] = splitRef(ref);
      const a = u.answers.find((x) => x.decision === dk)?.value ?? "";
      // The structural else matches what NO named answer claimed.
      return vk === ELSE ? a === "" : a === vk;
    }));

  // Reading order (hierarchy-aware), first unanswered active decision groups.
  // Singles included: a memory's decisions are retrieval cues, and a cue with
  // one answer is still a sub-focus, not a settled fact.
  const answered = new Set(locks.map((r) => splitRef(r)[0]));
  const order = decisionRows(spaced, locks, [], { includeSingles: true }).map((r) => r.decision.key);
  const activeKeys = new Set(activeDecisions(spaced, locks).map((d) => d.key));
  const groupKey = order.find((k) => activeKeys.has(k) && !answered.has(k))
    ?? [...activeKeys].find((k) => !answered.has(k));
  const groupBy = doc.decisions.find((d) => d.key === groupKey) ?? null;

  let groups: MemoryGroup<T>[];
  if (!groupBy) {
    groups = [{ key: "*", label: "Everything here", units: visible }];
  } else {
    // Named answers only — a declared "~else" is activation plumbing, and the
    // complement group is appended once, last, either way.
    const namedValues = groupBy.values.filter((v) => v.key !== ELSE);
    const byValue = new Map<string, MemoryUnit<T>[]>(namedValues.map((v) => [v.key, []]));
    const els: MemoryUnit<T>[] = [];
    for (const u of visible) {
      const a = u.answers.find((x) => x.decision === groupBy.key);
      (a?.value && byValue.get(a.value) ? byValue.get(a.value)! : els).push(u);
    }
    groups = [
      ...namedValues.map((v) => ({ key: v.key, label: v.label, units: byValue.get(v.key)! })),
      // Always present, always last: the complement is a stage, not an anomaly.
      { key: ELSE, label: ELSE_LABEL, units: els },
    ];
  }

  return { locks, included, visible, groupBy, groups };
}

/** A unit's full answer path through the hierarchy — machine key
 *  ("focus=fatin/ftopic=~else/fj=jason") and human labels
 *  (["Fatin", "Everything else", "Jason"]). What the moves view snapshots. */
export function answerPath(doc: MemoryDoc, fields: Record<string, string>): { key: string; labels: string[] } {
  const spaced = withElse(doc.decisions);
  const byKey = new Map(spaced.map((d) => [d.key, d]));
  const activated = new Set(spaced.flatMap((d) => d.values.flatMap((v) => v.activates ?? [])));
  const roots = spaced.filter((d) => !activated.has(d.key));
  const keys: string[] = [];
  const labels: string[] = [];
  const walk = (d: RankingDecision, seen: Set<string>) => {
    if (seen.has(d.key)) return;
    const deeper = new Set(seen).add(d.key);
    const a = answerFor(d, { fields }, fields as PolicyInput).value || ELSE;
    keys.push(`${d.key}=${a}`);
    const v = d.values.find((x) => x.key === a);
    labels.push(a === ELSE ? ELSE_LABEL : v?.label ?? a);
    for (const ck of v?.activates ?? []) {
      const child = byKey.get(ck);
      if (child) walk(child, deeper);
    }
  };
  for (const r of roots) walk(r, new Set());
  return { key: keys.join("/"), labels };
}

/* ── Over a folder ───────────────────────────────────────────────────────── */

/**
 * The folder a memory LOOKS AT: its own, unless `scope:` says otherwise —
 * an absolute store path (`/` = the whole store) or one relative to the
 * memory's folder (`..`). A memory with no path yet (unsaved, a story) sees
 * the whole store.
 */
export function memoryScope(doc: MemoryDoc, docPath: string | null): string {
  if (doc.scope) return resolveRef(docPath ?? "/", doc.scope);
  return docPath ? parentOf(docPath) : "/";
}

/** Is `path` strictly inside `folder`? */
export const underFolder = (path: string, folder: string): boolean =>
  folder === "/" ? path !== "/" && path.startsWith("/") : path.startsWith(`${folder}/`);

/**
 * What a memory can hold: the DOCUMENTS under its scope — files, and
 * structured folders (`*.node`) — never a plain folder (structure, not
 * content), never a `.memory` (the lenses themselves), never anything
 * inside a structured folder. The memory's `include` judges these next.
 */
export function unitsInScope<T extends { fields: Record<string, string> }>(scope: string, items: T[]): T[] {
  return items.filter(({ fields }) => {
    const p = fields.path ?? "";
    if (!underFolder(p, scope)) return false;
    if (fields.ext === "memory") return false;
    if (fields.kind === "folder" && fields.structured !== "yes") return false;
    return !p.split("/").slice(1, -1).some((seg) => isStructuredName(seg));
  });
}

/** The decision the engine synthesizes for one folder's sub-folders:
 *  `folder` for the scope itself, `folder/<path>` below it. Its answers
 *  are the sub-folder NAMES, so a lock reads `folder/Meme XP=money`. */
export const FOLDER_KEY = "folder";
export const folderKey = (scope: string, folder: string): string =>
  folder === scope ? FOLDER_KEY : `${FOLDER_KEY}${folder}`;
export const isFolderKey = (key: string): boolean => key === FOLDER_KEY || key.startsWith(`${FOLDER_KEY}/`);

/** The folders the taken folder answers OPEN, from the scope down —
 *  `folder=Meme XP` then `folder/Meme XP=money` is [`/Meme XP`, `/Meme XP/money`].
 *  It stops at an unanswered split, at an Everything-else answer, and at a
 *  folder whose split a memory of its own authors (its answers are not folder
 *  keys). What a memory read lazily has to list. */
export function takenFolderChain(scope: string, locks: readonly string[]): string[] {
  const out: string[] = [];
  let at = scope;
  for (let depth = 0; depth < 64; depth++) {
    const key = folderKey(scope, at);
    const ref = locks.find((r) => splitRef(r)[0] === key);
    const value = ref ? splitRef(ref)[1] : "";
    if (!value || value === ELSE) break;
    at = joinPath(at, value);
    out.push(at);
  }
  return out;
}

/** The memories INSIDE a scope, by the folder each sits in — the first
 *  `.memory` by name per folder, parsed. The scope's own folder is never
 *  here: the opened document speaks for it. */
export type NestedMemories = ReadonlyMap<string, { path: string; doc: MemoryDoc }>;

/**
 * THE DECISIONS ON THE TABLE for a memory over a folder.
 *
 * A folder is split by the memory sitting in it when that memory authors
 * decisions; otherwise by its sub-folders — one synthesized decision whose
 * answers are the sub-folders holding units (files sitting directly in the
 * folder are its Everything else), each answer activating the split of that
 * sub-folder in turn, to the leaves. The opened memory is the scope folder's
 * own; an empty file is a memory with no decisions, which is the folder
 * split.
 *
 * A nested memory's decisions are keyed under its folder (`/Meme XP/topic`)
 * so two folders can both ask "topic"; its `activates` and `when` refs
 * follow. In any memory, `activates: [folder]` hangs the memory's own
 * folder split under an answer and `activates: [folder/<path>]` that
 * folder's. A nested memory's `include`, `options` and `locks` apply only
 * when it is opened itself.
 */
export function folderSpace(
  scope: string, root: MemoryDoc, units: { fields: Record<string, string> }[], nested: NestedMemories,
  knownFolders: Iterable<string> = [],
): RankingDecision[] {
  // The folder tree the units span: immediate sub-folder names per folder.
  const kids = new Map<string, Set<string>>();
  for (const { fields } of units) {
    const p = fields.path ?? "";
    if (!underFolder(p, scope)) continue;
    const rel = scope === "/" ? p.slice(1) : p.slice(scope.length + 1);
    let at = scope;
    for (const seg of rel.split("/").slice(0, -1)) {
      if (!kids.has(at)) kids.set(at, new Set());
      kids.get(at)!.add(seg);
      at = joinPath(at, seg);
    }
  }
  // Folders known from a LISTING (a store read lazily): a focus before anything under it is
  // read — its own split appears once it is taken and listed in turn.
  for (const f of knownFolders) {
    if (!underFolder(f, scope)) continue;
    const parent = parentOf(f);
    if (!kids.has(parent)) kids.set(parent, new Set());
    kids.get(parent)!.add(f.slice(parent === "/" ? 1 : parent.length + 1));
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

  const out: RankingDecision[] = [];
  const splitMemo = new Map<string, string[]>();
  const memMemo = new Map<string, string[]>();

  /** The keys a folder puts on the table — what its parent's answer activates. */
  const level = (folder: string): string[] => {
    const mem = folder === scope ? root : nested.get(folder)?.doc;
    return mem?.decisions.length ? authored(folder, mem) : split(folder);
  };

  /** The synthesized sub-folder decision of one folder; none for a leaf. */
  const split = (folder: string): string[] => {
    const key = folderKey(scope, folder);
    if (splitMemo.has(key)) return splitMemo.get(key)!;
    splitMemo.set(key, []);
    const subs = [...(kids.get(folder) ?? [])].sort(byName);
    if (!subs.length) return [];
    const d: RankingDecision = {
      key,
      label: folder === scope ? "Focus" : "Sub-focus",
      detail: `The sub-folders of ${folder} — a .memory file inside one replaces its split; files sitting directly here are Everything else`,
      values: [],
      derive: subs.map((n) => ({ value: n, when: [{ param: "path", op: "starts_with" as const, value: `${joinPath(folder, n)}/` }] })),
    };
    out.push(d);
    splitMemo.set(key, [key]);
    d.values = subs.map((n) => {
      const a = level(joinPath(folder, n));
      return { key: n, label: n, ...(a.length ? { activates: a } : {}) };
    });
    return [key];
  };

  /** A memory's own decisions, localized under its folder. */
  const authored = (folder: string, mem: MemoryDoc): string[] => {
    if (memMemo.has(folder)) return memMemo.get(folder)!;
    memMemo.set(folder, []);
    const prefix = folder === scope ? "" : `${folder}/`;
    const own = new Set(mem.decisions.map((d) => d.key));
    const mapKey = (k: string): string => (own.has(k) ? `${prefix}${k}` : k);
    const hang = (k: string): string[] => {
      if (k === FOLDER_KEY) return split(folder);
      if (k.startsWith(`${FOLDER_KEY}/`)) return split(k.slice(FOLDER_KEY.length));
      return own.has(k) ? [mapKey(k)] : [];
    };
    const from = folder === scope ? "" : `from ${nested.get(folder)?.path ?? folder}`;
    for (const d of mem.decisions) {
      const detail = [d.detail, from].filter(Boolean).join(" — ");
      // On the table before anything one of its answers hangs — reading order.
      const next: RankingDecision = { ...d, key: mapKey(d.key), ...(detail ? { detail } : {}), values: [] };
      out.push(next);
      next.values = d.values.map((v) => ({
        ...v,
        ...(v.activates ? { activates: v.activates.flatMap(hang) } : {}),
        ...(v.when ? { when: v.when.map((r) => { const [dk, vk] = splitRef(r); return refOf(mapKey(dk), vk); }) } : {}),
      }));
    }
    const activated = new Set(mem.decisions.flatMap((d) => d.values.flatMap((v) => v.activates ?? [])));
    const roots = mem.decisions.filter((d) => !activated.has(d.key)).map((d) => mapKey(d.key));
    memMemo.set(folder, roots);
    return roots;
  };

  level(scope);
  return out;
}

export interface MemoryOverFolder<T> {
  scope: string;
  /** The memory with the decisions ACTUALLY on the table — folder splits and
   *  nested memories spliced in — and its locks pruned to answers on offer. */
  doc: MemoryDoc;
  /** The documents under the scope (before `include`). */
  units: { item: T; fields: Record<string, string> }[];
}

/**
 * A memory over its folder, ready for `memorySelection` (and `pulseGrid`,
 * `computeSnapshot`): the units in scope, the decisions on the table, the
 * locks that still name an offered answer — a renamed folder or a resolved
 * value cannot stay taken: nothing could match it and no pill could clear it.
 */
export function memoryOverFolder<T>(
  doc: MemoryDoc, docPath: string | null,
  items: { item: T; fields: Record<string, string> }[], nested: NestedMemories = new Map(),
  /** Folders a lazy read has LISTED but not read under — foci all the same. */
  knownFolders: Iterable<string> = [],
): MemoryOverFolder<T> {
  const scope = memoryScope(doc, docPath);
  const units = unitsInScope(scope, items);
  // The folder tree is what the ADMITTED units span — a folder the include
  // rules out entirely (a screenshots folder) is no focus.
  const admitted = units.filter(({ fields }) =>
    doc.include.every((c) => clauseHolds(c, fields as PolicyInput)) && !hiddenByOptions(doc.options, fields));
  const decisions = folderSpace(scope, doc, admitted, nested, knownFolders);
  const spaced = withElse(decisions);
  const locks = doc.locks.filter((ref) => {
    const [dk, vk] = splitRef(ref);
    return !!spaced.find((d) => d.key === dk)?.values.some((v) => v.key === vk);
  });
  return { scope, doc: { ...doc, decisions, locks }, units };
}

/* ── Authoring ───────────────────────────────────────────────────────────── */

/** A key from a label: `P & M interview` → `p-m-interview`, made unique. */
export function slugKey(label: string, taken: Iterable<string>): string {
  const t = new Set(taken);
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!base || base === "else") base = "focus"; // never the structural else's spelling
  if (!t.has(base)) return base;
  let i = 2;
  while (t.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

const DECISIONS_BANNER_RE = /^# The answers currently taken\./;

/**
 * The document with a NEW `decisions:` block, as TEXT. Only the block is
 * replaced — everything before it (title, description, include, options,
 * their comments) and everything after it (the locks banner, locks,
 * journal) returns byte-for-byte. Comments INSIDE the old block do not
 * survive; a hand-written lens keeps its prose by not being authored here.
 * Without a block, the new one goes before the locks banner (or at the end).
 */
export function writeDecisions(text: string, decisions: RankingDecision[]): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^decisions:\s*$/.test(l));
  const dumped = decisions.length
    ? yaml.dump({ decisions: decisions.map(decisionToRaw) }, { lineWidth: 120, noRefs: true, flowLevel: 3 }).replace(/\s*$/, "")
    : "decisions: []";
  if (start < 0) {
    const banner = lines.findIndex((l) => DECISIONS_BANNER_RE.test(l) || /^locks:/.test(l));
    const head = (banner < 0 ? lines : lines.slice(0, banner)).join("\n").replace(/\s*$/, "");
    const tail = banner < 0 ? "" : "\n\n" + lines.slice(banner).join("\n");
    return `${head}\n\n${dumped}${tail}`;
  }
  let end = start + 1;
  while (end < lines.length && !/^\S/.test(lines[end])) end++;
  // A trailing blank run belongs to the gap, not the block.
  while (end > start + 1 && !lines[end - 1].trim()) end--;
  return [...lines.slice(0, start), dumped, ...lines.slice(end)].join("\n");
}

function decisionToRaw(d: RankingDecision): Record<string, unknown> {
  return {
    key: d.key,
    label: d.label,
    ...(d.detail ? { detail: d.detail } : {}),
    values: d.values.map((v) => ({
      key: v.key,
      ...(v.label !== v.key || v.key === ELSE ? { label: v.label } : {}),
      ...(v.detail ? { detail: v.detail } : {}),
      ...(v.activates?.length ? { activates: v.activates } : {}),
      ...(v.when?.length ? { when: v.when } : {}),
    })),
    derive: d.derive.map((r) => ({ value: r.value, when: r.when.map((c) => ({ param: c.param, op: c.op, ...(c.value !== undefined ? { value: c.value } : {}) })) })),
  };
}

const withDecision = (decisions: RankingDecision[], key: string, f: (d: RankingDecision) => RankingDecision): RankingDecision[] =>
  decisions.map((d) => (d.key === key ? f(d) : d));

/** A new named answer (a focus) on one decision. */
export function addValue(decisions: RankingDecision[], decisionKey: string, label: string, key?: string): { decisions: RankingDecision[]; key: string } {
  const d = decisions.find((x) => x.key === decisionKey);
  if (!d) return { decisions, key: "" };
  const k = key ?? slugKey(label, d.values.map((v) => v.key));
  return { decisions: withDecision(decisions, decisionKey, (x) => ({ ...x, values: [...x.values, { key: k, label: label.trim() || k }] })), key: k };
}

export function renameValue(decisions: RankingDecision[], decisionKey: string, valueKey: string, label: string): RankingDecision[] {
  if (!label.trim()) return decisions;
  return withDecision(decisions, decisionKey, (d) => ({ ...d, values: d.values.map((v) => (v.key === valueKey ? { ...v, label: label.trim() } : v)) }));
}

/** Resolve a focus: the answer and the rules that fed it go; what they
 *  claimed parks under Everything else. Decisions it activated stay in the
 *  file (inactive) so they can be re-hung later. */
export function removeValue(decisions: RankingDecision[], decisionKey: string, valueKey: string): RankingDecision[] {
  return withDecision(decisions, decisionKey, (d) => ({
    ...d,
    values: d.values.filter((v) => v.key !== valueKey),
    derive: d.derive.filter((r) => r.value !== valueKey),
  }));
}

/** Is this rule an explicit membership of one path? */
const isPathRule = (r: RankDerive, path?: string): boolean =>
  r.when.length === 1 && r.when[0].param === "path" && r.when[0].op === "equals" && (path === undefined || r.when[0].value === path);

/** Put one unit into a focus by its path — an explicit rule ahead of every
 *  pattern rule, so it wins. `null` sends it back to Everything else (the
 *  explicit rule goes; a pattern rule may still claim it). */
export function assignUnit(decisions: RankingDecision[], decisionKey: string, valueKey: string | null, path: string): RankingDecision[] {
  return withDecision(decisions, decisionKey, (d) => {
    const derive = d.derive.filter((r) => !isPathRule(r, path));
    if (valueKey && d.values.some((v) => v.key === valueKey)) {
      derive.unshift({ value: valueKey, when: [{ param: "path", op: "equals", value: path }] });
    }
    return { ...d, derive };
  });
}

/** The explicit-membership answer a path has on a decision, if any. */
export function explicitAnswer(decisions: RankingDecision[], decisionKey: string, path: string): string | null {
  const d = decisions.find((x) => x.key === decisionKey);
  const r = d?.derive.find((x) => isPathRule(x, path));
  return r?.value ?? null;
}

/** A narrower question under one answer: a new decision activated by it. */
export function addSubFocus(decisions: RankingDecision[], decisionKey: string, valueKey: string, label = "Sub-focus"): { decisions: RankingDecision[]; key: string } {
  const parent = decisions.find((d) => d.key === decisionKey);
  const value = parent?.values.find((v) => v.key === valueKey);
  if (!parent || !value) return { decisions, key: "" };
  const key = slugKey(`${valueKey}-sub`, decisions.map((d) => d.key));
  const next = withDecision(decisions, decisionKey, (d) => ({
    ...d,
    values: d.values.map((v) => (v.key === valueKey ? { ...v, activates: [...(v.activates ?? []), key] } : v)),
  }));
  return { decisions: [...next, { key, label, values: [], derive: [] }], key };
}

/**
 * A project's lens, fresh: everything under the root (or the listed
 * items) admitted, one empty Focus decision so it all lands in Everything
 * else — foci get authored from there.
 */
export function newProjectMemory(opts: { title: string; root?: string | null; paths?: string[]; description?: string; date?: string }): string {
  const include: string[] = [];
  if (opts.root) {
    const root = opts.root.replace(/\/+$/, "");
    include.push(`  - {param: path, op: starts_with, value: ${JSON.stringify(root + "/")}}`);
  } else if (opts.paths?.length) {
    const alt = opts.paths.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    include.push(`  - {param: path, op: matches, value: ${JSON.stringify(`^(${alt})(/|$)`)}}`);
  }
  include.push(`  - {param: path, op: not_contains, value: ".node/"}`);
  const desc = opts.description
    ?? `Working memory over ${opts.root ?? "the project's items"} — flipped from the project on ${opts.date ?? new Date().toISOString().slice(0, 10)}. Everything starts in Everything else; add a focus and move items into it, then a sub-focus under a focus.`;
  return [
    `title: ${JSON.stringify(opts.title)}`,
    `description: ${JSON.stringify(desc)}`,
    `# The lens sits in /memory/ but looks at the whole store; include narrows it.`,
    `scope: /`,
    ``,
    `# What counts as a UNIT here: everything in the project, never the halves`,
    `# inside a structured node.`,
    `include:`,
    ...include,
    ``,
    `# Foci are authored in the memory view: "+ focus" adds an answer, moving a`,
    `# card adds an explicit rule for its path, "+ sub-focus" nests a question.`,
    `decisions:`,
    `  - key: focus`,
    `    label: Focus`,
    `    values: []`,
    `    derive: []`,
    ``,
  ].join("\n");
}

/** A ref in the memory's own words — `focus=partydj` → "Focus: Party DJ";
 *  the structural else spelled out. For trails and logs. */
export function splitLabel(doc: MemoryDoc, ref: string): string {
  const [dk, vk] = splitRef(ref);
  const d = doc.decisions.find((x) => x.key === dk);
  const v = vk === ELSE ? { label: ELSE_LABEL } : d?.values.find((x) => x.key === vk);
  return `${d?.label ?? dk}: ${v?.label ?? vk}`;
}

/** Re-export for hosts that only import the memory module. */
export type { SpaceDecision };
