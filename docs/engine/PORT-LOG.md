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
| 512 | 512 |  | seed effects, already present before this port |
| 161 | 673 | 3103 | keyword:Flying |
| 0 | 673 | 1235 | keyword:Enchant |
| 218 | 891 | 2164 | xmage:CreateTokenEffect |
| 0 | 891 | 1265 | xmage:AttachEffect |
| 57 | 948 | 980 | keyword:Trample |
| 229 | 1177 | 1192 | xmage:BoostTargetEffect |
| 211 | 1388 | 1118 | xmage:GainLifeEffect |
| 120 | 1508 | 1103 | xmage:AddCountersSourceEffect |
| 278 | 1786 | 1101 | xmage:DestroyTargetEffect |
| 78 | 1864 | 995 | xmage:GainAbilityTargetEffect |
| 952 | 2816 | 4056 | keywords: the rest of the static table |
| 358 | 3174 | 862 | xmage:BoostSourceEffect |
| 143 | 3317 | 769 | xmage:AddCountersTargetEffect |
| 696 | 4013 | 5867 | xmage:SimpleStaticAbility, via the modification table |
| 101 | 4114 | 594 | xmage:EquipAbility |
| 18 | 4132 | 553 | xmage:EntersBattlefieldTappedAbility |
| 448 | 4580 | 1946 | mana abilities |
| 189 | 4769 | 440 | xmage:GainAbilitySourceEffect |
| 129 | 4898 | 427 | xmage:TapTargetEffect |
| 90 | 4988 | 357 | xmage:BoostControlledEffect |
| 139 | 5127 | 346 | xmage:ReturnFromGraveyardToHandTargetEffect |
| 85 | 5212 | 323 | xmage:ExileTargetEffect |
| 103 | 5315 | 300 | xmage:UntapTargetEffect |
| 163 | 5478 | 492 | xmage:SearchLibraryPutInPlayEffect and SearchLibraryPutInHandEffect |
| 39 | 5517 | 256 | xmage:ReturnFromGraveyardToBattlefieldTargetEffect |
| 45 | 5562 | 232 | xmage:LoseLifeTargetEffect |
| 110 | 5672 | 403 | xmage:LoseLifeSourceControllerEffect and LoseLifeOpponentsEffect |
| 55 | 5727 | 199 | xmage:AddCountersAllEffect |
| 45 | 5772 | 196 | xmage:DrawDiscardControllerEffect |
| 52 | 5824 | 188 | xmage:DiscardTargetEffect |
| 85 | 5909 | 365 | xmage:DamagePlayersEffect and DamageAllEffect |
| 48 | 5957 | 163 | xmage:MillCardsControllerEffect |
| 2 | 5959 | 324 | xmage:LoyaltyAbility |
| 105 | 6064 | 171 | xmage:SimpleManaAbility |
| 117 | 6181 | 276 | xmage:GainAbilityControlledEffect and the rest of the grant family |
| 80 | 6261 | 188 | xmage:BoostAllEffect and the rest of the boost family |
| 1 | 6262 | 180 | xmage:InfoEffect |

## Where the curve flattens, and why the port stops here

The curve does not fall off in the order the table is written, and saying it did
would be fitting a story to the numbers. The pre-port work order ranks by cards
BLOCKED, and the three biggest unlocks are grouped table steps that sit in the
middle of it: 952 for the rest of the keyword table, 696 for the modification
table, 448 for the mana abilities.

What the numbers do show is where the tail starts. The five largest steps
account for **2732 of the 7134 cards** (38.30%). Of the 37 ranked primitive
steps, 29 return fewer than 200 cards and 17 return fewer than 100. The median
step returns **103**.

The reason to stop is not that number on its own. It is that number together
with what is left: the largest primitive still missing blocks
303 cards, and everything above it in the remaining order needs either a
new `Effect` member in a file another workflow owns or a boundary of the record
shape moved. Neither is a table entry, so continuing down this list is no longer
the same job. What that 303 would actually unlock is not stated here, because
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
  together block 19 cards and need a condition table. `{do:'if'}` and
  `StaticAbility.condition` already exist, so this needs no new DSL member and
  is the clear next item.
- `xmage:DoIfCostPaid` (0), `xmage:ScryEffect` (0),
  `xmage:SurveilEffect` (0) and
  `xmage:LookLibraryAndPickControllerEffect` (0) each needed a new
  `Effect` member and each has one now: `{do:'do-if-cost-paid'}`, `{do:'scry'}`,
  `{do:'surveil'}` and `{do:'look-and-pick'}`, added 24 Aug 2026 and written up
  in `docs/engine/PORT-DSL-GROWTH.md`. Every one of the four is a DECISION, so
  the cards they unlock are PROMPTABLE and not PROMPTED, and the headline did
  not move. What is still missing is the two that need engine STATE rather than
  vocabulary: `xmage:CreateDelayedTriggeredAbilityEffect`
  (286), which needs somewhere for a trigger that belongs to no
  card to live, and `xmage:RegenerateSourceEffect` (161), which needs the
  destruction path to spend a shield.
- Most of the rest is alternative casting costs: cycling 303, flashback
  204, morph 184, kicker 205. `docs/engine/CARD-SEMANTICS.md`
  section 7 already names those as a boundary of the RECORD shape, not of the
  lowering tables, so no amount of table writing reaches them.

---

# 3. The measurement

| | cards | share |
|---|---:|---:|
| seed tables only, under THIS port's definition | 512 | 1.59% |
| after the port | 7134 | 22.18% |
| abilities lowered | 26730 of 60968 | 43.84% |
| vacuous, no abilities at all, never counted as playable | 351 | 1.09% |

**The before figure is 512 and not the 717 in
`docs/engine/CARD-SEMANTICS.md`, and the difference is not a correction to that
document.** It is a change of definition, and quoting across the two would be
comparing different questions, which is the shape of both previous coverage
overstatements.

The old `lowerAbility` produced `Effect[]`. This one produces a whole
`Ability`, so it now also has to resolve the ability's TARGET SPECS, its COST
LIST and its TRIGGER EVENT, and it refuses abilities carrying a Java target or
cost adjuster. Those are all new ways to fail, so the same seven seed effects
reach fewer cards under the stricter rule: 512 instead of 717. The honest
comparison is 512 to 7134, both measured by this harness, both over the same
32168 records, both under the same definition.

**This is not an automation number and must not be quoted as one.** It says the
record lowers into `dsl.ts` shapes, and a shape is not a running card. Three
things stand between the two, each measured rather than assumed:

1. `scripts/coverage/xmage-runnable.mjs` takes every lowered card to the
   engine's own doors and asks whether anything would throw, be silently
   dropped, or reach the engine and do nothing. Of the 7134
   here it finds 5,855 that would not break and
   **5,054, 15.71% of the corpus, where every
   ability would actually act**. The ones in between are mostly triggered
   abilities `unrunnableReason` in `trigger-bridge.ts` refuses because nothing
   announces targets for a trigger yet, which is the largest seam left.
2. `scripts/verify-ability-coverage.mjs` goes further and casts real spells on
   a real board through the real reducer, and downgrades anything that resolves
   silently. It is the only measurement here that describes what a player
   experiences, and **every figure in this document is a ceiling above it**.
3. **These records now reach the shipped app, and that is new.**
   `src/lib/cards/xmage/lowered.generated.ts` holds 7,392
   of the cards above, already lowered into `dsl.ts` shapes and keyed by
   Scryfall oracle id. `lowered.ts` states the precedence rule that decides
   when they are used, and `compileWithTrace` in
   `src/lib/cards/abilities/compiler.ts` applies it.

   The line that used to sit here said the number of cards the shipped app
   plays from these records is 0. That was true for TWO separate reasons and
   only the first was closed when the artifact was generated.

   FIRST: nothing outside `src/lib/cards/xmage/` imported the module, because
   there was no artifact a browser could import. There is one now.

   SECOND, and it outlived the first fix: the table is keyed by Scryfall
   `oracle_id`, `card-abilities.ts` reads that id off `CardInstance.oracleId`,
   and `PlayCard` had no field to carry one. So `buildTable` set no oracle id on
   any card in any game, every lookup missed, and a table dealt from a deck of
   60 cards that all swap ran 0 of them. The import was real and no game ever
   reached it. No measurement outside a game could see this, because the
   coverage script hands the compiler a Scryfall row and a Scryfall row always
   has an oracle id.

   Closed 23 Aug 2026: `PlayCard.oracleId` added, `oracle_id` projected in both
   deck queries, carried through `buildTable`, and the harness pool given the
   same field at POOL_VERSION 5. `reachability.test.ts` holds the ratchet. The
   20-game harness went from 26,223 actions to 27,036 on the same seeds, which
   is the port doing work in a real game for the first time.

   **That count is still not an automation number.** It is how many cards the
   app CAN consult, not how many it runs, and the two differ by every card
   whose abilities no consumer in `src/lib/game/**` reads. Only item 2 answers
   the second question, and it is the only one that should ever be quoted.

---

# 4. What each file holds

Every table carries a measured census and an explicit list of what it refuses.

| file | maps | entries | refuses |
|---|---|---:|---:|
| `keywords.ts` | XMage keyword classes to `KeywordAbility` | 37 | 41 |
| `triggers.ts` | trigger classes to `TriggerEvent` | 21 | 12 |
| `targets.ts` | target classes to `TargetSpec` | 26 | 7 |
| `costs.ts` | cost classes to `Cost` | 19 | 6 |
| `values.ts` | dynamic values to `ValueExpr` | 8 | 6 |
| `modifications.ts` | continuous effects to `Modification` | 16 | 5 |
| `lower.ts` | one-shot effects to `Effect` | 57 | 5 |
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
| xmage:ConditionalOneShotEffect, xmage:ConditionalContinuousEffect | `lower.ts and modifications.ts` | Need the condition table. `{do:"if"}` and `StaticAbility.condition` both already exist; the mapping from an XMage `Condition` does not. This is the largest remaining item that needs no new DSL member. |
| xmage:RegenerateSourceEffect | `lower.ts` | Regeneration is a replacement shield the reducer does not model, so a destroy would quietly happen anyway. `primitives/extended-dsl.ts` stages the verb and `primitives/regenerate.ts` builds the shield; what is missing is anything that SPENDS one. |
| four `PutCards` members inside xmage:LookLibraryAndPickControllerEffect | `lower.ts` | `BATTLEFIELD_TAPPED_ATTACKING` and `BATTLEFIELD_TRANSFORMED` name board states `CardDestination` cannot spell, `TOP_OR_BOTTOM` is a second decision per card on top of which cards were taken, and `SHUFFLE` is a zone followed by an action a destination does not carry. The other eight members have entries. |
| xmage:TargetCreaturePermanentAmount, xmage:TargetAnyTargetAmount | `targets.ts` | Divided damage. `TargetSpec` counts targets and carries no amount per target. |
| xmage:PayEnergyCost, xmage:OrCost, xmage:CompositeCost | `costs.ts` | `Cost[]` is a conjunction with no alternative, and there is no member for spending a player counter. |
| xmage:HalfValue, xmage:CardsInAllGraveyardsCount and three more | `values.ts` | Rounding modes and folds over sets that `ValueExpr` cannot spell. A quantity wrong by one is worse than a card that refuses. |
| any ability carrying a target or cost adjuster | `lower.ts` | A Java object rewrites the ability at cast time and the record holds only its class name. Word of Binding was lowering to a spell that taps one creature. |
| any ability built by a static helper | `lower.ts` | The helper adds abilities the record never saw. Cyclonic Rift is the example, 35 abilities across the corpus. |
| any spell or triggered ability carrying an additional cost | `lower.ts` | `ActivatedAbility` and `ManaAbility` have a `costs` field and `SpellAbility` and `TriggeredAbility` do not, so the cost was read for two kinds and silently dropped for the other two. Raze destroyed a land without sacrificing one. 304 spell and 99 triggered abilities across the corpus. |
| any ability whose effects read a target it does not announce | `lower.ts` | A modal ability keeps its targets on each MODE, so the ability-level target list came out empty while every mode still read `{sel:"target", ref:0}`. Dawnbringer Cleric is the example. Checked structurally on the finished ability, so it catches any other shape that loses a spec the same way. |
| any effect or ability carrying a chained call nothing reads | `chained-calls.ts` | XMage writes a lot of a card after the constructor closes. `CreateTokenEffect(...).withAdditionalTokens(a, b)` is three tokens and Triplicate Titan was making one; `.withOtherwiseEffect(...)` on a look-and-pick is a printed sentence and Contagious Vorrac was losing it; `.addLieutenantEffect(...)` is half of Thunderfoot Baloth. So a chained call is now either READ by a lowering, or listed as INERT with the argument for why it carries no rules meaning, or the whole thing REFUSES. All three lowering paths consult the one list, and `scripts/xmage/port-refute-mod-census.mjs` reports what is left: zero shipped cards. |
| any ability whose XMage class extends SpellAbility | `lower.ts` | 30 classes, from `PayMoreToCastAsThoughtItHadFlashAbility` to `FlashbackAbility`. Every one is an alternative way to CAST the card, and every one is also classified `activated-ability` by the extraction because its Java class implements `ActivatedAbility` as well. Lowering one gives the card a repeatable ability it does not have: Saproling Symbiosis came out as "{2}: Create a 1/1 green Saproling creature token for each creature you control", with no zone and no limit. |
| ForecastAbility, BoastAbility, LieutenantAbility | `lower.ts` | Three classes that write their printed restrictions into their own CONSTRUCTOR BODY, where the record — which holds a class name and its arguments — cannot see them. Forecast is hand-zone, upkeep-only, once a turn and reveal-as-a-cost, and lowered to none of the four. Lieutenant builds a +2/+2 of its own and wraps everything it is given in "as long as you control your commander". `scripts/xmage/port-refute-class-restriction-census.mjs` reads every ability class XMage has and reports the rest: zero shipped cards. |
| a filter or a TargetController the record CARRIED and this port could not read | `costs.ts, triggers.ts` | An argument the card wrote and this port did not resolve is a HOLE, never an absence. Read as an absence it widens the card: Sanctum Spirit's "Discard a historic card" became "discard a card", and Fevered Visions' `TargetController.EACH_PLAYER` became "your end step", so at a four-player table it fired once where it should fire four times. `values.ts` already drew this distinction for one reader; the cost and trigger readers draw it now too. |
| a token that arrives ATTACKING, and a cost or target confined to ONE graveyard | `lower.ts, costs.ts, targets.ts` | `{do:"create-token"}` carries `tapped` and has nothing for "and attacking", so Falconer Adept's Bird was made beside the attack rather than in it. `Selector` names a set and cannot say "and all of them from the same one of these sets", so Night Soil's "two creature cards from a single graveyard" was payable with one card from each of two. |

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

# 7. Six bugs real cards found that reading the code did not

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

**An additional cast cost read for two ability kinds and dropped for the other
two.** `lowerResolving` reads `ability.costs` when the lowered shape is an
`ActivatedAbility` or a `ManaAbility`, because those have a `costs` field.
`SpellAbility` and `TriggeredAbility` do not, so the branch never looked and the
cost vanished without a word. Raze, "as an additional cost to cast this spell,
sacrifice a land", destroyed a land for free. Harvest Pyre exiled nothing and
dealt X = nothing. Thunderherd Migration revealed no Dinosaur and paid no {1}.
403 abilities across the corpus arrive this way. Tests: Raze.

**A modal ability's targets left on the modes.** Dawnbringer Cleric's three
modes each read `{sel:"target", ref:0}` while the ability announced no targets
at all, because `lowerTargets` was given the ability's own empty list and each
mode's specs were never lifted onto it. An effect reading an unbound ref either
does nothing or hits whatever sits at index zero, and both are a card that
resolved and lied. Tests: Dawnbringer Cleric.

Both of the last two were found the same way as the four above and only that
way: by walking a named card through after this lowering was wired into the
shipped compiler. Neither was visible from reading `lower.ts`, and both had a
green suite over them the entire time.

A seventh was found by the harness rather than by a card: one `Mana` field
carries `Integer.MAX_VALUE`, and an unbounded `String.repeat` on it crashed the
whole measurement 5,727 records into a 32168 record run.

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
