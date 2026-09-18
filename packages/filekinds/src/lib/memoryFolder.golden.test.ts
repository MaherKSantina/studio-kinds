/** GOLDEN RULES for a memory OVER A FOLDER — the desktop app's and VS Code's
 *  case: a memory looks at the folder it sits in; with no decisions (an
 *  empty file will do) the sub-folders are the foci and the files sitting
 *  directly in the folder are Everything else; taking a focus brings that
 *  folder's own split onto the table — the first `.memory` inside it when
 *  there is one, its sub-folders otherwise. */
import { describe, expect, it } from "vitest";
import {
  ELSE, folderSpace, memoryOverFolder, memoryScope, memorySelection, parseMemory, takenFolderChain, unitsInScope, writeLocks,
  type NestedMemories,
} from "./memoryDoc";
import { fileTemplate } from "./fileTemplates";
import { indexFields } from "./nodeIndex";

const TODAY = "2026-09-13";
const file = (path: string) => ({ path, name: path.slice(path.lastIndexOf("/") + 1), kind: "file" as const });
const folder = (path: string) => ({ path, name: path.slice(path.lastIndexOf("/") + 1), kind: "folder" as const });

/** A folder like C:\Github\Neogrids, as the flat index sees it. */
const TREE = [
  folder("/Demo"), file("/Demo/overview.brief"), file("/Demo/fixture.playbook"), file("/Demo/demo.memory"),
  folder("/Demo/launch.playbook"), file("/Demo/launch.playbook/01 skeleton.playbook"), file("/Demo/launch.playbook/02 current.playbook"),
  folder("/Meme XP"), file("/Meme XP/meme.memory"), file("/Meme XP/events.playbook"), file("/Meme XP/readiness.playbook.annotations"),
  folder("/Meme XP/money"), file("/Meme XP/money/funding.playbook"), file("/Meme XP/money/settle-up.brief"),
  folder("/Meme XP/legal"), file("/Meme XP/legal/incorporation.brief"),
  folder("/Meme XP/lead.node"), file("/Meme XP/lead.node/schema.schema"), file("/Meme XP/lead.node/content.list"),
  folder("/tnt-buyer-assets"), file("/tnt-buyer-assets/01.png"),
  file("/login.frame"), file("/tnt-buyer.flow"), file("/desk.memory"),
];
const units = TREE.map((e) => ({ item: e.path, fields: indexFields(e, TODAY) }));

/** The memory sitting in /Meme XP — it authors decisions, so it dictates that folder's split. */
const MEME = parseMemory(`
title: Meme XP
decisions:
  - key: topic
    label: Topic
    values:
      - {key: money, label: Money, activates: [kind]}
      - {key: legal, label: Legal}
    derive:
      - {value: money, when: [{param: path, op: contains, value: "/money/"}]}
      - {value: legal, when: [{param: path, op: contains, value: "/legal/"}]}
  - key: kind
    label: Kind
    values:
      - {key: playbooks, label: Playbooks, when: [topic=money]}
    derive:
      - {value: playbooks, when: [{param: ext, op: equals, value: playbook}]}
`);
const NESTED: NestedMemories = new Map([
  ["/Meme XP", { path: "/Meme XP/meme.memory", doc: MEME }],
  ["/Demo", { path: "/Demo/demo.memory", doc: parseMemory("") }], // an EMPTY memory file
]);
/** The memory at the root: no decisions — the folders decide. */
const DESK = parseMemory(`
include:
  - {param: path, op: not_contains, value: "-assets/"}
  - {param: ext, op: not_equals, value: annotations}
`);
const groupsOf = (locks: string[], doc = DESK, docPath = "/desk.memory") => {
  const over = memoryOverFolder({ ...doc, locks }, docPath, units, NESTED);
  const s = memorySelection(over.doc, over.units);
  return { groupBy: s.groupBy?.key ?? null, groups: s.groups.map((g) => [g.key, g.units.map((u) => u.item)] as const), locks: s.locks };
};

describe("memoryScope", () => {
  it("is the memory's own folder, unless scope: says otherwise; the whole store without a path", () => {
    expect(memoryScope(parseMemory(""), "/desk.memory")).toBe("/");
    expect(memoryScope(parseMemory(""), "/Meme XP/meme.memory")).toBe("/Meme XP");
    expect(memoryScope(parseMemory("scope: /"), "/memory/desk.memory")).toBe("/");
    expect(memoryScope(parseMemory("scope: .."), "/a/b/x.memory")).toBe("/a");
    expect(memoryScope(parseMemory("scope: /Meme XP/money"), "/desk.memory")).toBe("/Meme XP/money");
    expect(memoryScope(parseMemory(""), null)).toBe("/");
  });
});

describe("unitsInScope", () => {
  it("documents only: files and structured folders — never plain folders, .memory files, or anything inside a structured folder", () => {
    expect(unitsInScope("/", units).map((u) => u.item)).toEqual([
      "/Demo/overview.brief", "/Demo/fixture.playbook",
      "/Demo/launch.playbook/01 skeleton.playbook", "/Demo/launch.playbook/02 current.playbook",
      "/Meme XP/events.playbook", "/Meme XP/readiness.playbook.annotations",
      "/Meme XP/money/funding.playbook", "/Meme XP/money/settle-up.brief", "/Meme XP/legal/incorporation.brief",
      "/Meme XP/lead.node",
      "/tnt-buyer-assets/01.png", "/login.frame", "/tnt-buyer.flow",
    ]);
  });
  it("a narrower scope keeps only what sits inside it", () => {
    expect(unitsInScope("/Meme XP/money", units).map((u) => u.item))
      .toEqual(["/Meme XP/money/funding.playbook", "/Meme XP/money/settle-up.brief"]);
  });
});

describe("a memory with no decisions: the folders are the foci", () => {
  it("one synthesized decision per folder with sub-folders; a nested memory's decisions spliced in under its folder", () => {
    const space = folderSpace("/", DESK, unitsInScope("/", units).filter((u) => !u.item.includes("-assets/") && !u.item.endsWith(".annotations")), NESTED);
    expect(space.map((d) => [d.key, d.label, d.values.map((v) => `${v.key}${v.activates ? `→${v.activates.join("+")}` : ""}`)])).toEqual([
      ["folder", "Focus", ["Demo→folder/Demo", "Meme XP→/Meme XP/topic"]],
      ["folder/Demo", "Sub-focus", ["launch.playbook"]],
      ["/Meme XP/topic", "Topic", ["money→/Meme XP/kind", "legal"]],
      ["/Meme XP/kind", "Kind", ["playbooks"]],
    ]);
    // The folder split derives by path; the nested memory's refs follow its keys.
    expect(space[0].derive).toEqual([
      { value: "Demo", when: [{ param: "path", op: "starts_with", value: "/Demo/" }] },
      { value: "Meme XP", when: [{ param: "path", op: "starts_with", value: "/Meme XP/" }] },
    ]);
    expect(space[3].values[0].when).toEqual(["/Meme XP/topic=money"]);
    expect(space[2].detail).toBe("from /Meme XP/meme.memory");
  });

  it("nothing taken: each sub-folder holding units is a group, files sitting directly in the folder are Everything else; a folder the include rules out is no focus", () => {
    expect(groupsOf([])).toEqual({
      groupBy: "folder",
      groups: [
        ["Demo", ["/Demo/overview.brief", "/Demo/fixture.playbook", "/Demo/launch.playbook/01 skeleton.playbook", "/Demo/launch.playbook/02 current.playbook"]],
        ["Meme XP", ["/Meme XP/events.playbook", "/Meme XP/money/funding.playbook", "/Meme XP/money/settle-up.brief", "/Meme XP/legal/incorporation.brief", "/Meme XP/lead.node"]],
        [ELSE, ["/login.frame", "/tnt-buyer.flow"]],
      ],
      locks: [],
    });
  });

  it("a focus taken whose folder holds a memory WITH decisions: that memory splits it", () => {
    expect(groupsOf(["folder=Meme XP"])).toEqual({
      groupBy: "/Meme XP/topic",
      groups: [
        ["money", ["/Meme XP/money/funding.playbook", "/Meme XP/money/settle-up.brief"]],
        ["legal", ["/Meme XP/legal/incorporation.brief"]],
        [ELSE, ["/Meme XP/events.playbook", "/Meme XP/lead.node"]],
      ],
      locks: ["folder=Meme XP"],
    });
    expect(groupsOf(["folder=Meme XP", "/Meme XP/topic=money"])).toEqual({
      groupBy: "/Meme XP/kind",
      groups: [["playbooks", ["/Meme XP/money/funding.playbook"]], [ELSE, ["/Meme XP/money/settle-up.brief"]]],
      locks: ["folder=Meme XP", "/Meme XP/topic=money"],
    });
  });

  it("a focus taken whose folder holds an EMPTY memory (or none): its sub-folders split it; a leaf lists", () => {
    expect(groupsOf(["folder=Demo"])).toEqual({
      groupBy: "folder/Demo",
      groups: [
        ["launch.playbook", ["/Demo/launch.playbook/01 skeleton.playbook", "/Demo/launch.playbook/02 current.playbook"]],
        [ELSE, ["/Demo/overview.brief", "/Demo/fixture.playbook"]],
      ],
      locks: ["folder=Demo"],
    });
    expect(groupsOf(["folder=Demo", "folder/Demo=launch.playbook"])).toEqual({
      groupBy: null,
      groups: [["*", ["/Demo/launch.playbook/01 skeleton.playbook", "/Demo/launch.playbook/02 current.playbook"]]],
      locks: ["folder=Demo", "folder/Demo=launch.playbook"],
    });
  });

  it("a lock naming a folder that is gone (renamed) is dropped, so nothing hides behind a pill that cannot be clicked", () => {
    expect(groupsOf(["folder=Gone", "folder=Demo"]).locks).toEqual(["folder=Demo"]);
  });
});

describe("a memory WITH decisions dictates its folder's split", () => {
  const AUTHORED = parseMemory(`
decisions:
  - key: focus
    label: Focus
    values:
      - {key: screens, label: Screens}
      - {key: meme, label: Meme XP, activates: [folder/Meme XP]}
    derive:
      - {value: screens, when: [{param: ext, op: equals, value: frame}]}
      - {value: meme, when: [{param: path, op: starts_with, value: "/Meme XP/"}]}
`);
  it("no folder split at the root; nested memories are not consulted; `activates: [folder/<path>]` hangs that folder's sub-folder split", () => {
    const over = memoryOverFolder(AUTHORED, "/desk.memory", units, NESTED);
    expect(over.doc.decisions.map((d) => d.key)).toEqual(["focus", "folder/Meme XP"]);
    expect(over.doc.decisions[1].values.map((v) => v.key)).toEqual(["legal", "money"]);
    const s = memorySelection({ ...over.doc, locks: ["focus=meme"] }, over.units);
    expect(s.groupBy?.key).toBe("folder/Meme XP");
    expect(s.groups.map((g) => [g.key, g.units.length])).toEqual([["legal", 1], ["money", 2], [ELSE, 3]]);
  });

  it("opened itself, a nested memory looks at its own folder with its own keys", () => {
    const over = memoryOverFolder(MEME, "/Meme XP/meme.memory", units, new Map());
    expect(over.scope).toBe("/Meme XP");
    expect(over.doc.decisions.map((d) => d.key)).toEqual(["topic", "kind"]);
    const s = memorySelection(over.doc, over.units);
    expect(s.groups.map((g) => [g.key, g.units.map((u) => u.item)])).toEqual([
      ["money", ["/Meme XP/money/funding.playbook", "/Meme XP/money/settle-up.brief"]],
      ["legal", ["/Meme XP/legal/incorporation.brief"]],
      [ELSE, ["/Meme XP/events.playbook", "/Meme XP/readiness.playbook.annotations", "/Meme XP/lead.node"]],
    ]);
  });
});

describe("an empty .memory file", () => {
  it("parses to a memory with no decisions — the folder split; the first answer taken starts the file at the locks banner", () => {
    expect(parseMemory("").decisions).toEqual([]);
    expect(memoryScope(parseMemory(""), "/Demo/demo.memory")).toBe("/Demo");
    const text = writeLocks("", ["folder=Demo"], "2026-09-13T09:00:00.000Z");
    expect(text.startsWith("# The answers currently taken.")).toBe(true);
    expect(parseMemory(text).locks).toEqual(["folder=Demo"]);
    expect(parseMemory(text).journal).toEqual([{ at: "2026-09-13T09:00:00.000Z", locks: ["folder=Demo"] }]);
  });
  it("the New Document template is the same memory, with the words", () => {
    const doc = parseMemory(fileTemplate("desk.memory"));
    expect(doc.title).toBe("desk");
    expect(doc.decisions).toEqual([]);
    expect(doc.include).toEqual([]);
    expect(doc.scope).toBeUndefined();
  });
  it("folder locks survive the round trip through the locks block", () => {
    const text = writeLocks("title: T\n", ["folder=Meme XP", "/Meme XP/topic=money", "folder/org-structure=before"], "2026-09-13T09:00:00.000Z");
    expect(parseMemory(text).locks).toEqual(["folder=Meme XP", "/Meme XP/topic=money", "folder/org-structure=before"]);
  });
});

/** A folder split read LAZILY (the Studio's front door over C:\Github): the scope is listed,
 *  a folder is read when its pill is taken, nothing under the others is read at all. */
describe("a folder split read lazily", () => {
  it("names the folders the taken answers open, from the scope down", () => {
    expect(takenFolderChain("/", [])).toEqual([]);
    expect(takenFolderChain("/", ["folder=Meme XP"])).toEqual(["/Meme XP"]);
    expect(takenFolderChain("/", ["folder=Meme XP", "folder/Meme XP=money"])).toEqual(["/Meme XP", "/Meme XP/money"]);
    // Everything else opens nothing; a deeper answer without its parent opens nothing either.
    expect(takenFolderChain("/", ["folder=~else"])).toEqual([]);
    expect(takenFolderChain("/", ["folder/Meme XP=money"])).toEqual([]);
    expect(takenFolderChain("/Demo", ["folder=launch.playbook"])).toEqual(["/Demo/launch.playbook"]);
  });
  it("folders known from a listing are foci before anything under them is read", () => {
    const here = [file("/login.frame")].map((e) => ({ item: e.path, fields: indexFields(e, TODAY) }));
    const over = memoryOverFolder(parseMemory(""), "/desk.memory", here, new Map(), ["/Demo", "/Meme XP"]);
    expect(over.doc.decisions.map((d) => d.key)).toEqual(["folder"]);
    expect(over.doc.decisions[0].values.map((v) => v.key)).toEqual(["Demo", "Meme XP"]);
    // Nothing under them was read, so no answer opens a split yet — taking one is what reads it.
    expect(over.doc.decisions[0].values.every((v) => !v.activates)).toBe(true);
    const sel = memorySelection(over.doc, over.units);
    expect(sel.groups.map((g) => [g.key, g.units.length])).toEqual([["Demo", 0], ["Meme XP", 0], [ELSE, 1]]);
  });
  it("once a taken folder is listed, its sub-folders are the next split", () => {
    const known = ["/Demo", "/Meme XP", "/Meme XP/money", "/Meme XP/legal"];
    const here = [file("/login.frame"), file("/Meme XP/events.playbook")].map((e) => ({ item: e.path, fields: indexFields(e, TODAY) }));
    const over = memoryOverFolder(parseMemory("locks:\n  - folder=Meme XP\n"), "/desk.memory", here, new Map(), known);
    expect(over.doc.decisions.map((d) => d.key)).toEqual(["folder", "folder/Meme XP"]);
    expect(over.doc.decisions[0].values.find((v) => v.key === "Meme XP")?.activates).toEqual(["folder/Meme XP"]);
    const sel = memorySelection(over.doc, over.units);
    expect(sel.groupBy?.key).toBe("folder/Meme XP");
    expect(sel.groups.map((g) => [g.key, g.units.length])).toEqual([["legal", 0], ["money", 0], [ELSE, 1]]);
    expect(sel.groups[2].units.map((u) => u.item)).toEqual(["/Meme XP/events.playbook"]);
  });
});
