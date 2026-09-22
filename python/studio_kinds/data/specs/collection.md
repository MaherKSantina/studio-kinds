# .collection — Collection

## The engine's account

The check is `python/studio_kinds/kinds/collection.py` in the studio-kinds repository; the account below is that engine's own.

The `.collection` kind — rows to decide over, one at a time. Made from a
`.jsonl` or a `.pipeline` view ("Collect", or `studio-check --collect`):
the rows are COPIED in, with the view's fields and labels, so the
collection holds them and stands still while the data it was copied from
moves on. The copy is a handover, not a link: nothing points back, and a
decision and the row it was taken about can never drift apart. Then the
decisions: push an item up, push it down, hide it, each with a reason in
plain words. The decisions are a LOG, never applied to the items — the
order shown is derived (below), and a later step reads the reasons to
write the rules that produce the same order.

Shape (YAML):

  to: Narooma NSW                     # where directions go (the view asks once)
  fields: [name, location, sleeps, best_offer.price_total_aud]   # the facts shown, in order
  stats: [best_offer.price_total_aud, distance_from_narooma_km, best_offer.url]   # the big cards
  labels: {best_offer.price_total_aud: "Total (4 nights, AUD)"}
  items:                              # the rows, each with an `id` given at copy time
    - {id: 1, name: ..., featured: "https://…/2.jpg", ...}   # `featured`: the picture that stands for it
  decisions:                          # in the order taken
    - {item: 3, op: down, reason: "56 km from town"}
    - {item: 7, op: hide, reason: "shared bathroom"}
    - {item: 12, op: up, reason: "on the water"}
    - {item: 7, op: show}             # a hide taken back

The order shown: each item's RANK is its ups minus its downs; items sort
by rank descending, ties in their copied order; an item whose last
hide/show is a hide is HIDDEN (kept in the file, shown on request). A
decision naming an item that is not there, an unknown op, or a missing
reason is a PROBLEM.

An item's FIELDS may be edited in place (a commute time looked up, a
picture chosen as `featured`): that changes the item itself, with no
decision and no reason — a decision is about the item's standing, an
edit is about what is known of it.

## A fresh document (what the Studio creates)

```yaml
to: Narooma NSW
fields: [name]
items: []
decisions: []
```

