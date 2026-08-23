# The eight tabs, rebuilt

What changed, what it was measured against, and what is still missing.

> **Corrections, added 23 Aug 2026 after an adversarial re-measurement of every
> deck surface at 1280 and at 1920.** Three claims below did not survive it.
>
> 1. **"The power score drawn twice on the EDH tab ... fixed"** (section 5).
>    Taking the compact `PowerScore` out of `CommanderPowerDisplay` moved the
>    count from three to four, not to one. Measured on the rebuilt tab, the
>    score `2.0` was on screen **five times** — the page header at 30px, this
>    tab's own metric tile at 24px, `PowerScore variant="expanded"`'s headline
>    at 48px, and the before/after pair in `PowerSliderCoaching` — with the
>    bracket beside it four times. `PowerScore` takes `headline={false}` now
>    and the EDH tab passes it. Three left, one of which is a comparison.
> 2. **"`scripts/deck-save-measure.mjs` could not run here (it fails before
>    navigation, with no harness deck id resolved)."** It runs. The harness deck
>    id is a literal at `scripts/deck-save-measure.mjs:205` and nothing has to
>    resolve it. Two runs against this `dist`, identical both times:
>    **3 requests, 2 writes, 1 row each** — `DELETE deck_cards` ·
>    `GET user_collections` · `PATCH user_decks`. The figure the merge
>    published holds, and it is no longer an unverified figure.
> 3. **The hairline counts and "0 console errors on any tab" hold.**
>    Re-measured at both widths across 22 surfaces: 0 console errors
>    everywhere, and 0 hairlines on Cards, Add, Mana, Analysis and Legality.
>
> Also found and corrected, every one measured at 1280 and at 1920 and every
> one commented at the fix site: `Deck value` printed twice under that same
> label on the Value tab; `Average playability` printed twice on the Mana tab;
> `Cards in the deck` reprinting the metric strip's own figure on the Legality
> tab; one measurement carrying three names (`Average playability`,
> `Playability`, `Average castable`) at two roundings; a budget of `$200`
> nobody set, drawn in the product's only emphasised tile as
> `Over budget -$687.55 - 444% of the budget spent`; and `grayscale` applied to
> Scryfall card art in the optimiser's cut list.

Written 23 Aug 2026. Follows `DECK-TABS.md`, which is the census this works
from, and `DECK-PAGE-AUDIT.md`, which is the nothing-lost contract. Where either
of those measured something it is cited rather than restated; everything with a
number in it below was measured by the two instruments named in section 1, and
anything not measured says so.

---

## 1. How this was measured

Two new instruments, both re-runnable, both driven against the built `dist/`
served over a local gzip server, and both using `scripts/deck-save-shim.js` —
the PostgREST stand-in the save measurement already used, so the cards on screen
are real rows out of the live catalogue and only the deck around them is a
fixture.

```
node scripts/deck-load-measure.mjs dist after      # requests per tab
node scripts/deck-tab-shots.mjs dist docs/design/deck-tabs   # a shot and an audit per tab
```

`deck-load-measure` counts every call to the Supabase origin from navigation
until the page settles, and then counts again after switching to the tab from
Cards. `deck-tab-shots` takes a full-page screenshot of each tab at 1600x1000
and, off the live DOM, counts three things the design law can be checked for
mechanically: controls, card images, and elements drawing a border.

**The before build.** A worktree at `f7c4215`, the commit this work started
from, built with `npx vite build` (its `prebuild` vendor check fails in a
worktree because `src/engine/power/catalogs.ts` differs from its source there;
nothing else was changed and the check is unrelated to the deck page). Both
instruments were run against it with the same arguments.

**What the instruments cannot see.** The shim answers owner-scoped tables
locally with a fixture, so `card_price_history`, the printing spread,
`deck_matches` and `user_collections` all answer empty. The REQUEST is counted,
which is the thing being measured; the panels then draw their "nothing yet"
states, and a tab is not proven finished by a screenshot of its empty state.

---

## 2. The two measurements

### 2a. Requests per tab

Cold load is arriving at `/deck/:id?tab=x` with an empty cache. "From Cards" is
what a reader already on the page pays to open that tab.

| tab | cold load | | from Cards | |
|---|---|---|---|---|
| | before | after | before | after |
| Cards | 18 | 18 | — | — |
| Add | 18 | 18 | 0 | 0 |
| Mana | 18 | 18 | 0 | 0 |
| EDH | 18 | **19** | 0 | **1** |
| Analysis | 18 | **19** | 0 | **1** |
| Legality | 18 | 18 | 0 | 0 |
| Value | **21** | **20** | **3** | **2** |
| Record | 19 | 19 | 1 | 1 |

Console errors: **zero on all eight tabs**, both builds.

**Eighteen of those are the page and the app shell**, identical on both builds
and on every tab: the deck and its cards, the collection, the profile, the
favourite and wishlist checks, the shopping and proxy lists, and the one
`PATCH user_decks` that caches the power score. The column that matters is "from
Cards", which is the cost of the tab itself.

Three tabs moved and each move is one request with a name on it.

- **EDH +1.** `useDeckPowerRank`: one `user_decks` read of `id, name,
  power_level` for the signed-in user, which is what turns "6.2" into "6.2, your
  third strongest of nine". One row per deck, three small columns, one round
  trip whatever the size of the library. Not `compute_deck_summary` per deck,
  which is the shape `CONSISTENCY.md` section 4.1 records on `/decks`.
- **Analysis +1.** One `PATCH user_decks` writing `archetype`, guarded on
  equality so it fires once per change rather than once per visit, and with
  `touch: false` so reading a tab does not move the deck to the top of "recently
  edited".
- **Value −1.** `MissingCardsPanel` ran its own `deck_cards` read, its own
  `user_collections` read and its own `cards` read when the tab opened, all
  three of data the page already held. It takes the shortfall as a prop now and
  makes **no** requests. Two new ones replace them: `card_price_history` for the
  price record and `card_printing_spread` for the cheapest printing, both keyed
  on a set and both chunked at a hundred ids.

Nothing on any tab is a per-row query, and no tab's cost depends on the size of
the deck. The worst cold load on the deck page went from 21 to 20.

### 2b. What each tab draws

Counted off the live DOM inside `#main-content`. "Controls" is buttons, inputs,
selects, sliders and textareas; "cards" is Scryfall card images; "hairlines" is
elements drawing a visible border.

| tab | controls | card images | hairlines | page height |
|---|---|---|---|---|
| Cards | 518 → 518 | 198 → 198 | 0 → 0 | 9369 → 9369 |
| Add | 32 → 33 | 2 → 2 | 0 → 0 | 1557 → 1900 |
| Mana | **17 → 45** | **2 → 18** | 1 → 0 | 3525 → 4259 |
| EDH | 31 → 34 | 2 → 4 | 1 → 1 | 3189 → 4083 |
| Analysis | 32 → 38 | **2 → 20** | **8 → 0** | 3579 → 5160 |
| Legality | **83 → 169** | **2 → 128** | 2 → 0 | 6198 → 8554 |
| Value | 425 → 429 | **102 → 212** | **8 → 1** | 15532 → **10612** |
| Record | 22 → 22 | 2 → 2 | 0 → 0 | 2299 → 2491 |

The baseline of 2 card images is the commander drawn in the hero plus the app
shell; a tab reading 2 was drawing no cards of its own at all. Four of the eight
were.

These are DOM counts rather than requests, so the dependency reinstall in
section 7 does not touch them; the after column was re-taken afterwards and came
back identical, figure for figure.

**The two hairlines that remain are the same element**, on EDH and on Value: the
Radix slider thumb, `border-2 border-primary`, which is the handle of the power
target slider and the budget slider. It is a control affordance rather than a
zone divider. `BORDERLESS_SLIDER` in `CardSizeSlider` is the house's opt-out and
is used where a slider sits in a toolbar; on a value slider the thumb has to be
visible. Named here so the count is explained rather than quietly excused.

**Value got shorter.** 15,532px to 10,612px, because a hundred missing cards
drawn as full-width rows became a grid of cards.

### 2c. What the deck page costs to open

`DeckInterface`'s own chunk, from the build output.

| | before | after |
|---|---|---|
| First load | 87.79 kB / **27.75 kB gzipped** | 45.46 kB / **15.72 kB gzipped** |

Seven of the eight tabs are `lazy` now and arrive when they are opened. Cards is
the default tab and is imported normally.

```
DeckEdhPanel        6.43 kB   2.80 kB gz
DeckAddPanel        6.93 kB   3.25 kB gz
DeckLegalityPanel  15.99 kB   6.30 kB gz
DeckValuePanel     17.20 kB   6.64 kB gz
DeckRecordPanel    20.37 kB   6.81 kB gz
DeckManaPanel      20.40 kB   6.98 kB gz
DeckAnalysisPanel  20.88 kB   7.42 kB gz
```

Statically imported, the eight rebuilt tabs put `DeckInterface` at 132.30 kB
(41.42 kB gzipped), which is the honest cost of the work and was measured before
the split. The split is why the first load is now **43% smaller than it was
before any of this**, and a reader still pays for exactly the tabs they open.

`PublicDeck` went 24.73 kB to 27.10 kB for the castability engine and the shared
analytics mapping; its Mana tab is lazy for the same reason.

`recharts` was already out of first load and stays out: `DeckValueHistory`
lazy-loads `CardPriceChart`, the same component and the same rule the card page
uses.

---

## 3. Tab by tab

### Cards

Unchanged in what it draws, which is right: the census called it the reference
implementation and it composes ten symbols from `@/components/listing`.

One thing moved. The filter state and the facet row's open/shut are held by the
page now rather than by `DeckCardsPanel`, because they have a second author: a
press on the Mana tab's curve means "show me those cards", and the answer is to
set `manaValues` and switch tabs. State with two authors in two components has
to be held by the thing that contains both. Same shape and the same reason as
`view`, which lives in the URL because a link is its second author.

### Add

`EnhancedUniversalCardSearch` in `mode="pick"` is untouched. Two things are new
above it.

**What the deck is short of, per role.** Six tiles: ramp, draw, removal,
interaction, win conditions, lands, each showing what the deck holds over what a
deck of this size in this format is aiming for. Free and deterministic —
`deriveDeckProfile` counts the deck's own cards and `roleTargetsFor` declares
the target, and the two are labelled apart on purpose: "you have 4 ramp" is a
fact about the deck and "you want 10" is an opinion this product holds out loud.

**Ranked suggestions from `src/engine/advise`.** The census gave that engine an
ultimatum: *"a tested local recommender that no tab calls is either the Add
tab's ranking and the Analysis tab's suggestions, or it is dead code with a test
suite. It cannot stay both."* It is wired up, behind an explicit control,
because the pool it ranks is a real download.

**The one place the adapter deviates from the engine, stated because it
matters.** `CandidateQuery` carries `limit: null` and says why: truncating
before ranking picks an arbitrary slice of the table and ranks the leftovers.
`src/lib/deck/adviseSource.ts` applies a limit anyway — the 3,000 most-played
legal cards in the deck's colour identity, ordered by `edhrec_rank`. The reason
is in the file: the engine's own note measures a five-colour commander's legal
pool at 32,881 rows and roughly 9.4 MB of projected columns, which is not a
request a browser should make to draw a list of forty. It is a popularity
pre-filter, the interface says so in words on screen, and every hard rule the
engine enforces still holds because `rankCandidates` re-checks legality and
colour identity on whatever comes back.

### Mana

The census counted zero controls across all three panels on this tab. It has 45
now, and the curve is one of them.

- **The curve is a control.** Pressing a bar lands on the Cards tab filtered to
  that mana value. Both halves already existed: `DeckCardFilterState.manaValues`
  takes exactly the bin ids `ManaCurve` plots, and the Cards tab's facet chips
  already carry their counts. Nothing joined them.
- **Copies against distinct cards**, and **narrowing to a colour**. Both are
  things Moxfield and Archidekt have and this did not. They are the page's own
  controls so they go in `FilterBar`'s slots.
- **The sources are cards.** Opening a colour shows the twelve lands behind "12
  blue sources", from `ManaProfile.sources` rather than from a second count.
- **Hardest to cast is cards, with Replace on each.** It is the one list on the
  page a player works through card by card and it printed eight names.
- **"What would fix this"** is the curve and land-base halves of what was the
  Analysis tab's Suggestions section, moved to the tab they are about. Both are
  deterministic; neither asks a model anything.

**A duplicate this pass found and the census did not.** Two blocks headed
"Sources by colour" and "Sources per colour", four inches apart on this tab,
from two different rules. `ManaSourcesPanel` reads
`ManaProfile.sourcesByColour` — every repeatable source in the library, lands,
rocks and dorks, with a fetchland counted for the colours the deck can actually
fetch. `LandEnhancerUX` counted `type_line` containing "land" and then matched
`add {u}` against lower-cased oracle text, so it saw lands only and missed every
mana rock. On any deck with rocks those printed different numbers. The engine's
is the one the power score is built on; the other is gone, and the shortfall
line that needed a source count is handed the engine's.

The two land counts that remain are deliberate and are labelled apart: **"Mana
sources … 1 lands · 0 rocks · 16 dorks that make mana"** in the metric row is
`ManaProfile.landCount`, which counts lands that actually produce, and **"Lands
in the deck"** in the land panel counts lands. A Maze of Ith is in the second
and not the first.

### EDH

The census: *"This tab is the product's strongest claim to being better than
either, and the gaps are presentational."*

- **The counts have names.** `PowerResult.gameChangers.list`, `.combos` and
  `.tutors.list` are card names out of `src/engine/power/catalogs.ts` — a file
  that literally lists "Basalt Monolith + Rings of Brighthearth" — and
  `powerAdapter` reduced all three to integers on the way through. It does not
  any more (`NamedCard` in `powerAdapter.ts`), so the tab draws the cards, with
  the engine's own reason under each one. A combo is two cards and is drawn as
  two cards.
- **The brackets say what they mean.** `DECK_BRACKETS` has carried Wizards'
  definitions since the power model was written and the tab printed the number.
  All five are on screen with the deck's own highlighted.
- **The score has a scale.** "#1, of your 1 scored decks" from
  `user_decks.power_level`, a column on every deck you own that nothing compared.
  One query.
- **The score was drawn twice.** `PowerScore variant="expanded"` above
  `CommanderPowerDisplay`, which opened with `PowerScore variant="compact"`. The
  inner one is gone. `AIGeneratedDeckList` had the same pair and gets the fix
  for free.

### Analysis

The census called it *"the least coherent tab on the page"*: three top-level
blocks, one of them a tab strip of three, one of those three a chat box, above
another chat box.

It is three blocks and one chat now, and the nested tab strip is gone.
`SynergyEngine` is called directly rather than through
`EnhancedDeckAnalysisPanel`, which is also a correctness fix: that panel builds
its own analysis input and stamps `legalities: { [format]: 'legal' }` over every
card on the way in.

- **The pairs are cards.** `SynergyPair` is two card names and a strength out of
  ten, and both names were text.
- **The mechanic clusters are cards.** A coverage percentage is a fact about the
  deck; which cards carry it is the answer.
- **Archetype detection persists.** `user_decks.archetype` is a column the
  census found nothing writes, so this tab computed a ranked archetype with a
  confidence figure on every visit and threw it away. It is written once, on
  change. The Record tab's primer reads it as the strategy line its own comment
  said nothing on the page held.
- **The confidence figure says what it is a percentage of.** It printed a bare
  number under a label reading "Strong Match", which is a second opinion about
  the first opinion.

### Legality

The only tab of the eight importing nothing at all from `@/components/listing`,
and the reason turned out to be upstream of the styling: `DeckLegalityChecker`
returns English sentences with the card name interpolated into them, and a panel
handed sentences can only print sentences.

`src/lib/deck/deckLegality.ts` computes the verdict as data, with twelve tests.
Every fault names the row it is about, which is what lets the panel draw the
card and put Remove and Replace on it.

- **Every format, not the one you picked.** `cards.legalities` carries all
  twenty-three keys and the tab printed one. This is Moxfield's headline
  legality feature and the data for it arrived with every deck load.
- **Rules are stated as rules.** "Exactly 100 cards, commander included · this
  deck has 97", so a passing deck reads as passing rather than as an absence of
  complaints.
- **A format the catalogue reports and `ALL_FORMATS` does not model** gets its
  card legality answered and its construction rules reported as unknown, rather
  than being assumed to be four-of 60-card Constructed.
- **One fault per card**, in the order the reasons are unfixable: you cannot
  make a banned card legal by running fewer of it.
- **`DeckValidator`'s advice is still here**, under its own heading at the foot,
  worded as advice. None of it is a rule, and filed under a shield beside the
  banned cards "only 33 lands" read as a rules violation.

### Value

The census: *"the tab with the biggest gap between what is on screen and what is
in the database"*. Four questions, and the data for all four was on the page or
one query away.

- **What this deck has been worth.** `card_price_history` is a table this
  product writes nightly and already charts on the card page, and no deck
  surface read it. One chunked query, `carryForward` for the gaps, and the two
  ways a deck price chart can lie are both handled: a missing day means the
  price did not move, and — the trap that belongs to a deck rather than to a
  card — the series starts on the first day every covered card has a reading, so
  a jump in the line is never a change in coverage wearing the clothes of a
  change in price. The panel says how many of the deck's cards are on record.
- **What you still have to buy**, priced, from the ownership map the page
  already loaded.
- **What it would cost at the cheapest printing of every card**, from
  `oracle_id` and `card_printing_spread`. Rows whose spread could not be read
  are counted at the printing in the deck and the panel says how many, because
  dropping them would make the saving look bigger than it is.
- **What proxying everything over $20 would save**, which is the actual decision
  being made on this screen. Only copies you have yet to buy count: telling a
  player they can save money by not buying something they already own would be
  a lie.
- **The reserved list**, from `cards.is_reserved`. The one fact that says a
  price will not come down.

`src/lib/deck/deckValue.ts` is the arithmetic, with eleven tests. The rule that
ownership is SPENT as the rows are walked is one of them: two rows pointing at
two printings of one card cannot both claim the single copy in the box.

### Record

- **The query moved up.** One `deck_matches` read, one roll-up
  (`src/lib/deck/deckRecord.ts`, seven tests), and the tab's metric row and the
  panel below it cannot disagree even in principle. The year test on "this
  month" is one of the tests, because it shipped without one.
- **A twelve-month timeline.** `played_at` has been on every row since the table
  was created and there was no drawing of it. Every month including the empty
  ones, because the gap is the information.
- **`user_decks.share_view_count`** is a column the census found nothing in
  `src/` reads. It comes down with the deck record, so it costs nothing.
- **The opponent is a card.** `opponent_commander` is free text, so the
  per-opponent breakdown grouped on exactly what was typed and "Atraxa",
  "atraxa" and "Atraxa, Praetors' Voice" were three opponents. The field
  autocompletes against `cards`, legendary creatures only, one debounced query
  per settled search, and shows the card.
- **The primer has a strategy line**, from the archetype the Analysis tab now
  persists. `DeckPrimerGenerator`'s own comment said nothing on the page held
  one.

### PublicDeck

The sixth renderer of the same list, and it must not drift from the other five.

- It mounts `DeckManaPanel`, the whole Mana tab, as a third view beside Visual
  and List. It used to mount `LandEnhancerUX` on its own, so removing that
  panel's duplicate source count would have left this page with no source count
  at all.
- Its decklist draws castability, in the grid and in the table. Both components
  have taken those two optional props since the merge and this page never passed
  them, so a shared deck drew the one column this product has that nobody else
  does as a blank.
- Its metric row has the castability average in it, from the same engine the
  owner's page uses.

---

## 4. Figures that disagreed, and what they say now

1. **Two source counts on the Mana tab.** Section 3, Mana. The engine's is kept;
   the oracle-text regex is gone. Not in the census.
2. **Two land counts on the Mana tab.** Both correct, both wanted, and both were
   labelled "Lands". They are labelled apart now.
3. **The power score drawn twice on the EDH tab**, at two sizes, from one
   object. Not in the census.
4. **A permanently loading tile.** The cheapest-printing figure used
   `cheapestTotal === null` to mean "still reading", which is also what an
   answered-but-empty spread produces, so a deck whose cards have no spread on
   record drew `MetricRow`'s loading bar for ever. "Not fetched yet" and "read,
   and there is nothing" are separate now.
5. **Metric rows mixing tiles that have a bar with tiles that do not.**
   `MetricRow` reserves the bar's line for the whole row the moment one tile
   asks for it, and an empty track on a raised tile reads as a bar at a hundred
   per cent — so a row with two real meters was printing "100%" under three
   figures that have no denominator. Every metric row on these tabs now gives
   every tile a real meter or gives none of them one. Six rows were affected,
   including `EdhAnalysisPanel`'s land row, which was drawing two full bars
   beside three real probabilities.

---

## 5. What was deliberately dropped, and where it went

`DECK-PAGE-AUDIT.md` is the nothing-lost contract. Six things are not on screen
in the same shape they were, and each is named here with what answers it now.

| was | where it went |
|---|---|
| `DeckCompatibilityChecker`'s two colour-pip rows (commander identity, deck colours) | The colour-identity fault type on the Legality list, which names the offending colours per card and offers Remove and Replace. The commander's own identity is drawn in the page header. |
| `SynergyEngine`'s `archetypeMatches` list on the Analysis tab | `ArchetypeDetection` on the same tab, which is the measured archetype read. Two archetype detectors stacked on one tab was a duplicate. |
| `EnhancedDeckAnalysis`'s curve swaps and land-base improvements | The Mana tab, "What would fix this". |
| `EnhancedDeckAnalysis`'s per-section "Deck analysis" buttons (two `mtg-brain` calls) | `BrainAnalysis`'s presets, which the merge documented as covering them. The Analysis tab had three routes to one model and has one. |
| `DeckBudgetTracker`'s "Consider fewer mythic rares to reduce cost" line | Nothing. It was advice with no action attached, and the rarity roll-up beside it shows the same fact as a figure. Named so it is not rediscovered as a loss. |
| The Record tab's "This month" tile | The twelve-month timeline, which shows this month's bar and eleven others. |

---

## 6. Still missing, and why it is not here

These are named rather than attempted, because each one needs something this
pass had no mandate to do.

1. **The primer is not on the public deck page**, and is still `localStorage` on
   one browser. Moxfield's primer is the main reason people read other people's
   decks, and this one is private to its author. Fixing it means a column to
   keep it in, which is a migration on a live product with real users.
2. **A vendor cart handoff.** Both competitors hand a whole decklist to
   TCGplayer in one press. `src/lib/pricing/links.ts` builds per-card links and
   is explicit that a link from a `cards` row can only be a search, because the
   table has no `purchase_uris`. A bulk mass-entry URL would be a format
   invented here and not verified against the vendor, and getting it wrong costs
   a player money. The shopping list is the product's own answer and the Value
   tab hands the whole shortfall to it in one press.
3. **The four things the census set aside** are still set aside and all four
   need a migration: custom categories, a maybeboard, per-card printing, and
   version history. `is_sideboard` still has nothing that writes it.
4. **Multi-vendor pricing.** The catalogue holds six price slots per printing
   and `src/lib/pricing/sources.ts` models all of them. The Value tab's totals
   are USD. Switching the deck total between markets is real work with no schema
   change behind it and is the largest thing left on this tab.
5. **`cards.tags` is still not a decklist filter.** "Show me the eleven cards
   that made you call this Aristocrats" is answered on the Analysis tab, where
   those cards are drawn, rather than by narrowing the Cards tab. A tags facet
   on `DeckCardFilterState` is the fuller answer.

---

## 7. Three notes on things outside this work, and one mistake


**A mistake, and its repair.** The before build was produced in a git worktree
with a directory junction pointing at the main tree's `node_modules`. Removing
that worktree afterwards deleted `node_modules/@radix-ui` through the junction —
the junction was unlinked first and the recursive delete followed it anyway.
`npm install` restored it from `package-lock.json`; the typecheck reports zero
errors, the build succeeds and the whole test suite passes. `package.json` and `package-lock.json` were not
modified. Two things to know:

- The reinstall brought `node_modules` back in line with the lockfile, and the
  tree it replaced was not: the app shell's own request count on every page went
  from 15 to 18 across that boundary, in `profiles` and the wishlist `HEAD`.
  Nothing in `src/` changed between those two measurements. **Every figure in
  section 2a was re-taken afterwards, both halves on the same dependency tree**,
  so the comparison is apples to apples and the shell's baseline is 18 in both
  columns.
- The second worktree was removed by unlinking the junction, verifying
  `node_modules` was intact, and only then calling `git worktree remove`. That
  is the order to use.

The three below are reported rather than fixed.

**The tree typechecks.** `node node_modules/typescript/bin/tsc --noEmit -p
tsconfig.app.json` reports zero errors. It did not at the start of this pass:
`src/lib/game/xmage/bodies.generated.ts` carried about forty
`Property 'trivial' is missing in type … TranslatedBody` errors, which the
engine workflow fixed while this ran. Noted because that file is outside this
pass's ownership and nothing here touched it.

**The repository commits itself.** `scripts/auto-commit.mjs` produced three
`Checkpoint: N files, M tests pass` commits while this ran, and the work below
was carried into them by it. Nothing in this pass ran `git add` or
`git commit`; the commits are the repository’s own automation and they also
carry the engine workflow’s concurrent changes.

**A circular dependency between two barrels.**
`@/components/listing/index.ts` re-exports `useListingView`, that hook imports
`@/components/cards`, and `CardDetail.tsx` in there imports the listing barrel
back. Rollup reports it as *"will end up in different chunks … will likely lead
to broken execution order"*, and it did so on twelve files before this work. The
seven deck panels are lazily loaded chunks, which is exactly the case the
warning is about, so they import the hook from
`@/components/listing/useListingView` directly and are not in the list; the
count went from 12 to 11 because `DeckCardsPanel` came out of it too. The single
fix for all eleven is one import path in `src/components/cards/CardDetail.tsx`,
which is outside this pass's ownership.

---

## 8. The evidence

```
docs/design/deck-tabs/*.png       one full-page shot per tab, 1600 wide
docs/design/deck-tabs/audit.json  controls, card images, hairlines, height
scratch/deck-load-after.json      requests per tab, after
scratch/deck-tabs-before/         the same two, against f7c4215
```

Everything above is reproducible with the two commands in section 1.
