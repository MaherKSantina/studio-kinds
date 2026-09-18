import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileText } from "lucide-react";
import { AppShell, AutosaveInfo } from "../src/components/AppShell";

const meta: Meta<typeof AppShell> = {
  title: "Shell/AppShell",
  component: AppShell,
};
export default meta;
type Story = StoryObj<typeof AppShell>;

const logo = (
  <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
    <FileText className="size-5" />
  </span>
);

const menus = [
  {
    label: "File",
    items: [
      { label: "New", shortcut: "Ctrl+N", onSelect: () => {} },
      { label: "Open…", shortcut: "Ctrl+O", onSelect: () => {} },
      { label: "Save now", shortcut: "Ctrl+S", onSelect: () => {} },
      { label: "Save as…", onSelect: () => {} },
      { label: "Rename…", separatorBefore: true, onSelect: () => {} },
    ],
  },
  {
    label: "Edit",
    items: [
      { label: "Undo", shortcut: "Ctrl+Z", disabled: true },
      { label: "Redo", shortcut: "Ctrl+Y", disabled: true },
    ],
  },
  { label: "View", items: [{ label: "Source", onSelect: () => {} }, { label: "Preview", onSelect: () => {} }] },
];

const body = (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
    document surface
  </div>
);

const saved: AutosaveInfo = { state: "saved", lastSavedAt: new Date() };

export const NoDocument: Story = {
  args: { appName: "Policy Studio", logo, menus, docTitle: null, autosave: null, children: body },
};

export const Saved: Story = {
  args: { appName: "Policy Studio", logo, menus, docTitle: "setup.plan", docPath: "/Meme XP/setup.plan", autosave: saved, children: body },
};

export const Saving: Story = {
  args: { ...Saved.args, autosave: { state: "saving", lastSavedAt: new Date() } },
};

export const Dirty: Story = {
  args: { ...Saved.args, autosave: { state: "dirty", lastSavedAt: new Date() } },
};

export const SaveError: Story = {
  args: { ...Saved.args, autosave: { state: "error", lastSavedAt: null, lastError: "PUT /api/fs/file → 500" } },
};
