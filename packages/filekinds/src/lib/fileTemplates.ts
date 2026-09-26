/**
 * A STARTER for a new file, by its extension — enough that the kind's viewer
 * renders something the moment the file exists. One place for it: the
 * Studio's "New …", the Projects directory view's "New file" and the project
 * Ask vocabulary all create files from here, so a model never writes YAML for
 * a kind it does not know; it names the kind and the title and the template
 * does the rest.
 */
import { ITEM_FILE_TEMPLATES } from "../components/flow/flowHost";
import { dumpFrame, newFrameDoc } from "./frameDoc";

/** The kinds a file can be started as, with what each is — the words a model is given. */
export const TEMPLATE_KINDS: ReadonlyArray<{ ext: string; what: string }> = [
  { ext: "md", what: "a markdown note (content may be given)" },
  { ext: "frame", what: "a single-screen UI design — created from its title as an empty screen" },
  { ext: "flow", what: "a parameterised walkthrough of screens" },
  { ext: "brief", what: "a titled tree of sections with prose; a section can hold one document of another kind" },
  { ext: "list", what: "a list of rows" },
  { ext: "kanban", what: "a board of columns and tasks" },
  { ext: "policy", what: "params → ordered cases (first match wins) → buckets" },
  { ext: "playbook", what: "decisions, and the events that are live while they hold" },
  { ext: "plan", what: "a policy over playbooks, and the schedule it produces" },
  { ext: "guide", what: "one explanation, narrowed by questions into steps" },
  { ext: "points", what: "a points store: literature → distillation → points, every key cited" },
  { ext: "project", what: "a project entry point, standing on a folder of the same name" },
  { ext: "memory", what: "a working memory over the folder it sits in — its sub-folders are the foci until it authors decisions" },
  { ext: "definition", what: "a staged journey — vertical stages of side-by-side lanes, collate and fanout on the boundaries" },
  { ext: "calendar", what: "a calendar lens over one .kanban board's schedule" },
  { ext: "schema", what: "the shape half of a structured node — entries with stable ids" },
  { ext: "workup", what: "the ordered steps one document's examination goes through, each producing one output file" },
  { ext: "program", what: "code as execution — inputs from the store, outputs back to it, the code between" },
  { ext: "pulse", what: "the movement of a working memory, drawn live from the store's timestamps" },
  { ext: "moves", what: "a working memory's movement log, harvested on every open" },
  { ext: "tablediff", what: "two tables compared live, keyed by columns" },
  { ext: "jsonl", what: "data rows — one JSON object per line, shown as a paged, searchable table with the columns found; a {\"$sources\": [...], \"$policy\": \"x.policy\"} line composes them live from other files through a table policy" },
  { ext: "middleware", what: "rows amended on their way to a view — a source, and rules that pick rows by clauses and set fields on them; a .jsonl names it among its $sources" },
  { ext: "collection", what: "a snapshot of a view's rows to decide over one at a time — images, facts, link, directions; push up / down / hide with a reason (Collect on a .jsonl view, or check --collect)" },
  { ext: "pipeline", what: "one curated list in the file — items with ids — the stages that transform it (rules that set fields, a filter, a sort, each under a circumstance) and the views that show the output" },
  { ext: "clip", what: "the notes of one MIDI clip — pitches by name or number, beats, velocities, drum lanes as step strings; a piano roll, exported as a .mid" },
  { ext: "song", what: "clips placed on tracks — an arrangement, exported as one multi-track .mid for Ableton" },
  { ext: "script", what: "a script to press play on — the code, its interpreter (powershell, pwsh, bash, sh, python, node, cmd) and the environment variables the run gets, in one file" },
  { ext: "views", what: "one list of items seen several ways — a table always, and a kanban, a calendar, a gantt and a dependency tree as the roles under `fields` allow (status, start, end, previous)" },
  { ext: "page", what: "an HTML page made from its own data — a Nunjucks template, the model it renders and the partials it names, rendered on open" },
];

export const fileExtensionOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/** A fresh DIRECTORY-style project: the file names the folder it stands on. */
export function newProjectText(name: string): string {
  const q = (s: string) => JSON.stringify(s);
  return `name: ${q(name)}\ndescription: ""\nmode: directory\nroot: ${q(`/${name}`)}\nitems: []\n`;
}

const playbookText = (stem: string) => `version: 2
title: ${stem}
description: The questions, the events, and what each event shows — every document in this file; answers are session-only.
decisions:
  - key: example
    label: An example decision
    values:
      - { key: not-yet, label: Not yet }
      - { key: done, label: Done }
events:
  - key: example
    label: An example event
    trigger: imposed
    hint: Ask which.
    content:
      kind: md
      by: [example]
      docs:
        example=not-yet: ""
        example=done: ""
`;

const planText = (stem: string) => `title: ${stem}
description: A policy over a playbook, and the schedule it produces.
playbooks:
  - some.playbook
locks: []
horizon: 120
rules:
  - note: Rules are a list; each carries one instruction.
    capacity: 1
`;

const guideText = (stem: string) => `title: ${stem}
description: One explanation, narrowed by questions.
decisions: []
steps:
  - label: First step
    detail: What to do and why.
`;

const pointsText = (stem: string) => `title: ${stem}
description: Literature in, points out — every key a claim with a citation.
literature: []
distillation: []
points:
  - id: p-first-thing
    label: Something that exists
    keys: []
    note: Identity before shape — type it and key it once the literature says what it is.
`;

/** Two tasks and one edge, so the rows, the schedule and a `.calendar` over the board have something to show. */
const kanbanText = (stem: string) => `title: ${stem}
due: 2026-12-31
columns: [To do, Doing, Done]
tasks:
  - key: first
    title: The first thing
    status: Doing
    duration: 2
  - key: second
    title: What follows it
    needs: [first]
    due: 2026-12-24
`;

const policyText = (stem: string) => `title: ${stem}
description: Input in, bucket out — the switch runs in order and stops at the first match.
params:
  - {key: name, label: Name, type: string}
buckets:
  - {key: "yes", label: "Yes"}
  - {key: "no", label: "No"}
default: "no"
cases:
  - label: The first filter
    when:
      - {param: name, op: not_empty}
    bucket: "yes"
`;

/** A memory over the folder it is saved in: no decisions, so the folders
 *  are the foci — what an EMPTY .memory file already is, with the words. */
function memoryText(stem: string): string {
  return [
    `title: ${JSON.stringify(stem)}`,
    `description: "Working memory over this folder. Each sub-folder is a focus and the files sitting directly here are Everything else; taking a focus brings that folder's own split onto the table — the first .memory inside it when there is one, its sub-folders otherwise."`,
    ``,
    `# Where it looks: this folder. \`scope: /\` would be the whole store, \`..\` the parent.`,
    ``,
    `# What counts as a UNIT: every document under the scope (plain folders and`,
    `# .memory files are structure, never units). Clauses over the index fields —`,
    `# path, name, stem, ext, area, parent, depth, age_days — narrow it.`,
    `include: []`,
    ``,
    `# Authoring decisions here REPLACES the folder split with your own foci:`,
    `# values with derive rules; an answer may activate a narrower decision, or`,
    `# \`folder\` to split by the sub-folders from there. Empty = the folders decide.`,
    `decisions: []`,
    ``,
  ].join("\n");
}

/** A staged journey, in its smallest complete form: two strands gathered
 *  side by side, then pooled — every boundary kind is one edit away. */
function definitionText(stem: string): string {
  return [
    `title: ${JSON.stringify(stem)}`,
    `description: "A staged journey: stages stack vertically, lanes stand side by side, and the one/many action lives on the boundary between stages."`,
    ``,
    `# Refs are relative to this file's folder (or absolute from the folder root).`,
    `# A lane's \`out:\` is the artifact it produces. Between stages: \`collate:\` (⇒) pools`,
    `# every lane above into one list; \`fanout: {list: pool.list}\` (⇉) splits a pool into`,
    `# per-item columns (\`{run: chain.policy, ranks: [1, 3]}\` ranks them by a policy chain);`,
    `# \`- embed: other.definition\` splices another journey's stages in BY REFERENCE.`,
    `stages:`,
    `  - key: gather`,
    `    label: Gather`,
    `    detail: "Parallel strands, side by side"`,
    `    lanes:`,
    `      - {label: Strand A, out: strand-a.list}`,
    `      - {label: Strand B, out: strand-b.list}`,
    `  - key: pool`,
    `    label: The pool`,
    `    detail: "Every strand above, collated into one list"`,
    `    collate: pool.list`,
    ``,
  ].join("\n");
}

function calendarText(stem: string): string {
  return [
    `title: ${JSON.stringify(stem)}`,
    `description: "A lens over one board: the schedule its dependency edges, durations and due date produce. Nothing is stored here — it recomputes on every open."`,
    `board: board.kanban   # a ref resolved against this file's folder`,
    `# due: 2026-12-31     # optional — overrides the board's own due date`,
    ``,
  ].join("\n");
}

function schemaText(stem: string): string {
  return [
    `type: kanban`,
    `title: ${JSON.stringify(stem)}`,
    `# The SHAPE half of a structured node — a \`<name>.node\` folder holding one schema and one`,
    `# content child. Entries carry STABLE IDS: the content references the id (\`column: triage\`),`,
    `# never the label, so labels can be reworded freely.`,
    `columns:`,
    `  - {id: triage, label: Triage, detail: "being analyzed"}`,
    `  - {id: doing, label: Doing}`,
    `  - {id: done, label: Done}`,
    ``,
  ].join("\n");
}

function workupText(stem: string): string {
  return [
    `title: ${JSON.stringify(stem)}`,
    `description: "The systematic examination one document goes through — ordered steps, each with its instructions, each producing ONE output file of an ordinary kind."`,
    `# source: the-document.md   # the file this workup examines; without it this is a TEMPLATE (the regimen)`,
    `# outdir:                   # where relative outputs land — default "<source stem> workup/" beside the source`,
    `steps:`,
    `  - key: extract`,
    `    label: Extract the obligations`,
    `    instructions: "List every obligation the document imposes, one row each, with the clause it comes from."`,
    `    output: obligations.list`,
    `  - key: audit`,
    `    label: Audit the extraction`,
    `    instructions: "Check every obligation against the source; note what was missed or overstated."`,
    `    output: audit.brief`,
    ``,
  ].join("\n");
}

function programText(stem: string): string {
  return [
    `title: ${JSON.stringify(stem)}`,
    `description: "Code as execution — a bounded transformer with an explicit contract: what it reads from the store, what it writes back, and the code between. The view gives it a Run button."`,
    `language: python`,
    `# Handles are absolute store paths; inputs land in the run's working directory under their \`as\` names.`,
    `inputs:`,
    `  - {handle: /input.csv, as: input.csv}`,
    `outputs:`,
    `  - {from: output.csv, handle: /output.csv}`,
    `code: |`,
    `  import csv`,
    `  rows = list(csv.DictReader(open("input.csv", newline="")))`,
    `  with open("output.csv", "w", newline="") as f:`,
    `      w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else [])`,
    `      w.writeheader()`,
    `      w.writerows(rows)`,
    ``,
  ].join("\n");
}

function pulseText(stem: string): string {
  return [
    `title: ${JSON.stringify(stem)}`,
    `description: "The movement of a working memory: arrivals per focus per day (a heat grid from the store's timestamps) and the attention trail (the memory's journal). Derived live, never cached."`,
    `memory: /desk.memory   # the .memory this pulse reads — an absolute store path`,
    `days: 21`,
    ``,
  ].join("\n");
}

function movesText(stem: string): string {
  return [
    `title: ${JSON.stringify(stem)}`,
    `description: "What moved in a working memory, harvested by looking: every open diffs the store against the last snapshot and appends the differences to the log kept below the banner."`,
    `memory: /desk.memory   # the .memory this log follows — an absolute store path`,
    `keep: 200`,
    ``,
  ].join("\n");
}

function tablediffText(stem: string): string {
  return [
    `title: ${JSON.stringify(stem)}`,
    `description: "Two tables compared live: rows pair off by the key columns; added, deleted and changed rows are the verdicts. Recomputed on every open."`,
    `left:  {handle: /proposed.csv, label: Proposed}`,
    `right: {handle: /base.csv, label: Base}`,
    `key: [Id]`,
    `# compare: [Amount]   # omitted = every shared column except the key`,
    `# ignore: [Notes]     # subtracted from the default compare set`,
    ``,
  ].join("\n");
}

/** The template for `path`; `title` overrides the name-derived one; `content` is honoured by text kinds only. */
/** Two rows to start from — the shape is one JSON object per line, nothing else. */
function jsonlText(): string {
  return [
    JSON.stringify({ id: 1, name: "First row", amount: 10, done: true }),
    JSON.stringify({ id: 2, name: "Second row", amount: 20, done: false, note: "any key becomes a column" }),
    "",
  ].join("\n");
}

/** Rules only — the shape, no prose: what a rule is lives in the spec (middlewareDoc.ts). */
function middlewareText(): string {
  return [
    `source: rows.jsonl`,
    `rules:`,
    `  - where:`,
    `      - {field: url, op: equals, value: "https://example.test/item/1"}`,
    `    set: {available: false}`,
    ``,
  ].join("\n");
}

/** The shape and nothing else: one item, one decision, one stage of each verb, one view — what each is lives in the spec (pipelineDoc.ts). */
function pipelineText(): string {
  return [
    `decisions:`,
    `  - key: method`,
    `    label: Method`,
    `    values: [{key: measured, label: Measured}, {key: anecdotal, label: Anecdotal}]`,
    `items:`,
    `  - {id: 8c1f2b6e-3d4a-4e5f-9a0b-1c2d3e4f5a6b, name: First item, price: 100}`,
    `stages:`,
    `  - key: corrections`,
    `    rules:`,
    `      - item: 8c1f2b6e-3d4a-4e5f-9a0b-1c2d3e4f5a6b`,
    `        set: {price: 90}`,
    `        when: [method=anecdotal]`,
    `  - key: band`,
    `    filter: [{field: price, op: lte, value: 1000}]`,
    `  - key: cheapest`,
    `    sort: [{field: price, dir: asc}]`,
    `views:`,
    `  - key: all`,
    `    label: All`,
    ``,
  ].join("\n");
}

const clipText = (stem: string) => [
  `title: ${stem}`,
  `tempo: 120`,
  `time: 4/4`,
  `bars: 1`,
  `notes:`,
  `  - {pitch: C3, start: 0, length: 1}`,
  `lanes:`,
  `  - {name: Kick, pitch: C2, steps: "x...x...x...x..."}`,
  ``,
].join("\n");

const songText = (stem: string) => [
  `title: ${stem}`,
  `tracks:`,
  `  - name: Track 1`,
  `    clips:`,
  `      - {file: ${stem}.clip, at: 0, repeat: 4}`,
  ``,
].join("\n");

function collectionText(): string {
  return [
    `source: rows.jsonl`,
    `to: Narooma NSW`,
    `fields: [name]`,
    `items: []`,
    `decisions: []`,
    ``,
  ].join("\n");
}

/** The checker's template (python/studio_kinds/data/templates/untitled.script) with the stem as its title. */
const scriptText = (stem: string) => `title: ${JSON.stringify(stem)}
description: "What this script does, in a line."
language: powershell
env:
  GREETING: Hello
cwd: .
code: |
  Write-Host "$env:GREETING from $(Get-Location)"
`;

/** The checker's template (untitled.views): three items with every role named, so all five views have something to show. */
const viewsText = (stem: string) => `title: ${JSON.stringify(stem)}
description: "One list of items; the roles under \`fields\` decide which views it offers."
fields:
  id: id
  title: title
  status: status
  start: start
  end: end
  previous: after
columns: [To do, Doing, Done]
items:
  - id: first
    title: The first thing
    status: Done
    start: 2026-12-01
    end: 2026-12-03
  - id: second
    title: What follows it
    status: Doing
    start: 2026-12-04
    end: 2026-12-10
    after: first
  - id: third
    title: And then this
    status: To do
    start: 2026-12-11
    end: 2026-12-12
    after: [second]
`;

/** The checker's template (untitled.page): a heading and two items, one partial for an item. */
const pageText = (stem: string) => `title: ${JSON.stringify(stem)}
model:
  heading: Hello
  items:
    - {name: First, note: the first thing}
    - {name: Second, note: what follows it}
partials:
  item: |
    <li><b>{{ item.name }}</b> — {{ item.note }}</li>
template: |
  <style>
    body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem; }
  </style>
  <h1>{{ heading }}</h1>
  <ul>
  {% for item in items %}{% include "item" %}{% endfor %}
  </ul>
`;

export function fileTemplate(path: string, title?: string, content?: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const stem = title?.trim() || (dot > 0 ? name.slice(0, dot) : name);
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const body = content?.trim() ? `${content.trim()}\n` : "";
  switch (ext) {
    case "md": case "markdown": return `# ${stem}\n\n${body}`;
    case "txt": return body;
    case "brief": return `title: ${stem}\ndescription: ""\nsections:\n  - title: First section\n    body: ""\n`;
    case "list": return `title: ${stem}\nitems: []\n`;
    case "frame": return dumpFrame(newFrameDoc(stem));
    case "flow": return ITEM_FILE_TEMPLATES.flow.replace("title: My flow", `title: ${stem}`);
    case "kanban": return kanbanText(stem);
    case "policy": return policyText(stem);
    case "playbook": return playbookText(stem);
    case "plan": return planText(stem);
    case "guide": return guideText(stem);
    case "points": return pointsText(stem);
    case "project": return newProjectText(stem);
    case "memory": return memoryText(stem);
    case "definition": return definitionText(stem);
    case "calendar": return calendarText(stem);
    case "schema": return schemaText(stem);
    case "workup": return workupText(stem);
    case "program": return programText(stem);
    case "pulse": return pulseText(stem);
    case "moves": return movesText(stem);
    case "tablediff": return tablediffText(stem);
    case "jsonl": return jsonlText();
    case "middleware": return middlewareText();
    case "collection": return collectionText();
    case "pipeline": return pipelineText();
    case "clip": return clipText(stem);
    case "song": return songText(stem);
    case "script": return scriptText(stem);
    case "views": return viewsText(stem);
    case "page": return pageText(stem);
    default: return body;
  }
}
