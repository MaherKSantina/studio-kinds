/** GOLDEN RULES for a clip — the notes of one MIDI clip, from names, beats and step lanes. */
import { describe, expect, it } from "vitest";
import { beatsPerBar, clipLengthBars, clipSummary, parseClip, parseTimeSignature, pitchName, pitchNumber, pitchRange } from "./clipDoc";

describe("pitches", () => {
  it("scientific names put middle C at 60, Ableton's at C3; accidentals, negative octaves and numbers all read", () => {
    expect(pitchNumber("C4")).toBe(60);
    expect(pitchNumber("C3", "ableton")).toBe(60);
    expect(pitchNumber("C2")).toBe(36);
    expect(pitchNumber("C1", "ableton")).toBe(36);
    expect(pitchNumber("F#3")).toBe(54);
    expect(pitchNumber("Gb3")).toBe(54);
    expect(pitchNumber("Bb1")).toBe(34);
    expect(pitchNumber("C-1")).toBe(0);
    expect(pitchNumber("G9")).toBe(127);
    expect(pitchNumber(60)).toBe(60);
    expect(pitchNumber("60")).toBe(60);
    expect(pitchNumber("H2")).toBeNull();
    expect(pitchNumber("G#9")).toBeNull();
    expect(pitchNumber(128)).toBeNull();
    expect(pitchNumber(60.5)).toBeNull();
    expect(pitchNumber(null)).toBeNull();
  });
  it("names come back with sharps, in either naming", () => {
    expect(pitchName(60)).toBe("C4");
    expect(pitchName(60, "ableton")).toBe("C3");
    expect(pitchName(54)).toBe("F#3");
    expect(pitchName(0)).toBe("C-1");
    expect(pitchName(127)).toBe("G9");
  });
});

describe("time signatures", () => {
  it("read as a string, a pair or an object; a bar is measured in quarter notes", () => {
    expect(parseTimeSignature("4/4")).toEqual({ beats: 4, unit: 4 });
    expect(parseTimeSignature([3, 4])).toEqual({ beats: 3, unit: 4 });
    expect(parseTimeSignature({ beats: 6, unit: 8 })).toEqual({ beats: 6, unit: 8 });
    expect(parseTimeSignature("4/5")).toBeNull();
    expect(parseTimeSignature("x")).toBeNull();
    expect(beatsPerBar({ beats: 4, unit: 4 })).toBe(4);
    expect(beatsPerBar({ beats: 6, unit: 8 })).toBe(3);
    expect(beatsPerBar({ beats: 7, unit: 8 })).toBe(3.5);
  });
});

describe("a clip", () => {
  it("explicit notes: defaults fill in, a list is a chord, numbers are notes, the order is by start then pitch", () => {
    const d = parseClip([
      "title: Chords", "tempo: 128", "time: 4/4", "velocity: 90",
      "notes:",
      "  - {pitch: [C3, Eb3, G3], start: 4, length: 4}",
      "  - {pitch: C2, start: 0, length: 0.75, velocity: 110}",
      "  - {pitch: 60, start: 0}",
    ].join("\n"));
    expect(d.problems).toEqual([]);
    expect(d.tempo).toBe(128);
    expect(d.notes).toEqual([
      { pitch: 36, start: 0, length: 0.75, velocity: 110 },
      { pitch: 60, start: 0, length: 1, velocity: 90 },
      { pitch: 48, start: 4, length: 4, velocity: 90 },
      { pitch: 51, start: 4, length: 4, velocity: 90 },
      { pitch: 55, start: 4, length: 4, velocity: 90 },
    ]);
    expect(clipLengthBars(d)).toBe(2);
    expect(clipSummary(d)).toBe("5 notes · 2 bars · 128 bpm · 4/4 · C2–C4");
  });
  it("lanes: a step is a bar over the grid; x X o and digits are velocities; separators are ignored; a long string runs on", () => {
    const d = parseClip([
      "lanes:",
      "  - {name: Kick, pitch: C2, steps: 'x...x...x...x...'}",
      "  - {pitch: D2, steps: '....X.......o...'}",
      "  - {name: Hat, pitch: F#2, steps: '..9...5. | ..x...x.', length: 0.125}",
    ].join("\n"));
    expect(d.problems).toEqual([]);
    expect(d.lanes.map((l) => l.name)).toEqual(["Kick", "D2", "Hat"]);
    const kick = d.notes.filter((n) => n.lane === "Kick");
    expect(kick.map((n) => n.start)).toEqual([0, 1, 2, 3]);
    expect(kick[0]).toEqual({ pitch: 36, start: 0, length: 0.25, velocity: 100, lane: "Kick" });
    const d2 = d.notes.filter((n) => n.lane === "D2");
    expect(d2.map((n) => [n.start, n.velocity])).toEqual([[1, 127], [3, 50]]);
    const hat = d.notes.filter((n) => n.lane === "Hat");
    expect(hat.map((n) => [n.start, n.velocity, n.length])).toEqual([[0.5, 127, 0.125], [1.5, 71, 0.125], [2.5, 100, 0.125], [3.5, 100, 0.125]]);
    expect(clipLengthBars(d)).toBe(1);
    expect(pitchRange(d.notes)).toEqual({ low: 36, high: 42 });
  });
  it("a lane over two bars at a coarser grid, in 3/4", () => {
    const d = parseClip("time: 3/4\ngrid: 6\nlanes:\n  - {pitch: C2, steps: 'x.x.x.|x.....'}\n");
    expect(d.notes.map((n) => n.start)).toEqual([0, 1, 2, 3]);
    expect(d.notes[0].length).toBe(0.5);
    expect(clipLengthBars(d)).toBe(2);
  });
  it("Ableton naming reads the file's names Live's way", () => {
    const d = parseClip("naming: ableton\nnotes:\n  - {pitch: C3, start: 0}\n  - {pitch: C1, start: 1}\n");
    expect(d.notes.map((n) => n.pitch)).toEqual([60, 36]);
    expect(pitchName(d.notes[1].pitch, d.naming)).toBe("C1");
  });
  it("the authored length wins; a note beginning past it is a problem, one ringing past it is not", () => {
    const ok = parseClip("bars: 1\nnotes:\n  - {pitch: C3, start: 3, length: 4}\n");
    expect(ok.problems).toEqual([]);
    expect(clipLengthBars(ok)).toBe(1);
    const late = parseClip("bars: 1\nnotes:\n  - {pitch: C3, start: 4}\n");
    expect(late.problems).toEqual(["a note at beat 4 begins at or after the clip's end (1 bars = 4 beats)"]);
  });
  it("an empty clip is one bar of nothing at 120 in 4/4", () => {
    const d = parseClip("");
    expect(d.problems).toEqual([]);
    expect(d.tempo).toBe(120);
    expect(d.time).toEqual({ beats: 4, unit: 4 });
    expect(d.notes).toEqual([]);
    expect(clipLengthBars(d)).toBe(1);
    expect(pitchRange(d.notes)).toBeNull();
  });
  it("reports what it cannot use, note by note and lane by lane, and keeps the rest", () => {
    const d = parseClip([
      "tempo: fast", "time: 5/5", "bars: -1", "channel: 17", "velocity: 200", "grid: 0", "naming: live",
      "notes:",
      "  - {pitch: H2, start: 0}",
      "  - {pitch: C3, start: -1}",
      "  - {pitch: C3, length: 0}",
      "  - {pitch: C3, velocity: 0}",
      "  - {start: 1}",
      "  - {pitch: [C3, X], start: 2}",
      "lanes:",
      "  - {pitch: Q, steps: x}",
      "  - {name: Snare, pitch: D2}",
      "  - {name: Hat, pitch: F#2, steps: 'x.q.'}",
    ].join("\n"));
    expect(d.problems).toEqual([
      'naming: "live" is neither scientific nor ableton',
      "tempo: fast is not a bpm",
      'time: "5/5" is not a time signature like 4/4',
      "bars: -1 is not a length in bars",
      "channel: 17 is not 1–16",
      "velocity: velocity 200 is not 1–127",
      "grid: 0 is not a number of steps per bar",
      'note 1: pitch "H2" is not a note name or a MIDI number',
      "note 2: start -1 is not a beat",
      "note 3: length 0 is not a number of beats",
      "note 4: velocity 0 is not 1–127",
      "note 5: no pitch",
      'note 6: pitch "X" is not a note name or a MIDI number',
      'lane lane 1: pitch "Q" is not a note name or a MIDI number',
      "lane Snare: no steps",
      'lane Hat: unknown step character "q" at step 3',
    ]);
    // What survived: note 4 at the clip's velocity, C3 of the chord, the hat's one hit.
    expect(d.notes.map((n) => [n.pitch, n.start, n.velocity])).toEqual([[42, 0, 100], [48, 0, 100], [48, 2, 100]]);
    expect(d.tempo).toBe(120);
    expect(d.channel).toBe(1);
    expect(d.grid).toBe(16);
  });
  it("a file that is not YAML is one problem, not a crash", () => {
    const d = parseClip("notes: [\n");
    expect(d.problems.length).toBe(1);
    expect(d.problems[0].startsWith("YAML:")).toBe(true);
  });
});
