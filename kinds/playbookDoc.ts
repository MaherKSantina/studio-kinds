/**
 * `.playbook` — where we are, what can happen, and what is true while it does.
 *
 * THREE lists, and one derived thing.
 *
 * DECISIONS are the state space. A state is not an entry in a list, it is an
 * ASSIGNMENT — which answer is currently taken for each decision. Enumerating
 * states collapses a composition onto a line, and the line is always a lie:
 * "partnership" and "company, no users" differ on one decision, "company with
 * users" differs on two, and no ordering makes those the same distance apart.
 * Decisions nest, because an answer can bring a further question into
 * existence (`activates`) that has no meaning otherwise.
 *
 * EVENTS are global and unowned. They arrive regardless of where you stand.
 * What varies is whether they CAN arise and what you do about them — version
 * 1 says so in `rules`, version 2 on the event itself — and, at version 1,
 * whether they move you (`sets`). An event's `content` is what it shows when
 * taken — a markdown file, a guide, another playbook.
 *
 * TOPICS are the content that is true while you stand here. A topic exists
 * everywhere unless `when` says otherwise, and shows its `content`.
 *
 * CONTENT is chosen by answers, never read under them. A content entry is one
 * document, or a closed set that VARIES `by: [decision, ...]`: one whole
 * document per answer combination, authored up front (`studio-check` lists the
 * missing ones) and handed nothing from here — a child playbook is
 * self-contained. Nothing is generated while walking. Where the documents
 * live is what the version says, below.
 *
 * The derived thing is the state itself. Nothing in the file names one.
 *
 * VERSIONS — `version: N` at the top level says which playbook this is
 * (see docVersion.ts). Absent means 1. Every version stays readable as it was.
 * A file this engine cannot carry — a newer version, or a file holding what
 * its version has not got — is never written back: `versionProblems` names
 * it, and a host holds the walk for the session instead of saving, because a
 * save re-emits what was read and would lose the rest.
 *
 * Version 1 is the book above — decisions, events, topics, rules — and a
 * content entry is a FILE beside the book: `{file, label?, by?}`, one or more
 * per event or topic. `file` is a base when it varies `by`: the one shown is
 * `<file>.variants/<decision=answer,...>.<same extension>`, segments in `by`
 * order — `steps.brief` by `push` shows `steps.brief.variants/push=yes.brief`.
 * Every path is relative to the root book's folder.
 *
 * Version 2 is DECISIONS and EVENTS, each event showing ONE document IN THE
 * BOOK, and the walk over it is SESSION-ONLY. Decisions, their answers,
 * `activates` and `when` are as at version 1. An event's document shows when
 * the answers it follows are taken, and until then the pane shows the event's
 * `hint` and asks for them. ON THE EVENT: `when` — present only where it
 * holds; absent, the event is always on the table — `hint`, markdown shown
 * while an answer the document follows is still open (or as the whole detail,
 * when the event has no document). The book is stateless: it links answers
 * to what each event shows, and answering changes which events are on the
 * table and which document shows — on screen. Nothing is written back: every
 * decision starts unanswered each time the file opens, and a host never saves
 * a version-2 book from the walk. What is always true is the content of an
 * always-on event. An event's `content` is ONE entry, a mapping, not a list:
 * `kind` names the renderer (there is no extension to pick it); then either
 * `doc`, one document as that kind's YAML parses it (a string for `md`), or
 * `by` + `docs`, a closed set of them — one per combination of the `by`
 * answers, keyed `decision=answer,...` in `by` order — so the document shown
 * FOLLOWS the answer.
 *
 *   decisions:
 *     - key: push
 *       label: Push to origin?
 *       values: [{key: yes, label: Yes}, {key: no, label: No}]
 *   events:
 *     - key: always
 *       label: Always
 *       hint: Ask whether to push.      # shown while push is unanswered
 *       content:
 *         key: steps               # optional: what the view collapses by
 *         label: What to do        # optional: the panel header
 *         kind: brief              # the kind of every member
 *         by: [push]               # the set follows this answer
 *         docs:
 *           push=yes: {title: Push and release, sections: [...]}
 *           push=no: {title: Nothing leaves the machine, sections: [...]}
 *     - key: tag
 *       label: Cut a release
 *       when: [push=yes]           # on the table only under this answer
 *       content: {kind: md, doc: Tag the commit and push the tag.}
 *
 * A version-2 book is ONE FILE: paste it, validate it, render it with nothing
 * else on disk, and the checker runs each document through its own kind's
 * engine. Content has no path, so it carries no annotations and is never
 * pinned; a document shared between books is a version-1 `file`.
 * Refused: `doc` or `docs` without `kind`, both `doc` and `docs`, `by` on a
 * `doc`, `docs` without `by`, a `docs` key that is not a combination of the
 * `by` answers, a combination with no document, an `md` document that is not
 * a string. Each version drops what only the other has and `versionProblems`
 * names it — in a version-1 file a written entry, or `when` or `hint` on an
 * event (add `version: 2`, or move them to a rule); in a
 * version-2 file a `content` list or a `file` on an entry (write the document
 * into the book, or take `version: 2` off).
 */
import yaml from "js-yaml";
import { dumpDocVersion, readDocVersion } from "./docVersion";
import {
  decisionRows as sharedRows, impliedLocks as sharedImplied,
  type SpaceDecision, type SpaceValue,
} from "./decisionSpace";

/** The newest playbook this engine reads and writes. */
export const PLAYBOOK_LATEST = 2;

/** Decisions in reading order, collapsed ones omitted. See `decisionSpace`. */
export const decisionRows = (doc: PlaybookDoc, locks: string[]) => sharedRows(doc.decisions, locks, []);

export type Trigger = "imposed" | "chosen";

/** `ready` we know what to do · `gap` it can happen and we have no answer ·
 *  `n/a` it cannot arise here, said out loud · absent means nobody has looked. */
export type Readiness = "ready" | "gap" | "n/a";

/** A predicate over the assignment: every `decision=answer` ref must hold.
 *  Empty or absent matches everything. */
export type When = string[];

export const refOf = (decision: string, value: string) => `${decision}=${value}`;
export const splitRef = (ref: string): [string, string] => {
  const i = ref.indexOf("=");
  return i < 0 ? [ref, ""] : [ref.slice(0, i), ref.slice(i + 1)];
};

/** An answer and a decision — the shared shape, doc comments in `decisionSpace`. */
export type PlaybookValue = SpaceValue;
export type PlaybookDecision = SpaceDecision;

/**
 * How many times this can happen — the axis `trigger` is not.
 *
 * `once` is a MOVE: taking it consumes it, the frontier changes, and it belongs
 * in an order. `many` is an OPERATION: it never leaves the frontier, has no
 * place in a roadmap, and costs a rate times a per-run effort against capacity.
 */
export type Arity = "once" | "many";

/**
 * One thing to show. Version 1: a file beside the book (`file`, which may vary
 * by our answers, see `variationOf`). Version 2: one document written here
 * (`kind` + `doc`), or a closed set written here, one document per answer
 * combination (`kind` + `by` + `docs`) — never a file. `key` is version 2; the
 * label is the same either way.
 */
export interface PlaybookContent {
  /** A stable name for the entry: what the view collapses by, what a ref could name. Version 2; the file (version 1), then the label, stand in. */
  key?: string;
  label?: string;
  /** Version 1 only — a document beside the book, relative to the root book's folder. */
  file?: string;
  /** Our decisions this content varies by: a version-1 `file` is a base, a version-2 `docs` is keyed by them. Never with `doc`. */
  by?: string[];
  /** Version 2 only — the kind that renders `doc` or every member of `docs`, since there is no extension to pick it. */
  kind?: string;
  /** Version 2 only — one document, as its kind's YAML parses it; a string for `md`. */
  doc?: unknown;
  /** Version 2 only — one document per combination of the `by` answers, keyed `decision=answer,...` in `by` order. */
  docs?: Record<string, unknown>;
}

/** An entry written here rather than beside the book. */
export const isInline = (c: PlaybookContent): boolean => c.doc !== undefined || c.docs !== undefined;

/** What identifies an entry for the view: its key, else its path, else its label, else where it sits (`at`). */
export const contentKey = (c: PlaybookContent, at = "inline"): string =>
  c.key ?? c.file ?? (c.label ? slugKey(c.label) : at);

/** A path the registry can pick a renderer from — real, or synthetic for an inline entry. */
export const contentPath = (c: PlaybookContent): string => c.file ?? `inline.${c.kind ?? "md"}`;

/** The key a `by` combination is filed under: `decision=answer,...` in `by` order — a variant file's name, a `docs` member's key. */
export const variantKey = (segs: string[]): string => segs.join(",");

/** The document a written entry shows: `doc`, or the `docs` member for these segments (undefined when absent). */
export const writtenDoc = (c: PlaybookContent, segs: string[] = []): unknown =>
  c.docs ? c.docs[variantKey(segs)] : c.doc;

/** The documents a written entry carries, each with the key it answers to (`""` for a lone `doc`). */
export const writtenDocs = (c: PlaybookContent): { at: string; doc: unknown }[] =>
  c.docs ? Object.entries(c.docs).map(([at, doc]) => ({ at, doc }))
    : c.doc !== undefined ? [{ at: "", doc: c.doc }] : [];

/** The text a renderer takes for a written document: as YAML, or as is when it is a string. */
export const docText = (d: unknown): string =>
  typeof d === "string" ? d : yaml.dump(d ?? {}, { lineWidth: -1, noRefs: true });

/** The text a renderer takes: a written entry's document under these segments. */
export const contentText = (c: PlaybookContent, segs: string[] = []): string => docText(writtenDoc(c, segs));

export interface PlaybookEvent {
  key: string;
  label: string;
  /** `imposed` fires whether or not we are ready. `chosen` fires when we say
   *  so — the only lever we have on the order things arrive in. */
  trigger: Trigger;
  /** Defaults to `once`: the case that needs planning. */
  arity?: Arity;
  /** How often it fires, for an operation. `200/d`, `5/w`, `10/mo`. */
  rate?: string;
  detail?: string;
  /** A grouping label only. It carries no rules and gates nothing. */
  domain?: string;
  /** What the event shows when taken. */
  content?: PlaybookContent[];
  /** Version 2 only — on the table only where this holds. Absent means always. (Version 1 says so in a rule.) */
  when?: When;
  /** Version 2 only — markdown shown while an answer the document follows is still open (the ask), or as the whole detail when the event has no document. */
  hint?: string;
}

export interface PlaybookTopic {
  key: string;
  label: string;
  detail?: string;
  /** Present only where this holds. Absent means always live. */
  when?: When;
  content: PlaybookContent[];
}

/**
 * How one event plays out under some condition. First matching rule wins, so
 * the general case goes last.
 */
export interface PlaybookRule {
  event: string;
  when?: When;
  status?: Readiness;
  /** What we do. Where `sets` is present this is the PREREQUISITE for taking
   *  the event; where it is absent it is the RESPONSE to it happening. */
  process?: string;
  /** Answers this event changes. Presence makes the event a door. */
  sets?: string[];
  note?: string;
  /** How often this recurs, in months, once it applies. */
  every?: number;
  /** What the clock is anchored to — `<eventKey>` meaning that event completing. */
  from?: string;
  /** Days after the anchor before the first occurrence is due. */
  offset?: number;
}

/** What the host writes — version 1 only. A version-2 walk is session-only: the file has no `view`, and the host holds these in memory. */
export interface PlaybookView {
  /**
   * The doors walked through, in order, each with the assignment it produced.
   * Only EVENTS are recorded, not pill clicks. `from` is the assignment BEFORE
   * the event, `locks` the one after.
   */
  history?: { event: string; from?: string[]; locks: string[] }[];
  /** The assignment — which answer is taken for each decision. THE state. */
  locks?: string[];
  collapsed?: string[];
}

export interface PlaybookDoc {
  /** Which playbook this is read as — 1 when the file says nothing. See docVersion.ts. */
  version: number;
  title: string;
  description?: string;
  decisions: PlaybookDecision[];
  events: PlaybookEvent[];
  /** Empty at version 2. */
  topics: PlaybookTopic[];
  rules: PlaybookRule[];
  view: PlaybookView;
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined =>
  typeof x === "string" && x.trim() ? x.trim() : undefined;
const refs = (x: unknown): string[] => arr(x).map((r) => str(r)).filter(Boolean) as string[];

export const slugKey = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "x";

const present = (x: unknown): boolean => x !== undefined && x !== null;
/** Is this raw content entry written here (a `doc`, or a `docs` set)? */
const rawInline = (o: Record<string, unknown>): boolean => present(o.doc) || present(o.docs);
/** The one raw entry a version-2 `content` holds: the mapping, or the first of a list. */
const rawOne = (x: unknown): Record<string, unknown> => rec(Array.isArray(x) ? x[0] : x);

/**
 * Version 1 reads a list of `{file, label?, by?}` and drops anything else.
 * Version 2 reads ONE `{key?, label?, kind, by?, doc | docs}` — a mapping; a
 * list is read as its first entry — and drops it when it names a `file` or has
 * neither `doc` nor `docs`. `versionProblems` names what each version drops;
 * an entry with both `doc` and `docs` is kept with both, so the checker can
 * say so.
 */
function parseContent(x: unknown, version: number): PlaybookContent[] {
  if (version >= 2) {
    const o = rawOne(x);
    if (!rawInline(o) || str(o.file)) return [];
    return [{
      ...(str(o.key) ? { key: str(o.key)! } : {}),
      ...(str(o.label) ? { label: str(o.label)! } : {}),
      ...(str(o.kind) ? { kind: str(o.kind)!.replace(/^\./, "").toLowerCase() } : {}),
      ...(refs(o.by).length ? { by: refs(o.by) } : {}),
      ...(present(o.doc) ? { doc: o.doc } : {}),
      ...(present(o.docs) ? { docs: rec(o.docs) } : {}),
    }];
  }
  return arr(x).map((c) => {
    const o = rec(c);
    const file = str(o.file);
    if (!file) return null;
    return {
      ...(str(o.label) ? { label: str(o.label)! } : {}),
      file,
      ...(refs(o.by).length ? { by: refs(o.by) } : {}),
    };
  }).filter(Boolean) as PlaybookContent[];
}

/** Key and label first, then the source: what the spec shows, in that order. */
const dumpEntry = (x: PlaybookContent) => ({
  ...(x.key ? { key: x.key } : {}),
  ...(x.label ? { label: x.label } : {}),
  ...(x.file ? { file: x.file } : {}),
  ...(x.kind ? { kind: x.kind } : {}),
  ...(x.by?.length ? { by: x.by } : {}),
  ...(x.doc !== undefined ? { doc: x.doc } : {}),
  ...(x.docs ? { docs: x.docs } : {}),
});
/** A list at version 1; the one entry as a mapping at version 2. */
const dumpContent = (c: PlaybookContent[], version: number) =>
  version >= 2 ? dumpEntry(c[0]) : c.map(dumpEntry);

export function parsePlaybook(text: string): PlaybookDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* an unparseable file opens empty rather than blank */ }
  const rv = rec(raw.view);
  const { version } = readDocVersion(raw, "playbook", PLAYBOOK_LATEST);

  return {
    version,
    title: str(raw.title) ?? "Playbook",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),

    decisions: arr(raw.decisions).map((d, i) => {
      const o = rec(d);
      const label = str(o.label) ?? str(o.key) ?? `Decision ${i + 1}`;
      return {
        key: str(o.key) ?? slugKey(label),
        label,
        ...(str(o.detail) ? { detail: str(o.detail)! } : {}),
        values: arr(o.values).map((v, j) => {
          const w = rec(v);
          const vl = str(w.label) ?? str(w.key) ?? `Answer ${j + 1}`;
          return {
            key: str(w.key) ?? slugKey(vl),
            label: vl,
            ...(str(w.detail) ? { detail: str(w.detail)! } : {}),
            ...(refs(w.activates).length ? { activates: refs(w.activates) } : {}),
            ...(refs(w.when).length ? { when: refs(w.when) } : {}),
          };
        }),
      };
    }),

    events: arr(raw.events).map((e, i) => {
      const o = rec(e);
      const label = str(o.label) ?? str(o.key) ?? `Event ${i + 1}`;
      const content = parseContent(o.content, version);
      return {
        key: str(o.key) ?? slugKey(label),
        label,
        // Imposed is the safer default: an unclassified event is one to assume
        // can arrive without asking.
        trigger: (str(o.trigger) === "chosen" ? "chosen" : "imposed") as Trigger,
        ...(str(o.arity) === "many" ? { arity: "many" as Arity } : {}),
        ...(str(o.rate) ? { rate: str(o.rate)! } : {}),
        ...(str(o.detail) ? { detail: str(o.detail)! } : {}),
        ...(str(o.domain) ? { domain: str(o.domain)! } : {}),
        ...(content.length ? { content } : {}),
        // Version 2 keeps on the event what version 1 keeps in a rule. At version 1 these are dropped and named.
        ...(version >= 2 && refs(o.when).length ? { when: refs(o.when) } : {}),
        ...(version >= 2 && str(o.hint) ? { hint: str(o.hint)! } : {}),
      };
    }),

    // Topics are version 1; in a version-2 file `versionProblems` names them.
    topics: version >= 2 ? [] : arr(raw.topics).map((t, i) => {
      const o = rec(t);
      const label = str(o.label) ?? str(o.key) ?? `Topic ${i + 1}`;
      return {
        key: str(o.key) ?? slugKey(label),
        label,
        ...(str(o.detail) ? { detail: str(o.detail)! } : {}),
        ...(refs(o.when).length ? { when: refs(o.when) } : {}),
        content: parseContent(o.content, version),
      };
    }),

    // Rules are version 1; in a version-2 file `versionProblems` names them.
    rules: version >= 2 ? [] : arr(raw.rules).map((r) => {
      const o = rec(r);
      const st = str(o.status);
      return {
        event: str(o.event) ?? "",
        ...(refs(o.when).length ? { when: refs(o.when) } : {}),
        ...(st === "ready" || st === "gap" || st === "n/a" ? { status: st as Readiness } : {}),
        ...(str(o.process) ? { process: str(o.process)! } : {}),
        ...(refs(o.sets).length ? { sets: refs(o.sets) } : {}),
        ...(str(o.note) ? { note: str(o.note)! } : {}),
        ...(typeof o.every === "number" ? { every: o.every } : {}),
        ...(str(o.from) ? { from: str(o.from)! } : {}),
        ...(typeof o.offset === "number" ? { offset: o.offset } : {}),
      };
    }).filter((r) => r.event),

    // A version-2 walk is session-only: the file carries no view, and one found is dropped and named.
    view: version >= 2 ? {} : {
      ...(Array.isArray(rv.history) ? {
        history: (rv.history as unknown[]).map((h) => {
          const o = rec(h);
          return {
            event: str(o.event) ?? "",
            ...(refs(o.from).length ? { from: refs(o.from) } : {}),
            locks: refs(o.locks),
          };
        }).filter((h) => h.event),
      } : {}),
      ...(refs(rv.locks).length ? { locks: refs(rv.locks) } : {}),
      ...(refs(rv.collapsed).length ? { collapsed: refs(rv.collapsed) } : {}),
    },
  };
}

export function dumpPlaybook(doc: PlaybookDoc): string {
  return yaml.dump({
    ...dumpDocVersion(doc.version),
    title: doc.title,
    ...(doc.description ? { description: doc.description } : {}),
    ...(doc.version < 2 && Object.keys(doc.view).length ? { view: doc.view } : {}),
    decisions: doc.decisions.map((d) => ({
      key: d.key, label: d.label,
      ...(d.detail ? { detail: d.detail } : {}),
      values: d.values.map((v) => ({
        key: v.key, label: v.label,
        ...(v.detail ? { detail: v.detail } : {}),
        ...(v.activates?.length ? { activates: v.activates } : {}),
        ...(v.when?.length ? { when: v.when } : {}),
      })),
    })),
    events: doc.events.map((e) => ({
      key: e.key, label: e.label, trigger: e.trigger,
      ...(e.arity === "many" ? { arity: e.arity } : {}),
      ...(e.rate ? { rate: e.rate } : {}),
      ...(e.domain ? { domain: e.domain } : {}),
      ...(e.detail ? { detail: e.detail } : {}),
      ...(doc.version >= 2 && e.when?.length ? { when: e.when } : {}),
      ...(doc.version >= 2 && e.hint ? { hint: e.hint } : {}),
      ...(e.content?.length ? { content: dumpContent(e.content, doc.version) } : {}),
    })),
    ...(doc.topics.length ? {
      topics: doc.topics.map((t) => ({
        key: t.key, label: t.label,
        ...(t.detail ? { detail: t.detail } : {}),
        ...(t.when?.length ? { when: t.when } : {}),
        content: dumpContent(t.content, doc.version),
      })),
    } : {}),
    ...(doc.rules.length ? {
      rules: doc.rules.map((r) => ({
        event: r.event,
        ...(r.when?.length ? { when: r.when } : {}),
        ...(r.status ? { status: r.status } : {}),
        ...(r.process ? { process: r.process } : {}),
        ...(r.sets?.length ? { sets: r.sets } : {}),
        ...(r.note ? { note: r.note } : {}),
        ...(typeof r.every === "number" ? { every: r.every } : {}),
        ...(r.from ? { from: r.from } : {}),
        ...(typeof r.offset === "number" ? { offset: r.offset } : {}),
      })),
    } : {}),
  }, { lineWidth: -1, noRefs: true });
}

/**
 * Keys the format no longer has, and what replaced them. The parser ignores
 * them silently (a stale file still opens); the checker names them so the
 * author moves the content rather than losing it.
 */
export function legacyProblems(text: string): string[] {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { return []; }
  const out: string[] = [];
  if (arr(raw.library).length) out.push("`library:` is gone — put each entry on its event under `content:`");
  if (arr(raw.compare).length) out.push("`compare:` is gone — there is no A/B view any more");
  if (arr(raw.topics).some((t) => arr(rec(t).variants).length)) {
    out.push("topic `variants:` are gone — a topic has `content:` directly; content that differs by answer is a `by` entry with one whole document per answer");
  }
  if (arr(raw.events).some((e) => arr(rec(e).inputs).length)) out.push("event `inputs:` is gone — what an event needs or captures belongs in its content");
  if (str(rec(raw.view).against)) out.push("`view.against` is gone with the A/B view");
  if (str(rec(raw.view).tab)) out.push("`view.tab` is gone — the walk is the only view");
  if (arr(raw.materials).length || arr(raw.scales).length || Object.keys(rec(rec(raw.view).thresholds)).length) {
    out.push("`materials:`, `scales:` and `view.thresholds` are gone — nothing damps a branch any more; a document that was a material belongs on an event or topic under `content:`");
  }
  return out;
}

/**
 * What the file's version cannot carry: a version the engine does not know;
 * in a version-1 file, content written in the book, or `when` or `hint` on
 * an event; in a version-2 file, rules, topics, a view, a content list, a
 * file on an entry, a status or sets on an event. Named so the author moves
 * the content rather than losing it on save; and while any of these holds, a
 * version-1 host does not save at all (`PlaybookPreview` keeps the walk for
 * the session), because a save re-emits what was read. A version-2 host never
 * saves from the walk anyway.
 */
export function versionProblems(text: string): string[] {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { return []; }
  const { version, problem } = readDocVersion(raw, "playbook", PLAYBOOK_LATEST);
  const out: string[] = problem ? [problem] : [];
  const at = (what: string, o: Record<string, unknown>, i: number) => `${what} ${str(o.key) ?? str(o.label) ?? i + 1}`;

  if (version < 2) {
    const dropped = (list: unknown, what: string) =>
      arr(list).flatMap((x, i) => arr(rec(x).content).map(rec).filter(rawInline)
        .map((c) => `${at(what, rec(x), i)}: ${str(c.label) ?? str(c.key) ?? "a content entry"} is written in the book — version 1 has no such thing; add \`version: 2\` at the top`));
    out.push(...dropped(raw.events, "event"), ...dropped(raw.topics, "topic"));
    arr(raw.events).forEach((x, i) => {
      const o = rec(x);
      const onEvent = ["when", "hint"].filter((k) => present(o[k]));
      if (onEvent.length) out.push(`${at("event", o, i)}: ${onEvent.map((k) => `\`${k}\``).join(", ")} on the event — version 1 says this in a rule; move it to \`rules:\`, or add \`version: 2\` at the top`);
    });
    return out;
  }

  const off = "or take `version: 2` off";
  if (arr(raw.rules).length) out.push(`\`rules:\` — at version 2 an event carries its own \`when\` and \`hint\`, and its document shows once the answers it follows are taken. Move each rule's \`process\` onto its event as \`hint\`, a \`when\` where the event is on the table only under an answer, ${off}`);
  if (arr(raw.topics).length) out.push(`\`topics:\` — at version 2 what is always true is the content of an always-on event, ${off}`);
  if (Object.keys(rec(raw.view)).length) out.push("`view:` — a version-2 walk is session-only and writes nothing; every decision opens unanswered. Delete the view");
  arr(raw.events).forEach((x, i) => {
    const o = rec(x);
    const where = at("event", o, i);
    if (present(o.status)) out.push(`${where}: \`status\` — at version 2 the document shows when its answers are taken, and \`hint\` shows until then. Delete it`);
    if (present(o.sets)) out.push(`${where}: \`sets\` — at version 2 an answer is taken on the rail, never by an event. Delete it`);
    if (!present(o.content)) return;
    if (Array.isArray(o.content)) out.push(`${where}: \`content\` is one document at version 2 — a mapping, not a list; several sections belong in one brief`);
    const c = rawOne(o.content);
    const name = str(c.label) ?? str(c.key) ?? str(c.file) ?? "the content";
    if (str(c.file)) out.push(`${where}: ${name} is a file beside the book — at version 2 the document is in the book; write it as \`kind\` + \`doc\`, ${off}`);
    if (!rawInline(c) && !str(c.file) && Object.keys(c).length) out.push(`${where}: ${name} has neither \`doc\` nor \`docs\` — write the document under it`);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Derivation — everything below is computed, nothing is authored
// ---------------------------------------------------------------------------

/** Does the assignment satisfy this predicate? */
export const meets = (locks: string[], when?: When): boolean =>
  !when?.length || when.every((r) => locks.includes(r));

/** Every answer that would bring `decision` into existence. */
export function enablersOf(doc: PlaybookDoc, decision: string): string[] {
  const out: string[] = [];
  for (const d of doc.decisions) {
    for (const v of d.values) {
      if (v.activates?.includes(decision)) out.push(refOf(d.key, v.key));
    }
  }
  return out;
}

/** The answers actually on offer here. */
export const valuesOn = (d: PlaybookDecision, locks: string[]): PlaybookValue[] =>
  d.values.filter((v) => meets(locks, v.when));

/** Decisions currently on the table: no enablers at all, or any enabler taken. */
export function activeDecisions(doc: PlaybookDoc, locks: string[]): PlaybookDecision[] {
  return doc.decisions.filter((d) => {
    const en = enablersOf(doc, d.key);
    return !en.length || en.some((r) => locks.includes(r));
  });
}

/** Take the answer to every decision that only has one. See `decisionSpace`. */
export const impliedLocks = (doc: PlaybookDoc, locks: string[]): string[] =>
  sharedImplied(doc.decisions, locks, []);

/** Drop answers to questions nobody is asking any more, to a fixed point. */
export function pruneLocks(doc: PlaybookDoc, locks: string[]): string[] {
  let next = locks;
  for (let pass = 0; pass < doc.decisions.length + 1; pass++) {
    const before = next.length;
    const live = new Set(activeDecisions(doc, next).map((d) => d.key));
    next = next.filter((l) => {
      const [dk, vk] = splitRef(l);
      if (!live.has(dk)) return false;
      // An answer can stop being on offer without its question going away.
      const v = doc.decisions.find((d) => d.key === dk)?.values.find((x) => x.key === vk);
      return !v || meets(next, v.when);
    });
    if (next.length === before) break;
  }
  return next;
}

/** Take an answer, replacing any other answer to the same decision. */
export function take(doc: PlaybookDoc, locks: string[], ref: string): string[] {
  const [d] = splitRef(ref);
  return pruneLocks(doc, [...locks.filter((l) => splitRef(l)[0] !== d), ref]);
}

/** Take several answers, each replacing any existing answer to its decision. */
export function applyRefs(locks: string[], refs: string[]): string[] {
  let next = locks;
  for (const ref of refs) {
    const [d] = splitRef(ref);
    next = [...next.filter((l) => splitRef(l)[0] !== d), ref];
  }
  return next;
}

/**
 * Every rule in the book. Version 1 lists them. At version 2 an event is its
 * own rule — its `when`, and its `hint` as the rule's process — and an event
 * carrying neither has no rule to read; so the walk, the planner and the
 * element view read both versions the same way.
 */
export const rulesOf = (doc: PlaybookDoc): PlaybookRule[] =>
  doc.version >= 2
    ? doc.events.filter((e) => e.when?.length || e.hint).map((e) => ({
        event: e.key,
        ...(e.when?.length ? { when: e.when } : {}),
        ...(e.hint ? { process: e.hint } : {}),
      }))
    : doc.rules;

/** The rule that applies to this event right now. First match wins. */
export const ruleFor = (doc: PlaybookDoc, event: string, locks: string[]): PlaybookRule | undefined =>
  rulesOf(doc).find((r) => r.event === event && meets(locks, r.when));

/** Can this event arise here? Version 2: its `when` holds. Version 1: no rule says `n/a`. */
export const canArise = (doc: PlaybookDoc, e: PlaybookEvent, locks: string[]): boolean =>
  doc.version >= 2 ? meets(locks, e.when) : ruleFor(doc, e.key, locks)?.status !== "n/a";

/** Topics live here. */
export const topicsAt = (doc: PlaybookDoc, locks: string[]): PlaybookTopic[] =>
  doc.topics.filter((t) => meets(locks, t.when));

/** Events that can arise here — everything not ruled out (`n/a` at version 1; a `when` that does not hold at version 2). */
export function eventsAt(doc: PlaybookDoc, locks: string[]): PlaybookEvent[] {
  const live = doc.events.filter((e) => canArise(doc, e, locks));
  // DOMAIN first, then imposed before chosen inside it, so a heading appears
  // once per domain rather than once per run.
  const order = new Map<string, number>();
  for (const e of live) {
    const d = e.domain ?? "";
    if (!order.has(d)) order.set(d, order.size);
  }
  return live.sort((a, b) => {
    const da = order.get(a.domain ?? "")!;
    const db = order.get(b.domain ?? "")!;
    if (da !== db) return da - db;
    return a.trigger === b.trigger ? 0 : a.trigger === "imposed" ? -1 : 1;
  });
}

/**
 * What a content entry shows under this assignment.
 *
 * A plain entry is itself. A `by` entry resolves the answers to its decisions
 * into `segs`, in `by` order: a file's variation is
 * `<file>.variants/<decision=answer,...>.<ext>` with the base's own extension;
 * a written set's is the `docs` member keyed by the same segments. `missing`
 * lists the `by` decisions not yet answered — while it is non-empty there is
 * nothing to show. A written `doc` is itself, and `file` comes back empty.
 */
export const VARIANTS_SUFFIX = ".variants";
const extOf = (file: string): string => { const n = file.slice(file.lastIndexOf("/") + 1); const i = n.lastIndexOf("."); return i <= 0 ? "" : n.slice(i); };
const variantPath = (entry: PlaybookContent, key: string) => `${entry.file}${VARIANTS_SUFFIX}/${key}${extOf(entry.file ?? "")}`;
export function variationOf(entry: PlaybookContent, locks: string[]): { file: string; missing: string[]; segs: string[] } {
  if (!entry.by?.length || entry.doc !== undefined) return { file: entry.file ?? "", missing: [], segs: [] };
  const segs: string[] = [];
  const missing: string[] = [];
  for (const d of entry.by) {
    const lock = locks.find((l) => splitRef(l)[0] === d);
    if (lock) segs.push(lock); else missing.push(d);
  }
  return { file: entry.file ? variantPath(entry, variantKey(segs)) : "", missing, segs };
}

/** The closed set a `by` entry expects, as keys: one per combination of its decisions' answers, in `by` order. */
export function variationKeys(doc: PlaybookDoc, entry: PlaybookContent): string[] {
  if (!entry.by?.length) return [];
  let combos: string[][] = [[]];
  for (const d of entry.by) {
    const vals = doc.decisions.find((x) => x.key === d)?.values.map((v) => refOf(d, v.key)) ?? [];
    combos = combos.flatMap((c) => vals.map((v) => [...c, v]));
  }
  return combos.map(variantKey);
}

/** The files a file entry expects beside the book: itself, or one per combination when it varies. Written content expects none. */
export function variationsOf(doc: PlaybookDoc, entry: PlaybookContent): string[] {
  if (!entry.file) return [];
  if (!entry.by?.length) return [entry.file];
  return variationKeys(doc, entry).map((k) => variantPath(entry, k));
}

/** Every content entry in the book, with where it sits. */
export const contentEntries = (doc: PlaybookDoc): { where: string; entry: PlaybookContent }[] => [
  ...doc.events.flatMap((e) => (e.content ?? []).map((c) => ({ where: `event ${e.key}`, entry: c }))),
  ...doc.topics.flatMap((t) => t.content.map((c) => ({ where: `topic ${t.key}`, entry: c }))),
];

/** Every `by` entry in the book, with where it sits: a version-1 file that varies, or a version-2 written set. */
export const byEntries = (doc: PlaybookDoc) => contentEntries(doc).filter((x) => x.entry.by?.length);

/** `by` decisions that are not decisions of this book. */
export function variationProblems(doc: PlaybookDoc): string[] {
  return byEntries(doc).flatMap(({ where, entry }) =>
    (entry.by ?? []).filter((d) => !doc.decisions.some((x) => x.key === d))
      .map((d) => `${where}: \`by\` names ${d}, which is not a decision of this book`));
}

/** Every written entry in the book, with where it sits. */
export const inlineEntries = (doc: PlaybookDoc) => contentEntries(doc).filter((x) => isInline(x.entry));

/**
 * What a written entry cannot be: without a `kind` nothing can render it; one
 * `doc` has nothing to vary `by`; `docs` without `by` has nothing to key by; a
 * `docs` set is the closed set of its `by` answers, no more and no less; an
 * `md` document is its text. (A `file` beside a written entry never gets this
 * far: version 2 drops the entry, and `versionProblems` says so.)
 */
export function inlineProblems(doc: PlaybookDoc): string[] {
  return inlineEntries(doc).flatMap(({ where, entry }) => {
    const name = entry.label ?? entry.key ?? "inline content";
    const form = entry.docs ? "`docs`" : "`doc`";
    const out: string[] = [];
    if (!entry.kind) out.push(`${where}: ${name} has ${form} but no \`kind\` — say which kind renders it (brief, guide, md, …)`);
    if (entry.doc !== undefined && entry.docs) out.push(`${where}: ${name} has both \`doc\` and \`docs\` — one document, or one per answer combination`);
    if (entry.doc !== undefined && entry.by?.length) out.push(`${where}: ${name} is one document, so it cannot vary \`by\` — write one per answer combination under \`docs\``);
    if (entry.docs) {
      if (!entry.by?.length) out.push(`${where}: ${name} has \`docs\` but no \`by\` — say which decisions key the documents`);
      else if (entry.by.every((d) => doc.decisions.some((x) => x.key === d))) {
        const expected = variationKeys(doc, entry);
        const have = Object.keys(entry.docs);
        for (const k of expected) if (!have.includes(k)) out.push(`${where}: ${name}: docs has no \`${k}\` — every answer combination of \`by\` is a document of its own`);
        for (const k of have) if (!expected.includes(k)) out.push(`${where}: ${name}: docs has \`${k}\`, which is not a combination of ${entry.by.join(", ")} answers in \`by\` order`);
      }
    }
    if (entry.kind === "md") {
      for (const { at, doc: d } of writtenDocs(entry)) {
        if (typeof d !== "string") out.push(`${where}: ${name}${at ? ` [${at}]` : ""}: an \`md\` document is its text — write it as a block string`);
      }
    }
    return out;
  });
}
