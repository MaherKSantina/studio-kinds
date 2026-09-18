# crosscut

Shared kit for the tool suite (Nodes, Policy Studio, Mission Control). Ships as
**source** — apps depend on it with `"crosscut": "file:../../crosscut"` and
Vite compiles it like their own code.

```
src/
  decision/     the golden-rules engine (see below)
  decisions/    hierarchical decision spaces (SpaceDecision, toggleRef, pruning)
  fs/           FileSystemAdapter contract + http/memory adapters + fs rule tables
  autosave/     autosave state machine (rules) + useAutosave hook (driver)
  components/   AppShell, FileBrowser, DirectoryTree, FilePickerDialog, DecisionPills, dialogs
  components/ui shadcn-style primitives (light-mode tokens in tokens.css)
stories/        Storybook (npm run storybook → :9130)
```

## Golden rules tables

Every non-trivial behaviour lives in a `*.rules.ts` file as a `DecisionTable`:
rows of `{ rule, because, when, then }`, first match wins, mandatory
`otherwise`. UI calls `decide(table, ctx)` and renders the outcome — never a
re-implementation inline.

- **Read a feature**: open its `*.rules.ts`. Each row carries a `because`.
- **Regression**: every table has a `*.golden.test.ts` next to it — a list of
  `(ctx → expected outcome, via rule)` rows run by vitest (`npm test`).
  `checkGolden` reports exactly which named behaviour moved.
- **Docs that can't drift**: `tableToMarkdown(table)` renders the live object;
  the "Golden rules / Tables" story shows every table this package ships.
- **Debugging**: `explain(table, ctx)` traces which rules matched and which
  `when` keys rejected.

Tables in this package: `autosave`, `fs-name`, `picker-row`, `open-with`.
Apps add their own under `src/logic/` (e.g. mission-control's
`service-status`) and pin ported engines with plain golden tests (policy-studio's
`src/logic/playbook.golden.test.ts`).

## Consuming from an app

package.json: `"crosscut": "file:../../crosscut"`.

vite.config: `resolve.dedupe: ["react","react-dom"]` and add
`../../crosscut` to `server.fs.allow`.

tsconfig: point `react` / `react-dom` at the app's own `@types` copies via
`paths` (two linked copies otherwise fight).

index.css:
```css
@import "tailwindcss";
@import "tw-animate-css";
@import "../../../crosscut/src/tokens.css";
@source "../../../crosscut/src";
```
