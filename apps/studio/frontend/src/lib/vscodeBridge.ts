/**
 * The VS Code webview's side of the bridge (see apps/vscode/extension.js):
 * the suite's file-system contract as an RPC over `postMessage`, plus the
 * messages the document surface exchanges with the extension. Every path is
 * a store path from "/" — the document's workspace folder is the root.
 */
import type { FileSystemAdapter, FsEntry } from "crosscut";

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void; getState(): unknown; setState(s: unknown): void };

export interface InitMessage {
  type: "init"; path: string; root: string; resourceBase: string; content: string;
  /** The journey catalog panel instead of a document; `story` = the deep link. */
  mode?: "catalog"; story?: string | null;
}
export interface ContentMessage { type: "content"; content: string }
export type HostMessage = InitMessage | ContentMessage | { type: "rpc:result"; id: number; ok: boolean; value?: unknown; error?: string };

const api = acquireVsCodeApi();
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const listeners = new Set<(m: HostMessage) => void>();

window.addEventListener("message", (ev: MessageEvent<HostMessage>) => {
  const m = ev.data;
  if (!m || typeof m !== "object") return;
  if (m.type === "rpc:result") {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error ?? "request failed"));
    return;
  }
  for (const l of listeners) l(m);
});

export const post = (m: unknown): void => api.postMessage(m);
export function onHostMessage(l: (m: HostMessage) => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function rpc<T = unknown>(op: string, ...args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    api.postMessage({ type: "rpc", id, op, args });
  });
}

export const vscodeFs = (): FileSystemAdapter => ({
  list: (p) => rpc<FsEntry[]>("list", p),
  read: (p) => rpc<{ path: string; content: string; updatedAt?: string }>("read", p),
  write: (p, content) => rpc<void>("write", p, content),
  mkdir: (p) => rpc<void>("mkdir", p),
  rename: (p, newName) => rpc<{ path: string }>("rename", p, newName),
  remove: (p) => rpc<void>("remove", p),
});
