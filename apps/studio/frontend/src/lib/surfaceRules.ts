/**
 * GOLDEN RULES — which surface the Studio mounts for the open document. The
 * registry says what a kind is; this table says what to show.
 *
 * Since 2026-09-13 there is ONE surface for every text kind, in every host
 * (the web Studio over the drive or a folder, the desktop app, the VS Code
 * extension): the kind's PREVIEW — the same thing a memory's card shows. No
 * authoring editor and no source pane are mounted anywhere; documents are
 * changed by an agent on the store and the preview re-reads them as they
 * land. What a preview offers (a lock taken in a memory, a box ticked in a
 * list) still persists through the host's autosave. The registry's `Editor`
 * column stays authored and testable; the Studio simply no longer mounts it.
 */
import { DecisionTable } from "crosscut";
import type { FileKindDef } from "filekinds";

export interface SurfaceCtx {
  /** The kind is bytes (pdf, workbook). */
  binary: boolean;
}

export interface SurfaceVerdict {
  /** preview = the kind's preview (an unregistered extension shows as text inside it); binary = nothing to show but a pointer. */
  surface: "preview" | "binary";
}

export const surfaceRules: DecisionTable<SurfaceCtx, SurfaceVerdict> = {
  name: "studio-surface",
  answers: "Which surface does the Studio mount for the open document?",
  rules: [
    { rule: "binary", because: "bytes have no preview here — the file is viewed in Nodes or the OS instead", when: { binary: true }, then: { surface: "binary" } },
  ],
  otherwise: { surface: "preview" },
};

export const surfaceCtxOf = (kind: FileKindDef | undefined): SurfaceCtx => ({
  binary: !!kind?.binary,
});
