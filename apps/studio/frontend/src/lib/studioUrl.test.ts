import { describe, expect, it } from "vitest";
import { parseStudioSearch, recentKeyOf, sameTarget, studioSearch, targetOfRecent } from "./studioUrl";

describe("the studio URL", () => {
  it("names the welcome page, a document, a frame inside a flow, the catalog", () => {
    expect(parseStudioSearch("")).toEqual({ kind: "welcome" });
    expect(parseStudioSearch("?path=%2FDesign%2Fdashboard.frame")).toEqual({ kind: "doc", path: "/Design/dashboard.frame", frame: null });
    expect(parseStudioSearch("?path=%2FDesign%2Fcheckout.flow&frame=login")).toEqual({ kind: "doc", path: "/Design/checkout.flow", frame: "login" });
    expect(parseStudioSearch("?catalog=journey")).toEqual({ kind: "catalog", catalog: "journey", story: null });
    expect(parseStudioSearch("?catalog=journey&story=steps-stage")).toEqual({ kind: "catalog", catalog: "journey", story: "steps-stage" });
  });
  it("ignores params it does not own and unknown catalogs", () => {
    expect(parseStudioSearch("?path=%2Fprojects%2FJob%20Hunt.project&item=abc&file=%2Fx.md")).toMatchObject({ kind: "doc", path: "/projects/Job Hunt.project" });
    expect(parseStudioSearch("?catalog=other")).toEqual({ kind: "welcome" });
    expect(parseStudioSearch("?frame=login")).toEqual({ kind: "welcome" });
  });
  it("round-trips through the query string", () => {
    for (const t of [
      { kind: "welcome" as const },
      { kind: "doc" as const, path: "/Meme XP/setup.plan", frame: null },
      { kind: "doc" as const, path: "/Design/checkout.flow", frame: "login" },
      { kind: "catalog" as const, catalog: "journey" as const, story: "lanes" },
    ]) expect(parseStudioSearch(studioSearch(t))).toEqual(t);
    expect(studioSearch({ kind: "welcome" })).toBe("");
  });
  it("tells the same target from a different one", () => {
    const a = parseStudioSearch("?path=%2Fa.list");
    expect(sameTarget(a, parseStudioSearch("?path=%2Fa.list&item=3"))).toBe(true);
    expect(sameTarget(a, parseStudioSearch("?path=%2Fb.list"))).toBe(false);
    expect(sameTarget(parseStudioSearch("?path=%2Fa.flow&frame=x"), parseStudioSearch("?path=%2Fa.flow"))).toBe(false);
    expect(sameTarget({ kind: "welcome" }, { kind: "welcome" })).toBe(true);
  });
  it("keeps a frame-in-flow as one recent entry", () => {
    expect(recentKeyOf({ path: "/a.flow", frame: "login" })).toBe("/a.flow#login");
    expect(targetOfRecent("/a.flow#login")).toEqual({ path: "/a.flow", frame: "login" });
    expect(targetOfRecent("/a.list")).toEqual({ path: "/a.list", frame: null });
  });
});
