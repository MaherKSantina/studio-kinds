import type { Meta, StoryObj } from "@storybook/react-vite";
import { previewForPath } from "../src/lib/filePreviews";
import { POINTS, useFixtureFs } from "./fixtures";

useFixtureFs();

const meta: Meta = {
  title: "File kinds/Points",
  parameters: {
    docs: {
      description: {
        component:
          "The stream under every document: Literature → Distillation → Points as stages of one " +
          "PaneTrail. A point is identity first (stable id), keys later — each key a claim citing " +
          "its sources. Definitions declare empty slots; instances fill them; nothing is overridable.",
      },
    },
  },
};
export default meta;

export const Store: StoryObj = {
  name: "Literature → distillation → points",
  render: () => {
    const kind = previewForPath("/venture.points")!;
    return (
      <div style={{ height: "100vh" }}>
        <kind.Renderer content={POINTS} height="100%" agentId="/venture.points" path="/venture.points" />
      </div>
    );
  },
};
