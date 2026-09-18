import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DecisionPills } from "../src/components/DecisionPills";
import { SpaceDecision } from "../src/decisions/decisionSpace";

const DECISIONS: SpaceDecision[] = [
  {
    key: "entity", label: "Legal form", detail: "The root question — who carries what follows from it.",
    values: [
      { key: "none", label: "No entity" },
      { key: "pty", label: "Pty Ltd", activates: ["filings", "board", "bank"] },
    ],
  },
  { key: "filings", label: "Who owns filings", values: [
    { key: "nobody", label: "Nobody yet" },
    { key: "director", label: "One named director" },
    { key: "accountant", label: "Retained accountant" },
  ] },
  { key: "board", label: "Who sits on the board", values: [
    { key: "all", label: "All four of us" },
    { key: "sa", label: "SA-resident plus one" },
  ] },
  { key: "bank", label: "Bank account", values: [
    { key: "closed", label: "Not opened" },
    { key: "open", label: "Open", when: ["filings=director"], detail: "Only a named director can open one." },
  ] },
  { key: "agreement", label: "Partnership agreement", values: [
    { key: "drafted", label: "Drafted, not signed" },
    { key: "signed", label: "Signed by all four" },
  ] },
];

function Demo({ readOnly, size, initial }: { readOnly?: boolean; size?: "compact" | "regular"; initial?: string[] }) {
  const [value, setValue] = React.useState<string[]>(initial ?? []);
  return (
    <div className="mx-auto max-w-xl p-8">
      <DecisionPills decisions={DECISIONS} value={value} onChange={setValue} readOnly={readOnly} size={size} />
      <div className="mt-6 rounded-md border bg-muted/40 p-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">onChange emits the complete assignment:</p>
        <code className="text-xs">{JSON.stringify(value)}</code>
      </div>
    </div>
  );
}

const meta: Meta = { title: "Decisions/DecisionPills" };
export default meta;

export const Interactive: StoryObj = {
  name: "Interactive — pick Pty Ltd to activate the branch",
  render: () => <Demo />,
};
export const Answered: StoryObj = {
  render: () => <Demo initial={["entity=pty", "filings=director", "board=sa", "agreement=signed"]} />,
};
export const ReadOnly: StoryObj = {
  render: () => <Demo readOnly initial={["entity=pty", "filings=nobody"]} />,
};
export const Regular: StoryObj = {
  name: "Regular size",
  render: () => <Demo size="regular" initial={["entity=none"]} />,
};
