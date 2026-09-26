/** Shared fixture: a small in-memory file tree wired into the viewers, showing
 *  a playbook whose content IS a brief — the nested-kind case. */
import { memoryFs } from "crosscut";
import { configureFileKinds } from "../src/api";
import { BUYER_FLOW, DASHBOARD_FRAME, ORG_FLOW, PHONE_FRAME, SCAFFOLD_FRAME } from "./frameFlowFixtures";

export const BRIEF = `title: Meme XP overview
description: The product, as a section tree.
sections:
  - title: Onboarding
    description: The first five minutes
    body: |
      New users land on the **template gallery** and remix a meme before
      ever creating an account.

      - remix without signup
      - account only at save time
    children:
      - title: Template gallery
        body: Curated starting points, sorted by recency.
      - title: Remix flow
        description: Fork, edit, post
  - title: Economy
    description: XP, streaks, and levels
    body: XP accrues per post; streaks multiply it.
`;

/** A brief whose sections hold documents of other kinds — the moments that can arise while a
 *  step runs, as a playbook; a note, as markdown — written in, no file beside it. */
export const BRIEF_WRITTEN = `title: At a session's start
description: Steps as sections; what can happen during one, as the book it holds.
sections:
  - title: 1 · The master is read
    body: |
      The file is read as UTF-8 and parsed. The moments that can arise while it is read are the
      book below.
    content:
      kind: playbook
      doc:
        version: 2
        title: While the master is read
        decisions: []
        events:
          - key: missing
            label: The master playbook is missing
            trigger: imposed
            content: {kind: md, doc: The missing note goes out as the whole text, exit 0.}
          - key: broken
            label: The master playbook does not parse
            trigger: imposed
            content: {kind: md, doc: The note with the parser's message goes out, exit 0.}
  - title: 2 · The map is written
    content:
      kind: md
      doc: |
        One text — the header, the events, the questions, the memory — on stdout, exit 0.
`;

export const GUIDE = `title: Fund the venture
description: What to do when money must come in.
decisions:
  - key: entity
    label: Do we have a company?
    values:
      - { key: no, label: Not yet }
      - { key: yes, label: Yes }
steps:
  - label: Invoice from the partnership
    when: [entity=no]
    detail: Use the shared template; VAT does not apply yet.
  - label: Invoice from the company
    when: [entity=yes]
    detail: Xero issues it; VAT applies.
`;

/** The funding event, as the version-2 book carries it: a guide written in, not beside. `PLAYBOOK_V1` is the book before it existed. */
const FUNDING_EVENT = `  - key: fund
    label: Somebody pays us
    trigger: imposed
    content:
      key: how-funding-is-handled
      label: How funding is handled
      kind: guide
      doc:
        title: Fund the venture
        description: What to do when money must come in.
        decisions:
          - key: entity
            label: Do we have a company?
            values:
              - { key: no, label: Not yet }
              - { key: yes, label: Yes }
        steps:
          - label: Invoice from the partnership
            when: [entity=no]
            detail: Use the shared template; VAT does not apply yet.
          - label: Invoice from the company
            when: [entity=yes]
            detail: Xero issues it; VAT applies.
`;

export const PLAYBOOK = `version: 2
title: Fixture venture
description: A tiny book with a brief and a guide written in it.
events:
  - key: incorporate
    label: We incorporate
    trigger: chosen
    hint: Have the name and a director ready.
    content:
      kind: brief
      label: The paperwork
      doc:
        title: Incorporation paperwork
        description: Written in the book itself — no file beside it.
        sections:
          - title: As a company
            body: Reserve the name on the register, then appoint a director. One is enough to start.
          - title: As a partnership
            body: Sign the deed; there is no register to reserve a name on.
${FUNDING_EVENT}  - key: overview
    label: Always
    trigger: imposed
    content:
      key: overview
      label: Product overview
      kind: brief
      doc:
        title: Meme XP overview
        description: The product, as a section tree.
        sections:
          - title: Onboarding
            description: The first five minutes
            body: New users land on the template gallery and remix a meme before ever creating an account.
          - title: Economy
            description: XP, streaks, and levels
            body: XP accrues per post; streaks multiply it.
`;

export const PLAN = `title: Fixture plan
playbooks: [fixture.playbook]
locks: [entity=none]
horizon: 60
rules:
  - note: One thing at a time.
    capacity: 1
`;

export const PLAYBOOK_V1 = PLAYBOOK
  .replace("description: A tiny book with a brief and a guide written in it.",
           "description: First cut, before the funding guide existed.")
  .replace(FUNDING_EVENT, "");

export const POINTS_UPSTREAM = `title: Choosing the literature
description: The stream that PRODUCES the fixture literature.
literature: []
points:
  - id: p-selection
    label: What made the cut
    keys: []
`;

export const POINTS = `title: Venture points
description: Literature in, points out — every key a claim with a citation.
connections:
  - at: literature
    role: source
    stream: /Books/upstream.points
    label: How the literature was chosen
literature:
  - file: /Books/overview.brief
    label: Product overview (as literature)
distillation:
  - file: /Books/fixture.plan
    label: A distillation stage
points:
  - id: d-window
    label: A statutory window closes
    type: event
    defines: [window, filing]
    keys:
      - key: nature
        value: A clock the law starts.
        from:
          - file: /Books/overview.brief
            quote: the first five minutes
  - id: p-bo
    label: Beneficial ownership window
    type: event
    of: d-window
    keys:
      - key: window
        value: 10 days
        from: [/Books/overview.brief]
  - id: p-bare
    label: Something that exists
    note: Identity before shape.
`;

export const DESK_MEMORY = `title: Fixture desk
description: "Working memory over the fixture store — a saved query, never a container. Answered decisions filter the flat store; the first unanswered question groups what's left; an answer can activate narrower, localized questions."
include:
  - {param: path, op: not_contains, value: ".node/"}
  - {param: path, op: not_contains, value: ".playbook/"}
decisions:
  - key: shape
    label: Shape
    values:
      - {key: node, label: Structured nodes, activates: [pipeline]}
      - {key: doc, label: Documents, activates: [kind]}
      - {key: folder, label: Folders}
    derive:
      - {value: node, when: [{param: structured, op: equals, value: "yes"}]}
      - {value: folder, when: [{param: kind, op: equals, value: folder}]}
      - {value: doc, when: []}
  - key: kind
    label: Kind
    values: [playbook, plan, guide, brief, points, policy]
    derive:
      - {value: playbook, when: [{param: ext, op: equals, value: playbook}]}
      - {value: plan, when: [{param: ext, op: equals, value: plan}]}
      - {value: guide, when: [{param: ext, op: equals, value: guide}]}
      - {value: brief, when: [{param: ext, op: equals, value: brief}]}
      - {value: points, when: [{param: ext, op: equals, value: points}]}
      - {value: policy, when: [{param: ext, op: equals, value: policy}]}
  - key: pipeline
    label: Pipeline
    values: [triage, ready, applied]
    derive:
      - {value: triage, when: [{param: status.status, op: equals, value: triage}]}
      - {value: ready, when: [{param: status.status, op: equals, value: ready}]}
      - {value: applied, when: [{param: status.status, op: equals, value: applied}]}
`;

/* A scrape's JSON (an object whose `properties` list is the rows), the table policy over it,
 * and the .jsonl that composes them — the Data stories' live view. */
const STAY_AREAS = ["Narooma", "Central Tilba", "Dalmeny", "Bega", "Moruya", "Bermagui"];
export const STAYS_JSON = JSON.stringify({
  generated_at: "2026-09-15",
  sources: [{ site: "stayz" }, { site: "airbnb" }],
  properties: Array.from({ length: 400 }, (_, i) => ({
    name: `Stay ${i + 1}`,
    location: STAY_AREAS[(i * 7) % STAY_AREAS.length],
    distance_from_narooma_km: (i * 13) % 40,
    sleeps: 2 + (i % 7),
    available_for_dates: i % 4 !== 3,
    best_offer: i % 4 === 3 ? null : {
      price_total_aud: 500 + ((i * 137) % 3000), source_name: i % 2 ? "Airbnb" : "Stayz",
      url: `https://example.test/stay/${i + 1}?checkin=2026-10-01`,
    },
    images: [`https://example.test/img/${i + 1}.jpg`],
  })),
});
export const STAYS_POLICY = `role: table
title: Available, within the price band, cheapest first
where:
  - {field: available_for_dates, op: is_true}
  - {field: best_offer.price_total_aud, op: between, value: [600, 2000]}
sort:
  - {field: best_offer.price_total_aud, dir: asc}
  - {field: distance_from_narooma_km, dir: asc}
columns: [name, location, sleeps, best_offer.price_total_aud, distance_from_narooma_km, best_offer.source_name, best_offer.url]
`;
export const STAYS_JSONL = [
  '{"$sources": ["accommodation.json#properties"], "$policy": "stays.policy"}',
  '{"$title": "Stays by price"}',
  '{"$labels": {"best_offer.price_total_aud": "Total (4 nights, AUD)", "distance_from_narooma_km": "km from Narooma", "best_offer.url": "Link"}}',
  "",
].join("\n");

export const STAYS_MIDDLEWARE = `source: accommodation.json#properties
rules:
  - where:
      - {field: best_offer.url, op: equals, value: "https://example.test/stay/2?checkin=2026-10-01"}
    set: {available_for_dates: false}
  - where:
      - {field: location, op: equals, value: Bermagui}
    set: {distance_from_narooma_km: 27}
`;

/** The Narooma pipeline — the same stays curated in one file: items with ids, the stages, the views. */
export const STAYS_PIPELINE = `title: Stays
decisions:
  - key: method
    label: Method
    values: [{key: measured, label: Measured}, {key: anecdotal, label: Anecdotal}]
labels: {price: "Total (4 nights, AUD)", km: "km from Narooma", url: Link}
items:
  - {id: 9b2f6d1c-4e0a-4c7b-9a1d-2f5e8c3b7a10, name: Spa Unit, location: Narooma, sleeps: 2, price: 980, km: 1, available: true, url: "https://example.test/stay/1?checkin=2026-10-01"}
  - {id: 3e7a5c88-1b2d-4f0e-8a6c-d94b1e2f7c03, name: Family Room, location: Dalmeny, sleeps: 4, price: 900, km: 6, available: true, url: "https://example.test/stay/2?checkin=2026-10-01"}
  - {id: 5d0c1a77-9e8f-4b21-a3c4-6f7e8d9c0b1a, name: Beach Cabin, location: Bermagui, sleeps: 4, price: 1200, km: 27, available: true, url: "https://example.test/stay/3?checkin=2026-10-01"}
  - {id: 7a1b2c3d-4e5f-4061-8a9b-0c1d2e3f4a5b, name: The Manor, location: Tilba, sleeps: 10, price: 3400, km: 18, available: true, url: "https://example.test/stay/4?checkin=2026-10-01"}
  - {id: 0f9e8d7c-6b5a-4493-b2a1-f0e9d8c7b6a5, name: River Shack, location: Narooma, sleeps: 3, price: 640, km: 2, available: true, url: "https://example.test/stay/5?checkin=2026-10-01"}
  - {id: c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f, name: Headland House, location: Mystery Bay, sleeps: 8, price: 1900, km: 12, available: true, url: "https://example.test/stay/6?checkin=2026-10-01"}
stages:
  - key: corrections
    label: Seen on the pages
    rules:
      - item: 9b2f6d1c-4e0a-4c7b-9a1d-2f5e8c3b7a10
        set: {available: false}
        when: [method=measured]
        note: Airbnb page, 15 Sep — not available for these dates
      - item: 3e7a5c88-1b2d-4f0e-8a6c-d94b1e2f7c03
        set: {sleeps: 6}
        when: [method=anecdotal]
        note: The host said the lounge sleeps two more
      - item: 3e7a5c88-1b2d-4f0e-8a6c-d94b1e2f7c03
        set: {sleeps: 5}
        when: [method=measured]
        note: The listing's floor plan, 16 Sep — four beds and a sofa bed
      - where: [{field: location, op: equals, value: Bermagui}]
        set: {km: 30}
        when: [method=measured]
  - key: band
    label: Within the band
    filter:
      - {field: available, op: is_true}
      - {field: price, op: between, value: [600, 2000]}
  - key: cheapest
    label: Cheapest first
    sort: [{field: price, dir: asc}, {field: km, dir: asc}]
views:
  - key: by-price
    label: By price
    columns: [name, location, sleeps, price, km, url]
  - key: groups
    label: Sleeps 6+
    filter: [{field: sleeps, op: gte, value: 6}]
    columns: [name, sleeps, price, url]
  - key: close
    label: Close by
    filter: [{field: km, op: lte, value: 10}]
    sort: [{field: km, dir: asc}]
    columns: [name, km, price, url]
`;

export const STAYS_COLLECTION = `source: stays.jsonl
to: Narooma NSW
fields: [name, location, sleeps, best_offer.price_total_aud, distance_from_narooma_km, best_offer.url]
stats: [best_offer.price_total_aud, distance_from_narooma_km, best_offer.url]
labels: {best_offer.price_total_aud: "Total (AUD)", distance_from_narooma_km: "km from Narooma", best_offer.url: Link}
items:
` + JSON.parse(STAYS_JSON).properties.filter((p: { available_for_dates: boolean }) => p.available_for_dates).slice(0, 12).map((p: object, i: number) => `  - ${JSON.stringify({ id: i + 1, ...p })}`).join("\n") + `
decisions:
  - {item: 2, op: up, reason: "on the water"}
  - {item: 5, op: down, reason: "too far"}
  - {item: 7, op: hide, reason: "no photos of the rooms"}
`;


/** The Music sample — the same files as studio-demo/Music. */
export const DRUMS_CLIP = `title: Drums
tempo: 128
time: 4/4
bars: 2
channel: 10
grid: 16
lanes:
  - {name: Kick, pitch: C2, steps: "x...x...x...x... | x...x...x...x..."}
  - {name: Clap, pitch: D2, steps: "....x.......x... | ....x.......x..."}
  - {name: Hat, pitch: F#2, steps: "..x...x...x...x. | ..x...x...x...x.", length: 0.125}
  - {name: Open hat, pitch: A#2, steps: "................ | ..........o...X.", length: 0.5}
`;
export const BASS_CLIP = `title: Bass
tempo: 128
time: 4/4
bars: 4
channel: 2
velocity: 110
notes:
  - {pitch: C2, start: 0, length: 0.75}
  - {pitch: C2, start: 1.5, length: 0.75}
  - {pitch: C2, start: 3, length: 0.75}
  - {pitch: Ab1, start: 4, length: 0.75}
  - {pitch: Ab1, start: 5.5, length: 0.75}
  - {pitch: Ab1, start: 7, length: 0.75}
  - {pitch: Eb2, start: 8, length: 0.75}
  - {pitch: Eb2, start: 9.5, length: 0.75}
  - {pitch: Eb2, start: 11, length: 0.75}
  - {pitch: Bb1, start: 12, length: 0.75}
  - {pitch: Bb1, start: 13.5, length: 0.75}
  - {pitch: Bb1, start: 15, length: 0.75, velocity: 90}
`;
export const CHORDS_CLIP = `title: Chords
tempo: 128
time: 4/4
bars: 4
channel: 3
velocity: 80
notes:
  - {pitch: [C3, Eb3, G3], start: 0, length: 4}
  - {pitch: [Ab2, C3, Eb3], start: 4, length: 4}
  - {pitch: [Eb3, G3, Bb3], start: 8, length: 4}
  - {pitch: [Bb2, D3, F3], start: 12, length: 4}
`;
export const LEAD_CLIP = `title: Lead
tempo: 128
time: 4/4
bars: 2
channel: 4
notes:
  - {pitch: G4, start: 0, length: 0.5}
  - {pitch: C5, start: 0.5, length: 0.5}
  - {pitch: Eb5, start: 1, length: 1, velocity: 110}
  - {pitch: D5, start: 2, length: 0.5}
  - {pitch: C5, start: 2.5, length: 0.5}
  - {pitch: G4, start: 3, length: 1}
  - {pitch: F4, start: 4, length: 0.5}
  - {pitch: Ab4, start: 4.5, length: 0.5}
  - {pitch: G4, start: 5, length: 1, velocity: 110}
  - {pitch: Eb4, start: 6, length: 0.5}
  - {pitch: F4, start: 6.5, length: 0.5}
  - {pitch: G4, start: 7, length: 1}
`;
export const DEMO_SONG = `title: EDM 128 in C minor
tempo: 128
time: 4/4
tracks:
  - name: Drums
    channel: 10
    clips:
      - {file: drums.clip, at: 0, repeat: 8}
  - name: Bass
    clips:
      - {file: bass.clip, at: 4, repeat: 3}
  - name: Chords
    clips:
      - {file: chords.clip, at: 0, repeat: 4}
  - name: Lead
    clips:
      - {file: lead.clip, at: 8, repeat: 4}
`;

const fs = memoryFs({
  "/Music": null,
  "/Music/drums.clip": DRUMS_CLIP,
  "/Music/bass.clip": BASS_CLIP,
  "/Music/chords.clip": CHORDS_CLIP,
  "/Music/lead.clip": LEAD_CLIP,
  "/Music/demo.song": DEMO_SONG,
  "/Narooma": null,
  "/Narooma/stays.collection": STAYS_COLLECTION,
  "/Narooma/accommodation.json": STAYS_JSON,
  "/Narooma/stays.policy": STAYS_POLICY,
  "/Narooma/stays.jsonl": STAYS_JSONL,
  "/Narooma/corrections.middleware": STAYS_MIDDLEWARE,
  "/Narooma/stays.pipeline": STAYS_PIPELINE,
  "/Narooma/stays-out.jsonl": '{"$sources": ["stays.pipeline#by-price"], "$title": "Stays, out of the pipeline"}\n',
  "/Narooma/stays-corrected.jsonl": STAYS_JSONL.replace("accommodation.json#properties", "corrections.middleware"),
  "/Books": null,
  "/Books/fixture.playbook": PLAYBOOK,
  "/Books/launch.playbook": null,
  "/Books/launch.playbook/01 first cut.playbook": PLAYBOOK_V1,
  "/Books/launch.playbook/02 current.playbook": PLAYBOOK,
  "/Books/launch.playbook/versions.md": `# Versions — launch.playbook

## 01 first cut — 2026-08-20

The skeleton: events and one topic, enough to walk the launch.

## 02 current — 2026-08-22

Banking added after the first dry run showed the money story was missing.
`,
  "/Books/overview.brief": BRIEF,
  "/Books/apps.node": null,
  "/Books/apps.node/schema.schema": `type: kanban
title: Job applications
columns:
  - {id: triage, label: Triage, detail: "being analyzed"}
  - {id: ready, label: Ready to apply}
  - {id: applied, label: Applied}
  - {id: outcome, label: Outcome}
`,
  "/Books/apps.node/content.list": `title: Applications
items:
  - {label: "Acme — Senior Engineer", company: Acme, column: triage, url: "https://example.com/acme"}
  - {label: "BeaconPay — Staff Engineer", company: BeaconPay, column: triage}
  - {label: "Nimbus — Product Engineer", company: Nimbus, column: ready}
  - {label: "Docked — iOS Lead", company: Docked, column: applied}
  - {label: "Typo'd row", company: Nowhere, column: aplied}
`,
  "/Books/fund-the-venture.guide": GUIDE,
  "/Books/fixture.plan": PLAN,
  "/Books/upstream.points": POINTS_UPSTREAM,
  "/Books/lead.node": null,
  "/Books/lead.node/schema.schema": `type: composite
title: Acme — Senior Engineer
description: One job ad assembled from its streams, split by WHO authors each stream's changes.
streams:
  - id: details
    label: Job details
    detail: "The ad as the market states it — verbatim from the scrape, never hand-edited."
    driver: observed
    source: Jobboard scrape
    cadence: daily
  - id: tags
    label: My tags
    detail: "The market's words translated into my model by the ranking policy."
    driver: derived
    via: /Books/ranking.policy
    of: details
  - id: status
    label: Pipeline status
    detail: "Where this ad sits in my process — the truth is the moves themselves."
    driver: authored
    via: /Books/apps.node
`,
  "/Books/lead.node/content.list": `title: Acme — Senior Engineer
description: "Arrivals — one row per piece of information, tagged with its stream and date. Dates are fixed in the past so the staleness states stay visible: details has outrun tags (input moved) and is itself past its daily cadence (stale)."
items:
  - label: Daily jobboard sync
    stream: details
    at: 2026-08-20
    title: Senior Engineer
    company: Acme
    location: Sydney (hybrid)
    url: https://example.com/acme
  - label: Ranking run
    stream: tags
    at: 2026-08-20
    of: details@2026-08-20
    rules: ranking.policy
    platform: other
    level: senior
    relocation: "no"
    employer: open
  - label: Daily jobboard sync
    stream: details
    at: 2026-08-22
    salary: not stated
    fit: platform build role at a product company
  - label: Filed at triage from the ranking run
    stream: status
    at: 2026-08-22
    status: triage
  - label: Mistyped arrival
    stream: detials
    at: 2026-08-22
`,
  "/Books/ranking.policy": `title: Ranking
description: A stand-in policy the derived stream points at.
decisions:
  - key: platform
    label: Platform
    values:
      - {key: ios, label: iOS}
      - {key: other, label: Not iOS}
`,
  "/memory": null,
  "/memory/desk.memory": DESK_MEMORY,
  // Frames: a dashboard that EMBEDS the app shell and fills its content slot.
  "/Design": null,
  "/Design/scaffold.frame": SCAFFOLD_FRAME,
  "/Design/dashboard.frame": DASHBOARD_FRAME,
  "/Design/make-offer.frame": PHONE_FRAME,
  // Flows: states that are documents (two versions of one brief), and a
  // buyer walkthrough with entries, dispatching controls and a local.
  "/Flows": null,
  "/Flows/org-structure.flow": ORG_FLOW,
  "/Flows/overview.brief": BRIEF,
  "/Flows/org-structure": null,
  "/Flows/org-structure/before": null,
  "/Flows/org-structure/before/org.brief": BRIEF.replace("title: Meme XP overview", "title: Meme XP — the collective"),
  "/Flows/org-structure/after": null,
  "/Flows/org-structure/after/org.brief": BRIEF.replace("title: Meme XP overview", "title: Meme XP Pty Ltd"),
  "/Flows/buyer.flow": BUYER_FLOW,
  "/Books/claimed.csv": `Client,Service Date,Duration,Charge,Notes
Roya Rezaei,13/07/2026,1,90,
Jenine Mourtada,13/07/2026,1,90,
Sohail Amiri,14/07/2026,1,55,
Sohail Amiri,14/07/2026,1,55,
Sohail Amiri,14/07/2026,1,55,
Kayden Porter,04/08/2026,0.5,55,pickup
,,,,
,,Therapy Assistant Hours,3.5,
`,
  "/Books/billed.csv": `Client,Service Date,Duration,Charge
Roya Rezaei,13/07/2026,1,90
Jenine Mourtada,13/07/2026,2,90
Sohail Amiri,14/07/2026,3,55
Kayden Porter,04/08/2026,0.5,55
Kayden Porter,04/08/2026,0.5,55
Irfaan Azizi,15/07/2026,1,55
`,
});

/** A script — read before it runs; Run is disabled in stories, which have no runner. */
export const SCRIPT = `title: Rebuild the index
description: Walks the folder and writes the index beside it.
language: python
env:
  INDEX_DIR: C:\Github\index
  DRY_RUN: "1"
cwd: ..
code: |
  import os
  print("rebuilding", os.environ["INDEX_DIR"])
`;

/** One list with every role named, so the five role views have something to show, and a page view of what is open. */
export const VIEWS = `title: Launch
description: The work to the launch, seen five ways.
fields:
  id: key
  title: name
  status: stage
  start: from
  end: to
  previous: after
  parent: under
columns: [To do, Doing, Done]
views:
  - {key: all, kind: table}
  - {key: open, kind: kanban, label: Open work, filter: [{field: stage, op: not_equals, value: Done}]}
  - {key: month, kind: calendar}
  - {key: plan, kind: gantt}
  - {key: chain, kind: tree}
  - key: report
    kind: page
    label: Report
    filter: [{field: stage, op: not_equals, value: Done}]
    template: |
      <style>body { font: 14px/1.5 system-ui, sans-serif; margin: 1.5rem; } small { color: #656d76; }</style>
      <h1>{{ title }}: {{ view.label }} <small>{{ items | length }} open</small></h1>
      <ul>{% for item in items %}<li><b>{{ item[fields.title] }}</b> — {{ item.stage }}</li>{% endfor %}</ul>
items:
  - {key: plan, name: Plan the launch, stage: Done, from: 2026-10-01, to: 2026-10-03, owner: Maher}
  - {key: build, name: Build it, stage: Doing, after: plan}
  - {key: api, name: The API, stage: Doing, from: 2026-10-04, to: 2026-10-07, under: build}
  - {key: ui, name: The UI, stage: To do, from: 2026-10-07, to: 2026-10-10, under: build, after: api}
  - {key: test, name: Test it, stage: To do, from: 2026-10-08, to: 2026-10-12, after: [build]}
  - {key: ship, name: Ship, stage: To do, from: 2026-10-13, to: 2026-10-13, after: [build, test]}
`;

/** A page — the model rendered through a layout, a macro and an included partial, in the sandboxed frame. */
export const PAGE = `title: Team roster
model:
  team: Platform
  people:
    - {name: Ada Lovelace, role: Lead, since: 2026-10-01}
    - {name: Alan Turing, role: Research, since: 2026-11-15}
partials:
  layout: |
    <!doctype html>
    <style>
      body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem; color: #1f2328; }
      .card { border: 1px solid #d0d7de; border-radius: 8px; padding: .75rem 1rem; margin: .5rem 0; }
      small { color: #656d76; }
    </style>
    <main>{% block body %}{% endblock %}</main>
  person: |
    <div class="card"><b>{{ person.name }}</b> — {{ person.role }} <small>since {{ person.since }}</small></div>
template: |
  {% extends "layout" %}
  {% block body %}
    <h1>{{ team }} <small>{{ people | length }} people</small></h1>
    {% for person in people %}{% include "person" %}{% endfor %}
  {% endblock %}
`;

export const PROJECT = `name: Fixture venture
description: One container over the fixture files.
items:
  - label: Strategy
    items:
      - file: /Books/fixture.playbook
        label: The playbook
      - file: /Books/fixture.plan
  - node: /Books
    label: Book files
`;

/** Point the viewers at the fixture tree. Idempotent; call at story module load. */
export function useFixtureFs(): void {
  configureFileKinds({
    readFile: (abs) => fs.read(abs).then((r) => r.content),
    listFiles: (abs) => fs.list(abs),
    // In-memory writes: versioned-file authoring works live in the catalog.
    writeFile: (abs, content) => fs.write(abs, content),
  });
}
