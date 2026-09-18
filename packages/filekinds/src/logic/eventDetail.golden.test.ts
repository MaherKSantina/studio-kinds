import { describe, expect, it } from "vitest";
import { GoldenCase, checkGolden } from "crosscut";
import { EventDetailCtx, EventDetailVerdict, eventDetailRules } from "../components/playbook/eventDetailRules";

const cases: GoldenCase<EventDetailCtx, EventDetailVerdict>[] = [
  { name: "one file, no prose — the file is the detail", ctx: { sources: 1, hasProcess: false }, expect: { show: "file-bare" }, via: "one-file" },
  { name: "one file AND prose — the file still wins; prose lives inside the file", ctx: { sources: 1, hasProcess: true }, expect: { show: "file-bare" }, via: "one-file" },
  { name: "several files keep their headers", ctx: { sources: 2, hasProcess: true }, expect: { show: "panels" }, via: "many-files" },
  { name: "prose only", ctx: { sources: 0, hasProcess: true }, expect: { show: "process" }, via: "prose-only" },
  { name: "nothing recorded", ctx: { sources: 0, hasProcess: false }, expect: { show: "empty" }, via: "otherwise" },
];

describe("event-detail golden rules", () => {
  it("event-detail", () => expect(checkGolden(eventDetailRules, cases)).toEqual([]));
});
