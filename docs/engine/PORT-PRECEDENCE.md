# PORT-PRECEDENCE

What happened when the precedence rule was made to read a value the swap cannot
rewrite, what the measurement said about opening the gate wider, and what four
rounds of hand checking against Scryfall did to the accuracy figure and to the
coverage figure underneath it.

Measured 24 August 2026. **The headline is that the number went DOWN, on purpose,
and that is the result the project law asks for.** The port passed 5,629 cards
at the start of this session with a hand-checked error rate of 46.7%. It passes
5,402 now with a hand-checked error rate of 0 in 30. 227 cards stopped passing
and every one of them stopped because it was wrong.

## Attribution and licence

Behaviour described here is derived from **XMage**, which is MIT licensed,
`Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
The clone is read in place, outside this repository, and nothing from it is
vendored here. XMage's display strings are never copied: those carry Wizards of
the Coast rules text, which is not XMage's to license, so every line of card
wording quoted below comes from Scryfall. Forge is GPL-3.0 and was not fetched,
read or referenced.

## Every number here, and the command that produced it

Nothing below was typed from memory or carried across from an earlier document.

```
DM_CARD_DUMP=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
DM_CARD_DUMP=1 DM_XMAGE_OFF=1   node --experimental-strip-types scripts/verify-ability-coverage.mjs
DM_CARD_DUMP=1 DM_XMAGE_FORCE=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
node --experimental-strip-types scripts/xmage/emit-lowered.mjs
node --experimental-strip-types scripts/xmage/port-open-gate-census.mjs
DM_XMAGE_OFF=1 node --experimental-strip-types scripts/xmage/port-disagreement-census.mjs
node --experimental-strip-types scripts/xmage/port-open-accuracy-sample.mjs
node --experimental-strip-types scripts/xmage/port-open-record-dump.mjs "Wayward Angel"
node --experimental-strip-types scripts/xmage/port-open-alias-census.mjs
node --experimental-strip-types scripts/playtest/run.ts --seed 9000 --games 20 \
  --players 4 --kind commander --max-turns 200 --verify --quiet
npm test
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
```

The first run reproduced the brief's headline exactly before anything was
changed, which is the check that this session measured the same thing the brief
measured:

| who spoke for the card | cards | AUTOMATED | PROMPTED | passing | share |
|---|---:|---:|---:|---:|---:|
| compiler | 30,555 | 3,808 | 773 | 4,581 | 14.99% |
| xmage port | 1,914 | 812 | 236 | 1,048 | 54.75% |
| **pool** | **32,469** | **4,620** | **1,009** | **5,629** | **17.34%** |

---

# 1. The precedence test now reads a value the swap cannot change

## What was actually wrong

`docs/engine/PORT-PRIMARY.md` section 2 refuted the named bug as a claim about
the gate and confirmed it one layer down, and both halves of that stand. The
gate did read the pre-swap value, proved over 32,469 cards with zero
disagreements. The recompute at `compiler.ts` did turn every swapped card into
`coverage: 'full'`, and `abilityEngineOwns` in `trigger-bridge.ts` read that word
meaning one thing and was handed it meaning another.

What made that fragile is not which value the gate happened to get. It is that
the rule and the swap were reading and writing ONE FIELD, and the only thing
keeping the rule right was the order two statements are written in. A rule that
depends on nobody ever asking it twice is not a rule. `swap-census.mjs` already
had to write a `continue` to step around exactly that.

## The change

`CardAbilities` now carries two coverage values and each says one thing:

- `coverage` describes whatever record is in front of you. On a compiler record
  it means the compiler read every printed paragraph. On a swapped record it
  means the ported record replaced the whole card and the unparsed list was
  emptied to say so. The swap still rewrites it, on purpose.
- `compilerCoverage` is what `deriveCoverage` made of the ORACLE-TEXT COMPILER's
  own abilities and its own unparsed list. It is set once, before any second
  source is consulted, and carried through the swap unchanged. Nothing rewrites
  it.

`xmageSwapFor` reads `compilerCoverage`. `abilityEngineOwns` reads `coverage`,
and now says in a comment which of the two meanings it wants and why: on a
swapped card those two values disagree by design, and 587 cards with triggers sit
on that difference. Before this a reader of that line could not tell which
meaning one word was handing them. Now they can.

Put a swapped record back through `xmageSwapFor` and it reaches the same
decision it reached the first time. The trap is closed.

## The rule, as it now reads at the decision

> The port is consulted only for a card the oracle-text compiler did not fully
> read, and "did not fully read" is `compilerCoverage`: the value `deriveCoverage`
> computed from the compiler's own abilities and its own unparsed list, set once
> before this function was called and carried through the swap unchanged. It is
> deliberately not `coverage`, which the swap rewrites to 'full' on every card it
> speaks for, so a rule reading `coverage` answers one way on a fresh record and
> the opposite way on a finished one. Reading a value the decision cannot change
> is what makes this a rule rather than an artefact of the order two statements
> happen to be written in. What the sentence does not claim is that the
> compiler's answer WORKS: full coverage says every printed paragraph was read,
> and on 1,359 cards that hold a record it was read and the card still does
> nothing on a board, because the engine has no consumer for what the compiler
> produced.

---

# 2. Opening the gate wider was measured, and it loses

The brief asked for the port to speak wherever it has a record the compiler
cannot beat. Where that is, and what it is worth, was measured rather than
argued.

## Why no rule inside the compiler can name the addressable cards

The gate refuses 4,916 in-pool cards on `compiler understands this card
completely`. The shipped verdict PASSES 3,557 of them and REFUSES 1,359. So the
sentence is doing two different jobs at once: on the 3,557 it is protecting cards
that work, and on the 1,359 it is refusing a second opinion on cards that do
nothing.

`port-open-gate-census.mjs` scores four structural tests that the compiler could
actually make about its own output, with no engine import, over that exact
population:

| buys | costs | test |
|---:|---:|---|
| 91 | 0 | every ability is a keyword the engine treats as advisory |
| 193 | 0 | any ability is a keyword the engine treats as advisory |
| 0 | 0 | a paragraph the compiler consumed produced no ability |
| 0 | 0 | an effect-bearing ability has no effects |

The last two fire on nothing, and that is a real finding rather than a null
result: `coverage === 'full'` already implies every paragraph was consumed and
produced an ability, so the two tests that would have caught a hollow reading
have nothing left to catch. The first two fire only on cards whose failure is an
ENGINE gap, not a source gap: the port lowers landwalk to the same advisory
keyword the compiler does, so handing those 193 cards over buys nothing.

## The experiment, run end to end

`DM_XMAGE_FORCE=1` in `scripts/verify-ability-coverage.mjs` puts the port in
front of the compiler on EVERY card that has a record and a playable front face,
coverage ignored, and takes the whole pool through the unchanged verdict
pipeline. It is a measurement and it lives in the measuring script: `lowered.ts`
says there is no switch that makes the engine claim more, and it still says it.

```
4,916  cards the forced run swapped that the shipped rule does not
   20  the port makes the card PASS where the compiler refused it
  224  the port makes the card FAIL where the compiler passed it
4,672  no change either way
 -204  NET
```

Opening the gate on the whole population costs 204 cards. Restricting it to the
1,359 the compiler refuses buys 20 and costs nothing, which is 0.06 points, and
no rule available at the decision point can name those 20 without becoming a
list of cards.

## What the 224 losses are, because it points at the next phase

```
207  SILENT :: mana: mana.ts counts untapped sources instead
 16  SILENT :: probe: deferred
  1  SILENT :: probe: silent
```

207 of 224 lose for one reason. The port lowers "{T}: Add {G}" to a MANA ability,
which is what it is, and `mana.ts` counts untapped sources instead of reading
compiled mana abilities. The compiler's shape happens to land on a live consumer
and the port's does not. Moss Diamond, Selesnya Signet, Ancient Den, Wastes,
Phyrexian Tower are all in that 207.

So the widening is not blocked by this rule being timid. It is blocked by an
engine-consumer gap that costs the port eleven cards for every one it gains, and
that gap is the thing worth moving next.

## What the gate now refuses, reconciled exactly

```
6,966  rows in the shipped table
 -311  key an oracle id outside the paper pool
 ----
6,655  in the pool
1,654  SWAPPED
4,916  refused: the compiler read this whole card
   85  refused: text on a face the engine does not play
```

`1,654 + 4,916 + 85 = 6,655`. Counted twice, once by the funnel and once by an
independent join, and the two agree.

---

# 3. The disagreement census, which is the accuracy instrument

`CLAUDE.md` says the printed card wins and the disagreement gets recorded.
Nothing recorded it. The precedence rule picks one source per card and throws the
loser's answer away inside `compileWithTrace`, so a card where the two sources
describe different behaviour looked exactly like a card where they agree.

`scripts/xmage/port-disagreement-census.mjs` compares, for every card in the pool
where BOTH sources produce at least one ability, the compiler's own reading
(taken with `DM_XMAGE_OFF=1`, so it is never the port's answer wearing the
compiler's name) against the ported record. Not as text: `Ability.text` on a
ported record is the whole front face by construction, so a text diff would
report every multi-ability card and mean nothing. Seven structural facts, each
chosen because a disagreement in it changes what a player sees.

## The figure

| | cards | share |
|---|---:|---:|
| the compiler and the port both speak for the card | 6,065 | |
| identical on all seven facts | 3,883 | 64.02% |
| they differ, gross | 2,182 | 35.98% |
| of which the only difference is a `{do:'manual'}` the compiler emitted | 49 | |
| **substantive disagreements** | **2,133** | **35.17%** |

The carve-out matters and it is named rather than folded in. `{do:'manual'}` is
the compiler's word for "a human has to do this". A card whose only extra verb on
the compiler side is `manual` is not a card where the two sources describe
different behaviour, it is a card where one of them declined to describe the
behaviour at all.

## By difference kind, and what moved

Measured twice: once with the sibling collapse fixed and nothing else, and again
after the four rounds of restriction work in section 4.

| kind | after the sibling fix | now | direction now |
|---|---:|---:|---|
| D-VERB effect verbs | 1,851 | 1,711 | 833 both ways, 448 port more, 430 port less |
| D-KIND ability kinds | 1,236 | 1,161 | |
| D-COND a condition or intervening if | 133 | **199** | 199 port claims more |
| D-BOOST power and toughness deltas | 81 | 80 | |
| D-KEYWORD keywords, printed and granted | 56 | 55 | 50 port more, 5 port less |
| D-TRIGGER trigger events | 60 | 53 | 53 port claims more |
| D-TIMING an activation timing restriction | 84 | **34** | 32 port more, 2 port less |

Two rows are the point.

**D-TIMING fell by 60% and turned round.** It used to read "70 cards where the
port claims LESS". It reads 32 port more and 2 port less. The port was dropping
"Activate only as a sorcery" and now carries it, on cards where the compiler
still does not.

**D-COND rose, and that is the port getting better rather than worse.** All 199
are the port carrying a condition the compiler has not read. `PORT-PRIMARY.md`
section 6 measured the compiler carrying a dropped intervening if on 920 cards
against the port's 19. The port now states conditions on 199 cards where the
compiler states none, which is 199 cards where the census is pointing at the
COMPILER as the source with the gap.

Every disagreeing card, its difference kinds and the exact tokens on both sides
are in `scratch/port-disagreement-census.json`. A hand check can start from that
file instead of from a list of names, which is what makes it an instrument rather
than a number.

---

# 4. Accuracy: 46.7%, then 26.7%, then 16.7%, then 16.7%, then 0 of 30

The project law makes accuracy a gate on coverage and puts the bar at 5%. The
rate at the start of this session was 46.7%, nine times the bar, so no coverage
was bought until it came down. It took four rounds and 120 distinct hand-checked
cards.

## How the samples were drawn

`scripts/xmage/port-open-accuracy-sample.mjs` sorts the cards the port passes by
oracle id and takes a fixed stride. That is an arbitrary order nobody controls at
an interval fixed by the count, and it returns the same cards on every run. There
is no seed to nudge and no filter on what makes an interesting card.

The one filter is that every card of every earlier round is excluded by oracle
id. A round of fixes derived from a sample cannot be graded on that sample, and
that stays true of round 2 against round 1 as much as of round 1 against round 0.
The exclusion can only make a sample harder to flatter, never easier. 120 cards
were read against Scryfall's oracle text across the four rounds and no card was
read twice.

## The rate, round by round

| round | sample | disagree | rate | what the round then fixed |
|---:|---:|---:|---:|---|
| 0 (prior session) | 30 | 14 | 46.7% | the sibling collapse in `build-records.mjs` |
| 1 | 30 | 8 | 26.7% | restrictions the record carries and the lowering dropped |
| 2 | 30 | 5 | 16.7% | conditional cost reductions, a wrong quantity, three target and cost shapes |
| 3 | 30 | 5 | 16.7% | activation limits, power-up, whose graveyard |
| **4** | **30** | **0** | **0.0%** | |

**Round 4 is 0 of 30 and it is under the bar.** Two of the thirty deserve to be
named so the grade can be audited rather than taken. Dark Hatchling and
Shatterstorm both print "can't be regenerated" and the record drops it.
`PORT-LOG.md` section 6 already records that decision, a test pins it, and it is
inert because `xmage:RegenerateSourceEffect` is refused by name, so no permanent
this port builds has a regeneration shield for the clause to matter against.
Graded as agreeing, consistently with Visara the Dreadful in round 1. A reader
who counted them anyway gets 2 of 30, which is 6.7%, and that is the strictest
number this sample supports.

## What each round found, because the pattern is one thing

**Round 0's finding, fixed first.** `build-records.mjs` keyed effect reuse by
CLASS NAME, so sibling effects of one class collapsed onto the first one's
arguments. The index is now a queue per primitive and each occurrence is spent
once. Wayward Angel's threshold static held four copies of `+3/+3`; it now holds
the boost, the colour change, and two ability grants, in printed order. The
colour change is in `REFUSED_MODIFICATIONS`, so the card that used to run and
give +12/+12 now refuses, which is what it should always have done. Vigilant
Sentry refuses for the same reason. Measured over every record:

```
32,168  records built
60,968  abilities
     0  abilities whose effect, cost or target list repeats one OBJECT
     0  repeated entries in total
```

**Rounds 1 to 3 are all one family.** THE RECORD CARRIES A RESTRICTION AND THE
LOWERING DROPPED IT. Seven of round 1's eight, five of round 3's five. Every one
produced a card that RAN and did MORE than the printed card allows, which
`PORT-LOG.md` section 7 already names as the worst outcome available:

| card | printed | what it did |
|---|---|---|
| Stern Marshal | "Activate only during your turn, before attackers are declared" | offered at instant speed on any turn |
| Fungus Elemental | "Activate only if this creature entered this turn" | activate whenever you like |
| Nighthowl Pursuer | ferocious | the pump fired on every attack |
| Owlbear Shepherd | "if creatures you control have total power 8 or greater" | drew a card every end step |
| Dramatic Finale | "This ability triggers only once each turn" | once per creature that died |
| Nearheath Chaplain | "Activate only as a sorcery", from the graveyard | instant speed, from the battlefield |
| Skoa, Embermage | grandeur, discard another card named Skoa | two Mountains and no discard |
| Vampire Bats | "Activate no more than twice each turn" | unlimited |
| Bold Biochemist | "Activate each power-up ability only once" | as often as you like |
| Graveyard Marshal | "Exile a creature card from YOUR graveyard" | any graveyard on the table |
| Fate of the Sun-Cryst | "costs {2} less if it targets a tapped creature" | an unconditional discount |
| Goblin Gaveleer | "+2/+0 for each Equipment attached to IT" | +1/+0 for each Equipment anywhere |
| Excavation | "Any player may activate this ability" | controller only |
| Shared Summons | "up to two creature cards WITH DIFFERENT NAMES" | any two |

Read the class names on the first four. `ActivateIfConditionActivatedAbility`
exists FOR the condition, and the lowering read its effect and its cost and
ignored the third argument. `LimitedTimesPerTurnActivatedAbility` exists FOR the
limit. The record was never short of the fact. Nothing asked for it.

## What was written, and which way each one goes

Honoured, where the record states the fact and `dsl.ts` has a field for it. These
make cards MORE correct without losing them:

- a constructor argument whose Java parameter type is `Condition`, and the
  `withTriggerCondition` modifier, both now lowered through `conditions.ts` and
  landing on `ability.condition`, the field `dslConditionHolds` and `activate.ts`
  already gate on
- `ActivateAsSorceryActivatedAbility` to `timing: 'sorcery'`
- the ability's zone argument to `activeZones`, which `lowerStatic` had read
  since it was written and `lowerResolving` never had
- `LimitedTimesPerTurnActivatedAbility`, its mana twin,
  `ActivateOncePerGameActivatedAbility`, the `maxActivationsPerTurn` argument and
  four modifiers, all to `limit`
- the "whose zone" that lives in a target CLASS name rather than in its filter,
  so `TargetCardInYourGraveyard` stops meaning any graveyard
- the condition on `SpellCostReductionSourceEffect` and
  `SpellsCostReductionControllerEffect`

Refused, where the record states the fact and nothing can carry it. Each costs
real cards and each is a decision rather than an omission, named in the file that
makes it:

| refused | cards | why |
|---|---:|---|
| a condition with no entry in `conditions.ts` | | the condition table names which class, so the refusal is countable work |
| `setMayActivate` | 42 | no ability shape names who may activate one |
| `xmage:PowerUpAbility` | 37 | once per game per ABILITY, plus a conditional discount on an activation cost |
| `xmage:GrandeurAbility` | 7 | the class builds a discard cost out of a card name the extraction records as omitted text |
| `xmage:CastFromGraveyardOnceDuringEachOfYourTurnAbility` | 10 | an alternative casting permission, already named as a record-shape boundary |
| `xmage:EquipmentAttachedCount` | 10 | it had an entry and the entry was wrong twice, in the set it counted and in the multiplier it dropped |
| `xmage:TargetPlayerOrPlaneswalker` | 124 | `{do:'damage'}` takes a permanent selector or a player selector and has no member for a target that is either |
| `xmage:TargetOpponentOrPlaneswalker` | 36 | same shape, same refusal |
| a search target class that is not plain | | `TargetCardWithDifferentNameInLibrary` carries a restriction its filter does not mention |
| a usage limit on a spell or mana ability | | neither shape has a `limit` field |

`EquipmentAttachedCount` is worth reading twice. It had a table entry, so it
looked like finished work, and the entry was wrong in two directions at once. It
counted every Equipment on the battlefield instead of the ones attached to the
source, and it dropped the class's own `multiplier` argument. A Gaveleer wearing
one Equipment while an opponent wore three read +4/+0 where the card says +2/+0.
`values.ts` already says a quantity wrong by one is worse than a card that
refuses; this was wrong by a factor and a filter.

---

# 5. What it cost, stated as the trade it is

## The shipped table

```
7,237  at the start of this session
7,203  after the sibling collapse fix
7,108  after the first round of restriction work
6,979  after the second
6,966  after the third
```

271 cards left the table. Every one of them left because the record could not
state something the printed card says.

## The verdict

| | at the start | now | change |
|---|---:|---:|---:|
| AUTOMATED | 4,620 | 4,460 | -160 |
| PROMPTED | 1,009 | 942 | -67 |
| **the sum** | **5,629** | **5,402** | **-227** |
| share of the 32,469 pool | 17.34% | 16.64% | |
| cards the port speaks for | 1,914 | 1,654 | -260 |
| of those, passing | 1,048 | 821 | -227 |
| the port's own pass rate | 54.75% | 49.64% | |
| cards the compiler speaks for | 30,555 | 30,815 | +260 |
| of those, passing | 4,581 | 4,581 | 0 |

The compiler's own contribution is unchanged to the card, which is the check that
nothing this session touched changed how the compiler reads a printed card. Every
card that moved moved because the port stopped speaking for it.

`DM_XMAGE_OFF=1` puts the pool at 3,808 AUTOMATED and 773 PROMPTED. So the port
is still worth **+821 passing cards** over the compiler alone, and it takes none
away: on the 1,654 cards the gate swaps, the number the compiler would have
passed on its own is 0.

## The trade, said plainly

227 cards stopped passing. All 227 were doing something other than what the
printed card says, and 14 of them are named in the table in section 4 with the
printed line beside the behaviour. A card that refuses is a line in a report. A
card that runs and is wrong is a game somebody loses for a reason nobody can
find. The project law puts accuracy above the number and this is what that costs
when it is actually applied.

---

# 6. Twenty games

```
node --experimental-strip-types scripts/playtest/run.ts --seed 9000 --games 20 \
  --players 4 --kind commander --max-turns 200 --verify --quiet
```

```
20 games, 20 finished, 0 stalled
26,069 actions
0 resolved silently across all twenty games
--verify replayed every game and checked every state hash: no mismatch
```

No game hit the 200 turn ceiling. The longest ran 67 turns. Refusals across the
whole run total 20 actions and "changed nothing" totals 58, both spread over
26,069, and both are the harness reporting out loud rather than an invariant
breaking.

`PORT-LOG.md` section 3 records this run at 27,036 actions on the day the port
first became reachable in a game. It is 26,069 now. The difference is the port
declining to act on cards it could not state correctly, which is the same 227
cards seen from the board instead of from the report.

---

# 7. What should happen next, in order

1. **`mana.ts` should read compiled mana abilities.** It is the single largest
   thing standing between the port and the gate. 207 cards in one measured run
   fail for that one reason, and every one of them is a card the port models
   correctly and the engine cannot hear.
2. **Then reconsider the gate, with the same experiment.** `DM_XMAGE_FORCE=1`
   prices it in one run. Today it prices at minus 204. Close the mana gap and
   run it again before touching the rule.
3. **Point the disagreement census at the COMPILER.** 199 cards where the port
   states a condition and the compiler states none, and `PORT-PRIMARY.md`
   section 6 already measured the compiler carrying a dropped intervening if on
   920 cards and a dropped "Activate only" timing on 323. Those are larger than
   anything the gate can buy and they are on the side of the pipeline that reads
   the card a player is holding.
4. **Keep the sample rounds going.** The rate is 0 of 30 on 30 cards nobody had
   read before, which is a real result and a small one. `ALREADY` in
   `port-open-accuracy-sample.mjs` grows by one line per round, so round 5 costs
   nothing to set up and reads 30 more cards nobody has seen.

## What must not happen

The port's pass rate fell from 54.75% to 49.64% in this session and that reads
like the port getting worse. It is the opposite. The old rate counted cards that
passed and lied. The rate that matters is 0 of 30 against the printed card, and
it was 14 of 30 four rounds ago. Do not read the coverage figure without the
accuracy figure beside it, and do not buy the coverage back by loosening a
refusal that a named card earned.
