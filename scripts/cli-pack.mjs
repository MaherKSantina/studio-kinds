/**
 * What the `studio-check` package carries besides `dist/check.cjs`, so the
 * command answers `--spec`, `--book`, `--fields` and `--books` on a machine
 * that has no checkout of this repository:
 *
 *   apps/cli/kinds/<ext>/v<N>.playbook, v<N>.fields.yaml   copied from kinds/
 *   apps/cli/specs/<engine>.ts.txt                          each engine file's header comment
 *
 * `pnpm cli:pack` runs this before `npm pack`; both folders are ignored by git.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "apps", "cli");
const LIB = join(ROOT, "packages", "filekinds", "src", "lib");

/** The leading comment of an engine file — the same cut `studio-check --spec` makes. */
function headerOf(src) {
  if (src.startsWith("/**")) {
    const end = src.indexOf("*/");
    return src.slice(3, end).split("\n").map((l) => l.replace(/^\s*\*\s?/, "")).join("\n").trim();
  }
  const lines = [];
  for (const l of src.split("\n")) { if (l.startsWith("//")) lines.push(l.replace(/^\/\/\s?/, "")); else if (lines.length) break; }
  return lines.join("\n").trim();
}

rmSync(join(CLI, "kinds"), { recursive: true, force: true });
cpSync(join(ROOT, "kinds"), join(CLI, "kinds"), { recursive: true });

rmSync(join(CLI, "specs"), { recursive: true, force: true });
mkdirSync(join(CLI, "specs"), { recursive: true });
let n = 0;
for (const name of readdirSync(LIB)) {
  if (!name.endsWith(".ts") || name.includes(".test.")) continue;
  const header = headerOf(readFileSync(join(LIB, name), "utf8"));
  if (!header) continue;
  writeFileSync(join(CLI, "specs", `${name}.txt`), header + "\n");
  n++;
}
console.log(`apps/cli/kinds: ${readdirSync(join(CLI, "kinds")).length} kinds; apps/cli/specs: ${n} engine headers`);
