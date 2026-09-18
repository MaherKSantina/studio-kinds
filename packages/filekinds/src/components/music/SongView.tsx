/**
 * A `.song` open — its tracks against the bars, as an arrangement: every
 * placement is a block as long as the clip plays (repeats marked off
 * inside it), with a thumbnail of its notes, named after the clip file;
 * a clip that is not there is a dashed block that says so. Clicking a
 * block opens the clip; clicking a track's name lays that track's every
 * note on a piano roll below. Export .mid writes the whole song as one
 * multi-track MIDI file — what Ableton Live takes as tracks.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn, resolveRef } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { readVirtualDirectoryFile } from "../../api";
import { beatsPerBar } from "../../lib/clipDoc";
import { loadSong, parseSong, songMidiSpec, songSummary, type LoadedSong, type PlacedClip } from "../../lib/songDoc";
import { writeMidiFile } from "../../lib/midiFile";
import { PianoRoll } from "./PianoRoll";
import { ExportMidiButton } from "./ExportMidiButton";
import { LANE_COLORS } from "./ClipView";

const GUTTER = 128;
const RULER = 18;
const ROW = 48;
/** Pixels per beat — the least; a short song stretches to fill the pane. */
const LEAST_BEAT = 10;

const stemOf = (file: string) => file.slice(file.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");

/** The notes of one placement, every pass, as tiny bars inside its block. */
function Thumbnail({ placed, x, y, w, h }: { placed: PlacedClip; x: number; y: number; w: number; h: number }) {
  const clip = placed.clip;
  if (!clip || !clip.notes.length) return null;
  let low = 127, high = 0;
  for (const n of clip.notes) { if (n.pitch < low) low = n.pitch; if (n.pitch > high) high = n.pitch; }
  const span = Math.max(1, high - low + 1);
  const rowH = Math.min(3, h / span);
  const scale = w / placed.beats;
  const out: React.ReactNode[] = [];
  for (let r = 0; r < placed.placement.repeat; r++) {
    for (const n of clip.notes) {
      const nx = x + (r * placed.clipBeats + n.start) * scale;
      const nw = Math.max(1, n.length * scale - 0.5);
      const ny = y + h - (n.pitch - low + 1) * rowH;
      out.push(<rect key={`${r}-${n.pitch}-${n.start}`} x={nx} y={ny} width={nw} height={Math.max(1, rowH - 0.5)} fill="currentColor" opacity={0.7} />);
    }
  }
  return <g>{out}</g>;
}

export default function SongView({ content, path, agentId, height = "100%", onOpenPath }: ViewerProps) {
  const doc = useMemo(() => parseSong(content), [content]);
  const base = path ?? agentId ?? "/untitled.song";
  const [song, setSong] = useState<LoadedSong | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
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
  }, [song]);
  useEffect(() => {
    let live = true;
    const read = (abs: string) => readVirtualDirectoryFile(abs, abs).then((r) => r.content);
    loadSong(doc, base, read, resolveRef).then((s) => { if (live) setSong(s); });
    return () => { live = false; };
  }, [doc, base]);

  if (!song) return <div style={{ height }} className="bg-background p-3 text-xs text-muted-foreground">Loading the clips…</div>;
  const bpb = beatsPerBar(song.time);
  const totalBeats = Math.max(1, song.bars) * bpb;
  const BEAT = Math.max(LEAST_BEAT, bodyWidth > 0 ? Math.floor(bodyWidth / totalBeats) : LEAST_BEAT);
  const width = totalBeats * BEAT;
  const bodyHeight = RULER + song.tracks.length * ROW;
  const stem = base.slice(base.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
  const bytes = () => writeMidiFile(songMidiSpec(song, doc.title || stem));
  const notesTotal = song.tracks.reduce((n, t) => n + t.notes.length, 0);
  const track = selected !== null ? song.tracks[selected] : null;
  const colorAt = (i: number) => LANE_COLORS[i % LANE_COLORS.length];

  return (
    <div style={{ height }} className="min-h-0 overflow-y-auto bg-background p-3 text-foreground">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {doc.title && <h2 className="text-base font-semibold">{doc.title}</h2>}
        <span className="text-xs text-muted-foreground" data-testid="song-summary">{songSummary(song)}</span>
        <ExportMidiButton base={base} bytes={bytes} disabled={!notesTotal} />
      </div>
      {song.problems.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-destructive" data-testid="song-problems">
          {song.problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      {!song.tracks.length && <p className="mt-2 text-xs text-muted-foreground">No tracks yet — give it `tracks:` with `clips:`.</p>}
      {song.tracks.length > 0 && (
        <div className="mt-3 flex items-start rounded border" data-testid="arrangement">
          <div className="shrink-0 select-none" style={{ width: GUTTER }}>
            <div style={{ height: RULER }} className="border-b" />
            {song.tracks.map((t, i) => (
              <button key={i} type="button" onClick={() => setSelected(selected === i ? null : i)}
                className={cn("flex w-full items-center gap-2 border-b px-2 text-left text-xs", selected === i ? "bg-accent text-accent-foreground" : "hover:bg-muted")}
                style={{ height: ROW }} title={`${t.track.name} · channel ${t.channel} · ${t.notes.length} notes — show on a piano roll`}>
                <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: colorAt(i) }} />
                <span className="truncate font-medium">{t.track.name}</span>
                <span className="ml-auto text-muted-foreground">{t.notes.length}</span>
              </button>
            ))}
          </div>
          <div ref={bodyRef} className="min-w-0 flex-1 overflow-x-auto">
            <svg width={width} height={bodyHeight} className="block select-none">
              {Array.from({ length: song.bars }, (_, b) => (
                <g key={b}>
                  <line x1={b * bpb * BEAT} x2={b * bpb * BEAT} y1={0} y2={bodyHeight} stroke="var(--foreground)" strokeOpacity={b % 4 === 0 ? 0.35 : 0.12} />
                  {(b % 4 === 0 || bpb * BEAT >= 36) && <text x={b * bpb * BEAT + 3} y={RULER - 5} fontSize={11} fill="var(--muted-foreground)">{b}</text>}
                </g>
              ))}
              <line x1={0} x2={width} y1={RULER - 0.5} y2={RULER - 0.5} stroke="var(--border)" />
              {song.tracks.map((t, i) => (
                <g key={i} transform={`translate(0, ${RULER + i * ROW})`} style={{ color: colorAt(i) }}>
                  <line x1={0} x2={width} y1={ROW - 0.5} y2={ROW - 0.5} stroke="var(--border)" />
                  {t.placed.map((p, j) => {
                    const x = p.startBeat * BEAT;
                    const w = Math.max(2, p.beats * BEAT - 1);
                    const abs = resolveRef(base, p.placement.file);
                    const label = `${stemOf(p.placement.file)}${p.placement.repeat > 1 ? ` ×${p.placement.repeat}` : ""}${p.placement.transpose ? ` ${p.placement.transpose > 0 ? "+" : ""}${p.placement.transpose}` : ""}`;
                    return (
                      <g key={j} className={cn(onOpenPath && "cursor-pointer")} onClick={() => onOpenPath?.(abs)} data-testid="placement">
                        <title>{p.error ? `${p.placement.file} — ${p.error}` : `${p.placement.file} · bar ${round(p.startBeat / bpb)} for ${round(p.beats / bpb)} bars${p.placement.transpose ? ` · transposed ${p.placement.transpose}` : ""} — open it`}</title>
                        <rect x={x + 0.5} y={3} width={w} height={ROW - 7} rx={3}
                          fill={p.error ? "none" : "currentColor"} fillOpacity={0.22}
                          stroke={p.error ? "var(--destructive)" : "currentColor"} strokeDasharray={p.error ? "4 3" : undefined} />
                        {Array.from({ length: p.placement.repeat - 1 }, (_, r) => (
                          <line key={r} x1={x + (r + 1) * p.clipBeats * BEAT} x2={x + (r + 1) * p.clipBeats * BEAT} y1={3} y2={ROW - 4} stroke="currentColor" strokeOpacity={0.5} strokeDasharray="2 2" />
                        ))}
                        <Thumbnail placed={p} x={x + 2} y={17} w={w - 4} h={ROW - 22} />
                        <text x={x + 5} y={14} fontSize={11} fill={p.error ? "var(--destructive)" : "var(--foreground)"}>
                          {p.error ? `${p.placement.file} — not there` : label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              ))}
            </svg>
          </div>
        </div>
      )}
      {track && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-muted-foreground">{track.track.name} · channel {track.channel} · {track.notes.length} notes</div>
          <div className="rounded border">
            <PianoRoll notes={track.notes} bars={song.bars} time={song.time} naming={track.placed.find((p) => p.clip)?.clip?.naming ?? "scientific"}
              grid={4 * bpb} beatWidth={24} rowHeight={12} colorOf={() => colorAt(selected!)} laneNames={laneNamesOf(track.placed)} />
          </div>
        </div>
      )}
    </div>
  );
}

const laneNamesOf = (placed: PlacedClip[]): Map<number, string> => {
  const out = new Map<number, string>();
  for (const p of placed) for (const l of p.clip?.lanes ?? []) if (!out.has(l.pitch + p.placement.transpose)) out.set(l.pitch + p.placement.transpose, l.name);
  return out;
};

const round = (x: number) => Math.round(x * 100) / 100;

