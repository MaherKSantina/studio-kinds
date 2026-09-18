import { describe, expect, it } from "vitest";
import { decide } from "crosscut";
import { openWithRules, openWithUrl } from "../openWith";
import { FILE_KINDS, kindForPath } from "../lib/filePreviews";

describe("file-kind registry golden", () => {
  it("open-with routes every text kind to the one Studio", () => {
    for (const ext of ["playbook", "plan", "guide", "frame", "flow", "policy", "points", "project", "brief", "list", "kanban", "md", "definition", "workup", "memory", "program"]) {
      expect(decide(openWithRules, { ext }).outcome, ext).toEqual({ studioPath: "/studio", via: "studio" });
    }
    expect(openWithUrl("/Meme XP/setup.plan", "plan")).toBe("/studio/?path=%2FMeme%20XP%2Fsetup.plan");
    expect(openWithUrl("/Meme XP/org-structure.flow", "flow")).toBe("/studio/?path=%2FMeme%20XP%2Forg-structure.flow");
  });
  it("binary kinds have no studio but still render everywhere", () => {
    expect(decide(openWithRules, { ext: "pdf" }).outcome).toEqual({ studioPath: null, via: "builtin-editor" });
    expect(decide(openWithRules, { ext: "xlsx" }).outcome.via).toBe("builtin-editor");
    expect(openWithUrl("/x/cv.pdf", "pdf")).toBeNull();
    expect(kindForPath("/x/cv.pdf")?.key).toBe("pdf");
    expect(kindForPath("/x/book.xlsx")?.key).toBe("xlsx");
  });
  it("an unknown extension has no kind at all", () => {
    expect(decide(openWithRules, { ext: "xyz" }).outcome.via).toBe("builtin-editor");
    expect(kindForPath("/x/unknown.xyz")).toBeUndefined();
    expect(kindForPath("/x/notes.md")?.key).toBe("markdown");
  });
  it("kinds with an authoring surface of their own carry it; the rest take the generic editor", () => {
    for (const p of ["/x/a.frame", "/x/a.flow", "/projects/a.project"]) expect(kindForPath(p)?.Editor, p).toBeDefined();
    for (const p of ["/x/a.list", "/x/a.brief", "/x/a.plan", "/x/a.guide", "/x/a.policy", "/x/a.points", "/x/a.playbook"]) expect(kindForPath(p)?.Editor, p).toBeUndefined();
  });
  it("every registry row is well-formed", () => {
    for (const k of FILE_KINDS) {
      expect(k.extensions.length).toBeGreaterThan(0);
      expect(k.key).toMatch(/^[a-z-]+$/);
      // Binary ⇔ no studio: bytes have no source to edit.
      expect(k.studioPath === null, `${k.key} studioPath`).toBe(!!k.binary);
    }
    const exts = FILE_KINDS.flatMap((k) => k.extensions);
    expect(new Set(exts).size).toBe(exts.length); // no extension claimed twice
  });
});
