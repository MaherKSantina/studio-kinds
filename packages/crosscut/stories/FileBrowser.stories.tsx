import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileBrowser } from "../src/components/FileBrowser";
import { DirectoryTree } from "../src/components/DirectoryTree";
import { memoryFs } from "../src/fs/memoryFs";
import { FileSystemAdapter } from "../src/fs/types";

const seed = memoryFs({
  "/Meme XP": null,
  "/Meme XP/events.playbook": "title: Events",
  "/Meme XP/readiness.playbook": "title: Readiness",
  "/Meme XP/setup.plan": "title: Setup",
  "/Meme XP/notes.md": "# notes",
  "/Meme XP/money": null,
  "/Meme XP/money/fund-the-venture.guide": "title: Funding",
  "/Meme XP/launch.playbook": null,
  "/Meme XP/launch.playbook/01 skeleton.playbook": "title: Launch v1",
  "/Meme XP/launch.playbook/02 current.playbook": "title: Launch v2",
  "/Archive": null,
});

function Browser({ mode, extensions, fs = seed, path = "/Meme XP" }: { mode: "open" | "save" | "browse"; extensions?: string[]; fs?: FileSystemAdapter; path?: string }) {
  const [p, setP] = React.useState(path);
  const [sel, setSel] = React.useState<Parameters<NonNullable<React.ComponentProps<typeof FileBrowser>["onSelect"]>>[0]>(null);
  return (
    <div className="mx-auto h-[420px] max-w-xl border-x">
      <FileBrowser fs={fs} path={p} onNavigate={setP} mode={mode} extensions={extensions}
        selected={sel} onSelect={setSel} onChooseFile={(e) => alert(`open ${e.path}`)} className="h-full" />
    </div>
  );
}

const meta: Meta = { title: "Files/FileBrowser" };
export default meta;

export const Browse: StoryObj = { render: () => <Browser mode="browse" /> };
export const OpenModePlaybooksOnly: StoryObj = {
  name: "Open mode (playbook/plan/guide filter — others dimmed)",
  render: () => <Browser mode="open" extensions={["playbook", "plan", "guide"]} />,
};
export const SaveMode: StoryObj = { render: () => <Browser mode="save" extensions={["plan"]} /> };
export const EmptyFolder: StoryObj = { render: () => <Browser mode="browse" path="/Archive" /> };
export const LoadingAndError: StoryObj = {
  render: () => {
    const slow: FileSystemAdapter = { ...seed, list: () => new Promise(() => {}) };
    const broken: FileSystemAdapter = { ...seed, list: () => Promise.reject(new Error("GET /api/fs/list → 500")) };
    return (
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 p-4">
        <div className="h-[300px] border"><FileBrowser fs={slow} path="/" onNavigate={() => {}} mode="browse" className="h-full" /></div>
        <div className="h-[300px] border"><FileBrowser fs={broken} path="/" onNavigate={() => {}} mode="browse" className="h-full" /></div>
      </div>
    );
  },
};
export const Tree: StoryObj = {
  render: () => {
    const [sel, setSel] = React.useState<string | null>(null);
    return (
      <div className="mx-auto h-[420px] w-72 border-x">
        <DirectoryTree fs={seed} showFiles selectedPath={sel} onSelect={(e) => setSel(e.path)} className="h-full" />
      </div>
    );
  },
};
