/**
 * GOLDEN RULES — which studio opens which file kind. GENERATED from the
 * registry: a kind with a `studioPath` routes there; everything else opens in
 * the nodes built-in editor (and can still be VIEWED read-only anywhere).
 */
import { DecisionTable, decide, oneOf } from "crosscut";
import { FILE_KINDS } from "./lib/filePreviews";

export interface OpenWithCtx {
  ext: string;
}

export interface OpenWithVerdict {
  studioPath: string | null;
  via: "studio" | "builtin-editor";
}

export const openWithRules: DecisionTable<OpenWithCtx, OpenWithVerdict> = {
  name: "open-with",
  answers: "Which app of the suite opens a file of this extension for authoring?",
  rules: FILE_KINDS.filter((k) => k.studioPath !== null).map((k) => ({
    rule: `${k.key}-studio`,
    because: `${k.key} files are authored by their studio; other tools open them read-only`,
    when: { ext: oneOf(...k.extensions) },
    then: { studioPath: k.studioPath, via: "studio" as const },
  })),
  otherwise: { studioPath: null, via: "builtin-editor" },
};

/** URL that opens `path` in the studio owning it, or null for the built-in editor. */
export function openWithUrl(path: string, ext: string): string | null {
  const v = decide(openWithRules, { ext }).outcome;
  if (v.via === "builtin-editor" || !v.studioPath) return null;
  return `${v.studioPath}/?path=${encodeURIComponent(path)}`;
}
