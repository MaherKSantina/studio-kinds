# .script — Script

## The engine's account

The check is `python/studio_kinds/kinds/script.py` in the studio-kinds repository; the account below is that engine's own.

The `.script` file kind: a script as a document — the code, the language it
runs in, the environment variables the run gets, and where it runs. Opened,
it shows the source and the variables and offers Run; pressed, the host
writes the code to a file and starts the interpreter with those variables in
its environment, in the folder named by `cwd` (this file's folder when
absent), and shows the exit code, the output and the errors. The file is
never changed by running.

Authoring shape (YAML, lenient — a half-written file still renders):

  title: Rebuild the index
  description: one line
  language: powershell        # powershell | pwsh | bash | sh | python | node | cmd
  env:                        # the environment variables the run gets —
    INDEX_DIR: C:\Github\index  # saved here, shown on open
    DRY_RUN: "1"
  cwd: .                      # where the code runs, relative to this file's folder
  code: |
    Write-Host "Rebuilding $env:INDEX_DIR"

`language` names the interpreter the host starts (`powershell` is
`powershell.exe` on Windows and `pwsh` elsewhere; `python` and `node` are the
commands on the host's PATH; `cmd` is Windows only). A variable's name is an
identifier (`[A-Za-z_][A-Za-z0-9_]*`) and its value text, a number or a
boolean — anything else cannot be an environment variable. A variable written
in the file overrides the host's own of the same name for the run and nothing
else.

The CHECKER names: not a mapping, no `title`, no `language` or one the hosts
do not know, `env` that is not a mapping, a variable with a name that is not
an identifier or a value that is not a scalar, a `cwd` that is not text, and
no `code` (or code that is not text, or blank).

## A fresh document (what the Studio creates)

```yaml
title: "untitled"
description: "What this script does, in a line."
language: powershell
env:
  GREETING: Hello
cwd: .
code: |
  Write-Host "$env:GREETING from $(Get-Location)"
```
