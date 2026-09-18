/**
 * "Export .mid" — the document's notes as a Standard MIDI File, written
 * BESIDE it as `<stem>.mid` through the host's binary writer (the desktop
 * app, VS Code and the web Studio all have one), overwriting the last
 * export so a re-export after an edit is one click. A host with no writer
 * gets the file as a download instead. Ableton Live takes the result by
 * drag and drop; a folder added to Live's browser (Places › Add Folder)
 * shows every export as it lands.
 */
import React, { useEffect, useState } from "react";
import { Button, parentOf } from "crosscut";
import { configuredBinaryWriter } from "../../api";

export interface ExportMidiButtonProps {
  /** The document's absolute path — the export lands beside it. */
  base: string;
  /** The bytes, made on click. */
  bytes: () => Uint8Array;
  disabled?: boolean;
}

export const midiPathBeside = (base: string): string => {
  const name = base.slice(base.lastIndexOf("/") + 1);
  const stem = name.replace(/\.[^.]+$/, "");
  const dir = parentOf(base);
  return `${dir === "/" ? "" : dir}/${stem}.mid`;
};

export function ExportMidiButton({ base, bytes, disabled }: ExportMidiButtonProps) {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "busy" } | { kind: "done"; name: string } | { kind: "error"; message: string }>({ kind: "idle" });
  useEffect(() => {
    if (state.kind !== "done" && state.kind !== "error") return;
    const t = setTimeout(() => setState({ kind: "idle" }), 4000);
    return () => clearTimeout(t);
  }, [state]);
  const target = midiPathBeside(base);
  const name = target.slice(target.lastIndexOf("/") + 1);
  const run = async () => {
    setState({ kind: "busy" });
    try {
      const data = bytes();
      const writer = configuredBinaryWriter();
      const blob = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: "audio/midi" });
      if (writer) await writer(target, blob);
      else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setState({ kind: "done", name });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="xs" variant="outline" onClick={run} disabled={disabled || state.kind === "busy"} title={`Write ${name} beside this document — drop it on Ableton Live`}>
        Export .mid
      </Button>
      {state.kind === "done" && <span className="text-xs text-muted-foreground">wrote {state.name}</span>}
      {state.kind === "error" && <span className="text-xs text-destructive">{state.message}</span>}
    </span>
  );
}

export default ExportMidiButton;
