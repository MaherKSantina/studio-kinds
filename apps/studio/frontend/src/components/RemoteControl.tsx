/**
 * REMOTE CONTROL, FROM THE FRONT DOOR — a chip in a corner of the folder's
 * start page. `claude rc` (Claude Code's Remote Control) is the server that
 * lets claude.ai/code and the Claude mobile app open sessions on this PC;
 * when its link drops while the owner is out, the PC is unreachable from the app
 * — but this page still answers through the tunnel. The chip shows how many
 * servers are alive, and its dialog restarts them: the folder worker
 * (`POST api/remote-control/restart`, remote-control.ps1 behind it) ends
 * every one and starts one per folder — the checkout and the served folder.
 * The chats open on the old servers end with them; new ones start in the app.
 * Only the folder entry mounts this (the drive and the desktop have no such
 * worker); a worker without the route hides the chip.
 */
import * as React from "react";
import { RadioTower } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "crosscut";

interface Server { pid: number; name: string; startedAt: string; sessions: number }
interface Report {
  ok: boolean;
  action: "status" | "restart";
  folders: string[];
  servers: Server[];
  stopped: { pid: number; name: string; sessions: number }[];
  started: { folder: string; name: string; pid: number | null }[];
  notes: string[];
  error?: string;
}

const folderName = (f: string) => f.split(/[\/]/).filter(Boolean).pop() ?? f;
const since = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
};

export function RemoteControl({ api }: { api: (p: string) => string }) {
  // null = not asked yet; "unavailable" = the worker has no such route (or is down): no chip.
  const [status, setStatus] = React.useState<Report | "unavailable" | null>(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Report | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const r = await fetch(api("api/remote-control"));
      if (!r.ok) throw new Error(`${r.status}`);
      const j = (await r.json()) as Report;
      setStatus(j.ok ? j : "unavailable");
    } catch { setStatus("unavailable"); }
  }, [api]);
  React.useEffect(() => { void refresh(); }, [refresh]);
  React.useEffect(() => { if (open) { setResult(null); setError(null); void refresh(); } }, [open, refresh]);

  const restart = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(api("api/remote-control/restart"), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = (await r.json()) as Report & { error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? `${r.status}`);
      setResult(j);
      setStatus(j);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  if (!status || status === "unavailable") return null;
  const servers = status.servers;
  const label = servers.length === 0 ? "none running" : `${servers.length} running`;
  return (
    <>
      <div className="fixed bottom-3 left-3 z-40">
        <Button size="sm" variant="outline" className="h-7 gap-1.5 bg-card/90 px-2 text-xs shadow-sm backdrop-blur" title="Claude Code's Remote Control on this PC"
                onClick={() => setOpen(true)}>
          <RadioTower className={`size-3.5 ${servers.length ? "text-emerald-600" : "text-destructive"}`} />
          {/* On a phone the memory's trail dots sit centred along the same edge: the count alone, out of their way. */}
          <span className="hidden sm:inline">Remote control · {label}</span>
          <span className="sm:hidden">{servers.length}</span>
        </Button>
      </div>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remote control</DialogTitle>
            <DialogDescription>
              <code>claude rc</code> is what lets the Claude app reach this PC. Restart ends every server running now
              and starts one in each folder. Chats open in the app end with their server: start new ones there.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium">Running now</p>
              {servers.length === 0
                ? <p className="text-muted-foreground">Nothing — the app cannot reach this PC until one starts.</p>
                : <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {servers.map((s) => (
                      <li key={s.pid}>{s.name || "unnamed"} · pid {s.pid} · since {since(s.startedAt)} · {s.sessions} session{s.sessions === 1 ? "" : "s"}</li>
                    ))}
                  </ul>}
            </div>
            <div>
              <p className="font-medium">A restart starts one in</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {status.folders.map((f) => <li key={f}>{folderName(f)} <span className="text-xs">({f})</span></li>)}
              </ul>
            </div>
            {result && (
              <div className="rounded-md border bg-muted/40 p-2">
                <p className="font-medium">Done</p>
                <p className="text-muted-foreground">
                  Stopped {result.stopped.length}, started {result.started.filter((s) => s.pid).length} of {result.started.length}.
                  {result.started.map((s) => ` ${s.name}${s.pid ? ` (pid ${s.pid})` : " (not seen yet)"}`).join(",")}
                </p>
                {result.notes.map((n) => <p key={n} className="text-xs text-destructive">{n}</p>)}
                <p className="mt-1 text-xs text-muted-foreground">Give the app a moment, then start a new chat in it.</p>
              </div>
            )}
            {error && <p className="text-xs text-destructive">Restart failed: {error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Close</Button>
            <Button disabled={busy} onClick={() => void restart()}>{busy ? "Restarting…" : result ? "Restart again" : "Restart"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
