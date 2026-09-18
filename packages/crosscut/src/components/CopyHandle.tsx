/**
 * The one gesture behind stable addressing: copy this node's handle
 * (`nodes:<path>`) so it can be pasted into a chat, a document, or another
 * tool and mean exactly this entry of the shared store. Every surface that
 * shows a node should offer it — the handle is how a person points.
 */
import * as React from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "./ui/button";
import { nodeHandleOf } from "../fs/handles";

export function CopyHandleButton({ path, withLabel = false, className }: {
  path: string;
  /** Show "Handle"/"Copied" text beside the icon (toolbar use). */
  withLabel?: boolean;
  className?: string;
}) {
  const [done, setDone] = React.useState(false);
  const handle = nodeHandleOf(path);
  const copy = () => {
    void navigator.clipboard?.writeText(handle).then(() => {
      setDone(true);
      window.setTimeout(() => setDone(false), 1400);
    }).catch(() => { /* clipboard denied — the title still shows the handle */ });
  };
  return (
    <Button size="xs" variant="outline" className={className} onClick={copy}
      title={`Copy the stable handle — ${handle}`}>
      {done ? <Check /> : <Link2 />}
      {withLabel ? (done ? "Copied" : "Handle") : null}
    </Button>
  );
}
