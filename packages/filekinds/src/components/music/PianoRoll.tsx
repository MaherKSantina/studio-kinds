/**
 * A piano roll — notes on a grid of pitches against beats, the way every
 * DAW shows a clip. Rows are the pitches in use (plus one either side),
 * highest at the top, black keys shaded, each labelled with its name in
 * the document's naming and its MIDI number (a lane's row wears the
 * lane's name); columns are beats, with a heavier line at every bar and
 * a faint one at every step of the grid. A note is a bar as wide as it
 * lasts, as opaque as it is loud; hovering says exactly what it is.
 * Pure SVG in a horizontally scrolling body beside a fixed key gutter.
 */
import React, { useLayoutEffect, useRef, useState } from "react";
import { beatsPerBar, pitchName, type ClipNote, type Naming, type TimeSignature } from "../../lib/clipDoc";

export interface PianoRollProps {
  notes: ClipNote[];
  bars: number;
  time: TimeSignature;
  naming: Naming;
  /** Steps per bar for the faint grid (a clip's `grid`); default 16. */
  grid?: number;
  /** Extra row labels by pitch — the lanes. */
  laneNames?: Map<number, string>;
  /** Pixels per beat — the LEAST: a clip shorter than the pane stretches to fill it. */
  beatWidth?: number;
  rowHeight?: number;
  /** The fill for a note; default = the primary colour. */
  colorOf?: (note: ClipNote) => string;
  /** The first bar's number on the ruler (a clip starts at 0; a song's excerpt may not). */
  firstBar?: number;
  /** Where the clip really ends, in beats, when the roll is drawn longer to show notes past it — that stretch is shaded. */
  endBeat?: number;
}

const RULER = 18;
/** The key gutter grows with the longest label (lane names), within reason. */
const gutterFor = (labels: string[]): number => Math.min(200, Math.max(84, 14 + 6.3 * labels.reduce((m, l) => Math.max(m, l.length), 0)));
const isBlack = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);

export function pitchRows(notes: ClipNote[]): number[] {
  if (!notes.length) return [60, 59, 58, 57, 56, 55];
  let low = 127, high = 0;
  for (const n of notes) { if (n.pitch < low) low = n.pitch; if (n.pitch > high) high = n.pitch; }
  low = Math.max(0, low - 1); high = Math.min(127, high + 1);
  const rows: number[] = [];
  for (let p = high; p >= low; p--) rows.push(p);
  return rows;
}

export function PianoRoll({
  notes, bars, time, naming, grid = 16, laneNames, beatWidth: leastBeatWidth = 40, rowHeight = 14, colorOf, firstBar = 0, endBeat,
}: PianoRollProps) {
  const bpb = beatsPerBar(time);
  const rows = pitchRows(notes);
  const rowOf = new Map(rows.map((p, i) => [p, i]));
  const label = (pitch: number) => {
    const lane = laneNames?.get(pitch);
    const name = pitchName(pitch, naming);
    return lane && lane !== name ? `${lane} · ${name} · ${pitch}` : `${name} · ${pitch}`;
  };
  const GUTTER = gutterFor(rows.map(label));
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setBodyWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const totalBeats = Math.max(1, bars) * bpb;
  const beatWidth = Math.max(leastBeatWidth, bodyWidth > 0 ? Math.floor(bodyWidth / totalBeats) : leastBeatWidth);
  const width = totalBeats * beatWidth;
  const height = rows.length * rowHeight;
  const stepBeats = bpb / grid;
  const gridLines: React.ReactNode[] = [];
  for (let k = 0; k <= bars * grid; k++) {
    const beat = k * stepBeats;
    const x = beat * beatWidth;
    const kind = k % grid === 0 ? "bar" : Math.abs(beat - Math.round(beat)) < 1e-9 ? "beat" : "step";
    gridLines.push(
      <line key={k} x1={x} x2={x} y1={0} y2={height}
        stroke={kind === "bar" ? "var(--foreground)" : "var(--border)"}
        strokeOpacity={kind === "bar" ? 0.5 : kind === "beat" ? 1 : 0.5} />,
    );
  }
  return (
    <div className="flex min-w-0 items-start" data-testid="piano-roll">
      <svg width={GUTTER} height={height + RULER} className="shrink-0 select-none">
        {rows.map((p, i) => (
          <g key={p} transform={`translate(0, ${RULER + i * rowHeight})`}>
            <rect x={0} y={0} width={GUTTER} height={rowHeight} fill={isBlack(p) ? "var(--foreground)" : "var(--background)"} fillOpacity={isBlack(p) ? 0.08 : 1} />
            <line x1={0} x2={GUTTER} y1={rowHeight} y2={rowHeight} stroke="var(--border)" />
            <text x={GUTTER - 6} y={rowHeight - 3} textAnchor="end" fontSize={rowHeight >= 14 ? 11 : 10} fill="var(--muted-foreground)">{label(p)}</text>
          </g>
        ))}
      </svg>
      <div ref={bodyRef} className="min-w-0 flex-1 overflow-x-auto">
        <svg width={width} height={height + RULER} className="block select-none">
          <g>
            {Array.from({ length: bars }, (_, b) => (
              <text key={b} x={b * bpb * beatWidth + 4} y={RULER - 5} fontSize={11} fill="var(--muted-foreground)">{firstBar + b}</text>
            ))}
            <line x1={0} x2={width} y1={RULER - 0.5} y2={RULER - 0.5} stroke="var(--border)" />
          </g>
          <g transform={`translate(0, ${RULER})`}>
            {rows.map((p, i) => (
              <rect key={p} x={0} y={i * rowHeight} width={width} height={rowHeight} fill={isBlack(p) ? "var(--foreground)" : "var(--background)"} fillOpacity={isBlack(p) ? 0.06 : 1} />
            ))}
            {rows.map((p, i) => (
              <line key={`l${p}`} x1={0} x2={width} y1={(i + 1) * rowHeight} y2={(i + 1) * rowHeight} stroke="var(--border)" />
            ))}
            {gridLines}
            {endBeat !== undefined && endBeat < totalBeats && (
              <rect x={endBeat * beatWidth} y={0} width={width - endBeat * beatWidth} height={height} fill="var(--destructive)" fillOpacity={0.08} data-testid="past-end">
                <title>Past the clip's end</title>
              </rect>
            )}
            {notes.map((n, i) => {
              const row = rowOf.get(n.pitch);
              if (row === undefined) return null;
              const x = n.start * beatWidth;
              const w = Math.max(3, n.length * beatWidth - 1);
              return (
                <rect key={i} x={x + 0.5} y={row * rowHeight + 1.5} width={w} height={rowHeight - 3} rx={2}
                  fill={colorOf ? colorOf(n) : "var(--primary)"} fillOpacity={0.35 + (0.65 * n.velocity) / 127}
                  stroke="var(--background)" strokeWidth={0.5}
                  data-testid="note">
                  <title>{`${n.lane ? `${n.lane} · ` : ""}${pitchName(n.pitch, naming)} (${n.pitch}) · beat ${round(n.start)} for ${round(n.length)} · velocity ${n.velocity}`}</title>
                </rect>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

const round = (x: number) => Math.round(x * 1000) / 1000;

export default PianoRoll;
