/**
 * Reading the rows a source ref names — the one resolver the `.jsonl` view,
 * the `.middleware` view and the checker share. A ref is a data file (a
 * .json with `#key`, a .jsonl, a .csv → dataRows.ts `rowsOfSource`), a
 * `.middleware`, which names its own source in turn: the chain is followed
 * (a middleware over a middleware over the raw file), each step's rules
 * applied on the way back, cycles refused — or a `.pipeline`, whose items
 * are its own: the ref gives its output, `#<stage>` the rows as of that
 * stage, `#<view>` a view's rows and columns, nothing taken. The host
 * supplies the reader — the kit's file adapter in a view, the disk in the
 * checker — and gets back the rows, every file read (to watch for changes),
 * the chain in words, and how many rows the rules amended.
 */
import { resolveRef } from "crosscut";
import { applyMiddleware, parseMiddleware } from "./middlewareDoc";
import { parsePipeline, rowsAt, runPipeline } from "./pipelineDoc";
import { rowsOfSource, type DataRow, type SourceRef } from "./dataRows";

export type SourceReader = (absPath: string) => Promise<string>;

export interface ResolvedRows {
  rows: DataRow[];
  problems: string[];
  /** Every file read, absolute — the chain from the ref down to the raw data. */
  files: string[];
  /** The chain in words: ["corrections.middleware", "accommodation.json#properties"]. */
  chain: string[];
  /** Rows a middleware in the chain touched. */
  amended: number;
  /** The columns the source shows, when it says — a pipeline's view. */
  columns?: string[];
}

const MAX_DEPTH = 8;

/** The rows behind `ref`, relative to `base` (the file naming it). */
export async function readSourceRows(ref: SourceRef, base: string, read: SourceReader, seen: string[] = []): Promise<ResolvedRows> {
  const abs = resolveRef(base, ref.file);
  const label = `${ref.file}${ref.path ? `#${ref.path}` : ""}`;
  if (seen.includes(abs)) return { rows: [], problems: [`${ref.file}: a cycle — it is already being read (${seen.map((s) => s.slice(s.lastIndexOf("/") + 1)).join(" → ")})`], files: [], chain: [label], amended: 0 };
  if (seen.length >= MAX_DEPTH) return { rows: [], problems: [`${ref.file}: the chain is deeper than ${MAX_DEPTH}`], files: [], chain: [label], amended: 0 };
  let content: string;
  try { content = await read(abs); } catch { return { rows: [], problems: [`could not read ${ref.file}`], files: [], chain: [label], amended: 0 }; }

  const ext = ref.file.slice(ref.file.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "pipeline") {
    const doc = parsePipeline(content);
    const run = runPipeline(doc);
    const at = rowsAt(run, ref.path);
    return {
      rows: at.rows,
      problems: [...run.problems, ...at.problems].map((p) => `${ref.file}: ${p}`),
      files: [abs], chain: [label],
      amended: run.stages.reduce((n, s) => n + s.amended, 0),
      ...(at.columns ? { columns: at.columns } : {}),
    };
  }
  if (ext !== "middleware") {
    const got = rowsOfSource(content, ref.file, ref.path);
    return { rows: got.rows, problems: got.problems, files: [abs], chain: [`${ref.file}${ref.path ? `#${ref.path}` : got.path ? `#${got.path}` : ""}`], amended: 0 };
  }
  const doc = parseMiddleware(content);
  const own = doc.problems.map((p) => `${ref.file}: ${p}`);
  if (!doc.source) return { rows: [], problems: [...own, `${ref.file}: no source`], files: [abs], chain: [label], amended: 0 };
  const inner = await readSourceRows(doc.source, abs, read, [...seen, abs]);
  const r = applyMiddleware({ ...doc, problems: [] }, inner.rows);
  return {
    rows: r.rows,
    problems: [...inner.problems, ...own, ...r.problems.map((p) => `${ref.file}: ${p}`)],
    files: [abs, ...inner.files],
    chain: [ref.file, ...inner.chain],
    amended: inner.amended + r.amended,
  };
}

/** The chain and its size in one phrase: "corrections.middleware → accommodation.json#properties (483 rows, 1 amended)". */
export function chainText(r: ResolvedRows): string {
  return `${r.chain.join(" → ")} (${r.rows.length.toLocaleString()} rows${r.amended ? `, ${r.amended.toLocaleString()} amended` : ""})`;
}
