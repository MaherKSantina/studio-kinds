/**
 * A VERSIONED KIND — the convention every kind that changes shape follows.
 *
 * The document says which version of its kind it is: a top-level `version: N`
 * (a whole number). Absent means 1 — every file written before the kind was
 * versioned is version 1 without being touched. A kind keeps every version it
 * has ever had: version N's parser and renderer stay as they were when N was
 * current, so a file never changes meaning because the kind moved on.
 *
 * A version the kind does not know (higher than its latest, or not a whole
 * number) is a problem the checker names; the document still opens, read as
 * the latest version, so a file from a newer Studio shows something rather
 * than nothing.
 *
 * The dump writes `version` only from 2 up: a version-1 file saved from the
 * UI stays byte-for-byte a version-1 file.
 */

export interface DocVersion {
  /** The version the document is read as. */
  version: number;
  /** Set when `version:` was present but not one the kind knows. */
  problem?: string;
}

/** Read `version:` off a parsed YAML root, against the versions a kind has. */
export function readDocVersion(raw: Record<string, unknown>, kind: string, latest: number): DocVersion {
  const v = raw.version;
  if (v === undefined || v === null) return { version: 1 };
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    return { version: latest, problem: `\`version: ${String(v)}\` is not a whole number from 1 — read as version ${latest}` };
  }
  if (v > latest) {
    return { version: latest, problem: `\`version: ${v}\` — this Studio knows ${kind} up to version ${latest}; read as ${latest}, so newer content may not show` };
  }
  return { version: v };
}

/** The `version` entry for a dump: present from 2 up, absent for 1. */
export const dumpDocVersion = (version: number): { version?: number } => (version >= 2 ? { version } : {});
