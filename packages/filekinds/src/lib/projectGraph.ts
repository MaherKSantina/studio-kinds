/**
 * THE PROJECT AS A LANED DAG — hierarchy by INDENTATION, production by
 * ARROWS, everything a separate TARGETABLE node.
 *
 * Every project item is a node; every exported child is its OWN node,
 * indented under its parent in the parent's lane — a workup's typed rows,
 * a stream's exported stages, a list's exported documents, a playbook's
 * decisions and events. No containment arrows: placement IS the hierarchy.
 *
 * Lanes are INVISIBLE columns ordered by production: an item sits one lane
 * right of what produced it (cycle-tolerant — a feedback edge just draws
 * leftward). Edges come from the project's authored `links:` plus edges
 * DERIVED live from the documents (stream inputs → stream, stream → its
 * point targets, source document → its workup), and each endpoint anchors
 * at the FINEST node that really is the source or target — the
 * incorporation decision, the exported output stage, the specific PDF —
 * falling back to the owning item when no finer node exists.
 *
 * `assembleLanedGraph` is pure (docs in, graph out) and golden-tested; the
 * async gathering of documents lives with the viewer.
 */
import { resolveRef } from "crosscut";
import { versionsFolderOf } from "./nodeHistory";
import { ProjectDoc, ProjectItem, itemLabel } from "./projectDoc";
import { PointsDoc, exportedStages } from "./pointsDoc";
import { WorkupDoc, exportedAnalyses, sourcePathOf } from "./workupDoc";
import { DocListDoc, exportedItems } from "./listDoc";
import { PlaybookDoc } from "./playbookDoc";
import { extensionOfPath } from "./filePreviews";

export interface LanedNode {
  /** Item file/node path, a child's real file path, or `<file>#<kind>:<key>`. */
  id: string;
  label: string;
  /** Small type chip: an extension, "node", "decision", "event", "stage". */
  chip: string;
  /** Children carry their owning ITEM's id; items carry none. */
  parent?: string;
  /** What clicking the node opens: a file whole, or one policy element. */
  open: { node: string; element?: string };
  /** "next" = the step an instance is WAITING ON — the same slot the kanban
   *  puts its card under. Drawn solid amber, never dashed. */
  accent?: "next";
}

export interface DagEdge {
  from: string;
  to: string;
  kind: string;
  label?: string;
  derived?: boolean;
}

export interface LanedGraph {
  /** Parents each immediately followed by their children — render order. */
  nodes: LanedNode[];
  edges: DagEdge[];
  /** Item id → lane (children share their parent's lane). */
  lanes: Record<string, number>;
}

export interface GraphDocs {
  points?: Map<string, PointsDoc>;
  workups?: Map<string, WorkupDoc>;
  lists?: Map<string, DocListDoc>;
  playbooks?: Map<string, PlaybookDoc>;
}

const flatItems = (items: ProjectItem[], out: ProjectItem[] = []): ProjectItem[] => {
  for (const it of items) {
    if (it.file || it.node) out.push(it);
    if (it.items) flatItems(it.items, out);
  }
  return out;
};

export function assembleLanedGraph(doc: ProjectDoc, docs: GraphDocs): LanedGraph {
  const items = flatItems(doc.items);
  const nodes: LanedNode[] = [];
  // anchor: any addressable ref → the finest node that IS it.
  const anchor = new Map<string, string>();
  // parentOfNode: node id → owning item id (items map to themselves).
  const parentItem = new Map<string, string>();

  for (const it of items) {
    const file = (it.file ?? it.node)!;
    // A playbook belongs to ANOTHER dag (its own creation story) — it never
    // renders here as an item. Only the decisions this dag drives
    // materialize, via element-targeted links below.
    if (it.file && docs.playbooks?.has(it.file)) continue;
    nodes.push({
      id: file, label: itemLabel(it),
      chip: it.file ? extensionOfPath(file) || "file" : "node",
      open: { node: file },
    });
    anchor.set(file, file);
    parentItem.set(file, file);

    const child = (id: string, label: string, chip: string, open: LanedNode["open"], refs: string[] = []) => {
      nodes.push({ id, label, chip, parent: file, open });
      parentItem.set(id, file);
      anchor.set(id, id);
      for (const r of refs) if (!anchor.has(r)) anchor.set(r, id);
    };

    const w = it.file ? docs.workups?.get(it.file) : undefined;
    if (w) {
      for (const { step, path } of exportedAnalyses(w, it.file!)) {
        child(path, step.label ?? step.key, extensionOfPath(path) || "file", { node: path });
      }
    }
    const p = it.file ? docs.points?.get(it.file) : undefined;
    if (p) {
      for (const st of exportedStages(p)) {
        // `stage:<key>` addressing — clicking the node opens the stream
        // FOCUSED on this stage, not from the top.
        child(`${it.file}#stage:${st.key}`, st.label, "stage", { node: it.file!, element: `stage:${st.key}` });
      }
    }
    const l = it.file ? docs.lists?.get(it.file) : undefined;
    if (l) {
      for (const { item } of exportedItems(l)) {
        const abs = resolveRef(it.file!, item.file!);
        child(abs, item.label ?? item.file!, extensionOfPath(abs) || "file", { node: abs });
      }
    }
  }

  /* ── a stream's INPUT stages fold into ONE combined node, a lane left ── */
  // The stage's refs show together as one box; any top-level ITEM the stage
  // covers is absorbed into it (its box disappears; anything else touching
  // it re-anchors here). Element refs stay put — their playbook keeps them.
  const absorbed = new Set<string>();
  const inputStageRefs = new Map<string, string[]>(); // stream file → ref keys consumed
  // A first-stage ref the graph ALREADY draws elsewhere (a workup's typed
  // rows, a list's exported document) stays where it lives — no duplicate
  // member box; the input edge anchors at the real node instead.
  const externalInputs: { from: string; to: string; label?: string }[] = [];
  for (const it of items) {
    const p = it.file ? docs.points?.get(it.file) : undefined;
    if (!p) continue;
    // Only the FIRST stage is the stream's input boundary; later staged refs
    // (a derivation document, an intermediate) are internal to the stream.
    for (const st of p.stages.slice(0, 1)) {
      if (!st.nodes?.length) continue;
      const id = `${it.file}#stage:${st.key}`;
      if (anchor.has(id)) continue; // an exported stage already owns this key
      const members = st.nodes.map((ref, idx) => ({ ref, idx, abs: resolveRef(it.file!, ref.node) }))
        .filter(({ ref, abs }) => {
          // A top-level item absorbs into the FIRST group that covers it;
          // to every later stream it is already drawn — stay put, edge in.
          const absorbable = items.some((x) => (x.file ?? x.node) === abs) && !absorbed.has(abs);
          if (ref.element || absorbable || !anchor.has(abs)) return true;
          externalInputs.push({ from: abs, to: it.file!, ...(ref.label ? { label: ref.label } : {}) });
          return false;
        });
      if (!members.length) continue; // every ref lives elsewhere — no group
      // The stage is a GROUP: its refs become child nodes, each clickable
      // like any other node — the element opens as an element, a covered
      // top-level item is absorbed and lives on as the group's child.
      nodes.push({ id, label: st.label, chip: "stage", open: { node: it.file!, element: `stage:${st.key}` } });
      anchor.set(id, id);
      parentItem.set(id, id);
      for (const { ref, idx, abs } of members) {
        const cid = `${id}/${idx}`;
        nodes.push({
          id: cid, label: ref.label ?? ref.node, parent: id,
          chip: ref.element ? ref.element.split(":")[0] : extensionOfPath(abs) || "file",
          open: { node: abs, ...(ref.element ? { element: ref.element } : {}) },
        });
        parentItem.set(cid, id);
        anchor.set(cid, cid);
        const asItem = items.find((x) => (x.file ?? x.node) === abs);
        if (asItem && !ref.element) {
          absorbed.add(abs);
          anchor.set(abs, cid);
        }
      }
      inputStageRefs.set(it.file!, (inputStageRefs.get(it.file!) ?? []).concat([st.key]));
    }
  }
  for (const a of absorbed) {
    const i = nodes.findIndex((n) => n.id === a && !n.parent);
    if (i >= 0) nodes.splice(i, 1);
    parentItem.set(a, anchor.get(a)!);
  }

  /* ── edges, anchored at the finest node either end really is ─────────── */
  const edges: DagEdge[] = [];
  const seen = new Set<string>();
  const authoredPairs = new Set<string>();
  const resolve = (ref: string): string | undefined => anchor.get(ref);
  const push = (fromRef: string, toRef: string, kind: string, label: string | undefined, derived: boolean) => {
    const from = resolve(fromRef), to = resolve(toRef);
    if (!from || !to) return;
    const fi = parentItem.get(from)!, ti = parentItem.get(to)!;
    if (fi === ti) return; // production never points inside one item
    const pair = `${fi}→${ti}`;
    const key = `${from}→${to}`;
    if (seen.has(key)) return;
    if (derived && authoredPairs.has(pair)) return; // the authored edge wins
    seen.add(key);
    if (!derived) authoredPairs.add(pair);
    edges.push({ from, to, kind, ...(label ? { label } : {}), derived });
  };

  // A link targeting a DECISION materializes it STANDALONE: the decision as
  // a group, its ANSWERS as child nodes, and the authored edge fanning into
  // each answer — this dag drives the decision, wherever the policy lives.
  // A link targeting ONE ANSWER (`decision:<key>=<value>`) is a SELECTION:
  // it edges into that answer alone.
  for (const l of doc.links ?? []) {
    const el = l.to.element;
    if (!el?.startsWith("decision:")) continue;
    const [dkey, vkey] = el.slice("decision:".length).split("=");
    const pb = docs.playbooks?.get(l.to.file);
    const d = pb?.decisions.find((x) => x.key === dkey);
    if (!d) continue;
    const delEl = `decision:${dkey}`;
    const gid = `${l.to.file}#${delEl}`;
    if (!nodes.some((n) => n.id === gid)) {
      nodes.push({ id: gid, label: d.label, chip: "decision", open: { node: l.to.file, element: delEl } });
      anchor.set(gid, gid);
      parentItem.set(gid, gid);
      for (const v of d.values) {
        const cid = `${gid}=${v.key}`;
        // The answer opens as ITSELF — `decision:<key>=<value>` addressing.
        nodes.push({ id: cid, label: v.label, chip: "answer", parent: gid, open: { node: l.to.file, element: `${delEl}=${v.key}` } });
        anchor.set(cid, cid);
        parentItem.set(cid, gid);
      }
    }
    const fromRef = l.from.stage ? `${l.from.file}#stage:${l.from.stage}` : l.from.file;
    const from = anchor.has(fromRef) ? fromRef : l.from.file;
    if (vkey) {
      push(from, `${gid}=${vkey}`, l.kind ?? "selects", l.label, false);
    } else {
      for (const v of d.values) {
        push(from, `${gid}=${v.key}`, l.kind ?? "produces", l.label, false);
      }
    }
  }

  for (const l of doc.links ?? []) {
    if (l.to.element?.startsWith("decision:")) continue; // materialized above
    const fromRef = l.from.stage ? `${l.from.file}#stage:${l.from.stage}` : l.from.file;
    const toRef = l.to.stage ? `${l.to.file}#stage:${l.to.stage}` : l.to.file;
    push(anchor.has(fromRef) ? fromRef : l.from.file,
         anchor.has(toRef) ? toRef : l.to.file,
         l.kind ?? "feeds", l.label, false);
  }
  for (const e of externalInputs) push(e.from, e.to, "input", e.label, true);
  for (const it of items) {
    if (!it.file) continue;
    const p = docs.points?.get(it.file);
    if (p) {
      // Input stages that folded into a combined node feed the stream as ONE
      // edge; anything else contributes per-ref edges as before.
      for (const key of inputStageRefs.get(it.file) ?? []) {
        push(`${it.file}#stage:${key}`, it.file, "input", undefined, true);
      }
      for (const st of p.stages) {
        if (inputStageRefs.get(it.file)?.includes(st.key)) continue;
        for (const ref of st.nodes ?? []) {
          const abs = resolveRef(it.file, ref.node);
          const fine = ref.element ? `${abs}#${ref.element}` : abs;
          push(anchor.has(fine) ? fine : abs, it.file, "input", ref.label, true);
        }
      }
      for (const pt of p.points) {
        if (pt.target) push(it.file, resolveRef(it.file, pt.target.file), "produces", undefined, true);
      }
    }
    const w = docs.workups?.get(it.file);
    if (w) {
      const src = sourcePathOf(w, it.file);
      if (src) push(src, it.file, "source", undefined, true);
    }
  }

  /* ── lanes: cycle-tolerant longest path over ITEM-level edges ────────── */
  const itemEdges = edges.map((e) => ({ from: parentItem.get(e.from)!, to: parentItem.get(e.to)! }));
  const acyclic: { from: string; to: string }[] = [];
  const reachable = (from: string, to: string): boolean => {
    const queue = [from];
    const visited = new Set([from]);
    while (queue.length) {
      const cur = queue.pop()!;
      if (cur === to) return true;
      for (const e of acyclic) if (e.from === cur && !visited.has(e.to)) { visited.add(e.to); queue.push(e.to); }
    }
    return false;
  };
  for (const e of itemEdges) if (!reachable(e.to, e.from)) acyclic.push(e);

  const lanes: Record<string, number> = {};
  for (const it of items) lanes[(it.file ?? it.node)!] = 0;
  for (let pass = 0; pass < items.length; pass++) {
    let moved = false;
    for (const e of acyclic) {
      const d = (lanes[e.from] ?? 0) + 1;
      if (d > (lanes[e.to] ?? 0)) { lanes[e.to] = d; moved = true; }
    }
    if (!moved) break;
  }

  return { nodes, edges, lanes };
}

/**
 * THE GRAPH, LOCALIZED TO ONE NODE — ONE production hop, with structure:
 *   "up"   — who produced it: the DIRECT producers.
 *   "down" — what it produces: the DIRECT consumers.
 * The answer reads as the producing stream WITH its stages, not the whole
 * upstream cascade: a node's own children seed the hop (edges anchor at the
 * finest node), then everything kept brings its STRUCTURE — parent chains,
 * children, and a kept item's stage groups with their members — but no
 * further edges are walked. To go further back, lens the producer itself.
 * Lanes compact to start at 0.
 */
/** Every node that REPRESENTS an id — by its PRECISE address: a plain file
 *  id claims nodes opening that file whole (an absorbed item living on as a
 *  group member), a `file#element` id claims nodes opening exactly that
 *  element (the decision's stand-ins). Each node is analyzed BY ITSELF:
 *  a file never inherits its elements' provenance, and a group member
 *  never inherits its group's edges — but a node does aggregate its own
 *  DESCENDANTS (production landing on an answer lands on its decision). */
export function seedsFor(graph: LanedGraph, id: string): Set<string> {
  const s = new Set<string>([id]);
  for (const n of graph.nodes) {
    const rep = n.open.element ? `${n.open.node}#${n.open.element}` : n.open.node;
    if (rep === id) s.add(n.id);
  }
  for (const n of graph.nodes) if (n.parent && s.has(n.parent)) s.add(n.id);
  return s;
}

export function localizeGraph(graph: LanedGraph, targetId: string, dir: "up" | "down" = "up"): LanedGraph {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const keep = seedsFor(graph, targetId);
  keep.delete(targetId); // the id itself may not be a node (an absorbed item)
  if (byId.has(targetId)) keep.add(targetId);
  if (!keep.size) return { nodes: [], edges: [], lanes: {} };
  // The single hop: direct producers (or consumers) of the node — collected
  // against the frozen seed set so one hop never chains into two.
  const hop = new Set<string>();
  for (const e of graph.edges) {
    if (dir === "up" && keep.has(e.to)) hop.add(e.from);
    if (dir === "down" && keep.has(e.from)) hop.add(e.to);
  }
  for (const id of hop) keep.add(id);
  // "Where X came from" never shows X ITSELF as an input: a group member
  // standing in for the target — or for a pinned VERSION of it — is the
  // lensed node wearing its input hat, not provenance. It stays out of the
  // structure walk (a version's OWN lens still shows such pins: there the
  // target is the version file, not the element).
  const hash = targetId.indexOf("#");
  const tFile = hash >= 0 ? targetId.slice(0, hash) : targetId;
  const tEl = hash >= 0 ? targetId.slice(hash + 1) : undefined;
  const tVdir = versionsFolderOf(tFile) + "/";
  const shadowsTarget = (n: LanedNode) =>
    !!n.parent && n.open.element === tEl &&
    (n.open.node === tFile || n.open.node.startsWith(tVdir));
  // Then STRUCTURE only — no more edge walking.
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of [...keep]) {
      let p = byId.get(id)?.parent;
      while (p && !keep.has(p)) { keep.add(p); grew = true; p = byId.get(p)?.parent; }
    }
    for (const n of graph.nodes) {
      if (n.parent && keep.has(n.parent) && !keep.has(n.id) && !shadowsTarget(n)) { keep.add(n.id); grew = true; }
      if (!n.parent && !keep.has(n.id)) {
        // a kept item's stage GROUPS (top-level `item#stage:` nodes) come along
        const h = n.id.indexOf("#stage:");
        if (h > 0 && keep.has(n.id.slice(0, h))) { keep.add(n.id); grew = true; }
      }
    }
  }
  const nodes = graph.nodes.filter((n) => keep.has(n.id));
  const edges = graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  // Lanes re-pack densely: pruning whole lanes must not leave empty spans.
  const topKeys = [...new Set(nodes.map((n) => n.parent ?? n.id))];
  const used = [...new Set(topKeys.map((k) => graph.lanes[k] ?? 0))].sort((a, b) => a - b);
  const packed = new Map(used.map((l, i) => [l, i]));
  const lanes: Record<string, number> = {};
  for (const k of topKeys) lanes[k] = packed.get(graph.lanes[k] ?? 0)!;
  return { nodes, edges, lanes };
}

/**
 * THE GRAPH, WITH ONE VERSION FILE JOINED — a snapshot's provenance is the
 * refs that PIN it: an output point targeting the version PRODUCED that
 * state; a stage ref reading the version FEEDS its stream. A snapshot is one
 * frozen state, so any ref into it — whole-file or element — references that
 * version. Returns null when nothing pins the path (no history to trace).
 * `dir` only places the version's lane so the asked-for direction reads
 * left → right.
 */
export function graphWithVersion(
  graph: LanedGraph, doc: ProjectDoc, docs: GraphDocs, versionPath: string, label: string,
  dir: "up" | "down" = "up",
): LanedGraph | null {
  if (graph.nodes.some((n) => n.id === versionPath)) return null; // already a real node
  const edges: DagEdge[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string, kind: string) => {
    const k = `${from}→${to}`;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ from, to, kind, derived: true });
  };
  const hasNode = (id: string) => graph.nodes.some((n) => n.id === id);
  for (const [file, p] of docs.points ?? []) {
    const outStage = p.stages.find((st) => st.kind === "points");
    const producerFrom = outStage && hasNode(`${file}#stage:${outStage.key}`)
      ? `${file}#stage:${outStage.key}` : file;
    for (const pt of p.points) {
      if (pt.target && resolveRef(file, pt.target.file) === versionPath) add(producerFrom, versionPath, "produces");
    }
    for (const st of p.stages) {
      for (const ref of st.nodes ?? []) {
        if (resolveRef(file, ref.node) === versionPath) add(versionPath, file, "input");
      }
    }
  }
  for (const l of doc.links ?? []) {
    if (l.to.file === versionPath) {
      const f = l.from.stage && hasNode(`${l.from.file}#stage:${l.from.stage}`)
        ? `${l.from.file}#stage:${l.from.stage}` : l.from.file;
      add(f, versionPath, l.kind ?? "feeds");
    }
    if (l.from.file === versionPath) add(versionPath, l.to.file, l.kind ?? "feeds");
  }
  if (!edges.length) return null;
  const laneOf = (id: string) => graph.lanes[graph.nodes.find((n) => n.id === id)?.parent ?? id] ?? 0;
  const producers = edges.filter((e) => e.to === versionPath).map((e) => laneOf(e.from));
  const readers = edges.filter((e) => e.from === versionPath).map((e) => laneOf(e.to));
  const lane = dir === "up"
    ? (producers.length ? Math.max(...producers) + 1 : Math.min(...readers) - 1)
    : (readers.length ? Math.min(...readers) - 1 : Math.max(...producers) + 1);
  return {
    nodes: [...graph.nodes, { id: versionPath, label, chip: "version", open: { node: versionPath } }],
    edges: [...graph.edges, ...edges],
    lanes: { ...graph.lanes, [versionPath]: lane },
  };
}

/** A stream UNROLLED into its pipeline: each STAGE is a column (in stage
 *  order, joined by "then" edges), and a stage's inputs sit under it as
 *  child boxes. The stream ITEM box itself is deliberately absent — the
 *  stages ARE the stream. What a version's "produces" lens shows: the
 *  consuming stream's stages, the lensed version sitting among the inputs
 *  it was read as. */
export function unrolledStreamsGraph(docs: GraphDocs, streams: string[]): LanedGraph {
  const nodes: LanedNode[] = [];
  const edges: DagEdge[] = [];
  const lanes: Record<string, number> = {};
  for (const file of streams) {
    const p = docs.points?.get(file);
    if (!p) continue;
    let prev: string | null = null;
    p.stages.forEach((st, i) => {
      const id = `${file}#stage:${st.key}`;
      nodes.push({ id, label: st.label, chip: "stage", open: { node: file, element: `stage:${st.key}` } });
      lanes[id] = i;
      // Children only when a stage has MULTIPLE inputs — a lone ref would
      // just duplicate the stage box (its focused dialog shows it inline).
      ((st.nodes?.length ?? 0) > 1 ? st.nodes! : []).forEach((ref, idx) => {
        const abs = resolveRef(file, ref.node);
        nodes.push({
          id: `${id}/${idx}`, label: ref.label ?? ref.node, parent: id,
          chip: ref.element ? ref.element.split(":")[0] : extensionOfPath(abs) || "file",
          open: { node: abs, ...(ref.element ? { element: ref.element } : {}) },
        });
      });
      if (prev) edges.push({ from: prev, to: id, kind: "then", derived: true });
      prev = id;
    });
  }
  return { nodes, edges, lanes };
}

/** The streams a version's lens resolves to, UNROLLED — "up": the streams
 *  that produced it (the pipeline ends at their Output stage, no version
 *  box); "down": the streams that read it (the version sits among their
 *  inputs). Null when nothing touching the version is a stream — the
 *  ordinary version graph takes over. */
export function versionStreamsUnrolled(
  docs: GraphDocs, vg: LanedGraph, versionPath: string, dir: "up" | "down",
): LanedGraph | null {
  const touching = dir === "down"
    ? vg.edges.filter((e) => e.from === versionPath).map((e) => e.to)
    : vg.edges.filter((e) => e.to === versionPath)
        .map((e) => (e.from.includes("#") ? e.from.slice(0, e.from.indexOf("#")) : e.from));
  const streams = [...new Set(touching)].filter((f) => docs.points?.has(f));
  return streams.length ? unrolledStreamsGraph(docs, streams) : null;
}

/** The stream pipelines an ordinary ROW's lens resolves to — the same
 *  treatment version lenses get: "down" unrolls the streams the node FEEDS,
 *  "up" the streams that PRODUCED it. The lensed node itself never renders —
 *  the dialog already names it; the pipeline is the answer. Null when the
 *  other side has no streams (the one-hop view takes over). */
export function rowStreamsUnrolled(
  graph: LanedGraph, docs: GraphDocs, id: string, dir: "up" | "down",
): LanedGraph | null {
  const seeds = seedsFor(graph, id);
  const ownFile = id.includes("#") ? id.slice(0, id.indexOf("#")) : id;
  const ends = graph.edges
    .filter((e) => (dir === "down" ? seeds.has(e.from) && !seeds.has(e.to) : seeds.has(e.to) && !seeds.has(e.from)))
    .map((e) => (dir === "down" ? e.to : e.from));
  const streams = [...new Set(ends.map((t) => (t.includes("#") ? t.slice(0, t.indexOf("#")) : t)))]
    .filter((f) => f !== ownFile && docs.points?.has(f));
  return streams.length ? unrolledStreamsGraph(docs, streams) : null;
}

/** The ORIGIN of a versioned node: the first recorded version something
 *  actually PRODUCED (pinned by an output point or a link). A row's "where
 *  did this come from" lens prefers this — the node's birth — over
 *  flattening every later producer into one view; null falls back to the
 *  ordinary lens. */
export function originVersionGraph(
  graph: LanedGraph, doc: ProjectDoc, docs: GraphDocs,
  versions: { path: string; name: string }[], rowLabel: string,
): { path: string; label: string; graph: LanedGraph } | null {
  const ordered = [...versions].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const v of ordered) {
    const label = `${rowLabel} · ${v.name.replace(/\.[^.]+$/, "")}`;
    const vg = graphWithVersion(graph, doc, docs, v.path, label, "up");
    if (vg && vg.edges.some((e) => e.to === v.path)) return { path: v.path, label, graph: vg };
  }
  return null;
}

/** Does anything produce this node? (Incoming production edges — the lens's
 *  "produced by a DAG process" marker.) */
export const isProduced = (graph: LanedGraph, id: string): boolean =>
  graph.edges.some((e) => e.to === id);

/** Which lens directions make sense for a node: edges touching anything
 *  that represents it (edges anchor at the finest node). */
export function nodeConnections(graph: LanedGraph, id: string): { up: boolean; down: boolean } {
  const seed = seedsFor(graph, id);
  return {
    up: graph.edges.some((e) => seed.has(e.to)),
    down: graph.edges.some((e) => seed.has(e.from)),
  };
}
