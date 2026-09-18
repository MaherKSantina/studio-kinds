import { describe, expect, it } from "vitest";
import { changeSummary, gatherNodeHistory, versionsFolderOf } from "./nodeHistory";

describe("versionsFolderOf — the versioned-entry companion", () => {
  it("inserts ` versions` before the extension", () => {
    expect(versionsFolderOf("/Meme XP/policy.playbook")).toBe("/Meme XP/policy versions.playbook");
    expect(versionsFolderOf("/a/b/laws.list")).toBe("/a/b/laws versions.list");
  });
  it("extensionless files keep the suffix alone", () => {
    expect(versionsFolderOf("/a/notes")).toBe("/a/notes versions");
  });
});

describe("changeSummary — only what changed", () => {
  it("a single inserted line reports exactly itself", () => {
    const prev = "view:\n  history: []\ndecisions:\n  - key: d\n";
    const next = "view:\n  history: []\n  locks:\n    - d=a\ndecisions:\n  - key: d\n";
    expect(changeSummary(prev, next)).toEqual({ added: ["  locks:", "    - d=a"], removed: [] });
  });
  it("a replaced line reports both sides; unchanged context stays out", () => {
    const prev = "a\nb\nc\nd\n";
    const next = "a\nB\nc\nd\n";
    expect(changeSummary(prev, next)).toEqual({ added: ["B"], removed: ["b"] });
  });
  it("two hunks keep the unchanged lines between them out", () => {
    const prev = "a\nx\nb\nc\ny\nd\n";
    const next = "a\nX\nb\nc\nY\nd\n";
    expect(changeSummary(prev, next)).toEqual({ added: ["X", "Y"], removed: ["x", "y"] });
  });
  it("identical states report nothing", () => {
    expect(changeSummary("a\nb\n", "a\nb\n")).toEqual({ added: [], removed: [] });
  });
});

describe("gatherNodeHistory", () => {
  const FS: Record<string, string> = {
    "/P/policy versions.playbook/v1 — open.playbook": "title: P\nview:\n  history: []\n",
    "/P/policy versions.playbook/v2 — locked.playbook": "title: P\nview:\n  history: []\n  locks:\n    - d=a\n",
    "/P/policy.playbook": "title: P\nview:\n  history: []\n  locks:\n    - d=a\ndetail: moved on\n",
    "/P/child.list": "title: C\n",
  };
  const list = async (abs: string) => {
    const kids = Object.keys(FS).filter((p) => p.startsWith(abs + "/"));
    if (!kids.length) throw new Error("not found");
    return kids.map((p) => ({ path: p, name: p.slice(abs.length + 1), kind: "file" as const }));
  };
  const read = async (abs: string) => {
    if (!(abs in FS)) throw new Error("not found");
    return FS[abs];
  };

  it("versions diff against the one before; the moved-on live file joins as current", async () => {
    const h = await gatherNodeHistory([{ label: "Policy", path: "/P/policy.playbook" }], list, read);
    expect(h.map((e) => e.version)).toEqual(["v1 — open", "v2 — locked", "current"]);
    expect(h[0]).toMatchObject({ initial: true, added: [], removed: [] });
    expect(h[1].added).toEqual(["  locks:", "    - d=a"]);
    expect(h[2]).toMatchObject({ current: true, path: "/P/policy.playbook", added: ["detail: moved on"] });
  });

  it("a target with no versions folder contributes nothing", async () => {
    const h = await gatherNodeHistory(
      [{ label: "Policy", path: "/P/policy.playbook" }, { label: "Child", path: "/P/child.list" }],
      list, read);
    expect(new Set(h.map((e) => e.fileLabel))).toEqual(new Set(["Policy"]));
  });
});
