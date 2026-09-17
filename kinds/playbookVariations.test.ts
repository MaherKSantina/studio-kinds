import { describe, expect, it } from "vitest";
import {
  byEntries, contentKey, contentPath, contentText, dumpPlaybook, inlineEntries, inlineProblems, isInline,
  legacyProblems, parsePlaybook, variationKeys, variationOf, variationProblems, variationsOf, versionProblems,
  writtenDoc, writtenDocs, PLAYBOOK_LATEST,
} from "./playbookDoc";
import { fileTemplate } from "./fileTemplates";

const TEXT = `title: t
decisions:
  - key: entity
    label: Entity
    values: [{key: none, label: None}, {key: company, label: Company}]
  - key: sender
    label: Sender
    values: [{key: customer, label: C}, {key: partner, label: P}]
events:
  - key: fund
    label: Fund
    trigger: imposed
    content: [{file: funding.playbook, by: [entity, sender]}]
topics:
  - key: money
    label: Money
    content: [{file: money.playbook, by: [entity]}, {file: notes.md}]
`;

describe("content chosen by answers", () => {
  const doc = parsePlaybook(TEXT);

  it("parses and dumps `content` on events and topics, with `by`", () => {
    expect(doc.events[0].content?.[0].by).toEqual(["entity", "sender"]);
    expect(doc.topics[0].content.map((c) => c.file)).toEqual(["money.playbook", "notes.md"]);
    const again = parsePlaybook(dumpPlaybook(doc));
    expect(again.events[0].content?.[0].by).toEqual(["entity", "sender"]);
    expect(again.topics[0].content[0].by).toEqual(["entity"]);
  });

  it("resolves the file from the answers, segments in `by` order", () => {
    expect(variationOf(doc.events[0].content![0], ["sender=partner", "entity=company"]))
      .toEqual({ file: "funding.playbook.variants/entity=company,sender=partner.playbook", missing: [], segs: ["entity=company", "sender=partner"] });
  });

  it("names the decisions still unanswered", () => {
    expect(variationOf(doc.events[0].content![0], ["entity=none"]).missing).toEqual(["sender"]);
  });

  it("a plain entry is itself", () => {
    expect(variationOf({ file: "notes.md" }, ["entity=none"])).toEqual({ file: "notes.md", missing: [], segs: [] });
  });

  it("a variation keeps the base's extension — a brief varies into briefs", () => {
    expect(variationOf({ file: "release/steps.brief", by: ["push"] }, ["push=yes"]))
      .toEqual({ file: "release/steps.brief.variants/push=yes.brief", missing: [], segs: ["push=yes"] });
    expect(variationOf({ file: "notes.md", by: ["entity"] }, ["entity=none"]).file).toBe("notes.md.variants/entity=none.md");
  });

  it("lists the closed set", () => {
    expect(variationsOf(doc, doc.events[0].content![0])).toEqual([
      "funding.playbook.variants/entity=none,sender=customer.playbook",
      "funding.playbook.variants/entity=none,sender=partner.playbook",
      "funding.playbook.variants/entity=company,sender=customer.playbook",
      "funding.playbook.variants/entity=company,sender=partner.playbook",
    ]);
    expect(byEntries(doc).map((x) => x.where)).toEqual(["event fund", "topic money"]);
  });

  it("flags a `by` decision this book does not have", () => {
    expect(variationProblems(doc)).toEqual([]);
    const bad = parsePlaybook(TEXT.replace("by: [entity, sender]", "by: [entity, nope]"));
    expect(variationProblems(bad)).toEqual(["event fund: `by` names nope, which is not a decision of this book"]);
  });

  it("names the keys the format no longer has", () => {
    const old = `title: t
topics:
  - key: a
    label: A
    variants: [{content: [{file: x.md}]}]
library:
  - {file: g.guide, for: fund}
compare:
  - {key: c, label: C, locks: []}
view: {against: c}
`;
    expect(legacyProblems(old).length).toBe(4);
    expect(legacyProblems(TEXT)).toEqual([]);
  });

  it("names materials, scales and thresholds as gone, and the parser drops them", () => {
    const old = `title: t
scales:
  - {key: risk, label: Risk, values: [low, high]}
materials:
  - {key: m, label: Insurance, mitigates: [{file: x.guide, ref: injury=sue, key: risk, op: ">=", weight: 50}]}
view: {thresholds: {risk: 50}}
`;
    const problems = legacyProblems(old);
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/materials/);
    const doc = parsePlaybook(old) as unknown as Record<string, unknown>;
    expect("materials" in doc).toBe(false);
    expect("scales" in doc).toBe(false);
    expect("thresholds" in (doc.view as object)).toBe(false);
    expect(dumpPlaybook(parsePlaybook(old))).not.toMatch(/materials|scales|thresholds/);
    // Each key alone is enough to be told.
    expect(legacyProblems("title: t\nview: {thresholds: {risk: 1}}\n").length).toBe(1);
    expect(legacyProblems("title: t\nscales: [{key: r, values: [a, b]}]\n").length).toBe(1);
  });
});

describe("content written in the book", () => {
  const INLINE = `version: 2
title: t
decisions:
  - key: entity
    label: Entity
    values: [{key: none, label: None}, {key: company, label: Company}]
events:
  - key: incorporate
    label: Incorporate
    trigger: chosen
    content:
      - kind: brief
        label: The steps
        doc:
          title: Steps
          sections:
            - {title: Pick a name, body: Short.}
      - {file: notes.md}
      - kind: md
        key: why
        doc: |
          # Why
          Because.
`;
  const doc = parsePlaybook(INLINE);
  const content = doc.events[0].content ?? [];

  it("parses inline entries beside file entries, keeping each shape", () => {
    expect(content.length).toBe(3);
    expect(isInline(content[0])).toBe(true);
    expect(content[0].kind).toBe("brief");
    expect((content[0].doc as { title: string }).title).toBe("Steps");
    expect(isInline(content[1])).toBe(false);
    expect(content[1].file).toBe("notes.md");
    expect(content[2].key).toBe("why");
    expect(typeof content[2].doc).toBe("string");
  });

  it("names, paths and text: what the view and the renderer take", () => {
    expect(contentKey(content[0], "event incorporate/0")).toBe("the-steps");
    expect(contentKey(content[1], "event incorporate/1")).toBe("notes.md");
    expect(contentKey(content[2], "event incorporate/2")).toBe("why");
    expect(contentKey({ kind: "md", doc: "x" }, "event e/4")).toBe("event e/4");
    // A key names the entry before anything else does — a file entry included.
    expect(contentKey({ key: "k", file: "a.md", label: "A" })).toBe("k");
    expect(contentKey({ file: "a.md", label: "A" })).toBe("a.md");
    expect(contentPath(content[0])).toBe("inline.brief");
    expect(contentPath(content[1])).toBe("notes.md");
    expect(contentText(content[0])).toContain("title: Steps");
    expect(contentText(content[2])).toBe("# Why\nBecause.\n");
  });

  it("round-trips through dump: inline stays inline, a file stays a file", () => {
    const again = parsePlaybook(dumpPlaybook(doc));
    expect(again.events[0].content).toEqual(content);
    expect(dumpPlaybook(doc)).not.toMatch(/file: inline/);
  });

  it("is itself under any answers and expects no sibling files", () => {
    expect(variationOf(content[0], ["entity=none"])).toEqual({ file: "", missing: [], segs: [] });
    expect(variationsOf(doc, content[0])).toEqual([]);
    expect(byEntries(doc).length).toBe(0);
    expect(inlineEntries(doc).map((x) => x.where)).toEqual(["event incorporate", "event incorporate"]);
    expect(inlineProblems(doc)).toEqual([]);
  });

  it("names what an inline entry cannot be: no kind, a file as well, a `by`", () => {
    const bad = parsePlaybook(`version: 2
title: t
decisions:
  - key: entity
    label: Entity
    values: [{key: none, label: None}]
events:
  - key: e
    label: E
    trigger: imposed
    content:
      - {label: A, doc: {title: x}}
      - {kind: brief, file: a.brief, label: B, doc: {title: x}}
      - {kind: brief, label: C, by: [entity], doc: {title: x}}
      - {label: dropped}
`);
    expect(bad.events[0].content?.length).toBe(3);
    const problems = inlineProblems(bad);
    expect(problems.length).toBe(3);
    expect(problems[0]).toMatch(/A has `doc` but no `kind`/);
    expect(problems[1]).toMatch(/B has both `file` and `doc`/);
    expect(problems[2]).toMatch(/C is one document, so it cannot vary `by`/);
  });
});

describe("a closed set written in the book", () => {
  const SET = `version: 2
title: t
decisions:
  - key: entity
    label: Entity
    values: [{key: none, label: None}, {key: company, label: Company}]
  - key: sender
    label: Sender
    values: [{key: customer, label: C}, {key: partner, label: P}]
events:
  - key: fund
    label: Fund
    trigger: imposed
    content:
      - key: where
        label: Where it lands
        kind: md
        by: [entity, sender]
        docs:
          entity=none,sender=customer: Personal account.
          entity=none,sender=partner: Personal account, note it.
          entity=company,sender=customer: Company account.
          entity=company,sender=partner: Company account, invoice first.
      - kind: brief
        by: [entity]
        docs:
          entity=none: {title: Nothing to file}
          entity=company: {title: File the return, sections: [{title: When, body: Yearly.}]}
`;
  const doc = parsePlaybook(SET);
  const [where, brief] = doc.events[0].content ?? [];

  it("parses `docs` keyed by the `by` segments, and dumps it back the same", () => {
    expect(isInline(where)).toBe(true);
    expect(where.by).toEqual(["entity", "sender"]);
    expect(Object.keys(where.docs ?? {}).length).toBe(4);
    const again = parsePlaybook(dumpPlaybook(doc));
    expect(again.events[0].content).toEqual(doc.events[0].content);
    expect(dumpPlaybook(doc)).toMatch(/kind: md\n\s+by:\n/);
  });

  it("the answers pick the member, segments in `by` order", () => {
    expect(variationOf(where, ["sender=partner", "entity=company"])).toEqual({ file: "", missing: [], segs: ["entity=company", "sender=partner"] });
    expect(writtenDoc(where, ["entity=company", "sender=partner"])).toBe("Company account, invoice first.");
    expect(contentText(where, ["entity=none", "sender=customer"])).toBe("Personal account.");
    expect(contentText(brief, ["entity=company"])).toMatch(/^title: File the return/);
    expect(variationOf(where, ["entity=none"]).missing).toEqual(["sender"]);
    expect(writtenDocs(brief).map((x) => x.at)).toEqual(["entity=none", "entity=company"]);
  });

  it("is a `by` entry with no files: the closed set is keys, not paths", () => {
    expect(byEntries(doc).map((x) => x.entry.key ?? x.entry.kind)).toEqual(["where", "brief"]);
    expect(variationsOf(doc, where)).toEqual([]);
    expect(variationKeys(doc, brief)).toEqual(["entity=none", "entity=company"]);
    expect(variationProblems(doc)).toEqual([]);
    expect(inlineProblems(doc)).toEqual([]);
  });

  it("names a set that is not closed, a key that is not a combination, `docs` without `by`, and an `md` that is not text", () => {
    const bad = parsePlaybook(`version: 2
title: t
decisions:
  - key: entity
    label: Entity
    values: [{key: none, label: None}, {key: company, label: Company}]
events:
  - key: e
    label: E
    trigger: imposed
    content:
      - {kind: md, label: Short, by: [entity], docs: {entity=none: x, entity=nope: y}}
      - {kind: md, label: Keyless, docs: {entity=none: x}}
      - {kind: md, label: Both, by: [entity], doc: x, docs: {entity=none: x, entity=company: y}}
      - {kind: md, label: Map, doc: {title: not text}}
      - {kind: md, label: Maps, by: [entity], docs: {entity=none: {a: 1}, entity=company: ok}}
`);
    const problems = inlineProblems(bad);
    expect(problems).toEqual([
      "event e: Short: docs has no `entity=company` — every answer combination of `by` is a document of its own",
      "event e: Short: docs has `entity=nope`, which is not a combination of entity answers in `by` order",
      "event e: Keyless has `docs` but no `by` — say which decisions key the documents",
      "event e: Both has both `doc` and `docs` — one document, or one per answer combination",
      "event e: Both is one document, so it cannot vary `by` — write one per answer combination under `docs`, or make it a file",
      "event e: Map: an `md` document is its text — write it as a block string",
      "event e: Maps [entity=none]: an `md` document is its text — write it as a block string",
    ]);
  });

  it("is dropped by version 1 like any written entry, and named", () => {
    const v1 = SET.replace(/^version: 2\n/, "");
    expect(parsePlaybook(v1).events[0].content).toBeUndefined();
    expect(versionProblems(v1).length).toBe(2);
    expect(versionProblems(v1)[0]).toMatch(/Where it lands is written in the book/);
  });
});

describe("versions", () => {
  const V1 = `title: t
events:
  - key: e
    label: E
    trigger: imposed
    content:
      - {file: notes.md, label: Notes}
      - {kind: brief, label: Written, doc: {title: x}}
`;

  it("no version means 1, and a version-1 file writes no version line", () => {
    const doc = parsePlaybook("title: t\n");
    expect(doc.version).toBe(1);
    expect(dumpPlaybook(doc)).not.toMatch(/^version:/m);
    expect(parsePlaybook(`version: 2\ntitle: t\n`).version).toBe(2);
    expect(dumpPlaybook(parsePlaybook(`version: 2\ntitle: t\n`))).toMatch(/^version: 2\n/);
  });

  it("version 1 drops written-here content and the checker says why", () => {
    const doc = parsePlaybook(V1);
    expect(doc.events[0].content?.map((c) => c.file)).toEqual(["notes.md"]);
    const problems = versionProblems(V1);
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/event e: Written is written in the book — version 1 has no such thing; add `version: 2`/);
    expect(versionProblems(`version: 2\n${V1}`)).toEqual([]);
    expect(parsePlaybook(`version: 2\n${V1}`).events[0].content?.length).toBe(2);
  });

  it("a version-1 book is the same book at version 2", () => {
    const one = parsePlaybook(`title: t\nevents:\n  - {key: e, label: E, trigger: imposed, content: [{file: a.md, by: [x]}]}\n`);
    const two = parsePlaybook(`version: 2\ntitle: t\nevents:\n  - {key: e, label: E, trigger: imposed, content: [{file: a.md, by: [x]}]}\n`);
    expect({ ...two, version: 1 }).toEqual(one);
  });

  it("an unknown version is named and read as the latest", () => {
    expect(parsePlaybook(`version: 9\ntitle: t\n`).version).toBe(PLAYBOOK_LATEST);
    expect(versionProblems(`version: 9\ntitle: t\n`)[0]).toMatch(/knows playbook up to version 2/);
    expect(versionProblems(`version: two\ntitle: t\n`)[0]).toMatch(/not a whole number/);
    expect(versionProblems(`version: 1.5\ntitle: t\n`)[0]).toMatch(/not a whole number/);
  });

  it("a new playbook starts at the latest version", () => {
    expect(fileTemplate("x.playbook", "x")).toMatch(/^version: 2\n/);
    expect(parsePlaybook(fileTemplate("x.playbook", "x")).version).toBe(2);
  });
});
