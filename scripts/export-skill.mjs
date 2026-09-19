// The studio-files skill for OTHER surfaces — a PC without this repository, Claude.ai chat, Cowork — is
// GENERATED from the master playbook's event "Maher asks for a Studio document" (claude/claude.playbook):
// the event is the source, skills/studio-files/SKILL.md is what the release zips (studio-files-skill.zip).
//
//   node scripts/export-skill.mjs           write skills/studio-files/SKILL.md from the event (pnpm skill:export)
//   node scripts/export-skill.mjs --check   exit 1 when the file on disk differs from the event — CI
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const yaml = createRequire(path.join(root, "packages", "filekinds", "package.json"))("js-yaml");
const master = path.join(root, "claude", "claude.playbook");
const out = path.join(root, "skills", "studio-files", "SKILL.md");

const doc = yaml.load(fs.readFileSync(master, "utf8"));
const event = (doc.events ?? []).find((e) => e.key === "studio-document");
if (!event?.content?.doc) { console.error(`no "studio-document" event with a document in ${master}`); process.exit(2); }

const frontmatter = [
  "---",
  "name: studio-files",
  "description: Author and edit Studio documents on DISK — every kind of Maher's Digital Symphony suite (.brief, .playbook, .kanban, .calendar, .policy, .flow, .jsonl, .middleware, .collection, .clip, .song, and .md for anything else) — in any folder the Studio opens. Use whenever a task touches one of these files by extension, asks to create, change or validate one, mentions the Studio, the desktop app or the VS Code preview, or asks WHICH file type to use for something.",
  "---",
  "",
];
const text = frontmatter.join("\n") + String(event.content.doc).replace(/\s+$/, "") + "\n";
const rel = path.relative(root, out);

if (process.argv.includes("--check")) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8").replace(/\r\n/g, "\n") : "";
  if (current === text) { console.log(`skill in step with the master: ${rel}`); process.exit(0); }
  console.error(`${rel} differs from the event "Maher asks for a Studio document" in claude/claude.playbook — run pnpm skill:export and commit it`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text);
console.log(`skill exported from the master → ${rel}`);
