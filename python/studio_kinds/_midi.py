"""A Standard MIDI File from notes in beats — what `studio-check --midi` writes beside a `.clip` or a
`.song`: format 0 for one track, format 1 (a tempo track, then one track per song track) for more.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

PPQ = 480


@dataclass
class MidiNote:
    pitch: int
    start: float
    length: float
    velocity: int


@dataclass
class MidiTrack:
    channel: int
    notes: list[MidiNote]
    name: str | None = None


@dataclass
class MidiSpec:
    tempo: float
    time: tuple[int, int]
    tracks: list[MidiTrack]
    title: str | None = None
    ppq: int = PPQ


def _vlq(n: int) -> list[int]:
    out = [n & 0x7F]
    v = n >> 7
    while v > 0:
        out.insert(0, (v & 0x7F) | 0x80)
        v >>= 7
    return out


def _be32(n: int) -> list[int]:
    return [(n >> 24) & 0xFF, (n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF]


def _be16(n: int) -> list[int]:
    return [(n >> 8) & 0xFF, n & 0xFF]


def _round(x: float) -> int:
    return int(math.floor(x + 0.5))


@dataclass
class _Event:
    tick: int
    order: int
    bytes: list[int] = field(default_factory=list)


def _meta(tick: int, type_: int, data: list[int]) -> _Event:
    return _Event(tick, 0, [0xFF, type_, *_vlq(len(data)), *data])


def _note_events(track: MidiTrack, ppq: int) -> list[_Event]:
    ch = min(15, max(0, track.channel - 1))
    out: list[_Event] = []
    for n in track.notes:
        on = _round(n.start * ppq)
        off = max(on + 1, _round((n.start + n.length) * ppq))
        pitch = min(127, max(0, _round(n.pitch)))
        vel = min(127, max(1, _round(n.velocity)))
        out.append(_Event(on, 2, [0x90 | ch, pitch, vel]))
        out.append(_Event(off, 1, [0x80 | ch, pitch, 0x40]))
    return out


def _track_chunk(events: list[_Event]) -> list[int]:
    body: list[int] = []
    at = 0
    for e in sorted(events, key=lambda e: (e.tick, e.order)):
        body.extend([*_vlq(e.tick - at), *e.bytes])
        at = e.tick
    body.extend([0x00, 0xFF, 0x2F, 0x00])
    return [0x4D, 0x54, 0x72, 0x6B, *_be32(len(body)), *body]


def write_midi(spec: MidiSpec) -> bytes:
    ppq = spec.ppq
    head = [_meta(0, 0x51, _be32(_round(60_000_000 / spec.tempo))[1:]),
            _meta(0, 0x58, [spec.time[0], _round(math.log2(spec.time[1])), 24, 8])]
    name_event = lambda s: _meta(0, 0x03, list(s.encode("utf-8")))
    chunks: list[list[int]] = []
    if len(spec.tracks) == 1:
        t = spec.tracks[0]
        name = t.name if t.name is not None else spec.title
        chunks.append(_track_chunk([*head, *([name_event(name)] if name else []), *_note_events(t, ppq)]))
    else:
        chunks.append(_track_chunk([*head, *([name_event(spec.title)] if spec.title else [])]))
        for t in spec.tracks:
            chunks.append(_track_chunk([*([name_event(t.name)] if t.name else []), *_note_events(t, ppq)]))
    fmt = 0 if len(spec.tracks) == 1 else 1
    header = [0x4D, 0x54, 0x68, 0x64, *_be32(6), *_be16(fmt), *_be16(len(chunks)), *_be16(ppq)]
    return bytes([*header, *(b for c in chunks for b in c)])
