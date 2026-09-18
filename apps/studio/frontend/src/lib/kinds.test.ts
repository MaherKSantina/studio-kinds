import { describe, expect, it } from "vitest";
import { startableKinds } from "./kinds";

describe("startable kinds", () => {
  it("every template the kit offers is a kind the Studio authors, with an icon", () => {
    const ks = startableKinds();
    const exts = ks.map((k) => k.ext);
    for (const e of ["md", "frame", "flow", "playbook", "plan", "guide", "points", "policy", "brief", "list", "kanban", "project"]) expect(exts, e).toContain(e);
    for (const k of ks) {
      expect(k.kind.studioPath).toBe("/studio");
      expect(k.Icon, `${k.ext} icon`).toBeDefined();
      expect(k.what.length).toBeGreaterThan(10);
    }
  });
});
