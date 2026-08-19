# ABILITY COVERAGE: the ranked plan

Every number in this file came out of a script that was run. Each section says
which script, and how it counted. Nothing here is projected from a sample.

Denominator throughout is **32,469 cards**, the census pool. CLAUDE.md's older
figures use 34,088 rows. Do not compare the two without saying so.

## Scripts, and what each one proves

| script | what it produces | output |
|---|---|---|
| `scripts/clause-census.mjs` | the text pattern census | `scratch/clause-census.json` |
| `scripts/xmage-ground-truth.mjs` | XMage's class vocabulary as a comparison | `scratch/xmage-ground-truth.json` |
| `scripts/ability-layer-coverage.mjs` | what runs today, per card | `scratch/ability-layer-coverage.json` |
| `scripts/decision-census.ts` | the decision boundary | `scratch/decision-census.json` |
| **`scripts/coverage-batch-plan.mjs`** | **per-card blocker sets, and a greedy order** | `scratch/coverage-batch-plan.json`, `scratch/coverage-blockers.json` |
| **`scripts/coverage-batch-scenarios.mjs`** | **the batch ladder, the curve, the composition test** | `scratch/coverage-batch-scenarios.json` |
| **`scripts/structural-gaps.mjs`** | **what a clause pattern cannot reach** | `scratch/structural-gaps.json` |

The last three are new in this session. They run on the cached Scryfall bulk
file only: no Supabase query, no network at run time, no model. `npx tsc --noEmit
-p tsconfig.app.json` exits 0 and no file under `src/` was written.

Console logs are kept beside the JSON at `scratch/coverage-batch-plan.txt`,
`scratch/coverage-batch-scenarios.txt` and `scratch/structural-gaps.txt`.

**Self-check that makes the cross-references valid.** Both new scripts re-run
the census normaliser over the pool and reproduce **113,536 clauses and 29,552
patterns**, matching `clause-census.json` exactly. `assertClausesAccounted`
fails on 0 of 32,469 cards. The starting verdicts recomputed here match
`ability-layer-coverage.json` field for field: AUTOMATED 1,398 before the
behaviour probe, PROMPTABLE 210, SILENT 30,529, NO-TEXT 332.

---

## 1. Reconciling the three reports

### The disagreement, restated

Same metric in all three, a card counts only when **every** unit it needs exists.

| top N units | census: text patterns | XMage: engine classes |
|---|---|---|
| 100 | 7.75% | 21.15% |
| 250 | **12.12%** | **47.17%** |
| 500 | 17.19% | 67.40% |
| 1000 | 24.34% | 88.63% |

A factor of about four at N=250. Neither report was wrong about its own
measurement. They were counting different things.

### Which to trust: measured, not argued

`coverage-batch-scenarios.mjs` re-scores the **same** blocker table at three
granularities, so the unit is the only thing that changes.

| unit | what it is | 250 units | 500 units | 1,000 units | total units |
|---|---|---|---|---|---|
| whole line | the blocking line, all its clauses joined | **10.51%** | 13.08% | 16.30% | 29,457 |
| atomic clause | that line split back into census clause patterns | **15.93%** | 20.78% | 26.95% | 28,418 |
| verb head | the clause cut to its leading verb phrase | **34.74%** | 47.88% | 64.14% | 7,750 |
| *(XMage class, for reference)* | a Java class with constructor arguments | *47.17%* | *67.40%* | *88.63%* | *1,932* |

Read the third row against the fourth. **XMage's 250 classes land between my 250
and 500 verb-head units.** That is the whole explanation, and it is measurable
rather than rhetorical:

- The census unit does not take arguments. `deals 3 damage` and `deals 5 damage`
  are two patterns and one class. The census already folds numbers to `~N`, so
  that part is done, and it still lands at 12%.
- The census unit is a whole line, so `when this enters, scry 1` and `when this
  dies, scry 1` are two patterns where a composing engine has one trigger and
  one effect. **Composition is worth 1.5x to 1.7x** at equal budget, measured:
  250 atomic units finish 15.93% against 10.51% for 250 whole-line units.
- The remaining gap is the **selector**. XMage's `TargetPermanent(filter)` is one
  class for thousands of printed selectors. Cutting the clause down to its verb
  head, which is a crude stand-in for that, moves 250 units from 15.93% to
  34.74%. That is the single largest lever in the table.

**Verdict.** Trust XMage for the *shape* and the *order*: parameterised,
composable units, effect separate from trigger, selector separate from effect.
Do not quote XMage's "1,054 classes for 90% of cards" as a DeckMatrix estimate,
because DeckMatrix's DSL is not as factored as XMage's class constructors and
the 7,750 verb-head units measured here are four times XMage's 1,932. Trust the
census, and the batch table below, for the *size* of the work against the DSL
that actually exists.

**One caveat on the verb-head row, which must travel with it.** It is an upper
bound. It assumes one filter type serves every selector behind a verb, which is
false: "target creature" and "target creature an opponent controls that attacked
this turn" are not the same amount of work. It says what perfect
parameterisation would be worth, not what is achievable.

### Where the current coverage claim conflicts, and how it resolves

It does not conflict. It measures a third thing, and all three are consistent
once the questions are separated.

| claim | what it counts | figure |
|---|---|---|
| census, 250 patterns | text patterns present | 12.12% of cards |
| XMage, 250 classes | classes a working engine references | 47.17% of cards |
| **ability layer today** | **a live consumer actually runs it** | **4.16% AUTOMATED** |

The compiler's own ceiling is `coverage: 'full'` on **7,258 cards, 22.35%**. The
engine runs **1,350**. The gap is not parsing. It is that `activatedAbilitiesOf`
has no call site, nothing runs a compiled spell on resolution, and nothing runs
a compiled mana ability. That is the reachability gap CLAUDE.md already names,
and it is reproduced independently here: the blocker table shows
`PLATFORM | activated-ability call site` blocking **3,943 cards** and
`PLATFORM | spell resolution runs compiled effects` blocking **2,146**.

**The 906 figure stands.** Re-measuring `abilityEngineOwns` over this pool gives
877 cards, 2.70%. Two independent measurements at 2.66% and 2.70%. Nobody
inflated it. It counts triggered abilities only, which is why the whole-card
AUTOMATED number is 1,350 rather than 877. Both are true and answer different
questions.

**Do not quote 22.35% as coverage.** It is the same shape of error as the 95.7%.

---

## 2. The batch ladder

**Script:** `scripts/coverage-batch-scenarios.mjs`, section "THE BATCH PLAN".

### How a batch was scored

For every card that is not already done, `coverage-batch-plan.mjs` records the
**full set** of work items blocking it, not just a count. "How many cards does
this batch finish" is then a set containment test, not an estimate: a card is
finished when every one of its blockers is in the granted set.

A work item is the blocking line run through the census normaliser and its
clause patterns joined, so `{T}: Add {G}.` and `{T}: Add {R}.` are **one** item.
Blockers that are not clause patterns become **PLATFORM** items, named
separately and never disguised as parser work.

**Order is measured, not asserted.** Each batch was scored alone first, and the
ladder is sorted by cards unlocked per work item. The last three are the
remainder by definition and are held to the end.

A finished card lands in **PROMPTED** rather than AUTOMATED when the compiler
already produced a decision effect, or when a blocking line carries a decision
marker. PROMPTED additionally requires the pending-decision platform item,
because an understood choice with no control is PROMPTABLE, not PROMPTED. That
rule is what stops this table reporting the Aether Vial failure as a success.

### Starting position

| | cards | share |
|---|---|---|
| AUTOMATED | 1,350 | 4.16% |
| PROMPTED | 0 | 0.00% |
| SILENT | 30,787 | 94.82% |
| no rules text | 332 | 1.02% |

### The ladder

Each row is cumulative. "After it lands" is the three metrics with that batch
and every batch above it built.

| # | batch | new items | cards unlocked | per item | AUTOMATED | PROMPTED | SILENT |
|---|---|---|---|---|---|---|---|
| 1 | Pending-decision state | **1** | **211** | **211.0** | 1,350 (4.16%) | 211 (0.65%) | 30,576 (94.17%) |
| 2 | Derive the missing trigger events | 16 | 744 | 46.5 | 2,075 (6.39%) | 230 (0.71%) | 29,832 (91.88%) |
| 3 | Wire the activated-ability path | 36 | 487 | 13.5 | 2,556 (7.87%) | 236 (0.73%) | 29,345 (90.38%) |
| 4 | Make the advisory keywords do something | 147 | 1,432 | 9.7 | 3,937 (12.13%) | 287 (0.88%) | 27,913 (85.97%) |
| 5 | The remaining replacement results | 2 | 13 | 6.5 | 3,950 (12.17%) | 287 (0.88%) | 27,900 (85.93%) |
| 6 | The common trigger-effect verbs | 117 | 582 | 5.0 | 4,427 (13.63%) | 392 (1.21%) | 27,318 (84.14%) |
| 7 | The standalone effect verbs | 315 | 1,477 | 4.7 | 5,765 (17.76%) | 531 (1.64%) | 25,841 (79.59%) |
| 8 | Everything else shared by 5+ cards | 279 | 1,349 | 4.8 | 6,976 (21.49%) | 669 (2.06%) | 24,492 (75.43%) |
| 9 | Items shared by 2 to 4 cards | 2,169 | 3,332 | 1.5 | 9,792 (30.16%) | 1,185 (3.65%) | 21,160 (65.17%) |
| 10 | The bespoke tail, one item one card | 26,375 | 21,112 | 0.8 | 24,531 (75.55%) | 7,558 (23.28%) | 48 (0.15%) |

**Batches 1 to 8 are 913 work items and take SILENT from 94.82% to 75.43%.**
Batches 9 and 10 are 28,544 work items for the rest.

### The batches, with their patterns

**BATCH 1. The pending-decision state.** One item. 211 cards.
It is one thing: a state in which the game is stopped and waiting for an answer.
`GameState` has no pending-decision field, no action type represents an
unanswered question, and `pendingTriggers` is drained inside `applyAction`.
Every prompt kind depends on it and nothing else can be built first.

It touches **7,558 cards** in the blocker table. It finishes 211 immediately
because the other 7,347 are also blocked by something else. Those 211 are the
PROMPTABLE cards: understood, correct, waiting on a control that has never been
built. This is Aether Vial's bucket.

**BATCH 2. Derive the missing trigger events.** 16 items. 744 cards.
The single most efficient real batch at 46.5 cards per item.

| cards blocked | item |
|---|---|
| 552 | `trigger: needs announced targets, which triggers cannot yet carry` |
| 324 | `trigger: the engine derives no event for "enters"` |
| 227 | `trigger: the engine derives no event for "cast"` |
| 154 | `trigger: the engine derives no event for "dies"` |
| 85 | `trigger: the engine derives no event for "step"` |
| 42 | `trigger: the engine derives no event for "gains-life"` |
| 34 | `trigger: the engine derives no event for "leaves"` |
| 33 | `trigger: the engine derives no event for "attacks"` |
| 30 | `trigger: the engine derives no event for "deals-damage"` |
| 29 | `trigger: the engine derives no event for "sacrificed"` |
| 26 | `trigger: the engine derives no event for "tapped"` |
| 8, 8, 7, 6, 4 | `becomes-blocked`, `dealt-damage`, `needs turn history`, `untapped`, `blocks` |

**BATCH 3. Wire the activated-ability path.** 36 items. 487 cards.

Two dead call sites plus the vocabulary the abilities behind them need:

| cards blocked | item |
|---|---|
| 3,943 | `PLATFORM \| activated-ability call site` |
| 2,146 | `PLATFORM \| spell resolution runs compiled effects` |
| 738 | `cost\| ~tap + effect\| add ~mana` |
| 292 | `cost\| ~tap + effect\| add ~mana or ~mana` |
| 203 | `cost\| ~mana + effect\| ~ gets +~n/+~n until end of turn` |
| 127 | `cost\| ~tap + effect\| add ~n mana of any color` |
| 40 | `cost\| ~tap + effect\| add ~mana, ~mana, or ~mana` |
| 37 | `cost\| ~mana, ~tap + effect\| add ~n mana of any color` |
| 30 | `cost\| ~mana, ~tap + effect\| add ~mana` |

**Read the two columns against each other, because this is where a plan goes
wrong.** The call site touches 3,943 cards and finishes **zero** on its own.
Neither does the mana effect on its own. They only pay out together. In the
plain greedy, which scores an item by what it finishes right now, the call site
sank to **rank 14,963** for exactly this reason. That is an artefact of the
scoring rule, not a fact about the work, and it is why the ladder above grants
platform items as a tier instead of trusting the greedy order.

**BATCH 4. Make the advisory keywords do something.** 147 items. 1,432 cards.
The best ratio available from pure ability-layer work, 9.7 cards per item.

| cards blocked | keyword |
|---|---|
| 1,178 | enchant |
| 614 | flash |
| 586 | equip |
| 295 | cycling |
| 192 | kicker |
| 187 | flashback |
| 185 | crew |
| 141 | morph |
| 137 | ward |
| 134 | devoid |
| 102 | convoke |
| 84 | prowess |
| 78 | affinity |
| 70 | partner |
| 66 | changeling |
| 60 | madness |

`keywords.ts` reads `card.keywords` from Scryfall and applies a keyword only if
it is in `ENGINE_KEYWORDS`. Everything else is `ADVISORY_KEYWORDS`: a badge and a
reminder, applied by the player by hand.

**BATCH 5. The remaining replacement results.** 2 items. 13 cards.
`enters-with-counters` where the count is not a plain number (65 cards blocked),
and `multiply` (3). `intrinsic.ts:83` derives only `enters-tapped` and a
plain-number `enters-with-counters`. Cheap, and it closes a named hole.

**BATCH 6. The common trigger-effect verbs.** 117 items. 582 cards.

| cards blocked | item |
|---|---|
| 68 | `trigger\| when ~ enters + effect\| scry ~n` |
| 50 | `trigger\| when ~ enters + effect\| choose ~n —` |
| 46 | `trigger\| when ~ enters + effect\| surveil ~n` |
| 32 | `trigger\| at the beginning of each upkeep + condition\| if no spells were cast last turn + ...` |
| 32 | `trigger\| at the beginning of each upkeep + condition\| if a player cast ~n or more spells ...` |
| 31 | `trigger\| at the beginning of your upkeep + effect\| sacrifice ~ unless you pay ~mana` |
| 28 | `trigger\| when ~ enters + effect\| attach it to target creature you control` |
| 20 | `trigger\| whenever ~ deals combat damage to a player + effect\| put a +~n/+~n counter on it` |

**BATCH 7. The standalone effect verbs.** 315 items. 1,477 cards.

| cards blocked | item |
|---|---|
| 274 | `effect\| choose ~n —` (compiled to a manual marker) |
| 255 | `effect\| draw a card` |
| 94 | `effect\| choose ~n —` (unparsed) |
| 92 | `effect\| ~ deals ~n damage to any target` |
| 89 | `effect\| ~ can't be countered` |
| 62 | `effect\| draw ~n cards` |
| 60 | `effect\| target creature gets +~n/+~n until end of turn` |
| 57 | `effect\| as an additional cost to cast ~, sacrifice a creature` |

**BATCH 8. Everything else shared by 5 or more cards.** 279 items. 1,349 cards.

| cards blocked | item |
|---|---|
| 104 | `cost\| ~mana + effect\| regenerate ~` |
| 73 | `cost\| ~tap + effect\| add ~mana` (unparsed form) |
| 66 | `kw\| suspend ~n—~mana` |
| 54 | `kw\| flying` (back face, unparsed by design) |
| 49 | `cost\| ~mana, ~tap, sacrifice ~ + effect\| draw a card` |
| 43 | `cost\| ~mana, sacrifice ~ + effect\| draw a card` |
| 43 | `kw\| cumulative upkeep ~mana` |
| 42 | `kw\| disguise ~mana` |

**BATCHES 9 and 10.** 28,544 items for 24,444 cards. Section 3.

### If only one batch gets built

Batch 2, 16 items, 744 cards, 46.5 cards per item. It is the best measured ratio
of any batch that is real engineering rather than a single platform primitive,
and unlike batch 3 it pays out on its own without needing a paired effect.

Batch 1 scores higher per item at 211.0, and it is one item, but it is a
`GameState` change in files this workflow does not own.

---

## 3. Where the curve flattens, and what the last stretch costs

**Script:** `scripts/coverage-batch-scenarios.mjs`, sections "WHERE THE CURVE
FLATTENS" and the scenario B curve. Scenario B is the realistic one: the two
dead call sites paid for, then greedy over everything else.

### The knee, exactly

| items | cards finished | per item |
|---|---|---|
| 1 to 10 | 1,431 | **143.10** |
| 11 to 25 | 585 | 39.00 |
| 26 to 50 | 508 | 20.32 |
| 51 to 100 | 692 | 13.84 |
| 101 to 200 | 893 | 8.93 |
| 201 to 400 | 1,111 | 5.55 |
| 401 to 800 | 1,403 | 3.51 |
| 801 to 1,600 | 1,674 | 2.09 |
| 1,601 to 3,200 | 1,815 | 1.13 |
| 3,201 to 6,400 | 3,200 | **1.00** |
| 6,401 to 12,800 | 6,400 | **1.00** |
| 12,801 to 29,455 | 11,027 | 0.66 |

- **The first item that finishes two cards or fewer is rank 856.**
- **The first item that finishes exactly one card is rank 1,741.**

At rank 1,741 the position is AUTOMATED 9,037 (27.83%), PROMPTED 890 (2.74%),
SILENT 22,210 (68.40%). **Past that point every work item buys one card and no
ordering can change it.** 89.56% of the 29,457 work items appear on exactly one
card, and 6,911 cards have a sole blocker that no other card shares.

### Cheap ends at roughly 900 work items

Batches 1 to 8 are 913 items and land at AUTOMATED 21.49% plus PROMPTED 2.06%,
SILENT 75.43%. That is the end of cheap. The per-item rate at that point has
already fallen from 143 to under 5, and 800 items later it is under 2.

### What 80% would actually cost

| target | work items |
|---|---|
| 80% of the pool AUTOMATED or PROMPTED | **17,714** |
| 90% | 23,108 |
| 95% | 26,792 |
| 99% | not reachable by this order |

**Say this plainly to the owner: cheap-to-80 does not exist.** The request was
reasonable and the data does not support it. 80% needs 17,714 work items, and
about 16,000 of those are one item for one card. That is not a project with a
front-loaded phase, it is the card pool with extra steps, and it is the same
conclusion the census reached by a different route.

What does exist is **cheap-to-25**. Batches 1 to 8 are 913 items for 23.55% of
the pool AUTOMATED or PROMPTED, up from 4.16% today. Per item that is 40 times
better than anything past rank 1,741.

**The honest recommendation is to stop the pattern grind at the knee and change
the unit instead.** The composition test in section 1 measured what that is
worth: at 250 units, whole-line 10.51%, atomic 15.93%, verb head 34.74%. Making
the DSL's selectors and filters general is worth more than three thousand more
patterns, and it is the only thing measured here that changes the shape of the
curve rather than the position along it.

### Two residuals that no batch closes

- **48 cards** stay SILENT at the bottom of the ladder. They are the cards the
  behaviour probe downgraded: the static analysis called them AUTOMATED, and the
  real interpreter then deferred or threw. Causes were pump with an end-of-turn
  duration, `search your library`, `sacrifice N of M`, and `add {R}` from a
  trigger. They have no blocker set, so no item can finish them.
- **PROMPTED tops out at 7,558 (23.28%)** in this table, while the decision
  census puts the floor of cards that can never be fully automatic at **11,350,
  34.96%**. The two are not in conflict. This table routes a card to PROMPTED
  only when the compiler produced a decision effect or a *blocking* line carried
  a marker, so cards whose decision text sits on a line the engine already
  handles are not counted. **34.96% is the better planning number** and 23.28%
  is a lower bound.

---

## 4. What clause patterns cannot reach

**Script:** `scripts/structural-gaps.mjs`. Text count over the census pool, both
faces, reminder text dropped. Every detector can be read with `--samples <id>`,
and the two largest were audited that way before publishing.

**This is a text count. It sizes mechanisms. It is not coverage, and a card can
appear under several detectors.** 9,314 cards, 28.69% of the pool, match at
least one.

| cards | % pool | mechanism | why a pattern cannot do it |
|---|---|---|---|
| **3,828** | 11.79% | Continuous grant of an ability to other objects, layer 6 | `statics.ts` has an `ability` layer case, so the mechanism exists. The problem is counting: the census only ever sees a keyword when it is **printed**. XMage needs `IndestructibleAbility` on 450 cards; the census sees 107, because 335 grant it in a sentence. Text-pattern counting systematically undercounts every mechanic that is granted rather than printed. |
| **1,300** | 4.00% | General replacement and prevention, CR 614 and 615 | `replacement.ts` exists, but `intrinsic.ts:83` derives only `enters-tapped` and a plain-number `enters-with-counters` from a compiled ability. Everything else is skipped. |
| **939** | 2.89% | Turn history | `GameState` folds no per-turn history. The census gap reason `needs-history` is 290 clauses and the blocker table names a PLATFORM item for it. |
| **767** | 2.36% | Alternative and additional costs | `CastOptions` in `moves.ts` carries `ignoreMana` and nothing else. There is no field saying which way a spell was cast. |
| **613** | 1.89% | Copiable values, CR 707 | No copy layer anywhere in `src/lib/game`. Census gap reason `copy-layer`, 187 clauses. A copy is the printed object plus copy effects, not the current state, so it cannot be expressed as an effect that reads the board. |
| **597** | 1.84% | Cost modification | Cost changes apply while a spell is being announced, which is a different moment from the layer pass. `statics.ts` has a `cost-modify` case; the timing is the hard part. |
| **585** | 1.80% | Type and subtype change, layer 4 | `statics.ts` has a `type` case. A land becoming a creature changes what every other rule says about it, which no single clause can express. |
| **434** | 1.34% | A card that edits rules text | Layer 3. Nothing in the DSL represents card text as data. |
| **353** | 1.09% | Randomness | A coin flip or die roll needs a seeded, replayable source or a networked game desynchronises. Nothing in `GameState` carries one. |
| **327** | 1.01% | The back face | Only the front face is compiled, by design. 2,395 clauses become `multi-face` or `alt-cast` gaps. |
| **308** | 0.95% | A chosen X in rules text | See below. |
| **257** | 0.79% | Characteristic-defining abilities, layer 7a | `layers.ts` applies `pt-set` and `pt-modify` with fixed numbers. A P/T that must be recounted every time the board changes has no home. |
| **229** | 0.71% | An object remembered across a zone change, CR 400.7 | A new object in a new zone is a new object, and the DSL has no handle on the old one. Exile-until-leaves needs a link between the two. |
| **220** | 0.68% | APNAP ordering | `ActionMeta.triggerOrder` and `replacementOrder` exist, are honoured by `rules.ts:1903` and `replacement.ts:543`, and nothing outside the engine sets either. |
| **126** | 0.39% | An amount divided across recipients | `{op:'damage'}` carries one scalar and one selector. A split has nowhere to live. |
| **82** | 0.25% | Outside the game | No zone for it. |

**X in the printed mana cost: 532 cards, 1.64%.** That number is an independent
corroboration, not a restatement: this script counts `{X}` in the mana cost
across faces and lands on exactly the 532 the decision census reported. Today
`parseCost` sets `hasX` and leaves X out of `total`, `planPayment` charges
`total`, and nothing on `CAST_SPELL`, `CardInstance` or `StackObject` carries a
chosen X. **Those 532 cards are cast right now with X silently zero.**

### The three that are worse than a gap

A card that does nothing is visible. These are not.

1. **532 X spells cast at X = 0.** Nobody is told.
2. **959 mana sources whose colour `planPayment` picks** by a heuristic. Wrong
   the moment the colour matters for the next spell.
3. **Three cards where the compiler resolves a player's choice for them.**
   Peregrine Drake and Great Whale, "untap up to N lands", compile to
   `{sel:'all', where:{is:'type', value:'land'}}` with no count cap and **no
   controller filter**, so they untap every land on the table including the
   opponents'. Kazandu Stomper returns **every** land you control. All three pass
   `abilityEngineOwns`, so the engine claims them and runs them. The parser is
   treating "up to N" as "all". The check is in
   `ability-layer-coverage.mjs` and prints every run, so it stays at zero once
   fixed.

**Fix those three cards before building any batch.** They are a handful of cards
and they are the wrong-ability failure the design exists to prevent.

### The order this section implies

Layer 6 grants are the largest structural population at 3,828 cards and the
mechanism already exists in `statics.ts`. That makes it the cheapest structural
win. Copy, CDA, text-changing and divided damage all need a type-space change
first and should be scheduled after the batch ladder, not inside it.

---

## 5. Caveats a later session must carry forward

- **A work item is not a unit of effort.** `shuffle` and "separate all creatures
  into two piles" both count as one. A PLATFORM item is engine work in files the
  ability layer does not own and counts as one item here while costing far more
  than one pattern. The per-item column understates them.
- **The greedy order is greedy, and it is a lower bound.** An optimal ordering of
  the same length finishes at least as many cards, never fewer. It also has the
  AND-pair defect documented in batch 3: an item that only pays out alongside
  another scores zero and sinks. The ladder in section 2 works around it by
  granting platform items as a tier; the raw greedy order in
  `scratch/coverage-batch-plan.json` still contains it and should not be quoted
  without that warning.
- **The verb-head row in section 1 is an upper bound**, for the reason given
  there. Do not quote it as achievable.
- **The structural-gap table is a text count, not coverage.** Same discipline as
  the decision census. Every detector is a regex over oracle text and can be
  audited with `--samples`.
- **Only the front face is compiled.** Back faces become `multi-face` or
  `alt-cast` gaps by design, which is why `kw| flying` shows 54 unparsed hits.
- **The probe board holds no lands and one creature per player**, so "untap up
  to five lands" scores zero there while being perfectly capable on a real board.
  60 such cards were left in AUTOMATED rather than downgraded. If that is called
  wrong, the honest AUTOMATED floor is 1,290, 3.97%.
- **Basic lands do produce mana in play**, through `mana.ts` counting untapped
  sources, not through the ability layer. They are counted SILENT here while
  being usable in a game.
- **The census pool has a known defect.** Roughly 1,080 real paper cards,
  including Black Lotus, all five Moxen and Tundra, are missing because the
  digital filter is applied to the oracle-representative printing rather than to
  the card. It does not change the shape of any curve here, but it should be
  fixed before anyone quotes the pool size again.
- **Nobody has measured the pool people actually play.** Restricting to
  Commander-legal cards, or to cards that appear in real decklists, would give a
  different and probably much kinder curve. CLAUDE.md records `deck_cards` as 474
  rows of what looks like fixture data, so it cannot be measured from what is in
  the database today. This is the highest-value unmeasured thing left.
