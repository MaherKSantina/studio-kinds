import { describe, expect, it } from "vitest";
import { parseBrief } from "../lib/briefDoc";

describe("brief doc golden", () => {
  it("parses the authored spelling", () => {
    const d = parseBrief(`
title: Meme XP
description: What we are building
sections:
  - title: Onboarding
    description: First run
    body: |
      Some **markdown**.
    children:
      - title: Sign up
`);
    expect(d.title).toBe("Meme XP");
    expect(d.sections[0].name).toBe("Onboarding");
    expect(d.sections[0].prose).toContain("**markdown**");
    expect(d.sections[0].children?.[0].name).toBe("Sign up");
  });
  it("accepts the in-memory spelling and never throws on junk", () => {
    expect(parseBrief("sections:\n  - name: X\n    prose: p").sections[0].name).toBe("X");
    expect(parseBrief(":::not yaml").sections).toEqual([]);
  });
});
