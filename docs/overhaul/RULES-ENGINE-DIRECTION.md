# Rules engine — the direction, and the licence line

## The decision

Build our own TypeScript engine, **porting XMage's core architecture** and generating card
abilities from Scryfall oracle text. Do not embed either project. Do not touch Forge's code.

## Why not Forge — this is not negotiable

Forge is **GPL-3.0**. Translating GPL code into another language is a derivative work; copyright
treats translation the same as translating a book. Porting Forge's engine, or machine-converting
its card scripts, would force DeckMatrix itself to be GPL-3.0 with full source disclosure.

The owner may commercialise this product. So: **no Forge code, no Forge card scripts, no
machine-conversion of either, in any form.** Not as a shortcut, not as "just a reference to copy
from". Reading it to understand an idea is fine; ideas and the rules of Magic are not
copyrightable. Reproducing its expression is not.

## Why XMage is different

XMage is **MIT**. That permits derivative works, commercially, closed-source, with attribution.
Porting its architecture to TypeScript is legitimate.

Attribution obligation: retain the MIT notice for the ported portions, credit XMage in the
project's licences/credits. That is the whole cost.

## What to port, and what not to

Measured from the repository:

| Part | Size | Decision |
|---|---|---|
| `Mage/src/main/java/mage/abilities` | 41 entries | **PORT the architecture** |
| `Mage/src/main/java/mage/game` | 40 entries | **PORT the architecture** |
| `Mage.Sets/src/mage/cards/*` | ~1,000 classes in `a/` alone, ~25,000 total | **DO NOT port** |

The core engine is bounded and is the genuinely hard thing to design correctly — the layer system
for continuous effects, the stack, replacement effects, state-based actions, priority. Decades of
Magic edge cases are already solved there.

The 25,000 card classes are the long tail and must NOT be ported one by one. They are replaced by:
1. an oracle-text compiler producing our declarative ability DSL, and
2. hand-authored DSL entries for cards the compiler cannot parse.

## The constraint that drives the architecture

> "it needs to be fast as could have hundreds or thousands of players playing live"

A JVM engine holds each game as live server-side state. XMage's own servers handle dozens to low
hundreds of concurrent games on real hardware; thousands means a fleet, with every action
round-tripping.

Our engine is pure, seeded and deterministic, so a game IS its action log and any client replaying
that log reaches identical state. Clients apply actions locally for instant feedback; the server
validates and relays. Only actions cross the wire, never state. Cost per game approaches zero.

**Every part of the port must preserve that property.** Pure functions, no `Date.now()`, no
`Math.random()`, no class instances in state, everything JSON-serialisable. If a ported design
would break determinism, change the design — determinism is the product requirement, not a
stylistic preference.

## Honesty rule

A card whose text the engine does not implement must be **marked manual on the card**. The owner's
original complaint was a card that appeared to resolve and did nothing. Silence is the bug.
Precision over recall: a wrong ability corrupts a game, a missing one just needs a human.
