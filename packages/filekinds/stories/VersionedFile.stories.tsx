import type { Meta, StoryObj } from "@storybook/react-vite";
import { VersionedFileView } from "../src/components/VersionedFileView";
import { useFixtureFs } from "./fixtures";

useFixtureFs();

const meta: Meta = {
  title: "File kinds/Versioned file",
  parameters: {
    docs: {
      description: {
        component:
          "A folder named like a file is a VERSIONED FILE (crosscut's entry-presentation table): " +
          "its child files are the versions, and the reserved versions.md is the CHANGELOG (why " +
          "each version changed — the History entry). Left = the versions, newest first with the " +
          "latest preselected; right = the selected version drawn by its own kind through " +
          "DocumentPreview. With a configured writer the view authors too: + cuts the next " +
          "version (the why lands in the changelog) and the LATEST version is editable in place; " +
          "older versions stay frozen so refs pinned to them (`…/01 first.playbook`) never drift.",
      },
    },
  },
};
export default meta;

export const Playbook: StoryObj = {
  name: "Playbook with two versions",
  render: () => (
    <div style={{ height: "100vh" }}>
      <VersionedFileView
        path="/Books/launch.playbook"
        versions={[
          { name: "01 first cut.playbook", path: "/Books/launch.playbook/01 first cut.playbook" },
          { name: "02 current.playbook", path: "/Books/launch.playbook/02 current.playbook" },
          // The changelog rides along like any host listing — the view files
          // it under History, never in the version list.
          { name: "versions.md", path: "/Books/launch.playbook/versions.md" },
        ]}
      />
    </div>
  ),
};

export const Empty: StoryObj = {
  name: "No versions yet",
  render: () => (
    <div style={{ height: 320 }}>
      <VersionedFileView path="/Books/empty.playbook" versions={[]} />
    </div>
  ),
};
