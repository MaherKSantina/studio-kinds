/**
 * Ask for a file/folder name (create, rename). Validation comes from the
 * `fs-name` golden table — no dialog-local rules.
 */
import * as React from "react";
import { validateName } from "../fs/nameRules";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

export interface NamePromptDialogProps {
  open: boolean;
  title: string;
  action: string;
  initial?: string;
  /** Sibling names for duplicate detection; the initial name is exempt. */
  siblings: string[];
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
}

export function NamePromptDialog({ open, title, action, initial, siblings, onClose, onSubmit }: NamePromptDialogProps) {
  const [name, setName] = React.useState(initial ?? "");
  React.useEffect(() => { if (open) setName(initial ?? ""); }, [open, initial]);
  const verdict = validateName(name.trim(), siblings.filter((s) => s !== initial));
  const ok = !!name.trim() && verdict.ok;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && ok) void onSubmit(name.trim()); }} />
        {!verdict.ok && name.trim() && <p className="text-xs text-destructive">{verdict.error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!ok} onClick={() => void onSubmit(name.trim())}>{action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ConfirmDeleteDialogProps {
  open: boolean;
  text: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDeleteDialog({ open, text, onClose, onConfirm }: ConfirmDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete</DialogTitle>
          <DialogDescription>{text}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => void onConfirm()}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
