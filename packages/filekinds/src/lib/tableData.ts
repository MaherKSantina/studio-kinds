/**
 * Tabular file kinds — `.csv`/`.tsv` (text) and `.xlsx` (binary workbook) —
 * share one in-memory shape: SHEETS of string cell rows. The viewer renders
 * that shape; this module owns the text half (a real CSV parser: quoted
 * fields, embedded commas/newlines, doubled quotes). The workbook half is
 * decoded in the viewer from raw bytes via SheetJS, into the same shape.
 */

export interface TableSheet {
  name: string;
  /** Cell grid as strings, row-major. Ragged rows stay ragged. */
  rows: string[][];
}

export interface TableData {
  sheets: TableSheet[];
}

/** RFC-4180-flavoured parse. Delimiter is auto-picked per file: a tab in the
 *  first line means TSV, else comma. Never throws; empty text = no rows. */
export function parseCsv(text: string, name = "Sheet 1"): TableData {
  const rows: string[][] = [];
  if (text.trim()) {
    const delim = text.slice(0, text.indexOf("\n") + 1 || text.length).includes("\t") ? "\t" : ",";
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else quoted = false;
        } else cell += ch;
      } else if (ch === '"' && cell === "") {
        quoted = true;
      } else if (ch === delim) {
        row.push(cell); cell = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        rows.push(row); row = [];
      } else {
        cell += ch;
      }
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    // A trailing newline leaves one phantom empty row — drop fully empty tails.
    while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  }
  return { sheets: [{ name, rows }] };
}

/** Widest row — the column count the grid renders with. */
export const columnCountOf = (sheet: TableSheet): number =>
  sheet.rows.reduce((n, r) => Math.max(n, r.length), 0);

/** A1-style column letters for the header rail: A…Z, AA…AZ, … */
export function columnLabel(i: number): string {
  let n = i;
  let out = "";
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return out;
}
