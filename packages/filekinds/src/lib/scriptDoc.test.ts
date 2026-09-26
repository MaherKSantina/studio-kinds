/** GOLDEN RULES for a script — the code, its interpreter and the variables the run gets, read leniently. */
import { describe, expect, it } from "vitest";
import { parseScript, scriptRunOf, scriptSummary } from "./scriptDoc";

const TEXT = `
title: Rebuild the index
description: Walks the folder.
language: PowerShell
env:
  INDEX_DIR: C:\\Github\\index
  DRY_RUN: "1"
  RETRIES: 3
  VERBOSE: true
  1ST: dropped
  LIST: [a, b]
cwd: ..
code: |
  Write-Host "Rebuilding $env:INDEX_DIR"
  Write-Host done
`;

describe("parsing", () => {
  it("reads the title, the language lower-cased, the scalar variables as text, cwd and the code", () => {
    const d = parseScript(TEXT);
    expect(d.title).toBe("Rebuild the index");
    expect(d.description).toBe("Walks the folder.");
    expect(d.language).toBe("powershell");
    expect(d.env).toEqual({ INDEX_DIR: "C:\\Github\\index", DRY_RUN: "1", RETRIES: "3", VERBOSE: "true" });
    expect(d.cwd).toBe("..");
    expect(d.code).toBe('Write-Host "Rebuilding $env:INDEX_DIR"\nWrite-Host done\n');
  });
  it("drops a variable whose name is not an identifier or whose value is not a scalar — the checker names them", () => {
    const d = parseScript(TEXT);
    expect(Object.keys(d.env)).not.toContain("1ST");
    expect(Object.keys(d.env)).not.toContain("LIST");
  });
  it("never throws: an unparseable or empty file is an empty script", () => {
    expect(parseScript("title: [")).toEqual({ title: "Script", language: "", env: {}, code: "" });
    expect(parseScript("")).toEqual({ title: "Script", language: "", env: {}, code: "" });
    expect(parseScript("- a\n- b")).toEqual({ title: "Script", language: "", env: {}, code: "" });
  });
});

describe("the run and the summary", () => {
  it("hands a run the language, the code, the variables and cwd — nothing else", () => {
    expect(scriptRunOf(parseScript(TEXT))).toEqual({
      language: "powershell", code: 'Write-Host "Rebuilding $env:INDEX_DIR"\nWrite-Host done\n',
      env: { INDEX_DIR: "C:\\Github\\index", DRY_RUN: "1", RETRIES: "3", VERBOSE: "true" }, cwd: "..",
    });
  });
  it("summarises as the checker does", () => {
    expect(scriptSummary(parseScript(TEXT))).toBe("powershell · 4 variables · 2 lines");
    expect(scriptSummary(parseScript("title: x\nlanguage: bash\ncode: |\n  echo\n"))).toBe("bash · 0 variables · 1 line");
    expect(scriptSummary(parseScript(""))).toBe("no language · 0 variables · 0 lines");
  });
});
