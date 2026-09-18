/**
 * The `.tablediff` kind — TWO TABLES COMPARED, live. The document declares
 * the left (proposed) and right (base) table handles, which columns form the
 * row KEY, and which columns' differences matter; the viewer recomputes the
 * diff on every open, so it can never go stale against its sources.
 *
 *   title: Timesheet vs shift notes
 *   left:  {handle: /Fatin/jason-timesheet-as-shift-notes.csv, label: Timesheet}
 *   right: {handle: /Fatin/jason-shift-notes-2026-08-27.csv, label: Shift notes}
 *   key: [Client, Service Date]
 *   compare: [Duration, Charge]       # omitted = all shared columns minus key
 *   ignore: [Staff, Staff Account]    # subtracted from the default compare set
 *
 * Verdicts per row: in left only = ADDED (green), in right only = DELETED
 * (red), key-matched with a differing compare column = CHANGED (amber cells,
 * old → new), otherwise UNCHANGED. Keys may repeat (three Sohail sessions on
 * one day): rows group by key and pair off in order; the surplus on either
 * side becomes added/deleted. Rows whose key cells are all empty (a totals
 * tail) are not rows.
 */
import yaml from "js-yaml";
import type { TableSheet } from "./tableData";

export interface TableDiffSide {
  handle: string;
  label?: string;
}

/** Bound BOTH tables to a window of one column before diffing — rows outside
 *  it are not part of the question (a later pay period, say). Date-shaped
 *  values compare as dates. */
export interface TableDiffRange {
  column: string;
  since?: string;
  until?: string;
}

export interface TableDiffDoc {
  title: string;
  description?: string;
  left: TableDiffSide | null;
  right: TableDiffSide | null;
  key: string[];
  compare?: string[];
  ignore: string[];
  range?: TableDiffRange;
  /** Columns allowed to match BY GROUP TOTAL: three 1-hour rows against one
   *  3-hour row is the same substance, sliced differently. A key group whose
   *  row counts disagree reconciles into one REGROUPED row when every `sum`
   *  column's totals are equal and every other compare column carries one
   *  consistent value across both sides. Totals unequal = a real difference,
   *  and the group falls back to ordinary pairing. */
  sum: string[];
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const strs = (x: unknown): string[] => arr(x).map(str).filter((s): s is string => !!s);

const side = (x: unknown): TableDiffSide | null => {
  const o = rec(x);
  const handle = str(o.handle) ?? str(x as string);
  return handle?.startsWith("/") ? { handle, ...(str(o.label) ? { label: str(o.label)! } : {}) } : null;
};

export function parseTableDiff(text: string): TableDiffDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  const rangeRaw = rec(raw.range);
  const rangeCol = str(rangeRaw.column);
  return {
    title: str(raw.title) ?? "Table diff",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    left: side(raw.left),
    right: side(raw.right),
    key: strs(raw.key),
    ...(Array.isArray(raw.compare) ? { compare: strs(raw.compare) } : {}),
    ignore: strs(raw.ignore),
    sum: strs(raw.sum),
    ...(rangeCol ? {
      range: {
        column: rangeCol,
        ...(str(rangeRaw.since) ? { since: str(rangeRaw.since)! } : {}),
        ...(str(rangeRaw.until) ? { until: str(rangeRaw.until)! } : {}),
      },
    } : {}),
  };
}

/* ── The diff ────────────────────────────────────────────────────────────── */

export type RowStatus = "added" | "deleted" | "changed" | "unchanged" | "regrouped";

export interface DiffCell {
  column: string;
  left?: string;
  right?: string;
  changed: boolean;
}

export interface DiffRow {
  status: RowStatus;
  /** The key values, in `key` order. */
  keyCells: string[];
  cells: DiffCell[];
}

export interface TableDiffResult {
  key: string[];
  columns: string[];
  rows: DiffRow[];
  counts: Record<RowStatus, number>;
  /** Set when the tables cannot be diffed as declared. */
  error?: string;
}

interface Rec { key: string[]; values: Record<string, string> }

/** Date-shaped key values normalize to dd/mm/yyyy before joining — one side
 *  writing "4/08/2026" and the other "04/08/2026" is the same session, and
 *  a join that says otherwise is a bug, not a finding. */
const normalizeKey = (v: string): string => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}` : v;
};

function records(
  sheet: TableSheet, key: string[], wanted: string[], range?: TableDiffRange,
): Rec[] | string {
  const header = (sheet.rows[0] ?? []).map((h) => h.trim());
  const at = new Map(header.map((h, i) => [h, i]));
  for (const k of key) if (!at.has(k)) return `key column "${k}" is missing`;
  if (range && !at.has(range.column)) return `range column "${range.column}" is missing`;
  const since = range?.since ? sortable(normalizeKey(range.since)) : null;
  const until = range?.until ? sortable(normalizeKey(range.until)) : null;
  const out: Rec[] = [];
  for (const row of sheet.rows.slice(1)) {
    const kv = key.map((k) => normalizeKey((row[at.get(k)!] ?? "").trim()));
    if (kv.every((v) => v === "")) continue; // a totals tail, not a row
    if (range) {
      const v = sortable(normalizeKey((row[at.get(range.column)!] ?? "").trim()));
      if ((since && v < since) || (until && v > until)) continue; // outside the window
    }
    const values: Record<string, string> = {};
    for (const c of wanted) values[c] = (row[at.get(c) ?? -1] ?? "").trim();
    out.push({ key: kv, values });
  }
  return out;
}

/** dd/mm/yyyy sorts as a date; anything else as text. */
const sortable = (v: string): string => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : v;
};

export function diffTables(
  left: TableSheet, right: TableSheet,
  doc: Pick<TableDiffDoc, "key" | "compare" | "ignore" | "range"> & { sum?: string[] },
): TableDiffResult {
  const empty = { added: 0, deleted: 0, changed: 0, unchanged: 0, regrouped: 0 };
  if (!doc.key.length) return { key: [], columns: [], rows: [], counts: { ...empty }, error: "declare at least one key column" };

  const lHead = (left.rows[0] ?? []).map((h) => h.trim());
  const rHead = (right.rows[0] ?? []).map((h) => h.trim());
  const shared = lHead.filter((h) => h && rHead.includes(h));
  const compare = (doc.compare ?? shared.filter((h) => !doc.key.includes(h)))
    .filter((c) => !doc.ignore.includes(c));

  const l = records(left, doc.key, compare, doc.range);
  if (typeof l === "string") return { key: doc.key, columns: compare, rows: [], counts: { ...empty }, error: `left: ${l}` };
  const r = records(right, doc.key, compare, doc.range);
  if (typeof r === "string") return { key: doc.key, columns: compare, rows: [], counts: { ...empty }, error: `right: ${r}` };

  const groups = new Map<string, { key: string[]; l: Rec[]; r: Rec[] }>();
  const of = (kv: string[]) => {
    const id = JSON.stringify(kv);
    let g = groups.get(id);
    if (!g) { g = { key: kv, l: [], r: [] }; groups.set(id, g); }
    return g;
  };
  for (const rec_ of l) of(rec_.key).l.push(rec_);
  for (const rec_ of r) of(rec_.key).r.push(rec_);

  const sumCols = (doc.sum ?? []).filter((c) => compare.includes(c));

  /** One REGROUPED row when the group's substance matches despite its
   *  slicing, else null and ordinary pairing decides. */
  const reconcile = (g: { key: string[]; l: Rec[]; r: Rec[] }): DiffRow | null => {
    if (!sumCols.length || !g.l.length || !g.r.length) return null;
    const cells: DiffCell[] = [];
    for (const column of compare) {
      const lv = g.l.map((x) => x.values[column]);
      const rv = g.r.map((x) => x.values[column]);
      if (sumCols.includes(column)) {
        const nums = [...lv, ...rv].map(Number);
        if (nums.some(Number.isNaN)) return null;
        const ls = lv.reduce((a, v) => a + Number(v), 0);
        const rs = rv.reduce((a, v) => a + Number(v), 0);
        if (Math.abs(ls - rs) > 1e-9) return null; // a real difference
        cells.push({ column, left: lv.join("+"), right: rv.join("+"), changed: false });
      } else {
        const all = new Set([...lv, ...rv]);
        if (all.size > 1) return null; // inconsistent unit values — not the same thing
        cells.push({ column, left: lv[0], right: rv[0], changed: false });
      }
    }
    return { status: "regrouped", keyCells: g.key, cells };
  };

  const rows: DiffRow[] = [];
  const counts = { ...empty };
  for (const g of groups.values()) {
    // Slicing differences reconcile before pairing gets to complain.
    if (g.l.length !== g.r.length) {
      const merged = reconcile(g);
      if (merged) { counts.regrouped++; rows.push(merged); continue; }
    }
    const paired = Math.min(g.l.length, g.r.length);
    for (let i = 0; i < paired; i++) {
      const cells: DiffCell[] = compare.map((column) => {
        const lv = g.l[i].values[column];
        const rv = g.r[i].values[column];
        return { column, left: lv, right: rv, changed: lv !== rv };
      });
      const status: RowStatus = cells.some((c) => c.changed) ? "changed" : "unchanged";
      counts[status]++;
      rows.push({ status, keyCells: g.key, cells });
    }
    for (const rec_ of g.l.slice(paired)) {
      counts.added++;
      rows.push({ status: "added", keyCells: g.key, cells: compare.map((column) => ({ column, left: rec_.values[column], changed: false })) });
    }
    for (const rec_ of g.r.slice(paired)) {
      counts.deleted++;
      rows.push({ status: "deleted", keyCells: g.key, cells: compare.map((column) => ({ column, right: rec_.values[column], changed: false })) });
    }
  }

  rows.sort((a, b) => {
    for (let i = 0; i < doc.key.length; i++) {
      const cmp = sortable(a.keyCells[i]).localeCompare(sortable(b.keyCells[i]));
      if (cmp) return cmp;
    }
    return 0;
  });

  return { key: doc.key, columns: compare, rows, counts };
}

/* ── Column money/hour totals ────────────────────────────────────────────── */

export interface ColumnTotals {
  column: string;
  left: number;
  right: number;
}

/** Per-side sums of every fully-numeric compare column — the "what's the
 *  difference in hours and dollars" answer, computed from the same rows the
 *  grid shows. A regrouped cell's "1+1+1" spelling sums its parts. */
export function columnTotals(result: TableDiffResult): ColumnTotals[] {
  const parts = (v: string | undefined): number[] =>
    (v ?? "").split("+").map((s) => s.trim()).filter(Boolean).map(Number);
  const out: ColumnTotals[] = [];
  for (const column of result.columns) {
    let left = 0;
    let right = 0;
    let numeric = false;
    let bad = false;
    for (const row of result.rows) {
      const c = row.cells.find((x) => x.column === column);
      if (!c) continue;
      for (const [side, v] of [["left", c.left], ["right", c.right]] as const) {
        if (v === undefined || v === "") continue;
        const ns = parts(v);
        if (ns.some(Number.isNaN)) { bad = true; break; }
        numeric = true;
        if (side === "left") left += ns.reduce((a, b) => a + b, 0);
        else right += ns.reduce((a, b) => a + b, 0);
      }
      if (bad) break;
    }
    if (numeric && !bad) out.push({ column, left, right });
  }
  return out;
}

/* ── Shareable snapshot ──────────────────────────────────────────────────── */

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The diff as ONE self-contained HTML file — colors inlined, no scripts, no
 * dependencies — for sharing outside the suite. A dated SNAPSHOT of what the
 * live lens showed, never a replacement for it.
 */
export function diffToHtml(
  doc: TableDiffDoc, result: TableDiffResult, generatedOn: string,
): string {
  const L = doc.left?.label ?? "left";
  const R = doc.right?.label ?? "right";
  const totals = columnTotals(result);
  const TINT: Record<RowStatus, string> = {
    added: "#ecfdf5", deleted: "#fef2f2", changed: "#ffffff", unchanged: "#ffffff", regrouped: "#f0f9ff",
  };
  const MARK: Record<RowStatus, string> = { added: "+", deleted: "−", changed: "~", unchanged: "=", regrouped: "≈" };
  const cell = (r: DiffRow, c: DiffCell): string => {
    if (c.changed) return `<td style="border:1px solid #ddd;padding:3px 8px;background:#fef3c7;font-weight:600">${esc(c.right || "—")} → ${esc(c.left || "—")}</td>`;
    if (r.status === "regrouped" && c.left !== c.right) return `<td style="border:1px solid #ddd;padding:3px 8px;color:#0369a1;font-weight:600">${esc(c.left ?? "")} ↔ ${esc(c.right ?? "")}</td>`;
    return `<td style="border:1px solid #ddd;padding:3px 8px">${esc(c.left ?? c.right ?? "")}</td>`;
  };
  const rows = result.rows.map((r) => `
    <tr style="background:${TINT[r.status]}">
      <td style="border:1px solid #ddd;padding:3px 6px;text-align:center;font-weight:700">${MARK[r.status]}</td>
      ${r.keyCells.map((v) => `<td style="border:1px solid #ddd;padding:3px 8px">${esc(v)}</td>`).join("")}
      ${r.cells.map((c) => cell(r, c)).join("")}
    </tr>`).join("");
  const totalsLine = totals.map((t) =>
    `${esc(t.column)}: ${esc(L)} ${t.left % 1 ? t.left.toFixed(1) : t.left} · ${esc(R)} ${t.right % 1 ? t.right.toFixed(1) : t.right} · Δ ${(t.left - t.right) % 1 ? (t.left - t.right).toFixed(1) : t.left - t.right}`).join(" &nbsp;|&nbsp; ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(doc.title)}</title></head>
<body style="font-family:ui-sans-serif,system-ui,sans-serif;margin:24px;color:#1e2622">
<h1 style="font-size:20px;margin:0 0 4px">${esc(doc.title)}</h1>
${doc.description ? `<p style="font-size:13px;color:#555;max-width:70ch;margin:0 0 8px">${esc(doc.description)}</p>` : ""}
<p style="font-size:12px;color:#555;margin:0 0 4px">
  <b style="color:#065f46">+ ${result.counts.added} only in ${esc(L)}</b> ·
  <b style="color:#991b1b">− ${result.counts.deleted} only in ${esc(R)}</b> ·
  <b style="color:#92400e">~ ${result.counts.changed} changed</b> ·
  <b style="color:#0369a1">≈ ${result.counts.regrouped} regrouped</b> ·
  = ${result.counts.unchanged} matching — changed cells read “${esc(R)} → ${esc(L)}”
</p>
${totalsLine ? `<p style="font-size:12px;color:#333;margin:0 0 12px"><b>Totals</b> — ${totalsLine}</p>` : ""}
<table style="border-collapse:collapse;font-family:ui-monospace,Consolas,monospace;font-size:12px">
<thead><tr><th style="border:1px solid #ddd;padding:3px 6px;background:#f4f5f4"></th>
${result.key.map((k) => `<th style="border:1px solid #ddd;padding:3px 8px;background:#f4f5f4;text-align:left">${esc(k)}</th>`).join("")}
${result.columns.map((c) => `<th style="border:1px solid #ddd;padding:3px 8px;background:#f4f5f4;text-align:left">${esc(c)}</th>`).join("")}
</tr></thead><tbody>${rows}</tbody></table>
<p style="font-size:11px;color:#777;margin-top:12px">Snapshot generated ${esc(generatedOn)} from the live lens — the sources may have moved since.</p>
</body></html>`;
}
