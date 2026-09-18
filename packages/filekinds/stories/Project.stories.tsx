import type { Meta, StoryObj } from "@storybook/react-vite";
import { previewForPath } from "../src/lib/filePreviews";
import { PROJECT, useFixtureFs } from "./fixtures";

useFixtureFs();

const meta: Meta = {
  title: "File kinds/Project",
  parameters: {
    docs: {
      description: {
        component:
          "The project container: a tree of typed items (kind icons, no extensions) plus NODE " +
          "references shown as one item. File items open as their preview with an open-in-studio " +
          "button; a node reference opens a raw folder browser — extensions visible there, no " +
          "per-file preview by design.",
      },
    },
  },
};
export default meta;

export const Project: StoryObj = {
  name: "Items, kinds, and a node reference",
  render: () => {
    const kind = previewForPath("/projects/fixture.project")!;
    return (
      <div style={{ height: "100vh" }}>
        <kind.Renderer content={PROJECT} height="100%" agentId="/projects/fixture.project" path="/projects/fixture.project" />
      </div>
    );
  },
};
