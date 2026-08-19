# Visual audit — every page in the left nav

**Date:** 2026-08-19 · **Method:** `scripts/visual/audit-pages.mjs` · **Shots:** `.shots/audit/` (gitignored)

24 routes, photographed and measured at **1680×1050** and **1280×720**. This is the first time the
pages behind `ProtectedRoute` have been looked at, so this document is mostly a list of things
nobody had seen.

---

## How the auth wall was bypassed

No credentials, no account, no login request.

`scripts/play-combat-shots.mjs` already solved this for one page by mounting `Play` with App.tsx's
providers and no auth gate. That renders the page *without the shell* — and the shell is what this
audit is about, since "does this page fill the screen" is a question about the rail, the
`md:ml-[var(--nav-rail-w)]` offset, and what the page does with what is left.

So this runs the **real** `index.html` → `src/main.tsx` → `src/App.tsx` and swaps exactly one module
underneath it: a throwaway Vite config aliases `@/components/AuthProvider` to a stub returning a
signed-in user. Nothing in `src/` is modified. `App.tsx`, `ProtectedRoute`, `TopNavigation`,
`LeftNavigation` and every page are the shipped code, and `BrowserRouter` still works, so every route
is reachable by URL. Harness files land in `scratch/visual-audit/`, already gitignored.

### What these screenshots do and do not prove

The stub user is not a real Supabase session, so requests still carry the anon key and RLS returns
nothing for user-scoped tables. **Your decks, your collection and your wishlist are legitimately
empty in these shots.** Public tables (`cards`, precons, listings) return real rows, which is why
`/cards`, `/precons` and `/marketplace` are full of real cards.

So: an empty region is only a finding if the page fails to render a proper empty state, or the empty
state itself is misbuilt. Layout, width, gutters, card size, overflow and console errors are
measured faithfully and are what this document is about.

---

## Measurements

`main` is the content area beside the rail. `band` is the union of everything inside it that
actually paints. `fill%` is band ÷ main — how much of the available width the page uses.

| Route | main | band @1680 | fill% | card median @1680 → @1280 |
|---|---|---|---|---|
| `/` | 1424 | 1376 | 97% | — |
| `/collection` | 1424 | 1424 | 100% | — |
| **`/collection/import`** | 1424 | **768** | **54%** | — |
| **`/collection/insurance`** | 1424 | **768** | **54%** | — |
| `/scan` | 1424 | 1376 | 97% | — |
| `/scan/camera` | 1424 | 1376 | 97% | — |
| `/wishlist` | 1424 | 1424 | 100% | 186 → 186 |
| `/decks` | 1424 | 1376 | 97% | — |
| `/decks/new` | 1424 | 1424 | 100% | 186 → 186 |
| `/deck-builder` | 1424 | 1376 | 97% | — |
| **`/deck-builder/commander`** | 1424 | 1376 | 97% | **157** → 178 |
| `/smart-builder` | 1424 | 1376 | 97% | 202 → 211 |
| `/precons` | 1424 | 1384 | 97% | 125 → 134 |
| `/tournament` | 1424 | 1376 | 97% | — |
| `/tournament/new` | 1424 | 1376 | 97% | — |
| `/cards` | 1424 | 1376 | 97% | 219 → 235 |
| `/marketplace` | 1424 | 1376 | 97% | 219 → 235 |
| `/brain` → `/tutor` | 1424 | 1376 | 97% | — |
| `/admin` | 1424 | 1376 | 97% | — |
| `/settings` | 1424 | 1376 | 97% | — |
| `/templates` | 1424 | 1376 | 97% | — |

**No page scrolls horizontally at either size.** No page threw an uncaught error. No page failed to
render. The shell itself is sound — the rail is 256px, `main` gets the rest, and 19 of 24 pages sit
at the 97–100% the 24px page padding allows.

Raw data for every route and both widths: `.shots/audit/audit.json`.

---

# Findings, worst first

## 1. Marketplace card controls overflowed their tile and were silently cut off — **FIXED**

**File:** `src/components/marketplace/PriceSearchPanel.tsx`
**Before:** `.shots/audit/marketplace-1680-before.png` · **After:** `.shots/audit/marketplace-1680-after.png`

Every tile's `Prices | Watch | List` row was **19px wider than the tile that contained it** at
1680×1050. Three consequences, all visible in the before shot:

- The last column's **"+ List" button is sliced in half** by the right edge of the page.
- Every row's controls **run underneath the neighbouring tile's**, so the strip reads as one
  continuous run of buttons instead of three-per-card, and the hit target nearest a tile boundary
  belongs to the wrong card.
- There is **no scrollbar to reveal any of it**, because `StandardPageLayout` wraps its children in
  `overflow-x-hidden`. The content was not merely overflowing, it was being thrown away.

Cause: the three buttons were `flex-1` with no `min-w-0`. A flex item defaults to
`min-width: auto`, so `flex-1` cannot shrink an item below its own content width — the row measured
~238px inside a 219px tile and simply overhung. This exact idiom is already used correctly twice
elsewhere in the same file (lines 630 and 857); the button row just missed it.

Fixed by adding `min-w-0` to the three buttons. Measured after: band 1395 → 1376, right gutter
5 → 24, clip warning gone.

## 2. The commander picker hid every commander's name behind its own rank badge — **FIXED**

**File:** `src/components/deck-builder/CommanderSelector.tsx`
**Before:** `.shots/audit/deck-builder-commander-1680-before.png` · **After:** `…-after.png`

The `#1 … #12` rank pill was positioned `absolute left-1.5 top-1.5` — which on a Magic card is
exactly the printed title bar. On all twelve tiles the first third of the commander's name was
covered by the badge: `#3 …n, Nimble Pilferer` instead of *Ragavan, Nimble Pilferer*,
`#9 …Corrupt Shirriff` instead of *Lotho, Corrupt Shirriff*.

This is the page whose entire job is "look at these cards and pick one", the grid renders at 157px
(see finding 4) so the card face is already hard to read, and the name repeated underneath the tile
is `truncate`d. The one legible copy of the name was the one being covered.

Fixed by moving the pill to `bottom-1.5 right-1.5` — over the collector/artist line, the one region
of a card face nothing here needs to read. Price already owns bottom-left.

## 3. Two pages use 54% of the screen and leave 328px of dead charcoal down each side

**Files:** `src/pages/CollectionImport.tsx:20`, `src/pages/CollectionInsurance.tsx:89`
**Shots:** `.shots/audit/collection-import-1680.png`, `.shots/audit/collection-insurance-1680.png`

Both wrap their content in `mx-auto w-full max-w-3xl` — 768px inside a 1424px band. At 1680×1050
that is **328px of empty background on the left and 328px on the right**, and on the import page the
bottom ~270px is empty too. The import screen is a format dropdown, one textarea and two buttons
marooned in the middle of a widescreen monitor.

These are the only two routes in the entire nav below 95% fill. Every other page — including
`StandardPageLayout` itself — is already full-bleed, so this is not a house style, it is two pages
that were never updated. `src/pages/Settings.tsx:61` carries a comment saying its own `max-w-3xl`
was removed for exactly this reason; these two were missed by that sweep.

The textarea in particular wants the width: a decklist paste is 30–100 lines of
`4 Lightning Bolt (2X2) 117`, and a review table follows it.

## 4. Every card grid gives you *smaller* cards on a *bigger* monitor

**File:** `src/components/cards/CardGrid.tsx:40`
**Shots:** `.shots/audit/cards-1680.png` vs `cards-1280.png`

Measured, on every grid in the app:

| Page | card width @1280 | card width @1680 |
|---|---|---|
| `/cards` | 235px | **219px** |
| `/marketplace` | 235px | **219px** |
| `/smart-builder` | 211px | **202px** |
| `/deck-builder/commander` | 178px | **157px** |
| `/precons` | 134px | **125px** |

Going from a 1280 laptop to a 1680 desktop makes every card in the product **7–12% smaller**.

Cause: `repeat(auto-fill, minmax(min(${width}px, 100%), 1fr))`. `auto-fill` packs in as many columns
of at least `width` as will fit, *then* distributes the remainder. Extra screen width is therefore
spent almost entirely on more columns and barely at all on bigger cards — at 1376px of content and a
190px slider you get 6 columns of 219px, while 976px gets 4 columns of 235px.

This is a defensible responsive-grid default, but it is pointed the wrong way for this product.
"Cards are tiny on screen" is the most repeated complaint in this project, and the current geometry
means the users most likely to complain — the ones on the biggest displays — get the worst of it.
Worth deciding deliberately rather than inheriting it from `auto-fill`: e.g. scale the default
slider width with the container, or round the column count *down* and let tracks grow.

## 5. The commander picker renders the smallest cards in the app, on the page that most needs large ones

**File:** `src/components/deck-builder/CommanderSelector.tsx:46` (`useCardSize('commander-picker', 150)`)
**Shot:** `.shots/audit/deck-builder-commander-1680.png`

157px at 1680×1050 — against 219px on `/cards` and 202px on `/smart-builder`. At 157px the rules
text on a commander is a grey texture, not words. The component's own doc comment says a commander
is chosen "by looking at it — the art, the colour pips, the silhouette — so this is a card grid at a
size the user controls, not a list of 64px thumbnails". The default it ships with is closer to the
thing it is arguing against than `/cards` is.

The underlying problem is that **every card surface picked its own default width by hand**, and the
one page built around choosing a card by sight drew the smallest number:

| Default | Surface |
|---|---|
| 150 | `deck-builder/CommanderSelector.tsx:46`, `precons/PreconDeckView.tsx:72` |
| 168 | `ai-builder/CommanderStage.tsx:106` |
| 172 | `pages/NewDeck.tsx:81` |
| **176** | `cards/CardSizeSlider.tsx:16` — the shared `CARD_WIDTH_DEFAULT`, which almost nothing uses |
| 190 | `universal/EnhancedUniversalCardSearch.tsx:149` (`/cards`), `marketplace/PriceSearchPanel.tsx:212` |

Five different values, no stated rationale for any of them, and the shared constant is the one
least used. Note the two commander pickers disagree with each other by 22px (150 vs 172) while
doing the same job.

There is also ~200px of empty panel below the twelve results before the page ends.

## 6. `/collection` renders a session error as a full-page void with no page chrome at all

**Shot:** `.shots/audit/collection-1680.png`

**Caveat first, because it matters:** the *error* here is caused by the audit harness — the stub user
has no real Supabase session, so the collection query fails. A signed-in user will not normally see
this. What is real is the **presentation**, which is shipped code and is what a user hits whenever a
session expires mid-session or the query genuinely fails.

The entire 1424×990 content area is empty charcoal except for one line of red text —
"Error loading collection: User not authenticated" — and a Retry button, both centred in the void.
There is no "My Collection" heading, no breadcrumb, no tabs, nothing to say what page you are on.
It is the only page in the audit with `h1 = null`. Compare `/wishlist`
(`.shots/audit/wishlist-1680.png`), which keeps its title, its four stat tiles and its tab strip and
puts the empty state *inside* the page. The error path should do the same.

## 7. Page titles disagree with the rail that navigated to them, and with each other

**Shots:** all of `.shots/audit/*-1680.png`

The rail label and the `h1` you land on do not match:

| Rail says | Page says |
|---|---|
| My Decks | **Deck Manager** |
| Scan Cards | **Card Scanner** |
| Play a Game | **Play** |

And `/deck-builder`'s `h1` is literally **"Deck Builder"** — the exact name CLAUDE.md §12 *Naming*
retires ("Deck Builder" → **New Deck**).

Casing is split roughly down the middle across the 24 pages. Title Case: *Deck Manager, Card
Scanner, Deck Generator, Deck Templates, Deck Builder, Precons, Tournaments, Marketplace, Admin,
Playtest, Tutor, Wishlist*. Sentence case: *Card search, Life counter, New deck, New event, Account
settings, Camera scan, Import cards, Insurance report, Choose your commander*. Whichever is right,
half the app is wrong, and it is visible the moment you click down the rail.

## 8. The Tutor/Brain page caps at a reading column and leaves ~340px of dead space above the composer

**File:** `src/pages/Brain.tsx:614,819` (`mx-auto w-full max-w-6xl`)
**Shot:** `.shots/audit/brain-1680.png`

The chat column is capped at 1152px inside a 1424px band — 136px dead down each side. A reading-width
cap on a chat transcript is defensible, unlike finding 3.

Less defensible: with an empty thread the intro block ends around y=560 and the composer is pinned at
y=900, leaving ~340px of empty charcoal between the last suggestion chip and the input. Either
bottom-anchor the intro so it sits above the composer, or centre the whole block in the space.

> **Note:** this page was renamed mid-audit by a concurrent workflow — `MTG Brain` → `Tutor`, and
> `/brain` now `<Navigate>`s to `/tutor`. The shot above is `Brain.tsx` as it rendered during the
> audit. `/tutor` itself is new and still being built (it has open typecheck errors in
> `src/components/tutor/conversations.ts`) and was **not** audited.

## 9. Two "New deck" buttons, 50px apart, on the dashboard

**Files:** `src/components/navigation/TopNavigation.tsx:140`, `src/pages/Dashboard.tsx:98`
**Shot:** `.shots/audit/home-1680.png`

The top nav carries a persistent `+ New deck`, and the Dashboard header renders its own `+ New deck`
directly beneath it at the same right edge. Identical label, identical icon, identical destination,
vertically adjacent. The page-level one is the redundant one — the nav button is on every route.

---

## Checked and dismissed — not findings

Recording these so they are not "discovered" again:

- **`/precons` hand-rolled card images.** The probe flagged five Scryfall `<img>` outside a
  `CardImage` frame. They are `/art/front/` **art crops** used as the tile's identity ground — the
  approved pattern, not a `CardImage` bypass. The commander itself on each tile *is* a `CardImage`.
- **Clipped text on `/decks/new` and `/simulate`.** The overflow warnings resolve to spans carrying
  `truncate`. Deliberate ellipsis, working as intended.
- **`/deck-builder` looking identical to `/decks`.** `DeckBuilder.tsx:234` `navigate('/decks')` when
  there is no `?deck=` param. A deliberate redirect, not a duplicated page.
- **Page-level back links** (`← Collection`, `← Decks`, `All decks`). These are *named
  destinations*, which `DeckBuilder.tsx:794` documents as the sanctioned pattern versus a control
  labelled "Back". Worth noting that five deck sub-pages do pass `backLabel="Back to deck"`, which
  is a literal "Back" and does contradict that comment — flagged, not fixed, since it is a shared
  pattern decision rather than a bug.

## Not audited

- **`/play`, `/life`, `/simulate`** — owned by a concurrent workflow that rewrote
  `src/components/play/**` and `src/lib/game/**` during this audit. Shots exist in `.shots/audit/`
  but nothing is raised against them; they would be findings against a moving target.
- **`/tutor`** — created mid-audit, still failing typecheck.

---

## Reproducing

```
node scripts/visual/audit-pages.mjs                        # all 24 routes, both widths
node scripts/visual/audit-pages.mjs marketplace cards      # named routes only
```

The script starts its own Vite on a free port from 8123 up and **never reuses a server it finds
listening** — the first attempt at this audit picked up another agent's harness on 8099 and reported
"shell did not render" for all 24 routes. It also runs with **HMR and file-watching off**: with them
on, other agents' saves hot-reloaded pages between the settle and the screenshot, and a save caught
mid-write showed Vite's compile-error overlay instead of the product. Records carrying a
`buildError` are contamination and are labelled as such rather than reported as defects.
