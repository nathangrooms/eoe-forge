# ONE ENGINE — survey and proposal

**Status:** Survey complete, nothing built · **Date:** 2026-08-19 · **Scope:** scoring, card evaluation, recommendation, and every consumer of them

> This is the map that has to exist before the refactor starts. It is a survey, not a change.
> Every line count and every claim below was read out of the working tree today. Where the
> briefing that commissioned this work was wrong, it is corrected here rather than repeated.

---

## 0. Read this first: the survey was run against a different directory than assigned

The task arrived with a working directory of `C:\Users\natha\DeckMatrix`. That directory is
**an empty Turborepo scaffold** — 18 files, and every one of `apps/api`, `apps/web`,
`apps/worker`, `packages/*` is an empty folder tree with no source in it. It is not a git
repository. The only substantive things in it are a stale 2.6 MB minified `dm.js` build
bundle and a copy of `scripts/vision/`.

`CLAUDE.md` in the real repo already names it, in a section titled *Dead ends — ignore these,
they are NOT the project*:

> `C:\Users\natha\DeckMatrix` — abandoned empty Turborepo scaffold (2 files, all dirs empty)

**The survey below was therefore run against `C:\Users\natha\Desktop\Software\Deckmatrix`**,
which `CLAUDE.md` names as the working repo: 643 files under `src/`, 19 edge functions, git
history with commits dated today. Every path in this document is relative to that root.

Nothing was edited. This file is the only thing written.

---

## 1. Deck power / score / rating

### 1.1 What is live

| # | Path | Lines | Status | Notes |
|---|---|---:|---|---|
| 1 | `src/lib/deck/power.ts` | 820 | **Canonical** | The single client-side producer. Owns `POWER_BANDS`, `bandForScore`, staleness via `deckListHash`. |
| 2 | `src/lib/deckbuilder/score/edh-power-calculator.ts` | 413 | Engine under #1 | Nine weighted subscores → logistic → 1–10. Deliberately not re-exported. |
| 3 | `src/lib/deckbuilder/score/features.ts` | 578 | Feature extraction for #2 | Reads four curated catalogues. |
| 4 | `src/lib/deckbuilder/score/coach.ts` | 382 | Advice from #2's subscores | Also called directly by `power.ts:606`. |
| 5 | `src/lib/deckbuilder/score/universal-scorer.ts` | 117 | **Adapter only** | Was a rival model; now delegates to `computeDeckPower`. Header documents the three defects removed. |
| 6 | `supabase/functions/edh-power-check/index.ts` | 429 | **LIVE SCRAPER** | Regex-scrapes edhpowerlevel.com. The real remaining divergence. |
| 7 | `supabase/functions/calculate-deck-power/index.ts` | 55 | **RETIRED — returns 410** | Kept as a tombstone so deploying removes the divergent scorer rather than leaving the last build serving. |
| 8 | `src/components/deck/PowerScore.tsx` | 641 | Sole display component | Refuses to render a stale score as current. |

### 1.2 Corrections to the briefing

The briefing described a disease that has **already been substantially treated**. Repeating
its claims as current would be its own kind of fabrication, so:

- **"NINE competing power implementations"** — historical. Today there is one client model
  (#2, behind #1), one retired 410 endpoint (#7), and one live scraper (#6).
- **"The number displayed to users was SCRAPED"** — no longer true on the main path.
  `deckAPI.ts:112` normalises every `DeckSummary.power` through `deckPowerFromSummary`, and
  the 26 importers of `@/lib/deck/power` listed in §4.1 all read that. The scrape survives at
  three call sites only (§4.2).
- **"PowerLevelConsistency reported 35-39/100 for every deck"** — the component no longer
  exists. The string appears only in `src/data/auditFindings.json`, which is the frozen record
  of the 2026-08-18 audit.
- **"truncated at 100 cards"** — wrong mechanism. `edh-power-check` caps the *request URL* at
  `MAX_LEN = 7000` characters and pops cards off the tail until it fits. A 99-card commander
  list encodes well under that, so this rarely fires. The real scrape failure modes are the
  four listed in `playability.ts:1-24`: `NaN%` rows, markup changes, and the round trip itself.
- **`combatUi.ts`** — no such file. `src/components/play/combatUi.test.ts` exists; the
  implementation does not carry that name.

**What is still genuinely wrong** is #6, and one thing the briefing did not mention, which is
worse — see §2.1.

### 1.3 Not deck power, do not merge

`src/components/tournament/scoring.ts` computes Swiss points and tiebreakers. Same word,
different domain. It stays where it is.

---

## 2. Card evaluation

### 2.1 The finding that matters most: two playability implementations, and the wrong one feeds the score

| Path | Lines | Method | Who uses it |
|---|---:|---|---|
| `src/lib/deck/playability.ts` | **1061** | **Exact.** Multivariate hypergeometric with Hall's marriage condition, so `{U}{U}` is correctly not satisfied by one dual. | Deck page, optimiser panel display |
| `src/lib/deckbuilder/score/simulation.ts` | 198 | **Approximate.** 10,000-iteration Monte Carlo, LCG `state * 1103515245 + 12345`. | `edh-power-calculator.ts:160,163` → **the power score** |

This is the structural defect underneath the owner's "fix power score and optimiser they work
hand in hand". The exact engine the briefing correctly says to use is **not** the one the power
score is computed from. `EDHPowerCalculator` calls `PlayabilitySimulator.simulatePlayability`,
a separate approximation that models colour requirements by sampling rather than by Hall's
condition. So:

- The playability a user reads on the deck page is exact.
- The playability folded into the power score they read beside it is a simulation.
- They can disagree, and nothing reconciles them.

**The single highest-value change in this whole programme is pointing `edh-power-calculator`
at `playability.ts` and deleting `simulation.ts`.** It removes a duplicate, it makes
playability *drive* the score rather than decorate it, and it needs no new data.

`src/lib/deck/playabilityView.ts` (426) is the presentation layer over the exact engine —
bands, `hardestToCast`, `colourSourceReadout`. It is correctly separated and should stay.

### 2.2 Tags

| Path | Lines | Role |
|---|---:|---|
| `src/lib/cards/tagger.ts` | 815 | **Authoritative.** `TAG_RULES`, `ALL_TAGS`, `deriveCardTags`, `normalizeOracleText`. Oracle-text matchers. |
| `src/lib/cards/tag-signal.ts` | 324 | IDF weighting over tags, `ALIAS_TAGS` so one idea is not scored three times. |
| `src/lib/deckbuilder/tagger/universal-tagger.ts` | 339 | Secondary. Header defers to `tagger.ts` as the authority. |
| `src/lib/cards/abilities/` (7 files) | ~2,000 | Compiled abilities DSL for play mode. Separate concern, correctly separate. |

`tagger.ts` is also mirrored into Postgres as `public.derive_card_tags`
(`scryfall-sync/index.ts:179`), which is a **third** copy of the rules living in SQL. That one
has no parity test.

### 2.3 Synergy — two implementations, both nearly unused

| Path | Lines | Consumers |
|---|---:|---|
| `src/lib/synergy/` (7 files) | **2,105** | **Zero.** Referenced only in comments in `src/data/precon-corpus.ts`. |
| `src/lib/magic/synergy.ts` | 700 | One: `EnhancedDeckAnalysis.tsx:42` |

2,105 lines of association-rule mining with a 661-line self-test, wired to nothing. It is the
most sophisticated card-evaluation code in the repo and no user has ever seen its output.

### 2.4 Curve, colour identity, legality

| Concern | Implementations | Lines |
|---|---|---:|
| Curve | `src/lib/deck/curve.ts` (55), `src/lib/magic/mana-curve.ts` (376), `src/lib/deckbuilder/mana-curve-optimizer.ts` (251), plus curve maths inline in `rank.ts`, `features.ts`, `coach.ts` | ~680 + inline |
| Colour identity | `src/lib/deckbuilder/color-identity-calculator.ts` (77), `color-compatibility.ts` (170), `withinIdentity` in `recommend/query.ts`, `normalizeIdentity` in the optimizer, plus the audit's finding of **32 files** hand-rolling identity display | 247 + scattered |
| Legality | `src/lib/deckbuilder/legality-checker.ts` (415), `src/lib/deckbuilder/rules/formats.ts` (143), `src/lib/magic/formats.ts` (398), `src/lib/deck/formats.ts` (62), `isLegalIn` in `recommend/query.ts` | 1,018 + inline |

Legality is the worst of the three: four format-rule modules with overlapping tables.
`recommend/query.ts` is the only one that is pure and dependency-injected.

### 2.5 Unreferenced modules — verified, not assumed

`CLAUDE.md` warns that an earlier sweep deleted ten components that were genuinely in use.
So each of these was checked by exported symbol name across `src/` and `supabase/`, not by
import path alone:

| Path | Lines | Refs |
|---|---:|---:|
| `src/lib/deckbuilder/color-identity-calculator.ts` | 77 | 0 |
| `src/lib/deckbuilder/color-compatibility.ts` | 170 | 0 |
| `src/lib/deckbuilder/mana-curve-optimizer.ts` | 251 | 0 |
| `src/lib/deckbuilder/archetype-detector.ts` | 375 | 0 |
| `src/lib/deckbuilder/ai-guided-builder.ts` | 189 | 0 |
| `src/lib/deckbuilder/index.ts` (the barrel) | 34 | 0 |
| `src/lib/synergy/` | 2,105 | 0 |

**Total 3,201 lines with no live consumer.** Flagged, not deleted. Deletion is a separate
decision and needs its own verification pass.

---

## 3. Recommendation, candidate selection, cut and swap

### 3.1 The pure engine — the model for everything else

`src/lib/deck/recommend/` is already what the whole engine should look like. It is pure,
dependency-injected via a `CandidateSource` callback, and tested with fixtures and no network.

| File | Lines | Responsibility |
|---|---:|---|
| `types.ts` | 142 | `Role`, `Signal`, `Recommendation`, `ROLES` |
| `roles.ts` | 127 | `servesRole` — role vocabulary checked against `ALL_TAGS` |
| `profile.ts` | 112 | `deriveDeckProfile`, `roleShortfall` |
| `query.ts` | 288 | `buildCandidateQuery`, `isLegalIn`, `withinIdentity`, `normalizeRow` |
| `rank.ts` | 293 | `rankCandidates`. Weights: roleGap 3.0, tagSynergy 2.0, curveFit 1.0, budgetFit 1.0 |
| `index.ts` | 74 | `recommend()` — the entry point |
| **Tests** | 822 | `recommend.test.ts` 512, `engine-parity.test.ts` 140, `land-rules` 122, `cut-rules` 103, `land-repeat` 85 |

`rank.ts` gets the order of operations right and asserts it: *eligible → score the whole pool
→ sort → then truncate*. Hard filters run twice, in SQL and again in the ranker, deliberately,
because "an illegal suggestion is worse than no suggestion".

**Playability is not one of its four weights.** That is the gap between this engine and the
owner's directive.

### 3.2 Cut and swap selection

| Path | Lines | Notes |
|---|---:|---|
| `supabase/functions/deck-optimizer/swap-targets.ts` | 218 | `collectCastability`, `chooseSwapTargets` |
| `supabase/functions/deck-optimizer/validate.ts` | 285 | Refuses a cut naming the commander, or a card not in the deck |
| `supabase/functions/deck-optimizer/catalog.ts` | 396 | `normalizeName`, catalogue lookup |
| `supabase/functions/deck-optimizer/index.ts` | **1,691** | Orchestrator: engine sections, then a grounded AI prompt |

**Castability is passed in, not computed.** `index.ts:355` reads it from
`input.edhAnalysis` — a payload the *client* sends. The optimiser cannot compute playability
itself, so if the client omits it the optimiser cuts blind. To its credit it handles this
honestly: `index.ts:1362` instructs the model that *"a card with no castability figure is
UNMEASURED, not weak"*.

That is the seam where playability must become first-class. Today it is an optional input to a
prompt; it needs to be a computed, ranked reason to cut.

### 3.3 Deck generation — three implementations, one of them lying

| Path | Lines | Status |
|---|---:|---|
| `src/lib/deckbuilder/build.ts` (`UniversalDeckBuilder`) | 751 | **Dead.** Only reachable from `ai-guided-builder.ts` (dead) and `index.ts` (dead barrel). |
| `supabase/functions/ai-deck-builder/index.ts` | 1,395 | Live, invoked by `DeterministicAIBuilder.tsx:61` |
| `supabase/functions/ai-deck-builder-v2/builder-orchestrator.ts` | 965 | Live, invoked via `AIBuilder.tsx:394` |

`builder-orchestrator.ts` opens with:

```
// This properly uses the UniversalDeckBuilder with AI planning integration
```

It does not. Its only import is `import type { Card, BuildContext, BuildResult } from './types.ts'`
— types, erased at runtime. Four lines below, the file admits it: *"We need to inline critical
logic since we can't import from src/"*. So the comment claims an integration that the next
comment contradicts, and 965 lines of reimplemented build logic sit between them.

This is exactly the defect class the briefing named: **a comment claiming something that does
not exist.** It is also the strongest single argument for the generated-vendoring approach in
§6, because this is what the alternative produces.

---

## 4. Consumers — the half that a refactor misses

### 4.1 `@/lib/deck/power` — 26 importers

**Pages (7):** `AIBuilder`, `DeckBuilder`, `DeckInterface`, `Decks`, `PublicDeck`, plus
`DeckAnalysis` and `Homepage` transitively.

**Components (14):** `deck/PowerScore`, `ai-builder/ConfigureStage`,
`collection/CollectionDeckRecommendations`, `collection/FavoriteDecksPreview`,
`dashboard/RecentDecks`, and nine under `deck-builder/` — `AIGeneratedDeckList`,
`AIOptimizerPanel`, `ArchetypeLibrary`, `BrainAnalysis`, `CommanderPowerDisplay`,
`ComprehensiveAnalytics`, `DeckAnalysisView`, `EdhAnalysisPanel`, `LandEnhancerUX`,
`PowerSliderCoaching`.

**Hooks and libs (5):** `features/dashboard/hooks`, `hooks/useDashboardCache`,
`hooks/useDeckPowerBackfill`, `lib/api/deckAPI`, `lib/deckbuilder/score/universal-scorer`,
`lib/magic/knowledge-base`.

This is the success case. One accessor, 26 consumers, no private calculations. **The rest of
the engine should be migrated to look like this.**

### 4.2 The scraper's three call sites

| Caller | Line | What it does |
|---|---:|---|
| `src/pages/AIBuilder.tsx` | 479 | Post-build gate: errors if scraped power is below target − 1 |
| `src/pages/AIBuilder.tsx` | 759 | Second invocation |
| `src/pages/DeckBuilder.tsx` | 467 | Overwrites the displayed level with the scraped one |

`DeckBuilder.tsx:455-465` **duplicates the edge function's URL-building** — the same
`MAX_LEN`, `sentinel`, `limitedParts` pop-loop — then sends the URL it built to the function
that would have built it. Two copies of one encoder, in two languages, in two places.

### 4.3 The recommendation engine has no browser consumer

`grep` for any import of `deck/recommend` outside its own directory returns **nothing** in
`src/`. Its only consumers are inside the edge function, through the vendored copy:
`deck-optimizer/index.ts:80`, `swap-targets.ts:52`, `validate.ts:45`, `catalog.ts:30`.

So the purest, best-tested engine in the repo is invisible to the app. Smart suggestions in the
browser do not use it.

There is one reverse dependency worth noting: `src/lib/deck/recommend/cut-rules.test.ts:36`
imports `normalizeName` **from** `supabase/functions/deck-optimizer/catalog.ts`. A test in
`src/` reaching into an edge function is backwards, and it means `catalog.ts` is de facto
shared code living in the wrong tree.

### 4.4 Edge function invocations, all 22 sites

| Function | Calls | Callers |
|---|---:|---|
| `mtg-brain` | 7 | `AIAnalysisPanel:125`, `BrainAnalysis:288`, `EnhancedDeckAnalysis:145`, `ScanInsightsHelper:50`, `AITemplateRecommendations:47`, `AIBuilder:235`, `Brain:404` |
| `scryfall-sync` | 3 | `AdminPanel:74`, `SyncDashboard:83,224` |
| `edh-power-check` | 3 | `AIBuilder:479,759`, `DeckBuilder:467` |
| `deck-optimizer` | 2 | `AIOptimizerPanel:374,748` |
| `ai-deck-builder` | 1 | `DeterministicAIBuilder:61` |
| `ai-deck-builder-v2` | 1 | `AIBuilder:394` |
| others | 5 | scan, price capture, sync tests |
| **`calculate-deck-power`** | **0** | Retired. No caller anywhere. |
| **`gemini-deck-coach`** | **0** | 1,360 lines, deployed, never invoked from `src/` |

`gemini-deck-coach` is a second orphan: 1,360 lines of deployed advice-generation with no
client caller. Same category as `calculate-deck-power` was before it was retired.

### 4.5 Consumers that will need the engine but do not have it

- **Play-mode bot** — `src/lib/game/bot.ts:78,113,144,392` carries its own inline heuristics
  ("Rough 'is this worth casting' score"). Not owned by this work (`src/lib/game/**` is
  another agent's), so it must be served by a *published interface*, not by edits.
- **MTG Brain** — `mtg-brain/index.ts:442` interpolates `deckContext.power?.score` into a
  prompt. It consumes a score the client computed and passed in; it has no engine access.
- **Card search** — `src/lib/cards/local-filter.ts:126` reads `card.edhrec_rank` and `:125`
  reads `card.released_at`. **Neither column exists** (§5.2). The sort silently does nothing.

---

## 5. Duplication between `src/` and `supabase/functions/**/_engine/`

### 5.1 How the vendoring works today — and it works

`src/lib/deck/recommend/vendor-engine.mjs` (154 lines) copies seven modules into
`supabase/functions/deck-optimizer/_engine/` and *generates* an eighth.

Its header states the three options and why it took the third: move the shared code (rejected —
collides with other agents' live edits), reimplement in SQL (rejected — two rules drifting
silently), or **copy and make drift a failing test**.

Seven files are copied **byte-identically**, which is only possible because the sources already
use explicit `.ts` specifiers and `_engine/` preserves every relative path.

`tagger.ts` is the exception. The edge function never tags a card — `cards.tags` is already
populated — and needs `tagger.ts` for exactly two fields, `.tag` and `.also`, so `tag-signal.ts`
can derive `ALIAS_TAGS`. So `renderTaggerShim()` emits those two fields only, dropping 34 KB of
unreachable regex.

`engine-parity.test.ts` (140 lines) enforces it with four checks:
1. each of the seven is byte-identical to source;
2. the generated tagger matches a **fresh render** of the live `TAG_RULES`;
3. tag names and the derived alias set are deepEqual;
4. **no file under `_engine/` imports anything outside `_engine/`** — anchored to line start so
   it does not match the word "from" inside oracle-text regexes.

**Measured today: no drift.** All seven `cmp` clean, and the parity suite is green:

```
# tests 10  # pass 10  # fail 0
```

The briefing said this test "has already failed once from the two copies drifting apart
mid-session". That is exactly what it is for, and it caught it. **This mechanism is not the
disease. It is the only part of the codebase already doing what the owner is asking for, and it
should be the template rather than the thing replaced.**

Its one real weakness: `vendor-engine.mjs` must be run **by hand**. Nothing in `package.json`
runs it before build or deploy. Drift is caught at test time, not prevented at write time.

### 5.2 The other duplications, which have no parity test

| Duplicate | Copies | Protected by |
|---|---|---|
| Tagging rules | `tagger.ts`, `_engine/cards/tagger.ts`, `public.derive_card_tags` (SQL) | Test covers copies 1–2. **Copy 3 is unguarded.** |
| Deck generation | `build.ts` (dead), `ai-deck-builder`, `ai-deck-builder-v2` | Nothing |
| edhpowerlevel URL encoder | `DeckBuilder.tsx:455`, `edh-power-check/index.ts:318` | Nothing |
| Playability | `playability.ts` (exact), `simulation.ts` (Monte Carlo) | Nothing |
| Legality/formats | 4 modules | Nothing |

### 5.3 Scryfall fields the sync drops

`scryfall-sync/index.ts:226-238` calls `copy()` on 13 fields. The `cards` table has **26
columns**, confirmed against `src/integrations/supabase/types.ts:224-252`.

**Four copied fields have no column and are silently discarded:**

| Field | Line | Worth a column? |
|---|---:|---|
| `artist` | 237 | Yes — cheap, display value |
| `flavor_text` | 236 | Yes — card detail page |
| `color_indicator` | 231 | **Yes — correctness.** Without it, colour identity for indicator-only cards is wrong |
| `defense` | 235 | Yes — Battle cards render incorrectly without it |

**And `edhrec_rank` is never fetched at all**, which is why `local-filter.ts:126` sorts by a
column that does not exist. Scryfall ships it in the feed already downloaded nightly.

`released_at` (`local-filter.ts:125`) is likewise absent, so "newest first" is also inert.

Recommended additions, smallest set that fixes real bugs: `edhrec_rank`, `released_at`,
`color_indicator`, `defense`, `artist`, `flavor_text`. **Not** all of Scryfall.

On `edhrec_rank`: it is a **popularity ordering across all cards**, not a quality score and not
deck-specific synergy. It belongs in the engine as a weak prior, below playability and below
role gap. A rank-1 card the deck cannot cast is still a bad card for that deck.

---

## 6. Proposal: the shape of the one engine

### 6.1 Where it lives

```
src/engine/                      pure, no imports outside itself, no network, no React
├── core/
│   ├── types.ts                 Card, DeckEntry, Format, Color, Role, Signal
│   ├── identity.ts              colour identity + Hall's condition helpers   ← from color-*.ts
│   ├── legality.ts              format rules, isLegalIn                      ← merges 4 modules
│   └── normalize.ts             normalizeName, normalizeOracleText, faces
├── knowledge/
│   ├── tag-rules.ts             TAG_RULES — the single source                ← from cards/tagger.ts
│   ├── tag-signal.ts            IDF weighting, ALIAS_TAGS                    ← moved as-is
│   └── roles.ts                 servesRole                                   ← moved as-is
├── playability/
│   └── castability.ts           EXACT hypergeometric + Hall                  ← playability.ts, unchanged
├── power/
│   ├── features.ts              feature extraction                           ← score/features.ts
│   └── score.ts                 nine subscores → 1–10, bands                 ← edh-power-calculator.ts
├── advise/
│   ├── profile.ts               deriveDeckProfile, roleShortfall             ← moved as-is
│   ├── query.ts                 buildCandidateQuery                          ← moved as-is
│   ├── rank.ts                  rankCandidates — NOW 5 weights               ← + playability
│   ├── cuts.ts                  chooseCutTargets                             ← from swap-targets.ts
│   └── generate.ts              deck construction                            ← from build.ts
└── index.ts                     the published interface
```

**Non-negotiables, restated as rules the structure enforces:**

- **Pure and dependency-injected.** No module under `src/engine/` may import `@/integrations`,
  React, or anything with a socket. Data arrives through injected sources, the way
  `CandidateSource` already does. A lint rule plus the existing "imports nothing outside
  itself" parity check enforces it mechanically.
- **One source of truth.** `src/engine/` is it. Edge copies are generated.
- **Every consumer calls the engine.** No consumer keeps a private calculation.

### 6.2 Playability becomes a driver, not a decoration

Three concrete changes, in this order:

1. **`power/score.ts` calls `playability/castability.ts`.** Delete `simulation.ts`. The power
   score stops being computed from a Monte Carlo approximation and starts being computed from
   the exact figure the deck page already shows. *This is the single change that most directly
   answers "fix power score and optimiser they work hand in hand."*
2. **`rank.ts` gains a fifth weight.** Proposed `playability: 2.5` — above `tagSynergy: 2.0`
   (thematic fit) and below `roleGap: 3.0`. It must be a **gate as well as a weight**: a card
   the deck's mana base cannot support is not recommended at all, not merely ranked lower.
3. **`cuts.ts` ranks "you cannot cast this" first.** Today castability arrives from the client
   and may be absent. Once the engine is shared, the optimiser computes it. Keep the existing
   honesty rule — unmeasured is not weak — but it should now rarely trigger, because the engine
   can always measure.

The weight of 2.5 is a **starting proposal, not a measured value.** It has no empirical basis
yet and must not be presented as one. Section 6.5 is how it earns a number.

### 6.3 Vendoring, generalised from what already works

Extend `vendor-engine.mjs` to a general `scripts/vendor-engine.mjs` that vendors `src/engine/`
into every edge function that needs it, keeping all four parity checks. Two additions:

- **Wire it into `package.json`** as a `prebuild` step and a `pretest` step, so drift is
  *prevented* at write time rather than only *detected* at test time. This is the one real gap
  in the current mechanism.
- **Fail the build, not just the test**, when a vendored tree is stale.

The SQL copy of the tagging rules (`public.derive_card_tags`) must join the same scheme:
generated from `TAG_RULES` into a migration, with a parity check that re-renders and compares.
Until it does, it is a third unguarded copy.

### 6.4 Migration order — every step ships working

Each step is independently deployable. No step leaves the app broken.

| # | Step | Risk | Why here |
|---|---|---|---|
| 1 | Add the six Scryfall columns; sync and backfill; make the EDHREC sort real | Low | Pure addition. Fixes two inert sorts and three silently dropped fields. No engine change. |
| 2 | Point `edh-power-calculator` at `playability.ts`; delete `simulation.ts` | **Medium — scores will move** | The highest-value change. Do it early and alone so the movement is attributable. |
| 3 | Create `src/engine/`; move `recommend/`, `tag-signal`, `roles` in **unchanged**; re-point `_engine` vendoring | Low | Pure move. Parity test proves byte-identity throughout. |
| 4 | Move `playability.ts` and the power modules into `src/engine/`; `power.ts` becomes a thin facade over it | Low | `power.ts` keeps its signature, so all 26 consumers are untouched. |
| 5 | Merge the four legality modules into `core/legality.ts`; merge colour identity into `core/identity.ts` | Medium | Touches many files. Do after the structure exists. |
| 6 | Add playability to `rank.ts` as gate + weight; add `cuts.ts` | Medium | The behavioural change. Needs steps 2 and 4 first. |
| 7 | Expose `recommend()` to the browser; wire smart suggestions to it | Low | The engine already exists and is tested; it has simply never been called from the client. |
| 8 | Collapse `ai-deck-builder` and `-v2` onto `engine/advise/generate.ts` | **High** | Two live generators, one lying comment, real users. Last, deliberately. |
| 9 | Publish a bot-facing interface for `src/lib/game/bot.ts` | Low | Interface only. Another agent owns that tree; they adopt it when ready. |
| 10 | Retire `edh-power-check` to a calibration-only path (§6.5) | Low | After ours is trusted. |
| — | Delete the 3,201 unreferenced lines (§2.5) | Medium | Separate decision, separate verification pass. Not part of this sequence. |

### 6.5 The edhpowerlevel cross-reference, done honestly

The owner wants our figure sanity-checked against theirs before it is shown. The honest shape:

- **Never overwrite.** Ours is computed exactly from the actual decklist and mana base. Theirs
  is scraped HTML that can return `NaN`. Ours is the more likely to be right. Today
  `DeckBuilder.tsx:467` does the opposite — it **overwrites the displayed level with the
  scraped one**. That inverts the trust relationship and must be reversed.
- **Never block.** Their site being unreachable must not stop output.
- **Compare, log, and surface only when the gap is large enough to matter.**
- **Measure the agreement over the real decks in the database and report it.** There are 15
  decks in `user_decks`. That is a small sample and the report must say so rather than dress
  15 decks up as a validation.

**Say plainly what the measurement can and cannot settle.** edhpowerlevel has inclusion data
over millions of real decklists. We have none: there is no popularity or synergy data in the
schema at all, and `edhrec_rank` (once added) is a popularity *ordering*, not inclusion counts.
So a large part of any gap is **data, not formula**. Tuning our weights until our number matches
theirs would not fix the gap; it would produce one more implementation fitted to a scrape. If
the measurement supports that conclusion, it should be reported as the finding, not worked
around.

---

## 7. What cannot be unified, and why

| Thing | Why it stays separate |
|---|---|
| **`src/lib/game/**` (rules engine)** | Owned by another agent, and correctly a different concern: it resolves what *happens*, the engine judges what is *good*. `bot.ts` should consume the engine through a published interface. Never merge the two state models — `RULES-ENGINE-DECISION.md` documents why. |
| **`src/components/tournament/scoring.ts`** | Swiss points and tiebreakers. Same word "score", unrelated domain. |
| **`src/lib/cards/abilities/`** | Compiles oracle text into executable abilities for play mode. Shares `normalizeOracleText` with the engine; the rest is play-mode's. |
| **`src/features/scan/`, `scripts/vision/`** | Image recognition. No overlap. Also another agent's tree. |
| **The AI prompt layers** | `mtg-brain`, `gemini-deck-coach`, and the prompt half of `deck-optimizer` are model calls, not deterministic computation. They must become **consumers** of engine output — grounded in engine numbers, as `deck-optimizer` already partly is — but they cannot be folded into a pure engine. Purity is the point. |
| **The edhpowerlevel scrape** | Cannot be unified by definition. It is a third party's number. It becomes a calibration input, never an authority. |
| **Forge** | GPL-3.0. Off limits entirely: not read, not referenced, not translated. Recorded in `THIRD-PARTY-NOTICES.md`. XMage is MIT and usable with attribution. |

---

## 8. Honest summary

**What is already right, and should be copied rather than replaced:**
`src/lib/deck/power.ts` (one producer, 26 consumers, no private calculations),
`src/lib/deck/recommend/` (pure, injected, well tested), and the vendor-plus-parity mechanism
(currently green, zero drift).

**What is actually wrong, in descending order of harm:**

1. **The power score is computed from a Monte Carlo approximation while an exact engine sits
   unused beside it.** Not in the briefing; the most important finding here.
2. **Two live deck generators, one carrying a comment claiming an integration it does not
   have**, with 965 lines of inlined reimplementation underneath it.
3. **The scrape still overwrites our computed number** at `DeckBuilder.tsx:467`.
4. **The best recommendation engine in the repo has no browser consumer at all.**
5. **`edhrec_rank` sits in a feed downloaded nightly and is thrown away**, alongside four other
   silently discarded fields, one of which (`color_indicator`) is a correctness bug.
6. **3,201 lines with no consumer**, including a 2,105-line synergy system no user has seen.

**What the briefing got wrong, corrected above:** the nine implementations are down to one plus
a scraper; `calculate-deck-power` is already retired behind a 410; `PowerLevelConsistency` is
gone; the parity test is green today; the scrape truncates on URL length, not card count.

**What no refactor can fix:** we have no inclusion or popularity data. That is a data gap, not a
formula gap, and it should be stated rather than tuned around.
