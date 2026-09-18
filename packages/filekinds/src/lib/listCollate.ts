/**
 * Reading a `.list` WITH ITS SOURCES — the live union behind a collated
 * list. Kept apart from listDoc (which is pure) because this reads files.
 */
import { resolveRef } from "crosscut";
import { readVirtualDirectoryFile } from "../api";
import { parseDocList, type DocListDoc, type DocListItem } from "./listDoc";

/** A collated list's rows: its own items plus every sourced list's, each
 *  tagged with the source's name. Optionally collapsed on `dedupeBy` — the
 *  survivor keeps the FIRST source in `source` (so the value set stays
 *  small enough to filter by) and accrues the rest in `also_on`.
 *  One hop only: a sourced list's own sources are not followed. */
export async function collateList(doc: DocListDoc, base: string): Promise<DocListItem[]> {
  const merged: DocListItem[] = [...doc.items];
  for (const src of doc.sources) {
    const abs = resolveRef(base, src.list);
    const name = src.label ?? abs.slice(abs.lastIndexOf("/") + 1).replace(/\.list$/, "");
    try {
      const sub = parseDocList((await readVirtualDirectoryFile(abs, abs)).content);
      for (const it of sub.items) {
        merged.push({
          ...it,
          // A row's own file ref must still resolve — against ITS list.
          ...(it.file ? { file: resolveRef(abs, it.file) } : {}),
          fields: { ...(it.fields ?? {}), source: it.fields?.source ?? name },
        });
      }
    } catch { /* an unreadable source never blocks the collation */ }
  }
  if (!doc.dedupeBy) return merged;
  const keyOf = (it: DocListItem) =>
    doc.dedupeBy === "label" ? (it.label ?? "") : (it.fields?.[doc.dedupeBy!] ?? "");
  const out: DocListItem[] = [];
  const seen = new Map<string, number>();
  for (const it of merged) {
    const k = keyOf(it).trim().toLowerCase();
    if (!k) { out.push(it); continue; }
    const at = seen.get(k);
    if (at === undefined) { seen.set(k, out.length); out.push(it); continue; }
    const prev = out[at];
    const also = new Set([
      ...(prev.fields?.also_on ?? "").split(", ").filter(Boolean),
      ...(it.fields?.source ? [it.fields.source] : []),
    ].filter((s) => s && s !== prev.fields?.source));
    out[at] = also.size
      ? { ...prev, fields: { ...(prev.fields ?? {}), also_on: [...also].join(", ") } }
      : prev;
  }
  return out;
}

/** Read a list file and return its rows, collated when it has sources. */
export async function readListRows(absPath: string): Promise<{ doc: DocListDoc; rows: DocListItem[] }> {
  const doc = parseDocList((await readVirtualDirectoryFile(absPath, absPath)).content);
  return { doc, rows: doc.sources.length ? await collateList(doc, absPath) : doc.items };
}
