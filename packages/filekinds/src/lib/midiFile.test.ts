/** GOLDEN RULES for MIDI files — what the bytes carry, byte by byte, and back. */
import { describe, expect, it } from "vitest";
import { PPQ, readMidiFile, writeMidiFile } from "./midiFile";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");

describe("writing", () => {
  it("one track is a format 0 file: header, then tempo, time signature, name and the notes with deltas", () => {
    const bytes = writeMidiFile({
      tempo: 120, time: { beats: 4, unit: 4 }, title: "Kick",
      tracks: [{ channel: 10, notes: [{ pitch: 36, start: 0, length: 0.5, velocity: 100 }, { pitch: 36, start: 1, length: 0.5, velocity: 127 }] }],
    });
    expect(hex(bytes)).toBe([
      "4d 54 68 64 00 00 00 06 00 00 00 01 01 e0",      // MThd, format 0, 1 track, 480 ppq
      "4d 54 72 6b 00 00 00 2e",                        // MTrk, 46 bytes
      "00 ff 51 03 07 a1 20",                           // tempo 500000 µs = 120 bpm
      "00 ff 58 04 04 02 18 08",                        // 4/4
      "00 ff 03 04 4b 69 63 6b",                        // name "Kick"
      "00 99 24 64",                                    // note on ch10 C2 v100
      "81 70 89 24 40",                                 // +240 note off
      "81 70 99 24 7f",                                 // +240 note on v127
      "81 70 89 24 40",                                 // +240 note off
      "00 ff 2f 00",                                    // end of track
    ].join(" "));
  });
  it("several tracks are a format 1 file: a conductor track, then one named track per track", () => {
    const bytes = writeMidiFile({
      tempo: 128, time: { beats: 3, unit: 4 }, title: "Song",
      tracks: [
        { name: "Drums", channel: 10, notes: [{ pitch: 36, start: 0, length: 1, velocity: 100 }] },
        { name: "Bass", channel: 2, notes: [{ pitch: 40, start: 3, length: 1, velocity: 90 }] },
      ],
    });
    expect(hex(bytes.subarray(0, 14))).toBe("4d 54 68 64 00 00 00 06 00 01 00 03 01 e0");
    const back = readMidiFile(bytes);
    expect(back.format).toBe(1);
    expect(back.tempo).toBe(128);
    expect(back.time).toEqual({ beats: 3, unit: 4 });
    expect(back.tracks.map((t) => t.name)).toEqual(["Song", "Drums", "Bass"]);
    expect(back.tracks[1].notes).toEqual([{ pitch: 36, start: 0, length: 1, velocity: 100, channel: 10 }]);
    expect(back.tracks[2].notes).toEqual([{ pitch: 40, start: 3, length: 1, velocity: 90, channel: 2 }]);
  });
  it("at one tick every note-off goes before every note-on, so a repeated pitch re-triggers; a zero-length note lasts a tick", () => {
    const bytes = writeMidiFile({
      tempo: 120, time: { beats: 4, unit: 4 },
      tracks: [{ channel: 1, notes: [{ pitch: 60, start: 0, length: 1, velocity: 100 }, { pitch: 60, start: 1, length: 0, velocity: 100 }] }],
    });
    const back = readMidiFile(bytes);
    expect(back.tracks[0].notes).toEqual([
      { pitch: 60, start: 0, length: 1, velocity: 100, channel: 1 },
      { pitch: 60, start: 1, length: 1 / PPQ, velocity: 100, channel: 1 },
    ]);
  });
  it("a chord and an overlapping held note survive the round trip; pitches and velocities are clamped to MIDI's range", () => {
    const bytes = writeMidiFile({
      tempo: 90, time: { beats: 6, unit: 8 },
      tracks: [{ channel: 1, notes: [
        { pitch: 48, start: 0, length: 4, velocity: 80 }, { pitch: 52, start: 0, length: 4, velocity: 80 }, { pitch: 55, start: 0, length: 4, velocity: 80 },
        { pitch: 130, start: 2, length: 0.25, velocity: 300 }, { pitch: -3, start: 2.5, length: 0.25, velocity: 0 },
      ] }],
    });
    const back = readMidiFile(bytes);
    expect(back.time).toEqual({ beats: 6, unit: 8 });
    expect(back.tempo).toBe(90);
    expect(back.tracks[0].notes).toEqual([
      { pitch: 48, start: 0, length: 4, velocity: 80, channel: 1 },
      { pitch: 52, start: 0, length: 4, velocity: 80, channel: 1 },
      { pitch: 55, start: 0, length: 4, velocity: 80, channel: 1 },
      { pitch: 127, start: 2, length: 0.25, velocity: 127, channel: 1 },
      { pitch: 0, start: 2.5, length: 0.25, velocity: 1, channel: 1 },
    ]);
  });
});

describe("reading", () => {
  it("honours running status and a velocity-0 note-on as a note-off, skips sysex and other channel messages", () => {
    const bytes = Uint8Array.from([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,          // format 0, 96 ppq
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 27,
      0x00, 0xf0, 0x02, 0x7e, 0xf7,                                    // sysex, skipped
      0x00, 0xb0, 0x07, 0x64,                                          // volume, skipped
      0x00, 0x90, 0x3c, 0x40,                                          // C4 on
      0x60, 0x3c, 0x00,                                                // +96 running status, C4 off (velocity 0)
      0x00, 0x40, 0x50,                                                // E4 on, running status
      0x30, 0x80, 0x40, 0x40,                                          // +48 E4 off
      0x00, 0xff, 0x2f, 0x00,
    ]);
    const back = readMidiFile(bytes);
    expect(back.ppq).toBe(96);
    expect(back.tracks[0].notes).toEqual([
      { pitch: 60, start: 0, length: 1, velocity: 64, channel: 1 },
      { pitch: 64, start: 1, length: 0.5, velocity: 80, channel: 1 },
    ]);
  });
  it("refuses what is not a MIDI file", () => {
    expect(() => readMidiFile(new TextEncoder().encode("hello"))).toThrow("no MThd header");
  });
});
