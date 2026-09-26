/**
 * The `.script` kind — A SCRIPT AS A DOCUMENT: the code, the interpreter it
 * runs in, the environment variables the run gets, and the folder it runs in,
 * all in one file that reads before it runs. The view shows the variables and
 * the source and offers Run; the HOST runs it (the folder worker, the desktop
 * shell, the VS Code extension — `configureFileKinds({ runScript })`) and the
 * result panel shows the exit code, the output and the errors. Running never
 * changes the file.
 *
 *   title: Rebuild the index
 *   language: powershell            # powershell | pwsh | bash | sh | python | node | cmd
 *   env:                            # the variables the run gets — shown on open
 *     INDEX_DIR: C:\Github\index
 *     DRY_RUN: "1"
 *   cwd: .                          # where it runs, relative to this file's folder
 *   code: |
 *     Write-Host "Rebuilding $env:INDEX_DIR"
 *
 * The parser is lenient — a half-written file still renders — and mirrors the
 * checker (`python/studio_kinds/kinds/script.py`): a variable whose name is
 * not an identifier or whose value is not a scalar is dropped here and named
 * there; a number or a boolean reaches the run as text, as JavaScript writes it.
 */
import yaml from "js-yaml";

/** The interpreters a host knows how to start, by the name the file uses. */
export const SCRIPT_LANGUAGES = ["powershell", "pwsh", "bash", "sh", "python", "node", "cmd"] as const;
export type ScriptLanguage = (typeof SCRIPT_LANGUAGES)[number];

export interface ScriptDoc {
  title: string;
  description?: string;
  /** Lower-cased; "" when absent. Whether a host can start it is the run's answer. */
  language: string;
  /** Every variable as the text the run gets. */
  env: Record<string, string>;
  /** A folder relative to the file's own; absent = the file's folder. */
  cwd?: string;
  code: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const scalarText = (v: unknown): string | null =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : null;

export const isScriptLanguage = (s: string): s is ScriptLanguage => (SCRIPT_LANGUAGES as readonly string[]).includes(s);

/** Lenient parse — never throws; an unparseable file opens as an empty script. */
export function parseScript(text: string): ScriptDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec(raw.env))) {
    const t = scalarText(v);
    if (NAME.test(k) && t !== null) env[k] = t;
  }
  const cwd = str(raw.cwd);
  return {
    title: str(raw.title) || "Script",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    language: (str(raw.language) ?? "").trim().toLowerCase(),
    env,
    ...(cwd ? { cwd } : {}),
    code: str(raw.code) ?? "",
  };
}

/** What a run is handed — the parsed doc's executable half, nothing the view adds. */
export function scriptRunOf(doc: ScriptDoc): { language: string; code: string; env: Record<string, string>; cwd?: string } {
  return { language: doc.language, code: doc.code, env: doc.env, ...(doc.cwd ? { cwd: doc.cwd } : {}) };
}

/** The checker's summary line, for stories and counts: `powershell · 2 variables · 12 lines`. */
export function scriptSummary(doc: ScriptDoc): string {
  const lines = doc.code.trim() ? doc.code.trim().split(/\r?\n/).length : 0;
  const n = Object.keys(doc.env).length;
  return `${doc.language || "no language"} · ${n} variable${n === 1 ? "" : "s"} · ${lines} line${lines === 1 ? "" : "s"}`;
}
