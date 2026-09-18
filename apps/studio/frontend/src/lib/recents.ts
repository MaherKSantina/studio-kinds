/** Recently opened documents — per browser and per STORE (the shared drive,
 *  each folder), no worker needed. A frame kept inside a flow is remembered
 *  as `<flow>#<name>` (see studioUrl.ts). */
const key = (scope: string) => `studio:recent:${scope}`;

export interface Recent { path: string; opened_at: string }

export function readRecents(scope: string): Recent[] {
  try { return JSON.parse(localStorage.getItem(key(scope)) ?? "[]") as Recent[]; } catch { return []; }
}

export function touchRecent(scope: string, path: string): Recent[] {
  const next = [{ path, opened_at: new Date().toISOString() }, ...readRecents(scope).filter((r) => r.path !== path)].slice(0, 12);
  try { localStorage.setItem(key(scope), JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

export function forgetRecent(scope: string, path: string): Recent[] {
  const next = readRecents(scope).filter((r) => r.path !== path);
  try { localStorage.setItem(key(scope), JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}
