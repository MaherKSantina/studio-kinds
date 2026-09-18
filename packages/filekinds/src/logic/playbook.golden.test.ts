/**
 * GOLDEN TESTS over the ported playbook engine — a fixture book with a known
 * frontier and plan, pinned so a refactor that moves ANY behaviour fails here
 * with a named scenario, not a blank screen.
 */
import { describe, expect, it } from "vitest";
import { activeDecisions, meets, parsePlaybook, pruneLocks, ruleFor } from "../lib/playbookDoc";
import { frontier, plan } from "../lib/playbookPlan";
import { compilePlan, parsePlan } from "../lib/planDoc";

const BOOK = `
title: Fixture venture
decisions:
  - key: entity
    label: Entity
    values:
      - { key: none, label: None }
      - key: company
        label: Company
        activates: [banking]
  - key: banking
    label: Banking
    values:
      - { key: personal, label: Personal account }
      - { key: business, label: Business account }
events:
  - key: incorporate
    label: Incorporate
    trigger: chosen
    steps: []
  - key: open-bank
    label: Open bank account
    trigger: chosen
  - key: tax-audit
    label: Tax audit
    trigger: imposed
rules:
  - event: incorporate
    when: [entity=none]
    status: ready
    sets: [entity=company]
  - event: incorporate
    when: [entity=company]
    status: n/a
  - event: open-bank
    when: [entity=company]
    status: ready
    sets: [banking=business]
  - event: open-bank
    when: [entity=none]
    status: n/a
`;

const doc = parsePlaybook(BOOK);

describe("playbook engine golden", () => {
  it("meets: empty when matches anything, refs must all hold", () => {
    expect(meets(["entity=none"], undefined)).toBe(true);
    expect(meets(["entity=none"], ["entity=none"])).toBe(true);
    expect(meets(["entity=none"], ["entity=company"])).toBe(false);
    expect(meets(["entity=company", "banking=business"], ["entity=company", "banking=business"])).toBe(true);
  });

  it("activation: banking only exists once entity=company is taken", () => {
    expect(activeDecisions(doc, ["entity=none"]).map((d) => d.key)).toEqual(["entity"]);
    expect(activeDecisions(doc, ["entity=company"]).map((d) => d.key)).toEqual(["entity", "banking"]);
  });

  it("readiness: rules dispatch on the assignment", () => {
    expect(ruleFor(doc, "incorporate", ["entity=none"])?.status).toBe("ready");
    expect(ruleFor(doc, "incorporate", ["entity=company"])?.status).toBe("n/a");
    expect(ruleFor(doc, "open-bank", ["entity=none"])?.status).toBe("n/a");
  });

  it("frontier: chosen events applicable here, imposed and n/a excluded", () => {
    expect(frontier(doc, ["entity=none"], new Set(), {}).map((e) => e.key)).toEqual(["incorporate"]);
    expect(frontier(doc, ["entity=company"], new Set(), {}).map((e) => e.key)).toEqual(["open-bank"]);
    expect(frontier(doc, ["entity=none"], new Set(["incorporate"]), {}).map((e) => e.key)).toEqual([]);
  });

  it("plan: taking incorporate moves the assignment and surfaces open-bank", () => {
    const p = plan(doc, { locks: ["entity=none"], guides: new Map() });
    expect(p.order.map((s) => s.event.key)).toEqual(["incorporate", "open-bank"]);
  });

  it("plan respects before-constraints from a .plan file", () => {
    const planDoc = parsePlan(`
title: t
playbooks: [x.playbook]
locks: [entity=none]
rules:
  - order: [open-bank, incorporate]
`);
    const policy = compilePlan(planDoc);
    // open-bank must precede incorporate; it can't (needs company) — so only
    // events NOT blocked by the constraint run, and incorporate never fires.
    const p = plan(doc, { locks: ["entity=none"], guides: new Map(), policy });
    expect(p.order.map((s) => s.event.key)).toEqual([]);
  });

  it("pruneLocks drops answers to questions nobody is asking", () => {
    expect(pruneLocks(doc, ["entity=none", "banking=business"])).toEqual(["entity=none"]);
    expect(pruneLocks(doc, ["entity=company", "banking=business"])).toEqual(["entity=company", "banking=business"]);
  });
});
