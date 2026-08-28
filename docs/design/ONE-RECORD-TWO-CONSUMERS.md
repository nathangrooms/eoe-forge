# One record, two consumers

Measured 28 August 2026 over the 38,626 card Scryfall oracle corpus at
`scratch/scryfall/oracle-cards.jsonl`, by `scratch/shared-seam.mjs`.

## They do share, and this is verified rather than assumed

Deck building and gameplay read the same representation. Both import
`src/lib/cards/abilities/dsl.ts`:

    deck building   src/lib/deck/recommend/behaviour.ts:60
    gameplay        src/lib/game/activate.ts:53, announce.ts:62, bot.ts:74,
                    cast-targets.ts:41, types.ts:36, abilities/context.ts:55,
                    abilities/statics.ts:38, abilities/behaviour-probe.ts:95

The shape is one compiler and two readers of its output:

    oracle text -> compiler -> Ability[] (the DSL) -+-> facets   (deck building)
                                                    +-> effects  (gameplay)

So a card the compiler misreads is misread twice, and a fix in the compiler is
paid once and collected twice. That is the whole argument for keeping the
engine central, and it holds up in the imports.

## The number that bounds both

How completely the shared compiler reads a card, over 35,663 cards that have
any rules text at all:

    rec:full      10,793   30.3%    read the whole card
    rec:partial   16,558   46.4%    read some of it
    rec:other      8,312   23.3%    no record, falls back to tags

This single figure caps deck building and gameplay together. Deck building
cannot want what it cannot read, and gameplay cannot resolve what it cannot
read. Neither side can be better than the record they share.

## What this does NOT say

`rec:full` is the compiler's own account of whether it consumed every paragraph.
It is not a claim that what it produced is CORRECT. Accuracy is a separate
measurement and `scripts/verify-ability-coverage.mjs` is the instrument for it,
because it casts real spells on a real board and downgrades anything that
resolves silently. Do not quote 30.3% as playability.

A second measurement was attempted here, counting cards that name a type or
subtype the compiler then failed to extract. IT IS NOT REPORTED because the
subtype vocabulary was derived from type lines and picked up "you", "the",
"card" and "control", which made it claim 99.5% of cards were affected. The
method needs a real subtype catalogue before its answer means anything.

## Two traps this measurement walked into, recorded so they are not repeated

**A backslash in a template literal is not a backslash.** The first run built
its matcher as a template literal containing a word boundary escape. JavaScript
reads that escape when it builds the STRING, long before `RegExp` sees it, so
the pattern held a backspace character and matched nothing. The census reported
zero for the entire corpus and looked like a clean result rather than a broken
one. The matcher now collapses non-letters to spaces and tests a padded word,
which has no escape to get wrong.

**`.shots/pool-snapshot.json` carries no oracle text on its pool rows.** Zero of
31,833. Any facet computed from that file is computed from nothing, so every
conclusion drawn from it about what a commander wants is void. Kaalia of the
Vast was called a compiler bug on the strength of it; compiled from the real
corpus she produces `cares:sub:angel`, `cares:sub:demon` and `cares:sub:dragon`
correctly. The snapshot existed only because the live pool query timed out, and
that is fixed, so measure against the database.
