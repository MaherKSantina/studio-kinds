# The page and the endpoint — https://studio-kinds.pages.dev

The paste-and-check page and, under `/api/check`, the same check as an HTTP endpoint. Both run
`src/check.ts` — the engines of `packages/filekinds`, so what passes here renders in the Studio, the
desktop app and the VS Code extension. Deployed by Cloudflare Pages on every push to `master`
(`.github/workflows/deploy-page.yml`); `pnpm page:deploy` at the workspace root does the same by hand.

## POST /api/check

Stateless: the body is checked and answered — never logged, never stored, never cached
(`Cache-Control: no-store`). CORS is open, so a page anywhere may call it. At most 1 MB.

```bash
# the document as the body, the kind in the query (or an X-Kind header)
curl -X POST "https://studio-kinds.pages.dev/api/check?kind=kanban" --data-binary @launch.kanban

# or JSON
curl -X POST "https://studio-kinds.pages.dev/api/check" -H "content-type: application/json" \
     -d '{"kind":"policy","text":"title: t\ncases: []"}'

# the kinds it takes
curl "https://studio-kinds.pages.dev/api/check"
```

The answer is the page's own `CheckResult`:

```json
{ "ok": false, "kind": "kanban", "summary": "1 task in 1 row, 2 columns",
  "problems": [{ "message": "task a: needs `ghost` — no task has that key" }],
  "notes": [] }
```

`problems` carry `line` and `column` when they have a place in the text (a YAML error). `notes` say
what the check could not do: it sees the one document only, so a file the document names — a
playbook's file entry, a calendar's board, a data view's sources, a song's clips — is listed there,
not read. `studio-check` on a machine reads them.

Status 200 for a known kind (whatever the verdict), 400 for an unknown kind or a body with no kind,
405 for a method other than GET/POST/OPTIONS, 413 over the size.

Kinds: `brief`, `playbook`, `kanban`, `calendar`, `policy`, `flow`, `jsonl`, `middleware`,
`collection`, `clip`, `song`, `md` — the ones the page offers — and `guide`, checked when written
inside a playbook.

## Run it locally

```bash
pnpm page:dev                                  # the page, live
pnpm page:build && cd apps/page && npx wrangler pages dev dist   # page + endpoint, as deployed
pnpm --filter studio-page test                 # check.ts, the endpoint's handler, the page
```
