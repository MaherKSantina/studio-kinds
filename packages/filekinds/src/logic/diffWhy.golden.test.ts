import { describe, expect, it } from "vitest";
import type { SpaceDecision } from "crosscut";
import { diffWhy } from "../lib/diffWhy";

const DECISIONS: SpaceDecision[] = [
  { key: "entity", label: "Legal form", values: [
    { key: "none", label: "No entity" }, { key: "pty", label: "Pty Ltd" }] },
  { key: "agreement", label: "Partnership agreement", values: [
    { key: "unsigned", label: "Drafted, not signed" }, { key: "signed", label: "Signed by all four" }] },
];

describe("diff-why golden", () => {
  it("added: the answer that brought it into existence", () => {
    expect(diffWhy("added", undefined, { when: ["entity=pty"] }, [], ["entity=pty"], DECISIONS))
      .toBe("Exists because Legal form: unanswered → Pty Ltd");
  });
  it("removed: the n/a rule's condition is exactly why", () => {
    expect(diffWhy("removed", { when: ["entity=pty"] }, { when: ["entity=none"] },
      ["entity=pty"], ["entity=none"], DECISIONS))
      .toBe("Lost because Legal form: Pty Ltd → No entity");
  });
  it("edited: a different rule applies, and the driving answers say which", () => {
    expect(diffWhy("edited", { when: ["agreement=unsigned"] }, { when: ["agreement=signed"] },
      ["agreement=unsigned"], ["agreement=signed"], DECISIONS))
      .toBe("A different rule applies — Partnership agreement: Drafted, not signed → Signed by all four");
  });
  it("multiple driving answers join with a dot", () => {
    const why = diffWhy("edited", { when: ["entity=none", "agreement=unsigned"] },
      { when: ["entity=pty", "agreement=signed"] },
      ["entity=none", "agreement=unsigned"], ["entity=pty", "agreement=signed"], DECISIONS);
    expect(why).toContain("Legal form: No entity → Pty Ltd");
    expect(why).toContain(" · ");
  });
  it("no differing conditions falls back to a plain statement", () => {
    expect(diffWhy("edited", { when: [] }, { when: [] }, [], [], DECISIONS))
      .toBe("The applying rule changed its process.");
    expect(diffWhy("added", undefined, undefined, [], [], DECISIONS))
      .toBe("Newly available under the new combination.");
  });
  it("unknown refs fall back to raw keys; same yields nothing", () => {
    expect(diffWhy("added", undefined, { when: ["payer=sa-resident"] }, [], ["payer=sa-resident"], DECISIONS))
      .toBe("Exists because payer: unanswered → sa-resident");
    expect(diffWhy("same", undefined, undefined, [], [], DECISIONS)).toBeNull();
  });
});
