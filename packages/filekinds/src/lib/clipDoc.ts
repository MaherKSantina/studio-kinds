/**
 * The `.clip` kind — the NOTES of one MIDI clip, as a document. What a
 * DAW keeps behind a clip's piano roll, written down: which pitches sound
 * when, for how long, how hard. The Studio draws it as a piano roll and
 * exports it as a Standard MIDI File (`<stem>.mid` beside it — the Export
 * button, or `studio-check --midi x.clip`), which Ableton Live, or any
 * DAW, takes as a clip. A `.song` places clips on tracks.
 *
 * Authoring shape (YAML, lenient — a half-written file still renders):
 *
 *   title: Bass                 # optional heading
 *   tempo: 128                  # beats per minute (default 120)
 *   time: 4/4                   # time signature (default 4/4); `[3, 4]` works too
 *   bars: 2                     # the clip's length; default = the last note rounded up to a bar
 *   channel: 1                  # MIDI channel 1–16 (default 1; drum racks listen on any)
 *   velocity: 100               # the default velocity 1–127 (default 100)
 *   naming: scientific          # how pitch NAMES read: scientific = C4 is 60 (the default,
 *                               #   mido, the launchpad engine); ableton = C3 is 60 (what Live shows)
 *   notes:                      # explicit notes — a melody, a bass line, chords
 *     - {pitch: C2, start: 0, length: 0.75}
 *     - {pitch: [C3, Eb3, G3], start: 4, length: 4, velocity: 90}    # a list = a chord
 *     - {pitch: 60, start: 8, length: 1}                              # a number = the MIDI note
 *   grid: 16                    # steps per bar for the lanes below (default 16 = sixteenths)
 *   lanes:                      # step rows — drums: one character per step
 *     - {name: Kick, pitch: C2, steps: "x...x...x...x..."}
 *     - {name: Clap, pitch: D2, steps: "....x.......x..."}
 *     - {name: Hat,  pitch: F#2, steps: "..x...x...x...x. | ..x...x...x..xx.", length: 0.125}
 *
 * TIME is in BEATS — quarter notes, counted from 0 at the clip's start,
 * whatever the time signature (a bar of 4/4 is 4 beats, of 3/4 is 3, of
 * 6/8 is 3): `start` where a note begins, `length` how long it holds
 * (default 1). Halves and quarters of a beat are eighths and sixteenths.
 * A note that begins at or after the clip's end is a problem; one that
 * merely rings past it is not.
 *
 * A PITCH is a name (`C2`, `F#3`, `Bb1`, octaves may be negative) or a MIDI
 * number 0–127, and a list of either is a chord — one note per pitch, same
 * start, length and velocity. VELOCITY is 1–127; unset = the clip's.
 *
 * A LANE is a row of steps over the grid: `x` a hit at the clip's velocity
 * (or the lane's own `velocity:`), `X` an accent (127), `o` a ghost (50),
 * `1`–`9` that ninth of 127, `.` or `-` a rest; `|` and spaces are ignored
 * so bars can be separated by eye. A string longer than one bar runs on
 * into the next. Each hit lasts one step unless the lane gives `length:`
 * (in beats). Lanes and notes may be mixed; both become notes.
 *
 * Nothing here is informational text: `title` is the heading, everything
 * else is what the notes are.
 */
import yaml from "js-yaml";

export type Naming = "scientific" | "ableton";

export interface TimeSignature {
  /** Beats per bar as written (the top number). */
  beats: number;
  /** The note value of one written beat (the bottom number): 4 = a quarter. */
  unit: number;
}

export interface ClipNote {
  /** MIDI note 0–127. */
  pitch: number;
  /** In beats (quarter notes) from the clip's start. */
  start: number;
  /** In beats. */
  length: number;
  /** 1–127. */
  velocity: number;
  /** The lane the hit came from, when it did — the roll labels its row by it. */
  lane?: string;
}

export interface ClipLane {
  name: string;
  pitch: number;
  /** As authored, separators and all. */
  steps: string;
  /** Length of a hit, in beats. */
  length: number;
  velocity: number;
}

export interface ClipDoc {
  title: string;
  tempo: number;
  time: TimeSignature;
  /** Authored length in bars; null = derived from the notes. */
  bars: number | null;
  channel: number;
  velocity: number;
  naming: Naming;
  grid: number;
  /** Every note — explicit ones and the lanes' hits — by start, then pitch. */
  notes: ClipNote[];
  lanes: ClipLane[];
  problems: string[];
}

export const DEFAULT_TEMPO = 120;
export const DEFAULT_TIME: TimeSignature = { beats: 4, unit: 4 };

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);

const PITCH_CLASSES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** The octave number a name gives to MIDI 60: 4 in scientific pitch, 3 in Ableton's display. */
const middleCOctave = (naming: Naming): number => (naming === "ableton" ? 3 : 4);

/** A pitch as written — a name like `F#3` or `Bb-1`, a number, or a numeric string — to MIDI 0–127; null when it is neither. */
export function pitchNumber(value: unknown, naming: Naming = "scientific"): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 && value <= 127 ? value : null;
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (/^\d+$/.test(s)) return pitchNumber(Number(s), naming);
  const m = /^([A-Ga-g])([#♯b♭]?)(-?\d+)$/.exec(s);
  if (!m) return null;
  const pc = PITCH_CLASSES[m[1].toUpperCase()];
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0;
  const n = (Number(m[3]) - middleCOctave(naming) + 5) * 12 + pc + acc;
  return n >= 0 && n <= 127 ? n : null;
}

/** A MIDI note as a name in the given naming (sharps). */
export function pitchName(n: number, naming: Naming = "scientific"): string {
  return `${SHARP_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 5 + middleCOctave(naming)}`;
}

/** `4/4`, `[3, 4]`, `{beats, unit}` → a time signature; null when unreadable. */
export function parseTimeSignature(value: unknown): TimeSignature | null {
  let beats: number | undefined;
  let unit: number | undefined;
  if (typeof value === "string") {
    const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(value);
    if (!m) return null;
    beats = Number(m[1]); unit = Number(m[2]);
  } else if (Array.isArray(value) && value.length === 2) {
    beats = num(value[0]); unit = num(value[1]);
  } else if (value && typeof value === "object") {
    const o = rec(value);
    beats = num(o.beats); unit = num(o.unit);
  }
  if (!beats || !unit || !Number.isInteger(beats) || beats < 1 || beats > 64) return null;
  if (![1, 2, 4, 8, 16, 32].includes(unit)) return null;
  return { beats, unit };
}

export const timeSignatureText = (t: TimeSignature): string => `${t.beats}/${t.unit}`;

/** How many BEATS (quarter notes) a bar holds: 4/4 → 4, 3/4 → 3, 6/8 → 3, 7/8 → 3.5. */
export const beatsPerBar = (t: TimeSignature): number => (t.beats * 4) / t.unit;

const STEP_VELOCITY: Record<string, (base: number) => number> = {
  x: (base) => base,
  X: () => 127,
  o: () => 50,
};

/** The hits a step string gives, as notes: step i starts at i × (a bar / grid). */
export function laneNotes(lane: ClipLane, time: TimeSignature, grid: number, problems: string[] = []): ClipNote[] {
  const stepBeats = beatsPerBar(time) / grid;
  const out: ClipNote[] = [];
  let step = 0;
  for (const ch of lane.steps) {
    if (ch === "|" || /\s/.test(ch)) continue;
    if (ch === "." || ch === "-") { step++; continue; }
    let velocity: number | undefined;
    if (STEP_VELOCITY[ch]) velocity = STEP_VELOCITY[ch](lane.velocity);
    else if (/^[1-9]$/.test(ch)) velocity = Math.round((Number(ch) * 127) / 9);
    if (velocity === undefined) problems.push(`lane ${lane.name}: unknown step character "${ch}" at step ${step + 1}`);
    else out.push({ pitch: lane.pitch, start: step * stepBeats, length: lane.length, velocity, lane: lane.name });
    step++;
  }
  return out;
}

const clampVelocity = (v: number | undefined, fallback: number, where: string, problems: string[]): number => {
  if (v === undefined) return fallback;
  if (!Number.isInteger(v) || v < 1 || v > 127) { problems.push(`${where}: velocity ${v} is not 1–127`); return fallback; }
  return v;
};

/** Lenient parse — never throws; what cannot be read is a problem, not a crash. */
export function parseClip(text: string): ClipDoc {
  let raw: Record<string, unknown> = {};
  const problems: string[] = [];
  try { raw = rec(yaml.load(text)); } catch (e) { problems.push(`YAML: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`); }

  const naming: Naming = raw.naming === "ableton" ? "ableton" : "scientific";
  if (raw.naming !== undefined && raw.naming !== "ableton" && raw.naming !== "scientific") problems.push(`naming: "${String(raw.naming)}" is neither scientific nor ableton`);

  let tempo = num(raw.tempo) ?? DEFAULT_TEMPO;
  if (raw.tempo !== undefined && (num(raw.tempo) === undefined || tempo <= 0 || tempo > 999)) { problems.push(`tempo: ${String(raw.tempo)} is not a bpm`); tempo = DEFAULT_TEMPO; }

  let time = DEFAULT_TIME;
  if (raw.time !== undefined) {
    const t = parseTimeSignature(raw.time);
    if (t) time = t; else problems.push(`time: ${JSON.stringify(raw.time)} is not a time signature like 4/4`);
  }

  let bars: number | null = null;
  if (raw.bars !== undefined) {
    const b = num(raw.bars);
    if (b !== undefined && b > 0) bars = b; else problems.push(`bars: ${String(raw.bars)} is not a length in bars`);
  }

  let channel = num(raw.channel) ?? 1;
  if (raw.channel !== undefined && (!Number.isInteger(channel) || channel < 1 || channel > 16)) { problems.push(`channel: ${String(raw.channel)} is not 1–16`); channel = 1; }

  const velocity = clampVelocity(raw.velocity === undefined ? undefined : (num(raw.velocity) ?? -1), 100, "velocity", problems);

  let grid = num(raw.grid) ?? 16;
  if (raw.grid !== undefined && (!Number.isInteger(grid) || grid < 1 || grid > 128)) { problems.push(`grid: ${String(raw.grid)} is not a number of steps per bar`); grid = 16; }

  const notes: ClipNote[] = [];
  if (raw.notes !== undefined && !Array.isArray(raw.notes)) problems.push("notes: must be a list");
  arr(raw.notes).forEach((n, i) => {
    const o = rec(n);
    const where = `note ${i + 1}`;
    const pitches = Array.isArray(o.pitch) ? o.pitch : [o.pitch];
    const start = num(o.start) ?? 0;
    if (o.start !== undefined && (num(o.start) === undefined || start < 0)) { problems.push(`${where}: start ${String(o.start)} is not a beat`); return; }
    const length = num(o.length) ?? 1;
    if (o.length !== undefined && (num(o.length) === undefined || length <= 0)) { problems.push(`${where}: length ${String(o.length)} is not a number of beats`); return; }
    const vel = clampVelocity(o.velocity === undefined ? undefined : (num(o.velocity) ?? -1), velocity, where, problems);
    if (o.pitch === undefined) { problems.push(`${where}: no pitch`); return; }
    for (const p of pitches) {
      const pitch = pitchNumber(p, naming);
      if (pitch === null) { problems.push(`${where}: pitch ${JSON.stringify(p)} is not a note name or a MIDI number`); continue; }
      notes.push({ pitch, start, length, velocity: vel });
    }
  });

  const lanes: ClipLane[] = [];
  if (raw.lanes !== undefined && !Array.isArray(raw.lanes)) problems.push("lanes: must be a list");
  arr(raw.lanes).forEach((l, i) => {
    const o = rec(l);
    const pitch = pitchNumber(o.pitch, naming);
    const name = str(o.name)?.trim() || (pitch !== null ? pitchName(pitch, naming) : `lane ${i + 1}`);
    const where = `lane ${name}`;
    if (pitch === null) { problems.push(`${where}: pitch ${JSON.stringify(o.pitch)} is not a note name or a MIDI number`); return; }
    const steps = str(o.steps);
    if (steps === undefined) { problems.push(`${where}: no steps`); return; }
    let length = num(o.length) ?? beatsPerBar(time) / grid;
    if (o.length !== undefined && (num(o.length) === undefined || length <= 0)) { problems.push(`${where}: length ${String(o.length)} is not a number of beats`); length = beatsPerBar(time) / grid; }
    const lane: ClipLane = { name, pitch, steps, length, velocity: clampVelocity(o.velocity === undefined ? undefined : (num(o.velocity) ?? -1), velocity, where, problems) };
    lanes.push(lane);
    notes.push(...laneNotes(lane, time, grid, problems));
  });

  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const doc: ClipDoc = { title: str(raw.title) ?? "", tempo, time, bars, channel, velocity, naming, grid, notes, lanes, problems };
  const end = clipLengthBars(doc) * beatsPerBar(time);
  for (const n of notes) if (n.start >= end) { problems.push(`a note at beat ${n.start} begins at or after the clip's end (${clipLengthBars(doc)} bars = ${end} beats)`); break; }
  return doc;
}

/** The clip's length in bars: as authored, else the last note's end rounded up to a whole bar (at least 1). */
export function clipLengthBars(doc: ClipDoc): number {
  if (doc.bars !== null) return doc.bars;
  const bpb = beatsPerBar(doc.time);
  const end = doc.notes.reduce((m, n) => Math.max(m, n.start + n.length), 0);
  return Math.max(1, Math.ceil(end / bpb - 1e-9));
}

/** Lowest and highest pitch used; null for an empty clip. */
export function pitchRange(notes: ClipNote[]): { low: number; high: number } | null {
  if (!notes.length) return null;
  let low = 127, high = 0;
  for (const n of notes) { if (n.pitch < low) low = n.pitch; if (n.pitch > high) high = n.pitch; }
  return { low, high };
}

/** One line for the checker and the view's header. */
export function clipSummary(doc: ClipDoc): string {
  const r = pitchRange(doc.notes);
  return `${doc.notes.length} notes · ${clipLengthBars(doc)} bar${clipLengthBars(doc) === 1 ? "" : "s"} · ${doc.tempo} bpm · ${timeSignatureText(doc.time)}${r ? ` · ${pitchName(r.low, doc.naming)}–${pitchName(r.high, doc.naming)}` : ""}`;
}
