/**
 * The `.jsonl` file kind — DATA ROWS: one JSON object per line (JSON Lines),
 * shown as a table whose columns are FOUND, not declared — the union of the
 * objects' keys, in the order they first appear. Made for LOOKING THROUGH
 * data: thousands of rows paged, one search box over every field, a click on
 * a header to sort — the way the csv kind is made for examining cells and the
 * pdf kind for reading pages. Nothing is authored here: a `.jsonl` is written
 * by whatever produced the data (an export, a program's output, a log).
 *
 * Lenient: blank lines are skipped; a line that is not a JSON object is a
 * PROBLEM (reported with its line number, the row skipped); a file whose
 * whole text is one JSON array of objects is accepted as well. Values render
 * as text — strings as they are, numbers and booleans as written, null and
 * missing empty, objects and arrays as compact JSON — and that text is what
 * the search and the sort see.
 *
 * COMPOSED rows — a line whose keys start with `$` is a DIRECTIVE, not a row:
 *
 *   {"$sources": ["accommodation.json#properties", "more.jsonl"], "$policy": "cheapest.policy"}
 *   {"$title": "Stays by price", "$description": "Thu 1 - Mon 5 Oct, 4 nights, two adults"}
 *   {"$labels": {"best_offer.price_total_aud": "Total (4 nights, AUD)", "distance_from_narooma_km": "km from Narooma"}}
 *
 * makes the file a LIVE VIEW: its rows are read from the sources on every
 * open — a .json array, a .json object (`#key` naming the list it holds,
 * else the longest list of objects in it), a .jsonl (its raw lines), a .csv
 * (first row the header) — plus any raw lines beside the directive, and pass
 * through the table policy (`role: table`, tablePolicy.ts) named by
 * `$policy`: kept, ordered, cut to its columns. Nothing is cached: the file
 * holds the references, never the result, so it can never drift from its
 * data. Refs resolve against the file's own folder. Either key alone works:
 * sources without a policy is the union of the files; a policy without
 * sources applies to the raw lines.
 *
 * THIS file is where the data is known — so what is said ABOUT the data
 * lives here too: `$title` and `$description` name the view, `$labels`
 * give the header names (by field, dot paths included). The policy names
 * fields and rules only, nothing about what the rows are. Directive lines
 * may be split as above; they merge (`$sources` and `$labels` accumulate,
 * a second scalar replaces the first with a note).
 */

import { parseCsv } from "./tableData";

export type DataRow = Record<string, unknown>;

const isRow = (v: unknown): v is DataRow => !!v && typeof v === "object" && !Array.isArray(v);

/** One source of a composed file: a ref relative to the file, and for a .json object the key holding the rows. */
export interface SourceRef { file: string; path?: string }

/** What the directive lines ask for: the sources to read, the table policy to pass them through,
 *  and the view's own words — its title, description and header labels. */
export interface Compose {
  sources: SourceRef[];
  policy?: string;
  title?: string;
  description?: string;
  labels?: Record<string, string>;
}

export interface DataRows {
  rows: DataRow[];
  /** Every key any row carries, in first-seen order. */
  columns: string[];
  /** Lines that were not a JSON object, with why. */
  problems: string[];
  /** Present when a directive line composes the rows from other files. */
  compose?: Compose;
}

/** `"accommodation.json#properties"` → the file and the key; an object `{file, path}` is read as is. */
export function parseSourceRef(v: unknown): SourceRef | null {
  if (typeof v === "string" && v.trim()) {
    const hash = v.lastIndexOf("#");
    if (hash > 0) return { file: v.slice(0, hash).trim(), path: v.slice(hash + 1).trim() || undefined };
    return { file: v.trim() };
  }
  if (isRow(v) && typeof v.file === "string" && v.file.trim()) {
    return { file: v.file.trim(), ...(typeof v.path === "string" && v.path.trim() ? { path: v.path.trim() } : {}) };
  }
  return null;
}

const isDirective = (v: DataRow): boolean => Object.keys(v).some((k) => k.startsWith("$"));


/** Lenient parse — never throws. */
export function parseDataRows(content: string): DataRows {
  const rows: DataRow[] = [];
  const problems: string[] = [];
  const text = content ?? "";
  let compose: Compose | undefined;
  const directive = (v: DataRow, where: string) => {
    const known = new Set(["$sources", "$policy", "$title", "$description", "$labels"]);
    for (const k of Object.keys(v)) {
      if (!k.startsWith("$")) problems.push(`${where}: a directive line carries no row fields — "${k}" ignored`);
      else if (!known.has(k)) problems.push(`${where}: unknown directive "${k}" (known: $sources, $policy, $title, $description, $labels)`);
    }
    compose ??= { sources: [] };
    const scalar = (key: "policy" | "title" | "description", what: string) => {
      const raw = v[`$${key}`];
      if (raw === undefined) return;
      if (typeof raw !== "string" || !raw.trim()) { problems.push(`${where}: $${key} must be ${what}`); return; }
      if (compose![key]) problems.push(`${where}: a second $${key} — this one applies`);
      compose![key] = raw.trim();
    };
    scalar("policy", "a file ref");
    scalar("title", "text");
    scalar("description", "text");
    if (v.$labels !== undefined) {
      if (!isRow(v.$labels)) problems.push(`${where}: $labels must be an object of field: label`);
      else {
        compose.labels ??= {};
        for (const [field, label] of Object.entries(v.$labels)) {
          if (typeof label === "string" && label.trim()) compose.labels[field] = label.trim();
          else problems.push(`${where}: $labels."${field}" must be text`);
        }
      }
    }
    if (v.$sources !== undefined) {
      if (!Array.isArray(v.$sources)) problems.push(`${where}: $sources must be a list of files`);
      else v.$sources.forEach((x, i) => {
        const ref = parseSourceRef(x);
        if (ref) compose!.sources.push(ref);
        else problems.push(`${where}: $sources entry ${i + 1} is not a file ref`);
      });
    }
  };
  const take = (v: unknown, where: string) => {
    if (!isRow(v)) problems.push(`${where}: not a JSON object`);
    else if (isDirective(v)) directive(v, where);
    else rows.push(v);
  };
  const trimmed = text.trim();
  let whole: unknown = undefined;
  if (trimmed.startsWith("[")) {
    try { whole = JSON.parse(trimmed); } catch { whole = undefined; }
  }
  if (Array.isArray(whole)) {
    whole.forEach((v, i) => take(v, `row ${i + 1}`));
  } else {
    text.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return;
      try { take(JSON.parse(line), `line ${i + 1}`); }
      catch (e) { problems.push(`line ${i + 1}: ${e instanceof Error ? e.message.replace(/ in JSON at position \d+.*$/, "") : String(e)}`); }
    });
  }
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); columns.push(k); }
  return { rows, columns, problems, ...(compose ? { compose } : {}) };
}

export interface SourceRows { rows: DataRow[]; problems: string[]; /** For a .json object: the key the rows came from. */ path?: string }

/** The rows a source file holds — by its name's extension: `.csv`/`.tsv` (the first row the
 *  header), a `.json` object (`path`, else the longest list of objects in it), else JSON lines
 *  or a JSON array (`parseDataRows`; a directive line in a source is not followed). */
export function rowsOfSource(content: string, sourceName: string, path?: string): SourceRows {
  const ext = sourceName.slice(sourceName.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "csv" || ext === "tsv") {
    const grid = parseCsv(content ?? "", "rows").sheets[0]?.rows ?? [];
    const [header = [], ...body] = grid;
    const rows = body.filter((r) => r.some((c) => c !== "")).map((r) => Object.fromEntries(header.map((h, i) => [h || `column ${i + 1}`, r[i] ?? ""])));
    return { rows, problems: header.length ? [] : ["the csv has no header row"] };
  }
  // A .json OBJECT (the whole text one object) holds its rows under a key; anything
  // else — a .jsonl, a JSON array, an object per line — is data rows.
  const trimmed = (content ?? "").trim();
  let obj: unknown;
  if (ext !== "jsonl" && trimmed.startsWith("{")) { try { obj = JSON.parse(trimmed); } catch { obj = undefined; } }
  if (isRow(obj)) {
    const o = obj;
    if (path) {
      const at = valueAt(o, path);
      if (!Array.isArray(at)) return { rows: [], problems: [`"${path}" is not a list in ${sourceName}`] };
      return { rows: at.filter(isRow), problems: at.every(isRow) ? [] : [`${sourceName}#${path}: some entries are not objects`], path };
    }
    let best: string | null = null;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (Array.isArray(v) && v.some(isRow) && (best === null || v.length > (o[best] as unknown[]).length)) best = k;
    }
    if (best === null) return { rows: [], problems: [`${sourceName} holds no list of objects — name one with #key`] };
    return { rows: (o[best] as unknown[]).filter(isRow), problems: [], path: best };
  }
  const d = parseDataRows(content ?? "");
  const problems = d.problems.map((p) => `${sourceName}: ${p}`);
  if (d.compose) problems.push(`${sourceName} composes rows itself — only its raw lines were read`);
  return { rows: d.rows, problems };
}

/** A value as the text a cell shows — and the text search and sort read. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** A row's value at `path`: the key itself when the row carries it, else a dot path into nested
 *  objects (`best_offer.price_total_aud`); missing anywhere = undefined. */
export function valueAt(row: DataRow, path: string): unknown {
  if (path in row) return row[path];
  let at: unknown = row;
  for (const seg of path.split(".")) {
    if (!at || typeof at !== "object" || Array.isArray(at)) return undefined;
    at = (at as DataRow)[seg];
  }
  return at;
}

/** One lowercase line per row — every column's text — for the search to scan. */
export function searchIndex(rows: DataRow[], columns: string[]): string[] {
  return rows.map((r) => columns.map((c) => cellText(valueAt(r, c))).join("  ").toLowerCase());
}

/** The row indices whose text contains EVERY word of the query (case-insensitive); all rows for a blank query. */
export function matchingRows(index: string[], query: string): number[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = index.map((_, i) => i);
  if (!words.length) return all;
  return all.filter((i) => words.every((w) => index[i].includes(w)));
}

export type SortDir = "asc" | "desc";

const numberOf = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
};

/** Two cell values in `dir` order: numbers before text when both occur, text by locale
 *  (numeric-aware), empties LAST whatever the direction; 0 = no preference. */
export function compareValues(va: unknown, vb: unknown, dir: SortDir): number {
  const sign = dir === "asc" ? 1 : -1;
  const ta = cellText(va), tb = cellText(vb);
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  const na = numberOf(va), nb = numberOf(vb);
  let c: number;
  if (na !== null && nb !== null) c = na - nb;
  else if (na !== null) c = -1;
  else if (nb !== null) c = 1;
  else c = ta.localeCompare(tb, undefined, { numeric: true, sensitivity: "base" });
  return c * sign;
}

/** `indices` ordered by one column (a dot path reaches into nested objects), ties by original order. */
export function sortRows(rows: DataRow[], indices: number[], column: string, dir: SortDir): number[] {
  return [...indices].sort((a, b) => compareValues(valueAt(rows[a], column), valueAt(rows[b], column), dir) || a - b);
}

export interface Page<T> { slice: T[]; page: number; pages: number; from: number; to: number; total: number }

/** One page of `items` — `page` is clamped to what exists (a page past the end is the last one). */
export function pageOf<T>(items: T[], page: number, size: number): Page<T> {
  const total = items.length;
  const s = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(total / s));
  const p = Math.min(Math.max(1, Math.floor(page)), pages);
  const start = (p - 1) * s;
  const slice = items.slice(start, start + s);
  return { slice, page: p, pages, from: total ? start + 1 : 0, to: start + slice.length, total };
}
