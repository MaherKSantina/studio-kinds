/**
 * A `.clip` open — its notes on a piano roll, one line of facts above
 * (how many notes, how long, the tempo, the time signature, the range),
 * the Export .mid button, and the document's problems, if any, in plain
 * words. Lanes colour their rows apart; explicit notes take the primary
 * colour. Nothing is edited here: the file is the notes, an agent or an
 * editor changes it, and the roll re-reads.
 */
import React, { useMemo } from "react";
import { ViewerProps } from "../../lib/filePreviews";
import { beatsPerBar, clipLengthBars, clipSummary, parseClip, type ClipNote } from "../../lib/clipDoc";
import { writeMidiFile } from "../../lib/midiFile";
import { PianoRoll } from "./PianoRoll";
import { ExportMidiButton } from "./ExportMidiButton";

export const LANE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export default function ClipView({ content, path, agentId, height = "100%" }: ViewerProps) {
  const doc = useMemo(() => parseClip(content), [content]);
  const base = path ?? agentId ?? "/untitled.clip";
  const stem = base.slice(base.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
  const laneNames = useMemo(() => new Map(doc.lanes.map((l) => [l.pitch, l.name])), [doc.lanes]);
  const laneColor = useMemo(() => new Map(doc.lanes.map((l, i) => [l.name, LANE_COLORS[i % LANE_COLORS.length]])), [doc.lanes]);
  const colorOf = (n: ClipNote) => (n.lane && laneColor.get(n.lane)) || "var(--primary)";
  const bars = clipLengthBars(doc);
  const bpb = beatsPerBar(doc.time);
  // Drawn long enough to show every note, even one that begins past the clip's end (a problem, shaded).
  const drawnBars = Math.max(bars, Math.ceil(doc.notes.reduce((m, n) => Math.max(m, n.start + n.length), 0) / bpb - 1e-9));
  const bytes = () => writeMidiFile({
    tempo: doc.tempo, time: doc.time, title: doc.title || stem,
    tracks: [{ name: doc.title || stem, channel: doc.channel, notes: doc.notes }],
  });
  return (
    <div style={{ height }} className="min-h-0 overflow-y-auto bg-background p-3 text-foreground">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {doc.title && <h2 className="text-base font-semibold">{doc.title}</h2>}
        <span className="text-xs text-muted-foreground" data-testid="clip-summary">{clipSummary(doc)} · channel {doc.channel}</span>
        <ExportMidiButton base={base} bytes={bytes} disabled={!doc.notes.length} />
      </div>
      {doc.problems.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-destructive" data-testid="clip-problems">
          {doc.problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      <div className="mt-3 rounded border">
        <PianoRoll notes={doc.notes} bars={drawnBars} endBeat={drawnBars > bars ? bars * bpb : undefined} time={doc.time} naming={doc.naming} grid={doc.grid} laneNames={laneNames} colorOf={colorOf} />
      </div>
      {!doc.notes.length && <p className="mt-2 text-xs text-muted-foreground">No notes yet — give it `notes:` or `lanes:`.</p>}
    </div>
  );
}
