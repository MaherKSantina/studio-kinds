/** GOLDEN RULES for the journey catalog — it must stay parseable and COMPLETE:
 *  every journey-engine feature has at least one story demonstrating it.
 *  (Moved from Journey Studio on 2026-09-12; the catalog is a Studio page now.) */
import { describe, expect, it } from "vitest";
import { JOURNEY_CATALOG, journeyCatalogStories } from "../components/definition/journeyCatalogData";
import { parseJourneyStages, parseJourneyVariants } from "../lib/journeyStages";

describe("the journey catalog", () => {
  it("every state's YAML parses as a staged journey", () => {
    for (const { story } of journeyCatalogStories()) {
      for (const state of story.states) {
        const parsed = parseJourneyStages(state.yaml) ?? parseJourneyVariants(state.yaml);
        expect(parsed, `${story.id} / ${state.label}`).not.toBeNull();
      }
    }
  });

  it("ids are unique and every group has stories", () => {
    const ids = journeyCatalogStories().map((s) => s.story.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of JOURNEY_CATALOG) expect(g.stories.length, g.id).toBeGreaterThan(0);
  });

  it("every engine feature appears in at least one story", () => {
    const corpus = journeyCatalogStories().flatMap(({ story }) => story.states.map((s) => s.yaml)).join("\n");
    const FEATURES = [
      "lanes:",          // parallel strands
      "flow: true",      // flowing list column
      "flow: false",     // content behind the click
      ".policy",         // policy structure column / run step
      ".md",             // text column
      "grid:",           // positioned cells
      "embed:",          // journey embedding (splice and column)
      "at:",             // embed prefix cut
      "collate:",        // fan-in boundary
      "fanout:",         // fan-out boundary
      "run:",            // ranked fan
      "ranks:",
      "by:",             // group-by fan
      "take:",           // fan cap
      "items:",          // per-item overrides
      "after:",          // divergence anchors
      "results:",        // per-item answers in the shared-step bands
      "answers:",        // one row's live-derived decision answers
      "status: next",    // attention
      ".md/01",          // pinned version ref — INTO a versioned folder
      "journey:",        // portal / mini journey
      "calendar:",       // month grid
      "variants:",       // A/B pills over whole journeys
      "hint:",           // step explanations
    ];
    for (const f of FEATURES) expect(corpus, `no story demonstrates \`${f}\``).toContain(f);
  });

  it("every story explains WHEN to use it", () => {
    for (const { story } of journeyCatalogStories()) {
      expect(story.when.length, story.id).toBeGreaterThan(80);
      expect(story.states.length, story.id).toBeGreaterThan(0);
    }
  });
});
