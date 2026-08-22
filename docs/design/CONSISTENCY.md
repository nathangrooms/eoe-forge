# Listing surfaces: what every page actually does today

Inventory only. **No page was changed by this pass.** Every figure below was
read out of the running app or counted in the tree, and the method is stated
next to it so any of it can be re-checked.

Written 22 Aug 2026, against the tree at that date.

---

## How the measurements were taken

The pixel figures come from the built `dist/` served over a local static server
and driven with Puppeteer at a 1600 x 1000 viewport, which is the width
`scripts/app-shots.mjs` already establishes as the one the app is really used
at. Auth and the owner-scoped tables were answered by the existing
`scripts/collection-analytics-shim.js`, so the cards on screen are real rows out
of the live catalogue and only the quantities are fixture. `compute_deck_summary`
is not covered by that shim, so the three decks on `/decks` are a fixture with
the shape the interface expects. **That matters for the values in the deck tiles
and not for their sizes**, because `DecksSummaryStats` lays out on a fixed
six column grid whose track width is a function of the container alone.

Everything else is a count over the tree, and the command that produced it is
given.

---

## 1. The matrix

47 files in `src/pages`. Three are harnesses (`__proxyHarness`, `__proxyPdfHarness`,
`__tshot`), four are auth screens with nothing to list, and two (`Buylist`,
`ProxyList`) are one line re-exports of components in `src/components/shopping`.
That leaves 38 real destinations. The ones that list something are broken out in
full; the rest are grouped at the end.

### 1a. Search, filters, metrics

| Page | Search | Filters | Metrics |
|---|---|---|---|
| `/cards` (`Cards.tsx`) | `EnhancedUniversalCardSearch` box. Placeholder "Search by name, or use Scryfall syntax — t:creature id:wu mv<=3". 300ms debounce, plus a live Scryfall name autocomplete on a separate 220ms timer. **URL synced** (`urlSync`) | `CardFilterSheet`, right hand slide over. Facets: colour, identity, rarity, type, supertype, subtype, format legality, mana value, power, toughness, price, set, artist, language, printing extras. Count badge on the trigger, removable `ActiveFilterChips` under the bar, `RotateCcw` reset button | **None.** No metric row at all |
| `/collection` Cards tab (`Collection.tsx` → `CollectionCardDisplay` → `CollectionBrowser`) | local `SearchBox` inside `CollectionBrowser`. Placeholder "Name, type, or Scryfall syntax like t:creature mv<=3". 250ms debounce. URL synced (`useCardFilterState` default) | `CardFilterSheet` for the card facets, plus a second inline chip row for the questions Scryfall cannot ask (condition NM/LP/MP/HP/DMG, foil only, 2+ copies). Combined count on the trigger. `ActiveFilterChips` plus hand rolled `RemovableChip`s for the ownership half. Clear only reachable from the empty state | `CollectionQuickStats`, six slots, **20px tall**, `text-sm`, transparent, folded into the page title line |
| `/collection` Add tab | `EnhancedUniversalCardSearch mode="pick"`, `urlSync` off | same sheet, no URL | none |
| `/decks` (`Decks.tsx`) | `DeckSearchFilters` box. Placeholder "Search decks…". **No debounce**, filters on every keystroke. **Not URL synced** (`useDeckFilters` local state) | `Popover`, anchored under a Filters button. Facets: format, colour identity with a match mode, power range. Count badge on the trigger, Clear inside the popover head. No chips | `DecksSummaryStats`, six `Card` tiles, **95px tall**, `text-2xl` numbers |
| `/wishlist` (`Wishlist.tsx`) | local `WishlistSearchBox`. Placeholder "Name, type, or Scryfall syntax". 250ms debounce. URL synced | `CardFilterSheet` plus a priority select. `ActiveFilterChips` | `WishlistQuickStats`, 2 or 4 tiles, `bg-card` + shadow, **with a 40px icon square per tile** |
| `/precons` (`Precons.tsx`) | `PreconFilterBar` box. Placeholder "Search precons, commanders or sets…". **No debounce.** Not URL synced | Inline in the bar: colour pips, set select, sort select. Count computed by hand, Clear button in the bar | **None.** One result count line |
| `/templates` (`Templates.tsx`) | bare `<Input className="pl-10">`, **shadcn default, so it draws a border**. Placeholder "Search archetypes by name, role or synergy…". No debounce. Not URL synced | Inline row of `variant="outline"` format buttons, **which also draw borders**. **No clear control at all** | **None.** One count line |
| `/marketplace` (`Marketplace.tsx` → `PriceSearchPanel`) | own box, own state. Not URL synced for text | `CardFilterPanel` mounted **inline** rather than as a sheet, plus its own `filterBy` / `hideNoPrice` / `showFoil` selects. `ActiveFilterChips` | `MarketplaceHeader`, four figures as a `dl`, `text-sm` values, inside one strip with the outbound links |
| `/shopping`, `/proxies` (`ShoppingListPage`, `ProxyListPage`) | none | none | inline tiles, `text-2xl font-semibold tabular-nums` |
| `/decks/new` (`NewDeck.tsx`) | own `<Input>` with a clear button. Placeholder "Search commanders, partners and backgrounds…". Debounced. Not URL synced | `CommanderFinder`, a **second and separate filter vocabulary**: `CommanderFilters` in `components/ai-builder/commander-query.ts` (colours, playstyles, mana value range, tribal, pairable) | none |
| `/smart-builder` (`AIBuilder.tsx`) | own box, 400ms debounce | same `CommanderFinder` / `CommanderFilters` | none |
| `/deck-builder/commander` (`DeckCommander.tsx` → `CommanderSelector`) | `CardFilterSheet` + `useCardFilterState({urlSync:false})`. **A third commander picker, on the other filter system** | shared sheet | none |
| `/deck-builder` Cards tab | `EnhancedUniversalCardSearch mode="pick"` | shared sheet | `DeckQuickStats`, local `StatTile`, four `Card p-3` tiles, `text-2xl` |
| `/deck/:id` (`DeckInterface.tsx`) | `DeckCardFilters` box. Placeholder "Search this deck by name, type or rules text…". **Bordered `Input`.** No debounce | **Inline, always expanded facet rows** inside a `Card`. Type, colour, mana value, rarity, price, playability. Clear button in the header row | inline dl, mixed sizes |
| `/collection/storage/:id` (`StorageContainerView`) | delegates to `CollectionBrowser` | `CollectionBrowser` with `showOwnershipFilters={false}` | own inline grid |
| `/admin` (`TaskManagement`) | bare `<Input>` "Search tasks by title, category, or section...". Bordered. No debounce | inline selects | four tiles, `text-2xl font-bold`, one of them coloured `text-primary` |
| `/tutor`, `/dashboard`, `/scan`, `/simulate`, `/tournament`, `/play/mats`, `/settings`, `/cards/:id`, `/p/:slug`, `/` | no listing search | none | Dashboard has `CollectionValue`; PublicDeck has an inline `grid-cols-3` block at `text-lg font-bold`; Tournament has `EventHeader` at `text-2xl font-semibold`; the rest have none |

### 1b. Listing, sizing, presets, paging

| Page | Listing | Sizing | Presets | Paging |
|---|---|---|---|---|
| `/cards` | `UniversalCardDisplay`, three modes (card grid / table / text list), mode in `localStorage` under `dm.cardSearch.view` | `CardSizeSlider`, key `card-search`, default 230px, persisted | **Yes, both kinds.** Five `BrowseView`s (Commander staples, Commanders, Just printed, Most valuable, Reserved list), each a real Scryfall query with a caption, remembered in `dm.cardSearch.browse`. Plus a Presets popover over `PRESET_QUERIES` | `Pager`, above **and** below the grid, page in the URL, page size in `localStorage`, scrolls to the top of the results on a turn |
| `/collection` Cards | `CollectionBrowser`, three modes (image grid / list / table), mode + sort in `localStorage` under `deckmatrix.collection.view` | `CardSizeSlider`, key `deckmatrix.collection.view`, default 200px, `showValue={false}` | none | `Pager` (once, above), `usePagedItems`, page in URL |
| `/decks` | `DeckTile` in a hard two column grid, grid or list, `DeckViewControls` prefs in `localStorage` under `deckmatrix.decks.view` | **No size control.** Tile width is fixed by `DECK_GRID_CLASS` | none | **None.** Every deck renders |
| `/wishlist` | `CardGrid` + own tiles, grid / list | `CardSizeSlider`, key `wishlist`, default 200px | none | `Pager`, above and below |
| `/precons` | `PreconTile` in `CardGrid`, cut into shelves by year / set / letter | **`PreconDensity`, a two step enum** (large / compact), persisted under its own key. Not the shared slider | none | **Infinite scroll.** `IntersectionObserver` with a 600px root margin |
| `/templates` | plain `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3` of `Card`s | none | none | **None** |
| `/marketplace` | `CardGrid` / list, `viewMode` inside one `PREFERENCES_KEY` localStorage blob | `CardSizeSlider`, key `marketplace`, default 190px | none | **"Load more printings" button.** A fourth idiom |
| `/shopping`, `/proxies` | `CardGrid` | `CardSizeSlider`, keys `shopping` / `proxies` | none | `Pager`, `usePagedItems`, page size 60 |
| `/decks/new` | `CardGrid` of commanders | `CardSizeSlider`, key `new-deck-commanders`, default 172px | none | `Pager` |
| `/smart-builder` | `CardGrid` via `CommanderStage` | `useCardSize` | none | `Pager` |
| `/deck-builder` Cards | `UniversalCardDisplay` | `CardSizeSlider`, key from `sizeKey` | Presets popover inherited from the shared component | `Pager` |
| `/deck/:id` | `DeckCardGrid` / table, toggle in `DeckCardsPanel` | `useCardSize` via `deck-view-prefs.ts` | none | none |
| `/collection/storage/:id` | `CollectionBrowser` | inherited | none | `Pager` |
| `/admin` | tables | none | none | none |

### 1c. The page shell

18 of the 38 real pages do not render `StandardPageLayout` or `DeckSubpageLayout`:

```
Buylist* CardDetail Collection CollectionImport CollectionInsurance Homepage
LifeCounter Login NewDeck NotFound ProxyList* PublicDeck Register ResetPassword
SellCard StorageQuickAdd TournamentNew Wishlist
```
`*` re-exports a component that does use the shell, so those two are fine.

Of the rest, the ones that matter here are **Collection, Wishlist, NewDeck,
CardDetail and PublicDeck**, and the first two are exactly the pages the owner
compared against My Decks. Each has hand rolled its own header, its own gutters
and its own title. `Wishlist` even puts an icon beside its `h1`, which
`StandardSectionHeader` never does.

---

## 2. The three questions

### Q1. The majority pattern, and the best existing implementation of it

Adopt what already exists. Every row below names a real file.

| Dimension | Majority pattern | Best existing implementation | Why it wins |
|---|---|---|---|
| **Search** | A borderless field on a `bg-muted/50` ground, magnifier inset left, a draft committed on a debounce, filter text living in `CardSearchState` | `src/components/collection/browser/CollectionBrowser.tsx`, the local `SearchBox` (250ms), with the escape hatches from `EnhancedUniversalCardSearch` (autocomplete, `/` to focus, Esc to clear) layered on | It is the smallest correct version. It adopts external changes without stomping on typing, and its debounce effect is keyed on a callback the controller keeps stable, which is the bug the comment in `useCardFilterState` exists to prevent. **There are three copies of it today** and they differ only in the debounce (250 / 250 / 300ms) and the placeholder |
| **Filters** | State in `CardSearchState`, edited through a **right hand slide over**, count badge on the trigger, removable chips under the bar | `src/components/filters/CardFilterPanel.tsx` (`useCardFilterState` + `CardFilterSheet` + `ActiveFilterChips`) | Already the shared one. Six surfaces use it, it URL syncs by default, it is the only filter that produces both a Scryfall query and a local predicate (`src/lib/cards/local-filter.ts`), and the slide over is the pattern design law item 3 approves |
| **Metrics** | A row of raised tiles on `bg-card`, label above in `text-xs` muted, value in `text-2xl font-semibold tabular-nums`, optional small subtext, **no icons** | `src/components/deck-builder/DecksSummaryStats.tsx` | It carries the owner's own ruling in a comment: *"Deck manage metrics dont need icons - makes it look like ai slop"*. Its column count is fixed rather than content driven, and every figure has a stated definition (see the "Complete" comment) rather than a plausible looking number |
| **Listing** | `CardGrid` fed a px width, holding `CardImage`, with a grid / list / table segmented control | `src/components/cards/CardGrid.tsx` + `src/components/cards/CardImage.tsx`, composed by `src/components/universal/UniversalCardDisplay.tsx` | `CardGrid` is `repeat(auto-fill, minmax(<width>px, 1fr))`, so it takes the slider's number directly and reflows live. `CardImage` right sizes the Scryfall asset per rendered size, which is the thing hand rolled `<img>` tags kept getting wrong |
| **Sizing** | A continuous slider emitting a minimum card width in px, remembered per surface | `src/components/cards/CardSizeSlider.tsx` + `useCardSize` | Nine surfaces already use it. Per surface `localStorage` keys mean "how big I like my cards here" survives navigation, and `BORDERLESS_SLIDER` is the one place the Radix thumb ring is removed |
| **Presets** | Named starting views, remembered, each with a caption saying what the grid is showing | `BrowseView` in `src/components/universal/EnhancedUniversalCardSearch.tsx`, driven by `BROWSE_VIEWS` in `src/pages/Cards.tsx` | This is the owner's own example of a legitimate extra. It is already a passed in prop, which is the shape the whole audit is arguing for: the page supplies its own views, the component knows nothing about cards specifically |
| **Paging** | Numbered pages, page in the URL, page size in `localStorage`, pager rendered above and below | `src/components/ui/pagination.tsx` (`Pager`) + `src/hooks/usePagination.ts` (`usePageParam`, `usePagedItems`, `usePageSize`) | Seven surfaces use it. It puts the page in the URL so back and forward work, which design law item 4 requires. `pageCount: null` is respected rather than guessed, so a source that cannot report a total does not get a fabricated page count |

**The single best composed example of all seven together is
`src/components/universal/EnhancedUniversalCardSearch.tsx`.** It is search +
filter sheet + presets + browse views + chips + size slider + view modes + sort
+ pager, wired to one filter controller, with every optional piece already a
prop (`showFilters`, `showPresets`, `showViewModes`, `showListButtons`,
`urlSync`, `sizeKey`, `browseViews`, `mode`). It is the proof that the extension
point model works, because eight surfaces already mount it with different
combinations.

### Q2. Genuine differences. These stay.

Each of these would lose something real if it conformed.

1. **Card search keeps browse views and presets.** `/cards` opens onto 34,000
   cards. Without a named starting view it is a blank box in front of a
   database. Deck search has nine decks; a "browse view" over nine decks is
   noise. This is the owner's own example and it is correct.

2. **Collection keeps its ownership facets.** Condition, foil only and
   2+ copies cannot be expressed as a Scryfall query, because they are facts
   about your copy rather than about the card. `CollectionBrowser` already says
   so in a comment. They must stay beside the shared sheet, not inside it.

3. **Collection and wishlist keep a table view; card search keeps a text list.**
   Three view modes each, but not the same three. A collection table has
   condition, quantity and value columns that a Scryfall result has no values
   for. A text list is for copying a decklist out, which is a card search job.

4. **Decks has no card size control.** A deck tile is not a card. Its width is
   set by `DECK_GRID_CLASS` with a documented reason (a third column at 1600px
   would shrink the commander art back to a thumbnail). Handing it a
   `CardSizeSlider` would be conformity for its own sake.

5. **Decks has no paging.** Thirteen accounts, largest deck library is nine.
   A pager over nine rows is chrome with nothing to do. Add it when a real
   account crosses a page.

6. **Precons shelves the grid by year, set or first letter.** 184 products in
   one grid is a wall. The shelving is a real navigational aid and no other
   surface has an axis worth cutting on.

7. **Add-cards surfaces keep `mode="pick"`.** A click adds and the page stays
   put. This exists because of a specific owner report about storage, and the
   component documents it at length. Do not unify it with browse.

8. **The commander pickers keep playstyle, tribal and pairable.** Those facets
   are commander specific and the shared card filter has no equivalent. What is
   **not** genuine is that they carry a whole second filter system to get them
   (see Q3.6).

9. **Deck detail keeps its filters inline and always open.** The facets there
   are computed from the deck in hand and carry live counts (`Creature 30`,
   `2 mana 18`). They are a map of the deck, not a query builder, and hiding a
   map behind a button defeats it.

10. **`DeckSubpageLayout` stays separate from `StandardPageLayout`.** A deck
    sub-destination replaces the breadcrumb with a named back link to the exact
    surface that sent you. That is deliberate and documented. It already shares
    `StandardSectionHeader` with the main shell, which is the right amount of
    sharing.

11. **Marketplace keeps "Load more".** Arguable. Scryfall paginates by cursor
    (`next_page`), and `Pager` needs a page count it cannot always get. But see
    Q3.7: `Pager` already handles `pageCount: null` with `hasNext`, so this is
    probably drift wearing a justification.

### Q3. Accidental differences. This is the work.

Nobody decided any of these. Ordered by how much they cost.

**1. Two answers to "how big is a metric".**
`DecksSummaryStats` gives a figure a 204.7 x 95px tile with a 24px number.
`CollectionQuickStats` gives the same kind of figure a 126.7 x 20px slot with a
14px number and no tile at all. Measured in section 3. Six separate metric row
implementations exist:

```
components/deck-builder/DecksSummaryStats.tsx   Card p-4,  text-2xl semibold, no icons
components/collection/CollectionQuickStats.tsx  no tile,   text-sm  semibold
components/wishlist/WishlistQuickStats.tsx      bg-card,   text-2xl, 40px ICON per tile
components/marketplace/MarketplaceHeader.tsx    dl inline, text-sm  semibold
components/deck-builder/DeckQuickStats.tsx      Card p-3,  text-2xl, local StatTile
components/admin/TaskManagement.tsx (inline)    Card,      text-2xl BOLD, one text-primary
```
Plus one-off blocks in `PublicDeck.tsx` (`text-lg font-bold`),
`InsuranceReport.tsx` (`text-2xl font-bold`), `EventHeader.tsx`,
`ShoppingListPage.tsx`, `ProxyListPage.tsx`, `MissingCardsPanel.tsx`.
`WishlistQuickStats` puts an icon on every tile, which is the exact thing
`DecksSummaryStats` carries an owner quote forbidding.

**2. The selected state of a view toggle is invisible on three surfaces.**
There are ten hand rolled segmented controls with four different shells
(`rounded-md bg-muted p-0.5`, `rounded-md bg-muted/40 p-0.5`,
`rounded-lg bg-muted/40 p-0.5`, `gap-0.5` vs `gap-1`) and two different selected
variants. `DeckViewControls` and `PreconFilterBar` and
`EnhancedUniversalCardSearch` use `variant="default"`; `CollectionBrowser`,
`Wishlist` and `PriceSearchPanel` use `variant="secondary"`.

In the dark theme `--muted` is `220 6% 11%` and `--secondary` is `220 6% 12%`.
One percentage point apart. Measured on the running page:

| Surface | Shell | Selected chip | Contrast |
|---|---|---|---|
| My Decks (`variant="default"`) | `rgb(26,27,30)` | `rgb(245,245,245)` | **15.80 : 1** |
| My Collection (`variant="secondary"`) | `rgba(26,27,30,.4)` over `rgb(17,17,19)` | `rgb(29,30,32)` | **1.09 : 1** |

`DeckViewControls` already carries the comment explaining this and was fixed.
The other three were not. In the light theme it is worse: `--secondary` and
`--muted` are both `0 0% 96%`, identical, so the selected state is literally
undrawable.

**3. Borders keep coming back, because being borderless is opt out.**
`Input`, `SelectTrigger`, `SelectContent` and `Button variant="outline"` all
ship a border. Every surface that wants the house style opts out by hand.
Counted over `src/**/*.tsx` excluding `components/ui`:

```
61   <Input> / <SelectTrigger> mounts that opt out (border-0 / FIELD)
99   mounts that do not, and therefore draw a hairline
125  variant="outline" buttons outside components/ui
4    separate local `const FIELD = 'border-0 bg-muted/50 …'` declarations
42   inline `border-0 bg-muted…` strings across 30 files
```
The four `FIELD` constants live in `CardFilterPanel.tsx`, `PreconFilterBar.tsx`,
`EnhancedUniversalCardSearch.tsx` and `CardPrintingComparison.tsx`, and they are
not identical: two use `focus-visible:ring-1`, one uses `focus:ring-1`, one uses
both. `DeckViewControls` uses `bg-muted` where everyone else uses `bg-muted/50`.
Templates and DeckInterface and TaskManagement never opted out at all.

**4. Twenty-three different `TabsList` skins.**
`grep '<TabsList' -A1 | grep className` returns 23 distinct strings. Collection
uses a custom underline strip built out of `data-[state=active]:after:*`.
Wishlist uses `h-auto w-max bg-muted p-1`. Marketplace uses
`grid w-full grid-cols-4 h-auto`. Admin uses `sm:grid-cols-9`. They are all the
same control.

**5. Four ways to page.**
`Pager` (7 surfaces), infinite scroll (`Precons`), "Load more" (`PriceSearchPanel`),
and nothing (`Decks`, `Templates`, `DeckInterface`). Precons and Marketplace
both lose the back button as a result, which design law item 4 forbids.

**6. Three commander pickers, two filter systems.**
`/decks/new` and `/smart-builder` mount `CommanderFinder` over
`CommanderFilters` in `components/ai-builder/commander-query.ts`.
`/deck-builder/commander` mounts `CommanderSelector` over `useCardFilterState`.
The colour and mana value halves of `CommanderFilters` duplicate the shared
filter exactly; only playstyle, tribal and pairable are new. Those three belong
as an extension slot on the shared sheet, not as a reason for a second system.

**7. Filter placement is decided per page, not per case.**
Slide over on `/cards`, `/collection`, `/wishlist`, `/deck-builder`.
Popover on `/decks`. Inline panel on `/marketplace`. Inline always open rows on
`/deck/:id`. Inline chips with no container on `/templates`. Four of these are
the same job.

**8. Six ways to say how many results there are.**

```
/decks         "3 decks"                                       inside the view controls row
/collection    "240 of 240 entries · 445 cards · $10,898.67"    its own line
/cards         the browse view caption, or "N cards matched"    plus the Pager's own range label
/precons       "184 precons across 31 sets"                     its own line
/templates     "12 archetypes"                                  its own line
/deck/:id      "84 of 100 cards"                                inside the filter header
```

**9. Copy drift in the fields themselves.**
17 placeholders end in `...`, 13 end in `…`. Three say "Filter", twenty say
"Search". Two surfaces search the same thing with different words: "Name, type,
or Scryfall syntax like t:creature mv<=3" on the collection and "Name, type, or
Scryfall syntax" on the wishlist. One placeholder carries an em-dash, which the
copy rules forbid outright: `src/pages/Cards.tsx:201`, "Search by name, or use
Scryfall syntax — t:creature id:wu mv<=3". It is the only one in the product.

**10. Debounce is chosen at random.**
250ms (collection, wishlist), 300ms (card search text), 220ms (card search
autocomplete), 400ms (AI builder commander), and none at all on `/decks`,
`/precons`, `/templates` and `/deck/:id`. The four with no debounce re-run their
predicate on every keystroke; on `/deck/:id` that is over 100 cards, on
`/precons` over 184, on `/decks` over the deck list.

**11. Five pages hand roll a header that `StandardPageLayout` already draws.**
Collection, Wishlist, NewDeck, CardDetail, PublicDeck. Collection's is what
pushed its metric row into the title line in the first place.

**12. Dead parallel implementations still in the tree.**
Confirmed zero importers, reachable from nothing:

```
src/features/collection/CardSearch.tsx
src/features/collection/CollectionInventory.tsx
src/features/collection/EnhancedCardSearch.tsx      (the only importer of ↓)
src/components/deck-builder/AdvancedSearchFilters.tsx
src/components/enhanced/EnhancedCollectionAnalytics.tsx
src/components/filters/AdvancedFilterPanel.tsx      (673 lines, re-exported by
                                                     filters/index.ts, mounted nowhere)
```
`AdvancedSearchFilters.tsx` alone holds 13 of the 99 bordered field mounts
counted above, so it is inflating the numbers for code no user can reach.
**Do not delete these on this note alone.** CLAUDE.md records a sweep that
removed ten components that were genuinely in use. Re-grep each import path
against the current tree first.

---

## 3. The owner's measurement: My Decks against My Collection

> "my decks has proper metric tiles, when on my collection page we dont have
> these and they are much smaller due to the multi menu system"

Measured at 1600 x 1000, dark theme, content band 1288px wide in both cases.

### The tiles

| | My Decks (`DecksSummaryStats`) | My Collection (`CollectionQuickStats`) |
|---|---|---|
| Row origin | x 280, y 160 | x 280, y 116 |
| Row size | **1288 x 95 px** | **840.3 x 20 px** |
| Slots | 6 | 6 |
| One slot | **204.7 x 95 px** | **126.7 x 20 px** |
| Slot area | **19,447 px²** | **2,534 px²** |
| Surface | `rgb(17,17,19)` card, 16px padding | `rgba(0,0,0,0)`, 0 padding |
| Value type | **24px / 600** | **14px / 600** |
| Label type | 12px muted, above the value | 14px muted, beside the value |
| Subtext | 10px, present on 2 of 6 | none |

**A collection figure gets 13% of the area a deck figure gets, and its number is
drawn at 58% of the size.**

Two separate causes, and they compound.

**Cause one, horizontally.** The collection row is 840.3px wide inside a 1288px
band, so it uses **65% of the width available to it**. It shares a flex row with
the four header buttons (Refresh, Import, Backup, Add cards), which sit at
x 1136 to x 1568. On My Decks the equivalent buttons sit on the **title** line at
y 88, and the metric row gets its own line and the whole 1288px.

**Cause two, vertically.** The collection metric row is not a row of tiles at
all. It is one 20px line of `text-sm` in the page header, and its own doc
comment explains why: the four full stat cards that used to sit under the tab
strip were deleted because between them and the favourites block, 640px of the
first screen was chrome and roughly 180px was left for the grid. The right
answer to that was found on My Decks (put the buttons on the title line, give
the metrics a line of their own). The collection instead shrank the metrics to
fit the space the menus left.

### What the nested menus cost

Distance from the bottom of the app top bar (y 64) to the top of the first item
of the actual listing:

| | My Decks | My Collection |
|---|---|---|
| First listing item | deck tile at y **403** | card image at y **513** |
| Chrome above it | **339 px** | **449 px** |
| Control bands | 4 | 7 |

My Decks, top to bottom:

```
y  80  56px   title + description + 4 action buttons
y 160  95px   METRIC TILES
y 279  40px   search + Filters
y 343  36px   count + sort + sort direction + view mode
y 403         first deck tile
```

My Collection, top to bottom:

```
y  80  56px   title + 6 metric figures (20px) + 4 action buttons     <- metrics live here
y 152  48px   PAGE TAB STRIP     Cards / Analytics / Add cards / Storage
y 236  40px   search + Filters + sort + sort direction
y 288  24px   OWNERSHIP CHIP ROW  OWNED NM LP MP HP DMG Foil 2+ copies
y 324  36px   SELECT + size slider + view mode
y 388  20px   "240 of 240 entries · 445 cards · $10,898.67"
y 441  56px   pager
y 513         first card
```

The three bands My Decks does not have are the tab strip (48px), the ownership
chip row (24px) and the separate Select/size/view row (36px). **That is 108px,
and the measured difference in chrome is 110px.** The menus account for
essentially the whole of it.

So the owner's diagnosis is exactly right, and it is worth being precise about
the mechanism: the nested menus did not shrink the tiles directly. They took the
vertical space the tiles would have occupied, and the tiles were then folded up
into the title line to compensate, where there was only room for a 20px text
run. The fix is not to make the collection's numbers bigger. It is to stop the
collection spending 108px on menus that the shared vocabulary renders in one
band, and then give the metrics their own line the way My Decks does.

Both pages keep every control they have today. The tab strip is a genuine
difference (Cards, Analytics, Add cards and Storage are four different jobs) and
the ownership chips are a genuine difference (Q2.2). They just do not each need
a band of their own.

---

## 4. Two database findings, reported as required

Neither was introduced by this pass and neither was changed.

**1. `getDeckSummaries` fires one RPC per deck.**
`src/lib/api/deckAPI.ts:61-96` reads the deck ids in one query, then does:

```ts
const summaries = await Promise.all(
  decks.map(async ({ id }) => this.getDeckSummary(id))
);
```

and `getDeckSummary` is `supabase.rpc('compute_deck_summary', { deck_id })`.
That is 1 + N requests, each one a function that walks that deck's `deck_cards`
and joins the catalogue. Confirmed by watching the requests on `/decks` in the
harness: one `user_decks: id`, then one `rpc` per deck.

Three surfaces call it: `src/pages/Decks.tsx:142`, `src/pages/Tutor.tsx:294`,
and `src/components/collection/FavoriteDecksPreview.tsx:151`. Today the largest
real library is nine decks, so this is 10 requests, not 421. It is the same
shape as the fault CLAUDE.md records, and it grows with the thing the product
wants people to have more of.

**2. `ListingMessages` queries `profiles` once per message.**
`src/pages/ListingMessages.tsx:58-71` maps over every message in the thread and
runs `from('profiles').select('username').eq('id', msg.sender_id)` for each one.
A thread has exactly two participants, so a 60 message thread is 60 requests for
two rows. One `in.()` over the distinct sender ids answers it.

Neither page is touched by the consistency work, but both are on the list of
pages this audit covers, so both are reported here.

**Nothing in this pass made either worse.** No page was modified.

---

## 5. What a shared vocabulary would look like

Stated so the next phase has a target, not as a decision.

One `ListingToolbar` that composes, in this order and each one optional:

```
search      the field, its placeholder, its debounce, its URL binding
presets     slot. /cards passes browse views; nothing else passes anything
filters     the shared sheet trigger + count badge + chips
extras      slot. /collection passes its ownership chips here
results     the count line, one sentence, one place
sizing      CardSizeSlider when the mode is a card grid
view        the segmented control, one shell, one selected variant
```

One `MetricRow` taking `{ label, value, suffix?, subtext? }[]`, rendering
`DecksSummaryStats`' tile, with the column count fixed rather than content
driven so nothing shifts on load.

One `Pager` for everything that pages, which already exists.

Every page keeps what it has. `/cards` keeps browse views because it passes
them in. `/collection` keeps condition and foil because it passes them in.
`/decks` keeps having no size control because it does not pass one. Nothing is
removed to make the shapes match, which is the constraint that outranks the
tidying.
