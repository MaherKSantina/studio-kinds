/**
 * The studio, in a dialog inside the app. Mount ONE per host; anything that
 * calls `openInStudio` while it is mounted opens here instead of a new tab.
 * `onOpen` fires before the studio loads (flush what this app has not saved
 * yet — the studio reads the file), `onClose` after it goes (re-read the
 * file — the studio may have written it).
 */
import * as React from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "crosscut";
import { ExternalLink } from "lucide-react";
import { STUDIO_OPEN_EVENT, type StudioOpenRequest, isActiveStudioDialog, registerStudioDialog } from "../lib/studioDialog";

export function StudioDialog({ onOpen, onClose }: { onOpen?: (req: StudioOpenRequest) => void; onClose?: (req: StudioOpenRequest) => void }) {
  const [req, setReq] = React.useState<StudioOpenRequest | null>(null);
  const latest = React.useRef({ onOpen, onClose });
  latest.current = { onOpen, onClose };
  React.useEffect(() => {
    const me = registerStudioDialog();
    const handler = (e: Event) => {
      if (!isActiveStudioDialog(me.id)) return;
      const d = (e as CustomEvent<StudioOpenRequest>).detail;
      latest.current.onOpen?.(d);
      setReq(d);
    };
    window.addEventListener(STUDIO_OPEN_EVENT, handler);
    return () => { window.removeEventListener(STUDIO_OPEN_EVENT, handler); me.unregister(); };
  }, []);
  const close = () => {
    const r = req;
    setReq(null);
    if (r) latest.current.onClose?.(r);
  };
  return (
    <Dialog open={!!req} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="flex h-[92vh] flex-col gap-0 p-0 sm:max-w-[96vw]" showCloseButton>
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 pr-12">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium">{req?.title ?? ""}</DialogTitle>
          <DialogDescription className="sr-only">The studio, inside this app; close it to come back with the file refreshed.</DialogDescription>
          <Button size="xs" variant="outline" onClick={() => req && window.open(req.url, "_blank")}><ExternalLink /> Open in a tab</Button>
        </div>
        {req && <iframe src={req.url} title={req.title} className="min-h-0 w-full flex-1 border-0 bg-background" />}
      </DialogContent>
    </Dialog>
  );
}
