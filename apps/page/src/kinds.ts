/**
 * The kinds the page offers — the ones "Which kind for what" names — with, for each, the Studio's
 * label, the example from `examples/` when the kind has one, and the template otherwise. The
 * renderer comes from the file-kind registry, picked by the extension.
 */
import yaml from "js-yaml";
import { fileTemplate, kindForPath } from "filekinds";

/** The kinds of "Which kind for what", in its order; `.md` for anything else. */
const GUIDE_KINDS = [
  "brief", "playbook", "kanban", "calendar", "policy", "flow", "jsonl", "pipeline", "collection",
  "clip", "song", "finance", "script", "views", "page", "analysis", "md",
];

const EXAMPLES = import.meta.glob("../../../examples/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export interface Offered {
  /** The extension, without the dot. */
  ext: string;
  /** The Studio's label for the kind; the extension when the Studio has no renderer for it. */
  label: string;
  /** Whether the file-kind registry renders it; otherwise the text is shown as written. */
  rendered: boolean;
}

export const OFFERED: Offered[] = GUIDE_KINDS.map((ext) => {
  const def = kindForPath(`x.${ext}`);
  return { ext, label: def?.label ?? `.${ext}`, rendered: !!def };
});

/** The kind a file name says, when the page offers it. */
export const kindForFile = (name: string): string | undefined => {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return OFFERED.some((k) => k.ext === ext) ? ext : undefined;
};

/** The example of that kind in `examples/`, as `{name, text}`, or nothing. */
export function exampleFor(ext: string): { name: string; text: string } | null {
  for (const [path, text] of Object.entries(EXAMPLES)) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (name.endsWith(`.${ext}`)) return { name, text };
  }
  return null;
}

/** The kind's template, as `studio-check --template <ext>` prints it. */
export const templateFor = (ext: string): { name: string; text: string } => ({
  name: `untitled.${ext}`,
  text: fileTemplate(`untitled.${ext}`, "untitled"),
});

/** The example when there is one, else the template — what the page opens when a kind is chosen. */
export const startFor = (ext: string) => exampleFor(ext) ?? templateFor(ext);

export interface YamlStatus {
  /** Whether the text reads as YAML (a document, or the first of a flow's two). */
  ok: boolean;
  /** The parser's message when it does not, with its place. */
  message?: string;
}

/** Whether the text parses as YAML — the page's one check; the rules are `studio-check`'s, on a machine. */
export function yamlStatus(ext: string, text: string): YamlStatus | null {
  if (ext === "md" || ext === "jsonl") return null;
  try {
    // A flow is two YAML documents; anything else is one.
    if (ext === "flow") yaml.loadAll(text); else yaml.load(text);
    return { ok: true };
  } catch (e) {
    const err = e as { message?: string; mark?: { line?: number; column?: number } };
    const where = err.mark && typeof err.mark.line === "number" ? ` (${err.mark.line + 1}:${(err.mark.column ?? 0) + 1})` : "";
    const reason = (err.message ?? String(e)).split("\n")[0];
    return { ok: false, message: `YAML: ${reason}${where}` };
  }
}
