/**
 * Standard MIDI Files, written and read — the bytes a `.clip` or a `.song`
 * exports (`<stem>.mid`), and the same bytes read back so a test, or a
 * viewer, sees exactly what a DAW will.
 *
 * One clip → format 0: a single track carrying the tempo, the time
 * signature, the name and the notes. A song → format 1: track 0 holds the
 * tempo, time signature and title, then one track per song track, named,
 * on its channel — dropped on Ableton Live's Arrangement, that is one
 * named track per MIDI track. Time is in beats (quarter notes) at 480
 * ticks per quarter; note-offs are real note-offs (0x8n), and at one tick
 * every note-off precedes every note-on, so a repeated pitch re-triggers.
 * No running status on the way out; on the way in it is honoured.
 */
import type { TimeSignature } from "./clipDoc";

export const PPQ = 480;

export interface MidiNote {
  pitch: number;
  /** Beats from the start. */
  start: number;
  /** Beats. */
  length: number;
  velocity: number;
}

export interface MidiTrack {
  name?: string;
  /** 1–16. */
  channel: number;
  notes: MidiNote[];
}

export interface MidiSpec {
  tempo: number;
  time: TimeSignature;
  /** The file's name — track 0's name in a format 1 file, the one track's in format 0 (unless the track has its own). */
  title?: string;
  tracks: MidiTrack[];
  ppq?: number;
}

const vlq = (n: number): number[] => {
  const out = [n & 0x7f];
  let v = n >> 7;
  while (v > 0) { out.unshift((v & 0x7f) | 0x80); v >>= 7; }
  return out;
};

const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const be16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const utf8 = (s: string): number[] => Array.from(new TextEncoder().encode(s));

interface Event { tick: number; order: number; bytes: number[] }

const meta = (tick: number, type: number, data: number[]): Event => ({ tick, order: 0, bytes: [0xff, type, ...vlq(data.length), ...data] });
const tempoEvent = (bpm: number): Event => meta(0, 0x51, be32(Math.round(60_000_000 / bpm)).slice(1));
const timeEvent = (t: TimeSignature): Event => meta(0, 0x58, [t.beats, Math.round(Math.log2(t.unit)), 24, 8]);
const nameEvent = (name: string): Event => meta(0, 0x03, utf8(name));

function noteEvents(track: MidiTrack, ppq: number): Event[] {
  const ch = Math.min(15, Math.max(0, track.channel - 1));
  const out: Event[] = [];
  for (const n of track.notes) {
    const on = Math.round(n.start * ppq);
    const off = Math.max(on + 1, Math.round((n.start + n.length) * ppq));
    const pitch = Math.min(127, Math.max(0, Math.round(n.pitch)));
    const vel = Math.min(127, Math.max(1, Math.round(n.velocity)));
    out.push({ tick: on, order: 2, bytes: [0x90 | ch, pitch, vel] });
    out.push({ tick: off, order: 1, bytes: [0x80 | ch, pitch, 0x40] });
  }
  return out;
}

function trackChunk(events: Event[]): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [];
  let at = 0;
  for (const e of sorted) { body.push(...vlq(e.tick - at), ...e.bytes); at = e.tick; }
  body.push(0x00, 0xff, 0x2f, 0x00);
  return [0x4d, 0x54, 0x72, 0x6b, ...be32(body.length), ...body];
}

/** The file's bytes. */
export function writeMidiFile(spec: MidiSpec): Uint8Array {
  const ppq = spec.ppq ?? PPQ;
  const chunks: number[][] = [];
  const head = [tempoEvent(spec.tempo), timeEvent(spec.time)];
  if (spec.tracks.length === 1) {
    const t = spec.tracks[0];
    const name = t.name ?? spec.title;
    chunks.push(trackChunk([...head, ...(name ? [nameEvent(name)] : []), ...noteEvents(t, ppq)]));
  } else {
    chunks.push(trackChunk([...head, ...(spec.title ? [nameEvent(spec.title)] : [])]));
    for (const t of spec.tracks) chunks.push(trackChunk([...(t.name ? [nameEvent(t.name)] : []), ...noteEvents(t, ppq)]));
  }
  const format = spec.tracks.length === 1 ? 0 : 1;
  const header = [0x4d, 0x54, 0x68, 0x64, ...be32(6), ...be16(format), ...be16(chunks.length), ...be16(ppq)];
  return Uint8Array.from([...header, ...chunks.flat()]);
}

export interface MidiReadTrack {
  name?: string;
  notes: (MidiNote & { channel: number })[];
}

export interface MidiRead {
  format: number;
  ppq: number;
  tempo?: number;
  time?: TimeSignature;
  tracks: MidiReadTrack[];
}

/** The file read back: tracks with their notes in beats, the first tempo and time signature met. */
export function readMidiFile(bytes: Uint8Array): MidiRead {
  const u32 = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const tag = (i: number) => String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
  if (bytes.length < 14 || tag(0) !== "MThd") throw new Error("not a MIDI file (no MThd header)");
  const headLen = u32(4);
  const format = u16(8);
  const ntrks = u16(10);
  const division = u16(12);
  if (division & 0x8000) throw new Error("SMPTE time division is not supported");
  const ppq = division;
  const out: MidiRead = { format, ppq, tracks: [] };
  let pos = 8 + headLen;
  for (let t = 0; t < ntrks && pos + 8 <= bytes.length; t++) {
    if (tag(pos) !== "MTrk") throw new Error(`track ${t + 1}: no MTrk chunk at byte ${pos}`);
    const len = u32(pos + 4);
    let i = pos + 8;
    const end = i + len;
    const track: MidiReadTrack = { notes: [] };
    const open = new Map<string, { start: number; velocity: number }>();
    let tick = 0;
    let status = 0;
    const readVlq = () => { let v = 0; let b: number; do { b = bytes[i++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    while (i < end) {
      tick += readVlq();
      let b = bytes[i];
      if (b < 0x80) { if (!status) throw new Error(`track ${t + 1}: a data byte with no running status at byte ${i}`); b = status; }
      else { i++; if (b < 0xf0) status = b; }
      if (b === 0xff) {
        status = 0; // a meta event cancels running status
        const type = bytes[i++];
        const n = readVlq();
        const data = bytes.subarray(i, i + n);
        i += n;
        if (type === 0x03 && track.name === undefined) track.name = new TextDecoder().decode(data);
        else if (type === 0x51 && out.tempo === undefined) out.tempo = Math.round((60_000_000 / ((data[0] << 16) | (data[1] << 8) | data[2])) * 1000) / 1000;
        else if (type === 0x58 && out.time === undefined) out.time = { beats: data[0], unit: 2 ** data[1] };
        else if (type === 0x2f) break;
      } else if (b === 0xf0 || b === 0xf7) {
        status = 0; // so does sysex
        const n = readVlq(); // (read first: `i +=` would capture i before the read moved it)
        i += n;
      } else {
        const kind = b & 0xf0;
        const channel = (b & 0x0f) + 1;
        const d1 = bytes[i++];
        const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[i++];
        const key = `${channel}:${d1}`;
        if (kind === 0x90 && d2 > 0) {
          const prev = open.get(key);
          if (prev) track.notes.push({ pitch: d1, start: prev.start / ppq, length: (tick - prev.start) / ppq, velocity: prev.velocity, channel });
          open.set(key, { start: tick, velocity: d2 });
        } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
          const prev = open.get(key);
          if (prev) { track.notes.push({ pitch: d1, start: prev.start / ppq, length: (tick - prev.start) / ppq, velocity: prev.velocity, channel }); open.delete(key); }
        }
      }
    }
    track.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    out.tracks.push(track);
    pos = end;
  }
  return out;
}
