/**
 * "Move into flow…" — a `.frame` file leaves its folder and lives on INSIDE a
 * `.flow` beside it (`frames.<name>`), every state that showed the file
 * still showing it. The flow is written first and the file removed only
 * after, so a failed write changes nothing. The Studio keeps editing the
 * frame from the flow (`?path=<flow>&frame=<name>`).
 */
import * as React from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "crosscut";
import { FileInput } from "lucide-react";
import { configuredLister, configuredRemover, configuredWriter, readVirtualDirectoryFile } from "../../api";
import { moveFrameIntoFlow } from "../../lib/flowFrames";

export default function MoveIntoFlowButton({ framePath, root, onMoved }: { framePath: string; root?: string; onMoved: (flowPath: string) => void }) {
  const writer = configuredWriter();
  const remover = configuredRemover();
  const lister = configuredLister();
  const [open, setOpen] = React.useState(false);
  const [flows, setFlows] = React.useState<string[] | null>(null);
  const [choice, setChoice] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const folder = framePath.slice(0, framePath.lastIndexOf("/")) || "/";

  // The flows on offer: the frame's own folder, then each folder up to the project root — a flow
  // usually sits at the root with its screens in subfolders.
  React.useEffect(() => {
    if (!open || !lister) return;
    let live = true;
    setFlows(null);
    const top = (root ?? folder).replace(/\/+$/, "") || "/";
    const folders: string[] = [];
    for (let dir = folder; ; dir = dir.slice(0, dir.lastIndexOf("/")) || "/") {
      folders.push(dir);
      if (dir === top || dir === "/" || !dir.startsWith(top)) break;
    }
    void (async () => {
      const found: string[] = [];
      for (const dir of folders) {
        try {
          for (const e of await lister(dir)) if (e.kind === "file" && e.name.toLowerCase().endsWith(".flow")) found.push(e.path);
        } catch { /* a folder that cannot be listed offers nothing */ }
      }
      if (!live) return;
      setFlows(found);
      setChoice(found[0] ?? "");
    })();
    return () => { live = false; };
  }, [open, folder, root, lister]);

  if (!writer || !remover) return null;

  const move = async () => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      const flowText = (await readVirtualDirectoryFile(choice, choice)).content;
      const frameText = (await readVirtualDirectoryFile(framePath, framePath)).content;
      const r = moveFrameIntoFlow(flowText, frameText, framePath, choice);
      await writer(choice, r.flowText); // the flow holds the frame first…
      await remover(framePath); // …only then does the file go
      setOpen(false);
      onMoved(choice);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}
        title="Move this frame into a flow beside it — it leaves the folder and lives on inside the flow">
        <FileInput /> Move into flow…
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Move into a flow</DialogTitle>
          <DialogDescription>
            The frame's contents go inside the flow under its name, states that showed the file keep showing it,
            and the file leaves this folder. The Studio still opens it from the flow.
          </DialogDescription>
          {flows === null ? (
            <p className="text-sm text-muted-foreground">Looking for flows beside it…</p>
          ) : flows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No <code>.flow</code> file in this folder or above it — create one first.</p>
          ) : (
            <select value={choice} onChange={(e) => setChoice(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
              {flows.map((f) => <option key={f} value={f}>{root && f.startsWith(root) ? f.slice(root.length).replace(/^\/+/, "") : f}</option>)}
            </select>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!choice || busy} onClick={() => void move()}>{busy ? "Moving…" : "Move"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
