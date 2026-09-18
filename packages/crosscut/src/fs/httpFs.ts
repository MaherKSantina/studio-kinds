/** FileSystemAdapter over the nodes worker's HTTP API. */
import { FileSystemAdapter } from "./types";

async function call<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(base + path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${path} → ${r.status}: ${body.slice(0, 300)}`);
  }
  return (await r.json()) as T;
}

/** `base` example: "" (same-origin via Vite proxy) or "http://localhost:9111". */
export function httpFs(base: string): FileSystemAdapter {
  const q = (p: string) => encodeURIComponent(p);
  return {
    list: (path) => call(base, `/api/fs/list?path=${q(path)}`),
    read: (path) => call(base, `/api/fs/file?path=${q(path)}`),
    write: (path, content) =>
      call(base, `/api/fs/file`, { method: "PUT", body: JSON.stringify({ path, content }) }),
    mkdir: (path) => call(base, `/api/fs/mkdir`, { method: "POST", body: JSON.stringify({ path }) }),
    rename: (path, newName) =>
      call(base, `/api/fs/rename`, { method: "POST", body: JSON.stringify({ path, newName }) }),
    remove: (path) => call(base, `/api/fs/node?path=${q(path)}`, { method: "DELETE" }),
  };
}
