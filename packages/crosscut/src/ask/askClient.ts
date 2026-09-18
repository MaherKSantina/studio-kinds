/**
 * The ASK client — how a studio reaches the suite's one model bridge (the
 * ask-worker). The worker is prompt-agnostic: it takes a system prompt, a
 * user message and a JSON schema and returns the object the model produced.
 * What to say is each kind's business (filekinds' frameAsk, flowAsk,
 * projectAsk); this only carries it, through the studio's own proxy so the
 * same relative base works locally and behind suite-router.
 */
export interface AskHealth {
  ok: boolean;
  /** `api` = straight to the Anthropic API (a key is configured); `cli` = the local Claude CLI. */
  transport: "api" | "cli";
  models: { id: string; label: string }[];
}

export interface AskResponse {
  output: unknown;
  transport: "api" | "cli";
  model: string;
  ms: number;
  usage?: { input: number; output: number };
}

export interface AskApi {
  /** The proxied base, e.g. `/frame/ask-api`. */
  base: string;
  /** null = the worker is not reachable. */
  health(): Promise<AskHealth | null>;
  ask(body: { system: string; user: string; schema: unknown; model: string }): Promise<AskResponse>;
}

export function askApi(base: string): AskApi {
  const root = base.replace(/\/+$/, "");
  return {
    base: root,
    async health() {
      try {
        const r = await fetch(`${root}/health`);
        return r.ok ? ((await r.json()) as AskHealth) : null;
      } catch {
        return null;
      }
    },
    async ask(body) {
      const r = await fetch(`${root}/api/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `ask failed: ${r.status}`);
      }
      return (await r.json()) as AskResponse;
    },
  };
}
