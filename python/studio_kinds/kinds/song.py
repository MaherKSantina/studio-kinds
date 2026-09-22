"""`.song` — clips placed on tracks: `tempo` and `time` (default: the first clip's), and `tracks`,
each naming the `.clip` files it plays (`file`, `at` in bars — default right after the previous
placement — `repeat`, `transpose`). Clip refs are relative to the song's folder; a clip that is not
there is a problem, and the rest of the song still renders.
"""
from __future__ import annotations

import math
import os
from dataclasses import dataclass, field
from typing import Any

from .. import _yaml
from .._js import arr, defined, get, is_finite, is_integer, is_list, js_str, json_of, num_str, opt_str, rec
from . import CheckResult
from .clip import DEFAULT_TEMPO, DEFAULT_TIME, Clip, Note, beats_per_bar, length_bars, parse as parse_clip, parse_time_signature, time_text


@dataclass
class Placement:
    file: str
    at: float | None
    repeat: int
    transpose: int


@dataclass
class Track:
    name: str
    channel: int | None
    clips: list[Placement]


@dataclass
class Song:
    title: str
    tempo: float | None
    time: tuple[int, int] | None
    tracks: list[Track]
    problems: list[str] = field(default_factory=list)


def _num(x: Any) -> float | None:
    return float(x) if is_finite(x) else None


def parse(text: str) -> Song:
    problems: list[str] = []
    try:
        raw = rec(_yaml.load(text))
    except _yaml.YamlError as e:
        raw = {}
        problems.append(f"YAML: {e}")
    tempo = None
    if defined(get(raw, "tempo")):
        t = _num(raw["tempo"])
        if t is not None and 0 < t <= 999:
            tempo = t
        else:
            problems.append(f"tempo: {js_str(raw['tempo'])} is not a bpm")
    time = None
    if defined(get(raw, "time")):
        time = parse_time_signature(raw["time"])
        if not time:
            problems.append(f"time: {json_of(raw['time'])} is not a time signature like 4/4")
    tracks: list[Track] = []
    if defined(get(raw, "tracks")) and not is_list(raw["tracks"]):
        problems.append("tracks: must be a list")
    for i, t in enumerate(arr(get(raw, "tracks"))):
        o = rec(t)
        nm = opt_str(get(o, "name"))
        name = (nm.strip() if nm else "") or f"Track {i + 1}"
        channel = None
        if defined(get(o, "channel")):
            c = _num(o["channel"])
            if c is not None and c.is_integer() and 1 <= c <= 16:
                channel = int(c)
            else:
                problems.append(f"track {name}: channel {js_str(o['channel'])} is not 1–16")
        clips: list[Placement] = []
        if defined(get(o, "clips")) and not is_list(o["clips"]):
            problems.append(f"track {name}: clips must be a list")
        for j, c in enumerate(arr(get(o, "clips"))):
            p = rec(c)
            where = f"track {name}, clip {j + 1}"
            f = opt_str(get(p, "file"))
            file = f.strip() if f else ""
            if not file:
                problems.append(f"{where}: no file")
                continue
            at = None
            if defined(get(p, "at")):
                a = _num(p["at"])
                if a is not None and a >= 0:
                    at = a
                else:
                    problems.append(f"{where}: at {js_str(p['at'])} is not a bar")
            repeat = 1
            if defined(get(p, "repeat")):
                r = _num(p["repeat"])
                if r is not None and r.is_integer() and r >= 1:
                    repeat = int(r)
                else:
                    problems.append(f"{where}: repeat {js_str(p['repeat'])} is not a count")
            transpose = 0
            if defined(get(p, "transpose")):
                s = _num(p["transpose"])
                if s is not None and s.is_integer():
                    transpose = int(s)
                else:
                    problems.append(f"{where}: transpose {js_str(p['transpose'])} is not a number of semitones")
            clips.append(Placement(file, at, repeat, transpose))
        tracks.append(Track(name, channel, clips))
    return Song(opt_str(get(raw, "title")) or "", tempo, time, tracks, problems)


@dataclass
class LoadedTrack:
    name: str
    channel: int
    notes: list[Note]


@dataclass
class Loaded:
    title: str
    tempo: float
    time: tuple[int, int]
    tracks: list[LoadedTrack]
    bars: int
    problems: list[str]


def load(doc: Song, song_path: str) -> Loaded:
    """The song with its clips read from the disk beside it."""
    problems = list(doc.problems)
    cache: dict[str, Clip | None] = {}

    def clip_of(ref: str) -> Clip | None:
        abs_path = os.path.normpath(os.path.join(os.path.dirname(song_path), ref))
        if abs_path not in cache:
            try:
                with open(abs_path, encoding="utf-8") as f:
                    cache[abs_path] = parse_clip(f.read())
            except OSError:
                cache[abs_path] = None
        return cache[abs_path]

    placed: list[list[tuple[Placement, Clip | None]]] = []
    first: Clip | None = None
    for track in doc.tracks:
        row = []
        for placement in track.clips:
            clip = clip_of(placement.file)
            if clip and not first:
                first = clip
            row.append((placement, clip))
        placed.append(row)
    tempo = doc.tempo if doc.tempo is not None else (first.tempo if first else DEFAULT_TEMPO)
    time = doc.time or (first.time if first else DEFAULT_TIME)
    bpb = beats_per_bar(time)
    end_beat = 0.0
    loaded: list[LoadedTrack] = []
    for track, row in zip(doc.tracks, placed):
        cursor = 0.0
        out = LoadedTrack(track.name, track.channel if track.channel is not None else 1, [])
        for k, (placement, clip) in enumerate(row):
            start = cursor if placement.at is None else placement.at * bpb
            clip_beats = length_bars(clip) * beats_per_bar(clip.time) if clip else bpb
            beats = clip_beats * placement.repeat
            cursor = start + beats
            end_beat = max(end_beat, cursor)
            if not clip:
                problems.append(f"track {track.name}: {placement.file} is not there")
                continue
            if clip.problems:
                n = len(clip.problems)
                problems.append(f"track {track.name}: {placement.file} has {n} problem{'' if n == 1 else 's'} of its own")
            if track.channel is None and k == 0:
                out.channel = clip.channel
            for r in range(placement.repeat):
                for n_ in clip.notes:
                    pitch = n_.pitch + placement.transpose
                    if 0 <= pitch <= 127:
                        out.notes.append(Note(pitch, start + r * clip_beats + n_.start, n_.length, n_.velocity))
        out.notes.sort(key=lambda n: (n.start, n.pitch))
        loaded.append(out)
    return Loaded(doc.title, tempo, time, loaded, max(1, math.ceil(end_beat / bpb - 1e-9)), problems)


def summary(s: Loaded) -> str:
    notes = sum(len(t.notes) for t in s.tracks)
    n = len(s.tracks)
    return f"{n} track{'' if n == 1 else 's'} · {s.bars} bar{'' if s.bars == 1 else 's'} · {notes} notes · {num_str(s.tempo)} bpm · {time_text(s.time)}"


def check(text: str, file: str | None = None) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    song = load(parse(text), file or "")
    return CheckResult(song.problems, summary(song))
