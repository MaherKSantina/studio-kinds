import { describe, expect, it } from "vitest";
import { GoldenCase, checkGolden } from "../decision/decisionTable";
import { AutosaveCtx, AutosaveTransition, autosaveRules } from "./autosaveRules";

const c = (state: AutosaveCtx["state"], event: AutosaveCtx["event"], editedWhileSaving = false): AutosaveCtx =>
  ({ state, event, editedWhileSaving });

const cases: GoldenCase<AutosaveCtx, AutosaveTransition>[] = [
  { name: "first edit arms the timer", ctx: c("idle", "edit"), expect: { next: "dirty", effect: "schedule" }, via: "edit" },
  { name: "edit while dirty re-arms", ctx: c("dirty", "edit"), expect: { next: "dirty", effect: "schedule" }, via: "edit" },
  { name: "edit while saving keeps saving", ctx: c("saving", "edit"), expect: { next: "saving", effect: "none" }, via: "edit-while-saving" },
  { name: "edit after error goes dirty again", ctx: c("error", "edit"), expect: { next: "dirty", effect: "schedule" }, via: "edit" },
  { name: "debounce fires a save", ctx: c("dirty", "debounce"), expect: { next: "saving", effect: "save" }, via: "debounce-fires" },
  { name: "stale debounce while saved does nothing", ctx: c("saved", "debounce"), expect: { next: "idle", effect: "none" }, via: "otherwise" },
  { name: "flush skips debounce", ctx: c("dirty", "flush"), expect: { next: "saving", effect: "save" }, via: "flush-dirty" },
  { name: "flush retries after error", ctx: c("error", "flush"), expect: { next: "saving", effect: "save" }, via: "flush-error" },
  { name: "clean save lands", ctx: c("saving", "save-ok"), expect: { next: "saved", effect: "none" }, via: "saved" },
  { name: "stale save re-dirties", ctx: c("saving", "save-ok", true), expect: { next: "dirty", effect: "schedule" }, via: "saved-stale" },
  { name: "failure surfaces", ctx: c("saving", "save-fail"), expect: { next: "error", effect: "none" }, via: "fail" },
  { name: "stale failure retries with newer content", ctx: c("saving", "save-fail", true), expect: { next: "dirty", effect: "schedule" }, via: "fail-stale" },
];

describe("autosave golden rules", () => {
  it("autosave", () => expect(checkGolden(autosaveRules, cases)).toEqual([]));
});
