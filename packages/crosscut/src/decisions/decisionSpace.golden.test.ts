/**
 * GOLDEN — the DecisionPills emission contract: every click yields the
 * complete, pruned next assignment.
 */
import { describe, expect, it } from "vitest";
import { SpaceDecision, decisionRows, toggleRef } from "./decisionSpace";

// The screenshot hierarchy: Legal form activates three child decisions.
const DECISIONS: SpaceDecision[] = [
  {
    key: "entity", label: "Legal form",
    values: [
      { key: "none", label: "No entity" },
      { key: "pty", label: "Pty Ltd", activates: ["filings", "board", "bank"] },
    ],
  },
  { key: "filings", label: "Who owns filings", values: [
    { key: "nobody", label: "Nobody yet" }, { key: "director", label: "One named director" }, { key: "accountant", label: "Retained accountant" } ] },
  { key: "board", label: "Who sits on the board", values: [
    { key: "all", label: "All four of us" }, { key: "sa", label: "SA-resident plus one" } ] },
  { key: "bank", label: "Bank account", values: [
    { key: "closed", label: "Not opened" }, { key: "open", label: "Open", when: ["filings=director"] } ] },
  { key: "agreement", label: "Partnership agreement", values: [
    { key: "drafted", label: "Drafted, not signed" }, { key: "signed", label: "Signed by all four" } ] },
];

describe("decision space golden", () => {
  it("activation shows and hides rows", () => {
    expect(decisionRows(DECISIONS, []).map((r) => r.decision.key)).toEqual(["entity", "agreement"]);
    // `bank` stays hidden: with filings unanswered its "Open" answer is gated
    // away, and a question with one available answer is a fact, not a question.
    expect(decisionRows(DECISIONS, ["entity=pty"]).map((r) => r.decision.key))
      .toEqual(["entity", "filings", "board", "agreement"]);
    expect(decisionRows(DECISIONS, ["entity=pty"]).map((r) => r.depth)).toEqual([0, 1, 1, 0]);
    // Answering filings=director puts "Open" on offer, so bank becomes a question.
    expect(decisionRows(DECISIONS, ["entity=pty", "filings=director"]).map((r) => r.decision.key))
      .toEqual(["entity", "filings", "board", "bank", "agreement"]);
  });
  it("includeSingles keeps one-answer decisions on the table — for hosts whose decisions are cues, not facts", () => {
    // `bank` is down to one available answer with filings unanswered; a memory
    // still shows it, because taking that lone answer narrows a working set.
    expect(decisionRows(DECISIONS, ["entity=pty"], [], { includeSingles: true }).map((r) => r.decision.key))
      .toEqual(["entity", "filings", "board", "bank", "agreement"]);
  });
  it("a click emits the complete next assignment", () => {
    expect(toggleRef(DECISIONS, [], "entity=pty")).toEqual(["entity=pty"]);
    expect(toggleRef(DECISIONS, ["entity=pty"], "filings=director")).toEqual(["entity=pty", "filings=director"]);
  });
  it("re-answering replaces; clicking the taken answer clears", () => {
    expect(toggleRef(DECISIONS, ["agreement=drafted"], "agreement=signed")).toEqual(["agreement=signed"]);
    expect(toggleRef(DECISIONS, ["agreement=signed"], "agreement=signed")).toEqual([]);
    expect(toggleRef(DECISIONS, ["agreement=signed"], "agreement=signed", { allowClear: false })).toEqual(["agreement=signed"]);
  });
  it("answers to questions that leave the table are pruned", () => {
    const withChildren = ["entity=pty", "filings=director", "board=all"];
    expect(toggleRef(DECISIONS, withChildren, "entity=none")).toEqual(["entity=none"]);
    expect(toggleRef(DECISIONS, withChildren, "entity=pty")).toEqual([]); // clearing the parent drops the branch
  });
  it("when-gated answers prune when their gate goes", () => {
    const locks = ["entity=pty", "filings=director", "bank=open"];
    // Re-answering filings removes bank=open's gate; the stale answer goes too.
    expect(toggleRef(DECISIONS, locks, "filings=accountant")).toEqual(["entity=pty", "filings=accountant"]);
  });
  it("context gates activation but is never emitted", () => {
    expect(decisionRows([DECISIONS[1]], [], ["entity=pty"]).map((r) => r.decision.key)).toEqual(["filings"]);
    expect(toggleRef(DECISIONS.slice(1), [], "filings=nobody", { context: ["entity=pty"] })).toEqual(["filings=nobody"]);
  });
});
