# The XMage vocabulary: the worklist, the decision, and the order to build in

Written 21 August 2026. Nothing here was implemented. This is a plan, a graded
worklist, and one decision with the evidence under it.

---

## 0. Read this bit first: where every number comes from

Coverage on this project has been misreported twice. A "95.7%" figure turned out
to be a 12,000 row slice of a 34,088 row catalogue, and the real automated
figure was 2.66%. So every number below names the script that produced it, the
denominator, and the day it ran.

| Script | What it measures | Denominator | Run |
|---|---|---|---|
| `scripts/xmage-ground-truth.mjs` | card name to XMage class set, and the class ranking | 32,156 XMage cards | 21 Aug 2026, re-run today |
| `scripts/verify-ability-coverage.mjs` | AUTOMATED / PROMPTED / SILENT, from our own compiler and engine | 32,469 card pool | 21 Aug 2026 |
| `scripts/xmage-class-worklist.mjs` | the graded worklist, the greedy build order, the tranches, the name join | 32,156 XMage cards and the 32,469 pool | 21 Aug 2026, new today |

Outputs live in `scratch/`:
`xmage-ground-truth.json`, `verify-ability-coverage.json`,
`verify-ability-coverage-activated-live.json`, `verify-names.json`,
`verify-names-activated-live.json`, `xmage-class-worklist.json`,
`xmage-class-worklist.txt`.

To reproduce all of it:

```
node scripts/xmage-ground-truth.mjs
DM_NAME_LIST=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
DM_NAME_LIST=1 DM_ACTIVATED_LIVE=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
node scripts/xmage-class-worklist.mjs
```

**One thing in this document is a judgement and not a measurement.** The
HAVE / PARTIAL / MISSING grade for each of the top 300 classes was decided by a
person reading our engine, and it lives in the `VERDICTS` table at the top of
`scripts/xmage-class-worklist.mjs`. Every count beside a grade is computed by
that script. Anyone who disagrees with a grade edits one line and re-runs, and
all the numbers move with it. The effort estimates, 0 to 3, are also judgement
and are labelled as such wherever they appear.

---

## 1. The measurement instrument was wrong, and it cost 765 cards

Before planning any new work, the current position had to be re-measured,
because the last measurement was taken on 19 August and the engine changed on
20 August.

`scripts/verify-ability-coverage.mjs` grades each compiled ability against a
hand-written table of "does a live consumer run this". One entry in that table
said:

```
case 'activated':
  return { s: 'dead', why: 'activated: activatedAbilitiesOf has no caller' };
```

That stopped being true on commit 56e982b. `activate.ts` calls
`activatedAbilitiesOfCard` in four places, `AbilityPanel.tsx` draws the result
and asks for a target in place, and `stack.ts:566` runs the ability through
`compiledAbilityActions` on resolution. The harness measured 2,262 activations
across 120 games.

So the script was grading 2,470 ability hits as dead on a claim that no longer
held. A measurement switch was added, `DM_ACTIVATED_LIVE=1`, default off so
every figure the script printed before today it still prints today. Both runs,
same day, same pool of 32,469:

| | AUTOMATED | PROMPTED | PROMPTABLE | SILENT | NO-TEXT |
|---|---|---|---|---|---|
| as the script has always graded | 1,422 (4.38%) | 0 | 41 | 30,674 (94.47%) | 332 |
| with activated abilities graded live | 1,746 (5.38%) | 0 | 482 (1.48%) | 29,909 (92.12%) | 332 |

**765 cards were already reachable and were being reported as silent.** 324 of
them run with no player decision at all, and 441 ask the player something
through a control that exists.

The `PROMPTED 0` line was also a hardcoded literal with the note "no per-card
choice UI exists". That note is now false for activated abilities, so the note
was corrected to say which abilities it still covers. The zero is still right
for triggers and spells: a trigger that needs an announced target is refused
outright by `unrunnableReason`, and nothing runs a compiled spell on resolution
at all.

Nothing was fixed here. A wrong number was corrected. The real position today is
5.38% automated and 1.48% promptable, not 4.38% and nothing.

---

## 2. Why the class is the right unit

`scripts/xmage-ground-truth.mjs` established it and this document does not
re-argue it: XMage's 32,156 mapped cards are compositions of **1,932 distinct
engine classes**, and 90% of the pool needs 1,054 of them. The text pattern
census on the same pool needed about 25,648 patterns for the same 90%. Same
result, roughly 24 times less work, because a class is shared and a sentence is
not.

Two things this document adds to that.

### 2a. 115 of the 1,932 are not work at all

The published curve counts every class, including Java interfaces, abstract base
classes, and the little counters XMage's client draws beside a card. A card
naming `Effect` does not need an engine primitive called Effect. Measured over
the whole ranking by `xmage-class-worklist.mjs`:

| Kind | Classes |
|---|---|
| client hint (`ValueHint`, `MyTurnHint`, `ConditionHint` and 43 more) | 46 |
| Java abstract base class | 38 |
| Java interface | 31 |
| **Total** | **115 of 1,932 (5.95%)** |

They sit near the top of the ranking because everything inherits from them.
`Ability` is rank 1 with 16,345 cards and is satisfied by our having an ability
type at all. Treating these as free is not a shortcut, it is reading the ranking
correctly.

### 2b. 72.79% of cards are pure composition, and now we know which ones

The extractor already reported 23,406 cards (72.79%) as pure composition, with
no hand-written Java. It computed that per card and then threw the flag away
when writing `cardToClasses`. One line was added so the per-card flag survives,
in a new `cardMeta` block that sits beside `cardToClasses` and does not change
its shape. The extractor was re-run and reproduces the previous ranking,
mapping, counts and curve exactly, plus the new field.

```
cardMeta entries 32,156   pure 23,406   modal 763   own-java choice 2,004
```

This matters for section 5. "Is the class list the whole card" is the question
that decides whether instantiating our equivalents reproduces a card or quietly
builds three quarters of it, and it is now answerable per card instead of only
in aggregate.

---

## 3. Where we actually stand, measured as a composition

A card is COVERED when every class it names has a counterpart in our engine that
runs. STRUCTURAL and HAVE count as covered. PARTIAL does not, because a card
whose effect prints a note instead of changing the board is a card that did not
run.

```
covered classes                         245 of 1,932
  free by kind                          115
  HAVE from the graded worklist         130
cards whose every class is covered      5,754 of 32,156  (17.89%)
  of those, pure composition            3,718            (11.56%)
  of those, carrying hand-written java  2,036
cards blocked by exactly one class      10,592           (32.94%)
cards blocked by exactly two classes    8,499            (26.43%)
```

Now put that beside what actually runs. Using the full name lists from both
scripts, intersected by card name:

```
cards the engine reaches today (automated + promptable, activated graded live)  2,224
  composable AND reached                                                        1,633
  composable and NOT reached                                                    4,121
  PURE composition and NOT reached                                              2,102
```

**2,102 cards are pure compositions of parts this engine already has and runs,
and nothing runs them.** No new effect, no new trigger, no new cost. The parts
are built and the card is not.

That gap is the text compiler. Of the 29,909 cards graded silent, 17,315 are
silent because the text did not parse. The engine is not missing the machinery
for those 2,102 cards. It is missing the sentence that names the machinery.

---

## 4. The worklist: the top 300 classes, graded

This is the list nobody had made. It is in ranking order, which is card count
order. `cards` is how many of the 32,156 name that class.

Grades:

- **STRUCTURAL** a Java base class, interface, target pointer or client hint. Nothing to build.
- **HAVE** our DSL spells it and a live consumer runs it.
- **PARTIAL** our DSL spells it and the runtime does not act on it, or acts on a narrower case than the class covers.
- **MISSING** no counterpart.

Effort is 0 to 3 and is an estimate: 0 nothing to do, 1 a mapping or a flag
(under a day), 2 a new DSL member plus its runtime case or a new trigger event,
3 a subsystem such as a hidden zone picker, a decision protocol, delayed
triggers, or targeting the stack.

Totals over the 300:

| Grade | Classes | Cards naming at least one such class |
|---|---|---|
| STRUCTURAL | 30 | 18,580 |
| HAVE | 125 | 29,425 |
| PARTIAL | 52 | 14,272 |
| MISSING | 93 | 10,484 |

The PARTIAL row is the interesting one. 52 classes, and almost none of them are
missing a DSL member. They are missing a consumer.

| # | cards | bucket | class | grade | effort | note |
|---|---|---|---|---|---|---|
<!-- WORKLIST_TABLE -->

---

## 5. The decision: use the mapping as a source of truth, with a seam

The choice was between:

- **(a)** use the ranking only to prioritise our existing text compiler, and keep parsing oracle text.
- **(b)** use the card-to-class mapping as a direct source of truth: look up a card's classes and instantiate our equivalents, with no text parsing in that path.

### The evidence for (b)

**The join works.** Measured by `xmage-class-worklist.mjs` against the same
32,469 pool the coverage script uses:

```
joined on the printed name exactly           29,937  (92.20%)
joined on the front face of "A // B"            705  (2.17%)
JOINED, either way                           30,642  (94.37%)
NO ENTRY IN XMAGE AT ALL                      1,827  (5.63%)
```

The 5.63% is not what it looks like. Broken down by set type, 1,276 of the 1,827
are `funny`, meaning Unglued, Unhinged, Unstable, Unfinity and the Unknown Event
cards, and a further 220 are Mystery Booster playtest cards. Scored against
cards a player can put in a real deck:

```
Commander-legal cards in the pool             30,784
  of those, no entry in XMage                    467  (1.52%)
```

**98.48% of Commander-legal cards join by name.** That is the blind spot, and it
is small.

**Parsing is the actual blocker, and (b) removes it.** 17,315 silent cards are
silent because text did not parse. A class list has no parsing step. The 2,102
figure from section 3 is the immediate size of that: cards our engine can
already build, which only the parser is failing to reach.

**The work is 24 times smaller in the class unit,** and that ratio was measured
on the same pool, not asserted.

### The costs of (b), each one measured rather than feared

**1. The class list is not the whole card for 27.21% of cards.** 8,750 of the
32,156 carry hand-written Java: their own effect type, an anonymous subclass, or
a lambda. For those, instantiating the classes they name builds a card that is
missing part of itself, and a card that plays weaker or stronger than it is
printed is worse than a card that does nothing. This is the serious cost.

It is also now checkable per card, because `cardMeta.pure` exists. Gated on
that flag, (b) addresses 23,406 cards and refuses the rest instead of half
building them. The curve barely moves when you restrict to pure cards: at 1,000
classes it is 88.63% for all cards and 89.29% for pure ones, so the number is not
propped up by bespoke cards getting a free pass.

**2. It pins us to one commit.** The map was extracted at `07ecb7cf`. A card
printed after that commit has no entry. Of the 1,827 unjoined, 122 are from
expansion sets and 137 from commander products, and some of those are simply
newer than the pin rather than absent from XMage. Re-extracting is one command
and it reproduced byte-identical results today, so the pin is a maintenance job,
not a trap. But it is a standing job.

**3. A name key is brittle at the edges.** 705 cards join only on the front face
of a "A // B" name, and 9 split cards plus 10 adventure cards fail entirely.
Both numbers are small and both are visible.

**4. Attribution moves.** Today the map is a planning input and the MIT notice
lives in a document. If the map becomes runtime data shipped to the browser, the
notice ships with the app. That belongs in `THIRD-PARTY-NOTICES.md` and in the
built bundle, and it is a condition of doing this, not an afterthought.

### The recommendation: a hybrid, and here is exactly where the seam is

**The map decides WHAT a card does. Our DSL decides HOW. The text compiler is
the fallback for what the map cannot answer.**

That is the seam, and it is not a fudge. Three concrete rules:

**Rule one. The map is an authority on a card's ability set, never on its
implementation.** No XMage behaviour is translated, ported or copied. For a card
that joins and is pure, the class list says which of our own DSL constructs to
instantiate and in what shape. Everything after that point is our engine, our
layers, our `to-actions.ts`. There is one engine, and the map does not become a
second one.

**Rule two. Before the map instantiates anything, it runs as a validator.** For
every card that joins and is pure, compare the ability set our text compiler
produced against the class list, and report every disagreement. This costs
nothing at runtime, changes no behaviour, and answers the one question that
decides whether (b) is safe: how often does the class-to-DSL mapping in section
4 actually agree with our own parse of the same card. A blind instantiation
built on a mapping that is wrong half the time is exactly the silent-wrong
failure this project keeps having.

**Rule three. The text compiler keeps every card the map cannot answer for.**
That is the 5.63% that do not join, the 27.21% that are not pure, and every card
printed after the pinned commit. The ranking still prioritises that work, which
is option (a), running underneath.

So the class ranking gets used twice at once: as the build order for the engine
(section 6), and as a direct source for the cards it can answer for. Neither use
blocks the other, and the engine work is shared by both paths.

### What would change my mind

- **The validator disagrees too often.** If our compiler and the class list disagree on more than about a fifth of pure joined cards, the mapping in section 4 is wrong more often than it is right, and the instantiation path must not be built until it is fixed. This is the main gate, and it is cheap to check.
- **The pin ages badly.** Re-run the extractor at two commits three months apart and diff the ranking. If the top few hundred classes churn, the map is a moving target and (a) is the safer default.
- **The licence position changes**, or shipping the map as app data turns out to need more than attribution. Then (b) dies and (a) is all that is left. XMage is MIT today, verified three ways, and the extractor throws before doing any work if it does not find MIT in the checkout.
- **The greedy model does not hold.** If "cards blocked by exactly one class" does not fall as tranches land, the projections in section 6 are wrong and should stop being quoted.

### Prerequisites before any of this is built

1. `cardMeta` is now emitted. Done today, one line, and the extractor reproduces its previous output exactly.
2. The join needs a stored key, not a lookup by display name at runtime. Oracle id to XMage name, resolved once, with the front-face rule written down.
3. The MIT notice moves into `THIRD-PARTY-NOTICES.md` before any map data ships.

---

## 6. The build order, front-loaded

This is computed, not chosen. At each step, `xmage-class-worklist.mjs` picks the
single uncovered class that completes the most cards outright, adds it to the
covered set, and asks again. Greedy is not provably the best possible ordering
for this kind of problem, but the marginal gain printed against each pick is
exact.

Two columns of gain. **all** is every card completed by that class. **pure** is
the share of those whose class list is the whole card in XMage, so it is what a
class-composition path can build without also writing bespoke behaviour. Project
against the pure column.

### Tranches

| Tranche | Classes | Effort (estimated) | Cards gained, all | Cards gained, pure | Pure per effort | Cumulative pure | % of pool | Cumulative all | % of pool |
|---|---|---|---|---|---|---|---|---|---|
| base, today | 245 covered | 0 | 5,754 | 3,718 | | 3,718 | 11.56% | 5,754 | 17.89% |
<!-- TRANCHE_TABLE -->

The fall-off is steep and it is the whole argument for front-loading. Tranche 1
is ten classes for 2,245 pure cards, 118 per unit of effort. Tranche 5 is a
hundred classes for 2,565, 13 per unit. Tranche 1 is nine times the return.

### Tranche 1, the ten classes, and what they really are

| Pick | Class | Grade | Effort | Cards, all | Cards, pure |
|---|---|---|---|---|---|
| 1 | `BoostSourceEffect` | PARTIAL | 2 | 429 | 370 |
| 2 | `BoostTargetEffect` | PARTIAL | 2 | 351 | 303 |
| 3 | `GainAbilityTargetEffect` | PARTIAL | 2 | 368 | 315 |
| 4 | `GainAbilitySourceEffect` | PARTIAL | 2 | 304 | 260 |
| 5 | `SpellCastControllerTriggeredAbility` | MISSING | 2 | 240 | 195 |
| 6 | `GainAbilityControlledEffect` | PARTIAL | 2 | 230 | 187 |
| 7 | `Mode` | PARTIAL | 3 | 183 | 141 |
| 8 | `FlashAbility` | MISSING | 1 | 165 | 133 |
| 9 | `EnchantAbility` | PARTIAL | 1 | 180 | 143 |
| 10 | `GainAbilityAttachedEffect` | PARTIAL | 2 | 278 | 198 |

Six of those ten are one job. Picks 1, 2, 3, 4, 6 and 10 are all
`{do:'pump'}`, either the power and toughness half or the `grant` half.
`to-actions.ts` names `pump` and prints a note instead of changing anything, and
it says why in its own comment: a pump is a continuous effect with a duration,
`layers.ts` models one properly, and `GameState` carries no list to put it in.
`continuousEffectsFor(state)` derives its list from static abilities alone.

**So the single highest-value thing in this entire document is a timed
continuous-effect list on `GameState`, with cleanup at end of turn.** It is
worth 1,633 pure cards on its own, before anything else on the list is touched.

And most of the code for it is already written and connected to nothing.
`src/lib/game/abilities/primitives/` holds 1,388 lines of implementation and
1,381 lines of tests: `continuous.ts` turns a pump and a gain-control into
`ContinuousEffect[]`, `zones.ts` does return-from and search-library, `mana.ts`
does add-mana, `stack.ts` does counter, `library-order.ts` does scry and
surveil, `regenerate.ts` does regenerate. `registry.ts` maps all ten verbs and
`adopt.ts` is a working adoption path whose own header says the eventual edit is
one line per case in the existing switch. Nothing outside that folder imports
any of it.

This is the pattern `CLAUDE.md` already warns about, one folder further on.
`ATTACH` was proven correct by tests and had never been built by any code path.
These primitives are proven correct by tests and are called by nothing. Green
tests, unreachable behaviour, again.

### The other four in tranche 1

- **Pick 5, `SpellCastControllerTriggeredAbility`, 240 cards.** "Whenever you cast a spell." `trigger-bridge.ts` derives a `cast` event only when the subject is `{sel:'self'}`, so every card that watches another spell is refused. The same restriction costs picks 14, 20 and 28 later: `dies`, `enters` and `enters` for anything other than the source itself. Lifting the self-only restriction on subjects is one job worth roughly 600 cards across the list.
- **Pick 7, `Mode`, 183 cards.** Modal spells. `{do:'choose-mode'}` is spelled and nothing asks the question. This is the decision protocol, and it is the same missing piece as `{do:'may'}` and `{do:'unless-pays'}`.
- **Pick 8, `FlashAbility`, 165 cards.** An advisory keyword. Timing is not enforced.
- **Pick 9, `EnchantAbility`, 180 cards.** Attach runs and `sba.ts` checks Aura legality under 704.5m and 704.5n. The keyword itself is still graded advisory, which is a labelling job more than an engine one.

### Reading the rest of the order

Picks 11 to 25 are the second cluster and they group the same way. Four hidden
zone jobs (`TargetCardInLibrary`, `SearchLibraryPutInHandEffect`,
`SearchLibraryPutInPlayEffect`, `LookLibraryAndPickControllerEffect`), two
graveyard target jobs, two more non-self trigger jobs, and `ScryEffect` and
`SurveilEffect` which are both already written in `primitives/library-order.ts`.

Picks 23, 24, 26 and 49 to 53 are all one job: mana abilities. `mana.ts` derives
available mana by counting untapped permanents and never reads a compiled mana
ability, so nine separate classes across the top 60 are blocked on the same
decision. Together they are worth 792 cards.

The full 100-pick order is in the table below and in
`scratch/xmage-class-worklist.json` under `picks`.

| # | class | bucket | grade | effort | cards, all | cards, pure | cumulative | % of pool |
|---|---|---|---|---|---|---|---|---|
<!-- GREEDY_TABLE -->

---

## 7. The engine gaps behind the worklist, in the engine's own words

The worklist above is the same story told by the coverage script's own dead
list. This is that list, from the 21 August run, counted in ability hits rather
than cards:

```
2,470  activated: activatedAbilitiesOf has no caller      <- STALE, see section 1
1,999  effect "pump" is named by to-actions.ts and never resolved
1,617  effect "add-mana" is named by to-actions.ts and never resolved
1,483  spell: nothing runs a compiled spell on resolution
1,181  advisory keyword "enchant"
  770  trigger not owned: another clause on the card disqualified it
  614  advisory keyword "flash"
  476  trigger not owned: needs announced targets, which triggers cannot yet carry
  343  effect "return-from" is named by to-actions.ts and never resolved
  296  advisory keyword "cycling"
  272  trigger not owned: the engine derives no event for "enters"
  258  effect "search-library" is named by to-actions.ts and never resolved
  232  trigger not owned: the engine derives no event for "cast"
  193  advisory keyword "kicker"
  188  advisory keyword "flashback"
  185  advisory keyword "crew"
  174  trigger not owned: the engine derives no event for "dies"
  141  advisory keyword "morph"
  140  cost-modify: costAdjustmentFor has no caller
```

Six structural facts sit under all of it, and all six were checked by reading
the code today:

1. **`GameState` has no timed continuous-effect list.** `continuousEffectsFor` derives from static abilities only. This blocks pump, gain-control, every "until end of turn" grant, and every temporary type change.
2. **`to-actions.ts` names six verbs and resolves none of them:** pump, gain-control, search-library, return-from, add-mana, counter. Each pushes a sentence into `deferred`.
3. **Triggers only fire for the source itself.** `gameEventKindFor` derives an event for 8 of the DSL's 17 trigger kinds, and every permanent event requires `{sel:'self'}`. It derives nothing at all for leaves, zone-change, becomes-blocked, dealt-damage, tapped, untapped, counter-added, gains-life, loses-life and sacrificed.
4. **Triggers cannot carry announced targets.** `unrunnableReason` refuses any triggered ability with a target, because nothing announces one. 476 ability hits.
5. **Only 2 of 9 restriction rules are read.** `combat.ts` asks about `cant-attack` and `cant-block`. `cant-untap`, `must-attack`, `cant-be-blocked-except-by`, `cant-be-targeted`, `cant-cast`, `max-lands-per-turn` and `damage-prevention` are collected by `statics.ts` and read by nobody.
6. **Only 15 keywords mean anything.** `ENGINE_KEYWORDS` has 15 entries. A creature granted wither, persist or horsemanship gets a badge and plays exactly as it did before.

None of these is a card problem. Each one is a single engine job that a few
hundred cards are waiting behind, which is the whole reason the class is a
better unit than the sentence.

---

## 8. What to do next, in order

1. **Keep the corrected measurement.** `DM_ACTIVATED_LIVE=1` is the honest grading today. Either make it the default or fix the stale entry outright, and re-check the other hardcoded verdicts in that table on the same pass.
2. **Give `GameState` a timed continuous-effect list, then wire `primitives/`.** Highest return in the document, and most of the code exists. 1,633 pure cards.
3. **Lift the self-only restriction on trigger subjects.** Roughly 600 cards across picks 5, 14, 20 and 28.
4. **Build the map as a validator, not as a source.** Compare our compiler's ability set against the class list for every pure joined card and report the disagreements. This is the gate on the whole decision in section 5 and it changes no runtime behaviour.
5. **Then, if the validator agrees, build the instantiation path** for pure joined cards, with the text compiler keeping everything else.

Do not quote a coverage number from this document without its denominator. The
two that matter are 32,469, which is our card pool, and 32,156, which is XMage's
mapped pool. They are close and they are not the same.

---

## Attribution

This work reads structure from **XMage**, at
[github.com/magefree/mage](https://github.com/magefree/mage), commit
`07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d`.

XMage is licensed under the **MIT License**, Copyright (c) 2010
betasteward@gmail.com. `scripts/xmage-ground-truth.mjs` verifies that at run
time from the checkout's own `LICENSE.txt` and refuses to do any work if it does
not find it.

No XMage source is vendored into this repository. The clone lives outside it, at
`C:\Users\natha\Software\xmage`. Only structure is extracted: class names, and
which classes each card name composes. Comments are stripped before any
analysis, because XMage's comment lines carry Wizards of the Coast oracle text
which is not XMage's to license, and none of it appears in any artefact here.

Forge is GPL-3.0 and is never fetched, read or referenced.

If the mapping becomes data shipped inside the app rather than a planning input,
this attribution moves into `THIRD-PARTY-NOTICES.md` and into the built bundle.
