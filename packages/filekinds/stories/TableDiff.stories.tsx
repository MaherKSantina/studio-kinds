import type { Meta, StoryObj } from "@storybook/react-vite";
import TableDiffView from "../src/components/tablediff/TableDiffView";
import { useFixtureFs } from "./fixtures";

useFixtureFs();

const meta: Meta = {
  title: "File kinds/Table diff",
  parameters: {
    docs: {
      description: {
        component:
          "A `.tablediff` document compares TWO tables live, joined on declared key columns: " +
          "green rows exist only in the left (proposed) table, red rows only in the right " +
          "(base), amber cells carry a changed value as 'base → proposed'. Repeated keys pair " +
          "off in order (three 1-hour sessions against one 3-hour row = one changed pair plus " +
          "two additions). A lens, never a snapshot — it rereads its sources on every open.",
      },
    },
  },
};
export default meta;

const DOC = `title: Claimed vs billed (fixture)
description: "The fixture timesheet expansion (left) against the fixture billing (right), joined on Client + Service Date."
left: {handle: /Books/claimed.csv, label: Claimed}
right: {handle: /Books/billed.csv, label: Billed}
key: [Client, Service Date]
compare: [Duration, Charge]
`;

export const Diff: StoryObj = {
  name: "Two tables, joined and colored",
  render: () => (
    <div style={{ height: "100vh" }}>
      <TableDiffView content={DOC} path="/Books/claimed-vs-billed.tablediff" />
    </div>
  ),
};
