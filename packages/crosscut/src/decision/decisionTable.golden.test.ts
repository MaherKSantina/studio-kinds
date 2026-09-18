import { describe, expect, it } from "vitest";
import { DecisionTable, checkGolden, decide, explain, gt, not, oneOf, tableToMarkdown } from "./decisionTable";

interface Ctx { kind: string; n: number }
type Out = { go: boolean };

const t: DecisionTable<Ctx, Out> = {
  name: "demo",
  answers: "Does the demo go?",
  rules: [
    { rule: "big-file", because: "big files go", when: { kind: "file", n: gt(3) }, then: { go: true } },
    { rule: "not-folder", because: "non-folders may go", when: { kind: not(oneOf("folder")) }, then: { go: true } },
  ],
  otherwise: { go: false },
};

describe("decisionTable engine", () => {
  it("first match wins", () => {
    expect(decide(t, { kind: "file", n: 5 }).rule).toBe("big-file");
    expect(decide(t, { kind: "file", n: 1 }).rule).toBe("not-folder");
    expect(decide(t, { kind: "folder", n: 9 }).rule).toBe("otherwise");
  });
  it("explain traces every rule", () => {
    const { trace } = explain(t, { kind: "folder", n: 9 });
    expect(trace).toEqual([
      { rule: "big-file", matched: false, failedOn: ["kind"] },
      { rule: "not-folder", matched: false, failedOn: ["kind"] },
    ]);
  });
  it("golden runner reports mismatches with the rule that fired", () => {
    const fails = checkGolden(t, [
      { name: "good", ctx: { kind: "file", n: 5 }, expect: { go: true }, via: "big-file" },
      { name: "bad", ctx: { kind: "folder", n: 0 }, expect: { go: true } },
    ]);
    expect(fails).toHaveLength(1);
    expect(fails[0].name).toBe("bad");
  });
  it("renders markdown from the live table", () => {
    const md = tableToMarkdown(t);
    expect(md).toContain("| big-file |");
    expect(md).toContain("not(folder)");
    expect(md).toContain("| otherwise |");
  });
});
