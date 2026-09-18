/**
 * The kinds the Studio can START a document as: every template the kit
 * offers whose registry kind the Studio authors. Read by the welcome page's
 * "New …" buttons and the File › New dialog.
 */
import { type FileKindDef, KIND_ICONS, TEMPLATE_KINDS, kindForPath } from "filekinds";

export interface StartableKind {
  ext: string;
  /** What the kind is, in a line. */
  what: string;
  kind: FileKindDef;
  Icon: React.ComponentType<{ className?: string }> | undefined;
}

export function startableKinds(): StartableKind[] {
  return TEMPLATE_KINDS.flatMap((t) => {
    const kind = kindForPath(`x.${t.ext}`);
    return kind && kind.studioPath ? [{ ext: t.ext, what: t.what, kind, Icon: KIND_ICONS[kind.key] }] : [];
  });
}
