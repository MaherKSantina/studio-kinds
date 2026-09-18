import { describe, expect, it } from "vitest";
import { GoldenCase, checkGolden, decide } from "../decision/decisionTable";
import { NameCtx, NameVerdict, nameCtxOf, nameRules } from "./nameRules";
import { PickerCtx, PickerVerdict, pickerRules } from "./pickerRules";
import { nameOf, parentOf, resolveRef } from "./types";

const nameCases: GoldenCase<NameCtx, NameVerdict>[] = [
  { name: "plain file name", ctx: nameCtxOf("setup.plan", []), expect: { ok: true } },
  { name: "empty", ctx: nameCtxOf("", []), expect: { ok: false, error: "Name is required" }, via: "empty" },
  { name: "path separator", ctx: nameCtxOf("a/b", []), expect: { ok: false, error: "Name cannot contain / or \\" }, via: "slash" },
  { name: "windows-illegal char", ctx: nameCtxOf("a:b", []), expect: { ok: false, error: 'Name cannot contain < > : " | ? *' }, via: "illegal" },
  { name: "trailing space", ctx: nameCtxOf("doc ", []), expect: { ok: false, error: "Name cannot start/end with spaces or end with a dot" }, via: "untrimmed" },
  { name: "trailing dot", ctx: nameCtxOf("doc.", []), expect: { ok: false, error: "Name cannot start/end with spaces or end with a dot" }, via: "untrimmed" },
  { name: "too long", ctx: nameCtxOf("x".repeat(121), []), expect: { ok: false, error: "Name is too long (max 120)" }, via: "too-long" },
  { name: "duplicate is case-insensitive", ctx: nameCtxOf("Readme.md", ["readme.md"]), expect: { ok: false, error: "Something with this name already exists here" }, via: "duplicate" },
  { name: "dot-prefixed ok", ctx: nameCtxOf(".env", []), expect: { ok: true } },
];

const pickerCases: GoldenCase<PickerCtx, PickerVerdict>[] = [
  { name: "folder always enters (open)", ctx: { mode: "open", kind: "folder", extAllowed: true }, expect: { selectable: false, onActivate: "enter", dimmed: false }, via: "folder" },
  { name: "folder always enters (save)", ctx: { mode: "save", kind: "folder", extAllowed: false }, expect: { selectable: false, onActivate: "enter", dimmed: false }, via: "folder" },
  { name: "open: matching file chooses", ctx: { mode: "open", kind: "file", extAllowed: true }, expect: { selectable: true, onActivate: "choose", dimmed: false }, via: "open-match" },
  { name: "open: other file dimmed", ctx: { mode: "open", kind: "file", extAllowed: false }, expect: { selectable: false, onActivate: "none", dimmed: true }, via: "open-other" },
  { name: "save: matching file prefills", ctx: { mode: "save", kind: "file", extAllowed: true }, expect: { selectable: true, onActivate: "prefill", dimmed: false }, via: "save-file" },
  { name: "browse: every file opens", ctx: { mode: "browse", kind: "file", extAllowed: false }, expect: { selectable: true, onActivate: "choose", dimmed: false }, via: "browse-file" },
  { name: "save: other file dimmed", ctx: { mode: "save", kind: "file", extAllowed: false }, expect: { selectable: false, onActivate: "none", dimmed: true }, via: "save-other" },
];

describe("fs golden rules", () => {
  it("fs-name", () => expect(checkGolden(nameRules, nameCases)).toEqual([]));
  it("picker-row", () => expect(checkGolden(pickerRules, pickerCases)).toEqual([]));
  it("resolveRef resolves relative to the referencing file", () => {
    expect(resolveRef("/Meme XP/setup.plan", "events.playbook")).toBe("/Meme XP/events.playbook");
    expect(resolveRef("/Meme XP/setup.plan", "money/unpayable-bill.guide")).toBe("/Meme XP/money/unpayable-bill.guide");
    expect(resolveRef("/Meme XP/money/x.guide", "../events.playbook")).toBe("/Meme XP/events.playbook");
    expect(resolveRef("/a/b.plan", "/c/d.playbook")).toBe("/c/d.playbook");
  });
  it("a Windows path from the host resolves like a store path", () => {
    expect(parentOf("C:\\Github\\Meme XP\\readiness.playbook")).toBe("C:\\Github\\Meme XP");
    expect(nameOf("C:\\Github\\Meme XP\\readiness.playbook")).toBe("readiness.playbook");
    expect(resolveRef("C:\\Github\\Meme XP\\readiness.playbook", "events.playbook")).toBe("/C:/Github/Meme XP/events.playbook");
    expect(resolveRef("C:\\Github\\Meme XP\\readiness.playbook", "money\\funding.playbook")).toBe("/C:/Github/Meme XP/money/funding.playbook");
    expect(resolveRef("C:/Github/Meme XP/readiness.playbook", "../fixture.playbook")).toBe("/C:/Github/fixture.playbook");
  });
});
