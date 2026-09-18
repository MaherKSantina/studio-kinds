/**
 * One event in a list — the suite's row for "a thing that can happen":
 * a bordered, expandable card with every accessory the playbook grew:
 *
 *   [trigger icon] [repeats icon]  Label  rate   [subtitle]   (status dot) >
 *
 * Presentation only. Who decides (trigger), how often (repeats/rate), and how
 * ready we are (status color) all arrive as props; the expanded body is
 * `children`, so hosts keep their own detail rendering.
 */
import * as React from "react";
import { ChevronDown, ChevronRight, Hand, Repeat, Zap } from "lucide-react";
import { cn } from "../lib/cn";
import { AnnotationTargetOverlay } from "./AnnotationLayer";
import { DIFF_COLORS, DiffChange } from "../diff/diffRules";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export interface EventRowProps {
  label: string;
  /** Rendered before the icons — a position number, a checkbox, anything. */
  leading?: React.ReactNode;
  /** `imposed` fires whether or not you are ready (bolt); `chosen` fires when
   *  you say so (hand). Omit for no trigger mark. */
  trigger?: "imposed" | "chosen";
  /** Happens repeatedly — capacity to budget for, not a step. Shows the loop. */
  repeats?: boolean;
  /** How often, e.g. "1/mo". Rendered after the label when `repeats`. */
  rate?: string;
  /** Small muted text after the label (an effort like "10m", a date). */
  meta?: string;
  /** Rendered right of the label block, before the status dot ("fixed" chips…). */
  badge?: React.ReactNode;
  /** Right-side readiness dot: any CSS color. Omit for no dot. */
  status?: { color: string; title?: string };
  /** Small line under the label — drift notes, "nobody has looked", etc. */
  subtitle?: React.ReactNode;
  /** Tooltip on the label. */
  detail?: string;
  open?: boolean;
  onToggle?: () => void;
  /** False when the row SELECTS rather than expands: the highlight and the body
   *  still follow `open`, but the chevron stays pointing right. Default true. */
  expands?: boolean;
  /** Target id for the annotation overlay ("event:fund"). When the layer is
   *  active, this row goes inert unless annotated — then it rings and opens
   *  the explanation instead of toggling. */
  annotateTarget?: string;
  /** Diff classification: colors the row green/amber/red (left accent + label
   *  tint) — COLOR ONLY, information is never struck through. */
  change?: DiffChange;
  /** Expanded body, rendered inside the card under the header row. */
  children?: React.ReactNode;
  className?: string;
}

function IconTip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="mt-[3px] flex shrink-0">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{title}</TooltipContent>
    </Tooltip>
  );
}

export function EventRow({
  label, leading, trigger, repeats, rate, meta, badge, status, subtitle, detail, open, onToggle, children, className, annotateTarget, change,
  expands = true,
}: EventRowProps) {
  const header = (
    <div
      role={onToggle ? "button" : undefined}
      onClick={onToggle}
      className={cn(
        "flex items-start gap-1.5 px-2 py-1.5",
        onToggle && "cursor-pointer hover:bg-foreground/[0.04]",
      )}
    >
      {leading && <span className="mt-[1px] shrink-0">{leading}</span>}
      {trigger && (
        <IconTip title={trigger === "chosen" ? "Chosen — fires when we say so" : "Imposed — fires whether or not we are ready"}>
          {trigger === "chosen"
            ? <Hand className="size-3 text-muted-foreground" />
            : <Zap className="size-3.5 text-muted-foreground" />}
        </IconTip>
      )}
      {repeats && (
        <IconTip title={`Happens repeatedly${rate ? ` — about ${rate}` : ""}. Never finished, so it is capacity to budget for rather than a step in a plan.`}>
          <Repeat className="size-3 text-info" />
        </IconTip>
      )}
      <div className="min-w-0 flex-1">
        <MaybeTitle title={detail}>
          <p className="text-[13px] leading-[1.35]"
             style={change && change !== "same" ? { color: DIFF_COLORS[change], fontWeight: 600 } : undefined}>
            {label}
            {repeats && rate && <span className="ml-1.5 text-xs text-info">{rate}</span>}
            {meta && <span className="ml-1.5 text-xs text-muted-foreground">{meta}</span>}
          </p>
        </MaybeTitle>
        {subtitle && <div className="text-xs leading-snug">{subtitle}</div>}
      </div>
      {badge && <span className="mt-[1px] shrink-0">{badge}</span>}
      {status && (
        <MaybeTitle title={status.title}>
          <span className="mt-1 size-2 shrink-0 rounded-full border"
            style={{ backgroundColor: `${status.color}33`, borderColor: status.color }} />
        </MaybeTitle>
      )}
      {onToggle && (open && expands
        ? <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
        : <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />)}
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div
        style={change && change !== "same"
          ? { borderLeft: `3px solid ${DIFF_COLORS[change]}`, backgroundColor: `${DIFF_COLORS[change]}0a` }
          : undefined}
        className={cn(
          "relative overflow-hidden rounded-md border",
          open ? "border-muted-foreground/60 bg-foreground/[0.02]" : "border-border",
          className,
        )}>
        {header}
        {open && children}
        {annotateTarget && <AnnotationTargetOverlay target={annotateTarget} />}
      </div>
    </TooltipProvider>
  );
}

function MaybeTitle({ title, children }: { title?: string; children: React.ReactElement }) {
  if (!title) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-80">{title}</TooltipContent>
    </Tooltip>
  );
}
