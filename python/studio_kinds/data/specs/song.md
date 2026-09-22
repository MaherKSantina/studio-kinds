# .song — Song

## The engine's account

The check is `python/studio_kinds/kinds/song.py` in the studio-kinds repository; the account below is that engine's own.

The `.song` kind — an arrangement, whole. The song holds the CLIPS it is
made of, each written in under a `name`, and the TRACKS that place them by
that name. The Studio draws the tracks against the bars, opens a clip when
it is clicked, and exports the whole as ONE multi-track Standard MIDI File
(`<stem>.mid` beside it — the Export button, or `studio-check --midi
x.song`). That file is the Ableton handover: dropped on Live's Arrangement
it becomes one named track per song track, at the song's tempo.

Authoring shape (YAML, lenient — a half-written file still renders):

  title: Demo
  tempo: 128                  # default: the first placed clip's
  time: 4/4                   # default: the first placed clip's
  clips:                      # the clips this song is made of — a `name`, then
    - name: drums             # the clip's own fields (see the .clip kind)
      grid: 16
      lanes:
        - {name: Kick, pitch: C2, steps: "x...x...x...x..."}
    - name: bass
      notes:
        - {pitch: C2, start: 0, length: 0.75}
  tracks:
    - name: Drums
      channel: 10             # optional; the clip's own channel otherwise
      clips:
        - {clip: drums, at: 0, repeat: 8}     # from bar 0, eight times back to back
    - name: Bass
      clips:
        - {clip: bass, repeat: 4}              # no `at` = right after the previous placement
        - {clip: bass, repeat: 4, transpose: 5}   # the same riff, a fourth up

Writing the clips IN is what makes the song whole: the riff above is
written once and placed twice, and the file exports to MIDI with nothing
beside it. `clip` names one of the song's own clips — a name no clip has
is a problem, and the rest of the song still renders and exports.

BARS count from 0 at the song's start, in the song's time signature.
`at` is where a placement begins (default: where the previous one on
the track ended, or 0), `repeat` how many times the clip plays back to
back (default 1), `transpose` semitones added to every pitch (default 0).

## Also — the clip

The `.clip` kind — the NOTES of one MIDI clip, as a document. What a
DAW keeps behind a clip's piano roll, written down: which pitches sound
when, for how long, how hard. The Studio draws it as a piano roll and
exports it as a Standard MIDI File (`<stem>.mid` beside it — the Export
button, or `studio-check --midi x.clip`), which Ableton Live, or any
DAW, takes as a clip. A `.song` places clips on tracks.

Authoring shape (YAML, lenient — a half-written file still renders):

  title: Bass                 # optional heading
  tempo: 128                  # beats per minute (default 120)
  time: 4/4                   # time signature (default 4/4); `[3, 4]` works too
  bars: 2                     # the clip's length; default = the last note rounded up to a bar
  channel: 1                  # MIDI channel 1–16 (default 1; drum racks listen on any)
  velocity: 100               # the default velocity 1–127 (default 100)
  naming: scientific          # how pitch NAMES read: scientific = C4 is 60 (the default,
                              #   mido, the launchpad engine); ableton = C3 is 60 (what Live shows)
  notes:                      # explicit notes — a melody, a bass line, chords
    - {pitch: C2, start: 0, length: 0.75}
    - {pitch: [C3, Eb3, G3], start: 4, length: 4, velocity: 90}    # a list = a chord
    - {pitch: 60, start: 8, length: 1}                              # a number = the MIDI note
  grid: 16                    # steps per bar for the lanes below (default 16 = sixteenths)
  lanes:                      # step rows — drums: one character per step
    - {name: Kick, pitch: C2, steps: "x...x...x...x..."}
    - {name: Clap, pitch: D2, steps: "....x.......x..."}
    - {name: Hat,  pitch: F#2, steps: "..x...x...x...x. | ..x...x...x..xx.", length: 0.125}

TIME is in BEATS — quarter notes, counted from 0 at the clip's start,
whatever the time signature (a bar of 4/4 is 4 beats, of 3/4 is 3, of
6/8 is 3): `start` where a note begins, `length` how long it holds
(default 1). Halves and quarters of a beat are eighths and sixteenths.
A note that begins at or after the clip's end is a problem; one that
merely rings past it is not.

A PITCH is a name (`C2`, `F#3`, `Bb1`, octaves may be negative) or a MIDI
number 0–127, and a list of either is a chord — one note per pitch, same
start, length and velocity. VELOCITY is 1–127; unset = the clip's.

A LANE is a row of steps over the grid: `x` a hit at the clip's velocity
(or the lane's own `velocity:`), `X` an accent (127), `o` a ghost (50),
`1`–`9` that ninth of 127, `.` or `-` a rest; `|` and spaces are ignored
so bars can be separated by eye. A string longer than one bar runs on
into the next. Each hit lasts one step unless the lane gives `length:`
(in beats). Lanes and notes may be mixed; both become notes.

Nothing here is informational text: `title` is the heading, everything
else is what the notes are.

## Also — the MIDI file

Standard MIDI Files, written and read — the bytes a `.clip` or a `.song`
exports (`<stem>.mid`), and the same bytes read back so a test, or a
viewer, sees exactly what a DAW will.

One clip → format 0: a single track carrying the tempo, the time
signature, the name and the notes. A song → format 1: track 0 holds the
tempo, time signature and title, then one track per song track, named,
on its channel — dropped on Ableton Live's Arrangement, that is one
named track per MIDI track. Time is in beats (quarter notes) at 480
ticks per quarter; note-offs are real note-offs (0x8n), and at one tick
every note-off precedes every note-on, so a repeated pitch re-triggers.
No running status on the way out; on the way in it is honoured.

## A fresh document (what the Studio creates)

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

