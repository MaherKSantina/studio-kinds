import { describe, expect, it } from "vitest";
import { checkGolden } from "crosscut";
import {
  analysesOf, dumpWorkup, exportedAnalyses, instantiateWorkup, nextStep, outdirOf, outputPathOf,
  parseWorkup, roleOfWorkup, setStepStatus, sourcePathOf, statusOfWorkup, workupPathFor,
  workupRoleRules, workupStatusRules,
  type WorkupRoleCtx, type WorkupRoleVerdict, type WorkupStatusCtx, type WorkupStatusVerdict,
} from "./workupDoc";

const WORKUP = `
title: Corporations Act — regulation standard
description: The battery every act goes through.
source: /Meme XP/acts/corporations-act.md
template: /Meme XP/workups/regulation-standard.workup
steps:
  - key: obligations
    label: Extract obligations
    instructions: Every duty, prohibition, and power, one row each, cited.
    output: obligations.list
    status: done
  - key: crossrefs
    label: Cross-reference graph
    output: crossrefs.md
    status: running
  - key: verify
    label: Lossless audit
    output: audit.md
    status: pending
`;

describe("workup-role golden", () => {
  it("holds its goldens", () => {
    expect(checkGolden<WorkupRoleCtx, WorkupRoleVerdict>(workupRoleRules, [
      { name: "a source makes it an examination",
        ctx: { hasSource: true }, expect: { role: "workup" }, via: "workup" },
      { name: "no source = the regimen itself",
        ctx: { hasSource: false }, expect: { role: "template" } },
    ])).toEqual([]);
  });
});

describe("workup-status golden", () => {
  it("holds its goldens", () => {
    expect(checkGolden<WorkupStatusCtx, WorkupStatusVerdict>(workupStatusRules, [
      { name: "no steps = nothing asked yet",
        ctx: { hasSteps: false, anyFailed: false, allDone: false, anyStarted: false },
        expect: { status: "empty" }, via: "empty" },
      { name: "a failure outranks progress",
        ctx: { hasSteps: true, anyFailed: true, allDone: false, anyStarted: true },
        expect: { status: "attention" }, via: "attention" },
      { name: "every step landed = done",
        ctx: { hasSteps: true, anyFailed: false, allDone: true, anyStarted: true },
        expect: { status: "done" }, via: "done" },
      { name: "some step ran = underway",
        ctx: { hasSteps: true, anyFailed: false, allDone: false, anyStarted: true },
        expect: { status: "in-progress" }, via: "in-progress" },
      { name: "steps authored, none run = pending",
        ctx: { hasSteps: true, anyFailed: false, allDone: false, anyStarted: false },
        expect: { status: "pending" } },
    ])).toEqual([]);
  });
});

describe("workup doc", () => {
  const path = "/Meme XP/acts/corporations-act.workup";
  const doc = parseWorkup(WORKUP);

  it("parses source, template, and steps with statuses", () => {
    expect(doc.source).toBe("/Meme XP/acts/corporations-act.md");
    expect(doc.steps.map((s) => [s.key, s.status])).toEqual([
      ["obligations", "done"], ["crossrefs", "running"], ["verify", "pending"],
    ]);
    expect(roleOfWorkup(doc)).toBe("workup");
    expect(statusOfWorkup(doc)).toBe("in-progress");
  });

  it("round-trips through dump", () => {
    expect(parseWorkup(dumpWorkup(doc))).toEqual(doc);
  });

  it("an unknown status opens as pending, a stepless file as empty", () => {
    expect(parseWorkup("steps:\n  - key: x\n    status: exploded\n").steps[0].status).toBe("pending");
    expect(statusOfWorkup(parseWorkup("title: Bare\n"))).toBe("empty");
  });

  it("the companion convention needs no registry — the path IS the link", () => {
    expect(workupPathFor("/Meme XP/acts/corporations-act.md")).toBe(path);
    expect(workupPathFor("/plain")).toBe("/plain.workup");
  });

  it("relative outputs land in the sibling outdir; absolute pass through", () => {
    expect(outdirOf(doc, path)).toBe("/Meme XP/acts/corporations-act workup");
    expect(outputPathOf(doc, path, doc.steps[0])).toBe("/Meme XP/acts/corporations-act workup/obligations.list");
    expect(outputPathOf(doc, path, { key: "x", output: "/elsewhere/x.md", status: "pending" })).toBe("/elsewhere/x.md");
    const custom = parseWorkup(WORKUP + "outdir: analyses\n");
    expect(outputPathOf(custom, path, custom.steps[0])).toBe("/Meme XP/acts/analyses/obligations.list");
  });

  it("next step is the first not-done — a failure IS the next thing to look at", () => {
    expect(nextStep(doc)?.key).toBe("crossrefs");
    const failed = { ...doc, steps: doc.steps.map((s, i) => (i === 0 ? { ...s, status: "failed" as const } : s)) };
    expect(nextStep(failed)?.key).toBe("obligations");
    expect(statusOfWorkup(failed)).toBe("attention");
    const all = { ...doc, steps: doc.steps.map((s) => ({ ...s, status: "done" as const })) };
    expect(nextStep(all)).toBeNull();
  });

  it("analyses are the DONE outputs only, as absolute paths", () => {
    expect(analysesOf(doc, path)).toEqual([
      { step: doc.steps[0], path: "/Meme XP/acts/corporations-act workup/obligations.list" },
    ]);
  });

  it("exports narrows what the outside sees; no declaration = everything landed", () => {
    const all = { ...doc, steps: doc.steps.map((s) => ({ ...s, status: "done" as const })) };
    expect(exportedAnalyses(all, path).map((a) => a.step.key)).toEqual(["obligations", "crossrefs", "verify"]);
    const narrowed = { ...all, exports: ["crossrefs"] };
    expect(exportedAnalyses(narrowed, path).map((a) => a.step.key)).toEqual(["crossrefs"]);
    expect(parseWorkup(dumpWorkup(narrowed)).exports).toEqual(["crossrefs"]);
  });

  it("instantiating a template stamps the regimen onto one document", () => {
    const template = parseWorkup(`
title: Regulation standard
steps:
  - key: obligations
    output: obligations.list
    status: done
  - key: verify
    output: audit.md
`);
    const inst = instantiateWorkup(template, "/Meme XP/workups/regulation-standard.workup", "/Meme XP/acts/fair-work-act.md");
    expect(inst.title).toBe("fair-work-act — Regulation standard");
    expect(inst.source).toBe("/Meme XP/acts/fair-work-act.md");
    expect(inst.template).toBe("/Meme XP/workups/regulation-standard.workup");
    expect(inst.steps.every((s) => s.status === "pending")).toBe(true);
    expect(roleOfWorkup(template)).toBe("template");
  });

  it("setStepStatus is a LINE edit — comments and formatting survive", () => {
    const text = "title: T\n# a comment that must survive\nsteps:\n  - key: extract\n    output: e.list\n    status: pending\n  - key: verify\n    status: pending\n";
    const next = setStepStatus(text, "extract", "running");
    expect(next).toContain("# a comment that must survive");
    expect(parseWorkup(next).steps.map((s) => s.status)).toEqual(["running", "pending"]);
    // A block with no status line gains one right under the key.
    const bare = setStepStatus("steps:\n  - key: x\n    output: o.md\n", "x", "done");
    expect(parseWorkup(bare).steps[0].status).toBe("done");
    // An unknown key changes nothing.
    expect(setStepStatus(text, "ghost", "done")).toBe(text);
  });

  it("relative source resolves beside the workup", () => {
    const rel = parseWorkup("source: corporations-act.md\nsteps: []\n");
    expect(sourcePathOf(rel, path)).toBe("/Meme XP/acts/corporations-act.md");
  });
});
