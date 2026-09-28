# .analysis — Analysis

## The engine's account

The check is `python/studio_kinds/kinds/analysis.py` in the studio-kinds repository; the account below is that engine's own.

The `.analysis` file kind: a decision over CLOSED INPUTS. `dimensions` name
the inputs and every value each can take; `rules`, in precedence order, say
what follows from a combination — `when` over the inputs, `then` the outputs;
the FIRST rule whose `when` holds decides — and `outcome` names the output
key that is the result. Opened, every combination of the inputs is drawn as
a tree, nested in the order the inputs are dragged into, each leaf the rule
that decides there and coloured by its outcome; locking input values and
pinning output values narrow the tree. The order, the locks, the pins and
the folds are the page's for the session: nothing on the page writes the
file.

Authoring shape (YAML, lenient — a half-written file still renders):

  title: Message list banner
  description: one line
  dimensions:                 # the inputs — each a list of the values it can take
    party: [buyer, seller]
    offer: [none, sent, accepted]
  rules:                      # in precedence order — the FIRST rule whose `when` holds decides
    - label: Pay now
      when: {party: buyer, offer: accepted}
      then: {type: button, title: Pay now}
    - label: Waiting
      when: {party: buyer, offer: sent}
      then: {type: ribbon, title: Waiting for the seller}
    - label: Respond
      when: {party: seller, offer: "!none"}
      then: {type: ribbon, title: Respond to the offer}
  outcome: type               # the key of `then` that names the result (default `type`)

A value is text, a number or a boolean. `when` is a mapping of dimension →
condition: a bare value equals, `[a, b]` one of, `"*"` any, `"!x"` not equal
(on the value's text); every key must hold, and no `when` — or `{}` — is
always. `then` is a mapping of output key → value; an output a rule does not
set is `—`, and so is every output of a combination no rule decides. A rule
under an earlier rule that already takes every combination it matches is
never reached.

The CHECKER names: not a mapping, no `title`, no `dimensions` or one that is
not a mapping, a dimension that is not a non-empty list of scalars or repeats
a value, no `rules` or `rules` that is not a list, a rule that is not a
mapping, a `label` that is not text, a `when` that is not a mapping, a `when`
on a dimension that is not declared, a condition that is not a scalar or a
list of them, an empty list, a value not in the dimension, no `then` or a
`then` that is not a mapping, an output that is not a scalar, an `outcome`
that is not text or one no rule sets — and, when the space is small enough
to enumerate (200,000 combinations), a rule that matches no combination or
that is never reached.

## A fresh document (what the Studio creates)

```yaml
title: "untitled"
description: "Which result follows from each combination of the inputs; the first rule that holds decides."
dimensions:
  party: [buyer, seller]
  offer: [none, sent, accepted]
rules:
  - label: Pay now
    when: {party: buyer, offer: accepted}
    then: {type: button, title: Pay now}
  - label: Waiting
    when: {party: buyer, offer: sent}
    then: {type: ribbon, title: Waiting for the seller}
  - label: Respond
    when: {party: seller, offer: sent}
    then: {type: ribbon, title: Respond to the offer}
  - label: Paid
    when: {party: seller, offer: accepted}
    then: {type: ribbon, title: The buyer has paid}
outcome: type
```
