/**
 * The `.song` kind — clips placed on tracks: an arrangement. Each track
 * names the `.clip` files it plays and where, in bars; the Studio draws
 * the tracks against the bars, opens a clip when it is clicked, and
 * exports the whole as ONE multi-track Standard MIDI File (`<stem>.mid`
 * beside it — the Export button, or `studio-check --midi x.song`). That
 * file is the Ableton handover: dropped on Live's Arrangement it becomes
 * one named track per song track, at the song's tempo.
 *
 * Authoring shape (YAML, lenient — a half-written file still renders):
 *
 *   title: Demo
 *   tempo: 128                  # default: the first clip's
 *   time: 4/4                   # default: the first clip's
 *   tracks:
 *     - name: Drums
 *       channel: 10             # optional; the clip's own channel otherwise
 *       clips:
 *         - {file: drums.clip, at: 0, repeat: 8}     # from bar 0, eight times back to back
 *         - {file: fill.clip, at: 7}
 *     - name: Bass
 *       clips:
 *         - {file: bass.clip, repeat: 4}              # no `at` = right after the previous clip on this track
 *         - {file: bass.clip, repeat: 4, transpose: 5}   # the same riff, a fourth up
 *
 * BARS count from 0 at the song's start, in the song's time signature.
 * `at` is where a placement begins (default: where the previous one on
 * the track ended, or 0), `repeat` how many times the clip plays back to
 * back (default 1), `transpose` semitones added to every pitch (default
 * 0). Clip refs are relative to the song's folder. A clip that is not
 * there is a problem; the rest of the song still renders and exports.
 */
import yaml from "js-yaml";
import {
  DEFAULT_TEMPO, DEFAULT_TIME, beatsPerBar, clipLengthBars, parseClip, parseTimeSignature, timeSignatureText,
  type ClipDoc, type ClipNote, type TimeSignature,
} from "./clipDoc";
import type { MidiSpec } from "./midiFile";

export interface SongPlacement {
  file: string;
  /** Bar; null = after the previous placement on the track. */
  at: number | null;
  repeat: number;
  transpose: number;
}

export interface SongTrack {
  name: string;
  /** 1–16; null = each clip's own. */
  channel: number | null;
  clips: SongPlacement[];
}

export interface SongDoc {
  title: string;
  tempo: number | null;
  time: TimeSignature | null;
  tracks: SongTrack[];
  problems: string[];
}

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);

/** Lenient parse — never throws; what cannot be read is a problem, not a crash. */
export function parseSong(text: string): SongDoc {
  let raw: Record<string, unknown> = {};
  const problems: string[] = [];
  try { raw = rec(yaml.load(text)); } catch (e) { problems.push(`YAML: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`); }

  let tempo: number | null = null;
  if (raw.tempo !== undefined) {
    const t = num(raw.tempo);
    if (t !== undefined && t > 0 && t <= 999) tempo = t; else problems.push(`tempo: ${String(raw.tempo)} is not a bpm`);
  }
  let time: TimeSignature | null = null;
  if (raw.time !== undefined) {
    time = parseTimeSignature(raw.time);
    if (!time) problems.push(`time: ${JSON.stringify(raw.time)} is not a time signature like 4/4`);
  }

  const tracks: SongTrack[] = [];
  if (raw.tracks !== undefined && !Array.isArray(raw.tracks)) problems.push("tracks: must be a list");
  arr(raw.tracks).forEach((t, i) => {
    const o = rec(t);
    const name = str(o.name)?.trim() || `Track ${i + 1}`;
    let channel: number | null = null;
    if (o.channel !== undefined) {
      const c = num(o.channel);
      if (c !== undefined && Number.isInteger(c) && c >= 1 && c <= 16) channel = c; else problems.push(`track ${name}: channel ${String(o.channel)} is not 1–16`);
    }
    const clips: SongPlacement[] = [];
    if (o.clips !== undefined && !Array.isArray(o.clips)) problems.push(`track ${name}: clips must be a list`);
    arr(o.clips).forEach((c, j) => {
      const p = rec(c);
      const where = `track ${name}, clip ${j + 1}`;
      const file = str(p.file)?.trim();
      if (!file) { problems.push(`${where}: no file`); return; }
      let at: number | null = null;
      if (p.at !== undefined) {
        const a = num(p.at);
        if (a !== undefined && a >= 0) at = a; else problems.push(`${where}: at ${String(p.at)} is not a bar`);
      }
      let repeat = 1;
      if (p.repeat !== undefined) {
        const r = num(p.repeat);
        if (r !== undefined && Number.isInteger(r) && r >= 1) repeat = r; else problems.push(`${where}: repeat ${String(p.repeat)} is not a count`);
      }
      let transpose = 0;
      if (p.transpose !== undefined) {
        const s = num(p.transpose);
        if (s !== undefined && Number.isInteger(s)) transpose = s; else problems.push(`${where}: transpose ${String(p.transpose)} is not a number of semitones`);
      }
      clips.push({ file, at, repeat, transpose });
    });
    tracks.push({ name, channel, clips });
  });

  return { title: str(raw.title) ?? "", tempo, time, tracks, problems };
}

export interface PlacedClip {
  placement: SongPlacement;
  clip: ClipDoc | null;
  /** Where it begins, in beats of the song. */
  startBeat: number;
  /** One pass of the clip, in beats. */
  clipBeats: number;
  /** All passes: repeat × clipBeats. */
  beats: number;
  error?: string;
}

export interface LoadedTrack {
  track: SongTrack;
  placed: PlacedClip[];
  /** Every note the track plays, in song beats, transposed. */
  notes: ClipNote[];
  channel: number;
}

export interface LoadedSong {
  doc: SongDoc;
  tempo: number;
  time: TimeSignature;
  tracks: LoadedTrack[];
  /** The song's length in bars: the last placement's end, rounded up. */
  bars: number;
  problems: string[];
}

/** The song with its clips read through `read` (absolute path → text) — refs resolved by `resolve` against the song's own path. */
export async function loadSong(
  doc: SongDoc, songPath: string, read: (abs: string) => Promise<string>, resolve: (from: string, ref: string) => string,
): Promise<LoadedSong> {
  const problems = [...doc.problems];
  const cache = new Map<string, Promise<ClipDoc | null>>();
  const clipOf = (ref: string): Promise<ClipDoc | null> => {
    const abs = resolve(songPath, ref);
    let p = cache.get(abs);
    if (!p) { p = read(abs).then((t) => parseClip(t), () => null); cache.set(abs, p); }
    return p;
  };
  const tracks: LoadedTrack[] = [];
  let firstClip: ClipDoc | null = null;
  for (const track of doc.tracks) {
    const placed: PlacedClip[] = [];
    for (const placement of track.clips) {
      const clip = await clipOf(placement.file);
      if (clip && !firstClip) firstClip = clip;
      placed.push({ placement, clip, startBeat: 0, clipBeats: 0, beats: 0, ...(clip ? {} : { error: `${placement.file} is not there` }) });
    }
    tracks.push({ track, placed, notes: [], channel: track.channel ?? 1 });
  }
  const tempo = doc.tempo ?? firstClip?.tempo ?? DEFAULT_TEMPO;
  const time = doc.time ?? firstClip?.time ?? DEFAULT_TIME;
  const bpb = beatsPerBar(time);
  let endBeat = 0;
  for (const t of tracks) {
    let cursor = 0;
    for (const p of t.placed) {
      p.startBeat = p.placement.at === null ? cursor : p.placement.at * bpb;
      p.clipBeats = p.clip ? clipLengthBars(p.clip) * beatsPerBar(p.clip.time) : bpb;
      p.beats = p.clipBeats * p.placement.repeat;
      cursor = p.startBeat + p.beats;
      endBeat = Math.max(endBeat, cursor);
      if (p.error) { problems.push(`track ${t.track.name}: ${p.error}`); continue; }
      if (!p.clip) continue;
      if (p.clip.problems.length) problems.push(`track ${t.track.name}: ${p.placement.file} has ${p.clip.problems.length} problem${p.clip.problems.length === 1 ? "" : "s"} of its own`);
      if (t.track.channel === null && t.placed.indexOf(p) === 0) t.channel = p.clip.channel;
      for (let r = 0; r < p.placement.repeat; r++) {
        for (const n of p.clip.notes) {
          const pitch = n.pitch + p.placement.transpose;
          if (pitch < 0 || pitch > 127) continue;
          t.notes.push({ ...n, pitch, start: p.startBeat + r * p.clipBeats + n.start });
        }
      }
    }
    t.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  }
  return { doc, tempo, time, tracks, bars: Math.max(1, Math.ceil(endBeat / bpb - 1e-9)), problems };
}

/** What the export writes: a format 1 file, one track per song track. */
export function songMidiSpec(song: LoadedSong, title?: string): MidiSpec {
  return {
    tempo: song.tempo, time: song.time, title: title ?? (song.doc.title || undefined),
    tracks: song.tracks.map((t) => ({ name: t.track.name, channel: t.channel, notes: t.notes })),
  };
}

/** One line for the checker and the view's header. */
export function songSummary(song: LoadedSong): string {
  const notes = song.tracks.reduce((n, t) => n + t.notes.length, 0);
  return `${song.tracks.length} track${song.tracks.length === 1 ? "" : "s"} · ${song.bars} bar${song.bars === 1 ? "" : "s"} · ${notes} notes · ${song.tempo} bpm · ${timeSignatureText(song.time)}`;
}
