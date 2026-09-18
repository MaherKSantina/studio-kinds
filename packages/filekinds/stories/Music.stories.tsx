import type { Meta, StoryObj } from "@storybook/react-vite";
import ClipView from "../src/components/music/ClipView";
import SongView from "../src/components/music/SongView";
import { BASS_CLIP, CHORDS_CLIP, DEMO_SONG, DRUMS_CLIP, LEAD_CLIP, useFixtureFs } from "./fixtures";

useFixtureFs();

const meta: Meta = {
  title: "File kinds/Music",
  parameters: {
    docs: {
      description: {
        component:
          "`.clip` — the NOTES of one MIDI clip: pitches by name (C2, F#3; scientific unless `naming: ableton`) " +
          "or number, `start`/`length` in beats from 0, velocities, and drum `lanes:` as step strings over a grid. " +
          "Drawn as a piano roll; Export .mid writes a Standard MIDI File beside it. `.song` — clips placed on " +
          "tracks at bars (`at`, `repeat`, `transpose`), drawn as an arrangement with a thumbnail per placement; " +
          "a track's name lays its notes on a roll; Export .mid writes ONE multi-track file — what Ableton Live " +
          "takes as named tracks.",
      },
    },
  },
};
export default meta;

export const Drums: StoryObj = {
  name: "A drum clip — lanes as step strings",
  render: () => <div style={{ height: "100vh" }}><ClipView content={DRUMS_CLIP} path="/Music/drums.clip" /></div>,
};

export const Bass: StoryObj = {
  name: "A bass clip — explicit notes",
  render: () => <div style={{ height: "100vh" }}><ClipView content={BASS_CLIP} path="/Music/bass.clip" /></div>,
};

export const Chords: StoryObj = {
  name: "A chord clip — a pitch list is a chord",
  render: () => <div style={{ height: "100vh" }}><ClipView content={CHORDS_CLIP} path="/Music/chords.clip" /></div>,
};

export const Lead: StoryObj = {
  name: "A lead clip",
  render: () => <div style={{ height: "100vh" }}><ClipView content={LEAD_CLIP} path="/Music/lead.clip" /></div>,
};

export const Problems: StoryObj = {
  name: "A clip with problems — said in words, the rest still drawn",
  render: () => (
    <div style={{ height: "100vh" }}>
      <ClipView content={"tempo: fast\nbars: 1\nnotes:\n  - {pitch: H2, start: 0}\n  - {pitch: C3, start: 4}\n  - {pitch: E3, start: 1}\nlanes:\n  - {name: Kick, pitch: C2, steps: 'x.q.x...'}\n"} path="/Music/broken.clip" />
    </div>
  ),
};

export const Song: StoryObj = {
  name: "A song — clips on tracks, the Ableton handover",
  render: () => <div style={{ height: "100vh" }}><SongView content={DEMO_SONG} path="/Music/demo.song" /></div>,
};

export const SongMissingClip: StoryObj = {
  name: "A song with a clip that is not there",
  render: () => (
    <div style={{ height: "100vh" }}>
      <SongView content={"title: Sketch\ntracks:\n  - name: Drums\n    clips:\n      - {file: drums.clip, repeat: 2}\n      - {file: fill.clip}\n      - {file: drums.clip, repeat: 2}\n  - name: Keys\n    clips:\n      - {file: chords.clip, at: 2, transpose: -3}\n"} path="/Music/sketch.song" />
    </div>
  ),
};
