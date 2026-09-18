/** Gather the parseable documents behind a project's items — the graph
 *  assemblers' input. Shared by ProjectView (tree lens buttons), the DAG
 *  dialog, and the lens view. */
import { ProjectDoc } from "./projectDoc";
import { parsePoints } from "./pointsDoc";
import { parseWorkup } from "./workupDoc";
import { parseDocList } from "./listDoc";
import { parsePlaybook } from "./playbookDoc";
import { extensionOfPath } from "./filePreviews";
import { readVirtualDirectoryFile } from "../api";
import { GraphDocs } from "./projectGraph";

export async function loadGraphDocs(doc: ProjectDoc): Promise<GraphDocs> {
  const docs: GraphDocs = { points: new Map(), workups: new Map(), lists: new Map(), playbooks: new Map() };
  const files: string[] = [];
  const walk = (items: ProjectDoc["items"]) => {
    for (const it of items) {
      if (it.file) files.push(it.file);
      if (it.items) walk(it.items);
    }
  };
  walk(doc.items);
  await Promise.all(files.map(async (file) => {
    const ext = extensionOfPath(file);
    if (ext !== "points" && ext !== "workup" && ext !== "list" && ext !== "playbook") return;
    try {
      const r = await readVirtualDirectoryFile(file, file);
      if (ext === "points") docs.points!.set(file, parsePoints(r.content));
      if (ext === "workup") docs.workups!.set(file, parseWorkup(r.content));
      if (ext === "list") docs.lists!.set(file, parseDocList(r.content));
      if (ext === "playbook") docs.playbooks!.set(file, parsePlaybook(r.content));
    } catch { /* an unreadable doc contributes nothing */ }
  }));
  return docs;
}
