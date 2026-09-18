import type { Meta, StoryObj } from "@storybook/react-vite";
import { SplitNodeView } from "../src/components/SplitNodeView";
import { useFixtureFs } from "./fixtures";

useFixtureFs();

const meta: Meta = {
  title: "File kinds/Structured node",
  parameters: {
    docs: {
      description: {
        component:
          "A `*.node` folder is a STRUCTURED NODE: one document split into a `schema` child " +
          "(the shape, with stable ids) and a `content` child (the data, referencing those ids). " +
          "Three faces: Structured is the composed join drawn by the schema's type (kanban schema " +
          "+ content list = the live board, mismatched refs land in an amber Unfiled column); " +
          "Schema and Content open each half through its own kind. Any node can be broken into " +
          "shape and data this way — each half stays an ordinary file.",
      },
    },
  },
};
export default meta;

export const Kanban: StoryObj = {
  name: "Kanban board (schema + content list)",
  render: () => (
    <div style={{ height: "100vh" }}>
      <SplitNodeView path="/Books/apps.node" />
    </div>
  ),
};
