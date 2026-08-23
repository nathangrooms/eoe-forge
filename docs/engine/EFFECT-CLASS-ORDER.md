# The effect classes, ranked by cards they would unlock

Status: measured. Nothing in this document was typed by hand except the prose.

## Attribution and licence

Behaviour and class names here are derived from **XMage**, which is MIT
licensed, `Copyright (c) 2010 betasteward@gmail.com`,
https://github.com/magefree/mage. The clone is read in place, outside this
repository, and nothing from it is vendored. XMage's display strings are never
copied: they carry Wizards of the Coast rules text, which is not XMage's to
license. Forge is GPL-3.0 and was not fetched, read or referenced.

## Which script produced which number

Three runs, all over the same corpus, at XMage commit
`07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d`.

| number | script | writes |
|---|---|---|
| the closure: which classes block which cards | `scripts/xmage/effect-class-order.mjs` | `scripts/coverage/.data/xmage-effect-class-order.json` |
| the gates and the exchange rate | `scripts/xmage/effect-class-yield.mjs` | `scripts/coverage/.data/xmage-effect-class-yield.json` |
| AUTOMATED and PROMPTED, per card | `DM_CARD_DUMP=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs` | `scratch/verify-card-verdicts.json` |

The first two are new. The third is the existing probe with an opt-in per-card
dump added; it prints the same figures it printed before, and the dump
reconciles with them exactly:

```
tally {"SILENT":26460,"AUTOMATED":3521,"PROMPTED":1476,"PROMPTABLE":680,"NO-TEXT":332}
```

No engine code was changed. `src/lib/game/**` and `src/lib/cards/**` are
untouched by this work order.

---

# 1. The answer first

**Port `ConditionalContinuousEffect`, `DoIfCostPaid` and `ConditionalOneShotEffect`.
Then stop and re-measure.**

Those three are the only classes in the entire corpus that project more than 100
working cards each. The fourth is already at 94 and the sixth has a ceiling
below 100. The premise this work order was commissioned under, that effect
classes still buy cards by the hundred, is true for exactly three of them.

That is not the same finding as "the last two tranches were wrong". They were
wrong, and this document says by how much. But the fix is smaller than the brief
assumed, and the reason is measured below rather than argued.

---

# 2. The two numbers that keep getting confused, and a third nobody had

**Cards BLOCKED** is how many cards name a class as one of the things stopping
them. **Cards UNLOCKED** is how many cards start working because it exists.
Across the 90 classes below, the first overstates the second by between **1.24x
and 58.5x**.

The gap is not a rounding error and it is not uniform, so it cannot be corrected
with a fudge factor. Three examples, all measured:

| class | blocked | movable | overstated by |
|---|---:|---:|---:|
| `ReturnToHandChosenControlledPermanentEffect` | 56 | 45 | 1.24x |
| `keyword:Protection` | 191 | 17 | 11.2x |
| `TransformSourceEffect` | 117 | 2 | 58.5x |

`TransformSourceEffect` is the clearest case. It blocks 117 cards, and 39 of the
42 it would newly lower carry text on a back face, which the engine does not
play, so the swap refuses them by construction. Two cards move. A plan built on
blocked counts would rank it above forty classes worth twenty times more.

There is a third number this project did not have until now, and it is the one
that actually decides the ranking.

## The four gates

A class making a card LOWER is the first of four things that must happen. The
other three are enforced by `xmageSwapFor` in `src/lib/cards/xmage/lowered.ts`
and by the probe, and each one throws cards away.

| gate | what it asks | what it refuses |
|---|---|---|
| 1 | does the whole card lower? | a card still blocked by another class |
| 2 | can the probe see it? | a record with no Scryfall oracle id in the pool |
| 3a | is the record CONSULTED? | **a card the oracle-text compiler already understands completely** |
| 3b | is the front face the whole card? | a card with text on a face the engine does not play |
| 4 | is the card not already working? | a card that already reads AUTOMATED or PROMPTED |

Gate 3a is the one that matters and it is the one nobody was counting. The
precedence rule in `lowered.ts` is explicit: the oracle-text compiler wins
outright wherever its coverage is `full`, and on those cards the XMage lowering
**is never read at all**. A class that unlocks a card the compiler already had
has bought nothing, and the probe will never show it, because the code path is
not taken.

Cards clearing all four gates are called MOVABLE below. That is a **ceiling**,
not a forecast: it is the largest number of cards that class could possibly
move. Whether the new ability then survives the probe depends on whether a live
consumer in `src/lib/game/**` runs the DSL member it lowers to, and a class that
does not exist cannot be probed.

---

# 3. What the port is worth today, which is also new

The probe now records which source spoke for each card. This has never been
measured before, and it is the honest denominator for everything below.

```
by source {"compiler/SILENT":25732,"compiler/AUTOMATED":3172,"compiler/PROMPTED":1122,
           "compiler/PROMPTABLE":632,"compiler/NO-TEXT":326,
           "xmage/AUTOMATED":349,"xmage/PROMPTED":354,"xmage/PROMPTABLE":48,
           "xmage/SILENT":728,"xmage/NO-TEXT":6}
```

The XMage port speaks for **1,485 cards** in the shipped compiler. Of the
project's 4,997 working cards, **703 are the port's**: 349 of the 3,521
AUTOMATED and 354 of the 1,476 PROMPTED. The port is 14.1% of what works.

## The exchange rate, and where the port's own cards go

Restricting to cards this closure can attribute to a named class:

```
lower fully, with at least one ability      6229   (351 vacuous records excluded)
of which the probe can see                  5858
of which the record was actually SWAPPED    1176
    AUTOMATED    293
    PROMPTED     312
    PROMPTABLE    43
    SILENT       522
    NO-TEXT        6
works (AUTOMATED + PROMPTED) / swapped      605 / 1176 = 51.4%
and swapped / lowering                     1176 / 6229 = 18.9%
```

Two rates, and they point in opposite directions.

**51.4% of swapped cards work.** That is high, and it is the case for continuing.
When the port's record is actually used, it works more often than not.

**Only 18.9% of lowered cards are ever swapped.** Four cards in five that this
port taught the engine to lower were cards the oracle-text compiler already
understood completely, so the lowering sat there unread. That is where the
previous tranches' return went. They were measured at gate 1 and died at gate 3a.

(The 1,176 here is smaller than the 1,485 above because 309 cards reach the
table through `emit-lowered.mjs`'s translated-body path rather than through a
named shared class. Those are tier 3 and are not something a class in this
ranking buys.)

---

# 4. The work order

Denominator: 32,168 XMage card files, 31,731 carrying a Scryfall oracle id.

- **blocked**: cards naming this class as a blocker. The number PORT-LOG warns
  about. Shown only so the overstatement is visible.
- **solo**: cards this class unlocks if it were the only class ever written.
- **marginal**: cards it unlocks GIVEN every class above it is done. Lowering
  only.
- **MOVABLE**: of the marginal, cards that clear all four gates. **This is the
  column to rank on.**
- **cmdr**: of the movable, Commander legal.
- **proj**: movable multiplied by the measured 51.4% exchange rate. A
  projection from a measured rate, not a measurement.
- **cum proj**: running total of proj.

Marginal is not additive and neither is solo. 14,748 blocked cards name exactly
one class, 6,424 name two, 1,702 name three, and 450 name four or more. A card
needs its whole set at once.

| # | class | blocked | solo | marginal | MOVABLE | cmdr | proj | cum proj |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | `ConditionalContinuousEffect` | 802 | 469 | 469 | **310** | 310 | 159 | 159 |
| 2 | `DoIfCostPaid` | 584 | 290 | 295 | **238** | 238 | 122 | 281 |
| 3 | `ConditionalOneShotEffect` | 598 | 250 | 253 | **236** | 234 | 121 | 402 |
| 4 | `ScryEffect` | 352 | 180 | 189 | **182** | 182 | 94 | 496 |
| 5 | `SagaAbility` | 223 | 187 | 187 | **175** | 172 | 90 | 586 |
| 6 | `CyclingAbility` | 303 | 153 | 154 | **35** | 35 | 18 | 604 |
| 7 | `LookLibraryAndPickControllerEffect` | 242 | 127 | 129 | **128** | 128 | 66 | 670 |
| 8 | `dsl:SpellAbility.costs` | 237 | 120 | 127 | **125** | 124 | 64 | 734 |
| 9 | `keyword:Protection` | 191 | 115 | 127 | **17** | 17 | 9 | 743 |
| 10 | `CreateDelayedTriggeredAbilityEffect` | 287 | 114 | 120 | **110** | 109 | 57 | 800 |
| 11 | `FlashbackAbility` | 204 | 82 | 112 | **53** | 53 | 27 | 827 |
| 12 | `keyword:Kicker` | 224 | 46 | 109 | **109** | 108 | 56 | 883 |
| 13 | `RegenerateSourceEffect` | 161 | 103 | 105 | **95** | 95 | 49 | 932 |
| 14 | `SurveilEffect` | 186 | 88 | 100 | **98** | 96 | 50 | 982 |
| 15 | `BecomesCreatureSourceEffect` | 129 | 86 | 94 | **91** | 91 | 47 | 1029 |
| 16 | `PutOnLibraryTargetEffect` | 130 | 79 | 86 | **76** | 75 | 39 | 1068 |
| 17 | `EntersBattlefieldTappedUnlessAbility` | 105 | 81 | 86 | **53** | 53 | 27 | 1095 |
| 18 | `AddCountersSourceEffect` | 190 | 51 | 80 | **75** | 75 | 39 | 1134 |
| 19 | `CounterUnlessPaysEffect` | 116 | 66 | 80 | **77** | 76 | 40 | 1174 |
| 20 | `EntersBattlefieldWithCountersAbility` | 195 | 62 | 74 | **38** | 38 | 20 | 1194 |
| 21 | `CrewAbility` | 178 | 57 | 72 | **24** | 24 | 12 | 1206 |
| 22 | `DoWhenCostPaid` | 122 | 67 | 73 | **72** | 72 | 37 | 1243 |
| 23 | `ReturnToHandSourceEffect` | 148 | 67 | 72 | **27** | 27 | 14 | 1257 |
| 24 | `SacrificeSourceUnlessPaysEffect` | 115 | 66 | 72 | **61** | 61 | 31 | 1288 |
| 25 | `MillCardsTargetEffect` | 136 | 62 | 70 | **24** | 24 | 12 | 1300 |
| 26 | `MorphAbility` | 184 | 60 | 70 | **17** | 17 | 9 | 1309 |
| 27 | `keyword:Convoke` | 104 | 63 | 67 | **19** | 19 | 10 | 1319 |
| 28 | `GainControlTargetEffect` | 135 | 52 | 66 | **55** | 55 | 28 | 1347 |
| 29 | `PreventDamageToTargetEffect` | 99 | 57 | 66 | **54** | 54 | 28 | 1375 |
| 30 | `adjuster:xmage:XTargetsCountAdjuster` | 80 | 63 | 64 | **59** | 59 | 30 | 1405 |
| 31 | `AlternativeCostSourceAbility` | 103 | 56 | 62 | **62** | 62 | 32 | 1437 |
| 32 | `DrawCardTargetEffect` | 124 | 52 | 60 | **41** | 41 | 21 | 1458 |
| 33 | `SimpleManaAbility` | 130 | 55 | 57 | **39** | 37 | 20 | 1478 |
| 34 | `DynamicManaAbility` | 80 | 56 | 57 | **45** | 45 | 23 | 1501 |
| 35 | `CantBeBlockedByCreaturesSourceEffect` | 94 | 49 | 56 | **45** | 45 | 23 | 1524 |
| 36 | `AnyColorManaAbility` | 74 | 47 | 56 | **15** | 15 | 8 | 1532 |
| 37 | `CantBeBlockedTargetEffect` | 97 | 45 | 55 | **52** | 52 | 27 | 1559 |
| 38 | `ProwessAbility` | 84 | 43 | 53 | **15** | 15 | 8 | 1567 |
| 39 | `AttacksWithCreaturesTriggeredAbility` | 155 | 32 | 52 | **52** | 52 | 27 | 1594 |
| 40 | `InvestigateEffect` | 107 | 47 | 53 | **53** | 53 | 27 | 1621 |
| 41 | `CantBlockTargetEffect` | 89 | 47 | 53 | **51** | 50 | 26 | 1647 |
| 42 | `GetEnergyCountersControllerEffect` | 119 | 15 | 51 | **43** | 43 | 22 | 1669 |
| 43 | `SacrificeEffect` | 89 | 40 | 51 | **45** | 45 | 23 | 1692 |
| 44 | `PutCardFromHandOntoBattlefieldEffect` | 80 | 50 | 51 | **45** | 42 | 23 | 1715 |
| 45 | `BasicManaEffect` | 79 | 47 | 51 | **31** | 31 | 16 | 1731 |
| 46 | `BecomesCreatureTargetEffect` | 71 | 47 | 51 | **48** | 48 | 25 | 1756 |
| 47 | `RegenerateTargetEffect` | 59 | 47 | 50 | **43** | 43 | 22 | 1778 |
| 48 | `ProliferateEffect` | 74 | 46 | 49 | **47** | 47 | 24 | 1802 |
| 49 | `adjuster:setTargetAdjuster` | 68 | 49 | 49 | **47** | 47 | 24 | 1826 |
| 50 | `ExileUntilSourceLeavesEffect` | 77 | 41 | 49 | **49** | 49 | 25 | 1851 |
| 51 | `WardAbility` | 189 | 33 | 48 | **36** | 35 | 19 | 1870 |
| 52 | `ReturnSourceFromGraveyardToHandEffect` | 84 | 38 | 48 | **19** | 19 | 10 | 1880 |
| 53 | `EntersBattlefieldThisOrAnotherTriggeredAbility` | 97 | 38 | 47 | **24** | 24 | 12 | 1892 |
| 54 | `EntersBattlefieldOrAttacksSourceTriggeredAbility` | 148 | 26 | 46 | **30** | 28 | 15 | 1907 |
| 55 | `UntapSourceEffect` | 114 | 40 | 46 | **12** | 11 | 6 | 1913 |
| 56 | `CantBlockAbility` | 95 | 34 | 46 | **9** | 9 | 5 | 1918 |
| 57 | `FightTargetsEffect` | 67 | 32 | 46 | **42** | 42 | 22 | 1940 |
| 58 | `ReturnToHandChosenControlledPermanentEffect` | 56 | 44 | 46 | **45** | 45 | 23 | 1963 |
| 59 | `adjuster:setCostAdjuster` | 71 | 41 | 45 | **43** | 43 | 22 | 1985 |
| 60 | `ExileTopXMayPlayUntilEffect` | 110 | 37 | 44 | **43** | 41 | 22 | 2007 |
| 61 | `TurnedFaceUpSourceTriggeredAbility` | 90 | 0 | 43 | **43** | 43 | 22 | 2029 |
| 62 | `TransformSourceEffect` | 117 | 28 | 42 | **2** | 2 | 1 | 2030 |
| 63 | `SetBasePowerSourceEffect` | 68 | 34 | 42 | **21** | 21 | 11 | 2041 |
| 64 | `keyword:Madness` | 62 | 33 | 42 | **13** | 13 | 7 | 2048 |
| 65 | `DamageWithPowerFromOneToAnotherTargetEffect` | 63 | 38 | 41 | **38** | 38 | 20 | 2068 |
| 66 | `DiscardCardYouChooseTargetEffect` | 60 | 36 | 41 | **38** | 38 | 20 | 2088 |
| 67 | `EchoAbility` | 52 | 38 | 41 | **8** | 8 | 4 | 2092 |
| 68 | `HeroicAbility` | 51 | 32 | 40 | **40** | 40 | 21 | 2113 |
| 69 | `ConditionalRestrictionEffect` | 62 | 22 | 39 | **36** | 36 | 19 | 2132 |
| 70 | `ExileThenReturnTargetEffect` | 52 | 36 | 39 | **39** | 39 | 20 | 2152 |
| 71 | `AmassEffect` | 49 | 30 | 39 | **38** | 38 | 20 | 2172 |
| 72 | `OrTriggeredAbility` | 71 | 22 | 39 | **38** | 38 | 20 | 2192 |
| 73 | `PreventAllDamageByAllPermanentsEffect` | 47 | 27 | 39 | **36** | 36 | 19 | 2211 |
| 74 | `DrawNthCardTriggeredAbility` | 64 | 25 | 38 | **37** | 37 | 19 | 2230 |
| 75 | `TapSourceUnlessPaysEffect` | 51 | 34 | 38 | **29** | 29 | 15 | 2245 |
| 76 | `DontUntapInControllersNextUntapStepTargetEffect` | 77 | 27 | 37 | **32** | 32 | 16 | 2261 |
| 77 | `AttacksEachCombatStaticAbility` | 66 | 26 | 37 | **8** | 8 | 4 | 2265 |
| 78 | `SpellCostReductionForEachSourceEffect` | 63 | 26 | 37 | **24** | 24 | 12 | 2277 |
| 79 | `TapSourceEffect` | 58 | 14 | 37 | **22** | 22 | 11 | 2288 |
| 80 | `CycleTriggeredAbility` | 47 | 0 | 37 | **37** | 37 | 19 | 2307 |
| 81 | `keyword:CantBeBlockedSource` | 60 | 19 | 36 | **11** | 11 | 6 | 2313 |
| 82 | `InfoEffect` | 59 | 24 | 36 | **32** | 32 | 16 | 2329 |
| 83 | `adjuster:xmage:ThatPlayerControlsTargetAdjuster` | 57 | 29 | 36 | **35** | 35 | 18 | 2347 |
| 84 | `EntersBattlefieldAttachToTarget` | 53 | 30 | 36 | **36** | 36 | 19 | 2366 |
| 85 | `DiesThisOrAnotherTriggeredAbility` | 50 | 22 | 36 | **16** | 16 | 8 | 2374 |
| 86 | `DealsDamageToAPlayerAllTriggeredAbility` | 87 | 28 | 35 | **24** | 24 | 12 | 2386 |
| 87 | `PlayerGainedLifeWatcher` | 63 | 21 | 36 | **35** | 35 | 18 | 2404 |
| 88 | `ReturnSourceFromGraveyardToBattlefieldEffect` | 51 | 24 | 36 | **29** | 29 | 15 | 2419 |
| 89 | `DiscardEachPlayerEffect` | 71 | 27 | 35 | **12** | 12 | 6 | 2425 |
| 90 | `UnearthAbility` | 56 | 26 | 35 | **9** | 9 | 5 | 2430 |

---

# 5. Where the yield falls below 100, which is the question that was asked

Three answers, because there are three columns and they cross at different
places.

| column | first rank below 100 | classes at or above 100 |
|---|---:|---:|
| marginal (cards that lower) | 15 | 14 |
| **MOVABLE (the ceiling)** | **6** | **9** |
| projected working | 4 | 3 |

**Rank 3 is where this stops being worth doing**, and rank 9 is the outer bound
if you want to argue the exchange rate will be better than 51.4% for these
particular classes.

63 of the 90 ranked classes have a movable ceiling under 50. The whole 90-class
list projects 2,430 working cards, and the first three project 402 of them, so
ranks 4 through 90 average 23 cards each. That is 87 classes of work at
card-local rates, which is the exact trade the last two tranches made.

## Why the curve is this flat, measured rather than guessed

9,404 distinct primitives block at least one card. They break down like this:

| prefix | classes | what it is |
|---|---:|---|
| `local:` | 8,137 | a class ONE card file declares for itself |
| `xmage:` | 1,160 | a shared engine class, the thing this document ranks |
| `keyword:` | 88 | a keyword ability |
| `adjuster:` | 11 | a Java object that rewrites an ability at cast time |
| other | 8 | `dsl:`, `helper:`, `dangling-target-ref:` |

**86.5% of the remaining blockers are card-local by construction.** They cannot
be a shared class, because XMage itself did not make them one. The brief's
strategic point is right in principle and the corpus has already spent it: the
shared classes worth porting were ported, and what is left is mostly the long
tail XMage also gave up on sharing.

The 716 shared effect classes in `xmage-effect-rank.commander.json` (405
one-shot, 311 continuous) are not 716 units of equal value. 1,160 of the shared
classes block something, and the top 90 of them cover 6,341 of the 23,324
blocked cards. The rest is a tail.

## The other 2,264

2,264 blocked cards are blocked by **no named class at all**. They carry a
structural refusal `lower.ts` makes on purpose: an adjuster rewrites the ability
at cast time, a static helper added abilities the record never saw, an
additional cost has no field to land in. No entry in this ranking reaches them.
They are held out of the closure rather than being attributed to whichever class
happens to be picked first, which is what the first version of this measurement
did before it was corrected.

---

# 6. Half the top of this list is a decision, not an omission

Of the top 30 classes, **14 are already on a REFUSED table** in
`src/lib/cards/xmage/`, with a written reason. They are not work nobody got to.

That includes four of the top five: `ConditionalContinuousEffect`,
`DoIfCostPaid`, `ConditionalOneShotEffect` and `ScryEffect`. So the three-class
answer in section 1 is not "write three table entries". It is this:

- **`ConditionalContinuousEffect` and `ConditionalOneShotEffect`** need a
  condition table. `{do:'if'}` and `StaticAbility.condition` already exist in
  `dsl.ts`, so this needs no new DSL member and is the one item at the top that
  is genuinely a table. Together: **546 movable, 280 projected.**
- **`DoIfCostPaid`** needs `{do:"do-if-cost-paid"}`, a new `Effect` member.
  PORT-LOG is explicit that `{do:"unless-pays"}` is the opposite polarity and
  reusing it resolves every one of these cards backwards. **238 movable, 122
  projected**, and it is somebody else's file to change.

`dsl.ts`'s `Effect` union is exhaustively switched by `src/lib/game/**`, which
this work order does not own. Everything below rank 3 that needs a new member is
blocked on that owner, not on table-writing effort.

---

# 7. What would change this answer

The exchange rate is the soft number here and it is the one worth attacking. It
has two halves and only one of them is about effect classes at all.

**Gate 3a costs more than any class on this list.** 1,619 of the 6,341 marginal
cards in the top 90 die at a gate without ever reaching the probe, and gate 3a
is 1,271 of them, against 215 unseen, 132 back-face and 1 no-text. Every one of
those 1,271 is a card where the compiler claims `full` coverage. If the compiler
is right about them, the port should never have counted them. If it is wrong
about some of them, that is a precision bug in `deriveCoverage` worth more than
several classes.

Note that `alreadyWorks` is 0 on every row. That is gate ordering, not an
absence: 1,008 of the 23,324 blocked cards already read AUTOMATED or PROMPTED,
and gate 3a catches all of them first, because a card the compiler automates is
a card the compiler covers fully.

**The probe's own dead list is the other half.** The 997 cards the probe
downgraded and the `deadWhy` table it prints, led by advisory keywords and
restrictions that are collected and never read, are cards that already lower and
already swap and still do nothing. Making one of those consumers live moves
cards that are already through all four gates, at a cost that is not 90 classes
of translation.

Neither of those is an effect class. Both are measurable with scripts that
already exist. The recommendation is to port the three classes in section 1,
re-run all three scripts in the table at the top, and take the next decision off
that measurement rather than off this one.
