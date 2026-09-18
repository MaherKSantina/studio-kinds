import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SidePanel } from "../src/components/SidePanel";

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[420px] overflow-hidden rounded-lg border">{children}</div>;
}

const railContent = (
  <div className="min-h-0 flex-1 overflow-y-auto p-3">
    <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Where we are</p>
    {Array.from({ length: 14 }, (_, i) => (
      <p key={i} className="mb-1.5 rounded-md border px-2 py-1 text-xs">Rail row {i + 1}</p>
    ))}
  </div>
);

const mainContent = (
  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
    main pane — drag the divider, or collapse it with the edge button
  </div>
);

const meta: Meta = { title: "Layout/SidePanel" };
export default meta;

export const Interactive: StoryObj = {
  name: "Interactive — drag the edge, collapse with the button",
  render: () => (
    <div className="p-6">
      <Frame>
        <SidePanel defaultWidth={280} minWidth={180} maxWidth={480} title="Where we are">
          {railContent}
        </SidePanel>
        {mainContent}
      </Frame>
    </div>
  ),
};

export const Collapsed: StoryObj = {
  render: () => {
    const [collapsed, setCollapsed] = React.useState(true);
    return (
      <div className="p-6">
        <Frame>
          <SidePanel defaultWidth={280} title="Where we are" collapsed={collapsed} onCollapsedChange={setCollapsed}>
            {railContent}
          </SidePanel>
          {mainContent}
        </Frame>
      </div>
    );
  },
};

export const RightSide: StoryObj = {
  name: "Right side (inspector position)",
  render: () => (
    <div className="p-6">
      <Frame>
        {mainContent}
        <SidePanel side="right" defaultWidth={260} title="Inspector">
          {railContent}
        </SidePanel>
      </Frame>
    </div>
  ),
};

export const Persistent: StoryObj = {
  name: "Persistent (storageKey) — width survives reloads",
  render: () => (
    <div className="p-6">
      <Frame>
        <SidePanel defaultWidth={280} storageKey="story-demo" title="Where we are">
          {railContent}
        </SidePanel>
        {mainContent}
      </Frame>
    </div>
  ),
};
