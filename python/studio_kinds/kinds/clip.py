"""`.clip` — the NOTES of one MIDI clip: `tempo`, `time` (`4/4`, `[3, 4]`), `bars`, `channel`,
`velocity`, `naming` (scientific: C4 is 60; ableton: C3 is 60), explicit `notes` (`pitch` a name, a
number, or a list = a chord; `start` and `length` in beats), and `lanes` — step rows over a `grid`
(`x` a hit, `X` an accent, `o` a ghost, `1`–`9` that ninth of 127, `.`/`-` a rest; `|` and spaces
ignored).

Parsing is lenient; every value it refuses is a problem, and a note that begins at or after the
clip's end is one too.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

from .. import _yaml
from .._js import arr, defined, get, is_finite, is_integer, is_list, is_num, is_obj, js_str, json_of, num_str, opt_str, rec
from . import CheckResult

DEFAULT_TEMPO = 120
DEFAULT_TIME = (4, 4)

_PITCH_CLASSES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


@dataclass
class Note:
    pitch: int
    start: float
    length: float
    velocity: int


@dataclass
class Clip:
    title: str
    tempo: float
    time: tuple[int, int]
    bars: float | None
    channel: int
    velocity: int
    naming: str
    grid: int
    notes: list[Note]
    problems: list[str] = field(default_factory=list)


def _num(x: Any) -> float | None:
    return float(x) if is_finite(x) else None


def _middle_c(naming: str) -> int:
    return 3 if naming == "ableton" else 4


def pitch_number(value: Any, naming: str = "scientific") -> int | None:
    """A pitch as written — `F#3`, `Bb-1`, a number, a numeric string — to MIDI 0–127; None otherwise."""
    if is_num(value):
        return int(value) if is_integer(value) and 0 <= value <= 127 else None
    if not isinstance(value, str):
        return None
    s = value.strip()
    if re.match(r"^\d+$", s):
        return pitch_number(int(s), naming)
    m = re.match(r"^([A-Ga-g])([#♯b♭]?)(-?\d+)$", s)
    if not m:
        return None
    pc = _PITCH_CLASSES[m.group(1).upper()]
    acc = 1 if m.group(2) in ("#", "♯") else -1 if m.group(2) in ("b", "♭") else 0
    n = (int(m.group(3)) - _middle_c(naming) + 5) * 12 + pc + acc
    return n if 0 <= n <= 127 else None


def pitch_name(n: int, naming: str = "scientific") -> str:
    return f"{_SHARP_NAMES[n % 12]}{n // 12 - 5 + _middle_c(naming)}"


def parse_time_signature(value: Any) -> tuple[int, int] | None:
    beats = unit = None
    if isinstance(value, str):
        m = re.match(r"^\s*(\d+)\s*/\s*(\d+)\s*$", value)
        if not m:
            return None
        beats, unit = float(m.group(1)), float(m.group(2))
    elif is_list(value) and len(value) == 2:
        beats, unit = _num(value[0]), _num(value[1])
    elif is_obj(value):
        beats, unit = _num(value.get("beats")), _num(value.get("unit"))
    if not beats or not unit or not float(beats).is_integer() or beats < 1 or beats > 64:
        return None
    if unit not in (1, 2, 4, 8, 16, 32):
        return None
    return int(beats), int(unit)


def time_text(t: tuple[int, int]) -> str:
    return f"{t[0]}/{t[1]}"


def beats_per_bar(t: tuple[int, int]) -> float:
    return t[0] * 4 / t[1]


def _clamp_velocity(v: float | None, fallback: int, where: str, problems: list[str]) -> int:
    if v is None:
        return fallback
    if not float(v).is_integer() or v < 1 or v > 127:
        problems.append(f"{where}: velocity {num_str(v)} is not 1–127")
        return fallback
    return int(v)


def _velocity_arg(raw: Any) -> float | None:
    """`raw.velocity === undefined ? undefined : (num(raw.velocity) ?? -1)`."""
    if not defined(raw):
        return None
    n = _num(raw)
    return -1.0 if n is None else n


def lane_notes(name: str, pitch: int, steps: str, length: float, velocity: int,
               time: tuple[int, int], grid: int, problems: list[str]) -> list[Note]:
    step_beats = beats_per_bar(time) / grid
    out: list[Note] = []
    step = 0
    for ch in steps:
        if ch == "|" or ch.isspace():
            continue
        if ch in ".-":
            step += 1
            continue
        vel: int | None = None
        if ch == "x":
            vel = velocity
        elif ch == "X":
            vel = 127
        elif ch == "o":
            vel = 50
        elif re.match(r"^[1-9]$", ch):
            vel = int(math.floor(int(ch) * 127 / 9 + 0.5))
        if vel is None:
            problems.append(f'lane {name}: unknown step character "{ch}" at step {step + 1}')
        else:
            out.append(Note(pitch, step * step_beats, length, vel))
        step += 1
    return out


def parse(text: str) -> Clip:
    problems: list[str] = []
    try:
        raw = rec(_yaml.load(text))
    except _yaml.YamlError as e:
        raw = {}
        problems.append(f"YAML: {e}")

    naming = "ableton" if get(raw, "naming") == "ableton" else "scientific"
    if defined(get(raw, "naming")) and raw["naming"] not in ("ableton", "scientific"):
        problems.append(f'naming: "{js_str(raw["naming"])}" is neither scientific nor ableton')

    tempo = _num(get(raw, "tempo"))
    tempo_v = tempo if tempo is not None else DEFAULT_TEMPO
    if defined(get(raw, "tempo")) and (tempo is None or tempo_v <= 0 or tempo_v > 999):
        problems.append(f"tempo: {js_str(raw['tempo'])} is not a bpm")
        tempo_v = DEFAULT_TEMPO

    time = DEFAULT_TIME
    if defined(get(raw, "time")):
        t = parse_time_signature(raw["time"])
        if t:
            time = t
        else:
            problems.append(f"time: {json_of(raw['time'])} is not a time signature like 4/4")

    bars: float | None = None
    if defined(get(raw, "bars")):
        b = _num(raw["bars"])
        if b is not None and b > 0:
            bars = b
        else:
            problems.append(f"bars: {js_str(raw['bars'])} is not a length in bars")

    channel = _num(get(raw, "channel"))
    channel_v = channel if channel is not None else 1.0
    if defined(get(raw, "channel")) and (not float(channel_v).is_integer() or channel_v < 1 or channel_v > 16):
        problems.append(f"channel: {js_str(raw['channel'])} is not 1–16")
        channel_v = 1.0

    velocity = _clamp_velocity(_velocity_arg(get(raw, "velocity")), 100, "velocity", problems)

    grid = _num(get(raw, "grid"))
    grid_v = grid if grid is not None else 16.0
    if defined(get(raw, "grid")) and (not float(grid_v).is_integer() or grid_v < 1 or grid_v > 128):
        problems.append(f"grid: {js_str(raw['grid'])} is not a number of steps per bar")
        grid_v = 16.0
    grid_i = int(grid_v)

    notes: list[Note] = []
    if defined(get(raw, "notes")) and not is_list(raw["notes"]):
        problems.append("notes: must be a list")
    for i, n in enumerate(arr(get(raw, "notes"))):
        o = rec(n)
        where = f"note {i + 1}"
        pitches = o["pitch"] if is_list(get(o, "pitch")) else [get(o, "pitch")]
        start = _num(get(o, "start"))
        start_v = start if start is not None else 0.0
        if defined(get(o, "start")) and (start is None or start_v < 0):
            problems.append(f"{where}: start {js_str(o['start'])} is not a beat")
            continue
        length = _num(get(o, "length"))
        length_v = length if length is not None else 1.0
        if defined(get(o, "length")) and (length is None or length_v <= 0):
            problems.append(f"{where}: length {js_str(o['length'])} is not a number of beats")
            continue
        vel = _clamp_velocity(_velocity_arg(get(o, "velocity")), velocity, where, problems)
        if not defined(get(o, "pitch")):
            problems.append(f"{where}: no pitch")
            continue
        for p in pitches:
            pitch = pitch_number(p, naming)
            if pitch is None:
                problems.append(f"{where}: pitch {json_of(p)} is not a note name or a MIDI number")
                continue
            notes.append(Note(pitch, start_v, length_v, vel))

    if defined(get(raw, "lanes")) and not is_list(raw["lanes"]):
        problems.append("lanes: must be a list")
    for i, l in enumerate(arr(get(raw, "lanes"))):
        o = rec(l)
        pitch = pitch_number(get(o, "pitch"), naming)
        nm = opt_str(get(o, "name"))
        name = (nm.strip() if nm else "") or (pitch_name(pitch, naming) if pitch is not None else f"lane {i + 1}")
        where = f"lane {name}"
        if pitch is None:
            problems.append(f"{where}: pitch {json_of(get(o, 'pitch'))} is not a note name or a MIDI number")
            continue
        steps = opt_str(get(o, "steps"))
        if steps is None:
            problems.append(f"{where}: no steps")
            continue
        length = _num(get(o, "length"))
        length_v = length if length is not None else beats_per_bar(time) / grid_i
        if defined(get(o, "length")) and (length is None or length_v <= 0):
            problems.append(f"{where}: length {js_str(o['length'])} is not a number of beats")
            length_v = beats_per_bar(time) / grid_i
        lane_vel = _clamp_velocity(_velocity_arg(get(o, "velocity")), velocity, where, problems)
        notes.extend(lane_notes(name, pitch, steps, length_v, lane_vel, time, grid_i, problems))

    notes.sort(key=lambda n: (n.start, n.pitch))
    doc = Clip(opt_str(get(raw, "title")) or "", tempo_v, time, bars, int(channel_v), velocity, naming, grid_i, notes, problems)
    end = length_bars(doc) * beats_per_bar(time)
    for n in notes:
        if n.start >= end:
            problems.append(f"a note at beat {num_str(n.start)} begins at or after the clip's end ({num_str(length_bars(doc))} bars = {num_str(end)} beats)")
            break
    return doc


def length_bars(doc: Clip) -> float:
    """As authored, else the last note's end rounded up to a whole bar (at least 1)."""
    if doc.bars is not None:
        return doc.bars
    bpb = beats_per_bar(doc.time)
    end = max([0.0, *(n.start + n.length for n in doc.notes)])
    return max(1, math.ceil(end / bpb - 1e-9))


def summary(doc: Clip) -> str:
    bars = length_bars(doc)
    r = f" · {pitch_name(min(n.pitch for n in doc.notes), doc.naming)}–{pitch_name(max(n.pitch for n in doc.notes), doc.naming)}" if doc.notes else ""
    return f"{len(doc.notes)} notes · {num_str(bars)} bar{'' if bars == 1 else 's'} · {num_str(doc.tempo)} bpm · {time_text(doc.time)}{r}"


def check(text: str, file: str | None = None) -> CheckResult:
    y = _yaml.error_line(text)
    if y:
        return CheckResult([y])
    d = parse(text)
    return CheckResult(d.problems, f"{summary(d)} · channel {d.channel}")
