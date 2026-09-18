import { describe, expect, it } from "vitest";
import { checkGolden } from "../decision/decisionTable";
import type { EntryCtx, EntryPresentation } from "./entryRules";
import { entryRules, isStructuredName, presentEntry } from "./entryRules";

describe("entry-presentation golden", () => {
  it("holds its goldens", () => {
    expect(checkGolden<EntryCtx, EntryPresentation>(entryRules, [
      { name: "a *.node folder is a structured (schema + content) node",
        ctx: { kind: "folder", hasExtension: true, extension: "node" },
        expect: { presents: "structured", expands: false, opensAs: "document" }, via: "structured" },
      { name: "folder named like a file is a versioned document",
        ctx: { kind: "folder", hasExtension: true, extension: "playbook" },
        expect: { presents: "versioned", expands: false, opensAs: "document" }, via: "versioned" },
      { name: "plain folder navigates",
        ctx: { kind: "folder", hasExtension: false, extension: "" },
        expect: { presents: "folder", expands: true, opensAs: "folder" }, via: "folder" },
      { name: "a file is a file, extension or not",
        ctx: { kind: "file", hasExtension: true, extension: "brief" },
        expect: { presents: "file", expands: false, opensAs: "document" } },
      { name: "even a file named *.node is just a file",
        ctx: { kind: "file", hasExtension: true, extension: "node" },
        expect: { presents: "file", expands: false, opensAs: "document" } },
      { name: "extensionless file still opens as a document",
        ctx: { kind: "file", hasExtension: false, extension: "" },
        expect: { presents: "file", expands: false, opensAs: "document" } },
    ])).toEqual([]);
  });

  it("presentEntry derives the extension from the path", () => {
    expect(presentEntry({ kind: "folder", path: "/Demo/launch.playbook" }).presents).toBe("versioned");
    expect(presentEntry({ kind: "folder", path: "/Job Hunt/applications.node" }).presents).toBe("structured");
    expect(presentEntry({ kind: "folder", path: "/Demo/money" }).presents).toBe("folder");
    expect(presentEntry({ kind: "file", path: "/Demo/x.brief" }).presents).toBe("file");
  });

  it("isStructuredName is the path-only tell", () => {
    expect(isStructuredName("/Job Hunt/applications.node")).toBe(true);
    expect(isStructuredName("/Demo/launch.playbook")).toBe(false);
    expect(isStructuredName("/Demo/node")).toBe(false); // no extension at all
  });
});
