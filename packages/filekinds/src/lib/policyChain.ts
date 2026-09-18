/**
 * The POLICY CHAIN — triage factored into two documents instead of one switch.
 *
 *   tags policy (`role: tags`) — reads an item's params and TAGS it along a
 *     set of dimensions (crosscut `SpaceDecision`s — same shape, but these
 *     are facts about the content, not judgements). A dimension carries
 *     ordered `derive` rules (clauses over the params → a value) or, for a
 *     COMPUTED dimension, ordered `from` rules (refs over the answers of
 *     dimensions declared ABOVE it → a value) — how several raw answers
 *     collapse into one the order can name ("undesired employer" from two
 *     employers). Either way the first matching rule tags it and a rule
 *     with no conditions is the default. `hidden: true` marks a dimension
 *     as plumbing: it still tags, but Input panes and answer groups skip
 *     it — the computed dimension is the face, the raw one the mechanism.
 *
 *   order policy (`role: order`) — the judgement: a RANKING over tag
 *     combinations, and nothing else. An entry is just a `when` predicate
 *     (`dimension=value` refs, ANDed); its POSITION IS ITS RANK, top to
 *     bottom, first match wins; its label falls out of the values it names.
 *     There is no veto lane: a "bad" combination is simply an entry near the
 *     bottom, and the entries above it carry the refs that keep it out of
 *     them (exactly how a ranking group writes `employer=open`). An entry
 *     with no refs takes everything left — least priority IS excluded.
 *     Items nothing claims are UNRANKED — parked, never discarded. It names
 *     the tags policy it consumes via `tags:`, which is what makes the chain
 *     navigable: run → order → tags.
 *
 * A run whose `policy:` points at an order policy applies the whole chain
 * per row: map → params → tag values → rank. Everything here is pure — no IO.
 */
import { SpaceDecision, When, refOf, splitRef } from "crosscut";
import yaml from "js-yaml";
import {
  PolicyClause, PolicyInput, clauseHolds, clauseText, parsePolicy,
  parsePolicyFile, type PolicyFile,
} from "./policyDoc";
import { parseTablePolicy, type TablePolicyDoc } from "./tablePolicy";

/** One rule deriving a tag value. Empty `when` = always — the default. */
export interface DeriveRule {
  value: string;
  label?: string;
  when: PolicyClause[];
}

/** One rule computing a value from OTHER dimensions' answers (refs). */
export interface FromRule {
  value: string;
  label?: string;
  when: When;
}

/** A tag dimension plus how its value is worked out. */
export interface TagDimension extends SpaceDecision {
  /** From the item's params, clause by clause... */
  derive: DeriveRule[];
  /** ...or COMPUTED from the answers of dimensions declared above this one.
   *  When present, `derive` is ignored. */
  from: FromRule[];
  /** Plumbing: still tags, but Input panes and answer groups skip it. */
  hidden?: boolean;
}

export interface TagsPolicyDoc {
  role: "tags";
  title: string;
  description?: string;
  params: ReturnType<typeof parsePolicy>["params"];
  tags: TagDimension[];
}

/** One ranked (or excluding) combination. Position is priority; the label is
 *  optional because the combination describes itself. */
export interface OrderEntry {
  label?: string;
  detail?: string;
  /** Every `dimension=value` ref must hold (AND). Empty matches everything. */
  when: When;
}

export interface OrderPolicyDoc {
  role: "order";
  title: string;
  description?: string;
  /** Ref (relative to this file) of the tags policy it consumes. */
  tags: string;
  /** Best first. The first entry that holds claims the item. */
  order: OrderEntry[];
}

export type PolicyKindFile = PolicyFile | TagsPolicyDoc | OrderPolicyDoc | TablePolicyDoc;

/* ── parsing (lenient — a half-written file still renders) ─────────────── */

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
/** YAML turns bare yes/no into booleans; tag keys are strings. */
const key = (x: unknown): string =>
  typeof x === "boolean" ? (x ? "yes" : "no") : typeof x === "number" ? String(x) : (str(x) ?? "");

const OPS = new Set([
  "equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with",
  "matches", "gt", "gte", "lt", "lte", "is_empty", "not_empty", "is_true", "is_false",
]);

function parseClauses(x: unknown): PolicyClause[] {
  return arr(x).map(rec).flatMap((c) => {
    const param = str(c.param);
    const op = str(c.op) ?? "contains";
    if (!param || !OPS.has(op)) return [];
    return [{ param, op, value: c.value } as PolicyClause];
  });
}

/** `when` accepts "platform=ios" refs or a {platform: ios} mapping. A
 *  mapping value may be a LIST — {seniority: [senior, unstated]} — which
 *  becomes the value-OR ref "seniority=senior|unstated". */
function parseWhen(x: unknown): When {
  return Array.isArray(x)
    ? arr(x).map(key).filter(Boolean)
    : Object.entries(rec(x)).map(([d, v]) =>
        refOf(d, Array.isArray(v) ? arr(v).map(key).filter(Boolean).join("|") : key(v)));
}

export function parseTagsPolicy(text: string): TagsPolicyDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  // `tags:` is the block; `decisions:` accepted as an alias of the shape.
  const tags: TagDimension[] = arr(raw.tags ?? raw.decisions).map(rec).flatMap((d) => {
    const k = key(d.key);
    if (!k) return [];
    const values = arr(d.values).map((v) => {
      if (typeof v !== "object" || v === null || Array.isArray(v)) {
        const vk = key(v);
        return { key: vk, label: vk };
      }
      const r = rec(v);
      const vk = key(r.key);
      return { key: vk, label: str(r.label) ?? vk, ...(str(r.detail) ? { detail: str(r.detail)! } : {}) };
    }).filter((v) => v.key);
    const derive: DeriveRule[] = arr(d.derive).map(rec).flatMap((r) => {
      const value = key(r.value);
      return value
        ? [{ value, ...(str(r.label) ? { label: str(r.label)! } : {}), when: parseClauses(r.when) }]
        : [];
    });
    const from: FromRule[] = arr(d.from).map(rec).flatMap((r) => {
      const value = key(r.value);
      return value
        ? [{ value, ...(str(r.label) ? { label: str(r.label)! } : {}), when: parseWhen(r.when) }]
        : [];
    });
    return [{
      key: k, label: str(d.label) ?? k,
      ...(str(d.detail) ? { detail: str(d.detail)! } : {}),
      values, derive, from,
      ...(d.hidden === true ? { hidden: true } : {}),
    }];
  });
  return {
    role: "tags",
    title: str(raw.title) ?? "Tags",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    params: parsePolicy(text).params,
    tags,
  };
}

function parseEntries(x: unknown): OrderEntry[] {
  return arr(x).map(rec).map((e) => ({
    ...(str(e.label) ? { label: str(e.label)! } : {}),
    ...(str(e.detail) ? { detail: str(e.detail)! } : {}),
    when: parseWhen(e.when),
  }));
}

export function parseOrderPolicy(text: string): OrderPolicyDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  return {
    role: "order",
    title: str(raw.title) ?? "Order",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    tags: str(raw.tags) ?? "",
    order: parseEntries(raw.order),
  };
}

/** Which document a `.policy` file holds — the chain roles, then the flat
 *  policy/run split `parsePolicyFile` already makes. */
export function parsePolicyKindFile(text: string): PolicyKindFile {
  let role: string | undefined;
  try { role = str(rec(yaml.load(text)).role); } catch { /* fall through */ }
  if (role === "tags" || role === "decisions") return parseTagsPolicy(text);
  if (role === "order") return parseOrderPolicy(text);
  if (role === "table") return parseTablePolicy(text);
  return parsePolicyFile(text);
}

/* ── applying the chain ────────────────────────────────────────────────── */

export interface TagAnswer {
  dimension: string;
  /** The value's key, or "" when no derive rule held. */
  value: string;
  /** Index of the derive rule that fired; -1 = untagged. */
  ruleIndex: number;
}

/**
 * Every dimension tagged for one input — first rule wins per dimension.
 *
 * Dimensions run TOP TO BOTTOM, accumulating answers as they go: a computed
 * (`from`) dimension tests its refs against the answers taken so far, so it
 * can read any dimension declared above it and never one below — order in
 * the file is the dependency order, and cycles cannot be written.
 */
export function deriveTags(doc: TagsPolicyDoc, input: PolicyInput): TagAnswer[] {
  const answers: TagAnswer[] = [];
  const locks: string[] = [];
  for (const d of doc.tags) {
    let a: TagAnswer = { dimension: d.key, value: "", ruleIndex: -1 };
    if (d.from.length) {
      for (let i = 0; i < d.from.length; i++) {
        if (whenHolds(locks, d.from[i].when)) {
          a = { dimension: d.key, value: d.from[i].value, ruleIndex: i };
          break;
        }
      }
    } else {
      for (let i = 0; i < d.derive.length; i++) {
        if (d.derive[i].when.every((c) => clauseHolds(c, input))) {
          a = { dimension: d.key, value: d.derive[i].value, ruleIndex: i };
          break;
        }
      }
    }
    answers.push(a);
    if (a.value) locks.push(refOf(d.key, a.value));
  }
  return answers;
}

/** The dimensions Input panes and answer groups show — hidden ones are the
 *  mechanism behind a computed dimension, not part of the vocabulary. */
export const visibleTags = (doc: TagsPolicyDoc): TagDimension[] =>
  doc.tags.filter((d) => !d.hidden);

/** The refs an item's tags hold — untagged dimensions contribute nothing. */
export const locksOfTags = (answers: TagAnswer[]): string[] =>
  answers.filter((a) => a.value).map((a) => refOf(a.dimension, a.value));

export const UNRANKED = "unranked";

export interface OrderVerdict {
  /** Bucket key for grouping: "rank:<i>" | "unranked". */
  key: string;
  /** Index of the entry that claimed it; -1 = nothing did (unranked). */
  index: number;
}

/** A value-OR ref's single-value alternatives:
 *  "seniority=senior|unstated" → [seniority=senior, seniority=unstated]. */
export function refAlternatives(ref: string): string[] {
  const [d, v] = splitRef(ref);
  const vals = v.split("|").filter(Boolean);
  return (vals.length ? vals : [""]).map((x) => refOf(d, x));
}

/** Does this (possibly value-OR) ref accept the given taken answer? */
export const refCovers = (ref: string, lock: string): boolean =>
  refAlternatives(ref).includes(lock);

/** OR-aware `meets`: every ref must hold, and a ref holds when ANY of its
 *  alternatives is the taken answer. OR lives WITHIN a dimension only —
 *  across refs it is still AND. Empty matches everything. */
export const whenHolds = (locks: string[], when: When): boolean =>
  !when.length || when.every((r) => refAlternatives(r).some((a) => locks.includes(a)));

/**
 * THE RANKING: the order top to bottom — the first entry that holds claims
 * the item and its position is the rank. Nothing claimed = unranked, parked
 * (only possible when the order has no catch-all entry).
 */
export function applyOrder(doc: OrderPolicyDoc, locks: string[]): OrderVerdict {
  for (let i = 0; i < doc.order.length; i++) {
    if (whenHolds(locks, doc.order[i].when)) return { key: `rank:${i}`, index: i };
  }
  return { key: UNRANKED, index: -1 };
}

/** An entry with no refs takes everything left — the authored bottom. */
export const hasCatchAll = (doc: OrderPolicyDoc): boolean =>
  doc.order.some((e) => !e.when.length);

/** Bucket keys in DISPLAY order: the ranks best-first, then the unranked
 *  residue — which only exists when no entry is a catch-all. */
export function orderKeys(doc: OrderPolicyDoc): string[] {
  const ranks = doc.order.map((_, i) => `rank:${i}`);
  return hasCatchAll(doc) ? ranks : [...ranks, UNRANKED];
}

/* ── display helpers ───────────────────────────────────────────────────── */

/** "Platform = iOS" (or "Seniority = Senior or Unstated" for a value-OR
 *  ref) — one ref in the dimensions' own words. */
export function refText(tags: TagDimension[] | null, ref: string): string {
  const [dk, vk] = splitRef(ref);
  const d = tags?.find((x) => x.key === dk);
  const labels = vk.split("|").filter(Boolean)
    .map((v) => d?.values.find((x) => x.key === v)?.label ?? v);
  return `${d?.label ?? dk} = ${labels.join(" or ") || vk}`;
}

/** "Platform = iOS · Reachability = Sydney or remote" — the full predicate. */
export function whenRefsText(tags: TagDimension[] | null, when: When): string {
  if (!when.length) return "anything";
  return when.map((r) => refText(tags, r)).join(" · ");
}

/** A dimension's DEFAULT value — what its empty-when rule assigns. */
const defaultValueOf = (d: TagDimension): string | undefined =>
  (d.from.length ? d.from : d.derive).find((r) => !r.when.length)?.value;

/**
 * The COMPACT combination — value labels only ("iOS · Sydney or remote").
 * This is an entry's identity when it has no hand-written label.
 *
 * Refs naming a dimension's DEFAULT value are elided: they are guards, not
 * identity. An entry like {employer: other, pay: ok, platform: ios} is ABOUT
 * iOS — "anyone else" and "meets floor" only keep vetoed items out of it.
 * When every ref is a default, they all show (the guards ARE the identity).
 */
export function whenValuesText(tags: TagDimension[] | null, when: When): string {
  if (!when.length) return "anything";
  const parts = when.map((r) => {
    const [dk, vk] = splitRef(r);
    const d = tags?.find((x) => x.key === dk);
    const vals = vk.split("|").filter(Boolean);
    // A value-OR ref is identity as soon as ANY alternative is non-default.
    return {
      label: vals.map((v) => d?.values.find((x) => x.key === v)?.label ?? v).join(" or ") || vk,
      marked: !d || vals.some((v) => defaultValueOf(d) !== v),
    };
  });
  const marked = parts.filter((p) => p.marked);
  return (marked.length ? marked : parts).map((p) => p.label).join(" · ");
}

/** An entry's display label: the hand-written one, else its combination. */
export const entryLabel = (tags: TagDimension[] | null, e: OrderEntry): string =>
  e.label ?? whenValuesText(tags, e.when);

/** A bucket key's label for pills and group headings. */
export function orderKeyLabel(doc: OrderPolicyDoc, tags: TagDimension[] | null, k: string): string {
  if (k === UNRANKED) return "Unranked";
  const i = Number(k.slice("rank:".length));
  const e = doc.order[i];
  return e ? `${i + 1}. ${entryLabel(tags, e)}` : k;
}

/** A derive rule's clauses as one line, for rule listings. */
export const deriveRuleText = (r: DeriveRule): string =>
  r.when.length ? r.when.map(clauseText).join("  and  ") : "otherwise (default)";

/** A tag answer's label — "iOS", or "untagged" when nothing derived one. */
export function tagAnswerLabel(doc: TagsPolicyDoc, a: TagAnswer): string {
  if (!a.value) return "untagged";
  const d = doc.tags.find((x) => x.key === a.dimension);
  return d?.values.find((v) => v.key === a.value)?.label ?? a.value;
}

/** How an answer came to be — the firing rule's label, or, for a computed
 *  dimension's unlabelled rule, its refs in the dimensions' words. */
export function viaText(doc: TagsPolicyDoc, a: TagAnswer): string | undefined {
  if (a.ruleIndex < 0) return undefined;
  const d = doc.tags.find((x) => x.key === a.dimension);
  if (!d) return undefined;
  if (d.from.length) {
    const r = d.from[a.ruleIndex];
    return r?.label ?? (r?.when.length ? whenRefsText(doc.tags, r.when) : "default");
  }
  return d.derive[a.ruleIndex]?.label ?? `rule ${a.ruleIndex + 1}`;
}
