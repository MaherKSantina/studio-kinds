/** The flow kind: a walkthrough you walk — parameters on the rail, the
 *  screen's variant for that state, controls as buttons; the map; coverage. */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { previewForPath } from "../src/lib/filePreviews";
import { useFixtureFs } from "./fixtures";
import { BUYER_FLOW, ORG_FLOW } from "./frameFlowFixtures";

useFixtureFs();

function View({ path, content }: { path: string; content: string }) {
  const kind = previewForPath(path)!;
  return (
    <div style={{ height: "100vh" }}>
      <kind.Renderer content={content} height="100%" agentId={path} path={path} />
    </div>
  );
}

const meta: Meta = { title: "File kinds/Flow" };
export default meta;

export const Documents: StoryObj = {
  name: "States that are documents (two versions of one brief)",
  render: () => <View path="/Flows/org-structure.flow" content={ORG_FLOW} />,
};
export const Buyer: StoryObj = {
  name: "Buyer checkout (entries, dispatch, a screen-local radio, frame panels)",
  render: () => <View path="/Flows/buyer.flow" content={BUYER_FLOW} />,
};
export const Empty: StoryObj = {
  name: "Half-written file still renders",
  render: () => <View path="/Flows/new.flow" content={"title: Just a title\nscreens:\n  - {id: start, title: Start}\n"} />,
};
