# The page — https://studio-kinds.pages.dev

The paste-and-preview page: a Studio document as YAML on the left, the Studio's own renderer for its
kind on the right — the same components the web Studio, the desktop app and the VS Code extension
mount — redrawn on every keystroke. Beside the kind's menu: **Open a file…** (read here, with
FileReader), **Start from the template**, **How .\<ext\> works** (the kind's book, walked in a
dialog), **Schema** (the field table) and **Skill** (the studio-files skill — `skills/studio-files/SKILL.md`
rendered, with Copy and Download, for Claude.ai chat, Cowork and a Claude Code without this checkout).

Static: everything runs in the browser and nothing is fetched, sent, stored or remembered. The one
check the page makes is whether the text reads as YAML; the kind's rules are the checker's —
`pip install studio-kinds`, then `studio-check <file>` — on a machine.

The books, field tables, examples and the skill are bundled at build time from `kinds/`, `examples/`
and `skills/`, so the page is as current as the commit it was built from.

## Deploy

Cloudflare Pages, project `studio-kinds`, from `dist/`. `.github/workflows/deploy-page.yml` builds and
deploys on every push to `master` and every `studio-v*` tag, with the repository secrets
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. By hand, from the workspace root:

```bash
pnpm page:build                 # dist/
pnpm page:deploy                # build, then wrangler pages deploy (npx wrangler@4; a logged-in wrangler or CLOUDFLARE_API_TOKEN)
```

## Run it locally

```bash
pnpm page:dev                   # http://localhost:9270
pnpm --filter studio-page test  # the skill's parse, the page mounted with the real renderer
```
