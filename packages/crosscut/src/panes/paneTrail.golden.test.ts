import { describe, expect, it } from "vitest";
import {
  advancedPosition, advancedPositionIn, insertedIndex, isSoloIn, isSoloPosition, positionAfter,
  positionShowing, positionsFor, replacedIndex, totalPositionsFor, totalPositionsIn, trailWindow, trailWindowIn,
} from "./paneTrail";

describe("pane trail golden", () => {
  it("position 0 keeps the root open — never collapsed", () => {
    expect(trailWindow(1, 0)).toEqual({ collapsed: null, open: [0] });
    expect(trailWindow(2, 0)).toEqual({ collapsed: null, open: [0, 1] });
    expect(trailWindow(4, 0)).toEqual({ collapsed: null, open: [0, 1] });
  });
  it("deeper positions collapse the pane left of the window", () => {
    expect(trailWindow(3, 1)).toEqual({ collapsed: 0, open: [1, 2] });
    expect(trailWindow(4, 1)).toEqual({ collapsed: 0, open: [1, 2] });
    expect(trailWindow(4, 2)).toEqual({ collapsed: 1, open: [2, 3] });
  });
  it("positions count is panes minus one (min 1), plus the solo position", () => {
    expect(positionsFor(1)).toBe(1);
    expect(positionsFor(2)).toBe(1);
    expect(positionsFor(5)).toBe(4);
    expect(totalPositionsFor(1)).toBe(1);   // a single pane has no solo twin
    expect(totalPositionsFor(2)).toBe(2);
    expect(totalPositionsFor(5)).toBe(5);
  });
  it("the far-right position shows the content pane only", () => {
    expect(isSoloPosition(4, 3)).toBe(true);
    expect(isSoloPosition(4, 2)).toBe(false);
    expect(trailWindow(4, 3)).toEqual({ collapsed: null, open: [3] });
    expect(trailWindow(2, 1)).toEqual({ collapsed: null, open: [1] });
  });
  it("out-of-range positions clamp (to solo at the high end)", () => {
    expect(trailWindow(3, 9)).toEqual({ collapsed: null, open: [2] });
    expect(trailWindow(3, -2)).toEqual({ collapsed: null, open: [0, 1] });
  });
  it("growing the chain advances to the newest WINDOWED pane; shrinking clamps", () => {
    expect(advancedPosition(2, 3, 0)).toBe(1);   // drilled deeper -> show it
    expect(advancedPosition(3, 4, 1)).toBe(2);   // never lands on solo by itself
    expect(advancedPosition(4, 2, 2)).toBe(1);   // chain cut back -> clamps (solo of 2 is valid)
    expect(advancedPosition(3, 3, 1)).toBe(1);   // unchanged length -> stay put
  });
});

describe("single mode (small screens)", () => {
  it("one position per pane, one pane per position, no rail, no solo", () => {
    expect(totalPositionsIn("single", 4)).toBe(4);
    expect(trailWindowIn("single", 4, 0)).toEqual({ collapsed: null, open: [0] });
    expect(trailWindowIn("single", 4, 2)).toEqual({ collapsed: null, open: [2] });
    expect(trailWindowIn("single", 4, 99)).toEqual({ collapsed: null, open: [3] });
    expect(isSoloIn("single", 4, 3)).toBe(false);
  });

  it("push jumps to the newest pane; pop clamps", () => {
    expect(advancedPositionIn("single", 3, 4, 1)).toBe(3);
    expect(advancedPositionIn("single", 4, 2, 3)).toBe(1);
  });

  it("window mode passes through untouched", () => {
    expect(totalPositionsIn("window", 4)).toBe(totalPositionsFor(4));
    expect(trailWindowIn("window", 4, 1)).toEqual(trailWindow(4, 1));
    expect(advancedPositionIn("window", 3, 4, 1)).toBe(advancedPosition(3, 4, 1));
  });
});

describe("mid-chain insertion", () => {
  it("finds where the new pane landed", () => {
    expect(insertedIndex(["a", "b", "c"], ["a", "drill", "b", "c"])).toBe(1);
    expect(insertedIndex(["a", "b"], ["a", "b", "c"])).toBe(2);
    expect(insertedIndex(["a", "b"], ["a", "b"])).toBe(null);
    expect(insertedIndex(["a", "b", "c"], ["a", "b"])).toBe(null);
  });

  it("advances to the position that SHOWS the inserted pane, source beside it", () => {
    // window: pane 1 inserted -> position 0 shows [0, 1] (the source and the drill)
    expect(positionShowing("window", 4, 1)).toBe(0);
    expect(positionShowing("window", 4, 3)).toBe(2);
    expect(positionShowing("window", 4, 0)).toBe(0);
    // single: the inserted pane alone
    expect(positionShowing("single", 4, 1)).toBe(1);
    expect(positionShowing("single", 4, 9)).toBe(3);
  });
});

describe("in-place replacement", () => {
  it("finds the pane whose key changed at the same length", () => {
    expect(replacedIndex(["walk", "detail:topics"], ["walk", "detail:fund"])).toBe(1);
    expect(replacedIndex(["a", "b"], ["a", "b"])).toBe(null);
    expect(replacedIndex(["a", "b"], ["a", "b", "c"])).toBe(null);
  });

  it("single: a replaced pane the phone is not showing comes into view", () => {
    // the rail is up (position 0); an event opens and its detail REPLACES the topics pane
    expect(positionAfter("single", ["walk", "detail:topics"], ["walk", "detail:fund"], 0)).toBe(1);
    // already looking at it: stay
    expect(positionAfter("single", ["walk", "detail:fund"], ["walk", "detail:pay"], 1)).toBe(1);
  });

  it("window: a replaced pane already in the window does not move the seek", () => {
    expect(positionAfter("window", ["walk", "detail:topics"], ["walk", "detail:fund"], 0)).toBe(0);
    // content-only position hides the detail at index 1 -> back to where it shows
    expect(positionAfter("window", ["walk", "detail:a", "guide"], ["walk", "detail:b", "guide"], 2)).toBe(0);
  });

  it("single: a burst of pushes stops one pane past where the user last touched", () => {
    // tap on the rail (anchor 0): the event pane comes in -> 1
    expect(positionAfter("single", ["walk", "d:topics"], ["walk", "d:fund"], 0, 0)).toBe(1);
    // the nested book then pushes its own detail while nobody touched anything -> stay on the book
    expect(positionAfter("single", ["walk", "d:fund"], ["walk", "d:fund", "steps"], 1, 0)).toBe(1);
    // a tap INSIDE the book (anchor 1) drilling deeper does advance
    expect(positionAfter("single", ["walk", "d:fund", "steps"], ["walk", "d:fund", "steps", "step"], 2, 1)).toBe(2);
    expect(positionAfter("single", ["walk", "d:fund"], ["walk", "d:fund", "steps"], 1, 1)).toBe(2);
    // window mode is not capped: both panes of the burst are on screen anyway
    expect(positionAfter("window", ["walk", "d:fund"], ["walk", "d:fund", "steps"], 0, 0)).toBe(1);
  });

  it("push and pop behave as before", () => {
    expect(positionAfter("single", ["a", "b"], ["a", "b", "c"], 1)).toBe(2);
    expect(positionAfter("single", ["a", "b", "c"], ["a", "b"], 2)).toBe(1);
    expect(positionAfter("window", ["a", "b", "c"], ["a", "drill", "b", "c"], 1)).toBe(0);
  });
});
