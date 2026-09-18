/**
 * THE FOLDER'S START PAGE — its root memory as the whole window: every
 * sub-folder a focus, the files beside them Everything else, a `.memory`
 * inside a folder dictating that folder's split (the memory engine over a
 * folder — filekinds `memoryOverFolder`). The text is the store's
 * `homeMemory`: a `.memory` file in the root when there is one, else a
 * virtual memory this browser keeps — a folder with no `.memory` behaves as
 * an empty one does on the desktop and in VS Code, and nothing is written
 * into it unasked.
 *
 * When the folder's SHAPE changes underneath (a folder made in the file
 * manager, a file dropped or removed — `studio:fs-entries-changed`) the
 * memory re-reads the store IN PLACE once the burst settles (the kit's
 * `STORE_CHANGED_EVENT`): the view stays up, the new focus appears. A file's
 * content being written is not a reason to re-read — over C:\Github a
 * database journal is appended every second, and re-reading 13k entries on
 * each write kept the page on "Reading the store…".
 */
import * as React from "react";
import { STORE_CHANGED_EVENT } from "filekinds";
import type { HomeMemory as HomeMemoryDoc } from "../store";
import { KindSurface } from "./KindSurface";

/** How long the folder has to stay still before the store is re-read. */
const SETTLE_MS = 3000;
/** Under continuous churn (something writing every second) the store is still re-read this often. */
const MAX_WAIT_MS = 30_000;

export function HomeMemory({ home, onOpenPath }: { home: HomeMemoryDoc; onOpenPath: (path: string) => void }) {
  const [text, setText] = React.useState<string | null>(null);
  // What we last wrote — the watcher's echo of our own save is not an outside change.
  const written = React.useRef<string | null>(null);

  React.useEffect(() => {
    let live = true;
    written.current = null;
    // An unreadable file (gone since the listing) is an empty memory — which is a complete one.
    home.read().then((t) => { if (live) setText(t); }, () => { if (live) setText(""); });
    return () => { live = false; };
  }, [home]);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let waitingSince: number | null = null;
    // The memory file itself (an editor, an agent): take the new text unless it is our own save landing.
    const onChanged = (e: Event) => {
      const changed = (e as CustomEvent<string>).detail;
      if (changed !== home.path || home.virtual) return;
      void home.read().then((t) => { if (t !== written.current) setText(t); }, () => { /* keep what we show */ });
    };
    const refresh = () => {
      timer = undefined;
      waitingSince = null;
      window.dispatchEvent(new CustomEvent(STORE_CHANGED_EVENT));
    };
    // An entry elsewhere in the folder made, removed or renamed: the store the memory selects over
    // moved. Re-read once the folder has been still for a moment — and, when it never is, at least
    // every MAX_WAIT_MS, so churn elsewhere neither floods the store nor hides a new folder for good.
    const onEntries = (e: Event) => {
      const changed = (e as CustomEvent<string>).detail;
      if (changed === home.path) return;
      const now = Date.now();
      waitingSince ??= now;
      clearTimeout(timer);
      timer = setTimeout(refresh, Math.max(0, Math.min(SETTLE_MS, waitingSince + MAX_WAIT_MS - now)));
    };
    window.addEventListener("studio:fs-changed", onChanged);
    window.addEventListener("studio:fs-entries-changed", onEntries);
    return () => {
      window.removeEventListener("studio:fs-changed", onChanged);
      window.removeEventListener("studio:fs-entries-changed", onEntries);
      clearTimeout(timer);
    };
  }, [home]);

  if (text === null) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  return (
    <KindSurface path={home.path} content={text} onOpenPath={onOpenPath}
      onChange={(t) => {
        written.current = t;
        setText(t);
        home.write(t).catch((e: unknown) => console.warn("home memory: save failed", e));
      }} />
  );
}
