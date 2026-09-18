# studio-kinds

Versioned YAML document kinds — today a **playbook** and a **brief** — as three things that share one engine:

- **the engines** (`kinds/`): pure TypeScript, `js-yaml` its only dependency. Parse, dump, derive, and say what is wrong.
- **the page**: the document as YAML on the left, what it means on the right, checked and rendered on every keystroke — in the browser, with nothing sent anywhere.
- **the endpoint** (`POST /api/check`): the same check as a stateless request, for tools that cannot open a page.

Nothing is stored, logged, cached or remembered, on purpose: the page exists so a document can be looked at on a machine where nothing else may run.

## The kinds

**`.playbook`** — where we are, what can happen, and what is true while it does. Three authored lists: `decisions` (the state space — a state is the set of answers taken, never an entry in a list), `events` (global, unowned; what varies is whether they can arise, what we do about them, and whether they move us), `topics` (content that is true while you stand here), plus `rules` over the events. Content is chosen by answers and never reads them. The walk in the page takes answers, opens events, walks through doors, and shows the content each moment shows.

**`.brief`** — a title, a line, and titled sections with markdown bodies, nested.

**`.md`** — markdown, rendered.

### Versions

A kind that changes shape says so in the file: `version: N` at the top, a whole number. Absent means 1, so every file written before the kind was versioned is version 1 without being touched. A kind keeps every version it has ever had — version N's parser and renderer stay as they were when N was current — so a file never changes meaning because the kind moved on. A version the engine does not know is named by the check, and a Studio that writes files back never writes such a file (it would come back as the version it was read as, with the rest gone).

`.playbook` is at **version 2**, and the two versions are two shapes. Version 1 (no `version:` line) is the book described above: decisions, events, topics, rules, and every content entry a file beside the book — `{file, label?, by?}`, varying by answer as `notes.md.variants/entity=<answer>.md`; the host writes the answers taken into `view`. Version 2 (`version: 2` at the top) keeps decisions, events and rules but is **session-only** and **one file**: there is no `view`, every decision opens unanswered and nothing clicked is ever saved; there are no topics (what is always true is the content of an always-on event); and each event has one content entry written in the book, never a `file`: one document (`kind` + `doc`), or a closed set that follows the answer (`kind` + `by` + `docs`, one document per answer combination keyed `decision=answer,…` in `by` order). While a `by` decision is unanswered the pane shows the rule's `process` and asks for the answer.

```yaml
version: 2
title: A tiny venture
decisions:
  - key: entity
    label: What are we?
    values: [{key: company, label: A company}, {key: partnership, label: A partnership}]
events:
  - key: incorporate
    label: We incorporate
    trigger: chosen
    content:                   # ONE entry — a mapping, not a list
      key: paperwork           # optional: what the walk collapses by
      label: The paperwork
      kind: brief              # written HERE; `kind` names the renderer
      by: [entity]             # the set follows this answer
      docs:
        entity=company: {title: As a company, sections: [{title: The name, body: Hold it for 60 days.}]}
        entity=partnership: {title: As a partnership, sections: [{title: The deed, body: Sign it.}]}
rules:
  - {event: incorporate, when: [entity=company], status: ready}
  - {event: incorporate, when: [entity=partnership], status: ready}
  - {event: incorporate, status: gap, process: Say what we are first.}
```

A version-2 book is **one file**: paste it, check it, render it with nothing else on disk. The check runs each written document through its own kind's engine — a written playbook (`kind: playbook`, the book under `doc`) is walked and checked as a book of its own, at the version it says. A document shared between books is a version-1 file; this page names such a file and does not read it, because it has no folder.

Refused: `doc` or `docs` without `kind`, `doc` and `docs` together, `by` on a `doc`, `docs` without `by`, a `docs` key that is not a combination of the `by` answers, a combination with no document, an `md` document that is not a string, a written entry in a version-1 file (add `version: 2`), and — in a version-2 file — `topics`, `view`, a `content` list, a `file` on an entry (write the document into the book, delete the view, or take `version: 2` off).

The full field reference is the header comment of `kinds/playbookDoc.ts`.

## The page

Paste YAML, or open a file (the extension picks the kind), or start from the template. The left pane is the truth: the right pane is re-checked and re-rendered from it on every change, and answers taken in the walk are session-only — they are never written back into the text, and they reset when the text changes.

- `npm run dev` — serve it locally.
- `npm run build` — a static `dist/` that also opens straight from the file system.

## The endpoint

`POST /api/check` takes one document and answers with the same result the page computes:

```bash
curl -X POST "https://<host>/api/check?kind=playbook" --data-binary @book.playbook
```

```bash
curl -X POST "https://<host>/api/check" -H "content-type: application/json" \
  -d '{"kind":"brief","text":"title: t\nsections: []"}'
```

The kind comes from `?kind=`, an `X-Kind` header, or the JSON body. The answer:

```json
{
  "ok": false,
  "kind": "playbook",
  "version": 2,
  "summary": "v2 · 1 decisions, 4 events, 0 topics, 4 written inline",
  "problems": [{ "message": "event e: Map: an `md` document is its text — write it as a block string" }],
  "notes": []
}
```

`problems` is empty when `ok` is true; a YAML error comes with `line` and `column`. `notes` is what the check could not do. `GET /api/check` lists the kinds. Every answer carries `Cache-Control: no-store` and open CORS. A missing or unknown kind is a 400, a body over 1 MB a 413.

The endpoint is a Cloudflare Pages Function (`functions/api/check.ts`); `handle(request)` in that file is the whole behaviour and is tested without a runtime.

## Privacy

- The page makes no requests: no fonts, no analytics, no storage of any kind — `localStorage` included. Reload and it is gone.
- The endpoint reads the body, answers, and forgets it. Nothing is logged by this code; Cloudflare's own request logs are whatever your account's plan keeps, so if that matters, run the check in the page instead — it is the same code.
- Markdown is sanitised before it is rendered.

Note for a managed machine: the page loads nothing but itself, but a POST to the endpoint is still a document leaving the machine. Use the page where that is the rule.

## Develop

```bash
npm install
npm test          # the engines (mirrored tests), the check, the endpoint
npm run build     # typecheck + the static page
```

Node 20 or newer. Tests are Vitest; the page is Vite + React.

## Deploy — Cloudflare Pages, free

Either connect the repository in the Cloudflare dashboard (framework: none; build command `npm run build`; output directory `dist` — the `functions/` folder is picked up beside it), or from a machine that is logged in:

```bash
npx wrangler login
npm run deploy
```

Both give the page and `/api/check` on one host. GitHub Pages can host the page alone (it cannot run the function): publish `dist/`.

## Where the engines come from

`kinds/` is mirrored from the private suite the kinds grew in (`pnpm kinds:sync` there copies `docVersion.ts`, `decisionSpace.ts`, `playbookDoc.ts`, `featureTree.ts`, `briefDoc.ts` and the engine tests; a file that imports anything outside that set is refused). Edit them there, not here, until the day the suite consumes this package instead — at which point this folder becomes the source. `kinds/fileTemplates.ts` is this repository's own.

## What is not here yet

The other kinds of the suite (guide, list, kanban, calendar, points, definition, memory, …), a package per kind on npm, and reading a folder so `file` entries render. One repository, one engine per kind, one `check(kind, text)` — that shape holds as they arrive.

## License

MIT.
