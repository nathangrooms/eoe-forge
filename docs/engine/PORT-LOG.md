# The port: what was written, in ranked order, and what each entry bought

Status: measured. Code in `src/lib/cards/xmage/`, harness in
`scripts/xmage/port-progress.mjs`, tests in `src/lib/cards/xmage/port.test.ts`.

## Attribution and licence

Behaviour ported here is derived from **XMage**, which is MIT licensed,
`Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
The XMage clone is read in place, outside this repository, and nothing from it
is vendored here. Every file carrying ported logic says so in its own header.

Display string CONTENTS are never copied out of XMage: those strings carry
Wizards of the Coast rules text, which is not XMage's to license. Card wording
in this document and in the tests comes from Scryfall, through
`scripts/coverage/.data/catalogue.json`.

Forge is GPL-3.0. It was not fetched, read or referenced.

## Where every number below comes from

`node --experimental-strip-types scripts/xmage/port-progress.mjs`, run over all
**32168 XMage card files**. It writes
`scripts/coverage/.data/xmage-port-progress.json` and generates this document
from the same run, so no figure here was typed by hand.

---

# 1. What "unlocked" means, and what it does not

The work order in `xmage-record-shape.json` says how many cards each primitive
BLOCKS. That is not how many cards writing it BUYS, because most blocked cards
are blocked by two or three things at once. Quoting a blocked count as an unlock
would overstate this port by a factor nobody could check, which is the mistake
this project has already made twice with coverage.

So the harness empties every ported table, fills them back one step at a time,
and after each step counts the cards where **every ability of every face
lowers**. The delta is what that step bought. Both numbers are in the table
below, side by side, because the gap between them is the point.

A card counts as playable only when the whole card lowers. A card with no
abilities at all is counted separately as vacuous and never added, because "the
engine runs this card" and "this card does nothing" are different claims.

---

# 2. The ranked order, and what each step bought

Denominator 32168 XMage card files. `blocked before` is that primitive's entry in
the pre-port work order; `unlocked` is the measured difference the step made.

| unlocked | cumulative | blocked before | step |
|---:|---:|---:|---|
| 0 | 0 |  | infrastructure: targets, costs, triggers, values, counters |
| 603 | 603 |  | seed effects, already present before this port |
| 162 | 765 | 3103 | keyword:Flying |
| 0 | 765 | 1235 | keyword:Enchant |
| 224 | 989 | 2164 | xmage:CreateTokenEffect |
| 0 | 989 | 1265 | xmage:AttachEffect |
| 58 | 1047 | 980 | keyword:Trample |
| 231 | 1278 | 1192 | xmage:BoostTargetEffect |
| 218 | 1496 | 1118 | xmage:GainLifeEffect |
| 116 | 1612 | 1103 | xmage:AddCountersSourceEffect |
| 304 | 1916 | 1101 | xmage:DestroyTargetEffect |
| 71 | 1987 | 995 | xmage:GainAbilityTargetEffect |
| 945 | 2932 | 4056 | keywords: the rest of the static table |
| 201 | 3133 | 862 | xmage:BoostSourceEffect |
| 143 | 3276 | 769 | xmage:AddCountersTargetEffect |
| 523 | 3799 | 5867 | xmage:SimpleStaticAbility, via the modification table |
| 94 | 3893 | 594 | xmage:EquipAbility |
| 17 | 3910 | 553 | xmage:EntersBattlefieldTappedAbility |
| 452 | 4362 | 1946 | mana abilities |
| 103 | 4465 | 440 | xmage:GainAbilitySourceEffect |
| 130 | 4595 | 427 | xmage:TapTargetEffect |
| 74 | 4669 | 357 | xmage:BoostControlledEffect |
| 139 | 4808 | 346 | xmage:ReturnFromGraveyardToHandTargetEffect |
| 103 | 4911 | 323 | xmage:ExileTargetEffect |
| 99 | 5010 | 300 | xmage:UntapTargetEffect |
| 178 | 5188 | 492 | xmage:SearchLibraryPutInPlayEffect and SearchLibraryPutInHandEffect |
| 46 | 5234 | 256 | xmage:ReturnFromGraveyardToBattlefieldTargetEffect |
| 44 | 5278 | 232 | xmage:LoseLifeTargetEffect |
| 117 | 5395 | 403 | xmage:LoseLifeSourceControllerEffect and LoseLifeOpponentsEffect |
| 56 | 5451 | 199 | xmage:AddCountersAllEffect |
| 44 | 5495 | 196 | xmage:DrawDiscardControllerEffect |
| 57 | 5552 | 188 | xmage:DiscardTargetEffect |
| 87 | 5639 | 365 | xmage:DamagePlayersEffect and DamageAllEffect |
| 46 | 5685 | 163 | xmage:MillCardsControllerEffect |
| 3 | 5688 | 324 | xmage:LoyaltyAbility |
| 106 | 5794 | 171 | xmage:SimpleManaAbility |
| 110 | 5904 | 276 | xmage:GainAbilityControlledEffect and the rest of the grant family |
| 77 | 5981 | 188 | xmage:BoostAllEffect and the rest of the boost family |
| 4 | 5985 | 180 | xmage:InfoEffect |

## Where the curve flattens, and why the port stops here

The curve does not fall off in the order the table is written, and saying it did
would be fitting a story to the numbers. The pre-port work order ranks by cards
BLOCKED, and the three biggest unlocks are grouped table steps that sit in the
middle of it: 945 for the rest of the keyword table, 523 for the modification
table, 452 for the mana abilities.

What the numbers do show is where the tail starts. The five largest steps
account for **2455 of the 5985 cards** (41.02%). Of the 37 ranked primitive
steps, 29 return fewer than 200 cards and 18 return fewer than 100. The median
step returns **103**.

The reason to stop is not that number on its own. It is that number together
with what is left: the largest primitive still missing blocks
802 cards, and everything above it in the remaining order needs either a
new `Effect` member in a file another workflow owns or a boundary of the record
shape moved. Neither is a table entry, so continuing down this list is no longer
the same job. What that 802 would actually unlock is not stated here, because
this port has not measured it and the whole point of the harness is that a
blocked count is not an unlock.

Two rows read zero and are worth reading twice. `keyword:Enchant` and
`xmage:AttachEffect` each unlock nothing ON THEIR OWN, and together with
`BoostEnchantedEffect` in the modification table they carry every Aura in the
corpus. A card needs its WHOLE self to lower, so a primitive's value depends on
what else is present, and any measurement that attributed a fixed number to each
primitive independently would be adding up something that is not additive. This
is the same reason a blocked count is not an unlock.

What remains at the head needs a different KIND of work rather than more of this
one:

- `xmage:ConditionalContinuousEffect` and `xmage:ConditionalOneShotEffect`
  together block 1400 cards and need a condition table. `{do:'if'}` and
  `StaticAbility.condition` already exist, so this needs no new DSL member and
  is the clear next item.
- `xmage:DoIfCostPaid` (584), `xmage:ScryEffect` (352) and
  `xmage:SurveilEffect` (186) need new `Effect` members. `dsl.ts`'s `Effect`
  union is exhaustively switched by `src/lib/game/**`, which another workflow
  owns this session, so adding a member is that owner's decision and not a table
  entry.
- Most of the rest is alternative casting costs: cycling 303, flashback
  204, morph 184, kicker 224. `docs/engine/CARD-SEMANTICS.md`
  section 7 already names those as a boundary of the RECORD shape, not of the
  lowering tables, so no amount of table writing reaches them.

---

# 3. The measurement

| | cards | share |
|---|---:|---:|
| seed tables only, under THIS port's definition | 603 | 1.87% |
| after the port | 5985 | 18.61% |
| abilities lowered | 24752 of 60968 | 40.60% |
| vacuous, no abilities at all, never counted as playable | 351 | 1.09% |

**The before figure is 603 and not the 717 in
`docs/engine/CARD-SEMANTICS.md`, and the difference is not a correction to that
document.** It is a change of definition, and quoting across the two would be
comparing different questions, which is the shape of both previous coverage
overstatements.

The old `lowerAbility` produced `Effect[]`. This one produces a whole
`Ability`, so it now also has to resolve the ability's TARGET SPECS, its COST
LIST and its TRIGGER EVENT, and it refuses abilities carrying a Java target or
cost adjuster. Those are all new ways to fail, so the same seven seed effects
reach fewer cards under the stricter rule: 603 instead of 717. The honest
comparison is 603 to 5985, both measured by this harness, both over the same
32168 records, both under the same definition.

**This is not an automation number and must not be quoted as one.** It says the
record lowers into `dsl.ts` shapes, and a shape is not a running card. Three
things stand between the two, each measured rather than assumed:

1. `scripts/coverage/xmage-runnable.mjs` takes every lowered card to the
   engine's own doors and asks whether anything would throw, be silently
   dropped, or reach the engine and do nothing. Of the 5985
   here it finds 5,984 that would not break and **5,183, 16.11% of the corpus,
   where every ability would actually act**. The ~800 in between are triggered
   abilities `unrunnableReason` in `trigger-bridge.ts` refuses, mostly because
   nothing announces targets for a trigger yet.
2. `scripts/verify-ability-coverage.mjs` goes further and casts real spells on
   a real board, downgrading anything that resolves silently. It downgraded 612
   cards the last time it ran. Nothing in this port has been through it.
3. **Nothing outside `src/lib/cards/xmage/` imports this module.** So the number
   of cards the shipped app plays from these records today is 0. Wiring it into
   `src/lib/game/**` belongs to another workflow.

---

# 4. What each file holds

Every table carries a measured census and an explicit list of what it refuses.

| file | maps | entries | refuses |
|---|---|---:|---:|
| `keywords.ts` | XMage keyword classes to `KeywordAbility` | 37 | 41 |
| `triggers.ts` | trigger classes to `TriggerEvent` | 21 | 12 |
| `targets.ts` | target classes to `TargetSpec` | 29 | 4 |
| `costs.ts` | cost classes to `Cost` | 19 | 6 |
| `values.ts` | dynamic values to `ValueExpr` | 9 | 5 |
| `modifications.ts` | continuous effects to `Modification` | 15 | 6 |
| `lower.ts` | one-shot effects to `Effect` | 41 | 8 |
| `lower.ts` | ability classes carrying their own semantics | 11 | |
| `tokens.generated.ts` | token classes to `TokenSpec` | 741 | |
| `counters.generated.ts` | `CounterType` members to counter names | 234 | |

Two of those are generated rather than typed. `scripts/xmage/extract-tokens.mjs`
parses XMage's token constructors, and `scripts/xmage/extract-counters.mjs`
reads its `CounterType` enum including the sign rule that makes `M1M0` print as
`-1/-0`. Hand transcribing 741 token classes would have been wrong in a handful
of places nobody could find afterwards, because a wrong power on one token looks
exactly like a right one.

---

# 5. What is deliberately refused, and why

Naming a refusal is the difference between work nobody got to and work somebody
decided against. Each of these costs real cards, and each is a decision rather
than an omission.

| refused | where | why |
|---|---|---|
| keyword:Kicker and 39 other keywords | `keywords.ts` | They change how a spell is CAST, or carry behaviour the record holds on a different ability and cannot link to this one. Emitting `keyword:"kicker"` alone gives a spell that resolves and never kicks. |
| keyword:Protection | `keywords.ts` | Its parameter is a filter and `KeywordAbility.parameter` is printed text. Writing "from red" would be this project inventing rules text it takes from Scryfall. |
| xmage:ScryEffect, xmage:SurveilEffect | `lower.ts` | `dsl.ts` has neither member. Scrying is a hidden choice that reorders the library, and doing nothing is not a conservative approximation of it. |
| xmage:DoIfCostPaid | `lower.ts` | Needs `{do:"do-if-cost-paid"}`. `{do:"unless-pays"}` is the opposite polarity, so reusing it resolves every one of these cards backwards. |
| xmage:ConditionalOneShotEffect, xmage:ConditionalContinuousEffect | `lower.ts and modifications.ts` | Need the condition table. `{do:"if"}` and `StaticAbility.condition` both already exist; the mapping from an XMage `Condition` does not. This is the largest remaining item that needs no new DSL member. |
| xmage:RegenerateSourceEffect | `lower.ts` | Regeneration is a replacement shield the reducer does not model, so a destroy would quietly happen anyway. |
| xmage:TargetCreaturePermanentAmount, xmage:TargetAnyTargetAmount | `targets.ts` | Divided damage. `TargetSpec` counts targets and carries no amount per target. |
| xmage:PayEnergyCost, xmage:OrCost, xmage:CompositeCost | `costs.ts` | `Cost[]` is a conjunction with no alternative, and there is no member for spending a player counter. |
| xmage:HalfValue, xmage:CardsInAllGraveyardsCount and three more | `values.ts` | Rounding modes and folds over sets that `ValueExpr` cannot spell. A quantity wrong by one is worse than a card that refuses. |
| any ability carrying a target or cost adjuster | `lower.ts` | A Java object rewrites the ability at cast time and the record holds only its class name. Word of Binding was lowering to a spell that taps one creature. |
| any ability built by a static helper | `lower.ts` | The helper adds abilities the record never saw. Cyclonic Rift is the example, 35 abilities across the corpus. |

---

# 6. Where XMage and the printed card disagree

The rule is that the oracle text wins. Two disagreements are pinned by tests.

**Menace.** `MenaceAbility(boolean)` takes `showAbilityHint`, and both of its
constructors build the same ability. The boolean is a client display flag and
not part of the card, so it is read and discarded rather than surfaced as a
keyword parameter. 242 cards pass it. Checked in `MenaceAbility.java` rather
than assumed. Test: Alley Strangler.

**Wrath of God.** The card says "They can't be regenerated" and `dsl.ts` has no
member for it. `noRegen` is read and dropped, which is safe only because
`xmage:RegenerateSourceEffect` is refused by name, so no permanent this port
builds has a regeneration shield for the clause to matter against. If
regeneration is ever added, a grep for `noRegen` finds the line and the test.
Test: Wrath of God.

---

# 7. Four bugs real cards found that reading the code did not

Every one of these produced a card that RAN and was wrong, which is worse than a
card that refuses, and every one survived until a named card was walked through
the pipeline. That is the argument for a hard list of real cards over fixtures
somebody wrote.

**Static factory arguments were being discarded.** XMage writes a counter as
`CounterType.M1M1.createInstance(4)`, and `AddCountersSourceEffect` reads the
count off the Counter object rather than off its own `amount` parameter. The
record builder dropped a factory's arguments, so every "put four counters" card
read as one. `Carried.factory` had always declared an `args` field; nothing was
filling it. Test: Blight Rot.

**The "controlled" family lost its controller.** `GainAbilityControlledEffect`
gets "you control" from the CLASS and takes a filter describing only the kind of
permanent. Reading the filter alone granted the ability to every creature on the
battlefield. Garruk Wildspeaker's "-4: Creatures you control get +3/+3 and gain
trample" boosted correctly and gave trample to the whole table, so the card ran
and only half of it was wrong. Test: Garruk Wildspeaker.

**Target adjusters were invisible.** "Tap X target creatures" arrives as one
target with no counts, plus `setTargetAdjuster(new XTargetsCountAdjuster())`.
The record holds the adjuster's class name and nothing about what it does, so
the card lowered to a spell that taps exactly one creature. Same failure class
as Cyclonic Rift. Abilities carrying an adjuster are now blocked by
construction. Test: Word of Binding.

**A colour table keyed on the wrong strings.** `ColoredManaSymbol`'s members are
the letters `W U B R G`, and the first version of the cost table read the colour
words. It matched nothing and refused every single-coloured activation cost in
the corpus, Shivan Dragon included. Test: Shivan Dragon.

A fifth was found by the harness rather than by a card: one `Mana` field carries
`Integer.MAX_VALUE`, and an unbounded `String.repeat` on it crashed the whole
measurement 5,727 records into a 32168 record run.

---

# 8. The tests

`src/lib/cards/xmage/port.test.ts`. One test per primitive, each built from a
real card, each asserting that card's Scryfall oracle text before it asserts the
lowering. The oracle assertion is not decoration: it pins the quote in the test
to the printed card, so a quoted line cannot drift away from the behaviour it is
there to justify.

The fixtures in `port.fixtures.generated.ts` are `buildRecord`'s own output for
those cards, frozen by `scripts/xmage/make-fixtures.mjs`. They are not written
by hand, because a hand-written record records what its author BELIEVED the
extraction produces, and a lowering tested against one can pass while failing on
every real card.

Six tests assert a REFUSAL. A port with no refusal tests has not shown it can say
no, and saying no is most of what the last two coverage overstatements needed.
