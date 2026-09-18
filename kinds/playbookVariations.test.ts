import { describe, expect, it } from "vitest";
import { PLAYBOOK_LATEST, byEntries, contentKey, contentPath, contentText, dumpPlaybook, eventsAt, inlineEntries, inlineProblems, isInline, legacyProblems, parsePlaybook, ruleFor, variationKeys, variationOf, variationProblems, variationsOf, versionProblems, writtenDoc, writtenDocs } from "./playbookDoc";
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
    expect(legacyProblems("title: t\nview: {tab: walk}\n")).toEqual(["`view.tab` is gone — the walk is the only view"]);
  });
});

describe("version 2 — decisions, events and rules; one document per event, written in the book; session-only", () => {
  const V2 = `version: 2
title: t
decisions:
  - key: entity
    label: Entity
    values: [{key: company, label: Company}, {key: partnership, label: Partnership}]
events:
  - key: incorporate
    label: Incorporate
    trigger: chosen
    detail: A door once the answer is company.
    content:
      key: steps
      label: The steps
      kind: brief
      doc:
        title: Steps
        sections:
          - {title: Unanswered, body: Ask.}
          - {title: As a company, body: Reserve the name.}
          - {title: As a partnership, body: Sign the deed.}
  - key: paid
    label: Paid
    trigger: imposed
    content:
      kind: md
      doc: |
        # Where it lands
        The business account.
  - key: bare
    label: Bare
    trigger: imposed
rules:
  - event: incorporate
    when: [entity=partnership]
    status: n/a
  - event: incorporate
    when: [entity=company]
    status: ready
    sets: [entity=company]
  - event: incorporate
    status: gap
  - event: paid
    status: ready
    process: Have the invoice ready.
`;
  const doc = parsePlaybook(V2);
  const [steps] = doc.events[0].content ?? [];
  const [where] = doc.events[1].content ?? [];

  it("reads decisions and rules as at version 1, one written document per event, and no view", () => {
    expect(doc.version).toBe(2);
    expect(doc.decisions.map((d) => d.key)).toEqual(["entity"]);
    expect(doc.events.map((e) => e.content?.length ?? 0)).toEqual([1, 1, 0]);
    expect(isInline(steps)).toBe(true);
    expect(steps).toEqual({ key: "steps", label: "The steps", kind: "brief", doc: { title: "Steps", sections: [
      { title: "Unanswered", body: "Ask." }, { title: "As a company", body: "Reserve the name." }, { title: "As a partnership", body: "Sign the deed." },
    ] } });
    expect(typeof where.doc).toBe("string");
    expect(doc.topics).toEqual([]);
    expect(doc.view).toEqual({});
    expect(doc.rules[1]).toEqual({ event: "incorporate", when: ["entity=company"], status: "ready", sets: ["entity=company"] });
    expect(versionProblems(V2)).toEqual([]);
    expect(inlineProblems(doc)).toEqual([]);
    expect(variationProblems(doc)).toEqual([]);
  });

  it("the answers drive the rules on screen: every decision opens unanswered", () => {
    expect(ruleFor(doc, "incorporate", [])?.status).toBe("gap");
    expect(ruleFor(doc, "incorporate", ["entity=company"])?.sets).toEqual(["entity=company"]);
    expect(eventsAt(doc, ["entity=partnership"]).map((e) => e.key)).toEqual(["paid", "bare"]);
    expect(eventsAt(doc, []).map((e) => e.key).sort()).toEqual(["bare", "incorporate", "paid"]);
  });

  it("names, paths and text: what the view and the renderer take", () => {
    expect(contentKey(steps, "event incorporate/0")).toBe("steps");
    expect(contentKey(where, "event paid/0")).toBe("event paid/0");
    expect(contentKey({ kind: "md", doc: "x", label: "A note" }, "event e/0")).toBe("a-note");
    // A key names the entry before anything else does — a version-1 file entry included.
    expect(contentKey({ key: "k", file: "a.md", label: "A" })).toBe("k");
    expect(contentKey({ file: "a.md", label: "A" })).toBe("a.md");
    expect(contentPath(steps)).toBe("inline.brief");
    expect(contentPath({ kind: "playbook", doc: {} })).toBe("inline.playbook");
    expect(contentPath({ file: "notes.md" })).toBe("notes.md");
    expect(contentText(steps)).toMatch(/^title: Steps\n/);
    expect(contentText(where)).toBe("# Where it lands\nThe business account.\n");
  });

  it("round-trips through dump: a mapping in, a mapping out, decisions kept, no view or topics written", () => {
    const text = dumpPlaybook(doc);
    expect(text).toMatch(/^version: 2\n/);
    expect(text).toMatch(/^decisions:\n  - key: entity\n/m);
    expect(text).not.toMatch(/^topics:|^view:|file:|docs:|by:/m);
    expect(text).toMatch(/    content:\n      key: steps\n      label: The steps\n      kind: brief\n      doc:\n/);
    expect(parsePlaybook(text)).toEqual(doc);
    // A view set in memory is never written for a version-2 book.
    expect(dumpPlaybook({ ...doc, view: { locks: ["entity=company"], collapsed: ["steps"] } })).not.toMatch(/view:/);
  });

  it("is itself under any answers and expects no sibling files", () => {
    expect(variationOf(steps, ["entity=company"])).toEqual({ file: "", missing: [], segs: [] });
    expect(variationsOf(doc, steps)).toEqual([]);
    expect(byEntries(doc).length).toBe(0);
    expect(inlineEntries(doc).map((x) => x.where)).toEqual(["event incorporate", "event paid"]);
  });

  it("a written set follows the answer: one document per combination, keyed in `by` order", () => {
    const SET = `version: 2
title: t
decisions:
  - key: push
    label: Push?
    values: [{key: yes, label: Yes}, {key: no, label: No}]
  - key: tag
    label: Tag?
    values: [{key: yes, label: Yes}, {key: no, label: No}]
events:
  - key: always
    label: Always
    trigger: imposed
    content:
      key: steps
      kind: md
      by: [push, tag]
      docs:
        push=yes,tag=yes: Push, then tag.
        push=yes,tag=no: Push.
        push=no,tag=yes: Tag only.
        push=no,tag=no: Nothing leaves the machine.
  - key: brief
    label: Brief
    trigger: imposed
    content:
      kind: brief
      by: [push]
      docs:
        push=yes: {title: Push and release, sections: [{title: Commit, body: Stage what changed.}]}
        push=no: {title: Nothing leaves}
rules:
  - {event: always, status: gap, process: Ask whether to push.}
`;
    const set = parsePlaybook(SET);
    const [steps] = set.events[0].content ?? [];
    const [brief] = set.events[1].content ?? [];
    expect(isInline(steps)).toBe(true);
    expect(steps.by).toEqual(["push", "tag"]);
    expect(Object.keys(steps.docs ?? {}).length).toBe(4);
    expect(variationOf(steps, ["tag=no", "push=yes"])).toEqual({ file: "", missing: [], segs: ["push=yes", "tag=no"] });
    expect(variationOf(steps, ["push=no"]).missing).toEqual(["tag"]);
    expect(variationOf(steps, []).missing).toEqual(["push", "tag"]);
    expect(writtenDoc(steps, ["push=yes", "tag=no"])).toBe("Push.");
    expect(contentText(steps, ["push=no", "tag=no"])).toBe("Nothing leaves the machine.");
    expect(contentText(brief, ["push=yes"])).toMatch(/^title: Push and release/);
    expect(writtenDocs(brief).map((x) => x.at)).toEqual(["push=yes", "push=no"]);
    expect(variationKeys(set, steps)).toEqual(["push=yes,tag=yes", "push=yes,tag=no", "push=no,tag=yes", "push=no,tag=no"]);
    expect(variationsOf(set, steps)).toEqual([]);
    expect(byEntries(set).map((x) => x.entry.key ?? x.entry.kind)).toEqual(["steps", "brief"]);
    expect(inlineProblems(set)).toEqual([]);
    expect(versionProblems(SET)).toEqual([]);
    const again = parsePlaybook(dumpPlaybook(set));
    expect(again.events[0].content).toEqual(set.events[0].content);
    expect(dumpPlaybook(set)).toMatch(/      kind: md\n      by:\n/);
  });

  it("names a set that is not closed, a key that is not a combination, `docs` without `by`, both forms, `by` on a `doc`, and an `md` that is not text", () => {
    const bad = parsePlaybook(`version: 2
title: t
decisions:
  - key: entity
    label: Entity
    values: [{key: none, label: None}, {key: company, label: Company}]
events:
  - {key: a, label: A, trigger: imposed, content: {kind: md, label: Short, by: [entity], docs: {entity=none: x, entity=nope: y}}}
  - {key: b, label: B, trigger: imposed, content: {kind: md, label: Keyless, docs: {entity=none: x}}}
  - {key: c, label: C, trigger: imposed, content: {kind: md, label: Both, by: [entity], doc: x, docs: {entity=none: x, entity=company: y}}}
  - {key: d, label: D, trigger: imposed, content: {kind: md, label: Maps, by: [entity], docs: {entity=none: {a: 1}, entity=company: ok}}}
`);
    expect(inlineProblems(bad)).toEqual([
      "event a: Short: docs has no `entity=company` — every answer combination of `by` is a document of its own",
      "event a: Short: docs has `entity=nope`, which is not a combination of entity answers in `by` order",
      "event b: Keyless has `docs` but no `by` — say which decisions key the documents",
      "event c: Both has both `doc` and `docs` — one document, or one per answer combination",
      "event c: Both is one document, so it cannot vary `by` — write one per answer combination under `docs`",
      "event d: Maps [entity=none]: an `md` document is its text — write it as a block string",
    ]);
  });

  it("the kind is normalised, and what a written entry cannot be is named", () => {
    const bad = parsePlaybook(`version: 2
title: t
events:
  - {key: a, label: A, trigger: imposed, content: {kind: .Brief, doc: {title: x}}}
  - {key: b, label: B, trigger: imposed, content: {label: No kind, doc: {title: x}}}
  - {key: c, label: C, trigger: imposed, content: {kind: md, label: Map, doc: {title: not text}}}
`);
    expect(bad.events[0].content?.[0].kind).toBe("brief");
    expect(inlineProblems(bad)).toEqual([
      "event b: No kind has `doc` but no `kind` — say which kind renders it (brief, guide, md, …)",
      "event c: Map: an `md` document is its text — write it as a block string",
    ]);
  });

  it("drops what version 2 has not got, and names each", () => {
    const old = `version: 2
title: t
view: {locks: [entity=none], collapsed: [steps]}
decisions:
  - {key: entity, label: Entity, values: [{key: none, label: None}]}
topics:
  - {key: t, label: T, content: {kind: md, doc: hi}}
events:
  - key: list
    label: List
    trigger: imposed
    content:
      - {kind: md, doc: first}
      - {kind: md, doc: second}
  - key: file
    label: File
    trigger: imposed
    content: {file: notes.md, label: Notes}
  - key: set
    label: Set
    trigger: imposed
    content: {kind: md, label: Members, by: [entity], docs: {entity=none: x}}
  - key: empty
    label: Empty
    trigger: imposed
    content: {kind: md, label: Nothing under it}
rules:
  - {event: list, when: [entity=none], status: ready, sets: [entity=company]}
`;
    const doc = parsePlaybook(old);
    expect(doc.decisions.length).toBe(1);
    expect(doc.topics).toEqual([]);
    expect(doc.view).toEqual({});
    // A list is read as its first entry, so the walk still shows something; the rest is named.
    expect(doc.events[0].content).toEqual([{ kind: "md", doc: "first" }]);
    expect(doc.events[1].content).toBeUndefined();
    // A set is a version-2 form: kept, and its closed set is the checker's business.
    expect(doc.events[2].content?.[0].docs).toEqual({ "entity=none": "x" });
    expect(doc.events[3].content).toBeUndefined();
    expect(doc.rules).toEqual([{ event: "list", when: ["entity=none"], status: "ready", sets: ["entity=company"] }]);
    expect(versionProblems(old)).toEqual([
      "`topics:` — version 2 has no topics; what is always true is the content of an always-on event, or take `version: 2` off",
      "`view:` — a version-2 walk is session-only and writes nothing; every decision opens unanswered. Delete the view",
      "event list: `content` is one document at version 2 — a mapping, not a list; several sections belong in one brief",
      "event file: Notes is a file beside the book — version 2 is written in the book; write it as `kind` + `doc`, or take `version: 2` off",
      "event empty: Nothing under it has neither `doc` nor `docs` — write the document under it",
    ]);
    expect(dumpPlaybook(doc)).not.toMatch(/topics|view:|locks/);
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
  });

  it("version 2 reads the same text as one document and names the list and the file", () => {
    const V2 = `version: 2\n${V1}`;
    // The first entry is the file, so nothing is shown; both facts are named.
    expect(parsePlaybook(V2).events[0].content).toBeUndefined();
    expect(versionProblems(V2)).toEqual([
      "event e: `content` is one document at version 2 — a mapping, not a list; several sections belong in one brief",
      "event e: Notes is a file beside the book — version 2 is written in the book; write it as `kind` + `doc`, or take `version: 2` off",
    ]);
  });

  it("an unknown version is named and read as the latest", () => {
    expect(parsePlaybook(`version: 9\ntitle: t\n`).version).toBe(PLAYBOOK_LATEST);
    expect(versionProblems(`version: 9\ntitle: t\n`)[0]).toMatch(/knows playbook up to version 2/);
    expect(versionProblems(`version: two\ntitle: t\n`)[0]).toMatch(/not a whole number/);
    expect(versionProblems(`version: 1.5\ntitle: t\n`)[0]).toMatch(/not a whole number/);
  });

  it("a new playbook starts at the latest version: a decision, a written event, rules per answer", () => {
    const text = fileTemplate("x.playbook", "x");
    expect(text).toMatch(/^version: 2\n/);
    const doc = parsePlaybook(text);
    expect(doc.version).toBe(2);
    expect(doc.decisions.length).toBe(1);
    expect(doc.events.length).toBe(1);
    expect(doc.events[0].content?.[0].kind).toBe("md");
    expect(doc.events[0].content?.[0].by).toEqual(["example"]);
    expect(Object.keys(doc.events[0].content?.[0].docs ?? {})).toEqual(["example=not-yet", "example=done"]);
    expect(ruleFor(doc, "example", [])?.status).toBe("gap");
    expect(versionProblems(text)).toEqual([]);
    expect(inlineProblems(doc)).toEqual([]);
  });
});

describe("the view", () => {
  it("has no tab: a stale `view.tab` is ignored on read and never written back", () => {
    const doc = parsePlaybook([
      "title: t",
      "view: {tab: rules, locks: [x=a], collapsed: [n.md]}",
      "decisions:",
      "  - {key: x, label: X, values: [{key: a, label: A}, {key: b, label: B}]}",
      "",
    ].join("\n"));
    expect(doc.view).toEqual({ locks: ["x=a"], collapsed: ["n.md"] });
    expect(dumpPlaybook(doc)).not.toMatch(/tab:/);
    expect(legacyProblems("title: t\nview: {tab: rules}\n")[0]).toMatch(/view.tab.*is gone/);
  });
});
