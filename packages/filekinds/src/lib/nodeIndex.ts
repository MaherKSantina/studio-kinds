/**
 * THE FLAT STORE — every entry of the shared fs as one row, hierarchy
 * demoted to data. Projects, structured nodes, folders and files all appear
 * as rows here; what counts as a "unit" is not this module's call. A memory
 * document (or any other lens) selects with clauses over the FIELDS this
 * module derives, so the system supplies facts and the document supplies
 * judgment.
 *
 * Fields per entry (all strings, ready for the policy clause engine):
 *   path, name, stem, ext, kind (folder|file), structured (yes|no),
 *   area (top-level folder), parent, depth, updated (ISO date),
 *   age_days (whole days since updated, when both dates are known).
 */
import { isStructuredName } from "crosscut";

export interface IndexEntry {
  path: string;
  name: string;
  kind: "folder" | "file";
  /** ISO timestamp when the host's index carries one; age fields need it. */
  updatedAt?: string;
  /** When the entry ARRIVED — what a pulse heat-grid counts. */
  createdAt?: string;
  /** Content length in characters — files only; a reading-burden proxy. For a
   *  binary entry this is BYTES (the text channel is empty), so it only means
   *  reading burden when `binary` is not set. */
  size?: number;
  /** Bytes, not text (a PDF, an image) — `size` is byte length, not prose. */
  binary?: boolean;
}

const DAY = 86_400_000;

/** A timestamp's calendar day WHERE THE USER LIVES — never UTC. Bucketing
 *  by `toISOString` puts a Sydney afternoon in yesterday's column and grows
 *  an empty column after the UTC rollover; days are a local concept. */
export function localDay(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return undefined;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** Today, as a local calendar day. */
export const localToday = (): string => localDay(new Date().toISOString())!;

/** A local "YYYY-MM-DD" anchored at NOON local time — the DST-safe basis for
 *  day arithmetic. */
export const localNoonMs = (day: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime();
};

/** One entry's facts, as clause-ready string fields. `today` is an ISO date
 *  so callers (and golden tests) own the clock. */
export function indexFields(e: IndexEntry, today: string): Record<string, string> {
  const segs = e.path.split("/").filter(Boolean);
  const dot = e.name.lastIndexOf(".");
  const updated = localDay(e.updatedAt);
  const ms = updated ? localNoonMs(updated) : null;
  const nowMs = localNoonMs(today);
  const age = ms !== null && nowMs !== null ? Math.round((nowMs - ms) / DAY) : null;
  return {
    path: e.path,
    name: e.name,
    stem: dot > 0 ? e.name.slice(0, dot) : e.name,
    ext: dot > 0 ? e.name.slice(dot + 1).toLowerCase() : "",
    kind: e.kind,
    ...(typeof e.size === "number" ? { size: String(e.size) } : {}),
    structured: isStructuredName(e.name) ? "yes" : "no",
    area: segs[0] ?? "",
    parent: "/" + segs.slice(0, -1).join("/"),
    depth: String(segs.length),
    ...(updated ? { updated } : {}),
    ...(age !== null ? { age_days: String(age) } : {}),
    ...(localDay(e.createdAt) ? { created: localDay(e.createdAt)! } : {}),
  };
}
