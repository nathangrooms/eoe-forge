# Growing the DSL so the port can lower more

Status: measured. Every figure here comes from a script that was run, and the
command that produces it is beside it.

## Attribution and licence

Behaviour ported here is derived from **XMage**, which is MIT licensed,
`Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
The clone is read in place, outside this repository, and nothing from it is
vendored. XMage's display strings are never copied: they carry Wizards of the
Coast rules text, which is not XMage's to license, so every line of card wording
below comes from Scryfall. Forge is GPL-3.0 and was not fetched, read or
referenced.

---

# 1. The answer first

Four new members of the `Effect` union. The port lowers **7,190** cards where it
lowered 6,704, and the shipped table holds **7,451** rows where it held 6,966.
The task asked for more than 7,237 and this passes it.

**AUTOMATED and PROMPTED did not move at all.** 4,460 and 942, sum **5,402
(16.64%)**, the same three numbers before and after. That is not a measurement
that failed to land. It is the finding, it was predictable from the ranking
before any code was written, and section 4 puts a number on it: all four
members are DECISIONS, so every card they unlock is PROMPTABLE, and PROMPTABLE
is excluded from the headline by construction. PROMPTABLE went from 721 to
**1,073**.

Three defects were found by hand-checking the cards these members unlocked, and
all three were older than this work and larger than it. Together they were
silently changing what **312 card files** do. Section 5.

---

# 2. The numbers, member by member

Reproduce, in this order, from a clean checkout of this branch:

```
node --experimental-strip-types scripts/xmage/effect-class-order.mjs --top 20
node --experimental-strip-types scripts/xmage/emit-lowered.mjs
DM_CARD_DUMP=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
node scripts/xmage/port-grow-price.mjs
```

`already lowering (whole card)` is the first script's own line. `EMITTED` is the
second's. The rest are the third's `metrics` block in
`scratch/verify-ability-coverage.json`.

| | start | + `do-if-cost-paid` | + `scry` / `surveil` | + `look-and-pick` |
|---|---:|---:|---:|---:|
| cards where every ability lowers | 6,704 | 6,831 | 7,091 | **7,190** |
| rows in `lowered.generated.ts` | 6,966 | 7,090 | 7,350 | **7,451** |
| AUTOMATED | 4,460 | 4,460 | 4,460 | **4,460** |
| PROMPTED | 942 | 942 | 942 | **942** |
| **sum** | **5,402 (16.64%)** | **5,402** | **5,402** | **5,402 (16.64%)** |
| PROMPTABLE | 721 | 779 | 979 | **1,073** |
| SILENT | 26,014 | 25,956 | 25,756 | **25,662** |
| tests passing | 2,474 | 2,478 | 2,478 | **2,480** |

Denominators: 32,168 XMage card files for the lowering column, 32,469 pool cards
for the verdicts.

## What each member is

**`{do:'do-if-cost-paid'}`** — "You may pay {2}. If you do, draw a card." The
controller is offered a cost; `then` runs if it is paid and `else` if it is not.
It is NOT `{do:'unless-pays'}` inverted: that one asks a player who is not the
controller and runs its effects when they DECLINE, and using either in place of
the other resolves every card carrying it backwards. `optional` is carried and
never defaulted, because a default either turns a mandatory payment into a
question or takes a payment the player never agreed to.

**`{do:'scry'}` and `{do:'surveil'}`** — PROMOTED, not written. Both verbs were
already staged in `src/lib/game/abilities/primitives/extended-dsl.ts` with
working, gated primitives behind them, and that file states the promotion order:
verb staged, primitive written and passing, member moves into `dsl.ts`, the one
switch in `to-actions.ts` fails to compile, the new case delegates to the
primitive that already worked. This is that last step, and
`primitives/library-order.ts` is unchanged apart from where it imports its
argument type from. They are two verbs and not one with a flag, for the reason
that file gives: cards put into the graveyard are cards a dozen other mechanics
can reach, and cards put on the bottom of the library are gone.

**`{do:'look-and-pick'}`** — "Look at the top four cards of your library. Put one
of them into your hand and the rest on the bottom in a random order." Three
quantities and two destinations, against the one of each `{do:'search-library'}`
carries. Both destinations are on the member because losing either changes the
card: "the rest on the bottom" and "the rest into your graveyard" are the
difference between a card that filters and a card that fills a graveyard on
purpose. A new `CardDestination` interface carries zone, which end of the
library, whether the order is the player's or random, and whether a permanent
arrives tapped.

## What handling one everywhere actually cost

`dsl.ts`'s `Effect` union is exhaustively switched, and the compile errors named
every site. Per member: `dsl.ts` (the member, `hasManualEffect`,
`childEffectLists`), `validate.ts` (a schema entry and `ACCEPTED_TAGS`),
`render.ts`, `coverage.ts`, `llm-prompt.ts` (a test asserts the model is shown
every tag the validator accepts, and it failed on the first run, which is the
guard working), `src/lib/deck/recommend/behaviour.ts`,
`src/lib/game/abilities/to-actions.ts`, `primitives/registry.ts` (whose
`AssertNever<Uncovered>` line went red before any card was compiled),
`scripts/decision-census.ts`, `scripts/ability-phrase-scan.mjs` and
`scripts/verify-ability-coverage.mjs`. Eleven files, all found by the compiler
or by a test, none by searching.

---

# 3. The blocked count overstated the unlock again, for a NEW reason

`docs/engine/EFFECT-CLASS-ORDER.md` already warns that cards BLOCKED overstates
cards UNLOCKED, and `PORT-LOG.md` says the same. This phase found a second
mechanism underneath the first, and it is worth writing down because the
closure that produces the ranking cannot see it.

`xmage:DoIfCostPaid` was measured at **solo 310**: 310 cards named it as the one
and only thing blocking them. Writing it bought **145**.

The 165 that did not move were not blocked by a second class the closure knew
about. They were blocked by things the closure could not see, because
**a refusal short-circuits**. `lowerNested` checks `REFUSED_EFFECTS` and returns
before it looks at the nested cost or the nested effects, so a card whose
`DoIfCostPaid` also carries an energy cost, or an effect with no lowering,
reported exactly one blocker: `DoIfCostPaid`. The closure is exact over the
blockers a run REPORTS, and a refused effect reports one blocker and hides
whatever is behind it.

Measured across the three steps of this phase:

| member | closure said | delivered | overstated by |
|---|---:|---:|---:|
| `do-if-cost-paid` | 310 | 145 | 2.14x |
| `scry` + `surveil` | 290 | 260 | 1.12x |
| `look-and-pick` | 130 | 99 | 1.31x |

The overstatement is largest for the member that wraps other effects, which is
what the mechanism predicts: a decorator's refusal hides a whole subtree, a
leaf's refusal hides nothing.

The delivered figures in the table above are 127, 260 and 99 rather than 145,
260 and 99, because the accuracy fixes in section 5 took 18 cards back out by
making them refuse. Those cards were lowering and wrong.

---

# 4. Why the headline did not move, with the price named

`verify-ability-coverage.mjs` separates PROMPTED from PROMPTABLE on one test:
every decision the card carries has to be one the engine measurably OFFERS with
its legal options and then honours. All four new verbs are decisions —
whether to pay, which cards go to the bottom, which go to the graveyard, which
one is taken — and no file under `src/components`, `src/pages` or `src/hooks`
draws any of them. So each of the four was added to `decisionIn`, deliberately,
and every card they unlock lands in PROMPTABLE.

Grading them any other way would have counted a card whose whole text is a
question nobody answered.

`scripts/xmage/port-grow-price.mjs` reads the per-card dump and counts, per
verb, the cards where that decision is the ONLY unasked one left. Those are
exactly the cards that would cross into PROMPTED on the day a surface exists,
and not one card sooner.

```
verb                 carries   already passing   would move if asked   by source
do-if-cost-paid           62                 0                    60   xmage 60
scry                     158                 0                   135   xmage 135
surveil                   82                 0                    60   xmage 60
look-and-pick             94                 0                    92   xmage 92
(any of the four)        395                 0                   348   xmage 348
```

**348 cards, plus 1.07 points, sitting behind a surface that draws four
questions.** Every one of the 348 is a card the XMage record speaks for. That is
a CEILING and not a forecast: nothing has been played, and a surface that draws
a question badly is worth nothing.

This is the same shape as `PROBE-TRUTH.md` row A4, which found 341 modal cards
waiting on a surface rather than on the engine, and it is the same conclusion.
The engine is not what stops these cards. What stops them is that a person
cannot press anything.

---

# 5. Three defects the hand checks found, all older and larger than this work

Every one of them produced a card that RAN and was WRONG, which this project
treats as worse than a card that refuses, because a refusal is in the log and a
wrong card is not. None was visible from reading the code; each was found by
walking a named card through against its Scryfall text.

## 5.1 An effect added by `.addEffect` was dropped in silence — 155 card files

`lower.ts` asked `modArgs(invocation, 'addEffect')` for the effects a
construction gained through chained calls. That list is **always empty on every
card in the corpus**: `scripts/xmage/extract-effects.mjs` `applyMod` intercepts
`addEffect` by name and files what it was given under the construction's
`children.effects` instead of leaving it in `mods`. `.addOtherwiseEffect` is not
intercepted, so the sibling call beside it worked, which is why nothing looked
wrong.

Found by **Lorthos, the Tidemaker**: "you may pay {8}. If you do, tap up to
eight target permanents. Those permanents don't untap during their controllers'
next untap steps." The port lowered a plain `tap` and every one of those eight
permanents untapped on schedule, which is the half of the card people build
decks around.

Census over all 32,168 records: **204** `DoIfCostPaid`, **56**
`ConditionalOneShotEffect` and **14** `ConditionalContinuousEffect`
constructions, across **155 distinct card files**. The two conditional entries
had been shipping with this bug since they were written; the third would have
shipped with it.

`unnamedChildEffects` in `lower.ts` is the fix. It splits the list POSITIONALLY
— `hoist` fills it from the constructor arguments in order and `applyMod`
appends afterwards, so the constructor effects are a prefix — and refuses
outright whenever the prefix does not line up. The first version matched on
OBJECT IDENTITY, which is exact in memory and worthless in the frozen fixtures,
because a `CardRecord` is JSON and JSON has no shared references. That version
passed the live extraction and failed every fixture, which is the test suite
catching a rule that held in one process and not in the file that process wrote.

Test: Oloro, Ageless Ascetic, whose paid branch is "draw a card AND each
opponent loses 1 life" and used to be the draw alone. Refusal test: Lorthos.

## 5.2 A cost that asks for two to six objects was paid with one — 156 cards

Five rules in `costs.ts` wrote `count: 1` beside the selector they read out of
the cost's nested `Target`. The number is not in the cost. XMage puts it on the
target: `new ExileFromGraveCost(new TargetCardInYourGraveyard(2, filter))`. So
every one of these abilities was **cheaper than the card charges**.

Found by **Skywarp Skaab**: "you may exile two creature cards from your
graveyard. If you do, draw a card." The port exiled one.

Census over all 32,168 records: **304 cost constructions across 156 distinct
cards** ask for two to six and were lowered as one. `ExileFromGraveCost` 84,
`TapTargetCost` 161, `DiscardTargetCost` 48, `SacrificeTargetCost` 7,
`RevealTargetFromHandCost` 4. Allosaurus Rider, Altar Golem, Avatar of Discord,
Anurid Brushhopper, Ancestor's Prophet.

`objectsFromTargetArg` replaces `selectorFromTargetArg` and returns the count
with the selector, reading `numTargets`, or `minNumTargets` and `maxNumTargets`
when they agree. When they do not agree the whole cost REFUSES: that is "up to
N" as a target, and a cost is not "up to" — either it is paid or it is not, so
there is no number to write.

## 5.3 A construction was reused across nesting levels — 1 card

`indexByPrim` in `build-records.mjs` recursed through the whole argument tree
and the reuse matched on CLASS NAME, so a construction three levels down inside
a constructor argument could be handed to a list entry at the top. It cannot be
the same thing: a list entry is filled from a DIRECT constructor argument or by
a chained `.addTarget` call, and neither reaches into an argument's arguments.

Found by **Master Skald**: "you may exile a creature card from your graveyard.
If you do, return target artifact or enchantment card from your graveyard to
your hand." The card builds `TargetCardInYourGraveyard` twice, once inside the
cost with a creature filter and once on the ability with an
artifact-or-enchantment one. The ability's target was handed the cost's object
and the card returned a CREATURE card.

Census: **exactly one** list entry in the entire corpus was satisfied only by a
deeper occurrence, and it is that one. So narrowing the index to one level costs
no deduplication that was doing real work. Same family as the sibling collapse
`spendingReuse` fixed, one axis over: that one confused siblings, this one
confused nesting levels. Master Skald now refuses, on the filter it genuinely
cannot read, which is the honest answer rather than the wrong one.

---

# 6. Accuracy: 40 cards read against Scryfall, in four rounds

`scripts/xmage/port-grow-handcheck.mjs` prints, per card, Scryfall's oracle text
verbatim, every ability the SHIPPED compiler ended up with as `dsl.ts` shapes,
and what `probeBehaviour` did with them. It grades nothing. Candidates are every
card in the paper pool where `compileWithTrace` returned an XMage record
carrying the named verb; they are sorted by oracle id, which is an order nobody
controls, and a fixed stride walks them. `DM_ALREADY` excludes an earlier
round's cards by oracle id, because a round of fixes derived from a sample
cannot be graded on that sample.

```
node --experimental-strip-types scripts/xmage/port-grow-handcheck.mjs do-if-cost-paid
DM_ALREADY="scratch/port-grow-handcheck.do-if-cost-paid.round1.json" node --experimental-strip-types scripts/xmage/port-grow-handcheck.mjs do-if-cost-paid
node --experimental-strip-types scripts/xmage/port-grow-handcheck.mjs scry surveil
node --experimental-strip-types scripts/xmage/port-grow-handcheck.mjs look-and-pick
```

| round | verb | cards | disagree | rate |
|---|---|---:|---:|---:|
| 1 | `do-if-cost-paid` | 10 | 2 | 20.0% |
| 2 | `do-if-cost-paid`, none repeated | 10 | 0 | 0% |
| 3 | `scry`, `surveil` | 10 | 0 | 0% |
| 4 | `look-and-pick` | 10 | 0 | 0% |
| | **all four** | **40** | **2** | **5.0%** |

Round 1 is above the 5% bar the brief sets, so it stopped the work. Both
disagreements were Lorthos, the Tidemaker and Skywarp Skaab; both turned out to
be systematic rather than card-local; both were censused across the whole corpus
and fixed; and round 2 re-read ten cards none of them had touched.

**Two things noted rather than counted, both stated so a reader can disagree.**

*Stockpiling Celebrant*, round 3: "you may return another target nonland
permanent you control to its owner's hand. If you do, scry 2." The port makes
the whole trigger optional and then does both, which matches the card on every
board except one — the target removed in response, where the printed card scries
nothing and the port scries. XMage models it exactly the same way, so this is
the port being faithful to a corner XMage also has, not the port being wrong
about the record.

*Vengeful Villagers*, round 2: the sacrifice cost lowers to a selector with no
controller on it, which reads as "any artifact or creature on the battlefield".
It is not a discount, because `activate.ts` pays a `{pay:'sacrifice'}` through
`controlledCandidates`, which restricts it to the payer's own permanents (CR
701.17a). Checked in the engine rather than assumed. The record is wide and the
payment is narrow.

---

# 7. Twenty games

```
node --experimental-strip-types scripts/playtest/run.ts --seed 9000 --games 20 \
  --players 4 --kind commander --max-turns 200 --verify
```

**20 games, 20 finished, 0 stalled. 25,874 actions. Every replay hash matched on
all 20. 0 resolved silently.** 20 refused actions and 56 "changed nothing" across
25,874. Longest game 67 turns, nothing near the 200 ceiling.

The previous phase recorded 26,069 actions on the identical seeds, so this run
is **195 actions lighter**. That is a throughput figure and not a correctness
one, and it points the way the change points: more cards now reach a swapped
record whose effect is a typed question, and a question is a `NOTE` rather than
an action. It has not been attributed card by card, and this document does not
claim it has.

---

# 8. Where the list stands now, and what each remaining item needs

```
node --experimental-strip-types scripts/xmage/effect-class-order.mjs --top 20
```

| # | marginal | blocked | class | what it needs |
|---:|---:|---:|---|---|
| 1 | 187 | 223 | `xmage:SagaAbility` | an ABILITY shape, not an effect: lore counters, a chapter trigger keyed on the count, and something that adds one each turn |
| 2 | 156 | 303 | `xmage:CyclingAbility` | an alternative way to CAST, which `CARD-SEMANTICS.md` section 7 names as a boundary of the record shape |
| 3 | 125 | 191 | `keyword:Protection` | a decision, not work: its parameter is a filter and `KeywordAbility.parameter` is printed text, so writing "from red" would be this project inventing rules wording |
| 4 | 118 | 237 | `dsl:SpellAbility.costs` | a field on two Ability kinds. **Must not ship without cast-time enforcement**: today the cost is refused, and a field nothing pays makes every one of these spells free |
| 5 | 115 | 289 | `xmage:CreateDelayedTriggeredAbilityEffect` | engine STATE: a trigger that belongs to no card has nowhere in `GameState` to live |
| 6 | 105 | 204 | `xmage:FlashbackAbility` | an alternative way to cast, as row 2 |
| 7 | 101 | 161 | `xmage:RegenerateSourceEffect` | the destruction path spending a shield. Detail below |
| 8 | **85** | 105 | `xmage:EntersBattlefieldTappedUnlessAbility` | **the first row below 100** |

**The rule the task set is met and the answer is to stop adding verbs.** Of the
seven rows still above 100, five are not a new `Effect` member at all, and the
two that are need engine state rather than vocabulary. Adding a ninth verb from
row 8 downward would return under 100 cards, and every one of those cards would
be PROMPTABLE for the same reason the 348 above are.

## `regenerate` is the one that could move the headline, and what it costs

It is the only remaining item whose effect is not a decision, so it is the only
one whose cards could reach AUTOMATED rather than PROMPTABLE. Its verb is
already staged in `primitives/extended-dsl.ts` and `primitives/regenerate.ts`
builds the shield as a namespaced counter, gated and tested. It was NOT promoted
here, and the staging file says why in its own words: nothing spends a shield,
so promoting the verb would put a member in the shipped union that makes a card
look saved and lets it die anyway.

Four pieces, measured rather than guessed:

1. `sba.ts`, the 704.5g and 704.5h branches: a creature with a shield emits a
   new finding instead of `creature-destroyed`.
2. `rules.ts`, applying that finding: spend one shield, tap, clear damage.
   There is no action for clearing damage today — `rules.ts:799` does it inside
   the reducer at cleanup and nowhere else — so this is a new finding kind
   rather than a new action.
3. `to-actions.ts` `case 'destroy'`, which has its own indestructible check and
   would need the same test beside it.
4. Removal from combat, CR 701.15a. `state.combat.attackers` is a declaration
   list with no removal helper and no action that touches it.

Rows 1 to 3 are a contained change. Row 4 is not, and leaving it out is a
creature that keeps fighting after it regenerates. That is a whole item, and
half of it is worse than none, which is why it is written down here instead of
started.

## What this document does NOT recommend

Adding a decision protocol and a surface is worth 348 cards on the measurement
in section 4, plus the 341 modal cards `PROBE-TRUTH.md` row A4 measured, plus
the `may` cards its row G3 measured. It is bigger than anything left on the
ranking above. It is also entirely outside `src/lib/game/**` and
`src/lib/cards/**`, so nothing in this phase could have done it, and the numbers
are recorded here so whoever does own it has them.
