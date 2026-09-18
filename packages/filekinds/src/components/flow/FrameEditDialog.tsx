/**
 * EDITING A FRAME FROM INSIDE A FLOW — the frame editor mounted in a dialog
 * over the flow surface, on either kind of frame a state can show:
 *   • a frame kept INSIDE the flow (`frames.<name>`): every edit goes straight
 *     into the flow's model through the host's `onDocChange`, so the flow's
 *     own autosave carries it — one document, one save;
 *   • a `.frame` FILE beside the flow: read through the configured reader,
 *     written back (debounced) through the configured writer.
 * This is the composition the kit exists for: the flow imports the frame
 * editor instead of opening the Studio in an iframe (which it did until
 * 2026-09-12).
 */
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "crosscut";
import { configuredReader, configuredWriter } from "../../api";
import type { FlowBody } from "../../lib/flowEngine";
import type { FlowDoc } from "../../lib/flowOps";
import { dumpFrame, frameToRaw, parseFrame, parseFrameObject } from "../../lib/frameDoc";
import FrameEditor from "../frame/FrameEditor";

export type FrameEditTarget = { kind: "inline"; name: string } | { kind: "file"; abs: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

const keyOf = (t: FrameEditTarget | null): string => (t ? (t.kind === "inline" ? `inline:${t.name}` : `file:${t.abs}`) : "");

export default function FrameEditDialog({ target, body, folder, onDocChange, onClose }: {
  target: FrameEditTarget | null;
  body: FlowBody;
  /** The flow's folder — an inline frame's stand-in path lives beside the flow. */
  folder: string;
  onDocChange?: (mutate: (draft: FlowDoc) => { ok: boolean; error?: string }) => void;
  onClose: () => void;
}) {
  const [text, setText] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // The model at the moment of opening: later changes to it come from this dialog itself.
  const bodyRef = React.useRef(body);
  bodyRef.current = body;
  const key = keyOf(target);

  React.useEffect(() => {
    setError(null);
    setText(null);
    if (!target) return;
    if (target.kind === "inline") {
      const raw = bodyRef.current.frames[target.name];
      if (!raw) { setError(`No frame named “${target.name}” in this flow.`); return; }
      setText(dumpFrame(parseFrameObject(raw)));
      return;
    }
    const read = configuredReader();
    if (!read) { setError("This host cannot read files."); return; }
    let stale = false;
    read(target.abs).then(
      (c) => { if (!stale) setText(c); },
      (e: unknown) => { if (!stale) setError(e instanceof Error ? e.message : String(e)); },
    );
    return () => { stale = true; };
    // Loaded once per target; `key` is the target's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const flush = React.useCallback((next: string) => {
    if (!target) return;
    if (target.kind === "inline") {
      onDocChange?.((draft) => {
        const frames = isObj(draft.frames) ? draft.frames : (draft.frames = {});
        frames[target.name] = frameToRaw(parseFrame(next));
        return { ok: true };
      });
      return;
    }
    const write = configuredWriter();
    if (!write) { setError("This host cannot write files."); return; }
    void write(target.abs, next).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [target, onDocChange]);

  const onChange = (next: string) => {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    // An inline edit lands in the model at once (the flow's autosave debounces); a file write debounces here.
    if (target?.kind === "inline") flush(next);
    else timer.current = setTimeout(() => { timer.current = null; flush(next); }, 600);
  };

  const close = () => {
    if (timer.current && text !== null) { clearTimeout(timer.current); timer.current = null; flush(text); }
    onClose();
  };
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const docPath = !target ? "" : target.kind === "inline" ? `${folder}/${target.name}.frame` : target.abs;
  const title = !target ? "" : target.kind === "inline" ? `${target.name} — a frame kept in this flow` : target.abs.slice(target.abs.lastIndexOf("/") + 1);

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="flex h-[92vh] flex-col gap-0 p-0 sm:max-w-[96vw]" showCloseButton>
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 pr-12">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium">{title}</DialogTitle>
          <DialogDescription className="sr-only">The frame editor, inside this flow — edits save with the flow.</DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {error && <div className="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
          {!error && text !== null && target && <FrameEditor content={text} onChange={onChange} docPath={docPath} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
