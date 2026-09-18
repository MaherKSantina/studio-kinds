import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import MemoryView from "../src/components/memory/MemoryView";
import { DESK_MEMORY, useFixtureFs } from "./fixtures";

useFixtureFs();

const meta: Meta = {
  title: "File kinds/Memory",
  parameters: {
    docs: {
      description: {
        component:
          "A `.memory` document is WORKING MEMORY over the flat node store — a saved query, " +
          "never a container. It declares `include` clauses (what counts as a unit), `decisions` " +
          "with derive rules (the retrieval cues; an answer can `activate` localized follow-up " +
          "decisions), and `locks` (the answers currently taken, saved in the file so attention " +
          "survives and an agent can steer it by editing the document). Answered decisions FILTER " +
          "the store, the first unanswered active decision GROUPS what's visible, and composite " +
          "nodes contribute their folded stream slices (`status.status`, `tags.platform`, …) as " +
          "selectable fields. The store may grow without limit; only the working set may not.",
      },
    },
  },
};
export default meta;

/** Pills persist through writeLocks: the story plays host and feeds the new
 *  text back in, exactly as a tool's autosave would. */
function EditableDesk() {
  const [text, setText] = useState(DESK_MEMORY);
  return <MemoryView content={text} onChange={setText} />;
}

export const Desk: StoryObj = {
  name: "Desk over the fixture store",
  render: () => (
    <div style={{ height: "100vh" }}>
      <EditableDesk />
    </div>
  ),
};

export const Narrowed: StoryObj = {
  name: "Answers taken (levels: shape → pipeline)",
  render: () => (
    <div style={{ height: "100vh" }}>
      <MemoryView content={`${DESK_MEMORY}\nlocks: [shape=node]\n`} />
    </div>
  ),
};
