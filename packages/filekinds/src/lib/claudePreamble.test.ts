import { describe, expect, it } from "vitest";
import { CHECKER, claudePreamble } from "./claudePreamble";

describe("the CLAUDE.md a prepared folder gets", () => {
  it("points at the master's guide, names the checker and the folder — and nothing about what the folder is for", () => {
    const text = claudePreamble("Narooma Oct 2026");
    expect(text.startsWith("# Narooma Oct 2026 — Studio documents")).toBe(true);
    expect(text).toContain("Maher asks for a Studio document");
    expect(text).toContain("claude.playbook");
    expect(text).toContain(`${CHECKER} --spec <ext>`);
    expect(text).toContain(`${CHECKER} <file>`);
    expect(text).toContain("which file type should this be?");
    // The task brings its own context; the file never asks for a description of the folder.
    expect(text).not.toContain("About this folder");
  });
  it("carries no made-up name when the folder's is unknown", () => {
    expect(claudePreamble("  ").startsWith("# Studio documents\n")).toBe(true);
  });
});
