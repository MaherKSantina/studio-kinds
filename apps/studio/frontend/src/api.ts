/**
 * The Studio's connections: the shared nodes file system and the suite's ask
 * worker, both reached through this app's own Vite proxy so the same relative
 * URL works locally and behind suite-router. Nothing here knows a kind.
 */
import { askApi, httpFs } from "crosscut";

/** A nodes-worker endpoint under the app's base, e.g. `nodesApi("api/fs/index")`. */
export const nodesApi = (p: string): string => `${import.meta.env.BASE_URL}nodes-api/${p}`;

/** The shared nodes file system. */
export const nodesFs = httpFs(import.meta.env.VITE_NODES_API ?? `${import.meta.env.BASE_URL}nodes-api`);

/** Upload bytes (a screenshot, an export) to a `PUT /api/fs/binary` endpoint — the nodes
 *  worker's or the folder worker's; both take `{ path, base64 }`. */
export async function uploadBinary(url: string, path: string, file: Blob): Promise<void> {
  const buf = await file.arrayBuffer();
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const base64 = btoa(s);
  const r = await fetch(url, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, base64 }),
  });
  if (!r.ok) throw new Error(`upload failed: ${r.status} ${await r.text().catch(() => "")}`);
}

/** Upload bytes into the shared store beside a document. */
export const putBinary = (path: string, file: Blob): Promise<void> => uploadBinary(nodesApi("api/fs/binary"), path, file);

/** The suite's ask worker — what every kind's Ask panel talks through. What
 *  to say to the model is each kind's business (filekinds); this only carries it. */
export const ask = askApi(`${import.meta.env.BASE_URL}ask-api`);
