/**
 * THE JOURNEY CATALOG (data) — every component that can stand in a staged journey, grouped
 * by the question it answers, each with live states and a when-to-use.
 *
 * A story's states are REAL journey YAML rendered by the real engine
 * (filekinds' JourneyStagesView) over real demo files in the shared nodes
 * file system (`/Journey Studio/demo/*`). What you see is exactly what a
 * `.definition` with the same text would show — every state doubles as a
 * copy-paste template.
 *
 * Grouping logic:
 *   Stages & boundaries — the VERTICAL skeleton (what stacks, what the
 *     glyph between two stages means)
 *   Lanes & columns     — the HORIZONTAL axis (what stands side by side
 *     inside one stage)
 *   Embedding           — journeys referencing journeys (owned once,
 *     rendered everywhere)
 *   Fanout grids        — one pool exploding into per-item columns
 *   Pooled content      — a whole pool shown organized, without fanning out
 */

export interface CatalogState {
  label: string;
  /** One line under the label — what this state demonstrates. */
  note?: string;
  yaml: string;
  /** Canvas height override (px) when the default is too short/tall. */
  height?: number;
}

export interface CatalogStory {
  id: string;
  title: string;
  /** The glyph shown in the rail — the component's visual signature. */
  glyph: string;
  /** When to reach for this component — the reason this catalog exists. */
  when: string;
  states: CatalogState[];
}

export interface CatalogGroup {
  id: string;
  title: string;
  blurb: string;
  stories: CatalogStory[];
}

const D = "/Journey Studio/demo";

export const JOURNEY_CATALOG: CatalogGroup[] = [
  {
    id: "stages",
    title: "Stages & boundaries",
    blurb: "The vertical skeleton: stages stack in sequence, and the one/many action lives on the BOUNDARY between them as a glyph, never as an edge.",
    stories: [
      {
        id: "steps-stage",
        title: "Steps in a stage",
        glyph: "▤",
        when: "The plainest stage: a vertical run of operation cells over one artifact. Each step opens its file; `flow: false` keeps a big document behind the click; a `hint:` explains the step inside its dialog. Reach for lanes or a fanout only when work genuinely runs side by side — single-threaded work stays a steps stage.",
        states: [
          {
            label: "One step, content behind the click",
            note: "flow: false — the cell stands alone, the document opens on click",
            height: 220,
            yaml: `title: Steps demo
stages:
  - key: notes
    label: Read the notes
    detail: "One artifact, one operation"
    steps:
      - {key: read, label: "The field notes", file: ${D}/notes.md, flow: false, hint: "Everything lives behind the click"}
`,
          },
          {
            label: "Several steps, operations between",
            note: "a policy step wears '→ apply the policy' on its link; plain steps carry a bare operation row",
            height: 340,
            yaml: `title: Steps demo
stages:
  - key: work
    label: Work the pool
    steps:
      - {key: read, label: "Read the notes", file: ${D}/notes.md, flow: false}
      - {key: triage, label: "Run the demo triage", file: ${D}/demo-run.policy, flow: false, hint: "The run dialog links the rules and the run"}
`,
          },
        ],
      },
      {
        id: "collate",
        title: "⇒ Collate",
        glyph: "⇒",
        when: "Many strands above pool into ONE artifact here. The stage names the pooled thing (`collate:`); its rows flow beneath (10 at a time, show-all expands); the ⇒ dialog states the operation's own facts — which sources pooled in, what key deduped them. Use whenever several parallel outputs must become one input for what follows.",
        states: [
          {
            label: "Two lanes pool into one list",
            note: "the pool is a collated list (sources + dedupeBy) — click ⇒ for its facts",
            height: 430,
            yaml: `title: Collate demo
stages:
  - key: gather
    label: Gather
    lanes:
      - {label: Site A, out: ${D}/site-a.list, status: done}
      - {label: Site B, out: ${D}/site-b.list, status: done}
  - key: pool
    label: One pool
    detail: "Both sites, deduped by label"
    collate: ${D}/pool.list
`,
          },
          {
            label: "Collate as a plain label",
            note: "a non-file collate ('gap plan') names the pooled IDEA — no dialog counting, no flow",
            height: 260,
            yaml: `title: Collate demo
stages:
  - key: a
    label: Threads
    lanes:
      - {label: Thread one, status: done}
      - {label: Thread two, status: done}
  - key: plan
    label: The plan
    collate: gap plan
    steps:
      - {key: write, label: "Write it up", file: ${D}/notes.md, flow: false}
`,
          },
        ],
      },
      {
        id: "apply-policy",
        title: "→ Apply the policy",
        glyph: "→",
        when: "A carry boundary whose step is a policy run wears the transform on the link: '→ apply the policy'. In AMBER, the operation has a MINI JOURNEY behind it — the one-off exploration that produced the policy, compressed behind the link and opened directly. Use mini journeys to keep how-it-came-to-be one click away without cluttering the flow.",
        states: [
          {
            label: "Policy op with a mini journey",
            note: "amber = exploration-backed; clicking the op opens the mini journey itself",
            height: 500,
            yaml: `title: Apply demo
stages:
  - key: pool
    label: The pool
    collate: ${D}/pool.list
  - key: triage
    label: Triage
    detail: "The pool through the demo order policy"
    steps:
      - {key: run, label: "Demo triage — every row, categorized", file: ${D}/demo-run.policy, journey: ${D}/trunk.definition, hint: "The amber op opens the mini journey that produced this policy"}
`,
          },
        ],
      },
      {
        id: "portal",
        title: "Portal stage (journey:)",
        glyph: "🚪",
        when: "The stage IS another journey — a doorway, not a splice. Use it to split a grown journey at a natural seam: move the tail stages into their own file and leave the portal band behind. Compare EMBED, which renders the other journey's stages here instead of linking to them.",
        states: [
          {
            label: "A journey as a stage",
            note: "the 'open journey' chip opens the whole other journey in a dialog",
            height: 180,
            yaml: `title: Portal demo
stages:
  - key: next
    label: The follow-on journey
    detail: "Its stages live in their own file — this is a doorway"
    journey: ${D}/trunk.definition
`,
          },
        ],
      },
      {
        id: "calendar",
        title: "Calendar stage",
        glyph: "▦",
        when: "The schedule end of a journey: `calendar: {sources}` projects every dated row of the task lists onto one month grid, colored by source list. Tasks are AUTHORED in the lists — the calendar only draws them. Dates must be quoted strings ('2026-09-02') or YAML eats them as timestamps.",
        states: [
          {
            label: "Two task lists, one month",
            note: "spans are inclusive; the grid picks the month holding most tasks",
            height: 420,
            yaml: `title: Calendar demo
stages:
  - key: plan
    label: September
    collate: the plan
    calendar: {sources: [${D}/tasks-a.list, ${D}/tasks-b.list]}
`,
          },
        ],
      },
    ],
  },
  {
    id: "lanes",
    title: "Lanes & columns",
    blurb: "The horizontal axis: what stands side by side inside one stage — compact cards for work behind the click, wide columns for content shown in place.",
    stories: [
      {
        id: "lane-cards",
        title: "Plain lane cards",
        glyph: "▯▯",
        when: "Parallel strands whose content lives behind the click: one compact card per lane, with a status mark (✓ done, ● next — next feeds the stage's attention chip) and chips for the lane's process and output. Use for fan-in work like scrape lanes. The moment you want content VISIBLE in the column, use a content column instead.",
        states: [
          {
            label: "Statuses and chips",
            note: "● next counts into '1 needs attention'; chips open the process / the output",
            height: 240,
            yaml: `title: Lanes demo
stages:
  - key: gather
    label: Gather
    detail: "Two done, one waiting"
    lanes:
      - {label: Site A, out: ${D}/site-a.list, status: done}
      - {label: Site B, out: ${D}/site-b.list, status: next}
      - {label: Site C, status: pending}
`,
          },
        ],
      },
      {
        id: "lane-list",
        title: "Flowing list column (flow: true)",
        glyph: "≣",
        when: "A lane whose list rows render IN the column — label plus a source/context sub-line — so data stands beside the definitions that govern it. Lists only flow when asked (`flow: true`); policies always flow their structure.",
        states: [
          {
            label: "Rows in the column",
            note: "the band header opens the list; rows scroll under it",
            height: 420,
            yaml: `title: Flow demo
stages:
  - key: inputs
    label: Inputs
    lanes:
      - {label: The pool, out: ${D}/pool.list, flow: true}
      - {label: Talking points, out: ${D}/points.list, flow: true}
`,
          },
        ],
      },
      {
        id: "lane-policy",
        title: "Policy structure column",
        glyph: "⚖",
        when: "A `.policy` out always flows its STRUCTURE: an order policy shows its ranked entries — number, hand label, dimension:value chips, exactly the Output pane's language; a tags policy shows its dimensions with value/rule counts. Use to put the rules beside the data they organize.",
        states: [
          {
            label: "Order policy — ranked entries",
            note: "position is priority; chips are the entry's when-refs",
            height: 430,
            yaml: `title: Policy column demo
stages:
  - key: rules
    label: The ranking
    lanes:
      - {label: Demo order, out: ${D}/demo-order.policy}
`,
          },
          {
            label: "Tags policy — the dimensions",
            note: "facts only — each dimension with its values and rules",
            height: 330,
            yaml: `title: Policy column demo
stages:
  - key: rules
    label: The tagging
    lanes:
      - {label: Demo tags, out: ${D}/demo-tags.policy}
`,
          },
        ],
      },
      {
        id: "lane-answers",
        title: "Decision answers column (answers:)",
        glyph: "🏷",
        when: "One row's answers, derived LIVE: `answers:` names a policy RUN and `item:` the row — the column walks the same chain the run view walks, narrowed to that item, showing every visible dimension's answer with the rule that fired, plus the rank it lands. Use in per-item context stages (a role's tailoring journey) so the item's categorization stands beside the material it explains — never a pasted copy of derived data.",
        states: [
          {
            label: "The chain, for one row",
            note: "Big fish through the demo chain — each dimension's answer, then the rank",
            height: 380,
            yaml: `title: Answers demo
stages:
  - key: context
    label: Context
    lanes:
      - {label: Decision answers, answers: ${D}/demo-run.policy, item: "Big fish"}
      - {label: The row's pool, out: ${D}/pool.list, flow: true}
`,
          },
        ],
      },
      {
        id: "lane-text",
        title: "Text column (.md)",
        glyph: "¶",
        when: "A lane whose out is a text document renders the document ITSELF, readable in place — the band opens it for editing. Use for prose inputs (context, notes, briefs) that later steps transform. If the prose should become matchable units, transform it into a list and flow that instead.",
        states: [
          {
            label: "The document in the column",
            height: 420,
            yaml: `title: Text demo
stages:
  - key: inputs
    label: Inputs
    lanes:
      - {label: Field notes, out: ${D}/notes.md}
      - {label: The pool, out: ${D}/pool.list, flow: true}
`,
          },
        ],
      },
      {
        id: "lane-pinned",
        title: "Pinned versions (⊙)",
        glyph: "⊙",
        when: "A ref can point INSIDE a versioned file (a folder named like a file, children = its versions) at one concrete version — `out: context.md/01 first.md`. That ref is PINNED: new versions never change this journey. The bar under the band stays quiet while the pin is current, goes amber when a newer version exists, and `update` (in an editing host) is the ONE manual way to move. A bare-folder ref is UNPINNED — it follows the latest version and asks to be pinned. Versions are cut (with a why, landing in the folder's versions.md) from the nodes explorer's version view.",
        states: [
          {
            label: "Pinned behind the latest",
            note: "locked to 01 while 02 exists — amber names the newer version; update re-pins where the host allows editing",
            height: 400,
            yaml: `title: Pin demo
stages:
  - key: inputs
    label: Inputs
    lanes:
      - {label: Context, out: ${D}/context.md/01 first.md}
`,
          },
          {
            label: "Pinned to the latest",
            note: "the quiet state — dashed, nothing to do",
            height: 400,
            yaml: `title: Pin demo
stages:
  - key: inputs
    label: Inputs
    lanes:
      - {label: Context, out: ${D}/context.md/02 second.md}
`,
          },
          {
            label: "Unpinned — follows latest",
            note: "the ref is the folder itself; the column reads as the latest version and asks to be pinned",
            height: 400,
            yaml: `title: Pin demo
stages:
  - key: inputs
    label: Inputs
    lanes:
      - {label: Context, out: ${D}/context.md}
`,
          },
        ],
      },
      {
        id: "grid",
        title: "The grid",
        glyph: "⊞",
        when: "Rows of aligned cells; `{}` holds an empty position. POSITION IS MEANING: what sits BESIDE a thing gets matched against it, what sits BELOW derives from it. Use when one row of lanes cannot say which inputs pair with which — transformations read down a column, pairings read across a row. Any lane cell works in a grid: text, lists, policies, embeds.",
        states: [
          {
            label: "2×2 — derive down, match across",
            note: "raw text above its distilled list; the pool beside what it will be matched against",
            height: 560,
            yaml: `title: Grid demo
stages:
  - key: inputs
    label: Inputs
    detail: "Raw notes transform down into points; the pool stands beside them"
    grid:
      - - {}
        - {label: Raw notes, out: ${D}/notes.md}
      - - {label: The pool, out: ${D}/pool.list, flow: true}
        - {label: Talking points, out: ${D}/points.list, flow: true}
`,
          },
        ],
      },
    ],
  },
  {
    id: "embedding",
    title: "Embedding & variants",
    blurb: "Journeys referencing journeys: the common section lives in ITS OWN file and is embedded by reference; sibling versions of a whole journey stand behind pills.",
    stories: [
      {
        id: "embed-splice",
        title: "Embed, full size (- embed:)",
        glyph: "⑂",
        when: "A stages-list entry `- embed: <journey>` splices the owned journey's stages inline BY REFERENCE. The violet ⑂ band opens the owner; every spliced stage wears its chip; 'own steps continue' marks the seam; `at:` cuts the prefix through a stage key (inclusive). Use when several journeys share a front or a middle — one trunk, many endings.",
        states: [
          {
            label: "Whole journey spliced in",
            note: "the trunk's two stages render here, then this journey's own stage continues",
            height: 560,
            yaml: `title: Embed demo
stages:
  - embed: ${D}/trunk.definition
  - key: own
    label: This journey's own step
    steps:
      - {key: notes, label: "Work the pooled rows", file: ${D}/notes.md, flow: false}
`,
          },
          {
            label: "Cut with at:",
            note: "at: gather takes the trunk only through its first stage",
            height: 400,
            yaml: `title: Embed demo
stages:
  - {embed: ${D}/trunk.definition, at: gather}
  - key: own
    label: This journey's own step
    steps:
      - {key: notes, label: "Work the gathered strands", file: ${D}/notes.md, flow: false}
`,
          },
        ],
      },
      {
        id: "variants",
        title: "Variants — A/B (variants:)",
        glyph: "⇄",
        when: "A/B testing as a VIEW, not a structure: a file whose `variants:` names sibling journeys that answer the same question differently — same shared trunk, different talking points, different judgements. Pills flip WHOLE journeys, each fully live with its own basePath. Use when comparing versions matters more than tracking one; keep the shared part embedded so only the differences differ.",
        states: [
          {
            label: "Two versions behind pills",
            note: "flip A and B — the trunk column is constant, the second column changes",
            height: 480,
            yaml: `title: Demo A/B
description: "Same trunk, two readings of the pool."
variants:
  - {label: "A — the pool", journey: ${D}/variant-a.definition}
  - {label: "B — the points", journey: ${D}/variant-b.definition}
`,
          },
        ],
      },
      {
        id: "embed-column",
        title: "Embed as a column (lane embed:)",
        glyph: "⑂▏",
        when: "`embed:` on a LANE compresses the same journey into one content column — a row per stage, each carrying its boundary glyph (⇒ ⇉ →) and detail, the violet band opening the owner. Use when the shared journey is CONTEXT standing beside other inputs, rather than the spine of this page.",
        states: [
          {
            label: "The trunk as a column",
            note: "compressed provenance beside a data column",
            height: 420,
            yaml: `title: Embed column demo
stages:
  - key: inputs
    label: Inputs
    lanes:
      - {label: The trunk, embed: ${D}/trunk.definition}
      - {label: Talking points, out: ${D}/points.list, flow: true}
`,
          },
        ],
      },
    ],
  },
  {
    id: "fanout",
    title: "Fanout grids",
    blurb: "One pool above explodes into per-item columns (⇉). Shared steps stay bands that span every column; each item's divergence stays in its own column. The kanban is the same stage worn as a board.",
    stories: [
      {
        id: "fan-sources",
        title: "Where columns come from",
        glyph: "⇉",
        when: "Columns are never hand-listed. `{run, ranks}` = a policy run's ranked buckets, columns in rank order under contiguous group bands — use for policy-ordered pursuit. `{list}` = one column per row. `{list, by: field}` = one column per distinct value — use for grouping like gap contexts. `take:` caps the fan.",
        states: [
          {
            label: "From a run's ranks",
            note: "ranks [1, 3] — the group bands name the buckets the columns came from",
            height: 340,
            yaml: `title: Fan demo
stages:
  - key: pursue
    label: Pursue the top ranks
    fanout: {run: ${D}/demo-run.policy, ranks: [1, 3]}
    steps:
      - {key: look, label: Look closer}
`,
          },
          {
            label: "Group-by fan",
            note: "one column per distinct `kind` value in the pool",
            height: 300,
            yaml: `title: Fan demo
stages:
  - key: contexts
    label: By kind
    fanout: {list: ${D}/pool.list, by: kind}
    steps:
      - {key: close, label: Close the group}
`,
          },
        ],
      },
      {
        id: "fan-spine",
        title: "Shared steps & divergence",
        glyph: "═",
        when: "SHARED STEP bands are the streamlined process — declared once, spanning every column. Each column's band cell holds that item's RESULT: the actual artifact the step produced (`results: {stepKey: ref}`), clickable, never a status word — and an unanswered step's cell simply stays empty. A result also counts as done for the board and attention. Divergent per-item steps still live in the zones between bands, anchored `after:` a spine key.",
        states: [
          {
            label: "Result cards in the bands, divergence in the zones",
            note: "Big fish answered Research with a document — its card sits in the band; every other cell waits empty",
            height: 470,
            yaml: `title: Spine demo
stages:
  - key: pursue
    label: Pursue each row
    fanout: {list: ${D}/pool.list, take: 3}
    steps:
      - {key: research, label: Research}
      - {key: decide, label: Decide}
    items:
      "Big fish":
        results:
          research: ${D}/notes.md
        steps:
          - {label: "Vet the pond first — it looked too deep on the map", after: research, status: done}
`,
          },
        ],
      },
      {
        id: "fan-board",
        title: "Board projection",
        glyph: "▥",
        when: "The same fanout worn as a kanban: columns are the spine steps, and a card sits in its FIRST NOT-DONE step (past the end = done with the stage). It is a projection of the grid, never separate children — flip Columns | Board in the stage header; nothing about the data changes.",
        states: [
          {
            label: "Same stage as the spine story",
            note: "click Board in the stage header — Big fish sits in 'Decide', Small fish is done",
            height: 470,
            yaml: `title: Board demo
stages:
  - key: pursue
    label: Pursue each row
    fanout: {list: ${D}/pool.list, take: 3}
    steps:
      - {key: research, label: Research}
      - {key: decide, label: Decide}
    items:
      "Big fish":
        status: {research: done, decide: next}
      "Small fish":
        status: {research: done, decide: done}
`,
          },
        ],
      },
    ],
  },
  {
    id: "pooled",
    title: "Pooled content",
    blurb: "A whole pool shown ORGANIZED without fanning out — see the categorization before deciding what to pursue.",
    stories: [
      {
        id: "run-stage",
        title: "Policy-run stage (grouped pool)",
        glyph: "▤▤",
        when: "A steps stage whose file is a RUN policy shows EVERY item categorized under its bucket bands (10 previewed, show-all expands) — the same grouping a fanout wears, over the whole pool. Use it to SEE the categorization; use a fanout when the top of it becomes per-item WORK. Clicking a row explains its tags and rank.",
        states: [
          {
            label: "The whole pool, categorized",
            note: "bands are the order policy's entries, in rank order",
            height: 470,
            yaml: `title: Run stage demo
stages:
  - key: triage
    label: Triage
    detail: "Every row through the demo chain"
    steps:
      - {key: run, label: "Demo triage — all rows, categorized", file: ${D}/demo-run.policy, hint: "Rows carry their tags; the op links rules and run"}
`,
          },
        ],
      },
    ],
  },
];

export const journeyCatalogStories = (): { group: CatalogGroup; story: CatalogStory }[] =>
  JOURNEY_CATALOG.flatMap((group) => group.stories.map((story) => ({ group, story })));

/** The story a catalog URL names, with its group — or null. */
export const journeyCatalogStory = (storyId: string | null) =>
  journeyCatalogStories().find((s) => s.story.id === storyId) ?? null;
