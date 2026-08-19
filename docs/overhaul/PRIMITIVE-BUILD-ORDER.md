# The Primitive Build Order

**Status:** Complete · **Date:** 2026-08-19 · **Type:** Planning instrument, plus the tool that regenerates it
**Tool:** `scripts/coverage/` · **Source:** `github.com/magefree/mage` @ `07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d` (2026-08-17), MIT
**Nothing vendored. No XMage source in this repo. Forge was never cloned, read, or referenced.**

Follow-up to `XMAGE-EXTRACTION-SPIKE.md`, which recommended building the extractor
as a planning instrument. This is that instrument and its first output.

---

## 0. The two numbers, before anything else

| | what it is | measured today |
|---|---|---|
| **REPRESENTABLE** | what the ability DSL can express | see §2 |
| **AUTOMATED** | what the engine actually *runs* for a player | **not measured here — see §2.3** |

**Every number in this document is an input to REPRESENTABLE and to *planning* the
road to AUTOMATED. Not one of them is an automation figure.** A primitive's row
says "this many cards would run *if this were written correctly*". Nothing in the
ranked list is running. Quoting a line from §5 as coverage would be the exact
dishonesty the whole design exists to prevent.

---

## 1. Corrections to the spike, which change the conclusion

The spike ran in `C:\Users\natha\DeckMatrix` — an empty scaffold. The real repo is
`C:\Users\natha\Desktop\Software\Deckmatrix`. Three of its premises are wrong here,
and the third one changes what to build.

### 1.1 The DSL exists, and is much wider than the spec the spike measured against

The spike stated "no `dsl.ts` exists" and so measured against a *written spec*
reconstructed from `RULES-ENGINE-DECISION.md`. `src/lib/cards/abilities/dsl.ts` is
real and 23 KB. Measured against the actual file, the thirteen capability gaps
have already moved:

| gap | present in `dsl.ts` today as | engine |
|---|---|---|
| E9 computed values | `ValueExpr`, 15 forms incl. `count`, `add`, `sub`, `min`, `if` | `context.ts:499 evalValue` evaluates them |
| E2 layers | `Modification { layer: control \| type \| color \| ability \| pt-set \| pt-modify \| pt-switch }` | `statics.ts:118–201` |
| E4 cost modification | `Modification { layer: 'cost-modify' }` | `statics.ts:280` |
| E1 replacement | `ReplacementAbility` / `ReplaceableEvent` / `ReplacementResult` | 871 replacement abilities emitted |
| E3 restrictions | `Restriction`, 6 rules | `statics.ts:330–340` |
| E10 the stack | `Zone 'stack'`, `Effect { do: 'counter' }` | partial |
| E5, E6, E7, E8, E11, E12, E13 | **absent** | — |

**The most useful single finding in this document follows from that table.** The
spike's headline recommendation was "build E9 (computed values) first". E9's type
space exists *and* the engine evaluates it. What does not exist is the **compiler
front end**: across `compiler.ts`, `clause-rules.ts`, `effect-rules.ts` and
`grammar.ts` there is exactly **one** non-numeric `ValueExpr` ever constructed —
`{v:'x'}` at `grammar.ts:52`. `{v:'count'}` is emitted **zero times**.

So E9 is not a DSL extension to design or an engine feature to build. It is a
**parsing** job in `effect-rules.ts`, against a type space and an evaluator that
are already finished and already tested. That is a far smaller and far better-
understood piece of work than the spike costed, and it is the cheapest item on
this page.

### 1.2 "84 automated cards" is stale by a wide margin

`CLAUDE.md` §"Card coverage" quotes 84 automated of ~12,000. Re-measured today
with `node --experimental-strip-types scripts/measure-ability-coverage.ts` over
all 34,088 printings:

| | printings | share |
|---|---:|---:|
| at least one ability emitted | 25,481 | 74.8% |
| at least one **automated** ability (no `{do:'manual'}` in it) | 20,070 | 58.9% |
| `coverage === 'full'` — nothing dropped, nothing manual, anywhere | **7,611** | **22.3%** |
| accounting failures (must be zero) | **0** | |

Per distinct `oracle_id` (33,037): **7,347 full**, 370 with no rules text at all,
19,417 with ≥1 automated ability.

**Read this carefully, because it is easy to misquote.** `coverage === 'full'` is
the *compiler's* verdict — every clause modelled, no manual marker. It is a
REPRESENTABLE figure. Whether the engine executes those 7,347 end-to-end in a real
game is a separate question this document did not measure and does not claim.
**The 84 figure needs re-measuring by whoever owns the engine; do not repeat it,
and do not replace it with 7,347 either.**

### 1.3 Two precision fixes over the spike's detector

Both come from stripping comments before analysis — which is also a licensing
requirement, since XMage's `//` lines carry Wizards of the Coast's oracle text.

- **Corpus CLEAN 24,566 (76.4%)**, not 24,435 (76.0%). The spike's source regexes
  matched oracle text in comments — e.g. `without paying its mana cost` raised a
  false E12 on cards that merely say so in a comment.
- **Identity map 91,620 rows / 32,161 names**, not 91,873 / 32,328. The difference
  is 167 names that appear only in *commented-out* `SetCardInfo` lines. Checked:
  **162 of the 167 have no card class on disk at all** — they are cards XMage has
  not implemented, and counting them inflated the denominator.

Everything else in the spike reproduced exactly: 32,168 card classes, 23,455 pure
composition (72.9%), 8,713 with hand-written Java (27.1%), and the LOC cliff to
the decimal.

| lines of code | files | contain bespoke Java |
|---|---:|---:|
| 0–45 | 8,654 | **0.0%** |
| 45–60 | 11,319 | **0.3%** |
| 60–80 | 4,961 | 32.8% |
| 80–120 | 5,357 | 96.6% |
| 120–200 | 1,751 | 100.0% |
| 200+ | 126 | 100.0% |

---

## 2. The join to our catalogue

The ranking had to be weighted by **cards our users could play**, not by XMage's
corpus. Full census, not a sample — all 33,037 distinct `oracle_id`s, using both
fixes the spike verified.

| | matched | of | rate |
|---|---:|---:|---|
| all distinct `oracle_id` | 31,751 | 33,037 | **96.1%** |
| excluding Un-sets and `A-` Alchemy | 31,601 | 32,044 | **98.6%** |
| **Commander-legal only** | **31,418** | **31,661** | **99.2%** |

`cards` is re-synced nightly, so these counts move by a row or two between
runs; the rates are stable to the decimal shown.

Of the 31,751 matches: 30,961 exact, **+86 by NFD diacritic fold**, **+704 by DFC
front-face**. Both fixes are load-bearing — dropping the DFC rule alone would lose
704 cards, over half of them Commander staples.

The spike sampled 1 in 27 names and got 96.9% / 98.7%. The full census lands at
96.1% / 98.6% — the sample was very slightly optimistic and otherwise sound. The
misses are the same known, excludable buckets: Marvel (MSC 82, MSH), Alchemy/
digital (MBC 52, HOB 32, Y-prefixed), Conspiracy draft-matters (CN2 25, CNS 19),
Doctor Who (WHO 18).

**The join is not a risk.** Weighting is by distinct `oracle_id`, not by printing —
counting printings would rank by print run rather than playability. `deck_cards`
is deliberately *not* used as a weight: 474 rows across 8 decks, alphabetically
clustered, fixture data (`CLAUDE.md`).

### 2.1 What is actually unlockable, and what was thrown out for precision

Of the 31,441 Commander-legal cards that join to an XMage class:

| | cards | |
|---|---:|---|
| needs ≥1 DSL capability we do not have | 7,428 | blocked before primitives matter |
| CLEAN but carries hand-written Java | **4,317** | **excluded — see below** |
| **CLEAN and purely declarative** | **19,696 (62.6%)** | **the unlockable set** |

The 4,317 exclusion is the single biggest precision decision here, and it costs
recall on purpose. A card can pass the capability detector and still declare
`class FooEffect extends OneShotEffect` inside itself. That is hand-written Java.
It is not composed of primitives, and implementing every primitive it imports
would **not** make it run — it would make it *look* like it runs. That population
is exactly the ~5% false-CLEAN set the spike found by hand-audit (Permeating Mass,
Phyrexian Vindicator, Oreskos Explorer, Plaguecrafter). Including them would have
inflated this document by 4,317 cards of imaginary progress.

### 2.2 Framework is not behaviour

The first ranking put `MageSingleton`, `AbilitiesImpl`, `TargetPointer` and
`SplitCard` in the top 40 — XMage's Java class hierarchy, not Magic's rules. It
made the output measurably worse: the top 100 fell from ~4,900 cards to 799,
because a hundred ranks went to scaffolding that unlocks nothing.

The fix is mechanical, not a hand-written exclusion list (hand lists are what the
spike's v1/v2 detectors died of):

> An **abstract class or interface** in XMage's engine is framework. So is an
> **enum**, and so is `FooImpl` where `Foo` is an interface, or a class extending
> a `java.util` container.

Our DSL is a tagged union of plain data with no inheritance, so there is nothing
to port: `OneShotEffect` is not a thing we implement, it is a shape our `Effect`
union already has. Measured over the engine tree: 104 abstract, 80 interfaces, 464
enums, **3,077 concrete behaviour classes**. Applying it drops the primitive
universe from **2,128 to 1,822**.

This rule *removes* work, so it is the direction that can flatter us. The guard is
§2.1 — any card whose remaining primitives are all framework still has to be
purely declarative to count, and 4,317 failed that test.

### 2.3 What our own compiler already does — and why the gross numbers are a trap

DeckMatrix has an oracle-text compiler that never went through XMage, and it is
far past zero (§1.2). So the question "how many cards does this primitive unlock"
is the **wrong** question. The right one is *how many does it unlock **that we do
not already handle***.

The ranker therefore carries a `new` column and, by default, **optimises for it**.
The difference is not cosmetic:

| | top 25 | top 100 | top 300 | all 1,822 |
|---|---:|---:|---:|---:|
| ranked by gross unlocks → **new** cards | 217 | 1,782 | 5,097 | 12,312 |
| ranked by **new** → **new** cards | **217** | **1,782** | **5,466** | **12,312** |

and the gross-ranked list opens with `FlyingAbility`, `VigilanceAbility`,
`TrampleAbility` — keywords our compiler has parsed since day one, worth **0 new
cards each**. Planning from the gross order would spend the first thirty
primitives arriving where we already are.

---

## 3. The coverage curve, weighted by our catalogue

Commander-legal weighting, ranked by new cards, all 31,441 in-scope `oracle_id`s.

| implement top N primitives | cards unlocked | % of in-scope catalogue | **of which NEW** |
|---:|---:|---:|---:|
| 25 | 783 | 2.5% | 217 |
| 50 | 1,608 | 5.1% | 668 |
| 100 | 4,181 | 13.3% | 1,782 |
| 150 | 6,050 | 19.2% | 2,807 |
| 200 | 7,486 | 23.8% | 3,672 |
| **300** | **10,358** | **32.9%** | **5,466** |
| 400 | 11,863 | 37.7% | 6,648 |
| 600 | 14,565 | 46.3% | 8,552 |
| 800 | 16,086 | 51.2% | 9,671 |
| 1,000 | 17,900 | 56.9% | 10,912 |
| 1,500 | 19,084 | 60.7% | 11,811 |
| **1,822 (all)** | **19,696** | **62.6%** | **12,312** |

**The spike's central finding survives the reweighting intact: the tail is very
flat and no small vocabulary unlocks a majority.** Top 300 of 1,822 primitives —
16% of the work — buys 33% of the catalogue. The remaining 84% of the primitives
buys the other 30%.

**Read the last column, not the third.** The honest statement of what this whole
programme is worth:

> Implementing all 1,822 primitives would newly represent **12,312** Commander-legal
> cards that our compiler does not fully handle today, on top of the 7,347 it
> already does. The first 300 of them buy **5,466**.

Subject to: (a) the CLEAN classification is an upper bound with ~5% optimistic
bias; (b) it assumes every primitive is implemented *correctly*, which is the
entire cost and is not de-risked by anything here; (c) `new` is measured against
the compiler's `coverage`, a REPRESENTABLE verdict, not against the engine.

### Non-additivity, demonstrated rather than asserted

The spike warned that greedy-table gains do not add up. Measured directly here:

```
sum of every primitive's SOLO unlock:      1,276
cards actually unlocked by all 1,822:     19,696
solo accounts for 6.5% of the real total
```

**A card needs its whole primitive set at once.** 1,659 of the 1,822 primitives
unlock **nothing** on their own. Summing the `solo` or the `marginal` column is
meaningless, and any planning that does so is wrong by a factor of fifteen.

---

## 4. Which DSL capability gates the most of *our* cards

The spike's §5 table, reweighted from XMage's corpus to ours, and split the way
that actually decides an extension. **`blocks-alone`** = cards where this is the
*only* missing capability *and* the card is purely declarative — the cards that
one extension would actually free. **`touches`** = cards that involve it at all,
which is the number that makes extensions look bigger than they are.

| capability | blocks-alone | touches | |
|---|---:|---:|---|
| **E2** layer system | **1,225** | 2,315 | CR 613. Type space exists; the hard part is real |
| **E7** mid-resolution interaction | **544** | 1,555 | needs priority windows + a prompt protocol |
| **E10** the stack | **360** | 747 | |
| **E4** cost modification | **286** | 643 | **type space + engine already exist** |
| **E6** watchers | **257** | 1,113 | **absent from the DSL** |
| E12 alternative / free casting | 115 | 373 | |
| E11 copy effects | 70 | 280 | |
| E3 restrictions | 50 | 396 | type space + engine already exist |
| E1 replacement effects | 49 | 681 | type space + engine already exist |
| E8 conditional mana | 34 | 163 | **absent from the DSL** |
| E13 phasing / out-of-zone | 33 | 72 | |
| E9 computed values | **0 — see below** | 339 | compiler front end only (§1.1) |
| E5 "as though" permission | 0 | 251 | |

**E9's zero is an artefact of the detector, not a measurement, and must not be
read as "E9 is worthless".** The detector only ever raises E9 from a *bespoke*
`DynamicValue` subclass, and `blocks-alone` requires the card to have no bespoke
code — so `E9 ∧ purely-declarative` is impossible by construction. E9's real value
is in the `touches` column and, more importantly, in §1.1: it is a parser gap in
front of a finished type space and a finished evaluator.

### What this does to the spike's recommendation

The spike recommended **E9 → E6 → E4 → E8**, "+1,526 cards, 76.0% → 80.7%". Two
corrections:

1. **E9 and E4 are largely built.** Both have type space *and* engine support
   today. E9's remaining work is compiler parsing; E4's compiler already fires 72
   times. The spike costed them as new subsystems.
2. **+1,526 does not survive reweighting.** Against our catalogue with the purity
   gate, **E4 + E6 + E8 blocks-alone = 577 cards**, not 1,526. The spike's figure
   was corpus-wide, before the framework and purity filters, and counted `touches`-
   style gains.

The *ordering* still stands and so does the reasoning — E2 and E7 top the table
and are each a rules engine. But the prize for the cheap group is roughly a third
of what was advertised, and **E9 is now the cheapest item on this page rather than
a subsystem**.

---

## 5. The ranked, dependency-ordered build order

Full list: `scripts/coverage/.data/primitive-order.commander.new.json` (1,822
entries, every column below plus full dependency FQNs). Regenerate with
`node scripts/coverage/rank.mjs`.

**Columns.** `solo` = cards unlocked if this were the only primitive ever written.
`marg` = cards unlocked **given everything ranked above it**. `new` = of `marg`,
how many our own compiler does not already represent fully. `Σnew` = running total
of `new`. `needs first` = already-ranked primitives it depends on. `diff` = S/M/L,
**a heuristic computed from the primitive's own source** (lines of code, its own
helper types, dependency count, and whether it requires a missing DSL capability)
— nobody hand-estimated 1,822 primitives and this document will not pretend they
did. A parenthesised `(E*)` means it cannot be written until that capability exists.

Ranks 1–7 have `new = 0` and are still first: they are the dependency closure the
rest of the list stands on. That is what "dependency-ordered" costs.

| # | primitive | family | solo | marg | new | Σnew | needs first | diff |
|--:|---|---|--:|--:|--:|--:|---|:-:|
| 1 | `AnotherTargetPredicate` | filter | 0 | 0 | 0 | 0 | #7 | M |
| 2 | `FlyingAbility` | keyword | 98 | 98 | 0 | 0 | — | M |
| 3 | `TargetCard` | target | 0 | 0 | 0 | 0 | #5 | L |
| 4 | `StaticFilters` | filter | 0 | 0 | 0 | 0 | #1, #2 | L |
| 5 | `FilterCard` | filter | 0 | 0 | 0 | 0 | — | M |
| 6 | `StaticValue` | computed-value | 0 | 0 | 0 | 0 | — | M (E9) |
| 7 | `Mode` | ability-shape | 0 | 0 | 0 | 0 | — | L |
| 8 | `LookLibraryAndPickControllerEffect` | effect | 13 | 26 | 26 | 26 | #3, #4, #5 | L |
| 9 | `EntersBattlefieldTriggeredAbility` | ability-shape | 0 | 25 | 25 | 51 | — | M |
| 10 | `ScryEffect` | effect | 0 | 21 | 21 | 72 | #6 | M |
| 11 | `CanBlockOnlyFlyingAbility` | ability-shape | 0 | 18 | 18 | 90 | — | S |
| 12 | `DrawCardSourceControllerEffect` | effect | 13 | 50 | 15 | 105 | #6 | M |
| 13 | `SurveilEffect` | effect | 2 | 12 | 12 | 117 | — | M |
| 14 | `GainLifeEffect` | effect | 7 | 62 | 11 | 128 | #6, #7 | M |
| 15 | `LoseLifeSourceControllerEffect` | effect | 0 | 24 | 10 | 138 | #6 | M |
| 16 | `FilterCreaturePermanent` | filter | 0 | 0 | 0 | 138 | — | S |
| 17 | `DamageEverythingEffect` | effect | 7 | 11 | 11 | 149 | #6, #16 | M |
| 18 | `DestroyAllEffect` | effect | 9 | 27 | 12 | 161 | — | S |
| 19 | `ExploreSourceEffect` | effect | 0 | 10 | 10 | 171 | #6 | L |
| 20 | `FlashbackAbility` | keyword | 0 | 9 | 8 | 179 | — | M |
| 21 | `PreventAllDamageByAllPermanentsEffect` | effect | 4 | 9 | 9 | 188 | #7 | L (E1) |
| 22 | `PermanentsOnBattlefieldCount` | computed-value | 0 | 8 | 8 | 196 | — | M (E9) |
| 23 | `DamageAllEffect` | effect | 0 | 20 | 9 | 205 | #6 | M |
| 24 | `FilterControlledPermanent` | filter | 0 | 8 | 8 | 213 | — | S |
| 25 | `DynamicManaEffect` | effect | 2 | 4 | 4 | 217 | #7 | L |
| 26 | `TapSourceCost` | cost | 0 | 0 | 0 | 217 | — | S |
| 27 | `DynamicManaAbility` | mana | 6 | 11 | 11 | 228 | #25, #26 | M |
| 28 | `SimpleActivatedAbility` | ability-shape | 0 | 30 | 13 | 241 | — | S |
| 29 | `RegenerateSourceEffect` | effect | 0 | 33 | 33 | 274 | — | L (E1) |
| 30 | `TargetCardInHand` | target | 0 | 0 | 0 | 274 | #3, #4, #5 | M |
| 31 | `PutCardFromHandOntoBattlefieldEffect` | effect | 0 | 14 | 14 | 288 | #4, #5, #7 | L |
| 32 | `TargetSacrifice` | target | 0 | 0 | 0 | 288 | #33 | S |
| 33 | `TargetPermanent` | target | 0 | 0 | 0 | 288 | #4 | M |
| 34 | `SacrificeTargetCost` | cost | 0 | 13 | 9 | 297 | #32, #33 | L |
| 35 | `DestroyTargetEffect` | effect | 0 | 79 | 27 | 324 | #7 | M |
| 36 | `TargetCreaturePermanent` | target | 0 | 39 | 19 | 343 | #4, #33 | S |
| 37 | `BoostTargetEffect` | continuous | 0 | 149 | 48 | 391 | #6, #7 | M |
| 38 | `DamageTargetEffect` | effect | 0 | 65 | 27 | 418 | #6, #7 | M |
| 39 | `ReturnToHandTargetEffect` | effect | 0 | 55 | 27 | 445 | #7 | M |
| 40 | `TargetAttackingOrBlockingCreature` | target | 0 | 27 | 27 | 472 | #4, #33 | S |
| 41 | `AddCountersTargetEffect` | effect | 0 | 47 | 25 | 497 | #6, #7 | M |
| 42 | `FilterAnyTarget` | filter | 0 | 0 | 0 | 497 | — | S |
| 43 | `TargetAnyTarget` | target | 0 | 89 | 24 | 521 | #42 | S |
| 44 | `PreventDamageToTargetEffect` | effect | 0 | 32 | 32 | 553 | #7 | L (E1) |
| 45 | `ConditionalOneShotEffect` | condition | 0 | 23 | 23 | 576 | #7 | L |
| 46 | `UntapTargetEffect` | effect | 0 | 32 | 23 | 599 | #7 | M |
| 47 | `TargetControlledCreaturePermanent` | target | 0 | 41 | 23 | 622 | #4 | S |
| 48 | `KickerAbility` | keyword | 0 | 23 | 23 | 645 | — | L |
| 49 | `InvertCondition` | condition | 0 | 1 | 1 | 646 | — | S |
| 50 | `ActivateIfConditionActivatedAbility` | ability-shape | 0 | 22 | 22 | 668 | #49 | M |

### Shape of the top 300

| family | primitives | cards | | difficulty | primitives |
|---|---:|---:|---|---|---:|
| effect | 96 | 2,852 | | S | 109 |
| keyword | 36 | 1,930 | | M | 120 |
| ability-shape | 49 | 1,441 | | L | 69 |
| continuous | 8 | 905 | | ? (no engine source) | 2 |
| target | 31 | 764 | | | |
| filter | 35 | 592 | | **needing a DSL capability first** | **27** |
| mana | 10 | 673 | | of which E3 | 9 |
| cost | 16 | 531 | | E9 | 8 |
| condition | 9 | 199 | | E1 | 7 |
| computed-value | 8 | 130 | | E2 | 3 |

129 of the top 300 have **no dependencies at all** and can be written in any order;
the deepest has 6. The dependency graph is shallow, which is good news — this is a
long list, not a tangled one.

---

## 6. Silent semantic drift, and how the tool detects it

This is the failure mode that produces cards which **look automated and are
wrong**, and the spike named it the worst one available.

Class *renames* and *deletions* break a name-keyed extractor loudly, and they are
rare. What is not rare is a class keeping its name while its body changes — a
trigger condition tightened, a replacement made to apply in one more case. Our
note still says `DamageTargetEffect`, our code still compiles, the card still
resolves, and it is now quietly wrong.

### Measured, not assumed

`engine-index.mjs` stores a sha256 of every engine class's **comment-stripped**
source plus its last-touching commit; `drift.mjs --check` diffs two checkouts.
Comment-stripping matters twice: a reformatted licence header must not raise an
alarm nobody reads twice, and those comments are Wizards' oracle text.

Run for real against `ca8b02d5` (2025-08-19) → `07ecb7cf` (2026-08-17), exactly 12
months, whole engine tree:

| | count | |
|---|---:|---|
| engine classes a year ago | 3,547 | |
| …deleted since | 44 | loud — the extractor breaks |
| …surviving under the same name | 3,503 | |
| **…of those, body changed with no rename** | **379 (10.8%)** | **silent** |
| new engine classes added since | 222 | possible new coverage |

**187 of the 379 silently-changed classes are on this build order.** Including,
by rank: `StaticFilters` (#4), `EntersBattlefieldTriggeredAbility` (#9),
`GainLifeEffect` (#14), `ScryEffect` (#10), `DamageTargetEffect` (#38),
`AddCountersTargetEffect` (#41). These are not obscure corners; they are the
primitives at the very top of the list, and between them thousands of cards.

This is consistent with the spike's 259-of-1,963 (13.2%) over the narrower
`mage/abilities` subtree, and it is now attributable **per primitive** rather than
as a tree-wide percentage.

### How it is made actionable

A wall of 379 rows is noise nobody reads. `drift.mjs --check` triages against
`scripts/coverage/implemented-primitives.json` — the list of primitives we have
actually shipped — and reports three tiers:

- **implemented by us and drifted** → *review every diff; cards may now be wrong.* Exit code 1.
- **on the build order and drifted** → re-read before writing them.
- **neither** → ignore.

`implemented-primitives.json` is `{"primitives": []}` today, which is the honest
state: no verb has yet been written by porting a named XMage primitive. **Adding
to it as verbs ship is what turns drift from information into an alarm.** If it
stays empty while verbs get written, the detector silently reports nothing —
which would be the same class of failure it exists to prevent, one level up.

It cannot tell a cosmetic refactor from a rules correction; that needs a human
reading the diff. Its job is to guarantee the human is **asked**. Ignoring a
CHANGED row becomes a decision someone makes on the record, rather than a thing
that happens by default.

---

## 7. What to do, in order

1. **E9 in the compiler front end.** Not a DSL extension — `ValueExpr` and
   `evalValue` are done. Teach `effect-rules.ts` to emit `{v:'count'}` and friends.
   Cheapest item here by a distance, and 8 of the top 300 primitives are blocked
   on it. (§1.1)
2. **Re-measure AUTOMATED.** §1.2 gives the compiler's number; nobody has measured
   what the engine executes end-to-end. Until that exists, the gap this whole
   programme is closing has no floor. This is the highest-value cheap action on
   the page.
3. **Grind the top 300** in the order in §5, `--rank-by new`. 5,466 new cards,
   109 of them S-band. It is countable, and it can stop when return per primitive
   falls off — that is the point of having the list.
4. **Register every primitive in `implemented-primitives.json` as it ships.** One
   line per verb. Without it §6 is decoration.
5. **E6 (watchers) and E8 (conditional mana)** are the only two of the "cheap four"
   genuinely absent from the DSL: 257 and 34 blocks-alone respectively. Worth
   doing, worth 291 cards, not worth the 1,526 the spike advertised.
6. **Still do not build E2, E7 or E1** on the strength of this. E2 leads the table
   at 1,225 and is CR 613. Nothing measured here overturns
   `RULES-ENGINE-DECISION.md`.
7. **Get real ranked play data.** Still the outstanding item from the spike and
   from `RULES-ENGINE-DECISION.md` §6. Every number here is weighted by
   Commander-legality, which is the best proxy available and is not the same as
   what people play. With real decklists this document becomes decision-grade
   instead of well-founded.

---

## 8. Reproducing this

```bash
git clone --filter=blob:none https://github.com/magefree/mage <outside-this-repo>
git -C <outside-this-repo> checkout 07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d
export XMAGE_ROOT=<outside-this-repo>

node scripts/coverage/engine-index.mjs
node scripts/coverage/extract.mjs
node scripts/coverage/join.mjs
node --experimental-strip-types scripts/coverage/our-coverage.ts
node scripts/coverage/rank.mjs --top 300
```

See `scripts/coverage/README.md`. Working data lands in `scripts/coverage/.data/`,
which is gitignored — **XMage source is never vendored into this repo.**

**Licence.** XMage is MIT, `Copyright (c) 2010 betasteward@gmail.com`, attributed
in `THIRD-PARTY-NOTICES.md`. Only *structure* is read; rules text comes from our
own `cards.oracle_text` via Scryfall, because XMage's `//` comments are Wizards of
the Coast's oracle text and are not XMage's to license. **Forge is GPL-3.0 and was
never cloned, read, or referenced** — this app ships its rules engine to the
browser, which is distribution, and GPL-3.0 would force DeckMatrix's full source
open.
