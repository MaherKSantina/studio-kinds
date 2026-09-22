"""Refs over decisions — `decision=answer` — the shape a playbook's `when`, a pipeline's circumstance
and a tags policy's rules share. Only what the checker reads; the walk itself lives in the Studio.
"""
from __future__ import annotations


def ref_of(decision: str, value: str) -> str:
    return f"{decision}={value}"


def split_ref(ref: str) -> tuple[str, str]:
    i = ref.find("=")
    return (ref, "") if i < 0 else (ref[:i], ref[i + 1:])


def meets(locks: list[str], when: list[str] | None) -> bool:
    """Every ref of `when` is taken; an empty or absent `when` always holds."""
    return not when or all(r in locks for r in when)
