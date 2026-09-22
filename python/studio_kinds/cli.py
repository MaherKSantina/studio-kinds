"""studio-check — the Studio's file kinds from the command line, for people and for agents editing
documents as text:

  studio-check <file|folder|glob ...>   check each document with its kind's engine; print problems
  studio-check --spec <ext>             the kind's specification, plus the template every saved file starts from
  studio-check --template <ext>         a fresh document of that kind
  studio-check --kinds                  every kind the checker knows
  studio-check --schema <ext> [N]       the path of the kind's JSON SCHEMA at version N (the latest when N is not given)
  studio-check --book <ext> [N]         the path of the kind's BOOK — the playbook that explains how the kind works
  studio-check --books                  every kind and version with its book's path, and whether it exists
  studio-check --fields <ext> [N]       the path of the kind's FIELD TABLE — every field, its type, whether it is required
  studio-check --json <file ...>        machine-readable results
  studio-check --collect <file.jsonl|file.pipeline[#view]> [name.collection]
                                        copy the rows a .jsonl view, or a pipeline (its output, or one view), shows into a .collection beside it
  studio-check --midi <file.clip|file.song> [name.mid]
                                        write the document's notes as a Standard MIDI File beside it

Exit status 1 when any checked document has problems.
"""
from __future__ import annotations

import glob
import json
import os
import sys
from typing import Any

from . import (AUTHORING, KINDS, Result, __version__, book_path, check_path, fields_path, latest_version,
               schema_path, spec, template)

USAGE = ("studio-check <file|folder|glob ...> | --spec <ext> | --template <ext> | --kinds | --schema <ext> [N] | "
         "--book <ext> [N] | --books | --fields <ext> [N] | --json <file ...> | "
         "--collect <file.jsonl|file.pipeline[#view]> [name] | --midi <file.clip|file.song> [name.mid]")


def _out(s: str = "") -> None:
    sys.stdout.write(s + "\n")


def _err(s: str) -> None:
    sys.stderr.write(s + "\n")


def expand(args: list[str]) -> list[str]:
    out: list[str] = []
    for a in args:
        if any(ch in a for ch in "*?["):
            out.extend(sorted(glob.glob(a.replace("\\", "/"), recursive=True)))
            continue
        p = os.path.abspath(a)
        if not os.path.exists(p):
            out.append(p)
            continue
        if os.path.isdir(p):
            for dirpath, dirnames, files in os.walk(p):
                dirnames[:] = sorted(d for d in dirnames if d != "node_modules" and not d.startswith("."))
                for name in sorted(files):
                    ext = os.path.splitext(name)[1][1:].lower()
                    k = KINDS.get(ext)
                    if k and k.check:
                        out.append(os.path.join(dirpath, name))
        else:
            out.append(p)
    return out


def _ext_arg(args: list[str], i: int = 1) -> str:
    return (args[i] if len(args) > i else "").lstrip(".").lower()


def _version_arg(args: list[str], ext: str, i: int = 2) -> int | None:
    if len(args) <= i:
        return latest_version(ext)
    s = args[i].lower().lstrip("v")
    if not s.isdigit() or int(s) < 1 or int(s) > latest_version(ext):
        return None
    return int(s)


def _collect(args: list[str]) -> int:
    from ._yaml import dump
    from .kinds.jsonl import disk_reader, parse_data_rows, read_source_rows, resolve_ref
    from .kinds.pipeline import parse as parse_pipeline, rows_at, run as run_pipeline
    from .kinds.policy import apply_table, parse_table, role_of
    from ._rows import value_at, columns_of
    from ._js import is_num, MISSING
    ref = args[1] if len(args) > 1 else ""
    h = ref.rfind("#")
    src = os.path.abspath(ref[:h] if h > 0 else ref) if ref else ""
    ext = os.path.splitext(src)[1].lower()
    if not src or not os.path.exists(src) or ext not in (".jsonl", ".pipeline"):
        _err("usage: --collect <file.jsonl|file.pipeline[#view]> [name.collection]")
        return 2

    def dump_collection(rows: list[dict], source: str, fields: list[str], labels: dict[str, str]) -> str:
        numeric = [f for f in fields if any(is_num(value_at(r, f)) for r in rows)]
        link = next((f for f in fields if any(isinstance(value_at(r, f), str) and value_at(r, f).lower().startswith(("http://", "https://")) for r in rows)), None)
        stats = [*numeric, *([link] if link else [])]
        out: dict[str, Any] = {"source": source, "fields": fields}
        if stats:
            out["stats"] = stats
        if labels:
            out["labels"] = labels
        out["items"] = [{**r, "id": i + 1} for i, r in enumerate(rows)]
        out["decisions"] = []
        return dump(out)

    text = open(src, encoding="utf-8").read()
    if ext == ".pipeline":
        doc = parse_pipeline(text)
        at = rows_at(run_pipeline(doc), ref[h + 1:] if h > 0 else None)
        if at.problems:
            _err("\n".join(at.problems))
            return 1
        out = os.path.join(os.path.dirname(src), args[2]) if len(args) > 2 else src[:-len(".pipeline")] + ".collection"
        fields = at.columns if at.columns is not None else [c for c in columns_of(at.rows) if c != "id"]
        with open(out, "w", encoding="utf-8", newline="\n") as f:
            f.write(dump_collection(at.rows, os.path.basename(src), fields, doc.labels))
        _out(f"{os.path.basename(out)}: {len(at.rows)} items from {os.path.basename(src)}{ref[h:] if h > 0 else ''}")
        return 0
    d = parse_data_rows(text)
    rows = list(d.rows)
    labels = (d.compose.labels if d.compose and d.compose.labels else {})
    columns: list[str] | None = None
    for s in (d.compose.sources if d.compose else []):
        rows.extend(read_source_rows(s, src, disk_reader).rows)
    kept = rows
    if d.compose and d.compose.policy:
        ptext = open(resolve_ref(src, d.compose.policy), encoding="utf-8").read()
        if role_of(ptext) == "table":
            parsed = parse_table(ptext)
            r = apply_table(parsed, rows, parsed.problems)
            kept, columns = r.rows, r.columns
    out = os.path.join(os.path.dirname(src), args[2]) if len(args) > 2 else src[:-len(".jsonl")] + ".collection"
    fields = columns if columns is not None else list(kept[0].keys()) if kept else []
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(dump_collection(kept, os.path.basename(src), fields, labels))
    _out(f"{os.path.basename(out)}: {len(kept)} items from {os.path.basename(src)}")
    return 0


def _midi(args: list[str]) -> int:
    from ._midi import MidiNote, MidiSpec, MidiTrack, write_midi
    from .kinds.clip import parse as parse_clip, summary as clip_summary
    from .kinds.song import load as load_song, parse as parse_song, summary as song_summary
    src = os.path.abspath(args[1]) if len(args) > 1 else ""
    ext = os.path.splitext(src)[1].lower()
    if not src or not os.path.exists(src) or ext not in (".clip", ".song"):
        _err("usage: --midi <file.clip|file.song> [name.mid]")
        return 2
    text = open(src, encoding="utf-8").read()
    stem = os.path.basename(src)[:-len(ext)]
    notes_of = lambda ns: [MidiNote(n.pitch, n.start, n.length, n.velocity) for n in ns]
    if ext == ".clip":
        d = parse_clip(text)
        data = write_midi(MidiSpec(d.tempo, d.time, [MidiTrack(d.channel, notes_of(d.notes), d.title or stem)], d.title or stem))
        summary, problems = clip_summary(d), list(d.problems)
        if not d.notes:
            problems.append("no notes — nothing to export")
    else:
        song = load_song(parse_song(text), src)
        data = write_midi(MidiSpec(song.tempo, song.time, [MidiTrack(t.channel, notes_of(t.notes), t.name) for t in song.tracks], song.title or stem))
        summary, problems = song_summary(song), list(song.problems)
    for p in problems:
        _err(f"      {p}")
    if any(p.startswith("no notes") for p in problems):
        return 1
    out = os.path.join(os.path.dirname(src), args[2]) if len(args) > 2 else os.path.join(os.path.dirname(src), f"{stem}.mid")
    with open(out, "wb") as f:
        f.write(data)
    _out(f"{os.path.basename(out)}: {summary} ({len(data)} bytes)")
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    as_json = "--json" in argv
    args = [a for a in argv if a != "--json"]
    if not args or args[0] in ("--help", "-h"):
        _out(USAGE)
        return 0
    if args[0] == "--version":
        _out(__version__)
        return 0
    if args[0] == "--kinds":
        for ext, k in KINDS.items():
            what = "spec: --spec " + ext if ext in AUTHORING else "the Studio's own"
            checks = "" if k.check else "  (no checks)"
            tmpl = "  template" if template(ext) is not None else ""
            _out(f".{ext.ljust(11)} {k.label.ljust(11)} {what}{checks}{tmpl}")
        return 0
    if args[0] == "--books":
        rows = []
        for ext in AUTHORING:
            for v in range(1, latest_version(ext) + 1):
                p = book_path(ext, v)
                rows.append({"ext": ext, "version": v, "path": p, "fields": fields_path(ext, v), "schema": schema_path(ext, v),
                             "exists": os.path.exists(p), "fieldsExist": os.path.exists(fields_path(ext, v)),
                             "schemaExists": os.path.exists(schema_path(ext, v))})
        if as_json:
            _out(json.dumps(rows, indent=2))
            return 0 if all(r["exists"] for r in rows) else 1
        for r in rows:
            _out(f"{'ok     ' if r['exists'] else 'missing'}  .{r['ext'].ljust(11)} v{r['version']}  {r['path']}")
        missing = sum(1 for r in rows if not r["exists"])
        _out(f"{len(rows)} books, {missing} missing")
        return 1 if missing else 0
    if args[0] in ("--book", "--fields", "--schema"):
        what = {"--book": "book", "--fields": "field table", "--schema": "schema"}[args[0]]
        ext = _ext_arg(args)
        if ext not in AUTHORING:
            _err(f"Not a kind the checker knows: .{ext} — `--kinds` lists them")
            return 2
        version = _version_arg(args, ext)
        if version is None:
            _err(f".{ext} has versions 1 to {latest_version(ext)}")
            return 2
        p = {"--book": book_path, "--fields": fields_path, "--schema": schema_path}[args[0]](ext, version)
        if not os.path.exists(p):
            _err(f"No {what} yet for .{ext} v{version} — expected at {p}")
            return 1
        _out(p)
        return 0
    if args[0] == "--spec":
        _out(spec(_ext_arg(args)))
        return 0
    if args[0] == "--template":
        ext = _ext_arg(args)
        t = template(ext)
        if t is None:
            _err(f"No template for .{ext}. Templates: {', '.join('.' + e for e in AUTHORING)}")
            return 2
        sys.stdout.write(t)
        return 0
    if args[0] == "--midi":
        return _midi(args)
    if args[0] == "--collect":
        return _collect(args)

    results: list[Result] = [check_path(f) for f in expand(args)]
    if as_json:
        _out(json.dumps([r.as_dict() for r in results], indent=2, ensure_ascii=False))
    else:
        for r in results:
            head = f"{'ok ' if r.ok else 'FAIL'} {os.path.basename(r.file or '')}".ljust(44)
            tail = f"  {r.note}" if r.note else f"  {r.summary}" if r.summary else ""
            n = len(r.problems)
            count = f"  — {n} problem{'' if n == 1 else 's'}" if n else ""
            _out(f"{head} {r.label or ''}{tail}{count}")
            for p in r.problems:
                _out(f"      {p}")
        bad = sum(1 for r in results if not r.ok)
        _out(f"{len(results)} checked, {bad} with problems")
    return 1 if any(not r.ok for r in results) else 0


def run() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except AttributeError:
        pass
    sys.exit(main())


if __name__ == "__main__":
    run()
