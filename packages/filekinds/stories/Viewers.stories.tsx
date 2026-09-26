import type { Meta, StoryObj } from "@storybook/react-vite";
import { previewForPath } from "../src/lib/filePreviews";
import { BRIEF, BRIEF_WRITTEN, GUIDE, PAGE, PLAN, PLAYBOOK, SCRIPT, VIEWS, useFixtureFs } from "./fixtures";

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
export const Script: StoryObj = {
  name: "Script (the code and its variables; no runner here, so Run is disabled)",
  render: () => <View path="/Scripts/rebuild.script" content={SCRIPT} />,
};
export const Views: StoryObj = {
  name: "Views (one list — table, kanban, calendar, gantt, tree, page)",
  render: () => <View path="/Plans/launch.views" content={VIEWS} />,
};
export const Page: StoryObj = {
  name: "Page (a Nunjucks template and its model, rendered in the sandboxed frame)",
  render: () => <View path="/Pages/roster.page" content={PAGE} />,
};
export const PageFailed: StoryObj = {
  name: "Page (the engine's message in place of the page)",
  render: () => <View path="/Pages/broken.page" content={'template: "{% for p in people %}{{ p }}{% endfo %}"'} />,
};
