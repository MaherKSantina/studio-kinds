import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EventRow } from "../src/components/EventRow";
import { PaneTrail } from "../src/components/PaneTrail";

function Pane({ label, items, onDrill }: { label: string; items: string[]; onDrill?: (k: string) => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-1">
        {items.map((it) => (
          <EventRow key={it} label={it} onToggle={onDrill ? () => onDrill(it) : undefined} />
        ))}
      </div>
    </div>
  );
}

function Demo() {
  const [drill, setDrill] = React.useState<string[]>([]);
  const panes = [
    { key: "root", title: "Events", render: <Pane label="Events" items={["Fund the venture", "We incorporate"]} onDrill={(k) => setDrill([k])} /> },
    ...(drill.length >= 1 ? [{ key: drill[0], title: drill[0], render: <Pane label={drill[0] + " — steps"} items={["Record the loan", "Transfer the money"]} onDrill={(k) => setDrill([drill[0], k])} /> }] : []),
    ...(drill.length >= 2 ? [{ key: drill[1], title: drill[1], render: (
      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
        <p className="mb-1 font-semibold">{drill[1]}</p>
        <p className="text-muted-foreground">The deepest pane — drilled from the step. Use the dots (bottom center) to seek; the collapsed rail on the left steps back.</p>
      </div>
    ) }] : []),
  ];
  return (
    <div className="h-[420px] overflow-hidden rounded-lg border">
      <PaneTrail panes={panes} />
    </div>
  );
}

const meta: Meta = { title: "Layout/PaneTrail" };
export default meta;

export const DrillDown: StoryObj = {
  name: "Drill down — click rows to push panes",
  render: () => <div className="p-6"><Demo /></div>,
};
