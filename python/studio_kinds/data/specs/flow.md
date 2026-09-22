# .flow — Flow

## The engine's account

The check is `python/studio_kinds/kinds/flow.py` in the studio-kinds repository; the account below is that engine's own.

`.flow` — a walkthrough whose screens and edges are PARAMETERISED.

WHY this exists, and why it is not `.walkthrough` with extra fields:

A `.walkthrough` state is one screen in one condition. The moment a screen renders differently
depending on data — a listing's shipping type, a feature flag, whether the seller already
countered — the only way to say so is to author a SECOND state with a different title. That is
how a 20-state flow becomes a 40-state flow, and it is where the format starts lying: three
edges out of one screen look identical whether they are three buttons the user can choose
between or ONE button that dispatches on data the user never sees. The event label is free text,
so the distinction survives only as prose ("Continue Free" / "Continue - Free Shipping" /
"Shipping - SYI Shipping Free" are all the same idea, written three ways), and the derived `.dag`
drops event labels entirely so it cannot survive there at all.

So this format splits the two axes that `.walkthrough` conflates:

  • DIMENSIONS — the closed parameter space (copied wholesale from `.analysis`: named dimensions
    with finite ordered value sets, and the same `when` grammar — bare value equals, [a,b] one-of,
    "*" any, "!x" not-equal). A screen declares VARIANTS over that space instead of splitting
    into several screens.
  • EDGES — navigation. An edge is either unconditional (`to:`) or a DISPATCH (`dispatch:` — a
    precedence-ordered list of when/to, first match wins). Unconditional versus dispatch is a
    TYPE distinction, so "same button, different data" is no longer a naming convention.

An edge may also `sets:` dimension values, because some parameters are established by walking
the flow rather than fixed before it starts (the seller countering is what makes the buyer see a
counter-offer). Without that, every such parameter would have to be ambient and the flow could
only ever model one moment.

DELIBERATELY NOT a simulator of the real app. Derived values are first-match-wins rules over
declared literals, not expressions; there is no arithmetic, no strings, no user-defined
functions. The point is to validate what is about to be built and stay cheap to author — the
moment this needs a real evaluator, the answer is that the app should be running instead.

WHAT A STATE SHOWS is in this file, or is an image beside it. A state's `content` is a list of
PANELS, stepped through one at a time: `{screenshot: <key>}`, an image in the flow's own assets
folder, or `{frame: <name>, view: <view>}` — one of the flow's own `frames:`, whole `.frame`
bodies written in by name, drawn live at one of its views, so the states of a screen point at
different views of the SAME frame. A panel names no other document.

FILE SHAPE: two YAML documents separated by a line that is exactly `---`. Doc 1 is the MODEL
(hand-authored). Doc 2 is the VIEWS (saved parameter sets and layout; the preview writes back
only this half): the thing you explore with is not the thing you author.

Named as gone: `sources`, `default_source`, and `file`, `source` or `agent` on a panel — they
drew a document from another folder into a state.

## A fresh document (what the Studio creates)

```yaml
# A .flow file is TWO YAML docs separated by a line that is just '---'.
# Doc 1 = MODEL (dimensions + screens, each screen carrying its own controls). Doc 2 = VIEWS.
#
# A .flow is a walkthrough whose screens and navigation are PARAMETERISED. A screen that renders
# differently under different data is ONE screen with variants — not several screens with
# different titles. Its CONTROLS live on it, in its own `edges:` list; there is no top-level
# `edges` and no `from` field, because a button belongs to the page it sits on.
#
# TWO SCOPES, and choosing between them is the main decision you make here:
#   dimensions      — facts about the world that outlive a screen (a flag, what the listing is)
#   screen.locals   — that screen's own UI state (which radio is selected, which step you are on).
#                     Locals RESET every time you arrive from elsewhere, and no other screen sees
#                     them. If only one screen reads it, make it a local.
title: untitled

# Closed, ordered value sets. The whole space is finite so coverage is computable.
dimensions:
  shippingType: [free_shipping, flat_rate, price_on_request]
  featureFlag: [true, false]

# The starting assignment for a simulation. Anything omitted is simply unset.
defaults:
  shippingType: flat_rate
  featureFlag: true

# First-match-wins rules producing another dimension. `value: "= otherDim"` copies a dimension
# instead of writing a literal — enough for "a flag overrides a data value", and no more.
derived:
  - name: effectiveShipping
    values: [free_shipping, flat_rate, none]
    rules:
      - when: { featureFlag: false }
        value: none
      - when: { shippingType: price_on_request }
        value: none
      - when: "*"
        value: "= shippingType"

initial: home
start_mode: screen          # or 'entries' + an `entries:` list of start events

# WHAT A STATE SHOWS. A screenshot is one kind of evidence, not the definition of the format:
# a state's `content` is a list of PANELS, stepped through one at a time.
#   - { screenshot: <storage key> }        an image in this flow's assets folder
#   - { frame: login, view: Loading }      a frame kept IN this file under `frames:`, drawn LIVE at
#                                          one of its views — the states of a screen point at
#                                          different views of the SAME frame; its scroll is its own
# `screenshot:`/`screenshots:` below are the screenshot-only shorthand for the same thing —
# write those when a state is only images; `frame:` + `view:` is the frame-only shorthand.
# A panel names no other document: what a state shows is in this file, or is an image beside it.

screens:
  - id: home
    title: Home
    screenshot: <storage key>          # or screenshots: [top.png, bottom.png] for a tall screen
    edges:
      - id: e1
        event: Checkout       # ONE control, going one place.
        to: checkout

  - id: checkout
    title: Checkout
    # Variables this screen OWNS. First value listed is the default; arriving here resets them.
    locals:
      agreed: [false, true]
    # First matching variant wins. Give the last one `when: "*"` so every configuration renders.
    # A `when` here may read the dimensions, the derived values, or this screen's own locals.
    variants:
      - when: { effectiveShipping: free_shipping }
        label: Free shipping
        description: Shows the "Free shipping" chip beside $0.00.
        screenshot: <storage key>
      - when: "*"
        label: Paid shipping
        # The general form: a capture AND the document that explains it, in that order.
        content:
          - { screenshot: <storage key> }
          - { frame: login, view: Terms, label: Shipping terms }
    edges:
      # No `to` = STAYS on this screen. `sets` moves it to another of its own states — a radio,
      # a checkbox, a step of a form. This is what a self-transition used to be.
      - id: e2
        event: Agree to the terms
        when: { agreed: false }
        sets: { agreed: true }
      # `when` decides whether a control is OFFERED AT ALL. Do NOT write a dispatch whose
      # branches all fail to say a button is absent — say it here.
      - id: e3
        event: Pay
        when: { agreed: true }
        # `dispatch` is for when the DESTINATION varies. First match wins.
        dispatch:
          - when: { effectiveShipping: none }
            to: home
          - when: "*"
            to: home
        sets: { featureFlag: true }   # applied on arrival; may seed a local of the target screen

# when matching: bare value = equals · [a, b] = one-of · "*" = any · "!x" = not-equal

# FRAMES KEPT IN THIS FILE — whole .frame bodies by name; a state shows one with `frame: <name>`.
frames:
  login: { title: Login, nodes: [], views: [{ name: Terms }] }
---
active: v1
views:
  - id: v1
    name: Free shipping
    layout:
      params: { shippingType: free_shipping, featureFlag: true }
      tab: screens          # screens | map | changes
      labelVariants: true
```

