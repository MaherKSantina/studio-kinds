/**
 * The annotation OVERLAY: activate it and the wrapped preview washes out and
 * goes inert — only annotated targets stay clickable, each ringed, and a click
 * opens the explanation dialog instead of doing whatever the control does.
 *
 * Reuse: wrap any preview in <AnnotationProvider>; components mark their parts
 * with <AnnotationTargetOverlay target="..."/> inside a relative container
 * (EventRow and DecisionPills already do). Content richer than plain text
 * (markdown, a file rendered by its kind) comes from the host's
 * `renderAnnotation` — filekinds ships one wired to the registry.
 */
import * as React from "react";
import { cn } from "../lib/cn";
import { Annotation, annotationsFor } from "../annotations/annotations";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export interface AnnotationLayerState {
  active: boolean;
  annotationsFor: (target: string) => Annotation[];
  open: (target: string) => void;
}

const Ctx = React.createContext<AnnotationLayerState | null>(null);

/** Null when no provider or the overlay is off — components render normally. */
export const useAnnotationLayer = (): AnnotationLayerState | null => React.useContext(Ctx);

/** The ring + hit layer over one annotated component. Renders nothing unless
 *  the overlay is active AND this target has annotations. Parent must be
 *  `position: relative`. */
export function AnnotationTargetOverlay({ target, className }: { target: string; className?: string }) {
  const layer = useAnnotationLayer();
  if (!layer?.active) return null;
  const notes = layer.annotationsFor(target);
  if (!notes.length) return null;
  return (
    <button
      type="button"
      title={notes[0].title ?? "Annotated — click to read"}
      aria-label={`Annotation: ${notes[0].title ?? target}`}
      onClick={(e) => { e.stopPropagation(); layer.open(target); }}
      className={cn(
        "absolute inset-0 z-40 cursor-pointer rounded-md bg-primary/10 ring-2 ring-primary/80 hover:bg-primary/15",
        className,
      )}
    />
  );
}

export interface AnnotationProviderProps {
  annotations: Annotation[];
  /** The overlay switch — the host owns it (a toolbar toggle). */
  active: boolean;
  /** Rich content renderer (markdown, file kinds). Fallback: plain text + items. */
  renderAnnotation?: (a: Annotation) => React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AnnotationProvider({ annotations, active, renderAnnotation, children, className }: AnnotationProviderProps) {
  const [openTarget, setOpenTarget] = React.useState<string | null>(null);
  React.useEffect(() => { if (!active) setOpenTarget(null); }, [active]);

  const value = React.useMemo<AnnotationLayerState>(() => ({
    active,
    annotationsFor: (t) => annotationsFor(annotations, t),
    open: setOpenTarget,
  }), [active, annotations]);

  const openNotes = openTarget ? annotationsFor(annotations, openTarget) : [];

  return (
    <Ctx.Provider value={value}>
      <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        {/* The wash: blocks and mutes everything; annotated overlays sit above it. */}
        {active && <div aria-hidden className="absolute inset-0 z-[35] bg-background/55" data-testid="annotation-scrim" />}
      </div>

      <Dialog open={!!openTarget} onOpenChange={(o) => { if (!o) setOpenTarget(null); }}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle className="text-sm">{openNotes[0]?.title ?? "Annotation"}</DialogTitle>
            <DialogDescription className="sr-only">Explanation for the highlighted item</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {openNotes.map((a, i) => (
              <div key={i} className="space-y-2">
                {i > 0 && a.title && <p className="text-sm font-semibold">{a.title}</p>}
                {renderAnnotation ? renderAnnotation(a) : (
                  <>
                    {a.body && <p className="whitespace-pre-wrap text-sm">{a.body}</p>}
                    {!!a.items?.length && (
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {a.items.map((it, j) => <li key={j}>{it}</li>)}
                      </ul>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
