import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FilePickerDialog } from "../src/components/FilePickerDialog";
import { Button } from "../src/components/ui/button";
import { memoryFs } from "../src/fs/memoryFs";

const seed = memoryFs({
  "/Meme XP": null,
  "/Meme XP/events.playbook": "title: Events",
  "/Meme XP/readiness.playbook": "title: Readiness",
  "/Meme XP/setup.plan": "title: Setup",
  "/Meme XP/notes.md": "# notes",
  "/Meme XP/money": null,
  "/Meme XP/money/fund-the-venture.guide": "title: Funding",
});

function Demo({ mode, extensions, defaultName }: { mode: "open" | "save"; extensions?: string[]; defaultName?: string }) {
  const [open, setOpen] = React.useState(true);
  const [picked, setPicked] = React.useState<string | null>(null);
  return (
    <div className="p-8">
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      {picked && <p className="mt-3 text-sm">picked: <code>{picked}</code></p>}
      <FilePickerDialog fs={seed} mode={mode} open={open} onOpenChange={setOpen}
        extensions={extensions} initialPath="/Meme XP" defaultName={defaultName} onPick={setPicked} />
    </div>
  );
}

const meta: Meta = { title: "Files/FilePickerDialog" };
export default meta;

export const OpenMode: StoryObj = { render: () => <Demo mode="open" extensions={["playbook", "plan", "guide"]} /> };
export const SaveMode: StoryObj = { render: () => <Demo mode="save" extensions={["plan"]} defaultName="new-policy.plan" /> };
export const SaveOverwriteHint: StoryObj = {
  name: "Save mode — type “setup” to see the replace hint",
  render: () => <Demo mode="save" extensions={["plan"]} defaultName="setup" />,
};
