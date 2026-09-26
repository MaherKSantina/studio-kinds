# How a script works

<!-- Generated from kinds/script/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

A script as a document — the code, its interpreter, the environment variables written in the file and shown on open, and a Run button that starts it on the host and shows what it printed; the file is never changed by running.

This is the `.script` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Does the host have a runner?** (`host`) — The page is the same everywhere; only Run differs.

- `runner` — Yes — a host that runs scripts. The web Studio over a folder (the folder worker runs it), the desktop app (its shell runs it), VS Code (the extension runs it). Run starts the interpreter; the result panel shows the exit code, the output and the errors.
- `none` — No runner. A host with no runner configured — a preview inside another document, a story. The same page, read-only; Run is disabled and says so.

## Always

*imposed*

What holds at every moment — the shape of the file, what a run is, and where the engine lives.

### The shape of the file

The code, the interpreter, the variables and the folder — everything a run needs, in one file.

#### Top-level keys

| key | what it is |
|---|---|
| `title` | the heading |
| `description` | one line under it |
| `language` | the interpreter — `powershell`, `pwsh`, `bash`, `sh`, `python`, `node` or `cmd` |
| `env` | the environment variables the run gets, by name: text, a number or a boolean |
| `cwd` | where the code runs, a folder relative to this file's own (default: the file's folder) |
| `code` | the script itself, as a block string |

```yaml
title: Rebuild the index
language: powershell
env:
  INDEX_DIR: C:\Github\index
  DRY_RUN: "1"
cwd: .
code: |
  Write-Host "Rebuilding $env:INDEX_DIR"
```

A variable's name is an identifier (`[A-Za-z_][A-Za-z0-9_]*`); a number or a boolean
written as its value reaches the run as text (`1`, `true`). A variable in the file
overrides the host's own of the same name for the run and nothing else.

#### What a run is

The host writes `code` to a temporary file with the interpreter's extension and starts
the interpreter on it — `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass
-File` on Windows and `pwsh -NoProfile -NonInteractive -File` elsewhere for `powershell`;
`pwsh`, `bash`, `sh`, `python` and `node` as the commands on the host's PATH; `cmd.exe /d /c`
for `cmd`, Windows only — with the host's environment plus `env`, in `cwd` resolved
against the file's folder, which the run cannot leave. The output and the errors are
captured (the first megabyte of each), a run is ended after ten minutes, and the result is
the exit code, the two streams and the duration. Nothing writes the file: what the script
itself writes to disk is its own business.

#### Why the variables are in the file

A script that needs a folder, a key name or a flag carries them under `env`, so opening
the file shows exactly what a run will see, and a copy of the file runs the same way
elsewhere. A value that must stay off disk (a secret) belongs in the host's own
environment, which the run inherits; the file overrides only what it names.

#### Where the engine lives

`python/studio_kinds/kinds/script.py` — `parse`, `problems`, `summary`, `LANGUAGES`;
its header comment is what `studio-check --spec script` prints. The shape is
`kinds/script/v1.schema.json` and the field table `v1.fields.yaml`. The view is
`components/script/ScriptView.tsx` over `lib/scriptDoc.ts`; a host's runner is
`configureFileKinds({ runScript })` — the folder worker's `POST /api/run/script`, the
desktop shell's `script:run`, the VS Code extension's `runScript` RPC.

## The file is opened

*imposed*

parseScript reads the YAML once and never throws; the variables and the code are drawn, with Run.

> Say whether the host has a runner — the page is the same; only Run differs.

### When `host=runner`

#### The page, with Run live

##### The parse

The title ("Script" when absent), the description, the language lower-cased, the
variables whose name is an identifier and whose value is a scalar (the rest are
dropped — the checker names them), `cwd`, and the code (empty when absent).

##### What is drawn

The title, a chip with the language, and Run. Under it the description. Then
**Environment**: one row per variable, name and value in monospace, "No variables —
the run gets the host's environment as it is." when there are none, and "runs in
`<cwd>`" when the file names one. Then the code in a monospace block with line
numbers ("(no code)" when empty). No result yet.

### When `host=none`

#### The page, read-only

##### The parse

The same parse — the title, the description, the language, the variables, `cwd`,
the code.

##### What is drawn

The same page — title, language chip, the environment rows, the code block — with
Run disabled and titled "This host has no runner — open the file in the Studio over a
folder, the desktop app or VS Code to run it". Nothing here writes.

## Run is clicked

*chosen · many* — only when `host=runner`

The host runs the script; the result panel reports; the file is untouched.

The button reads "Running…" with a spinner while the host is handed the file's path and the
parsed run — the language, the code, the variables and `cwd`. The web Studio's folder worker
reads the file at that path from disk and runs what it holds, so nothing a page sends reaches
the shell; the desktop shell and the VS Code extension run what the page parsed. The panel then
shows "Run succeeded" or "Run failed" with `exit N · N.Ns`, the standard output, and the
standard error in red. A failure to start the interpreter (a language the host cannot start, a
command not on its PATH) shows its message in red instead. The last result stays on the page
until the next run; the file itself is never changed by running.

## The file changes on disk

*imposed · many*

The host re-reads; the variables and the code redraw; the last result stays.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The script re-parses and the page redraws; the result
panel from the last run stays until Run is pressed again.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser never refuses, so the checker names what it dropped or defaulted.

### What the checker does

The order it runs in, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `problems`: not a mapping; no `title`; no `language`, or one that is not
   `powershell`, `pwsh`, `bash`, `sh`, `python`, `node` or `cmd`; `env` that is not a
   mapping; a variable whose name is not an identifier or whose value is not text, a
   number or a boolean; a `cwd` that is not text; no `code`, `code` that is not text,
   or `code` that is blank.
3. The summary line: `ok <name>  Script  powershell · 2 variables · 12 lines`.

#### Not checked

Whether the interpreter is on the host's PATH (the run says so). Whether `cwd` exists.
What the code does. The checker sees the file alone, which is all there is.

## A script is written

*chosen*

### Write a script

The interpreter, the variables, the code.

#### Start from the template

`studio-check --template script > new.script` — PowerShell, one variable, one line
that prints it; replace them.

#### Name the interpreter

`language` is one of `powershell`, `pwsh`, `bash`, `sh`, `python`, `node`, `cmd`, and
the command has to be on the host's PATH.

#### Write the variables

One `env` entry per value the code reads — a folder, a name, a flag — so the file
says what a run sees. Secrets stay in the host's environment; the run inherits it.

#### Write the code against the variables

Read them the interpreter's way — `$env:NAME` in PowerShell, `$NAME` in bash,
`os.environ["NAME"]` in Python, `process.env.NAME` in Node. Paths relative to `cwd`.

#### Check it, then run it

`studio-check new.script` — a language the hosts cannot start, a variable that is not
one, blank code: each is a line. Open the file in the Studio over a folder, the desktop
app or VS Code and press Run.
