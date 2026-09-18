import type { Meta, StoryObj } from "@storybook/react-vite";
import DataTableView from "../src/components/data/DataTableView";
import PolicyView from "../src/components/policy/PolicyView";
import MiddlewareView from "../src/components/middleware/MiddlewareView";
import CollectionView from "../src/components/collection/CollectionView";
import { STAYS_COLLECTION, STAYS_JSONL, STAYS_MIDDLEWARE, STAYS_POLICY, useFixtureFs } from "./fixtures";

useFixtureFs();

const meta: Meta = {
  title: "File kinds/Data",
  parameters: {
    docs: {
      description: {
        component:
          "`.jsonl` — data rows, one JSON object per line, as a table for LOOKING THROUGH: the " +
          "columns found from the rows (union of keys, first-seen order), one page of rows in the " +
          "DOM at a time, a search box over every field (every word must match), a header click to " +
          "sort, a row opened whole (links open outside and copy with a click). Directive lines " +
          "($sources, $policy, $title, $labels) compose the rows LIVE from other files through a table " +
          "policy (a .policy with role: table) — nothing cached. The policy is rules only; what the rows " +
          "are and how the headers read is said here, beside the data.",
      },
    },
  },
};
export default meta;

const CITIES = ["Sydney", "Narooma", "Tilba", "Bega", "Moruya", "Batemans Bay"];
const KINDS = ["stay", "drive", "meal", "beach", "shop"];
const ROWS = Array.from({ length: 1200 }, (_, i) => ({
  id: i + 1,
  day: `2026-10-0${1 + (i % 5)}`,
  kind: KINDS[i % KINDS.length],
  place: CITIES[(i * 7) % CITIES.length],
  amount: Math.round(((i * 37) % 900) + 12.5),
  booked: i % 3 === 0,
  ...(i % 11 === 0 ? { note: `row ${i + 1} has a note` } : {}),
  ...(i % 97 === 0 ? { tags: ["family", "kids"] } : {}),
}));
const TRIP = ROWS.map((r) => JSON.stringify(r)).join("\n");

export const Rows: StoryObj = {
  name: "1,200 rows — paged, searchable, sortable",
  render: () => <div style={{ height: "100vh" }}><DataTableView content={TRIP} path="/Narooma/events.jsonl" /></div>,
};

export const Composed: StoryObj = {
  name: "Composed — sources + a table policy, read live",
  render: () => <div style={{ height: "100vh" }}><DataTableView content={STAYS_JSONL} path="/Narooma/stays.jsonl" /></div>,
};

export const TablePolicy: StoryObj = {
  name: "The table policy it reads (role: table)",
  render: () => <div style={{ height: "80vh" }}><PolicyView content={STAYS_POLICY} path="/Narooma/stays.policy" /></div>,
};

export const Middleware: StoryObj = {
  name: "A middleware — rows amended on their way to a view",
  render: () => <div style={{ height: "100vh" }}><MiddlewareView content={STAYS_MIDDLEWARE} path="/Narooma/corrections.middleware" /></div>,
};

export const ComposedThroughMiddleware: StoryObj = {
  name: "Composed through the middleware — the chain read live",
  render: () => <div style={{ height: "100vh" }}><DataTableView content={STAYS_JSONL.replace("accommodation.json#properties", "corrections.middleware")} path="/Narooma/stays-corrected.jsonl" /></div>,
};

export const Collection: StoryObj = {
  name: "A collection — the gallery flow with decisions (in-memory, edits do not persist here)",
  render: () => <div style={{ height: "100vh" }}><CollectionView content={STAYS_COLLECTION} path="/Narooma/stays.collection" /></div>,
};

export const ComposedProblems: StoryObj = {
  name: "Composed — a source missing, a rule that names nothing",
  render: () => (
    <div style={{ height: "60vh" }}>
      <DataTableView content={'{"$sources": ["accommodation.json#properties", "ghost.json"], "$policy": "stays.policy"}\n{"name": "A raw line beside the directive", "sleeps": 2}\n'} path="/Narooma/odd.jsonl" />
    </div>
  ),
};

export const Problems: StoryObj = {
  name: "Bad lines reported, good rows shown",
  render: () => (
    <div style={{ height: "60vh" }}>
      <DataTableView content={'{"a": 1, "b": "x"}\noops\n{"a": 2}\n[1]\n'} path="/Narooma/partial.jsonl" />
    </div>
  ),
};

export const Nothing: StoryObj = {
  name: "Not rows at all — the text, with why",
  render: () => <div style={{ height: "40vh" }}><DataTableView content={"hello\nworld"} path="/Narooma/wrong.jsonl" /></div>,
};
