import type { Meta, StoryObj } from "@storybook/react-vite";
import { previewForPath } from "../src/lib/filePreviews";
import { BRIEF, BRIEF_WRITTEN, GUIDE, PLAN, PLAYBOOK, useFixtureFs } from "./fixtures";

useFixtureFs();

function View({ path, content }: { path: string; content: string }) {
  const kind = previewForPath(path)!;
  return (
    <div style={{ height: "100vh" }}>
      <kind.Renderer content={content} height="100%" agentId={path} path={path} />
    </div>
  );
}

const meta: Meta = { title: "File kinds/Viewers" };
export default meta;

export const Playbook: StoryObj = {
  name: "Playbook (content beside the book, and written in it)",
  render: () => <View path="/Books/fixture.playbook" content={PLAYBOOK} />,
};
export const Brief: StoryObj = { render: () => <View path="/Books/overview.brief" content={BRIEF} /> };
export const BriefWritten: StoryObj = {
  name: "Brief (a playbook and a note written into its sections)",
  render: () => <View path="/Books/session.brief" content={BRIEF_WRITTEN} />,
};
export const Guide: StoryObj = { render: () => <View path="/Books/fund-the-venture.guide" content={GUIDE} /> };
export const Plan: StoryObj = { render: () => <View path="/Books/fixture.plan" content={PLAN} /> };
export const BriefEmpty: StoryObj = {
  name: "Brief (half-written file still renders)",
  render: () => <View path="/x.brief" content={"title: Just a title"} />,
};
