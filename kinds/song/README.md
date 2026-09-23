# How a song works

<!-- Generated from kinds/song/v1.playbook by scripts/book-to-markdown.mjs. Do not edit by hand. -->

An arrangement, whole — the clips written into the song, the tracks that place them by name, the piano roll under a track, and one multi-track MIDI file for Ableton Live.

This is the `.song` kind, version 1, rendered as plain markdown so it can be read
without first implementing the kind it is written in. It is generated from the kind's
book, which stays the source of truth — change the book, not this file.

Alongside it in this folder:

- `v1.schema.json` — the shape, machine readable
- `v1.fields.yaml` — the same shape as a field table
- `v1.playbook` — the book this was generated from

---

## Decisions

**Where does an export land?** (`host`)

- `store` — A host with a binary writer. The desktop app, VS Code, the web Studio — the file is written beside the song.
- `bare` — A host without one. The bytes are offered as a browser download.

## Always

*imposed*

What holds at every moment — the shape of the file, how bars and placements are counted, and where the engine lives.

### The shape of the file

The clips the song is made of, and the tracks that place them.

#### Top-level keys

| key | what it is | default |
|---|---|---|
| `title` | the heading | none |
| `tempo` | beats per minute | the first placed clip's, else 120 |
| `time` | the time signature | the first placed clip's, else 4/4 |
| `clips` | the clips the song is made of, each written in under a `name` | |
| `tracks` | the arrangement — one MIDI track each on export | |

#### The clips, and the tracks that place them

```yaml
clips:                                          # the clips this song is made of
  - name: drums                                 # what a placement calls it
    grid: 16                                    # then the clip's own fields
    lanes:
      - {name: Kick, pitch: C2, steps: "x...x...x...x..."}
  - name: bass
    notes:
      - {pitch: C2, start: 0, length: 0.75}
tracks:
  - name: Drums
    channel: 10                                 # optional; the first clip's own otherwise
    clips:
      - {clip: drums, at: 0, repeat: 8}         # from bar 0, eight times back to back
  - name: Bass
    clips:
      - {clip: bass, repeat: 4}                 # no `at` = right after the previous placement
      - {clip: bass, repeat: 4, transpose: 5}
```

A clip is written in under a `name`, then its own fields — `notes`, `lanes`, `grid`,
`bars`, `tempo`, `time`, `channel`, `velocity`, `naming`: everything the `.clip` kind
holds. A placement calls one by that name, so the riff above is written once and
played twice, a fourth apart, and the song exports with nothing beside it.

Bars count from 0 at the song's start, in the song's time signature. `at` is where a
placement begins (default: where the previous one on the track ended, or 0), `repeat`
how many times the clip plays back to back (default 1), `transpose` semitones added
to every pitch (default 0). A track with no `name` is "Track N".

#### Where the engine lives

`python/studio_kinds/kinds/song.py` — `parse`, `load`, `summary`; its header
comment is what `studio-check --spec song` prints, with `clip.py` for the written
clips and `_midi.py` for the export. The shape is `kinds/song/v1.schema.json`. The
view is `components/music/SongView.tsx` over `PianoRoll.tsx` and
`ExportMidiButton.tsx`.

## The file is opened

*imposed*

The YAML is read once and never throws; the clips are already here, so the arrangement is laid out in beats at once.

### What is parsed, what is read, and what is drawn

A lenient parse, then the arrangement.

#### The parse

A YAML error is the first problem and the song is otherwise empty. Named problems:
`tempo: x is not a bpm`, `time: x is not a time signature like 4/4`, `clips: must
be a list of clips, each with a `name``, `clip N: no `name``, `clip <name>: the name
is already another clip's`, `clip <name>: no notes`, a written clip's own problems
under `clip <name>: …`, `tracks: must be a list`, `track <name>: channel x is not
1–16`, `track <name>: clips must be a list`, and per placement `track <name>, clip N:
no `clip`` (the placement is dropped), `no clip called "x" — this song holds a, b`,
`at x is not a bar` (a number, at least 0), `repeat x is not a count` (a whole
number, at least 1), `transpose x is not a number of semitones`. A bad value falls
back to its default; the rest of the song still renders and exports.

#### Laying it out

Every clip is already in the file, so there is nothing to load and nothing to wait
for. The song's tempo and time signature are its own,
else the first placed clip's, else 120 and 4/4. Per track a cursor runs: a placement
starts at `at` × beats per bar, else at the cursor; it lasts the clip's bars (in the
clip's own signature; one bar for a placement naming no clip) times `repeat`, and the
cursor moves to its end. The song's length is the last end, rounded up to a bar. A
track's channel is its own, else its first clip's, else 1. Every pass of every clip
contributes its notes, shifted and transposed; a pitch pushed outside 0–127 is
dropped.

#### What is drawn

The title and `N clips · N tracks · N bars · N notes · N bpm · 4/4`, with Export
.mid (disabled when no track has a note). The problems in red. "No tracks yet — give
it `tracks:` with `clips:`." when there are none. Then the arrangement: a gutter with
each track's colour, name and note count; a ruler numbering the bars (every fourth,
or every one when there is room); on each track a block per placement, as long as it
plays, labelled `<name> ×N +T`, its repeats marked off with dashed lines, a thumbnail
of its notes inside, and a dashed red block reading `x — no such clip` for a
placement naming none. A short song stretches to fill the pane, at no less than ten
pixels a beat.

## A placement is clicked

*chosen · many*

The clip's own piano roll opens, from the text in this file.

The block opens the clip it names — the roll of that clip, drawn from the clip written in
this file, so it opens at once and nothing is read from disk. Closing it returns to the
arrangement. Hovering a block says `<name> · bar N for N bars · transposed T — open it`.

## A track's name is clicked

*chosen · many*

That track's every note, across the whole song, on a piano roll below.

A line reads `<name> · channel N · N notes`, then a piano roll over the song's bars with
every note the track plays — every pass of every placement, already transposed — in the
track's colour, rows labelled in the naming of the first clip that could be read, lane
names carried from the clips (at their transposed pitches). Clicking the name again closes
it. The roll edits nothing.

## Export .mid is clicked

*chosen · many*

The whole song as one format 1 Standard MIDI File — one named track per song track.

> Say what the host has — the same bytes go to the store or to a download.

### When `host=store`

`songMidiSpec` gives `writeMidiFile` a format 1 file: track 0 holds the tempo, the time
signature and the title (the song's, else the file's stem); then one track per song
track, named, on its channel, with every note the arrangement gave it, at 480 ticks per
quarter, note-offs before note-ons at one tick. Dropped on Ableton Live's Arrangement
that is one named track per MIDI track at the song's tempo.

The bytes go through the host's binary writer to `<stem>.mid` in the song's folder,
overwriting the last export. "wrote <stem>.mid" shows for four seconds; an error shows
its message in red.

### When `host=bare`

The same format 1 bytes — track 0 with tempo, time signature and title, then one named
track per song track on its channel — offered as a download named `<stem>.mid`, since
the host has no writer to reach the store. "wrote <stem>.mid" shows for four seconds
either way.

## studio-check --midi runs on it

*chosen*

The same bytes from the command line, from the one file.

`studio-check --midi x.song [name.mid]` parses the song, prints every problem to stderr,
writes `x.mid` (or the name given) in the song's folder and prints `x.mid: <summary> (N
bytes)`. The exit status is 1 whenever there were problems, even though the file was
written.

## The file changes on disk

*imposed · many*

The host re-reads and the song re-parses; everything it draws came with the text.

The desktop watcher (250 ms debounce, `studio:fs-changed`), the web folder entry's server
events or VS Code's text document deliver the new text, and the Studio re-reads unless its
autosave is dirty, saving or in error. The song re-parses and lays out again — the clips
came with the text, so a note changed anywhere in the file shows at once. The selected
track stays selected by index.

## studio-check runs on it

*imposed*

One file in, one verdict out — the clips are in it.

### What the checker does

The order it runs in, and what it leaves alone.

#### In order

1. Parse the YAML — a parse error is the only problem reported.
2. The parse: the clips (a missing or duplicate name, a clip with no notes, and each
   written clip's own problems through the `.clip` engine) and the tracks (a
   placement naming no clip or one this song does not hold, a bad `at`, `repeat` or
   `transpose`).
3. Lay it out, and report the summary the view shows: `N clips · N tracks · N bars ·
   N notes · N bpm · 4/4`.

#### Nothing beside it

Every note the song plays is in the file, so the verdict and the export are the same
wherever it is read — on this machine, on another, or pasted into a page.

#### Not checked

Overlaps between placements on one track (they simply sound together). A `transpose`
that pushes every note out of range (the notes are dropped, quietly). Whether a
written clip's signature agrees with the song's.

## A song is written

*chosen*

### Write a song

From the template to an arrangement — the clips first, then the placements.

#### Start from the template

`studio-check --template song > new.song`:

```yaml
title: untitled
tempo: 120
time: 4/4
clips:
  - name: beat
    grid: 16
    lanes:
      - {name: Kick, pitch: C2, steps: "x...x...x...x..."}
  - name: bass
    notes:
      - {pitch: C2, start: 0, length: 1}
tracks:
  - name: Drums
    channel: 10
    clips:
      - {clip: beat, at: 0, repeat: 4}
  - name: Bass
    clips:
      - {clip: bass, repeat: 4}
```

#### Write the clips in

One entry per part under `clips:`, each a `name` and then the clip's own fields —
notes for a line, lanes for a kit. Write a part once even when it plays many times.
A clip of its own is a `.clip` file; a clip of this song lives here.

#### Lay out the tracks

One track per instrument, `channel` where the DAW needs one (drums on 10). Place a
clip by `clip: <name>` with `at` in bars, or leave `at` off to chain them; `repeat`
for loops, `transpose` for the same riff elsewhere.

#### Check it, then export

`studio-check new.song` prints the summary and every problem, the written clips'
included. Open it and press Export .mid, or `studio-check --midi new.song`, then
drop `new.mid` on Ableton Live's Arrangement.
