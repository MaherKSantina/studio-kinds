import { describe, expect, it } from "vitest";
import { dumpDocList, parseDocList } from "./listDoc";

const TYPED = `
title: ECR — classified norms
items:
  - label: "Regulation 2(1) — prohibits buying foreign currency"
    provision: "2(1)"
    norm_type: prohibition
    modality: must-not
    condition: "except with Treasury permission"
    penalty: ""
    refs: [{kind: subject_to, to: "9"}, {kind: cites, to: "1"}]
  - label: A plain row with no fields
  - file: docs/act.pdf
    label: A document row
    export: true
`;

describe("list doc typed fields", () => {
  const doc = parseDocList(TYPED);

  it("extra scalar keys become fields; refs become typed edges", () => {
    expect(doc.items[0].fields).toEqual({
      provision: "2(1)", norm_type: "prohibition", modality: "must-not",
      condition: "except with Treasury permission", penalty: "",
    });
    expect(doc.items[0].refs).toEqual([
      { kind: "subject_to", to: "9" }, { kind: "cites", to: "1" },
    ]);
    expect(doc.items[1].fields).toBeUndefined();
    expect(doc.items[2]).toEqual({ file: "docs/act.pdf", label: "A document row", export: true });
  });

  it("fields and refs round-trip through dump", () => {
    expect(parseDocList(dumpDocList(doc))).toEqual(doc);
  });
});

const ARRIVALS = `
title: Arrival rows
items:
  - label: Daily sync
    stream: details
    at: 2026-09-01
    title: Product Builder
  - title: Title as the row's name
    role: fallback
`;

describe("list doc label fallbacks and dates", () => {
  const doc = parseDocList(ARRIVALS);

  it("a bare ISO date survives as the string the author wrote, not a dropped Date", () => {
    expect(doc.items[0].fields?.at).toBe("2026-09-01");
  });

  it("title is a FIELD when the row has its own label, the label only when it stands in", () => {
    expect(doc.items[0].label).toBe("Daily sync");
    expect(doc.items[0].fields?.title).toBe("Product Builder");
    expect(doc.items[1].label).toBe("Title as the row's name");
    expect(doc.items[1].fields).toEqual({ role: "fallback" });
  });

  it("still round-trips through dump", () => {
    expect(parseDocList(dumpDocList(doc))).toEqual(doc);
  });
});
