# DeckMatrix — Project Context

> **Read this first, every session.** It is the durable memory for this project.
> Live progress lives in the **Dev Console** (`/admin` → Dev tab), backed by the `dev_*` tables.

---

## 1. What this is

DeckMatrix is a Magic: The Gathering deck-building, collection-management and marketplace platform.
It is a **live product with real users** — 13 registered accounts and real collection/deck data.
Treat every change as production-affecting. Do not break existing user data.

**Goal:** be the best MTG platform in the world. Benchmark against Moxfield, Archidekt, EDHREC and Scryfall.
Judge all UI/UX **as an MTG enthusiast**, not as a generic web app.

---

## 2. Canonical locations — do not get these wrong

| Thing | Value |
|---|---|
| **Working repo** | `C:\Users\natha\Desktop\Software\Deckmatrix` |
| **GitHub** | `https://github.com/nathangrooms/eoe-forge` (branch `main`) |
| **Live site** | `https://deckmatrix.com` (apex only — `www.` does **not** resolve) |
| **Hosting** | **Lovable** — *not* Vercel |
| **Supabase project** | `MTG` — ref `udnaflcohfyljrsgqggy`, region `eu-west-2`, Postgres 17 |

### Dead ends — ignore these, they are NOT the project
- `C:\Users\natha\DeckMatrix` — abandoned empty Turborepo scaffold (2 files, all dirs empty)
- `C:\Users\natha\MTG App\eoe-forge` — stale clone, ~1,142 commits behind, 137 uncommitted files
- `C:\Users\natha\Desktop\Software\MTG -Deck Matrix` — logo image assets only

### Naming
The repo is called **`eoe-forge`** (EOE = *Edge of Eternities*, the MTG set it was scaffolded during).
The product is **DeckMatrix**. Same thing. Not "aoe-forge".

---

## 3. Stack

- **Vite 5** + React + TypeScript, `bun.lockb` present but **stale — use `npm`** (bun not installed)
- Tailwind + **shadcn/ui** (`src/components/ui/`, 55 files)
- **Zustand** stores (`src/stores/`), TanStack Query
- **Supabase**: Postgres + Auth + 20 Edge Functions
- 485 `.ts`/`.tsx` files under `src/`

```bash
npm install && npm run dev
```

Build is verified working (`npm run build`, ~33s). Two known non-blocking warnings:
main chunk is 2.7 MB (needs code-splitting), and `client.ts` is both statically and dynamically imported.

---

## 4. Deployment flow

**Lovable hosts the live site and syncs bidirectionally with GitHub.**

```
local edit → git push origin main → Lovable picks up → publish from Lovable
```

⚠️ Lovable also **auto-commits to `main` itself**. If work happens in both places you get competing
writes. **Always `git pull` before starting a session.** Recent history shows Lovable-generated commits
(paired same-timestamp commits, messages like "Changes").

Vercel migration was considered and **deliberately deferred** — Lovable hosting is free and working.

---

## 5. Auth & admin

- Admin gate is **`profiles.is_admin`**, read in `src/components/AuthProvider.tsx` and exposed as
  `isAdmin` from `useAuth()`. `/admin` checks `if (!user || !isAdmin)`.
- **Only `admin@admin.com` currently has `is_admin = true`.** The owner's personal accounts
  (`nathangrooms@live.com`, `nathandavidgrooms@gmail.com`) do **not** — worth granting.
- All `dev_*` tables must be **admin-only via RLS** using the same `profiles.is_admin` check.

---

## 6. Known state — established 2026-08-18

### 6.1 Supabase was paused; now restored
Free-tier auto-pause after ~7 days idle took the project `INACTIVE`, which broke login **and the live
site** (frontend loaded, every auth/data call failed). Restored and verified: **13 users, 34 tables,
159 MB, all data intact.**

> **If login breaks again, check project status first** — it will pause again after inactivity.

### 6.2 🔴 Card sync is broken — root cause identified
- `cards` table: **31,880 rows**, frozen at **2026-01-31** (`sync_status.last_sync`)
- Scryfall now returns **32,726** for the app's own query → **~1,500+ cards missing**
- **Root cause: there is no `pg_cron` job for `scryfall-sync`.** The only scheduled job is
  `daily-price-capture` (`0 6 * * *`). Sync only ever runs when manually triggered from the admin UI.
- `sync_status.scryfall_sets` has **never run** (`last_sync = null`, status `pending`)
- Recent sets are nearly absent — measured coverage:

  | Set | In DB | Actual | Released |
  |---|---|---|---|
  | `hob` / `hoc` The Hobbit | **0** | 321 / 158 | 2026-08-14 |
  | `msc` Marvel Super Heroes Commander | **7** | 866 | 2026-06-26 |
  | `msh` Marvel Super Heroes | **14** | 453 | 2026-06-26 |
  | `soc` Secrets of Strixhaven Commander | **5** | 426 | 2026-04-24 |
  | `sos` Secrets of Strixhaven | **2** | 368 | 2026-04-24 |
  | `tmt` TMNT | 69 | 320 | 2026-03-06 |

  (The small non-zero counts are pre-release spoiler cards that existed on Scryfall before the last sync.)

**Why this matters beyond missing cards:** every recommendation, AI build, power calculation and
deck-optimizer result is computed against this stale table. Fixing sync is a prerequisite for trusting
any AI output. Sync must become **automatic, resumable and complete** — the stored `next_page_url`
in `sync_status.error_message` shows it paginates and stalls.

#### 🔴 The watchdog has never once worked — confirmed 2026-08-19, **not yet fixed**

`cron.job` 3 (`scryfall-sync-watchdog`, `*/15 * * * *`) calls
`public.resume_scryfall_sync_if_stalled()`, which builds its return string with
`format('resumed stalled run (%.1f min idle)', …)` and `format('healthy (status=%s, idle=%.1f min)', …)`.
Postgres `format()` accepts only `%s`, `%I`, `%L` and `%%` — `%.1f` is a hard error. Every run since
the job was created has ended:

> `ERROR: unrecognized format() type specifier "."` — `resume_scryfall_sync_if_stalled()` line 26

Confirmed in `cron.job_run_details`: status `failed`, every 15 minutes, no exceptions. The
`perform public.trigger_scryfall_sync('resume')` call sits *before* the throwing `return`, so the
exception **rolls the resume back** — the watchdog is not merely silent, it actively undoes its own
work. `sync_status.scryfall_cards` has been stuck `running` at page 46 / 32,726 (7,875 processed)
since 2026-08-18, which is why the sets above are still missing.

Fix is `round(stalled_mins, 1)` passed through `%s` on **both** `format()` calls (plain `%s` on a
numeric prints full precision). ~~Deliberately not applied.~~ **Applied 2026-08-19**, migration
`fix_sync_watchdog_format_specifier_and_schedule_unique_refresh`, because the printings sync below
is a 553-page resumable run and the watchdog is the thing that rescues it.

### 6.3 We held one printing of every card — fixed 2026-08-19

`cards` was 34,088 rows over 33,037 distinct `oracle_id`s: **1.03 printings per card**. Every
alternate art, borderless, extended art, showcase, promo and reprint was being discarded at the
source, by one parameter in `scryfall-sync`:

```
https://api.scryfall.com/cards/search?q=-is%3Adigital+game%3Apaper&unique=cards
```

Measured against Scryfall for that exact query on 2026-08-19:
`unique=cards` **32,726** · `unique=art` **47,604** · `unique=prints` **96,732**.

It matters because three things are about a *printing*, not a card, and none of them can work
against one printing per card: **collection value** (printings differ enormously in price and you
own a particular one), **the scanner** (it identifies a card BY its artwork), and **marketplace
listings** (a listing is always for a specific printing).

Now `unique=prints`. The constant lives in one place, `CATALOGUE_UNIQUE` in
`supabase/functions/scryfall-sync/index.ts`.

#### The two card sources — read this before writing any card query

Holding every printing creates the opposite danger, and it is worse than the problem it fixes: a
commander picker that offers the same legend eight times, or a suggestion list that spends every
slot on reprints of Sol Ring. So there are **two sources and every caller declares which it wants**:

| Source | Holds | Use for |
|---|---|---|
| **`public.cards_unique`** | one row per `oracle_id` | **the default.** Search, commander selection, all suggestions and recommendations, deck-building candidate pools, the optimiser, Tutor, deck lists |
| `public.cards` | every printing | only where the printing IS the subject: collection rows, marketplace listings, scanner results, the art-variants list on a card page |

In app code go through `src/lib/cards/cardQuery.ts` — `uniqueCards()` and `cardPrintings()` — rather
than writing `from('cards')`, which reads like "the cards table" and silently returns printings.
The rule and the dedupe itself live in `src/lib/cards/source.ts`, tested by `source.test.ts`.

**Which printing represents a card:** cheapest USD price, a priced printing beats an unpriced one,
ties break on the lowest `id`. That is the deck optimiser's existing convention
(`deck-optimizer/_engine/deck/recommend/rank.ts`, `cheaper()`), copied rather than reinvented, and
it is written in exactly three places that are checked against each other: the `order by` of
`cards_unique`, `comparePrintings()` in `source.ts`, and the optimiser. Verified: for all 995
oracle_ids with more than one printing, all three choose the same row.

`cards_unique` is a **materialized view** with a UNIQUE index on `oracle_id`, so the database itself
refuses to hold a duplicate. It is rebuilt by the `cards-unique-refresh` cron job every 15 minutes,
which no-ops when nothing changed and refuses to run mid-sync. It **cannot** be refreshed from a
PostgREST request: `authenticator` carries `statement_timeout=8s` and a CONCURRENT refresh takes
minutes, so `refresh_cards_unique()` records the request and returns when the caller has no time.

> ⚠️ **Adding a column to `cards` does not add it to `cards_unique`.** A materialized view freezes
> its definition. Re-run `cards_unique_tracks_every_column_of_cards` after any `alter table cards`,
> or callers reading the view get "column does not exist". `public.cards_unique_column_drift()`
> returns what is missing.

---

## 7. Database

39 public tables (re-counted 2026-08-18). Largest: `cards` (34,088), `card_price_history` (31,626),
`deck_cards` (459), `tasks` (166), `activity_log` (130), `wishlist` (94), `user_collections` (51),
`user_decks` (15), `profiles` (13).

### Price-history coverage — diagnosed 2026-08-18, **fixed 2026-08-19**

**The old `daily-price-capture` loop was the bug.** It paged the whole `cards` table but fetched
Scryfall one card at a time with a 125 ms delay, always starting at `offset=0` (cron passed no
offset), so it died on the edge wall clock after ~400 cards and re-captured the *same* first cards
every run. Its `BATCH_SIZE = 75` constant (Scryfall's `/cards/collection` bulk limit) was declared
and never used. Coverage was 701 of 34,088 cards and only **14 of the 583 card ids users own,
wishlist, deck or list**. Capture also stopped entirely between 2026-02-20 and 2026-08-18.

`scryfall-sync` already refreshes `cards.prices` nightly (33,903 of 34,088 rows touched within 2
days), so the snapshot needs **no Scryfall traffic at all**. `public.capture_daily_prices(p_scope,
p_min_usd, p_date)` does it as an `INSERT … SELECT`: measured 2,884 rows in 2.5 s for scope
`'relevant'`, 34,088 rows in 1.6 s for scope `'all'`. Storage measured at **410 bytes/row**
including the three indexes:

| scope | rows/day | rows/year | storage/year |
|---|---|---|---|
| user-relevant only (572) | 572 | 209 k | ~86 MB |
| relevant + ≥ $20 (1,138) | 1,138 | 415 k | ~170 MB |
| **relevant + ≥ $5 (2,884) — in force** | 2,884 | 1.05 M | **~430 MB** |
| entire catalogue (34,088) | 34,088 | 12.4 M | ~5.1 GB |

**Cron job 1 now runs `select public.capture_daily_prices('relevant', 5)` in SQL** and no longer
POSTs the edge function (which also removed a hardcoded anon JWT from the cron command). Migration
`20260819000648_repoint_daily_price_capture_to_set_based_rpc`. Measured after the first run:

| | before | after (2026-08-19) |
|---|---|---|
| distinct cards with history | 701 (2.06%) | **3,528 (10.35%)** |
| user-relevant ids covered | 14 / 583 | **572 / 583** |
| rows written per night | ~405 | 2,884 |

The 11 uncovered ids are orphan `wishlist` rows whose `card_id` has no row in `cards` — 10 stale
UUIDs and one literal string `'sol-ring'` (a slug, not an id: a bug in the wishlist writer).

`EXECUTE` on `capture_daily_prices` is `postgres` + `service_role` only. The
`daily-price-capture` edge function survives as a thin RPC wrapper for manual/admin triggers; it is
deployed `verify_jwt = false`, so its `?scope=all` override is gated on the caller presenting the
service-role key — otherwise an anonymous request could write all 34,088 rows in 1.6 s on repeat.
**The rewritten wrapper is not yet deployed** (`git push` → Lovable). Cron does not touch it, so
nightly capture is already correct; a manual invoke still runs the old loop until it ships.

### oracle_text — established 2026-08-19

`cards.oracle_text` is NULL for **854** rows and that is **correct, not a gap**: all 854 are
multi-face layouts (transform 396, adventure 160, split 124, modal_dfc 100, prepare 52, flip 21,
double_faced_token 1) and Scryfall itself publishes no top-level `oracle_text` for them — the text
lives in `card_faces[]`. `src/lib/cards/abilities/normalize.ts:158` already reads
`card.faces ?? card.card_faces`.

The real gap was **52** `prepare`-layout cards (Secrets of Strixhaven, `sos`/`soc`/`fra`) that had
neither `oracle_text` **nor** `faces`, because `backfillFaces` selected on a hardcoded
`MULTI_FACE_LAYOUTS` allowlist that predated the layout. Backfilled from Scryfall's
`/cards/collection`; **0 cards now have neither**. The selector is now
`layout IN (…) OR name LIKE '%//%'` so a future layout self-heals — measured: all 854 rows carrying
`faces` also carry `//` in the name (zero false negatives) and exactly one false positive exists in
34,088 rows (`SP//dr, Piloted by Peni`).

The **351 empty-string** `oracle_text` rows are all `layout = normal` vanilla creatures with
genuinely no rules text (Squire, Scathe Zombies, Bronze Sable…). Leave them alone — writing text
into them would make them look processed.

Existing enums: `task_status` (pending, in_progress, blocked, done), `task_category` (feature, bug,
improvement, core_functionality), `task_priority` (high, medium, low), `subscription_tier` (free, pro, unlimited).

**Extensions:** `pg_cron` and `pg_net` are both installed and available for scheduling.

### `meta_*` tables — third-party decklists, combos and inclusion data (added 2026-08-19)

Closes the "no co-occurrence data" gap, partially and honestly. Full record:
**`docs/overhaul/META-INGESTION.md`**. Terms research: `docs/overhaul/DECKLIST-DATA.md`.

**Only two sources are ingested, both MIT:** MTGJSON (decklists) and Commander Spellbook
(combos). **EDHREC, MTGGoldfish, MTGTop8, Archidekt, Moxfield and Topdeck.gg are NOT ingested**
and must not be without written permission or a key — the clause each verdict rests on is in
`THIRD-PARTY-NOTICES.md`. Adding a source means reading its terms first.

Three shapes, three sets of tables: `meta_decks`/`meta_deck_cards`, `meta_combos`/
`meta_combo_cards`, and the derived `meta_card_inclusion`/`meta_card_pairs`. **Cards are keyed
by `oracle_id`, never by name or printing id** — `cards` now holds every printing, so
`oracle_id` is non-unique there and no FK can point at it.

Three rules that are load-bearing:

1. **Every aggregate stores its denominator.** A scope below `meta_min_scope_decks()` (30)
   produces **no row at all**, not a row with a caveat. Per-commander inclusion is therefore
   empty and that is correct: precons give roughly one deck per commander. Format-scope
   inclusion is real (Sol Ring in 77 of 79 commander precons).
2. **The transform lives in SQL, once** (`meta_load_spellbook_page`, `meta_load_mtgjson_deck`).
   The edge functions contain none. `meta_deck_type_allowlist` decides what is a decklist —
   MTGJSON labels 3,004 things a "deck" and only 873 are; `MTGO Redemption` is a 383-card whole
   set that would poison every co-occurrence figure.
3. **The resume cursor clears on the COMPLETION path only.** `meta_finish_ingest` plus a trigger
   on `meta_ingest_runs`; a **failed** run keeps its cursor so the retry resumes. This is the
   bug that froze `scryfall-sync` for months.

Ingestion is driven either by `public.meta_drain_tick(source, batch)` from pg_cron (no secret in
the cron command) or by the two edge functions. **Commander Spellbook enforces an undocumented
rate limit** — a burst of 100 returns 429 for all of them — so batches stay small and back off.

### Edge Functions (22, all ACTIVE)
`scryfall-sync`, `simple-sync`, `test-scryfall` · `ai-deck-builder`, `ai-deck-builder-v2`, `mtg-brain` (**Tutor** — see 12.x),
`gemini-deck-coach`, `deck-optimizer`, `calculate-deck-power`, `edh-power-check` ·
`scan-match`, `scan-card-ai` · `daily-price-capture`, `capture-card-price`, `capture-collection-value`,
`price-drop-alerts` · `fetch-precons`, `proxy-image`, `rate-limiter` ·
`mtgjson-deck-sync`, `spellbook-combo-sync`

Three overlapping sync functions (`scryfall-sync`, `simple-sync`, `test-scryfall`) and two overlapping
AI builders (`ai-deck-builder`, `ai-deck-builder-v2`) suggest consolidation is needed.

---

## 8. ⚠️ Security note

### `.env` — handled 2026-08-18

`.env` **was** committed and `.gitignore` had no env entry. Now: `.gitignore` covers `.env`,
`.env.local`, `.env.*.local`; `.env` has been `git rm --cached`'d (staged, **not yet committed** —
commit it to complete the change); `.env.example` added with the key redacted.

The values remain in git history and were never secret: the publishable (anon) key is designed to be
client-visible, and the same values are hardcoded in `src/integrations/supabase/client.ts`, which is
what actually gets used. **No rotation is needed.** History was deliberately left un-rewritten — a
force-push to scrub a non-secret is not worth breaking every clone.

### RLS audit — completed 2026-08-18

All 39 public tables have RLS enabled. Empirically tested against PostgREST with the anon key:
collections, decks, wishlist, listings, messages, sales, tasks, storage and photos all correctly
return zero rows to an unauthenticated caller. Four real holes were found and fixed by migration
(`harden_rls_privilege_escalation_and_service_role_scoping`):

1. **Privilege escalation (critical).** `profiles`' UPDATE policy had `USING (auth.uid() = id)` and
   **no `WITH CHECK`**, so Postgres reused USING as the check and any logged-in user could run
   `update profiles set is_admin = true where id = auth.uid()`. That unlocked every
   `profiles.is_admin` admin policy plus all four `dev_*` tables via `is_dev_admin()`. Fixed with
   column-level grants + a guard trigger; admin promotion now goes through the gated
   `set_user_admin()` RPC (`UserManagement.tsx` was updated to call it — the old direct write also
   silently no-opped for every user other than yourself while still showing a success toast).
2. **Three "Service role can manage …" policies were created `TO public`, not `TO service_role`** —
   on `card_price_history`, `collection_value_history` and `sync_status`. `FOR ALL … USING (true)`
   meant anyone holding the anon key could read, insert, update and delete. Verified: anon could
   read every user's `collection_value_history` and delete all 31,626 price rows. Now `TO service_role`.
3. **`trigger_scryfall_sync()` / `resume_scryfall_sync_if_stalled()`** were SECURITY DEFINER with
   EXECUTE granted to `anon` and no auth gate — a free full-sync/DoS trigger. Revoked; pg_cron runs
   as `postgres` and is unaffected.
4. **`anon`/`authenticated` held TRUNCATE on every table**, which bypasses RLS entirely. Not
   reachable through PostgREST, but revoked anyway.

### `deck_share_events` — scoped 2026-08-19

The INSERT policy was **named** "Service role can insert share events" but was created `TO public`
with `WITH CHECK (true)`: anyone with the anon key could forge unlimited events against **any** deck
id, including private ones. It is still open to `anon`/`authenticated` — logged-out share views are
recorded client-side and there is no server-side recorder — but now gated on
`public.is_published_share_target(deck_id, slug)`, so an event may be logged only for a genuinely
published deck and only under that deck's real slug. `UPDATE`/`DELETE` table grants were revoked
from `anon`/`authenticated` (the grant, not just the policy — a policy alone is not the gate).
Migration `20260819001528_scope_deck_share_events_inserts_to_published_decks`.

The predicate **must** be SECURITY DEFINER. An inline `EXISTS` against `user_decks` is filtered by
that table's own RLS, whose SELECT policies key on **`is_public`** — a *different* column from the
sharing flag **`public_enabled`**. Same trap bit the client: `trackShareEvent()` used to resolve the
deck id with a direct `user_decks` read, which matched no policy for a logged-out visitor, so it
returned early and **no share event or view-count increment was ever recorded**. It now resolves via
the SECURITY DEFINER `get_public_deck` RPC. Anything added later that chains `.select()` onto the
insert will still fail — returning the row needs SELECT, which is owner-only.

Left deliberately unchanged: `profiles` is world-readable by design (but two usernames are raw email
addresses — worth scrubbing); `listings`/`wishlist_shares` are owner-only, so the
marketplace and shared wishlists cannot actually be read by other users — that is a **feature gap,
and closing it means loosening RLS deliberately, not a bug fix**.

---

## 9. The overhaul — owner's brief (2026-08-18)

Direct quotes, kept verbatim so intent is not diluted:

> "Entire app its so inconsistent, homepage is complete AI slop, lots of pages dont have consistent
> theming, multiple filtering systems which make it messy, screen/card layout views dont work properly
> and not many options, review and audit every page in left hand nav, as well as sub pages — improve
> significantly."
>
> "Deck builder and decks detail pages need full overhauls too."
>
> "I am expecting the majority of things to be visual overhauls."
>
> "View as an MTG enthusiast."
>
> "This is supposed to be the best MTG platform in the world and we have an incredible foundation."

### Standing principles
1. **Foundation before cosmetics.** Design tokens, one unified filtering system, and shared card-view
   components land *before* per-page restyling — otherwise per-page work gets redone.
2. **One way to do each thing.** Kill duplicate filter implementations, duplicate sync functions,
   duplicate AI builders, duplicate deck tiles.
3. **MTG-native, not generic-web-app.** Mana symbols, color identity, curve, type lines, format legality
   and commander rules must render correctly and idiomatically.
4. **Don't break real users.** 13 live accounts with real decks and collections.

---

## 10. Routes (22 protected + public)

**Public:** `/` Homepage · `/login` · `/register` · `/reset-password` · `/forgot-password` · `/p/:slug` PublicDeck

**Protected:** `/dashboard` · `/collection` · `/marketplace` · `/scan` · `/decks` · `/precons` ·
`/deck-builder` · `/deck/:id` · `/builder` · `/smart-builder` · `/tutor` · `/templates` · `/cards` ·
`/wishlist` · `/simulate` · `/tournament` · `/settings` · `/admin` · `/landing`

Component-count hotspots: `deck-builder/` **95**, `ui/` 55, `collection/` 32, `marketing/` 28,
`simulation/` 19, `marketplace/` 18, `admin/` 14, `wishlist/` 13.

---

## 10a. MTG Brain is called **Tutor** — 2026-08-19

Owner: *"is there something we can rename mtg brain to? Not really a fan of the name - dont want to
use any words like AI as people in magic community hate AI."*

To **tutor** in Magic is to search your library for exactly the card you need. Every player knows the
word, it describes the feature precisely, and it carries no technology connotation.

**Ban list for this feature, and for user-facing copy generally:** no "AI", "assistant", "smart",
"intelligent", "powered by", "neural", "GPT", "model", "bot". Write as though a knowledgeable player
is answering, because from the player's side that is the experience. The system prompt enforces this
on the output too.

| Thing | Now |
|---|---|
| Route | `/tutor`. **`/brain` still works**, as a `<Navigate replace>` redirect. Links exist. |
| Page | `src/pages/Tutor.tsx` |
| Components | `src/components/tutor/` |
| Homepage section | `src/components/marketing/HomeTutor.tsx` |
| Left nav | "Tutor", icon `BookOpenCheck` |
| Tables | `tutor_conversations`, `tutor_messages` (renamed while empty; constraints and policies renamed too) |
| Feature flag | `feature_flags.key = 'tutor'` (was `mtg_brain`) |
| **Edge function** | **still `supabase/functions/mtg-brain/`** — deliberate, see below |

### Why the edge function keeps the old id
A directory name under `supabase/functions/` **is** the deployed function id. Renaming it does not
move a function, it creates a second one and leaves the first deployed with the old code. Deployment
is `git push` → Lovable, and the bundle and the function do not go live in the same instant, so the
gap is a window where every question 404s. Seven call sites invoke it and six live in files owned by
other work (`AIAnalysisPanel`, `BrainAnalysis`, `EnhancedDeckAnalysis`, `ScanInsightsHelper`,
`AITemplateRecommendations`, `AIBuilder`). The endpoint name is never seen by a player. The reason is
written at the top of `index.ts` so nobody "tidies" it.

---

## 10b. What was wrong with Tutor, and what fixed it — 2026-08-19

The owner's session: *"Which lands can I upgrade?"* → a pie chart, then *"please provide a list of
the 36 lands you currently have"*. Verdict: *"wasn't very good and kept showing me graphs when not
needed and didnt attach any reference cards, then it told me it didn't know what lands i even have
so where is deck context and do chats continue?"*

> ⚠️ **The rewrite existed in the repo but had never been deployed.** The live function was still
> version 80, the original code, with every fault below intact. Deployed as version 83 on 2026-08-19
> via the Supabase management API, `verify_jwt` preserved as `false`. **Check what is deployed before
> believing a fix is live.**

1. **The decklist was gated behind a regex** (`/(card list|specific cards|which cards|…)/i`) and then
   cut with `.substring(0, 1200)`. "Which lands can I upgrade?" does not contain "which cards", so
   the list was withheld and the answer correctly said it did not know. Now always sent, in full:
   measured **92 entries, 4,679 chars, ~1,170 tokens**. Each land carries what it TAPS FOR.
2. **Charts were a reflex**, not a response: `if (charts.length === 0 …)` then
   `if (charts.length < 2 …)`, so every deck question got up to two charts. A chart is now drawn only
   when the question is about the thing the chart shows, and a chart the question did not ask for is
   dropped server-side even when the tool is called.
3. **Cards depended on a "Referenced Cards:" section** being emitted. Names are now read out of the
   prose and resolved against `cards`, which is the authority. A name that resolves to nothing was
   invented and is silently dropped.
4. **Chats are rows now**, `tutor_conversations` / `tutor_messages`, RLS scoped to `auth.uid()`,
   `anon` holds **no table grant at all**. History is trimmed by size (24,000 chars), not `slice(-6)`.
5. **The mana numbers were wrong.** `B:5 C:34 G:8 R:0 U:5 W:3` for a four-colour Atraxa deck, because
   lands were bucketed by `card.colors`, which is **empty for every land ever printed**. Lands are
   classified by `cards.produced_mana` now. Coverage of 4,478 land rows: 1,699 synced from Scryfall,
   2,634 derived from rules text by `derive_produced_mana()`, **145 still unknown** — and unknown
   means the breakdown is **withheld**, not guessed.

### Two performance defects found by running it, not by reading it
- `findLandCandidates` carried `.ilike('type_line', '%Land%')`. A leading-wildcard ILIKE cannot use a
  btree index, so it was served by the GIN trigram index at **~5 s**, bitmap-ANDed into a **17.4 s**
  query against the **8 s `statement_timeout`** the edge role carries. It therefore **never once
  returned** (`land candidate query failed: canceling statement due to statement timeout` on every
  call). It also filtered out **zero rows** — 575 before and after. Removed; the type is checked in
  JS. Measured after: **3.9 s under load**, and the land engine now reports
  `12 weak lands, 45 candidates`.
- `resolveCards` did `const { data } = await …`, discarding the error, so a failed catalogue lookup
  and "none of these are cards" looked identical. That is how a run resolving **0 of 86 real card
  names** looked healthy. Errors are logged now.

### The honesty bug that mattered most
With a deck attached but the page's card join still in flight, the prompt printed
`No cards were sent with this deck.` directly under the heading *"This is the complete list. You have
it. Never ask the user what is in this deck."* Two claims that together assert an empty list **is**
the deck. Observed live. Now the prompt branches: no list means it says so and is explicitly told not
to name cards, not to guess what the commander usually plays, and not to ask the user to type it out.
`Tutor.tsx` also refuses to send while the attached deck is still loading.

### Still outstanding
- **`scryfall-sync` must start writing `produced_mana`** from Scryfall's own field. Until it does,
  1,699 land rows are synced, 2,634 are derived from rules text, and **145 stay unclassified** and are
  reported as unknown. That file belongs to other work, so the sync change has to follow.
- `findLandCandidates` reads `public.cards`, not `public.cards_unique`, and dedupes by name in JS.
  When it was written `cards_unique` did not carry `produced_mana`; it does now (checked: 40 columns,
  `produced_mana` present, after `cards_unique_tracks_every_column_of_cards`). Results are correct
  either way because of the name dedupe, but the source should move to `cards_unique` per section 6.3.
- The land candidate query is ~3.9 s under the load measured on 2026-08-19 against an 8 s
  `statement_timeout`. That is passing, not comfortable. If it starts timing out again, a partial
  index on `(edhrec_rank) where edhrec_rank is not null and type_line ilike '%Land%'` is the fix; it
  was not created at the time because the database was saturated and the build kept being cancelled.

---

## 11. Working agreements

- **Verify, don't assume.** Every claim in this file was checked against the real database, the live
  site, or the actual files. Keep it that way.
- Use **`npm`**, not bun.
- `git pull` before starting; Lovable may have committed.
- Update the **Dev Console** as work progresses; update *this file* when durable facts change.
- Prefer editing existing components over adding parallel ones — duplication is already the core problem.

---

## 12. Design law — non-negotiable

These are standing instructions from the owner. Treat them as constraints, not preferences.

1. **Monochrome charcoal, dark by default.** The base palette is strictly neutral (0–7%
   saturation). Colour is reserved for MTG semantics ONLY: `text-mana-*`, `text-type-*`,
   `text-power-*`. Anything else with a hue is a bug. Owner: *"much prefer black and whites"*,
   *"black/charcoal should be way dark entire app too"*.
2. **No borders.** Owner: *"I absolutely hate hard border lines."* Depth comes from surface tint
   (`bg-card`, `bg-muted/30`) and shadow. `--border` is deliberately near-invisible and the Card
   primitive carries no outline. Never reintroduce hairlines.
3. **No centred modal popups.** Owner: *"I dont want any modal popups at all, I always want it to
   work fluidly within the screen with clear back/forward buttons."*

   **Right-hand pop-out side panels ARE approved and preferred** for in-context actions. Owner:
   *"we already utilising right hand pop out side windows - these are super good for keeping in
   screen without leaving to do a function like edit a deck or something, or even for card
   replacement."* So the rule is:

   | Case | Pattern |
   |---|---|
   | A destination (new deck, card detail, precon detail, import/export) | **Route** with a real URL and a visible back control |
   | An action taken *without leaving the current context* (edit deck, replace a card, filters, quick add) | **Right-hand slide-out panel** — the page stays visible and keeps its scroll position |
   | A confirmation | **In place** — the destructive control swaps to Confirm/Cancel, or offer undo afterwards |
   | Centred dialog that dims and traps focus | **Never** |

   The command palette (Ctrl/Cmd+K) is the one overlay exception.

4. **Back and forward work universally.** Owner: *"back/forward should always work universally
   across the app to streamline navigation."* Every page renders `HistoryNav` via
   `StandardPageLayout`; do not rely on browser chrome, which is absent in standalone/PWA mode.
5. **Card art wherever a card is referenced.** Owner: *"every part of the app needs to be as
   visual as possible."* A deck is represented by its commander's art, an activity entry by the
   card it concerns. Never a coloured dot where art is available.
6. **Full width, flat, typographic.** No gradients, glows, floating orbs, pulsing badges or
   animated grids. Animation is welcome for real state change; respect `prefers-reduced-motion`.
7. **Nothing fabricated.** No invented statistics, testimonials, ratings or competitor claims.
   If a number cannot be read from the database or computed from real data, it does not ship.

### Card images
Use `@/components/cards/CardImage` — never a hand-rolled `<img>`. It right-sizes the Scryfall
asset per rendered size (`normal` at grid sizes, `large` only at xl) and limits the blur-up
placeholder to large sizes. Asking for `large` everywhere doubled transfer for no visible gain;
loading a placeholder at every size doubled the request count.

### EDH power score
The EDH score is **the** primary number for any deck. Five competing fields existed
(`powerLevel`, `powerScore`, `edhPower`, `power_level`, `power.score`) across two scoring
libraries and two edge functions — the same deck could show different numbers on different
screens. Owner: *"we bolted so many systems together they never linked."* There must be exactly
one canonical implementation, one accessor, and one display component. Present the nine subscores
so the score is explainable rather than a black box, and keep the bracket/band prominent.

### Naming
"AI Deck Builder" → **Deck Generator**. "Deck Builder" → **New Deck** (and it must actually start
a new deck, not land on My Decks). "Preconstructed" → **Precons**.

### Verify visually, always
The Browser pane frequently will not composite, so screenshots must come from Puppeteer
(`.shots/`, gitignored). Launch with `--disable-lcd-text`: subpixel antialiasing renders coloured
fringes on thin type over dark backgrounds and reads as a styling bug that is not there.

### Deleting "orphaned" code
Verify importers against the CURRENT tree before deleting. An earlier sweep removed ten deck
components that were genuinely in use, including `CommanderPowerDisplay` and `MatchAnalytics`;
they had to be restored. `grep` for the import path, do not trust an audit line alone.


## Copy rules (project-wide, all user-facing text)

Added 19 Aug 2026 on the owner's instruction about the homepage. These apply
everywhere a user reads words, not just the homepage.

1. **No jargon.** Write for a Commander player who does not know this product and
   does not know software. Product-invented vocabulary and engineering words do
   not belong in the interface: "portability", "round trip", "subscore weights",
   "taxonomy", "canonical", "engine", "pipeline", "surface", "primitive". Say
   what the thing does in the words a player would use at a table. If a feature
   cannot be described without its own invented term, it is not explaining itself.

2. **No em-dashes in user-facing copy.** Rewrite the sentence rather than
   swapping the dash for a semicolon or brackets. A sentence that needed an
   em-dash usually wanted to be two sentences.

3. Short beats long. Fewer, plainer words.

These are copy rules for the interface. Code comments are exempt, and should keep
explaining WHY at the length that takes.


## Product decisions (owner, 19 Aug 2026)

Asked directly and answered directly. These settle questions that had been
implicit and were being guessed at.

**1. Play mode is a CORE feature. Invest heavily.**
It is a headline reason people use DeckMatrix, not a bonus beside collection and
deckbuilding. Consequences:
- A card that resolves and does nothing is a SERIOUS bug, not a known limitation.
- Card coverage is worth real investment. Today only 84 of ~12,000 cards are
  fully automated and 11,205 are marked manual.
- The manual marker must always be visible. The engine already computes
  `automationFor(card).needsManual` correctly and nothing renders it, so the
  engine is honest and the interface is not.
- Manual controls (counters, keywords, tap, move zone) must be easy, because most
  cards will need them for a long time.

**2. Goal: launch polish in the foreground, depth in the background.**
Both, not either. Visible breakage and desktop polish take priority in the
foreground while long-running engine and card-knowledge work continues behind it.
Do not stop building depth, and do not let depth block shipping.

**3. XMage card extraction: proceed if the numbers are good.**
Approved to build without further sign-off provided the spike shows a high clean
mapping rate. Report numbers as it goes. See XMAGE-EXTRACTION-SPIKE.md.
XMage is MIT so this is legal with attribution. Forge remains GPL-3.0 and
strictly off-limits.


## Approved pattern: blurred art as identity ground

The owner, on the precon hero: "you added blurred artwork behind - adds beautiful
colour actually, identify if other areas can use it based on what is being shown".

It works because of one property, and that property is the rule:

**The art must come FROM the thing on screen.** A precon's own commander behind
that precon. A deck's commander behind that deck. A card's own art behind its
page. That is identity, and it is why it reads as beautiful rather than busy. The
same treatment with unrelated art is wallpaper, and wallpaper is noise.

It also solves a real problem this app has. The palette is deliberately
monochrome charcoal, which is right for the interface but leaves large surfaces
flat and grey. Magic's own colour lives in the artwork. Blurring it puts that
colour back without introducing a coloured interface, and without any of the
purple navy the owner rejected.

**When to use it**
- The surface is dominated by ONE subject with art: a deck, a card, a precon, a
  commander, a storage container with a clear most valuable card.
- The surface would otherwise be a flat charcoal field.
- The art would be CROPPED if shown sharp, so blurring it removes the crop
  complaint entirely. There is no detail left to cut off.

**When NOT to use it**
- Lists and grids of many things. Every row wanting its own ground is chaos.
- Behind dense text or numbers, where it costs legibility for decoration.
- Anywhere the art is not of the subject. Never a generic Magic image chosen for
  mood.
- More than one per screen. It stops being identity when it repeats.

**How**
Blur heavily and scale past the edges so the blur radius never pulls transparent
edges inward. Put a token scrim over it so contrast never depends on which part
of the art landed behind a given letter. The sharp subject sits on top and is the
only thing asking to be looked at. See PreconDeckView for the reference.

**Candidate surfaces**, to apply deliberately rather than everywhere at once:
deck detail (commander), card detail (the card itself), collection favourite
decks, storage containers, tournament events, homepage recent decks. The life
counter already wants colour identity backgrounds for a related reason.


## Card coverage: the plan, and the two numbers that must never be conflated

Owner, 19 Aug 2026: "whatever we can to get as close to 100% as we can - if we
can do cheap to get 80% then work on the last 20% we would have the most complete
engine ever."

Approved. The goal is maximum coverage, sequenced cheapest-first.

**TWO DIFFERENT NUMBERS. Never quote one as the other.**
- REPRESENTABLE: what fraction of cards our ability DSL can express. Measured at
  76.0% against XMage's corpus, rising to 80.7% with four cheap DSL extensions.
- AUTOMATED: what fraction the engine actually RUNS. Currently 84 cards of
  ~12,000. A card can be perfectly representable and still not run, because it
  calls engine primitives nobody has written.

Representable is a ceiling. Automated is the floor. Progress means closing the
gap, and only the second number is what a player experiences.

**The sequence:**
1. Build the XMage extractor as a PLANNING INSTRUMENT, not a source of
   automation. Its output is a ranked, dependency-ordered list of which engine
   primitives to write, verified against all 32,168 real cards, with the count of
   cards each one unlocks.
2. Build the four cheap DSL extensions (computed values, watchers, cost
   modification, conditional mana). Together +1,526 cards representable, without
   touching the stack, layers or priority.
3. Then grind the primitive list in ranked order. This is the part that raises
   actual automation. It is long, but it is COUNTABLE: each primitive unlocks a
   known number of real cards, so progress is measurable and can stop when the
   return per primitive falls off.

**Why not Forge, settled:** Forge is architecturally the same, so it hits the
identical primitive-writing wall. Its effect vocabulary is smaller (~400 ApiType
classes vs the 2,558 distinct primitives XMage cards invoke) and its scripts are
plain text so extraction is easier, but neither removes the work. And it is
GPL-3.0: plain GPL triggers on distribution rather than network use, but this app
ships its rules engine to the browser by design, and that IS distribution, so it
would force DeckMatrix's full source under GPL-3.0. Translating it to TypeScript
does not help; that is explicitly a derivative work. XMage is MIT and safe with
attribution.

**Do not trust coverage measured against deck_cards.** It holds 474 rows across
8 decks, alphabetically clustered, which looks like fixture data rather than real
play. Real ranked decklists are needed before any coverage number is
decision-grade.


## Correction: the coverage numbers were measured on a slice (19 Aug 2026)

The figures quoted earlier in this file and in RULES-ENGINE-COVERAGE.md
(manual 11,205 / vanilla 367 / partial 196 / keywords 148 / automated 84) were
measured over the FIRST 12,000 ROWS BY ID, not the catalogue. The denominator was
short by 2.8x. `scripts/measure-ability-coverage.ts` does not complete: it hits a
Postgres 57014 statement timeout around row 20,000.

Re-measured over all 34,088 rows by refetching at 500/page with retries:

  manual 32,025 · vanilla 858 · partial 590 · keywords 332 · automated 283
  needsManual = 32,615 = 95.7% of the catalogue

**And `automationFor` is the wrong metric anyway.** It is the older reporting
path. The number that describes what actually happens in a game is
`abilityEngineOwns`, the compiled-ability bridge wired into triggers.ts, which
owns **906 cards (2.66%)**. Union with the old detector's automated set is 949
(2.78%).

So the honest headline is: **the engine genuinely runs the abilities of about
2.7% of the catalogue**, and correctly marks the rest as needing a human.

Tagger figures confirmed and corrected: TAG_RULES has 66 entries and 66 canonical
tags, plus 11 alias names of which one is also canonical, giving ALL_TAGS = 76.
All 76 fire. Of 34,088 cards, 34,066 (99.9%) carry at least one tag and 25,074
(73.6%) carry a non-type role tag. The 22 untagged match `tags = '{}'` in the
database exactly, so TypeScript and SQL parity holds live.

Whenever a coverage number is quoted anywhere, state the denominator and how it
was measured. Two separate agents have now been misled by that slice.
