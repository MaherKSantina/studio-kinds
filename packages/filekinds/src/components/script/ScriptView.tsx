/**
 * A `.script` open — the source you read before you run it: the language, the
 * environment variables written in the file, the code with line numbers, and
 * RUN. Running happens on the host (`configureFileKinds({ runScript })`: the
 * folder worker, the desktop shell, the VS Code extension); the result panel
 * shows the exit code, the output and the errors. A host with no runner shows
 * the same page with Run disabled. Nothing here writes the file.
 */
import React, { useMemo, useState } from "react";
import { CircleAlert, CircleCheck, FolderOpen, Loader2, Play } from "lucide-react";
import { Button, cn } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { configuredScriptRunner, type ScriptRunResult } from "../../api";
import { parseScript, scriptRunOf } from "../../lib/scriptDoc";

export default function ScriptView({ content, path, agentId, height = "100%" }: ViewerProps) {
  const docPath = path ?? agentId ?? null;
  const doc = useMemo(() => parseScript(content), [content]);
  const runner = configuredScriptRunner();
  const lines = useMemo(() => (doc.code ? doc.code.replace(/\n$/, "").split("\n") : []), [doc.code]);
  const env = Object.entries(doc.env);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScriptRunResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!runner || !docPath) return;
    setRunning(true); setResult(null); setErr(null);
    try {
      setResult(await runner(docPath, scriptRunOf(doc)));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ height }} className="min-h-0 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-4xl space-y-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{doc.title}</h2>
          <span className="rounded border bg-accent px-1.5 py-px font-mono text-xs text-accent-foreground">{doc.language || "no language"}</span>
          <Button size="xs" onClick={run} disabled={!runner || running || !docPath || !doc.code.trim()}
            title={runner
              ? "Run the script on this host — the interpreter starts with the variables below"
              : "This host has no runner — open the file in the Studio over a folder, the desktop app or VS Code to run it"}>
            {running ? <Loader2 className="animate-spin" /> : <Play />} {running ? "Running…" : "Run"}
          </Button>
        </div>
        {doc.description && <p className="max-w-2xl text-[12px] leading-snug text-muted-foreground">{doc.description}</p>}

        {/* The environment — what the run sees, exactly as the file says. */}
        <div className="rounded-lg border bg-card px-3 py-2">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Environment</span>
            {doc.cwd && (
              <span className="flex items-center gap-1 normal-case tracking-normal" title="Where the code runs, relative to this file's folder">
                <FolderOpen className="size-3" /> runs in <span className="font-mono">{doc.cwd}</span>
              </span>
            )}
          </div>
          {env.length ? (
            <table className="w-full text-[13px]">
              <tbody>
                {env.map(([k, v]) => (
                  <tr key={k} className="align-top">
                    <td className="w-[1%] whitespace-nowrap pr-4 font-mono text-muted-foreground">{k}</td>
                    <td className="break-all font-mono">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[13px] text-muted-foreground">No variables — the run gets the host's environment as it is.</p>
          )}
        </div>

        {/* The code, with line numbers. */}
        <div className="overflow-x-auto rounded-lg border bg-sidebar/60">
          {lines.length ? (
            <table className="w-full border-collapse font-mono text-[13px] leading-5">
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="w-[1%] select-none whitespace-nowrap border-r px-2 text-right text-muted-foreground/60">{i + 1}</td>
                    <td className="whitespace-pre px-3">{l || " "}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-3 font-mono text-[13px] text-muted-foreground">(no code)</p>
          )}
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}
        {result && (
          <div className={cn("space-y-2 rounded-lg border px-3 py-2",
            result.ok ? "border-emerald-300 bg-emerald-50/50" : "border-red-300 bg-red-50/50")}>
            <p className="flex items-center gap-1.5 text-[12px] font-semibold">
              {result.ok ? <CircleCheck className="size-3.5 text-emerald-600" /> : <CircleAlert className="size-3.5 text-red-600" />}
              {result.ok ? "Run succeeded" : "Run failed"}
              <span className="font-normal text-muted-foreground">· exit {result.exitCode ?? "—"} · {(result.durationMs / 1000).toFixed(1)}s</span>
            </p>
            {result.stdout.trim() && <pre className="overflow-x-auto rounded border bg-background p-2 font-mono text-[13px] leading-4">{result.stdout.trim()}</pre>}
            {result.stderr.trim() && <pre className="overflow-x-auto rounded border bg-background p-2 font-mono text-[13px] leading-4 text-red-700">{result.stderr.trim()}</pre>}
            {!result.stdout.trim() && !result.stderr.trim() && <p className="text-[13px] text-muted-foreground">Nothing was printed.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
