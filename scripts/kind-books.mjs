// Every kind, at every version, has a BOOK: kinds/<ext>/v<N>.playbook — a playbook, in the version-2
// form, that explains how the kind works at that version. `studio-check --book <ext> [N]` prints its
// path; `studio-check --books` lists them all.
//
//   node scripts/kind-books.mjs           write the book of every kind and version that has none yet —
//                                         the engine's own account (the spec) under an always-on event,
//                                         and the fresh document under another; never overwrites a book
//   node scripts/kind-books.mjs --check   every book exists and passes the checker, and every kind the page
//                                         offers has its field table, kinds/<ext>/v<N>.fields.yaml (exit 1 otherwise) — CI
//
// The checker must be built first: pnpm cli:build.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const cli = path.join(root, "apps", "cli", "dist", "check.cjs");
if (!existsSync(cli)) { console.error("build the checker first: pnpm cli:build"); process.exit(2); }
const yaml = createRequire(path.join(root, "packages", "filekinds", "package.json"))("js-yaml");
// The checker exits 1 when something is missing or failing; its output is still the answer.
const run = (...args) => {
  try { return execFileSync("node", [cli, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { if (e.stdout !== undefined && e.status === 1) { if (args[0] === "--books") return e.stdout; throw Object.assign(new Error(e.stdout || e.stderr), { stdout: e.stdout }); } throw e; }
};

const check = process.argv.includes("--check");
const books = JSON.parse(run("--books", "--json"));

let written = 0;
for (const b of books) {
  if (b.exists) continue;
  if (check) continue;
  const spec = run("--spec", b.ext).trim();
  const label = spec.match(/^# \.\w+ — (.+)$/m)?.[1] ?? b.ext;
  const doc = {
    version: 2,
    title: `How a version-${b.version} ${label.toLowerCase()} works`,
    description: `The .${b.ext} kind at version ${b.version}: the engine's own account, and the document a fresh file starts from.`,
    events: [
      {
        key: "always", label: "Always", trigger: "imposed", domain: "Always",
        detail: "What holds at every moment — the engine's account of the kind, the same text studio-check --spec prints.",
        content: { key: "spec", label: "The engine's account", kind: "md", doc: spec + "\n" },
      },
    ],
  };
  mkdirSync(path.dirname(b.path), { recursive: true });
  writeFileSync(b.path, yaml.dump(doc, { lineWidth: -1, noRefs: true }));
  written++;
  console.log(`wrote ${path.relative(root, b.path)}`);
}

// Every book present, and every one a document the checker passes.
const after = JSON.parse(run("--books", "--json"));
const missing = after.filter((b) => !b.exists);
for (const m of missing) console.error(`missing: ${path.relative(root, m.path)}`);
let failed = 0;
for (const b of after.filter((b) => b.exists)) {
  try { run(b.path); } catch (e) { failed++; console.error(String(e.stdout ?? e.message)); }
}

// The FIELD TABLES — kinds/<ext>/v<N>.fields.yaml, the schema as a table — for every kind the page
// offers, at every version: present, YAML, a `fields` list whose entries each name a `field`.
const OFFERED = ["brief", "playbook", "kanban", "calendar", "policy", "flow", "jsonl", "middleware", "pipeline", "collection", "clip", "song", "md"];
let badFields = 0;
for (const b of after.filter((b) => OFFERED.includes(b.ext))) {
  const rel = path.relative(root, b.fields);
  if (!b.fieldsExist) { badFields++; console.error(`missing field table: ${rel}`); continue; }
  try {
    const doc = yaml.load(readFileSync(b.fields, "utf8"));
    const list = doc?.fields;
    if (!Array.isArray(list) || !list.length) throw new Error("no `fields` list");
    for (const f of list) if (!f || typeof f.field !== "string" || !f.field) throw new Error("an entry without a `field`");
    if (doc.kind !== b.ext || doc.version !== b.version) throw new Error(`says kind ${doc.kind} v${doc.version}, sits under ${b.ext} v${b.version}`);
  } catch (e) { badFields++; console.error(`${rel}: ${e.message}`); }
}
console.log(`${after.length} books: ${written} written, ${missing.length} missing, ${failed} failing; field tables: ${badFields} missing or wrong`);
process.exit(missing.length || failed || badFields ? 1 : 0);
