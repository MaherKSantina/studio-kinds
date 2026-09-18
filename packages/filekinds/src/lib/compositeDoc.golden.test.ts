/** GOLDEN RULES for the composite node type — the stream-status table (driver
 *  decides staleness semantics) and the fold (arrivals accrete, later wins). */
import { describe, expect, it } from "vitest";
import { checkGolden } from "crosscut";
import {
  StreamStatusCtx, StreamStatusVerdict, cadenceDays, compositeStreams, flattenStreamFields, streamStatusRules,
} from "./compositeDoc";
import { parseSchemaDoc } from "./schemaDoc";
import type { DocListItem } from "./listDoc";

describe("stream-status", () => {
  const ctx = (over: Partial<StreamStatusCtx>): StreamStatusCtx => ({
    driver: "", hasRows: true, withinCadence: null, withinTwoCadences: null, inputMoved: null,
    ...over,
  });

  it("driver decides the semantics; first match wins", () => {
    expect(checkGolden<StreamStatusCtx, StreamStatusVerdict>(streamStatusRules, [
      { name: "no arrivals — nothing to judge, whatever the driver",
        ctx: ctx({ driver: "observed", hasRows: false }),
        expect: { status: "empty", tone: "quiet" }, via: "empty" },
      { name: "authored is the primary record — cannot go stale",
        ctx: ctx({ driver: "authored" }),
        expect: { status: "current", tone: "ok" }, via: "authored-current" },
      { name: "derived with a newer input — re-run the rules",
        ctx: ctx({ driver: "derived", inputMoved: true }),
        expect: { status: "input moved", tone: "bad" }, via: "derived-input-moved" },
      { name: "derived with its input unmoved — fresh, no clock involved",
        ctx: ctx({ driver: "derived", inputMoved: false }),
        expect: { status: "fresh", tone: "ok" }, via: "derived-fresh" },
      { name: "derived with no input to compare — still fresh by default",
        ctx: ctx({ driver: "derived" }),
        expect: { status: "fresh", tone: "ok" }, via: "derived-fresh" },
      { name: "observed without a cadence — age unjudgeable",
        ctx: ctx({ driver: "observed" }),
        expect: { status: "untimed", tone: "warn" }, via: "observed-untimed" },
      { name: "observed within one cadence — as fresh as the schedule promises",
        ctx: ctx({ driver: "observed", withinCadence: true, withinTwoCadences: true }),
        expect: { status: "fresh", tone: "ok" }, via: "observed-fresh" },
      { name: "observed past one cadence but under two — a missed sync",
        ctx: ctx({ driver: "observed", withinCadence: false, withinTwoCadences: true }),
        expect: { status: "aging", tone: "warn" }, via: "observed-aging" },
      { name: "observed past two cadences — historical, not current",
        ctx: ctx({ driver: "observed", withinCadence: false, withinTwoCadences: false }),
        expect: { status: "stale", tone: "bad" }, via: "observed-stale" },
      { name: "no declared driver — staleness has no semantics",
        ctx: ctx({}),
        expect: { status: "untracked", tone: "quiet" }, via: "otherwise" },
    ])).toEqual([]);
  });
});

describe("cadenceDays", () => {
  it("names and day-counts both spell a cadence", () => {
    expect(cadenceDays("daily")).toBe(1);
    expect(cadenceDays("weekly")).toBe(7);
    expect(cadenceDays("monthly")).toBe(30);
    expect(cadenceDays("3d")).toBe(3);
    expect(cadenceDays("14 days")).toBe(14);
    expect(cadenceDays("2")).toBe(2);
    expect(cadenceDays("fortnightly")).toBeNull();
    expect(cadenceDays(undefined)).toBeNull();
  });
});

describe("compositeStreams", () => {
  const SCHEMA = parseSchemaDoc(`
type: composite
title: One job ad
streams:
  - {id: details, label: Job details, driver: observed, source: Indeed scrape, cadence: daily}
  - {id: tags, label: My tags, driver: derived, via: /Job Hunt/lead-ranking.policy, of: details}
  - {id: status, label: Pipeline status, driver: authored, via: /Job Hunt/applications.node}
`);

  const rows: DocListItem[] = [
    { label: "First sync", fields: { stream: "details", at: "2026-09-01", title: "Product Builder", company: "eToro" } },
    { label: "Second sync", fields: { stream: "details", at: "2026-09-03", company: "eToro Group", fit: "product build role" } },
    { label: "Ranking run", fields: { stream: "tags", at: "2026-09-03", of: "details@2026-09-03", rules: "lead-ranking.policy", platform: "other" } },
    { label: "Filed at triage", fields: { stream: "status", at: "2026-09-03", status: "triage" } },
    { label: "Lost row", fields: { stream: "nope", at: "2026-09-03" } },
  ];

  it("composite defaults its referencing field to `stream:`, streams: aliases entries:", () => {
    expect(SCHEMA.field).toBe("stream");
    expect(SCHEMA.entries.map((e) => e.id)).toEqual(["details", "tags", "status"]);
    expect(SCHEMA.entries[0].driver).toBe("observed");
    expect(SCHEMA.entries[1].of).toBe("details");
    expect(SCHEMA.entries[2].via).toBe("/Job Hunt/applications.node");
  });

  it("folds arrivals per stream — later wins, meta keys (at/of/rules) stay out of the picture", () => {
    const { streams, unfiled } = compositeStreams(SCHEMA, rows, "2026-09-03");
    const details = streams[0];
    expect(details.current).toEqual({
      title: "Product Builder",       // survives from the first arrival
      company: "eToro Group",         // second arrival overrides
      fit: "product build role",      // second arrival adds
    });
    expect(details.lastAt).toBe("2026-09-03");
    expect(details.ageDays).toBe(0);
    expect(unfiled.map((r) => r.label)).toEqual(["Lost row"]);
  });

  it("judges each stream by its driver: synced observed is fresh, in-step derived is fresh, authored is current", () => {
    const { streams } = compositeStreams(SCHEMA, rows, "2026-09-03");
    expect(streams.map((s) => [s.entry.id, s.status.outcome.status])).toEqual([
      ["details", "fresh"], ["tags", "fresh"], ["status", "current"],
    ]);
  });

  it("ages the observed stream against its cadence as the clock moves", () => {
    const at = (now: string) => compositeStreams(SCHEMA, rows, now).streams[0].status.outcome.status;
    expect(at("2026-09-04")).toBe("fresh");  // 1 day — within daily cadence
    expect(at("2026-09-05")).toBe("aging");  // 2 days — one missed sync
    expect(at("2026-09-06")).toBe("stale");  // 3 days — past two cadences
  });

  it("flags the derived stream the moment its input outruns it", () => {
    const moved = [...rows,
      { label: "Third sync", fields: { stream: "details", at: "2026-09-05", salary: "not stated" } }];
    const { streams } = compositeStreams(SCHEMA, moved, "2026-09-05");
    expect(streams[1].status.outcome).toEqual({ status: "input moved", tone: "bad" });
    expect(streams[1].status.because).toContain("re-run");
    // The authored stream is untouched by any of this.
    expect(streams[2].status.outcome.status).toBe("current");
  });

  it("an empty stream reads empty, not stale", () => {
    const { streams } = compositeStreams(SCHEMA, rows.filter((r) => r.fields?.stream !== "tags"), "2026-09-03");
    expect(streams[1].status.outcome).toEqual({ status: "empty", tone: "quiet" });
  });

  it("streams flatten into clause-ready fields — slice data a lens can select on", () => {
    const { streams } = compositeStreams(SCHEMA, rows, "2026-09-03");
    const flat = flattenStreamFields(streams);
    expect(flat["details.company"]).toBe("eToro Group");
    expect(flat["tags.platform"]).toBe("other");
    // The status STREAM's own `status` field and its verdict both survive —
    // meta rides the underscore prefix, never a field's name.
    expect(flat["status.status"]).toBe("triage");
    expect(flat["status._status"]).toBe("current");
    expect(flat["details._status"]).toBe("fresh");
    expect(flat["details._age_days"]).toBe("0");
  });
});
