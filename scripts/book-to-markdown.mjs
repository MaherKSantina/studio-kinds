/**
 * Flatten every kind's book into plain markdown, one document per kind.
 *
 *   node scripts/book-to-markdown.mjs            # writes kinds/<ext>/README.md
 *   node scripts/book-to-markdown.mjs --check    # fails if any is out of date
 *
 * WHY THIS EXISTS. A kind's book (`v<N>.playbook`) already says how the kind
 * works — what the parser keeps, what each interaction shows, what the checker
 * judges. But a book is a document of the `playbook` kind: to read one you must
 * first implement that kind, which is precisely what someone arriving at this
 * repository has not done yet. This renders each book as markdown so it can be
 * read with nothing but a text editor.
 *
 * The book stays the source of truth. These files are generated, and saying
 * anything here that the book does not say would only create a second, quieter
 * source that drifts. Change the book, then re-run this.
 *
 * Needs `yaml`, which the workspace already depends on:
 *   pnpm install   (then run from the repo root)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let YAML;
try {
  YAML = require("yaml");
} catch {
  console.error("book-to-markdown needs the `yaml` package — run `pnpm install` first.");
  process.exit(1);
}

const KINDS = "kinds";
const check = process.argv.includes("--check");

/** The newest book a kind ships: v2 beats v1. */
function bookOf(ext) {
  const versions = readdirSync(join(KINDS, ext))
    .map((f) => /^v(\d+)\.playbook$/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => b - a);
  return versions.length ? { version: versions[0], file: join(KINDS, ext, `v${versions[0]}.playbook`) } : null;
}

const text = (v) => String(v ?? "").replace(/\s+$/, "");
const heading = (depth, s) => `${"#".repeat(Math.min(depth, 6))} ${s}`;

/** A document written into an event, rendered by its kind. */
function flatten(kind, doc, depth) {
  const out = [];
  if (kind === "md") {
    out.push(text(doc));
  } else if (kind === "brief") {
    if (doc.title) out.push(heading(depth, doc.title));
    if (doc.description) out.push(`*${text(doc.description)}*`);
    const walk = (sections, d) => {
      for (const s of sections ?? []) {
        if (s.title) out.push(heading(d, s.title));
        if (s.description) out.push(`*${text(s.description)}*`);
        if (s.body) out.push(text(s.body));
        if (s.content) out.push(flatten(s.content.kind, s.content.doc, d + 1));
        walk(s.children, d + 1);
      }
    };
    walk(doc.sections, depth + 1);
  } else if (kind === "guide") {
    if (doc.title) out.push(heading(depth, doc.title));
    if (doc.description) out.push(`*${text(doc.description)}*`);
    for (const step of doc.steps ?? []) {
      out.push(heading(depth + 1, step.label ?? step.key));
      if (step.detail) out.push(text(step.detail));
    }
  } else if (kind === "playbook") {
    out.push(sections(doc, depth));
  } else {
    // A kind this renderer does not flatten is shown as it is written, which is
    // lossless and obviously a fallback rather than a silent omission.
    out.push(`<!-- ${kind} -->\n\n\`\`\`yaml\n${YAML.stringify(doc).trimEnd()}\n\`\`\``);
  }
  return out.filter(Boolean).join("\n\n");
}

/** A book's decisions and events, as markdown. */
function sections(book, depth) {
  const out = [];
  if (book.decisions?.length) {
    out.push(heading(depth, "Decisions"));
    for (const d of book.decisions) {
      out.push(`**${d.label ?? d.key}** (\`${d.key}\`)${d.detail ? ` — ${text(d.detail)}` : ""}`);
      out.push((d.values ?? []).map((v) => `- \`${v.key}\` — ${v.label}${v.detail ? `. ${text(v.detail)}` : ""}`).join("\n"));
    }
  }
  for (const e of book.events ?? []) {
    out.push(heading(depth, e.label ?? e.key));
    const tags = [e.trigger, e.arity, e.rate].filter(Boolean);
    const when = (e.when ?? []).map((r) => `\`${r}\``).join(", ");
    const line = [tags.length ? `*${tags.join(" · ")}*` : "", when ? `only when ${when}` : ""].filter(Boolean).join(" — ");
    if (line) out.push(line);
    if (e.detail) out.push(text(e.detail));
    if (e.hint) out.push(`> ${text(e.hint).replace(/\n/g, "\n> ")}`);
    if (e.content?.doc !== undefined) out.push(flatten(e.content.kind, e.content.doc, depth + 1));
    for (const [ref, doc] of Object.entries(e.content?.docs ?? {})) {
      out.push(`${heading(depth + 1, `When \`${ref}\``)}\n\n${flatten(e.content.kind, doc, depth + 2)}`);
    }
  }
  return out.filter(Boolean).join("\n\n");
}

function render(ext, book, version, file) {
  return [
    `# ${book.title ?? ext}`,
    "",
    `<!-- Generated from ${file.replace(/\\/g, "/")} by scripts/book-to-markdown.mjs. Do not edit by hand. -->`,
    "",
    book.description ? `${text(book.description)}\n` : "",
    `This is the \`.${ext}\` kind, version ${version}, rendered as plain markdown so it can be read`,
    "without first implementing the kind it is written in. It is generated from the kind's",
    "book, which stays the source of truth — change the book, not this file.",
    "",
    "Alongside it in this folder:",
    "",
    `- \`v${version}.schema.json\` — the shape, machine readable`,
    `- \`v${version}.fields.yaml\` — the same shape as a field table`,
    `- \`v${version}.playbook\` — the book this was generated from`,
    "",
    "---",
    "",
    sections(book, 2),
    "",
  ].join("\n");
}

/** The index of the folder: every kind, what it is, and what it ships. */
function renderIndex(rows) {
  return [
    "# The kinds",
    "",
    "<!-- The table is generated by scripts/book-to-markdown.mjs. Do not edit it by hand. -->",
    "",
    "One folder per kind, holding everything that defines it. Nothing about a kind lives",
    "anywhere else, and nothing here is written twice.",
    "",
    "## What is in a kind's folder",
    "",
    "| file | what it is | for |",
    "|---|---|---|",
    "| `v<N>.schema.json` | **the shape** — every key, its type, which are required | validating a document, generating types |",
    "| `v<N>.fields.yaml` | the same shape as a flat field table | reading the shape without parsing a schema |",
    "| `v<N>.playbook` | **the book** — how the kind works, as a document of the `playbook` kind | the source of truth, and an example of that kind |",
    "| `README.md` | the book rendered as plain markdown | **reading how the kind works** |",
    "",
    "## If you are implementing a kind",
    "",
    "Read the kind's `README.md`. Between them, the books cover what a parser keeps from a",
    "file, what each interaction shows and changes, how a kind behaves when it is embedded",
    "in another, and what the checker judges — the domain rules and the view model both.",
    "Take the shape from the schema beside it: it is authoritative for which keys exist, their",
    "types and which are required. For what a key means, and whether a viewer draws it, the",
    "book is — where a schema's description of a key reads differently, trust the book.",
    "",
    "The book is the source of truth and the `README.md` is generated from it. Change the",
    "book, then run `node scripts/book-to-markdown.mjs` from the repository root.",
    "`--check` fails when any README is out of date, which is what CI should run.",
    "",
    "## The kinds",
    "",
    "| kind | what it is |",
    "|---|---|",
    ...rows.map((r) => `| [\`.${r.ext}\`](${r.ext}/README.md) | ${r.title} |`),
    "",
  ].join("\n");
}

let stale = 0;
const exts = readdirSync(KINDS, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const settle = (dest, next) => {
  const current = existsSync(dest) ? readFileSync(dest, "utf8") : null;
  if (current === next) return;
  if (check) {
    stale++;
    console.error(`stale: ${dest}`);
  } else {
    writeFileSync(dest, next);
    console.log(`wrote ${dest}`);
  }
};

const rows = [];
for (const ext of exts) {
  const found = bookOf(ext);
  if (!found) continue;
  const book = YAML.parse(readFileSync(found.file, "utf8"));
  rows.push({ ext, title: text(book.description ?? book.title).split(/(?<=\.)\s/)[0].replace(/\n/g, " ") });
  settle(join(KINDS, ext, "README.md"), render(ext, book, found.version, found.file));
}
settle(join(KINDS, "README.md"), renderIndex(rows));

if (check) {
  console.log(stale ? `${stale} file(s) out of date — run scripts/book-to-markdown.mjs` : "every kind README is current");
  process.exit(stale ? 1 : 0);
}
