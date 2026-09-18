import { describe, expect, it } from "vitest";
import { type GoldenCase, checkGolden } from "crosscut";
import { kindForPath } from "filekinds";
import { type SurfaceCtx, type SurfaceVerdict, surfaceCtxOf, surfaceRules } from "./surfaceRules";

const cases: GoldenCase<SurfaceCtx, SurfaceVerdict>[] = [
  { name: "a text kind — with or without an editor of its own — opens as its preview", ctx: { binary: false }, expect: { surface: "preview" } },
  { name: "a pdf is bytes", ctx: { binary: true }, expect: { surface: "binary" }, via: "binary" },
];

describe("studio golden rules", () => {
  it("studio-surface", () => expect(checkGolden(surfaceRules, cases)).toEqual([]));
  it("the registry feeds the table", () => {
    expect(surfaceCtxOf(kindForPath("/x/a.frame"))).toEqual({ binary: false });
    expect(surfaceCtxOf(kindForPath("/x/a.playbook"))).toEqual({ binary: false });
    expect(surfaceCtxOf(kindForPath("/x/a.list"))).toEqual({ binary: false });
    expect(surfaceCtxOf(kindForPath("/x/notes.md"))).toEqual({ binary: false });
    expect(surfaceCtxOf(kindForPath("/x/mystery.xyz"))).toEqual({ binary: false });
    expect(surfaceCtxOf(kindForPath("/x/cv.pdf"))).toEqual({ binary: true });
  });
});
