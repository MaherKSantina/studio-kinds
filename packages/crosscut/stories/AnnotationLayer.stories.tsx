import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Annotation } from "../src/annotations/annotations";
import { AnnotationProvider } from "../src/components/AnnotationLayer";
import { DecisionPills } from "../src/components/DecisionPills";
import { EventRow } from "../src/components/EventRow";
import { Button } from "../src/components/ui/button";

const NOTES: Annotation[] = [
  { target: "event:bill", title: "Why this one is red", body: "Nobody has written the response yet.\n\nThe rule exists; the process line is empty.", items: ["Draft the response", "Attach the ledger step"] },
  { target: "answer:entity=pty", title: "The hinge answer", body: "Everything below exists because of this." },
];

function Demo() {
  const [active, setActive] = React.useState(true);
  const [value, setValue] = React.useState<string[]>([]);
  return (
    <div className="mx-auto max-w-xl p-6">
      <Button size="sm" variant={active ? "default" : "outline"} onClick={() => setActive((v) => !v)} className="mb-3">
        {active ? "Annotations on" : "Annotations off"}
      </Button>
      <div className="h-[360px] overflow-hidden rounded-lg border">
        <AnnotationProvider annotations={NOTES} active={active}>
          <div className="space-y-3 p-4">
            <DecisionPills
              decisions={[{ key: "entity", label: "Legal form", values: [
                { key: "none", label: "No entity" }, { key: "pty", label: "Pty Ltd" }] }]}
              value={value} onChange={setValue} />
            <div className="flex flex-col gap-1">
              <EventRow label="A bill arrives" trigger="imposed" repeats rate="1/mo"
                status={{ color: "#dc2626" }} annotateTarget="event:bill" onToggle={() => alert("navigated!")} />
              <EventRow label="We incorporate" trigger="chosen"
                status={{ color: "#15803d" }} annotateTarget="event:incorporate" onToggle={() => alert("navigated!")} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              With the overlay on, only annotated items respond — and they open the note, never the control.
            </p>
          </div>
        </AnnotationProvider>
      </div>
    </div>
  );
}

const meta: Meta = { title: "Annotations/AnnotationLayer" };
export default meta;

export const Overlay: StoryObj = { render: () => <Demo /> };
