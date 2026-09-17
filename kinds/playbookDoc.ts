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
 * What varies is whether they CAN arise, what you do about them (`rules`), and
 * whether they move you (`sets`). An event's `content` is what it shows when
 * taken — a markdown file, a guide, another playbook.
 *
 * TOPICS are the content that is true while you stand here. A topic exists
 * everywhere unless `when` says otherwise, and shows its `content`.
 *
 * CONTENT is chosen by answers, never read under them. A content entry is a
 * file, or a file that VARIES `by: [decision, ...]`: `file` is then a base and
 * the one shown is `<file>.variants/<decision=answer,...>.<same extension>`,
 * segments in `by` order — `steps.brief` by `push` shows
 * `steps.brief.variants/push=yes.brief`. Every combination is a whole document
 * of its own, authored up front as a closed set (`studio-check` lists the
 * missing ones) and handed nothing from here — a child playbook is
 * self-contained. Nothing is generated while walking.
 *
 * The derived thing is the state itself. Nothing in the file names one.
 *
 * VERSIONS — `version: N` at the top level says which playbook this is
 * (see docVersion.ts). Absent means 1. Every version stays readable as it was.
 * A file this engine cannot carry — a newer version, or a version-1 file
 * holding version-2 content — is never written back: `versionProblems` names
 * it, and a host holds the walk for the session instead of saving, because a
 * save re-emits what was read and would lose the rest.
 *
 * Version 1: a content entry is a file — `{file, label?, by?}` — and nothing else.
 *
 * Version 2: a content entry names ONE SOURCE; `key` and `label` are the same
 * either way:
 *
 *   content:
 *     - key: notes                 # optional: what the view collapses by and a
 *       label: Notes               #   ref could name; the file, then the label, stand in
 *       file: notes.md             # SOURCE = a document beside the book
 *       by: [entity]               #   varies: notes.md.variants/entity=<answer>.md
 *     - key: paperwork
 *       label: The paperwork
 *       kind: brief                # SOURCE = a document written here; `kind`
 *       doc:                       #   names the renderer (no extension to pick it),
 *         title: Paperwork         #   `doc` is the document as that kind's YAML
 *         sections: [...]          #   parses it — a string for `md`
 *     - key: banking
 *       kind: md                   # SOURCE = a closed set written here: one
 *       by: [entity]               #   document per answer combination, keyed
 *       docs:                      #   `decision=answer,...` in `by` order — the
 *         entity=company: |        #   same segments a variant file name carries
 *           Open a business account.
 *         entity=partnership: |
 *           A joint account will do.
 *
 * Written-here content makes a book ONE FILE: paste it, validate it, render it
 * with nothing else on disk, and the checker runs each document through its
 * own kind's engine. It has no path, so it carries no annotations and is never
 * pinned; `file` is still the form for anything shared between books. Refused:
 * two sources on one entry, `doc` or `docs` without `kind`, `by` on a `doc`,
 * `docs` without `by`, a `docs` key that is not a combination of the `by`
 * answers, a combination with no document, and an `md` document that is not a
 * string. In a version-1 file a written-here entry is dropped and named: add
 * `version: 2` — a version-1 book is a valid version-2 book unchanged.
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
 * One thing to show, from ONE source: a file beside the book (`file`, which
 * may vary by our answers, see `variationOf`), a document written here
 * (`kind` + `doc`), or a closed set written here, one document per answer
 * combination (`kind` + `by` + `docs`). Version 2 adds the written forms and
 * `key`; the label is the same either way.
 */
export interface PlaybookContent {
  /** A stable name for the entry: what the view collapses by, what a ref could name. Version 2; the file, then the label, stand in. */
  key?: string;
  label?: string;
  /** Source: a document beside the book, relative to the root book's folder. */
  file?: string;
  /** Our decisions this content varies by: `file` is a base, `docs` is keyed by them. Never with `doc`. */
  by?: string[];
  /** Written here — the kind that renders `doc` or `docs`, since there is no extension to pick it. */
  kind?: string;
  /** Written here — one document, as its kind's YAML parses it; a string for `md`. */
  doc?: unknown;
  /** Written here — one document per combination of the `by` answers, keyed `decision=answer,...` in `by` order. */
  docs?: Record<string, unknown>;
}

/** An entry written here rather than beside the book. */
export const isInline = (c: PlaybookContent): boolean => c.doc !== undefined || c.docs !== undefined;

/** What identifies an entry for the view: its key, else its path, else its label, else where it sits (`at`). */
export const contentKey = (c: PlaybookContent, at = "inline"): string =>
  c.key ?? c.file ?? (c.label ? slugKey(c.label) : at);

/** A path the registry can pick a renderer from — real, or synthetic for an inline entry. */
export const contentPath = (c: PlaybookContent): string => c.file ?? `inline.${c.kind ?? "md"}`;

/** The key a `by` combination is filed under: `decision=answer,...` in `by` order. */
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
  /** What the event NEEDS (chosen) or must CAPTURE as it arrives (imposed). */
  inputs?: PlaybookEventInput[];
  /** What the event shows when taken. */
  content?: PlaybookContent[];
}

/** One input an event needs or captures. All prose — documentation, not wiring. */
export interface PlaybookEventInput {
  input: string;
  from?: string;
  why?: string;
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

export interface PlaybookView {
  tab?: "walk" | "rules";
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
/** Is this raw content entry written here (a `doc` or `docs` source)? */
const rawInline = (o: Record<string, unknown>): boolean => present(o.doc) || present(o.docs);

/**
 * Version 1 reads `{file, label?, by?}` and drops anything else. Version 2 reads
 * every source. An entry with more than one is kept with all of them, so the
 * checker can say so.
 */
function parseContent(x: unknown, version: number): PlaybookContent[] {
  return arr(x).map((c) => {
    const o = rec(c);
    const file = str(o.file);
    const inline = version >= 2 && rawInline(o);
    if (!file && !inline) return null;
    return {
      ...(version >= 2 && str(o.key) ? { key: str(o.key)! } : {}),
      ...(str(o.label) ? { label: str(o.label)! } : {}),
      ...(file ? { file } : {}),
      ...(refs(o.by).length ? { by: refs(o.by) } : {}),
      ...(inline ? {
        ...(str(o.kind) ? { kind: str(o.kind)!.replace(/^\./, "").toLowerCase() } : {}),
        ...(present(o.doc) ? { doc: o.doc } : {}),
        ...(present(o.docs) ? { docs: rec(o.docs) } : {}),
      } : {}),
    };
  }).filter(Boolean) as PlaybookContent[];
}

/** Key and label first, then the source: what the spec shows, in that order. */
const dumpContent = (c: PlaybookContent[]) => c.map((x) => ({
  ...(x.key ? { key: x.key } : {}),
  ...(x.label ? { label: x.label } : {}),
  ...(x.file ? { file: x.file } : {}),
  ...(x.kind ? { kind: x.kind } : {}),
  ...(x.by?.length ? { by: x.by } : {}),
  ...(x.doc !== undefined ? { doc: x.doc } : {}),
  ...(x.docs ? { docs: x.docs } : {}),
}));

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
      const inputs = arr(o.inputs).map((x) => {
        const io = rec(x);
        const input = str(io.input) ?? str(io.label);
        return input ? {
          input,
          ...(str(io.from) ? { from: str(io.from)! } : {}),
          ...(str(io.why) ? { why: str(io.why)! } : {}),
        } : null;
      }).filter(Boolean) as PlaybookEventInput[];
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
        ...(inputs.length ? { inputs } : {}),
        ...(content.length ? { content } : {}),
      };
    }),

    topics: arr(raw.topics).map((t, i) => {
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

    rules: arr(raw.rules).map((r) => {
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

    view: {
      ...(["walk", "rules"].includes(str(rv.tab) ?? "") ? { tab: str(rv.tab) as "walk" | "rules" } : {}),
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
    ...(Object.keys(doc.view).length ? { view: doc.view } : {}),
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
      ...(e.inputs?.length ? { inputs: e.inputs } : {}),
      ...(e.content?.length ? { content: dumpContent(e.content) } : {}),
    })),
    ...(doc.topics.length ? {
      topics: doc.topics.map((t) => ({
        key: t.key, label: t.label,
        ...(t.detail ? { detail: t.detail } : {}),
        ...(t.when?.length ? { when: t.when } : {}),
        content: dumpContent(t.content),
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
  if (arr(raw.library).length) out.push("`library:` is gone — put each entry on its event as `content: [{file, by?, label?}]`");
  if (arr(raw.compare).length) out.push("`compare:` is gone — there is no A/B view any more");
  if (arr(raw.topics).some((t) => arr(rec(t).variants).length)) {
    out.push("topic `variants:` are gone — a topic has `content:` directly; a file that differs by answer is `{file, by: [decision]}` with one file per answer in `<file>.variants/`");
  }
  if (str(rec(raw.view).against)) out.push("`view.against` is gone with the A/B view");
  if (arr(raw.materials).length || arr(raw.scales).length || Object.keys(rec(rec(raw.view).thresholds)).length) {
    out.push("`materials:`, `scales:` and `view.thresholds` are gone — nothing damps a branch any more; a document that was a material belongs on an event or topic as `content: [{file}]`");
  }
  return out;
}

/**
 * What the file's version cannot carry: a version the engine does not know,
 * and — in a version-1 file — content written here, which version 1 drops.
 * Named so the author adds `version: 2` rather than losing the entry on save;
 * and while any of these holds, a host does not save at all (`PlaybookPreview`
 * keeps the walk for the session), because a save re-emits what was read.
 */
export function versionProblems(text: string): string[] {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { return []; }
  const { version, problem } = readDocVersion(raw, "playbook", PLAYBOOK_LATEST);
  const out: string[] = problem ? [problem] : [];
  if (version >= 2) return out;
  const dropped = (list: unknown, where: (o: Record<string, unknown>, i: number) => string) =>
    arr(list).flatMap((x, i) => {
      const o = rec(x);
      return arr(o.content).map(rec).filter(rawInline)
        .map((c) => `${where(o, i)}: ${str(c.label) ?? str(c.key) ?? "a content entry"} is written in the book — version 1 has no such thing; add \`version: 2\` at the top`);
    });
  out.push(
    ...dropped(raw.events, (o, i) => `event ${str(o.key) ?? str(o.label) ?? i + 1}`),
    ...dropped(raw.topics, (o, i) => `topic ${str(o.key) ?? str(o.label) ?? i + 1}`),
  );
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

/** The rule that applies to this event right now. First match wins. */
export const ruleFor = (doc: PlaybookDoc, event: string, locks: string[]): PlaybookRule | undefined =>
  doc.rules.find((r) => r.event === event && meets(locks, r.when));

/** Topics live here. */
export const topicsAt = (doc: PlaybookDoc, locks: string[]): PlaybookTopic[] =>
  doc.topics.filter((t) => meets(locks, t.when));

/** Events that can arise here — everything not ruled out as `n/a`. */
export function eventsAt(doc: PlaybookDoc, locks: string[]): PlaybookEvent[] {
  const live = doc.events.filter((e) => ruleFor(doc, e.key, locks)?.status !== "n/a");
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

/** How much of the reachable ground anybody has covered: events with at least one rule. */
export function coverage(doc: PlaybookDoc): { seen: number; total: number } {
  const withRule = new Set(doc.rules.map((r) => r.event));
  return { seen: [...withRule].filter((k) => doc.events.some((e) => e.key === k)).length,
           total: doc.events.length };
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

/** Every `by` entry in the book, with where it sits: a file that varies, or a written set. */
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
 * What a written entry cannot be: without a `kind` nothing can render it; with a
 * `file` too, nobody knows which to show; one `doc` has nothing to vary `by`;
 * `docs` without `by` has nothing to key by; a `docs` set is the closed set of
 * its `by` answers, no more and no less; an `md` document is its text.
 */
export function inlineProblems(doc: PlaybookDoc): string[] {
  return inlineEntries(doc).flatMap(({ where, entry }) => {
    const name = entry.label ?? entry.key ?? "inline content";
    const form = entry.docs ? "`docs`" : "`doc`";
    const out: string[] = [];
    if (!entry.kind) out.push(`${where}: ${name} has ${form} but no \`kind\` — say which kind renders it (brief, guide, md, …)`);
    if (entry.file) out.push(`${where}: ${name} has both \`file\` and ${form} — one source or the other`);
    if (entry.doc !== undefined && entry.docs) out.push(`${where}: ${name} has both \`doc\` and \`docs\` — one document, or one per answer combination`);
    if (entry.doc !== undefined && entry.by?.length) out.push(`${where}: ${name} is one document, so it cannot vary \`by\` — write one per answer combination under \`docs\`, or make it a file`);
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
