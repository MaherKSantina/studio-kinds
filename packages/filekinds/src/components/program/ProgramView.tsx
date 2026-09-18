/**
 * A `.program` open — the executable step of a journey, shown AS its
 * contract: what it reads from the store, what it writes back, the code
 * between, and a RUN button. Running happens on the host's runner (the nodes
 * worker); the result panel shows exit, stdout/stderr, and the output
 * handles — the outputs themselves land in the store as ordinary nodes, so
 * the person presses play and reads the result where everything else lives.
 * A host with no runner renders the same page read-only.
 */
import React, { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CircleAlert, CircleCheck, Loader2, Play } from "lucide-react";
import { Button, CopyHandleButton, SUITE_APPS, cn } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { configuredRunner, type ProgramRunResult } from "../../api";
import { parseProgram } from "../../lib/programDoc";

function HandleRow({ icon, left, right }: { icon: React.ReactNode; left: string; right: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      {icon}
      <span className="font-mono text-muted-foreground">{left}</span>
      <span className="text-muted-foreground">→</span>
      <span className="min-w-0 truncate font-mono">{right}</span>
    </div>
  );
}

export default function ProgramView({ content, path, agentId, height = "100%" }: ViewerProps) {
  const docPath = path ?? agentId ?? null;
  const doc = useMemo(() => parseProgram(content), [content]);
  const runner = configuredRunner();

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ProgramRunResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!runner || !docPath) return;
    setRunning(true); setResult(null); setErr(null);
    try {
      setResult(await runner(docPath));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ height }} className="min-h-0 overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl space-y-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{doc.title}</h2>
          <span className="rounded border bg-accent px-1.5 py-px font-mono text-xs text-accent-foreground">{doc.language}</span>
          {docPath && <CopyHandleButton path={docPath} />}
          <Button size="xs" onClick={run} disabled={!runner || running || !docPath}
            title={runner ? "Execute the program on the nodes worker — outputs land in the store" : "This host has no runner configured — open it in Nodes to run"}>
            {running ? <Loader2 className="animate-spin" /> : <Play />} {running ? "Running…" : "Run"}
          </Button>
        </div>
        {doc.description && <p className="max-w-2xl text-[12px] leading-snug text-muted-foreground">{doc.description}</p>}

        {/* The contract — the program's only doorway to the store. */}
        <div className="space-y-1 rounded-lg border bg-card px-3 py-2">
          {doc.inputs.map((i) => (
            <HandleRow key={i.handle} icon={<ArrowDownToLine className="size-3 shrink-0 text-sky-600" />}
              left={`nodes:${i.handle}`} right={i.as} />
          ))}
          {doc.outputs.map((o) => (
            <HandleRow key={o.handle} icon={<ArrowUpFromLine className="size-3 shrink-0 text-emerald-600" />}
              left={o.from} right={`nodes:${o.handle}`} />
          ))}
          {!doc.inputs.length && !doc.outputs.length && (
            <p className="text-[13px] text-muted-foreground">No contract declared — the run would read and write nothing.</p>
          )}
        </div>

        <pre className="overflow-x-auto rounded-lg border bg-sidebar/60 p-3 font-mono text-[13px] leading-5">{doc.code || "(no code)"}</pre>

        {err && <p className="text-sm text-destructive">{err}</p>}
        {result && (
          <div className={cn("space-y-2 rounded-lg border px-3 py-2",
            result.ok ? "border-emerald-300 bg-emerald-50/50" : "border-red-300 bg-red-50/50")}>
            <p className="flex items-center gap-1.5 text-[12px] font-semibold">
              {result.ok ? <CircleCheck className="size-3.5 text-emerald-600" /> : <CircleAlert className="size-3.5 text-red-600" />}
              {result.ok ? "Run succeeded" : "Run failed"}
              <span className="font-normal text-muted-foreground">· exit {result.exitCode ?? "—"} · {(result.durationMs / 1000).toFixed(1)}s</span>
            </p>
            {result.outputs.length > 0 && (
              <div className="space-y-0.5">
                {result.outputs.map((h) => (
                  <p key={h} className="flex items-center gap-2 text-[13px]">
                    <span className="font-mono">nodes:{h}</span>
                    <a className="text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                      href={`${SUITE_APPS.nodes.origin}/?path=${encodeURIComponent(h)}`}>open</a>
                  </p>
                ))}
              </div>
            )}
            {result.stdout.trim() && <pre className="overflow-x-auto rounded border bg-background p-2 font-mono text-[13px] leading-4">{result.stdout.trim()}</pre>}
            {result.stderr.trim() && <pre className="overflow-x-auto rounded border bg-background p-2 font-mono text-[13px] leading-4 text-red-700">{result.stderr.trim()}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}
