# Per-row query loops

> Found 2026-08-23. The inventory below is as it was first written, before any
> fix. **Fixed the same day** — see "What has been fixed" immediately below for
> what changed and what it costs now. Everything after that section is the
> original inventory, left as written, so the before figures stay readable next
> to the after ones.

---

## What has been fixed

Measured the same way both times: a built bundle served over a local gzip
server, requests counted at `window.fetch` in headless Chrome, every run
asserting the page actually drew. The harness is
`docs/overhaul/harness/perrow-measure.mjs` and `perrow-shim.js`. It belongs
beside `scripts/deck-save-measure.mjs` and can move there when `scripts/**`
stops being another workflow's territory.

| # | Where | Fixture | Before | After |
|---|---|---|---|---|
| 1 | "Add the whole deck" into a container | 100 card deck, one press | **1,100** | **6** |
| 2 | `/decks` page load | 9 decks of 100 | **57** | **16** |
| 2 | `/decks` page load | 25 decks of 100 | **145** | **22** |
| 3 | A message thread | 60 messages, 2 people | **73** | **14** |
| 5 | "Add picked" from the collection | 100 picked rows, one press | **500** | **3** |
| 9 | `/collection/import` paste | 100 lines | **105** | **7** |

Same screen in every case. The deck tiles come back in the same order with the
same scores, the thread renders the same messages with the same usernames, and
the import reports the same 99 added and the same one unmatched line in the same
words.

Fixed without a browser measurement of their own, because each is the same fix
reached through the same call: **4** (`CollectionCardDisplay`, the multi-select
"Assign to storage", now one `fileCardsIntoContainer` call — the call measured
at 500 to 3 in row 5), **8** (`fileCardsIntoContainer` itself, which was the
loop), **11** (`StorageMovePanel`, one `storage_move_cards_batch` for the
selection instead of one RPC per item), **13** (`CreateContainerPanel`, one
insert of a template's 26 slots instead of 27 requests), **7**
(`TCGPlayerPriceSync`, now Scryfall's 75-at-a-time `/cards/collection` and one
upsert per 200 rows), and **22** (`src/lib/api/collectionAPI.ts` deleted;
nothing imported it).

Three database functions were added, each a wrapper around the single-row
function that already existed, so no rule is written twice:
`compute_deck_summaries(uuid[])`, `persist_deck_power_batch(jsonb)` and
`storage_move_cards_batch(jsonb)`. All three revoke from `public, anon,
authenticated` and grant back to `authenticated` only.

**Still open, and not mine:** 6, 10, 12, and 14 to 21. 16 is mine and left
alone: it is a Scryfall lookup for deck rows whose printing is missing locally,
and its own comment says "normally none".

A per-row query loop is a database call issued once for every item in a list.
The list is usually a deck, a collection, a thread or a set of selected rows, so
the request count is set by the user's data rather than by the page. This is the
project's worst recurring bug. It has taken the database down twice and produced
a disk IO warning on the project's own dashboard.

`Promise.all` around a per-row query is still a per-row query. It only makes the
requests concurrent, which is worse for the database, because they arrive
together.

**The fix, everywhere, is the same shape:** collect the ids, issue one query with
`.in()`, build a `Map`, read the `Map` in the loop.
`src/components/collection/CollectionBulkImport.tsx:220` already does exactly
this, in chunks of 150, and its comment says why.

---

## What was measured

Three page visits and one button press, in headless Chrome, against a built
`dist/` served over a local gzip server. This is the technique
`scripts/deck-save-measure.mjs` already uses.

Requests were counted at `window.fetch` by a PostgREST stand-in adapted from
`scripts/deck-save-shim.js`. It keeps that script's rules: `cards` and
`cards_unique` are forwarded to the real database with the real anon key and
counted the same as everything else, owner-scoped tables are answered locally and
projected through the request's own `select=`, and writes apply so a loop that
writes N rows is not measured against a table that never changed.

Two things about the counts:

- **`/auth/v1/user` is counted.** `supabase.auth.getUser()` is a real round trip
  to the Supabase origin, and three of the loops below call it once per item.
  Every total below also states the figure without it.
- **Every page was checked for a render.** An early run of `/decks` returned 20
  requests and looked cheap, but the page had thrown into its error boundary and
  showed "This page did not load". The real figure was almost three times higher.
  A count from a page that did not draw is not a measurement.

The harness lives in the session scratchpad, not in `scripts/`, because
`scripts/**` belongs to another workflow.

---

## Ranked

Measured first, then projected. "Grows with" is the column that separates a
nuisance from an outage.

| # | Where | Loops over | Requests | Grows with | Owner |
|---|---|---|---|---|---|
| 1 | `src/components/storage/StorageQuickAddPanel.tsx:169` | every card of a deck | **1,100 measured** | deck size | mine |
| 2 | `src/lib/api/deckAPI.ts:80` + `src/hooks/useDeckPowerBackfill.ts:88` | every deck | **144 measured** | deck count | mine |
| 3 | `src/pages/ListingMessages.tsx:60` | every message | **72 measured** | thread length | mine |
| 4 | `src/components/collection/CollectionCardDisplay.tsx:154` | selected rows | ~400 projected | selection size | mine |
| 5 | `src/components/storage/StorageQuickAddPanel.tsx:224` | selected cards | ~400 projected | selection size | mine |
| 6 | `src/server/routes/collection.ts:425` | every pasted line | ~500 projected | paste length | handover |
| 7 | `src/components/collection/TCGPlayerPriceSync.tsx:63` | every owned card | ~2x collection | collection size | mine |
| 8 | `src/lib/api/storageAPI.ts:541` | every card filed | 5 per card | batch size | mine |
| 9 | `src/components/collection/CollectionBulkImport.tsx:235` | every pasted line | 1 to 2 per line | paste length | mine |
| 10 | `src/server/routes/collection.ts:509` | selected rows | 2 per row | selection size | handover |
| 11 | `src/components/storage/StorageMovePanel.tsx:156` | items being moved | 1 RPC per item | selection size | mine |
| 12 | `src/lib/storageSync.ts:96` | storage rows | 1 per row | rows held | handover |
| 13 | `src/components/storage/CreateContainerPanel.tsx:57` | template slots | up to 26 | fixed by template | mine |
| 14 | `src/components/deck-builder/AIOptimizerPanel.tsx:694` and 3 more | suggestions | up to 15 each | fixed cap | handover |
| 15 | `src/pages/DeckInterface.tsx:1335` | replacements | 1 per replacement | suggestion count | handover |
| 16 | `src/stores/deckStore.ts:493` | unresolved card names | 1 per name | usually zero | mine |
| 17 | `src/components/deck-builder/AIAnalysisPanel.tsx:231` | extracted names | up to 12 | fixed cap | handover |
| 18 | `src/pages/Play.tsx:476` | opponent seats | up to 3 | fixed cap | handover |
| 19 | `src/components/play/PlaymatManager.tsx:89` | saved playmats | 1 per mat | mat library cap | handover |
| 20 | `src/components/admin/TaskManagement.tsx:648` | tasks needing a status change | 1 per task | task count | handover |
| 21 | `src/features/scan/cardRecognition.ts:52` | candidate names | 5 | fixed cap | handover |
| 22 | `src/lib/api/collectionAPI.ts:39` | every pasted line | 3 per line | dead code | mine |

---

## 1. Filing a deck into a container: 1,100 requests for one press

**`src/components/storage/StorageQuickAddPanel.tsx:169`**, reached at
`/collection/storage/:containerId/add`, the "From a deck" tab, the button
labelled "Add the whole deck".

```
for (const card of deck.cards) {
  const added = await withTimeout(CollectionAPI.addCardByName(...));
  await withTimeout(StorageAPI.assignCard({ ... }));
}
```

### Measured

One press, one 100-card Commander deck, deck built from real `cards_unique` rows
so every name resolves the way it would for a user. The window opens after the
page has settled and closes 180 seconds after the press, so this is the cost of
the press and not the cost of arriving.

```
1100 requests to the Supabase origin for ONE press
   300 x  GET   auth:user
   200 x  GET   storage_items
   200 x  GET   user_collections
   100 x  GET   cards
   100 x  GET   cards_unique
   100 x  PATCH user_collections
   100 x  POST  storage_items

  of which /auth/v1/user: 300
  database only:          800
  per card:                11
```

A 10-card run gives 110, exactly 11 per card, so the relationship is flatly
linear with deck size.

### Why 11

Neither helper is a single request. Per card:

| Call | Cost |
|---|---|
| `CollectionAPI.addCardByName` (`src/server/routes/collection.ts:205`) | `auth.getUser`, then one name lookup in `cards_unique` |
| `CollectionAPI.addCard` (`src/server/routes/collection.ts:109`) | `auth.getUser`, one printing lookup in `cards`, one existing-row check, one write |
| `StorageAPI.assignCard` (`src/lib/api/storageAPI.ts:302`) | `auth.getUser`, then `StorageSync.getAvailableQuantity` (one `user_collections` read plus one `storage_items` read), then one existing-item check and one write |

This is the pattern the audit note warns about: a helper called once per item,
where nothing in the calling file looks like a query at all. `deck.cards` reads
like a local array, and it is, but each turn of the loop costs eleven round
trips.

**It beats the previous record.** CLAUDE.md records 443 requests for one page
visit as the worst instance found so far. This is 1,100 for a single button
press, and a Commander deck is the ordinary case rather than a large one.

### What it should be

Four queries whatever the deck size: one `cards_unique` lookup with `.in()` on
the names, one `user_collections` read with `.in()` on the resolved ids, one
upsert of the merged rows, one upsert into `storage_items`. `auth.getUser()`
belongs outside the loop entirely, or should be `getSession()`, which is local
and costs nothing.

The same loop is 60 lines further down at
`src/components/storage/StorageQuickAddPanel.tsx:224` for "From collection",
which skips `addCardByName` and so costs about 8 per card instead of 11.

> **The fix crosses a file-ownership line.** The loop is in
> `src/components/storage/**`, which is mine, but the per-item cost is in
> `src/server/routes/collection.ts`, which is not. Either the helpers grow batch
> entry points, or the panel stops using them and writes the batched queries
> itself. That is a decision for whoever owns `src/server/routes/**`.

---

## 2. The Decks page: 144 requests for 25 decks

Two separate per-row loops on one page, stacked.

**Loop A, `src/lib/api/deckAPI.ts:80`.** One `compute_deck_summary` RPC per deck,
and each one walks that deck's `deck_cards`.

```
const summaries = await Promise.all(
  decks.map(async ({ id }) => { ... this.getDeckSummary(id) ... })
);
```

Callers: `src/pages/Decks.tsx:177`, `src/pages/Tutor.tsx:295`,
`src/components/collection/FavoriteDecksPreview.tsx:151`.

**Loop B, `src/hooks/useDeckPowerBackfill.ts:88`.** Every deck whose stored score
does not match its current decklist is rescored one at a time. Each rescore is
`fetchDeckCards` (one read) plus `persistDeckPower`
(`src/lib/deck/power.ts`, one read and one write), so three requests per deck.

### Measured

Fixture: decks of 100 cards each, no stored analysis, which is the state an
account is in after any decklist edit. Deck tiles confirmed rendered with their
power scores on screen.

| Decks | Total requests | `compute_deck_summary` | `deck_cards` reads | `user_decks` writes |
|---|---|---|---|---|
| 1 | 15 | 1 | 2 | 1 |
| 3 | 26 | 3 | 5 | 4 |
| 9 | **56** | 9 | 13 | 12 |
| 25 | **144** | 25 | 37 | 36 |

About 5.2 requests per deck on top of a fixed cost of roughly 10. Nine decks is
56 requests today. Fifty decks would be around 270.

Two things the numbers show that reading the code does not:

- The RPC count tracks deck count exactly, one per deck, as expected.
- **The backfill writes more often than there are decks.** 36 writes for 25
  decks, 12 for 9. `MAX_PER_PASS` is 12, and the cap is per pass rather than per
  visit, so the effect runs again after it updates the list it is watching. Some
  decks are rescored more than once on a single visit. Worth confirming before
  fixing, because the cause is in the effect's dependencies rather than in the
  loop itself.

### What it should be

`src/components/play/usePlayDecks.ts` already solves the same problem and its
header comment names `getDeckSummaries` as the surviving example of the bad
shape. It reads every deck you could sit down with in **three queries whatever
the deck count**: `user_decks`, then all `deck_cards` for those decks in one
`.in()`, then every commander face in one `.in()`. The Decks page should read the
same way, and the power backfill should score from rows already in hand rather
than re-reading per deck.

---

## 3. A message thread: 62 profile queries to fetch two rows

**`src/pages/ListingMessages.tsx:60`.** One `profiles` query per message, in a
thread that has exactly two participants.

```
const messagesWithProfiles = await Promise.all(
  (data || []).map(async (msg) => {
    const { data: profile } = await supabase
      .from('profiles').select('username').eq('id', msg.sender_id).maybeSingle();
    ...
  })
);
```

### Measured

Fixture: one listing, one thread, two participants, messages alternating between
them. Thread confirmed rendered with every message on screen.

| Messages | Total requests | `profiles` queries | Distinct profiles needed |
|---|---|---|---|
| 6 | 18 | 8 | 2 |
| 20 | 32 | 22 | 2 |
| 60 | **72** | **62** | **2** |

Sixty-two queries for two rows. The count tracks message count exactly, and the
answer is always the same two usernames.

### It is worse than one page load

`loadMessages` is the realtime handler as well as the loader
(`src/pages/ListingMessages.tsx:113`). The whole function re-runs on every
`postgres_changes` event for the thread, so **each new message costs another
round of one-query-per-message**. An active back-and-forth in a 60 message thread
is 60 or more requests per message sent, by both people in the conversation, for
as long as the tab stays open.

### What it should be

One extra query. Collect `sender_id` from the rows already returned, `.in()` them
against `profiles`, build a `Map`, read it while mapping. Two rows, one request,
whatever the thread length. A `select('*, profiles(username)')` embed on the
original `messages` read would make it zero extra requests.

---

## 4 to 13: found, not measured

Projections state their assumption. None were measured, and each says so.

**4. `src/components/collection/CollectionCardDisplay.tsx:154`** ("Assign to
storage" over a multi-select). `StorageAPI.assignCard` per selected row, so about
5 requests per card by the breakdown in section 1. Selecting 50 collection rows
is roughly 250 requests, selecting 100 is roughly 500. Grows with collection
size, which is the thing the product most wants people to have more of.

**5. `src/components/storage/StorageQuickAddPanel.tsx:224`.** The same assign
loop over "From collection" selections, about 8 per card.

**6. `src/server/routes/collection.ts:425`** (`importCollection`). Per pasted
line: one card lookup, then `addCard`, which is `auth.getUser` plus a printing
lookup plus an existing check plus a write. About 5 requests per line, so a
100-card decklist paste is roughly 500. Reachable through
`src/features/collection/store.ts:199`.

**7. `src/components/collection/TCGPlayerPriceSync.tsx:63`.** One Scryfall fetch
per distinct owned card, then one `user_collections` update per collection row
for that card, with a 100ms sleep between cards. The current collection is 51
rows so this is survivable today, but it is linear in collection size and the
sleep means a 5,000 card collection would take over eight minutes while writing
5,000 times. Scryfall also publishes a bulk `/cards/collection` endpoint taking
75 identifiers at a time, which this does not use, and
`src/components/marketplace/useMarketplaceSeed.ts:39` in the same codebase
already calls it correctly.

**8. `src/lib/api/storageAPI.ts:541`** (`fileCardsIntoContainer`). Loops
`StorageAPI.assignCard` over the cards given. Its own doc comment tells callers
to use `StorageAPI.moveCards` "rather than reaching for `StorageAPI.assignCard`
in a loop", which is what the function itself then does.

**9. `src/components/collection/CollectionBulkImport.tsx:235`.** This file is the
reference for the good pattern and its **read** side is correct: line 220 chunks
`.in()` by 150 and explains why. Its **write** side is still one insert or update
per line, sequential. A 100 line paste is 100 writes. The fix is a single upsert
of the merged rows.

**10. `src/server/routes/collection.ts:509`** (`bulkUpdateQuantity`). One read and
one write per selected id, so 2 per row. `bulkDelete` sits directly beneath it in
the same class and does the right thing with a single `.in()` delete. Same file,
same author, both shapes.

**11. `src/components/storage/StorageMovePanel.tsx:156`.** One
`storage_move_cards` RPC per item moved. Cheaper per call than the others because
the work is server-side, but still one round trip per row.

**12. `src/lib/storageSync.ts:96`.** One delete or update per storage row while
draining an excess quantity. Bounded by how many rows hold that card.

**13. `src/components/storage/CreateContainerPanel.tsx:57`.** One `createSlot`
insert per template slot, inside `Promise.all`. The largest template in
`src/lib/storageTemplates.ts` has 26 slots, so creating a binder is 27 requests
that could be one insert of 26 rows.

---

## 14 to 21: bounded, or third party

Real per-row loops, but each has a fixed cap or hits Scryfall rather than the
database. Listed so nobody has to find them again, not proposed for work.

- `src/components/deck-builder/AIOptimizerPanel.tsx:694`, `:726`, `:764`, `:865`.
  One Scryfall lookup per suggestion, capped at 15 or 12 per list.
- `src/pages/DeckInterface.tsx:1335`. One Scryfall lookup per replacement.
  Deliberately serialised with a 120ms gap, and the comment above it explains
  that rate-limited replies come back as CORS errors. Leave the pacing alone.
- `src/stores/deckStore.ts:493`. Scryfall lookups for deck rows whose printing is
  missing from the local `cards` table. The comment says "normally none", and
  with `unique=prints` now in force that should hold.
- `src/components/deck-builder/AIAnalysisPanel.tsx:231`. Up to 12 Scryfall
  lookups, fallback path only.
- `src/pages/Play.tsx:476`. One deck resolve per opponent seat, at most 3.
- `src/components/play/PlaymatManager.tsx:89`. One signed URL per saved mat,
  capped by the mat library limit.
- `src/components/admin/TaskManagement.tsx:648`. One update per task whose status
  changed. Admin only.
- `src/features/scan/cardRecognition.ts:52`. Five Scryfall lookups, fixed.

---

## 22. Dead code

**`src/lib/api/collectionAPI.ts:39`** (`CollectionAPI.bulkImport`) is 3 requests
per pasted line, one of them a Scryfall search. **Nothing imports this file.**
The only mention of it anywhere in `src/` is a comment in
`src/lib/api/scryfall.ts:88` saying "Same mistake in collectionAPI.ts". The class
name collides with the live `CollectionAPI` in `src/server/routes/collection.ts`,
which is what every caller actually uses. Deleting the file is the whole fix, and
it removes a trap for anyone who greps for `CollectionAPI` later.

---

## Already the right shape

Checked and correct. Useful as models, and worth not "fixing" by accident.

| File | What it does |
|---|---|
| `src/components/collection/CollectionBulkImport.tsx:220` | `.in()` chunked by 150, with the comment that explains the rule |
| `src/components/play/usePlayDecks.ts` | every deck in three queries whatever the deck count |
| `src/lib/shopping/api.ts:208`, `:377` | `.in()` chunked by 150 |
| `src/components/deck-builder/proxy-print.ts:131` | `.in()` chunked by 150 |
| `src/lib/cards/printings.ts:77` | `.in()` chunked, partial results kept on error |
| `src/lib/deck/deckCards.ts:136` | `.in()` chunked by 100 for URL length |
| `src/lib/precons/precon-api.ts:141`, `:245` | `.in()` chunked |
| `src/features/dashboard/cardLookup.ts` | one batched join, cached for the session |
| `src/features/dashboard/activity.ts:301` | two reads in parallel, no loop |
| `src/components/marketplace/useMarketplaceSeed.ts` | `.in()` for the ids, Scryfall's 75-at-a-time bulk endpoint for the printings |
| `src/server/routes/collection.ts` `bulkDelete` | one `.in()` delete |
| `src/pages/Wishlist.tsx:290`, `src/pages/Settings.tsx:252` | `.in()` over deck ids |

Two shapes that look like this bug and are not:

- `src/hooks/useScryfallPage.ts:155` and `src/lib/vision/loadIndex.ts:185` are
  pagination. The loop is over pages of one result set, bounded by a guard.
- `src/components/cards/CardRelated.tsx:445` runs one query per synergy tag, four
  tags, a fixed number that does not move with user data.

---

## One thing that is not on the list

There is no case anywhere in `src/` of a component that fetches in its own
effect being rendered once per row of a list. That shape was searched for
specifically, by resolving every JSX tag inside a `.map()` back through the
importing file to the component's real source, and counting only components whose
own file issues a Supabase call from `useEffect` or `useQuery`. Zero sites. It is
the per-row loop that is hardest to see in review, so it is worth knowing it is
absent rather than assuming it.

---

## Reproducing the measurements

The three harness files are in the session scratchpad rather than `scripts/`,
because `scripts/**` belongs to another workflow. To make them permanent, move
them next to `scripts/deck-save-measure.mjs`, which they were adapted from.

```
npm run build

# page visits: /decks and the message thread
node per-row-measure.mjs "/decks" decks-9                 # DM_DECKS sets the deck count
node per-row-measure.mjs "/marketplace/messages/<id>" msgs-60   # DM_MSGS sets thread length

# one button press: filing a deck into a container
DECK_SIZE=100 SETTLE=180000 node storage-file-deck-measure.mjs
```

On Git Bash, prefix with `MSYS_NO_PATHCONV=1` or the leading slash in the route
is rewritten into a Windows path and Chrome refuses to navigate.

Two rules worth keeping if these become permanent scripts. Assert the page
rendered, because a page that threw into its error boundary reports a low and
meaningless number. And make writes actually apply in the stand-in: an early run
here reported 800 requests instead of 1,100 because `.single()` was ignored on
`PATCH`, which returned an array, which made `card_id` undefined, which made
every storage assign fail early and skip three of its requests.
