/**
 * THE FRAME CANVAS — a `.frame` body drawn with real CSS flexbox.
 *
 * The layout engine IS the browser: every node becomes one `<div>` whose
 * flex properties come from the model — hug (`flex: 0 0 auto`), fixed
 * (`flex: 0 0 Npx` on the parent's main axis), expand and spacer
 * (`flex: 1 1 0`) — and the cross axis stretches unless the parent says
 * otherwise. The frame itself is a column. Leaves render their props; an
 * `embed` renders ANOTHER `.frame` read-only through the host's configured
 * reader, and a `slot` inside that embedded frame shows the nodes the
 * embedding document injected (`props.slot`).
 *
 * Read-only by default; a host that passes `onSelect` gets click-to-select
 * with a highlight (the studio's canvas), nothing more — editing is the
 * studio's job over the pure doc engine.
 */
import React, { useEffect, useState } from "react";
import { resolveRef } from "crosscut";
import { rawFileUrlFor, readVirtualDirectoryFile } from "../../api";
import {
  type FrameBody, type FrameNode, type FrameView, axisOf, childrenOf, fillsMainAxis, frameOf, hiddenIn, injectionsOf, parseFrame, viewById,
} from "../../lib/frameDoc";

/** Unset main-axis size of a fixed node — the legacy default, so a
 *  half-authored node still shows up as a squat box instead of vanishing. */
const DEFAULT_FIXED = 44;
const MAX_EMBED_DEPTH = 4;

export interface FrameCanvasProps {
  body: FrameBody;
  /** null / undefined = Base. */
  view?: FrameView | null;
  /** Absolute store path of the document — the base embeds and images resolve against. */
  docPath?: string;
  scale?: number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Faint outlines on containers, so empty ones can be found. */
  outlines?: boolean;
  /** Ids to draw with a diff colour (studio compare); optional. */
  marks?: Record<string, "add" | "edit" | "remove">;
}

interface Ctx {
  body: FrameBody;
  docPath?: string;
  hidden: Set<string>;
  selectedId: string | null;
  onSelect?: (id: string | null) => void;
  outlines: boolean;
  depth: number;
  /** Ancestor embed paths — a frame that embeds itself stops here. */
  chain: string[];
  /** Injections from the embedding document, for the slots of an embedded frame. */
  injections?: Map<string, FrameNode[]>;
  /** The embedding context, so injected nodes render with THEIR document. */
  host?: Ctx;
  marks?: Record<string, "add" | "edit" | "remove">;
}

const px = (v: unknown): string | undefined =>
  typeof v === "number" ? `${v}px` : typeof v === "string" && v.trim() ? v : undefined;
const numOf = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const strOf = (v: unknown): string | undefined => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);

const ALIGN: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" };
const JUSTIFY: Record<string, string> = {
  start: "flex-start", center: "center", end: "flex-end", between: "space-between", around: "space-around", evenly: "space-evenly",
};

const MARK_COLOR: Record<string, string> = { add: "#16a34a", edit: "#d97706", remove: "#dc2626" };

/** The url an image reference resolves to: web urls stay, store paths go through the host's raw endpoint. */
function imageUrl(ctx: Ctx, ref: string | undefined): string | null {
  if (!ref) return null;
  if (/^(https?:|data:|blob:)/i.test(ref)) return ref;
  if (!ctx.docPath) return null;
  return rawFileUrlFor(ctx.docPath, ref);
}

/** Box-level styling every kind shares. */
function commonStyle(node: FrameNode, ctx: Ctx): React.CSSProperties {
  const p = node.props;
  const s: React.CSSProperties = { boxSizing: "border-box", position: "relative", minWidth: 0, minHeight: 0 };
  const bg = strOf(p.background);
  if (bg) s.background = bg;
  const bw = numOf(p.borderWidth, 0);
  if (bw > 0) { s.borderWidth = bw; s.borderStyle = "solid"; s.borderColor = strOf(p.borderColor) ?? "#d1d5db"; }
  const br = p.borderRadius;
  if (br !== undefined) s.borderRadius = px(br);
  if (typeof p.opacity === "number") s.opacity = p.opacity;
  const mark = ctx.marks?.[node.id];
  if (mark) { s.outline = `2px solid ${MARK_COLOR[mark]}`; s.outlineOffset = -1; }
  if (ctx.selectedId === node.id) { s.outline = "2px solid #2563eb"; s.outlineOffset = -1; s.zIndex = 1; }
  else if (ctx.outlines && (node.kind === "box" || node.kind === "vstack" || node.kind === "hstack" || node.kind === "grid" || node.kind === "scroll")) {
    s.outline = "1px dashed rgba(15, 23, 42, 0.14)";
    s.outlineOffset = -1;
  }
  return s;
}

/** How the node sits in its parent — the sizing model. */
function sizingStyle(node: FrameNode, parent: FrameNode | null): React.CSSProperties {
  const s: React.CSSProperties = {};
  if (parent?.kind === "grid") {
    const span = numOf(node.props.span, 0);
    if (span > 1) s.gridColumn = `span ${span}`;
    if (node.width !== undefined) s.width = node.width;
    if (node.height !== undefined) s.height = node.height;
    return s;
  }
  const axis = axisOf(parent);
  const main = axis === "column" ? node.height : node.width;
  const fills = fillsMainAxis(node, parent);
  if (fills) {
    s.flex = "1 1 0px";
  } else if (node.kind === "divider") {
    s.flex = `0 0 ${main ?? 1}px`;
    s.alignSelf = "stretch";
  } else if (node.fixed) {
    s.flex = `0 0 ${main ?? DEFAULT_FIXED}px`;
  } else {
    s.flex = "0 0 auto";
  }
  // Explicit sizes apply as written — the cross axis stops stretching where
  // a size is given, and a hug node with a size hugs that size.
  if (node.width !== undefined && !(axis === "row" && fills)) s.width = node.width;
  if (node.height !== undefined && !(axis === "column" && fills)) s.height = node.height;
  return s;
}

/** A container's arrangement of its children. */
function containerStyle(node: FrameNode): React.CSSProperties {
  const p = node.props;
  const s: React.CSSProperties = {};
  if (node.kind === "grid") {
    s.display = "grid";
    s.gridTemplateColumns = `repeat(${Math.max(1, numOf(p.columns, 2))}, minmax(0, 1fr))`;
    s.alignItems = ALIGN[strOf(p.align) ?? ""] ?? "stretch";
  } else {
    s.display = "flex";
    s.flexDirection = axisOf(node);
    s.alignItems = ALIGN[strOf(p.align) ?? ""] ?? "stretch";
    const j = JUSTIFY[strOf(p.justify) ?? ""];
    if (j) s.justifyContent = j;
    if (p.wrap === true) s.flexWrap = "wrap";
  }
  if (p.gap !== undefined) s.gap = px(p.gap);
  if (p.padding !== undefined) s.padding = px(p.padding);
  if (node.kind === "scroll") {
    // The wheel scrolls it, like the screen it stands for; the bar stays
    // thin so the mockup keeps its shape.
    s.overflow = "auto";
    s.scrollbarWidth = "thin";
    // A scroll viewport's children keep their natural size along the axis.
    if (axisOf(node) === "column") s.alignItems = ALIGN[strOf(p.align) ?? ""] ?? "stretch";
  } else {
    s.overflow = "hidden";
  }
  return s;
}

function Leaf({ node, ctx }: { node: FrameNode; ctx: Ctx }) {
  const p = node.props;
  switch (node.kind) {
    case "text":
      return (
        <div style={{
          fontSize: numOf(p.fontSize, 14), color: strOf(p.color) ?? "#111827",
          textAlign: (strOf(p.textAlign) as React.CSSProperties["textAlign"]) ?? "left",
          fontWeight: (p.fontWeight as React.CSSProperties["fontWeight"]) ?? 400,
          fontStyle: strOf(p.fontStyle) ?? "normal",
          lineHeight: 1.3, whiteSpace: "pre-wrap", overflowWrap: "anywhere", width: "100%",
          padding: p.padding !== undefined ? px(p.padding) : undefined,
        }}>
          {strOf(p.text) ?? node.name}
        </div>
      );
    case "button":
      return (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%",
          minHeight: 36, padding: p.padding !== undefined ? px(p.padding) : "10px 16px",
          background: strOf(p.background) ?? (strOf(p.color) && !strOf(p.background) ? "transparent" : "#111827"),
          color: strOf(p.color) ?? "#ffffff", fontSize: numOf(p.fontSize, 15), fontWeight: 600,
          borderRadius: p.borderRadius !== undefined ? px(p.borderRadius) : 10,
          border: numOf(p.borderWidth, 0) > 0 ? `${numOf(p.borderWidth, 1)}px solid ${strOf(p.borderColor) ?? "#111827"}` : undefined,
          boxSizing: "border-box",
        }}>
          {strOf(p.text) ?? node.name}
        </div>
      );
    case "input":
      return (
        <div style={{
          display: "flex", alignItems: "center", width: "100%", height: "100%", minHeight: 40,
          padding: p.padding !== undefined ? px(p.padding) : "0 12px",
          background: strOf(p.background) ?? "#ffffff", color: "#9ca3af", fontSize: numOf(p.fontSize, 15),
          border: `${numOf(p.borderWidth, 1)}px solid ${strOf(p.borderColor) ?? "#d1d5db"}`,
          borderRadius: p.borderRadius !== undefined ? px(p.borderRadius) : 8, boxSizing: "border-box",
        }}>
          {strOf(p.placeholder) ?? strOf(p.text) ?? ""}
        </div>
      );
    case "image": {
      const url = imageUrl(ctx, strOf(p.src) ?? strOf(p.asset));
      return url ? (
        <img src={url} alt={node.name} draggable={false}
          style={{ display: "block", width: "100%", height: "100%", objectFit: (strOf(p.fit) as React.CSSProperties["objectFit"]) ?? "cover",
                   borderRadius: p.borderRadius !== undefined ? px(p.borderRadius) : undefined }} />
      ) : (
        <div style={{ width: "100%", height: "100%", minHeight: 24, background: "repeating-linear-gradient(45deg, #e5e7eb 0 6px, #f3f4f6 6px 12px)",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: 11 }}>
          {node.name}
        </div>
      );
    }
    case "divider":
      return null;
    case "spacer":
      return null;
    default:
      return null;
  }
}

/** A `slot` node: injected content when this frame is embedded, a placeholder when it stands alone. */
function Slot({ node, ctx }: { node: FrameNode; ctx: Ctx }) {
  const name = strOf(node.props.name) ?? node.id;
  const injected = ctx.injections?.get(name);
  if (injected && ctx.host) {
    return <>{injected.map((n) => <NodeBox key={n.id} node={n} parent={node} ctx={ctx.host!} />)}</>;
  }
  if (ctx.injections) return null; // embedded, nothing injected here
  return (
    <div style={{ flex: "1 1 auto", minHeight: 32, width: "100%", border: "1px dashed #38bdf8", borderRadius: 6, color: "#0284c7",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, background: "rgba(56,189,248,0.06)" }}>
      slot · {name}
    </div>
  );
}

/** An `embed` node: another `.frame` rendered live inside this one. */
function Embed({ node, ctx }: { node: FrameNode; ctx: Ctx }) {
  const ref = strOf(node.props.ref_path);
  const abs = ref && ctx.docPath ? resolveRef(ctx.docPath, ref) : ref ?? null;
  const [child, setChild] = useState<{ body: FrameBody; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    setChild(null);
    setError(null);
    if (!abs) { setError("no ref_path"); return; }
    if (ctx.depth >= MAX_EMBED_DEPTH) { setError("embed too deep"); return; }
    if (ctx.chain.includes(abs)) { setError("embeds itself"); return; }
    if (!ctx.docPath) { setError(ref ?? "embed"); return; }
    readVirtualDirectoryFile(ctx.docPath, abs).then(
      (r) => { if (!stale) setChild({ body: parseFrame(r.content), path: abs }); },
      (e) => { if (!stale) setError(e instanceof Error ? e.message : String(e)); },
    );
    return () => { stale = true; };
  }, [abs, ctx.docPath, ctx.depth, ref]);
  if (error || !child) {
    return (
      <div style={{ flex: "1 1 auto", minHeight: 32, width: "100%", border: "1px dashed #c084fc", borderRadius: 6, color: "#7e22ce",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, background: "rgba(192,132,252,0.06)" }}>
        {error ? `embed · ${error}` : `embed · ${ref ?? "…"}`}
      </div>
    );
  }
  const view = viewById(child.body, strOf(node.props.view)) ?? null;
  const sub: Ctx = {
    body: child.body, docPath: child.path, hidden: hiddenIn(child.body, view), selectedId: null, outlines: ctx.outlines,
    depth: ctx.depth + 1, chain: [...ctx.chain, child.path], injections: injectionsOf(ctx.body, node.id), host: ctx,
  };
  const frame = frameOf(child.body);
  const bgUrl = frame?.image ? imageUrl(sub, frame.image) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", flex: "1 1 auto", width: "100%", minHeight: 0, overflow: "hidden",
                  ...(bgUrl ? { backgroundImage: `url("${bgUrl}")`, backgroundSize: "cover", backgroundPosition: "top left" } : {}) }}>
      {childrenOf(child.body, null).map((n) => <NodeBox key={n.id} node={n} parent={null} ctx={sub} />)}
    </div>
  );
}

function NodeBox({ node, parent, ctx }: { node: FrameNode; parent: FrameNode | null; ctx: Ctx }) {
  if (ctx.hidden.has(node.id)) return null;
  const isContainer = node.kind === "box" || node.kind === "vstack" || node.kind === "hstack" || node.kind === "grid" || node.kind === "scroll";
  const style: React.CSSProperties = { ...commonStyle(node, ctx), ...sizingStyle(node, parent) };
  if (isContainer) Object.assign(style, containerStyle(node));
  else if (node.kind === "embed" || node.kind === "slot") {
    Object.assign(style, { display: "flex", flexDirection: "column", alignItems: "stretch", overflow: "hidden" });
    if (node.props.padding !== undefined) style.padding = px(node.props.padding);
  } else if (node.kind === "divider") {
    style.background = strOf(node.props.color) ?? strOf(node.props.background) ?? "#e5e7eb";
  } else {
    style.display = "flex";
    style.alignItems = "stretch";
    style.overflow = "hidden";
  }
  const interactive = !!ctx.onSelect;
  const onClick = interactive
    ? (e: React.MouseEvent) => { e.stopPropagation(); ctx.onSelect?.(node.id); }
    : undefined;
  let inner: React.ReactNode;
  if (isContainer) inner = childrenOf(ctx.body, node.id).map((c) => <NodeBox key={c.id} node={c} parent={node} ctx={ctx} />);
  else if (node.kind === "embed") inner = <Embed node={node} ctx={ctx} />;
  else if (node.kind === "slot") inner = <Slot node={node} ctx={ctx} />;
  else inner = <Leaf node={node} ctx={ctx} />;
  return (
    <div data-node-id={node.id} data-kind={node.kind} title={interactive ? `${node.name} · ${node.kind}` : undefined}
      className={interactive ? "fk-frame-node" : undefined} style={{ ...style, cursor: interactive ? "pointer" : undefined }} onClick={onClick}>
      {inner}
    </div>
  );
}

export default function FrameCanvas({ body, view, docPath, scale = 1, selectedId, onSelect, outlines = false, marks }: FrameCanvasProps) {
  const frame = frameOf(body);
  const ctx: Ctx = {
    body, docPath, hidden: hiddenIn(body, view ?? null), selectedId: selectedId ?? null, onSelect, outlines, depth: 0,
    chain: docPath ? [docPath] : [], marks,
  };
  if (!frame) {
    return (
      <div style={{ padding: 24, color: "#6b7280", fontSize: 13 }}>
        No frame yet — the file has no <code>frames</code> entry.
      </div>
    );
  }
  const bgUrl = frame.image ? imageUrl(ctx, frame.image) : null;
  const w = Math.max(1, frame.width);
  const h = Math.max(1, frame.height);
  return (
    <div style={{ width: w * scale, height: h * scale, position: "relative", flexShrink: 0 }}>
      {onSelect && <style>{`.fk-frame-node:hover { outline: 1px dashed #93c5fd; outline-offset: -1px; }`}</style>}
      <div
        onClick={onSelect ? () => onSelect(null) : undefined}
        style={{
          width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left",
          display: "flex", flexDirection: "column", alignItems: "stretch", position: "absolute", left: 0, top: 0,
          background: "#ffffff", overflow: "hidden", boxSizing: "border-box",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08)",
          ...(bgUrl ? { backgroundImage: `url("${bgUrl}")`, backgroundSize: "cover", backgroundPosition: "top left" } : {}),
        }}>
        {childrenOf(body, null).map((n) => <NodeBox key={n.id} node={n} parent={null} ctx={ctx} />)}
      </div>
    </div>
  );
}
