import type { Meta, StoryObj } from "@storybook/react-vite";
import { SplitNodeView } from "../src/components/SplitNodeView";
import { CompositeBoard } from "../src/components/composite/CompositeBoard";
import { parseSchemaDoc } from "../src/lib/schemaDoc";
import type { DocListItem } from "../src/lib/listDoc";
import { useFixtureFs } from "./fixtures";

useFixtureFs();

const meta: Meta = {
  title: "File kinds/Composite node",
  parameters: {
    docs: {
      description: {
        component:
          "A `type: composite` structured node — ONE entity assembled from STREAMS, split by who " +
          "authors each stream's changes. `schema.schema` declares the streams (stable ids + a " +
          "`driver`: observed = the world's pen, derived = my rules' pen, authored = my process's " +
          "pen) and `content.list` holds ARRIVALS — one row per piece of information, tagged " +
          "`stream:` and `at:`. The composed face folds arrivals per stream (later wins) and " +
          "judges freshness with the `stream-status` golden table: observed ages against its " +
          "cadence, derived goes stale when its input outruns it, authored is the primary record " +
          "and cannot go stale.",
      },
    },
  },
};
export default meta;

export const Node: StoryObj = {
  name: "One job ad, three streams (live node)",
  render: () => (
    <div style={{ height: "100vh" }}>
      <SplitNodeView path="/Books/lead.node" />
    </div>
  ),
};

/* Every status the table can hand out, pinned to a fixed "today" so the story
 * never drifts: fresh / aging / stale (observed), fresh / input-moved
 * (derived), current (authored), empty, untimed, untracked. */
const STATES_SCHEMA = parseSchemaDoc(`
type: composite
title: Every stream status
streams:
  - {id: synced, label: Synced today, driver: observed, source: Daily scrape, cadence: daily}
  - {id: missed, label: Missed one sync, driver: observed, source: Daily scrape, cadence: daily}
  - {id: dark, label: Gone dark, driver: observed, source: Daily scrape, cadence: daily}
  - {id: untimed, label: No cadence declared, driver: observed, source: Ad-hoc scrape}
  - {id: instep, label: Derivation in step, driver: derived, via: /Books/ranking.policy, of: synced}
  - {id: behind, label: Input moved, driver: derived, via: /Books/ranking.policy, of: dark}
  - {id: moves, label: Process record, driver: authored, via: /Books/apps.node}
  - {id: quiet, label: Nothing yet, driver: derived, via: /Books/ranking.policy, of: synced}
  - {id: nodriver, label: Driver undeclared}
`);

const NOW = "2026-09-03";
const STATES_ROWS: DocListItem[] = [
  { label: "Sync", fields: { stream: "synced", at: "2026-09-03", value: "current copy" } },
  { label: "Sync", fields: { stream: "missed", at: "2026-09-01", value: "yesterday's copy" } },
  { label: "Sync", fields: { stream: "dark", at: "2026-08-20", value: "two weeks old" } },
  { label: "Sync", fields: { stream: "untimed", at: "2026-08-28", value: "age visible, unjudged" } },
  { label: "Rules run", fields: { stream: "instep", at: "2026-09-03", of: "synced@2026-09-03", tag: "in step with its input" } },
  { label: "Rules run", fields: { stream: "behind", at: "2026-08-18", of: "dark@2026-08-18", tag: "derived before the last sync" } },
  { label: "Moved to triage", fields: { stream: "moves", at: "2026-08-25", status: "triage" } },
  { label: "Moved to ready", fields: { stream: "moves", at: "2026-09-01", status: "ready" } },
  { label: "Arrival", fields: { stream: "nodriver", at: "2026-09-03", note: "no semantics without a driver" } },
];

export const Statuses: StoryObj = {
  name: "The stream-status table, exhaustively",
  render: () => (
    <div style={{ height: "100vh" }}>
      <CompositeBoard schema={STATES_SCHEMA} rows={STATES_ROWS} now={NOW}
        onRow={() => {}} />
    </div>
  ),
};
