import { describe, expect, it } from "vitest";
import { annotationsFor } from "crosscut";
import { annotationsPathFor, parseAnnotations } from "../lib/annotationsDoc";

describe("annotations golden", () => {
  it("parses the sidecar list, dropping targetless rows", () => {
    const a = parseAnnotations(`
- target: answer:entity=pty
  title: Why
  body: Because.
  items: [one, two]
- title: no target, no annotation
- target: event:fund
  file: money/fund-the-venture.guide
`);
    expect(a).toHaveLength(2);
    expect(a[0]).toEqual({ target: "answer:entity=pty", title: "Why", body: "Because.", items: ["one", "two"] });
    expect(a[1]).toEqual({ target: "event:fund", file: "money/fund-the-venture.guide" });
  });
  it("accepts a wrapped { annotations: [...] } spelling and junk reads as none", () => {
    expect(parseAnnotations("annotations:\n  - target: t\n    title: x")).toHaveLength(1);
    expect(parseAnnotations(":::junk")).toEqual([]);
  });
  it("target matching is exact", () => {
    const a = parseAnnotations("- target: event:fund\n  title: x");
    expect(annotationsFor(a, "event:fund")).toHaveLength(1);
    expect(annotationsFor(a, "event:funding")).toHaveLength(0);
  });
  it("sidecar sits next to the document", () => {
    expect(annotationsPathFor("/Meme XP/readiness.playbook")).toBe("/Meme XP/readiness.playbook.annotations");
  });
});
