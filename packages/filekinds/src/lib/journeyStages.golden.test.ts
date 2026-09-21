/** GOLDEN RULES for journey stages — boundaries, the fanout grid's spine
 *  bands and divergence zones, kanban placement, and the month grid. */
import { describe, expect, it } from "vitest";
import {
  attentionCount, boundaryOf, columnGroups, embedStages, fanRows, kanbanColumn, monthGrid,
  parseJourneyVariants,
  parseJourneyStages, pinnedRefFor, rewriteRef, spineState, tasksOfRows,
} from "./journeyStages";

const DOC = parseJourneyStages(`
title: Demo journey
stages:
  - key: collect
    label: Collect
    lanes:
      - {label: Seek, process: scrape-seek.definition, out: sites/seek.list, status: done}
      - {label: LinkedIn, out: sites/linkedin.list, status: next}
  - key: pool
    label: One pool
    collate: all-leads.list
    steps:
      - {key: triage, label: Triage, file: triage-run.policy}
  - key: pursue
    label: Pursue
    fanout: {run: triage-run.policy, ranks: [1, 3]}
    steps:
      - {key: research, label: Research}
      - {key: gaps, label: Gap analysis}
    items:
      "Ad A":
        status: {research: done, gaps: next}
        steps:
          - {label: Vet the company, after: research, status: done}
      "Ad B":
        status: {research: done, gaps: done}
        steps:
          - {label: Ping the CEO, status: next}
  - key: portal
    label: Applications
    journey: applications.definition
  - key: plan
    label: Schedule
    collate: gap plan
    calendar: {sources: [tasks-a.list, tasks-b.list]}
`)!;

describe("parsing and boundaries", () => {
  it("stages parse with their shapes; no stages key means null (legacy)", () => {
    expect(DOC.stages.map((s) => s.key)).toEqual(["collect", "pool", "pursue", "portal", "plan"]);
    expect(parseJourneyStages("title: X\njourney: [a, b]")).toBeNull();
  });

  it("the boundary is what the stage declares about the one above", () => {
    expect(DOC.stages.map(boundaryOf)).toEqual(["carry", "collate", "fanout", "carry", "collate"]);
  });
});

describe("the fanout grid", () => {
  const stage = DOC.stages[2];
  const items = ["Ad A", "Ad B"];

  it("spine bands interleave with divergence zones anchored by `after`", () => {
    const rows = fanRows(stage, items);
    expect(rows.map((r) => (r.kind === "spine" ? `spine:${r.step.key}` : `zone:${r.after}`)))
      .toEqual(["zone:null", "spine:research", "zone:research", "spine:gaps"]);
    const lead = rows[0];
    if (lead.kind !== "zone") throw new Error("expected zone");
    expect(Object.keys(lead.perItem)).toEqual(["Ad B"]); // only B diverges before the spine
  });

  it("spine state defaults to pending; kanban column = first not-done step", () => {
    expect(spineState(stage, "Ad A", "gaps")).toBe("next");
    expect(spineState(stage, "Ad C", "research")).toBe("pending");
    expect(kanbanColumn(stage, "Ad A")).toBe("gaps");
    expect(kanbanColumn(stage, "Ad B")).toBeNull(); // done with the stage
    expect(kanbanColumn(stage, "Ad C")).toBe("research");
  });

  it("a RESULT on a shared step is the answer — it parses and means done", () => {
    const d = parseJourneyStages(`
title: Results demo
stages:
  - key: tailor
    label: Tailor
    fanout: {list: pool.list}
    steps:
      - {key: cv, label: Targeted CV}
      - {key: cover, label: Cover letter}
    items:
      "Role X":
        results:
          cv: /SustainRecruit/targeted-cv.pdf
`)!;
    const st = d.stages[0];
    expect(st.items["Role X"].results).toEqual({ cv: "/SustainRecruit/targeted-cv.pdf" });
    expect(spineState(st, "Role X", "cv")).toBe("done");      // the artifact exists
    expect(spineState(st, "Role X", "cover")).toBe("pending"); // no answer yet
    expect(kanbanColumn(st, "Role X")).toBe("cover");          // past cv, waiting on cover
  });

  it("attention counts every `next` — lanes, spine states, item steps", () => {
    expect(attentionCount(DOC.stages[0], [])).toBe(1);
    expect(attentionCount(stage, items)).toBe(2); // A's gaps + B's ping step
  });
});

describe("column groups", () => {
  it("contiguous equal groups merge into spans; ungrouped columns span alone", () => {
    expect(columnGroups(["A", "A", "A", "B", "B", undefined]))
      .toEqual([{ label: "A", span: 3 }, { label: "B", span: 2 }, { label: "", span: 1 }]);
  });
});

describe("the calendar", () => {
  it("rows become tasks only with a parseable start; end defaults to start", () => {
    const tasks = tasksOfRows([
      { label: "Do X", fields: { start: "2026-09-02", end: "2026-09-04" } },
      { label: "Do Y", fields: { start: "2026-09-10" } },
      { label: "No date", fields: {} },
    ], "react-native");
    expect(tasks).toEqual([
      { label: "Do X", start: "2026-09-02", end: "2026-09-04", group: "react-native" },
      { label: "Do Y", start: "2026-09-10", end: "2026-09-10", group: "react-native" },
    ]);
  });

  it("the month grid covers the tasks' month, Monday-first, spans inclusive", () => {
    const g = monthGrid([
      { label: "Do X", start: "2026-09-02", end: "2026-09-04", group: "a" },
      { label: "Do Y", start: "2026-09-10", end: "2026-09-10", group: "b" },
    ]);
    expect(g.title).toBe("September 2026");
    const days = g.weeks.flat();
    expect(days[0].iso).toBe("2026-08-31"); // the Monday before the 1st
    const d3 = days.find((d) => d.iso === "2026-09-03")!;
    expect(d3.tasks.map((t) => t.label)).toEqual(["Do X"]);
    expect(days.find((d) => d.iso === "2026-09-05")!.tasks).toEqual([]);
  });
});

describe("embedding", () => {
  const SHARED = parseJourneyStages(`
title: Lead triage
stages:
  - key: collect
    label: Collect
  - key: triage
    label: Lead triage
    steps:
      - {key: run, label: Triage run, file: triage-run.policy}
  - key: extra
    label: Beyond the cut
`)!;

  it("a stages entry `- embed:` parses to a placeholder the view replaces", () => {
    const d = parseJourneyStages(`
title: Gap schedule
stages:
  - embed: lead-triage.definition
  - key: gaps
    label: Gap analysis
`)!;
    expect(d.stages.map((s) => [s.key, s.embed ?? null])).toEqual([
      ["embed-0", "lead-triage.definition"], ["gaps", null],
    ]);
    expect(d.stages[0].label).toBe("lead-triage"); // stem — only shows if resolution fails
  });

  it("embedStages marks every stage with its owner and prefixes keys", () => {
    const got = embedStages(SHARED, "/Job Hunt/lead-triage.definition");
    expect(got.map((s) => s.key)).toEqual(["shared:collect", "shared:triage", "shared:extra"]);
    expect(got.every((s) => s.sharedFrom?.title === "Lead triage")).toBe(true);
    expect(got[1].steps[0].file).toBe("triage-run.policy"); // refs untouched — reference, not copy
    expect(SHARED.stages[0].sharedFrom).toBeUndefined(); // source untouched
  });

  it("`at` cuts the prefix INCLUSIVELY; unknown `at` takes everything", () => {
    expect(embedStages(SHARED, "x", "triage").map((s) => s.key))
      .toEqual(["shared:collect", "shared:triage"]);
    expect(embedStages(SHARED, "x", "nope").length).toBe(3);
  });

  it("a LANE can embed — journey compressed to a column (embed + at parse)", () => {
    const d = parseJourneyStages(`
title: VP blurb
stages:
  - key: inputs
    label: Inputs
    lanes:
      - {label: The shared trunk, embed: lead-triage.definition}
      - {label: Context, out: vp/vp-context.md}
`)!;
    const [embedLane, ctxLane] = d.stages[0].lanes!;
    expect(embedLane.embed).toBe("lead-triage.definition");
    expect(ctxLane.out).toBe("vp/vp-context.md");
    expect(ctxLane.embed).toBeUndefined();
  });

  it("an ANSWERS lane parses — a run ref plus the one row it derives for", () => {
    const d = parseJourneyStages(`
title: Context demo
stages:
  - key: context
    label: Context
    lanes:
      - {label: Decision answers, answers: /Job Hunt/triage-run.policy, item: "Senior Product Engineer — SustainRecruit"}
`)!;
    const lane = d.stages[0].lanes![0];
    expect(lane.answers).toBe("/Job Hunt/triage-run.policy");
    expect(lane.item).toBe("Senior Product Engineer — SustainRecruit");
  });

  it("a stage GRID parses rows of cells; empty cells stay as spacers in place", () => {
    const d = parseJourneyStages(`
title: G
stages:
  - key: inputs
    label: Inputs
    grid:
      - - {}
        - {label: Raw, out: vp/vp-context.md}
      - - {label: Trunk, embed: lead-triage.definition}
        - {label: Points, out: vp/talking-points.list, flow: true}
`)!;
    const g = d.stages[0].grid!;
    expect(g.map((row) => row.map((c) => c.label))).toEqual([
      ["", "Raw"], ["Trunk", "Points"],
    ]);
    expect(g[1][0].embed).toBe("lead-triage.definition");
    expect(g[1][1].flow).toBe(true);
    expect(d.stages[0].lanes).toBeUndefined(); // grid and lanes are separate shapes
  });

  it("a variants file parses to labeled journey refs; stages files do not", () => {
    const d = parseJourneyVariants(`
title: Blurb A/B
variants:
  - {label: "A — his lines", journey: vp-blurb.definition}
  - {journey: sub/vp-blurb-b.definition}
`)!;
    expect(d.variants.map((v) => v.label)).toEqual(["A — his lines", "vp-blurb-b"]); // label defaults to the stem
    expect(d.variants[1].journey).toBe("sub/vp-blurb-b.definition");
    expect(parseJourneyVariants("title: X\nstages: []")).toBeNull();
    expect(parseJourneyVariants("title: X\nvariants: []")).toBeNull(); // empty list is not an A/B
  });

  it("re-embedding an already-embedded stage keeps the ORIGINAL owner", () => {
    const once = embedStages(SHARED, "/a/lead-triage.definition", "triage");
    const twice = embedStages(
      { title: "Middle", stages: [...once, { key: "own", label: "Own", steps: [], items: {} }] },
      "/b/middle.definition",
    );
    expect(twice.map((s) => s.key)).toEqual(["shared:collect", "shared:triage", "shared:own"]);
    expect(twice[0].sharedFrom?.journey).toBe("/a/lead-triage.definition"); // provenance not laundered
    expect(twice[2].sharedFrom?.journey).toBe("/b/middle.definition"); // Middle's own stage is Middle's
  });
});

describe("version pinning — ref text surgery", () => {
  const YAML = `title: Sep 9 HH
stages:
  - key: context
    label: Context
    lanes:
      - {label: Host, out: context-host.md}
      - {label: "Host & HH", out: context-host-hh.md}
  - key: trigger
    steps:
      - {key: invite, label: "Invitation", file: context-host.md, hint: "same name, step spelling"}
`;

  it("pins one ref after out: and file: without touching near-miss names", () => {
    const next = rewriteRef(YAML, "context-host.md", "context-host.md/01 initial.md");
    expect(next).toContain("out: context-host.md/01 initial.md}");
    expect(next).toContain("file: context-host.md/01 initial.md,"); // the step spelling too
    expect(next).toContain("out: context-host-hh.md}"); // the longer sibling name is untouched
  });

  it("updates a pinned ref to a newer version", () => {
    const pinned = rewriteRef(YAML, "context-host.md", "context-host.md/01 initial.md");
    const updated = rewriteRef(pinned, "context-host.md/01 initial.md", "context-host.md/03 later.md");
    expect(updated).toContain("out: context-host.md/03 later.md}");
    expect(updated).not.toContain("01 initial");
  });

  it("respects block style, end-of-line refs and quotes", () => {
    expect(rewriteRef("out: a.md\n", "a.md", "a.md/01 x.md")).toBe("out: a.md/01 x.md\n");
    expect(rewriteRef(`out: "a.md"\n`, "a.md", "a.md/01 x.md")).toBe(`out: "a.md/01 x.md"\n`);
    // a ref that is a PREFIX of another ref never bleeds into it
    expect(rewriteRef("out: a.md.bak\n", "a.md", "a.md/01 x.md")).toBe("out: a.md.bak\n");
  });

  it("pinnedRefFor grows an unpinned ref and swaps a pinned one", () => {
    expect(pinnedRefFor("context-host.md", "02 b.md", false)).toBe("context-host.md/02 b.md");
    expect(pinnedRefFor("context-host.md/01 a.md", "02 b.md", true)).toBe("context-host.md/02 b.md");
    expect(pinnedRefFor("sub/notes.md", "01 a.md", false)).toBe("sub/notes.md/01 a.md");
  });
});
