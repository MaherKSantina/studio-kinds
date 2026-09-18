/**
 * THE ASK PANEL — one line in, a structured reply out, applied by the host.
 *
 * Every studio's Ask is the same conversation: aim at something (a view and
 * a node, a screen and a state, a folder), type an instruction, watch it
 * land, undo if it was wrong. What differs is the vocabulary — what the
 * model is told and what its ops do — and that stays with the kind that
 * owns it. So this panel knows nothing about frames, flows or folders: the
 * host hands it `compose` (build the request from an instruction and the
 * recent turns), `apply` (turn the reply into edits and say what happened),
 * and optionally a `snapshot` to restore on Undo.
 *
 * Built for live use — Enter sends, the box keeps focus, the newest turn
 * sits at the bottom, and each turn's outcome (including what was skipped)
 * goes back to the model next time so it can correct itself.
 */
import * as React from "react";
import { CornerDownLeft, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/cn";
import type { AskApi, AskHealth } from "../ask/askClient";

export interface AskTurn {
  instruction: string;
  say: string;
  /** What actually happened — applied and skipped — for the model's next turn. */
  result: string;
}

export interface AskOutcome {
  say: string;
  applied: string[];
  skipped: string[];
}

export interface AskTargetChip {
  label: string;
  detail?: string;
  /** Present when the chip can be dismissed (aim at the whole document instead). */
  onClear?: () => void;
}

export interface AskRequest {
  system: string;
  user: string;
  schema: unknown;
}

interface Turn {
  id: number;
  instruction: string;
  say: string;
  applied: string[];
  skipped: string[];
  before?: string;
  ms: number;
  transport: string;
  undone?: boolean;
  error?: string;
}

export interface AskPanelProps {
  api: AskApi;
  /** What the panel is aimed at, as chips. */
  target: AskTargetChip[];
  /** Shown when `target` is empty. */
  targetHint?: string;
  placeholder?: string;
  /** Example instructions shown before the first turn. */
  examples?: string[];
  compose: (instruction: string, history: AskTurn[]) => AskRequest | Promise<AskRequest>;
  apply: (output: unknown) => AskOutcome | Promise<AskOutcome>;
  /** The state to restore on Undo, taken right before `apply`. */
  snapshot?: () => string;
  onRestore?: (snapshot: string) => void;
  /** Changing it clears the turns (a different document). */
  resetKey?: string;
  /** Bumped by the host to pull focus into the box (Ctrl+K). */
  focusKey?: number;
  title?: string;
  /** Present when the host lets the panel be closed; drawn as an × in the header. */
  onClose?: () => void;
}

const FALLBACK_MODELS = [{ id: "haiku", label: "Haiku 4.5 — fast" }, { id: "sonnet", label: "Sonnet 5 — careful" }];

export function AskPanel({ api, target, targetHint, placeholder, examples, compose, apply, snapshot, onRestore, resetKey, focusKey, title = "Ask", onClose }: AskPanelProps) {
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [model, setModel] = React.useState("haiku");
  const [health, setHealth] = React.useState<AskHealth | null | undefined>(undefined);
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const boxRef = React.useRef<HTMLTextAreaElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const seq = React.useRef(0);

  React.useEffect(() => { void api.health().then(setHealth); }, [api]);
  React.useEffect(() => { setTurns([]); }, [resetKey]);
  React.useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [turns, busy]);
  React.useEffect(() => { boxRef.current?.focus(); }, [focusKey]);

  const send = async () => {
    const instruction = input.trim();
    if (!instruction || busy) return;
    const history: AskTurn[] = turns.filter((t) => !t.undone && !t.error).slice(-4).map((t) => ({
      instruction: t.instruction, say: t.say,
      result: [t.applied.length ? `applied ${t.applied.length}` : "applied nothing", ...(t.skipped.length ? [`skipped ${t.skipped.length}: ${t.skipped.slice(0, 3).join("; ")}`] : [])].join("; "),
    }));
    const id = ++seq.current;
    setBusy(true);
    setInput("");
    try {
      const req = await compose(instruction, history);
      const r = await api.ask({ system: req.system, user: req.user, schema: req.schema, model });
      const before = snapshot?.();
      const outcome = await apply(r.output);
      setTurns((ts) => [...ts, { id, instruction, say: outcome.say, applied: outcome.applied, skipped: outcome.skipped, before, ms: r.ms, transport: r.transport }]);
    } catch (e) {
      setTurns((ts) => [...ts, { id, instruction, say: "", applied: [], skipped: [], ms: 0, transport: "", error: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
      boxRef.current?.focus();
    }
  };

  const undo = (turn: Turn) => {
    if (turn.before === undefined || !onRestore) return;
    onRestore(turn.before);
    // Everything after this turn was built on it — it goes too.
    setTurns((ts) => ts.map((t) => (t.id >= turn.id ? { ...t, undone: true } : t)));
  };

  const transportTitle = health
    ? health.transport === "api"
      ? "Asks go straight to the Anthropic API"
      : "Asks run through the local Claude CLI on your Claude Code login. Put ANTHROPIC_API_KEY in ask-worker/.env for the faster path."
    : health === null ? "The ask worker (:9250) is not reachable — start it from Mission Control" : "Checking the worker…";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <span className="text-[12px] font-medium">{title}</span>
        <span className="flex-1" />
        <select value={model} onChange={(e) => setModel(e.target.value)} title="Which model edits"
          className="h-6 rounded-md border bg-background px-1 text-[13px]">
          {(health?.models ?? FALLBACK_MODELS).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <span title={transportTitle}
          className={cn("rounded-full px-1.5 py-0.5 text-xs",
            health ? "bg-emerald-100 text-emerald-900" : health === null ? "bg-red-100 text-red-900" : "bg-muted text-muted-foreground")}>
          {health ? (health.transport === "api" ? "API" : "CLI") : health === null ? "offline" : "…"}
        </span>
        {onClose && (
          <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Close" onClick={onClose}>
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 px-2 py-1.5 text-[13px]">
        <span className="text-muted-foreground">Target</span>
        {target.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5">
            {c.label}
            {c.detail && <span className="font-mono text-xs text-muted-foreground">{c.detail}</span>}
            {c.onClear && (
              <button type="button" className="ml-0.5 rounded hover:bg-accent" title="Aim wider" onClick={c.onClear}>
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        {target.length === 0 && targetHint && <span className="text-muted-foreground">{targetHint}</span>}
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {turns.length === 0 && !busy && examples && examples.length > 0 && (
          <div className="text-[13px] leading-5 text-muted-foreground">Try: {examples.map((e) => `“${e}”`).join(" · ")}.</div>
        )}
        {turns.map((t) => (
          <div key={t.id} className={cn("mb-2 rounded-md border px-2 py-1.5 text-[13px]", t.undone && "opacity-50", t.error && "border-destructive/40 bg-destructive/5")}>
            <div className="font-medium">{t.instruction}</div>
            {t.error ? <div className="mt-0.5 text-destructive">{t.error}</div> : (
              <>
                {t.say && <div className="mt-0.5">{t.say}</div>}
                {!t.applied.length && !t.skipped.length && (
                  <div className="mt-0.5 text-amber-700">Nothing changed — the reply carried no edits{t.say ? "" : " and no message"}. Try naming what you mean.</div>
                )}
                {t.applied.map((a, i) => <div key={i} className="font-mono text-xs text-muted-foreground">✓ {a}</div>)}
                {t.skipped.map((s, i) => <div key={i} className="font-mono text-xs text-amber-700">⚠ {s}</div>)}
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{(t.ms / 1000).toFixed(1)} s · {t.transport}</span>
                  {t.applied.length > 0 && !t.undone && t.before !== undefined && onRestore && (
                    <button type="button" className="inline-flex items-center gap-0.5 hover:text-foreground" onClick={() => undo(t)}>
                      <RotateCcw className="size-3" /> Undo
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {busy && <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Loader2 className="size-3 animate-spin" /> working…</div>}
      </div>
      <div className="border-t p-2">
        <textarea ref={boxRef} value={input} rows={2} disabled={busy} placeholder={placeholder ?? "What should change?"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Enter sends · Shift+Enter for a new line · Ctrl+K opens this box</span>
          <Button size="sm" disabled={busy || !input.trim()} onClick={() => void send()}><CornerDownLeft /> Send</Button>
        </div>
      </div>
    </div>
  );
}
