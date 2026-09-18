import { describe, expect, it } from "vitest";
import { GoldenCase, checkGolden } from "../decision/decisionTable";
import { DiffCtx, classifyDiff, diffRules } from "./diffRules";

const cases: GoldenCase<DiffCtx, { change: string }>[] = [
  { name: "only in B is added", ctx: { inA: false, inB: true, changed: false }, expect: { change: "added" }, via: "added" },
  { name: "added wins even if 'changed' is set", ctx: { inA: false, inB: true, changed: true }, expect: { change: "added" }, via: "added" },
  { name: "only in A is removed", ctx: { inA: true, inB: false, changed: true }, expect: { change: "removed" }, via: "removed" },
  { name: "both + content change is edited", ctx: { inA: true, inB: true, changed: true }, expect: { change: "edited" }, via: "edited" },
  { name: "both + no change is same", ctx: { inA: true, inB: true, changed: false }, expect: { change: "same" }, via: "otherwise" },
  { name: "in neither is same (vacuous)", ctx: { inA: false, inB: false, changed: false }, expect: { change: "same" }, via: "otherwise" },
];

describe("diff-change golden rules", () => {
  it("diff-change", () => expect(checkGolden(diffRules, cases)).toEqual([]));
  it("classify helper", () => expect(classifyDiff({ inA: true, inB: true, changed: true })).toBe("edited"));
});
