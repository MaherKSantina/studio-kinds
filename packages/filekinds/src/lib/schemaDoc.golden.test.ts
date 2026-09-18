/** GOLDEN RULES for the schema half of a structured node — stable ids,
 *  per-type field defaults, and the composed join with unfiled rows. */
import { describe, expect, it } from "vitest";
import { contentByEntry, parseSchemaDoc, splitHalvesOf } from "./schemaDoc";
import type { DocListItem } from "./listDoc";

const KANBAN = parseSchemaDoc(`
type: kanban
title: Job applications
columns:
  - {id: triage, label: Triage, detail: "being analyzed"}
  - {id: ready, label: Ready to apply}
  - {id: applied, label: Applied}
  - {label: No id — dropped}
`);

describe("parseSchemaDoc", () => {
  it("kanban columns are the entries; ids are required, labels default to the id", () => {
    expect(KANBAN.type).toBe("kanban");
    expect(KANBAN.entries.map((e) => e.id)).toEqual(["triage", "ready", "applied"]);
    expect(KANBAN.entries[0].detail).toBe("being analyzed");
    expect(parseSchemaDoc("type: kanban\ncolumns:\n  - {id: x}\n").entries[0].label).toBe("x");
  });

  it("the referencing field defaults per type and can be overridden", () => {
    expect(KANBAN.field).toBe("column"); // kanban default
    expect(parseSchemaDoc("type: kanban\nfield: stage\ncolumns: []").field).toBe("stage");
    expect(parseSchemaDoc("type: gantt\nentries: []").field).toBe("ref"); // no default yet
  });

  it("generic `entries:` works for any type", () => {
    const g = parseSchemaDoc("type: gantt\nentries:\n  - {id: design, label: Design}\n");
    expect(g.entries).toEqual([{ id: "design", label: "Design" }]);
  });

  it("composite: streams: aliases entries:, field defaults to stream:, driver metadata rides each entry", () => {
    const c = parseSchemaDoc(`
type: composite
title: One job ad
streams:
  - {id: details, label: Job details, driver: observed, source: Indeed scrape, cadence: daily}
  - {id: tags, label: My tags, driver: derived, via: /Job Hunt/lead-ranking.policy, of: details}
`);
    expect(c.field).toBe("stream");
    expect(c.entries[0]).toEqual({
      id: "details", label: "Job details", driver: "observed", source: "Indeed scrape", cadence: "daily",
    });
    expect(c.entries[1].via).toBe("/Job Hunt/lead-ranking.policy");
    expect(c.entries[1].of).toBe("details");
  });
});

describe("contentByEntry", () => {
  const rows: DocListItem[] = [
    { label: "Aristocrat", fields: { column: "triage" } },
    { label: "NSWPF", fields: { column: "ready" } },
    { label: "SustainRecruit", fields: { column: "applied" } },
    { label: "Second triage", fields: { column: "triage" } },
    { label: "Typo'd", fields: { column: "aplied" } },
    { label: "No column", fields: { company: "X" } },
  ];

  it("groups rows under their entry in schema order; mismatches are unfiled, never dropped", () => {
    const { groups, unfiled } = contentByEntry(KANBAN, rows);
    expect(groups.map((g) => [g.entry.id, g.items.length])).toEqual([
      ["triage", 2], ["ready", 1], ["applied", 1],
    ]);
    expect(unfiled.map((r) => r.label)).toEqual(["Typo'd", "No column"]);
  });

  it("references match IDS, not labels", () => {
    const { unfiled } = contentByEntry(KANBAN, [{ label: "By label", fields: { column: "Triage" } }]);
    expect(unfiled).toHaveLength(1); // "Triage" is the label; the id is "triage"
  });
});

describe("splitHalvesOf", () => {
  it("finds the halves by STEM, any extension; missing halves are null", () => {
    expect(splitHalvesOf([
      { name: "schema.schema", kind: "file" },
      { name: "content.list", kind: "file" },
      { name: "notes.md", kind: "file" },
    ])).toEqual({ schema: "schema.schema", content: "content.list" });
    expect(splitHalvesOf([{ name: "schema", kind: "folder" }, { name: "content.list", kind: "file" }]))
      .toEqual({ schema: null, content: "content.list" }); // a folder is not a half
    expect(splitHalvesOf([])).toEqual({ schema: null, content: null });
  });
});
