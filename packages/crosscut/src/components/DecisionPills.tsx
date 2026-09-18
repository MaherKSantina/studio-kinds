/**
 * A hierarchy of decisions as rows of answer pills — the suite's assignment
 * editor. Decisions appear and disappear as answers activate them
 * (`SpaceValue.activates`); answers themselves can be gated (`when`). Every
 * click emits the COMPLETE next assignment via `onChange`: the clicked answer
 * applied (or cleared), and answers to questions that left the table pruned —
 * see `toggleRef` in decisions/decisionSpace.ts.
 *
 * Presentation only: all behaviour lives in the pure decisionSpace module.
 */
import * as React from "react";
import { cn } from "../lib/cn";
import {
  SpaceDecision, decisionRows, refOf, splitRef, toggleRef, valuesOn,
} from "../decisions/decisionSpace";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { AnnotationTargetOverlay } from "./AnnotationLayer";

export interface DecisionPillsProps {
  /** The full hierarchy; which rows show follows from `value` + `context`. */
  decisions: SpaceDecision[];
  /** Current assignment: `decision=answer` refs. */
  value: string[];
  /** Fires on every click with the complete next assignment. */
  onChange?: (next: string[]) => void;
  /**
   * Host-owned toggling: when present, a click calls THIS instead of
   * onChange(toggleRef(...)). For hosts whose stored state is not the shown
   * assignment (a guide keeps manual answers apart from assumed ones).
   */
  onToggleRef?: (ref: string, isOn: boolean) => void;
  /**
   * Presentation hints per answer pill. `dashed` on a selected pill renders it
   * outlined-dashed instead of filled — selected but not asserted (assumed);
   * `dim` greys it (damped: handled elsewhere, not impossible). The hint
   * tooltip wins over the value's own detail.
   */
  valueState?: (ref: string, on: boolean) => { dim?: boolean; dashed?: boolean; tooltip?: string } | undefined;
  /** Enclosing assignment when rendered inside another document — gates
   *  activation and `when` but is never edited or emitted. */
  context?: string[];
  /** Clicking the selected pill clears that answer. Default true. */
  allowClear?: boolean;
  /** Render without click affordances — the read-only presentation. */
  readOnly?: boolean;
  /** Compact (default, dense documents) or regular size. */
  size?: "compact" | "regular";
  /** Show decisions down to a single available answer. Off for assignments
   *  (one answer = a fact, not a question); on for hosts whose decisions are
   *  retrieval cues — taking the lone answer still narrows a set. */
  includeSingles?: boolean;
  /** Annotation target id per answer ref. Default "answer:<ref>". */
  annotationTargetOf?: (ref: string) => string;
  /** Optional per-decision accessory rendered beside the label (e.g. a
   *  jump-to-its-node icon). */
  action?: (decisionKey: string) => React.ReactNode;
  className?: string;
}

function MaybeTooltip({ title, children }: { title?: string; children: React.ReactElement }) {
  if (!title) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-72">{title}</TooltipContent>
    </Tooltip>
  );
}

export function DecisionPills({
  decisions, value, onChange, onToggleRef, valueState, context = [], allowClear = true, readOnly = false,
  size = "compact", className, annotationTargetOf = (ref) => `answer:${ref}`, action, includeSingles = false,
}: DecisionPillsProps) {
  const rows = decisionRows(decisions, value, context, { includeSingles });
  const compact = size === "compact";

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex flex-col", compact ? "gap-1" : "gap-1.5", className)} data-testid="decision-pills">
        {rows.map(({ decision: d, depth }) => {
          const taken = value.find((l) => splitRef(l)[0] === d.key);
          return (
            <div key={d.key}
              className={cn("flex items-start gap-1.5", depth > 0 && "border-l-2 border-border")}
              style={{ paddingLeft: depth * 10 }}>
              <MaybeTooltip title={d.detail}>
                <span className={cn(
                  "shrink-0 font-bold leading-tight",
                  compact ? "w-24 text-[13px]" : "w-32 text-sm",
                  taken ? "text-foreground" : "text-warning",
                )}>
                  {d.label}
                  {/* Host accessory beside the label — a jump-to-node icon,
                      a provenance marker. */}
                  {action?.(d.key)}
                </span>
              </MaybeTooltip>
              <div className="flex flex-1 flex-wrap gap-1">
                {valuesOn(d, value, context).map((v) => {
                  const ref = refOf(d.key, v.key);
                  const on = taken === ref;
                  const hint = valueState?.(ref, on);
                  return (
                    <span key={v.key} className="relative inline-flex">
                    <MaybeTooltip title={hint?.tooltip ?? v.detail}>
                      <button type="button" disabled={readOnly}
                        aria-pressed={on}
                        onClick={() => {
                          if (onToggleRef) onToggleRef(ref, on);
                          else onChange?.(toggleRef(decisions, value, ref, { context, allowClear }));
                        }}
                        className={cn(
                          "select-none rounded-full border leading-normal",
                          compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
                          on && !hint?.dashed && "border-transparent bg-foreground/90 font-medium text-background",
                          on && hint?.dashed && "border-dashed border-foreground/60 font-medium text-foreground",
                          !on && "border-input text-foreground/80",
                          !on && hint?.dashed && "border-dashed",
                          hint?.dim && !on && "border-border text-muted-foreground/70",
                          !readOnly && "cursor-pointer hover:bg-accent aria-pressed:hover:bg-foreground/80",
                          readOnly && "cursor-default",
                        )}>
                        {v.label}
                      </button>
                    </MaybeTooltip>
                    <AnnotationTargetOverlay target={annotationTargetOf(ref)} className="rounded-full" />
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
