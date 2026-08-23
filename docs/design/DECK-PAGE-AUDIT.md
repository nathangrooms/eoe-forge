# The deck page audit: what the merge actually cost

Audit only. **No file under `src/` was changed by this pass.** The list is what
the next phase works from.

Written 23 Aug 2026.

---

## How this was established

Two builds, one instrument, one fixture deck.

| | commit | what it is |
|---|---|---|
| before | `07218ae` | the last commit with `src/pages/DeckBuilder.tsx` in it |
| after | `e1e254b` | HEAD |

**The merge is `db64dd9`, not `693bbbf`.** `693bbbf` carries the merge's commit
message and its measurement, but `git log --diff-filter=D -- src/pages/DeckBuilder.tsx`
names `db64dd9`, and so does the commit that first added `useDeckEditor.ts`,
`DeckProxies.tsx` and `DeckTestHand.tsx`. Anyone diffing from `693bbbf~1` is
diffing the merge against itself and will find nothing missing. The pre-merge
tree is one commit earlier than it looks.

The before build was checked out into a scratch worktree and served from its own
`dist/`. `scripts/deck-control-census.mjs` and `scripts/deck-save-shim.js` were
copied into it, because both landed with the merge and the point is to measure
both sides with the same instrument. Nothing else in that tree was touched and
`git status` in it is clean.

The census opens a route in a real browser at 1600x1000, clicks every tab in the
strip, and writes down every button, link, field, switch, slider and menu item
inside `#main-content`. Sixteen routes were walked, seven before and nine after.
**Console errors: zero on all sixteen.**

Three things the census cannot reach were driven by hand afterwards, with real
pointer events so Radix menus open: a closed filter panel, an overflow menu, and
a slide over.

What this is not: it is not a pixel audit and it is not a judgement about
whether the merged page looks finished. It answers one question, which controls
a person could reach before and can reach now.

Raw output:

```
<worktree>/scratch/deck-controls-before-{view,builder,analysis,export,share,missing,commander}.json
scratch/deck-controls-after-{deck,export,share,proxies,testhand,commander,analysis,missing,builderredirect}.json
```

---

## 1. The headline

**Nothing a player could reach before is unreachable now.** Fifty two collapsed
control lines appear in the before set and not the after set. Every one of them
resolves to a rename, a rehome, a documented drop, or a duplicate implementation
removed while the capability stayed. Two are worth acting on and neither is a
lost feature.

Sixteen lines are new.

The edit cost has not regressed. `scripts/deck-save-measure.mjs` against HEAD's
`dist`, two runs, identical both times:

```
run 1: 3 requests    DELETE deck_cards (1 row) · GET user_collections · PATCH user_decks (1 row)
run 2: 3 requests    identical
```

Three, the number the merge published.

---

## 2. Routes and tab strips

| route | before | after |
|---|---|---|
| `/deck/:id` | 8 tabs: Cards, Mana, EDH, Analysis, Legality, Value, Primer, Matches | 9 tabs: Cards, Add, Mana, EDH, Analysis, Legality, Optimiser, Value, Record |
| `/deck-builder?deck=x` | 7 tabs: Cards, Add Cards, Analysis, Optimizer, Import/Export, Proxies, Playtest | redirects to `/deck/:id`, lands on the 9 tab page |
| `/deck-builder` (no deck) | redirects to `/decks` | redirects to `/decks` |
| `/deck/:id/analysis` | its own page, 5 sub tabs | redirects to `/deck/:id?tab=analysis` |
| `/deck/:id/missing` | its own page | redirects to `/deck/:id?tab=value` |
| `/deck/:id/export` | own route | own route |
| `/deck/:id/share` | own route | own route |
| `/deck/:id/proxies` | did not exist, was a builder tab | own route |
| `/deck/:id/testhand` | did not exist, was a builder tab | own route |
| `/deck/:id/commander` | did not exist | own route |
| `/deck-builder/commander` | own route | **still its own route**, see finding B |
| `/p/:slug` (PublicDeck) | own route | own route |

Legacy query aliases, all checked by loading the URL and reading which tab
carries `aria-selected="true"`:

| URL | lands on |
|---|---|
| `?tab=visual` | Cards |
| `?tab=list` | Cards |
| `?tab=primer` | Record |
| `?tab=matches` | Record |

The view mode is still in the URL. Clicking Table writes `?tab=cards&view=table`;
clicking Visual removes the parameter, because visual is the default.

The Optimiser is still feature gated. With `check_feature_access` answering
`allowed: false`, the strip is eight tabs and Optimiser is absent rather than
disabled.

---

## 3. The difference, control by control

Card names in the fixture are collapsed to `<card>`, so a hundred identical
hover clusters read as one line. "Reachable now" means a person can get to it,
with the number of presses named where it is more than zero.

### 3.1 Reachable before, reachable now, moved or renamed

| was | where it was | is now | verdict |
|---|---|---|---|
| `Filter and sort` | builder Cards | `Filters`, and Group by and Sort cards by are now always visible rather than behind the trigger | renamed, and less hidden |
| Colour chips: White, Blue, Black, Red, Green, Colourless | view Cards, always open | behind `Filters`, one press | rehomed per the owner's "dont need all those filters by default" |
| Mana value chips: 0, 1, 2, 3, 4, 5, 6, 7+ | view Cards | behind `Filters` | same |
| Rarity chips: common, uncommon, rare, mythic | view Cards | behind `Filters` | same |
| Price chips: Under $1, $1 – $5, $5 – $20, $20+ | view Cards | behind `Filters` | same |
| `Import Deck List` and the paste box | builder Import/Export | `More deck actions` then `Import a decklist`, a right hand slide over holding `Decklist to import`, `Add to this deck`, `Replace the decklist`, `Close` | rehomed, two presses |
| `include-commander`, `include-prices` checkboxes | builder Import/Export | `export-commander`, `export-prices` switches on `/deck/:id/export` | rehomed |
| `include-sideboard` checkbox | builder Import/Export | `export-sideboard` switch, drawn only when the deck has a sideboard (`DeckExportPanel.tsx:179`) | rehomed and improved. The fixture deck has no sideboard so the census could not see it; this line is read from source, not measured |
| Proxies: `Select All`, `Clear`, `List`, `PDF`, `Print`, paper size, quality, `cut-guides` | builder Proxies tab | `/deck/:id/proxies`, all nine controls | rehomed to a URL |
| `Draw Hand` | builder Playtest tab | `/deck/:id/testhand`, plus a new `Play a whole game` | rehomed to a URL |
| `Refresh` on the edhpowerlevel strip | builder, every tab | EDH tab. Same control, same two labels: `Calculate` with no cached level, `Refresh` once there is one (`EdhPowerCheck.tsx:219`) | rehomed |
| tab `Primer`, tab `Matches` | view page | folded into `Record`, and `?tab=primer` and `?tab=matches` both land there | folded, links survive |
| tab `Import/Export` | builder | export at `/deck/:id/export`, import in the slide over | split |
| `Back to decks`, `Open in builder` | `/deck/:id/analysis` | the route redirects, the breadcrumb is on every tab | route retired |

### 3.2 Reachable before, deliberately dropped

| was | where | why, and where the reason is written |
|---|---|---|
| `Edit deck` | view page header, every tab | There is no edit mode. Quantity, replace, remove, add, rename, commander change and the description are simply present. |
| `All decks` | builder header, every tab | Redundant with the breadcrumb, which draws `Home / My Decks` on every tab. Named as a drop in `ONE-DECK-PAGE.md` section 11.3. |
| `Save deck` | builder Optimizer | Every apply now writes its own row, so the button could only ever say "already saved". The save **state** line is still there. Reason is in `AIOptimizerPanel.tsx`, in the comment headed THE VISIBLE SAVE. |
| `Copy to Clipboard`, `Download File`, `Export File`, `Text Format`, `Moxfield Format`, the output textarea | builder Import/Export | `DeckImportExport`'s export half, a straight duplicate. `/deck/:id/export` does the same job with `Copy`, `Download`, an `Export format` select and a `Serialized decklist` box, and now offers six formats where no single old surface offered more than four. |
| sub tab `Validation` | Analysis, both pages | It asserted legality as an input. The Legality tab answers it. |
| sub tab `Mana Curve` | Analysis, both pages | The Mana tab answers it. |
| sub tab `Land Base` | Analysis, both pages | The Mana tab answers it. |
| the four summary tiles above the Analysis sub tabs | Analysis, both pages | `overview={false}` at `DeckInterface.tsx:1242`. Each of the four is a second reading of the metric strip, the Mana tab or the Legality tab. |

The three sub tab drops are governed by a new `sections` prop on
`EnhancedDeckAnalysisPanel`, which still defaults to all six for the deck
generator, so nothing is deleted, only unmounted here.

**One difference from the plan.** `ONE-DECK-PAGE.md` section 10 said Validation
and **Suggestions** would go. What went is Validation, Mana Curve and Land Base,
and Suggestions stayed. Not a loss, but the doc and the code disagree and one of
them should be corrected.

### 3.3 New

| control | where |
|---|---|
| `Rename deck` pencil | every tab |
| `Edit the deck description` | every tab |
| `Share` | header, every tab |
| `More deck actions`, holding Import a decklist, Test hand, Playtest, Print proxies, Duplicate, Delete deck | header, every tab |
| `Change` on the commander block | every tab |
| `Remove commander` | `/deck/:id/commander` |
| `Add one copy`, `Remove one copy`, `Remove all copies`, `Replace`, `Copies of <card>` | Cards tab, grid and table |
| `Group by`, `Sort cards by`, `Sort ascending`, card size slider | Cards tab |
| `Text` view mode, with `Copy decklist` and a `Plain-text decklist` box | Cards tab |
| `Calculate` on the EDH tab | EDH |
| `Archidekt`, `Deckstats`, `Moxfield`, and the three export switches | `/deck/:id/export` |
| `Play a whole game` | `/deck/:id/testhand` |
| tabs `Add`, `Optimiser`, `Record` | the strip |
| the type share percentage, `98 Creatures 99%` | metric strip, rescued from `/deck/:id/analysis` |

---

## 4. Findings

Two, and a third that is a documentation correction.

### Finding A. The commander is no longer in the decklist, and the count sentence says so

Measured, on the fixture deck, both builds, Cards tab:

```
before   TYPE facet:  Commander 1 · Creatures 98 · Lands 1
         list header: 100 cards
         the list opens with a Commander group holding the commander

after    TYPE facet:  Creatures 98 · Lands 1
         list header: 99 cards
         no Commander group
```

The page header says `Commander · 100 cards` four hundred pixels above a list
that says `99 cards`. The commander is drawn whole in the hero with its own
Change control, which is better, so this is not a call to put the row back. It
is a call to make the two sentences agree, and to decide whether "filter this
deck to the commander" was worth anything.

### Finding B. `/deck-builder/commander` never became a redirect

`ONE-DECK-PAGE.md` section 10 lists it under routes that become redirects.
`App.tsx:420` still mounts `DeckCommander` on it, and loading it renders
"Choose your commander". It works, so nothing is broken. It is the last live
`/deck-builder` URL and it is the one that will rot, because it has no deck id
in it and the merged picker is reached at `/deck/:id/commander`.

### Finding C. The brief's stated cause does not survive measurement

The brief says no deck file imports `MetricRow` or `MetricTile`, and that the
deck page's figures render at 24px on a transparent background with no tile
surface. Both are checkable and both are wrong.

`DeckQuickStats.tsx:6` imports `MetricRow` and `MetricTile`. `DeckInterface.tsx`
mounts `DeckQuickStats` at line 1051. It mounted it before the merge too, at
line 618 of the old file. `PublicDeck.tsx:13` imports `MetricRow` as well.

Measured in the browser on `/deck/:id`, computed styles of every figure at or
above 20px and its nearest painted ancestor:

```
after  (HEAD)      "100"   24px/600  bg rgb(17, 17, 19)  box 313.0 x 103.0
                   "$888"  24px/600  bg rgb(17, 17, 19)  box 313.0 x 103.0
                   "3.35"  24px/600  bg rgb(17, 17, 19)  box 313.0 x 103.0

before (07218ae)   identical, all three lines
```

24px at weight 600 on `rgb(17,17,19)`, which is the tile treatment the brief
attributes to My Decks. The metric strip is not the problem, and the merge did
not change it: the two runs are byte for byte the same.

So "doesn't feel complete" is still unexplained. Whatever it is, it is not a
missing tile surface on the metric strip, and the next phase should not start by
fixing that. Two candidates worth measuring before guessing: the Mana tab draws
zero controls of its own and its four panels sit on the page with nothing
between them, and the Cards tab now carries thirty six distinct controls where
the old view page carried twenty eight.

---

## 5. The five that had no home, section 11 of `ONE-DECK-PAGE.md`

| # | item | verdict | evidence |
|---|---|---|---|
| 1 | `DeckAnalysisView`'s five sub tabs as a shape | **deliberately dropped, redirect kept** | `/deck/:id/analysis` lands on `?tab=analysis` with the strip selected. The one thing that page had and nothing else did, the type percentage, is on screen in the metric strip: `98 Creatures 99%`. |
| 2 | `compute_deck_summary`'s own curve, counts and mana sources | **still missing** | No migration since `07218ae`. Two of the three disagreements went away on their own: `PublicDeck` now computes the average mana value from its own rows, and the deck tile stopped printing the curve and the Avg MV at the owner's request. What remains is `counts.lands`, `counts.unique` and `counts.total`, still printed on the tile from the RPC's overlapping `LIKE` tests while the deck page counts with `cardCategories`. Narrower than it was, and still undecided. |
| 3 | the builder's "All decks" | **deliberately dropped** | Gone from every tab. The breadcrumb draws `My Decks` on all nine. |
| 4 | editing the deck description | **restored** | `Edit the deck description` is present on all nine tabs and on the redirect targets. |
| 5 | sideboard editing | **still missing, and one step further away** | Nothing writes `is_sideboard`. Every consumer still reads it and filters on it (`DeckInterface.tsx:351,441`), the exporter offers a switch for it, and the new import slide over draws a badge reading `Sideboard lines go to the maindeck` (`ImportDeckPanel.tsx:191`). The product now tells you in words that it will throw the sideboard away. |

---

## 6. The sub pages

| page | verdict |
|---|---|
| `/deck/:id/analysis` | Retired to a redirect. Its unique figure was carried across. |
| `/deck/:id/export` | **Superset.** Before: `Back to deck`, `Copy`, `Download`, an `Export format` select over four formats, the decklist box. After: all of those with six formats (plain text, Moxfield, MTG Arena, Magic Online, CSV, JSON), plus `Archidekt`, `Deckstats` and `Moxfield` shortcuts and three content switches. Nothing lost from any of the three old exporters. |
| `/deck/:id/share` | Unchanged. `Back to deck` and the public toggle, both builds. |
| `/deck/:id/missing` | Retired to a redirect on `?tab=value`. Every control of the old page is on that tab: the three price bands, `All`, the search box, per card proxy and shopping list buttons, `Add them all to my shopping list`, `Proxy them all`, `Mark as Owned`, `Wishlist`. |
| `/deck/:id/commander` | New route, and a superset of the old picker: same search box, same filters, same suggestion buttons, plus `Remove commander`. See finding B about the old URL. |
| `/deck/:id/proxies` | New route. All nine controls of the old builder tab, none added, none lost. |
| `/deck/:id/testhand` | New route. `Draw Hand` plus a new `Play a whole game`. |
| `/p/:slug` PublicDeck | Fourteen lines changed and all of them are one fix: the average mana value is computed from the rows the page already holds instead of from eight bucket midpoints, so a deck no longer reads one number on the owner's page and another on the public one. It already uses `MetricRow`, `PageTabs`, `DeckCardGrid` and `DeckCardTable`, so it is on the shared vocabulary. Nothing lost. |

The back link on every one of these now returns to the tab you left from, not
just to the deck. `DeckSubpageLayout.tsx` reads `location.state.from` and falls
back to `/deck/:id` for a link typed by hand.

---

## 7. What the next phase should do with this

In order, and the first two are the only ones that came out of a comparison.

1. Make the deck header and the list header agree about the card count, and
   decide whether the Commander bucket in the Type facet is worth anything now
   that the commander is drawn in the hero. Finding A.
2. Redirect `/deck-builder/commander`. Finding B.
3. Decide `compute_deck_summary`'s counts, or stop the tile reading them.
   Section 11 item 2, still open.
4. Sideboard editing. Section 11 item 5, still open, and the import panel now
   says out loud that it discards one.
5. Correct `ONE-DECK-PAGE.md` section 10 where it says Suggestions was deleted.
   Suggestions is on the page and Mana Curve and Land Base are not.
6. The Optimiser is tab seven of nine and disappears entirely when the feature
   flag is off, which was measured here: eight tabs, no Optimiser. That is a
   placement decision, not a loss, and it is the owner's other complaint.

Nothing in this list is "a feature came back". The merge did not lose one.
