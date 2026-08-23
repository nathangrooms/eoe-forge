# One deck page: the inventory

Inventory only. **No page was changed by this pass.** No file under `src/` was
edited.

Written 22 Aug 2026, against the tree at that date.

---

## How this was established, and what it is not

Everything below was read out of the source. The app was **not** run for this
pass, no browser was driven, and no query was sent to Supabase. So:

- Where I say a control exists, I name the file and the line it is drawn at.
- Where I say two figures disagree, I give **both formulas as they are written**
  and the input each one is handed. That is a derivation, not a screenshot. It
  is enough to prove a disagreement exists, because the two expressions are
  provably different over the same deck. It is not enough to say by how much on
  any particular deck, so I do not say that.
- Where a number lives in SQL I read the migration. Where I could not read it, I
  say so rather than guessing.

Nothing here is a measurement of pixels or of request counts on a live page. The
pixel work in `CONSISTENCY.md` was done that way and this pass was not, and the
two must not be confused.

Files read in full or in the relevant part:

```
src/pages/DeckInterface.tsx            src/pages/DeckBuilder.tsx
src/pages/DeckAnalysis.tsx             src/pages/DeckExport.tsx
src/pages/DeckShare.tsx                src/pages/DeckMissingCards.tsx
src/pages/DeckCommander.tsx            src/pages/Decks.tsx
src/components/deck/*                  src/components/deck-builder/*
src/components/listing/*               src/stores/deckStore.ts
src/lib/deck/*                         src/lib/api/deckAPI.ts
supabase/migrations/20260819121000_deck_summary_counts_real_mana_sources.sql
```

---

## 1. What exists today: five destinations for one object

`/deck/:id` and `/deck-builder?deck=x` are the two the owner named. They are not
the whole surface. One deck currently has **five** destinations plus a tile menu,
and every one of them recomputes some of the same numbers.

| Route | File | What it is |
|---|---|---|
| `/deck/:id` | `pages/DeckInterface.tsx`, 826 lines | The view page. Eight tabs. Read only. |
| `/deck-builder?deck=x` | `pages/DeckBuilder.tsx`, 1323 lines | The editor. Seven tabs. |
| `/deck/:id/analysis` | `pages/DeckAnalysis.tsx` -> `DeckAnalysisView`, 327 lines | A **third** analysis surface with five sub tabs of its own. |
| `/deck/:id/export` | `DeckExportPanel`, 140 lines | Export, from the database. |
| `/deck/:id/share` | `DeckSharePanel`, 289 lines | Publish, slug, QR, view analytics, disable. |
| `/deck/:id/missing` | `MissingCardsPanel`, 457 lines | The shopping list. Also embedded in the view page's Value tab. |
| `/deck-builder/commander` | `pages/DeckCommander.tsx` -> `CommanderSelector` | The commander picker, reached only from the builder's commander block. |

The tile on `/decks` (`components/deck/DeckTile.tsx`) fans out to all of them:
Open goes to `/deck/:id`, Edit goes to `/deck-builder?deck=`, and the overflow
menu holds Playtest (`/simulate?deck=`), Missing cards, Share, Duplicate, Export
and Delete. **Duplicate and Delete exist nowhere else.** Neither the view page
nor the editor can delete or copy the deck it is showing.

`pages/PublicDeck.tsx` is a sixth renderer of the same decklist for logged out
readers. It is out of scope for the merge but it constrains it, because it
mounts `DeckCardGrid` and `DeckCardTable` with no edit callbacks at all. Any
edit affordance added to those two has to be optional, the way `playabilityFor`
already is.

---

## 2. Exhaustive inventory: `/deck/:id`, the view page

### 2.1 Header (`StandardPageLayout`)

| Element | Detail |
|---|---|
| Breadcrumb | Drawn by the layout, because `/deck/:id` is a nested route |
| Title | `deck.name`, plain text, not editable |
| Description line | `${formatLabel(format)} · ${stats.totalCards} cards` |
| Action: Favorite | Toggles a `favorite_decks` row, `variant="secondary"`, heart fills when set |
| Action: Export | Routes to `/deck/:id/export` |
| Action: Edit deck | Routes to `/deck-builder?deck=` |

### 2.2 The commander block, full width

`CommanderHero` at `size="xl"` inside a `Card`, drawn through `CardImage` so the
whole card is shown and never cropped. Beside it:

- The word Commander with a crown, or "No commander"
- Commander name at `text-xl`/`text-2xl`, plus `ManaCost`
- Type line
- `OracleText` at `size="xs"`
- **`deck.description`**, the only place in the product that renders it
- Colour identity label plus `ColorIdentity` pips
- `PowerScore variant="compact"`, gated on `usesPowerLevel(format)`
- **Average playability tile**: a button, `playability.averagePct` at `text-3xl`,
  the scored spell count, the count under threshold, the mana source count and
  the library size. Clicking it selects the Mana tab. Computed locally by
  `createPlayabilityEngine`, memoised per distinct mana cost.

Clicking the hero opens the commander's card page, or the builder when there is
no commander.

### 2.3 The metric strip

`DeckQuickStats` (shared with the builder). `MetricRow` with four slots:

1. **Cards** `displayCards / 100` with a completion meter and the format under it
2. **Est. value** `$N`, or a dash when zero, subtext "market, USD"
3. **Avg mana value** two decimals, subtext "nonland cards"
4. **Colour identity** as a `MetricTile` holding `ColorIdentity`

Then two `Card p-3` blocks: **From your collection** (a progress bar, the owned
percentage, the missing copy count, a real empty state when there is no
collection data) and **Type breakdown** (one icon, count and label per present
category).

### 2.4 The stale metadata notice

When `stats.missingMetadata > 0`, a tinted block saying how many cards have no
row in the local `cards` table and that their mana value and price are excluded
from the totals above. Surface tint, no hairline.

### 2.5 Tabs (`PageTabs`, URL synced through `?tab=`)

Eight, named for the question rather than the component, each with a two word
hint. `edh` is dropped for a format that has no bracket. `?tab=visual` and
`?tab=list` are honoured as legacy aliases that land on Cards.

**Cards** (`DeckCardsPanel`, count badge on the tab)
- `FilterBar` holding `ListingSearch` (debounced, borderless) with the
  placeholder "Search this deck by name, type or rules text"
- Facet rows, **always open**, each chip carrying a live count computed from the
  deck: category, colour, mana value, rarity, price, playability band
- Clear control, appearing when `activeCount > 0`, the search box counting as one
- `ListingFrame` with the shared sentence `84 of 100 cards` and a shared empty
  state that offers to clear the filters
- View toggle: Visual / Table, in the URL through `?view=`
- Visual is `DeckCardGrid`: grouped by canonical category, lands collapsed by
  default, `CardImage size="lg"` at the true 5:7 ratio, a `PlayabilityFlag` on
  the art, `ManaCost`, a `PlayabilityMeter` and a `PriceTag` under each card
- Table is `DeckCardTable` with the same castability columns
- A card click goes to `/cards/:id`
- **No quantity control, no add, no remove, no replace, no sort, no grouping,
  no size slider, no text mode.**

**Mana**
- `ManaCurve` at `height={200}`, exact per card, lands and the commander excluded
- `ManaSourcesPanel`, fed the local `playabilityEngine.profile`
- `LandEnhancerUX`, fed the power entries and the identity

**EDH** (conditional)
- `PowerScore variant="expanded"`
- `CommanderPowerDisplay` and `PowerSliderCoaching` side by side
- `EdhAnalysisPanel`, **read only**, showing the last cached scrape. Its Refresh
  button routes to the builder.

**Analysis**
- `ArchetypeDetection`
- `EnhancedDeckAnalysisPanel` (which contains its own six sub tabs: Mana Curve,
  Land Base, Synergy, Validation, Suggestions, AI)
- `BrainAnalysis`

**Legality**
- `DeckValidationPanel`
- `DeckCompatibilityChecker`, **with no `onRemoveCard`**, so it can name a colour
  identity violation and cannot fix it

**Value**
- `DeckBudgetTracker` with `targetBudget={200}`
- `MissingCardsPanel`, the same component `/deck/:id/missing` renders

**Primer**
- `DeckPrimerGenerator`, four long form fields, expands in place

**Matches**
- `EnhancedMatchTracker`, `MatchAnalytics`, `DeckNotesPanel`

### 2.6 Behaviour

- Loading is three skeleton cards with `motion-reduce:animate-none`
- Not found is a card with a route back to `/decks`
- Empty tabs use a local `needsCards(what)` card that links to the builder
- `persistDeckPower` is fired on every load once the score resolves

---

## 3. Exhaustive inventory: `/deck-builder?deck=x`, the editor

### 3.1 Header

| Element | Detail |
|---|---|
| Title | `deck.name` plus a pencil that swaps the title for an `Input`. Enter saves, Escape cancels. In place, no dialog. |
| Description line | `${formatLabel(format)} • ${displayedCardCount} cards` |
| Action | All decks, routing to `/decks` |

No favourite. No share. No export link. No delete. No duplicate.

### 3.2 Above the tabs

- `PowerScore variant="compact"`, commander formats only
- `DeckQuickStats`, the same component the view page mounts, different inputs
- **The edhpowerlevel.com strip**: the label "edhpowerlevel.com says", the
  scraped figure at one decimal, a "Cards changed since this check" badge, a
  Calculate / Refresh button that invokes the `edh-power-check` edge function
  and caches the result on `user_decks.edh_analysis`, a Details link to the
  built decklist URL, the `comparePower` divergence note when it is worth
  showing, and a five figure `dl` of the scrape's own metrics (Tipping point,
  Efficiency, Impact, Score, Playability)

### 3.3 Tabs (`DeckBuilderTabs` -> `PageTabs`, React state only, not in the URL)

Seven. `ai` is hidden when the `ai_deck_optimizer` flag is off.

**Cards** (`VisualDeckView`, count badge)
- Commander block: `CardImage size="lg"`, name, type line, oracle text in a
  scrolling box, mana cost, colour identity, a power/toughness badge, a loyalty
  badge, and a **Change** button routing to `/deck-builder/commander` carrying
  `state.from`. When there is no commander, an empty state with Select commander.
- A single **Filter and sort** toggle, closed by default, with the count line
  `84 of 100 cards` on the right and a "Clear ..." link when a search is live
- Behind the toggle: `FilterBar` with `ListingSearch` ("Filter cards in this
  deck"), a **Group by** select (Card type / Colour / Mana value / No grouping),
  a `SortControl` over five axes (Mana value, Name, Copies, Price, Type) with a
  direction toggle, a **card size slider**, and a three way view toggle
- Grid mode: cards at the slider's width, a `×N` badge, and a hover cluster with
  minus, a **quantity input**, plus, **Replace** and **delete all copies**
- Table mode: quantity input, name, cost, mana value, type, set, price, and
  Replace and delete on hover
- Text mode: the whole decklist as plain text in a `Textarea` with a
  **Copy decklist** button, headed by `// Group` lines from the current grouping
- Collapsible group headers with counts
- Copy limits enforced at increment and on typed input, through `maxCopiesFor`
- `showCommander` prop, turned off by the deck generator
- A card click goes to `/cards/:id`

**Add Cards**
- A banner: either "Adding cards to <deck>" with the format, count and colour
  identity, or "Replacing <card>" with a Cancel
- `EnhancedUniversalCardSearch mode="pick"`: click adds and the page stays put,
  the eye opens the card page. Filters on, add button on, view modes on,
  wishlist button off.
- `handleAddCardToDeck` enforces colour identity and copy limit before the add,
  and refuses with a reason
- The replace path only removes the old card once the new one is accepted

**Analysis**
- `PowerScore variant="expanded"`
- `CommanderPowerDisplay` and `PowerSliderCoaching`
- `LandEnhancerUX`
- `EdhAnalysisPanel` **with** a working refresh
- `DeckCompatibilityChecker` **with `onRemoveCard` wired**
- `DeckValidationPanel`
- `ArchetypeDetection`
- `DeckBudgetTracker`
- `EnhancedDeckAnalysisPanel`
- `EnhancedMatchTracker`, `MatchAnalytics`, `DeckNotesPanel`

**Optimizer** (`ai`, feature flagged)
- `AIOptimizerPanel`, 1867 lines: five numbered steps (Overview, Ideas, Cut,
  Swaps, Lands), reordered to put Lands second when the edge function reports
  land slots among the empty ones. Cut is always available. A visible save with
  four states. Prices on lands. Castability from the tested engine. Apply paces
  Scryfall lookups at 120ms, skips the empty add sentinel, and never removes a
  card before its replacement is in hand.
- `DeckPrimerGenerator`, mounted **inside this tab**, so it disappears with the
  feature flag

**Import/Export**
- `DeckImportExport`: a paste box, a parser from `@/lib/decklist` with errors and
  warnings, and an export half offering Text, CSV, MTG Arena, MTGO
- `EnhancedDeckExport`: a second exporter offering Text, Moxfield and JSON with
  four switches (include commander, include sideboard, include prices, group by
  type)

**Proxies**
- `DeckProxyGenerator`, 689 lines: card selection, paper size, image quality,
  cut guides, a DOM print sheet and a PDF export drawn at the same millimetre
  geometry

**Playtest**
- `QuickDeckTester`: opening hand, mulligan counter, hand statistics

### 3.4 Behaviour

- Loading is a spinning icon and the words "Loading deck..."
- Arriving without a `deck` parameter redirects to `/decks`
- Autosave, see section 7
- `persistDeckPower` on a 1500ms debounce

---

## 4. ONLY ON THE VIEW PAGE

Everything here has to survive the merge, and the merged page is built on this
page's shape, so most of it survives by staying put.

1. **`CommanderHero` at `xl`**, the commander drawn whole and large.
2. **The deck description**, rendered under the commander. Rendered nowhere else
   in the product.
3. **`PowerScore compact` in the header row** rather than above the metric strip.
4. **The average playability tile**, and with it the entire local castability
   engine on this page: `createPlayabilityEngine`, `PlayabilityMeter`,
   `PlayabilityFlag`, the playability facet band, and the per card figure in
   both the grid and the table.
5. **`ManaSourcesPanel`**, the source density read.
6. **`ManaCurve`**, the segmented per type curve. The builder has no curve of its
   own; the only curve it draws is the one inside `EnhancedDeckAnalysisPanel`.
7. **Always open facet rows with live counts** over the decklist: category,
   colour, mana value, rarity, price, playability.
8. **The shared count sentence and the shared empty state** over the decklist.
9. **Tabs in the URL**, so a deck link can carry the tab it was read on, and Back
   steps out of a tab.
10. **The view mode in the URL** (`?view=table`), and the legacy `?tab=list`
    alias.
11. **The stale metadata notice**.
12. **Favourite**.
13. **Export**, as a header action.
14. **Named tabs for Legality, Value, Primer and Matches**. On the builder these
    four are panels stacked inside Analysis and the Optimizer tab.
15. **The skeleton loading state**.
16. **Sideboard rows are read and respected.** `fetchDeckCards` returns
    `is_sideboard` and every consumer on this page filters on it.

## 5. ONLY ON THE EDITOR

1. **Add a card.** `EnhancedUniversalCardSearch mode="pick"` with colour identity
   and copy limit enforcement.
2. **Replace a card.** Sets `cardToReplace`, switches to the search tab, swaps on
   accept only.
3. **Change quantity.** Plus, minus, and a typed input, in both grid and table.
4. **Remove all copies.**
5. **Choose or change the commander.** The Change button and the picker route.
6. **Rename the deck**, in place.
7. **Group the decklist** by type, colour or mana value.
8. **Sort the decklist** on five axes in both directions.
9. **Resize the cards.**
10. **Text mode** with Copy decklist.
11. **The optimiser**, `AIOptimizerPanel`.
12. **Import a decklist.**
13. **`EnhancedDeckExport`**, the only exporter that offers JSON, Moxfield and the
    four content switches.
14. **Proxies.**
15. **Playtest** (`QuickDeckTester`).
16. **Run the edhpowerlevel.com check.** The view page can only read the cache.
17. **`DeckCompatibilityChecker` that can actually remove the offending card.**
18. **Feature flag gating** on the Optimizer tab.
19. **Autosave**, and the beforeunload flush.

## 6. ON BOTH, and which one wins

Twenty six overlaps. The verdict column is the recommendation for the merged
page; the reason column is the evidence.

### 6.1 Shell and header

| # | Thing | Verdict | Why |
|---|---|---|---|
| 1 | `StandardPageLayout` | Identical, no decision | Both mount it with title, description and action |
| 2 | Deck title | **View page's, plus the builder's pencil** | The view page's title is plain and the builder's can be edited in place with no dialog. One is a subset of the other, so take both. |
| 3 | The card count in the description | **View page's** | View: `computeDeckStats(cards).totalCards`, summed over the same rows every panel on the page reads, sideboard excluded explicitly. Builder: `deck.totalCards + (commander ? 1 : 0)`, a special case that exists only because the store holds the commander outside the card list. The view page's needs no special case. |
| 4 | Header actions | **View page's set** | Favorite, Export, Edit. The builder offers only All decks, which the breadcrumb already provides. |
| 5 | Loading state | **View page's** | Skeletons that reserve the layout, and `motion-reduce:animate-none`. The builder spins an icon. |

### 6.2 The commander

| # | Thing | Verdict | Why |
|---|---|---|---|
| 6 | The commander block | **View page's `CommanderHero`, gaining three things from the builder** | The hero is larger, drawn through `CardImage`, and carries the deck description and the colour identity read. What the builder has and it does not: the **Change** control, the power/toughness badge and the loyalty badge. Three small additions against a whole block. |
| 7 | The commander picker | **Keep the route**, rehome it under `/deck/:id/commander` | Only one implementation, mounted from the builder's Change button. It already carries `state.from` so the back control returns exactly where it came from. |

### 6.3 The numbers

| # | Thing | Verdict | Why |
|---|---|---|---|
| 8 | `DeckQuickStats` | **Same component both sides. Take the view page's inputs.** | See section 7.1. The builder feeds it the commander inside the average mana value and excludes the commander from the ownership check; the view page does the opposite on both, and the view page's choice is the one that matches `ManaCurve` and the community convention. |
| 9 | `PowerScore compact` | **View page's placement** | In the header row beside the commander rather than as a band above the metric strip. Same component. |
| 10 | `PowerScore expanded` | **One mounting, on EDH** | Currently on the view page's EDH tab, the builder's Analysis tab, and the `/deck/:id/analysis` Power sub tab. Three. |
| 11 | The power computation | **View page's input path** | Same engine both sides. `entriesFromDeckRows` reads `legalities`, `is_legendary`, `keywords`, `power` and `toughness` straight off the joined `cards` row. `entriesFromStoreCards` reads a store card, and a card added in this session through `handleAddCardToDeck` (`DeckBuilder.tsx:383-404`) carries **no `legalities`, no `power`, no `toughness` and no `keywords`** (it writes `mechanics` instead). A loaded deck's store cards do carry them, so the divergence is between a card you just added and the same card after a reload. |
| 12 | The edhpowerlevel.com second opinion | **Builder's** | It is the only one that can run the check. The view page's copy is read only and its Refresh button navigates away to the builder, which is the fork this merge exists to remove. |

### 6.4 The decklist

| # | Thing | Verdict | Why |
|---|---|---|---|
| 13 | The card list surface | **View page's `DeckCardsPanel` shell, builder's controls inside it** | `DeckCardsPanel` gives the shared `FilterBar`, the shared `ListingFrame`, the shared count sentence, the shared empty state, castability, `PriceTag`, canonical grouping and the URL backed view mode. `VisualDeckView` gives quantity, replace, delete, group by, sort, size and text mode. Neither is a superset. The shell is the harder half to rebuild and it is already the shared vocabulary, so it is the base. |
| 14 | The grid | **`DeckCardGrid`, gaining two things** | It draws the true 5:7 ratio, groups through the canonical categoriser, and carries the castability meter and the price. What it lacks: `VisualDeckView`'s hover control cluster, and a width. `DeckCardGrid` hardcodes `size="lg"`; the builder's grid takes `prefs.cardSize` from the slider. Both gaps are props. |
| 15 | The table | **`DeckCardTable`, gaining the quantity, replace and delete cell** | 379 lines against 60, and it already carries castability and the mana profile. |
| 16 | The text decklist | **Keep it as a third view mode, but generate it with `serializeDeck`** | `VisualDeckView` builds its own text with `// Group` headings from the current grouping. `lib/deck/deckSerialize.ts` builds the same thing for `/deck/:id/export`. Two text decklists for one deck is exactly the duplicate the owner is calling out. Keep the mode, keep the Copy button, drop the private serializer. |
| 17 | Filter placement over the decklist | **The one call I would put back to the owner.** My recommendation: closed by default, with the view page's facets behind it and the count on the trigger. | The two pages carry two owner quotes pointing opposite ways. `DeckCardFilters.tsx:18-33` argues facets with live counts are a map of the deck and hiding a map defeats it. `VisualDeckView.tsx:600-608` quotes the owner directly: "dont need all those filters by default". The merged page is the build surface, which is the surface the second quote was about, so I would take it. But it does cost the map, and that is worth one sentence from the owner rather than my guess. |
| 18 | Search over the decklist | **Identical, no decision** | Both already mount `ListingSearch` through `FilterBar`. Placeholders differ ("Search this deck by name, type or rules text" against "Filter cards in this deck"); take the first, since twenty placeholders in the product say Search and three say Filter. |
| 19 | The count line | **Identical, no decision** | Both call `resultSentence([matchedLabel(...)])`. |
| 20 | Card click behaviour | **Identical, no decision** | Both use `useOpenCard` and land on `/cards/:id`. The Add surface keeps `mode="pick"`, which is a documented exception and must not be unified. |

### 6.5 The panels

| # | Thing | Verdict | Why |
|---|---|---|---|
| 21 | `DeckValidationPanel` | **Builder's input, view page's placement (the Legality tab)** | Same component. `DeckLegalityChecker` reads `card.legalities` at six places (`legality-checker.ts:184,237,275,307,388`). The builder passes `deck.cards`, which for a loaded deck carry real legalities from `loadDeck`. The view page passes `analyticsDeck`, whose mapping in `DeckInterface.tsx:277-307` **does not include `legalities` at all**. So the view page's legality check cannot report a banned card, and the builder's can. This is the one figure where the builder's input is the better one. |
| 22 | `DeckCompatibilityChecker` | **Builder's wiring, view page's placement** | Identical component. The builder passes `onRemoveCard` and can fix the violation; the view page names it and stops. That is instruction 2 in one component. |
| 23 | `ArchetypeDetection`, `EnhancedDeckAnalysisPanel`, `BrainAnalysis` | **View page's Analysis tab** | Same components. The view page passes `mainboard` (commander excluded, sideboard excluded) plus an explicit `commander`; the builder passes `deck.cards` plus the store commander, which amounts to the same split. `BrainAnalysis` is on the view page only. |
| 24 | `LandEnhancerUX` | **View page's Mana tab** | Three mountings today: view Mana, builder Analysis, and the `/deck/:id/analysis` Coaching sub tab. It answers "can I cast my spells", which is the Mana tab's question. |
| 25 | `CommanderPowerDisplay` and `PowerSliderCoaching` | **View page's EDH tab** | Identical pair, identical two column grid, in both files. |
| 26 | `DeckBudgetTracker` | **View page's Value tab, and fix the maths** | Same component, `targetBudget={200}` on both. Its total is wrong on both. See 7.2. |
| 27 | `MissingCardsPanel` | **View page's Value tab. Turn `/deck/:id/missing` into a redirect.** | Same component, loading by `deckId`, mounted twice in the product. The route exists so the tile menu can link to it; a redirect to `?tab=value` keeps that link alive and removes the destination. |
| 28 | `DeckPrimerGenerator` | **View page's Primer tab** | Same component. On the builder it lives inside the Optimizer tab, so turning off the `ai_deck_optimizer` flag takes the primer with it. That is an accident, not a decision. |
| 29 | `EnhancedMatchTracker`, `MatchAnalytics`, `DeckNotesPanel` | **View page's Matches tab** | The same three components in the same order on both pages. On the builder they are the bottom of a very long Analysis tab. |
| 30 | Export | **`DeckExportPanel` / `deckSerialize`, gaining `EnhancedDeckExport`'s formats and switches** | Three implementations. `DeckExportPanel` reads the deck from the database through `fetchDeckCards`, so it is correct whatever the store holds, and it uses one module with one format list (Plain text, MTG Arena, Magic Online, CSV). `EnhancedDeckExport` hand rolls its generators but is the only one with **JSON**, **Moxfield** and the four switches (include commander, include sideboard, include prices, group by type). `DeckImportExport`'s export half (Text, CSV, Arena, MTGO) is a straight duplicate of the first and can go; its **import** half stays, and is the only importer. |
| 31 | Empty states | **`EmptyState` from the shared vocabulary** | Neither page uses it on these tabs. The view page has a local `needsCards(what)` card; the builder has centred `<p>` pairs. `VisualDeckView` already uses the shared one, which is the proof it fits. |
| 32 | The tab strip | **View page's** | Both mount `PageTabs`, so the skin is already one decision. The view page's tabs are named for the question, carry a hint line, and live in the URL. The builder's live in React state, so a reload lands you back on Cards and there is no link to the Optimizer. |

### 6.6 The third analysis surface

`/deck/:id/analysis` is not "on both", it is a third. Every one of its five sub
tabs is answered elsewhere, from a different source:

| Sub tab | What it draws | Already answered by | Source it uses instead |
|---|---|---|---|
| Power | `PowerScore expanded` | View EDH tab | Same engine, same input. No conflict. |
| Coaching | `PowerSliderCoaching` + `LandEnhancerUX` | View EDH and Mana tabs | Same. No conflict. |
| Mana curve | Its own bar list | View Mana tab (`ManaCurve`) | **`deckSummary.curve.bins` from the RPC.** Different bins, different denominator. See 7.1. |
| Types | Its own percentage bars | `DeckQuickStats` type breakdown | **`deckSummary.counts` from the RPC**, which uses overlapping `LIKE` tests. See 7.3. |
| Mana base | Its own colour source bars | View Mana tab (`ManaSourcesPanel`) | **`deckSummary.mana.sources` from the RPC**, counted by what lands produce. The panel counts from the local playability profile. |

The one thing on it that exists nowhere else is the **percentage** on the type
bars (`12 · 12%`). `DeckQuickStats` prints counts only. Carry the percentage
across and the route becomes a redirect.

---

## 7. Figures computed twice, checked for agreement

This is the section the owner's "if it overlaps it can go" depends on, because
two of these disagreements are bugs that have been hiding behind two pages.

### 7.1 Average mana value: three implementations, two of them disagree

**View page** (`DeckInterface.tsx:384-402`). Over `mainboard`, which is
`analyticsDeck` filtered to `category !== 'commanders'`, itself filtered to
`!is_sideboard`. Skips `lands`. Exact per card.

```
avg = sum(cmc * qty over nonland, noncommander, nonsideboard)
    / sum(qty over nonland, noncommander, nonsideboard)
```

**Builder** (`DeckBuilder.tsx:708-745`). Explicitly appends the commander to the
card list first:

```ts
const cards = [...deck.cards, ...(deck.commander ? [{...deck.commander, quantity: 1, is_commander: true}] : [])];
...
if (category !== 'lands') { totalCmc += (card.cmc || 0) * qty; nonLandCount += qty; }
```

```
avg = (sum(cmc * qty over nonland) + commander.cmc) / (sum(qty over nonland) + 1)
```

**They cannot agree on any commander deck whose commander's mana value differs
from the mainboard average.** Same deck, same tile, same label "Avg mana value",
two numbers, one click apart. The view page's is the correct one: `ManaCurve`
excludes both lands and commanders (`ManaCurve.tsx:55`), and the view page's own
comment records that feeding the tile one denominator and the plot the other is
what produced "2.13" beside a curve captioned "avg 2.10".

**`/deck/:id/analysis`** is the third: `averageManaValue(deckSummary.curve.bins,
lands)` in `lib/deck/curve.ts`. It is a bucket midpoint approximation (`0-1` is
counted as 0.5), it removes lands by subtracting the land count from the `0-1`
bucket, and the bins come from a SQL query with **no `is_commander` and no
`is_sideboard` filter** (migration `20260819121000`, the second `SELECT` block).
So it includes the commander, includes the sideboard, and approximates. Its
label already says "Avg MV" rather than claiming exactness, which is honest, but
it is still a third number for one deck.

### 7.2 Deck value: four implementations, one of them ignores quantity

| Where | Expression | Commander | Sideboard | Multiplies by quantity |
|---|---|---|---|---|
| View page tile | `computeDeckStats().totalValueUSD`, `deckCards.ts:162-199` | included | excluded | **yes** |
| Builder tile | `deckStats.totalValue`, `DeckBuilder.tsx:708-745` | included | n/a (the store has no sideboard) | **yes** |
| Deck tile on `/decks` | `economy.priceUSD` from `compute_deck_summary` | included | **included** | **yes** |
| **Value tab, `DeckBudgetTracker`** | `deckCards.reduce((sum, card) => sum + parseFloat(card.prices?.usd \|\| '0'), 0)`, `DeckBudgetTracker.tsx:20-23` | excluded on the view page (it is passed `mainboard`) | excluded | **no** |

`DeckBudgetTracker` sums one price per distinct card. For a singleton Commander
deck the only error is basic lands, which are cheap, so it has been almost right
for the format the product is mostly used for. For any deck with four ofs it
undercounts badly, and its derived figures inherit the error: `top5Percent`,
`percentUsed`, `remaining` and the over budget test are all built on it. Its
`byRarity` roll up has the same omission.

So on the view page today, the Est. value tile and the Value tab's total are two
different numbers for one deck, and neither of them is the number the tile on
`/decks` shows.

The three quantity aware ones still differ on scope: the tile on `/decks`
includes sideboard cards and the deck page excludes them. For a deck with no
sideboard they agree, which is why nobody has noticed.

### 7.3 Type counts: three implementations, one with overlapping buckets

- **`lib/deck/cardCategories.ts`**, one bucket per card, precedence land,
  battle, planeswalker, creature, artifact, enchantment, instant, sorcery,
  other, plus a `sideboard` bucket. Used by `DeckCardGrid`, `DeckCardTable`,
  the deck filters.
- **`components/deck-builder/deck-categories.ts`**, one bucket per card,
  precedence land, battle, planeswalker, creature, **instant, sorcery,
  artifact, enchantment**, other. No sideboard bucket. Used by
  `DeckQuickStats`, `ManaCurve`, `VisualDeckView`.
  Both files' doc comments describe themselves as the single canonical
  categoriser. The precedence orders differ in the last four entries. I looked
  for a real type line where the two orders would disagree and did not find
  one, because a printed card is not both an instant and an artifact, so
  **today the observable differences are the `sideboard` bucket and the input
  shape** (one takes a type line string plus options, the other takes a card
  object and also honours `category === 'commanders'`). Two files, one job.
- **`compute_deck_summary`** in SQL, using `LIKE '%land%'`, `LIKE '%creature%'`,
  `LIKE '%artifact%' AND NOT LIKE '%creature%'` and so on, evaluated
  independently. **These buckets overlap.** An artifact land counts as a land
  and is excluded from artifacts only if it is also a creature. An enchantment
  creature counts as a creature and as an enchantment. The counts can sum to
  more than the deck. This is exactly the failure `cardCategories.ts`'s own
  comment says it was written to fix, still live in the database, and it feeds
  the deck tile and `/deck/:id/analysis`.
- A fourth, inline, in `deckStore.loadDeck` (`deckStore.ts:555-576`), with
  **creature before land**, so a land that is also a creature is filed as a
  creature. It sets `Card.category`, which is then only consulted for
  `commanders`, so the impact today is small. It still contradicts the comment
  in `deck-categories.ts` claiming everything imports that file.

### 7.4 Mana sources: two implementations

The view page's Mana tab counts sources from `playabilityEngine.profile`, built
from the decklist in memory. `/deck/:id/analysis` reads
`deckSummary.mana.sources`, built in SQL by `card_mana_produced(c.*)` over
maindeck lands only. The SQL one is lands only by construction; the local engine
is built from `rowsToPlayabilityInputs`. Two answers to "how many white sources
does this deck have". I did not run either, so I cannot say by how much they
differ, only that they are separately derived.

### 7.5 Legality: three implementations, one that cannot fail

1. `DeckLegalityChecker` inside `DeckValidationPanel`. Reads `card.legalities`.
   Real.
2. `FormatValidator` inside `EnhancedDeckAnalysisPanel`'s Validation sub tab.
   Its input mapping (`EnhancedDeckAnalysis.tsx:73-84`) sets
   `legalities: { [format]: 'legal' as const }` **for every card**. It asserts
   the answer as an input. It is on both pages, one tab away from a validator
   that does the real check, and it will always say Format Legal for card
   legality.
3. `legality.issues` from `compute_deck_summary`, which does a genuine colour
   identity check in SQL and surfaces on `/deck/:id/analysis`'s Mana base tab
   and on the deck tile.

### 7.6 Ownership percentage

Same hook (`useCollectionOwnership`) both sides, different lists:

- View page (`DeckInterface.tsx:363-371`): every non sideboard row, **commander
  included**.
- Builder (`DeckBuilder.tsx:670-673`): `deck.cards`, **commander excluded**,
  because the store holds it elsewhere.

Different denominators, so different percentages and different missing counts
for the same deck and the same collection.

### 7.7 The card count

These do agree. The view page's `stats.totalCards` counts every non sideboard
row, and the builder's `displayedCardCount` is `totalCards + 1` for a commander
deck. Both land on 100. The builder needs the special case only because of the
store's shape.

---

## 8. Two more things found while reading, both merge relevant

### 8.1 The builder overwrites the deck description on every save

`deckStore.updateDeck` writes:

```ts
description: `${state.format} deck with ${state.totalCards} cards`,
```

(`deckStore.ts:730`). The description is displayed only on the view page, under
the commander, as the deck's own prose. It is editable nowhere. So any deck ever
opened in the builder has had whatever was there replaced with "commander deck
with 99 cards", and the view page renders that as if the owner wrote it. The
merged page needs a description field or it needs to stop writing this one.

### 8.2 The builder cannot represent a sideboard, and flattens one

`deckStore.loadDeck` reads `is_sideboard` off each row and then pushes every non
commander card into the same `cards` array with no sideboard flag
(`deckStore.ts:614-618`). The store's `Card` interface has no `is_sideboard`
field. `updateDeck` then upserts every card with `is_sideboard: false`
(`deckStore.ts:804`).

So opening a deck that has sideboard rows in the builder and letting the
autosave fire folds the sideboard into the maindeck permanently. The view page,
`fetchDeckCards`, `deckSerialize`, `EnhancedDeckExport` and `MissingCardsPanel`
all handle `is_sideboard` correctly, which is what makes this asymmetry
dangerous rather than merely incomplete.

Neither page offers any way to **put** a card in the sideboard. That is a gap,
not a lost feature, but the merged page must not make it worse.

---

## 9. The save path count

This is a count of code paths, not a measurement of requests on a running page.
The measurement is owed in the build phase.

Paths that can call `deckStore.updateDeck`:

| # | Trigger | Delay | Where |
|---|---|---|---|
| A | `addCard` on a card **already in the deck** | 500ms | `deckStore.ts:143-147` |
| B | `deck.cards` changing at all | 1000ms | `DeckBuilder.tsx:202-247` |
| C | `saveOptimiserChanges` | 400ms | `DeckBuilder.tsx:94-108` |
| D | `beforeunload` | immediate | `DeckBuilder.tsx:193-200` |
| E | Import | immediate, then B fires again | `DeckBuilder.tsx:1283-1292` |

The store's own comment at `deckStore.ts:159` says "Auto-save removed to prevent
race conditions. The parent component handles auto-save" and that is true of the
**new card** branch only. The **existing card** branch two lines above still
schedules its own save. So:

- Adding a copy of a card already in the deck fires **A and B**: two full saves.
- Applying an optimiser pass fires **C and B**: two full saves, plus
  `persistDeckPower` at 1500ms.
- Importing fires **E and B**: two full saves.

One `updateDeck` is not one request. Reading `deckStore.ts:704-822`, it is
`auth.getUser`, an `update` on `user_decks`, a `select` on `deck_cards`, a
conditional `delete`, a conditional commander `upsert`, and an `upsert` of
**every card in the deck**. Call it four to six round trips, one of which
rewrites all hundred rows. `persistDeckPower` is a further read then write
(`power.ts:198-229`).

The fix is one save owner. Delete path A, keep B as the only debounced writer,
and let C mark the pending state rather than start a second timer. What to
measure once it is one: the number of `deck_cards` requests for one optimiser
apply, before and after.

### That measurement, taken 23 Aug 2026, and the bug it found

`scripts/optimiser-apply-measure.mjs`, on the built bundle, driving the real
controls against a stateful PostgREST stand-in with Scryfall left real. Applying
**nine swaps in one press**:

| | before | after |
|---|---|---|
| Supabase requests | **28** (9 POST, 9 DELETE, 9 GET `user_collections`, 1 PATCH) | **4** (1 POST of 9 rows, 1 DELETE of 9 rows, 1 GET `deck_cards`, 1 PATCH) |
| landed in `deck_cards` | 9 of 9 | 9 of 9 |
| landed **on screen** | **1 of 9** | **9 of 9** |
| auto optimise receipt | "**16 cards did not move**" | "9 cards out", **0** did not move |

One swap is 4 requests before and after, so nothing about the single case moved.

**The owner's "apply 9 swaps does nothing" was half fixed and half misread.**
`ConfirmBar` had already dealt with the confirmation asking its question below
the fold, and that half holds: measured, the confirmation lands at 880px inside
a 1000px viewport. The other half was never a confirmation problem at all.

The deck page applied a list by looping it and calling a single-card edit per
row, awaiting each one. Every call in that loop is the same closure over the
same decklist, because React does not re-render while the loop is running, so
each iteration computed its result from the deck as it was **before the first
swap**. The last write won and the eight before it were painted over. The deck
really was rewritten; the page went on drawing the deck you already had, which
from a chair is indistinguishable from nothing having happened.

The auto pass had it worse, because its receipt is a diff of the decklist it can
see. It applied nine changes and then reported sixteen cards that "did not
move", beside an **Undo all of it** that would have reversed the one change it
could see and left the other eight in place permanently.

The fix is `useDeckEditor.applyReplacements`: resolve every incoming card first,
work the whole batch out against one snapshot that moves as it goes, then two
writes and a read back — so the decklist on screen when it finishes IS
`deck_cards` rather than a second opinion about it. The arithmetic lives in
`src/components/deck/replacementPlan.ts` with eleven tests in
`replacementPlan.test.ts`, the first of which is the fault above stated as a
ratchet.

---

## 10. The merged page

Route: **`/deck/:id`**. `/deck-builder?deck=x` redirects to it, carrying the
deck id. `/deck-builder` with no deck keeps redirecting to `/decks`.

The look is the view page's, unchanged in rhythm: breadcrumb, title line,
commander block, metric strip, tab strip, content. Every editing control arrives
inside a block that already exists rather than as a new band.

### Above the fold

```
breadcrumb
title  <deck name + pencil>        [Favourite] [Share] [Export] [More v]
       Commander · 100 cards

+-------------------+  Commander                        [Change]
|                   |  Ancient Copper Dragon  {4}{R}{G}
|   commander art   |  Legendary Creature - Dragon
|   drawn whole     |  <oracle text>
|   CardImage xl    |  <deck description>          Avg playability
|                   |  Colour identity  (R)(G)          71.4%
|                   |  Power  6.6 / 10                across 63 spells
+-------------------+                                   See Mana ->

[ Cards 100/100 ][ Est. value $412 ][ Avg mana value 3.14 ][ Colour identity ]
[ From your collection  ============------  68%   32 missing ]
[ Type breakdown   30 Creatures  10 Instants  ...           ]
```

- The title carries the builder's inline rename pencil.
- **More** holds Duplicate, Delete, Import, Proxies and Playtest. Duplicate and
  Delete are on the tile menu today and on neither page; the merged page is
  where they belong.
- The commander block gains **Change**, and the power/toughness and loyalty
  badges.
- The metric strip is `DeckQuickStats` with the view page's inputs and the
  corrected budget total.
- The edhpowerlevel.com strip does **not** go above the fold. It is a second
  opinion on one format and it costs a whole band. It moves to the EDH tab, with
  its Calculate, Refresh, Details, divergence note and five sub metrics intact.

### The tabs

Eight, in this order, all in the URL:

| Tab | Question | Contents |
|---|---|---|
| **Cards** | what is in this deck | The merged list. See below. |
| **Add** | what should go in it | `EnhancedUniversalCardSearch mode="pick"` with the identity and copy limit guards, and the Replacing banner |
| **Mana** | can I cast it | `ManaCurve`, `ManaSourcesPanel`, `LandEnhancerUX` |
| **EDH** | how strong is it | `PowerScore expanded`, `CommanderPowerDisplay`, `PowerSliderCoaching`, the edhpowerlevel strip and `EdhAnalysisPanel` with a working refresh |
| **Analysis** | how does it play | `ArchetypeDetection`, `EnhancedDeckAnalysisPanel`, `BrainAnalysis`, plus the type percentage bars rescued from `/deck/:id/analysis` |
| **Legality** | is it legal | `DeckValidationPanel` with real legalities, `DeckCompatibilityChecker` with its remove handler wired |
| **Value** | what does it cost | `DeckBudgetTracker` with the quantity fix, `MissingCardsPanel` |
| **Record** | what do I know about it | `DeckPrimerGenerator`, `EnhancedMatchTracker`, `MatchAnalytics`, `DeckNotesPanel` |

Primer and Matches are folded into **Record** because they are the same kind of
thing, notes a human writes about a deck. If eight will not sit on one line at
1600px, the next fold is Legality into Analysis, not a second row.

### CORRECTION, 23 Aug 2026: the Optimiser is not a tab

This section used to read *"The Optimiser stays a tab rather than becoming a
slide over. It is five numbered steps over card art with a save of its own, and
it needs the width."* The first half was wrong and the second half is the reason
why. It is **`/deck/:id/optimise`** now, and the header carries an **Optimise**
control beside Share and Export.

It was the seventh tab, then the third, and the position was never the problem.
Measured on the built bundle at 1600 x 1000:

| | before | after |
|---|---|---|
| links to it anywhere in `src/` | **0** (a grep for `tab=optimiser` found two comments and no hrefs) | 2: the deck header, and My Decks' tile menu |
| where the only door sat | the tab strip, which starts at **y=904** in a 1000px viewport | the header **Optimise** button at **y=122**, above the fold |
| what the door cost to reach | open a deck, scroll past the commander block, read nine tabs | one press |

Three arguments, in the order they matter:

1. **A tab strip is hostile to it.** A pass calls an edge function and takes
   about twenty-five seconds to produce. Every one of the other eight tabs
   unmounts the panel and throws that pass away, so the optimiser sat with eight
   controls directly above it that silently destroyed its work. On a route,
   leaving is a deliberate navigation with a labelled way back.
2. **The design law already decides this.** A destination gets a route with a
   real URL and a visible back control. This is a destination on every test: an
   edge function call, five numbered steps with five sub tabs of their own, a
   confirmation flow, and a receipt with an undo. The swaps step alone measured
   a **7,938px** page.
3. **The merge drew this line in the same place.** Printing proxies and drawing
   an opening hand became routes rather than tabs, and both are smaller jobs.

`?tab=optimiser` and the older `?tab=ai` redirect to it, through the same
`LEGACY_ROUTES` map that already carries `proxies` and `test`. Walked and
confirmed in `scripts/deck-surfaces-walk.mjs`.

**Nothing was lost.** `scripts/deck-control-census.mjs`, before against after:
the deck page went from **371 distinct controls to 369**, the new route draws
**3**, and the diff is one line out and two in:

```
- tab :: OptimiserWhat to change
+ a :: Back to deck
+ button :: Optimise
```

The two controls the Optimiser tab actually owned, `Optimise deck` and
`Use my collection`, are both on the route. The other twenty it was credited
with were the deck page's own header and tab strip.

### The Cards tab, in detail

`DeckCardsPanel` is the shell. Its `FilterBar` gains three slots it does not use
today, all of which `VisualDeckView` already passes to the same component:

- `presets`: the **Group by** select
- `sort`: the `SortControl` over five axes
- `view`: `sized: true` on the grid mode, which turns on the size slider

Its `facets` slot keeps `DeckCardFilters`, behind the trigger rather than always
open (subject to item 17 above). Its modes become **Visual, Table, Text**, the
third from the builder, generated by `serializeDeck`.

`DeckCardGrid` and `DeckCardTable` gain optional edit props, the same way they
already take an optional `playabilityFor`:

```
onUpdateQuantity?  onRemoveOne?  onDeleteAll?  onReplace?  width?
```

Pass none of them and they render exactly as `PublicDeck` renders them today,
which is the test that the change is additive.

**Replace** becomes a right hand slide over rather than a tab switch. Today it
sets `cardToReplace`, jumps to another tab, and shows a banner explaining what
you are in the middle of. A slide over keeps the deck on screen behind it, which
is the thing you are comparing against, and closes back to exactly where you
were. Add stays a tab, because browsing 34,000 cards wants the width.

### Right hand slide overs

- **Replace this card**, as above
- **Import a decklist**, so you can see the deck the paste is about to land in

### Own routes

These keep a URL because they are places you link to, come back to, or print
from:

- `/deck/:id/export` gaining JSON, Moxfield and the four content switches
- `/deck/:id/share`
- `/deck/:id/proxies`, moved off the builder's tab strip. It is a print job with
  paper size, quality and cut guides, and it wants a URL.
- `/deck/:id/testhand`, `QuickDeckTester` moved off the builder's tab strip
- `/deck/:id/commander`, the picker, moved from `/deck-builder/commander`

### Routes that become redirects

- `/deck-builder?deck=x` to `/deck/x`
- ~~`/deck-builder/commander` to `/deck/:id/commander`~~ — **it did not become
  one, and it should not.** `DECK-PAGE-AUDIT.md` finding B filed the missing
  redirect as a leftover that would rot. Read again on 23 Aug: `App.tsx` mounts
  `DeckCommander` on both addresses, the page reads its own `:id`, and the
  id-less address is the picker the **deck generator** opens through
  `VisualDeckView` — for a deck that has never been saved and so has no id to
  name. `DeckCommander.tsx` documents that path and commits to the store alone
  when `:id` is absent. Two callers, one picker. Redirecting it would break the
  generator. Finding B is closed as correct-as-built, not as work owed.
- `/deck/:id/analysis` to `/deck/:id?tab=analysis`, after the type percentage
  bars are carried across
- `/deck/:id/missing` to `/deck/:id?tab=value`

### What gets deleted

Only implementations that are duplicates of a better one, never a capability:

- `VisualDeckView`'s private text serializer, replaced by `serializeDeck`
- `DeckImportExport`'s export half, replaced by `DeckExportPanel`. Its import
  half is the only importer and stays.
- `EnhancedDeckExport` as a component, after its three formats and four switches
  are moved into `DeckExportPanel`
- `DeckAnalysisView`, after the type percentages move to Analysis
- The view page's read only `EdhAnalysisPanel` mounting, superseded by the one
  that can refresh
- The view page's local `needsCards()` empty state, replaced by `EmptyState`
- One of the two card categorisers
- `EnhancedDeckAnalysisPanel`'s Validation sub tab, which asserts legality as an
  input, and its Suggestions sub tab, which is the optimiser with less in it

  > **Corrected 23 Aug 2026, against the shipped page.** This is what was
  > planned and not what happened. Validation did go. Suggestions **stayed**,
  > and **Mana Curve** and **Land Base** went instead, both because the Mana tab
  > answers them. The three drops are governed by the `sections` prop on
  > `EnhancedDeckAnalysisPanel`, which still defaults to all six for the deck
  > generator, so nothing is deleted and only this page unmounts them.
  > `DECK-PAGE-AUDIT.md` section 3.2 measured it; this line is the doc it said
  > disagreed with the code.

`VisualDeckView` itself **cannot** be deleted yet: `AIGeneratedDeckList.tsx:380`
mounts it for the deck generator, whose deck is not saved and has no
`DeckCardRow` shape. Either the generator moves to the merged panel first, or
`VisualDeckView` stays for it alone. Say which before starting.

### The prerequisite nobody can skip

The two card lists take two different row types. `DeckCardsPanel` takes
`DeckCardRow[]` from `fetchDeckCards`. `VisualDeckView` takes the store's
`Card[]`. The merged page needs one, and the store's is the weaker of the two:
it has no `is_sideboard` field, and a card added in session is missing
`legalities`, `power`, `toughness` and `keywords`. The merge is really "make the
edited deck read from `DeckCardRow` and write through the store", and that is
the piece to get right before any of the layout above matters.

---

## 11. Features I have NOT found a home for

Honest list. Five things, and none of them is a whole feature.

1. **`DeckAnalysisView`'s five sub tabs as a shape.** Every panel in it survives
   somewhere and the type percentages are carried across, but "open the deck's
   numbers as one focused page" goes away as an idea. If the owner uses
   `/deck/:id/analysis` as a fast route to the figures, that habit dies with the
   route. Cheap to keep as a redirect; not cheap to keep as a page.

2. **`compute_deck_summary`'s own curve, counts and mana sources.** Once the
   merged page computes all three locally from the joined rows, the RPC's
   versions are still what the deck tile on `/decks` prints. So either the tile
   keeps reading numbers computed a different way from the deck page, which is
   the disagreement this pass is meant to end, or the RPC's bucket logic gets
   fixed to match `cardCategories`. I have no home for that decision; it is not
   a deck page change and it needs to happen.

3. **The builder's "All decks" action.** Genuinely redundant with the breadcrumb
   the layout already draws, so it is dropped rather than rehomed. Naming it
   here because dropping a control is still dropping a control.

4. **Editing the deck description.** The view page displays it, nothing writes
   it except the autosave that destroys it. The merged page needs a field for it
   and I am proposing one exists (inline under the commander, the same treatment
   as the title's pencil) rather than pretending it already does. That is new
   work, not a merge.

5. **Sideboard editing.** Nothing on either page can move a card to the
   sideboard, though the database, the exporters and the view page all handle
   one. The merged Cards tab is the obvious home and I have not put it there,
   because adding a capability during a merge is how merges lose things.
