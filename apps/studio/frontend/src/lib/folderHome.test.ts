import { describe, expect, it } from "vitest";
import { defaultMemoryPath, ensureRootMemory, findRootMemory, folderStem, homeStorageKey, isRootMemoryPath, rootMemoryOf } from "./folderHome";

/** A root with these entries and file texts; every write is recorded. */
function fakeFs(entries: { path: string; name: string; kind: "folder" | "file" }[], texts: Record<string, string> = {}) {
  const writes: [string, string][] = [];
  return {
    writes,
    list: async (p: string) => (p === "/" ? entries : []),
    read: async (p: string) => ({ path: p, content: texts[p] ?? "" }),
    write: async (p: string, c: string) => { writes.push([p, c]); },
  };
}

const listing = [
  { path: "/Demo", name: "Demo", kind: "folder" as const },
  { path: "/Meme XP", name: "Meme XP", kind: "folder" as const },
  { path: "/checkout.frame", name: "checkout.frame", kind: "file" as const },
  { path: "/desk.memory", name: "desk.memory", kind: "file" as const },
  { path: "/zz.memory", name: "zz.memory", kind: "file" as const },
];

describe("the folder entry's start", () => {
  it("opens the first .memory file sitting directly in the root", () => {
    expect(rootMemoryOf(listing)).toBe("/desk.memory");
  });
  it("ignores folders, even ones named like a memory, and finds nothing when there is none", () => {
    expect(rootMemoryOf([{ path: "/a.memory", name: "a.memory", kind: "folder" }, ...listing.slice(2, 3)])).toBeNull();
    expect(rootMemoryOf([])).toBeNull();
  });
  it("names a virtual memory after the folder, and keeps it per folder in this browser", () => {
    expect(folderStem("C:\\Github\\Neogrids")).toBe("Neogrids");
    expect(folderStem("C:\\Github")).toBe("Github");
    expect(folderStem("/home/sam/notes/")).toBe("notes");
    expect(folderStem("C:\\")).toBe("folder");
    expect(defaultMemoryPath("C:\\Github")).toBe("/Github.memory");
    expect(homeStorageKey("C:\\Github")).toBe("studio:home-memory:C:\\Github");
  });
  it("follows a .memory made or removed directly in the root, not deeper", () => {
    expect(isRootMemoryPath("/desk.memory")).toBe(true);
    expect(isRootMemoryPath("/Desk.MEMORY")).toBe(true);
    expect(isRootMemoryPath("/Demo/demo.memory")).toBe(false);
    expect(isRootMemoryPath("/notes.md")).toBe(false);
  });
});

describe("the desktop's start", () => {
  it("lands on the root's .memory file, reading and writing that file", async () => {
    const fs = fakeFs(listing, { "/desk.memory": "title: Desk\n" });
    const home = await ensureRootMemory(fs, "C:\\Github\\desk");
    expect(home.path).toBe("/desk.memory");
    expect(home.virtual).toBe(false);
    expect(await home.read()).toBe("title: Desk\n");
    await home.write("title: Desk\nlocks: [area=work]\n");
    expect(fs.writes).toEqual([["/desk.memory", "title: Desk\nlocks: [area=work]\n"]]);
  });
  it("makes an EMPTY /<folder>.memory when the root has none, and lands on it", async () => {
    const fs = fakeFs(listing.slice(0, 3));
    const home = await ensureRootMemory(fs, "C:\\Github\\Neogrids");
    expect(fs.writes).toEqual([["/Neogrids.memory", ""]]);
    expect(home.path).toBe("/Neogrids.memory");
    expect(home.virtual).toBe(false);
  });
  it("finds nothing without writing, for a host that keeps a virtual one instead", async () => {
    const fs = fakeFs(listing.slice(0, 3));
    expect(await findRootMemory(fs)).toBeNull();
    expect(fs.writes).toEqual([]);
  });
});
