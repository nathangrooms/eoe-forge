# The XMage vocabulary: the worklist, the decision, and the order to build in

Rewritten 22 August 2026 as a plan. **Tranche 0 was then built the same day.**
Section 9 records what it moved, measured the same way twice. Sections 1 to 8
are the plan as written before the work, kept unedited so the projection can be
compared against the outcome, which is the only way to find out whether the
projections are worth anything. Read section 9 first if you want today's
numbers.

This version supersedes the 21 August draft. It keeps that draft's worklist and
tranche machinery, which reproduced exactly. It changes the recommendation,
because two measurements that had not been made turn out to point the other way.
Section 6 says what changed and why.

---

## 0. Where every number comes from

Coverage on this project has been misreported twice. A "95.7%" figure was a
12,000 row slice of a 34,088 row catalogue, and the real automated figure was
2.66%. So every number below names the script that produced it, the denominator,
and the fact that it was run rather than quoted.

| Script | What it measures | Denominator | Status |
|---|---|---|---|
| `scripts/xmage-ground-truth.mjs` | card name to XMage class set, plus the class ranking | 32,156 XMage cards | run 21 Aug, output read today |
| `scripts/xmage-class-worklist.mjs` | graded worklist, greedy build order, tranches, name join | 32,156 XMage cards against the 32,469 pool | re-run today, reproduced exactly |
| `scripts/verify-ability-coverage.mjs` | AUTOMATED / PROMPTED / SILENT from our own compiler and engine | 32,469 card pool | re-run today |
| `scripts/xmage-decision-evidence.mjs` | class-set collisions, parse state, the ceiling on route (b) | 32,156 map and the 32,469 pool | written today, run today |

To reproduce all of it:

```
node scripts/xmage-ground-truth.mjs
node scripts/xmage-class-worklist.mjs
node --experimental-strip-types scripts/verify-ability-coverage.mjs
node --experimental-strip-types scripts/xmage-decision-evidence.mjs
```

Outputs land in `scratch/`: `xmage-ground-truth.json`,
`xmage-class-worklist.{json,txt}`, `verify-ability-coverage.json`,
`xmage-decision-evidence.{json,txt}`.

**What is measured and what is judged.** The HAVE / PARTIAL / MISSING grade for
each of the top 300 classes is a judgement made by reading our engine. It lives
in the `VERDICTS` table at the top of `scripts/xmage-class-worklist.mjs`. Every
count printed beside a grade is computed by the script. Change one grade, re-run,
and all the numbers move with it. The effort estimates, 0 to 3, are also
judgement and are labelled as such everywhere they appear.

**Two numbers that must never be conflated**, restated because this document
contains both:

- **COMPOSABLE** is a ceiling. It counts cards where every XMage class the card
  names has a counterpart we have. It does not mean the card runs.
- **AUTOMATED** is the floor. It counts cards our engine actually runs, measured
  by `verify-ability-coverage.mjs`.

Everything in sections 4 and 7 is COMPOSABLE unless it says AUTOMATED.

---

## 1. Where we stand, re-measured today

`scripts/verify-ability-coverage.mjs`, over a pool of 32,469 cards built from
the cached Scryfall bulk file:

```
AUTOMATED     1,422   4.38%
PROMPTED          0   0.00%
SILENT       30,674  94.47%
NO-TEXT         332   1.02%
PROMPTABLE       41   0.13%   (memo, never counted inside PROMPTED)
```

The brief for this session carried 1,420. Today's run gives 1,422. The
difference is two cards and it is not worth explaining away, but the figure in
this document is the one I ran.

Of those 1,422, **557 are carried by keyword lines alone**, meaning they work
because `keywords.ts` reads Scryfall's `card.keywords` array, not because the
ability layer did anything. The ability layer's own contribution is **865 cards,
2.66% of the pool**. That is the honest headline.

Why the other 30,674 are silent, from the same run:

```
17,315  unparsed text
 6,995  {do:manual} marker
 6,359  understood, nothing runs it
```

That last line is the one this document is about.

---

## 2. The unit change, and why it is worth making

`scripts/xmage-ground-truth.mjs` established that XMage's 32,156 mapped cards
are compositions of **1,932 distinct engine classes**. A card counts as covered
when every class it names is implemented:

| classes implemented | share of the 32,156 covered |
|---|---|
| top 250 | 47.17% |
| top 500 | 67.40% |
| top 1,000 | 88.63% |
| top 1,500 | 97.41% |
| all 1,932 | 100% |

90% of the pool needs 1,054 classes. The text-pattern census over the same pool
needed about 25,648 patterns for the same 90%. That is roughly a 24 times
reduction in work for the same result, and it is the reason to think in classes.

By bucket: 771 effects, 246 keywords, 224 triggers, 202 conditions, 114 dynamic
values, 104 other abilities, 96 costs, 77 targets, 38 mana. The shared effect
vocabulary is about 800 classes, not thousands.

**115 of the 1,932 are not work at all.** 46 are client display hints, 38 are
Java abstract classes and 31 are Java interfaces. A card naming `Effect` needs no
engine primitive called `Effect`. That is 5.95% of the ranking, and the published
curve above counts them, so the curve slightly overstates the requirement.

---

## 3. The worklist: the top 300 classes, graded

Produced by `scripts/xmage-class-worklist.mjs`. The full graded list is the
`VERDICTS` table in that script. The grades:

| verdict | classes | cards naming at least one such class |
|---|---|---|
| STRUCTURAL | 30 | 18,580 |
| HAVE | 125 | 29,425 |
| PARTIAL | 52 | 14,272 |
| MISSING | 93 | 10,484 |

Grade meanings:

- **HAVE** our DSL spells it and a live consumer runs it.
- **PARTIAL** our DSL spells it and the runtime does not act on it, or acts on a
  narrower case than the class covers.
- **MISSING** no counterpart.
- **STRUCTURAL** Java scaffolding or client text. No work.

PARTIAL counts as not covered everywhere in this document, because a card whose
effect prints a note instead of changing the board is a card that did not run.

**Standing, as a composition:**

```
covered classes                         245 of 1,932
  free by kind                          115
  HAVE from the verdict table           130
cards whose every class is covered      5,754 of 32,156   (17.89%)
  of those, pure composition            3,718             (11.56%)
cards blocked by exactly one class      10,592            (32.94%)
cards blocked by exactly two classes    8,499             (26.43%)
```

### I audited the verdict table rather than inheriting it

The table was written by a previous session. Spot checks against source today:

**Confirmed.** `ENGINE_KEYWORDS` in `src/lib/game/keywords.ts` holds exactly 15
names, so every keyword verdict resting on that list is right, and `flash` is in
`ADVISORY_KEYWORDS`, so `FlashAbility` is correctly MISSING.
`abilityUsesThisTurn` is defined at `activate.ts:165` and called at 176 and 888,
so `LimitedTimesPerTurnActivatedAbility` is correctly HAVE. `costAdjustmentFor`
is defined at `statics.ts:601` and has no caller outside its own tests, so every
cost-reduction PARTIAL stands. `scry` does not appear in `dsl.ts` at all, so
`ScryEffect` is correctly PARTIAL.

**One note is stale.** `CounterUnlessPaysEffect` is annotated "to-actions.ts has
no case for `{do:'unless-pays'}` and throws". There is a case, at
`to-actions.ts:591`, and it defers with a note rather than throwing. The MISSING
grade is still right, because the card does not run, but the stated reason is
wrong and should be corrected in the table.

**One family of notes is imprecise, in a way that makes the work cheaper than
graded.** Several triggers are annotated "the engine derives no event for
`enters` / `dies` / `cast`". `triggers.ts` does derive all three, and it derives
them for every permanent, not only the source: `enters` at lines 257 and 270,
`dies` at 281, `cast` at 309 and 323. The restriction is one layer up, in
`trigger-bridge.ts`, whose `gameEventKindFor` is deliberately "restricted to
self-referential subjects" because `sourcesFor` can only deliver the source for a
self-event. So the work for `DiesCreatureTriggeredAbility`,
`EntersBattlefieldControlledTriggeredAbility`,
`EntersBattlefieldAllTriggeredAbility` and
`SpellCastControllerTriggeredAbility` is widening one bridge function, not
building event derivation. Those four are graded effort 2 and are closer to
effort 1 each. Together they are 613 cards in the greedy order.

---

## 4. The finding that reorders everything: a whole subsystem is unwired

`src/lib/game/abilities/primitives/` contains 8 implementation modules and a
registry with a compile-time exhaustiveness guard, plus a test file for each.

**Nothing outside that folder and its own tests imports any of it.** Checked by
grep across `src/` for `abilities/primitives`, for `primitives/registry`, and for
each module by name. Zero non-test consumers.

The folder implements exactly the verbs `to-actions.ts` names and never resolves:
`pump`, `gain-control`, `damage`, `add-mana`, `return-from`, `search-library`,
`counter`, `scry`, `surveil`, `regenerate`. Read `to-actions.ts:412` for `pump`
and `to-actions.ts:428` for `gain-control`: both push a sentence onto
`scope.deferred` and change nothing.

This is the project law in CLAUDE.md happening one level up from where it was
first written. "Green tests do not mean a player can reach it" was about actions
no code path constructs. This is a tested subsystem no code path imports.

**What wiring it is worth, measured order independently.** Take the covered class
set, move the 33 top-300 classes these verbs back from PARTIAL to HAVE, and
recount:

```
cards fully covered before   5,754   17.89%
cards fully covered after    9,545   29.68%
NET GAIN                     3,791
  of that, pure composition  3,168
```

That is the largest single move available and most of it is wiring code that is
already written and already tested.

On the AUTOMATED side rather than the composable side, the same run of
`verify-ability-coverage.mjs` reports these dead ability hits, which are ability
hits and not cards, since one card can carry several:

```
1,999  effect "pump" is named by to-actions.ts and never resolved
1,617  effect "add-mana" is named by to-actions.ts and never resolved
  343  effect "return-from" ...
  258  effect "search-library" ...
```

and 104 of the 135 cards that run refuses to grade AUTOMATED are refused for
exactly one of these verbs. `Brazen Wolves`, "whenever this creature attacks, it
gets +2/+0 until end of turn", is one of them.

---

## 5. The decision

The choice put to this session:

- **(a)** use the class ranking only to prioritise our existing text compiler,
  and keep parsing oracle text.
- **(b)** use the card-to-class map as a direct source of truth: for a card, look
  up which XMage classes it composes and instantiate our equivalents, with no
  text parsing in that path at all.

### The evidence for (b), and it is real

**The join works.** From `xmage-class-worklist.mjs`, against the same 32,469
pool:

```
joined on the printed name exactly       29,937   92.20%
joined on the front face of "A // B"        705    2.17%
JOINED either way                        30,642   94.37%
NO ENTRY IN XMAGE AT ALL                  1,827    5.63%
```

The 5.63% is smaller than it looks. 1,276 of the 1,827 are `funny` set type,
meaning Unglued through Unfinity, and a further block is Mystery Booster playtest
cards. Scored against cards a player can put in a real deck:

```
Commander-legal cards in the pool         30,784
  of those, no entry in XMage                467    1.52%
```

98.48% of Commander-legal cards join by name. The blind spot is small and it is
visible.

### The measurement that settles it: the map has no parameters

`scripts/xmage-decision-evidence.mjs`, measurement 1.

The map's value is a **set of class names**. The extractor derives it from the
card file's imports, which is stated in the ground truth itself under
`method.symbolSource`. An import list records which types a card mentions. It
cannot record what was passed to them.

So the map says a card destroys something. It never says what, or how much.

Measured over the 32,156 mapped cards:

```
distinct class signatures                 25,128
cards whose signature is theirs alone     22,879   71.15%
cards SHARING a signature with another     9,277   28.85%
```

The collisions are not exotic edge cases. The largest, with members named so this
can be checked by eye rather than believed:

| cards | class set | some members |
|---|---|---|
| 150 | `Ability, OneShotEffect` | Tasha's Hideous Laughter, Approach of the Second Sun, Soulquake |
| 100 | `FlyingAbility` | Storm Crow, Ornithopter, Armored Pegasus |
| 90 | `DestroyTargetEffect, TargetPermanent` | Plummet, Power Word Kill, Pillage, Reprisal |
| 55 | `SimpleActivatedAbility, ManaCostsImpl, BoostSourceEffect` | Storm Shaman, Dragon Engine, Molten Ravager |
| 51 | `EntersBattlefieldTriggeredAbility, CreateTokenEffect` | Beetleback Chief, Goblin Gang Leader |
| 50 | `BoostTargetEffect, TargetCreaturePermanent` | Auger Spree, Last Gasp, Symbiosis |
| 50 | `DestroyAllEffect` | **Armageddon, Damnation, Wrath of God, Boil, Shatterstorm** |

That last row is the whole argument in one line. Armageddon destroys all lands.
Damnation destroys all creatures and they cannot be regenerated. Boil destroys
all Islands. Shatterstorm destroys all artifacts. The map gives all five the
identical value, `DestroyAllEffect`, and nothing else.

The 71.15% figure does not rescue this. A signature being unique means no other
card happened to have the same shape. It does not mean the signature specifies
the card. `Auger Spree` and `Last Gasp` differ by numbers the map does not hold,
and a card with a unique signature is missing its numbers just as completely.

Route (b) as put, "instantiate our equivalents, with no text parsing in that path
at all", cannot be built, because the thing it would read does not contain the
card. The parameters live in the Java constructor arguments. Getting them means
parsing Java expressions per call site, which is a much larger extraction than
the import scan, and it is the point at which "derived data, no source vendored"
starts to get hard to say with a straight face.

### The second measurement: parsing is not the main blocker

`scripts/xmage-decision-evidence.mjs`, measurements 2 and 3. Our own compiler
over the 32,469 pool:

```
marked-manual   9,101   28.03%
parsed-fully    7,827   24.11%
parse-blocked   7,358   22.66%
parsed-partly   7,006   21.58%
no-text         1,177    3.62%
```

`parsed-fully` 7,827 matches the `coverage: full` count from
`verify-ability-coverage.mjs` exactly, which is two scripts with separate pool
filters and separate verdict logic agreeing to the card.

Now cross that against what XMage says the card composes:

```
                    composable-now  needs-more-classes  no-xmage-entry
parsed-fully                 2,334               5,435              58
parsed-partly                  423               6,203             380
parse-blocked                1,312               5,247             799
marked-manual                  992               7,552             557
no-text                        356                 788              33
```

Two populations come out of that table.

**7,827 cards parse fully, and 1,422 cards are AUTOMATED.** The parse is already
correct for about 6,400 cards that still do nothing. Route (b) would arrive at
the same shape for those cards and still not run them, because the gap is
downstream of parsing. This agrees with the "understood, nothing runs it, 6,359"
line from the coverage script, derived a different way.

**Route (b)'s entire prize today is 1,312 cards.** That is the intersection of
the three things (b) needs: our compiler cannot read the card, XMage has an entry
for it, and every class it names is one we already have. 1,312 out of 32,469 is
4.04% of the pool, and it is an upper bound, because it assumes the parameter
problem above does not exist.

### Recommendation: (a), with the map promoted to two jobs it is genuinely good at

**Take route (a). Keep parsing oracle text. Use the class map as a prioritiser
and as a validator, and do not let it build cards.**

The seam, stated precisely so it is testable rather than a hedge:

**The map is an authority on WHICH abilities a card has. Oracle text stays the
only source of WHAT THE NUMBERS ARE. Nothing crosses that line.**

Three rules that follow:

1. **The map orders the work.** The greedy build order in section 7 comes
   entirely from the map, and it is the most valuable thing the map produces. It
   turns "write more cards" into a queue where every entry has a measured card
   count beside it.

2. **The map is a validator, and this is the highest value use nobody has
   built.** For every card that joins and is pure, compare our compiler's ability
   set against the class list and report disagreements. If XMage says a card
   composes `EntersBattlefieldTriggeredAbility, CreateTokenEffect` and our
   compiler produced one static ability, that card is a parser bug with a name
   and an address. That is 23,406 pure cards worth of free test oracle, it needs
   no runtime change, and it cannot break a live game because it runs in a
   script. **Build this first among the map-facing work.**

3. **The map never ships to the browser.** It stays a build-time and
   planning-time artefact in `scratch/`. This keeps the attribution obligation
   where it already is, in `THIRD-PARTY-NOTICES.md` and this document, rather
   than turning the map into runtime data shipped inside the app.

### What would change this recommendation

Stated in advance so it is a prediction and not a rationalisation:

- **If the parameters became available.** If an extractor could read constructor
  arguments reliably, and could do it without vendoring or transcribing XMage
  source, then (b) becomes a genuine option and this recommendation should be
  revisited. The measurement to run first is how many of the top 50 effect
  classes have arguments that are literals rather than expressions.
- **If the validator in rule 2 finds our compiler is wrong far more often than
  expected.** If a large share of the 23,406 pure joined cards disagree with the
  map, that is evidence the text path is less trustworthy than assumed, and the
  balance shifts.
- **If the runtime gap closes and parsing becomes the binding constraint.** After
  the tranches in section 7, the numbers move. If `parse-blocked` becomes the
  largest remaining bucket by a wide margin, re-run
  `scripts/xmage-decision-evidence.mjs` and read measurement 3 again.

---

## 6. What changed from the 21 August draft, and why

The previous version recommended a hybrid where "the map decides WHAT a card
does" and could instantiate abilities for pure joined cards. Two measurements
that had not been made move the seam:

1. **The class-set collision measurement had not been made.** 28.85% of cards
   share a signature, and `DestroyAllEffect` covers Armageddon and Damnation
   identically. "The map decides what a card does" is true only at the level of
   shape, and a rules engine needs the numbers.

2. **The draft said "parsing is the actual blocker" and put 17,315 cards behind
   it.** That count is right for cards that are silent and carry unparsed text.
   But 7,827 cards parse fully and only 1,422 run, so the largest actionable
   block is the runtime, not the parser, and route (b) does not touch it.

The draft's worklist, greedy order, tranche machinery and join analysis all
reproduced exactly and are kept.

---

## 7. The build order, front-loaded

Two things are ranked here. Tranche 0 is mine and comes from section 4. Tranches
1 to 5 come from the greedy order in `scripts/xmage-class-worklist.mjs`, which at
each step picks the single uncovered class that completes the most cards outright.

All card figures are COMPOSABLE, the ceiling, not AUTOMATED. Effort is the sum of
the 0 to 3 estimates and is judgement.

### Tranche 0: wire the primitives folder. Do this first.

| | |
|---|---|
| what | import and call `src/lib/game/abilities/primitives/` from the resolution path |
| classes moved | 33, all PARTIAL to HAVE |
| composable before | 5,754 (17.89%) |
| composable after | 9,545 (29.68%) |
| **net gain** | **3,791 cards, of which 3,168 are pure composition** |
| effort | low relative to the gain. The code and its tests exist. The work is wiring and a state carrier for timed continuous effects. |

The one real piece of new engineering inside it is the reason `pump` was deferred
in the first place: `GameState` carries no list to hold a duration-limited
continuous effect. `layers.ts` already models the effect properly. That single
addition unlocks the `pump` family, which is the largest group in the greedy
order by a wide margin.

Do this before anything in tranches 1 to 5, because 6 of the top 13 greedy picks
are inside it and cannot be delivered any other way.

### Tranches 1 to 5, greedy order

Cumulative figures start from the 5,754 baseline and do **not** include tranche 0,
so they are conservative. The greedy picks overlap tranche 0 heavily in the first
13 rows, which is itself the argument for doing tranche 0 first.

| tranche | classes | cards gained | of those pure | cumulative | % of 32,156 | effort | cards per effort |
|---|---|---|---|---|---|---|---|
| 1, picks 1 to 10 | 10 | 2,728 | 2,245 | 8,482 | 26.38% | 19 | 144 |
| 2, picks 11 to 25 | 15 | 2,081 | 1,585 | 10,563 | 32.85% | 34 | 61 |
| 3, picks 26 to 50 | 25 | 2,152 | 1,644 | 12,715 | 39.54% | 48 | 45 |
| 4, picks 51 to 100 | 50 | 2,892 | 2,078 | 15,607 | 48.54% | 112 | 26 |
| 5, picks 101 to 200 | 100 | 3,491 | 2,565 | 19,098 | 59.39% | 201 | 17 |

The return per unit of effort falls by roughly eight times from tranche 1 to
tranche 5. That is where to stop and reassess, not where to keep grinding.

### The first fifteen picks, named

Marginal is how many cards go from blocked to fully covered by that one class.

| # | marginal | class | verdict | note |
|---|---|---|---|---|
| 1 | 429 | `BoostSourceEffect` | PARTIAL | tranche 0 |
| 2 | 351 | `BoostTargetEffect` | PARTIAL | tranche 0 |
| 3 | 368 | `GainAbilityTargetEffect` | PARTIAL | tranche 0 |
| 4 | 304 | `GainAbilitySourceEffect` | PARTIAL | tranche 0 |
| 5 | 240 | `SpellCastControllerTriggeredAbility` | MISSING | bridge widening, cheaper than graded |
| 6 | 230 | `GainAbilityControlledEffect` | PARTIAL | tranche 0 |
| 7 | 183 | `Mode` | PARTIAL | needs the decision protocol |
| 8 | 165 | `FlashAbility` | MISSING | timing enforcement |
| 9 | 180 | `EnchantAbility` | PARTIAL | attach runs, the keyword is advisory |
| 10 | 278 | `GainAbilityAttachedEffect` | PARTIAL | tranche 0 |
| 11 | 165 | `ScryEffect` | PARTIAL | tranche 0 |
| 12 | 159 | `BoostAllEffect` | PARTIAL | tranche 0 |
| 13 | 132 | `GainAbilityAllEffect` | PARTIAL | tranche 0 |
| 14 | 132 | `DiesCreatureTriggeredAbility` | MISSING | bridge widening |
| 15 | 132 | `TargetCardInYourGraveyard` | PARTIAL | needs a graveyard picker |

Three clusters account for most of the top of the list, and they are worth
naming because each is one piece of engineering, not fifteen:

- **The `pump` family**, picks 1, 2, 3, 4, 6, 10, 12, 13. One state carrier for
  timed continuous effects, then eight classes fall.
- **The bridge widening**, picks 5 and 14 plus two more further down. One
  function in `trigger-bridge.ts` learning to bind non-self subjects. 613 cards.
- **The decision protocol**, pick 7 and everything behind `{do:'may'}`,
  `{do:'choose-mode'}` and `{do:'unless-pays'}`. This is the one genuinely large
  subsystem near the top, and it is also what converts cards into PROMPTED, which
  is currently 0.

### Suggested order

1. **Tranche 0.** Wire the primitives folder. 3,791 composable cards, mostly
   existing code.
2. **The map validator**, rule 2 of section 5. No runtime risk, finds parser bugs
   by name, and it is the gate that would change the decision if it fails.
3. **The bridge widening.** 613 cards, one function, cheaper than its grade.
4. **The decision protocol.** Large, and it is the only thing that moves PROMPTED
   off zero.
5. **Tranches 2 and 3 in greedy order**, re-running
   `scripts/xmage-class-worklist.mjs` after each block so the order stays honest
   as verdicts change.

Re-measure with `verify-ability-coverage.mjs` after each step. Composable is a
ceiling and only AUTOMATED is what a player experiences.

---

## 8. Attribution

**XMage** (`https://github.com/magefree/mage`) is licensed **MIT**, copyright
2010 betasteward@gmail.com. The licence was verified three independent ways in an
earlier session, and `scripts/xmage-ground-truth.mjs` carries a licence gate at
the top that throws before doing any work if it does not find MIT in the
checkout.

What is used, precisely: XMage's **decomposition** of a game of Magic into named
parts, and the counts of how often real cards use each part. That decomposition
is the hard, well-earned thing in XMage and it is genuinely load-bearing in this
plan, so it is attributed rather than quietly absorbed.

What is not used: no XMage source file has been copied, machine-translated, or
vendored into this repository. The checkout lives outside the repo at
`C:\Users\natha\Software\xmage`, pinned at commit `07ecb7cf`. The extractor
strips comments before analysis and extracts no oracle text. The derived data in
`scratch/` is card names and Java class names only.

This is recorded in `THIRD-PARTY-NOTICES.md` as well, which is where the
obligation is discharged for anything that ships.

**Forge** (`Card-Forge/forge`) is **GPL-3.0** and is not used, not fetched and
not read. Plain GPL triggers on distribution, this app ships its rules engine to
the browser by design, and that is distribution, so using Forge would force
DeckMatrix's full source under GPL-3.0. Translating it to TypeScript would not
help, because that is explicitly a derivative work.

**Wizards of the Coast oracle text** is not reproduced in any artefact produced
by this work. The oracle text quoted in script output is read from the cached
Scryfall bulk file at run time and is not committed.

---

## 9. Tranche 0, built 22 August 2026: what it moved

### The one number

`scripts/verify-ability-coverage.mjs`, pool of 32,469 cards, same denominator
throughout.

```
                                AUTOMATED   PROMPTED   SILENT
before                              1,401          0   30,695     4.31%
after                               1,780          0   30,250     5.48%
                                     +379         +0     -445
```

Both figures come from the SAME script, with the corrected verdict logic
described below, run twice: once against the engine at HEAD and once against the
engine after the change. That is the only comparison worth quoting, and getting
it meant reverting the working tree to HEAD, running, and restoring. The files
were checksummed either side so nothing was lost.

Two other pairs exist and both mislead on their own. Do not quote them alone:

| script | engine | AUTOMATED |
|---|---|---|
| as it was on 21 Aug | HEAD | 1,422 |
| as it was on 21 Aug | after tranche 0 | 1,423 |
| corrected | HEAD | **1,401** |
| corrected | after tranche 0 | **1,780** |

The second row is the interesting one. The script moved by ONE card across a
change that rewired six effect verbs and the whole resolution path for instants
and sorceries, because its verdicts for those verbs were a hardcoded list.

Of the 1,780, **557 are carried by keyword lines alone**, unchanged, so the
ability layer's own contribution went from **844 to 1,223**.

### What was built

**1. A place to keep a continuous effect a spell left behind.** `pump` was
deferred for one reason, stated honestly in `to-actions.ts` at the time:
`GameState` carried no list to put a duration-limited effect in. It does now.

- `GameState.timedEffects` holds them, written only by a new `ADD_CONTINUOUS`
  action, so a resolved pump is an ordinary logged action and two clients
  replaying the log land on the same board.
- `ContinuousEffect.expiry` (`EffectExpiry` in `layers.ts`) says when it stops.
  Absolute turn numbers, never a countdown, so a replay cannot end an effect one
  turn early or late.
- `continuousEffectsFor` in `abilities/statics.ts` merges the two halves: the
  DERIVED effects a static ability produces, rebuilt from the board on every
  read, and the STORED ones. Nothing sweeps at end of turn. An expired effect
  simply stops being returned, so it ends whether or not anyone remembered to
  run a cleanup.

**2. The primitives folder is called from the switch, not beside it.**
`to-actions.ts` now calls `pumpToContinuous`, `gainControlToContinuous`,
`damageToPermanent`, `returnFromForced`, `searchLibraryForced` and
`counterTargetSpell` from its own cases. `adopt.ts`, which was a second walker
carrying its own copy of the `if` / `for-each` / `repeat` logic, no longer walks
anything: it delegates to `runEffects`. Two copies of control flow is the drift
this project keeps paying for.

**3. Damage is marked instead of resolved inline.** The old case read toughness,
subtracted damage already marked, and emitted a `MOVE_ZONE` when the incoming
amount was lethal. Two Shocks at a 4/4 killed nothing, because neither was lethal
alone and nothing accumulated, and deathtouch was ignored entirely. It emits
`DAMAGE_CARD` now and lets `sba.ts` apply CR 704.5g, which is where 704.5g lives.

**4. An instant or sorcery runs its own text when it resolves.** This was the
largest single piece and it was not on the worklist at all, because the worklist
thinks in XMage classes and this is a wiring fault. `compiledAbilityActions`
returned an empty list for any stack object with no `abilityId`, and a spell cast
from hand has none: `abilityId` is for an activated or triggered ability, which
is a different object on the stack. So Lightning Bolt reached the top of the
stack, resolved, went to the graveyard and dealt no damage. Divination drew
nothing. Wrath of God destroyed nothing.

Nothing was broken. `compileCardAbilities` produced a `kind:'spell'` ability with
the right effects, `runEffects` would have executed them, and the suite was
green. Nobody called the one with the other. It is CLAUDE.md's "green tests do
not mean a player can reach it" on the largest group of cards in the game.

Measured before wiring it, so the fix needed no card-type check: **3,648 of 7,358
instants and sorceries compile to at least one `kind:'spell'` ability, and 0 of
29,136 permanents do.**

### The instrument was wrong in both directions, so it is measured now

`verify-ability-coverage.mjs` carried two hardcoded claims about other code, and
between them they decided thousands of card verdicts:

- a literal list of six verbs "named by to-actions.ts and never resolved";
- one line grading every compiled spell dead, "nothing runs a compiled spell on
  resolution".

Both were true when they were typed. A literal describing what other code does is
a claim with an expiry date, and nothing tells you when it passed. This one had
already gone stale in the flattering direction too: it omitted `damage`, which
named a deferral for every non-lethal hit and was being scored live.

Both are RUN now rather than written down:

- each verb goes through the real `runEffects` on the real probe board
  (`probeEffects`, a new export from `behaviour-probe.ts`). A verb that produces
  at least one action resolves; a verb that produces only a deferral does not.
- `SPELL_RUNS_ON_RESOLUTION` casts a real Divination through the real reducer and
  checks whether the hand grew.
- `SPELL_TARGETS_ANNOUNCED` greps the tree, at run time, for a non-test caller
  that announces targets for a spell.

The run prints all of it under "WHAT THIS RUN MEASURED ABOUT THE ENGINE", so the
evidence for the headline sits above the headline.

### It moved far less than the composable projection, and here is why

Section 7 projected tranche 0 at **3,791 composable cards**. It delivered **379
automated**. Both are correct and they are not the same measurement: COMPOSABLE
asks whether every XMage class a card names has a counterpart, and AUTOMATED asks
whether the card runs. The ratio here is about one in ten, and that ratio is the
useful finding, because it is the first time the two have been measured across
the same block of work. Treat every composable figure in section 7 accordingly.

Where the rest of it went, from the same run, in ability hits rather than cards:

```
3,690  activated: activatedAbilitiesOf has no caller
1,617  effect "add-mana" is named and never resolved
1,185  spell: runs on resolution, but no surface announces a target for a spell
1,181  advisory keyword "enchant"
  834  trigger not owned: another clause on the card disqualified it
  686  trigger not owned: needs announced targets, which triggers cannot carry
  393  trigger not owned: the engine derives no event for "enters"
```

Three deserve naming, because two are not engine gaps at all:

- **3,690 activated** is the script's own stale verdict, gated behind
  `DM_ACTIVATED_LIVE=1` by a previous session so the old figure stays
  reproducible. Deliberately left alone. Flipping it in the same session as a
  coverage claim would be moving the goalposts, and the work it would credit
  belongs to somebody else.
- **1,185 spell targets** is the blocker this tranche created. The engine runs a
  targeted spell correctly and no surface announces a target for one, so
  Lightning Bolt cast from the app arrives unaimed and says so in the log.
  `CastOptions.targets` exists and is threaded through to the stack object; what
  is missing is the asking. `activate.ts` already has the picker, the
  `TargetSpec` list and the legality check for an ACTIVATED ability, and
  `AbilityPanel` draws them. Highest-value item left, and mostly a surface
  change.
- **1,181 advisory keyword "enchant"** is probably the instrument again rather
  than the engine. `attach.ts` has `legalHostsFor` and `illegalHostReason`, which
  read the Enchant line and enforce it. The script asks `keywords.ts`, which is
  not the consumer for this one. Check it before treating it as work.

### Still zero PROMPTED, and that is the honest result

PROMPTED was 0 before and is 0 after. Nothing in tranche 0 is a class that needs a
player decision: the pump family, control change, damage marking and the forced
zone moves all resolve without asking anybody anything. Where a decision does
remain, the card defers with a note naming it, which is what it did before.

Moving PROMPTED off zero needs the decision protocol, section 7's item 4, and a
resolution-time equivalent of `activate.ts`'s `PendingChoice`. A structured
choice channel was considered for this tranche and rejected: nothing would have
consumed it, and an unconsumed channel is the same unreachable-code problem one
level down.

### Reproducing this

```
node --experimental-strip-types scripts/verify-ability-coverage.mjs
node --test --experimental-strip-types src/lib/game/spell-resolution.test.ts
```

`src/lib/game/spell-resolution.test.ts` is new and is the behavioural half: 17
tests, every card carrying its real name and its real oracle text, every
assertion about the board after the spell resolved rather than about the actions
produced. Giant Growth, Overrun, Lightning Bolt, Shock, Wrath of God, Divination,
Rampant Growth, Raise Dead, Counterspell, Act of Treason. It is its own file
because `stack.test.ts` builds every card with empty oracle text, which is
exactly why the stack could be green while no spell in the game did anything.

Whole suite: 1,859 tests, all passing. Typecheck clean. `npm run build` clean.

---

## 10. Tranche 2, built 22 August 2026: the mana pool, and the first real PROMPTED

Sections 1 to 9 are left exactly as they were, so the projections in them can
still be checked against what happened.

### The numbers

`scripts/verify-ability-coverage.mjs`, denominator 32,469, and **the same script
with the same code both times**. Getting a like-for-like before meant saving the
working tree, restoring `src/lib/game` and `src/lib/cards/abilities` from a
checksummed copy taken before the tranche, running, and restoring the work. Both
directions were verified by comparing sha256 over all 108 files.

```
                        AUTOMATED   PROMPTED   PROMPTABLE     SILENT
before                       2,570        643          120     28,804
after                        2,788        994          125     28,230
                              +218       +351           +5       -574
```

As percentages of the pool:

```
                        AUTOMATED   PROMPTED     SILENT
before                      7.92%      1.98%     88.71%
after                       8.59%      3.06%     86.94%
```

Every figure reconciles: 2,788 + 994 + 125 + 28,230 + 332 no-text = 32,469.

**PROMPTED is above zero for the first time.** Section 9 said moving it needed a
decision protocol and a resolution-time `PendingChoice`, and that is what this
is, built where a real consumer already existed rather than as a channel waiting
for one.

### Read the instrument change separately from the work

The baseline above is NOT the 1,780 that section 9 finished on. Before any engine
work, the script's last two written-down verdicts were replaced with
measurements, and that alone moved the number:

```
                                    AUTOMATED   PROMPTED
section 9's final figure                1,780          0
same engine, verdicts measured          2,570        643
tranche 2's engine work                 2,788        994
```

**790 AUTOMATED and 643 PROMPTED of the movement is instrument, not work.** It is
on its own line for that reason. What changed:

- The `activated` verdict read "activatedAbilitiesOf has no caller". Taken
  literally that is still true; that exported narrower is dead. `activate.ts` has
  a private copy of the same one-line filter with four callers, and the harness
  measured 2,262 activations across 120 games. A previous session found this, put
  it behind `DM_ACTIVATED_LIVE=1` default-off, and left it, which was reasonable
  for a day. It is now settled by activating a real Shivan Dragon on a real board
  through the real reducer and checking its power went 5 to 6.
- The `PROMPTED` line was a hardcoded `0`. It is counted now, and counted
  narrowly: a card is PROMPTED only when EVERY decision it still carries is one
  the engine offers with its legal options and then honours. Two probes decide
  it, each playing a real card end to end. A `may` and an `unless-pays` are
  offered by nothing and stay in PROMPTABLE, which is why that bucket did not
  empty.

Both are the same fix section 9 applied to the hardcoded verb list, for the same
reason: a literal describing what other code does is a claim with an expiry date
and nothing to say when it passed.

`DM_ACTIVATED_DEAD=1` forces the old activated verdict back for reproducing an
older figure. It can only make the number smaller, which is the safe direction to
leave available.

### The projection was right this time, to the card

Section 9 recorded that tranche 0 projected 3,791 COMPOSABLE and delivered 379
AUTOMATED, roughly one in ten, and said to treat every composable figure
accordingly.

This tranche was sized differently: not by composability, but by
`scripts/measure-blocker-marginal.mjs`, which records for each card the SET of
distinct blockers standing between it and a verdict, then counts cards whose
WHOLE set fits inside one piece of work. It is order-independent. There is no
greedy walk and no "and then".

It projected **218 AUTOMATED and 314 PROMPTED**. It delivered **218 AUTOMATED and
351 PROMPTED**. The AUTOMATED figure landed exactly.

That is a better instrument than composability and it is worth saying why. A
composable figure asks whether the DSL could express a card. A blocker set asks
what is actually stopping this card today. They are the ceiling and the next
step, and only the second can size a tranche.

Two flaws were found and fixed in that script before it was trusted, both of
which flattered the work:

1. **`unrunnableReason` returns only the FIRST reason a trigger cannot run.**
   Soul's Attendant reads "the engine derives no event for enters"; fix that and
   it reads "you may" and is still silent. Ranking work by first reasons promises
   cards a tranche cannot deliver. `unrunnableReasons` (plural) now returns all
   of them; the singular is a thin wrapper over it and nothing else changed.
2. **The blocker walk returned early on the first blocker per ability.** Timber
   Gorge is blocked by the unresolved `add-mana` verb AND by a `choose-mode`
   behind it. Returning early promised it as a future AUTOMATED card. It is
   PROMPTED. Fixing this took the "mana pool alone" projection from 521 cards to
   218, and the "counter verb" projection from 54 to **0**, because every one of
   those 54 also needs a spell target no surface announces.

### What was built

**1. `GameState.manaPool`.** One `ManaUnit` per mana rather than a count per
colour, because the two facts a pool has to keep are per-mana: which colour it
is, and whether the card put a string on it. Written only by `ADD_MANA` and
`SPEND_MANA`, emptied by the reducer inside `enterStep` and `passTurn`, which
between them are the only ways the game leaves a step (CR 500.4). Nothing has to
remember to empty it.

The engine went without a pool for a long time and the choice was argued in
writing: `mana.ts` derives what a player could produce by scanning untapped
permanents, which answers "can you afford this" without a pool at all. That is
still how a land pays for a spell. **This does not replace it or duplicate it.**
`manaSourcesFor` offers floating mana and untapped permanents to the SAME
matcher, so there is one payment algorithm rather than two. A separate "spend the
pool first, then match the rest" pass would have been a second algorithm, and the
two would have disagreed the first time a pool held {R} and the only untapped
land was the one Mountain a {R}{R} cost needed.

**2. `add-mana` resolves.** `to-actions.ts` calls `addManaToActions` from inside
its own switch. That primitive already existed and already deferred, with a note
saying it could not do otherwise because there was no pool. It emits the action
now. Count is honoured, so Mana Geyser adds one red per tapped land rather than
one red. A restriction rides along verbatim.

**3. A mana ability can be used.** `activate.ts` refused to offer one, with the
sentence "Mana abilities are used when you pay for something." That refusal was
honest: pressing the control would have tapped a permanent and binned the mana,
and the harness had measured Barbarian Ring doing exactly that 142 times in 120
games. It resolves immediately now, CR 605.3a, without the stack. The rider is
still charged; the mana now arrives.

**4. A modal choice is a question, not a note.** `runEffects` returns
`choices: ModeChoice[]` beside `deferred`, each carrying every legal mode with
the index that selects it. `RunOptions.modes` supplies the answer. An answer that
is not legal is refused rather than clamped, because clamping resolves a card in
a mode nobody picked, which is the same failure as guessing one.

`PendingChoice` gains `kind: 'mode'`, `planActivationWith` answers it in its
existing loop, and `bot.ts` has a policy for it. Chosen modes ride onto the stack
object, so a non-mana modal ability resolves the modes chosen when it was
ANNOUNCED (CR 602.2b) rather than the ones a board that changed in response would
suggest.

### Restricted mana is deliberately unspendable

Geosurge's seven red all reach the pool and nothing can spend them. `planPayment`
is handed a cost string and knows nothing about what is being cast, so it cannot
check "only to cast artifact or creature spells" and must not pretend to. It
under-delivers Geosurge and it never mis-pays. The mana is visible and the log
quotes the restriction.

That is the direction to be wrong in, and the same trade this file makes
everywhere: a rules engine that quietly pays a cost the player could not legally
pay is worse than one that makes them do it by hand.

### Three things the work found

- **The reachability ratchet refused an action I added.** `EMPTY_MANA_POOL` was
  written, and `reachability.test.ts` failed the build: nothing anywhere would
  ever have built one, because the reducer empties pools inside `enterStep`. It
  was deleted rather than wired. CR 500.4 is a consequence of a step ending, not
  a player decision, so there is nothing for a control to press.
- **A no-op `ADD_MANA` would have been silent.** `applyOne` drops an action whose
  reducer changed nothing, with no log entry, so an `ADD_MANA` carrying a string
  that yields no mana would change nothing and say nothing. Writing a log line
  for it does not help, because `describeAction` is never reached for a dropped
  action. The producer is where it is stopped: `addManaToActions` emits zero
  actions and a deferral for any symbol it will not guess at, and the empty
  string, which parses cleanly into nothing, is caught explicitly. A test pins it
  over every shape.
- **Two mana costs on one ability could have spent the same floating mana
  twice.** `manaSourcesFor` reads the board fresh for each cost and the board
  still holds the mana. `CostContext.poolSpent` reserves exactly what was spent,
  matched by colour, taking the first unreserved unit of each. Reserving every
  unit of a spent colour would have been the opposite bug: two floating red and a
  {R} cost would have lost both.

### What is left, re-ranked

`scripts/measure-blocker-marginal.mjs`, run after the tranche. Cards whose whole
blocker set fits inside one piece of work:

```
   1263  ( 1263 AUTOMATED,    0 PROMPTED)  advisory keywords (any)
    814  (  814 AUTOMATED,    0 PROMPTED)  every trigger-not-owned reason
    627  (  627 AUTOMATED,    0 PROMPTED)  spell targets announced by a surface
    426  (  426 AUTOMATED,    0 PROMPTED)  triggers watching another permanent
    100  (    0 AUTOMATED,  100 PROMPTED)  trigger decisions asked, not refused
     54  (   54 AUTOMATED,    0 PROMPTED)  restrictions collected and never read
     53  (   53 AUTOMATED,    0 PROMPTED)  cost-modify wired to a caller
     33  (   33 AUTOMATED,    0 PROMPTED)  granted keywords combat.ts ignores
     14  (   14 AUTOMATED,    0 PROMPTED)  replacement results intrinsic.ts lacks
      0                                    mana pool  (this tranche)
      0                                    the counter verb
```

Reading it:

- **Advisory keywords, 1,263,** is the biggest number and is not one tranche. It
  is roughly forty separate rules: enchant 168, cycling 66, flash 63, crew 39,
  morph 36, prowess 31, affinity 30, convoke 30, flashback 27, plus landwalk,
  infect, exalted and bestow. Some are genuinely cheap, since landwalk is a
  combat restriction and prowess and exalted are triggers. Some are not:
  flashback is casting from a graveyard and morph is face-down permanents.
  Section 9's warning about "enchant" still stands and is still unchecked.
  `attach.ts` enforces the Enchant line through `legalHostsFor`, and the script
  asks `keywords.ts`, which is not the consumer for it. Check those 168 before
  treating them as work.
- **Triggers watching another permanent, 426,** is the largest single coherent
  engine job left and is entirely inside `src/lib/game`. The events already
  exist: `deriveTriggerEvents` emits `enters`, `dies` and `cast` for every card.
  The restrictions are `gameEventKindFor` in `trigger-bridge.ts`, which returns
  null for any subject that is not `{sel:'self'}`, and `sourcesFor` in
  `triggers.ts`, which for a permanent event returns only the object the event
  happened to. Soul's Attendant, Ogre Slumlord, Sage of the Inward Eye. The
  compiler already emits the right thing: "Whenever another creature enters"
  compiles to an `enters` event whose subject is an `{is:'and'}` filter of
  `{is:'type',value:'creature'}` and `{is:'other'}`, and both `matchesFilter` and
  `{sel:'trigger-subject'}` already exist.
- **Spell targets, 627,** is unchanged from section 9 and is still mostly a
  surface change in `src/components/play`.
- **The counter verb is 0, not 54.** Every card whose only unresolved verb is
  `counter` also needs a spell target announced, so doing one without the other
  moves nothing. That is the clearest example of why the blocker-set measure
  replaced the marginal one.

### Reproducing this

```
node --experimental-strip-types scripts/verify-ability-coverage.mjs
node --experimental-strip-types scripts/measure-blocker-marginal.mjs
node --test --experimental-strip-types src/lib/game/mana-pool.test.ts
```

`src/lib/game/mana-pool.test.ts` is new: 15 tests, every card carrying its real
name and its real oracle text, every assertion about the pool or the board after
the fact. Sol Ring, Priest of Gix, Dark Ritual paying for a Sengir Vampire off a
board with no lands at all, Birds of Paradise offering five colours and honouring
the one chosen, Timber Gorge refusing an illegal answer, Geosurge, Talisman of
Progress replayed twice to the same pool, Shivan Dragon pumped twice off two
floating red.

Nothing in it builds an `ADD_MANA` by hand except the two guard cases that exist
to prove a hand-built one is harmless. Every other test starts from oracle text,
asks `activationsFor` or `planCastFromHand` what a player could press, and
applies exactly that batch.

Whole suite: 1,936 tests, all passing. Typecheck clean across `src/lib/game/**`
and `src/lib/cards/abilities/**`.

## 11. Tranche 3, built 22 August 2026: a permanent may watch something other than itself

Sections 1 to 10 are left exactly as they were, so their projections can still be
checked against what happened.

### The one number

`scripts/verify-ability-coverage.mjs`, denominator 32,469, the same script and
the same denominator both times. The before was taken by running it as the first
action of the session, against the tree section 10 finished on, and it reproduced
section 10's closing figures to the card.

```
                        AUTOMATED   PROMPTED   PROMPTABLE     SILENT
before                       2,788        994          125     28,230
after                        3,148      1,026          208     27,755
                              +360        +32          +83       -475
```

As a share of the pool:

```
                        AUTOMATED   PROMPTED     SILENT
before                      8.59%      3.06%     86.94%
after                       9.71%      3.16%     85.48%
```

Reconciles: 3,148 + 1,026 + 208 + 27,755 + 332 no-text = 32,469.

`abilityEngineOwns`, the predicate that decides which of the two trigger systems
handles a card, went from 1,053 cards to 1,618.

### The projection, and what it was worth

`scripts/measure-blocker-marginal.mjs` projected **342 AUTOMATED**, delivered
**360**. That is the order-independent number: cards whose WHOLE blocker set fits
inside this one piece of work, not a sum of per-label marginals.

The extra 18 are cards carrying two of this tranche's labels at once in a
combination the group test scored conservatively, plus cards the probe stopped
downgrading. Nothing was added to the tranche to reach the number.

Two labels the same script prints are now zero, which is the ratchet working:

```
before   342  TRANCHE 3: a permanent may watch an event that happened to something else
after      0
```

### What was actually wrong

`gameEventKindFor` answered one question with two. Asked "which game event does
this trigger listen for", it also silently demanded that the event have happened
to the trigger's own source, and answered `null` when it had not. So "whenever
another creature you control enters" was recorded as an event the engine does not
derive, alongside genuinely underived things like life gain and sacrifice.

It is the same enters event. The difference is which object it happened to, and
that is a separate question. Splitting them is the whole change:

```
which event fired            gameEventKindFor
which object it happened to  triggerSubjectMatches
```

Then `triggersForEvents` needed a wider list of candidates, because a watcher is
by definition not the thing the event happened to. `sourcesFor` handed back the
event's own object and nothing else.

### The part that could have broken the game, and what stops it

Widening the candidate walk on its own would have been a serious bug rather than
a feature. `effects.ts` carries an older regex trigger detector for every card
the ability engine does not own, and every pattern it recognises is
self-referential: "when THIS creature enters". Show it another creature's enters
event and it fires. One creature entering would have set off every detected
enters trigger on the board.

So there are two lists, and only one of them got wider:

- `sourcesFor` is unchanged and is what the old detector sees. The object the
  event happened to, and nothing else.
- `watchersFor` is the new one and only the ability engine reads it. It walks
  every battlefield, and each ability's own subject decides whether it cares.

One line in the loop enforces it, and a test fails without that line. The
ownership fork itself is untouched, so a card is still handled by exactly one
system and a doubled trigger is still structurally impossible rather than merely
unlikely.

Zone is deliberately not checked when matching a subject. A dies subject is
spelled `{sel:'all', where:{creature}, zone:'battlefield'}` and by the time
anything looks at it the creature is in a graveyard. The event already fixed the
zone, which is what makes it a dies event rather than a discard, so the
selector's zone could only ever refuse a subject the event had already confirmed.
The filter answers what class of object it was; the event answers where it was.

### A silent no-op found on the way, older than this tranche

Eleven fully covered cards name `{who:'defending'}` inside a triggered ability.
`resolvePlayers` answers "nobody" for an unbound defender, by design and for good
reasons, so all eleven were resolving into no actions at all. Leeching Sliver's
"defending player loses 1 life" did nothing. Eight of the eleven are
self-subject and had been owned for as long as ownership has existed, so this was
not introduced here; the other three would have been shipped broken by this
tranche.

`deriveTriggerEvents` has been putting the declared defender in the attacks
event's `targetPlayerId` the whole time. Binding it is one line, and it is bound
from an attacks event only. On a deals-damage event that same field is whoever
took the damage, which is the same seat in combat and a different one out of it,
so binding it there would point "defending player loses 1 life" at a bystander.

The coverage script cannot see this fix. It grades by rules and does not run
those abilities on its probe board, so AUTOMATED reads 3,148 with the binding and
3,148 without it. The number for this one is eleven cards that now do what they
say, and it is a test rather than a figure.

### Two things measured and then taken back out

Both were built, measured over the whole pool, and removed. Recorded here because
a rejected option with a number beside it is worth more than an option nobody
tried.

**Binding the pronoun to the trigger's subject.** Once a watcher can see another
object, the obvious next step is letting it name that object: "whenever another
creature you control dies, return IT to its owner's hand". The DSL already has
`{sel:'trigger-subject'}`, `context.ts` already resolves it, and the compiler
already refuses to bind a bare "it" when the event is not about the source.
Pointing that binding at the subject instead of dropping it is four lines.

Worth **+5 AUTOMATED**, and it made Fearless Fledgling wrong:

> Landfall. Whenever a land you control enters, put a +1/+1 counter on this
> creature. It gains flying until end of turn.

The "It" is the Fledgling. `itMayBind` exists to catch exactly that and does not,
because the body is split into sentences before the gate is applied and the
second sentence starts with the pronoun, with the noun that claimed it sitting in
the sentence before. That gap is harmless while the binding is the source, which
is what "It" means there anyway, and produces a confident wrong answer the moment
the binding is some other object. Five cards is not worth a card that flies when
it should not. The finding is written into `compiler.ts` beside the line that
would change, with the fix named: make `itMayBind` see the whole body first.

**Allowing "that player" on a cast or a draw.** The refusal on
`{who:'trigger-player'}` says the trigger carries no player to name. The event
does carry one now, and it is unambiguous on exactly two events: a cast means the
player who cast, a draw means the player who drew. Narrowing the refusal to those
two is eight lines.

Worth **zero cards.** Every card in the pool that names "that player" also
carries something else the list refuses, almost always the opponent-facing
optional cost. A relaxation that unlocks nothing is not free, because it widens
what ownership will accept and the next card through it aims an effect at a seat
nobody named. It goes back when a card needs it.

### What it cost in time

Measured with `scratch/trigger-subject-live.mjs`, outside the test runner, on a
four-seat board of 120 permanents.

```
                                    triggers found   ms per collectTriggers
120 vanilla permanents, before                   0                    0.020
120 vanilla permanents, after                    0                    0.095
120 with watchers among them, before             0                    0.036
120 with watchers among them, after             50                    0.709
```

The no-watcher row is the regression risk and it is the honest cost: about five
times the work for the same answer, and still a tenth of a millisecond per
action. The watcher row is the tranche: fifty triggers that used to be found by
nobody.

The same script runs a real two-seat bot game through `nextBotMove` and
`applyActions`, the same path a click uses. Twenty-one bot moves, life moving 40
to 42 for one seat and 40 to 35 for the other, and eleven log lines naming a
watcher. The engine does this in a game, not only in a test.

### Tests

`src/lib/game/abilities/trigger-subject.test.ts` is new: 19 tests, every card
real and every oracle string copied out of the cached Scryfall bulk file. Soul
Warden and Corpse Knight and Bogwater Lumaret and Unruly Mob and Blind Creeper
and Glitterfang and Leeching Sliver and Agate-Blade Assassin. The life totals and
the counters come from `applyAction` on the real reducer, not from a hand-built
`GameAction`.

Most of them are about the subject check REFUSING, because that is where the
danger is. Soul Warden must not gain life for its own arrival and Bogwater
Lumaret must, and the only difference between those two cards is one printed
word. Corpse Knight must ignore an opponent's creature. The old detector must
never be shown somebody else's event.

Each part of the change was checked by breaking it on purpose:

```
make triggerSubjectMatches always true      4 tests fail
remove the old detector's guard             1 test fails
collapse watchersFor back to sourcesFor     7 tests fail
remove the defending binding                2 tests fail
```

Four tests in two existing files were rewritten rather than deleted, because they
asserted the old restriction. Three of them used Soul Warden as an example of a
card the engine could not own, which is no longer true; they now use Ajani's
Pridemate, whose life-gain event really is one the engine never derives, so the
refusal still names something actually missing. The fourth used an invented
two-clause card called "Split Brain" and now uses Circuit Mender, which is real
and has the same shape.

Whole suite: 1,993 tests, all passing. Typecheck clean.

### Reproducing this

```
node scripts/verify-ability-coverage.mjs
node scripts/measure-blocker-marginal.mjs
node scratch/trigger-subject-live.mjs
node --test --experimental-strip-types src/lib/game/abilities/trigger-subject.test.ts
```

### What is next, re-measured after this tranche

`measure-blocker-marginal.mjs`, groups, after the work:

```
   1317  (1317 AUTOMATED)  advisory keywords (any)
    627  ( 627 AUTOMATED)  spell targets announced by a surface
    450  ( 450 AUTOMATED)  every trigger-not-owned reason
    321  (           321 PROMPTED)  the mode choice asked rather than deferred
    170  (           170 PROMPTED)  trigger decisions asked rather than refused
     61  (  61 AUTOMATED)  cost-modify wired to a caller
     57  (  57 AUTOMATED)  restrictions collected and never read
```

The largest single remaining engine-side blocker is **311 cards whose only
problem is that a trigger needs an announced target**, and beside it **158 whose
only problem is a "you may"**. Those are the same seam: a trigger that needs its
controller to answer something. Both should land in PROMPTED rather than
AUTOMATED, and neither needs a new engine.

The shape is already written down in this file's own header, in the paragraph
about CR 603.3b: a choice cannot be made inside a pure reducer, so the choice
arrives WITH THE ACTION. `ActionMeta.triggerOrder` already does exactly that for
trigger ordering, and `previewTriggers` already lets a client see the batch an
action will cause before it sends anything. An `ActionMeta.triggerChoices` keyed
on the same trigger ids is the same pattern once more, with no new action type
and nothing for the reachability ratchet to refuse.

The one thing that must be built first, before any refusal is relaxed: a trigger
that reaches resolution with an unanswered decision has to emit a note naming the
decision. Relax the refusal without that and 469 cards become owned and silently
do nothing, which is the exact failure this whole subsystem exists to prevent.

`chooseTargets` and `targetCandidates` in `activate.ts` already compute a
target's legal candidates and already hand back a `PendingChoice` carrying them.
They take an `ActivatedAbility` and read only its `targets`. Widening that
parameter is the way in. Do not write a second candidate producer.


## 12. Correction from an adversarial review, 22 August 2026

Sections 1 to 11 are left as they were. This section corrects one figure in
section 11 and records what a second, independent measurement found.

### AUTOMATED and SILENT held. PROMPTED did not.

A second script was written to refute the first. `scripts/adversarial-coverage.mjs`
shares no code with `scripts/verify-ability-coverage.mjs`: its own pool filter,
its own clause accounting taken straight off `oracle_text` rather than off the
compiler's span bookkeeping, and a different bar. Where the first script counts an
ability as running when `runEffects` returns at least one action, the second
applies those actions through the real reducer and requires the BOARD to move.

Both scripts, denominator 32,469, run today:

```
                    verify-ability-coverage   adversarial-coverage   gap
AUTOMATED                           3,148                  3,157      9
PROMPTED (as published)             1,026                    716    310
SILENT                             27,755                 28,044    289
```

The two AUTOMATED sets agree on 2,904 card NAMES, not only on a total, which is
85.6% of their union. The disagreements are principled in both directions and
board-dependent: `activationsFor` picks a sole legal target without asking, so
an Equipment reads AUTOMATED on a board with one creature and PROMPTED on a board
with two.

**PROMPTED was 44% too high, and the cause is this project's own law.**

`verify-ability-coverage.mjs` already refuses to count a targeted spell until a
non-test caller fills `CastOptions.targets`, on the rule that the engine
supporting something and a player reaching it are different claims. It did not
apply the same rule to a modal choice. `measureModeIsAsked` calls
`planActivation` directly, which is the engine, and every modal card was graded
PROMPTED on the strength of it.

Measured: a `kind:'mode'` `PendingChoice` carries its options only in
`choice.modes`, with `instanceIds` and `playerIds` both empty.
`src/components/play/AbilityPanel.tsx` draws chips from `choice.playerIds`
(line 214) and `choice.instanceIds` (line 221) and reads `choice.modes`
nowhere. No file under `src/components`, `src/pages` or `src/hooks` reads
`PendingChoice.modes` or `modeRef` at all. So Birds of Paradise draws
"choose 1 of: Add {W} / Add {U} / ..." with no button under it, and the
`!option.ok && !choice` fallback that would print a reason is skipped because a
choice does exist. `answer()` at line 135 has two branches, `target` and
everything else, so a mode answer would be written into `choices.costs` rather
than `choices.modes` and ignored.

The instrument now applies the spell-target standard to modes as well. With that
one change and no engine change at all:

```
                        AUTOMATED   PROMPTED   PROMPTABLE     SILENT
section 11 published        3,148      1,026          208     27,755
same engine, mode held to
the same standard           3,148        713          521     27,755
```

713 against the independent script's 716. The two instruments now agree on
PROMPTED to within three cards, having disagreed by 310.

### The harness was measuring a game nobody plays

`scripts/playtest/runner.ts` never passed `useStack`, so every reported run
used `BotOptions.useStack: false`. `src/pages/Play.tsx` passes `true` in
both places it builds those options. With the flag off, `planCastFromHand`
takes its non-stack branch, which is a bare `PLAY` straight to the resolution
zone, and a spell's own text never runs. Measured on one card: the same
Divination cast with the flag off draws 0 cards, and with it on draws 2.

`--stack` now exists. The same 120 seeds, both ways:

```
                                   stack off   stack on
spells announced onto the stack            6      2,604
objects resolved off the stack         2,005      4,493
permanent activated abilities used     2,005      1,896
tokens created                           130        204
distinct cards resolving silently        283         47
invariant violations                       0          0
actions                               63,967     68,644
```

The spell work of section 9 is real and reachable. The old harness could not see
it, and a run of that harness was being read as evidence about a game a player
never plays.

### Two zeroes that survive both configurations

**A spell was countered: 0, against 16 counted chances.** The capability is not
missing. Driven directly, with a Counterspell in hand, four untapped Islands and
priority on a spell it does not own, `nextBotMove` returns
"Counters Grizzly Bears with Counterspell" and a `[TAP,TAP,CAST_SPELL]` batch.
The zero is an opportunity artefact of these decks, not a broken feature, and the
harness report's own wording overstates it.

**A triggered ability was logged as triggering: 0.** `GameEvent.type` at
`src/lib/game/types.ts:823` declares `'TRIGGER'` with the comment "A
triggered ability was put on the stack or resolved", and nothing in `src` or
`scripts` ever constructs one. `scripts/playtest/analyze.ts:768` consumes it.
That is a declared type with a consumer and no producer, which is the
`PHASE_CHANGE` shape this project already has a section about. Triggers do
reach the log as `NOTE` messages and as `PUT_ABILITY_ON_STACK`, so a player
is not blind, but the dedicated event is dead.

### What was checked and held

Twenty AUTOMATED cards were picked by most printed lines, which is the riskiest
end, and every printed line maps to a compiled ability with the right structure:
Neheb, the Worthy keeps its hand-size condition, Dream Trawler keeps its discard
cost, Lyra Dawnbringer keeps both the subtype filter and the "other" exclusion on its
anthem, Rampant Growth still puts the land in tapped, Vilespawn Spider keeps its
sorcery timing. Fifteen cards were compared
against XMage's class composition from `scratch/xmage-ground-truth.json` and
the ability sets correspond one for one. Where XMage carries a parameter we
cannot yet express, the compiler emits `{do:'manual'}` and the card is SILENT
rather than quietly wrong: Wrath of God's regeneration clause and Swords to
Plowshares' life-gain clause are both handled that way.

No XMage source is vendored: no `.java` file exists anywhere in the repo,
attribution is in `THIRD-PARTY-NOTICES.md`, and the licence gate in
`scripts/xmage-ground-truth.mjs` still refuses to run without MIT.
