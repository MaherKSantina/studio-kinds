import { describe, expect, it } from "vitest";
import { nodeHandleOf, nodeHandlesIn, parseNodeHandle } from "./handles";

describe("node handles", () => {
  it("round-trips a path", () => {
    expect(nodeHandleOf("/Job Hunt/lead-etoro.node")).toBe("nodes:/Job Hunt/lead-etoro.node");
    expect(parseNodeHandle("nodes:/Job Hunt/lead-etoro.node")).toBe("/Job Hunt/lead-etoro.node");
  });

  it("is lenient about chat whitespace, strict about shape", () => {
    expect(parseNodeHandle("  nodes:/memory/desk.memory  ")).toBe("/memory/desk.memory");
    expect(parseNodeHandle("NODES:/x")).toBe("/x");
    expect(parseNodeHandle("nodes:relative/path")).toBeNull();
    expect(parseNodeHandle("nodes:/")).toBeNull();
    expect(parseNodeHandle("/no/prefix")).toBeNull();
  });

  it("finds every handle; quotes, lines and parens bound spaced paths", () => {
    expect(nodeHandlesIn(
      'Turn "nodes:/Party DJ/Sep 9 HH.definition" into a brief\n(see nodes:/memory/desk.memory).',
    )).toEqual(["/Party DJ/Sep 9 HH.definition", "/memory/desk.memory"]);
    expect(nodeHandlesIn("nodes:/Job Hunt/lead-etoro.node\nnodes:/Job Hunt/lead-etoro.node"))
      .toEqual(["/Job Hunt/lead-etoro.node"]); // de-duplicated
  });
});
