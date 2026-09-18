import type { Meta, StoryObj } from "@storybook/react-vite";
import SchemaView from "../src/components/schema/SchemaView";
import { useFixtureFs } from "./fixtures";

useFixtureFs();

const meta: Meta = {
  title: "File kinds/Schema",
  parameters: {
    docs: {
      description: {
        component:
          "The SHAPE half of a structured node (`*.node` folder): a `type` (which view draws it) " +
          "plus entries with STABLE IDS the content half references (`field:`, kanban defaults to " +
          "`column`). Relabel entries freely — renaming an id orphans every row referencing it. " +
          "A kanban schema reads as the column pipeline; types without a dedicated view render " +
          "their entries generically.",
      },
    },
  },
};
export default meta;

const KANBAN = `type: kanban
title: Job applications
columns:
  - {id: triage, label: Triage, detail: "being analyzed"}
  - {id: ready, label: Ready to apply}
  - {id: applied, label: Applied}
  - {id: outcome, label: Outcome}
`;

export const Kanban: StoryObj = {
  name: "Kanban — the column pipeline",
  render: () => (
    <div style={{ height: 320 }}>
      <SchemaView content={KANBAN} path="/Books/apps.node/schema.schema" />
    </div>
  ),
};

export const Unknown: StoryObj = {
  name: "Unknown type — the shape is still the contract",
  render: () => (
    <div style={{ height: 320 }}>
      <SchemaView path="/x/schema.schema"
        content={"type: gantt\ntitle: Build plan\nentries:\n  - {id: design, label: Design}\n  - {id: build, label: Build}\n"} />
    </div>
  ),
};
