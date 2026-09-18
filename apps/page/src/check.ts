/**
 * `check(kind, text)` — the one validation every surface calls: the page (in
 * the browser), the endpoint (`POST /api/check`), and any tool that imports it.
 *
 * Two stages, in order: YAML first (a parse error is the only problem reported,
 * with its line), then the kind's own logic — the engine's problem lists.
 * Nothing is read from disk and nothing is kept: a file a playbook names is
 * listed under `notes`, never resolved. Content written in the book IS checked,
 * each document through its own kind's entry in this same table.
 */
import yaml from "js-yaml";
import { parseBrief } from "filekinds/src/lib/briefDoc.ts";
import type { FeatureNode } from "filekinds/src/lib/featureTree.ts";
import {
  PLAYBOOK_LATEST, byEntries, contentEntries, docText, inlineEntries, inlineProblems, legacyProblems,
  parsePlaybook, variationProblems, variationsOf, versionProblems, writtenDocs,
} from "filekinds/src/lib/playbookDoc.ts";

export interface Problem {
  message: string;
  /** 1-based, when the problem has a place in the text (a YAML error). */
  line?: number;
  column?: number;
}

export interface CheckResult {
  ok: boolean;
  /** The kind the text was checked as, canonical (`playbook`, not `.Playbook`). */
  kind: string;
  /** The version the document was read as, for a versioned kind. */
  version?: number;
  summary?: string;
  problems: Problem[];
  /** What this check could not do — a file entry it has no folder for. */
  notes: string[];
}

export interface KindDef {
  label: string;
  extension: string;
  /** The newest version this engine reads and writes, for a versioned kind. */
  latest?: number;
  check: (text: string) => CheckResult;
}

function yamlProblem(text: string): Problem | null {
  try { yaml.load(text); return null; }
  catch (e) {
    const err = e as { message?: string; reason?: string; mark?: { line?: number; column?: number } };
    const line = typeof err.mark?.line === "number" ? err.mark.line + 1 : undefined;
    const column = typeof err.mark?.column === "number" ? err.mark.column + 1 : undefined;
    return { message: `YAML: ${err.reason ?? (err.message ?? String(e)).split("\n")[0]}`, line, column };
  }
}

const result = (kind: string, problems: Problem[], extra: Partial<CheckResult> = {}): CheckResult =>
  ({ ok: problems.length === 0, kind, problems, notes: [], ...extra });

const asProblems = (messages: string[]): Problem[] => messages.map((message) => ({ message }));

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const KINDS: Record<string, KindDef> = {
  playbook: {
    label: "Playbook", extension: "playbook", latest: PLAYBOOK_LATEST,
    check: (text) => {
      const y = yamlProblem(text);
      if (y) return result("playbook", [y]);
      const doc = parsePlaybook(text);
      const problems = asProblems([
        ...versionProblems(text), ...legacyProblems(text), ...variationProblems(doc), ...inlineProblems(doc),
      ]);
      const notes: string[] = [];

      // Files beside the book: this check has no folder, so it names them rather than reading them.
      const files = contentEntries(doc).filter((x) => x.entry.file);
      if (files.length) {
        const expected = files.flatMap(({ entry }) => variationsOf(doc, entry));
        notes.push(`${plural(files.length, "file entry", "file entries")} not checked — this check has no folder: ${expected.join(", ")}`);
      }

      // Content written in the book: each document through its own kind's check.
      let inline = 0;
      for (const { where, entry } of inlineEntries(doc)) {
        if (!entry.kind) continue;
        inline++;
        const name = `${where}: ${entry.label ?? entry.key ?? "inline content"} (${entry.kind})`;
        const kind = KINDS[entry.kind];
        if (!kind) {
          problems.push({ message: `${name}: not a kind this check knows — one of ${Object.keys(KINDS).join(", ")}` });
          continue;
        }
        for (const { at, doc: d } of writtenDocs(entry)) {
          const r = kind.check(docText(d));
          const tag = at ? ` [${at}]` : "";
          for (const p of r.problems) problems.push({ message: `${name}${tag}: ${p.message}` });
          for (const n of r.notes) notes.push(`${name}${tag}: ${n}`);
        }
      }

      const varies = byEntries(doc).some((x) => x.entry.file);
      const summary = `v${doc.version} · ${doc.decisions.length} decisions, ${doc.events.length} events${doc.version < 2 ? `, ${doc.topics.length} topics` : ""}`
        + (varies ? ", files vary by answers" : "") + (inline ? `, ${inline} documents` : "");
      return result("playbook", problems, { version: doc.version, summary, notes });
    },
  },
  brief: {
    label: "Brief", extension: "brief",
    check: (text) => {
      const y = yamlProblem(text);
      if (y) return result("brief", [y]);
      const doc = parseBrief(text);
      const count = (nodes: FeatureNode[]): number => nodes.reduce((n, s) => n + 1 + count(s.children ?? []), 0);
      return result("brief", [], { summary: plural(count(doc.sections), "section") });
    },
  },
  md: {
    label: "Markdown", extension: "md",
    check: (text) => result("md", [], { summary: `${plural(text.split("\n").length, "line")} — nothing to validate` }),
  },
};

/** The kind a name picks: `playbook`, `.playbook` or `Playbook` all do. */
export const kindOf = (name: string): KindDef | undefined => KINDS[name.replace(/^\./, "").toLowerCase()];

/** The kind a file name picks, by its extension. */
export function kindForFile(fileName: string): string | undefined {
  const i = fileName.lastIndexOf(".");
  const ext = i < 0 ? "" : fileName.slice(i + 1).toLowerCase();
  return ext in KINDS ? ext : undefined;
}

export function check(kind: string, text: string): CheckResult {
  const def = kindOf(kind);
  if (!def) {
    return { ok: false, kind, problems: [{ message: `not a kind this check knows — one of ${Object.keys(KINDS).join(", ")}` }], notes: [] };
  }
  return def.check(text);
}
