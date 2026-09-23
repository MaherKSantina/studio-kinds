# How a version-1 clip works

<!-- Generated from kinds/clip/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

The notes of one MIDI clip as a document — pitches, beats, velocities and drum lanes; a piano roll on open, a Standard MIDI File on export, and what a song does with it.

This is the `.clip` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Where does an export land?** (`host`)

- `store` — A host with a binary writer. The desktop app, VS Code, the web Studio — the file is written beside the clip.
- `bare` — A host without one. The bytes are offered as a browser download.

## Always

*imposed*

What holds at every moment — the shape of the file, how time and pitch are written, and where the engine lives.

### The shape of the file

*Nothing in a clip is informational text; every key is what the notes are.*

#### Top-level keys

| key | what it is | default |
|---|---|---|
| `title` | the heading | none |
| `tempo` | beats per minute | 120 |
| `time` | the time signature — `4/4`, `[3, 4]` or `{beats, unit}` | 4/4 |
| `bars` | the clip's length | the last note's end, rounded up to a bar, at least 1 |
| `channel` | MIDI channel 1–16 | 1 |
| `velocity` | the default velocity 1–127 | 100 |
| `naming` | how pitch names read: `scientific` (C4 is 60) or `ableton` (C3 is 60) | scientific |
| `notes` | explicit notes | |
| `grid` | steps per bar for the lanes | 16 |
| `lanes` | step rows — drums | |

#### Time

Time is in BEATS — quarter notes — counted from 0 at the clip's start, whatever the
signature: a bar of 4/4 is 4 beats, of 3/4 is 3, of 6/8 is 3, of 7/8 is 3.5. `start`
is where a note begins, `length` how long it holds (default 1); halves and quarters of
a beat are eighths and sixteenths. A note that begins at or after the clip's end is a
problem; one that merely rings past it is not.

#### A note

```yaml
notes:
  - {pitch: C2, start: 0, length: 0.75}
  - {pitch: [C3, Eb3, G3], start: 4, length: 4, velocity: 90}   # a list is a chord
  - {pitch: 60, start: 8, length: 1}                             # a number is the MIDI note
```

A pitch is a name — `C2`, `F#3`, `Bb1`, `♯` and `♭` accepted, octaves may be negative —
or a MIDI number 0–127; a list of either is a chord, one note per pitch with the same
start, length and velocity. Velocity is 1–127; unset, the clip's.

#### A lane

```yaml
lanes:
  - {name: Kick, pitch: C2, steps: "x...x...x...x..."}
  - {name: Hat, pitch: F#2, steps: "..x...x...x...x. | ..x...x...x..xx.", length: 0.125}
```

One character per step of the grid: `x` a hit at the clip's velocity (or the lane's
own `velocity`), `X` an accent (127), `o` a ghost (50), `1`–`9` that ninth of 127,
`.` or `-` a rest; `|` and spaces are ignored so bars can be separated by eye. A
string longer than a bar runs on into the next. Each hit lasts one step unless the
lane gives `length` in beats. A lane with no `name` is named after its pitch. Lanes
and notes may be mixed; both become notes.

#### Where the engine lives

`packages/filekinds/src/lib/clipDoc.ts` — `parseClip`, `pitchNumber`, `pitchName`,
`parseTimeSignature`, `beatsPerBar`, `laneNotes`, `clipLengthBars`, `pitchRange`,
`clipSummary`; its header comment is what `studio-check --spec clip` prints, with
`midiFile.ts` (`writeMidiFile`, `readMidiFile`, 480 ticks per quarter) beside it. The
view is `components/music/ClipView.tsx` over `PianoRoll.tsx` and
`ExportMidiButton.tsx`; the checker is `python/studio_kinds/kinds/clip.py`.

## The file is opened

*imposed*

parseClip reads the YAML once and never throws; what cannot be read is a problem in plain words, and the roll draws what could.

### What the parser keeps, what it names, and what is drawn

*A lenient parse with a problem list, then a piano roll.*

#### The parse

A YAML error is the first problem and the clip is otherwise empty. Each field falls
back to its default when unreadable and names itself: `naming: "x" is neither
scientific nor ableton`, `tempo: x is not a bpm` (1–999), `time: x is not a time
signature like 4/4` (1–64 beats over 1, 2, 4, 8, 16 or 32), `bars: x is not a length
in bars`, `channel: x is not 1–16`, `velocity: x is not 1–127`, `grid: x is not a
number of steps per bar` (1–128). `notes: must be a list`, `lanes: must be a list`.

Per note: `note N: start x is not a beat` (a number, at least 0), `length x is not a
number of beats` (above 0), `velocity x is not 1–127` (the clip's is used), `no pitch`,
`pitch "x" is not a note name or a MIDI number` — a bad pitch in a chord drops that
pitch only. Per lane: `lane <name>: pitch … is not a note name or a MIDI number`, `no
steps`, `length x is not a number of beats` (one step is used), `unknown step
character "q" at step N`. The lanes' hits become notes; every note is sorted by start,
then pitch; then, once: `a note at beat N begins at or after the clip's end (B bars =
N beats)`.

#### What is drawn

The title, then one line of facts — `N notes · N bars · N bpm · 4/4 · C2–G3 ·
channel N` — and the Export .mid button (disabled with no notes). The problems, in
red, one per line. Then the piano roll: rows are the pitches in use plus one either
side, highest at the top, black keys shaded, each labelled with its name in the
clip's naming and its MIDI number, a lane's row wearing the lane's name; columns are
beats, a heavier line at every bar and a faint one at every step of the grid; a note
is a bar as wide as it lasts and as opaque as it is loud, coloured by its lane
(explicit notes take the primary colour), and hovering says exactly what it is. The
roll is drawn long enough to show a note that begins past the clip's end, with the
stretch beyond the end shaded. No notes: "No notes yet — give it `notes:` or `lanes:`."
Nothing is edited here: the file is the notes, and the roll re-reads.

## Export .mid is clicked

*chosen · many*

The notes as a Standard MIDI File, format 0, written beside the clip.

> Say what the host has — the same bytes go to the store or to a download.

### When `host=store`

`writeMidiFile` makes a format 0 file: one track carrying the tempo, the time signature,
the name (the title, else the file's stem) and every note on the clip's channel, at 480
ticks per quarter. Note-offs are real note-offs, and at one tick every note-off precedes
every note-on, so a repeated pitch re-triggers; no running status on the way out.

The bytes go through the host's binary writer to `<stem>.mid` in the clip's folder,
overwriting the last export, so a re-export after an edit is one click. "wrote
<stem>.mid" shows beside the button for four seconds; an error shows its message in
red. Ableton Live takes the file by drag and drop, and a folder added to Live's browser
shows every export as it lands.

### When `host=bare`

The same format 0 bytes — one track, tempo, time signature, name, the notes on the clip's
channel, 480 ticks per quarter, note-offs before note-ons at one tick — but with no writer
to reach the store, the button offers them as a download named `<stem>.mid`. "wrote
<stem>.mid" shows for four seconds either way.

## studio-check --midi runs on it

*chosen*

The same bytes from the command line, beside the file.

`studio-check --midi x.clip [name.mid]` parses the clip, prints every problem to stderr,
and stops with exit 1 saying `no notes — nothing to export` when there are none.
Otherwise it writes `x.mid` (or the name given) in the clip's folder and prints
`x.mid: <summary> (N bytes)`. The exit status is 1 whenever the clip had problems, even
though the file was written.

## A song places it

*imposed · many*

The clip is read as data by every song that names it.

A `.song` reads the clip through the store (once per path, however many placements), takes
its tempo and time signature as the song's when the song gives none and this is the first
clip read, its channel for a track that gives none, its length in bars for the placement
(one bar when the clip cannot be read), its notes shifted to the placement's bar and
transposed (a pitch pushed out of 0–127 is dropped), and its lane names for the track's
roll. A clip with problems adds one line to the song: `track X: y.clip has N problems of
its own`. Clicking the placement's block opens the clip in the host.

## The file changes on disk

*imposed · many*

The host re-reads; the roll redraws; nothing was stored.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The clip re-parses and the roll redraws — an agent
or an editor changes the file, the roll follows. A song open on this clip does not
re-read it until the song's own text changes or it is reopened.

## studio-check runs on it

*imposed*

One file in, one verdict out — the parser's own problem list is the verdict.

### What the checker does

*The order it runs in, the summary line, and what it leaves alone.*

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. `parseClip` — every problem it names, in the order above.

#### The summary line

`N notes · N bars · N bpm · 4/4 · C2–G3 · channel N` — the same line the view shows.

#### Not checked

Whether it sounds right. A pitch far outside the roll's range. A lane string shorter
than a bar (it simply stops). A `title` that is not a string (read as none).

## A clip is written

*chosen*

### Write a clip

*From the template to a roll and a .mid — one file, nothing beside it until the export.*

#### Start from the template

`studio-check --template clip > new.clip`:

```yaml
title: new
tempo: 120
time: 4/4
bars: 1
notes:
  - {pitch: C3, start: 0, length: 1}
lanes:
  - {name: Kick, pitch: C2, steps: "x...x...x...x..."}
```

#### Pick the naming

Leave `scientific` when the names come from a score or mido (C4 is 60); write
`naming: ableton` when they come from what Live shows (C3 is 60). The roll labels
rows in the naming chosen, with the MIDI number beside, so a mistake is visible.

#### Write the drums as lanes

One lane per drum, `pitch` the pad's note, `steps` one character per sixteenth (or
set `grid`). Separate bars with `|` and spaces; use `X` and `o` for accents and ghosts.

#### Write the melody as notes

`start` in beats from 0, `length` in beats, a list for a chord. Give `bars` when the
clip should be longer than its last note.

#### Check it, then export

`studio-check new.clip` prints the summary and every problem in plain words. Open it
and press Export .mid, or `studio-check --midi new.clip`, then drop `new.mid` on
Ableton Live.
