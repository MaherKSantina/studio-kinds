/**
 * THE STUDIO'S URL — what the page shows, as a query string, so a reload or
 * a shared link lands on the same thing:
 *
 *   /studio/                                     the welcome page
 *   /studio/?path=<file>                         a document, by its store path
 *   /studio/?path=<flow>&frame=<name>            a frame kept INSIDE a flow
 *   /studio/?catalog=journey[&story=<id>]        the journey catalog page
 *
 * A kind's own editor may add params of its own beside these (the project
 * editor mirrors its selection as `item` / `file`); they are that editor's.
 */
export type StudioTarget =
  | { kind: "welcome" }
  | { kind: "doc"; path: string; frame: string | null }
  | { kind: "catalog"; catalog: "journey"; story: string | null };

export function parseStudioSearch(search: string): StudioTarget {
  const q = new URLSearchParams(search);
  const path = q.get("path");
  if (path) return { kind: "doc", path, frame: q.get("frame") || null };
  if (q.get("catalog") === "journey") return { kind: "catalog", catalog: "journey", story: q.get("story") || null };
  return { kind: "welcome" };
}

/** The query string for a target — "" for the welcome page. */
export function studioSearch(t: StudioTarget): string {
  const q = new URLSearchParams();
  if (t.kind === "doc") {
    q.set("path", t.path);
    if (t.frame) q.set("frame", t.frame);
  } else if (t.kind === "catalog") {
    q.set("catalog", t.catalog);
    if (t.story) q.set("story", t.story);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Do two targets show the same thing? (The project editor's own params do not count.) */
export function sameTarget(a: StudioTarget, b: StudioTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "doc" && b.kind === "doc") return a.path === b.path && a.frame === b.frame;
  if (a.kind === "catalog" && b.kind === "catalog") return a.story === b.story;
  return true;
}

/** Recents remember a frame kept inside a flow as `<flow>#<name>`. */
export const recentKeyOf = (t: { path: string; frame: string | null }): string => (t.frame ? `${t.path}#${t.frame}` : t.path);

export function targetOfRecent(key: string): { path: string; frame: string | null } {
  const i = key.indexOf("#");
  return i > 0 ? { path: key.slice(0, i), frame: key.slice(i + 1) } : { path: key, frame: null };
}
