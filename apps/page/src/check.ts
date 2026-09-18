/**
 * `check(kind, text)` — the one validation every surface calls: the page (in
 * the browser), the endpoint (`POST /api/check`), and any tool that imports it.
 *
 * Two stages, in order: YAML first (a parse error is the only problem reported,
 * with its line), then the kind's own logic — the engine's problem lists.
 * Nothing is read from disk and nothing is kept: a file a document names —
 * a playbook's file entry, a data view's sources, a song's clips — is listed
 * under `notes`, never resolved. Content written in a playbook IS checked,
 * each document through its own kind's entry in this same table.
 *
 * The kinds offered are the ones "Which kind for what" names; `guide` is
 * checked because a playbook may carry one written in, but is not offered.
 */
import yaml from "js-yaml";
import { parseBrief } from "filekinds/src/lib/briefDoc.ts";
import { parseCalendarLens } from "filekinds/src/lib/calendarDoc.ts";
import { clipSummary, parseClip } from "filekinds/src/lib/clipDoc.ts";
import { collectionSummary, parseCollection } from "filekinds/src/lib/collectionDoc.ts";
import { parseDataRows } from "filekinds/src/lib/dataRows.ts";
import type { FeatureNode } from "filekinds/src/lib/featureTree.ts";
import { parseFlowFile } from "filekinds/src/lib/flowEngine.ts";
import { validateFlowFile } from "filekinds/src/lib/flowOps.ts";
import { parseGuide } from "filekinds/src/lib/guideDoc.ts";
import { parseKanban } from "filekinds/src/lib/kanbanDoc.ts";
import { parseMiddleware } from "filekinds/src/lib/middlewareDoc.ts";
import {
  PLAYBOOK_LATEST, byEntries, contentEntries, docText, inlineEntries, inlineProblems, legacyProblems,
  parsePlaybook, variationProblems, variationsOf, versionProblems, writtenDocs,
} from "filekinds/src/lib/playbookDoc.ts";
import { parsePolicyKindFile } from "filekinds/src/lib/policyChain.ts";
import { parsePolicyFile } from "filekinds/src/lib/policyDoc.ts";
import { parseSong } from "filekinds/src/lib/songDoc.ts";

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
  /** What this check could not do — a file it has no folder for. */
  notes: string[];
}

export interface KindDef {
  label: string;
  extension: string;
  /** The newest version this engine reads and writes, for a versioned kind. */
  latest?: number;
  /** Offered in the page's menu; a kind only checked when written inside another is not. */
  offered: boolean;
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

/** YAML first, then the kind's parser: a throw is a problem, a return is a summary — the checker's own pattern. */
const via = <T>(kind: string, parse: (text: string) => T, summarize?: (doc: T) => string) => (text: string): CheckResult => {
  const y = yamlProblem(text);
  if (y) return result(kind, [y]);
  try {
    const doc = parse(text);
    return result(kind, [], summarize ? { summary: summarize(doc) } : {});
  } catch (e) {
    return result(kind, [{ message: `${kind}: ${e instanceof Error ? e.message : String(e)}` }]);
  }
};

export const KINDS: Record<string, KindDef> = {
  brief: {
    label: "Brief", extension: "brief", offered: true,
    check: (text) => {
      const y = yamlProblem(text);
      if (y) return result("brief", [y]);
      const doc = parseBrief(text);
      const count = (nodes: FeatureNode[]): number => nodes.reduce((n, s) => n + 1 + count(s.children ?? []), 0);
      return result("brief", [], { summary: plural(count(doc.sections), "section") });
    },
  },
  playbook: {
    label: "Playbook", extension: "playbook", latest: PLAYBOOK_LATEST, offered: true,
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
  kanban: { label: "Kanban", extension: "kanban", offered: true, check: via("kanban", parseKanban) },
  calendar: { label: "Calendar", extension: "calendar", offered: true, check: via("calendar", parseCalendarLens) },
  // A .policy plays a role: the bucket machine (the default), tags, order, run — or TABLE (rules over rows).
  policy: {
    label: "Policy", extension: "policy", offered: true,
    check: (text) => {
      const y = yamlProblem(text);
      if (y) return result("policy", [y]);
      let role: unknown;
      try { role = (yaml.load(text) as { role?: unknown } | null)?.role; } catch { /* checked above */ }
      if (role === "table") {
        const d = parsePolicyKindFile(text);
        if (d.role !== "table") return result("policy", [{ message: "not a table policy" }]);
        return result("policy", asProblems(d.problems), { summary: `table policy: ${d.where.length} filters, ${d.sort.length} sort keys${d.columns ? `, ${d.columns.length} columns` : ""}${d.limit ? `, first ${d.limit}` : ""}` });
      }
      return via("policy", parsePolicyFile)(text);
    },
  },
  flow: {
    label: "Flow", extension: "flow", offered: true,
    check: (text) => {
      const { body, error } = parseFlowFile(text);
      if (error) return result("flow", [{ message: `model YAML parse error: ${error}` }]);
      const frames = Object.keys(body.frames ?? {}).length;
      return result("flow", asProblems(validateFlowFile(text)), {
        summary: `${body.screens.length} screens, ${body.screens.reduce((n, s) => n + s.variants.length, 0)} states${frames ? `, ${frames} inline frames` : ""}`,
      });
    },
  },
  // Not YAML: one JSON object per line — the engine's own problems are the check. A composed view's sources are files.
  jsonl: {
    label: "Data", extension: "jsonl", offered: true,
    check: (text) => {
      const d = parseDataRows(text);
      const notes: string[] = [];
      if (d.compose) {
        const files = [...d.compose.sources.map((s) => s.file), ...(d.compose.policy ? [d.compose.policy] : [])];
        notes.push(`composed from files not checked — this check has no folder: ${files.join(", ")}`);
      }
      return result("jsonl", asProblems(d.problems), { summary: `${d.rows.length} rows × ${d.columns.length} columns${d.compose ? ` + ${plural(d.compose.sources.length, "source")}` : ""}`, notes });
    },
  },
  // A middleware names its source itself; the rules are checked against the rows only where the source can be read.
  middleware: {
    label: "Middleware", extension: "middleware", offered: true,
    check: (text) => {
      const y = yamlProblem(text);
      if (y) return result("middleware", [y]);
      const d = parseMiddleware(text);
      const problems = asProblems(d.problems);
      if (!d.source) return result("middleware", [...problems, { message: "no source" }], { summary: `${d.rules.length} rules, no source` });
      return result("middleware", problems, { summary: `${d.rules.length} rules over ${d.source.file}`, notes: [`source not read — this check has no folder: ${d.source.file}`] });
    },
  },
  collection: {
    label: "Collection", extension: "collection", offered: true,
    check: (text) => {
      const y = yamlProblem(text);
      if (y) return result("collection", [y]);
      const d = parseCollection(text);
      const s = collectionSummary(d);
      return result("collection", asProblems(d.problems), { summary: `${d.items.length} items · ${s.shown} shown, ${s.up} up, ${s.down} down, ${s.hidden} hidden · ${d.decisions.length} decisions` });
    },
  },
  clip: {
    label: "Clip", extension: "clip", offered: true,
    check: (text) => {
      const y = yamlProblem(text);
      if (y) return result("clip", [y]);
      const d = parseClip(text);
      return result("clip", asProblems(d.problems), { summary: `${clipSummary(d)} · channel ${d.channel}` });
    },
  },
  // A song places clip FILES on tracks; here the arrangement is checked and the clips are named.
  song: {
    label: "Song", extension: "song", offered: true,
    check: (text) => {
      const y = yamlProblem(text);
      if (y) return result("song", [y]);
      const d = parseSong(text);
      const clips = [...new Set(d.tracks.flatMap((t) => t.clips.map((c) => c.file)))];
      return result("song", asProblems(d.problems), {
        summary: `${plural(d.tracks.length, "track")}, ${plural(clips.length, "clip")}`,
        notes: clips.length ? [`clips not read — this check has no folder: ${clips.join(", ")}`] : [],
      });
    },
  },
  md: {
    label: "Markdown", extension: "md", offered: true,
    check: (text) => result("md", [], { summary: `${plural(text.split("\n").length, "line")} — nothing to validate` }),
  },
  guide: {
    label: "Guide", extension: "guide", offered: false,
    check: (text) => {
      const y = yamlProblem(text);
      if (y) return result("guide", [y]);
      const doc = parseGuide(text);
      return result("guide", [], { summary: `${plural(doc.steps.length, "step")}${doc.decisions.length ? `, ${plural(doc.decisions.length, "decision")}` : ""}` });
    },
  },
};

/** The kinds the page offers — the ones "Which kind for what" names. */
export const OFFERED: Record<string, KindDef> = Object.fromEntries(Object.entries(KINDS).filter(([, d]) => d.offered));

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
