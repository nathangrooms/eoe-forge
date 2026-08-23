# The deck panels: a census

Census only. **No file under `src/` was changed by this pass.** Everything below
is read out of the tree or produced by an import graph over it.

Written 23 Aug 2026. Companion to `DECK-PAGE-AUDIT.md`, which is the
control-by-control inventory and the nothing-lost contract. This one answers a
different question: what is in the box, what is in the box twice, and how far
each of the eight tabs is from being the best version of itself.

> **This census has been acted on.** `DECK-TABS-REBUILT.md` is what the rebuild
> did with it, tab by tab, with the request counts, the control and card counts
> and the bundle sizes measured before and after. Section 7 below is the list it
> worked from; read the two together before changing a deck tab, because
> anything section 7 calls missing may since have been built, moved or
> deliberately left alone with a reason written down.

---

## 0. Method, and what this is not

Three instruments, all of them re-runnable.

1. **Import graph.** Every `.ts`/`.tsx` under `src/` parsed for `from '...'` and
   `import('...')`, `@/` and relative specifiers resolved against the tree, and
   every file under `src/components/deck`, `src/components/deck-builder` and
   `src/components/deck-builder/optimizer` given the list of files that import
   it. 78 target files.
2. **Reachability.** The same graph walked transitively from `src/main.tsx`. A
   file the walk never reaches cannot render, whoever imports it. This is what
   caught the three files that are alive only in the eyes of a dead one.
3. **Source reading.** Every figure claimed to be duplicated below was read in
   both implementations and the rule each applies was written down.

What this is **not**: nothing here was measured in a browser. There are no pixel
figures and no request counts in this document, because none were taken. Where
`DECK-PAGE-AUDIT.md` measured something, it is cited rather than restated.

---

## 1. The census

70 of the 78 files are reachable. Eight are not, and two of those eight are test
files that `npm test` runs directly (`node --test "src/**/*.test.ts"`), so they
are reached by the runner and not by the app. That leaves **six dead files**.

### 1a. `src/components/deck` (20 files, all live)

| File | What it renders | Reached by |
|---|---|---|
| `CommanderHero.tsx` | The commander card as the hero of a tile or the deck header. Full `CardImage`, real card geometry, designed panel when there is no commander | `DeckInterface`, `DeckTile`, `FavoriteDecksPreview` |
| `DeckCardsPanel.tsx` | The Cards tab. `FilterBar` + `ListingFrame` + `ListingSearch` + `SortControl`, three view modes, group-by axis, size slider, text decklist with copy | `DeckInterface` |
| `DeckCardFilters.tsx` | The facet rows only: type, colour, mana value, rarity, price, playability, each chip carrying its live count. Also exports `PlayabilityLegend` | `DeckCardsPanel`, `ManaSourcesPanel` |
| `DeckCardGrid.tsx` | Visual decklist, grouped, 5:7 ratio, `CardImage`, `PriceTag`, playability meter, optional editing overlay | `DeckCardsPanel`, `PublicDeck` |
| `DeckCardTable.tsx` | Sortable table over eight columns including playability and price gaps | `DeckCardsPanel`, `PublicDeck`, a dev harness |
| `DeckCardEditing.tsx` | Quantity input, add one, remove one, remove all, replace. Every one optional | `DeckCardGrid`, `DeckCardTable`, `DeckCardsPanel`, `DeckInterface` |
| `DeckExportPanel.tsx` | `/deck/:id/export`. Six formats, three content switches, three site shortcuts | `DeckExport` |
| `DeckSubpageLayout.tsx` | The shell every deck sub-route wears, plus `useDeckReturn` | six sub-route pages |
| `DeckTile.tsx` | The My Decks tile. Commander art as the tile, count, value, missing, collection progress, power and bracket | `Decks` |
| `DeckViewControls.tsx` | No JSX at all any more. Exports the two My Decks modes, six sort axes and the storage key | `Decks` |
| `EdhPowerCheck.tsx` | The edhpowerlevel.com second opinion and the Calculate/Refresh control | `DeckInterface` (EDH tab) |
| `ImportDeckPanel.tsx` | Right-hand import slide-over, one `resolve_card_names` call for the whole paste | `DeckInterface` |
| `ManaSourcesPanel.tsx` | Mana tab. Source counts per colour, castability roll-up, hardest to cast list | `DeckInterface` |
| `PlayabilityMeter.tsx` | One card's castability as a bar plus tooltip. A dash for lands, never a zero | `DeckCardGrid`, `DeckCardTable`, `ManaSourcesPanel` |
| `PowerScore.tsx` | The only way a power score is ever drawn. `compact` and `expanded` variants plus `PowerScoreBadge` | eleven importers across deck, collection, play and tutor |
| `ReplaceCardPanel.tsx` | Right-hand swap slide-over in `mode="pick"` | `DeckInterface` |
| `deckAnalyticsCards.ts` | `toAnalyticsCards`, `analyticsCommanderOf`, `mainboardOf`. The one mapping from deck rows to the store shape the old builder panels expect | `DeckInterface`, `DeckOptimise` |
| `replacementPlan.ts` | Colour identity and copy limit rules for a proposed swap | `useDeckEditor`, its own test |
| `useDeckEditor.ts` | Every write: quantity, add, remove, replace, import, rename, commander, description, EDH cache | `DeckInterface`, `DeckOptimise` |
| `useDeckRecord.ts` | Name, format and id for the sub-routes | four sub-route pages |

### 1b. `src/components/deck-builder` (45 files)

| File | What it renders | Reached by | Alive |
|---|---|---|---|
| `AIAnalysisPanel.tsx` | A chat surface against the `mtg-brain` edge function, with four quick actions | `EnhancedDeckAnalysis` section `ai` | yes |
| `AIGeneratedDeckList.tsx` | The generated deck result screen | `AIBuilder`, a dev harness | yes |
| `AIOptimizerPanel.tsx` | The whole optimiser: overview, additions, removals, swaps, lands, auto-optimise, confirm bar | `DeckOptimise`, `GeneratedDeckOptimizerPanel` | yes |
| `AdvancedSearchFilters.tsx` | A tabbed card filter panel | `features/collection/EnhancedCardSearch.tsx`, which has **no importer** | **dead** |
| `ArchetypeDetection.tsx` | Ranked archetype matches with a confidence figure, from `cards.tags` density | `DeckInterface` (Analysis), `AIGeneratedDeckList` | yes |
| `ArchetypeLibrary.tsx` | A catalogue of archetype shells with target power bands and card packages | nothing | **dead** |
| `BrainAnalysis.tsx` | A second chat surface against `mtg-brain`, with fourteen preset analyses | `DeckInterface` (Analysis), `ComprehensiveAnalytics` | yes |
| `CardGallery.tsx` | A grouped card gallery with collapsible type sections | nothing | **dead** |
| `CommanderPowerDisplay.tsx` | Four commander axes plus tutor count and game changers, from `DeckPower` | `DeckInterface` (EDH), `AIGeneratedDeckList` | yes |
| `CommanderSelector.tsx` | The commander picker. `FilterBar`, `ListingSearch`, `EmptyState` | `DeckCommander` | yes |
| `ComprehensiveAnalytics.tsx` | A four-tab wrapper: PowerScore, coaching, land base, BrainAnalysis | `PublicDeck` only | yes |
| `CurveComparisonBars.tsx` | The recharts bar chart, lazy loaded so recharts is out of first load | `EnhancedDeckAnalysis` | yes |
| `DeckBudgetTracker.tsx` | Value tab. Deck value against a budget slider, top five share, rarity roll-up | `DeckInterface` (Value), `AIGeneratedDeckList` | yes |
| `DeckCompatibilityChecker.tsx` | Colour identity violations, with a remove control when you can edit | `DeckInterface` (Legality), `AIGeneratedDeckList` | yes |
| `DeckNotesPanel.tsx` | Threaded notes on a deck | `DeckInterface` (Record) | yes |
| `DeckPrimerGenerator.tsx` | Four primer fields, drafted to `localStorage` per deck | `DeckInterface` (Record) | yes |
| `DeckProxyGenerator.tsx` | `/deck/:id/proxies`. Selection, paper size, quality, cut guides, list, PDF, print | `DeckProxies`, two harnesses | yes |
| `DeckQuickStats.tsx` | The metric strip: `MetricRow` of four, ownership bar, type breakdown with shares | `DeckInterface`, `AIGeneratedDeckList` | yes |
| `DeckSearchFilters.tsx` | My Decks filters as a right-hand slide-over | `Decks` | yes |
| `DeckSharePanel.tsx` | `/deck/:id/share` | `DeckShare` | yes |
| `DeckValidationPanel.tsx` | Legality tab. Errors, warnings, info, collapsible, over cards that carry `legalities` | `DeckInterface` (Legality), `AIGeneratedDeckList` | yes |
| `DecksSummaryStats.tsx` | My Decks six-figure `MetricRow` | `Decks` | yes |
| `EdhAnalysisPanel.tsx` | The edhpowerlevel readout: metrics, brackets, card analysis, its own tab strip | `EdhPowerCheck`, `DeckInterface`, `DeckOptimise`, `AIOptimizerPanel`, `AIGeneratedDeckList` | yes |
| `EnhancedDeckAnalysis.tsx` | Six sections behind its own tab strip: curve, lands, synergy, validation, suggestions, ai. Four optional summary tiles | `DeckInterface` (Analysis, three sections), `AIGeneratedDeckList` (all six) | yes |
| `EnhancedMatchTracker.tsx` | Record tab. Match form, match list, four-figure `MetricRow` | `DeckInterface` (Record) | yes |
| `FirstDeckOnboarding.tsx` | The empty My Decks state | `Decks` | yes |
| `GeneratedDeckOptimizerPanel.tsx` | `AIOptimizerPanel` in a slide-over, for a deck with no id yet | `AIGeneratedDeckList` | yes |
| `LandEnhancerUX.tsx` | Mana tab. Land counts, colour sources, basics split, all from `DeckPower` | `DeckInterface` (Mana), `ComprehensiveAnalytics` | yes |
| `LegalityBadge.tsx` | A legal / N issues badge with a tooltip | `ModernDeckTile` only, which is dead | **dead** |
| `ManaCurve.tsx` | Mana tab. Eight bins, segmented by card type, lands excluded, copies counted | `DeckInterface` (Mana) | yes |
| `MatchAnalytics.tsx` | Record tab. Win rate, per-opponent breakdown, recent and monthly form, behind its own tab strip | `DeckInterface` (Record) | yes |
| `MiniManaCurve.tsx` | Eight-bin sparkline curve over a stored bucket record | `ModernDeckTile` only, which is dead | **dead** |
| `MissingCardsPanel.tsx` | Value tab. Missing cards with price bands, search, proxy and shopping list actions | `DeckInterface` (Value) | yes |
| `ModernDeckTile.tsx` | A deck tile with format colours, curve sparkline, legality badge | nothing | **dead** |
| `PowerSliderCoaching.tsx` | Target power slider driving the real `DeckCoach` | `DeckInterface` (EDH), `ComprehensiveAnalytics` | yes |
| `ProxySheet.tsx` | The printed sheet DOM | `DeckProxyGenerator`, `ProxyListPage`, two harnesses | yes |
| `QuickDeckTester.tsx` | `/deck/:id/testhand`. Opening hand, mulligan, hand stats as a `MetricRow` | `DeckTestHand` | yes |
| `VisualDeckView.tsx` | A second grouped visual decklist with its own listing frame and editing controls | `AIGeneratedDeckList` only | yes |
| `deck-categories.ts` | A card categoriser plus icons, labels and `--type-*` classes | seven importers | yes |
| `deck-view-prefs.ts` | The builder decklist's modes and storage key | `DeckCardsPanel`, `VisualDeckView` | yes |
| `proxy-geometry.ts`, `proxy-print.ts`, `proxy-sheet.css` | Proxy paper maths, the print pipeline, sheet styles | proxy surfaces | yes |
| `useCollectionOwnership.ts` | Owned and missing copies against `user_collections`, matched by name | `DeckInterface` | yes |
| `optimizer/` (13 files) | Overview, additions, removals, swaps, land recommendations, auto-optimise, confirm bar, progress, suggestion tile, power impact badge, mana impact note, land facts, mana impact maths | all under `AIOptimizerPanel` | yes |

### 1c. The six dead files, named

```
src/components/deck-builder/ArchetypeLibrary.tsx        306 lines
src/components/deck-builder/CardGallery.tsx             157 lines
src/components/deck-builder/ModernDeckTile.tsx          561 lines
src/components/deck-builder/MiniManaCurve.tsx            59 lines   (dead behind ModernDeckTile)
src/components/deck-builder/LegalityBadge.tsx            83 lines   (dead behind ModernDeckTile)
src/components/deck-builder/AdvancedSearchFilters.tsx   506 lines   (dead behind features/collection/EnhancedCardSearch.tsx, itself dead)
```

1,672 lines that cannot render. Two of them break design law on top of being
dead: `ModernDeckTile` paints format chips in `bg-blue-500/15`,
`text-purple-400`, `bg-emerald-500/15` and 28 further raw Tailwind hue classes,
31 distinct across 39 occurrences, and draws 25 border classes. It is the only
file in either directory with raw hues in live code. `CommanderPowerDisplay` is the only other hit and its hit is a
comment describing hues that were removed.

**`ArchetypeLibrary` is the one worth reading before deleting.** It is a
rewritten catalogue of archetype shells expressed in the canonical band and
bracket vocabulary from `@/lib/deck/power`, and nothing else in the product
holds a list of what a shell is made of. If it goes, that content goes with it.
`CardGallery` and `ModernDeckTile` have live better versions and nothing in them
is unique.

---

## 2. The duplicate groups

### Group 1. Five panels that analyse a deck

| Panel | What it uniquely does | Verdict |
|---|---|---|
| `EnhancedDeckAnalysis` | Six sections: curve, land base, synergy, format validation, suggestions, ai. **Synergy is the only place `SynergyEngine` is drawn**: archetype matches, mechanic clusters, strongest card pairs with a strength out of ten, improvement suggestions | **keep, cut down further** |
| `BrainAnalysis` | Fourteen preset analyses against `mtg-brain`, briefed with the canonical `DeckPower` object including its subscores, drivers and drags | **keep as the single chat** |
| `AIAnalysisPanel` | Four quick actions against `mtg-brain`, briefed with `deckSummary`. Renders card recommendations and visual data | **drop, it is the weaker chat** |
| `ComprehensiveAnalytics` | Nothing of its own. Four tabs over `PowerScore`, `PowerSliderCoaching`, `LandEnhancerUX` and `BrainAnalysis`, all four of which the deck page already mounts directly | **drop, it is a wrapper** |
| `MatchAnalytics` | Per-opponent win rate, recent ten, current month | **fold into `EnhancedMatchTracker`** |

**The live cost, today, on the Analysis tab.** `DeckInterface` mounts
`EnhancedDeckAnalysisPanel` with `sections={['synergy','suggestions','ai']}`,
and the `ai` section renders `AIAnalysisPanel`. Directly underneath it mounts
`BrainAnalysis`. So **the Analysis tab draws two chat boxes against the same
edge function**, one inside a tab strip and one below it, and the synergy and
suggestions tabs each carry a third `mtg-brain` call of their own on a
`aiAnalysisFocus` trigger. Four routes to one model on one tab.

`BrainAnalysis` wins on the brief it sends. Its own header says so and the code
agrees: it is handed the canonical `DeckPower` and interpolates
`power.subscores`, `drivers` and `drags` into the prompt. `AIAnalysisPanel`
takes an untyped `deckSummary` prop. **What `AIAnalysisPanel` has that
`BrainAnalysis` does not** is `CardRecommendationDisplay`, so a card the model
names comes back as a card you can add rather than as a name in prose. That is
worth keeping, and it is a component either panel can mount.

`ComprehensiveAnalytics` is reachable only from `PublicDeck`. Dropping it means
`PublicDeck` mounts its four children directly, which is what `DeckInterface`
already does. Note what that would also fix: **a public, read-only deck page
currently renders an AI chat box**, because `BrainAnalysis` is tab four of that
wrapper.

### Group 2. Three curves

| Component | Bins | Rule | Verdict |
|---|---|---|---|
| `ManaCurve` | `0 1 2 3 4 5 6 7+` | Lands and commander excluded, copies counted, bars segmented by card type against `--type-*` tokens, avg printed in the header | **keep** |
| `MiniManaCurve` | `0-1 2 3 4 5 6-7 8-9 10+` | Reads a stored bucket record, does not classify anything | **dead, drop** |
| `CurveComparisonBars` | whatever it is handed | A recharts `BarChart`, lazy loaded so 104 kB gzipped stays out of first load | **not a duplicate, keep** |

`CurveComparisonBars` is on the list in the brief but it is not a third curve.
It has no analysis in it at all: it takes a finished curve and a fill colour and
draws bars. It exists so `EnhancedDeckAnalysis` can draw one chart without
pulling recharts into the deck page's first load. Leave it alone.

The real third curve is `ManaCurveAnalyzer` in `src/lib/magic/mana-curve.ts`,
which `EnhancedDeckAnalysis` calls to produce `analysis.manaCurve.curve` and
`averageCMC`. Its eleven-slot format targets and optimality score are content no
other curve has. On `/deck/:id` its output is only drawn inside the `curve`
section, which `DeckInterface` does not ask for, so today it is computed on
every Analysis tab render and never shown.

### Group 3. Two optimisers

Not a duplicate. `GeneratedDeckOptimizerPanel` is 115 lines and its body is
`<AIOptimizerPanel deckId="" .../>` inside a `Sheet`. It exists because a
generated deck has no row in the database yet, which its header explains and the
code bears out. **Keep both.**

The optimiser has already left the tab strip for `/deck/:id/optimise`, so it is
out of scope for the eight tabs. Its thirteen `optimizer/` files are each drawn
by exactly one parent and none of them duplicates another.

### Group 4. Two stat rows

Not a duplicate either, and this is the one place the brief's file list is
misleading. Both already compose `MetricRow`:

- `DecksSummaryStats` is six figures **over a library of decks** and takes
  `DeckSummary[]`.
- `DeckQuickStats` is four figures **about one deck** plus an ownership bar and
  a type breakdown, and takes counts.

Different inputs, different questions, one shared tile. Nothing to merge.

### Group 5. Two tiles

`DeckTile` is live and `ModernDeckTile` is dead. `DeckTile` wins on every axis
that matters: it uses `CommanderHero`, so the commander is drawn through
`CardImage` at `large` and inherits the real card geometry, and it carries one
border class against `ModernDeckTile`'s 25 and no raw hues against its 31.

**What `ModernDeckTile` has that `DeckTile` does not:** a curve sparkline, an
average mana value readout, and a legality badge. The first two were removed
from `DeckTile` at the owner's explicit request and should not come back. The
legality badge has no equivalent on My Decks, and it is the only thing in this
file worth a second look before it goes.

### Group 6. `ArchetypeDetection` beside `ArchetypeLibrary`

They do opposite jobs. `ArchetypeDetection` measures the deck in your hand and
ranks matches by confidence off `cards.tags` density. `ArchetypeLibrary` is a
static catalogue of shells and their card packages, with a target power band.
Detection is live on the Analysis tab; the library is dead.

The interesting version is neither: **detection names an archetype and then has
nothing to offer.** The library holds exactly the packages a detected archetype
is missing. Wiring one to the other is a real feature and it is entirely inside
these two files.

### Group 7. `DeckValidationPanel` beside `LegalityBadge`

Not a duplicate. `DeckValidationPanel` is the full readout on the Legality tab
and runs both `DeckValidator` and `DeckLegalityChecker`. `LegalityBadge` is a
one-line badge, and it is dead because its only importer is dead. If My Decks
tiles ever want a legality state, this is the component; otherwise it goes.

### Group 8. Two decklist views (not in the brief)

`DeckCardsPanel` and `VisualDeckView` are both grouped visual decklists with
their own listing frame, group axes and editing controls. `DeckCardsPanel` is on
`/deck/:id`; `VisualDeckView` is reached only from `AIGeneratedDeckList`. Both
compose `@/components/listing`. `DeckCardsPanel` is the better one: three view
modes against one, castability as a first-class column, `PriceTag`, the shared
count sentence, and view mode in the URL.

`VisualDeckView` is not trivially replaceable, because it operates on plain card
objects with no `deck_cards` row behind them, which is exactly the generated
deck's situation. It is the same shape of problem as
`GeneratedDeckOptimizerPanel`. Worth naming, not worth deleting until the
generated deck has a row shape.

### Group 9. Two canonical card categorisers (not in the brief)

```
src/lib/deck/cardCategories.ts             "The single canonical card categoriser for the deck surfaces"
src/components/deck-builder/deck-categories.ts   "One classifier for the whole deck builder"
```

Both say they are the only one. Both are live and **both run on `/deck/:id`**:
`DeckInterface`'s `typeCounts` uses `deck-categories`, and `DeckCardGrid`,
`DeckCardTable`, `deckAnalyticsCards` and `curve.ts` use `cardCategories`.

Their precedence differs:

```
cardCategories.ts     land, battle, planeswalker, creature, artifact, enchantment, instant, sorcery
deck-categories.ts    land, battle, planeswalker, creature, instant, sorcery, artifact, enchantment
```

I did not find a printed card whose front face is both an artifact-or-enchantment
and an instant-or-sorcery, so this is latent rather than a wrong number on screen
today. It is still two files that each claim to be the last word, and that is the
setup for the next disagreement rather than the current one.

---

## 3. Figures that disagree

Checked in source, both sides read.

### 3.1 The card count, three ways, two answers. Live.

| Where | Expression | Answer on a 100-card Commander deck |
|---|---|---|
| Tab badge | `stats.totalCards`, from `computeDeckStats(rows)`, every non-sideboard row including the commander | **100** |
| Metric strip | `DeckQuickStats`, `totalCards` is the mainboard sum and `displayCards = totalCards + 1` when there is a commander | **100** |
| List header | `DeckCardsPanel`, `rows.reduce(...)` over `listRows`, which is `rows.filter(r => !r.is_commander)` | **99** |

This is `DECK-PAGE-AUDIT.md` finding A, still open, and now located exactly. The
tab strip says `Cards 100` and the sentence directly under it says `99 cards`.
The audit blamed the page header; the disagreement is actually between the tab
badge and the list, which are closer together on screen.

**Which is correct** depends on what the sentence is for. The list is honest
about itself: the commander is not in that list, so 99 is the true count of what
is below. The tab badge is counting the deck. Both are right about different
things and the fix is wording, not arithmetic.

### 3.2 Average mana value, five implementations, one disagreement

| Implementation | Lands | Commander | Per copy | Used by |
|---|---|---|---|---|
| `deckAverageManaValue` (`lib/deck/curve.ts`) | excluded | excluded | yes | the metric strip. **Canonical** |
| `ManaCurve` local `avgCmc` | excluded | excluded | yes | the Mana tab header |
| `castability.avgManaValue` (`engine/power/score.ts`) | excluded | excluded | yes | `PowerScore` hint, `BrainAnalysis` brief |
| `ManaCurveAnalyzer.averageCMC` (`lib/magic/mana-curve.ts`) | excluded | not in its input | yes | `EnhancedDeckAnalysis` overview tile, which `/deck/:id` turns off |
| `computeDeckStats.avgManaValue` (`lib/deck/deckCards.ts`) | excluded | **included** | yes | **nothing** |

The first four agree by rule and differ only in how they test for a land
(`categorizeCard` versus `isLandCard` versus a local `isLand`). The fifth is the
odd one: it adds the commander into the numerator and the denominator, so on a
Commander deck it is a different number, and it is returned in the same `stats`
object `DeckInterface` reads three other fields from. It is not printed anywhere
today. **It is a wrong number sitting in a struct waiting for a consumer**, and
the correct rule is the other four's: the commander is always available, so it
says nothing about what the deck draws.

### 3.3 Deck value: now agrees, and the reason is worth keeping

`DeckQuickStats` reads `stats.totalValueUSD` from `computeDeckStats(rows)`,
which counts every non-sideboard row. `DeckBudgetTracker` on the Value tab is
handed `analyticsDeck`, which is also every non-sideboard row. Both multiply by
quantity. Same rows, one answer. `DeckInterface` carries a comment naming the
`$888` versus `$877.54` case this fixed. No action.

### 3.4 Match statistics: computed twice, from two queries, and they drift

`EnhancedMatchTracker` and `MatchAnalytics` are both on the Record tab. Each
runs its own `supabase.from('deck_matches').select('*').eq('deck_id', ...)`, and
each computes `total`, `wins`, `losses`, `draws` and a win rate with identical
arithmetic. **Two queries for one set of rows on one tab.**

They also go out of step. Recording a match calls `loadMatches()` inside
`EnhancedMatchTracker` only. `MatchAnalytics` has no way to hear about it, so
after you log a game the tracker's win rate updates and the analytics panel
directly below it keeps the old one until the page is reloaded.

`MatchAnalytics` is the one with content: per-opponent-commander breakdown,
last-ten form, current-month form. `EnhancedMatchTracker` is the one with the
form, the list and a `MetricRow`. **One component, one query, both halves.**

### 3.5 The AI brief counts rows, not cards

`EnhancedDeckAnalysis` sends the model
`counts: { total: deck.length + (commander ? 1 : 0) }`. `deck.length` is the
number of `deck_cards` rows. For a singleton Commander deck that is right by
accident. For a 60-card Standard deck built out of four-ofs it is roughly 24,
and the model is told the deck has 24 cards while every other panel on the page
says 60. The same memo also stamps `rarity: 'common'` and
`legalities: { [format]: 'legal' }` on every card before handing them to
`SynergyEngine`, `LandBaseCalculator` and `FormatValidator`.

The `legalities` half is already known and is why `validation` is not in the
deck page's `sections`. The `rarity` half is not, and `SynergyEngine` is drawn.

---

## 4. The eight tabs

For each: what it does today, what Moxfield or Archidekt shows here that it does
not, and what is missing that this app already holds the data for. The third
column is the one worth reading.

### Cards

**Today.** `DeckCardsPanel`. Search, filters closed by default with a count on
the trigger, six facet families with live counts, group by type / colour / mana
value / none, sort on five axes, three view modes (visual, sortable table,
plain text with copy), a size slider on the visual mode only, view mode in the
URL, quantity, replace, remove one, remove all, add. Castability is a sortable
column. Commander drawn whole above, not in the list.

**Against Moxfield and Archidekt.** This is the tab that is closest to
competitive, and in two places ahead: nothing on either site sorts a decklist by
how castable each card is, and neither closes its filters by default. Where it
loses:

- **No custom categories.** Archidekt's whole identity is that you drag cards
  into categories you invented (Ramp, Removal, Wincons) and toggle whether a
  category counts toward the deck. `deck_cards` has no category column, so this
  is a schema gap, not a UI one.
- **No maybeboard or considering list.** Both sites have one. `deck_cards` has
  `is_sideboard` and nothing else, and per the audit nothing writes even that.
- **No per-card printing.** Both sites let you choose which printing of a card
  is in the deck, which then drives the price and the art. `deck_cards` stores
  `card_id` with no set or finish, so a deck cannot say which Sol Ring it is.
- **No version history.** Moxfield shows a changelog per save and Archidekt has
  snapshots. There is no `deck_versions` table.
- **No drag to reorder or drag between boards.**

**Data we already hold and do not use here.** `cards.oracle_id` means every
alternate printing of a card is already joinable, and `src/lib/pricing/printings.ts`
already models a printing spread with a `certainty` of `chosen` / `only-printing`
/ `assigned`. The Cards tab could show "cheapest printing $0.35, you are counted
at $4.10" per row without a migration. `cards.is_reserved` is in the catalogue
and used on the card page; a reserved list flag on a decklist row is one class.
`user_collections.condition` and `.foil` are loaded for this page already (see
7.2) and no row says which of your copies is the one going in.

### Add

**Today.** One `Card` saying which deck you are adding to, then
`EnhancedUniversalCardSearch` in `mode="pick"` with filters, view modes and a
size key that matches the old builder's bucket. Conditional on `canEdit`.

**Against Moxfield and Archidekt.** Both put adding in a persistent sidebar next
to the deck rather than on a tab that replaces it, so you see the deck fill up
as you add. Both offer bulk paste inline. Both surface commander-specific
recommendations at the point of adding. Archidekt shows, per result, how many
copies are already in the deck.

**Data we already hold and do not use here.**

- **`src/engine/advise` is a complete, tested recommendation engine** with
  `rankCandidates`, `deriveDeckProfile`, `dedupeByOracle` and `cuts`, ranked
  partly on `edhrec_rank`. Its only importers outside itself are tests and a
  type import in `powerAdapter`. **No deck tab calls it.** The Add tab is where
  it belongs: search results ranked against this deck's profile rather than by
  name.
- **`cards.edhrec_rank` is in the catalogue and no deck surface reads it.** The
  card page prints it, the commander wall prints it, the deck page does not.
- **Ownership.** `useCollectionOwnership` already runs on this page. A search
  result could say "you own 2" without a further query.
- **`replacementPlan.ts` already knows the colour identity and copy-limit rules**
  and is only wired to replace. A result that is outside your commander's
  identity could be marked before you click it rather than after.

### Mana

**Today.** Three panels stacked: `ManaCurve` (eight bins, segmented by type),
`ManaSourcesPanel` (sources per colour, castability roll-up, hardest to cast
list) and `LandEnhancerUX` (land counts, basics split, colour sources from
`DeckPower`).

**Zero controls.** Counted: `ManaCurve` 0 buttons and 0 inputs,
`ManaSourcesPanel` 0 and 0, `LandEnhancerUX` 0 and 0. `DECK-PAGE-AUDIT.md`
flagged this as a candidate for "doesn't feel complete" and it is confirmed
here. It is three read-only blocks with nothing between them.

**Against Moxfield and Archidekt.** Both let you toggle the curve between
counting copies and counting distinct cards, and filter it by colour. Archidekt
draws colour pip distribution as its own chart and lets you switch the curve
between mana value and "cost to cast in this deck". Both draw a colour source
table you can sort. Neither has anything as good as the castability engine, so
the analysis here is better and the interface around it is worse.

**Data we already hold and do not use here.**

- **The curve is not clickable.** `DeckCardsPanel` already filters by mana value
  and the facet chips already carry counts. Clicking the 4-drop bar should land
  on the Cards tab filtered to mana value 4. The filter state and the URL
  parameters for it both exist.
- **`cards.produced_mana` is in the catalogue.** The source counts are derived
  in the engine; the panel could name which lands produce which colour without a
  query.
- **The hardest-to-cast list does not link to a fix.** `AIOptimizerPanel` has a
  land recommendation section and `optimizer/landFacts.ts` already renders one
  line per land explaining what it was measured on. The Mana tab names the
  problem and the optimiser holds the answer, on two different routes.
- **`playability.threshold` and `belowThresholdCount` are already computed** and
  the deck header links to this tab with them. Nothing here lets you change the
  threshold or see the distribution behind the average.

### EDH

**Today.** `PowerScore` expanded, then `CommanderPowerDisplay` and
`PowerSliderCoaching` side by side, then `EdhPowerCheck`, which draws
`EdhAnalysisPanel` and carries the Calculate / Refresh control for the
edhpowerlevel.com second opinion. Conditional on the format using a power level.

**Against Moxfield and Archidekt.** Neither has anything like this. Moxfield
shows a bracket you set by hand. Archidekt has a "Deck Score" with no
methodology attached. This tab is the product's strongest claim to being better
than either, and the gaps are presentational:

- Neither competitor's bracket assignment is measured, and this one is, but the
  tab does not say which specific cards moved the bracket. `EdhAnalysisPanel`
  has `BracketData` with `extraTurns`, `massLandDenial`, `earlyTwoCardCombos`,
  `lateTwoCardCombos` and `gameChangers` as counts. Counts, not names.
- Moxfield surfaces the official Commander bracket definitions inline. This tab
  assumes you know what bracket 3 means.

**Data we already hold and do not use here.**

- **`src/engine/power/catalogs.ts` holds named two-card combos** (the file
  literally lists "Basalt Monolith + Rings of Brighthearth"). The bracket
  readout prints how many early two-card combos the deck has and does not print
  which. The names are in the tree.
- **`gameChangers` is a `GameChangerReport`, not an integer.** `powerAdapter`
  reads `power.gameChangers.count`. The report has more in it than the count.
- **`ArchetypeLibrary`'s target bands are in the same vocabulary as this score**
  and it is dead. "This deck scores 6.2; Aristocrats built well lands 6 to 8;
  here are the three packages you are missing" is a sentence the tree can
  already produce.
- **`user_decks.power_level` is a column and `edh_analysis` is cached**, so
  cross-deck comparison ("this is your third strongest deck") costs nothing.

### Analysis

**Today.** `ArchetypeDetection`, then `EnhancedDeckAnalysisPanel` cut to three
sections behind its own tab strip, then `BrainAnalysis`. So a tab strip inside a
tab, and two chat boxes (section 2, group 1). `ArchetypeDetection` has zero
controls.

**This is the least coherent tab on the page.** It has three top-level blocks,
one of which is itself a tab strip of three, one of whose three is a chat box,
sitting above another chat box.

**Against Moxfield and Archidekt.** Neither has a real analysis tab, so the
comparison is not "they do it better", it is "they do less and it reads
cleaner". Moxfield shows type, mana value, colour and price distributions and
stops. Archidekt adds a salt score and a "similar decks" list. What both have
that this does not:

- **Similar decks / what other people play.** Neither the app nor its schema has
  a corpus of other people's decks, so this is out of reach honestly.
- **A stated methodology.** `ArchetypeDetection` prints a confidence percentage
  and does not say what it is a percentage of.

**Data we already hold and do not use here.**

- **`user_decks.archetype` is a column and nothing ever writes it.**
  `ArchetypeDetection` computes a ranked archetype with a confidence figure
  every time this tab opens and throws it away. Persisting it would let My Decks
  filter and group by archetype, which is a `DeckSearchFilters` facet away.
- **`cards.tags` is what detection counts** and the Cards tab cannot filter on
  it. "Show me the eleven cards that made you call this Aristocrats" is not
  reachable.
- **`SynergyEngine` returns `strongestSynergies` with a `cardA` and a `cardB`**
  and the panel prints their names as text. They are cards. The house rule is
  cards large.
- **The local recommender again.** The `suggestions` section asks the model for
  five improvements. `src/engine/advise` ranks candidates against a derived deck
  profile deterministically and is tested. Two answers to "what should I add",
  one of them free and repeatable, and the free one is not wired up.

### Legality

**Today.** `DeckValidationPanel` over `mainboard`, plus
`DeckCompatibilityChecker` for Commander formats with a working remove control.
Three controls between them.

**Against Moxfield and Archidekt.** Both are ahead here and it is the tab
furthest behind in raw capability:

- **Multi-format legality at once.** Moxfield tells you which formats a list is
  legal in, not just the one you picked. `cards.legalities` is a JSON blob with
  every format in it and `ALL_FORMATS` is already imported by
  `EnhancedDeckAnalysis`. This is a table, not a feature.
- **Banned and restricted lists you can read.** Both link the specific ban.
- **A ban date and a "this was legal when you built it" note.** Moxfield
  surfaces recency.
- **Per-card legality on the card row.** Archidekt marks the illegal card in the
  decklist itself. Here you have to be on the Legality tab to know.

**Data we already hold and do not use here.**

- **`cards.legalities` carries every format.** The tab prints one.
- **`DeckCompatibilityChecker` can remove an offending card, and
  `DeckValidationPanel` cannot.** The validation panel names cards over the copy
  limit and cards that are banned, and offers no way to act on either, on a page
  whose founding argument is that naming a problem and being able to fix it
  belong together. `useDeckEditor` already exposes `deleteAll` and
  `setQuantity`, and `DeckInterface` already passes `onRemoveCard` to the
  panel next to this one.
- **`replacementPlan.ts` already computes whether a card may go in and why not.**
  An illegal card could offer Replace inline, using the slide-over that exists.

### Value

**Today.** `DeckBudgetTracker` (budget slider, deck value with a meter, top five
share, rarity roll-up) and `MissingCardsPanel` (missing cards with price bands,
search, per-card proxy and shopping list, add all, proxy all, mark owned,
wishlist).

**Against Moxfield and Archidekt.** Both are ahead on money and it is not close:

- **Multiple vendors.** Both price a deck against TCGplayer, Card Kingdom and
  Cardmarket and let you switch. This shows one USD figure.
- **Buy this deck.** Both hand the whole list to a vendor cart in one press.
  `src/lib/pricing/links.ts` exists; the deck page does not use it for a bulk
  handoff.
- **Budget swaps.** Archidekt suggests a cheaper card that does the same job.
  Here the budget slider tells you that you are over and stops.
- **Price per printing.** Both price the printing you chose.

**Data we already hold and do not use here.** This is the tab with the biggest
gap between what is on screen and what is in the database.

- **`card_price_history` is a table and the app already draws it.**
  `CardPriceHistory.tsx` and `CardPriceHistoryChart.tsx` both query it. **No deck
  surface does.** "Your deck was $812 in June and is $888 now, and Rhystic Study
  is $61 of the change" is one query and a chart that already exists. Neither
  Moxfield nor Archidekt shows deck value over time to a free user.
- **`user_collections.condition` and `.foil` are already in the row shape.** The
  Value tab prices the deck at market and says nothing about the copies you own.
  Insurance value, replacement value and "what this deck costs you to build from
  here" are three different numbers and the tab prints one.
- **Alternate printings, again.** `oracle_id` plus `printings.ts` gives "this
  deck is $888, or $611 if you take the cheapest printing of every card". That
  is a headline figure neither competitor gives away.
- **`cards.is_reserved`.** A reserved list card is one you will not get cheaper.
  The catalogue knows and the Value tab does not say.
- **The proxy pipeline is already on this tab per-card** and there is no "what
  would this deck cost if I proxied everything over $20" figure, which is the
  actual decision a player is making on this screen.
- **`MissingCardsPanel` and `useCollectionOwnership` load the whole
  `user_collections` table independently** (see 7.2). One of them could feed the
  other.

### Record

**Today.** `DeckPrimerGenerator` inside a `Card`, then `EnhancedMatchTracker`,
then `MatchAnalytics`, then `DeckNotesPanel`. Four blocks, two of which query
the same table (section 3.4).

**Against Moxfield and Archidekt.** Moxfield's primer is rich text with embedded
card links and images, is public on the shared deck, and is the main reason
people read other people's decks. Here the primer is four plain textareas
drafted to `localStorage`. Archidekt has deck comments and likes. Neither of
them has match tracking at all, so the Record tab has something they do not and
presents it as two panels that disagree.

- **The primer is not on the public deck page.** `PublicDeck` does not mount
  `DeckPrimerGenerator` or read the primer. So the one artefact whose entire
  purpose is to be read by someone else is private to the author.
- **The primer draft lives in `localStorage` keyed `dm.deck-primer.<deckId>`.**
  It is on one browser. `user_decks.description` is a column and is edited
  elsewhere on the page.
- **No rich text, no card links.**

**Data we already hold and do not use here.**

- **`deck_matches.opponent_commander` is a free text field** and the catalogue
  has every commander in it. A picker instead of a text box makes the
  per-opponent breakdown in `MatchAnalytics` actually group.
- **`user_decks.share_view_count` is a column and nothing in `src/` reads it.**
  The Share page cannot tell you anyone looked.
- **`deck_matches` has `played_at` and `notes` and there is no timeline.**
  `MatchAnalytics` computes "current month" by `new Date().getMonth()`, which
  is a calendar month with no year test, so a match played in August last year
  counts toward this August.
- **`ArchetypeDetection` derives a strategy line** and `DeckPrimerGenerator`'s
  own comment says `strategy` is not passed because nothing on the page holds
  one. Something does; it is on the Analysis tab keeping it to itself.

---

## 5. Distance from the house standard, measured

The house standard is `src/components/listing`. Counted by import.

### 5a. What each tab composes

| Tab | Components mounted | `@/components/listing` used | Hand-rolled equivalent |
|---|---|---|---|
| **Cards** | `DeckCardsPanel` → `DeckCardFilters`, `DeckCardGrid`, `DeckCardTable`, `DeckCardEditing` | `FIELD`, `FilterBar`, `FilterButton`, `ListingFrame`, `ListingSearch`, `SURFACE`, `SortControl`, `matchedLabel`, `resultSentence`, `useListingView` | none |
| **Add** | `EnhancedUniversalCardSearch` | inherited from the shared search | none |
| **Mana** | `ManaCurve`, `ManaSourcesPanel`, `LandEnhancerUX` | `MetricRow` in `ManaSourcesPanel` only | `ManaCurve` and `LandEnhancerUX` draw their own everything |
| **EDH** | `PowerScore`, `CommanderPowerDisplay`, `PowerSliderCoaching`, `EdhPowerCheck` → `EdhAnalysisPanel` | `MetricRow` in `EdhAnalysisPanel` only | `PowerScore`, `CommanderPowerDisplay`, `PowerSliderCoaching` all hand-rolled |
| **Analysis** | `ArchetypeDetection`, `EnhancedDeckAnalysis` → `AIAnalysisPanel`, `BrainAnalysis` | `FIELD` in `AIAnalysisPanel` only | everything else, plus two nested tab strips |
| **Legality** | `DeckValidationPanel`, `DeckCompatibilityChecker` | **none** | all of it |
| **Value** | `DeckBudgetTracker`, `MissingCardsPanel` | `MetricRow`; `EmptyState`, `FacetChip`, `FilterBar`, `ListingSearch` | none of consequence |
| **Record** | `DeckPrimerGenerator`, `EnhancedMatchTracker`, `MatchAnalytics`, `DeckNotesPanel` | `FIELD`; `EmptyState`, `FIELD`, `MetricRow` | `MatchAnalytics` and `DeckNotesPanel` entirely |

### 5b. The ranking, worst first

1. **Legality.** The only tab of the eight that imports nothing from
   `@/components/listing`. Two panels, 18 and 2 border classes, its own alert
   and badge language, its own collapsible sections. No `MetricRow` for "3
   errors, 2 warnings", no `EmptyState` for a clean deck.
2. **Analysis.** One `FIELD` import across three top-level panels and 10 border
   classes in `EnhancedDeckAnalysis` alone. Carries a nested tab strip, a
   third-level tab strip inside that, and four summary tiles that are turned off
   by a prop rather than removed. `ArchetypeDetection` has zero controls and
   builds its own confidence readout.
3. **EDH.** `EdhAnalysisPanel` is the single worst file in either directory by
   border count (28) and carries its own tab strip. The three power components
   beside it hand-roll their bars, faces and axes. The content is the best on
   the page and the vocabulary is the furthest from shared.
4. **Record.** Half converted. `EnhancedMatchTracker` uses `EmptyState`, `FIELD`
   and `MetricRow`; `MatchAnalytics` directly beneath it uses none of the three
   and adds its own tab strip; `DeckNotesPanel` uses `FIELD` and nothing else.
   Two win rates, two treatments, one tab.
5. **Mana.** Only `ManaSourcesPanel` is on the vocabulary. Zero controls on the
   whole tab.
6. **Value.** Close to compliant. `MissingCardsPanel` composes `FilterBar`,
   `ListingSearch`, `FacetChip` and `EmptyState`; `DeckBudgetTracker` composes
   `MetricRow`. What it lacks is `ListingFrame` around the missing cards grid.
7. **Add.** Delegates entirely to the shared search. Nothing to fix.
8. **Cards.** The reference implementation. Composes ten symbols from
   `@/components/listing` and hand-rolls nothing.

### 5c. Design law, counted

- **Raw Tailwind hues in live code: one file.** `ModernDeckTile`, which is dead.
  `CommanderPowerDisplay`'s only hit is a comment describing hues it removed.
- **Centred dialogs: zero.** No file in either directory imports
  `@/components/ui/dialog`. Four import `Sheet`, all right-hand.
- **Borders.** 25 files draw at least one. The five worst are
  `EdhAnalysisPanel` (28), `BrainAnalysis` (28), `ModernDeckTile` (25, dead),
  `AIAnalysisPanel` (21) and `DeckValidationPanel` (18). Those five are four of
  the five panels in group 1 plus the Legality tab, which is the same ranking
  section 5b arrived at independently.
- **Nested tab strips inside a tab: three.** `EnhancedDeckAnalysis`,
  `EdhAnalysisPanel`, `MatchAnalytics`. Plus `ComprehensiveAnalytics`, which is
  a tab strip whose only job is to be a tab strip.

---

## 6. Two database notes

Not a violation of the per-row rule. Both are set queries. Named because they
are on the same page.

**6.1.** `useCollectionOwnership` runs
`from('user_collections').select('card_name, quantity').eq('user_id', ...)`,
which is every row of the signed-in user's collection, on every deck page load.
`MissingCardsPanel` runs its own `from('user_collections')` when the Value tab
opens, and a third when you press Mark as Owned. Three reads of one table on one
page, none of them a loop, none of them shared.

**6.2.** `useCollectionOwnership` matches by `card_name.toLowerCase().trim()`
while `deck_cards` carries `card_id` and `user_collections` carries `card_id`
too. Name matching is arguably the right rule for "do I own this card in any
printing", but it means a name whose punctuation differs between the two tables
misses, and it forfeits the set and condition the id would give you.

---

## 7. What to do with this, in order

Each of these is inside the file ownership boundary.

1. **Delete the six dead files**, after lifting `ArchetypeLibrary`'s archetype
   catalogue somewhere live. 1,672 lines, and it takes the last raw Tailwind
   hues in the directory with it.
2. **One chat, one match panel.** Drop `AIAnalysisPanel`, move
   `CardRecommendationDisplay` into `BrainAnalysis`, and fold `MatchAnalytics`
   into `EnhancedMatchTracker` so the Record tab makes one query and cannot
   print two win rates. This also removes the stale-after-logging bug in 3.4.
3. **Make the count sentences agree** (3.1). Word it, do not re-derive it.
4. **Fix `computeDeckStats.avgManaValue`** (3.2), or delete the field. It is
   wrong and unread, which is the cheapest possible time to fix it.
5. **Legality onto the house vocabulary**, and give `DeckValidationPanel` the
   remove and replace handlers the panel beside it already has. It is the
   furthest tab from the standard and the one where the fix is also a feature.
6. **Drop `ComprehensiveAnalytics`** and have `PublicDeck` mount its four
   children directly, which also takes the AI chat box off the public page.
7. **Wire the Mana curve to the Cards filter.** Both sides exist. It is the
   cheapest thing on this list that makes a read-only tab into a tool.
8. **Persist `user_decks.archetype`** from `ArchetypeDetection`, then filter My
   Decks on it.
9. **Price history on the Value tab.** The table, the query and the chart all
   exist and no deck surface touches them. It is the largest single gap between
   what this app knows and what it shows, and it is a figure neither Moxfield
   nor Archidekt gives away.
10. **Decide about `src/engine/advise`.** A tested local recommender that no tab
    calls is either the Add tab's ranking and the Analysis tab's suggestions, or
    it is dead code with a test suite. It cannot stay both.

Items 1 to 8 are inside `src/components/deck**`, `src/pages/Deck*.tsx` and
`src/lib/deck/**`. Item 9 needs a read of `card_price_history` and no schema
change. Item 10 needs a decision before it needs code.

**Not on this list, on purpose:** custom categories, maybeboard, per-card
printing and version history are the four things Moxfield and Archidekt have
that this cannot build without a migration. They are named in section 4 so
nobody rediscovers them as UI work.
