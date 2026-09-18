/**
 * studio-check — the Studio's file kinds from the command line, for people and
 * for agents editing documents as TEXT (Claude Code in VS Code, a script):
 *
 *   studio-check <file|folder|glob ...>   parse each document with its kind's own engine; print problems
 *   studio-check --spec <ext>             the kind's specification — the engine's header comment,
 *                                         plus the legend or template that every saved file carries
 *   studio-check --template <ext>         a fresh document of that kind, as the Studio would create it
 *   studio-check --kinds                  every kind the Studio knows, with where its spec lives
 *   studio-check --json <file ...>        machine-readable results
 *   studio-check --collect <file.jsonl> [name.collection]
 *                                         copy the rows a .jsonl view shows into a .collection beside it
 *   studio-check --midi <file.clip|file.song> [name.mid]
 *                                         write the document's notes as a Standard MIDI File beside it
 *
 * Exit status 1 when any checked document has problems. The engines are the
 * kit's own (packages/filekinds/src/lib), so what passes here renders in the
 * Studio, the desktop app and the VS Code extension.
 */
import { existsSync, globSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { load as loadYaml } from "js-yaml";
import { parseFlowFile } from "../../../packages/filekinds/src/lib/flowEngine";
import { validateFlowFile } from "../../../packages/filekinds/src/lib/flowOps";
import { FRAME_LEGEND, frameProblems, parseFrame } from "../../../packages/filekinds/src/lib/frameDoc";
import { byEntries, docText, inlineEntries, inlineProblems, legacyProblems, parsePlaybook, variationProblems, variationsOf, versionProblems, writtenDocs } from "../../../packages/filekinds/src/lib/playbookDoc";
import { parsePlan } from "../../../packages/filekinds/src/lib/planDoc";
import { parseGuide } from "../../../packages/filekinds/src/lib/guideDoc";
import { parseBrief } from "../../../packages/filekinds/src/lib/briefDoc";
import { parseDocList } from "../../../packages/filekinds/src/lib/listDoc";
import { parseKanban } from "../../../packages/filekinds/src/lib/kanbanDoc";
import { parsePoints } from "../../../packages/filekinds/src/lib/pointsDoc";
import { parsePolicyFile } from "../../../packages/filekinds/src/lib/policyDoc";
import { parseDefinitionFile } from "../../../packages/filekinds/src/lib/definitionDoc";
import { parseMemory } from "../../../packages/filekinds/src/lib/memoryDoc";
import { parseProject } from "../../../packages/filekinds/src/lib/projectDoc";
import { parseSchemaDoc } from "../../../packages/filekinds/src/lib/schemaDoc";
import { parseWorkup } from "../../../packages/filekinds/src/lib/workupDoc";
import { parseCalendarLens } from "../../../packages/filekinds/src/lib/calendarDoc";
import { parseProgram } from "../../../packages/filekinds/src/lib/programDoc";
import { parsePulse } from "../../../packages/filekinds/src/lib/pulseDoc";
import { parseMoves } from "../../../packages/filekinds/src/lib/movesDoc";
import { parseTableDiff } from "../../../packages/filekinds/src/lib/tableDiff";
import { parseDataRows } from "../../../packages/filekinds/src/lib/dataRows";
import { chainText, readSourceRows } from "../../../packages/filekinds/src/lib/dataSources";
import { applyMiddleware, parseMiddleware } from "../../../packages/filekinds/src/lib/middlewareDoc";
import { collectionFromRows, collectionSummary, dumpCollection, parseCollection } from "../../../packages/filekinds/src/lib/collectionDoc";
import { applyTablePolicy } from "../../../packages/filekinds/src/lib/tablePolicy";
import { parsePolicyKindFile } from "../../../packages/filekinds/src/lib/policyChain";
import { TEMPLATE_KINDS, fileTemplate } from "../../../packages/filekinds/src/lib/fileTemplates";
import { clipSummary, parseClip } from "../../../packages/filekinds/src/lib/clipDoc";
import { loadSong, parseSong, songMidiSpec, songSummary } from "../../../packages/filekinds/src/lib/songDoc";
import { writeMidiFile } from "../../../packages/filekinds/src/lib/midiFile";

/** The kinds, by extension: a label, the engine file whose header is the spec, and the check. */
interface Kind {
  label: string;
  /** Relative to packages/filekinds/src/lib. */
  spec: string;
  /** Further engine files whose headers belong to the spec (a journey is a .definition). */
  also?: string[];
  /** `file` is the document's absolute path — a kind that names other files checks them on disk. */
  check?: (text: string, file?: string) => CheckResult | Promise<CheckResult>;
}
interface CheckResult { problems: string[]; summary?: string }

/** The disk as the chain resolver's reader. The resolver joins with forward slashes and a leading one
 *  ("/C:/Github/…" on Windows) — Node wants the drive first. */
const diskReader = (abs: string) => Promise.resolve(readFileSync(abs.replace(/^\/([A-Za-z]:)/, "$1"), "utf8"));
const toAbs = (folder: string, ref: string) => resolve(folder, ref);

const yamlError = (text: string): string | null => {
  try { loadYaml(text); return null; } catch (e) { return `YAML: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`; }
};
/** YAML first, then the kind's parser; a throw is a problem, a return is a summary. */
const via = (kind: string, parse: (text: string) => unknown, summarize?: (doc: never) => string) => (text: string) => {
  const y = yamlError(text);
  if (y) return { problems: [y] };
  try {
    const doc = parse(text);
    return { problems: [], summary: summarize ? summarize(doc as never) : undefined };
  } catch (e) {
    return { problems: [`${kind}: ${e instanceof Error ? e.message : String(e)}`] };
  }
};

const KINDS: Record<string, Kind> = {
  frame: {
    label: "Frame", spec: "frameDoc.ts",
    check: (text) => {
      const y = yamlError(text);
      if (y) return { problems: [y] };
      const doc = parseFrame(text);
      const problems = frameProblems(doc);
      if (!doc.frames.length) problems.unshift("no frame declared — `frames:` needs one entry with id, name, width, height");
      return { problems, summary: `${doc.frames.length} frame, ${doc.nodes.length} nodes, ${doc.views.length} views${doc.versions.length ? `, ${doc.versions.length} versions` : ""}` };
    },
  },
  flow: {
    label: "Flow", spec: "flowOps.ts",
    check: (text) => {
      const { body, error } = parseFlowFile(text);
      if (error) return { problems: [`model YAML parse error: ${error}`] };
      const problems = validateFlowFile(text);
      const frames = Object.keys(body.frames ?? {}).length;
      return { problems, summary: `${body.screens.length} screens, ${body.screens.reduce((n, s) => n + s.variants.length, 0)} states${frames ? `, ${frames} inline frames` : ""}` };
    },
  },
  playbook: {
    label: "Playbook", spec: "playbookDoc.ts",
    check: async (text, file) => {
      const base = via("playbook", parsePlaybook, (d: ReturnType<typeof parsePlaybook>) => `v${d.version} · ${d.decisions.length} decisions, ${d.events.length} events${d.version < 2 ? `, ${d.topics.length} topics` : ""}`)(text);
      if (base.problems.length) return base;
      const doc = parsePlaybook(text);
      const problems = [...versionProblems(text), ...legacyProblems(text), ...variationProblems(doc), ...inlineProblems(doc)];
      // A `by` FILE is a CLOSED set authored up front: every answer combination is a file beside this one.
      // A set written in the book (`docs`) has no files; the engine checks it is closed (`inlineProblems`).
      const folder = file ? dirname(file) : null;
      let expected = 0, present = 0;
      for (const { entry } of byEntries(doc)) {
        if (!entry.file) continue;
        for (const f of variationsOf(doc, entry)) {
          expected++;
          if (folder && existsSync(toAbs(folder, f))) present++;
          else problems.push(`${f}: missing \u2014 every answer combination of \`by\` is a book of its own`);
        }
      }
      // Content written in the book is checked by its own kind's engine, as the file beside it would be —
      // handed THIS file's path, so a written version-1 book's own files resolve beside the root, where the walk reads them.
      let inline = 0;
      for (const { where, entry } of inlineEntries(doc)) {
        if (!entry.kind) continue;
        inline++;
        const kind = KINDS[entry.kind];
        const name = `${where}: ${entry.label ?? entry.key ?? "inline content"} (${entry.kind})`;
        if (!kind) { problems.push(`${name}: not a kind the Studio knows \u2014 \`--kinds\` lists them`); continue; }
        if (!kind.check) continue;
        for (const { at, doc: d } of writtenDocs(entry)) {
          const r = await kind.check(docText(d), file);
          for (const p of r.problems) problems.push(`${name}${at ? ` [${at}]` : ""}: ${p}`);
        }
      }
      return { problems, summary: `${base.summary}${expected ? `, ${present} of ${expected} child variations present` : ""}${inline ? `, ${inline} documents` : ""}` };
    },
  },
  plan: { label: "Plan", spec: "planDoc.ts", check: via("plan", parsePlan) },
  guide: { label: "Guide", spec: "guideDoc.ts", check: via("guide", parseGuide, (d: ReturnType<typeof parseGuide>) => `${d.steps.length} steps`) },
  brief: { label: "Brief", spec: "briefDoc.ts", check: via("brief", parseBrief) },
  list: { label: "List", spec: "listDoc.ts", check: via("list", parseDocList, (d: ReturnType<typeof parseDocList>) => `${d.items.length} items`) },
  kanban: { label: "Kanban", spec: "kanbanDoc.ts", check: via("kanban", parseKanban) },
  calendar: { label: "Calendar", spec: "calendarDoc.ts", check: via("calendar", parseCalendarLens) },
  points: { label: "Points", spec: "pointsDoc.ts", check: via("points", parsePoints) },
  // A .policy plays a role: the bucket machine (the default), tags, order, run — or TABLE (rules over rows).
  policy: {
    label: "Policy", spec: "policyDoc.ts", also: ["policyChain.ts", "tablePolicy.ts"],
    check: (text) => {
      const y = yamlError(text);
      if (y) return { problems: [y] };
      let role: unknown;
      try { role = (loadYaml(text) as { role?: unknown } | null)?.role; } catch { /* checked above */ }
      if (role === "table") {
        const d = parsePolicyKindFile(text);
        if (d.role !== "table") return { problems: ["not a table policy"] };
        return { problems: d.problems, summary: `table policy: ${d.where.length} filters, ${d.sort.length} sort keys${d.columns ? `, ${d.columns.length} columns` : ""}${d.limit ? `, first ${d.limit}` : ""}` };
      }
      return via("policy", parsePolicyFile)(text);
    },
  },
  definition: { label: "Definition", spec: "definitionDoc.ts", also: ["journeyStages.ts"], check: via("definition", parseDefinitionFile) },
  memory: {
    label: "Memory", spec: "memoryDoc.ts",
    check: via("memory", parseMemory, (d: ReturnType<typeof parseMemory>) => `${d.decisions.length} decisions, ${d.include.length} include clauses, locks [${d.locks.join(", ")}]`),
  },
  project: { label: "Project", spec: "projectDoc.ts", check: via("project", parseProject) },
  schema: { label: "Schema", spec: "schemaDoc.ts", check: via("schema", parseSchemaDoc) },
  workup: { label: "Workup", spec: "workupDoc.ts", check: via("workup", parseWorkup) },
  program: { label: "Program", spec: "programDoc.ts", check: via("program", parseProgram) },
  pulse: { label: "Pulse", spec: "pulseDoc.ts", check: via("pulse", parsePulse) },
  moves: { label: "Moves", spec: "movesDoc.ts", check: via("moves", parseMoves) },
  tablediff: { label: "Table diff", spec: "tableDiff.ts", check: via("tablediff", parseTableDiff) },
  // Not YAML: one JSON object per line — the engine's own problems are the check.
  jsonl: {
    label: "Data", spec: "dataRows.ts", also: ["tablePolicy.ts"],
    check: async (text, file) => {
      const d = parseDataRows(text);
      if (!d.compose) return { problems: d.problems, summary: `${d.rows.length} rows × ${d.columns.length} columns` };
      // Composed: the sources (and the chains behind them) and the policy are files beside this one — read the way the viewer does.
      const problems = [...d.problems];
      const folder = file ? dirname(file) : null;
      const rows = [...d.rows];
      const notes: string[] = [];
      for (const src of d.compose.sources) {
        if (!folder) { problems.push(`source ${src.file}: no folder to read it from`); continue; }
        const got = await readSourceRows(src, file!.replace(/\\/g, "/"), (abs) => diskReader(abs));
        rows.push(...got.rows); problems.push(...got.problems);
        notes.push(chainText(got));
      }
      let kept = rows.length;
      const policyRef = d.compose.policy;
      if (policyRef) {
        const abs = folder ? toAbs(folder, policyRef) : null;
        if (!abs || !existsSync(abs)) problems.push(`policy ${policyRef}: not found beside this file`);
        else {
          let parsed: ReturnType<typeof parsePolicyKindFile> | null = null;
          try { parsed = parsePolicyKindFile(readFileSync(abs, "utf8")); } catch (e) { problems.push(`policy ${policyRef}: ${e instanceof Error ? e.message : String(e)}`); }
          if (parsed && parsed.role !== "table") problems.push(`policy ${policyRef}: role is ${parsed.role}, not table`);
          else if (parsed) {
            const r = applyTablePolicy(parsed, rows);
            problems.push(...r.problems.map((x) => `policy ${policyRef}: ${x}`));
            kept = r.rows.length;
          }
        }
      }
      return { problems, summary: `composed: ${kept} of ${rows.length} rows from ${notes.join(", ") || "no sources"}${d.rows.length ? ` + ${d.rows.length} raw` : ""}${policyRef ? ` through ${policyRef}` : ""}` };
    },
  },
  // A middleware names its source itself; its rules are checked against the rows on disk, a rule matching nothing is a problem.
  middleware: {
    label: "Middleware", spec: "middlewareDoc.ts", also: ["dataSources.ts"],
    check: async (text, file) => {
      const y = yamlError(text);
      if (y) return { problems: [y] };
      const d = parseMiddleware(text);
      const problems = [...d.problems];
      if (!d.source) return { problems: [...problems, "no source"], summary: `${d.rules.length} rules, no source` };
      if (!file) return { problems, summary: `${d.rules.length} rules over ${d.source.file}` };
      const src = await readSourceRows(d.source, file.replace(/\\/g, "/"), (abs) => diskReader(abs));
      problems.push(...src.problems);
      const r = applyMiddleware({ ...d, problems: [] }, src.rows);
      problems.push(...r.problems);
      return { problems, summary: `over ${chainText(src)}: ${r.matches.map((m, i) => `rule ${i + 1} → ${m.length}`).join(", ") || "no rules"}` };
    },
  },
  collection: {
    label: "Collection", spec: "collectionDoc.ts",
    check: (text) => {
      const y = yamlError(text);
      if (y) return { problems: [y] };
      const d = parseCollection(text);
      const s = collectionSummary(d);
      return { problems: d.problems, summary: `${d.items.length} items · ${s.shown} shown, ${s.up} up, ${s.down} down, ${s.hidden} hidden · ${d.decisions.length} decisions` };
    },
  },
  clip: {
    label: "Clip", spec: "clipDoc.ts", also: ["midiFile.ts"],
    check: (text) => {
      const y = yamlError(text);
      if (y) return { problems: [y] };
      const d = parseClip(text);
      return { problems: d.problems, summary: `${clipSummary(d)} · channel ${d.channel}` };
    },
  },
  song: {
    label: "Song", spec: "songDoc.ts", also: ["clipDoc.ts", "midiFile.ts"],
    check: async (text, file) => {
      const y = yamlError(text);
      if (y) return { problems: [y] };
      const song = await loadSongFromDisk(text, file ?? "");
      return { problems: song.problems, summary: songSummary(song) };
    },
  },
  md: { label: "Markdown", spec: "" },
};

/** A song's clips read from the disk beside it (refs resolve against the song's folder). */
const loadSongFromDisk = (text: string, file: string) =>
  loadSong(parseSong(text), file, (abs) => Promise.resolve(readFileSync(abs, "utf8")), (from, ref) => toAbs(dirname(from), ref));


const LIB = resolve(__dirname, "../../../packages/filekinds/src/lib");

/** The leading comment of an engine file — its specification, as the kit keeps it. */
function headerOf(file: string): string {
  const src = readFileSync(join(LIB, file), "utf8");
  if (src.startsWith("/**")) {
    const end = src.indexOf("*/");
    return src.slice(3, end).split("\n").map((l) => l.replace(/^\s*\*\s?/, "")).join("\n").trim();
  }
  const lines: string[] = [];
  for (const l of src.split("\n")) { if (l.startsWith("//")) lines.push(l.replace(/^\/\/\s?/, "")); else if (lines.length) break; }
  return lines.join("\n").trim();
}

function spec(ext: string): string {
  const k = KINDS[ext];
  if (!k) return `No kind for .${ext}. Kinds: ${Object.keys(KINDS).join(", ")}`;
  const parts = [`# .${ext} — ${k.label}`, ""];
  if (k.spec) parts.push(`## The engine's own account (packages/filekinds/src/lib/${k.spec})`, "", headerOf(k.spec), "");
  for (const f of k.also ?? []) parts.push(`## Also (packages/filekinds/src/lib/${f})`, "", headerOf(f), "");
  if (ext === "frame") parts.push("## The legend every saved frame carries", "", FRAME_LEGEND.trim(), "");
  if (TEMPLATE_KINDS.some((t) => t.ext === ext)) parts.push("## A fresh document (what the Studio creates)", "", "```yaml", fileTemplate(`untitled.${ext}`).trimEnd(), "```", "");
  if (ext === "md") parts.push("Plain markdown; the Studio renders it, nothing to validate.", "");
  return parts.join("\n");
}

function expand(args: string[]): string[] {
  const out: string[] = [];
  for (const a of args) {
    if (/[*?[]/.test(a)) { out.push(...globSync(a.replace(/\\/g, "/"))); continue; }
    const p = resolve(a);
    if (!existsSync(p)) { out.push(p); continue; }
    if (statSync(p).isDirectory()) {
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          if (name === "node_modules" || name.startsWith(".")) continue;
          const f = join(dir, name);
          if (statSync(f).isDirectory()) walk(f);
          else if (KINDS[extname(name).slice(1).toLowerCase()]?.check) out.push(f);
        }
      };
      walk(p);
    } else out.push(p);
  }
  return out;
}

async function main(argv: string[]): Promise<number> {
  const json = argv.includes("--json");
  const args = argv.filter((a) => a !== "--json");
  if (!args.length || args[0] === "--help" || args[0] === "-h") {
    console.log("studio-check <file|folder|glob ...> | --spec <ext> | --template <ext> | --kinds | --json <file ...> | --collect <file.jsonl> [name] | --midi <file.clip|file.song> [name.mid]");
    return 0;
  }
  if (args[0] === "--kinds") {
    for (const [ext, k] of Object.entries(KINDS)) console.log(`.${ext.padEnd(11)} ${k.label.padEnd(11)} ${k.spec ? `spec: packages/filekinds/src/lib/${[k.spec, ...(k.also ?? [])].join(" + ")}` : ""}${k.check ? "" : "  (no checks)"}${TEMPLATE_KINDS.some((t) => t.ext === ext) ? "  template" : ""}`);
    return 0;
  }
  if (args[0] === "--spec") { console.log(spec((args[1] ?? "").replace(/^\./, "").toLowerCase())); return 0; }
  if (args[0] === "--template") {
    const ext = (args[1] ?? "").replace(/^\./, "").toLowerCase();
    if (!TEMPLATE_KINDS.some((t) => t.ext === ext)) { console.error(`No template for .${ext}. Templates: ${TEMPLATE_KINDS.map((t) => `.${t.ext}`).join(", ")}`); return 2; }
    process.stdout.write(fileTemplate(`untitled.${ext}`));
    return 0;
  }

  if (args[0] === "--midi") {
    const src = args[1] ? resolve(args[1]) : "";
    const ext = extname(src).toLowerCase();
    if (!src || !existsSync(src) || (ext !== ".clip" && ext !== ".song")) { console.error("usage: --midi <file.clip|file.song> [name.mid]"); return 2; }
    const text = readFileSync(src, "utf8");
    const stem = basename(src, ext);
    let bytes: Uint8Array;
    let summary: string;
    let problems: string[];
    if (ext === ".clip") {
      const d = parseClip(text);
      bytes = writeMidiFile({ tempo: d.tempo, time: d.time, title: d.title || stem, tracks: [{ name: d.title || stem, channel: d.channel, notes: d.notes }] });
      summary = clipSummary(d); problems = d.problems;
      if (!d.notes.length) problems = [...problems, "no notes — nothing to export"];
    } else {
      const song = await loadSongFromDisk(text, src);
      bytes = writeMidiFile(songMidiSpec(song, song.doc.title || stem));
      summary = songSummary(song); problems = song.problems;
    }
    for (const p of problems) console.error(`      ${p}`);
    if (problems.some((p) => p.startsWith("no notes"))) return 1;
    const out = args[2] ? resolve(dirname(src), args[2]) : join(dirname(src), `${stem}.mid`);
    writeFileSync(out, bytes);
    console.log(`${basename(out)}: ${summary} (${bytes.length} bytes)`);
    return problems.length ? 1 : 0;
  }
  if (args[0] === "--collect") {
    const src = args[1] ? resolve(args[1]) : "";
    if (!src || !existsSync(src) || extname(src).toLowerCase() !== ".jsonl") { console.error("usage: --collect <file.jsonl> [name.collection]"); return 2; }
    const d = parseDataRows(readFileSync(src, "utf8"));
    const rows = [...d.rows];
    const labels = d.compose?.labels ?? {};
    let columns: string[] | null = null;
    for (const s of d.compose?.sources ?? []) rows.push(...(await readSourceRows(s, src.replace(/\\/g, "/"), (abs) => diskReader(abs))).rows);
    let kept = rows;
    if (d.compose?.policy) {
      const parsed = parsePolicyKindFile(readFileSync(resolve(dirname(src), d.compose.policy), "utf8"));
      if (parsed.role === "table") { const r = applyTablePolicy(parsed, rows); kept = r.rows; columns = r.columns; }
    }
    const out = args[2] ? resolve(dirname(src), args[2]) : src.replace(/\.jsonl$/i, ".collection");
    const fields = columns ?? Object.keys(kept[0] ?? {});
    writeFileSync(out, dumpCollection(collectionFromRows(kept, { source: basename(src), fields, labels })));
    console.log(`${basename(out)}: ${kept.length} items from ${basename(src)}`);
    return 0;
  }
  const files = expand(args);
  const results = await Promise.all(files.map(async (file) => {
    const ext = extname(file).slice(1).toLowerCase();
    const kind = KINDS[ext];
    if (!existsSync(file)) return { file, ext, ok: false, problems: ["file not found"] };
    if (!kind) return { file, ext, ok: true, problems: [], note: `no kind for .${ext} — not checked` };
    if (!kind.check) return { file, ext, ok: true, problems: [], note: `${kind.label} — nothing to validate` };
    const r = await kind.check(readFileSync(file, "utf8"), resolve(file));
    return { file, ext, ok: r.problems.length === 0, problems: r.problems, summary: r.summary, label: kind.label };
  }));
  if (json) { console.log(JSON.stringify(results, null, 2)); }
  else {
    for (const r of results) {
      const head = `${r.ok ? "ok " : "FAIL"} ${basename(r.file)}`.padEnd(44);
      console.log(`${head} ${r.label ?? ""}${r.note ? `  ${r.note}` : r.summary ? `  ${r.summary}` : ""}${r.problems.length ? `  — ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}` : ""}`);
      for (const p of r.problems) console.log(`      ${p}`);
    }
    const bad = results.filter((r) => !r.ok).length;
    console.log(`${results.length} checked, ${bad} with problems`);
  }
  return results.some((r) => !r.ok) ? 1 : 0;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
