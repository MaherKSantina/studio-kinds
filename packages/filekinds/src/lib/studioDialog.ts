/**
 * OPENING A STUDIO FROM ANOTHER TOOL — in a dialog inside the app when a host
 * has mounted one (`StudioDialog`), in a new tab otherwise. A file pane, a
 * flow's frame panel, the Nodes explorer: all say `openInStudio(...)` and
 * never know which. The host that mounted the dialog learns when it opens
 * (flush pending saves — the studio will read the file) and when it closes
 * (re-read the file — the studio wrote it).
 */
import { SUITE_APPS } from "crosscut";
import { previewForPath } from "./filePreviews";

export interface StudioOpenRequest {
  url: string;
  title: string;
}

export const STUDIO_OPEN_EVENT = "filekinds:open-studio";

// The mounted dialogs, in mount order; the most recent one answers, so a
// dialog inside a preview inside an app does not open twice.
let hosts: number[] = [];
let next = 1;

export function registerStudioDialog(): { id: number; unregister: () => void } {
  const id = next++;
  hosts.push(id);
  return { id, unregister: () => { hosts = hosts.filter((h) => h !== id); } };
}

export const isActiveStudioDialog = (id: number): boolean => hosts[hosts.length - 1] === id;

export function openInStudio(req: StudioOpenRequest): void {
  if (hosts.length) window.dispatchEvent(new CustomEvent<StudioOpenRequest>(STUDIO_OPEN_EVENT, { detail: req }));
  else window.open(req.url, "_blank");
}

/**
 * A FOLDER a document points at (a journey's pool, a memory's card): the
 * registered Studio host shows it the way it can — the desktop reveals it in
 * the file manager, VS Code in its Explorer, the web Studio hands it to
 * Nodes. Without a host (the Nodes app itself), Nodes directly.
 */
export function browseFolder(path: string): void {
  if (hosts.length) openInStudio({ url: `${SUITE_APPS.studio.origin}/?path=${encodeURIComponent(path)}`, title: path });
  else window.location.href = `${SUITE_APPS.nodes.origin}/?path=${encodeURIComponent(path)}`;
}

/** The studio URL for a file — or, with `frame`, for a frame kept inside a flow at `path`. */
export function studioUrlFor(path: string, frame?: string): string | null {
  const origin = previewForPath(frame ? `${frame}.frame` : path)?.studioPath;
  if (!origin) return null;
  return `${origin}/?path=${encodeURIComponent(path)}${frame ? `&frame=${encodeURIComponent(frame)}` : ""}`;
}

/** The studio's own name for a file's kind ("Frame Studio"), or null when the kind has none. */
export function studioNameFor(path: string, frame?: string): string | null {
  const origin = previewForPath(frame ? `${frame}.frame` : path)?.studioPath;
  if (!origin) return null;
  return Object.values(SUITE_APPS).find((a) => a.origin === origin)?.name ?? "its studio";
}
