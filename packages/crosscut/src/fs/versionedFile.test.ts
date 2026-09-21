import { describe, expect, it } from "vitest";
import { FsEntry } from "./types";
import {
  VERSIONS_META,
  compareVersionNames,
  isVersionPath,
  latestVersionOf,
  nextVersionName,
  pinnedRefOf,
  versionFilesOf,
  versionLabelOf,
  versionNumberOf,
  versionedParentOf,
  versionsMetaPathOf,
} from "./versionedFile";

const file = (folder: string, name: string): FsEntry => ({
  path: `${folder}/${name}`,
  name,
  kind: "file",
});

const FOLDER = "/Demo/launch.playbook";
const children: FsEntry[] = [
  file(FOLDER, "02 banking added.playbook"),
  file(FOLDER, VERSIONS_META),
  file(FOLDER, "01 skeleton.playbook"),
  file(FOLDER, "10 late.playbook"),
  { path: `${FOLDER}/drafts`, name: "drafts", kind: "folder" },
];

describe("versionFilesOf", () => {
  it("keeps only files, drops the changelog, sorts numeric-aware oldest → newest", () => {
    expect(versionFilesOf(children).map((v) => v.name)).toEqual([
      "01 skeleton.playbook",
      "02 banking added.playbook",
      "10 late.playbook",
    ]);
  });

  it("latest is the last by name order", () => {
    expect(latestVersionOf(children)?.name).toBe("10 late.playbook");
    expect(latestVersionOf([])).toBeNull();
    expect(latestVersionOf([file(FOLDER, VERSIONS_META)])).toBeNull();
  });

  it("numeric-aware ordering puts 2 before 10", () => {
    expect(compareVersionNames("2 b.md", "10 a.md")).toBeLessThan(0);
  });
});

describe("nextVersionName", () => {
  it("succeeds the highest numeric prefix, zero-padded", () => {
    expect(nextVersionName(children, "current", "playbook")).toBe("11 current.playbook");
  });
  it("starts at 01 in an empty folder", () => {
    expect(nextVersionName([], "initial", "md")).toBe("01 initial.md");
  });
  it("tolerates a missing label or extension", () => {
    expect(nextVersionName([], "", "md")).toBe("01.md");
    expect(nextVersionName([], "raw", "")).toBe("01 raw");
  });
  it("ignores non-numeric names when counting", () => {
    const odd = [file(FOLDER, "v1 — open question.playbook")];
    expect(nextVersionName(odd, "next", "playbook")).toBe("01 next.playbook");
  });
});

describe("version numbers and labels", () => {
  it("versionNumberOf reads the leading integer", () => {
    expect(versionNumberOf("02 tightened.md")).toBe(2);
    expect(versionNumberOf("v1 x.md")).toBeNull();
  });
  it("versionLabelOf strips the extension only", () => {
    expect(versionLabelOf("02 tightened.md")).toBe("02 tightened");
    expect(versionLabelOf("no-extension")).toBe("no-extension");
  });
});

describe("pin tells", () => {
  it("a path inside a versioned folder is pinned to that folder", () => {
    expect(versionedParentOf("/Party DJ/context-host.md/01 initial.md")).toBe(
      "/Party DJ/context-host.md",
    );
    expect(isVersionPath("/Party DJ/context-host.md/01 initial.md")).toBe(true);
  });
  it("ordinary paths are not pinned", () => {
    expect(versionedParentOf("/Party DJ/context-host.md")).toBeNull();
    expect(versionedParentOf("/notes.md")).toBeNull();
    expect(isVersionPath("/Party DJ/ideas.list")).toBe(false);
  });
  it("a structured node's children are halves, never versions", () => {
    expect(versionedParentOf("/Job Hunt/applications.node/schema.schema")).toBeNull();
    expect(versionedParentOf("/Job Hunt/applications.node/content.list")).toBeNull();
  });
  it("pinnedRefOf hands a UI the folder, version and label", () => {
    expect(pinnedRefOf("/Party DJ/context-host.md/02 after reply.md")).toEqual({
      folder: "/Party DJ/context-host.md",
      version: "02 after reply.md",
      label: "02 after reply",
    });
    expect(pinnedRefOf("/Party DJ/context-host.md")).toBeNull();
  });
  it("versionsMetaPathOf composes the changelog path", () => {
    expect(versionsMetaPathOf(FOLDER)).toBe(`${FOLDER}/${VERSIONS_META}`);
  });
});
