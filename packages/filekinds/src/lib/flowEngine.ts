// Browser half of the `.flow` file kind.
//
// The MODEL (dimensions, screens, variants, edges, dispatch, the walk) lives in the worker at
// `worker/src/flow_ops.ts` and is imported here through the `@flow-ops` alias — one function, so a
// parameter set resolves to the same screen in the preview as it does for an agent writing the
// file. Only the things the browser alone needs live here: parsing the VIEWS half, and diffing two
// models for the Changes tab.
//
// This module deliberately does NOT import from analysisEngine.ts or walkthroughModel.ts. `.flow`
// borrows both their ideas and copies what it needs, because it is still moving and a shared
// helper would make every change here a change to two shipped file kinds.
import yaml from "js-yaml";
import {
  type Assignment, type DimValue, type FlowBody, type FlowDoc, type FlowEdge, type FlowPanel,
  type FlowScreen, type When,
  allDimensionNames, joinFlowFile, panelsOf, parseFlow, readFlow, resolveEdge, resolveVariant,
  shotsOf, splitFlowFile,
} from "./flowOps";

export type {
  Assignment, DimValue, FlowBody, FlowBranch, FlowDoc, FlowEdge, FlowPanel, FlowScreen, FlowSource,
  FlowVariant, PanelTarget, When,
} from "./flowOps";
export {
  addEdge, addScreen, addVariant, allDimensionNames, applyDerived, assignmentForVariant,
  availableEdges, baseAssignment, coverFlow, deleteEdge, deleteScreen, deleteVariant,
  derivedDependencies, dumpFlow, enterScreen, enumerateForScreen, isOffered, joinFlowFile,
  journeyDimensions, matchWhen, panelsOf, parseFlow, readPanels, reachFlow, readFlow, resolveEdge,
  resolvePanels, resolvePanelTarget, resolveShots, resolveVariant, screenAssignment, screenParams,
  screenRenderings, setScreenLocal, shotsOf, simulateFlow, splitFlowFile, traverse, updateEdge,
  updateScreen, updateVariant, validateFlow, writePanels, writeShots,
} from "./flowOps";

// Used by `revertChange` below, which needs to CALL these rather than just re-export them.
import {
  addEdge, addVariant, deleteEdge, deleteVariant, setDimension, setScreenLocal, updateEdge,
  updateScreen, updateVariant,
} from "./flowOps";

// ---------------------------------------------------------------------------
// Views (doc 2)
// ---------------------------------------------------------------------------

export interface FlowViewLayout {
  /** The parameter set this view explores under. Missing dimensions fall back to `defaults`. */
  params: Assignment;
  /**
   * Where to stand. There is no `navigate` and no `play` any more: navigation is authored on the
   * screen that owns the control, and walking happens from that same screen. Two tabs disappeared
   * because they were two views of one thing — "what leads out of here" is not a separate place.
   */
  tab: "screens" | "map" | "missing" | "changes" | "frames";
  /** Selected screen id, or null. */
  focus: string | null;
  /** Show each node's resolved variant label in the graph. */
  labelVariants: boolean;
}

export interface FlowView { id: string; name: string; layout: FlowViewLayout }
export interface FlowViews { active: string; views: FlowView[] }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isScalar = (v: unknown): v is DimValue =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean";

function coerceLayout(raw: unknown, body: FlowBody): FlowViewLayout {
  const o = isObj(raw) ? raw : {};
  const known = new Set(allDimensionNames(body));
  const params: Assignment = {};
  if (isObj(o.params)) {
    for (const [k, v] of Object.entries(o.params)) {
      // Drop a parameter whose dimension has since been renamed away, rather than carrying a key
      // nothing reads — a stale pin would silently narrow the graph with no visible cause.
      if (known.has(k) && isScalar(v)) params[k] = v;
    }
  }
  // Old tab names map forward rather than silently dropping a saved view onto a tab it did not
  // record: "graph" predates the screen page, and "navigate"/"play" are both now the screen page
  // itself — you author a control and press it in the same place.
  const wanted = o.tab === "graph" ? "map" : o.tab === "navigate" || o.tab === "play" ? "screens" : o.tab;
  const tab: FlowViewLayout["tab"] =
    wanted === "map" || wanted === "changes" || wanted === "missing" || wanted === "frames" ? wanted : "screens";
  return {
    params,
    tab,
    focus: typeof o.focus === "string" && o.focus ? o.focus : null,
    labelVariants: o.labelVariants === true,
  };
}

/** Always returns at least one view, so the preview never has to handle an empty list. */
export function parseViews(content: string, body: FlowBody): FlowViews {
  const { viewsText } = splitFlowFile(content);
  let raw: unknown = {};
  try { raw = viewsText.trim() ? yaml.load(viewsText) : {}; } catch { raw = {}; }
  const o = isObj(raw) ? raw : {};
  const list = Array.isArray(o.views) ? o.views : [];
  const views: FlowView[] = list.filter(isObj).map((v, i) => ({
    id: typeof v.id === "string" && v.id ? v.id : `v_${i + 1}`,
    name: typeof v.name === "string" && v.name ? v.name : `View ${i + 1}`,
    layout: coerceLayout(v.layout, body),
  }));
  if (!views.length) {
    views.push({ id: "v_1", name: "Default", layout: coerceLayout({}, body) });
  }
  const active = typeof o.active === "string" && views.some((v) => v.id === o.active) ? o.active : views[0].id;
  return { active, views };
}

export function dumpViews(views: FlowViews): string {
  return yaml.dump(
    {
      active: views.active,
      views: views.views.map((v) => ({
        id: v.id,
        name: v.name,
        layout: {
          ...(Object.keys(v.layout.params).length ? { params: v.layout.params } : {}),
          tab: v.layout.tab,
          ...(v.layout.focus ? { focus: v.layout.focus } : {}),
          ...(v.layout.labelVariants ? { labelVariants: true } : {}),
        },
      })),
    },
    { lineWidth: 120, noRefs: true },
  );
}

/** Rewrite only the views half, leaving the authored model text byte-identical. */
export function withViews(content: string, views: FlowViews): string {
  const { modelText } = splitFlowFile(content);
  return joinFlowFile(modelText, dumpViews(views));
}

/** Rewrite only the model half, leaving saved views untouched. */
export function withModel(content: string, modelText: string): string {
  const { viewsText } = splitFlowFile(content);
  return joinFlowFile(modelText, viewsText);
}

export function parseFlowFile(content: string): { body: FlowBody; doc: FlowDoc; error: string | null } {
  try {
    const doc = parseFlow(content);
    return { body: readFlow(doc), doc, error: null };
  } catch (e) {
    return {
      body: readFlow({}),
      doc: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export type DiffOp = "add" | "edit" | "delete";
export interface FlowDecoration { op: DiffOp }

export interface FlowChange {
  kind: "dimension" | "screen" | "variant" | "edge";
  op: DiffOp;
  /** Stable key for the review list. */
  id: string;
  label: string;
  /** Which fields actually differ, for an edit. */
  fields: string[];
  detail?: string;
  /**
   * Where this change LIVES, when it can be opened. A reader who sees "this screen grew a state"
   * immediately wants to look at it, and hunting for it by name in the screen list is the tax a
   * flat change list normally charges. Absent for a delete (it exists only in the base) and for a
   * dimension (it belongs to the model, not a screen).
   */
  screenId?: string;
  /** For a variant change, its index on that screen — enough to solve for the parameters. */
  variantIndex?: number;
  /**
   * NAME-based identity, carried so a change can be REVERTED without re-deriving what it points at.
   *
   * Serial ids differ between the two documents — that is the whole reason the diff matches by name
   * — so a reverter that worked from `id` would be resolving against the wrong side half the time.
   * These three are the same handles `diffFlow` matched on, kept for the inverse operation.
   */
  screenTitle?: string;
  variantLabel?: string;
  event?: string;
}

const sameJson = (a: unknown, b: unknown): boolean => {
  try { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); } catch { return false; }
};

const whenText = (w: When): string => {
  // A list of alternatives. Rendered with " or " between the groups, and each group parenthesised
  // when it has more than one clause, so "(a=1, b=2) or c=3" cannot be misread as a flat list.
  if (Array.isArray(w)) {
    if (!w.length) return "always";
    return w.map((g) => {
      const text = whenText(g);
      return isObj(g) && Object.keys(g).length > 1 ? `(${text})` : text;
    }).join(" or ");
  }
  if (w === "*" || !isObj(w) || !Object.keys(w).length) return "always";
  return Object.entries(w).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("|") : String(v)}`).join(", ");
};

/** "stays" is a real destination, so it has to read as one rather than as a blank. */
const targetText = (to: string): string => to || "stays on this screen";

const edgeTargetText = (e: { to: string; dispatch: Array<{ when: When; to: string }> }): string =>
  e.dispatch.length
    ? e.dispatch.map((b) => `${whenText(b.when)} → ${targetText(b.to)}`).join(" · ")
    : targetText(e.to);

/** The parameters an event assigns as it is traversed. */
const setsText = (s: Assignment): string => {
  const entries = Object.entries(s);
  return entries.length ? entries.map(([k, v]) => `${k} = ${String(v)}`).join(", ") : "nothing";
};

/**
 * WHAT changed about a control, in before → after form, one aspect per line.
 *
 * Naming the aspect ("availability", "sets") told a reader that something moved but not what it
 * moved to, so every such row ended in a hunt through both files. A control has three separable
 * facts — when it is on the screen, where it leads, and what it assigns — and a diff that cannot
 * show the first and third is only diffing a third of it.
 */
function edgeDetail(
  before: { edge: FlowEdge; name: (id: string) => string } | null,
  after: { edge: FlowEdge; name: (id: string) => string } | null,
): string {
  // Each side resolves screen ids through its OWN title map, so a screen whose id differs between
  // the two documents still reads as the same place rather than as a raw id.
  const target = ({ edge, name }: { edge: FlowEdge; name: (id: string) => string }) => edgeTargetText({
    to: name(edge.to),
    dispatch: edge.dispatch.map((b) => ({ when: b.when, to: name(b.to) })),
  });
  const lines: string[] = [];
  if (!before || !after) {
    const side = (before ?? after)!;
    const e = side.edge;
    if (e.when !== "*" && Object.keys(e.when).length) lines.push(`on screen when: ${whenText(e.when)}`);
    lines.push(`goes to: ${target(side)}`);
    if (Object.keys(e.sets).length) lines.push(`sets: ${setsText(e.sets)}`);
    return lines.join("\n");
  }
  if (!sameJson(before.edge.when, after.edge.when)) {
    lines.push(`on screen when: ${whenText(before.edge.when)}  →  ${whenText(after.edge.when)}`);
  }
  const from = target(before);
  const to = target(after);
  if (from !== to) lines.push(`goes to: ${from}  →  ${to}`);
  if (!sameJson(before.edge.sets, after.edge.sets)) {
    lines.push(`sets: ${setsText(before.edge.sets)}  →  ${setsText(after.edge.sets)}`);
  }
  return lines.join("\n");
}

/**
 * IDENTITY IS THE NAME, exactly as in `.walkthrough`: a screen is its TITLE, an edge is
 * (source-screen title, event), a variant is (screen title, label), a dimension is its name.
 * Serial ids drift between a diff's source and its independently-edited `new:` doc; names are the
 * human-meaningful handle and are enforced unique by the validator, so a rename reads as
 * delete+add — which the author resets and re-applies deliberately.
 *
 * The change list is TYPED, which is the reason `.flow` can express old-versus-new that a
 * `.walkthrough` diff could not. "A new dimension appeared", "this edge stopped being
 * unconditional and started dispatching", and "this screen grew a variant" are three different
 * facts about a feature; as raw states-and-transitions all three read as "things were added".
 */
export function diffFlow(base: FlowBody, current: FlowBody): {
  deco: Map<string, FlowDecoration>;
  screens: FlowScreen[];
  changes: FlowChange[];
} {
  const deco = new Map<string, FlowDecoration>();
  const changes: FlowChange[] = [];

  // ---- dimensions
  const baseDims = new Map(base.dimensionOrder.map((d) => [d, base.dimensions[d] ?? []]));
  const curDims = new Map(current.dimensionOrder.map((d) => [d, current.dimensions[d] ?? []]));
  for (const [name, values] of curDims) {
    const before = baseDims.get(name);
    if (!before) {
      deco.set(`dimension:${name}`, { op: "add" });
      changes.push({ kind: "dimension", op: "add", id: `dimension:${name}`, label: name, fields: [], detail: values.map(String).join(", ") });
    } else if (!sameJson(before, values)) {
      deco.set(`dimension:${name}`, { op: "edit" });
      const added = values.filter((v) => !before.includes(v));
      const removed = before.filter((v) => !values.includes(v));
      changes.push({
        kind: "dimension", op: "edit", id: `dimension:${name}`, label: name, fields: ["values"],
        detail: [added.length ? `+${added.map(String).join(" +")}` : "", removed.length ? `−${removed.map(String).join(" −")}` : ""].filter(Boolean).join("  "),
      });
    }
  }
  for (const [name, values] of baseDims) {
    if (curDims.has(name)) continue;
    deco.set(`dimension:${name}`, { op: "delete" });
    changes.push({ kind: "dimension", op: "delete", id: `dimension:${name}`, label: name, fields: [], detail: values.map(String).join(", ") });
  }

  // ---- screens (by title)
  const baseByTitle = new Map(base.screens.map((s) => [s.title, s]));
  const curByTitle = new Map(current.screens.map((s) => [s.title, s]));
  const curIdByTitle = new Map(current.screens.map((s) => [s.title, s.id]));
  const screens = [...current.screens];

  for (const s of current.screens) {
    const before = baseByTitle.get(s.title);
    if (!before) {
      deco.set(`screen:${s.id}`, { op: "add" });
      changes.push({ kind: "screen", op: "add", id: `screen:${s.id}`, label: s.title, fields: [], screenId: s.id, screenTitle: s.title });
      // Every variant of a brand-new screen is itself new, but listing them all would bury the
      // one fact that matters; the screen row carries the count instead.
      if (s.variants.length) changes[changes.length - 1].detail = `${s.variants.length} variant(s)`;
      continue;
    }
    const fields: string[] = [];
    if (!sameJson(panelsOf(before), panelsOf(s))) fields.push("content");
    if ((before.description ?? "") !== (s.description ?? "")) fields.push("description");
    // A screen gaining or losing one of its own variables is a change to what the screen CAN do,
    // and it is the change most likely to be missed by eye: the seller's Request Payment losing
    // `amountEntered` is the whole "the Fill step went away" story in one line.
    const localDetail: string[] = [];
    if (!sameJson(before.locals, s.locals)) {
      fields.push("state variables");
      for (const name of s.localOrder) {
        if (!before.locals[name]) localDetail.push(`+${name}`);
        else if (!sameJson(before.locals[name], s.locals[name])) localDetail.push(`~${name}`);
      }
      for (const name of before.localOrder) if (!s.locals[name]) localDetail.push(`−${name}`);
    }
    // Variants compared by label within the screen.
    const beforeVariants = new Map(before.variants.map((v) => [v.label, v]));
    const curVariants = new Map(s.variants.map((v) => [v.label, v]));
    for (const v of s.variants) {
      const bv = beforeVariants.get(v.label);
      const key = `variant:${s.id}:${v.label}`;
      // A state's DESCRIPTION is where the reason lives — the requirement id, the copy decision,
      // the "needs a capture". Showing only the `when` made the change list a list of conditions
      // you then had to open one by one to find out what to build, which is the opposite of what
      // a review surface is for.
      const withReason = (head: string) => [head, v.description].filter(Boolean).join("\n");
      if (!bv) {
        deco.set(key, { op: "add" });
        changes.push({ kind: "variant", op: "add", id: key, label: `${s.title} — ${v.label}`, fields: [], detail: withReason(`shown when: ${whenText(v.when)}`), screenId: s.id, variantIndex: s.variants.indexOf(v), screenTitle: s.title, variantLabel: v.label });
      } else {
        const vf: string[] = [];
        if (!sameJson(bv.when, v.when)) vf.push("when");
        if (!sameJson(panelsOf(bv), panelsOf(v))) vf.push("content");
        if ((bv.description ?? "") !== (v.description ?? "")) vf.push("description");
        if (vf.length) {
          deco.set(key, { op: "edit" });
          changes.push({ kind: "variant", op: "edit", id: key, label: `${s.title} — ${v.label}`, fields: vf, detail: withReason(vf.includes("when") ? `shown when: ${whenText(bv.when)}  →  ${whenText(v.when)}` : ""), screenId: s.id, variantIndex: s.variants.indexOf(v), screenTitle: s.title, variantLabel: v.label });
        }
      }
    }
    for (const bv of before.variants) {
      if (curVariants.has(bv.label)) continue;
      const key = `variant:${s.id}:${bv.label}`;
      deco.set(key, { op: "delete" });
      changes.push({ kind: "variant", op: "delete", id: key, label: `${s.title} — ${bv.label}`, fields: [], detail: whenText(bv.when), screenTitle: s.title, variantLabel: bv.label });
    }
    if (fields.length) {
      deco.set(`screen:${s.id}`, { op: "edit" });
      changes.push({
        kind: "screen", op: "edit", id: `screen:${s.id}`, label: s.title, fields, screenId: s.id, screenTitle: s.title,
        ...(localDetail.length ? { detail: localDetail.join("  ") } : {}),
      });
    }
  }
  for (const s of base.screens) {
    if (curByTitle.has(s.title)) continue;
    // A ghost node so the deleted screen still draws in the graph. Suffix the id only on collision.
    const id = current.screens.some((c) => c.id === s.id) ? `${s.id}__base` : s.id;
    screens.push({ ...s, id });
    deco.set(`screen:${id}`, { op: "delete" });
    changes.push({ kind: "screen", op: "delete", id: `screen:${id}`, label: s.title, fields: [], screenTitle: s.title });
  }

  // ---- edges (by source-screen title + event)
  const titleOf = (body: FlowBody) => new Map(body.screens.map((s) => [s.id, s.title]));
  const baseTitle = titleOf(base);
  const curTitle = titleOf(current);
  const keyOf = (e: { from: string; event: string }, m: Map<string, string>) => `${m.get(e.from) ?? e.from}\u0000${e.event}`;
  const baseEdges = new Map(base.edges.map((e) => [keyOf(e, baseTitle), e]));
  const curEdgeKeys = new Set(current.edges.map((e) => keyOf(e, curTitle)));

  const remapTarget = (id: string): string => {
    const t = baseTitle.get(id);
    return t !== undefined && curIdByTitle.has(t) ? curIdByTitle.get(t)! : id;
  };

  const curName = (id: string) => curTitle.get(id) ?? id;
  const baseName = (id: string) => baseTitle.get(id) ?? id;

  for (const e of current.edges) {
    const before = baseEdges.get(keyOf(e, curTitle));
    if (!before) {
      deco.set(`edge:${e.id}`, { op: "add" });
      changes.push({ kind: "edge", op: "add", id: `edge:${e.id}`, label: `${curName(e.from)} — ${e.event}`, fields: [], detail: edgeDetail(null, { edge: e, name: curName }), screenId: e.from, screenTitle: curName(e.from), event: e.event });
      continue;
    }
    const fields: string[] = [];
    const wasDispatch = before.dispatch.length > 0;
    const isDispatch = e.dispatch.length > 0;
    // THE change type this format exists to make visible: a control that used to go one place
    // now branches on data. In a `.walkthrough` this was an edge deletion plus N additions with
    // hand-written event labels, and nothing said they were the same button.
    if (wasDispatch !== isDispatch) fields.push(isDispatch ? "became conditional" : "became unconditional");
    else if (isDispatch && !sameJson(
      before.dispatch.map((b) => [b.when, baseTitle.get(b.to) ?? b.to]),
      e.dispatch.map((b) => [b.when, curTitle.get(b.to) ?? b.to]),
    )) fields.push("branches");
    else if (!isDispatch && (baseTitle.get(before.to) ?? before.to) !== (curTitle.get(e.to) ?? e.to)) fields.push("target");
    // WHEN the control is offered is a change of a different kind from where it goes: "this button
    // stopped appearing for pickup-only listings" and "this button now goes elsewhere" read the
    // same in a bare state-and-transition diff, and they are not the same news.
    if (!sameJson(before.when, e.when)) fields.push("availability");
    if (!sameJson(before.sets, e.sets)) fields.push("sets");
    if ((before.description ?? "") !== (e.description ?? "")) fields.push("description");
    if (fields.length) {
      deco.set(`edge:${e.id}`, { op: "edit" });
      changes.push({
        kind: "edge", op: "edit", id: `edge:${e.id}`,
        label: `${curName(e.from)} — ${e.event}`, fields, screenId: e.from,
        screenTitle: curName(e.from), event: e.event,
        detail: edgeDetail({ edge: before, name: baseName }, { edge: e, name: curName }),
      });
    }
  }
  for (const e of base.edges) {
    if (curEdgeKeys.has(keyOf(e, baseTitle))) continue;
    const id = current.edges.some((c) => c.id === e.id) ? `${e.id}__base` : e.id;
    deco.set(`edge:${id}`, { op: "delete" });
    changes.push({ kind: "edge", op: "delete", id: `edge:${id}`, label: `${baseName(e.from)} — ${e.event}`, fields: [], detail: edgeDetail({ edge: e, name: baseName }, null), screenTitle: baseName(e.from), event: e.event });
    void remapTarget;
  }

  const rank: Record<FlowChange["kind"], number> = { dimension: 0, screen: 1, variant: 2, edge: 3 };
  changes.sort((a, b) => rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label));
  return { deco, screens, changes };
}

// ---------------------------------------------------------------------------
// Reverting ONE change
// ---------------------------------------------------------------------------

/**
 * Can this row be put back the way the Original has it?
 *
 * Everything except adding or deleting a whole SCREEN. Reverting those means constructing or
 * destroying a screen together with its states, its controls and every branch elsewhere that
 * targets it — a different and far riskier operation than restoring one field, and one that
 * deserves its own affordance rather than hiding behind the same small button.
 */
export function canRevert(change: FlowChange): boolean {
  return !(change.kind === "screen" && change.op !== "edit");
}

/**
 * Put ONE change back to what the Original side has, leaving every other change alone.
 *
 * The pane's existing Reset replaces the whole New side, which is all-or-nothing: to recover a
 * screenshot you had to discard the proposal. This is the directed version — it resolves both
 * sides by NAME (the diff's own identity, since serial ids differ between the documents) and
 * touches exactly the one entity the row describes.
 */
export function revertChange(
  doc: FlowDoc, change: FlowChange, base: FlowBody, current: FlowBody,
): { ok: boolean; error?: string } {
  const title = change.screenTitle ?? "";
  const curScreen = current.screens.find((s) => s.title === title);
  const baseScreen = base.screens.find((s) => s.title === title);
  /** A base screen id, expressed as the CURRENT document's id for the same screen. */
  const toCurrentId = (baseId: string): string => {
    const t = base.screens.find((s) => s.id === baseId)?.title;
    return current.screens.find((s) => s.title === t)?.id ?? baseId;
  };

  if (change.kind === "dimension") {
    const name = change.label;
    const was = base.dimensions[name];
    return setDimension(doc, name, was ?? null);
  }

  if (change.kind === "screen") {
    if (change.op !== "edit") return { ok: false, error: "adding or removing a whole screen is not reverted here" };
    if (!curScreen || !baseScreen) return { ok: false, error: `screen not found: ${title}` };
    const r = updateScreen(doc, curScreen.id, {
      description: baseScreen.description ?? "",
      content: panelsOf(baseScreen),
    });
    if (!r.ok) return r;
    // `locals` has no mutator that takes a whole map, so restore it key by key.
    if (!sameJson(curScreen.locals, baseScreen.locals)) {
      for (const name of curScreen.localOrder) {
        if (!baseScreen.locals[name]) setScreenLocal(doc, curScreen.id, name, null);
      }
      for (const name of baseScreen.localOrder) {
        setScreenLocal(doc, curScreen.id, name, baseScreen.locals[name]);
      }
    }
    return { ok: true };
  }

  if (change.kind === "variant") {
    const label = change.variantLabel ?? "";
    if (!curScreen) return { ok: false, error: `screen not found: ${title}` };
    const curIndex = curScreen.variants.findIndex((v) => v.label === label);
    if (change.op === "add") {
      if (curIndex < 0) return { ok: false, error: `state not found: ${label}` };
      return { ok: deleteVariant(doc, curScreen.id, curIndex), error: "state not found" };
    }
    const bv = baseScreen?.variants.find((v) => v.label === label);
    if (!bv) return { ok: false, error: `the Original has no state "${label}"` };
    // Revert moves the OLD side's definition into the NEW one. The proposal is usually a superset
    // so this rarely bites — but "rarely" is not "never", and the failure would be the same silent
    // corruption in the other direction.
    const missing = missingVocabulary(current, bv.when);
    if (missing.length) return refuseMissing("New side", missing);
    if (change.op === "delete") {
      // Back into the position the Original had it, so precedence is restored too — a state's
      // order is part of its meaning here, since the first match wins.
      const at = baseScreen!.variants.findIndex((v) => v.label === label);
      return addVariant(doc, curScreen.id, {
        label: bv.label, when: bv.when, content: panelsOf(bv),
        description: bv.description ?? undefined, index: Math.min(at, curScreen.variants.length),
      });
    }
    if (curIndex < 0) return { ok: false, error: `state not found: ${label}` };
    return updateVariant(doc, curScreen.id, curIndex, {
      label: bv.label, when: bv.when, content: panelsOf(bv), description: bv.description ?? "",
    });
  }

  // ---- edge
  const event = change.event ?? "";
  const curEdge = curScreen?.edges.find((e) => e.event === event);
  if (change.op === "add") {
    if (!curEdge) return { ok: false, error: `control not found: ${event}` };
    return { ok: deleteEdge(doc, curEdge.id), error: `control not found: ${event}` };
  }
  const be = baseScreen?.edges.find((e) => e.event === event);
  if (!be) return { ok: false, error: `the Original has no control "${event}"` };
  const missingEdge = [
    ...missingVocabulary(current, be.when, ...be.dispatch.map((b) => b.when)),
    ...missingInSets(current, be.sets),
    ...be.dispatch.flatMap((b) => missingInSets(current, b.sets)),
  ];
  if (missingEdge.length) return refuseMissing("New side", [...new Set(missingEdge)]);
  const shape = {
    when: be.when,
    to: be.to ? toCurrentId(be.to) : "",
    dispatch: be.dispatch.map((b) => ({ when: b.when, to: b.to ? toCurrentId(b.to) : "", sets: b.sets })),
    sets: be.sets,
    description: be.description ?? "",
  };
  if (change.op === "delete") {
    if (!curScreen) return { ok: false, error: `screen not found: ${title}` };
    return addEdge(doc, { event: be.event, from: curScreen.id, ...shape });
  }
  if (!curEdge) return { ok: false, error: `control not found: ${event}` };
  return updateEdge(doc, curEdge.id, { event: be.event, ...shape });
}

/**
 * Can this row be PROMOTED — written into the Original so both sides agree?
 *
 * Only additions and edits. A `delete` row means the New side removed something; promoting it
 * would delete it from the record of today's behaviour too, which is a claim ("this never
 * existed") rather than a correction, and it is not what the button is for. Whole SCREENS are out
 * for the same reason revert leaves them out: it is a different, much larger operation.
 */
export function canPromote(change: FlowChange): boolean {
  if (change.op === "delete") return false;
  return change.kind === "variant" || change.kind === "edge" || change.kind === "dimension";
}

/**
 * Write ONE change into the ORIGINAL, so the diff stops reporting it.
 *
 * The case this exists for: a state or control was authored on the New side, but it turns out to
 * be behaviour the app ALREADY has. It belongs in the source `.flow` — the record of today — not
 * in the proposal. Without this you would have to re-author it by hand in the other file and then
 * delete it here, which is exactly the duplication a full-document diff already inflicts.
 *
 * Mutates the SOURCE doc. `current` is the New side, which is being copied FROM.
 */
const isCatchAll = (w: When): boolean =>
  w === "*" || (typeof w === "object" && !Object.keys(w).length);

/**
 * Where a promoted state must go: BEFORE the first catch-all, or at the end if there is none.
 *
 * A `.flow` picks the FIRST matching state, so a conditioned state placed after a catch-all can
 * never render. Copying the New side's index looked right and was not — the source is a shorter
 * list, so the index clamped to the end and landed the state behind the catch-all, dead on
 * arrival. Position here is not cosmetic; it is whether the state exists at all.
 */
function insertionPoint(screen: FlowScreen, when: When): number {
  if (isCatchAll(when)) return screen.variants.length;
  const firstCatchAll = screen.variants.findIndex((v) => isCatchAll(v.when));
  return firstCatchAll < 0 ? screen.variants.length : firstCatchAll;
}

/**
 * Vocabulary a condition reads that the TARGET side does not declare.
 *
 * This is the whole guard against the two documents bleeding into each other. Each side is a
 * standalone model with its OWN parameters — that is what lets the proposal invent
 * `listingShippingType` while the record of today never hears of it — and a cross-side copy is the
 * one operation that can violate it.
 *
 * An earlier version IMPORTED whatever was missing so the write would validate. It did validate,
 * and it was wrong: promoting one state dragged five feature dimensions into the file that is
 * supposed to describe the app as it ships today. Silent repair is worse than refusal, because the
 * damage is invisible until something downstream reads the file and finds a future in it.
 */
function missingVocabulary(target: FlowBody, ...conditions: When[]): string[] {
  const out = new Set<string>();
  const walk = (when: When): void => {
    if (when === "*" || typeof when !== "object") return;
    // A list of alternatives has to RECURSE. Reading its keys directly would collect the array
    // indices "0", "1" as if they were dimension names, and the guard would then refuse every
    // promote of an OR-conditioned control with a nonsense reason.
    if (Array.isArray(when)) { when.forEach(walk); return; }
    for (const name of Object.keys(when)) {
      if (!target.dimensions[name] && !target.derived.some((d) => d.name === name)) out.add(name);
    }
  };
  conditions.forEach(walk);
  return [...out];
}

/** The same question for an assignment: `sets` names dimensions too. */
const missingInSets = (target: FlowBody, sets: Assignment): string[] =>
  Object.keys(sets).filter((n) => !target.dimensions[n] && !target.derived.some((d) => d.name === n));

function refuseMissing(side: string, missing: string[]): { ok: false; error: string } {
  const list = missing.join(", ");
  return {
    ok: false,
    error: `conditioned on ${list}, which the ${side} does not declare. Promote ${missing.length > 1 ? "those parameters" : "that parameter"} first if they are genuinely existing behaviour — otherwise this is not existing behaviour, it is part of the proposal. Nothing was changed.`,
  };
}

export function promoteChange(
  sourceDoc: FlowDoc, change: FlowChange, source: FlowBody, current: FlowBody,
): { ok: boolean; error?: string } {
  const title = change.screenTitle ?? "";
  const curScreen = current.screens.find((s) => s.title === title);
  const srcScreen = source.screens.find((s) => s.title === title);
  /** A CURRENT screen id, expressed as the SOURCE document's id for the same screen. */
  const toSourceId = (curId: string): string => {
    const t = current.screens.find((s) => s.id === curId)?.title;
    return source.screens.find((s) => s.title === t)?.id ?? curId;
  };

  if (change.kind === "dimension") {
    const values = current.dimensions[change.label];
    if (!values) return { ok: false, error: `the New side has no dimension "${change.label}"` };
    return setDimension(sourceDoc, change.label, values);
  }

  if (!curScreen) return { ok: false, error: `screen not found: ${title}` };
  if (!srcScreen) {
    return { ok: false, error: `the Original has no screen "${title}" — promote the screen first` };
  }

  if (change.kind === "variant") {
    const label = change.variantLabel ?? "";
    const v = curScreen.variants.find((x) => x.label === label);
    if (!v) return { ok: false, error: `state not found: ${label}` };
    const missing = missingVocabulary(source, v.when);
    if (missing.length) return refuseMissing("Original", missing);
    const existing = srcScreen.variants.findIndex((x) => x.label === label);
    if (existing >= 0) {
      return updateVariant(sourceDoc, srcScreen.id, existing, {
        label: v.label, when: v.when, content: panelsOf(v), description: v.description ?? "",
      });
    }
    return addVariant(sourceDoc, srcScreen.id, {
      label: v.label, when: v.when, content: panelsOf(v),
      description: v.description ?? undefined, index: insertionPoint(srcScreen, v.when),
    });
  }

  const event = change.event ?? "";
  const e = curScreen.edges.find((x) => x.event === event);
  if (!e) return { ok: false, error: `control not found: ${event}` };
  // A control's availability, its branches AND what it assigns all name dimensions.
  const missingEdge = [
    ...missingVocabulary(source, e.when, ...e.dispatch.map((b) => b.when)),
    ...missingInSets(source, e.sets),
    ...e.dispatch.flatMap((b) => missingInSets(source, b.sets)),
  ];
  if (missingEdge.length) return refuseMissing("Original", [...new Set(missingEdge)]);
  const shape = {
    when: e.when,
    to: e.to ? toSourceId(e.to) : "",
    dispatch: e.dispatch.map((b) => ({ when: b.when, to: b.to ? toSourceId(b.to) : "", sets: b.sets })),
    sets: e.sets,
    description: e.description ?? "",
  };
  const existing = srcScreen.edges.find((x) => x.event === event);
  if (existing) return updateEdge(sourceDoc, existing.id, { event: e.event, ...shape });
  return addEdge(sourceDoc, { event: e.event, from: srcScreen.id, ...shape });
}

/** A one-line summary of what this parameter set renders, for the graph header. */
export function describeAssignment(a: Assignment, body: FlowBody): string {
  const names = allDimensionNames(body);
  const parts = names.filter((n) => a[n] !== undefined).map((n) => `${n}=${String(a[n])}`);
  return parts.length ? parts.join(" · ") : "no parameters";
}

/** Screens whose resolved variant differs between two assignments — what actually moved. */
export function variantDelta(body: FlowBody, a: Assignment, b: Assignment): Array<{ screen: FlowScreen; from: string | null; to: string | null }> {
  const out: Array<{ screen: FlowScreen; from: string | null; to: string | null }> = [];
  for (const s of body.screens) {
    const va = resolveVariant(s, a)?.label ?? null;
    const vb = resolveVariant(s, b)?.label ?? null;
    if (va !== vb) out.push({ screen: s, from: va, to: vb });
  }
  return out;
}

/** Edges whose resolved target differs between two assignments. */
export function edgeDelta(body: FlowBody, a: Assignment, b: Assignment): Array<{ id: string; event: string; from: string; to: string | null; was: string | null }> {
  const out: Array<{ id: string; event: string; from: string; to: string | null; was: string | null }> = [];
  for (const e of body.edges) {
    const ra = resolveEdge(e, a).to;
    const rb = resolveEdge(e, b).to;
    if (ra !== rb) out.push({ id: e.id, event: e.event, from: e.from, to: rb, was: ra });
  }
  return out;
}
