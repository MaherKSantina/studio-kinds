/** What a memory READS from the store: a folder split lists where you are and what you take,
 *  nothing else; a memory that authors decisions reads its whole scope once. */
import { beforeEach, describe, expect, it } from "vitest";
import { configureFileKinds } from "../../api";
import { parseMemory } from "../../lib/memoryDoc";
import { loadMemoryStore } from "./memoryLoad";

const TODAY = "2026-09-14";
type E = { path: string; name: string; kind: "folder" | "file" };
const file = (path: string): E => ({ path, name: path.slice(path.lastIndexOf("/") + 1), kind: "file" });
const folder = (path: string): E => ({ path, name: path.slice(path.lastIndexOf("/") + 1), kind: "folder" });

/** C:\Github, small: two folders and two files at the root; /Meme XP carries a memory that authors decisions. */
const TREE: Record<string, E[]> = {
  "/": [folder("/Demo"), folder("/Meme XP"), file("/login.frame"), file("/notes.md")],
  "/Demo": [folder("/Demo/deeper"), file("/Demo/overview.brief")],
  "/Demo/deeper": [file("/Demo/deeper/x.md")],
  "/Meme XP": [folder("/Meme XP/money"), file("/Meme XP/events.playbook"), file("/Meme XP/meme.memory")],
  "/Meme XP/money": [file("/Meme XP/money/funding.playbook")],
};
const FILES: Record<string, string> = {
  "/Meme XP/meme.memory": "decisions:\n  - key: topic\n    label: Topic\n    values:\n      - {key: money, label: Money}\n",
};
/** Everything under a folder, path order — what a worker's index endpoint answers. */
function under(from: string): E[] {
  const out: E[] = [];
  const walk = (p: string) => { for (const e of TREE[p] ?? []) { out.push(e); if (e.kind === "folder") walk(e.path); } };
  walk(from);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const calls = { list: [] as string[], index: [] as string[] };
beforeEach(() => {
  calls.list = []; calls.index = [];
  configureFileKinds({
    readFile: async (p) => { if (!(p in FILES)) throw new Error(`no ${p}`); return FILES[p]; },
    listFiles: async (p) => { calls.list.push(p); if (!TREE[p]) throw new Error(`no folder ${p}`); return TREE[p]; },
    indexFiles: async (from) => { calls.index.push(from ?? "/"); return under(from ?? "/"); },
  });
});

const paths = (st: { units: { entry: { path: string } }[] }) => st.units.map((u) => u.entry.path);

describe("what a memory reads", () => {
  it("a memory with no decisions lists the scope and nothing under it", async () => {
    const st = await loadMemoryStore("/", TODAY, { doc: parseMemory(""), locks: [] });
    expect(st.lazy).toBe(true);
    expect(calls).toEqual({ list: ["/"], index: [] });
    expect(st.folders).toEqual(["/Demo", "/Meme XP"]);
    expect(paths(st)).toEqual(["/login.frame", "/notes.md"]);
  });
  it("a taken folder is listed too — still nothing under the others", async () => {
    const st = await loadMemoryStore("/", TODAY, { doc: parseMemory(""), locks: ["folder=Demo"] });
    expect(calls).toEqual({ list: ["/", "/Demo"], index: [] });
    expect(st.folders).toEqual(["/Demo", "/Meme XP", "/Demo/deeper"]);
    expect(paths(st)).toEqual(["/login.frame", "/notes.md", "/Demo/overview.brief"]);
  });
  it("a taken folder whose memory authors decisions is read whole from there down", async () => {
    const st = await loadMemoryStore("/", TODAY, { doc: parseMemory(""), locks: ["folder=Meme XP"] });
    expect(calls).toEqual({ list: ["/", "/Meme XP"], index: ["/Meme XP"] });
    expect(st.nested.get("/Meme XP")?.doc.decisions[0]?.key).toBe("topic");
    expect(paths(st)).toEqual(["/login.frame", "/notes.md", "/Meme XP/events.playbook", "/Meme XP/meme.memory", "/Meme XP/money", "/Meme XP/money/funding.playbook"]);
  });
  it("a taken folder that is gone ends the path there", async () => {
    const st = await loadMemoryStore("/", TODAY, { doc: parseMemory(""), locks: ["folder=Vanished"] });
    expect(calls.list).toEqual(["/", "/Vanished"]);
    expect(paths(st)).toEqual(["/login.frame", "/notes.md"]);
  });
  it("a memory that authors decisions reads everything under its scope in one index", async () => {
    const st = await loadMemoryStore("/", TODAY, { doc: parseMemory(FILES["/Meme XP/meme.memory"]), locks: [] });
    expect(st.lazy).toBe(false);
    expect(calls).toEqual({ list: [], index: ["/"] });
    expect(paths(st)).toContain("/Demo/deeper/x.md");
  });
  it("without a memory to look at (the pulse and moves views) it reads the scope whole", async () => {
    const st = await loadMemoryStore("/Demo", TODAY);
    expect(st.lazy).toBe(false);
    expect(calls).toEqual({ list: [], index: ["/Demo"] });
    expect(paths(st)).toEqual(["/Demo/deeper", "/Demo/deeper/x.md", "/Demo/overview.brief"]);
  });
});
