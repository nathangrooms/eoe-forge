# Twenty bot matches, audited

Owner: *"I am expecting at least 20 bot matches tested, audited and reviewed to
ensure this is working 100% for all cards, abilities, actions, tappables, on
enter, exile, graveyard, everything working as it should and bots have all
access and smart play."*

## What was run

```
node --experimental-strip-types scripts/playtest/run.ts \
  --seed 9000 --games 20 --kind commander --players 4 --verify
node --experimental-strip-types scripts/playtest/analyze.ts --run <folder>
```

Twenty four-seat commander games. 22,237 actions, 917 turns. `--verify` replays
every game through the real reducer and re-checks every state hash, so nothing
below comes from a position the game was not actually in.

| | |
|---|---|
| games finished | 20 of 20 |
| stalled | 0 |
| won on a real condition | 20 (life, or commander damage) |
| invariant violations | **0** |
| actions refused by the reducer | 4 of 22,237 |

Game N uses seed `9000 + N`, so any single game reproduces on its own with
`--seed <that number> --games 1`.

**The whole run was then done a second time** against the fixed engine and the
repaired harness: 20 of 20 finished, 0 stalled, 0 invariant violations, 22,581
actions. The action count rose by 344 because survivors now carry a
`DAMAGE_CARD` they were never given before. After the harness repair the same
twenty games report lifelink 32 times and five deathtouch kills, one of them
Glissa, the Traitor killing Qarsi Deceiver with 3 power into 4 toughness, which
is the keyword doing exactly the job it exists for.

## The headline: two of the three reported failures were the harness

The generated report opened with three keywords that "never fired once in 20
games". Each was checked against the recorded games rather than believed. Two
did not survive that check.

### Lifelink — reported 0 of 24, actually 32

`"cause":"Lifelink"` appears 32 times in the recorded games. The probe asked
whether a controller's life total moved *during* the `DAMAGE` action.
`combat.ts` accumulates lifelink across every hit in the damage step and emits a
single `LIFE_CHANGE` once the step finishes, which is correct and invisible to
that probe. Fixed: the observer now reads the cause.

### Deathtouch — reported 0 of 35, works

A 1/1 with deathtouch kills a 0/6 in a direct probe through the real reducer,
and `combat.test.ts` covers it three ways. The probe watched a state flag that
`DAMAGE_CARD` sets, and combat emitted **no `DAMAGE_CARD` at all** (count: 0
across all 20 games), so the flag could never appear. Fixed: the observer now
counts the kill, and only where deathtouch is what *made* the damage lethal, so
a 4/4 deathtoucher squashing a 2/2 does not inflate the figure.

### Counterspells — reported 0 of 5, works

`respond.test.ts` proves a bot counters when it holds an answer it can pay for.
Five counterspells appeared across twenty games and each also needs untapped
mana at the moment somebody else casts something. Zero is a sample size, not a
defect. The denominator is the weak part: it counts a counterspell being
**drawn**, which is not an opportunity to counter anything.

**Why this section is first.** A harness is trusted. A false zero on a core
keyword is worse than no measurement, because it sends somebody to fix working
code and it hides the real defect standing behind it. That is exactly what
happened: chasing the two false zeros is how the bug below was found.

## The real bug, which the report never headlined

**Combat damage was not staying marked on anything that survived.**

CR 510.2 keeps combat damage on a creature until cleanup. `resolveCombat` worked
the damage out in a local map, emitted actions only for what **died**, and threw
the rest away. A 3/3 blocked by a 2/2 came out of combat with `damage: 0`.

Every consequence favours the defender wrongly:

- a burn spell cannot finish off a creature that just traded blows
- a second combat step in the same turn meets a creature that quietly healed
- anything reading marked damage sees a board that was never hit

Fixed in `src/lib/game/combat.ts`. Survivors now get a `DAMAGE_CARD`, which
marks the damage and sets the deathtouch flag without destroying anything;
destruction is CR 704.5g/h, which `sba.ts` runs after every action and which
correctly declines to destroy an indestructible permanent.

**Why it survived this long:** every test in `combat.test.ts` asserts on the
returned outcome. That is the right way to check the damage *maths* and it is
exactly the blind spot, because the maths was correct in the map and was never
written to a card. A green suite and an undamaged 3/3 were perfectly consistent.
The three new tests go through `applyAction` and look at the board.

## What the cards did

1,473 cards were played. 176 resolutions changed the game and 1,152 were
correctly quiet: a vanilla creature, a static ability that `layers.ts` computes
on read, an activated ability nobody activated, a trigger for another moment, or
a spell with no legal target. None of those are faults.

| verdict | count | what it means |
|---|---|---|
| correctly-quiet | 1,142 | nothing was due. Working. |
| acted | 176 | resolved and changed the game. Working. |
| silent-noted | 63 | did nothing, and the log said so. Honest. |
| silent-drawback | 40 | **carries a penalty nothing applies** |
| silent-marked | 33 | did nothing, carries a "resolve by hand" marker |
| correctly-quiet-conditional | 10 | no legal target, or a false condition. Working. |
| dead-on-arrival | 9 | played, and not on the battlefield afterwards |
| silent-untold | **0** | did nothing and said nothing |

`silent-untold` at zero is the one to keep at zero. Every card that cannot be
automated either says so in the log or wears a marker on the card.

## The biggest finding: nothing ever reaches the stack

This came out of the SECOND run, once the harness stopped reporting false zeros
and the counterspell row was the only one left at zero. It is the most important
thing in this document.

**A bot never casts an instant or a sorcery. Not once, in any game.**

`bot.ts` `chooseSpell` filters its candidates with `isPermanent(card)`, so an
instant or sorcery sitting in hand is never even considered. Every instant and
every sorcery in every bot deck is a dead card.

**And no spell a bot casts ever goes on the stack.**

`moves.ts` `planCastFromHand` builds a `CAST_SPELL` only when called with
`viaStack: true`, and a plain `PLAY` otherwise. `chooseSpell` leaves `viaStack`
defaulted to false, so every spell goes straight to its destination without ever
being an object anybody could respond to.

It is a closed loop. The one place that passes `viaStack: true` is the
counterspell branch in `priorityMove`, and that branch only runs when there is
already something on the stack to counter. Nothing can put the first object
there, so nothing ever is.

**That single fact explains every remaining zero in the report**: no spell on the
stack, no ability on the stack, no priority passed, no spell countered, no
fizzle, no resolution. The counterspell zero was never really about
counterspells.

Read the "spell resolves" column with this in mind. The handful of entries in it
are double-faced cards misrouted to the graveyard, not instants being cast.
**This run did not test instants and sorceries at all.** Any zero that depends
on one is untested rather than broken, and is reported that way rather than
claiming a result it did not earn.

### Why it is not fixed in this pass

Two reasons, and the second is the real one.

`bot.ts` and `moves.ts` are both being edited by the XMage vocabulary workflow
right now (it is adding modal-choice handling in `botChoice`). That is a
different function and would probably merge, so on its own it would not stop the
work.

The real reason is that this is not a one line change. Letting a bot cast
instants means teaching it WHEN: at instant speed, in response to something, or
in its own main phase, and holding mana open rather than tapping out. Flipping
`viaStack` to true changes the action flow of every game, and a bot that passes
priority wrongly deadlocks instead of playing. Done carelessly this produces a
bot that is worse to play against than the one that ignores instants, and it
would land at the end of a long session with no time to play twenty more games
and find out.

It needs its own pass, with the same twenty game harness run before and after.

## Outstanding: conditional "enters tapped"

The largest single cluster in `silent-drawback` is **20 lands that should enter
tapped and do not**. This is a card playing *stronger* than it is printed, which
is the worst kind on the list: the other seat has no answer to it.

`clause-rules.ts:791` matches `/^~ enters tapped$/` — an exact match. Every
conditional form falls through and no ability is built at all:

| form | example |
|---|---|
| `enters tapped unless you control <a permanent>` | Chocobo Camp, Mines of Moria |
| `enters tapped unless you control <a type>` | Country Roads, Reef Roads |
| `enters tapped with N <counter> counters` | Peat Bog, Saprazzan Skerry |

**This is buildable rather than a rewrite.** `ReplacementAbility` in `dsl.ts`
already carries `condition?: Condition`, so the DSL expresses this today. The
work is parsing the `unless` clause into a negated condition and threading it
through `parseReplacement`, whose `ReplacementShape` has no condition field yet.

**Not done here deliberately.** Threading it needs `compiler.ts`, which the
XMage vocabulary workflow is editing right now. Two agents rewriting one
compiler is how a merge conflict eats an evening. It belongs to whoever owns
that file next.

## Coverage, stated plainly

**59.26%** of distinct card texts are automated: 19,578 of 33,037, counted from
`scripts/coverage/.data/dsl-coverage.latest.json` as records with
`automated: true`. The baseline in the same folder is 58.77%.

That is not 100% and nothing here should be read as saying it is. Coverage on
this project has been overstated before, when a "95.7%" figure turned out to be
a 12,000 row slice of 34,088 cards against a real automated figure of 2.66%. The
number above is the whole corpus, counted the same way twice.
