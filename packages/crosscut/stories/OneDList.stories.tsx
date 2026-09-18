import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EventRow } from "../src/components/EventRow";
import { OneDList } from "../src/components/OneDList";

interface Ev { key: string; label: string; domain?: string; trigger: "imposed" | "chosen"; rate?: string; color: string }
const READY = "#15803d", GAP = "#dc2626", UNSEEN = "#a16207";

const ITEMS: Ev[] = [
  { key: "bill", label: "A bill arrives", domain: "Liability and compliance", trigger: "imposed", rate: "1/mo", color: GAP },
  { key: "surety", label: "A counterparty asks for a personal suretyship", domain: "Liability and compliance", trigger: "imposed", color: UNSEEN },
  { key: "invoice", label: "An invoice arrives", domain: "Money", trigger: "imposed", rate: "3/mo", color: READY },
  { key: "declined", label: "The card is declined", domain: "Money", trigger: "imposed", rate: "1/mo", color: READY },
  { key: "fund", label: "Fund the venture", domain: "Money", trigger: "chosen", rate: "1/mo", color: READY },
  { key: "incorporate", label: "We incorporate", trigger: "chosen", color: UNSEEN },
];

const row = (e: Ev) => (
  <EventRow label={e.label} trigger={e.trigger} repeats={!!e.rate} rate={e.rate}
    status={{ color: e.color }} />
);

const meta: Meta = { title: "Lists/OneDList" };
export default meta;

export const UpgradePath: StoryObj = {
  name: "The upgrade path — same items, one prop apart",
  render: () => (
    <div className="mx-auto grid max-w-6xl grid-cols-3 gap-6 p-6">
      <div>
        <p className="mb-1 text-xs font-semibold">Flat</p>
        <code className="mb-2 block text-[10px] text-muted-foreground">{"<OneDList items ... />"}</code>
        <OneDList items={ITEMS} keyOf={(e) => e.key} renderItem={row} />
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold">Grouped headings</p>
        <code className="mb-2 block text-[10px] text-muted-foreground">{'+ dimension={{of}} mode="headings"'}</code>
        <OneDList items={ITEMS} keyOf={(e) => e.key} renderItem={row}
          dimension={{ of: (e) => e.domain ?? "" }} mode="headings" />
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold">Filter pills</p>
        <code className="mb-2 block text-[10px] text-muted-foreground">{'+ dimension={{of}} mode="filter"'}</code>
        <OneDList items={ITEMS} keyOf={(e) => e.key} renderItem={row}
          dimension={{ of: (e) => e.domain ?? "" }} mode="filter" />
      </div>
    </div>
  ),
};

export const FilterInteractive: StoryObj = {
  name: "Filter mode — pills select a group",
  render: () => (
    <div className="mx-auto max-w-md p-6">
      <OneDList items={ITEMS} keyOf={(e) => e.key} renderItem={row}
        dimension={{ of: (e) => e.domain ?? "" }} mode="filter" />
      <p className="mt-4 text-[10px] text-muted-foreground">
        Keyless items (We incorporate) land in the fallback group — grouped means nothing sits outside a group.
      </p>
    </div>
  ),
};

export const FuzzySearch: StoryObj = {
  name: "Fuzzy search — local, instant, all modes",
  render: () => (
    <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 p-6">
      <div>
        <p className="mb-1 text-xs font-semibold">Grouped + search</p>
        <code className="mb-2 block text-[10px] text-muted-foreground">{"+ search={(e) => e.label}"}</code>
        <OneDList items={ITEMS} keyOf={(e) => e.key} renderItem={row}
          dimension={{ of: (e) => e.domain ?? "" }} mode="headings"
          search={(e) => e.label} searchPlaceholder="Try: bil arr" />
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold">Filter pills + search (they compose)</p>
        <code className="mb-2 block text-[10px] text-muted-foreground">{'mode="filter" search={(e) => e.label}'}</code>
        <OneDList items={ITEMS} keyOf={(e) => e.key} renderItem={row}
          dimension={{ of: (e) => e.domain ?? "" }} mode="filter"
          search={(e) => e.label} searchPlaceholder="Counts follow the matches" />
      </div>
    </div>
  ),
};

export const EmptyState: StoryObj = {
  render: () => (
    <div className="mx-auto max-w-md p-6">
      <OneDList items={[] as Ev[]} keyOf={(e) => e.key} renderItem={row}
        empty={<p className="text-sm text-muted-foreground">Nothing can happen here yet.</p>} />
    </div>
  ),
};
