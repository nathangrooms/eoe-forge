# PORT-PRIMARY

Why the XMage port speaks for 1,914 cards when it lowers 7,237, counted at every
step; whether the named gate bug is real; what the port could still reach; and
how accurate the cards it already passes actually are.

Measured 24 August 2026. **No precedence was changed.** Every file this session
touched is a new read-only script under `scripts/xmage/` plus this document.
`lowered.ts`, `compiler.ts` and everything under `src/lib/game/` are byte for
byte what they were at the start.

## Attribution and licence

Behaviour described here is derived from **XMage**, which is MIT licensed,
`Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
The clone is read in place, outside this repository, and nothing from it is
vendored here. XMage's display strings are never copied: those carry Wizards of
the Coast rules text, which is not XMage's to license, so every line of card
wording quoted below comes from Scryfall. Forge is GPL-3.0 and was not fetched,
read or referenced.

## Every number here, and the command that produced it

Nothing below was typed from memory or carried over from a previous session.

```
DM_CARD_DUMP=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
node --experimental-strip-types scripts/xmage/port-primary-dispositions.mjs
node --experimental-strip-types scripts/xmage/port-primary-funnel.mjs
node --experimental-strip-types scripts/xmage/port-primary-accuracy-sample.mjs
node --experimental-strip-types scripts/xmage/port-primary-handcheck.mjs
DM_XMAGE_OFF=1 node --experimental-strip-types scripts/xmage/port-primary-handcheck.mjs
node --experimental-strip-types scripts/xmage/port-primary-defect-census.mjs
node --experimental-strip-types scripts/xmage/port-primary-sibling-collapse.mjs
```

The first run reproduced the brief's headline exactly, which is the check that
this session is measuring the same thing the brief measured:

| who spoke for the card | cards | AUTOMATED | PROMPTED | passing | share |
|---|---:|---:|---:|---:|---:|
| compiler | 30,555 | 3,808 | 773 | 4,581 | 14.99% |
| xmage port | 1,914 | 812 | 236 | 1,048 | 54.75% |
| **pool** | **32,469** | **4,620** | **1,009** | **5,629** | **17.34%** |

`port-primary-dispositions.mjs` reconciles against the eight counters in
`XMAGE_LOWERED_STATS` and refuses to write if any one of them differs, so the
per card record dispositions it produces are the emitter's own decisions and not
a second opinion about them.

---

# 1. The funnel

```
  32,469  cards in the pool
  30,666  XMage has a record joined to this oracle id        94.45%
   6,917  that record lowered and is in the shipped table    21.30%
   1,914  the precedence rule let it speak                    5.89%
   1,048  and the probe then passed the card                  3.23%
```

The shipped table holds 7,237 cards. 320 of them key an oracle id that is not in
the pool at all, which is the paper filter doing its job, so 6,917 is the number
any precedence question is actually about.

**The whole loss is at one step.** Between 6,917 and 1,914, nothing is lost to
anything subtle:

| | cards |
|---|---:|
| SWAPPED | 1,914 |
| refused: compiler understands this card completely | 4,917 |
| refused: the card has text on a face the engine does not play | 86 |

There is no fourth row. `xmageSwapFor` has five refusal sentences and three of
them fired zero times.

## The second half of the gap, resolved

The brief says "even with the gate open, 5,323 lowered cards do not reach the
board. Whatever stops them is the second thing to find." It is now found, and it
is not a second mechanism:

```
  7,237  in the shipped table
   -320  key an oracle id outside the paper pool
 -4,917  the gate refused: the compiler already reads the whole card
    -86  the gate refused: text on a face the engine does not play
 ------
  1,914  swapped
```

`320 + 4,917 + 86 = 5,323`. The gate is the entire story. There is nothing else
holding cards back between lowering and the board.

---

# 2. The named bug: refuted where it was named, real one layer down

The effect-class report says:

> compileWithTrace recomputes coverage from the swapped ability list with an
> empty unparsed list, so a card the XMage record spoke for usually reports
> full, the opposite of the pre-swap value the rule tested.

and the brief glosses that as "the gate tests a value that the swap itself
changes". Those are two different claims and they have two different answers.

## 2.1 The gate reads the PRE-swap value. Refuted, and proved with 32,469 cards

`compiler.ts:709` calls `xmageSwapFor(result, normalized)` where `result` is the
compiler's own record, whose coverage was set at line 688 by
`deriveCoverage(abilities, unparsed)`. The swapped object is not built until line
711, and its recomputed `deriveCoverage(decision.swap.abilities, [])` is at line
716, both AFTER the gate has already answered. `lowered.ts:176` is the gate
itself. Within one call the gate cannot see the value the swap writes.

That is an argument. Here is the measurement.

`port-primary-funnel.mjs` runs the real compiler twice, in two processes. The
first has `DM_XMAGE_OFF=1`, so `xmageSwapFor` refuses everything and
`compileWithTrace` returns the compiler's untouched answer: that is the pre-swap
coverage, produced by the shipped code rather than by a copy of it. The second
runs exactly as the app does. The script then predicts each card's source from
the PRE-swap coverage alone and compares that prediction to what the live
compiler actually did.

```
cards where the source predicted from the PRE-swap coverage
disagrees with what the live compiler did: 0
```

Zero, over all 32,469. If the gate read the post-swap value the prediction would
be wrong on all 1,914 swapped cards, because every one of them reads `full`
afterwards. **The named bug, as a claim about the gate, is refuted.**

Two processes and not two module instances, and this is worth writing down
because the wrong version looked like a real finding. A query string on an
`import()` specifier does give a second instance of that file, but the query does
not propagate to its own imports, so both compiler instances shared one
`lowered.ts` and one `DM_XMAGE_OFF`. That first version reported zero swaps for
the whole pool, which reads exactly like a catastrophic gate bug and was a bug in
the measuring script.

## 2.2 The recompute is real, and it is load bearing one layer down. Confirmed

The recompute at `compiler.ts:716` does happen and it does turn every swapped
card into `coverage: 'full'`:

```
coverage on the swapped cards, before -> after
  1,284  partial -> full
    624  manual  -> full
      6  none    -> full
  1,914  swapped cards whose RETURNED coverage now reads 'full'
  1,914  of which the gate WOULD refuse if it were re-asked on its own output
```

So the value is self-defeating on a second pass. Nothing in the shipped app
performs that second pass: `card-abilities.ts` caches on the inputs and never
feeds a result back in, and no other caller hands a `CardAbilities` to
`xmageSwapFor`. But `swap-census.mjs` had to write `continue` to avoid exactly
this, which is the shape of a trap somebody walks into later.

**What the recompute really costs is not the gate. It is trigger ownership.**

`trigger-bridge.ts:575`, inside `abilityEngineOwns`:

```ts
if (record.coverage !== 'full') return false;
```

`abilityEngineOwns` is the predicate that decides whether the ability engine or
the older detector in `effects.ts` runs a card's triggers. It reads `coverage`
meaning "the compiler accounted for every clause of the printed card". After a
swap, `full` means something else entirely: "the record spoke for the whole card
and the unparsed list was emptied". The same word, two meanings, one consumer.

Measured on four named cards, with the second source on and then off:

| card | source | coverage | abilityEngineOwns |
|---|---|---|---|
| Valley Mightcaller | xmage | full | **true** |
| Valley Mightcaller | compiler (`DM_XMAGE_OFF=1`) | partial | false |
| Acidic Slime | xmage | full | **true** |
| Acidic Slime | compiler | partial | false |
| Scourge of the Undercity | xmage | full | **true** |
| Scourge of the Undercity | compiler | partial | false |
| Promise of Bunrei | xmage | full | **true** |
| Promise of Bunrei | compiler | partial | false |

The swap moves trigger ownership. Over the whole pool, **587 swapped cards now
read `full` and carry a triggered ability**, and every one of them was
non-`full` before the swap, so every one of them is a card where ownership
changed hands because of the recompute.

That is defensible, and it is the intent of a whole-card swap: if the record
speaks for the entire card there is no unread clause for the old detector to be
seeing. It is not a bug in the sense of being wrong. It is a bug in the sense
that a reader of `abilityEngineOwns` cannot tell which of the two meanings they
are getting, and 587 cards depend on it.

## 2.3 What the swap erases, stated rather than hidden

```
1,085  swapped cards that had unread paragraphs before the swap
1,176  unread paragraphs erased in total
```

`unparsed: []` on the swapped record is not a claim that there was nothing to
read. It is a claim that the record replaced the whole card. The 1,176
paragraphs the compiler could not read are gone from the record, so no report
downstream can see them, and section 5 is what that costs in practice.

---

# 3. The 25,648 refused cards the port never spoke for

Refused means SILENT or PROMPTABLE. NO-TEXT is not a refusal, because the card
has no oracle text for anything to speak for, and folding it in gives 25,974,
which is a different question wearing the same number's clothes. 25,648 is the
brief's figure and it reconciles exactly.

| # | why the port did not speak | cards | share |
|---|---|---:|---:|
| 1 | XMage has no record joined to this oracle id | 1,757 | 6.85% |
| 3 | the record exists and did not lower | 22,445 | 87.51% |
| 4 | the record lowered to nothing at all | 1 | 0.00% |
| 7 | it lowers, and the gate refused: compiler coverage is full | **1,359** | 5.30% |
| 8 | it lowers, and the gate refused: text on a face the engine does not play | 86 | 0.34% |

Rows 2, 5, 6 and 9 are zero: no record joined inexactly, none lowered to a manual
marker, no oracle id was claimed by two XMage classes, and there is no card where
the gate passed and nothing ran it.

## The answer that decides the next phase

**Of the 25,648, the port has a usable record for 1,445 of them.** That is rows 7
and 8. Everything else has no record or a record that does not lower.

Opening the gate cannot buy more than 1,445 cards, and 86 of those are held back
by a separate bar about faces the engine does not play. The addressable
population is **1,359 cards, 4.19% of the pool**.

Measured, not projected: `port-primary-funnel.mjs` builds the ability list the
swap would have produced for each of those 1,359 and puts it to the shipped
`probeBehaviour`.

```
1,359  cards in row 7, the whole addressable population
  616  the XMage abilities probe as ran
  545  the XMage abilities probe as deferred
  198  the XMage abilities probe as silent
  473  of which 'ran' with at least one action, the probe's own bar
```

473 is a **ceiling** on that row and not a verdict. `verify-ability-coverage.mjs`
applies further bars after the probe, and every one of them can only take cards
away from this number. 473 cards is 1.46 points of the pool.

## What the gate is protecting, which is the larger half

The gate refused 4,917 in-pool cards on `compiler coverage is full`. Row 7 is
only 1,359 of them. The other 3,558:

```
3,558  the compiler already passes this card
  941  the compiler does not: SILENT
  418  the compiler does not: PROMPTABLE
```

**3,558 cards, 10.96% of the pool, already pass through the compiler and would be
handed to the port if the gate were opened without a condition.** They are 72.4%
of the 4,917 cards the gate refuses on that sentence. Section 5 measures how often the port's answer
disagrees with the printed card, and that rate is what any unconditional opening
would be trading 3,558 working cards against.

## Where the other 22,445 actually are

The port has a record for these and the record did not lower. The primitives
blocking the most of them:

| cards blocked | primitive |
|---:|---|
| 572 | `xmage:DoIfCostPaid` |
| 340 | `xmage:ScryEffect` |
| 262 | `xmage:CreateDelayedTriggeredAbilityEffect` |
| 241 | `xmage:LookLibraryAndPickControllerEffect` |
| 230 | `dsl:SpellAbility.costs` |
| 224 | `keyword:Kicker` |
| 222 | `xmage:SagaAbility` |
| 203 | `xmage:FlashbackAbility` |
| 193 | `xmage:CyclingAbility` |
| 189 | `xmage:SurveilEffect` |
| 187 | `xmage:WardAbility` |
| 184 | `xmage:MorphAbility` |
| 183 | `xmage:AddCountersSourceEffect` |
| 177 | `xmage:CrewAbility` |
| 154 | `xmage:AttacksWithCreaturesTriggeredAbility` |

`PORT-LOG.md` section 2 already says a blocked count is not an unlock, and that
warning applies here with full force. Most of these cards are blocked by two or
three of these at once, so the column does not add up to 22,445 and must never be
summed. Writing the top primitive buys the cards it is the ONLY blocker on, and
that number is not in this table because this session did not measure it.

---

# 4. What this means for the brief's finding

The brief's reading was:

> We built the better path and gated it behind the worse one. That is the
> finding, and it is why three days of tranches moved the number so little.

The first half is right about the ratio and wrong about the size of the prize.
The port does pass 3.6 times better on the cards it speaks for. But the gate is
not sitting on a large refused population: it is sitting on 1,359 refused cards
and 3,558 working ones. Opening it is worth at most 473 cards by the probe's own
bar, which is 1.46 points, and it puts 3,558 currently working cards in the path
of whatever the port's error rate turns out to be.

The 22,445 cards whose record does not lower are 87.5% of the refusals and the
gate has nothing to do with them. They are a lowering-table problem and a
`dsl.ts` problem, exactly as `PORT-LOG.md` section 2 says.

---

# 5. The accuracy baseline

The project law says every phase that moves the number must hand check a sample
against Scryfall oracle text and report the disagreement rate beside the coverage
figure, and that above 5% the work stops and the disagreement gets fixed first.

## How the 30 were chosen

`port-primary-accuracy-sample.mjs` takes the 1,048 cards the port already passes,
sorts them by oracle id, and takes every 34th. That is an arbitrary order nobody
controls, at a stride fixed by the count. Run it twice and it returns the same 30
cards. There is no seed to nudge and no filter on what makes an interesting card.
It prints, per card, Scryfall's oracle text verbatim, every ability the engine
ended up with as `dsl.ts` shapes, and what `probeBehaviour` did with them. It
grades nothing.

The grading below is by hand, against the printed card, one line per card.

## The result

| | cards | share |
|---|---:|---:|
| the engine does what the card says | 16 | 53.3% |
| **the engine does NOT do what the card says** | **14** | **46.7%** |

**46.7% is more than nine times the 5% bar.** Under the project law that is a
full stop: nothing may buy more coverage on this path until it comes down.

Both figures are over cards the shipped verdict already counts as passing. 812 of
the 1,048 are AUTOMATED, 236 are PROMPTED, and the sample was drawn across both.

## All 30, so the rate can be audited

Sample order is the stride order the script produced. Full oracle text, full
lowered abilities and the probe output for every one of these is in
`scratch/port-primary-accuracy-sample.txt` and `.json`.

| # | card | verdict | agrees | what is wrong |
|---:|---|---|---|---|
| 1 | Hua Tuo, Honored Physician | PROMPTED | no | "Activate only during your turn, before attackers are declared" is gone |
| 2 | Rend Flesh | AUTOMATED | yes | |
| 3 | Unliving Legionnaire | PROMPTED | no | "Activate each power-up ability only once" is gone |
| 4 | Valley Mightcaller | AUTOMATED | yes | |
| 5 | Acidic Slime | PROMPTED | yes | |
| 6 | Kavu Runner | AUTOMATED | yes | |
| 7 | Mana Severance | AUTOMATED | yes | tier 3 body, read line by line |
| 8 | Dusk Feaster | AUTOMATED | no | the delirium condition on the cost reduction is gone |
| 9 | Mental Modulation | AUTOMATED | no | "during your turn" on the cost reduction is gone |
| 10 | Dead of Winter | AUTOMATED | yes | |
| 11 | Scourge of the Undercity | PROMPTED | yes | |
| 12 | Illustrious Historian | AUTOMATED | no | graveyard ability with no `activeZones` |
| 13 | Promise of Bunrei | AUTOMATED | yes | tier 3 body, read line by line |
| 14 | Painful Lesson | AUTOMATED | yes | |
| 15 | Lovisa Coldeyes | AUTOMATED | yes | |
| 16 | Goldmeadow Nomad | AUTOMATED | no | "Activate only as a sorcery" is gone |
| 17 | Garrulous Sycophant | AUTOMATED | no | "if you're the monarch" is gone |
| 18 | Ride's End | AUTOMATED | no | "if it targets a tapped permanent" is gone |
| 19 | Out of the Way | AUTOMATED | no | "if it targets a green permanent" is gone |
| 20 | Vigilant Sentry | AUTOMATED | no | +1/+1 applied twice, granted ability gone |
| 21 | Domri's Ambush | AUTOMATED | yes | |
| 22 | Paladin Danse, Steel Maverick | AUTOMATED | yes | |
| 23 | Foot Elite | PROMPTED | yes | |
| 24 | Wayward Angel | AUTOMATED | no | +3/+3 applied four times, colour, trample and upkeep trigger gone |
| 25 | Steadfast Unicorn | AUTOMATED | no | "Activate only during your turn" is gone |
| 26 | Sporecrown Thallid | AUTOMATED | yes | |
| 27 | Grasping Scoundrel | AUTOMATED | yes | |
| 28 | Prehistoric Turtlesaurus | AUTOMATED | no | "if you control a creature with a +1/+1 counter" is gone |
| 29 | Flailing Ogre | AUTOMATED | no | "Any player may activate this ability" is gone |
| 30 | Temporal Machinations | AUTOMATED | yes | |

## The 16 that agree

Rend Flesh, Valley Mightcaller, Acidic Slime, Kavu Runner, Mana Severance, Dead
of Winter, Scourge of the Undercity, Promise of Bunrei, Painful Lesson, Lovisa
Coldeyes, Domri's Ambush, Paladin Danse Steel Maverick, Foot Elite, Sporecrown
Thallid, Grasping Scoundrel, Temporal Machinations.

Two of those are worth naming because they are the tier 3 machine-translated
bodies and they were read line by line rather than trusted. Mana Severance's
body searches the library with a land filter, min 0 and max unbounded, keeps only
the cards still in the library, moves them to exile and shuffles, which is what
the card says. Promise of Bunrei's body sacrifices the permanent and, only if the
sacrifice succeeded, creates four Spirit tokens, which is the card's "if you do".
The least reviewed thing the engine can run was correct on both cards in this
sample.

## The 14 that disagree

Grouped by what kind of wrong they are, because the direction matters.

### A. The engine lets more happen than the card allows. 7 cards

These are the dangerous ones. The card runs, it produces actions, the probe
scores it, and the player gets something the printed card does not give them.

**Vigilant Sentry.** "Threshold, as long as there are seven or more cards in your
graveyard, this creature gets +1/+1 and has '{T}: Target attacking or blocking
creature gets +3/+3 until end of turn.'" The static carries `pt-modify +1/+1`
TWICE and the granted activated ability is not there at all. Put to the running
engine by `port-primary-handcheck.mjs`: printed box 2/2, with 0 cards in the
graveyard the engine says 2/2, with 7 cards it says **4/4**. The card says 3/3.

**Wayward Angel.** "Threshold, as long as there are seven or more cards in your
graveyard, this creature gets +3/+3, is black, has trample, and has 'At the
beginning of your upkeep, sacrifice a creature.'" The static carries `pt-modify
+3/+3` FOUR times, and is not black, has no trample and has no upkeep trigger.
Measured on the running engine: printed box 4/4, at threshold the engine says
**16/16**. The card says 7/7. And the upkeep sacrifice, which is the card's
drawback, never happens.

**Garrulous Sycophant.** "At the beginning of your end step, if you're the
monarch, each opponent loses 1 life and you gain 1 life." The lowered trigger
carries `condition: null`. The drain fires every end step whether or not you are
the monarch.

**Hua Tuo, Honored Physician.** "{T}: Put target creature card from your
graveyard on top of your library. Activate only during your turn, before
attackers are declared." The lowered ability carries `timing: undefined`. There
is no restriction, so the ability is offered at instant speed on any turn.

**Steadfast Unicorn.** "{3}{W}: Creatures you control get +1/+1 and gain
vigilance until end of turn. Activate only during your turn." `timing:
undefined`. Same failure.

**Goldmeadow Nomad.** "{W}, Exile this card from your graveyard: Create a 1/1
green and white Kithkin creature token. Activate only as a sorcery." `timing:
undefined`.

**Unliving Legionnaire.** "Power-up, {5}{B}{B}: Return up to one target creature
card from your graveyard to your hand. Put two +1/+1 counters on this creature.
(Activate each power-up ability only once.)" The once-per-game restriction is not
in the lowered ability, so it can be activated repeatedly.

### B. A printed condition was dropped from a cost reduction. 5 cards

Dusk Feaster, Mental Modulation, Ride's End, Out of the Way, Prehistoric
Turtlesaurus. Each prints a conditional discount and each lowered to a
`cost-modify` static with no `condition` field at all. Dusk Feaster's delirium
requirement, Mental Modulation's "during your turn", Ride's End's "if it targets
a tapped permanent", Out of the Way's "if it targets a green permanent" and
Prehistoric Turtlesaurus's "+1/+1 counter" clause are all simply gone.

These do not over-claim TODAY, and the reason is a second gap rather than a
mercy. `scanStatics` walks only the battlefield, graveyard and command zones, and
`activeZones` defaults to battlefield, so a cost reduction printed on a card in
HAND is never scanned and `costAdjustmentFor` returns 0 for it. `PROBE-TRUTH.md`
section 7.7 names Out of the Way as exactly this case. So today the card gets no
discount at all, which is an under-claim, and the moment anybody makes cost
reduction reachable from hand these five become unconditional discounts. The
record is wrong either way; only the sign of the error changes.

### C. The engine does less than the card says. 2 more cards

**Illustrious Historian.** "{5}, Exile this card from your graveyard: Create a
tapped 3/2 red and white Spirit creature token." The cost correctly says
`from: 'graveyard'` and the ability carries no `activeZones`, which defaults to
battlefield, so the ability is offered in a zone the card cannot be activated
from and not offered in the one it can.

**Flailing Ogre.** "{1}: This creature gets +1/+1 until end of turn. Any player
may activate this ability." twice. Both abilities lowered correctly and "any
player may activate" is not represented, so only the controller can use them.

---

# 6. Where the disagreements come from, sized

A hand check of 30 cards says a defect exists. It does not say how many cards
carry it. `port-primary-defect-census.mjs` turns each confirmed defect into a
conservative predicate and asks it of every card in the pool. These are floors,
not estimates: each fires only on a shape the hand check actually confirmed.

| defect | port speaks | share of 1,914 | compiler speaks |
|---|---:|---:|---:|
| D1 two or more identical `pt-modify` entries on one static | 39 | 2.04% | 0 |
| D2 the card says "Activate only" and no `timing` survived | 171 | 8.93% | 323 |
| D3 a cost paid from the graveyard with no active zone declared | 40 | 2.09% | 41 |
| D4 a printed intervening-if that no condition survived | 19 | 0.99% | 920 |
| D5 a conditional cost reduction that became unconditional | 63 | 3.29% | 0 |

Worst D1 multiplier on a card the port speaks for: **Tek, five times**.

Read the last column. D2, D3 and D4 are not port defects: the compiler carries
them on 323, 41 and 920 cards, more than the port does in every case. Those are
engine gaps that both sources fall into, and blaming the port for them would be
wrong. D1 and D5 are the port's own, at zero on the compiler side.

The census predicates cannot see the other things the hand check caught: Vigilant
Sentry's lost granted ability, Wayward Angel's lost colour and trample and upkeep
trigger, Unliving Legionnaire's once-per-game restriction, Flailing Ogre's "any
player may activate". So the 46.7% hand rate is not the sum of these five rows,
and the five rows are not a substitute for reading cards.

## The bug behind D1, named

`scripts/xmage/build-records.mjs:836`:

```js
const reuse = (raw) => fromVia.get(`xmage:${raw.cls}`) ?? fromVia.get(`local:${raw.cls}`) ?? norm.invocation(raw);

const ability = {
  ...
  effects: (a.effects ?? []).map(reuse),
```

`fromVia` is keyed by CLASS NAME. When one ability constructs two or more effects
of the same class, every one of them resolves to the FIRST one's normalised
object, and the second and later constructions are replaced by a copy of the
first, arguments and all. The same pattern is at line 676 for nested children.

Wayward Angel is the card that showed it. Its threshold static builds four
`ConditionalContinuousEffect`s wrapping, in printed order, a `BoostSourceEffect`,
a `BecomesColorSourceEffect` and two ability grants. The record holds four copies
of the boost. Confirmed by dumping `buildRecord`'s own output for that card: four
entries, all `xmage:ConditionalContinuousEffect`, all carrying the identical
`BoostSourceEffect(3, 3)` argument.

**This is worse than a wrong number.** `BecomesColorSourceEffect` is in
`REFUSED_MODIFICATIONS` and would have BLOCKED the card. Because the record never
showed it to the lowering, the card looked completely lowered, passed the
all-or-nothing bar, was emitted into `lowered.generated.ts`, was swapped in, ran,
and produced +12/+12. The port's refusal discipline has a hole at exactly the
point where it matters most: a card that should have refused instead ran and was
wrong.

`port-primary-sibling-collapse.mjs` counts the reach over every record:

```
32,168  XMage records read
   639  cards with an ability whose raw effect list repeats a class
   655  such abilities
   774  effect constructions replaced by an earlier sibling's
   627  cards where the repeated siblings were NOT identical, so something was lost
```

What the emitter did with those 639 cards:

```
   428  blocked
   200  EMITTED into the shipped table
    11  no oracle id
```

Top classes repeated in one effect list: `ConditionalContinuousEffect` 223,
`GainAbilityTargetEffect` 128, `GainAbilityAttachedEffect` 122,
`GainAbilityControlledEffect` 93, `ConditionalOneShotEffect` 30,
`GainAbilitySourceEffect` 24, `BoostTargetEffect` 23.

**200 cards in the shipped table were built from a record that lost at least one
effect construction**, and 627 of the 639 lost something real rather than a
duplicate. This is one fix in one file and it is the highest value thing on this
whole page.

---

# 7. What should happen next, and in what order

Stated as a sequence because the project law makes accuracy a gate on coverage,
and the measured disagreement rate is 46.7%.

1. **Fix the sibling collapse in `build-records.mjs`.** One keyed lookup in one
   file. It reaches 639 records, 200 of them already shipping. It will move the
   emitted count DOWN, because cards that only lowered by accident will start
   refusing again, and that is the direction the project law asks for.
2. **Re-run the hand check on a fresh 30 and report the new rate.** Not the same
   30: those are now known cards and a rate measured on them would be a rate
   measured on the fix.
3. **Decide the two engine gaps that both sources fall into.** D2, `timing`
   dropped on "Activate only" cards, is 494 cards across both sources. D4, the
   intervening-if, is 939. Neither is a port question, and both are larger than
   anything the gate can buy.
4. **Only then reconsider the gate**, and when it is reconsidered, the choice is
   not open or shut. Row 7 is 1,359 refused cards worth at most 473 by the
   probe's bar. The other 3,558 cards the gate refuses already work. A rule that
   consults the port only where the compiler's answer is REFUSED, rather than
   wherever it is incomplete, takes the 1,359 and risks none of the 3,558, and it
   is one condition rather than a per case judgement.
5. **Give the post-swap `coverage` its own word.** `abilityEngineOwns` reads
   `full` meaning "the compiler read the whole card" and gets handed `full`
   meaning "the record replaced the whole card" on 587 cards with triggers. Both
   are true statements and they are not the same statement.

## What must not happen

The port passes 54.75% where the compiler passes 14.99%, and that ratio is the
argument for widening it. This document is the reason to widen it carefully. Of
the cards it already passes, 46.7% do something other than what the printed card
says, and every one of those is invisible in the coverage number, in the probe
output and in the game log. A card that refuses is a line in a report. A card
that runs and is wrong is a game somebody loses for a reason nobody can find.
