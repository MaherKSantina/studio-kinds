/** GOLDEN RULES for asking a project folder for files — paths land under the
 *  target and never outside the project, nothing is overwritten or deleted,
 *  every file starts from its kind's template, and the plan is pure. */
import { describe, expect, it } from "vitest";
import {
  PROJECT_ASK_OPS, PROJECT_ASK_SCHEMA, parseProjectAskReply, planProjectOps, projectAskSystem, projectAskUser, resolveProjectPath, runProjectPlan,
} from "../lib/projectAsk";
import { TEMPLATE_KINDS, fileTemplate } from "../lib/fileTemplates";

const T = { root: "/Coding Mock Interview", folder: "/Coding Mock Interview/screens" };
const EXISTING = new Set(["/Coding Mock Interview/README.md", "/Coding Mock Interview/screens", "/Coding Mock Interview/screens/login.frame"]);

describe("planProjectOps", () => {
  it("a bare name lands in the target folder, a tree path is root-relative, absolute ones under the root; files start from their kind's template", () => {
    const { actions, skipped } = planProjectOps([
      { op: "create_file", path: "welcome.frame", title: "Welcome" },
      { op: "create_file", path: "onboarding/step-2.frame", title: "Step 2" },
      { op: "create_file", path: "/Coding Mock Interview/notes.md", title: "Notes", content: "- agenda" },
      { op: "create_folder", path: "research" },
      { op: "rename", path: "screens/login.frame", name: "signin.frame" },
    ], T, EXISTING);
    expect(skipped).toEqual([]);
    expect(actions.map((a) => [a.kind, a.path])).toEqual([
      ["write", "/Coding Mock Interview/screens/welcome.frame"],
      ["write", "/Coding Mock Interview/onboarding/step-2.frame"],
      ["write", "/Coding Mock Interview/notes.md"],
      ["mkdir", "/Coding Mock Interview/screens/research"],
      ["rename", "/Coding Mock Interview/screens/login.frame"],
    ]);
    const welcome = actions[0] as { content: string };
    expect(welcome.content.startsWith("# .frame — ONE screen")).toBe(true);
    expect(welcome.content).toContain("title: Welcome");
    expect((actions[2] as { content: string }).content).toBe("# Notes\n\n- agenda\n");
    expect(actions[0].note).toBe('created screens/welcome.frame — .frame, "Welcome"');
  });

  it("refuses what must not happen: outside the project, climbing, existing paths, no extension, bad renames", () => {
    const { actions, skipped } = planProjectOps([
      { op: "create_file", path: "/Elsewhere/x.md" },
      { op: "create_file", path: "../x.md" },
      { op: "create_file", path: "login.frame" },
      { op: "create_file", path: "plan" },
      { op: "rename", path: "ghost.md", name: "x.md" },
      { op: "rename", path: "login.frame", name: "sub/login.frame" },
      { op: "rename", path: "login.frame", name: "signin.frame" },
      { op: "create_file", path: "signin.frame" },
    ], T, EXISTING);
    expect(actions.map((a) => a.kind)).toEqual(["rename"]);
    expect(skipped).toEqual([
      'create_file: "/Elsewhere/x.md" is outside the project (/Coding Mock Interview)',
      'create_file: "../x.md" climbs out of its folder',
      'create_file "login.frame": it already exists — nothing is overwritten',
      'create_file "plan": give it an extension (.md, .frame, .flow, .brief, .list, .kanban, .policy, .playbook, .plan, .guide, .points, .project, .memory, .definition, .calendar, .schema, .workup, .program, .pulse, .moves, .tablediff, .jsonl, .middleware, .collection, .pipeline, .clip, .song, .script, .views, .page)',
      'rename "ghost.md": nothing there to rename',
      'rename "login.frame": give a plain new name, no slashes',
      'create_file "signin.frame": it already exists — nothing is overwritten',
    ]);
  });

  it("the same path twice in one reply is created once", () => {
    const { actions, skipped } = planProjectOps([{ op: "create_file", path: "a.md" }, { op: "create_file", path: "a.md" }], T, EXISTING);
    expect(actions).toHaveLength(1);
    expect(skipped).toHaveLength(1);
  });

  it("with a target file, \"it\" is that file: rename needs no path, relative paths land beside it", () => {
    const aimed = { ...T, folder: "/Coding Mock Interview/screens", file: "/Coding Mock Interview/screens/login.frame" };
    const { actions, skipped } = planProjectOps([
      { op: "rename", name: "signin.frame" },
      { op: "create_file", path: "login-flow.flow", title: "Login flow" },
    ], aimed, EXISTING);
    expect(skipped).toEqual([]);
    expect(actions.map((a) => [a.kind, a.path])).toEqual([
      ["rename", "/Coding Mock Interview/screens/login.frame"],
      ["write", "/Coding Mock Interview/screens/login-flow.flow"],
    ]);
    const user = projectAskUser(aimed, [], "rename it", [], "title: Login\nframes:\n  - {id: f1}\n");
    expect(user).toContain('TARGET file: /Coding Mock Interview/screens/login.frame (.frame) — "this" and "it" mean this file');
    expect(user).toContain("FILE (first lines)\ntitle: Login");
    expect(projectAskUser(aimed, [], "x", [], "x".repeat(2000))).toContain("FILE (first 1500 characters)");
  });

  it("move_into_flow takes a .frame (the target file by default) into a .flow that exists; anything else is refused", () => {
    const withFlow = new Set([...EXISTING, "/Coding Mock Interview/screens/login-flow.flow", "/Coding Mock Interview/screens/other.frame"]);
    const aimed = { ...T, file: "/Coding Mock Interview/screens/login.frame" };
    const { actions, skipped } = planProjectOps([
      { op: "move_into_flow", flow: "login-flow.flow" },
      { op: "move_into_flow", path: "screens/login.frame", flow: "screens/login-flow.flow" },
      { op: "move_into_flow", path: "README.md", flow: "login-flow.flow" },
      { op: "move_into_flow", path: "screens/other.frame", flow: "ghost.flow" },
    ], aimed, withFlow);
    expect(actions).toEqual([{ kind: "moveIntoFlow", path: "/Coding Mock Interview/screens/login.frame", flow: "/Coding Mock Interview/screens/login-flow.flow", note: "moved screens/login.frame into screens/login-flow.flow" }]);
    expect(skipped).toEqual([
      'move_into_flow "screens/login.frame": nothing there to move',
      'move_into_flow "README.md": only a .frame can move into a flow',
      'move_into_flow: "ghost.flow" is not a flow in the project',
    ]);
  });

  it("resolveProjectPath normalises slashes and keeps the root itself in bounds", () => {
    expect(resolveProjectPath(T, "a//b.md")).toEqual({ ok: true, abs: "/Coding Mock Interview/a/b.md" });
    expect(resolveProjectPath(T, "./b.md")).toEqual({ ok: true, abs: "/Coding Mock Interview/screens/b.md" });
    // For something that must exist, whichever reading exists wins.
    expect(resolveProjectPath(T, "login.frame", EXISTING)).toEqual({ ok: true, abs: "/Coding Mock Interview/screens/login.frame" });
    expect(resolveProjectPath(T, "screens/login.frame", EXISTING)).toEqual({ ok: true, abs: "/Coding Mock Interview/screens/login.frame" });
    expect(resolveProjectPath(T, "README.md", EXISTING)).toEqual({ ok: true, abs: "/Coding Mock Interview/README.md" });
    expect(resolveProjectPath(T, "/Coding Mock Interview")).toEqual({ ok: true, abs: "/Coding Mock Interview" });
    expect(resolveProjectPath(T, "/Coding Mock Interviews/x.md").ok).toBe(false);
    expect(resolveProjectPath(T, "").ok).toBe(false);
  });
});

describe("runProjectPlan", () => {
  it("performs actions in order through the host, says what failed, and reports the files it made", async () => {
    const calls: string[] = [];
    const r = await runProjectPlan([
      { kind: "mkdir", path: "/p/f", note: "created folder f/" },
      { kind: "write", path: "/p/f/a.md", content: "# A\n\n", note: "created f/a.md — .md" },
      { kind: "rename", path: "/p/f/a.md", name: "b.md", note: "renamed f/a.md → b.md" },
      { kind: "write", path: "/p/boom.md", content: "", note: "created boom.md — .md" },
    ], {
      mkdir: async (p) => { calls.push(`mkdir ${p}`); },
      write: async (p) => { if (p.endsWith("boom.md")) throw new Error("disk full"); calls.push(`write ${p}`); },
      rename: async (p, n) => { calls.push(`rename ${p} ${n}`); },
    });
    expect(calls).toEqual(["mkdir /p/f", "write /p/f/a.md", "rename /p/f/a.md b.md"]);
    expect(r.applied).toEqual(["created folder f/", "created f/a.md — .md", "renamed f/a.md → b.md"]);
    expect(r.skipped).toEqual(["created boom.md — .md: disk full"]);
    expect(r.created).toEqual(["/p/f/a.md"]);
    const none = await runProjectPlan([{ kind: "mkdir", path: "/p/x", note: "created folder x/" }], {});
    expect(none.skipped).toEqual(["created folder x/: this host cannot create folders"]);
  });

  it("a move writes the flow before it removes the frame, and removes nothing when the write fails", async () => {
    const files: Record<string, string> = {
      "/p/login.frame": "title: Login\nframes:\n  - {id: f1, name: Login, width: 390, height: 844}\nnodes: []\n",
      "/p/f.flow": "title: F\nscreens:\n  - id: a\n    title: A\n    frame: login.frame\n---\nactive: v1\nviews: []\n",
    };
    const calls: string[] = [];
    const fs = {
      read: async (p: string) => files[p],
      write: async (p: string, c: string) => { calls.push(`write ${p}`); files[p] = c; },
      remove: async (p: string) => { calls.push(`remove ${p}`); delete files[p]; },
    };
    const action = { kind: "moveIntoFlow" as const, path: "/p/login.frame", flow: "/p/f.flow", note: "moved login.frame into f.flow" };
    const r = await runProjectPlan([action], fs);
    expect(calls).toEqual(["write /p/f.flow", "remove /p/login.frame"]);
    expect(r.applied).toEqual(['moved login.frame into f.flow as "login" (1 state re-pointed)']);
    expect(r.created).toEqual(["/p/f.flow"]);
    expect(files["/p/login.frame"]).toBeUndefined();
    expect(files["/p/f.flow"]).toContain("frame: login\n");
    const broken = await runProjectPlan([action], { ...fs, read: async (p: string) => (p === "/p/login.frame" ? "title: Login\nframes:\n  - {id: f1, name: L, width: 1, height: 1}\n" : files["/p/f.flow"]), write: async () => { throw new Error("disk full"); } });
    expect(broken.skipped).toEqual(["moved login.frame into f.flow: disk full"]);
    expect(calls).toHaveLength(2);
  });
});

describe("what the model sees and says", () => {
  it("the system prompt names every kind and op; the user message carries the target, the tree and the instruction", () => {
    const sys = projectAskSystem();
    for (const k of TEMPLATE_KINDS) expect(sys).toContain(`.${k.ext} —`);
    for (const op of PROJECT_ASK_OPS) expect(sys).toContain(`${op} {`);
    const user = projectAskUser(T, [{ path: "README.md", kind: "file" }, { path: "screens", kind: "folder" }], "3 frames", [{ instruction: "a note", say: "Done.", result: "applied 1" }]);
    expect(user).toContain("TARGET folder: /Coding Mock Interview/screens (relative: screens/)");
    expect(user).toContain("- screens/");
    expect(user).toContain("you: Done. [applied 1]");
    expect(user.endsWith("INSTRUCTION: 3 frames")).toBe(true);
    expect(projectAskUser({ root: T.root, folder: T.root }, [], "x")).toContain("TARGET folder: /Coding Mock Interview (the root)");
  });

  it("replies read leniently; templates by kind", () => {
    expect(PROJECT_ASK_SCHEMA.properties.ops.items.properties.op.enum).toEqual([...PROJECT_ASK_OPS]);
    expect(parseProjectAskReply({ message: "ok", actions: [{ action: "mkdir", folder: "docs" }, { op: "create", file: "a.md", body: "hi" }, { op: "move", path: "a.md", to: "b.md" }, { op: "delete", path: "x" }] }))
      .toEqual({ say: "ok", ops: [{ op: "create_folder", path: "docs" }, { op: "create_file", path: "a.md", content: "hi" }, { op: "rename", path: "a.md", name: "b.md" }] });
    expect(fileTemplate("/x/y.flow", "Signup")).toContain("title: Signup");
    expect(fileTemplate("/x/y.list", "Reading")).toBe("title: Reading\nitems: []\n");
    expect(fileTemplate("/x/y.txt", undefined, "plain")).toBe("plain\n");
    expect(fileTemplate("/x/y.xyz")).toBe("");
  });
});
