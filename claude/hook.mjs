// Claude Code hook: puts the Studio's master playbook in front of Claude.
//   node hook.mjs session   -> SessionStart: the whole map (events, their content, the questions with no answer, the memory's areas and facts)
//   node hook.mjs prompt    -> UserPromptSubmit: a one-paragraph reminder of the events to watch
// Reads claude.playbook (version 2: every checklist and child book in it) and memory.brief (one top section per area,
// one child per fact) from the folder this file sits in, on every run, so whatever Maher adds in the Studio is what
// Claude sees. Never throws: a broken file yields a note.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const MASTER = path.join(DIR, "claude.playbook");
const MEMORY = path.join(DIR, "memory.brief");
const mode = process.argv[2] ?? "session";

let yaml = null;
try {
  yaml = createRequire(path.join(DIR, "..", "packages", "filekinds", "package.json"))("js-yaml");
} catch { /* fall through to raw text */ }

const load = (p) => {
  const text = readFileSync(p, "utf8");
  return yaml ? yaml.load(text) : null;
};

const emit = (event, context) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext: context },
  }));
};

const eventName = mode === "prompt" ? "UserPromptSubmit" : "SessionStart";

if (!existsSync(MASTER)) {
  emit(eventName, `Master playbook missing at ${MASTER} — recreate it from the template (studio-check --template playbook) before working.`);
  process.exit(0);
}

let doc;
try { doc = load(MASTER); } catch (e) { emit(eventName, `Master playbook at ${MASTER} did not parse: ${e?.message ?? e}. Read it raw and fix it first.`); process.exit(0); }

let memoryDoc = null;
let memoryNote = "";
if (existsSync(MEMORY)) {
  try { memoryDoc = load(MEMORY); } catch (e) { memoryNote = `\nMemory brief at ${MEMORY} did not parse: ${e?.message ?? e}. Read it raw and fix it first.`; }
}

/** A version-2 content entry is one mapping; version 1 is a list of files. Both come back as a list. */
const entriesOf = (e) => {
  const c = e?.content;
  return Array.isArray(c) ? c : c && typeof c === "object" ? [c] : [];
};
/** What an entry is, in a word: a document by label and kind, or a file path. */
const nameOf = (c) => c.file
  ? (c.by?.length ? `${c.file} by ${c.by.join(",")}` : c.file)
  : `${c.label ?? c.key ?? "content"} (${c.kind ?? "md"})`;
/** A brief section by its title; the children of a section as a list. */
const titleOf = (s) => s?.title ?? "(untitled)";
const childrenOf = (s) => Array.isArray(s?.children) ? s.children : [];

const working = Array.isArray(doc?.events) ? doc.events : [];
const areas = Array.isArray(memoryDoc?.sections) ? memoryDoc.sections : [];
const lines = working.map((e) => `- ${e.label} → ${entriesOf(e).map(nameOf).join(", ") || "(no content yet)"}`);

// The questions: every decision of every child book written into the master. None has an answer in the
// file — a version-2 walk is session-only — so each is asked in chat.
const questions = [];
for (const e of working) {
  for (const c of entriesOf(e)) {
    if (c.kind !== "playbook" || !c.doc || typeof c.doc !== "object") continue;
    const decisions = (c.doc.decisions ?? []).map((d) => `${d.label} [${(d.values ?? []).map((v) => v.label ?? v.key).join(" / ")}]`);
    if (decisions.length) questions.push(`${c.doc.title ?? c.label ?? e.label} (under "${e.label}"): ${decisions.join("; ")}`);
  }
}

if (mode === "prompt") {
  emit("UserPromptSubmit",
    `Master playbook (${MASTER}): as you work, watch for these events and, when one happens, open its content in the book and do every item — ` +
    working.map((e) => e.label).join(" · ") +
    (areas.length ? `. MEMORY lives in ${MEMORY}: before touching an area, take its section (${areas.map(titleOf).join(", ")}) and read its facts. Never write to a book under claude/ except through the "Something should be committed to memory" event and Maher's answer there.` : ".") +
    " The child books' questions have NO standing answer (a version-2 walk is session-only, nothing is ever saved): ask Maher each question in chat and act on his answer there; the event's content follows his answer, and until he answers the event's own hint says what to do.");
  process.exit(0);
}

emit("SessionStart",
  `MASTER PLAYBOOK — ${MASTER} (version 2: every checklist and child book is in the file)\n` +
  `Consult it at the start of every task and whenever one of its events happens: open the event's content in the book and do every item. ` +
  `Maher adds events there in the Studio; keep the checklists true to how the Studio works; studio-check after editing.\n` +
  lines.join("\n") +
  `\nQUESTIONS — the child books' decisions. None has an answer in the file and nothing clicked in the Studio is saved: ask Maher each one in chat when its event fires; the event's content (docs, keyed by answer) is what to do under his answer, and the event's own hint is what to do until he answers.\n` +
  (questions.length ? questions.map((q) => `- ${q}`).join("\n") : "- (no child book carries a decision)") +
  (areas.length ? `\nMEMORY — ${MEMORY} (a brief, one file). Each top section IS Claude's memory for that area, one child per fact (there is no MEMORY.md). Take an area's section before working there and read its facts. Writing to memory.brief or to claude.playbook happens ONLY through the "Something should be committed to memory" event: show the write, ask, and write only on a yes; every write is shown in full in the report.\n` +
    areas.map((a) => `- ${titleOf(a)} → ${childrenOf(a).map(titleOf).join(", ")}`).join("\n") : "") +
  memoryNote);
