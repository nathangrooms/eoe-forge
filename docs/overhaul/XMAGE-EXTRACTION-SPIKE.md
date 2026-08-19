# XMage Card-Knowledge Extraction: Measurement Spike

**Status:** Complete · **Date:** 2026-08-19 · **Type:** Throwaway measurement spike, no production code written
**Question asked:** "Maybe we should port those from XMage into Supabase?" — i.e. extract XMage's 32,168 card classes into our database as *data* keyed by `oracle_id`, rather than as code.

**Source measured:** `github.com/magefree/mage` @ `07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d` (2026-08-17), MIT.
Cloned to a temp directory. **Nothing vendored into this repo. No application code edited. Nothing committed.**
**Forge was not cloned, read, or referenced at any point.**

---

## The one-sentence answer

**The extraction works and the licence and the identity join are genuinely fine — but what comes out is a call graph into a 2,558-symbol vocabulary we do not have, so the rows are inert until we build the vocabulary, and building it is a 4–15 person-month project, not a port.**

Build the extractor anyway — but as a **planning instrument** that tells us exactly which 300 primitives to write and in what order, not as a source of automation. That part is 1–2 weeks and it de-risks the DSL work substantially.

---

## 0. Corrections to the brief, before any numbers

Three premises in the task I was given do not hold in this working tree. They change what could and could not be measured, so they go first.

| Premise in the brief | Reality in `C:\Users\natha\DeckMatrix` |
|---|---|
| "Our target shape already exists: the ability DSL in `src/lib/game/abilities/dsl.ts` and `src/lib/cards/abilities/`. Read those FIRST." | **Neither path exists.** There is no `src/` directory. `apps/api`, `apps/worker`, `packages/*`, `infra/` are empty directories; `apps/web/{app,components,lib}` are empty. The entire repo is `package.json`, `turbo.json`, `dm.js` (a 1,670-line built Vite bundle), one doc, and `.claude/launch.json`. **Zero `.ts`/`.tsx` files.** |
| "See `docs/overhaul/RULES-ENGINE-COVERAGE.md`" — 84 automated, 11,205 manual of ~12,000 | **That file does not exist.** The only doc is `RULES-ENGINE-DECISION.md`, which states "across 12,000+ real rows today, 84 cards are automated and 196 are partial". The 11,205 figure is not verifiable here. |
| "Bias the sample toward cards that actually appear in Commander decks — check our cards table for what our users actually play." | The `cards` table is real and healthy (34,088 printings / 33,037 distinct `oracle_id`). But `deck_cards` holds **474 rows across 8 decks**, and the card list is alphabetically clustered (six consecutive `Ajani` cards, ten consecutive `Phyrexian *`, four `Vivid *`, a long unbroken `V…Z` run). **This is a seeded/import fixture, not play data.** I could not bias the sample toward real play from our own data, and any "cards our users play" number below carries that caveat. |

Because no DSL exists to map onto, **I specified the target DSL explicitly** from the description in `RULES-ENGINE-DECISION.md` §4–§5, and every mapping verdict is against that written spec (§3 below). If the real `dsl.ts` differs, the classification shifts — but the corpus-structure and identity-join findings (§2, §5) are independent of it.

---

## 1. What was measured, and how

Four independent measurements, all reproducible from the scripts in the scratch directory:

1. **Corpus structure census** — every one of the 32,168 card `.java` files parsed for lines-of-code, imported engine classes, and bespoke type declarations (`class`/`enum` that is not the card class itself).
2. **DSL mapping** — a gap detector keyed on XMage *engine package paths* run over (a) a hand-picked, difficulty-stratified sample of **133 cards**, (b) the **whole 32,168-card corpus**, (c) the **446 cards** in our `deck_cards` table that resolve to an XMage class.
3. **Identity join** — XMage's 586 set files parsed into 91,873 `(set, name, collector number, class)` rows, joined against our real `cards` table.
4. **Churn** — 12 months of XMage git history (`ca8b02d5` 2025-08-19 → `HEAD` 2026-08-17), net diff.

The detector went through three revisions. v1 and v2 keyed on hand-written class-name lists and produced false "CLEAN" verdicts I caught by hand-auditing (Oketra's Monument, Yarok, Vesuva, Teferi's Protection, Aetherworks Marvel all slipped through). **v3 keys on package paths**, which eliminates that whole error class. All numbers below are v3. The residual error is quantified in §4.

---

## 2. Corpus structure: the finding that decides this

XMage card files are **sharply bimodal**, and the split is almost perfectly predicted by file length.

**Of 32,168 card classes:**

| | count | share |
|---|---:|---:|
| Pure declarative composition (no bespoke class or enum) | 23,455 | **72.9%** |
| Contains ≥1 hand-written class or enum | 8,713 | **27.1%** |

**Bespoke-code rate by file length — this is the cliff:**

| Lines of code | files | contain bespoke Java |
|---|---:|---:|
| 0–45 | 8,654 | **0.0%** |
| 45–60 | 11,319 | **0.3%** |
| 60–80 | 4,961 | **32.8%** |
| 80–120 | 5,357 | **96.6%** |
| 120–200 | 1,751 | **100.0%** |
| 200+ | 126 | **100.0%** |

LOC distribution: p50 = 53, p75 = 75, p90 = 103, p95 = 124, p99 = 171, mean 63.7, max 571.

**Reading:** below ~60 lines a card really is the Lightning Bolt case — pure wiring, trivially extractable. Above ~80 lines it is essentially *always* carrying hand-written Java that is not data in any useful sense. There is almost no middle ground. A ~60-line threshold is a near-perfect, zero-cost triage rule for an extractor.

**What the bespoke 27% is made of** (base types of the 11,383 hand-written declarations):

| base type | count | what it means |
|---|---:|---|
| `OneShotEffect` | 5,681 | arbitrary resolution logic |
| `TriggeredAbilityImpl` | 799 | a trigger shape the engine doesn't have |
| `Condition` | 560 | a bespoke predicate |
| `ReplacementEffectImpl` | 460 | event interception |
| `ContinuousEffectImpl` | 457 | layer-system participation |
| `DynamicValue` | 356 | bespoke board arithmetic |
| `Watcher` | 350 | historical state tracking |
| `ContinuousRuleModifyingEffectImpl` | 219 | rule modification |
| `AsThoughEffectImpl` | 200 | permission modification |
| `CostModificationEffectImpl` | 128 | cost math |

The corpus imports **3,254 distinct `mage.*` classes**. A pure-composition card uses a median of 8 of them (p25 = 5, p75 = 11, p90 = 14, max 32).

---

## 3. The target DSL I measured against

No `dsl.ts` exists, so this is the spec I used, reconstructed from `RULES-ENGINE-DECISION.md` §4 ("turn our closed 7-member effect union into a verb table with parameters, and add a small computed-value expression") and §5 ("No stack, no priority windows, no layer system, no replacement effects").

**The DSL can express:** card frame (types/subtypes/cost/PT/loyalty) · static keyword abilities · mana abilities · triggered abilities on a fixed event vocabulary with optional conditions · activated abilities as cost-list → effect-list · parameterised one-shot effect verbs (damage, draw, gain/lose life, destroy, exile, create token, add counters, boost, bounce, search, sacrifice, discard, scry, tap/untap, counter, mill) · targets and filters · computed values · simple continuous effects (static P/T boosts and keyword grants over a filter).

**The DSL cannot express** — the thirteen capability gaps the detector looks for:

| id | capability |
|---|---|
| E1 | Replacement effects (intercept an event, modify or cancel it) |
| E2 | Layer system (characteristic-setting continuous effects, CR 613) |
| E3 | Rule-modifying / restriction effects ("players can't…") |
| E4 | Cost modification (spells cost more or less) |
| E5 | "As though" permission (play from graveyard/exile, ignore timing) |
| E6 | Watchers (within-turn/game history: spells cast, damage dealt, cards drawn) |
| E7 | Mid-resolution player interaction ("unless that player pays {1}") |
| E8 | Conditional mana |
| E9 | Open computed-value expressions (arbitrary board arithmetic) |
| E10 | The stack (counter / respond to / target a spell) |
| E11 | Copy effects |
| E12 | Alternative / free casting, playing from other zones |
| E13 | Phasing; abilities functioning from outside the battlefield |

---

## 4. How much mapped

### 4.1 The hand-picked difficulty-stratified sample (n = 133)

133 cards spanning eight tiers, deliberately weighted toward hard cases — vanilla creatures through Doubling Season, Rhystic Study, Humility, Smothering Tithe, Aetherflux Reservoir, Dockside Extortionist. **All 133 resolved to an XMage class.**

| | count | share |
|---|---:|---:|
| **CLEAN** — maps with no loss | 83 | **62.4%** |
| **PARTIAL** — core maps, something is lost | 39 | **29.3%** |
| **NONE** — needs the layer system; cannot be meaningfully represented | 11 | **8.3%** |

By tier (CLEAN / PARTIAL / NONE): T1 vanilla 6/0/0 · T2 keyword 12/2/0 · T3 ETB triggers 17/1/0 · T4 instants & sorceries 18/6/0 · T5 activated 14/2/1 · T6 static & continuous 9/9/2 · T7 replacement 4/7/3 · T8 genuinely hard 3/12/5.

The gradient is the point: **the first five tiers are 67/79 = 85% CLEAN; the last three are 16/54 = 30%.** Difficulty is not smoothly distributed — it is concentrated exactly in the static, continuous and replacement-effect cards, which is where Commander's format-defining permanents live.

**Honest error bar on that 62.4%.** I hand-audited all 83 CLEAN verdicts. 70 are pure declarative composition (high confidence). 13 still contain bespoke Java the package detector did not flag, and of those **at least four are genuinely false CLEANs**: Permeating Mass (becomes-a-copy, E11), Phyrexian Vindicator (damage prevention, E1), Oreskos Explorer (bespoke computed value, E9), Plaguecrafter (per-player conditional choice, E7). Urza's Saga is borderline (grants an activated ability to itself). **So the true CLEAN figure is ~59% (79/133), and every CLEAN number in this document should be read as an upper bound with roughly a 5% optimistic bias.**

**Selected verdicts on the named hard cards:**

| card | verdict | what is lost |
|---|---|---|
| Doubling Season | PARTIAL | E1 — the doubling is a replacement on CREATE_TOKEN / ADD_COUNTERS events |
| Rhystic Study | PARTIAL | E7 — "unless that player pays {1}" is a live negotiation mid-resolution |
| Smothering Tithe | PARTIAL | E7 — same shape, opponent may pay {2} |
| Aetherflux Reservoir | PARTIAL | E6 + E9 — needs a spells-cast-this-turn watcher and a computed value |
| Dockside Extortionist | PARTIAL | E9 — X = artifacts + enchantments **opponents** control; a bespoke `DynamicValue` enum |
| Humility | **NONE** | E2 — removes all abilities in layer 6, sets base P/T in layer 7b |
| Teferi's Protection | **NONE** | E2 + E13 — phasing, life-total lock, protection from everything |
| Cavern of Souls | PARTIAL | E3 + E6 + E8 — conditional mana that also makes a spell uncounterable |
| Agatha's Soul Cauldron | **NONE** | E2 + E5 |
| Torbran, Thane of Red Fell | PARTIAL | E1 — damage-amount replacement |
| Panharmonicon | PARTIAL | E1 |

### 4.2 The whole corpus (n = 32,168) — this is a census, not an extrapolation

| | count | share |
|---|---:|---:|
| CLEAN with zero DSL extensions | 24,435 | **76.0%** |
| Needs ≥1 extension | 7,733 | 24.0% |

The stratified sample scores *worse* (62.4%) than the corpus (76.0%), exactly as intended — the sample was deliberately weighted toward hard cards. The two are consistent.

### 4.3 The cards in our `deck_cards` table (n = 446 of 458 resolved)

324 CLEAN = **72.6%**. Treat this as indicative only — see §0, this is fixture data, not play data.

---

## 5. Which DSL extensions buy the most — the most valuable output

Greedy ordering by **marginal cards converted from PARTIAL/NONE to CLEAN**, measured across the full 32,168-card corpus:

| # | extension | marginal cards | cumulative CLEAN |
|---:|---|---:|---:|
| — | *(base DSL as specified)* | — | 24,435 (76.0%) |
| 1 | **E2 layer system** | +1,949 | 26,384 (82.0%) |
| 2 | **E7 mid-resolution interaction** | +1,307 | 27,691 (86.1%) |
| 3 | **E6 watchers** | +693 | 28,384 (88.2%) |
| 4 | **E1 replacement effects** | +587 | 28,971 (90.1%) |
| 5 | **E10 the stack** | +599 | 29,570 (91.9%) |
| 6 | **E4 cost modification** | +570 | 30,140 (93.7%) |
| 7 | **E12 alternative / free casting** | +508 | 30,648 (95.3%) |
| 8 | **E3 restriction effects** | +389 | 31,037 (96.5%) |
| 9 | **E9 open computed values** | +344 | 31,381 (97.6%) |
| 10 | **E11 copy effects** | +277 | 31,658 (98.4%) |
| 11 | **E5 "as though" permission** | +268 | 31,926 (99.2%) |
| 12 | **E8 conditional mana** | +169 | 32,095 (99.8%) |
| 13 | **E13 phasing / out-of-zone** | +73 | 32,168 (100.0%) |

**A caution on reading that table: greedy gains are order-dependent and do not add up.** Each row is the marginal gain *given everything above it is already built*. The decision-relevant figure is what an extension buys **built alone**, which is smaller. Measured directly:

| extension, built alone | cards gained | coverage points |
|---|---:|---:|
| E2 layer system | +1,949 | **+6.06** |
| E7 mid-resolution interaction | +1,222 | +3.80 |
| E1 replacement effects | +440 | +1.37 |
| **E9 + E6 + E4 + E8 together** | **+1,526** | **+4.74** (76.0% → 80.7%) |

**Now read the cost, not just the gain.** The top three entries are not "DSL extensions" in any modest sense:

- **E2 (layer system)** is CR 613 — the single hardest subsystem in Magic, and the one `RULES-ENGINE-DECISION.md` §5 explicitly rules out forever. It buys 6.1 points.
- **E7 (mid-resolution interaction)** requires priority windows and a prompt protocol — precisely the "board rewrite from action emitter into server-prompt renderer" the decision doc costed at *months*. It buys 3.8 points.
- **E1 (replacement effects)** requires an event bus with interception, i.e. rebuilding the spine of the engine. Built alone it buys **1.4 points** — far less than its greedy-table position suggests.

**The cheap, genuinely additive ones are further down the list**: E9 (open computed values), E6 (watchers), E4 (cost modification), E8 (conditional mana). E9 in particular is already the named next step in `RULES-ENGINE-DECISION.md` §4 ("a small computed-value expression so one verb covers 'X equals the number of creatures you control'"), and it is a prerequisite for correctly representing a large share of the CLEAN set's parameters.

**Best value-per-unit-of-work, in my judgement: E9 → E6 → E4 → E8.** Together **+1,526 cards, 76.0% → 80.7%**, without touching the stack, the layers, or priority. That is 78% of what the layer system alone would buy, for a small fraction of the work — and it is the only group on this list that does not require rebuilding the engine.

---

## 6. The number that actually decides this

Coverage percentages are misleading because "CLEAN" only means *the card's shape fits the DSL*. It still has to be **executed**, and execution means implementing the XMage primitives it composes.

**The 24,435 CLEAN cards compose 2,558 distinct engine primitives.**

| implement top N primitives | CLEAN cards fully covered | as share of all 32,168 |
|---:|---:|---:|
| 50 | 2,185 (8.9%) | 6.8% |
| 100 | 4,502 (18.4%) | 14.0% |
| 200 | 8,472 (34.7%) | 26.3% |
| **300** | **11,424 (46.8%)** | **35.5%** |
| 400 | 13,417 (54.9%) | 41.7% |
| 600 | 16,616 (68.0%) | 51.7% |
| 800 | 18,856 (77.2%) | 58.6% |
| 1,000 | 20,563 (84.2%) | 63.9% |
| 1,500 | 22,950 (93.9%) | 71.3% |
| 2,558 | 24,435 (100%) | 76.0% |

For the 324 CLEAN cards in our `deck_cards` table: **503 distinct primitives**; the top 300 cover 195 of them (60.2%).

**This is the whole finding.** The distribution has a very long tail. There is no small vocabulary that unlocks most cards. `RULES-ENGINE-DECISION.md` §1 said of Forge's card scripts: *"At the end of that weekend you are holding arguments to functions you still have to write."* **That verdict holds identically for XMage.** The difference between the two projects is purely legal — MIT lets us do it, GPL-3.0 does not. It is not architectural. XMage's cards are more declarative than Forge's, and it does not help nearly as much as it sounds like it should.

---

## 7. Risks, measured

### 7.1 Identity join: XMage name/set → our `oracle_id` — **reliable**

XMage side: 586 set files → 585 set codes, 91,873 `SetCardInfo` rows, **32,328 distinct card names**, 32,335 distinct card classes.
Our side: 34,088 printings, **33,037 distinct `oracle_id`**, 303 set codes.

| test | result |
|---|---|
| Our `oracle_id`s in sets XMage knows | **32,890 / 33,037 = 99.6%** |
| Our set codes XMage knows | 286 / 303 = 94.4% |
| **Name match, random 1/27 hash sample of our distinct-per-oracle names (n = 1,219)** | 1,149 exact + 6 diacritic-fold + 26 front-face-of-DFC = **1,181 = 96.9%** |
| Name match, all distinct names in `deck_cards` (n = 458) | 445 exact + 4 front-face = **449 = 98.0%** |

**The 38 catalogue misses, classified by set — every one is a known, excludable category:**

| category | n | sets |
|---|---:|---|
| Un-sets / silver-border (not Commander-legal) | 15 | UNF 8, UNH 3, UST 3, SUNF 1 |
| Alchemy `A-` rebalanced (digital-only, not paper) | 7 | KHM 2, TDM, DMU, HBG, NEO, SNC |
| Very recent sets (Marvel) | 5 | MSC 4, MSH 1 |
| Conspiracy draft-matters cards | 4 | CN2 3, CNS 1 |
| Other recent / digital | 6 | MBC 2, YEOE, YSNC, HOB, PIO-adjacent |
| Genuinely missing old paper card | **1** | Quarum Trench Gnomes (LEG) |

Excluding Un-sets and Alchemy — 22 cards, none of which are legal paper Commander cards — the match rate is **16 misses in 1,197 = 98.7%**.

**Two mechanical fixes, both cheap:**
- **Diacritics.** XMage strips them: Scryfall `Barad-dûr` vs XMage `Barad-dur`. Only **93 of 33,037 oracle_ids (0.28%)** have non-ASCII names; an NFD-fold-and-strip normalisation resolves them entirely. Verified — the fold rescued 6 of 1,219 in the sample.
- **Double-faced cards.** Match our `A // B` against XMage's front-face `A`. Verified — rescued 26 of 1,219.

**Verdict: the join is not a risk.** Join on folded name, verify with `(set_code, collector_number)`, and exclude Un-sets and `A-` Alchemy printings up front.

### 7.2 Mechanical vs human judgement

| | share of corpus | judgement needed |
|---|---:|---|
| Files < 60 LOC with no bespoke type | ~62% | **None.** Pure mechanical extraction. The 0.0%/0.3% bespoke rate below 60 LOC makes this a safe automatic tier. |
| Files 60–80 LOC | 15.4% | **Triage.** One-third carry bespoke Java; needs a per-card look. |
| Files > 80 LOC | 22.5% | **Human on every card.** 96.6–100% carry bespoke Java. |

So roughly **62% mechanical, 15% triage, 23% hand-written** — and the 23% is where all the cards people actually build decks around live.

There is a second, subtler judgement cost: even a "mechanically extracted" row is only as good as the primitive it names. Deciding that our `damage(target, n)` verb is *semantically identical* to XMage's `DamageTargetEffect(n)` — including its interaction with prevention, redirection, and doubling — is a human call, made 2,558 times.

### 7.3 What breaks when XMage refactors — **less than feared, but silently**

Net diff over exactly 12 months (`ca8b02d5` 2025-08-19 → `HEAD` 2026-08-17), 3,301 commits total:

| | added | deleted | modified | renamed |
|---|---:|---:|---:|---:|
| Card files (`Mage.Sets/src/mage/cards`) | 2,238 | 366 | 2,464 | 7 |
| Engine abilities (`Mage/src/main/java/mage/abilities`, 1,963 files today) | 93 | 11 | **259** | 1 |

**The good news, and it directly answers "has to scale with new cards coming in too":** XMage's community added **2,238 new card implementations in 12 months** — comfortably ahead of Wizards' release schedule. Upstream really does keep up. 2,716 of 3,301 commits touched card files.

**The bad news is the shape of the risk, not its size.** Hard breakage is rare: **11 deletions and 1 rename** in the engine ability tree all year (0.6%). An extractor keyed on class names would fail loudly ~12 times a year — trivially manageable.

The real exposure is **259 engine ability files modified (13.2% of the tree) with no name change.** Those are semantic corrections — a trigger condition tightened, a replacement made to apply in one more case. **A name-keyed extractor sees nothing.** Our stored row still says `DamageTargetEffect(3)` and still looks right, while its meaning upstream has moved. Combined with 2,464 modified card files (7.7% of the corpus re-touched annually), the maintenance posture is a **continuous re-extraction and diff pipeline**, not a one-off import. That is an ongoing cost, forever, and it is the honest reason to treat this as a project rather than a script.

This also collides with `RULES-ENGINE-DECISION.md` §4's own discipline: *"never silently do nothing… 'Partial' has to stay a loud, visible state."* Silent semantic drift is precisely the failure mode that doc names as the worst one.

### 7.4 Licensing

MIT, single `LICENSE.txt` at the repo root, `Copyright (c) 2010 betasteward@gmail.com`. Extraction into our database is permitted commercially **provided we carry the copyright notice and licence text** — which means adding a `THIRD-PARTY-NOTICES.md` (referenced in the brief, but **it does not currently exist in this repo**).

One nuance worth recording: the `//` comment lines in XMage card files are **Wizards of the Coast's oracle text**, which XMage cannot license to us. Do not extract those comments. We already hold that text legitimately via Scryfall — take rules text from our own `cards.oracle_text` and take only *structure* from XMage. This is the same discipline `RULES-ENGINE-DECISION.md` §1 set out for Forge, and it applies here unchanged.

---

## 8. Verdict

### Is it worth building?

**Not as an automation source. Yes as a planning instrument — and that part is cheap.**

The owner's instinct was **half right, and the right half is the surprising one.** The card knowledge genuinely is extractable, the licence genuinely does permit it, the identity join genuinely does work at 97–99%, and upstream genuinely does keep pace with new sets. All four of those were real risks going in and all four came back clean. That is a better result than the Forge analysis would have predicted.

It fails on the fifth thing: **the extracted data is inert without a 2,558-symbol runtime we do not have, and no small subset of that vocabulary unlocks a useful majority of cards.**

### What it would cost

| piece | estimate | confidence |
|---|---|---|
| Extraction harness (parse Java, resolve set files, fold names, join `oracle_id`, emit JSON) | **1–2 weeks** | **High** — I built a working structural extractor over all 32,168 files during this spike, in hours. |
| Schema, storage, provenance, review UI | 1–2 weeks | Medium |
| Implementing the top ~300 primitives (with tests and rules edge cases, 0.25–1 day each) | **4–15 person-months** | Low–medium; this is the whole project and the range is wide because primitive difficulty is wildly uneven |
| Ongoing re-extraction + semantic-drift diffing | continuous | ~2,500 card files and ~260 engine files change per year |

**Total to reach ~35% catalogue coverage: roughly 5–17 person-months.**

### What the resulting coverage would be

Stated in the form the brief asked for, with assumptions labelled:

> **Implementing the top ~300 XMage primitives would automate roughly 11,400 of the 32,168 cards XMage implements — about 35% of the catalogue, or roughly 11,000 of our 33,037 `oracle_id`s after the 96.9% join rate — up from 84 automated cards today.**

Assumptions, stated: (a) "automated" means the card's full ability text is executable, not partially; (b) the 96.9% join rate carries; (c) the CLEAN classification is an **upper bound with ~5% optimistic bias** (§4.1), so read this as *~33%, not 35%*; (d) it assumes all 300 primitives are implemented correctly, which is the entire cost and is not de-risked by this spike.

For the cards in our `deck_cards` table — **the weakest number here, because that table is fixture data, not play data (§0)** — the same 300 primitives would cover 195 of 446, about 44%.

### The recommendation

1. **Build the extractor now. Two weeks, throwaway-able.** Not to populate a `card_abilities` table, but to produce **a ranked, dependency-ordered specification of which primitives to implement**, verified against 32,168 real cards. Today the DSL roadmap is guesswork; after this it is a checklist with a coverage number attached to every line. That is worth two weeks on its own and it is useful whatever we decide next.
2. **Use the <60-LOC rule as the triage boundary.** 0.0–0.3% of those files contain bespoke Java. That is a free, high-precision automatic tier covering ~62% of the corpus.
3. **Build E9 (computed values), then E6 (watchers), then E4 (cost modification), then E8 (conditional mana).** **+1,526 cards, 76.0% → 80.7%**, without touching the stack, the layers, or priority. E9 is already the next step named in `RULES-ENGINE-DECISION.md` §4; this spike confirms it and sizes it.
4. **Do not build E2 (layers), E7 (priority/interaction), or E1 (replacement) on the strength of this.** They top the marginal-gain table and they are each a rules engine. Built alone they are worth **+6.1, +3.8 and +1.4 coverage points** — and the four cheap extensions above deliver +4.7 between them. `RULES-ENGINE-DECISION.md` already ruled these three out and **nothing measured here overturns that.**
5. **Fix the premises before the next decision.** No `dsl.ts` exists in this tree, no coverage doc exists, no `THIRD-PARTY-NOTICES.md` exists, and `deck_cards` holds fixture data. The single highest-value cheap action remains the one `RULES-ENGINE-DECISION.md` §6 already named and which still has not been done: **get real ranked play data.** Every coverage number in this document would become decision-grade instead of indicative, and it is an afternoon's work.

### The negative result, stated plainly

**"Port XMage's cards into Supabase" is not a port.** It is a database of function calls into an engine we would then have to write, and the engine is 2,558 functions long with a very flat tail. The extraction is the easy 10%. Anyone who reads "32,168 declarative card definitions, MIT licensed" and pictures a weekend import — as I partly did going in — should read §6 first.

---

## Appendix: reproducibility

Scripts in `%LOCALAPPDATA%\Temp\claude\xmage-spike\` (scratch, not in this repo):

| script | produces |
|---|---|
| `census.py`, `census3.py` | corpus structure, bespoke-code census (§2) |
| `idmap.py` | 91,873-row identity map from XMage set files (§7.1) |
| `extract.py` | structural summary of the 133-card sample |
| `gaps3.py` | package-keyed DSL gap detector; sample / corpus / played (§4, §5) |
| `primcost.py` | primitive coverage curve (§6) |
| `sample_cards.txt` | the 133-card stratified sample, by tier |

XMage source: `github.com/magefree/mage` @ `07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d`, shallow sparse clone in a temp directory. Delete when done. **Forge was never cloned or read.**
