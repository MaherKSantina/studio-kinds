/** File › New: pick the kind; the save picker names the file next. */
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "crosscut";
import { FileText } from "lucide-react";
import { startableKinds } from "../lib/kinds";

export function NewDocDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (ext: string) => void }) {
  const kinds = React.useMemo(() => startableKinds(), []);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" showCloseButton>
        <DialogTitle>New document</DialogTitle>
        <DialogDescription>Pick a kind — you name the file and choose its folder next.</DialogDescription>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {kinds.map((k) => {
            const Icon = k.Icon ?? FileText;
            return (
              <button key={k.ext} type="button" onClick={() => onPick(k.ext)}
                className="flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="size-4" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{k.kind.label} <span className="font-mono text-xs text-muted-foreground">.{k.ext}</span></span>
                  <span className="block text-[13px] leading-snug text-muted-foreground">{k.what}</span>
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
