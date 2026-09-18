import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EventRow } from "../src/components/EventRow";

const READY = "#15803d", GAP = "#dc2626", UNSEEN = "#a16207";

function Row(props: React.ComponentProps<typeof EventRow>) {
  const [open, setOpen] = React.useState(props.open ?? false);
  return <EventRow {...props} open={open} onToggle={() => setOpen((o) => !o)} />;
}

const meta: Meta = { title: "Events/EventRow" };
export default meta;

export const Gallery: StoryObj = {
  render: () => (
    <div className="mx-auto flex max-w-lg flex-col gap-1.5 p-6">
      <Row label="A bill arrives" trigger="imposed" repeats rate="1/mo"
        status={{ color: GAP, title: "no answer yet" }} />
      <Row label="We incorporate" trigger="chosen"
        status={{ color: READY, title: "we know what to do" }}
        detail="A separate legal person." />
      <Row label="Somebody objects to the name" trigger="imposed"
        status={{ color: UNSEEN, title: "nobody has looked" }}
        subtitle={<span className="italic text-warning">nobody has looked at this here</span>} />
      <Row label="We post something we did not make" trigger="chosen" repeats rate="20/d"
        status={{ color: READY }} />
      <Row label="Compare drift" trigger="chosen"
        status={{ color: "#6b7280" }}
        subtitle={<span className="font-bold" style={{ color: GAP }}>ready → gap</span>} />
    </div>
  ),
};

export const Expanded: StoryObj = {
  render: () => (
    <div className="mx-auto max-w-lg p-6">
      <EventRow label="Fund the venture" trigger="chosen" repeats rate="1/mo"
        status={{ color: READY, title: "we know what to do" }} open onToggle={() => {}}>
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          The expanded body is the host's — the playbook renders its one-file
          detail here, other hosts render whatever theirs is.
        </div>
      </EventRow>
    </div>
  ),
};

export const Minimal: StoryObj = {
  name: "Minimal (label only, not expandable)",
  render: () => (
    <div className="mx-auto max-w-lg p-6">
      <EventRow label="Just a thing that can happen" />
    </div>
  ),
};
