/**
 * RUNS A `.script` DOCUMENT on this machine — what the kind's book calls a run
 * (kinds/script/v1.playbook, "What a run is"): the code is written to a
 * temporary file with the interpreter's extension and the interpreter named
 * by `language` is started on it, with this process's environment plus the
 * document's `env`, in the document's `cwd` resolved against its own folder —
 * which may not leave the open folder. The output and the errors are kept to
 * their first megabyte each; a run is ended after ten minutes. The result is
 * the exit code, the two streams and the duration; the document is never
 * touched.
 *
 * The same runner stands in the VS Code extension (apps/vscode/scriptRunner.cjs)
 * and, in TypeScript, in the suite's folder worker; the interpreter table is
 * the one the checker's LANGUAGES names.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const WIN = process.platform === "win32";
const INTERPRETERS = {
  powershell: { ext: ".ps1", cmd: WIN ? "powershell.exe" : "pwsh", args: WIN ? ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"] : ["-NoProfile", "-NonInteractive", "-File"] },
  pwsh: { ext: ".ps1", cmd: "pwsh", args: ["-NoProfile", "-NonInteractive", "-File"] },
  bash: { ext: ".sh", cmd: "bash", args: [] },
  sh: { ext: ".sh", cmd: "sh", args: [] },
  python: { ext: ".py", cmd: "python", args: ["-u"] },
  node: { ext: ".js", cmd: "node", args: [] },
  cmd: { ext: ".cmd", cmd: "cmd.exe", args: ["/d", "/c"] },
};
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LIMIT = 1024 * 1024;
const TIMEOUT_MS = 10 * 60 * 1000;

/**
 * @param {{ language: string, code: string, env?: Record<string, string>, cwd?: string }} run
 * @param {{ root: string, docDir: string }} where — the open folder, and the document's own folder
 * @returns {Promise<{ ok: boolean, exitCode: number | null, stdout: string, stderr: string, durationMs: number }>}
 */
async function runScript(run, where) {
  const language = String(run?.language ?? "").trim().toLowerCase();
  const it = INTERPRETERS[language];
  if (!it) throw new Error(`No interpreter for language "${language}" — one of ${Object.keys(INTERPRETERS).join(", ")}`);
  if (language === "cmd" && !WIN) throw new Error("cmd is Windows only");
  const code = typeof run?.code === "string" ? run.code : "";
  if (!code.trim()) throw new Error("Nothing to run — the code is blank");
  const root = path.resolve(where.root);
  const cwd = path.resolve(where.docDir, typeof run?.cwd === "string" && run.cwd ? run.cwd : ".");
  if (cwd !== root && !cwd.startsWith(root + path.sep)) throw new Error(`cwd "${run.cwd}" is outside the open folder (${root}) — a run stays inside the folder the Studio has open: open a folder above it, or set cwd to a folder inside`);
  const env = { ...process.env };
  for (const [k, v] of Object.entries(run?.env ?? {})) {
    if (NAME.test(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) env[k] = String(v);
  }
  const file = path.join(os.tmpdir(), `studio-script-${process.pid}-${Date.now().toString(36)}${it.ext}`);
  await fs.writeFile(file, code, "utf8");
  const started = Date.now();
  try {
    return await new Promise((resolve, reject) => {
      let out = "", err = "";
      const child = spawn(it.cmd, [...it.args, file], { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      const timer = setTimeout(() => { try { child.kill(); } catch { /* already gone */ } err += `\n[ended after ${TIMEOUT_MS / 60000} minutes]`; }, TIMEOUT_MS);
      child.stdout.on("data", (b) => { if (out.length < LIMIT) out += String(b); });
      child.stderr.on("data", (b) => { if (err.length < LIMIT) err += String(b); });
      child.on("error", (e) => { clearTimeout(timer); reject(new Error(e.code === "ENOENT" ? `Command not found on this host's PATH: ${it.cmd}` : e.message)); });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({ ok: exitCode === 0, exitCode, stdout: out, stderr: err, durationMs: Date.now() - started });
      });
    });
  } finally {
    await fs.rm(file, { force: true }).catch(() => { /* a leftover in tmp is harmless */ });
  }
}

module.exports = { runScript, INTERPRETERS };
