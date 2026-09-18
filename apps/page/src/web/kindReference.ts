/**
 * What the page knows about a kind beyond checking it: its BOOK and its FIELDS,
 * both bundled at build time so the page stays a page — no fetch, no server.
 *
 *   book(ext)    the kind's playbook at its latest version, kinds/<ext>/v<N>.playbook —
 *                how the kind works; the same file `studio-check --book <ext>` prints the path of
 *   fields(ext)  the kind's field table at its latest version, kinds/<ext>/v<N>.fields.yaml —
 *                every field, its type and what it is; `studio-check --fields <ext>` prints the path
 */
import yaml from "js-yaml";

const BOOKS = import.meta.glob("../../../../kinds/*/v*.playbook", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const FIELDS = import.meta.glob("../../../../kinds/*/v*.fields.yaml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export interface Field {
  field: string;
  type?: string;
  required?: boolean;
  description?: string;
}

/** The latest `kinds/<ext>/v<N><suffix>` among the bundled files, with its version. */
function latest(files: Record<string, string>, ext: string, suffix: string): { version: number; text: string; path: string } | null {
  let best: { version: number; text: string; path: string } | null = null;
  for (const [p, text] of Object.entries(files)) {
    const m = p.match(/\/kinds\/([^/]+)\/v(\d+)(\..+)$/);
    if (!m || m[1] !== ext || m[3] !== suffix) continue;
    const version = Number(m[2]);
    if (!best || version > best.version) best = { version, text, path: `kinds/${ext}/v${version}${suffix}` };
  }
  return best;
}

/** The kind's book at its latest version. */
export const book = (ext: string) => latest(BOOKS, ext, ".playbook");

/** The kind's field table at its latest version. */
export function fields(ext: string): { version: number; path: string; fields: Field[] } | null {
  const f = latest(FIELDS, ext, ".fields.yaml");
  if (!f) return null;
  const doc = yaml.load(f.text) as { fields?: Field[] } | null;
  return { version: f.version, path: f.path, fields: Array.isArray(doc?.fields) ? doc!.fields! : [] };
}
