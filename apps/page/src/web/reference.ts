/**
 * What the page knows about a kind beyond checking it: its BOOK and its SPEC,
 * both bundled at build time so the page stays a page — no fetch, no server.
 *
 *   book(ext)  the kind's playbook at its latest version, kinds/<ext>/v<N>.playbook —
 *              the same file `studio-check --book <ext>` prints the path of
 *   spec(ext)  the engine's own account — the leading comment of the engine
 *              file(s) plus the fresh document — the same text `studio-check --spec <ext>` prints
 */
import { fileTemplate, TEMPLATE_KINDS } from "filekinds";

const BOOKS = import.meta.glob("../../../../kinds/*/v*.playbook", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const ENGINES = import.meta.glob("../../../../packages/filekinds/src/lib/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** Which engine files hold a kind's account — the checker's own table, for the kinds the page offers. */
const SPEC_FILES: Record<string, { label: string; files: string[] }> = {
  brief: { label: "Brief", files: ["briefDoc.ts"] },
  playbook: { label: "Playbook", files: ["playbookDoc.ts"] },
  kanban: { label: "Kanban", files: ["kanbanDoc.ts"] },
  calendar: { label: "Calendar", files: ["calendarDoc.ts"] },
  policy: { label: "Policy", files: ["policyDoc.ts", "policyChain.ts", "tablePolicy.ts"] },
  flow: { label: "Flow", files: ["flowOps.ts"] },
  jsonl: { label: "Data", files: ["dataRows.ts", "tablePolicy.ts"] },
  middleware: { label: "Middleware", files: ["middlewareDoc.ts", "dataSources.ts"] },
  collection: { label: "Collection", files: ["collectionDoc.ts"] },
  clip: { label: "Clip", files: ["clipDoc.ts", "midiFile.ts"] },
  song: { label: "Song", files: ["songDoc.ts", "clipDoc.ts", "midiFile.ts"] },
  md: { label: "Markdown", files: [] },
  guide: { label: "Guide", files: ["guideDoc.ts"] },
};

/** The kind's book at its latest version, with the version it is: `kinds/<ext>/v<N>.playbook`. */
export function book(ext: string): { version: number; text: string; path: string } | null {
  let best: { version: number; text: string; path: string } | null = null;
  for (const [p, text] of Object.entries(BOOKS)) {
    const m = p.match(/\/kinds\/([^/]+)\/v(\d+)\.playbook$/);
    if (!m || m[1] !== ext) continue;
    const version = Number(m[2]);
    if (!best || version > best.version) best = { version, text, path: `kinds/${ext}/v${version}.playbook` };
  }
  return best;
}

/** The leading comment of an engine file — its specification, as the kit keeps it. */
function headerOf(file: string): string {
  const src = Object.entries(ENGINES).find(([p]) => p.endsWith(`/lib/${file}`))?.[1] ?? "";
  if (src.startsWith("/**")) {
    const end = src.indexOf("*/");
    return src.slice(3, end).split("\n").map((l) => l.replace(/^\s*\*\s?/, "")).join("\n").trim();
  }
  const lines: string[] = [];
  for (const l of src.split("\n")) { if (l.startsWith("//")) lines.push(l.replace(/^\/\/\s?/, "")); else if (lines.length) break; }
  return lines.join("\n").trim();
}

/** The kind's specification as markdown — what `studio-check --spec <ext>` prints. */
export function spec(ext: string): string {
  const k = SPEC_FILES[ext];
  if (!k) return `No spec for .${ext}.`;
  const parts = [`# .${ext} — ${k.label}`, ""];
  k.files.forEach((file, i) => {
    parts.push(i === 0 ? `## The engine's own account (packages/filekinds/src/lib/${file})` : `## Also: packages/filekinds/src/lib/${file}`, "", headerOf(file), "");
  });
  if (TEMPLATE_KINDS.some((t) => t.ext === ext)) parts.push("## A fresh document (what the Studio creates)", "", "```yaml", fileTemplate(`untitled.${ext}`).trimEnd(), "```", "");
  return parts.join("\n");
}
