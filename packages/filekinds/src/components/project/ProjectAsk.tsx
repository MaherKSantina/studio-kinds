/**
 * The Projects directory view's Ask — the shared panel (crosscut) aimed at a
 * FOLDER: click a folder in the tree to aim there, ask for files, and they
 * appear from their kinds' templates. The vocabulary is filekinds'
 * projectAsk; the file system is whatever the host configured (a host
 * without an ask API never shows this).
 */
import * as React from "react";
import { AskPanel, type AskApi, type AskTargetChip } from "crosscut";
import { configuredLister, configuredMkdir, configuredRemover, configuredRenamer, configuredWriter, readVirtualDirectoryFile } from "../../api";
import {
  PROJECT_ASK_SCHEMA, type ProjectAskEntry, parseProjectAskReply, planProjectOps, projectAskSystem, projectAskUser, runProjectPlan,
} from "../../lib/projectAsk";

const EXAMPLES = [
  "create 3 frame files for the onboarding screens", "a notes.md with today's agenda",
  "a folder called research with a reading.list inside", "rename plan.md to roadmap.md",
];

/** The project's tree, three levels deep, relative to the root. */
async function treeOf(root: string): Promise<ProjectAskEntry[]> {
  const lister = configuredLister();
  if (!lister) return [];
  const base = root.replace(/\/+$/, "") || "/";
  const out: ProjectAskEntry[] = [];
  const walk = async (dir: string, depth: number) => {
    let entries: { path: string; name: string; kind: "folder" | "file" }[] = [];
    try { entries = await lister(dir); } catch { return; }
    for (const e of entries) {
      out.push({ path: e.path.slice(base === "/" ? 1 : base.length + 1), kind: e.kind });
      if (e.kind === "folder" && depth < 3 && !e.name.includes(".")) await walk(e.path, depth + 1);
    }
  };
  await walk(base, 0);
  return out;
}

export default function ProjectAsk({ api, root, folder, file, focusKey, onClear, onClearFile, onDone, onClose }: {
  api: AskApi;
  root: string;
  /** The folder aimed at (the root when nothing is picked; a file's own folder when a file is). */
  folder: string;
  /** The file aimed at, when the last click was a file. */
  file?: string | null;
  focusKey?: number;
  /** Present when a subfolder is aimed at, to aim at the root again. */
  onClear?: () => void;
  /** Present when a file is aimed at, to aim at its folder instead. */
  onClearFile?: () => void;
  /** Called after a turn that touched the store, with the files it created. */
  onDone: (created: string[]) => void;
  onClose?: () => void;
}) {
  const rel = folder === root ? "/" : folder.slice(root.length).replace(/^\/+/, "");
  const fileName = file ? file.slice(file.lastIndexOf("/") + 1) : "";
  const target: AskTargetChip[] = [
    { label: folder.slice(folder.lastIndexOf("/") + 1) || root, detail: rel === "/" ? "the root" : `${rel}/`, onClear: file ? undefined : onClear },
    ...(file ? [{ label: fileName, detail: `.${fileName.split(".").pop() ?? ""}`, onClear: onClearFile }] : []),
  ];
  const aim = { root, folder, file: file ?? null };
  return (
    <AskPanel
      api={api}
      target={target}
      placeholder={file ? `What about ${fileName}?` : `What should go into ${rel === "/" ? "the project" : rel}?`}
      examples={file ? ["rename it to signin.frame", "a flow next to it for its states", "a notes.md beside it", ...(/\.frame$/i.test(file) ? ["move it into login-flow.flow"] : [])] : EXAMPLES}
      compose={async (instruction, history) => {
        let excerpt: string | undefined;
        if (file) { try { excerpt = (await readVirtualDirectoryFile(file, file)).content; } catch { excerpt = undefined; } }
        return {
          system: projectAskSystem(),
          user: projectAskUser(aim, await treeOf(root), instruction, history, excerpt),
          schema: PROJECT_ASK_SCHEMA,
        };
      }}
      apply={async (output) => {
        const reply = parseProjectAskReply(output);
        const entries = await treeOf(root);
        const base = root.replace(/\/+$/, "") || "/";
        const existing = new Set(entries.map((e) => (base === "/" ? `/${e.path}` : `${base}/${e.path}`)));
        const plan = planProjectOps(reply.ops, aim, existing);
        const res = await runProjectPlan(plan.actions, {
          write: configuredWriter(), mkdir: configuredMkdir(), rename: configuredRenamer(), remove: configuredRemover(),
          read: (abs) => readVirtualDirectoryFile(abs, abs).then((r) => r.content),
        });
        if (res.applied.length) onDone(res.created);
        return { say: reply.say, applied: res.applied, skipped: [...plan.skipped, ...res.skipped] };
      }}
      resetKey={root}
      focusKey={focusKey}
      onClose={onClose}
    />
  );
}
