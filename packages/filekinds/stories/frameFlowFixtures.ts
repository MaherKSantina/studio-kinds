/** Fixtures for the frame and flow kinds — lifted from real legacy documents
 *  (a Caseload app shell embedded by a dashboard; the Meme XP org-structure
 *  flow whose states are two versions of one brief; a buyer checkout flow
 *  with entries, dispatching controls and a screen-local radio). */

export const SCAFFOLD_FRAME = `title: Caseload — App Shell
frames:
  - id: f1
    name: App Shell
    width: 1440
    height: 900
nodes:
  - id: root
    frame: f1
    name: Layout
    kind: hstack
    expand: true
    props: { gap: 0, padding: 0, align: stretch }
  - id: sidebar
    frame: f1
    parent: root
    name: Sidebar
    kind: vstack
    fixed: true
    width: 248
    props: { gap: 8, padding: 16, align: stretch, background: "#14281d" }
  - id: brand
    frame: f1
    parent: sidebar
    name: Brand
    kind: vstack
    props: { gap: 1, padding: 6 }
  - id: brandTitle
    frame: f1
    parent: brand
    name: Brand title
    kind: text
    props: { text: "Caseload", fontSize: 16, color: "#ffffff" }
  - id: brandSub
    frame: f1
    parent: brand
    name: Brand sub
    kind: text
    props: { text: "SECURE CLIENT RECORDS", fontSize: 9, color: "#7f9488" }
  - id: nav
    frame: f1
    parent: sidebar
    name: Nav
    kind: vstack
    props: { gap: 2, padding: 0 }
  - id: navDashboard
    frame: f1
    parent: nav
    name: Dashboard item
    kind: box
    props: { padding: 9, background: "#23492f", borderRadius: 8 }
  - id: navDashboardText
    frame: f1
    parent: navDashboard
    name: label
    kind: text
    props: { text: "Dashboard", fontSize: 13, color: "#ffffff" }
  - id: navClients
    frame: f1
    parent: nav
    name: Clients item
    kind: box
    props: { padding: 9, borderRadius: 8 }
  - id: navClientsText
    frame: f1
    parent: navClients
    name: label
    kind: text
    props: { text: "Clients", fontSize: 13, color: "#b6c6bc" }
  - id: sidebarSpacer
    frame: f1
    parent: sidebar
    name: Spacer
    kind: spacer
  - id: profile
    frame: f1
    parent: sidebar
    name: Profile
    kind: vstack
    props: { gap: 1, padding: 6 }
  - id: profileName
    frame: f1
    parent: profile
    name: Profile name
    kind: text
    props: { text: "Fatin Jebeili", fontSize: 13, color: "#ffffff" }
  - id: main
    frame: f1
    parent: root
    name: Main
    kind: vstack
    expand: true
    props: { gap: 0, padding: 0, align: stretch }
  - id: topbar
    frame: f1
    parent: main
    name: Top bar
    kind: hstack
    fixed: true
    height: 56
    props: { gap: 10, padding: 16, align: center, background: "#ffffff", borderWidth: 1, borderColor: "#e6e8eb" }
  - id: topTitle
    frame: f1
    parent: topbar
    name: Title
    kind: text
    props: { text: "Dashboard", fontSize: 15, color: "#1b1b1b" }
  - id: topSpacer
    frame: f1
    parent: topbar
    name: Spacer
    kind: spacer
  - id: search
    frame: f1
    parent: topbar
    name: Search
    kind: input
    fixed: true
    width: 280
    props: { placeholder: "Search clients, notes…" }
  - id: content
    frame: f1
    parent: main
    name: Content
    kind: slot
    expand: true
    props: { name: content, background: "#eef1f3" }
`;

export const DASHBOARD_FRAME = `title: Dashboard
frames:
  - id: f1
    name: Dashboard
    width: 1440
    height: 900
nodes:
  - id: shell
    frame: f1
    name: App Shell
    kind: embed
    props:
      ref_path: scaffold.frame
    expand: true
  - id: page
    frame: f1
    parent: shell
    name: Page
    kind: vstack
    props:
      slot: content
      gap: 18
      padding: 28
      align: stretch
    expand: true
  - id: date
    frame: f1
    parent: page
    name: Date
    kind: text
    props:
      text: WEDNESDAY · 18 JUNE 2026
      fontSize: 10
      color: '#8a94a6'
  - id: title
    frame: f1
    parent: page
    name: Title
    kind: text
    props:
      text: Good morning, Fatin
      fontSize: 24
      color: '#101828'
  - id: stats
    frame: f1
    parent: page
    name: Stats
    kind: hstack
    props:
      gap: 16
      padding: 0
      align: stretch
  - id: stat1
    frame: f1
    parent: stats
    name: Stat sessions
    kind: vstack
    expand: true
    props: { gap: 6, padding: 16, background: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e6e8eb' }
  - id: stat1Num
    frame: f1
    parent: stat1
    name: num
    kind: text
    props: { text: '4', fontSize: 26, color: '#101828' }
  - id: stat1Lbl
    frame: f1
    parent: stat1
    name: lbl
    kind: text
    props: { text: Sessions today, fontSize: 11, color: '#667085' }
  - id: stat2
    frame: f1
    parent: stats
    name: Stat followups
    kind: vstack
    expand: true
    props: { gap: 6, padding: 16, background: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e6e8eb' }
  - id: stat2Num
    frame: f1
    parent: stat2
    name: num
    kind: text
    props: { text: '3', fontSize: 26, color: '#101828' }
  - id: stat2Lbl
    frame: f1
    parent: stat2
    name: lbl
    kind: text
    props: { text: Open follow-ups, fontSize: 11, color: '#667085' }
  - id: body
    frame: f1
    parent: page
    name: Body
    kind: hstack
    expand: true
    props: { gap: 16, padding: 0, align: stretch }
  - id: schedule
    frame: f1
    parent: body
    name: Schedule card
    kind: vstack
    expand: true
    props: { gap: 10, padding: 18, background: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e6e8eb' }
  - id: schedTitle
    frame: f1
    parent: schedule
    name: t
    kind: text
    props: { text: Today's schedule, fontSize: 15, color: '#101828' }
  - id: schedRow1
    frame: f1
    parent: schedule
    name: r1
    kind: text
    props: { text: "09:00   Ruby Castellano · Early Intervention", fontSize: 12, color: '#475467' }
  - id: schedRow2
    frame: f1
    parent: schedule
    name: r2
    kind: text
    props: { text: "10:30   Mason Whitfield · Behaviour Support", fontSize: 12, color: '#475467' }
  - id: tasks
    frame: f1
    parent: body
    name: Tasks card
    kind: vstack
    fixed: true
    width: 380
    props: { gap: 10, padding: 18, background: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e6e8eb' }
  - id: tasksTitle
    frame: f1
    parent: tasks
    name: t
    kind: text
    props: { text: Follow-up tasks, fontSize: 15, color: '#101828' }
  - id: task1
    frame: f1
    parent: tasks
    name: task1
    kind: text
    props: { text: "☐  Submit incident review for Aaliyah", fontSize: 12, color: '#475467' }
views:
  - id: v1
    name: Empty day
    hidden: [stats, schedule]
`;

export const PHONE_FRAME = `title: Make an offer
frames:
  - id: f1
    name: Make an offer
    width: 390
    height: 844
nodes:
  - id: screen
    frame: f1
    name: Screen
    kind: vstack
    expand: true
    props: { gap: 0, padding: 0, align: stretch, background: "#F2F2F7" }
  - id: navbar
    frame: f1
    parent: screen
    name: Nav bar
    kind: hstack
    fixed: true
    height: 88
    props: { gap: 8, padding: 16, align: end, background: "#ffffff" }
  - id: close
    frame: f1
    parent: navbar
    name: Close
    kind: text
    props: { text: "✕", fontSize: 18, color: "#1C1C1E" }
  - id: navTitle
    frame: f1
    parent: navbar
    name: Title
    kind: text
    props: { text: "Make an Offer", fontSize: 17, fontWeight: "600", textAlign: center, color: "#1C1C1E" }
  - id: body
    frame: f1
    parent: screen
    name: Body
    kind: scroll
    expand: true
    props: { gap: 14, padding: 16, align: stretch }
  - id: listing
    frame: f1
    parent: body
    name: Listing card
    kind: hstack
    props: { gap: 12, padding: 12, background: "#ffffff", borderRadius: 12, align: center }
  - id: thumb
    frame: f1
    parent: listing
    name: Thumb
    kind: image
    fixed: true
    width: 56
    height: 56
    props: { borderRadius: 8 }
  - id: listingText
    frame: f1
    parent: listing
    name: Text
    kind: vstack
    expand: true
    props: { gap: 2 }
  - id: listingTitle
    frame: f1
    parent: listingText
    name: Title
    kind: text
    props: { text: "Listing title", fontSize: 15, fontWeight: "600" }
  - id: listingPrice
    frame: f1
    parent: listingText
    name: Price
    kind: text
    props: { text: "$1,200", fontSize: 13, color: "#6B6B70" }
  - id: offerLabel
    frame: f1
    parent: body
    name: Offer label
    kind: text
    props: { text: "Your offer", fontSize: 13, color: "#6B6B70" }
  - id: offer
    frame: f1
    parent: body
    name: Offer input
    kind: input
    fixed: true
    height: 52
    props: { placeholder: "$0", fontSize: 17 }
  - id: delivery
    frame: f1
    parent: body
    name: Delivery
    kind: vstack
    props: { gap: 8, padding: 12, background: "#ffffff", borderRadius: 12 }
  - id: deliveryLabel
    frame: f1
    parent: delivery
    name: Label
    kind: text
    props: { text: "Delivery method", fontSize: 13, color: "#6B6B70" }
  - id: pickup
    frame: f1
    parent: delivery
    name: Pickup row
    kind: text
    props: { text: "◉  Pickup", fontSize: 15 }
  - id: divider
    frame: f1
    parent: delivery
    name: Divider
    kind: divider
  - id: shipping
    frame: f1
    parent: delivery
    name: Shipping row
    kind: text
    props: { text: "○  Shipping", fontSize: 15 }
  - id: address
    frame: f1
    parent: body
    name: Address
    kind: input
    fixed: true
    height: 52
    props: { placeholder: "Start typing your address" }
  - id: footer
    frame: f1
    parent: screen
    name: Footer
    kind: vstack
    fixed: true
    height: 96
    props: { padding: 16, background: "#ffffff" }
  - id: cta
    frame: f1
    parent: footer
    name: Continue
    kind: button
    fixed: true
    height: 52
    props: { text: "Continue", background: "#1B7A3D", color: "#ffffff", borderRadius: 26 }
views:
  - id: v1
    name: Pickup
    hidden: [address]
  - id: v2
    name: Shipping
    hidden: []
`;

export const ORG_FLOW = `title: Meme XP — org structure
description: |-
  What the organisation IS, and the one event that changes it. Each state shows a \`.brief\`;
  pressing "On Incorporation" swaps which version of it you are reading.
dimensions:
  incorporated:
    - false
    - true
defaults:
  incorporated: false
sources:
  - name: before
    path: org-structure/before
    description: The collective, as it stands with no registered entity.
  - name: after
    path: org-structure/after
    description: The same project once a private company is registered.
initial: org
start_mode: screen
screens:
  - id: org
    title: Org structure
    description: Who the organisation is in law, who decides, who holds the money, and who carries the risk.
    variants:
      - when:
          incorporated: false
        label: Unincorporated collective
        description: No legal person exists. Every commitment is somebody's personal commitment.
        content:
          - file: org.brief
            source: before
            label: Org structure — today
      - when: '*'
        label: Registered company
        description: A separate legal person now stands between the people doing the work and everyone else.
        content:
          - file: org.brief
            source: after
            label: Org structure — once registered
    edges:
      - id: e_incorporate
        event: On Incorporation
        when:
          incorporated: false
        sets:
          incorporated: true
        description: Registration of the private company. No to — you stay on this screen; only the answer changed.
      - id: e_options
        event: Compare the structures that were considered
        to: options
      - id: e_unwind
        event: Back to before incorporation
        when:
          incorporated: true
        sets:
          incorporated: false
  - id: options
    title: Structure options
    description: The structures that were on the table before one was chosen.
    content:
      - file: overview.brief
        label: Structure comparison
    edges:
      - id: e_back
        event: Back to the org structure
        to: org
---
active: v1
views:
  - id: v1
    name: Default
    layout:
      params:
        incorporated: false
      tab: screens
      focus: org
`;

export const BUYER_FLOW = `title: Buyer — offers and checkout
description: A buyer's path through offers, transcribed from a walkthrough. High level on purpose.
dimensions:
  deliveryMethod: [unset, shipping, inPerson]
  conversationState: [can_make_offer, offer_sent, counter_offer_received, can_pay_seller, order_submitted]
defaults:
  deliveryMethod: unset
  conversationState: can_make_offer
start_mode: entries
entries:
  - id: en1
    event: Can Make Offer
    to: messageList
    sets: {conversationState: can_make_offer}
  - id: en2
    event: Can Pay Seller
    to: messageList
    sets: {conversationState: can_pay_seller}
  - id: en3
    event: Counter Offer Received
    to: messageList
    sets: {conversationState: counter_offer_received}
screens:
  - id: messageList
    title: Message List
    variants:
      - when: {conversationState: order_submitted}
        label: Order submitted
        screenshot: shots/message-list-submitted.png
      - when: {conversationState: can_pay_seller}
        label: Pay seller
        screenshot: shots/message-list-pay.png
      - when: {conversationState: counter_offer_received}
        label: Counter offer
        screenshot: shots/message-list-counter.png
      - when: {conversationState: offer_sent}
        label: Existing offer
        screenshot: shots/message-list-sent.png
      - when: '*'
        label: Can make offer
        screenshot: shots/message-list.png
    edges:
      - id: e1
        event: CTA Press
        when: {conversationState: [can_make_offer, can_pay_seller]}
        dispatch:
          - when: {conversationState: can_make_offer}
            to: makeOffer
            sets: {deliveryMethod: unset}
          - when: {conversationState: can_pay_seller}
            to: checkoutInfo
      - id: e2
        event: Ribbon tap
        when: {conversationState: [offer_sent, counter_offer_received, order_submitted]}
        dispatch:
          - when: {conversationState: counter_offer_received}
            to: respondCounter
          - when: {conversationState: order_submitted}
            to: orderSummary
          - when: {conversationState: offer_sent}
            to: makeOffer
  - id: makeOffer
    title: Buyer Make An Offer
    variants:
      - when: {deliveryMethod: inPerson}
        label: In person
        content:
          - file: ../Design/make-offer.frame
            label: Pickup
      - when: {deliveryMethod: shipping}
        label: Shipping
        description: Buyer enters a delivery address; only suburb and postcode reach the seller.
        content:
          - file: ../Design/make-offer.frame
            label: Shipping
      - when: '*'
        label: Initial
        content:
          - file: ../Design/make-offer.frame
            label: Initial
    edges:
      - id: e3
        event: Pickup
        sets: {deliveryMethod: inPerson}
      - id: e4
        event: Shipping
        sets: {deliveryMethod: shipping}
      - id: e5
        event: Continue
        description: An in-person offer submits from here; only a shipping offer gets a review step.
        when: {deliveryMethod: [inPerson, shipping]}
        dispatch:
          - when: {deliveryMethod: inPerson}
            to: messageList
            sets: {conversationState: offer_sent}
          - when: {deliveryMethod: shipping}
            to: reviewOffer
  - id: reviewOffer
    title: Buyer Review Offer Shipping
    screenshot: shots/review.png
    edges:
      - id: e6
        event: Submit
        to: messageList
        sets: {conversationState: offer_sent}
  - id: respondCounter
    title: Buyer Respond to Counter Offer
    locals:
      counterResponse: [none, accept, decline]
    variants:
      - when: {counterResponse: accept}
        label: Accept
      - when: {counterResponse: decline}
        label: Decline
      - when: '*'
        label: Initial
        description: Values the seller changed carry an "Updated" chip.
    edges:
      - id: e7
        event: Accept
        sets: {counterResponse: accept}
      - id: e8
        event: Decline
        sets: {counterResponse: decline}
      - id: e9
        event: Continue
        when: {counterResponse: '!none'}
        dispatch:
          - when: {counterResponse: accept}
            to: checkoutInfo
          - when: {counterResponse: decline}
            to: messageList
            sets: {conversationState: can_make_offer}
  - id: checkoutInfo
    title: Checkout Info
    description: ONE screen with two states; deliberately no catch-all — an order being paid always carries a method.
    variants:
      - when: {deliveryMethod: inPerson}
        label: In person
      - when: {deliveryMethod: shipping}
        label: Shipping
    edges:
      - id: e10
        event: Continue to payment
        dispatch:
          - when: {deliveryMethod: inPerson}
            to: checkoutPayment
          - when: {deliveryMethod: shipping}
            to: checkoutAddress
  - id: checkoutAddress
    title: Checkout Name and Address - Shipping
    edges:
      - id: e11
        event: Continue to payment
        to: checkoutPayment
  - id: checkoutPayment
    title: Checkout Payment
    edges:
      - id: e12
        event: Pay successfully
        to: checkoutSuccess
      - id: e14
        event: Payment declined
        to: checkoutFailure
  - id: checkoutSuccess
    title: Checkout Payment Successful
    edges:
      - id: e13
        event: Done
        to: messageList
        sets: {conversationState: order_submitted}
  - id: checkoutFailure
    title: Checkout Payment Failed
  - id: orderSummary
    title: Order Summary - Order Submitted
---
active: v_1
views:
  - id: v_1
    name: Shipping offer sent
    layout:
      params: {deliveryMethod: shipping, conversationState: offer_sent}
      tab: screens
      focus: messageList
`;
