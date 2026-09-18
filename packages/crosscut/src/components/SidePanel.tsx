/**
 * A resizable, collapsible side panel — the layout shell for a tool's rail
 * (the playbook's "where we are" column, a file tree, an inspector).
 *
 *   drag the free edge   -> resize (double-click resets)
 *   the edge button      -> collapse to a thin rail; its button expands back
 *   storageKey           -> width + collapsed state survive reloads
 *   disabled             -> renders children in a plain full-size wrapper, for
 *                           layouts that only sometimes have a second pane
 */
import * as React from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "../lib/cn";

export interface SidePanelProps {
  children: React.ReactNode;
  /** Which side of the layout the panel sits on; the handle rides the free
   *  edge. Default "left" (panel left, handle on its right edge). */
  side?: "left" | "right";
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Controlled collapse; omit to let the panel manage itself. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Persist width + collapsed under this key (localStorage). */
  storageKey?: string;
  /** Vertical label on the collapsed rail. */
  title?: string;
  /** Render as a plain full-size wrapper — no width, no handle, no collapse. */
  disabled?: boolean;
  className?: string;
}

const clampWidth = (w: number, min: number, max: number) => Math.min(max, Math.max(min, w));

export function SidePanel({
  children, side = "left", defaultWidth = 320, minWidth = 200, maxWidth = 640,
  collapsed: collapsedProp, onCollapsedChange, storageKey, title, disabled, className,
}: SidePanelProps) {
  const store = typeof window !== "undefined" && storageKey ? window.localStorage : null;
  const kW = `sidepanel:${storageKey}:w`;
  const kC = `sidepanel:${storageKey}:c`;

  const [width, setWidth] = React.useState<number>(() => {
    const v = store?.getItem(kW);
    return v ? clampWidth(Number(v), minWidth, maxWidth) : defaultWidth;
  });
  const [ownCollapsed, setOwnCollapsed] = React.useState<boolean>(() => store?.getItem(kC) === "1");
  const widthRef = React.useRef(width);
  widthRef.current = width;

  const isCollapsed = collapsedProp ?? ownCollapsed;
  const setCollapsed = (c: boolean) => {
    setOwnCollapsed(c);
    onCollapsedChange?.(c);
    store?.setItem(kC, c ? "1" : "0");
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      setWidth(clampWidth(startW + (side === "left" ? dx : -dx), minWidth, maxWidth));
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      store?.setItem(kW, String(widthRef.current));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  if (disabled) return <div className={cn("flex min-h-0 flex-1 flex-col", className)}>{children}</div>;

  const ExpandIcon = side === "left" ? ChevronsRight : ChevronsLeft;
  const CollapseIcon = side === "left" ? ChevronsLeft : ChevronsRight;

  if (isCollapsed) {
    return (
      <div className={cn("flex w-7 shrink-0 flex-col items-center bg-muted/30 pt-1.5",
                         side === "left" ? "border-r" : "border-l", className)}>
        <button type="button" title="Expand" onClick={() => setCollapsed(false)}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <ExpandIcon className="size-3.5" />
        </button>
        {title && (
          <span className="mt-2 select-none text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground"
            style={{ writingMode: "vertical-rl" }}>
            {title}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ width }}
      className={cn("relative flex min-h-0 shrink-0 flex-col",
                    side === "left" ? "border-r" : "border-l", className)}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={startDrag}
        onDoubleClick={() => { setWidth(defaultWidth); store?.setItem(kW, String(defaultWidth)); }}
        className={cn("absolute inset-y-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-ring/40 active:bg-ring/60",
                      side === "left" ? "-right-0.5" : "-left-0.5")}
      />
      <button type="button" title="Collapse" onClick={() => setCollapsed(true)}
        className={cn("absolute top-1.5 z-20 flex h-[18px] w-[18px] items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-foreground",
                      side === "left" ? "-right-2" : "-left-2")}>
        <CollapseIcon className="size-3" />
      </button>
    </div>
  );
}
