/** The frame kind: one screen laid out with flexbox, views as UI states,
 *  and an embed that fills another frame's slot. */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { previewForPath } from "../src/lib/filePreviews";
import { useFixtureFs } from "./fixtures";
import { DASHBOARD_FRAME, PHONE_FRAME, SCAFFOLD_FRAME } from "./frameFlowFixtures";

useFixtureFs();

function View({ path, content }: { path: string; content: string }) {
  const kind = previewForPath(path)!;
  return (
    <div style={{ height: "100vh" }}>
      <kind.Renderer content={content} height="100%" agentId={path} path={path} />
    </div>
  );
}

const meta: Meta = { title: "File kinds/Frame" };
export default meta;

export const Phone: StoryObj = {
  name: "Phone screen (scroll body, fixed bars, two views)",
  render: () => <View path="/Design/make-offer.frame" content={PHONE_FRAME} />,
};
export const Shell: StoryObj = {
  name: "App shell with a content slot",
  render: () => <View path="/Design/scaffold.frame" content={SCAFFOLD_FRAME} />,
};
export const Dashboard: StoryObj = {
  name: "Dashboard embedding the shell (slot injection)",
  render: () => <View path="/Design/dashboard.frame" content={DASHBOARD_FRAME} />,
};
export const Empty: StoryObj = {
  name: "Half-written file still renders",
  render: () => <View path="/Design/new.frame" content={"title: Just a title\nframes:\n  - {id: f1, name: F, width: 390, height: 300}\n"} />,
};
