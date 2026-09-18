/** GOLDEN RULES for a song — clips placed on tracks, loaded through a reader, laid in beats. */
import { describe, expect, it } from "vitest";
import { resolveRef } from "crosscut";
import { readMidiFile, writeMidiFile } from "./midiFile";
import { loadSong, parseSong, songMidiSpec, songSummary } from "./songDoc";

const FILES: Record<string, string> = {
  "/Music/drums.clip": "tempo: 128\nchannel: 10\nlanes:\n  - {name: Kick, pitch: C2, steps: 'x...x...x...x...'}\n  - {name: Clap, pitch: D2, steps: '....x.......x...'}\n",
  "/Music/bass.clip": "bars: 2\nnotes:\n  - {pitch: C2, start: 0, length: 0.75}\n  - {pitch: C2, start: 4, length: 0.75}\n",
  "/Music/waltz.clip": "time: 3/4\nnotes:\n  - {pitch: C3, start: 0, length: 3}\n",
};
const read = (abs: string) => (abs in FILES ? Promise.resolve(FILES[abs]) : Promise.reject(new Error("missing")));

const SONG = [
  "title: Demo",
  "tracks:",
  "  - name: Drums",
  "    clips:",
  "      - {file: drums.clip, repeat: 2}",
  "  - name: Bass",
  "    channel: 2",
  "    clips:",
  "      - {file: bass.clip}",
  "      - {file: bass.clip, transpose: 5}",
  "      - {file: bass.clip, at: 6}",
].join("\n");

describe("parsing", () => {
  it("tracks, placements and their defaults; problems for what cannot be read", () => {
    const d = parseSong(SONG);
    expect(d.problems).toEqual([]);
    expect(d.title).toBe("Demo");
    expect(d.tempo).toBeNull();
    expect(d.tracks.map((t) => [t.name, t.channel, t.clips.length])).toEqual([["Drums", null, 1], ["Bass", 2, 3]]);
    expect(d.tracks[0].clips[0]).toEqual({ file: "drums.clip", at: null, repeat: 2, transpose: 0 });
    expect(d.tracks[1].clips[2]).toEqual({ file: "bass.clip", at: 6, repeat: 1, transpose: 0 });
    const bad = parseSong("tempo: 0\ntime: 4/3\ntracks:\n  - channel: 0\n    clips:\n      - {at: 1}\n      - {file: a.clip, at: -1, repeat: 0, transpose: 1.5}\n  - clips: nope\n");
    expect(bad.problems).toEqual([
      "tempo: 0 is not a bpm",
      'time: "4/3" is not a time signature like 4/4',
      "track Track 1: channel 0 is not 1–16",
      "track Track 1, clip 1: no file",
      "track Track 1, clip 2: at -1 is not a bar",
      "track Track 1, clip 2: repeat 0 is not a count",
      "track Track 1, clip 2: transpose 1.5 is not a number of semitones",
      "track Track 2: clips must be a list",
    ]);
    expect(bad.tracks[0].clips).toEqual([{ file: "a.clip", at: null, repeat: 1, transpose: 0 }]);
  });
});

describe("loading", () => {
  it("lays clips back to back unless `at` says where, repeats and transposes them, takes tempo, time and channels from the clips", async () => {
    const song = await loadSong(parseSong(SONG), "/Music/demo.song", read, resolveRef);
    expect(song.problems).toEqual([]);
    expect(song.tempo).toBe(128);
    expect(song.time).toEqual({ beats: 4, unit: 4 });
    expect(song.bars).toBe(8);
    const [drums, bass] = song.tracks;
    expect(drums.channel).toBe(10);
    expect(drums.placed.map((p) => [p.startBeat, p.clipBeats, p.beats])).toEqual([[0, 4, 8]]);
    expect(drums.notes.filter((n) => n.lane === "Clap").map((n) => n.start)).toEqual([1, 3, 5, 7]);
    expect(bass.channel).toBe(2);
    expect(bass.placed.map((p) => [p.startBeat, p.beats])).toEqual([[0, 8], [8, 8], [24, 8]]);
    expect(bass.notes.map((n) => [n.start, n.pitch])).toEqual([[0, 36], [4, 36], [8, 41], [12, 41], [24, 36], [28, 36]]);
    expect(songSummary(song)).toBe("2 tracks · 8 bars · 18 notes · 128 bpm · 4/4");
  });
  it("a clip in another time signature keeps its own length; the song's own tempo and time win", async () => {
    const song = await loadSong(parseSong("tempo: 90\ntime: 4/4\ntracks:\n  - name: Waltz\n    clips:\n      - {file: waltz.clip, repeat: 2}\n"), "/Music/x.song", read, resolveRef);
    expect(song.tempo).toBe(90);
    expect(song.tracks[0].placed[0].clipBeats).toBe(3);
    expect(song.tracks[0].notes.map((n) => n.start)).toEqual([0, 3]);
    expect(song.bars).toBe(2); // 6 beats of 4/4, rounded up
  });
  it("a missing clip is a problem on its track; the rest still loads, and the gap keeps its bar", async () => {
    const song = await loadSong(parseSong("tracks:\n  - name: A\n    clips:\n      - {file: ghost.clip}\n      - {file: bass.clip}\n"), "/Music/x.song", read, resolveRef);
    expect(song.problems).toEqual(["track A: ghost.clip is not there"]);
    expect(song.tracks[0].placed[0].error).toBe("ghost.clip is not there");
    expect(song.tracks[0].placed[1].startBeat).toBe(4);
    expect(song.tracks[0].notes.map((n) => n.start)).toEqual([4, 8]);
  });
  it("exports one MIDI track per song track, named, on its channel, at the song's tempo", async () => {
    const song = await loadSong(parseSong(SONG), "/Music/demo.song", read, resolveRef);
    const back = readMidiFile(writeMidiFile(songMidiSpec(song)));
    expect(back.format).toBe(1);
    expect(back.tempo).toBe(128);
    expect(back.tracks.map((t) => [t.name, t.notes.length])).toEqual([["Demo", 0], ["Drums", 12], ["Bass", 6]]);
    expect(back.tracks[1].notes[0].channel).toBe(10);
    expect(back.tracks[2].notes.map((n) => [n.start, n.pitch, n.channel])).toEqual([[0, 36, 2], [4, 36, 2], [8, 41, 2], [12, 41, 2], [24, 36, 2], [28, 36, 2]]);
  });
});
