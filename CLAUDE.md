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
| **Live site** | `https://www.deckmatrix.com`. The apex 308-redirects to `www.`, which is the opposite of what this line said before Vercel. Measured 29 Aug 2026: `curl -I https://deckmatrix.com/` returns 308 to `https://www.deckmatrix.com/`. |
| **Hosting** | **Vercel** (moved 29 Aug 2026, was Lovable) |
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

> **MOVED TO VERCEL, 29 Aug 2026.** The owner: *"I have also just moved to vercel
> instead of lovable"*. Everything below about Lovable is history, kept because
> the repo still carries Lovable-authored commits and the reasoning explains
> them. `vercel.json` is in the repo: build `npm run build`, output `dist`, and
> one rewrite so a deep link reaches `index.html`.
>
> **A single page app on a static host needs that rewrite or every shared link
> 404s.** `/deck/8f2c` is a request for a file that does not exist, and the
> failure is invisible from inside the app because clicking through from the
> homepage never asks the server for it. `scripts/vercel-routes-check.mjs`
> asserts both directions, real routes rewriting and assets not, because a rule
> that swallows `/assets/index-abc.js` serves HTML where JavaScript was asked
> for and the app fails to boot with no useful error.
>
> **No environment variables are needed.** The Supabase URL and publishable key
> are hardcoded in `src/integrations/supabase/client.ts` on purpose: reading
> `import.meta.env.VITE_SUPABASE_URL` instead is how `/precons` broke, because
> that variable was not set in the deployed build and the base collapsed to a
> relative path.
>
> **The edge functions are a SEPARATE deploy and always were.** Moving the front
> end does not move them:
> `npx supabase functions deploy <name> --project-ref udnaflcohfyljrsgqggy`.
> Two publishes, and forgetting the second is what left the generator serving
> `6-grounded` for days. See section 10c.

### How it worked under Lovable, kept for history

**Lovable hosts the live site and syncs bidirectionally with GitHub.**

```
local edit → git push origin main → Lovable picks up → publish from Lovable
```

⚠️ Lovable also **auto-commits to `main` itself**. If work happens in both places you get competing
writes. **Always `git pull` before starting a session.** Recent history shows Lovable-generated commits
(paired same-timestamp commits, messages like "Changes").

~~Vercel migration was considered and deliberately deferred.~~ **It happened on 29 Aug 2026.**

### Re-measured against the live site, 29 Aug 2026

Section 8's "the audit backlog is STILL LIVE" warning is **closed**, and three separate passes
repeated it without checking. What the live site actually serves now:

```
GET https://deckmatrix.com/                              -> 308 to https://www.deckmatrix.com/
GET https://www.deckmatrix.com/assets/index-BSOQhzGg.js  -> 200, 693,094 bytes, names 222 chunks
GET https://deckmatrix.com/assets/auditFindings-B6Ihw0Jk.js -> 404
```

The entry chunk was 3,323,814 bytes and is 693,094. The findings chunk is gone, and neither
`auditFindings` nor `af-001` appears anywhere in the entry chunk. Code splitting shipped and the
backlog is no longer downloadable. **Do not write "still live" about anything again without a
`curl` in the same paragraph.**

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
~~**The rewritten wrapper is not yet deployed**~~ — **it is deployed**, verified 2026-08-29 by
reading the live function source: version 47 is the set-based RPC wrapper with the service-role
scope gate. Cron does not touch it, so
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

### ~~The audit backlog is a public download. Fixed in the repo, STILL LIVE.~~ CLOSED 29 Aug 2026

> ✅ **Re-measured and closed.** `auditFindings-B6Ihw0Jk.js` now returns **404** and the live entry
> chunk is **693,094 bytes** across 222 chunks, not the 3,323,814-byte one below. See section 4. The
> paragraphs that follow are kept because the reasoning is worth having; the alarm is not.

> 🔴 **This is not closed.** The code change is in `main`. Lovable has not published since, so the
> file is still being served. Re-measured 2026-08-19, after the fix was committed and pushed:
>
> ```
> GET https://deckmatrix.com/assets/auditFindings-B6Ihw0Jk.js  ->  200, 330,965 bytes
> GET https://deckmatrix.com/assets/index-CIy591UK.js          ->  200, 3,323,814 bytes
>     ...and that entry chunk still names auditFindings-B6Ihw0Jk.js
> ```
>
> The live entry chunk is the pre-split 3.32 MB one, which is the other half of the same fact: the
> chunking work has not shipped either. **Nothing in this section reaches a visitor until someone
> presses publish in Lovable.** Pushing to GitHub is not deploying. Do not write "fixed" about
> anything user-facing until it has been re-measured against `deckmatrix.com` itself.

`src/data/auditFindings.json` was 278 internal findings: file paths, severities, what is wrong with
each one and what to do about it. Only the admin Dev Console imported it, but an import is an
import, so Vite emitted it as a chunk and Lovable served it from the site's own origin.

Nothing in it is exploitable on its own. It is a map of the product's weak points on a commercial
site, which is enough.

The 278 rows now live in `public.dev_findings`, which `anon` holds no grant on at all (401, verified
over HTTP with the anon key, read and write). Two columns were added: `source` (`tracked` for
findings raised in the console, `audit` for these) and `source_ref` (`af-001` … `af-278`). Migration
`audit_backlog_lives_in_dev_findings_not_the_bundle`. The Dev Console still fetches the backlog only
when the Findings tab is opened, from the table instead of a chunk. Independently checked: 278 rows,
`af-001` to `af-278`, every one `status = 'planned'`, which is the status the old code hardcoded for
backlog rows, so the console's counts are unchanged. `created_at` is stamped `2026-08-18`, the same
date the retired file carried in its `generated` field, so the "Audit generated" line still reads
the same date. A fresh `npm run build` emits no chunk containing `auditFindings` or `af-001`.

> ⚠️ **The GitHub repo is public** (`nathangrooms/eoe-forge`, verified). The same file was, and its
> source `docs/overhaul/AUDIT.md` still is, readable at `raw.githubusercontent.com` by anyone. So
> nothing sensitive should be written into this repo expecting it to be private, and no data
> migration should carry that text back in. Removing the deployed copy is the part that was worth
> doing; scrubbing git history is a force-push decision for the owner.

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
`/wishlist` · `/simulate` (redirects to `/play?mode=playtest`) · `/tournament` · `/settings` ·
`/admin` · `/landing`

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
gap is a window where every question 404s. It had seven call sites in files owned by other work
(`AIAnalysisPanel`, `BrainAnalysis`, `EnhancedDeckAnalysis`, `ScanInsightsHelper`,
`AITemplateRecommendations`, `AIBuilder`). The endpoint name is never seen by a player. The reason is
written at the top of `index.ts` so nobody "tidies" it.

**`BrainAnalysis` is gone as of 30 Aug 2026** — owner: *"just remove deck analysis chat we have
tutor for that"*. It was the deck page's chat box, nine preset analyses answered by a model, and
Tutor takes the same deck as an attachment and can hold a conversation, which a box at the bottom
of a tab never could. Deleted after checking the import PATH rather than the name against the
current tree, and after checking that the two components it pulled in are Tutor's rather than its
own. The preset a player would actually miss, "what to cut", is answered by the engine now: see
"The engine answered what to cut all along" below.

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

## 10c. Deploying is a separate act from pushing, and it is the bottleneck — 2026-08-29

The owner, on the deck generator: *"Deck generator still not working properly."* They were right,
and the reason was not the generator.

**The live function was `ai-deck-builder-v2/6-grounded`. The repo is `7-behaviour`.** The whole
behaviour and facet pipeline had never been deployed. Four requests against the LIVE deployed
function, anon key, measured 2026-08-29:

| commander | creatures | artifacts | colourless | keyed off the commander |
|---|---:|---:|---:|---:|
| Krenko | 4 | 54 | 82 | 0 / 64 |
| Talrand | 5 | 54 | 87 | 7 / 64 |
| Kaalia | 1 | 49 | 58 | 0 / 64 |
| Sram | 1 | 64 | 92 | 23 / 64 |

That is the owner's sentence reproduced exactly, *"would always give artifacts colourless"*, and it
is what production does now rather than what it once did. The same commanders on the repo code give
Krenko 29 creatures and Kaalia 33 with 33 of 52 keyed off her.

So the rule from section 8 generalises beyond the bundle: **pushing to GitHub is not deploying, and
for an edge function Lovable is not the deployer either.** Before reporting any edge-function fix as
live, read the deployed source or a version header and compare it with the repo. Section 10b records
the identical trap on `mtg-brain`, which sat at version 80 while the rewrite lived in the repo.

Checked the same day, so the list is not assumed: `daily-price-capture` IS deployed and correct, and
the section 7 note claiming otherwise was stale.

---

## 10d. The pool query could not finish, so nothing measured the generator — 2026-08-29

`catalog.ts` walks the candidate pool by keyset, `order=id.asc` with a cursor. The six partial
legality indexes on `cards_unique` were keyed on the legality EXPRESSION under a predicate pinning
that expression to `'legal'`, so every entry in each index held the same key. **An index whose key is
a constant can act as a filtered row set and nothing else**: it cannot answer a lookup and it cannot
supply an order. `order by id` therefore had to sort, a sort must see every row before it yields the
first, and `LIMIT 1000` could never terminate early.

    before   Sort (top-N heapsort) over 31,829 rows, Buffers hit=4 read=9826    13,717 ms
    after    Index Scan, no sort, 1,252 rows for 1,000, hit=1252 read=11            25 ms

against a 3 s `statement_timeout`. Migration
`20260828120000_pool_query_id_ordered_indexes.sql`. **Applied with `execute_sql`, so it is NOT in
`supabase_migrations.schema_migrations`** — it is idempotent (`IF NOT EXISTS` / `IF EXISTS`), so a
re-run is harmless, but see the double-recording section: this is the opposite failure, a file with
no recorded version.

**The damage was wider than the timeout.** Because the live query could not finish, every
measurement of the generator was taken against `.shots/pool-snapshot.json` instead, and **zero of
its 31,833 pool rows carry `oracle_text`**. Facets computed from that file are computed from
nothing. Kaalia of the Vast was diagnosed as a compiler bug on the strength of it; compiled from the
real corpus she reads correctly. **Never measure the generator against the snapshot again.**

---

## 10e. One record, two consumers, and the one that was never fed — 2026-08-29

Owner: *"deck generation and gameplay should share their engine"*, and *"Deck generator and
optimisers should also work from the backend engine."*

They do share, verified by hash rather than assumed. `src/engine/knowledge/behaviour.ts` is
**byte-identical** in `deck-optimizer/_engine/` and `ai-deck-builder-v2/_engine/`, kept so by
`npm run vendor` with `engine-parity.test.ts` failing on drift. Both deck building and gameplay
import `src/lib/cards/abilities/dsl.ts`. One compiler, two readers: facets for deck building,
effects for gameplay.

How completely that shared compiler reads a card, over 35,663 cards with rules text
(`scratch/shared-seam.mjs`): **`rec:full` 30.3%, `rec:partial` 46.4%, no record 23.3%.** That figure
caps both sides at once. `rec:full` is the compiler saying it consumed every paragraph, NOT that it
was right; accuracy is `scripts/verify-ability-coverage.mjs` and they must never be conflated.

**The optimiser was wired to the engine and never fed.** `rank.ts` scores every candidate with
`planFit(profile.commanderPlan, card)`, which reads `card.facets` and is deliberately silent for a
card with no record. Nothing under `deck-optimizer/` set that field and `poolFor` was called without
`withOracleText`. So the commander-fit signal contributed **exactly zero to every suggestion the
optimiser has ever made**. Measured through its own vendored ranker over 3,000 real cards,
candidates receiving the signal: Krenko 0 → 548, Talrand 0 → 1069, Sram 0 → 409, Kaalia 0 → 96.

Cause: `vendor-engine.mjs` mirrored the facet producer to exactly ONE target. Its own comment
documents fixing this same bug for the generator. `FACET_SUBDIR` is now `FACET_SUBDIRS` and both
functions that rank a pool get it.

---

## 10f. The lobby was a read doing a write — 2026-08-29

`open_game_tables()` swept tables idle for 30 minutes before returning the listing, on every poll
from every signed-in player. The guard meant the DELETE only fired when there was something to
collect, which is exactly the moment every concurrent poller fires it at once and they queue on the
same row locks. Measured over 2,453 calls: mean 52 ms, **max 3,515 ms** against a 3 s
`statement_timeout`. So when the lobby had stale tables in it, which is when a player is most likely
to be looking, the listing could time out and show nothing.

Now behind `pg_try_advisory_xact_lock`: one poller sweeps, the rest read straight through. `pg_cron`
is not installed on this project or the sweep would live there instead.

---

## Coverage is a live number now, and the Engine screen must move with it

Owner, 31 Aug 2026: *"i dont care about top 400, or top 15k cards, everything
should be covered, always, automatically"*, and *"remember to update engine
admin when other changes are made to things we are missing on card coverage
perhaps so it's always synced with your work"*.

**`card_facet_memo.coverage` holds the compiler's own verdict for every card.**
`facetsForCard` always returned it and `facet-memo-fill` always threw it away,
so "how much of the catalogue do we read" could only be answered by running a
script over a SLICE. It is a SELECT now:

    select * from public.engine_coverage();

Current for every card including the ones printed next week, maintained by the
fifteen-minute top-up that already existed. `card_facet_gap()` counts a row with
no coverage as a gap, which is how the column backfilled itself with **no
compiler version bump** — the facets did not change, so bumping would have been
a lie about the compiler and would have rewritten 33,032 rows to add a word.

### THE STANDING RULE

**Any change to what the engine reads must be visible on `/admin` → Engine in
the same commit.** Not a script, not a number in a commit message, not this
file. The screen.

The reason is the one this project keeps relearning. `cards_unique` described 28
August for two days while every search and suggestion was served from it, and
nothing said so because nothing was watching. A coverage figure that lives in a
terminal is a figure nobody is watching.

So when a compiler rule, a facet, a role or a tag rule changes:

1. Run `node --experimental-strip-types scripts/coverage-census.mjs`. It writes
   `.coverage/census-latest.json` and prints which way every number moved since
   the last run. **Commit that file.** A coverage figure with nothing to compare
   against is a number nobody can act on, and every previous figure in this
   project was a one-off over a different slice.
2. Check `/admin` → Engine still shows the thing you changed. A new facet
   prefix, a new role, a new gap reason: if the screen cannot show it, the
   screen is now lying by omission.
3. Quote the WHOLE CATALOGUE number, never a top-N. The slices are still there
   (`compiler-gap-probe`, `commander-read-audit`) and they are useful for
   ranking work, but they are not the headline.

### Two numbers that are not the same, ever

    read the whole card   the compiler consumed every paragraph
    read it correctly     nobody has measured this

`coverage = 'full'` is the first. It is NOT a claim that the reading was right,
and the two must never be quoted as one figure. `scripts/verify-ability-coverage.mjs`
is the instrument for the second and is far stricter: it fails a card whose
paragraph cannot be traced to a RUNNING ability.

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

### Prices: a missing price is null, never 0
Read every amount through `readAmount` from `@/lib/pricing` and print it with `formatAmount`, which
returns null rather than `$0.00`. The smallest real price in the database is 0.01, so a rendered
zero is always invented. Around a thousand printings carry no USD price at all.

`parseFloat(x || '0')` is how the zero gets in, and it is written in several places that then pass
the result on as if it were a price. It cost us this, found 2026-08-19: the marketplace watchlist
showed **Shivan Dragon (Secret Lair) at `$0.00`**, a card with no USD quote and a Cardmarket price
of €2,199.95. The same 0 also made every unpriced card count as permanently "at target" in the
alert badge. Fixed in `PriceWatchlist.tsx` and `Marketplace.tsx`; the pattern is worth grepping for
before adding any new price surface.

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


## ~~Approved pattern: blurred art as identity ground~~ WITHDRAWN

> 🔴 **DO NOT BLUR CARD ART. This whole section is history.**
>
> Scryfall's image guidelines are explicit: *"Do not blur, sharpen,
> desaturate, or color-shift card images."* Our use was decorative with the
> sharp card composited over it and may well have been accepted, but the
> downside of guessing wrong is losing the API this entire product is built
> on, so we do not guess.
>
> **The replacement is `identityGround(colors)` in
> `src/lib/cards/identityGround.ts`**, a gradient built from the card or
> deck's COLOUR IDENTITY, which is our own derived data rather than Wizards'
> artwork. It carries the same meaning and arguably carries it better: a Simic
> deck reads blue-green whether or not its commander's illustration happens
> to. `PreconTile`, `PreconDeckView`, `Playmat` and `DeckIdentityHero` all use
> it.
>
> This section stayed here after the change and cost real work on 2026-08-30:
> building the deck share hero I followed it, wrote `filter: blur(40px)` over
> a commander's `art_crop`, and only caught it by opening `identityGround.ts`
> for its settings. **The paragraphs below are kept for the reasoning about
> WHEN a surface wants an identity ground, which still holds. Everything they
> say about blurring does not.**


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

## SETTLED 22 Aug 2026: PORT XMAGE. Do not re-open this.

Owner: *"I think we need to port it - we need our own engine, if we can extract
xmage into our own engine that is ideal"*, and immediately after: *"We have had
this same conversation 10+ times"*.

They are right, and the reason is the paragraph that used to be here. It said
the extractor was a PLANNING INSTRUMENT AND NOT A SOURCE OF AUTOMATION, so every
session read it, concluded porting had been rejected, and asked again. The
answer is PORT. Nobody needs to weigh it up again.

**THE ENGINE IS THE WHOLE APP.** Owner: *"WE ARE BUILDING OUR OWN AUTOMATED
ENGINE WHICH WILL HELP WITH PLAY MODE, DECK BUILDING, RECOMMENDATIONS,
OPTIMISATION ETC - it is the king of the entire app."* The deliverable is
structured semantics for every card, not cards that resolve on a battlefield.
One record has to answer four questions: what it does on resolution (play), what
it does for a list (deck building), find me cards that do this
(recommendations), and what beats what (optimisation). A representation that
only feeds the reducer has solved a quarter of the problem.

**What was wrong with the old extraction, and it is our bug not XMage's.** It
was IMPORT-BASED: it recorded which classes a card mentions and threw the
constructor arguments away. That is why 50 cards collapsed to one meaningless
`[DestroyAllEffect]` signature and why the conclusion was "the map cannot say
what to destroy". The arguments are in the source and always were:

    WrathOfGod:  new DestroyAllEffect(StaticFilters.FILTER_PERMANENT_CREATURES, true)
    Armageddon:  new DestroyAllEffect(StaticFilters.FILTER_LANDS)

Parse the arguments and the map stops being a fingerprint and becomes a recipe.
That single change is the difference between a planning instrument and a port.

**Division of sources.** Scryfall is printed truth: names, costs, type lines,
oracle text, legality, prices. XMage is BEHAVIOUR. There is no third source.

**The sequence:**
1. Re-extract from XMage KEEPING THE ARGUMENTS, so each card yields an effect
   and its parameters rather than a bare class name. Verified against all 32,168
   real cards, ranked by how many cards each primitive unlocks.
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


## Database discipline (added 19 Aug 2026, after taking the app down twice)

I saturated this database twice in one session and the owner received a Supabase
disk IO warning. Both incidents were self-inflicted. These are now rules.

**MEASURED STATE, so the scale is understood:**

    database total        551 MB
    cards                 255 MB   97,140 rows, 28 INDEXES, 94 MB of index
    cards_unique           77 MB   materialized view, 21 indexes
    cards + cards_unique  332 MB = 60% OF THE ENTIRE DATABASE

Every row written to `cards` maintains 28 indexes. A full sync of 97,140 rows is
therefore roughly 2.7 million index updates, and a `cards_unique` refresh rebuilds
21 more across 77 MB. That is the disk IO, and it is why a sync makes the app
unusable rather than merely slow.

**RULES**

1. **Never run two database-heavy agents at once.** The first outage was four
   concurrent workloads: a VACUUM, a count over cards_unique stuck on IO for two
   minutes, the tagger re-running, and combo ingestion. Serialise them.
2. **Never leave a per-minute cron job behind.** An agent created two jobs on
   `* * * * *` that ran forever after its workflow was stopped. Cron survives the
   agent that made it.
3. **Never write `set statement_timeout = 0` in a scheduled job.** One did, which
   is why the second outage could not self-clear: a query with no timeout holds
   its connection indefinitely and nothing can kill it without a restart.
4. **A materialized view refresh takes an ACCESS EXCLUSIVE lock** and blocks every
   read of it. `cards_unique` was refreshing every 15 minutes; it is nightly now.
   Make it CONCURRENT (needs a unique index) before increasing that.
5. **Measure with EXPLAIN on a sample.** Do not run a full scan to find out how
   slow a full scan is.

**DO NOT DROP INDEXES ON POST-RESTART STATISTICS.** After the restart every index
reported `idx_scan = 0`, which means the counters were reset, NOT that the index
is unused. Index usage needs at least a week of real traffic before it means
anything. The candidates worth examining then, by size: `idx_cards_oracle_text_trgm`
(32 MB) and `cards_unique_oracle_text_trgm_idx` (10 MB), which are trigram indexes
and the most expensive kind to maintain on write, plus `idx_cards_legalities`
(9.5 MB) and `idx_cards_name_trgm` (7.4 MB).

**The cheapest structural win available** is that `cards` and `cards_unique` carry
near-duplicate index sets over the same data. One of them can probably lose most
of its indexes once usage stats exist to prove which.

## The generator: three costs, all measured, all removed (30 Aug 2026)

Owner: *"especially the engine"*. The deck generator was the worst thing in the
product. Measured against the DEPLOYED function that night:

    Krenko   mono-red     HTTP 500 after  19s   statement timeout on the pool
    Teysa    two colours  HTTP 500 after  17s   statement timeout on the pool
    Atraxa   four         HTTP 200 after  60s
    Najeela  five         546 resource limit after 114s

Three separate causes. All three are now fixed and all three were invisible
from the code alone.

**1. `card_facet_memo` existed and held ZERO ROWS.** Nothing wrote it, nothing
read it. `pipeline.ts` compiled facets from oracle text on EVERY REQUEST,
capped at 6,000 cards, into a `Map` on the module that dies with the instance;
every measured run reported `cached: 0`. A five-colour pool is roughly 100,000
facets compiled from scratch inside one CPU budget.

`scripts/fill-facet-memo.mjs` was written for this and never run, because it
needs `SUPABASE_SERVICE_ROLE_KEY` and nobody working on this holds one. An edge
function is handed that key by the platform, so **`facet-memo-fill`** does it,
gated by a run token on `facet_memo_runs` (admin-only), the same shape that
guards `dsl-compile-batch`. The whole catalogue takes **43 seconds**:

    33,032 cards   compiler 22,455 · xmage 2,019 · no record 7,058

**2. The pool ordered by `id` while filtering on rank.** The rank filter is
served by an index that cannot supply `id` order, so every page read all 14,984
matching rows and sorted them, and a sort must see everything before it yields
the first row, so `LIMIT 1000` could never stop early.

    ORDER BY id                Sort, 14,984 rows, hit=16743   4,078 ms
    ORDER BY edhrec_rank, id   Incremental Sort, 1,001 rows       5 ms

The cursor carries `(rank, id)`, because rank is not unique and a cursor on it
alone steps over every row sharing a boundary rank.

**3. The pool read 105 MB of rows to use 6.7 MB of them.** `cards_unique` rows
average 3.2 KB because they carry `oracle_text`, `faces`, `image_uris`,
`legalities` and `prices`. One fat row is one heap block, so scanning 7,495
mono-red candidates touched 6,441 blocks.

**`public.cards_pool`** is the nine ranking columns, the precompiled facets, and
the two projections PostgREST used to compute per row per request. 13 MB.

    cards_unique, ORDER BY id                    2,923 ms, 6,441 heap blocks
    cards_pool,   ORDER BY id                    1,167 ms, no sort
    cards_pool,   ORDER BY edhrec_rank, id           6 ms

End to end on the deployed function, warm:

    Isamaru   mono-white   37.2s     ->  1.3s   88 cards
    Krenko    mono-red     HTTP 500  ->  1.3s   88 cards
    Teysa     two colours  HTTP 500  ->  2.0s   92 cards
    Atraxa    four         59.8s     ->  3.4s   97 cards
    Najeela   five         546       ->  4.4s   98 cards

Deck QUALITY was re-measured after all of it and did not move: 74% of non-land
cards keyed off the commander, the same as before.

### Four things about this that will bite again

**`cards_pool` carries COMMANDER legality and nothing else.** `poolFor` branches
on the format; anything else reads `cards_unique`. Reading `commander_legal` for
a Standard deck would not error, it would quietly build the wrong pool.

**It is pinned to facet `compiler_version = 1`,** in three places:
`facet-memo-fill`, `public.facets(cards_unique)`, and the view's own definition.
A reader on one version and a writer on another is SILENT: every card reads as
having no facets, which the ranker cannot tell apart from a card that genuinely
does nothing. Bump all three together and refill.

**A materialized view has no visibility map after a refresh,** so every
index-only scan falls back to the heap. `cards_unique` had NEVER been vacuumed
(`last_vacuum` was NULL) because autovacuum does not visit a matview on refresh:
an index-only scan reported `Heap Fetches: 31762`, and the first VACUUM took the
mono-red page from 7-12 s to 2.9 s.

**VACUUM CANNOT RUN INSIDE A FUNCTION.** It was added to
`refresh_cards_unique` and would have raised `25001` and ROLLED THE WHOLE
REFRESH BACK every night, the same shape as the sync watchdog whose `format()`
threw after its work and undid it. It lives in its own cron job,
`cards-views-vacuum` at 07:00 and 13:00.

## The nightly sync rewrote every card to change nothing (30 Aug 2026)

Owner: *"we should only be posting changes and new, not writing every card."*

The walk upserted all ~96,700 printings whether or not anything moved. `cards`
carries 28 indexes and a BEFORE trigger that reclassifies every written row, so
a full pass was roughly 2.7 million index updates for a night on which nothing
was printed. **56,230 cards were rewritten in one hour**, and while that ran the
deck generator returned HTTP 500 and the pool query took 4 s a page. The sync
was not merely wasteful, it took a headline feature down for the hours it ran.

Scryfall's cards carry no "changed at" and its search has no "modified since",
so `supabase/functions/scryfall-sync/changed.ts` compares what is about to be
written against what is stored. One read of a page's ids replaces up to 175
writes.

    5,244 cards scanned, 0 written        (a walk over an already-current catalogue)

**The comparison has to be CANONICAL or it saves nothing.** Five columns are
jsonb, and Postgres stores jsonb with keys sorted while the object built from
Scryfall's response is in Scryfall's order. A plain `JSON.stringify` of each
side reports every card as changed on every run: the whole write load, zero
saving, and no error anywhere to say so. Numbers also arrive from PostgREST as
strings, so `cmc: 1` meets `cmc: "1"`. Array ORDER stays significant, because
`colors` is WUBRG-ordered and `faces` is front then back.

Measured with `scripts/sync-what-changes.mjs`, two samples 300 pages apart:
**98.1% and 99.2% byte-identical**, and the only column that ever differed was
`faces`, on under 2% of cards.


## The generated tagger and the deployed tagger have diverged (30 Aug 2026)

`scripts/generate-tagger-sql.ts` is meant to be the only source of truth for
card tagging, so the SQL classifier and the TypeScript one cannot drift. On the
`derive_card_tags` body that holds: the deployed function and a fresh
generation differ by three characters and five line breaks, the 109 tag names
are identical, and nothing is gained or lost. That part is formatting.

**`cards_apply_role_tags` is a different story and it is load-bearing.** The
deployed trigger carries two things the generator has never emitted:

```sql
elsif new.tags is distinct from old.tags
      and coalesce(current_setting('deckmatrix.retag', true), '') <> 'on'
then new.tags := old.tags;   -- silently revert
```

and it calls **`derive_card_tags_memo`**, which reads `public.card_tag_memo`
keyed on `card_tag_input_hash(...)`, not `derive_card_tags`.

Two consequences, both of which cost time on 30 Aug:

1. **A write to `cards.tags` that does not first
   `set_config('deckmatrix.retag','on',true)` is reverted with no error.** The
   first retag reported 369 rows updated and changed nothing.
2. **Changing a rule does not invalidate the memo.** The hash is over the
   classifier's INPUTS, which a rule change does not alter, so the cached answer
   stays correct-looking and wrong. Delete the affected `card_tag_memo` rows.

**So do not paste a freshly generated tagger migration over the top.** Every
previous tagger migration did exactly that, and doing it now would delete the
revert guard and the memo indirection. `20260830090000_protection_includes_
keywords_an_equipment_grants.sql` patches the one substring it means to change
and raises if the anchor is missing, for that reason. Reconcile the generator
with the deployed trigger before regenerating wholesale.

The general rule this is the third instance of: **read the deployed object, not
the repo file, before believing you know what runs.** Sections 10b and 10c
record the same trap on `mtg-brain` and `ai-deck-builder-v2`.

## Changing a tag rule: the four steps, and why one of them cannot be a migration

Done for real on 30 Aug 2026 (`an_anthem_is_not_a_finisher`), so this is the
procedure rather than a plan.

1. **Change `TAG_RULES` in `src/engine/knowledge/tagger.ts` and test it.**
   Then `npm run vendor`, or `npm test` fails on engine parity: four edge
   functions carry a copy.

2. **Patch the deployed `derive_card_tags` BY SUBSTRING.** Read
   `pg_get_functiondef`, `replace()` the one regex, `execute` the result, and
   `raise` if the old regex is not there. Never regenerate: the deployed
   `cards_apply_role_tags` carries a revert guard and the
   `derive_card_tags_memo` indirection that `generate-tagger-sql.ts` has never
   emitted.

3. **Clear `card_tag_memo` for the affected tag.** It is keyed on the
   classifier's INPUTS, and a rule change does not alter an input, so every
   affected card keeps returning its cached answer forever.

4. **Retag in BATCHES, outside the migration.**

   `derive_card_tags` is 109 regexes of plpgsql. Calling it on 2,224 rows to
   decide and again to write is 4,448 calls, which blew `statement_timeout` and
   rolled the function patch back with it. So the DECISION uses the regex
   directly against `oracle_text` — cheap — and the function is called once, on
   `limit 400` at a time, repeated until nothing is left:

   ```sql
   select set_config('deckmatrix.retag','on',true);
   with victim as (
     select id from public.cards
     where '<tag>' = any(tags) and not (lower(coalesce(oracle_text,'')) ~ '<new regex>')
     limit 400
   )
   update public.cards c
   set tags = public.derive_card_tags(c.name, c.type_line, c.oracle_text,
                                      c.keywords, c.mana_cost, c.cmc, c.faces)
   from victim v where c.id = v.id;
   ```

   `set_config(..., true)` is TRANSACTION-LOCAL, so it belongs in every batch.
   Without it the trigger silently reverts each write.

**A residue is expected and is not failure.** 43 rows still matched the
"should not have it" predicate afterwards and were correct: all multi-face, the
clause is on a face, which `derive_card_tags` reads and a `lower(oracle_text)`
test cannot. Confirm with `tags is distinct from derive_card_tags(...)`, which
was zero for all 43. The predicate is a cheap approximation of the function;
the function is the authority.

### The views carry it on their own schedule

`public.refresh_cards_unique(boolean)` refreshes **both** `cards_unique` AND
`cards_pool`, `concurrently`, so reads are never blocked. There is no separate
`cards_pool` refresh job and none is needed — the two `vacuum` jobs are the only
other thing on the schedule that names it, and a vacuum is not a refresh.

`cards-unique-refresh` runs at **06:00 and 12:00**. It skips when
`max(cards.updated_at)` has not moved past `last_source_change`, so a retag
propagates only because writing `tags` bumps `updated_at`. Until it runs, the
tags in the app are the old ones: the deck page, the generator and the optimiser
all read the views, never `cards`.

## The blur rule has now been broken and fixed three times (31 Aug 2026)

Scryfall: *"Do not blur, sharpen, desaturate, or color-shift card images."*

    1. the blurred identity ground   ->  src/lib/cards/identityGround.ts
    2. the playmat                   ->  procedural CSS, saturate/brightness gone
    3. `CardImage`'s blur-up         ->  the muted pulse every grid already used

The third is the one worth learning from, because it sat in the component
**every card in the app goes through** while the first two were being fixed.
The reason is legible in the code: the twelve-line comment above the
placeholder is entirely about REQUEST COUNT and never mentions the picture. It
was reasoned about carefully, on the wrong axis, so every later pass read a
considered decision and moved on.

**A brief display is a display.** The placeholder faded out on load; it was
still a blurred card image on screen.

Removing it also halved the images on the two screens that draw the most:
card search was 48 `<img>` for 24 cards and precons 48 for 24.

### The lens that found it

Counting what a screen DRAWS against what it SAYS it is showing. Card search
says "Showing 1 to 24 of 30,636" and drew 48 card images; marketplace drew 42
for 42. That discrepancy is the whole finding, and no rule in
`scripts/probe/` asks the question.

## Play mode did not work on a phone, and no rule caught it (31 Aug 2026)

Every structural audit passed `/play` at 390px. `nav-audit` reported no dead
space, no unused width, no cropped art, no horizontal overflow; `clip-audit`
reported nothing hidden; `sweep` found no control that misbehaved. All of them
were right, and the game still could not be played on a phone, because **none
of them opens a game.** The board is behind two clicks and a Start.

Measured by asking the button where it was, on the opening hand of a real
goldfish game:

    390px   "Keep this hand" starts at x=393. 133px off the right edge.
    430px   93px off.
    768px   visible.

Every group in the HUD is `shrink-0` and the bar does not scroll, so the
primary action was unreachable, not merely awkward. A player could press
Mulligan forever and never keep a hand, under a banner reading "Both buttons
are in the bar at the top".

The bar wraps below `md` now. **Not** by hiding the utilities group, which is
where the game menu lives: that trades one unreachable control for three.

### `HUD_INSET` is a floor now, not the answer

`HUD_INSET = 56` places everything held off the top of the board — the
battlefield, the mulligan bar, the game result, the opening feed. A wrapping
bar makes it wrong, and the first version of the fix hid the banner it was
meant to reveal. The bar reports its own height through a ResizeObserver and
the rest follows it; the constant survives as the starting value and the
floor.

> ⚠️ **It needs a CALLBACK ref, not a ref plus an effect.** The effect version
> read `hudRef.current` when `table` changed, and the bar attaches later than
> that, so the node was null, the observer was never created, and nothing
> moved. It was caught by reading the banner's inline style (`top: 64px`
> against a 92px bar), not by looking at the screenshot, where 18px of overlap
> and 18px of clearance look much the same.

**The lesson is the coverage gap, not the flexbox.** Everything reachable only
after a click is unaudited by every probe in `scripts/probe/`. If a screen
takes a Start button to reach, no rule in this repo has ever seen it.
## Owning a card is not owning one printing of it (30 Aug 2026)

`user_collections.card_id` and `deck_cards.card_id` are both PRINTING ids, and
five surfaces matched one straight against the other. That nearly worked while
the catalogue held one printing per card. Since 19 Aug it holds every printing,
so a deck listing the Commander Legends Sol Ring and a collection holding the
Revised one are two ids for one card, and the product said you did not own it.

Measured on the real database before the fix: **of 16 deck rows whose card the
owner genuinely holds, 4 were reported missing.** Four of the seven real decks
gained a card they own, and two went from owning none of their deck to one.

    deck                              required   owned before   owned after
    Syr Vondam aristocrats                 100          8             9
    Atraxa superfriends                    100          2             3
    Ulamog tron                            100          0             1
    Syr Vondam counters                    100          0             1

Fixed in three places, all keyed on `oracle_id` now:

| where | what it drives |
|---|---|
| `compute_deck_summary` | "Missing", "Complete", "Collection progress" on every deck tile |
| `src/pages/Wishlist.tsx` | which cards the wishlist tells you to buy |
| `DeckTile`'s "Add missing to wishlist" | what lands on the wishlist |

**`src/lib/cards/ownership.ts` is the rule, and it imports nothing** so it can
be tested, the same reason `invokeWithRetry.ts` gives. It counts by `oracle_id`
and hands the answer back **keyed by printing id**, so no consumer had to
change. An id the index cannot resolve falls back to itself, which degrades to
the old printing-only behaviour for that row rather than to "you own none".

**`spendOwned` is the other half and is not optional.** Copies are spent down a
list rather than counted against every line that wants them. A deck listing two
printings of Sol Ring against one owned copy is short one, not short none, and
`least(required, held)` stops a spare box of Sol Rings reading as 900% of one
deck slot. The old `compute_deck_summary` had the opposite bug in the same
statement: `CASE WHEN uc.card_id IS NOT NULL THEN dc.quantity` counted the
whole requirement as owned the moment any row matched, so one Forest covered
ten.

**`AIOptimizerPanel` never had this bug** — it matches on card NAME, which is
printing-independent already. Checked, not assumed.

`oracleIndexFor` in `cardQuery.ts` does the lookup, chunked at 150 the way
`collectionBatch.ts` does, because an `.in()` list is a URL segment and a URL
has a length. One extra read whatever the deck count.

### How this one was applied

`execute_sql` with the exact file contents, so like
`20260828120000_pool_query_id_ordered_indexes.sql` it has **no recorded version
in `supabase_migrations.schema_migrations`** — the opposite failure to the
double-recording described further down. That is safe here only because it is
idempotent, and idempotent deliberately: a second run finds the new block
already present, says so with a `notice`, and returns. Verified by running the
check twice. A migration that raises on its second run is one that breaks
`supabase db push`.

> ⚠️ **The audit fixture had to be fixed twice for this.** It first reported
> `missing: 0` outright, a number nobody counted, which had My Decks drawing a
> green tick and "Collection progress 100% 100/100" over a fixture owning 52
> cards and a deck of 100 — while the Wishlist on the same data said the deck
> was short 90. Then, once it counted, it counted by printing and so
> reproduced the very bug the app had just stopped having. **A fixture that
> reproduces a fixed bug hides the fix.**

## What still calls a model, measured 30 Aug 2026

Owner: *"we are replacing all AI with the backend engine"*. Here is the actual
list, so the next session does not re-derive it. Six edge functions contain a
model call; three of them are reached from `src/`.

| what | where | what happens without a model |
|---|---|---|
| **Deck Generator** | `ai-deck-builder-v2` | The model is a RE-RANKER over a shortlist the engine produced. It returns ids; an id not on the shortlist is dropped and counted in `rejected`. It cannot name a card, cannot score one, cannot reach a card the ranking excluded. A missing key, an unreachable gateway, a refusal or unparseable output all leave the engine's baseline deck standing. **The gateway is out of credits, so production already ships the pure engine deck.** |
| **Tutor** | `mtg-brain` via `Tutor.tsx` | Nothing. Conversation IS the feature. |
| **Scan insights** | `mtg-brain` via `ScanInsightsHelper` | Commentary on a scan. |
| **Card scanner fallback** | `scan-card-ai` via `visionFallback.ts` | Reading a photograph. The rules engine cannot do this. |
| **Commander archetypes** | `mtg-brain` via `AIBuilder.tsx:287` | Picks 4 archetypes from a FIXED list of ids and already falls back to `generateLocalArchetypes`. The engine's `planForCommander` has 113 intent rules doing the same reading, so this is the one genuine remaining candidate for replacement. |
| ArtStudio | `generate-art` | Admin only. |
| not called at all | `gemini-deck-coach`, `dsl-compile-batch` | — |

**`deck-optimizer` contains no model call.** `edhImpact` is the deck's score
with that one change applied minus its score without, a measurement. Client
comments calling it "the model's estimate" are stale.

### What was removed on 30 Aug 2026

- **`BrainAnalysis.tsx`**, the deck page's chat, nine presets answered by a
  model. Owner: *"just remove deck analysis chat we have tutor for that"*.
- **Five "Deck analysis" buttons** on `EnhancedDeckAnalysis`. They had never
  worked: the effect guarded on `deckId` and the only caller passes none, so
  every press rendered an empty `bg-muted/30` box.
- The preset a player would actually miss, "what to cut", is answered by the
  engine now. See "The engine answered what to cut all along".

## The engine answered "what to cut" all along, and no screen read it (30 Aug 2026)

`src/engine/advise/cuts.ts` ranks a deck's own cards worst first. Castability
comes from the roll-up that IS the castability subscore, so a card on the list is
one of the cards named in that subscore. Fit comes from `scoreCandidate`, the
same ranker that chooses which cards to suggest ADDING, so the reason to cut a
card is the reverse of the reason its replacement would be offered. It carries a
sentence per card built entirely from those numbers.

It runs inside **every** `computeDeckPower` call and lands in `power.cuts`.
Nothing in `src/` read the field. Third instance of the section 10e shape: wired
to the engine, never fed to a screen.

It is the Analysis tab's fourth block now. Two lists, because uncastable and
poor-fit are different problems with different fixes, both drawn as whole cards.
No apply controls: the optimiser owns proposing and applying changes and already
draws its own removals with select-and-apply, so this block explains and links
there.

**A stored score rehydrates with `cuts: []` on purpose**, because a cut list is
only meaningful against the decklist in front of you. `/deck/:id` calls
`computeDeckPower` live so the field is populated there. Any surface reading a
STORED score gets an empty list and must hide the block rather than draw an
empty one.

### The engine's sentence is one rendering of the fields, not the only one

`fitReason` builds "This shares 1 thing with the deck (lifegain) but covers no
job you are short of" from `sharedTags` and `fillsRoles`. Correct for a context
with no heading over it. Six of them in a grid is two sentence frames repeated
with one word swapped, so the tiles draw the two arrays directly and the framing
is said once in the section intro. Same for the uncastable list, where every
sentence ends "which is the same reason your castability score is where it is."

Drawing the fields is a second RENDERING, not a second implementation. A tag or
role the engine learns later appears without a change here.

## The probes have an index now, and that is why (30 Aug 2026)

`scripts/probe/README.md`. Read it before writing a new probe.

There are forty-seven scripts in that folder and there was no index, so on 30 Aug
I wrote a third em-dash checker while `em-dash-sweep.mjs` and `emdash-scan.mjs`
were both already there, rediscovering from scratch every false-positive class
the first one documents in its own header. Three tools for one rule.

The accident paid for itself. Comparing the two answers showed the existing
sweep reporting "0 across 0 files" over a real breach: its range exemption
blanks every hole to a digit, so a name, an em-dash and a detail looked exactly
like a wins-losses range, and the insurance report, the one document that
leaves this product, carried em-dashes for as long as the rule has existed. An
em-dash between two holes is prose now; an en-dash is still a range.

**The general point is the index, not the dashes.** A tool nobody can find is a
tool somebody rewrites.

## The instruments lie in four specific ways (30 Aug 2026)

Four separate "defects" this session turned out to be the measuring tool,
not the product, and each cost real time. They are written down because
every one of them will recur.

**A full-page screenshot never scrolls, so it photographs unloaded
images.** `fullPage: true` stitches a tall capture without moving the
viewport, and `CardImage` is `loading="lazy"`, so everything below the
first screenful had never been requested. The picture shows real art at
the top and grey boxes underneath, which looks exactly like broken
images. Misread three screens in one day. `nav-audit` now scrolls, waits
for `naturalWidth > 0` rather than `complete` (which is ALSO true for an
image that finished failing), and waits two frames for paint. It is still
not perfect — two Templates tiles capture grey reproducibly while a probe
finds all 33 images loaded. **A grey box in a screenshot is evidence, not
proof. Read `naturalWidth` before believing it.**

**A synthetic `el.click()` does not activate Radix.** Every shadcn tab,
dropdown, switch and select opens on POINTER events, so `page.evaluate(el
=> el.click())` silently under-reports most of this interface.
`sweep.mjs` reported all nine admin tabs as "no request and no change"
while a real click moved the URL and drew the console. Use Puppeteer's
own `.click()`.

**A page can score clean on every layout rule and hide a third of
itself.** `nav-audit` measures the document: height, dead space below the
fold, cropped art. Tutor scored `pageH 1000, dead 32, crop 0` while
hiding 156px of its welcome screen inside a 564px scroll pane.
`scripts/probe/clip-audit.mjs` asks each ELEMENT whether its
`scrollHeight` is past its `clientHeight`, and separates a scroller
(reachable) from an `overflow: hidden` clipper (not). It ignores
`truncate`/`line-clamp` (an ellipsis is a visible promise) and anything
`aria-hidden` or `pointer-events: none` (the identity ground is
oversized ON PURPOSE and was reported as 77px of hidden content).

**EXPLAIN with a hand-typed WHERE clause measures a query the app never
sends.** The archetype strip was measured at 606 blocks and shipped; the
app's real tag list is smaller and it costs 1,134. **A smaller `&&` array
is MORE expensive** when the plan walks an ordered index and filters,
because it reads further down to fill the same LIMIT. Build the predicate
by calling the app's own function, never by retyping it.

### The corollary about the shape of these

Three of the four made the product look worse than it is, and the fourth
made it look better. That asymmetry is the danger: an instrument that
invents defects wastes a morning, and an instrument that hides one ships
a timeout. Both are fixed by the same discipline, which is to confirm a
finding with a second, differently-shaped measurement before acting on
it.

## Green tests do not mean a player can reach it

The game engine is a rules library with 1,367 passing tests, and for months the
most common complaint about play mode was that it could not do things the engine
had already implemented. Counterspells, equip, Aether Vial's charge counter,
mulligan. None of them were broken. None of them were reachable.

The cause is structural and worth remembering, because every test in
`src/lib/game` builds a `GameAction` by hand and feeds it to the reducer. That
is the right way to test rules. It also means a suite can be completely green
while nothing in the app has ever constructed the action under test. `ATTACH`
was proven correct by tests and had never been built by any code path, anywhere.
`PHASE_CHANGE` had validation, two reducer cases, a network-authorisation entry,
an effects handler, and a filter in `GameFeed` to keep it out of the log, all
serving an action nothing produces.

So: **"the engine supports it" and "a player can do it" are different claims,
and only the second one is what was asked.** Do not report the first as if it
answered the second. This has been reported wrongly more than once, on the
XMage port and again on play mode.

`src/lib/game/reachability.test.ts` now enforces the weaker half of this
mechanically, as a ratchet. Its own doc comment records what it still cannot
see: it accepts any producer, so an action the engine builds during resolution
counts as reachable even when the player-initiated path is missing. Closing that
gap is a judgement call, not a check.

## Migrations are double-recorded under two different version numbers

Applying a migration through the Supabase MCP tool stamps its own version into
`supabase_migrations.schema_migrations`. Writing the matching file into
`supabase/migrations/` by hand picks a different timestamp. The result is the
same migration recorded twice under two version numbers, and every recent
migration on this project is in that state:

| in the database   | in the repo       | name                                          |
|-------------------|-------------------|-----------------------------------------------|
| 20260819163240    | 20260819235000    | audit_backlog_lives_in_dev_findings_not_the_bundle |
| 20260819041822    | 20260819230000    | full_coverage_means_nothing_unparsed          |
| 20260819034630    | 20260819210500    | card_printing_spread_view                     |
| 20260819034533    | 20260819210000    | own_a_printing_not_a_card                     |

Nothing is broken today, because Lovable deploys the app and does not run
migrations. The hazard is `supabase db push`: it compares the repo's version
numbers against the applied ones, sees the repo timestamps as new, and re-runs
migrations the database already has. Whether that is harmless depends entirely
on whether each one is idempotent, and several are not.

Fixing it means renaming the local files to the version numbers the database
actually recorded, but only after confirming the SQL in each file matches what
was applied. Do not rename them blind. If the contents differ, the rename hides
a real divergence instead of resolving it.

Going forward: apply migrations by writing the file first and applying that
exact file, so one version number exists rather than two.

## One table, one set of logic

Owner, 21 Aug 2026: "all modes of play, including playtest all share same UI and
logic - if one is updated, they all update ... this includes online mode."

Goldfish, versus bots, playtest and online are **four sources of actions feeding
one game**. They are not four games. The mat, the hand, the card preview, the
combat surface, the log, the playmat picker and the ability panel are one
implementation each, used by all four. A fix to any of them lands everywhere
without being ported.

The engine already has the property that makes this affordable. `bot.ts` has no
private board and no private rules: it reads a `GameState`, calls the same
`moves.ts` helpers a human click calls, and hands back a batch for
`applyActions`. A bot seat and a human seat are indistinguishable downstream.
Online is that shape once more, a seat whose actions arrive over a transport
rather than from a click.

**So the only differences between modes are where actions come from and what a
seat is allowed to SEE.** Put the difference in the transport and the
projection. Never in the surface.

If you are writing an `OnlineBattlefield`, an `OnlineHand` or a second card
preview, stop: that is the law being broken. If a mode genuinely needs something
the others do not, add it as a prop or a slot on the shared component and say so
out loud, because a silent divergence is how four games grow out of one.

The reason this matters more than tidiness: play mode has already been through a
period where capabilities existed and no player could reach them. Four copies of
the surface would guarantee that a fix reaches one mode and not the other three,
and nobody would notice which.

## The play page is one flow with four doors (22 Aug 2026)

Owner: *"we need to redesign the entire play a game UI - leading with online"*,
*"Then you'd have a deck selection mode too"*, *"maybe deck select could be the
full cards - maybe reuse from deck pages?"* and *"playtest can probably merge
with the play page as a main option"*.

`/play` is now **mode, then deck, then the table**:

| Step | What it is | Where it lives |
|---|---|---|
| One | Four doors: ONLINE, VERSUS BOTS, GOLDFISH, PLAYTEST | `ModeWall.tsx`, copy in `playModes.ts` |
| Two | One deck wall, commander cards whole and at full size | `DeckStep.tsx` over `DeckWall.tsx` |
| Three | Seats, or for online the lobby | `SeatStep.tsx`, or `/play/online` |

The step label, the big title, the breadcrumb of choices and back on the left
with the way on at the top right are `StepChrome.tsx` and `playFlow.ts`, shared by
every step of every mode including the online lobby. That is what makes four
modes read as one product.

### The load-in was redone on 30 Aug 2026. Owner: *"its super confusing"*

Four things were measured against the built app and all four are now different.
Do not walk any of them back without re-measuring.

1. **The step is in the URL** (`?mode=bots&step=table`) and `goToStep` PUSHES.
   Before, step two and step three had the identical address, so browser Back on
   the last step left the play section, a refresh dropped you to step two, and
   no link could point at the seats. Design law 4 says back and forward work
   universally. `stepFromUrl` makes a hand typed step safe.
2. **A mode has as many steps as it has decisions, and the label says how many.**
   `Step two of three`, and `stepsFor('goldfish')` is two steps because
   goldfish's third screen held one chair and nothing to decide. Goldfish is now
   two clicks from `/play` to a dealt game.
3. **One control for the way on, in the step bar, on every step of every mode**,
   including the lobby's "Open a table". The start button used to be in the page
   header on the last step only: forward at y=216 on steps one and two, start at
   y=108 on step three, and on a 390px phone the start sat ABOVE the back
   control. Step one has no step bar at all now, because its forward control was
   permanently disabled under "Pick a mode to carry on" while four large doors
   underneath were the actual way on.
4. **The playmat catalogue came off the critical path** into
   `TableSettingsPanel`, the right-hand slide-out, with the shuffle seed. It was
   750px of the last screen's 1,645px at 1600 x 1000 and started at y=1,751 on a
   phone. A live preview of the mat you will get stays on the page, so
   *"I dont see the themed playmats?"* does not come back.

Measured before and after at 1600 x 1000 and 390 x 844:

| screen | before | after |
|---|---|---|
| mode wall, 390 | 2,333px, fourth door at y=1,711 | 1,868px |
| seats, 1600 | 1,645px | 1,374px |
| seats, 390 | 3,216px | 2,485px |

### The four cover photographs are gone. Do not put them back

Owner, 29 Aug 2026: *"those images look awful so probably remove them."*

They were `play-mode-<id>.png` in the public `art` bucket, and the fault was not
only taste: all four were a glowing circular table in the same purple and teal
vault, so the picture said the SAME THING on all four doors, on the one screen
whose entire job is telling four things apart.

What is in that space now is the difference itself, drawn. `mode.table` in
`playModes.ts` says who is at each table and `ModeWall` draws it: a `Playmat`
surface with a chair per seat, YOUR chair marked solid, the others holding people
or bots or nobody, and the seats the mode can add but does not always deal drawn
faint. No bucket, no 404, no licence, no bytes, sharp at any size.

The label above each title is the answer to the question the page asks:
`ANOTHER PLAYER`, `THE COMPUTER`, `NOBODY`, `YOUR OWN DECKS`. It used to be a
mood (OTHER PEOPLE, HANDS OFF) and four moods do not tell four modes apart.

`playModes.test.ts` asserts that no door carries a URL or an image path. The
Scryfall rule still stands and is the same rule: a door has to be darkened for
type to sit on it and card images may not be modified. Art is allowed at step
two, on a deck tile, whole and unmodified.

### `/simulate` is gone as a page and kept as a redirect

Playtest was never a different product: same rules engine, same mat, same hand,
same log, differing only in who provided the actions. It is now the fourth mode,
and the only thing that changes when it is chosen is that seat one is dealt with
`isBot: true` and the driver is `useWatchedGame` rather than `usePlayGame`.

`/simulate` **redirects** rather than being deleted, carrying `?deck=` across,
because two deck tiles have been sending people to `/simulate?deck=<id>` for a
long time and that link is in bookmarks. The left nav has **one** Play a Game
entry now.

Measured after the merge, signed out against the live card database
(`scripts/play-merge-check.mjs`): a real game on `src/lib/game`, turn 2 by nine
seconds, life and boards moving, and every control that used to be on
`/simulate` still on the board (Pause, Step, 0.5x through Max, Restart, Leave,
Follow the turn, One seat, LOG, CMD).

### The one deck wall

`DeckWall.tsx` replaced **two** copies of the same grid (`PlaytestSetup` and
`GoldfishSetup`, both deleted) and a dropdown (`PlaySetup`, deleted). It reuses
`CardImage`, `PowerScoreBadge` and `ColorIdentity` rather than redrawing them.
`ModernDeckTile` on `/decks` stays where it is: managing a deck and choosing one
to play are different jobs.

Its rows come from `usePlayDecks`, which is **three batched queries whatever the
deck count** and shares one React Query key with the lobby. It is deliberately
not `DeckAPI.getDeckSummaries()`, which is one `compute_deck_summary` RPC per
deck and is the shape that took this app down twice.

### ~~Mode covers: the path, the shape, and the rule~~ THERE ARE NO COVERS

A door has no picture at all, as of 30 Aug 2026. See "The four cover
photographs are gone" above. `public/covers/play/` held only a README for a
mechanism that had already moved to the `art` bucket and is now gone twice over;
both are deleted.

**The rule that outlived them: never point a door at Magic card art.** A door has
to be darkened for type to sit on it and Scryfall's guidelines forbid modifying
card images. A deck tile shows a card WHOLE and UNMODIFIED, which is the
permitted case, and that is the whole reason art is allowed at step two and not
at step one.

`ArtStudio` in Admin still carries four `play-mode-*` prompt presets. **Nothing
renders what they generate.** They are kept because the panel is a general art
tool and the prompts are a worked example of a prompt that names a mood rather
than Wizards' artwork; they are not a covers pipeline.

## The discussion: who may read, who may post (22 Aug 2026)

The lobby's discussion is a forum, not a chat. `forum_topics` and `forum_posts`,
two scopes, one set of components.

**The rule, decided and enforced in two places each:**

| | reading | posting |
|---|---|---|
| the open board (`scope = 'board'`) | **anybody, signed out included** | account required |
| a table's talk (`scope = 'table'`) | only the people at that table | account, and a seat |

Reading is decided by RLS policy. Posting is decided by there being **no INSERT,
UPDATE or DELETE grant to `anon` or `authenticated` on either table at all**, so
the only way a row is ever written is through `start_forum_topic`,
`post_forum_reply` or `post_table_message`, each of which refuses a null
`auth.uid()`. A client that could insert directly could post under somebody
else's name and skip the rate limit doing it.

The open board is public on purpose. A forum whose value is that the
conversation is already there when you arrive cannot sit behind a sign-up wall,
so `/play/online` is registered on the signed-out route tree too. The board says
so on screen, at the point somebody is deciding what to type.

**The deck rule does not apply to talking.** Sitting down needs an account and
one deck with cards in it. Asking whether anybody wants a game needs an account
and nothing else. `postingVerdict` in `src/lib/lobby/forumView.ts` has a test
asserting this, because it is the sort of thing that gets copied across.

### Two things that must not be undone

1. **`scope` and `table_id` are copied onto `forum_posts`.** They are already on
   the topic. They are duplicated so a policy on `forum_posts` can decide using
   the row in front of it instead of reading `forum_topics`, which is the exact
   shape that raised **42P17 infinite recursion** on `game_participants` and
   killed every authenticated read on this project.

2. **Nothing renders a post through `dangerouslySetInnerHTML`, ever.**
   `tokenisePost` in `src/lib/lobby/richText.ts` returns small objects, never a
   string of markup, and `PostBody` draws them as React children. Links are
   allowed only after `new URL()` says http or https, so `javascript:` and
   `data:` cannot get through a pattern match. Control characters and the
   bidirectional overrides are stripped. `richText.test.ts` is written as an
   attack list. If bold text or card links are wanted later, add a TOKEN KIND
   and a branch, not a parser that emits tags.

### The rate limit is at the database

`forum_write_guard` enforces 2 seconds between posts, 12 posts a minute, no
repeat of the same words inside 5 minutes, and 6 new topics an hour. All of it
is one index scan bounded to the last hour. A disabled button is not a limit, it
is a hint to the one client running our JavaScript.

### Moderation exists

`is_dev_admin()` gates `block_forum_poster` (with an optional wipe of everything
that account wrote on the board), `remove_forum_topic` and
`set_forum_topic_flags`. Anybody may remove their own post, and anybody may
report one; `report_count` is kept on the post row so the moderator view costs
no extra read. **Removal nulls the body**: the words leave the database, and the
row stays only so the reply written underneath it still makes sense.

## A function cannot raise its own statement_timeout (30 Aug 2026)

The nightly `cards-unique-refresh` was found failing every run since 28 Aug,
diagnosed at 06:11, and failed again at 06:00 the same morning after exactly 120
seconds. The fix was dead code that read as the fix.

    set statement_timeout = '2s';
    do $$ begin
      perform set_config('statement_timeout','30s',true);
      perform pg_sleep(5);
    end $$;
    -- ERROR: 57014 canceling statement due to statement timeout

**`statement_timeout` is armed when the TOP-LEVEL statement begins and is never
re-armed.** A function that raises it raises it for the NEXT statement, not for
itself. So `perform set_config('statement_timeout','20min',true)` at the top of
`refresh_cards_unique` never bought it a second, and the rebuild kept dying at
the cluster default of 120 s against the 575 s it needs.

The caller has to set it, in its own statement, before the one that needs it.
The cron command is now:

    set statement_timeout = '20min'; select public.refresh_cards_unique(false);

And the function RAISES with a sentence saying exactly that when it is handed
between 60 s and 15 minutes, so the next caller that gets this wrong fails in
one run with an actionable message instead of a generic 57014 nine minutes
later.

### A pg_cron command holding more than one statement is a transaction block

Same session, same shape, found before it ever ran:

    set statement_timeout = '20min'; vacuum (analyze) public.cards_pool;
    -- ERROR: 25001 VACUUM cannot run inside a transaction block

Moving VACUUM out of a function and into a two-statement cron command moved it
from one transaction into another. A multi-statement simple query IS an implicit
transaction block. VACUUM now gets one job per view, ONE statement each, at the
120 s default: `cards-unique-vacuum` (07:00, 13:00) and `cards-pool-vacuum`
(07:05, 13:05). Both measured well inside 120 s. **Do not add a `set` line to
either of them** — that is precisely what breaks them.

### Why this went unnoticed for two days

**A failed cron job writes only to `cron.job_run_details`.** Nothing in the app
reads it, so `cards_unique` and `cards_pool` silently described 28 August while
every search, commander pick, suggestion, pool read, optimiser run and Tutor
answer was served from them. When a scheduled job matters, check
`cron.job_run_details` by hand; a green-looking app is not evidence.

## Tutor failed one question in six, and not for a reason about the question

Scoring 80 real questions against the deployed function, **12 of the first 50
came back `502 Bad Gateway` in 24 to 151 ms.** Asking one trivial question 25
times gave 19 answers and **6 CONSECUTIVE 502s**.

A 502 in 24 ms never reached the function, which takes about half a second to
answer. It is the load balancer, and the next attempt usually works. Nothing
retried, so the page printed its own failure.

All six call sites now go through **`askEdgeFunctionRaw`** in
`src/lib/tutor/edgeInvoke.ts`, a drop-in with the same two arguments and the
same `{ data, error }` back. The rules live in `invokeWithRetry.ts`, which
imports nothing so it can be tested, and the tests state the limits as loudly as
the behaviour:

| status | retried | why |
|---|---|---|
| 502 / 503 / 504 | yes, twice, 250 ms then 650 ms | the gateway, not us |
| 500 | **no** | raised BY the function, carries our own error, the work was attempted and a retry could repeat a side effect |
| 4xx | **no** | the request is wrong and will be wrong again |
| 546 | **no** | the resource limit the deck generator surfaces deliberately |

Use `askEdgeFunctionRaw` for any edge function a person is waiting on. It cannot
live in `src/lib/tutor/invokeWithRetry.ts` itself because `node:test` does not
resolve the `@/` alias, and a module that imported the client would be a module
with no tests.

## The engine reads the cards people play, measured by play rate (30 Aug 2026)

Coverage over the whole catalogue is the wrong denominator for every consumer
that matters. The deck generator draws from the most played few thousand cards,
and nothing had ever measured that slice. **`scripts/compiler-gap-probe.ts`**
does, against the WORKING TREE's compiler rather than the stored memo, so a rule
written five minutes ago is measured before anything is refilled or deployed.

    top 100     26.3% produced NO ability record at all
    101-500     12.0%
    501-2000    20.4%

A card with no record cannot be keyed to a commander, cannot be ranked on what
it does, and in play mode resolves to nothing. The probe also clusters the blind
cards by SHAPE, so the work list is ranked by how many played cards each rule
unlocks rather than by opinion. **Use it before writing any compiler rule.**

Four rules shipped that day, in ranked order, taking the top 100 to **23.2%**:

| shape | cards it unlocked |
|---|---|
| conditional mana (`among`) | Command Tower (2), Arcane Signet (3), Exotic Orchard (9), Fellwar Stone (17), Reflecting Pool (173), Mox Amber (205) |
| scry and surveil | a DSL member and a renderer case with **no rule producing either** |
| subject ellipsis | Night's Whisper (182), Sign in Blood (232) |
| search for "up to N" | Cultivate-shaped clauses said with a flag rather than refused |

Three things worth keeping from how they went:

1. **`among` is a FIELD on `add-mana`, not a verb.** A new verb needs a line in
   `EFFECT_VERBS`, a facet, and an entry in `ROLE_FACETS.ramp` before any of
   those six cards counts as ramp anywhere. A field keeps the facet
   `eff:add-mana` and every consumer that understands Sol Ring understands them.
2. **`normalize.ts` STRIPS APOSTROPHES.** The first draft matched
   `commander's color identity`, so the four cards without an apostrophe worked
   while the two ranked 2 and 3 stayed blind.
3. **A rule that refuses is not automatically the safe one.** "Up to N" used to
   `return null`, which was right that the count must not be fixed and wrong
   that the answer was silence: every consumer reads no record as "does
   nothing" rather than "unread".

### The remaining clusters, ranked, with what each needs

    36  search library, destinations not covered   Cultivate (20), Kodama's Reach (37)
    22  modal "choose one"                         NOT one rule: choose-mode already
                                                   works, each mode BODY is a
                                                   different hard problem
    13  cast without paying its mana cost          Deflecting Swat (75)
    11  conditional mana, granted to others        Cryptolith Rite (693), Kinnan (1361)
    10  shockland                                  needs a replacement-time PROMPT
     8  cost taxing "unless that player pays"      Esper Sentinel (77)

**The ten shocklands were deliberately not done.** "As this land enters, you may
pay 2 life. If you don't, it enters tapped" is a player CHOICE, and the runtime
has no way to offer one at replacement time. Compiling it to an unconditional
`enters-tapped` would make ten of the most played lands in the format play
WORSE than printed in every game. Half of that fix is worse than none of it.

### The facet vocabulary is a flat SET, so it loses which clause a facet came from

Found while trying to add a `protection` role. `eff:attach` plus a protective
keyword is precise (Swiftfoot Boots, Lightning Greaves, Whispersilk Cloak,
Mithril Coat, Darksteel Plate, Hammer of Nazahn, Kaldra Compleat: 9 of 9
correct). Widening it to `scope:all` is not, and the reason is structural rather
than tunable:

    Darksteel Citadel  kw:indestructible                                 bare, HAS it
    Swiftfoot Boots    kw:hexproof + eff:attach + cares:type:creature     GRANTS it
    Purphoros          kw:indestructible (his own) + scope:all (a pump)   LOOKS granted

Purphoros, Iroas, Animar and Emrakul all carry a protective keyword themselves
while an unrelated clause supplies `scope:all`, and a flat set cannot tell that
apart from Eldrazi Monument. About 15% false positives. **A conjunction over
facets is only sound when the facets provably come from the same clause.**
`scripts/protection-rule-try.mjs` names the cards.

## Two measurement bugs that both read as the engine being bad (30 Aug 2026)

Both had been read past in earlier runs, and each moved the headline number by
about ten points.

**`cards_unique` holds ONE printing per card**, the cheapest, so a printing id
taken from `cards` is usually NOT in it. `generator-synergy-audit.mjs` looked
commanders up by a hardcoded printing id; Kozilek's roster id was `c41554e7` and
the representative printing is `f06fc6e0`, so the fetch returned nothing, the
plan had no wants, every card scored zero fit, and the audit printed **"keyed
23%" one line under its own warning that it could not judge fit at all.**
Kozilek is 79%. Resolve a commander BY NAME, which is what `pipeline.ts` does.

**`planForCommander` reads `oracleText`, camelCase**, and PostgREST returns
`oracle_text`. Pass the raw row and the 113 intent rules never fire. The
generator does this correctly; a probe written in a hurry does not.

### The second reader now runs on a THIN plan, not only on silence

Meren of Clan Nel Toth is an aristocrats commander, and the intent rule for
"whenever another creature you control dies" had existed all along without ever
firing, because her facets are not SILENT: an incidental `ctr:experience`
produced two wants, so `wants.size` was non-zero and the gate skipped the
reader. Her entire plan was `ctr:experience@0.9, eff:proliferate@0.8`.

The gate's own comment is the argument for changing it: it calls an intent rule
"a more specific claim" than the combat fallback, which is an inference from
silence. It now runs under four wants, with corroborating weights scaled to
**0.8** so anything the record actually stated still outranks anything inferred
from English. Only the fallbacks stay gated on total silence.

> **A keyed percentage rises whenever the plan gains wants**, so it can go up
> while the deck gets no better. `SHOW=1 node scripts/generator-synergy-audit.mjs`
> prints the list. Read it as a player. Meren's is now Eternal Witness,
> Bloodghast, Timeless Witness, Graveshifter, Doomed Necromancer, Cauldron
> Familiar and Bloodsoaked Champion; it was a generic pile.

### `EMPTY_DECK_POPULARITY`: the comment said 2.4 and the constant said 1.8

It drifted down when `EMPTY_DECK_COMMANDER_FIT` went to 3.6, and it was the half
of the friend's verdict never addressed, *"there are cards he would absolutely
never include"*. Six decks, same pool, only this number moved:

|  | median edhrec_rank | past 15,000 | staples | orphans | keyed |
|---|---|---|---|---|---|
| 1.8 | 6696 / 4484 / 4400 / 1551 / 2219 / 5090 | 26 | 30/54 | 3 | 85% |
| **2.4** | 5941 / 2446 / 4077 / 1528 / 1923 / 3412 | **16** | **31/54** | **2** | 84% |
| 3.0 | 5483 / 1711 / 4077 / 1528 / 1878 / 3412 | 16 | 31/54 | 2 | 84% |

3.0 measures no better and passes `playability` (2.5), which the standing rule
forbids. `rank.ts` clamps it there anyway, and **a value that relies on being
clamped is a value that lies about itself.**

Verified against the DEPLOYED function rather than a local build, because
section 10c records this same generator sitting on `6-grounded` for days:

    Meren    92 cards  median rank 2840  past 15k 0   2.1s
    Krenko   88 cards  median rank 5643  past 15k 13  1.2s
    Atraxa   97 cards  median rank 2602  past 15k 0   3.7s

Krenko's list opens Sol Ring, Arcane Signet, Fellwar Stone, Mind Stone and then
goblins. Section 10c recorded that same commander producing 4 creatures, 54
artifacts and 0 of 64 cards keyed off him.

### Still wrong, and measured

- **No sacrifice outlet in a Meren deck, and the reason is the SLOT and not
  the facet.** `cost:sacrifice` now exists, the aristocrats plan asks for it at
  0.72, and Ashnod's Altar and Viscera Seer both score a real fit of 0.720
  against Eternal Witness at 0.752. They still do not get in, because pass one
  of `generateDeck` takes each card into its NEEDIEST role and Ashnod's Altar
  classifies as `ramp`: once Sol Ring, Arcane Signet, Fellwar Stone, Mind Stone
  and Commander's Sphere have filled that quota, `neediestRole` returns null
  and the card is skipped however well it fits.

  In a Meren deck the Altar is not ramp, it is the engine. Role quotas and
  commander fit are different axes, and a card whose role is full cannot get in
  on fit alone. The fix is slots reserved for the highest-fit cards regardless
  of role, which is a real design change and wants measuring across many
  commanders rather than tuning until one card appears.
- Krenko still reaches deep: median rank 5643, 13 cards past 15,000. Mono-red
  has a smaller pool, so some of that is inherent and some is not.
- Boots, Greaves, Skullclamp and Demonic Tutor are missing from most decks.

## ~~The facet memo is on COMPILER_VERSION 2~~ IT IS ON 9. See the 1 Sep section at the end

Three places pin it and they move together: `facet-memo-fill`,
`public.facets(cards_unique)`, and the `cards_pool` view's own join. A reader on
one version and a writer on another is **silent**: every card reads as having no
facets, which the ranker cannot tell from a card that genuinely does nothing.

**Bump the WRITER first, refill, and only then move the readers.** 33,032 rows
take about 68 seconds.

> ⚠️ **That order only works because the PRIMARY KEY is `(oracle_id,
> compiler_version)`, and it was `oracle_id` ALONE until 30 Aug 2026.** With the
> old key, `facet-memo-fill` upserting a card at the new version DESTROYED its
> row at the old one, so a reader still filtering the previous version found
> nothing for it from that instant. The window was not zero, it was the whole
> refill and it grew: a rising fraction of the catalogue reading as having NO
> FACETS to the live generator, which is exactly the silent failure the version
> number exists to prevent, arriving through the mechanism meant to prevent it.
>
> This paragraph asserted the order was safe before anybody checked the key.
> Migration `the_memo_can_hold_two_compiler_versions` makes the claim true.
> **Delete the old version only after the readers have moved.**

`cards_pool` is a materialized view, so moving its join means DROP and CREATE,
and all four indexes have to come back with it. `cards_pool_identity_rank_id_idx`
is the one that lets a colour-filtered pool be WALKED in popularity order rather
than sorted; without it the pool query went from 25 ms to 13.7 s against a 3 s
`statement_timeout`.

---

## 31 Aug 2026 — the engine night. What changed, and what is now true

The owner's brief: *"get this to full coverage of all cards, strategies, new
cards, old cards, automatic ongoing systems, roles, everything - the text engine
is probably one of the most important things"*, and *"everything must be
universal and work across every commander and card and type"*.

### The facet memo is on COMPILER_VERSION 7, and it TOPS ITSELF UP now

The version is pinned in three places and they move together: `facet-memo-fill`,
`public.facets(cards_unique)`, and the `cards_pool` matview's own join. **Bump
the WRITER first, refill, and only then move the readers.** A reader on one
version and a writer on another is silent: every card reads as having no facets,
which the ranker cannot tell from a card that does nothing. 33,032 rows take
about 40 seconds over 34 calls.

**`facet-memo-top-up` runs every 15 minutes** and is the answer to *"we need to
be prepared for when new cards come in that this happens automatically"*. Before
it, `card_facet_memo` had been written exactly once, by hand, in 65 seconds on
30 Aug, and nothing was scheduled to write it again — so every card of the next
set would have arrived in `cards_pool` with `facets = NULL`, invisible to
commander fit, to the optimiser and to every suggestion surface, silently.

    public.card_facet_gap()             cards with no facets at the current version
    public.cards_missing_facets(v,a,n)  exactly those, so the fill asks for the gap
                                        instead of walking 33,032 rows to find 300
    public.fill_card_facets_if_needed() one HTTP call, ONLY when the gap is not zero

The version is READ (`max(compiler_version)`), never hardcoded, so a bump
self-heals: the first write moves it, the gap becomes the catalogue, and the job
closes it over the following hours. Proven end to end against production by
deleting Sol Ring's memo row and watching it come back identical.

`pg_net` defaults to a **five second timeout** and the fill takes longer, so the
call succeeded, the memo was written, and the response row recorded only
"Timeout of 5000 ms reached". `timeout_milliseconds := 120000` now. A scheduled
job whose record says nothing about its own success is how one fails for two
days unnoticed.

### The intent rules are gated on `rec:full`, not on how many wants exist

Measured over the 400 most-played commanders: the compiler reported `rec:full`
for **42, 10.5%**. For **322, 80.5%**, it said it had NOT read the whole card
and the plan nonetheless had four or more wants, so the 113 English intent rules
never ran. Four in five of the commanders people actually build had a second
reader that could have spoken about the unread half and was silent.

`rec:full` is the right gate and the want count never was. English must not talk
over a parsed record — that reasoning is exactly right, and `rec:full` is the
facet that means "there IS a parsed record for every clause". A thick plan is
not that. Effect: mean wants 5.2 → 7.8, and 220 of the 400 gained wants.

**The weak number and the strong one.** 100% of 3,542 commanders get a plan with
wants; that is the number that looked fine for months. Only 10.5% have the whole
card read, and **40.6% of commander ability lines produce nothing at all**. Use
`scripts/commander-read-audit.mjs`, which reports both and says which is which.

### The role vocabulary is ten roles, and one was measured and rejected

`ramp draw removal interaction tutor enhance protection wincon land creature`.

`protection` is new and it is why Swiftfoot Boots — the twelfth most played card
in the format — was missing from every generated deck for weeks. It was not
outranked; it was competing for `enhance` slots against auras that make a
creature bigger, which is a different job.

**A `tokens` role was written, measured and REVERTED.** Thirteen rescues looked
like a clear win; it made Krenko's creature target fall from 32 to 27 and
Talrand's rise from 18 to 21, so a spellslinger in creature mode came out ahead
of a Goblin lord in spell mode. The cause is structural: `creature` is a floor
taken over the WHOLE deck rather than a bucket, so a second board-presence role
double-counts the same job. A rule that measures worse is the wrong rule.

**`scripts/role-rule-try.mjs` is how a role rule gets decided.** It prints the
list of cards a candidate would claim, in both directions — what it rescues and
what it takes from a role that already had it right. `ROLE_FACETS` carries two
long comments about rules added, measured and removed for exactly this reason.
An `edict` rule looked good and the list killed it: two rescues, and Scapeshift
filed as removal.

### `cost:` tells an outlet from a spell, and it nearly stopped being able to

Four facets where there had been two, and both splits came out of reading a
whole generated Meren deck card by card rather than looking at its score. The
deck had Grave Pact, Dictate of Erebos, Bastion of Remembrance, Grim Haruspex,
Midnight Reaper, Vindictive Vampire and Blood Artist in it, and **nothing that
could sacrifice a creature on demand**. Its power score was 6.8.

| facet | means | example |
|---|---|---|
| `cost:sacrifice` | eats something else, on demand. AN OUTLET | Ashnod's Altar, Viscera Seer |
| `cost:sacrifice-self` | eats only itself, once | Vexing Bauble, Sakura-Tribe Elder |
| `cost:cast-sacrifice` | an additional cost to CAST a spell | Village Rites, Deadly Dispute |

### Six deck slots are reserved for commander fit, and three orderings were wrong

They are spent AFTER the quota loop, because which roles filled up is not known
until they have, and a card whose role quota is full was unreachable however
well it fits. Ashnod's Altar classifies as `ramp`; in a Meren deck it is the
engine.

Ordering that pass is where the mistakes were:

- **by fit** — `planFit` is a noisy-OR, so a card matching five wants weakly
  outranks the card that IS one of them. Cauldron of Essence, rank 2,508.
- **by `rec.score`** — contains `roleGap`, so the role term sneaks back into the
  one pass that exists BECAUSE role quotas cannot reach a card. Codex Shredder
  (rank 2,387) beat Ashnod's Altar (rank 134) 11.09 to 9.33, almost all of it
  role.
- **one card per want, loudest want first, and within a want the card people
  play most.** Within one want every candidate does the same thing, so what
  separates them is how good a card it is.

A colourless budget is held back for it too: reserving deck slots without
reserving colourless slots reserves nothing for an artifact.

`EXTRA_WANT_DECAY` is **0.20**, down from 0.35, measured across all six audit
decks. See the note on the constant for the table.

### The strategy list reads the engine. There is no model call left in the builder

`strategiesFor` in `src/lib/deck/commanderStrategies.ts` reads
`planForCommander` and `deriveCardTags` and nothing else. It replaced a call to
`mtg-brain` plus seven hardcoded substrings of the commander's rules text, which
was a FOURTH implementation of "what does this commander want".

Eighteen archetype shells, up from eight, against the 28 strategies the tagger
can already name. Syr Vondam is offered Blink now, with the engine's own
sentence: *"is also paid when your own creatures are exiled, which is what
blinking them does"*.

### The probes, and the one that was lying

    scripts/commander-read-audit.mjs   does the engine read commanders properly
    scripts/unparsed-shapes.mjs        which SENTENCE recurs, ranked by cards
    scripts/role-rule-try.mjs          what would this role rule claim, by name
    scripts/why-not-in-deck.mjs        why is THIS card not in THAT deck
    scripts/role-coverage.mjs          how many played cards can be placed at all

`role-coverage.mjs` paged with `offset=1000`, which makes Postgres walk and
discard a thousand rows, so page two timed out — and it printed "read 1000
cards, most played first" and carried on reporting percentages over half the
slice it named. Three query shapes, measured:

    offset=1000                               walks and discards 1,000 rows
    or=(rank.gt.N,and(rank.eq.N,id.gt.X))     2.29 s, cannot use the index
    edhrec_rank=gte.N                         0.34 s, a clean index range

`gte`, not `gt`, because `edhrec_rank` is not unique. It says so out loud when
it reads fewer rows than asked for.

**And the trap that wasted an hour: the generator reads STORED facets from
`cards_pool`, not the working tree's compiler.** Every measurement of a deck
after a compiler change is stale until the memo is refilled and the readers
moved. `compiler-gap-probe` and `unparsed-shapes` compile locally and are not
affected; `generator-synergy-audit` is.

### Where the numbers stand

    the 2,000 most played cards
      compiler produces no record at all      19.9%   (was 21.0%)
      top 100 blind                           17.9%   (was 23.2%)
      cannot be placed in any role            12.6%   (was 14.0%)

    the six decks in generator-synergy-audit
      format staples found                    40/54   (was 35/54)
      Adeline 8/8, Ghalta 9/9, Niv-Mizzet 8/10
      Niv-Mizzet median rank         1697 -> 1086
      Teysa median rank              2316 -> 1225
      Ghalta cards past rank 15,000     3 -> 0

Production runs facet compiler version 7, and `ai-deck-builder-v2`,
`deck-optimizer`, `mtg-brain` and `facet-memo-fill` are all deployed from this
tree. **Pushing is not deploying** and this file has said so three times about
three different functions.

### Two more things the quota system got wrong, found by reading roleFill

**A quota system that does not meet its quotas while slots remain is not a
quota system.** `neediestRole` is decided ONCE per card in score order, so a
card serving both `enhance` and `protection` is spent on enhance while enhance
is the shorter of the two, and by the time protection is neediest the loop has
walked past everything that could have filled it. There is a pass that goes
back for them now, one walk per short role. Order the pool ONCE outside it: the
first version re-sorted 10,913 cards per slot and took a Meren build from 1.7 s
to 8.8 s.

**A target the pool cannot fill is not a local problem.** `protection` asked for
SEVEN cards, because `WHEN_IT_MATTERS` said turn four and `copiesToSeeOne`
answers "how many to have drawn one by then". No real Commander deck runs seven
protection cards, and the four unfillable slots came out of the budget every
other role was competing for. Turn six now.

`wincon` stays short at 1 of 4 on most decks and that is honest: its facet list
is deliberately narrow and most finishers reach the role through the tag
fallback, so the target is often more than the pool holds.

### The two reserve passes are one pass

There were two, with two budgets, both spending from the same spell slots: one
before the quota loop for cards serving no role, one after it with six reserved
slots. Role targets summed to 49 of 51 available, so four cards filling no
target left four targets unfillable. They do the same job — reaching a card the
quota system cannot, whether because it serves no role or because the role it
serves is full — and they are one pass with one budget of eight.

### Final state, 31 Aug 2026

    the 2,000 most played cards
      no ability record at all                19.9%   was 21.0%
      top 100 blind                           17.9%   was 23.2%
      cannot be placed in any role            12.6%   was 14.0%

    seven local decks (generator-synergy-audit)
      format staples                          47/61
    fourteen DEPLOYED decks (deployed-deck-sweep)
      all 100 cards                           14/14   Najeela included
      format staples                          67/94
      cards past EDHREC rank 15,000              16

    production
      facet memo                              version 7, gap 0, one version held
      facet-memo-top-up                       every 15 minutes, 0 failures
      deployed from this tree                 ai-deck-builder-v2, deck-optimizer,
                                              mtg-brain, facet-memo-fill

### One card in five shows its Marvel printing, and that is a decision for the owner

`cards_unique` holds ONE printing per card, chosen as the cheapest USD price.
That rule was picked for the optimiser's budget reasoning and is deliberately
written in three places that are verified to agree. Its visual consequence had
never been measured.

Measured 31 Aug 2026 over the 300 most played cards in Commander: **63 of them,
21%, are represented by a crossover printing.** Including the top three.

    #1    Sol Ring              Marvel Super Heroes Commander
    #3    Arcane Signet         Final Fantasy Commander
    #18   Rogue's Passage       The Hobbit Eternal
    #20   Cultivate             Marvel Super Heroes Commander
    #30   Heroic Intervention   Marvel Universe
    #89   Feed the Swarm        Avatar: The Last Airbender Eternal
    #96   City of Brass         Teenage Mutant Ninja Turtles Eternal

So the card search page draws Captain America on Arcane Signet and M.O.D.O.K. on
Skullclamp, and so does every deck list, every suggestion and every result
screen in the product. Against the standing instruction to judge this **as an
MTG enthusiast**, that is worth a decision rather than an assumption.

**NOT CHANGED, deliberately.** It is a product-identity call with two defensible
readings — the cheapest printing is the one you would actually buy, and the
iconic art is what a player pictures when they read the name — and it touches
the `cards_unique` ORDER BY, `comparePrintings()` in `source.ts` and the
optimiser's `cheaper()`, all three of which are checked against each other.

**And the rule cannot be "avoid crossover sets".** The One Ring is ranked 91 and
exists ONLY in Tales of Middle-earth; so do Feed the Swarm's Avatar printing's
siblings. The rule would have to be "prefer a non-crossover printing WHEN ONE
EXISTS", which is a third comparison in the same three places.

### The engine can say a card is BAD for a deck, and the pool stopped being fetched twice

Four things had to be true before anti-synergy could exist, and none of them did
on the morning of 31 Aug. The generator had put Soul-Guide Lantern - graveyard
hate - in a Meren deck and a Sheoldred deck.

1. **The compiler had to read the card.** "Exile all graveyards" had no rule,
   because a graveyard is a ZONE and the exile rule reads a phrase describing an
   OBJECT. WHO the exile hits is kept: "each opponent's graveyard" is asymmetric
   hate and belongs in a graveyard deck, and flattening the two would file
   Bojuka Bog as a mistake.
2. **The verb had to be split.** `ROLE_FACETS.removal` reads `eff:exile`, so
   reading these cards turned every piece of graveyard hate into an ANSWER,
   which is worse than not reading them. `eff:exile-graveyard` is its own verb.
3. **The effect had to carry its source zone.** A targeted exile hides the zone
   on the `TargetSpec`, so "exile target card from a graveyard" still read as
   removal. `Effect.exile.from` closes it.
4. **And the reserve had to refuse it.** The ranker's penalty was not enough:
   the reserved commander-fit pass ignores `score` BY DESIGN and took the card
   anyway, carrying a reason that said in so many words that it empties
   graveyards and the deck is built on using one.

`ATTACKS` in `behaviour.ts` holds ONE entry and that shape is deliberate.
Anti-synergy is not a theory the facet vocabulary can derive; it is a list of
measured facts of the form "this facet attacks that want". A second entry needs
a second measurement, not a second guess. `worksAgainstPlan` is the single
definition, because the ranker and the generator both ask and must not drift.

**AND THE POOL WAS FETCHED SIX TIMES LARGER THAN IT WAS USED.** Najeela failed
`WORKER_RESOURCE_LIMIT` three times in one evening, once after each engine
addition, and micro-optimising the additions was chasing the wrong thing:

    pool: 31,829 rows fetched in 3,047 ms of a 4,951 ms build
          ...then sliced to 5,000 and 26,829 discarded

The walk has been rank-ordered since 30 Aug, so its first N rows ARE the top N
by rank — exactly what the slice produces. Pushing `poolBudgetFor` down into
`fetchAll` is the same rows without the round trips.

    pool fetch    3,047 ms -> 768 ms,  31,829 rows -> 5,067
    whole build   4,951 ms -> 2,535 ms on the deployed function

Two memoisations are worth keeping for the same reason: one `planFit` and one
ROLE SET per card per build. `cardRole` is asked eight times per card by
`neediestRole` alone and again by three other passes.

**The facet memo is on COMPILER_VERSION 9.** (Was 8; see the 1 Sep section.)

### Still wrong, measured, and worth doing next

- **Six equipment in a Meren deck.** The `enhance` quota is too generous for a
  deck with no voltron plan; it should come off the commander's own wants rather
  than a floor.
- **The junk tail.** Popular Egotist (12,255), Blood Speaker (13,304), Gríma
  Wormtongue (9,186) still reach the deck. They fill roles nothing better fills.
- **164 of the top 2,000 produce no usable record**, which is the compiler's own
  work list. `scripts/unparsed-shapes.mjs` ranks it: modal "choose one" (17
  cards), shocklands (10, and a player CHOICE the runtime cannot offer at
  replacement time), "cast without paying its mana cost" (8), replacement
  doubling — Panharmonicon, Hardened Scales (8).
- **Anti-synergy is not modelled at all.** Soul-Guide Lantern is graveyard hate
  and the generator put it in a graveyard deck. Nothing scores a card as working
  AGAINST the plan.

---

## The coverage number is on a screen now, and it is worse than we said (31 Aug 2026)

Owner: *"Would be cool if admin section always showed live card coverage so I
can check and we can track easily"*, and *"in admin we need a list of all
archetypes, strategies and every single type of card definition across both
commanders, lands and other cards"*.

**`/admin` → Engine** leads with the whole catalogue, live, from
`public.engine_coverage()`. **`/admin` → Words** is every word the engine can
say about a card, from `public.engine_vocabulary()`, with counts split by lands
and legendary creatures, plus the ten roles and the eighteen shells drawn as
real cards.

**STANDING RULE: any change to what the engine reads must be visible on those
two screens in the same commit.** Every coverage figure this project has quoted
was a one-off over a different slice, which is how three sessions in a row
re-derived the same numbers and how two of them were misled by the same 12,000-
row cut.

The facet list on the Words screen is READ FROM THE DATABASE, never typed into
the component, so a facet a rule emits next week appears without anyone editing
a file. A word the engine says that the glossary has never heard of gets its own
heading rather than an "other" bucket: that row is new work nobody wrote down.

### The facet memo is on COMPILER_VERSION 8

Three pins, moved together, writer first: `facet-memo-fill`'s constant,
`public.facets(cards_unique)`, and `cards_pool`'s own join. Version 8 is the
`cost:` outlet split, `eff:exile-graveyard`, `eff:extra-land-drop`, and the
recursion and split-destination search rules.

**The 7 to 8 move was applied with `execute_sql` and left no file at all.**
Reconstructed from `pg_get_functiondef` and `pg_get_viewdef` as
`20260831200000_facet_compiler_version_eight.sql`, and four migrations that had
files but no recorded version are now recorded.

### The verification moved the number the wrong way, and it was right to

Eight agents attacked the "how much of a commander do we read" figure. What
survived:

- **`coverage = 'full'` never overstates.** Zero cards labelled full while
  carrying an unread clause, zero span-accounting failures across 8,155
  paragraphs, and a hand-read of 38 full commanders found zero misreads.
- **The reported 39.1% of commander ability lines producing nothing was too
  kind. It is 50%** (three instruments: 49.7%, 50.5%, 51.0%). The audit credits
  a line as read if it adds any facet, and `cares:sub:*` / `cares:type:*` come
  from a WORD SCAN over raw text, not from the compiler. Sram, Senior Edificer
  is refused as ambiguous, compiles to zero abilities, and was scored read
  because the words Aura, Equipment and Vehicle appear in his one line.
- **The middle bucket is nearly useless as a measure.** Every `manual` card
  reads 0% of its characters and every `full` card reads 100%, but `partial`
  spans **1.5% to 100%**. Adeline consumes nine characters of 176, the word
  "vigilance", and sits in the same bucket as a card whose only outstanding item
  is a human resolving a choice. The Engine screen says so on its face.
- **A card can report nothing unread and still be a black box.** A fragment
  inside a parsed ability compiles to a bare `manual()` marker and no work list
  prints those. Etali, Primal Storm has nothing unread and his entire effect is
  one. Ragavan's unread list names only "Dash {1}{R}" while both real effects
  are markers. **2,332 markers hold 158,505 characters**, and 841 of the 847
  cards blocked only by markers carry no hint at all.

Three character-level numbers, which is the measure to use from now on:

    14.6%   of printed commander text reaches something the engine can run
    33.1%   read structurally, then handed to a human
    51.7%   not read at all

### 100% is not the ceiling. 57.4% is, and the reason is structural

If every unread clause on every commander were read, **2,032 of 3,542 reach
full and 1,489 do not**, because they are blocked by a marker rather than by
unread text. 847 of those have nothing unread at all: **26.3% of the not-full
population is invisible to every work list we have**, `unparsed-shapes.mjs`
included.

| slice | full now | one clause away | blocked by a marker | ceiling |
|---|---|---|---|---|
| top 100 | 19 (19.0%) | 27 | 35 | 65 (65.0%) |
| top 400 | 44 (11.0%) | 100 | 159 | 241 (60.3%) |
| top 1,000 | 84 (8.4%) | 271 | 425 | 574 (57.4%) |
| all 3,542 | 318 (9.0%) | 1,004 | 1,489 | 2,032 (57.4%) |

**"1,004 commanders are one clause from full" is not a cheap win.** They are one
clause away EACH, and 692 of them are blocked by a shape no other card has.
About 88% of unread commander text is a sentence appearing exactly once: 2,629
unread clauses carry 2,415 distinct texts, and only 91 texts repeat at all.
Implementing all 91 reaches 11.2%.

Two structural refusals inside that 1,489, both correct: **148 commanders have a
real back face** and folding it into the front's ability list would grant
abilities the card does not have while front side up, and **21 vanilla legends**
can never be full because zero abilities returns `none`.

### And full coverage does not mean the card is usable

51 of the 318 full commanders carry no effect, counter, token, cost or mana
facet at all. Grand Arbiter Augustin IV compiles to three exact cost-modifying
statics and contributes nothing to deck building, because **cost reduction has
no facet**. Avacyn is read perfectly and plans as voltron, because the facet set
flattens her anthem into indestructible plus a global scope, which is the
Purphoros false positive again. **Reading the card and representing what it
wants are two different jobs and only the first has ever been counted.**

### Two measurement traps found the same night

**`count=exact` is a full scan and this project cannot afford one.** The admin
screen asked for it on `cards` and drew a dash instead of a number from the day
it shipped. `select count(*) from cards` measured **37,284 ms** with 47,348 heap
fetches, against a 3 s `statement_timeout`. `engine_sources()` reads the three
that can be exact from `cards_pool` in 73 ms and takes printings from the
planner, labelled "about".

**`ilike` cost 12x on a matview scan.** The same vocabulary query measured
**2,007 ms with two ILIKE per row and 172 ms with LIKE**. Type lines are cased
by Scryfall, so `like '%Land%'` is the correct match, not a shortcut.

---

## 1 Sep 2026 — the dictionary got a denominator, and the facet layer got a direction

Owner: *"the dictionary is 100000% complete for MTG"*, *"the word engine must 100%
read every single card automatically"*, and *"I refuse to launch until we are
100% on this system"*.

### The dictionary is measured against Wizards, not against memory

`public.mtg_vocabulary` holds all **885** things Magic officially names, seeded
from Scryfall's catalog endpoints, which are the lists Wizards maintains:

    keyword-abilities   223     creature-types      350
    keyword-actions      79     planeswalker-types   99
    ability-words        69     artifact-types       20
    land-types           18     enchantment-types    13
    supertypes            7     spell-types           6
    battle-types          1

`public.dictionary_coverage()` joins that against what the engine actually
emits over every card, and `/admin` → Words shows it. **95.5%, 823 of 885.**
It GROWS ON ITS OWN: a keyword from a set released next month appears unread
without anybody remembering to look.

**The honest ceiling is about 97-98%, not 100%,** and the residue is not card
vocabulary. 20 creature types (Germ, Servo, Orb, Balloon) plus the Token
supertype appear on ZERO card type lines and exist only on tokens. "Activate",
"Reveal" and "Play" are rules-speak Scryfall files as keyword actions. Dungeon
is AFR, not a planeswalker. Closing those by loosening the check would be
padding the number.

### Five fixes, all catalogue-wide, all found by measuring

| what was wrong | cards |
|---|---:|
| `readTypeLine` did `split('//')[0]` and threw the back face away | 851 |
| `parseObject` stripped "another" only AFTER "target", so the phrase refused | 416 |
| the facet layer never read `effect.who` | 574 misfiled |
| Scryfall's own `keywords` array was never read | 16,507 carry one |
| the ability word was stripped for parsing and then discarded | 193+ |
| "exile X, THEN return it" had no rule while the delayed wording did | 47 |

### `effect.who` was never read, and it is the biggest one

**The word "controller" appeared ZERO times in
`src/lib/deck/recommend/behaviour.ts`,** and `who` is a mandatory field on
nineteen verbs, present on 9,202 of 9,202 emissions. Every effect was recorded
as though aimed at an opponent. 574 cards held a role SOLELY because of it:

    Teferi's Protection (109)    removal      -> protection
    Eerie Interlude (956)        removal      -> protection
    Talisman of Dominance (93)   ramp,removal -> ramp        (1 damage to YOU)
    Faithless Looting (97)       interaction  -> draw
    Temple Bell (1899)           draw         -> none        (group hug)
    Massacre Wurm (513)          enhance      -> removal     (mass minus-N)

**A SEPARATE VERB, NOT A QUALIFIER.** A role check asks whether a card carries
ONE facet, so an `aims:self` facet alongside `eff:exile` would change nothing
because nothing would consult it. Same precedent as `eff:exile-graveyard`. The
new verbs: `eff:exile-own` 156, `eff:shrink` 306, `eff:discard-self` 275,
`eff:tap-own` 91, `eff:damage-self` 86, `eff:draw-each` 30, `eff:destroy-own`
20.

**A TARGET SAYS WHOSE IT IS ON THE `TargetSpec`, NOT ON THE SELECTOR.** "Exile
any number of target creatures you control" compiles to `{sel:'target',ref:0}`
with "you control" on `targets[0].controller`. Seven of eight test cards moved
on the first pass and Eerie Interlude did not; that is what found the missing
ref lookup. UNKNOWN STAYS UNKNOWN: guessing "opponent" is what produced the
574, and guessing "you" would strip removal off the whole format.

### The route to reading every card. There is no ceiling

    Read completely             10,523   32.2%
    Blocked by unread clauses   13,753   42.1%   write a RULE
    Blocked by markers only      6,197   19.0%   extend the DSL
    Blocked by both              2,205    6.7%
    No clause found                  7    0.0%

    rules alone -> 74.3%    DSL alone -> 51.2%    both -> 100.0%

The 57.4% ceiling reported on 31 Aug was wrong twice over: measured over
COMMANDERS only, and treating a marker as a wall. **A marker is not a wall, it
is a DSL member nobody has written.** `scripts/probe/route-to-full.mjs`.

**XMAGE DOES NOT HELP WITH THE GAP.** `XMAGE_LOWERED` has records for **69.7%
of the cards we already read completely and 0.6% of the ones we do not**. Only
7,392 of its 32,168 records lower at all, and the 24,627 blocked ones are
precisely the hard cards. The XMage route runs through 9,965 unwritten class
lowerings before it reaches one new card. Do not put it first again.

**THE TAIL IS THE PROBLEM.** 10,399 distinct unread shapes, top 14 cover 7.5%
of instances. 5,429 marker shapes, top 14 cover 12.6%. There is no small set of
big wins left; there are roughly 15,800 independent, individually verifiable
pieces of work.

### The instrument lied five times in one day, and once in the flattering direction

`scripts/probe/dictionary-gap.mjs` was wrong five ways before it was right:

1. hyphenated every facet, so it looked for `kw:first-strike` while the engine
   emits `kw:first strike` WITH A SPACE. Reported First strike (794 cards) and
   Double strike (296) as gaps.
2. checked one prefix per catalog, so Army, Servo, Blood and Role read as
   missing while the engine said `tok:servo` and `tok:blood` quite happily.
3. stripped apostrophes the engine keeps: `kw:doctor's companion`, `sub:urza's`,
   `sub:c'tan`.
4. matched "does any card print this" by SUBSTRING, so "Vote" matched "devote"
   and "Play" reported 5,230 cards against a real 482.
5. **and then a literal backspace byte got written into the word-boundary
   regex, it matched nothing, every gap was reclassified as "on no card", and
   the report printed 100.0%.**

Four of the five made the engine look worse than it is. The fifth made it look
perfect. **A number that reaches 100% immediately after somebody touches the
instrument is a symptom, not a result.**

### Two database findings

**`cards_missing_facets` read every card to find out which cards to read.** A
version 9 refill could not write a single row at batch 1000, 400 or 150 alike,
which is the clue: the cost was not in how many rows came back.

    anti-join, ids only               12 ms    index-only, Heap Fetches 0
    fat columns, no anti-join        679 ms      408 buffers
    anti-join AND fat columns      4,954 ms   13,457 buffers
    after splitting them           1,496 ms    4,764 buffers

`MATERIALIZED` on the CTE is load-bearing, not a hint: without it Postgres may
inline it and rebuild exactly the plan being avoided.

**`service_role` cannot be given its own `statement_timeout`.** It is a
reserved role and only a superuser may alter it, so it inherits
`authenticator`'s 8 s. That is the right outcome: 8 s is a page-view budget and
a batch job should be made cheap rather than handed a longer rope.

### Regenerate is the fourth deliberate refusal, and the reasoning generalises

273 cards, and **208 of them have the regenerate clause as the ONLY thing
between them and `coverage: 'full'`** — the largest single-shape cluster in the
catalogue, worth about +2%. It is still refused, and the argument is worth
reusing:

- **The verb already exists.** `RegenerateEffect`, `regenerateShield` and
  `regenerate` in `HandledDo` all shipped. Vocabulary is not the blocker.
- **Nothing spends the shield.** `sba.ts` does not, so compiling it would
  publish `{B}: Regenerate this creature` as a real activated ability, take the
  player's mana, place a counter nothing reads, and let the creature die.
- **Deck building is already served.** `tagger.ts` tags `regenerate target` as
  `protection` on exactly the 54 cards where that role is true.
- **Play mode is already honest.** `computeAutomation` reports Drudge Skeletons
  as `needsManual` with the clause quoted.

So the whole prize is a coverage number, and paying for it costs 177 creatures
whose only ability becomes a button that does nothing. Same shape as the
shocklands: **half of that fix is worse than none of it.**

### Syr Vondam is a standing regression test

He is in `scripts/generator-roster.mjs` with the whole chain written into his
entry, because he exposed the direction fault. His plan correctly said *"is
also paid when your own creatures are exiled, which is what blinking them
does"*, then asked for `eff:move-zone`, which no blink card carries, and
`eff:exile` at 0.45, which every removal spell carries. That is why his deck
filled with Swords to Plowshares.

**A blink deck for him should still be aristocrats and counters too.** His plan
wants `cost:sacrifice` 0.90, `trig:dies` 0.85, `eff:exile-own` 0.85,
`ctr:+1/+1` 0.80 all at once, and that is correct: he is paid when creatures
die OR are exiled, and he grows with counters. The bug was never that removal
is bad, it was that removal was being counted as synergy.

`scripts/probe/vondam-benchmark.json` holds two human-built decks the owner
linked, CARD NAMES ONLY, as a scoring target. **CLAUDE.md ruling Moxfield out
as a DATA SOURCE still stands.** Two pages a person pointed at, read once, to
score ourselves against. Do not write a scraper.

---

## 2 Sep 2026 — the community read the cards, and the generator learned to say no

Owner: *"Need to ensure the entire card catalogue is fully mapped and dictionary
updated"*, then *"I generated a syr vondom sunstar deck and it was nothing like
the 2 examples"*, and *"this should be universal for every commander whatever
the fix is"*.

### Scryfall Tagger is merged, under a gate, in `cards_pool` and nowhere else

`tag_facet_map` turns Tagger's community tags into our facet vocabulary. 723
mappings, 289 of them `gated`. Two rules, and they are not one rule:

    gated        applied to EVERY card carrying the tag
    the rest     ONLY where our compiler produced no verb at all

Scored against a 374-word answer key written by two readers who saw none of the
contenders: compiler alone 86.7% precision / 48.7% recall; the whole mapping
merged in 83.5% / 75.7% (**FAILS**); gated only 86.9% / 67.1%; gated plus
everything where the compiler is silent 86.3% / 72.5% (**shipped**). The naive
union fails because both sources' errors compound. 85% is the bar because these
facets put cards into ROLES and a wrong one spends a real deck slot.

**The merge is in the VIEW, never in `card_facet_memo`.** The memo holds what our
compiler derived from a parsed record; writing a person's reading into it would
destroy the one property that makes the compiler improvable. `compiler_facets`
and `tag_facets` are separate columns so any row can be taken apart and the whole
merge reverted by changing one expression.

    the app knows what a card does    97.2%   32,111 of 33,032
    Tagger was the ONLY source        28.5%   9,427 cards

### Eight samples make a reader systematically too harsh

All 196 gated mappings were audited, and every proposed change re-checked by a
second reader who pulled the WHOLE tag. **34 of 62 verdicts were overturned,
nearly all toward keeping.** Eight cards show you a mapping's exceptions and hide
the eight hundred it gets right. Ungating `burn-player` would have withheld a
correct `eff:damage` from 364 cards, Boros Charm among them, to avoid six
unplayable ones.

Read the whole tag. Do not judge a mapping from a sample.

### The dictionary grew 26 words and every one was asked for by a card

Three triage rounds over 973 tags: 346 became mappings, 573 were correctly
refused as shape, flavour or too-broad. **67 refusals carried the same note: the
tag is real and uniform and the engine has no word.** Those are the words.

`eff:reduce-cost` — Ghalta (461) carried NO facet at all, her whole card being a
cost reduction. `eff:cant-cast` — Silence (407), whose entire text produced
nothing. `eff:cant-block` / `eff:cant-attack` — Pacifism carried no facet, served
no role, and could be chosen by nothing; the DSL had modelled both restrictions
since it was written and the facet layer read exactly one, `max-lands-per-turn`.
`eff:copy` — seven readers asked for it independently, the strongest signal in
the run.

**A word with no consumer is decoration**, so eleven went into roles in the same
commit. And check every new word against the pool afterwards:
`eff:play-from-graveyard` was declared, wired into `ramp`, and fed by NOTHING —
the fifth instance of that shape. So was `eff:extra-combat`, sitting in `wincon`
since the role was written while the generator kept reporting it could not fill
wincon.

### A commander with two strategies got the one with more cards

Vondam is paid when your creatures die OR are exiled. His deck came back 67% on
theme with every themed card in the aristocrats half and zero blink.

`planFit` is a NOISY-OR, so a card matching sacrifice + dies + create-token
scores 0.90 while Cloudshift, matching the one facet that IS the other strategy,
scores 0.868. Black holds hundreds of aristocrats cards against about twenty
white blink cards, so **the bigger pool wins every slot** — and the reserve,
ordered by want WEIGHT, then spent its slots on the half already covered.

The reserve spends on what the deck HAS NOT GOT. A want's urgency is how far
short of a target it is, seeded from what the quota loop picked, target
proportional to weight. Dividing by cards-already-serving was tried first and is
wrong-shaped: it makes the second card for a want worth half the first, so the
reserve spread one card across eight wants and blink came out as a single
Ephemerate. The budget scales with loud wants, capped at 16 so the floors keep a
working majority.

### A card ranked 10,744 is not a better answer than one ranked 12

22 cards past rank 15,000 reached a deck, and Swiftfoot Boots and Lightning
Greaves were missing from five of seven. Same fact: Oathkeeper, Takeno's Daisho
(10,744) takes the protection slot because it carries one facet the commander
asked for and Boots carries none.

**Lowering `EMPTY_DECK_COMMANDER_FIT` was the obvious fix and is REJECTED**, with
`scripts/probe/fit-weight-sweep.mjs`: every value below 3.6 buys staples and pays
in keyed synergy, 72% to 68%. `fit-reserve-grid.mjs` tested raising the reserve
cap to compensate — 16, 22 and 28 measure IDENTICALLY, because these commanders
never reach the cap. No free lunch on that axis, and trading theme away is the
opposite of what was asked for.

`PLAYED_ENOUGH_RANK = 12_000` has one, because it separates "does this card do
the job" from "is this card any good", which the score conflates. **Not a ban:**
`playedFirst` is a two-pass fill, so a role a narrow colour cannot otherwise fill
still gets filled. Measured at 8,000 / 12,000 / 20,000; the other two cost keyed
synergy or give a staple back.

    past rank 15,000, 14 DEPLOYED decks      16 -> 0

### Blinking yourself is not blinking your board

Widening the blink rule (compiler 11) gave 14 cards `eff:exile-own`, every one
correctly a blink of something, ZERO lost — and Vondam's archetype score FELL
6/60 to 4/60, deterministically. **Better reading, worse deck.**

Most of the 14 were transforming Praetors and Dominants: "Exile Urabrask, then
return it transformed". That is a blink of ITSELF, and Vondam is paid when
ANOTHER creature you control is exiled. `eff:exile-self` is a separate verb, on
the precedent of `cost:sacrifice-self` and the whole `effect.who` split.

> **Teferi's Protection is rank 109 and its ONLY compiled effect is
> `{do:'exile', what:{sel:'self'}}`** — taken from the card's own cleanup line.
> Its real protection is the phasing clause, which the compiler does not read at
> all. It held the `protection` role by ACCIDENT and keeps it only through its
> `protection` tag and the tag fallback. Scryfall's `phasing` tag is deliberately
> NOT mapped: over all 68 members only 35% clearly phase out YOUR permanents, and
> the rest would put removal spells in protection slots.

### The instruments broke the same way twice, and it is the pool getting fatter

`engine_knowledge()` and `unmapped_tag_worklist()` both classified all 33,032
cards per call by unnesting facets and running a regex per element. Affordable at
compiler-only length, a **57014 timeout** once Tagger's words lengthened the
arrays — and an admin screen that draws nothing is the exact failure the screen
exists to prevent. `knowledge_band` is a column computed at refresh with an index
on it; the function is a GROUP BY and answers in 0.42 s.

### Numbers to compare against, all measured 2 Sep 2026

    catalogue, app knows what it does     97.2%   (was 64.2%)
    still blind                             921   27 of them in the top 2,000
    dictionary_coverage()                  85.0%  752 of 885

> **CLAUDE.md recorded 95.5% for `dictionary_coverage()` on 1 Sep and it reads
> 85.0% now.** I could not reconcile it: the older `card_facet_memo` versions
> were deleted when the readers moved to compiler 12. The 133 unread words are
> structural — 66 are "keyword-actions", which is Scryfall filing rules-speak
> like Activate and Reveal, and most of the rest are token-only types (Blood,
> Gold, Map) and obscure ability words (Kinfall, Landship). Nothing this session
> changed appears in the list. Treat 85.0% as the honest figure from the function
> and re-derive rather than trusting either number.

    seven local decks    keyed 70%, staples 45/61, past-15k 4
    fourteen deployed    100 cards 14/14, staples 63/94, past-15k 0
    Syr Vondam           archetype 1/60 -> 6/60 against the two human decks

### Still wrong, named, and neither is a tuning job

- **Two-card synergy is not expressible.** "Wall of Omens is good BECAUSE this
  deck has Conjurer's Closet" cannot be said: the ranker scores cards one at a
  time. That is why Vondam gets blink SPELLS (3/13) and not blink ENGINES (2/17)
  or the creatures worth blinking (1/30).
- **Swiftfoot Boots still loses its slot**, and the rank floor does not help
  because Boots is rank 12. It loses to themed cards under the floor. The
  popularity decay is `1 - ln(rank)/ln(25000)`, so rank 12 scores only twice rank
  500 while appearing in an order of magnitude more decks — but that curve is
  shared with the optimiser and must not be changed on a hunch.

---

## 3 Sep 2026 — the deck reviews itself, and twenty commanders are the yardstick

Owner: *"The decks being built still are nowhere near good enough for a
published app… compare against at least 1 strategy deck for each colour -
roughly 20… I'm not confident we are utilising the dictionary properly during
generation. It doesn't seem like the system is even reviewing the deck as it
spurts all cards out at once."* And later: *"sol ring should be in every deck -
its a staple no deck can live without."*

### The instruments, so nobody re-derives them

    scripts/probe/commander-benchmark.json   20 commanders, one per strategy and colour,
                                             each with 3-4 JOBS a human list does and a floor
    LOCAL=1 node --experimental-strip-types scripts/probe/commander-bench.mjs
                                             "jobs done" and "groups the deck cannot do AT ALL"
    SHOW=1 node --experimental-strip-types scripts/generator-synergy-audit.mjs
                                             the 7-deck roster: keyed %, staples, past-15k
    node --experimental-strip-types scripts/deployed-deck-sweep.mjs
                                             14 decks against the DEPLOYED function
    scratch/_plan1.mjs "<name>" …            every want of a commander with its weight and why
    scratch/_trace.mjs "<card>" …            coverage, abilities, unparsed clauses, facets

**`npx tsc -p tsconfig.json` has never type-checked anything.** It has
`files: []` and only references. `tsconfig.app.json` is the one that checks
`src/`, and it found two real errors the day this was noticed. Use it.

**A job group at zero is measured by the benchmark's own card lists**, which
are typed from knowledge, not scraped. Moxfield and EDHREC remain off-limits
as data sources.

### Where the numbers stand

    twenty commanders    jobs done 15/71 -> 18/71    groups at zero 28 -> 20
    seven-deck roster    staples 40/61 -> 46/61      keyed 72% -> 68%
    Sol Ring             in 7 of 7                   Boots/Greaves in 6 of 7
    fourteen deployed    14/14 build, 77/94 staples, 2 cards past 15k, Najeela 5.2 s

The keyed drop is the price of the staples: a themed card at fit 0.5 used to
beat Swiftfoot Boots at fit 0 every time, and now it does not always.

### What was wrong, in the order it was found

**Two of three zero groups were discovery, not reading.** Llanowar Elves,
Viscera Seer, Windfall and Curiosity were all read correctly at v13; the
generator could not reach them. So most of the day was the generator.

**A counter the card puts on ITSELF read as a counters deck.** Korvold and
Animar both "put a +1/+1 counter on ~" and both planned as Hardened Scales
decks. `eff:add-counters-self` / `ctr:+1/+1-self` are separate words, on the
precedent of `cost:sacrifice-self`. A counter on the PLAYER (experience,
energy) is quietened the same way: Meren's experience counters were her only
loud wants, so every shell was judged against them.

**Whose trigger, which spell.** `trig:cast:creature` and
`trig:cast:targeting` name what a cast trigger listens for. The day the
compiler read Chulane whole, the English rule that gave him his creature
want was skipped (correctly: English must not talk over a parsed record) and
the parsed record had no rule keyed on it. **Reading a commander whole can
make its plan worse if the facet rules lag the intent rules.** Every intent
rule that matters should have a facet-keyed twin.

**Size and cost are facets now.** `mv:cheap` (≤2, nonland), `mv:big` (≥6),
`pt:big` (power ≥5), read off the row. Yuriko's "cheap evasive creature",
Xenagos's "body worth doubling" and Kinnan's "big non-Human" were not
sayable before.

**A shell must serve what the commander shouts for.** The cosine ranks shells
and was being used to admit them. A shell is admissible only when one of the
commander's loud wants (≥0.8, else the three loudest) is a facet the shell
wants. Giada's Counters shell at 0.68 was filling an Angel deck with
Stonecoil Serpent; no score floor separated the cases, this does. A tribe is
a shell before it is a score: the Tribal shell goes first and the tribe
itself is a package the caller states (`extraPackages`), FIRST in the pass.
A -1/-1 commander never gets the Counters shell.

**The review rounds must know what the deck already has.** `planFit` is
deck-blind: a want at 0.9 scores 0.9 on the thirty-fifth rock. Kinnan's
review rounds swapped Craterhoof and Avenger of Zendikar OUT for Bobbleheads,
each swap explained by the commander wanting mana. The rounds and the flex
pass now score against `withUrgency(plan, picked)`: each want scaled by its
shortfall against weight × 30, floored at 0.35. **Thirty, not the reserve's
ten** — at ten, Krenko's eleventh Goblin went out for Sol Ring and keyed fell
to 64%. A swap may not take a role below its floor.

**No role runs past twice its target plus four, in ANY pass, counted by the
cards that carry the role.** The first version guarded the flex pass only,
and Kinnan still came out with 41 ramp pieces against 10 asked for, because
the creature floor filled with mana dorks: a dork carries the loudest want
and the creature role, and nothing counted it as ramp. The Consistency line
on the generator page said "41 ramp out of the 10 you want" in plain words.
The commander's tribe is exempt (thirty mana Elves are the plan). Kinnan is
23 mana sources now.

**Sol Ring and Arcane Signet are preferred by name** in every Commander
build: taken first, never cut, and the deck says so. Chulane's used to arrive
in review round three.

**Every creature commander wants to survive.** `grants:hexproof` 0.5,
`grants:shroud` 0.45, `grants:indestructible` 0.4, `grants:haste` 0.3 on
every creature commander's plan. No rules text says "and I would like to
live", so no plan ever asked for Boots.

**A package may ask for creatures.** `type:creature` is in `PLAN_IGNORED`,
and the exception for creature-dominated packages was tested AFTER the ignore
check, so it never ran. Found with a four-creature synthetic package.

**Prosper was Mystic tribal.** "Mystic Arcanum —" is an ability word. The
word scans skip a subtype that is the start of one.

### The eight compiler rules, and how they were merged

A workflow wrote eight rules in eight worktrees; every adversarial verifier
died on the spend limit, so the diffs were applied by hand with `git apply
--3way`, vendored copies and the census excluded. Four tests then disagreed
only because pairs of rules both fire on the same card (Edgar's eminence line
reads, so his attack trigger is no longer the first ability; "Edgar" folds to
`~`; Kinnan is whole; "mana value X or less" is the cast X). The merged
truth won each time. `scripts/_fixdiff.mjs` recounts a hunk header a JSON
round trip corrupted. Census after: read whole card 10,469 → 10,785.

### Facet memo is on COMPILER_VERSION 14

Migration `20260903181623_facet_compiler_version_fourteen`. Version 13
deleted after the pool was verified. `eff:wheel` reaches the pool through the
Tagger map (`wheel-symmetrical`, `wheel-symmetrical-optional`); the compiler
does not read "each player discards their hand, then draws seven" yet.
`trig:cast:targeting` is emitted by the facet layer and reaches the pool at
the NEXT version.

### Still wrong, measured

- ~~Najeela (five colours) failed `WORKER_RESOURCE_LIMIT` on the deployed
  function.~~ The review rounds ranked the whole 1,500-card shortlist four
  times: 1,451 of 1,513 ms. They re-score the first five hundred now (248 ms,
  the same eleven swaps) and stop past 900 ms. **Any pass added to the
  generator must be timed on a five-colour build before it is deployed**; the
  build log carries `review rounds took N ms` for exactly this.
- Twenty job groups at zero; most are compiler shapes (own-bounce, impulse
  draw, pump-by-power, protection of your choice, wheels, "unless that player
  pays", "without paying its mana cost") — the second workflow round.
- Keyed synergy 67% against 72% before the staples came in.

### The second workflow round, and the memo is on COMPILER 16

Seven more shapes, written in seven worktrees and merged by hand because
every adversarial verifier died on the spend limit for the second time:
own-bounce, impulse draw, a pump sized by a creature's power, protection
from a colour chosen on resolution, the wheel, "unless that player pays",
and "cast without paying its mana cost". Suite 3,249 to 3,337, none failing.

    read the whole card    10,469 -> 10,988      unread clauses  21,839 -> 20,799

**`eff:bounce-own` had to be narrowed the same day it landed.** 182 cards in
Chulane's colours carried it and the ranker reached Rancor (829), Spine of
Ish Sah and Batterskull first, because those return THEMSELVES and are not
creatures. His "bounce your own creatures" job stayed at zero with the facet
in place and his plan asking for it at 0.6. A creature returning itself still
counts: Whitemane Lion's own re-entry IS the recast. Compiler 16 is that one
narrowing, and nothing else.

**Four staples are named, not ranked.** Sol Ring and Arcane Signet in every
Commander deck; Lightning Greaves and Swiftfoot Boots too when the commander
is a creature. Ranks 1, 3, 12 and 20, all colourless. The plan already wanted
what Boots and Greaves grant and they still lost four of seven decks, because
a card matching the strategy at fit 0.5 beats a card matching it at 0.
Staples 40/61 to 51/61 on the roster.

> **The first version read `input.commander.typeLine`, which is EMPTY on the
> path the generator is actually called through:** the plan reads its type
> line from the catalogue row and that object does not carry one. The test was
> false for every commander and named nothing, silently. It reads the
> `type:creature` FACET now. **Read the note the pass writes into the build
> log before believing it ran** — that is what caught it.

### Najeela fails on the edge worker again, and the pool size is not why

She passed at 5.2 s once the review rounds were bounded, and returned
`WORKER_RESOURCE_LIMIT` once compiler 15 and 16 put facets on 1,016 more
cards. **A 4,000-card five-colour pool was tried and measured: it failed at
8.0 s exactly as 5,000 does**, so the cost is per-card facet work rather than
the fetch, and narrowing the pool only narrows the deck. Left at 5,000 for
somebody who profiles the worker instead of guessing. 13 of 14 deployed decks
build, 75/85 staples, 1 card past rank 15,000.

### Similar cards: the tie-break moved, the metric did not

`CardRelated` never fetched `edhrec_rank`, so the ranker's last tie-break
compared undefined and fell through to price DESCENDING. It breaks on how
many decks play the card now.

**A metric change was tried and REVERTED, and the measurement is the point.**
`behaviourSimilarity` is a weighted Jaccard, so a card carrying FEWER facets
has a smaller union and scores higher, and a card the compiler could not
finish reading carries fewer facets for the worst possible reason. Against
Swiftfoot Boots: Vorrac Battlehorns (rank 5,935, record incomplete) 0.844,
Lavaspur Boots (1,500, incomplete) 0.844, Lightning Greaves (13, complete)
0.783. Demoting incomplete records to their own tier put Greaves second and
then took Mystic Remora (99, also incomplete) off Rhystic Study's list, which
is the right answer for that card, and broke two tests. One bias for another.
**Fixing it needs an answer key over many subjects, the way the deck side
has one. Do not tune it against one card.**

### Where the twenty commanders stand

    jobs done          15/71 -> 18/71
    groups at zero     28 -> 21
    roster keyed       72% -> 66%      staples 40/61 -> 51/61
    past rank 15,000   0 on all twenty

The keyed drop is the price of the staples, and it is the trade the owner
asked for: *"sol ring should be in every deck - its a staple no deck can live
without."*

Nine groups still at zero are the same shape: the compiler reads the cards
and the generator does not reach them. Yuriko's cheap evasive creatures,
Feather's cantrips, Kinnan's untappers, Animar's colourless fatties. That is
ranking and slot policy, not vocabulary, and it is the next piece of work.

---

## The yardstick was in the database all along (3 Sep 2026)

Owner: *"We should be getting similar results to them."* Nothing measured
that, because we had no THEM. Every instrument in this repo scored a deck
against something we wrote: role floors we chose, a benchmark whose job lists
were typed from knowledge.

**`meta_decks` holds 192 real Commander decklists** (MTGJSON, MIT, ingested
19 Aug and never read by anything). They are precons, so matching them is a
FLOOR rather than a ceiling: it says our decks are shaped like real decks, not
that they are good ones. It is still the only external evidence in the repo.

### Two instruments, and the trap between them

    scripts/probe/real-deck-roles.mjs    runs OUR cardRole over THEIR decklists,
                                         writes real-deck-roles.json (p10/p50/p90)
    scripts/probe/deck-shape-check.mjs   builds the 20 benchmark commanders and
                                         reports every role outside the real range

**ROLES, NOT TAGS.** The first version of the checker compared our role fill
against their TAG counts and reported ramp as wrong on 16 of 20 decks, because
the ramp TAG has a median of 9 and the ramp ROLE has a median of 16. Two
vocabularies, one subtraction, and the difference called a fault. Both sides
must be the same question asked the same way.

**And filter to Commander.** `meta_deck_cards` holds all 873 ingested decks,
681 of them 60-card lists. The unfiltered read reported a median of 3 ramp and
a tenth percentile of 18 lands: the shape of a Standard deck, used as the
yardstick for a Commander one.

### What a real Commander deck holds, in our own role vocabulary

    role          p10   p50   p90   max
    ramp           11    16    21    31
    draw           11    17    24    43
    removal         9    13    20    33
    interaction     1     4     8    13
    tutor           0     0     2    12
    enhance         1     5    12    32
    protection      0     1     5    10
    wincon          0     0     2    16
    land           37    38    40    44
    creature       22    29    37    45

Roles overlap - a mana dork is ramp AND creature - so these sum past 99. Both
sides of every comparison carry the same overlap.

### 41% -> 70% of role checks inside the real range

Four faults, none of them commander variance:

**Xenagos took 49 lands in a 99-card deck.** The land solver maximises
castability against an absurdity guard that was HALF THE DECK. It is the real
p90 (40) now: the decks the guard catches are the ones whose castability curve
never peaked, which have a pool problem the mana base cannot fix, and the 41st
land makes them worse. A deck that genuinely wants 41 reaches it through the
peak rather than through the guard. Decks outside the real land range: 11 -> 2.

**The derived floors asked for four tutors and four win conditions**, where
the real median for both is ZERO. A hypergeometric answers "how many copies to
have drawn one by the turn it matters" and real decks decline to pay it: a
tutor you have not drawn costs nothing and a tutor slot costs a card. Floors
are clamped to p90 now. The wide roles are untouched - their derived floors
already sit below p90 - so the clamp only bites where the arithmetic asked for
something no deck runs.

**The role ceiling was `target * 2 + 4`**, which let Prosper reach 47 ramp
against a real p90 of 21. It is p90 now (`roleCeilingFor`), and it is checked
in EVERY pass that picks a card by score rather than in two of them: the
commander-fit reserve, the package fill, the floor fills, the short-role
backfill and the review swap all consult it. A reserved slot may ignore the
QUOTA - that is its purpose - but not an absurdity ceiling.

**The role-count cache was keyed on `picked.length`**, and the review rounds
replace a card IN PLACE, so the length never moved and the cache answered with
the roles of a card no longer in the deck. It is keyed on a mutation stamp.

### A cost reducer is not a mana source

`ROLE_TAGS.ramp` held `cost-reduction`, which claimed 156 cards as ramp; 156
of the 157 had no other ramp tag. Animar came back with 29 ramp pieces of
which eleven were **Dragonlord's Servant, Dragonspeaker Shaman and Goblin
Warchief** - cost reducers for tribes the deck does not play, which are blank
cards. A cost reducer's value depends on the deck and the role system is
deck-independent, so claiming it as ramp is wrong in general. Animar's ramp is
16 real mana sources now.

**The shape metric barely saw this fix (65% -> 66%) and the deck got much
better.** A metric that counts cards cannot see that eleven of them were
blank. Read the list.

### Where it stands

    shape (200 role checks)   81/200 -> 139/200   41% -> 70%
    twenty commanders         18/71 jobs -> 21/71
    seven-deck roster         keyed 67%, staples 51/61
    tests                     3,337 passing

**Regression, measured and NOT fixed.** Kozilek went from 3 cards past EDHREC
rank 15,000 to 8. Freed land slots in a narrow pool are filled by unplayed
cards, because `playedFirst` is a two-pass fill whose own comment says it must
"degrade to take it anyway rather than to a deck that is short". His pool is
not exhausted - 1,063 colourless cards rank under 12,000 - so the fringe cards
are filling NARROW ROLES (protection, wincon) that the played pool cannot
serve. Fixing it means letting a role go short, which reverses a deliberate
decision and wants measuring first.

### What is still structurally missing

1. **The plan is a mood, not a shopping list.** A commander's plan is a flat
   list of weighted facets and `planFit` is a noisy-OR over it, so it can say
   "this card is on-theme" and can never say "I need six of these and I have
   two". Only the ten generic roles have counts. That mismatch is why nine job
   groups sit at zero while the compiler reads every card in them perfectly.
2. **Cards are scored one at a time**, so "Wall of Omens is good BECAUSE this
   deck runs Conjurer's Closet" cannot be expressed. `meta_card_pairs` holds
   24,165 measured co-occurrences and nothing reads it.
3. **The yardstick is global.** 192 decks pooled together give ranges wide
   enough that only faults true of every commander show up. Per-strategy
   expectations need the decks bucketed by archetype first.

---

## 3 Sep 2026, later — the combos, and four controls that did nothing

Owner: *"this card works, because the deck contains other cards that combo
with it, including win condition combos, also important."* And: *"we dont use
AI for any of the app, all the engine so the options shouldnt call llms it
should use engine always."* And: *"the deck generator UI - there are a few
additional options, do they actually do anything or are there filters we are
missing?"*

### Four of the generator's controls reached nothing

Measured against the deployed function, not read off the page:

    prioritizeSynergy   ZERO mentions in the whole edge function
    includeLands        ZERO mentions
    powerLevel          reached ONE place: the language model's prompt
    customPrompt        the same

The page's toggles read "Prioritise synergy - Weight cards that talk to the
commander" and "Include manabase - Build the lands as well as the spells", and
neither promise was kept. The power slider changed nothing about the deck at
any setting, because the only thing downstream of it was a model whose gateway
is out of credits.

All three now reach the engine. `prioritizeSynergy` off drops the
commander-fit weight to the ranker's own default. `includeLands` off sets the
land target to zero AND stops `allocateBasics` padding to 99 with Islands -
which is what it did before, so the toggle built a mana base either way. A
pool that cannot find 99 spells reports a shortfall instead.

### There is no language model in the deck generator

Removed: `planFromShortlist` and its gateway call, `shortlistFor`, the second
`generateDeck` that re-ran the build with the model's picks, the
`DeckPlan`/`PlanInput` types, and the `LOVABLE_API_KEY` read in `index.ts`.

What it did was re-rank the engine's own shortlist and it could only return
oracle ids already on that list, so at its best it reordered the engine's
answer. It had been dead in production for long enough that every request
already fell through to the baseline deck.

> ⚠️ **A `plan` reference survived in the response object and 3,337 TESTS DID
> NOT SEE IT.** The function was deployed and answered every live request with
> `ReferenceError: plan is not defined`. Every test under `src/engine`
> exercises the pure engine; `build()` lives in `supabase/functions` and
> nothing had ever called it. `src/engine/build/pipeline-smoke.test.ts` calls
> it now against a fake catalogue. It asserts only that the thing returns and
> carries the fields the client destructures - deck QUALITY is a claim about
> 33,000 real cards and belongs in `scripts/probe/`.

### The engine knows which cards combo

`meta_combos` had held 61,130 commander-legal Commander Spellbook combos since
19 August and **nothing had ever read them**. `public.combo_pool` aggregates
them one row per combo with the pieces as an array - status OK, no templates,
two to four cards - giving 56,240 rows indexed on colour identity.

    catalog.combosFor(identity)   one containment test, top 400 by popularity
    BuildInput.combos             the engine is pure, so the caller fetches

The pieces go in as PREFERRED, which already means taken first, never cut by a
review round, exempt from the role ceiling. A combo half is a dead card, so
the unit has to survive every later pass, and that is exactly the treatment
Sol Ring gets.

**CHOSEN BY FIT, THEN POPULARITY.** Ordering on popularity alone gave Meren of
Clan Nel Toth - a sacrifice commander - Sanguine Bond + Exquisite Blood,
because that is the most played combo in black and green. Legal, wins the
game, nothing to do with her, and both halves are blanks until both are drawn.

    Meren     Cauldron of Essence + Warren Soultrader + Chatterfang
    Krenko    Kiki-Jiki, Mirror Breaker + Zealous Conscripts
    Talrand   Twinning Staff + Narset's Reversal

**Gated on power**, which is what finally gives that slider something to do:
below 7 the deck is built without one. Verified against the deployed function.

### The plan is a shopping list now, and the obvious fix was wrong

A plan is weighted facets and `planFit` is a noisy-OR, so it can say "this
card is on theme" and never "I need six and I have two".

**Raising the commander reserve's budget from 8 to 20 and its per-want target
from 10 to 16, four combinations, moved jobs done NOT AT ALL** - 21 of 71
every time. The reserve was never the constraint. The constraint is that the
jobs are CONJUNCTIONS and a want is one facet: Kinnan's job is "creatures that
tap for mana", his plan wants `eff:add-mana` at 0.90, and a Signet satisfies
that completely.

`packagesForCommander` pairs each loud DOING want with each SHAPE want and
asks for cards that do both, returning packages so the existing package pass
fills them. Shapes are admitted at 0.4 against 0.6 for doing wants, measured:
Kinnan carries `type:creature` at 0.50 against `pt:big` at 0.75, so a shared
floor gave him "big things that add mana" and never asked for his real job.

**It moved shape and not jobs**, and the reason is worth keeping: the package
pass runs after the quota loop, so where a job is already half-served the
cards are taken and the package reports zero while the job is done. Reaching
the genuinely empty jobs means running it earlier or reserving for it.

### Where it stands

    shape (200 role checks)   81/200 -> 142/200    41% -> 71%
    twenty commanders         18/71 jobs -> 21/71, zero groups 28 -> 21
    seven-deck roster         keyed 65%, staples 51/61
    tests                     3,338 passing

---

## 4 Sep 2026 — the packages pick first, and three instruments were lying

### The single biggest deck-quality change of the session

The package pass ran AFTER the quota loop. Its slots were held back correctly
(`quotaSlots` subtracts `packageBudget`) and the comment on that subtraction
makes the argument that was never finished: **a reserved slot is only reserved
if it is taken out of the budget before the loop that would otherwise spend
it, and the same is true of the CARDS.** Running last, the quota loop had
already taken the very cards a package wanted, so a package reported "0 of 2"
while the job was done and its slots went to leftovers.

Most specific first is also right on its own terms: a package is a conjunction
("creatures that make mana"), the quota loop asks only for a role, the reserve
only for fit. The broadest pass picking first is how the narrow ones starve.

    Control     2/12 -> 10/12      Aristocrats  11/14 -> 14/14
    Blink       6/12 -> 12/12      Big mana       4/6 -> 6/6
    Lands       3/6  -> 6/6        Value        12/14 -> 14/14
    Aggro       2/4  -> 4/4        Enchantress  11/14 -> 14/14

Sixteen of seventeen strategies now fill every job. Everything else held.

### `scripts/probe/strategy-decks.mjs` — a deck in every strategy

Asks for each of the eighteen shells BY NAME on the commander that wants it
most, and reports the shell's own cards held, jobs filled, commander synergy
and ramp. All eighteen build; **ramp is 11 to 32 in every one and never below
the real floor of 11**, which is the "game unplayable otherwise" concern
answered across the whole strategy space rather than on one deck.

### THREE INSTRUMENTS WERE WRONG BEFORE THE PRODUCT WAS

Every one of these looked like a deck fault and was not.

**A response card carries no `facets` and no `oracle_text`.** So
`c.facets ?? facetsForCard(c)` had nothing to compile and scored almost every
card at zero commander fit. It reported the Aristocrats deck at "keyed 20%" -
a deck holding eight sacrifice outlets, Blood Artist, Zulaport Cutthroat,
Ayara and the Meathook Massacre for a commander paid when creatures die. Read
facets from `cards_pool` by name.

**A shell's example cards are strongly coloured** - Reanimator is ten of
twelve black, Aggro seven of seven red - so a mono-red commander can play none
of Reanimator's and "named" came out 0/12. That looked like the panel offering
unbuildable strategies and I was one edit from gating offers on shell colour.
**That would have been wrong**: a shell's cards exist to derive its WANTS,
which are colour-agnostic, and the pool is filtered by identity separately. A
mono-red Reanimator deck is Underworld Breach and Faithless Looting.

**Picking the most PLAYED commander that earns a shell** gave Blink to Ragavan
and Superfriends to Braids. Take the highest SCORE.

### The combo lookup could not serve an ordered LIMIT

    Index Scan using combo_pool_popularity_idx, Filter: identity <@ '{R}'
    Rows Removed by Filter: 5,875   Buffers: 6,287   3,328 ms

against a 3 s timeout, so combos threw INSIDE a build. Same shape as the
archetype strip: a narrower identity is MORE expensive because the plan reads
further down for the same 400 rows, and a GIN index on an array cannot serve
an ordered LIMIT. `combo_pool.identity_key` is the colours as one sorted
string, so the query is `identity_key IN (subsets of my identity)` - at most
32, each an index range on `(identity_key, popularity DESC)`.
**3,328 ms -> 217 ms, buffers 6,287 -> 709.**

### Strategy detection, measured over all 3,363 commanders

`scripts/probe/strategy-coverage.mjs`. Five facets commanders want that NO
shell claimed: `eff:damage` (261), `cares:zone:exile` (129), `tok:treasure`
(93), `eff:impulse` (41), `eff:discard` (40). And `STRATEGY_SLOTS` was 6, so a
commander could not earn a seventh however well it was read - the owner's
"4-10" was unreachable by construction. Commanders earning nothing: 81 -> 49.

**3.3 loud wants per commander is the real ceiling on this.** Raising the
reserve budget 8 -> 20 and the per-want target 10 -> 16, four combinations,
moved jobs done NOT AT ALL. More strategies per commander needs the compiler
to read more of each commander, not more tuning.

### `meta_card_pairs` is NOT usable as a synergy signal, and here is the measurement

24,165 co-occurrence rows with a `lift` column, unread by anything, and the
obvious next step after the combos. It does not work, and the reason is not
sample size alone.

Strongest pairs in the commander scope with support of eight decks or more:

    Inspiring Call + Hardened Scales      lift 15.5   genuine
    Thriving Isle + Thriving Heath        lift 13.1   two white-blue lands
    Rampaging Baloths + Seer's Sundial    lift 12.8   genuine
    Thriving Isle + Thriving Moor         lift 12.8   two lands
    Talisman of Resilience + Temple of Malady  12.8   two Golgari sources
    Overflowing Basin + Flooded Grove     lift 12.7   two lands
    Foreboding Ruins + Bedevil            lift 10.7   both Rakdos
    Mossfire Valley + Kessig Wolf Run     lift 10.7   two lands

**Six of the eight are colour identity wearing synergy's clothes.** Two Golgari
lands co-occur because both appear in Golgari decks, and the pool is already
filtered by identity, so the signal would tell the ranker something it is
guaranteed anyway - while spending real weight doing it.

Controlling for colour needs per-identity scopes, and 192 commander decks
across 32 identities is about six decks each, which is not a base you can
compute lift on. The pair table stays unread until there are far more decks
AND a colour-controlled scope.

**Commander Spellbook is the right source for "these cards work together" and
is already wired**: 61,130 curated combos, each a stated interaction rather
than an inferred one.

---

## 4 Sep 2026 — the instruments were not running, and two of them were lying

### `npx tsc` had never type-checked anything

`node_modules/.bin` DID NOT EXIST although packages were installed, so
`npx tsc` resolved to a different package entirely and printed *"This is
not the tsc command you are looking for"* on every run. That was read as a
pass. `npm rebuild` restored 84 bin entries and the first real check found
three errors written that day, including a **duplicate `wheel` key** in an
object literal where the later silently won.

`supabase/functions/deno.d.ts` declares the one global the edge files read,
so the check is CLEAN rather than permanently one error deep. A check that
always prints one error is one people learn to scroll past.
`tsconfig.app.json` names it explicitly: nothing imports it, and
`supabase/functions` is reached only because the tests under `src/engine`
import the optimiser's catalog and the generator's pipeline.

**Use `npx --no-install tsc --noEmit -p tsconfig.app.json`.** The
`--no-install` is what makes a missing binary fail loudly instead of
fetching a stranger.

### The pool budget was passed and silently ignored

`pipeline.ts` sent `limit: poolBudgetFor(colours)`; `poolFor` declared only
`{withOracleText, maxRank}`. An excess property on an object literal is a
type error, and nothing was checking.

    five-colour pool   18,363 ms / 31,829 rows  ->  883 ms / 5,000

**This falsifies a recorded negative.** The note reading *"4,000 measured no
better than 5,000, so the pool size is not the cost"* was measured with both
arms fetching the whole walk. The variable was never varied. Re-run with the
option actually implemented, pool size is decisive: Najeela is **5/5 at
2,500 and 3/4 at 3,500**, and `poolBudgetFor(5)` is 2,500 now.

> A negative result recorded in this file is only as good as the instrument.
> When one contradicts a fresh measurement, check whether the knob was
> connected before believing the note.

### "CPU Time exceeded" is spent across the WHOLE request

Najeela reached `built: 99 cards` and died **ten milliseconds later** in the
rescore. The rescore was not the problem; it was what the build had left. So
the fix for a resource limit is anything that costs less ANYWHERE in the
request, not necessarily the thing it died in.

`WORKER_RESOURCE_LIMIT` is all the client sees. The cause is in the function
logs: `select event_message from logs where source = 'function_logs'`. Read
it before theorising.

### Every land was compiled from rules text on every request

`landPoolFor` selected `oracle_text` and not `facets`, and the pipeline
treats a MISSING `facets` field as a card the memo has not reached. So 695
cards were compiled per request against a memo gap of **exactly zero**,
every one of them a land.

    facets  compiler 399, no record 42  ->  compiler 0, cached 6000

The rows still come from `cards_unique`: this is the one caller that
genuinely needs the rules text, which is why the note on `RANK_POOL_TABLE`
names it as the standing example. Only the FACETS come from `cards_pool`, in
a second narrow read. **Selecting `facets` from `cards_unique` returns 401**
- there it is a computed column over `card_facet_memo`, which `anon` holds
no grant on.

### A GRANT is protection whatever the card is

`facetRoleQualifies` allowed `protection` only on an instant, sorcery, aura
or equipment, so every CREATURE that grants it was refused. Measured:
mono-white Isamaru reported **"5 of 5 protection slots could not be filled"**
in the colour that holds the most protection, and spent the released slots
on Shell Skulkin at rank 18,823.

The type test was standing in for "is this a grant", which the `grants:`
prefix already answers. Purphoros carries a BARE `kw:indestructible` and no
`grants:` facet, so he is still refused - checked, not assumed.

    59 cards rescued under rank 4,000; 39 independently tagged
    `protection` by the tagger. Three wrong: Paradise Druid, Shimmer
    Dragon and Syr Ginger say "~ has hexproof" about THEMSELVES.

Those three want a `grants:*-self` word, on the precedent of
`cost:sacrifice-self` and `eff:exile-self`. Not done: it is a compiler
change and therefore a version bump, refill and reader move.

### REFUSED, with the measurement: a `graveyard-hate` tag door

`ATTACKS` holds one entry and this file says a second needs a measurement
rather than a guess. Abyssal Harvester reached a Sheoldred deck, so the
obvious candidate was "tagged `graveyard-hate` AND carrying
`cares:zone:graveyard` attacks a graveyard plan". 202 cards carry the tag,
62 also carry the facet, 47 are already caught by `eff:exile-graveyard`, so
it would newly claim **15**. Read as a player, at least six are wrong:

    Mnemonic Betrayal, Hedonist's Trove, Nautiloid Ship   hit OPPONENTS'
      graveyards, which this file already says belongs in a graveyard deck
    Canoptek Tomb Sentinel                                triggers FROM a graveyard
    Kaya, Spirits' Justice, Lazav, Wearer of Faces        payoffs

~50-60% precision against the 85% bar these role-affecting rules are held
to. **Do not add it.** The narrow fix is a compiler rule so that "exile
target creature card from a graveyard **that was put there this turn**"
emits `eff:exile-graveyard`; the plain wording already does.

### The floor fills in four tiers, not two

    1. played (rank <= 12,000), other roles under the p90 ceiling
    2. played,                  over p90 but under the largest count
                                the 192 real decks actually hold
    3. not played, under p90
    4. not played, over p90

There were only 1 and 3: a card over the ceiling was skipped outright, so
the creature floor jumped from "the best creatures that do nothing else"
straight past every good creature whose SECOND role was full. Played-enough
is the OUTER key, because a role slightly past p90 is a thing real decks do
and playing a card nobody plays is not. `roleFloorCeilingFor` uses the
measured `max`, so the mana-dork overrun the guard was added for is still
refused.

    Isamaru   past 15k 4 -> 1, creatures 30 -> 22 against a floor of 20

### Where production stands

    fourteen deployed decks   13/14 -> 14/14 build
    format staples            75/85 -> 82/94
    past rank 15,000          9 -> 7   (Kozilek is colourless: a small
                                        pool makes an unpopular card the
                                        right answer, not a bad one)
    Najeela                   WORKER_RESOURCE_LIMIT -> 1.3 s warm
    Uril 9.1s, Brago 7.5s, Talrand 7.4s -> about 2 s each
    tests                     3,356 passing, tsc clean

## The "Anything else?" box does something now

`customPrompt` was declared and READ BY NOTHING once the model was removed.
`src/engine/build/requestNotes.ts` reads two shapes that cannot be mistaken
for anything else, keep a named card out and a mana value ceiling, and
**reports everything else as unread in the deck's own notes**. No model.

Three rules worth keeping:

1. **The POOL is the authority on what a card is called.** "no
   counterspells" reads as UNREAD rather than banning `Counterspell`;
   plurals are deliberately not stripped, because a category is not a card.
2. **Cards come out of the POOL, not the deck.** Every later pass chooses
   from that array, so nothing can put them back. Filtering the finished
   deck would leave a hole the next pass refills with the same card.
3. **A ceiling never touches lands.** "Nothing over 4 mana" is about spells;
   applied to the mana base it removes the expensive utility lands and
   leaves a deck that cannot cast what is left.

The apostrophe is DELETED in the fold, not spaced, so "gaeas cradle" reaches
`Gaea's Cradle`. Same trap `normalize.ts` records.

Verified against the deployed function: `"no Sol Ring, nothing over 5 mana,
more counterspells"` gives 99 cards, no Sol Ring, no spell over 5, and says
it could not act on "more counterspells". An explicit exclusion BEATS the
named-staple pass, which is right when the player asked for it by name.

## ~~🔴 `npm run build` EXITS 1. The live site cannot be redeployed~~ FIXED 4 Sep 2026

> ✅ **Closed.** `npm run build` exits 0. The snapshot was regenerated and
> `homepage-snapshot.mjs` no longer needs a service-role key: see "the service
> role was never the reason" at the end of this file. The paragraphs below are
> kept because the reasoning about the guard still holds; the alarm does not.

## 🔴 `npm run build` EXITS 1. The live site cannot be redeployed

    The homepage snapshot is 15.8 days old and the limit is 14 days.

`src/data/homepage-snapshot.json` carries `generatedAt`
**2026-08-19T11:48:06Z** and has never been refreshed since it was created,
so the guard began failing around 2 Sep. **The guard is correct and must not
be weakened** - it exists so the homepage cannot state card counts from
three weeks ago as if they were current.

Refreshing it needs `SUPABASE_SERVICE_ROLE_KEY`, which is not in `.env`
(only the publishable key is) and which nobody working on this holds. The
"Homepage snapshot" job in `.github/workflows/prices-daily.yml` still exists
and evidently has never refreshed the file. **This is an owner action:** set
that repository secret, or run
`node --experimental-strip-types scripts/homepage-snapshot.mjs` with the key
set locally, and commit the result.

## `lovable-tagger` is gone

`npm run dev` died on `failed to load config from vite.config.ts`, because
`lovable-tagger` imports `@babel/parser` and `node_modules` was broken in
the same way that hid `tsc`. `npm install` repaired the tree; the plugin was
REMOVED rather than repaired. It tags components for Lovable's visual
editor, this project moved to Vercel on 29 Aug, and its import is top-level,
so a dead integration took the entire dev server down.

## A cost reducer is not a mana source, and that was the SECOND door

On 3 Sep `cost-reduction` was removed from `ROLE_TAGS.ramp` because it claimed
156 cards as ramp of which 156 had no other ramp tag. `eff:reduce-cost` had
been added to `ROLE_FACETS.ramp` THE DAY BEFORE, so closing the tag door left
the facet door open and nothing connected them. This file already records that
trap for `eff:poison`: **a role has TWO doors and closing one is not the fix.**

Measured 4 Sep: 239 of the 241 cards carrying `eff:reduce-cost` have no other
ramp facet, 165 under rank 12,000. A fresh Animar build came back with 21 ramp
of which TEN were reducers, and THE SAME THREE CARDS by name as 3 Sep, plus
Bontu's Monument and Oketra's Monument, which reduce black and white spells in
a blue-red-green deck and are simply dead.

    before  Bontu's Monument, Oketra's Monument, Dragonspeaker Shaman,
            Dragonlord's Servant, Goblin Warchief, Rhonas's Monument,
            Biomancer's Familiar, Forensic Gadgeteer, Blossoming Tortoise
    after   Sol Ring, Arcane Signet, Fellwar Stone, Thought Vessel, Birds of
            Paradise, Incubation Druid, Gyre Sage, Rishkar, Cultivate,
            Farseek, Rampant Growth, Nature's Lore

**The narrower rule does not hold either.** Keeping a reducer conditioned only
on COLOUR, since the pool is already filtered by identity, still admits Jet
Medallion: a colourless artifact with an EMPTY colour identity, legal in that
same Animar deck and equally blank there. The facet vocabulary does not record
WHICH colour or type a reducer reduces. The word still reaches decks through
`planFit`, so a commander who genuinely wants cheaper spells asks for these by
name.

## REFUSED, measured: folding `type:X` onto `cares:type:X` to choose a shell

The generator picks a shell by cosine against the commander's plan when the
player asks for none. Scored against the twenty benchmark commanders, it gets
10 right and **EIGHT GET NO SHELL AT ALL** - and a commander with no shell gets
no packages, which is the only machinery in the engine that can express "this
card does BOTH of these things".

The cause is exact and is a vocabulary mismatch, not a scoring one:

    Sythis, Harvest's Hand   loud want  type:enchantment
    the Enchantress shell    wants      cares:type:enchantment
    Niv-Mizzet, Parun        wants      type:instant / type:sorcery
    the Spellslinger shell   wants      cares:type:instant / cares:type:sorcery

Different strings, zero overlap, shell dropped. A COMMANDER whose card says
"whenever you cast an enchantment spell" wants enchantments in the deck; a
SHELL derived from enchantment cards wants cards that care about enchantments.
For choosing a shell those are the same claim.

**Folding them fixes the naming and measures WORSE as a deck, three ways:**

    applied to every commander     jobs 23/71 unchanged, zero groups 21 -> 24
    as a fallback, strict pass
      unchanged, floor 0.75        jobs 23 -> 22, zero groups 21

Sythis gained the Enchantress shell and went 2/3 jobs to 1/3. Feather gained
Spellslinger and her median EDHREC rank went 414 to 1,586. The shell's packages
take slots the commander's own plan would have spent better, so a shell that is
right BY NAME can still be wrong for the deck. Reverted, on this project's own
standard that a rule which measures worse is the wrong rule - the same verdict
the `tokens` role got.

Two things worth keeping from it:

1. **Shells help on average and these three are the exception.** Baseline: the
   twelve commanders that get a shell do 17 of 41 jobs (41%); the eight that do
   not do 6 of 30 (20%). The mismatch above is still a real bug.
2. **`strategiesFor` is NOT a drop-in replacement.** It offers a MENU and
   `ALWAYS_OFFERED` puts aggro near the top for most commanders, so its top two
   would make half the field an aggro deck. It gets the benchmark archetype into
   its top three for 17 of 20, but that is a different question from "which one
   shell should build this deck".

The next attempt should fix why a correct shell costs a job, not the naming.

## The ramp instrument was reading tags

`strategy-decks.mjs` passed `facets: c.facets ?? []` into `cardRole`, and a
RESPONSE card carries no facets, so the array was always empty and the role
check fell through to the TAG door. The keyed count beside it had already been
fixed for exactly this; the ramp count had not, and ramp is the number the owner
singled out.

    tags   Magda 30, Ragavan 29, Kutzil 24, five decks "ramp high"
    roles  Magda 24, Ragavan 21, Kutzil 21, two decks "ramp high"

Measured properly, all eighteen strategies sit between 13 and 25 against a real
p10 of 11 and p90 of 21, and MOST LAND EXACTLY ON 21, which is the ceiling doing
its job.

It also exonerated the four-tier floor fill, which was the obvious suspect: with
the slack disabled the three decks measured 30, 29 and 24 - THE SAME THREE
NUMBERS. Confirm a finding with a second, differently-shaped measurement before
acting on it.

## The shell is a guess, so it is worth less than the commander

This is the answer to why a CORRECT shell was making a deck worse, which the
previous session recorded as an open question.

`archetype-fit` and `commander-fit` shared `commanderFitWeight`, 3.6 on an empty
deck. The commander is CERTAIN: it is in the deck and its plan is what the deck
does. The shell is INFERRED, one of eighteen picked by a cosine. The same card
could score both and reach 7.2 while the whole popularity term spans 2.4, so
on-theme did not merely outrank card quality, it buried it.

Measured on Sythis, Harvest's Hand with the Enchantress shell against the same
build without it. The shell did its OWN job better - "other enchantresses" 3 to
5 - and the deck LOST a benchmark job, because the role gaps then filled with
Charitable Levy (rank 7,032) and Altar of the Pantheon (6,181) while
Commander's Sphere (51), Garruk's Uprising (90) and Kenrith's Transformation
(726) left. The popularity gap between rank 51 and rank 7,032 is about 1.17 and
the shell was handing out 3.6.

`ARCHETYPE_FIT_SHARE = 0.6` in `rank.ts`. Still the largest single term after
the role gap, so an on-theme card still beats an off-theme one of similar
standing; what it can no longer do is beat a format staple by four points.

    seven-deck roster    keyed 66% -> 70%, staples 49/61 -> 51/61
    twenty commanders    jobs 23/71 unchanged, groups at zero 21 -> 18
    eighteen strategies  keyed up on nine and down on none
                         packages still 16 of 18 filled, ramp 13 to 24

**Keyed synergy and format staples both rose**, and they normally trade against
each other. That is the sign this was a weight fighting itself rather than a
real tension between theme and quality.

### Two things tried on the way, measured, and REVERTED

**Ordering package fills by how played a card is.** `PACKAGE_MATCH` is already
the gate for "does this card do the job", so preferring played cards above it
looked obviously right. Neutral on jobs and zero groups, minus three points of
keyed on two of eighteen strategies. No measured benefit, so it is churn.

**Folding `type:X` onto `cares:type:X` to choose a shell.** The generator scores
shells by cosine and EIGHT of the twenty benchmark commanders get no shell at
all, which means no packages - the only machinery that can say "this card does
BOTH of these things". The cause is exact and is a vocabulary mismatch:

    Sythis, Harvest's Hand   loud want  type:enchantment
    the Enchantress shell    wants      cares:type:enchantment
    Niv-Mizzet, Parun        wants      type:instant / type:sorcery
    the Spellslinger shell   wants      cares:type:instant / :sorcery

Different strings, zero overlap, shell dropped. Fixed three ways and every
version measured worse: applied to everybody, zero groups 21 -> 24; as a
fallback with a 0.75 floor, jobs 23 -> 22. Sythis gained the right shell and
went 2/3 jobs to 1/3; Feather gained Spellslinger and her median rank went 414
to 1,586.

**The mismatch is still a real bug and worth fixing** once a correct shell stops
costing a deck quality. Note that the weight change above is exactly that fix,
so THIS IS WORTH RE-TRYING - it was measured against the old weight.

Two things to keep either way:

1. Shells help on average and those three were the exception. The twelve
   commanders that get a shell do 17 of 41 jobs (41%); the eight that do not do
   6 of 30 (20%).
2. **`strategiesFor` is NOT a drop-in replacement for the cosine.** It offers a
   MENU and `ALWAYS_OFFERED` puts aggro near the top for most commanders, so its
   top two would make half the field an aggro deck. It gets the benchmark
   archetype into its top three for 17 of 20, which is a different question from
   "which one shell should build this deck".

## 🔴 THE VENDORED FUNCTIONS ARE AT THE 5 MB DEPLOY LIMIT

`deck-optimizer` CANNOT BE DEPLOYED. Measured 4 Sep 2026:

    mtg-brain           4,965 KB     35 KB from the limit
    deck-optimizer      4,753 KB     deploy returns HTTP 413
    ai-deck-builder-v2  4,689 KB     still deploys, barely
    facet-memo-fill     4,557 KB

    supabase functions deploy deck-optimizer
    -> 413 "Function source code exceeds the maximum deployment size (5 MB)"

So every engine fix is live in the GENERATOR and NOT in the OPTIMISER, and this
is the "pushing is not deploying" trap in a new form: it cannot be deployed at
all. Whatever the optimiser is serving predates this.

**Two thirds of each function is one file:**
`_lib/cards/xmage/lowered.generated.ts`, **3,157 KB**. It is already trimmed to
records that lower - 7,392 entries, ZERO empty - so there is nothing to prune
inside it.

**The fix is not to vendor it where it is never read.** XMage is consulted only
for a card the oracle-text compiler does not fully understand, and the facet
memo now covers the catalogue, so at runtime the generator reports
`facets: ... (compiler 0, xmage 0, no record 0, cached 6000)` on every build.
`facet-memo-fill` genuinely needs it, because it is the thing that WRITES the
memo. The other three almost certainly do not.

Care is needed: absence must not become a SILENT divergence where a card with no
stored facets quietly compiles differently in one function than another.
`engine-parity.test.ts` asserts the vendored copies are byte-identical, so it
has to learn about a deliberate per-function exclusion rather than be switched
off.

## The XMage table was two thirds of every edge function, and 77% of it was unreachable

`deck-optimizer` COULD NOT BE DEPLOYED, so every engine fix was live in the
generator and not in it. That is "pushing is not deploying" in a new form: it
could not be deployed at all, and nothing said so except a 413 nobody had asked
for.

    before                          after the prune
    mtg-brain           4,965 KB    2,677 KB
    deck-optimizer      4,753 KB    2,465 KB   (was HTTP 413)
    ai-deck-builder-v2  4,689 KB    2,401 KB
    facet-memo-fill     4,557 KB    2,269 KB

`xmage/lowered.generated.ts` was 3,157 KB of each. `xmageSwapFor` opens with one
line:

    if (compiled.compilerCoverage === 'full') return { refused: ... }

so a record for a card the oracle-text compiler already reads completely can
NEVER be returned. Not rarely used - unreachable. **5,688 of the 7,392 records
were that**, and the table is 868 KB now.

### It was proved, not argued

`scripts/xmage/prune-verify.mjs snapshot` records the facets of every card that
HAS a record, then `compare` re-reads them after. **Only a card with a record can
be affected by dropping records**, so those 7,392 are the whole population rather
than a sample. NOTHING MOVED, and the deployed sweep is identical afterwards:
14/14, 82/94 staples.

The compiler's own verdict is read with `DM_XMAGE_OFF=1`, the switch
`lowered.ts` already carries, so the prune asks the same question the rule asks
rather than a lookalike. A record whose card is not in the catalogue is KEPT:
absence is not evidence, and a wrong drop is silent.

**`emit-lowered.mjs` rebuilds the FULL table, so run `prune-lowered.mjs`
afterwards.** A regeneration that forgets is silent: nothing breaks, every
answer stays the same, and all four functions quietly stop being deployable.
`lowered.test.ts` states that invariant now, because its old premise - that
Lightning Bolt HAS a record - became unsatisfiable by construction.

## The optimiser was compiling the whole pool on every request

`poolFor(..., { withOracleText: true })` already SELECTS the stored `facets`
column, and on a commander pool that is `cards_pool`. `deck-optimizer/index.ts`
ignored it and recompiled every row from oracle text:

    facets: 12531 stored, 0 compiled in 7 ms

Twelve and a half thousand cards of compiler work per request, reproducing an
answer the row was already carrying - and the same answer, because the memo was
written by this same compiler. It also means the optimiser and the generator now
read the SAME facets for a card, rather than two computations that agree only
while the vendored copies do.

Verified end to end on a real generated Meren deck: HTTP 200, power 5.5 -> 6.3
projected, ten replacements, each carrying `removeReason` and `addBenefit` that
cite the commander's plan, the tags shared with the deck and the castability
figure. The commander-fit signal genuinely reaches it.

> The request shape is `{ deckContext: { commander, cards, format }, ... }` and
> the reasons live on `removeReason` / `addBenefit`, NOT on `reason`. A probe
> reading `reason` prints blank swaps and looks like a feature with no
> explanations.

**Left open, measured but not chased:** the swaps are mixed. Chatterfang,
Squirrel General out for Black Sun's Twilight is a downgrade. The optimiser
scores against a NON-empty deck, where `popularityWeight` is 0.8 rather than the
empty-deck 2.4, so the role gap at 3.0 dominates and a cheap card that
technically fills a role can beat a better one. That is the same shape as the
archetype-weight fault fixed above and wants the same treatment: a measurement
across many decks before touching a weight.

## REFUSED TWICE: folding `type:X` onto `cares:type:X` to choose a shell

Re-tested 4 Sep 2026 against the CORRECTED archetype weight, because the first
refusal was measured while `archetype-fit` still carried the commander's 3.6 and
the stated reason for the failure was that a partly-right shell's packages take
slots. That reason is now gone and **the result did not change**:

    baseline (no fold)   23/71 jobs, 18 groups at zero
    fallback + floor     22/71 jobs, 18 groups at zero

    Sythis    2/3 jobs -> 1/3          gains the Enchantress shell
    Feather   median rank 414 -> 1,139, and a card past 15,000
    Niv-Mizzet median 613 -> 845       gains Spellslinger

So the three commanders it gives a CORRECT shell name are the three whose decks
get worse, twice, under two different weightings. **Do not try this a third time
without first fixing why a shell's packages cost a deck quality.** The package
budget is spent on narrow conjunctions while what those commanders wanted was
breadth: Sythis gains enchantresses, 3 to 5, and loses both "cheap enchantments"
and "enchantment payoffs".

The underlying mismatch is still real and still worth fixing eventually: eight of
twenty benchmark commanders get NO shell because a commander wants
`type:enchantment` while the shell wants `cares:type:enchantment`.

## The optimiser was proposing swaps it had itself measured as downgrades

It became deployable on 4 Sep, so this is the first time its suggestions have
been measured at all. `scripts/probe/optimiser-suggestions.mjs` builds a deck
with the generator, hands it straight to the optimiser, and reads how played the
cards it wants to add are.

    Kiki-Jiki, Mirror Breaker (1,240) -> Akki Scrapchomper    (14,431)
    Zealous Conscripts        (2,363) -> Greasewrench Goblin  (17,642)
    Flare of Fortitude          (739) -> Angel's Herald       (27,779)
    Solemn Simulacrum            (38) -> Clown Car             (3,937)

The first two are BOTH HALVES OF THE COMBO the generator deliberately put in
that deck. **The optimiser cannot see a combo at all** - it reads the pieces as
cards filling no role it is short of. That is the sharpest example of the two
halves of the engine disagreeing, and it is not fixed here: the optimiser
receives a card list and nothing tells it which cards were placed as a unit.

**A swap may not hand a card nobody plays for one they do.** `incoming` is
paired with `swapTargets` BY INDEX and nothing checked that what arrives is
better than what leaves. `PLAYED_ENOUGH_RANK` is the same 12,000 line the
generator's floors use. It refuses only the crossing.

**A swap measured to make the deck worse is not offered.** `measureImpact`
already re-evaluated the deck with each replacement applied and wrote the delta
onto the row, and NOTHING READ IT. It runs before the projection, because that
number is "the whole answer applied at once" and has to describe the answer
actually shown. NULL IS NOT NEGATIVE: the delta is null when it is too small to
print, unmeasurable, or past `IMPACT_BUDGET`, and unknown stays unknown.

Using the engine's own number rather than a rank rule matters, because a less
played card genuinely is the right answer for some commanders.

    additions past rank 12,000, five decks   8 -> 0
    Krenko    10 swaps -> 5, combo intact
    Teysa     10 swaps -> 6

### Still wrong, measured, and it is the SCORE

Smothering Tithe (65) out for Halo Fountain (1,908) survives, because the power
score MEASURES that swap as an improvement. The score is a castability, role and
fit roll-up and does not value a card like Smothering Tithe at anything near
what a player would. That is a limitation of the score itself rather than of the
filter, and the filter is now the thing that would show it up: anything the
score gets wrong now reaches the player as a confident recommendation.

> The optimiser's request shape is `{ deckContext: { commander, cards, format },
> useCollection, collectionCards }`, and a replacement's reasons live on
> `removeReason` / `addBenefit`, NOT on `reason`. A probe reading `reason` prints
> blank swaps and looks like a feature with no explanations.

## CORRECTION: the power score does not rate that swap as an improvement

The section above says *"Smothering Tithe (65) out for Halo Fountain (1,908)
survives, because the power score MEASURES that swap as an improvement"*. **That
is wrong.** Measured 4 Sep 2026 with `scratch/_swapscore.mjs`:

    Teysa, remove Smothering Tithe, add Halo Fountain
      score 6.4 -> 6.4
      card_advantage  88 -> 85    (-3.0)
      consistency   90.8 -> 97.5  (+6.7)

It rates the swap as NOTHING. The score is not broken, it is NARROW, and it
catches what it does model:

    Teysa, remove Sol Ring, add Ornithopter
      score 6.4 -> 6.1     speed 76.4 -> 62.6  (-13.8)

### So a swap must measure as a GAIN, not merely as no loss

A swap worth no measurable points is churn that costs the player a card the
score cannot value, and **the score's blind spots are exactly where the
format's staples live**. `deck-optimizer` now refuses a replacement whose
measured delta is not positive.

**`edhImpact` could not be used for this.** It is null for TWO different things:
a change that could not be measured at all, and one measured below
`IMPACT_FLOOR`, which is only about what is worth PRINTING. Reading it would
have turned "we never got to that row" into a refusal. The raw delta lives in a
WeakMap keyed on the row, so the response body is unchanged and no client can
begin depending on it. UNMEASURED STAYS OFFERED.

    swaps across five generated decks   50 -> 26
    Krenko 10 -> 1 · Teysa 10 -> 2 · Meren 10 -> 6 · Sythis 10 -> 7
    additions past rank 12,000          8 -> 0

### What survives is arguable rather than absurd

Sythis is still told to trade Sylvan Library (259) for Sterling Grove (1,206),
and the score's reason is legible: **tutors 0 -> 4.8, resilience 31 -> 37**, in
an enchantress deck holding no tutor at all. Sterling Grove really is an
enchantment tutor that really does grant shroud. A player may well disagree, and
the engine is not being stupid.

That is the honest state of the optimiser: the egregious suggestions are gone,
what remains is a difference of opinion about card quality, and closing THAT
needs the score to learn what a staple is worth rather than another guard
bolted on top.

### The instrument

`scripts/probe/optimiser-suggestions.mjs` builds a deck with the generator,
hands it straight to the optimiser, and reports how played the cards it wants to
add are against the ones it wants to remove. It is the only instrument in this
repo that scores the OPTIMISER rather than the generator, which is why its
suggestions went unmeasured until the day it became deployable.

`scratch/_swapscore.mjs` names which SUBSCORE moves for one swap, which is how a
disagreement stops being an opinion.

## The Tagger merge was undoing the compiler's self/other split

On 3 Sep the compiler was taught `eff:add-counters-self` and `ctr:+1/+1-self`,
because "a counter the card puts on ITSELF read as a counters deck" and Korvold
and Animar both planned as Hardened Scales decks. That fix was correct and it
was being reversed downstream every night.

`tag_facet_map` mapped Scryfall Tagger's **`gains-pp-counters`** to the GENERIC
`eff:add-counters`, and the mapping's own note says what the tag means:

    slug   gains-pp-counters      gated   true
    why    "Puts +1/+1 counters on itself."

Which is precisely what `eff:add-counters-self` exists to say. Measured 4 Sep
2026: **484 cards carried `eff:add-counters-self` from the compiler and the
generic verb ONLY from this merge.** Animar therefore read as a counters
commander again - `ctr:+1/+1` and `eff:add-counters` were his two LOUDEST wants
at 0.90 - and his deck came back with 33 creatures, none of them big, against a
card whose entire text makes big creatures cheap.

Corrected to `eff:add-counters-self`. `eff:add-counters` is read only as a WANT,
by intent rules and `PLAN_RULES`, and by no entry in `ROLE_FACETS`, so no card
changes role.

> **A gated mapping overrides nothing and adds everything.** It is applied to
> every card carrying the tag, on top of whatever the compiler produced, so a
> mapping to a BROADER word than the compiler's silently widens the record. When
> a compiler rule draws a distinction, check `tag_facet_map` for a tag that
> flattens it again: the two sources are merged in `cards_pool` and neither knows
> what the other said.

**The merge lives in the VIEW**, so the correction reaches the app only on the
next `cards-unique-refresh`. `refresh_cards_unique` is well built for this: a
caller with under 60 s of `statement_timeout` RECORDS the request and returns,
and the scheduled job performs it. The MCP session allows 120 s, which falls
between that branch and the 900 s the rebuild needs, so it raises instead - `set
local statement_timeout = '30s'` first, then call it.

## A commander that makes spells cheaper wants expensive spells

Animar carries `eff:reduce-cost` and NO PLAN RULE READ IT, so his plan asked for
`mv:cheap`. `PLAN_RULES` now maps `eff:reduce-cost` to `mv:big` 0.7 and `pt:big`
0.5 - a costly spell is what a reducer is FOR, and a big body is what makes the
discount matter in a creature deck. Both sit below the loud wants a commander
states about its own mechanic, so it tilts the curve rather than turning every
cost reducer into a big-creature deck.

Three of the eighteen zero job groups are this shape: Xenagos's "huge creatures
worth doubling", Kinnan's "big non-Human creatures", Animar's "big colourless
creatures". Measured before: Animar 33 creatures with ZERO `pt:big` and a curve
topping out at FOUR mana; Xenagos topping out at five; Kinnan at six, with no
card above six mana in any of the three.

> **`_plan1.mjs` reads facets from a different source than the generator.** It
> showed Animar WITHOUT `eff:reduce-cost` while `cards_pool` has it, because the
> tag merge is in the view. Read the plan from POOL facets when asking why the
> GENERATOR did something: `scratch/_planpool.mjs`.

Animar is in `generator-roster.mjs` now, as a standing failure with the whole
chain in his entry, the way Syr Vondam is.

## `eff:recur-self`: a creature that brings itself back is infinite fodder

Three of the eighteen benchmark job groups at zero were ONE shape and no facet
named it: Yawgmoth wants *"creatures that come back after dying, so Yawgmoth can
sacrifice them again"* and *"a steady supply of bodies to feed the commander"*,
Muldrotha wants recursion.

Measured on the seven obvious cards, they share only `cares:zone:graveyard` and
`type:creature`, which every graveyard card carries. Three of seven have
`eff:return-from`; the rest recur through a CAST PERMISSION (Gravecrawler) or an
ACTIVATED COST (Reassembling Skeleton), and the compiler reads neither as a
self-return.

**Scryfall Tagger already had the word.** `reanimate-self`, 273 cards, mapped to
`cares:zone:graveyard` ALONE. The twenty most played are uniformly a permanent
that brings itself back: unearth, escape, disturb, blitz, cast-from-graveyard,
or an activated self-return. Now `eff:recur-self`, gated.

Its own verb rather than a qualifier on `cast-from-graveyard`, for the reason
`eff:exile-graveyard` is: a role check asks whether ONE facet is present, so a
shared verb would make Gravecrawler and Karador the same card.

**AND IT HAS A CONSUMER**, because a word without one is decoration.
`cost:sacrifice` wants it at 0.8 and `trig:dies` at 0.75. Verified firing:
Yawgmoth's plan asks for it as his third loudest want.

### The tag catalogue is a place to look before writing a compiler rule

Both of today's vocabulary fixes came from `scryfall_tags` rather than from the
compiler, and neither needed a version bump, a refill or a reader move. When a
job group sits at zero, check whether Tagger already names the shape:

    select t.slug, count(distinct i.name) as on_these
    from ids i
    join public.scryfall_card_tags s on s.oracle_id::text = i.oid
    join public.scryfall_tags t on t.tag_id = s.tag_id
    group by t.slug, t.tag_id having count(distinct i.name) >= 3;

`scryfall_card_tags.oracle_id` is TEXT and `cards_unique.oracle_id` is UUID, so
that join needs a cast.

### The refresh, and how to make it happen

The tag merge is in the `cards_pool` VIEW, so a `tag_facet_map` change reaches
the app only on the next `cards-unique-refresh` (06:00 and 12:00 UTC, about 8
minutes). Two things worth knowing:

- **The skip is `requested_at is null`.** A change to `tag_facet_map` does not
  touch `cards.updated_at`, so the job WOULD skip it - except that a recorded
  request defeats the skip and is cleared afterwards.
- **`refresh_cards_unique` picks its branch on the CALLER's timeout.** Under 60 s
  it records the request and returns; at or above 900 s it does the rebuild;
  BETWEEN THOSE IT RAISES. The MCP SQL session sits at 120 s, right in the gap,
  so `set local statement_timeout = '30s';` first and then call it.

## `eff:neutralise`: Darksteel Mutation is removal and the engine knew nothing about it

`engine_knowledge()` is the right place to start a work list, and the interesting
row is not the blind one:

    knows nothing about what it does          401   1.2%
    knows what it LOOKS AT, not what it does  496   1.5%

The second is worse than it sounds. A card with `cares:` words and no verb
cannot be offered for ANY job, and the most played of them cluster hard:

    Darksteel Mutation        582        Song of the Dryads      1,816
    Kenrith's Transformation  726        Witness Protection      1,954
    Imprisoned in the Moon    761        Lignify                 2,288

Every one turns a permanent into something harmless without destroying it, which
is REMOVAL. Worse, **Imprisoned in the Moon was reaching decks as RAMP** - turning
a permanent into a land that taps for mana reads as `eff:add-mana` to anything
looking only at the outcome, and it was in a Kinnan deck as a mana source.

Tagger names it: `humble`, 136 cards, mapped to `cares:type:creature` alone.
Fifteen of the sixteen most played are this shape. Now `eff:neutralise`, gated,
and `ROLE_FACETS.removal` reads it so the word has a consumer the moment it
lands.

**Not folded into `eff:shrink`**, which removal already reads: two thirds of these
set base power and toughness and the rest only strip abilities, so one word would
have been a lie about a third of them.

### Three vocabulary gaps in one day, all named by Tagger, none needing a version bump

`eff:recur-self`, `eff:reduce-cost`'s plan rule, `eff:neutralise`. The pattern is
now established well enough to state as a method:

1. `engine_knowledge()` for the population, then the most PLAYED members of
   `knowledge_band in ('nothing','looks-at-only')`.
2. Read them and look for a shape rather than fixing cards.
3. Ask whether Tagger already names it - the join needs a cast, because
   `scryfall_card_tags.oracle_id` is TEXT and `cards_unique.oracle_id` is UUID.
4. Read the tag's most played members before mapping. Not a sample of eight:
   this file already records that eight samples make a reader systematically too
   harsh.
5. **Give the word a consumer in the same commit** - a role, a plan rule, or a
   package - because a word with none is decoration, and this project has shipped
   five of those.

### What is waiting on a rebuild

Both of today's tag corrections and `eff:neutralise` reach `cards_pool` only on
the next `cards-unique-refresh`. The request is recorded, so the job will not
skip. `eff:recur-self` already landed in the 12:00 run and Yawgmoth's recursion
group went 0/4 to 2/4.

### Still to apply, and it needs a supervised window

`supabase/migrations/20260904130000_tag_merge_may_not_overwrite_precision.sql`.
Verified by SELECT, not applied: DROP and CREATE of a materialized view takes
`cards_pool` away for about eight minutes and the generator errors while it is
gone. See the file's own header.

## Rebuilding a materialized view on a live product: alongside, then swap

`cards_pool` was rebuilt on 4 Sep 2026 with no outage. The migration file as
originally written would have caused one, and the method matters more than the
change did.

**Never `drop` then `create` a matview the product reads.** The CREATE populates
while holding ACCESS EXCLUSIVE on the name, so every reader blocks and then dies
on its own `statement_timeout`. Build the replacement under a second name and
swap:

    create materialized view cards_pool_next as (...) WITH NO DATA;  -- instant
    create the five indexes; grant select;                           -- instant
    refresh materialized view cards_pool_next;                       -- populates
    begin; drop cards_pool;
           alter materialized view cards_pool_next rename to cards_pool;
           alter index ... rename to ...   x5
    commit;                                                          -- ms
    analyze public.cards_pool;

Everything before the `begin` is invisible to the product and undone by
`drop materialized view cards_pool_next`.

### Three things that were wrong in what this file used to say

**THE EIGHT MINUTE FIGURE WAS WRONG.** `last_duration_ms` of 501,867 is
`cards_unique` AND `cards_pool` refreshed CONCURRENTLY, which builds a temp
table and diffs a live view. A PLAIN refresh of one matview finished inside a
120 s session. The pg_cron route planned for the long step was never needed.

**GRANTS DO NOT SURVIVE A DROP, AND NOTHING WOULD HAVE SAID SO.** `cards_pool`
carries explicit grants to anon, authenticated and service_role. Recreated
without them it is owner-only, and PostgREST returns permission denied for every
generator request - silently, until somebody notices the product is broken.
Measured: that ACL matches the default privilege for `postgres` creating a table
in `public` EXACTLY, and an MCP SQL session IS `postgres`, so a new matview
inherits them. Grant explicitly anyway, and COMPARE BOTH ACLs before swapping:

    select relname, array_to_string(relacl, ' | ') from pg_class
     where relname in ('cards_pool','cards_pool_next');

**THE INDEX LIST WAS WRONG IN THREE OF FIVE WAYS.** The first draft guessed
four, invented one on `name`, missed the GIN index on `color_identity` and the
rank index entirely, and misnamed the band index. Each of those is a silently
slower or broken pool query rather than an error. Copy them from `pg_indexes`.

### What to verify BEFORE the swap, not after

    rows            both sides equal
    columns         name, ORDER and type - a reordered column silently breaks
                    PostgREST callers that select by name
    indexes         count and definition
    grants          identical ACL
    the change      the specific facets that were supposed to move, and the
                    ones that were supposed to stay

## `npm run build` passes again, and the service role was never the reason

The homepage snapshot was 16 days stale, the guard was failing the build, and
the file could not be refreshed without a service-role key. **It needed that key
for ONE number**, and the other failure was a bug.

`PRIVILEGED` gates exactly one thing: `count(*)` over `cards`, 98,048 rows
against the 3 s cap the anon role carries. `SUPABASE_PRINTINGS_COUNT` supplies
it when the service role is absent - validated as a positive integer rather than
trusted, since a wrong count becomes a sentence on the homepage - and is ignored
when CI has the real key.

The second failure was `type_line: 'ilike.%Creature%'` in three places: a count
over the 33,035 row `cards_unique` matview that returned HTTP 500 on anon. This
file already measured that swap at **2,007 ms against 172 ms**, and Scryfall
CASES its type lines so `like` matches identically. That was not a reason to
need the service role, it was a bug wearing one's clothes.

    src/data/homepage-snapshot.json   19 Aug -> 4 Sep, 225.5 kB
    33,035 cards over 98,048 printings
    npm run build                     exit 1 -> exit 0

> **The guard was right the whole time and must stay.** It exists so the
> homepage cannot state card counts from three weeks ago as if they were
> current, and the fix was to make the snapshot refreshable rather than to
> weaken the check.

## Where the engine stands after the rebuild

    the app knows what it does          97.3% -> 97.9%   32,350 cards
    knows nothing about what it does      401 -> 324
    knows what it looks at, not what it does  496 -> 361
    eff:create-token                    2,863 -> 3,138
    add-counters generic AND -self      1,161 -> 748

    fourteen deployed decks   14/14, 82/94 staples
    seven-deck roster         keyed 69%, staples 51/61
    tests                     3,357 passing, tsc clean

## Two readers, and I moved one (4 Sep 2026)

An adversarial review of the `cards_pool` rebuild found a defect I introduced
and did not notice. There are TWO readers of the facet memo:

    cards_pool                     the matview's own join
    public.facets(c cards_unique)  the computed column behind cards_unique.facets

The rebuild moved the first to compiler_version 17 and left the second on 16, so
the same card answered "what do you do" two different ways depending on which
object was asked. **Nothing errors in that state.** The generator reads
`cards_pool` and was correct throughout; anything reading `cards_unique.facets`
was a version behind and would have stayed behind indefinitely.

**THE ORDER, and step three is PLURAL:**

    1. bump the WRITER          facet-memo-fill's COMPILER_VERSION
    2. refill                   both versions coexist, the key is
                                (oracle_id, compiler_version)
    3. move EVERY reader        the matview join AND the function
    4. only then delete the old

Missing one reader is not an error, it is two answers.

**And measure what the PIN MOVE does, separately from the change you meant.**
The `-self` precision rule changes 429 cards; the 16 to 17 move changes a
further 397; and 133 of those flip which branch of the gated/any CASE they take,
because the new version gives them a verb they did not have. That was shipped
inside a migration titled a precision fix, and it was not measured until a
reviewer did it.

Two more findings from the same review, both already covered but worth the note:

- **A rebuilt matview has ZERO column statistics** and the planner will choose
  badly until it is analysed. `analyze public.cards_pool` ran in the same
  statement as the swap; verified afterwards as 15 columns in `pg_stats`. A
  trailing `-- then run analyze` comment would not have been enough.
- **`where not (... = any(...) and not (... = any(...)))` drops a NULL element**,
  where a plain concatenation keeps it. Inert today - measured zero NULL
  elements in `tag_facet_map.facets` - and left as is deliberately.

## Where the engine actually stands, measured on RANDOM commanders

Every other instrument builds the same fourteen, twenty or seven commanders:
the ones whose faults have already been fixed, which is the population least
likely to show a new one. `scripts/probe/random-commander-sweep.mjs` samples the
whole space with a seeded generator and builds against the DEPLOYED function.

Forty random commanders, seed 1:

    built             40/40, none failed
    99 + commander    40/40
    ramp >= 11        40/40, median 19
    lands >= 35       39/40, median 40
    every staple      40/40
    build time        median 1.9 s, slowest 2.8 s

    keyed synergy     median 63%
      under 30%  11      30-59%   8
      60-79%     10      80%+    11

**The spread is the finding, not the median.** Eleven of forty come back under
30% keyed: a competent pile of good cards in the commander's colours that is not
that commander's deck. Melira 6%, Gonti 7%, The Tenth Doctor 10%.

### Strategies per commander, over all 3,363

    offered      7.8   the panel fills its slots
    EARNED       3.2   the ones the commander's own record justifies

    0 earned    59   1.8%        4 earned   405  12.0%
    1 earned   420  12.5%        5 earned   294   8.7%
    2 earned  1011  30.1%        6 earned   206   6.1%
    3 earned   706  21.0%        7+         262   7.7%

**34.7% earn four or more.** The owner's target is 4-10, so two thirds fall
short. `Aggro` is earned by 57% of commanders and `Value engine` by 54%, which
is why "offered" is nearly eight and means much less than it sounds.

### The one constraint upstream of all three shortfalls

The compiler reads **33.3% of cards whole**, and commander reading is the
binding limit at 3.2 loud wants. That single number is why strategies stop at
three, why 28% of decks come back generic, and why 17 benchmark job groups sit
at zero. Every tuning lever tried on 4 Sep moved those by a point or two;
reading more of each commander is the only thing that moves all three at once.

## CORRECTION: commander READING is not the bottleneck. Signal coverage is

The section above says *"the compiler reads 33.3% of cards whole, and commander
reading is the binding limit at 3.2 loud wants"* and names it as the cause of
all three shortfalls. Re-measured 4 Sep 2026 with `commander-read-audit.mjs`
under `FRESH=1`, because this project's own rule is never to measure the engine
against a cache:

    commanders                     3,542
    mean wants per plan             12.1
    ability lines producing NOTHING  534   7.9%
    commanders with ANY unread line  376  10.6%

**Nearly nine in ten commanders have every line read.** The plan holds 12.1
wants and only about three are loud enough to earn a strategy, so the gap is
between what a commander SAYS and what the shells are LISTENING for - a
weighting and vocabulary-coverage problem, not an unread-text one.

`33.3% read whole` is still true and still the right number for the CATALOGUE.
It is the wrong number to explain the strategy count, and quoting it that way
was the "two numbers that are not the same, ever" mistake in a new outfit.

### `scripts/probe/unclaimed-wants.mjs`, and how it overstates

It ranks the facets commanders want that no shell signal claims. That is the
right question and it found five real gaps. It also has a flaw worth knowing
before trusting its ranking:

**IT COUNTS A DERIVED WANT AS UNCLAIMED.** `eff:recur-self` topped the list at
329 commanders holding it loudly, and widening two shells to hear it moved the
earned count by almost nothing - because `PLAN_RULES` hands that want to a
commander BECAUSE it already has `cost:sacrifice` or `trig:dies`, and both
shells already claimed those. The commanders were earning the shell anyway.

A want that is downstream of a claimed want is not a gap. Fix the probe to walk
`PLAN_RULES` and discount derived wants before using its ranking again.

### Offered versus earned, and which one the owner's "4 to 10" means

    offered   7.9 per commander      the panel fills its slots
    earned    3.3 per commander      justified by the commander's own record

    0 earned    39   1.2%       4 earned   427  12.7%
    1 earned   396  11.8%       5 earned   307   9.1%
    2 earned   993  29.5%       6 earned   229   6.8%
    3 earned   696  20.7%       7+         276   8.2%

**36.8% earn four or more.** The two numbers answer different questions and both
are honest: a player CAN pick from about eight, and about three of those are
ones the card itself argues for. `Aggro` is earned by 57% of commanders and
`Value engine` by 54%, which is why the offered figure is nearly eight and means
less than it sounds.

Getting earned to four or more for most commanders is not a tuning job. It needs
either shells that are genuinely narrower - so earning one says more - or more
distinct things read off each commander. Widening signals until everyone earns
everything would move the number and mean nothing.

## The strategy-signal route is EXHAUSTED. Do not spend another session on it

`scripts/probe/unclaimed-wants.mjs` asks which facets commanders want that no
shell hears. It was wrong twice in the same way, and once fixed it says the work
is done.

**It counted redundancy as opportunity, through two paths.**

1. **Derived wants.** `PLAN_RULES` hands a commander `eff:recur-self` BECAUSE it
   already holds `cost:sacrifice` or `trig:dies`. Aristocrats and Reanimator
   claimed both, so those commanders earned the shell anyway. `eff:recur-self`
   ranked FIRST at 329 commanders and teaching two shells to hear it moved the
   earned count 3.2 to 3.3. `PLAN_RULES` is exported now and the probe marks
   such a want REDUNDANT, naming its sources.
2. **The tribe path.** `strategiesFor` earns Tribal from `plan.tribe`, not from
   a signal facet: the Tribal signal is `kw:changeling` alone, because no fixed
   list can name every tribe. A Spider commander wanting `sub:spider` ALREADY
   earns Tribal. Verified on both real Spider commanders - `plan.tribe = spider`
   and `tribal` among their strategies.

**With both modelled the list is nearly empty:**

    commanders under the target of four     2,123 of 3,358
    largest single remaining opportunity       20 commanders

**And the top entries are not opportunities at all.** Every `sub:vehicle`
commander is a DOUBLE-FACED CARD WHOSE BACK IS A VEHICLE - Optimus Prime,
Starscream, Cosima, Slicer, Blitzwing - so a Vehicles shell would be wrong for
every one of them. `sub:saga` is the same shape. A `sub:` facet on a legendary
creature does not mean the deck is that tribe; it can mean the other face is.

### What this leaves

2,123 commanders sit under four strategies because they genuinely do two or
three things, or because eighteen shells have no shell for what they do. A
marginal shell is worth about twenty commanders. That is a SHELL VOCABULARY
question, not a signal question and not tuning, and the honest framing is:

    offered  7.9 per commander   what a player may pick from
    earned   3.3 per commander   what the card itself argues for

Both are true. Widening signals until everyone earns everything would move the
second number and mean nothing, which is exactly what the redundancy above was
doing before the probe could see it.

> The general lesson, now three for three: **before acting on a ranked work
> list, ask what would make its top entry a false positive.** Derived wants,
> second paths to the same outcome, and the back faces of double-faced cards
> have each put a worthless item at the top of a list in this project.

---

## 4 Sep 2026, later — a chosen strategy was a garnish, and half the commanders had no plan

Owner, on a Syr Vondam Blink deck built in the live UI: *"This is one of the
worst blink decks I have ever seen"*, and *"I gave you 2 reference syr vondom
decks before which are soooo good why do none of those cards appear"*, and then
the one that set the direction: *"We cannot be manually changing things for
every commander, that will never work. We need a universal system that can apply
a strategy to 3500 commanders."*

They were right on all three.

### Picking a strategy reached six cards of fifty-nine

`PACKAGE_BUDGET_PER_PACKAGE` is 2 and it was applied to a shell the player
picked BY NAME as well as to a commander's own derived pairs. Three Blink
packages therefore got two cards each, and Syr Vondam's own plan filled the
other fifty-three, so asking for Blink and not asking for it built nearly the
same deck. True for all eighteen shells and every commander.

**`ARCHETYPE_SHARE` was swept 0.6, 0.9, 1.2, 1.5 first and moved the deck by ONE
CARD.** That is the measurement proving the WEIGHT was never the constraint, and
it is the general lesson: if a sweep barely moves the number, the knob is not the
cause. A chosen shell now takes `ARCHETYPE_SLOT_SHARE` (0.35) of the spell slots,
split between its packages by exemplar count, so the Blink shell's own blurb -
*"the deck is made of arrivals"* - buys about eight arrivals instead of two.

    named, the shell's own cards a deck holds, 18 strategies    29 -> 42
    Syr Vondam against two human decks                          20/92 -> 28/92

A package card that fills a role the deck still needs is FREE; one that fills no
needed role spends from a flex budget sized as what is left once the role floors
are paid for. That is also what a good archetype deck IS rather than a
concession: the cards a blink deck wants are Mulldrifter, Wall of Omens and
Skyclave Apparition, and an arrival worth repeating nearly always draws, ramps
or removes something.

### `trig:dies` asked for the card that KEEPS an aristocrats deck going, not the one that starts it

Syr Vondam's plan came out `eff:add-counters` 0.90, `eff:proliferate` 0.80,
`eff:gain-life` 0.70 - **a +1/+1 counters deck assembled from the CONSEQUENCES of
his trigger, with nothing asking for the trigger itself.** Village Rites, a
one-mana sacrifice outlet, scored **0.000** against him, and so did Cloudshift,
Eerie Interlude, Panharmonicon and Wall of Omens: 45 of the 72 cards in the two
human decks scored zero.

The rule produced `eff:recur-self` and nothing else. It now asks for the OUTLET
first, then payoffs, then fodder and recursion - the order `trig:sacrificed`
already measured. Read across the 30 most played `trig:dies` commanders, not a
sample: Teysa, Meren, Syr Konrad, Elas il-Kor, Elenda, Wilhelt, The Scarab God,
Yahenni, Kokusho and the Ojer cycle. Every one wants a sacrifice outlet,
including the "when THIS dies" commanders, which want one so they can die on
purpose.

### Ramp had two floors and both could answer eight

`solveRampFloor` and the hypergeometric presence floor are both questions about
THIS deck, and for Talrand and Sheoldred both answered eight. Real Commander
decks run **eleven at the tenth percentile** of the 192 in `meta_decks`. Ramp now
takes the largest of THREE floors and the third is that measured one.

**Only ramp gets a p10 clamp.** A clamp on every role would put back the tutors
and win conditions the p90 clamp exists to keep out - real medians for both are
ZERO. Ramp is different because its absence stops the game rather than losing it.

    decks below the real ramp floor, 18 strategies    2 -> 0

### `scripts/probe/silent-facets.mjs`: half the catalogue had nothing to say

**1,627 of 3,363 commanders (48%) reach a plan with two or fewer loud wants**, and
for many the entire top of the plan is the protection floor every creature
commander gets so that Swiftfoot Boots can be chosen. That floor was never meant
to BE the plan. When it is, the deck is built around keeping the commander alive
rather than around what the commander does, and that is what "the deck doesn't
feel like mine" actually is.

Quake, Agent of S.H.I.E.L.D. and Sidar Jabari are **`rec:full`** - every clause
read - and still produce five wants, all of them floor. **So this is NOT the
reading gap `commander-read-audit` measures.** Reading a card and representing
what it WANTS are two different jobs and only the first had ever been counted.

The probe ranks facets a commander carries that produce no want, by how many
THIN commanders carry them. Each row is a candidate plan rule and the count is
how many commanders it would give something to say.

**Two top rows are traps.** `sub:human` (599) - being a Human does not make the
deck Human tribal, the same shape as `sub:vehicle` being the back face of a
double-faced card. `cares:type:creature` (562) - nearly every commander cares
about creatures and the creature floor already answers it.

`trig:attacks` (216) was the first row taken, and it is unambiguous: Etali,
Aurelia, Goreclaw, Karlach, Drakuseth, Isshin, Alesha, Moraug. Every one paid for
attacking, every one wanting another combat, a way through, haste and an untap.
`eff:pump` is deliberately excluded from it - on 4,344 cards, a fifth of the
pool, so asking for it says nothing about a deck.

### The trigger carried WHOSE and WHICH STEP all along

`trig:enters` (263 thin), `trig:cast` (131) and `trig:step` (208) were the next
three rows and all three were refused as plan rules, because one flattened word
names two opposite decks:

    trig:enters   Ghalta triggers on HERSELF, so the deck wants to blink her.
                  Tatyova and Purphoros trigger on OTHER permanents arriving.
    trig:cast     Birgi and K'rrik are paid when YOU cast - spellslinger.
                  Lotho, Mangara and Kambal when an OPPONENT casts - stax.
    trig:step     upkeep, end step and beginning of combat are three cards.

The DSL has carried `{on:'cast',what,by}`, `{on:'enters',who}` and
`{on:'step',step,whose}` since it was written. **This is the `effect.who` finding
of 1 Sep repeated on triggers: a mandatory field, present on every emission,
read by nothing.**

A SEPARATE WORD, NOT A QUALIFIER, for the reason `eff:exile-own` is one: a plan
rule asks whether ONE facet is present. Base facets are still always emitted, and
unknown stays unknown - an absent `by` adds no word rather than guessing, which
is what produced the 574 misfiled cards the `effect.who` split had to undo.

    trig:enters-self       4,425 cards    trig:cast-own          645
    trig:enters-other        775          trig:cast-opponent      83
    trig:step:end            165          trig:step:begin-combat 113

Four plan rules sit on the split words. `trig:cast-opponent` deliberately has
none yet: 13 commanders, and a stax plan is a different piece of work.

### Where it stands, measured against production on compiler 18

    forty RANDOM commanders (seed 1, deployed function)
      keyed synergy median        57% -> 66% -> 70%    (63% before the session)
      under 30% keyed             12 -> 8
      80%+ keyed                  12 -> 15
      built / staples / lands     40/40, 40/40, 40/40
      ramp >= 11                  39/40   Hama, the Bloodbender lands on 10

    fourteen deployed decks       14/14, staples 82 -> 83/94
    eighteen strategies           named 29 -> 42, decks under the ramp floor 2 -> 0
    thin plans                    48% -> 45% (trig:attacks alone, stored facets)
                                  64% -> 60% (all four rules, compiled locally)
    tests                         3,357 passing, tsc clean

### Still wrong, measured

- **Hama, the Bloodbender finishes on 10 ramp against the floor of 11.** The
  build log says "Fills a ramp gap (9 of 11)", so the engine knows and ran out of
  room rather than out of candidates. Not a regression - before the third floor
  existed it would have asked for 8 and nobody would have looked - but it is the
  one rule that does not negotiate.
- **`eff:exile-own` is on 102 pool cards and 29 of 100 blink-shaped cards lack
  it**, Ghostly Flicker at rank 587 among them. Several carry `eff:protect` and
  `eff:return-from` instead, so the compiler reads them as a protection trick.
- Cards past EDHREC rank 15,000 across the 14 deployed decks went 7 -> 9.
- `trig:step:end` (165 commanders) and `trig:step:upkeep` (78) have no plan rule.

### The overlap trap, again

`scratch/_blink.mjs` scores Syr Vondam against two human decks and reported
"worth blinking 3 of 30", which reads as a deck with no ETB creatures in it.
Counted on its own terms the same deck holds **18 arrivals worth repeating and 10
ways to blink**. Overlap rewards copying and punishes a different-but-correct
card, which `commander-bench` already says in its own header. Both numbers are in
that probe now; read the second one first.

---

## 4 Sep 2026, later still — the commander was read worse than every other card

### Where it stands, against the DEPLOYED function

    forty RANDOM commanders (seed 1)          start of day     now
      keyed synergy, median                        63%          75%
      decks that come back generic (<30%)       12 of 40      3 of 40
      strongly on-theme (80%+)                        12           15
      built / 99 cards / lands >= 35             40/40        40/40
      ramp >= 11                                 40/40        40/40
      every named staple                         40/40        40/40
      NOTHING flagged                            39/40        40/40

    fourteen deployed decks    14/14, 83/94 staples, 9 past rank 15,000
    eighteen strategies        ramp 12 to 27, none below the real floor
    thin commander plans       48% -> 38%
    tests                      3,357 passing, tsc clean

### THE COMMANDER WAS READ BY THE COMPILER ALONE

Every card in a build is read from `cards_pool`, which is
`compiler_facets || tag_facets` - the community's reading merged in wherever our
compiler is silent. **The commander was read by `facetsForCard` alone**, the
compiler half, and the commander is the card the entire plan is derived from.

Sephara, Sky's Blade compiles to two KEYWORD abilities and two clauses the
compiler refuses, so she carried no `eff:gain-life` and her plan came out
**EMPTY**. An empty plan reaches the "has combat keywords and no other ability we
can read, so the deck is built around getting it through" fallback, and an Angel
who gives your whole team lifelink was built as **VOLTRON**, around Sram, Kor
Spiritdancer and Hero of Iroas. She reads as Lifegain now.

The fallback is right where it applies, and its own sentence says *"we can
read"*, which is honest about being an inference from silence. The fix was to
stop the silence being ours.

> `cards_unique.facets` CANNOT BE SELECTED - it is computed over
> `card_facet_memo`, which `anon` holds no grant on, and asking returns 401. The
> commander's facets come from `cards_pool` in a second narrow read, the same
> shape `landPoolFor` uses for the same reason.

### `preferred` guaranteed ORDER and never guaranteed PLACEMENT

Spider-Punk's build log said *"Sol Ring, Arcane Signet, Swiftfoot Boots,
Lightning Greaves go in every Commander deck"* and the deck held three of them.
Boots got in through the commander-fit reserve because it grants hexproof, which
the survival floor asks for; Greaves grants shroud, scored a fraction lower, and
fell through every pass. Two nearly identical cards, ranks 12 and 13, named by
the same sentence, one missing.

`orderPreferredFirst` puts these first INSIDE each pass, and a pass whose budget
runs out before reaching them simply never takes them. A combo piece carried the
same risk, and half a combo is a dead card - which is why those ids were made
preferred in the first place.

They are **PLACED** now, before anything else spends a slot. Same argument the
file already makes about reserved budgets: a slot is only reserved if it leaves
the budget before the loop that would otherwise spend it, and **the same is true
of the CARDS**. The colourless cap also had no exemption for them though the role
ceiling already did, and all four staples are colourless.

### THE MANA GUARANTEE, and a message that had lied three times

`fillTo` only ever ADDS and breaks on `picked.length >= spellSlots`, so a deck
that reaches 99 cards short of its ramp floor could never be rescued. Ramp below
its floor now SWAPS: the worst card that is not preferred, not a land, and not
the last of some other job.

**The first version gave up TOXIC DELUGE** for The Warring Triad, because the
pass picks the lowest SCORE and this file already records that the score's blind
spots are exactly where the format's staples live. Popularity is the second
opinion it does not have, so a swap may never hand over a card people play for
one they do not - the same rule `deck-optimizer` uses.

**"could not be filled from the legal pool" was printed for two different
causes** and had misled three investigations. An empty pool is a colour with few
answers and nothing can be done; a full deck is this engine's own budget and can
be. Hama reported "11 of 11 ramp slots could not be filled" while holding ten, in
mono-blue-black. It also ran MID-BUILD, counting only what the quota loop placed
and missing every staple, combo piece and reserved pick, so it reported
interaction, enhance and wincon short on a deck that had them. Computed at the
END now, counted by ROLE, and it says which of the two happened.

### `scripts/probe/silent-facets.mjs`, and the plan-rule route running out

Ranks the facets a commander carries that produce NO want, by how many THIN
commanders (two or fewer loud wants) carry them. Each row is a candidate plan
rule and the count is what it would buy.

Two rules taken from it, both read across the whole population as a player:

    trig:attacks        216   Etali, Aurelia, Goreclaw, Isshin, Alesha, Moraug.
                              Wants another combat, a way through, haste, untap.
    trig:deals-damage   128   Toski, Rankle, Edric, Grenzo, Tinybones, Fynn.
                              Paid only when the damage LANDS, so evasion is the
                              want and extra combats sit lower - a second combat
                              with a blocked creature is a second nothing.

`eff:pump` is excluded from both: on 4,344 cards, a fifth of the pool.

**REFUSED, with the reason, so nobody retries them:**

    sub:human 517          being a Human does not make it Human tribal, and
                           plan.tribe already earns Tribal where it is real
    cares:type:creature    nearly every commander cares about creatures
    kw:indestructible 75   mixes Avacyn, whose deck wants board wipes, with
                           Toski, a go-wide deck where a wipe is a disaster
    mv:big / pt:big        Purphoros, Aesi, Gitrog and Old Gnawbone are big
                           value engines that never attack
    mv:cheap 203           being cheap names no deck either
    acost:1 / acost:3      an activated ability is not a strategy
    the tribal sub: rows   a sub: facet on a legendary creature can be the
                           other FACE, and the tribe path already covers it

That is most of what is left, so **the plan-rule route through silent facets is
close to exhausted.** What remains needs the compiler to read more of each
commander, not more rules over the same words.

> **The probe counted redundancy as opportunity, twice.** `trig:enters` sat near
> the top with 146 commanders and every one already had a plan, because the base
> facet is emitted alongside `trig:enters-self` and the rule sits on the split
> word. Verified ZERO commanders carry the base without a split. It now treats a
> more specific word from the same clause as that facet speaking.
> `unclaimed-wants.mjs` records being wrong this way twice; this was the third.

### "and/or" is "or", and Ghostly Flicker compiles

`parseObject` reads "target artifacts **and** enchantments" and "target artifacts
**or** enchantments" and returned NULL for "target artifacts **and/or**
enchantments" - the same set of cards said a third way. A null selector fails the
whole rule, so the card compiled to nothing at all.

    Ghostly Flicker   #587    manual -> FULL, and it carries eff:exile-own
    Force of Vigor    #1024   nothing -> eff:destroy
    Mondrak           #426    nothing -> cost:sacrifice, a real outlet

Done in `normalizeParagraph` so every rule gains it at once. The rewrite is exact:
"up to two target artifacts and/or enchantments" allows one of each or two of
either, which is what the `or` filter already means with the count carried
separately.

    read the whole card   10,988 -> 11,003     unread clauses  20,799 -> 20,776

> ⚠️ **A LITERAL BACKSPACE BYTE went into the word boundary**, which is the second
> time this repo has recorded that exact bug - CLAUDE.md has it from 1 Sep, where
> it made a probe print 100% coverage. The regex matched nothing, the
> normalisation silently did not happen, and the trace still showed zero
> abilities, so it looked like the fix being WRONG rather than ABSENT. Write a
> regex from character codes when a shell and a heredoc are both in the path.

**NOT LIVE.** These facets reach the app only after a compiler version bump, a
refill and both readers moving. Held until more compiler shapes are worth one
bump; the unparsed tail beyond this is mostly LANDS, which the mana solver
handles without facets.

### The instruments lied five more times

Each cost real time and every one is the same class this file keeps recording.

1. **`cards_pool` has no `oracle_text`** by design, so a query selecting it
   returns an error object rather than an array.
2. **`FacetResult` has no `unparsed` field.** A probe reading it counted 0 cards
   with an "and/or" clause when the real answer was 62. `compileWithTrace` is the
   call that carries unparsed spans.
3. **Grepping the BUILD LOG for a card name reports success on a deck that does
   not hold it.** "Sol Ring, Arcane Signet, Swiftfoot Boots, Lightning Greaves go
   in every Commander deck" is what the pass INTENDED. `scratch/_one.mjs` checks
   all four against the DECK now.
4. **`_one.mjs` had no SHOW block**, so a grep for the deck list matched nothing
   and read as "the card is missing" rather than "nothing was printed".
5. **A wide scan of `cards_unique` with the fat columns returns 57014.** Take
   names from `cards_pool`, which is thin and indexed, then fetch the text by
   name in chunks.

---

## Compiler 19, and a strategy you NAME is not a strategy we guessed

### Three grammar gaps, all of the same shape

A null selector fails the WHOLE rule it appears in, so each of these made a card
compile to nothing rather than lose one clause. That is why a card at rank 90 can
be completely invisible to the engine over one token.

    "and/or" is "or"        parseObject read "target artifacts and enchantments"
                            and "target artifacts or enchantments" and returned
                            null for the third way of saying the same set.
                            Ghostly Flicker #587 manual -> FULL with
                            eff:exile-own; Force of Vigor #1024 -> eff:destroy;
                            Mondrak #426 -> cost:sacrifice, a real outlet.

    "one or more X"         a LOWER BOUND, refused by the quantifier parser.
                            Wizards writes a trigger's subject this way whenever
                            the event can happen to several things at once.
                            Deliberately NOT marked `countBounded`: that flag
                            means "exactly this many and no more", which is the
                            opposite claim and is what stops "two creatures you
                            control" collapsing into every creature.

    "with power N or less"  `CardFilter` has always been
                            {is:'power'|'toughness'|'mana-value'} and only the
                            PARSER was narrower than the type it builds, so
                            "creature with power 4 or greater" refused on the
                            word "power" while "card with mana value 4 or
                            greater" read fine. Garruk's Uprising #90 went from
                            nothing to trig:enters, eff:draw, grants:trample.

    read the whole card   10,988 -> 11,070      unread clauses  20,799 -> 20,681

**166 of the 4,000 most played cards carry an unparsed trigger whose event
contains " or ", and most of them are NOT dual events** - they are comparisons
wearing the same word. `scratch/_dualtrig.mjs` ranks them; the genuine
two-event triggers ("when this enters or dies") are about ten cards.

### A CHOSEN strategy and a DETECTED one are different claims

Both were getting 35% of the spell slots. The engine's guess is one of eighteen
picked by a cosine and belongs in proportion behind what the commander's own
record says. A name the player typed is the whole reason they are on the page.

`BuildInput.archetypeChosen` carries the distinction, set from
`archetype != null` in the pipeline - `archetype` is the request,
`derived` is the engine's reading.

**This only became visible once the commander was read properly.** Syr Vondam is
paid for creatures dying AND for creatures being exiled, so the moment his own
aristocrats plan was read it competed for every blink slot: correct for the
commander, wrong for somebody who asked for Blink by name.

Swept against the two human decks. `ARCHETYPE_SLOT_SHARE_CHOSEN = 0.45`:

    share   total   arrivals   ways to blink
    0.35    23/92      15            8
    0.45    31/92      20           10        <- shipped
    0.50    29/92      19           10
    0.60    29/92      20           11        drifts to obscure cards that
                                              happen to blink (Vault 13)

    Syr Vondam + Blink, DEPLOYED, against two human decks
      total                  20/92 -> 31/92
      things worth blinking    2/30 -> 6/30    Wall of Omens, Spirited
                                               Companion, Solemn Simulacrum
      ways to blink            4/17 -> 7/17    Conjurer's Closet, Felidar
                                               Guardian, Eldrazi Displacer

The forty-random-commander sweep is UNCHANGED at 40/40 clean and keyed 75%,
which is the right outcome and worth stating: that sweep names no strategy, so
this constant cannot reach it. A change that moved it would have been a bug.

---

## Nature's Lore was blocking Llanowar Elves, and the shape check was reading tags

### `deck-shape-check` measured one side with facets and the other with tags

It builds a deck and classifies it with `cardRole`, passing
`facets: card.facets ?? []`. **A RESPONSE CARD CARRIES NO FACETS**, so that was
always an empty array and `cardRole` fell through to the TAG door. The yardstick
side, `real-deck-roles.mjs`, reads facets out of `cards_pool`. Two vocabularies,
one subtraction, and the difference reported as a fault - the exact bug this
file already records being fixed once: *"the ramp TAG has a median of 9 and the
ramp ROLE has a median of 16."*

    role checks inside the real range    154/200 (77%)  ->  177/200 (89%)

**RAMP CAME OFF THE LIST ENTIRELY.** It was the worst row at eleven of twenty
decks outside 11-21, and Prosper, Tome-Bound was reported at 43 against a real
maximum of 31. Classified by ROLE the same deck holds 21, which is exactly the
p90 ceiling working. I was one edit from loosening a ceiling that was correct.

The new worst row is `tutor`, 9 decks at 3 against a real p90 of 2, and it is
**not a fault**: all three are FETCH LANDS carrying `eff:search-library`. The 192
real decks are precons and precons do not run fetches, so being above that band
is being better than the yardstick. Not fixed by narrowing `cardRole` so a land
serves no spell role - defensible, and both probes would move together, but
`REAL_DECK_ROLES` feeds the engine's floors and ceilings, so the blast radius is
every deck for a payoff of one cosmetic row.

### THE ORDER OF THE PACKAGE PASSES, and a severe failure it hid

Kinnan, Bonder Prodigy's entire card is *"whenever you tap a nonland permanent
for mana, add one more"*. His deck held **three** creatures that tap for mana and
not one was a mana dork.

The package existed and asked for exactly the right thing. The build log reads:

    Big mana Acceleration 10/10   Nature's Lore, Three Visits, Skyshroud Claim,
                                  Wood Elves, Ranger's Path ...
    creatures that add mana 0/2   nothing

The shell's packages ran FIRST and its ramp SPELLS filled the ramp role to its
p90 ceiling of 21; `overRoleCeiling` then refused every dork behind them. Every
step was locally correct and the ORDER was the whole fault.

**The commander's own packages pick first now.** This file already argues that
the most specific pass must go first, because a broader one takes the cards a
narrow one needs - it made that argument for packages against the quota loop and
stopped one level short. A commander's package is a conjunction about THIS
commander; a shell's is about a generic archetype eighteen commanders share.

    Kinnan, creatures that tap for mana   3 -> 10
      Birds of Paradise, Llanowar Elves, Arbor Elf, Heritage Druid, Fanatic of
      Rhonas, Hulking Raptor ...

**And PLAYED CARDS FIRST inside a package**, two sweeps, the same shape `fillTo`
uses. Fit was the only key, which was tolerable while the shell picked first and
left little behind it, and stopped being tolerable the moment the commander's
packages began picking from a full pool: the reorder ALONE took cards past rank
15,000 from 8 to 11. A rank tie-break was already there and did not help, because
the cards being reached for do not TIE on fit, they win on it.

    twenty commanders   jobs 18 -> 19, groups at zero 24 -> 22, past 15k 8 -> 6
    fourteen deployed   past 15k 9 -> 6
    eighteen strategies named 39 -> 40, Blink 2 -> 3
    forty random        40/40 clean, keyed 73%

### REFUSED, measured: a proportional budget for the commander's own packages

The hypothesis was that the shell was starving them by BUDGET - it takes 45% of
the spells when the player names it, while the commander's own packages stayed
on a flat two per package. Neutral at 0.10 and 0.15 and worse at 0.20, because
`2 * count` was already the larger of the two for these commanders. It was
starving them by ORDER, not by budget.

### The archetype share is a genuine trade-off, and here is the table

Raising what a NAMED shell gets buys archetype fidelity and pays in the
commander's own jobs. Measured across both yardsticks, monotonic, no knee:

    chosen share   bench jobs   past 15k   Syr Vondam vs two human decks
       0.35            21           5              23/92
       0.38            21           5              23/92
       0.40            19           7              27/92
       0.42            19           7              27/92
       0.45            18           8              31/92     <- shipped

Groups at zero were FLAT at 24 across the whole sweep, so the share was never
creating "cannot do it at all" failures, only moving jobs from just-met to
just-short. 0.45 is shipped because the owner complained twice, specifically,
that a named strategy was not honoured, and never about the job benchmark. The
package reordering above then recovered a job and three unplayed cards anyway.

> **Two yardsticks disagreeing is information, not a problem to tune away.**
> `commander-bench` job lists are typed from knowledge and measure the
> COMMANDER; `_vondam.mjs` scores against two real decks and measures the
> ARCHETYPE. When they disagree, say which question each is asking before
> picking a number.

---

## Every deck had no top end, and the benchmark was scoring overlap

### `commander-bench` said it scored capability and checked a name list

Its own header says it scores *"whether the deck can DO each job"* rather than
overlap, *"because overlap rewards copying and punishes a different-but-correct
card"*. The implementation checked a typed list of a dozen card NAMES, which is
overlap at the group level, and it was wrong in the way overlap is always wrong:

    Prosper, Tome-Bound    "impulse draw 0/8"      the deck held TEN cards
                                                   carrying eff:impulse
    Xenagos                "huge creatures 0/6"    it held six with pt:big

A group is now ALSO scored by what its own examples AGREE on - the same move
`planForArchetype` makes for a shell package, so nothing is typed. Both numbers
print side by side and a job passes if either clears the floor, so it can only
turn a false negative into a pass.

    jobs done       19/71 -> 32/71        groups at zero   22 -> 17

**THE DECKS DID NOT CHANGE. The old number was wrong, not the product.**

Two guards, both measured, because the first version turned everything green -
47/71 and 14 zeroes, which is not an improvement, it is an instrument that
stopped discriminating:

- the shared facets must be agreed by TWO THIRDS of the examples, and words most
  of the pool carries (`type:creature` and friends) cannot define a job;
- **a conjunction matching more than a FIFTH OF THE SPELLS is not a job.**
  Measured against the whole deck at a quarter it let "Curiosity effects on Niv"
  claim 21 cards including Urza's Command and Archmage of Runes - cards that
  draw, which is all its examples agreed on, and lands in the denominator made
  that pass. At 25% of the deck, "cheap cantrips that target your own creature"
  claimed Wheel of Fortune.

Read as a player at the shipped setting the rescues are right: Woe Strider and
Cauldron Familiar for "creatures that come back after dying", Seedborn Muse and
Teferi for "untappers that make infinite mana", Rancor for "things that come
back after being sacrificed".

### ALL TWENTY decks had no top end

Measured with `scratch/_topsweep.mjs`: every one held fewer than four cards at
mana value 6 or more, the median was ONE, and eight held NONE. Brago, Yuriko,
Prosper, Feather, Chulane and Edgar Markov all came back with a deck whose most
expensive spell cost five. Real decks run four at the tenth percentile and NINE
at the median.

Two faults, both inside machinery written to prevent exactly this.

**THE BAND WAS SCALED TWICE.** `REAL_DECK_TOP_END` is measured over all 99 cards
of 192 real decks, and every card at mana value 6+ is a SPELL, because a land's
mana value is zero. `topEndTargetFor` multiplied it by `slots / 99`, turning the
documented floor of four into TWO and the median of nine into five. The doc
comment directly above says *"a commander who says nothing about size still gets
four"* - the code contradicted its own stated intent.

**THE PROTECTION COVERED THE INCREMENT, NOT THE FLOOR.** The loop marking
top-end picks `preferred` - so the review rounds cannot swap them out for cheaper
cards, a fault this file already records and fixed once - started at
`beforeTopEnd` and covered only what THAT fill added. A deck already holding
three of its four got ONE protected and three left fair game, and the later
passes cut those three:

    Brago   [topend] floor 4, have 3, after: 4      finished deck held ONE

Which cards the fill happens to add is an accident of what came before it; the
floor is a statement about the FINISHED deck. The protection walks the whole
list now.

    decks below the real top-end floor   20/20 -> 0/20
      Kinnan    2 at mv6+ -> 9   (4 creatures)
      Animar    2 -> 9           (8 creatures)
      Xenagos   3 -> 8           (8 creatures, and his job is "huge creatures
                                  worth doubling")

    twenty commanders   jobs 32 -> 34, groups at zero 17 -> 14
    deck shape          89% of role checks in range, unchanged
    forty random        40/40 nothing flagged, keyed 73%, unchanged

The cost, measured and small: shell cards held across the eighteen strategies
40 -> 37, deployed staples 83 -> 82, cards past rank 15,000 on the fourteen
deployed decks 6 -> 8.

> **The lens that found it.** Not a probe - a job group at zero on three
> different commanders that all named the same thing, "big creatures". Three
> zero groups sharing a noun is a question about the deck, not about three
> commanders.

---

## Compiler 20, and the swap that needs a VACUUM in the same session

Two words the compiler tripped on, both found by the same method.

    "Choose one."   the Commander "Will" cycle writes its modal head with a
                    FULL STOP and a following sentence instead of the classic
                    em-dash. The head regex required the dash, so the whole card
                    was refused: JESKA'S WILL (rank 104) and AKROMA'S WILL (rank
                    189) compiled to NOTHING. 17 cards use this wording.

    "tapped"        "Create thirteen TAPPED 2/2 black Zombie creature tokens"
                    refused because the count had to sit immediately against the
                    power and toughness. `tapped` is a field the DSL has always
                    carried on `create-token`, so reading it is exact.
                    "tapped AND ATTACKING" is still refused - there is no
                    `attacking` field and half of that fix is worse than none.

    read the whole card   11,069 -> 11,090     unread clauses  20,681 -> 20,556
    forty random          40/40 clean, keyed 73% -> 76%

### VACUUM IMMEDIATELY AFTER A MATVIEW SWAP, NOT JUST ANALYZE

A rebuilt materialized view has no visibility map, so every index-only scan
falls back to the heap. `analyze` ran inside the swap statement and **was not
enough**: the very next commander query - `cards_pool` filtered on
`commander_legal` and walked by rank - returned **57014, a statement timeout**,
against the 3 s cap the anon role carries.

**That is the generator's own pool query.** Between the swap and the scheduled
`cards-pool-vacuum` at 07:05, a real player's build would have failed. Three
swaps were done today and this is the first time the timeout appeared, so it is
a race rather than a certainty, which makes it worse rather than better.

`vacuum (analyze) public.cards_pool;` as its OWN statement fixed it at once. It
cannot be folded into the swap: VACUUM refuses to run inside a transaction block
and a multi-statement command IS one.

### How the compiler work was found, and the method is worth keeping

`commander-bench` said Prosper could not do "impulse draw" AT ALL. The deck held
TEN impulse cards. The real failure was that only **6 of the 13 canonical impulse
cards** in the group carry the facet, so the group's examples could not agree on
anything and the capability measure went silent.

> **A job scoring zero on BOTH measures at once is a question about the
> COMPILER, not the generator.** Zero by name and zero by capability means the
> engine cannot see the archetype's own defining cards.

Then, two population reads:

- **`knowledge_band = 'nothing'` is spent.** Only 24 commander-legal cards are
  in it and the most played is rank 1,052 - Platinum Angel, No Mercy, Paradox
  Haze, Fist of Suns. All static or replacement effects, genuinely hard, and
  worth little to deck building.
- **`looks-at-only` is where the work is** - knows what a card LOOKS AT and not
  what it DOES. Read as a player it showed two clusters: COPY SPELLS (Narset's
  Reversal 728, Reverberate 1,406, Reiterate, Cackling Counterpart, Increasing
  Vengeance, See Double, Clone Legion) and TOKEN MAKERS (Army of the Damned,
  Storm Herd, Call the Coppercoats).

The copy cluster is still open: "Copy target instant or sorcery spell" has no
rule at all, and `Cackling Counterpart` is refused as `copy-layer`, which is a
deliberate refusal rather than a gap.

### The modal cluster, sized

65 of the 4,000 most played cards are modal with at least one unread clause,
53 after this change. The remainder are not one rule:

- the SIEGE cycle ("As this enchantment enters, choose Khans or Dragons") has
  bullets that are whole TRIGGERED ABILITIES rather than effect phrases, so the
  modal reader's `compileEffectBody` cannot take them;
- Pyroblast, Sheoldred's Edict and Mystic Confluence each fail on their own mode
  bodies.

CLAUDE.md's older note is right that each mode body is a different hard problem.
What was NOT true is that the wrapper always worked - it did not for 17 cards.

---

## The copy-spell tag mapped the "looks at" word and never the verb (5 Sep 2026)

Eight of the nine best-known copy spells sat in `knowledge_band =
'looks-at-only'` with NO VERB AT ALL: Narset's Reversal (728), Reverberate
(1,406), Reiterate, Increasing Vengeance, See Double, Clone Legion, Twincast,
Fork. They carried `cares:type:instant`, `cares:type:sorcery` and
`cares:zone:stack`, so the engine knew what they LOOKED AT and not what they DID,
and no role or plan rule could reach them.

**The DSL has no `copy` effect member**, so the oracle-text compiler cannot
produce one and the tag is the only source. The `clone` tag has mapped to
`eff:copy` for clone CREATURES all along; `copy-spell` is the spell half of the
same idea and got only the zone word.

    eff:copy in the pool          468 -> 585 cards
    knows what it LOOKS AT only   361 -> 345
    eighteen strategies           shell cards held 37 -> 40
    Talrand + Spellslinger        12 copy cards

No compiler bump: the merge lives in the `cards_pool` view, so a
`tag_facet_map` change reaches the app on a refresh - followed by
`vacuum (analyze)` as its own statement.

### The method that found it, now three for three

1. `knowledge_band = 'nothing'` is SPENT. Only 24 commander-legal cards are in
   it and the most played is rank 1,052 - Platinum Angel, No Mercy, Paradox
   Haze, Fist of Suns. Static and replacement effects, genuinely hard, and worth
   little to deck building.
2. **`looks-at-only` is where the work is.** Read its most played members as a
   player and look for a SHAPE. It gave `eff:neutralise` on 4 Sep and the copy
   cluster today.
3. Ask whether the Tagger already names the shape before writing a compiler
   rule. Three of the last four vocabulary gains needed no version bump at all.
4. Read the whole tag, not eight samples - 24 of 24 correct here, which is what
   justified `gated`.
5. Give the word a consumer in the same commit. `eff:copy` had TWO and no
   producer for these cards, the fifth instance of that shape.

> ⚠️ **`scryfall_card_tags.oracle_id` is UUID now, not TEXT.** CLAUDE.md said the
> join needs `oracle_id::text = cards_unique.oracle_id` and that is stale - both
> sides are UUID and the cast belongs on the `scryfall_card_tags` side, or on
> neither. Two queries failed on `operator does not exist: uuid = text` before
> this was noticed.

---

## `scales-with-power` had no mapping, so Ghalta was a 12/12 in a deck of two-drops

Scryfall Tagger has named this shape on **405 cards** for months and it mapped to
nothing, so Ghalta, Primal Hunger (rank 460) sat in `looks-at-only` with NO VERB.
Her entire card is *"this spell costs {X} less to cast, where X is the total
power of creatures you control"*. So did Selvala, Heart of the Wilds (413) and
Marwyn, the Nurturer.

**A CARES WORD, NOT A VERB, and that is the whole judgement.** Read across the 16
most played members they DRAW off power (Return of the Wildspeaker, Rishkar's
Expertise, Greater Good), make MANA off power (Selvala, Marwyn, Kami of Whispered
Hopes), deal DAMAGE off power (Terror of the Peaks, Warstorm Surge) and COST LESS
for power (Ghalta, The Great Henge). One verb would be a lie about most of them.
What they share is the thing they LOOK AT.

    PLAN_RULES   cares:power -> pt:big 0.7, mv:big 0.4

`pt:big` first because power is the axis the tag names: a cheap enormous creature
is what these decks want and an expensive small one is not. The word does nothing
on a non-commander, which is correct - `planFit` matches a card's facets against
the COMMANDER'S WANTS and no want is `cares:power`.

    cares:power in the pool   0 -> 573       Ghalta's loudest want is now pt:big
    Ghalta's deck             9 cards at mv6+, 8 of them creatures

### 75 played cards are blocked by ", where X is …", and there is no big win in it

`scratch/_wherex.mjs`. The trailing clause defines a count used earlier and the
rules refuse the whole phrase. The head shapes are heterogeneous - the largest is
"this spell costs {X} less to cast" at EIGHT cards, then "{T}: add X mana of any
one color" at four. 400+ cards say the words and only 75 are blocked by them,
because most say it inside a clause the compiler already handles.

Ghalta and The Great Henge were two of the eight, and the TAG route reached them
without a compiler rule at all.

> **CORRECTION.** CLAUDE.md said `eff:reduce-cost` was added because *"Ghalta
> (461) carried NO facet at all, her whole card being a cost reduction"*. The
> facet was added and **Ghalta never got it**: her own wording,
> "This spell costs {X} less to cast, where X is …", is still unread by the
> compiler today. Whatever `eff:reduce-cost` was measured on, it was not her.
> Read the card, not the note.

### The bench and the tag maps disagreed, and the bench is the weaker witness here

The two tag mappings moved the twenty-commander bench from 34 jobs to 32 while
taking groups at zero from 14 to 13. The `cares:power` PLAN RULE measured
NEUTRAL there - and it must, because none of those twenty commanders scales with
power, so the bench cannot see it. Neutral on an instrument that cannot observe
the change is not evidence.

Measured where it can be seen: Ghalta's deck went to 9 cards at mana value 6+
with 8 creatures, and her plan's loudest want is `pt:big`.

---

## A commander that can bounce wants things worth bouncing (5 Sep 2026)

Chulane, Teller of Tales carries `eff:bounce-own` from his own activated ability
- *"{3}{G}{U}: Return target creature you control to its owner's hand"* - and NO
RULE READ IT. His plan wanted `type:creature`, `eff:copy` and `eff:draw`, and
nothing about the thing the ability is for. His deck held ZERO cards worth
bouncing and the benchmark job has sat at 0 of 3 since 3 Sep.

**TWO WANTS, and it needed both.** Arrivals worth repeating
(`trig:enters-self`) are what makes a bounce worth making; more bounce outlets
(`eff:bounce-own`, self-referentially, the shape `trig:dies` already uses) are
what makes it repeatable. With only the first the job stayed at ZERO while the
plan asked for arrivals at 0.75 - the deck was full of things worth bouncing and
had nothing to bounce them with.

Only 16 commanders carry the facet and they are uniform: Kogla, Chulane, Cid
Freeflier Pilot, Arcanis, Satsuki, Drafna.

    Chulane   jobs 2/4 -> 3/4
              "bounce your own creatures" 0/3 -> 3/3: Kogla, Whitemane Lion,
              Jeskai Barricade

### The benchmark could not see it, for the second time

The deck held FIVE bounce cards and the job scored 1 of 3, because only 6 of the
11 named examples carry `eff:bounce-own` and the capability measure needed two
thirds of them to agree. **The missing five are cards the COMPILER cannot read,
not cards that do something else**, so the threshold was measuring OUR READING
rather than the group's coherence. Prosper's impulse draw was the same at 6 of 13.

A MAJORITY now. The specificity guard is what keeps that honest: a conjunction
matching more than a fifth of the spells is thrown away whatever agreed on it.
Read as a player the rescues are right - Meathook Massacre and Blood Artist for
"payoffs when creatures die", Ramunap Excavator for "lands back", Consecrated
Sphinx for "high mana value cards to reveal off the top".

    twenty commanders   jobs 32 -> 35, groups at zero 13 -> 9

### REFUSED, measured: raising the commander's own package budget

14, 18 and 22 gave IDENTICAL results on every number - jobs, zero groups, cards
past rank 15,000, shell cards held, ramp breaches. The pass was never
slot-limited: all EIGHT of Chulane's packages filled 2/2. That is the second
time today a budget was blamed for something ORDER or MEASUREMENT was doing, and
the third time this session that "the knob is not the cause" held.

> **The pattern to carry forward.** When a job reads zero, ask three questions in
> this order: does the deck actually hold the cards (`scratch/_conj.mjs`), can
> the measure see them (`scratch/_shared.mjs`), and only then is it the
> generator. Three of the last four "generator failures" were one of the first
> two.

---

## The job benchmark went from 19 to 45 on the same decks (5 Sep 2026)

Four corrections to `commander-bench.mjs` in one session. **The decks did not
change in any of them.** The instrument was measuring the wrong thing, and it
had been the loudest number in every report for days.

    jobs done      19/71 -> 32 -> 35 -> 38 -> 40 -> 45/71
    groups at zero    22 -> 17 -> 13 ->  9 ->  8 ->  7

1. **It scored OVERLAP while its own header claimed capability.** A job was a
   typed list of a dozen card NAMES. Prosper was "impulse draw 0 of 8, cannot do
   it at all" while holding TEN cards carrying `eff:impulse`. Jobs are now also
   scored by what a group's own examples AGREE on - nothing typed, the same move
   `planForArchetype` makes for a shell package.

2. **Two thirds of the examples had to agree, and that measured OUR READING.**
   Only 6 of 13 canonical impulse cards carry the facet; only 6 of 11 bounce
   cards do. The missing ones are cards the COMPILER cannot read, not cards that
   do something else. A majority now.

3. **The specificity guard punished success.** It measured a conjunction's
   breadth against the DECK, and from inside a deck a job it is built around
   looks exactly like a job that is too broad: Muldrotha holds TWELVE cards
   carrying `eff:mill` against a floor of five and scored zero. Measured against
   the POOL the cases separate - `eff:mill` is on 3% of it, `eff:draw` on 20%.

4. **A broad facet can still be the job, if nearly every example carries it.**
   `mv:big` is broad by construction and is EXACTLY what "High mana value cards
   to reveal off the top for a big Yuriko drain" means; it is on 11 of her 12
   examples. `eff:draw` was on a bare majority of the Niv examples and is
   incidental to a job about drawing INTO DAMAGE. Rare facets pass on a
   majority; broad ones must be near-unanimous.

**The check that survived every change**: "Curiosity effects on Niv" still gets
NO capability rescue. The false positive the guards exist for is still refused
after all four.

Also capped the conjunction at the TWO RAREST shared facets, because past two it
is mostly what the exemplars happen to be printed on - Korvold's "things that
come back after being sacrificed" had picked up `cares:type:land`.

### REFUSED, measured: excluding `sub:` from the conjunction

"big colourless creatures that cost nothing once Animar is large" is exemplified
by eleven cards that ALL HAPPEN TO BE ELDRAZI, so the conjunction demanded
`sub:eldrazi`, a property the job text never mentions, and tribal jobs use
`typeMatch` anyway. It did not fix the target and it broke Chulane's "cheap
creatures that make mana", 1 of 6 to ZERO. Jobs 35 -> 36 and groups at zero
9 -> 10.

**The over-narrow case is real and still unsolved**, and it cannot be DETECTED
the way over-broad can: an over-narrow conjunction matches nothing, which is
indistinguishable from the deck failing. Note left in the file.

### Read as a player, ten of twelve capability passes are right

Reanimate and Takenuma for "recursion"; Storm-Kiln Artist for "Treasure
payoffs"; Woe Strider and Cauldron Familiar for "creatures that come back after
dying"; Consecrated Sphinx for Yuriko's high-cost cards. The two loose ones are
Brotherhood Regalia counted as a cheap evasive CREATURE, and Great Train Heist
as a protection trick.

---

## A blink deck was offered damage doublers instead of Panharmonicon (5 Sep 2026)

Brago, King Eternal's job "doubling the arrival" needs ONE card and his deck held
nothing. The plan DID ask for doublers - through the generic `eff:multiply` at
0.5 - and about half that population doubles DAMAGE rather than triggers: Fiery
Emancipation, Torbran, Gisela, Gratuitous Violence, plus a draw doubler in
Alhammarret's Archive. A blink deck was being offered damage doublers at the same
weight as the card it actually wanted.

**Scryfall Tagger has had the precise word all along** and the map flattened it
into the generic - the same shape as the `eff:add-counters-self` flattening found
the same morning. Read the WHOLE `trigger-doubler` tag, 39 resolved cards:
Panharmonicon, Roaming Throne, Yarok, Elesh Norn Mother of Machines, Teysa
Karlov, Veyran, Delney, Naban, Harmonic Prodigy, Ancient Greenwarden, Wulfgar,
Virtue of Knowledge. **39 of 39 correct, no damage doublers at all.**

Two changes to the blink plan rule, both toward precision:

    eff:multiply 0.5   ->  eff:multiply-triggers 0.7
    trig:enters 0.75   ->  trig:enters-self 0.75

The second because a blinker wants a creature whose OWN arrival does something;
the base word is emitted alongside `trig:enters-other` too, which is Tatyova's
"whenever a LAND enters" - a fine card a blink deck cannot use.

    Brago   0 trigger doublers -> Roaming Throne (rank 132)

### REFUSED, measured: `copy-ability` -> `eff:multiply-triggers`

It would have CLOSED the benchmark row, because two of that job's four named
examples are Strionic Resonator and Lithoform Engine. But half of that tag's 50
cards copy ACTIVATED abilities rather than triggers - Rings of Brighthearth,
Illusionist's Bracers, Battlemage's Bracers - about 50% precision against the 85%
bar these role-affecting words are held to.

So the benchmark still reads "doubling the arrival 0/1" on a deck that HOLDS
Roaming Throne: only 2 of its 4 examples carry the word and a four-card group
needs 3 to agree. **The deck does the job and the measure cannot see it.** Left
alone rather than loosening the threshold for small groups, which would buy this
one row and cost precision everywhere.

### The two Animar zeroes are a known vocabulary limit, not a bug

Animar holds SEVEN creatures at mana value 5+ and ZERO colourless ones, against a
job asking for four. His whole card is "creature spells cost {1} less for each
counter", which makes COLOURLESS creatures free because their entire cost is
generic - and nothing in the facet vocabulary records that a card is colourless.
The colourless CAP was checked and is not the cause: 17 of his 59 spells are
colourless against a ceiling of about 29.

This file already records the general form: *"a cost reducer's value depends on
the deck and the role system is deck-independent"*, and *"the facet vocabulary
does not record WHICH colour or type a reducer reduces"*.

## "No opinion about this card" selects anti-synergy IN (5 Sep 2026)

Blasphemous Act kept reaching Edgar Markov's Vampire deck after `scope:wipe`
shipped and after `worksAgainstPlan` was added to the ranker penalty, the
commander-fit reserve, the quota loop, the packages, `fillTo` and the review
swap. Six passes guarded, card still there.

It came in through the seventh: the pass that fills a short role with **"one of
the cards Commander plays most for removal (rank 22)"**. That pass exists for
cards that belong in a deck for reasons synergy cannot express, so it selects
on:

    .filter(c => fitOf(c).fit <= 0)          // the commander has no opinion
    .filter(c => !(c.tags ?? []).some(t => commanderThemes.has(t)))

**An anti-synergy card has no positive fit BY DEFINITION.** So the filter
written to find "cards the commander is neutral about" is precisely the filter
that finds cards the commander is hostile to, and the two are indistinguishable
by sign. Every other pass sorts by fit and a hostile card sinks; this one sorts
by EDHREC rank, and Blasphemous Act is rank 22.

The check is on it now. Measured: neutral on all eighteen shells (named,
packages and keyed identical, ramp jitter 18→16, 24→23, 27→28, all above the
floor of 11), 46/71 jobs and 6 zero groups unchanged, 177/200 shape checks
unchanged, 3,357 tests passing.

> **The lens worth keeping.** I had been asking "which guard is missing" and
> answering it by reading the guarded passes. The card's own `reason` string
> named the pass in one line. **A deck entry says which pass claimed it — read
> that before instrumenting anything.** A `DM_TRACE_CARD` block in the quota
> loop printed nothing, which was correct and told me only where it was NOT.

### And the shape generalises to any future ATTACKS entry

`ATTACKS` holds two entries and this file says a third needs a measurement
rather than a guess. It now also needs a check in SEVEN passes, and the one
that will be forgotten is the popularity filler, because it is the only pass
that does not consult fit at all. Anything added to `ATTACKS` should be
verified against a deck by building one, not by reading the guards.

## The deck explained itself with numbers from a deck that never existed

Chasing the cards past EDHREC rank 15,000 on the deployed sweep, the reasons on
them turned out to be the more serious defect. Krenko, Mob Boss, measured 5 Sep
2026, finished deck holding **30 creatures and 12 removal spells**, telling the
player:

    Magmablood Archaic   "Fills a creature gap (1 of 26)"
    Flame Javelin        "Fills a removal gap (0 of 6)"

Both were true of an empty deck at the moment the card was chosen. `generate.ts`
says so in a comment that has been right all along: *"Every pass above chooses
cards against a profile of the deck AS IT WAS WHEN THAT PASS RAN — the quota
loop against a seed profile holding only the commander."* That is a design
decision with its own argument. **Keeping the sentence it wrote and showing it
to a player as a fact about the finished list is not.** Design law 7: a number
a player disproves by counting the cards in front of them is worse than no
number.

Section 5z restates the clause against the FINISHED deck: corrected where the
deck is still short, dropped where the deck met the target, and the pick itself
is untouched — so every deck-quality figure is unchanged by construction, and
was measured unchanged (18 shells byte-identical).

### Stripping the false clause exposed a worse one underneath

    "played in a lot of decks (EDHREC rank 22,084)"

The popularity signal fired for any rank inside `POPULARITY_HORIZON` (25,000)
and wrote the same sentence at every rank in that span. Three bands now, and
the bottom one returns **no sentence at all** rather than a negative one: its
score is about 0.01 against a role gap of 3.0, so it is not a reason the card is
in the deck and should not be written as one. `buildReason` drops empty details.

Flame Javelin's whole justification is now *"You could pay for this 63% of the
time on turn 6."* — which is the engine admitting, in the player's own words,
that the card is filler. That is the right outcome: **the honest sentence is
also the bug report.**

### The test was holding the bug in place

`generate.test.ts` asserted the gap clause was PRESENT. It now asserts that any
claim still on screen is TRUE of the finished list — a gap must be a real gap,
its count must match the deck, and nothing over rank 1,500 may be called widely
played. Strictly stronger, and it fails on the exact sentences above.

> **How this was found, because reading did not do it.** Six passes were guarded
> and the card still appeared, so I instrumented three of them in turn. Each
> print was correct and told me only where the card was NOT. What located it was
> the deck entry's own `reason` string, which names the pass in one line. **Read
> what the deck says about a card before instrumenting the code that put it
> there.**

### Open, measured, not acted on: the review rounds trade good cards for small ones

The swap log from the same Krenko build, every swap the four rounds made:

    r1  Brash Taunter        -> Goblin Chirurgeon
    r1  Vanquisher's Banner  -> Dawn-Blessed Pennant
    r1  Siege-Gang Commander -> Battle Cry Goblin
    r1  Goldspan Dragon      -> Goblin Instigator
    r2  Purphoros, God of the Forge -> Siege-Gang Lieutenant
    r2  Door of Destinies    -> Slobad, Goblin Tinkerer
    r3  Crystalline Crawler  -> Ardoz, Cobbler of War

Goldspan Dragon, Siege-Gang Commander and Purphoros are three of the best cards
a Krenko deck can play, and each left for a cheaper goblin. Every swap's stated
reason is *"Krenko is a goblin that counts goblins, and this does 2 of what it
wants"*, so the mechanism is legible: the rounds rank against `withUrgency`, a
two-mana goblin satisfies the loud want as completely as a six-mana one, and
`REFINE_MARGIN` of 0.75 is then cleared on curve and castability alone.

This is the same shape as the `EMPTY_DECK_COMMANDER_FIT` finding — a want is a
facet, and a facet does not know that one card doing the thing is far better at
it than another. **Do not fix it by raising the margin**; this file records four
weight sweeps that moved nothing. The measurement to take first is whether the
rounds improve any deck at all: they were added to fix a real fault, and nobody
has measured them since the urgency change.

## CORRECTION: the review rounds are net positive, and I called them a fault on an opinion

The section above records Krenko's swap log — Goldspan Dragon, Siege-Gang
Commander and Purphoros leaving for cheaper goblins — and calls it a defect.
**That was my opinion of three cards, which is exactly the standard this project
forbids.** Measured 5 Sep 2026 by running every yardstick with `REFINE_ROUNDS`
at 4 and at 0:

| yardstick | 4 rounds | 0 rounds | better |
|---|---|---|---|
| eighteen shells, keyed | higher on 11, lower on 2 | | **rounds** |
| eighteen shells, named / packages | identical | identical | tie |
| seven-deck roster, keyed | 63% | 59% | **rounds** |
| seven-deck roster, staples | 46/61 | 46/61 | tie |
| twenty commanders | 46/71, 6 zero | 44/71, 7 zero | **rounds** |
| shape vs 192 real decks | 177/200 | 180/200 | none |

Read as a player, Adeline's fourteen swaps are the argument: they turn a generic
artifact pile into a Human tribal deck, taking **Skullclamp (rank 40)**,
**Chrome Mox (148)**, Ranger-Captain of Eos, Thalia's Lieutenant and Champion of
the Parish. Her median EDHREC rank rises 1,328 → 1,871 and her keyed synergy
does not move, which reads as a loss and is not one: **a deck's median rank goes
up when the deck stops being generic**, because tribal cards are less
universally played than generic artifacts.

**The rounds stay.** Two swaps in that log are still wrong — Teferi's Protection
(rank 109) cut as a "weak fit", which is the known compiler gap where its only
compiled effect is an exile of itself and the phasing is unread — but the pass
as a whole earns its place three times over.

## The tribe exemption let tribal decks past every ceiling except the two it was for

The one thing the rounds genuinely cost was real-deck shape, 180 → 177, and
chasing that found a bigger fault underneath. All three decks the shape check
flagged were TRIBAL, and every flag was for a role that has nothing to do with a
tribe:

    Krenko (goblin)    protection 7    against a real p90 of 5
    Edgar  (vampire)   protection 6
    Giada  (angel)     wincon 3        against a real p90 of 2

`overRoleCeiling` opened with a line waiving the ceiling for any card carrying
the commander's tribe facet, on the argument that *"thirty mana Elves are the
plan"*. **It already skips `land` and `creature`** — the two roles a tribe
actually fills — so the exemption could never have been what let a tribal deck
run its tribe. Its only remaining effect was letting a tribal card past the
ceiling of every OTHER role it happened to carry.

Removed, and measured against its own motivating case rather than only against
the decks that showed the fault:

    Marwyn, the Nurturer      ramp 28 -> 21, creature 32 -> 29, draw 13 -> 14
    Lathril, Blade of Elves   ramp 27 -> 21, creature 34 -> 29, draw 11 -> 13

21 is the p90 of the 192 real decks exactly, and both Elf decks gain draw toward
a real floor of 11 they were sitting under.

    shape vs 192 real decks   177/200 -> 181/200   (91%)
    twenty commanders         46/71 -> 47/71 jobs, 6 zero groups unchanged
    eighteen shells           named and packages identical, keyed net zero, and
                              BOTH "ramp high" flags cleared: Magda 23 -> 21,
                              Lathliss 28 -> 21
    seven-deck roster         keyed 63%, staples 46/61, both unchanged

**THE COST, stated rather than hidden:** the engine's own power score falls
6.3 → 5.8 on Marwyn and 5.6 → 5.4 on Lathril. That score rewards more ramp and
more creatures, and this file already records that its blind spots are exactly
where the format's staples live. The 192 real decks are the yardstick; the
roll-up is not.

`overRoleFloorCeiling` KEEPS its tribe exemption. That is the floor's higher
ceiling, the largest count real decks actually hold, and a floor is not choosing
freely. Only the p90 ceiling was measured, so only the p90 ceiling was changed.

### Verified on the DEPLOYED function, not the repo

    forty RANDOM commanders (seed 1)
      built / 99 cards / every staple      40/40  40/40  40/40
      ramp >= 11                           40/40   median 19
      lands >= 35                          40/40   median 40
      NOTHING flagged                      40/40
      keyed synergy                        median 75%, unchanged
      strongly on-theme (80%+)             15 -> 13
      build time                           median 1.8 s, slowest 3.0 s

    fourteen deployed decks                14/14, 82/94 staples

The one number that moved the wrong way is the count of decks at 80%+ keyed,
13 against 15, with the MEDIAN unchanged at 75% and the generic tail unchanged
at 3. A ceiling that binds takes its cards from the roles that were overshooting,
which on a tribal deck are the themed ones, so a little top-end theme is exactly
what it should cost. The four named yardsticks all improved or held.

## A card that names every permanent type is saying "permanent" (5 Sep 2026)

The worst row on the eighteen-shell probe was **Enchantress at 13 of 35 jobs
filled**, and the commander it was built on was **Braids, Arisen Nightmare** —
mono-black, a colour with almost no enchantment-matters cards. She also took
Superfriends. The probe picks the HIGHEST-SCORING commander of 3,000, so that
was the engine claiming Braids is the format's best Enchantress commander.

Her card says *"sacrifice an artifact, creature, enchantment, land, or
planeswalker"*, and the word scan behind `cares:type:` read it as five separate
statements:

    cares:type:artifact  cares:type:creature  cares:type:enchantment
    cares:type:land      cares:type:planeswalker

`planForCommander` turns each into a `type:` want, and `strategiesFor` scores
shells against the plan's wants, so one clause made her an enchantment deck, an
artifact deck AND a superfriends deck.

**The facets are not FALSE.** Casualties of War really does destroy an
enchantment. What is false is the inference *"therefore build a deck around that
type"*, and it is only wrong when the card names them all — which is why the fix
is in the reading and not in the facet, and therefore needs **no compiler bump,
no refill and no matview rebuild**.

### The whole population, not eight samples

44 cards carry four or more of the six permanent types. Every one means "any
permanent" or offers a choice across types: Braids, Muldrotha (*"a permanent
spell of each permanent type"*), Casualties of War, Merciless Eviction, Show and
Tell, Scourglass (*"all permanents"*), Lurrus (*"each permanent card"*), Terror
Tide, Decimate, Chaotic Transformation. **Zero of the 44 genuinely care about
one type.**

Four, not three: at three the population is 238 cards and includes *"destroy
target artifact, creature, or enchantment"*, which is a removal spell rather
than an enumeration.

> ⚠️ **BATTLE IS A PERMANENT TYPE and leaving it out is not a small omission.**
> With the other five collapsed and battle left standing, Muldrotha's LOUDEST
> want became `type:battle` at 0.90 and the engine read the format's best
> graveyard commander as a Battles deck. The nine cards that reach four only
> through battle are "any target" damage spells — Galvanic Blast, Spire Barrage,
> Seismic Assault, Molten Vortex — where the collapse is equally right. A
> genuine battles card names battle alone and is untouched.

### What moved

    eighteen shells
      Enchantress    Braids 13/35 jobs  ->  Loran of the Third Path 24/43, keyed 91%
      Superfriends   Braids 24/35       ->  Tekuthal, Inquiry Dominus 20/27
      Value engine   Braids 28/35       ->  Braids 24/27, and her plan is now
                                            sacrifice and tokens, which is what
                                            her card actually does
    shape vs 192 real decks     181/200 -> 182/200
    twenty commanders           47/71 jobs, 6 zero groups, both unchanged
    seven-deck roster           keyed 63%, staples 46/61, both unchanged
    strategies EARNED           3.9 -> 3.9 per commander, measured before and
                                after rather than against the stale 3.3 in this
                                file; entirely-generic lists 36 -> 37, which is
                                Braids losing a claim that was wrong

> **Value engine's keyed fell 85% to 51% and the deck did not get worse.** This
> file already records that a keyed percentage rises whenever a plan gains
> wants; the inverse is just as true. Braids' plan shed three bogus type wants,
> so fewer cards count as "keyed", while the jobs she can actually do went 80%
> to 89%. **Read the package fill, not the keyed percentage, after a change that
> narrows a plan.**

## Two of four is a tie, not agreement (5 Sep 2026)

The worst row on the eighteen-shell probe was Enchantress at **24 of 43 jobs**,
and inside it one package was doing almost all of the damage: **"The payoff",
1 of 9**. Its exemplars are Sigil of the Empty Throne, Starfield of Nyx, Eidolon
of Blossoms and Mirri's Guile, and what they AGREE on is:

    cares:type:enchantment  3/4        scope:all         2/4
    trig:step               2/4        trig:step:upkeep  2/4

Starfield of Nyx and Mirri's Guile both happen to have an upkeep trigger, for
entirely unrelated reasons. `planForArchetype` kept a package want at `n * 2 >=
cards.length`, so that coincidence became a REQUIREMENT and almost nothing in
the catalogue satisfied the conjunction.

**The decisive test was colour, because this file records nearly making the
opposite mistake once.** Rebuilding the same shell on Sythis, Harvest's Hand -
green-white, the shell's own colours, a card literally in its enchantresses
package - gave "The enchantresses" **9 of 9** and left "The payoff" at **1 of
9**. So it was the derivation and not the pool.

A strict majority (`n * 2 > cards.length`) fixes it. Half is not agreement when
a package has an even number of cards: two of four is a tie between two
unrelated pairs. This is the same correction `commander-bench.mjs` already went
through for scoring a job, landing on the same side.

    twenty commanders    47/71 -> 49/71 jobs, and groups the deck cannot do
                         AT ALL 6 -> 4
    seven-deck roster    format staples 46/61 -> 53/61, keyed 63% -> 62%
    shape vs real decks  182/200 -> 181/200
    eighteen shells      package slots 520 -> 484, filled 449 -> 454
                         Voltron keyed 46% -> 68%, Tribal 53% -> 61%,
                         Reanimator 68% -> 75%; Lands matter 80% -> 64%

> ⚠️ **A PACKAGE WITH NO SURVIVING WANT IS DROPPED, AND A DELETED PACKAGE
> CANNOT FAIL.** Superfriends reads 20/27 before and 9/9 after, which is not a
> package filling, it is eighteen slots of jobs disappearing. Never read a
> package fill RATIO across a threshold change; read the numerator and the
> denominator separately. Across all eighteen shells the shells ask for 36
> fewer slots and place 5 more cards.
>
> The evidence this is a real gain rather than an easier metric is that the two
> yardsticks that moved most - bench jobs and format staples - are computed
> WITHOUT reference to shell packages at all.

### Still wrong, and it is the exemplar list rather than the threshold

With the want reduced to bare `cares:type:enchantment`, "The payoff" now fills
9 of 9 with **Enlightened Tutor, Austere Command, Farewell, Grand Abolisher,
Reclamation Sage, Loran of the Third Path, Archdruid's Charm, All That
Glitters** - and Austere Command and Farewell DESTROY ENCHANTMENTS, which is
anti-synergy in an enchantress deck. Every card that answers an enchantment
carries `cares:type:enchantment`, so the facet cannot separate a payoff from an
answer.

The root cause is that the four exemplars share nothing else meaningful, and
Mirri's Guile is not an enchantress payoff at all. **Fixing it means editing the
exemplar list, which is editorial rather than measured**, so it is written down
here rather than guessed at.

## REVERTED: the strict majority. Two of four is signal in one package and noise in another

The section above ships `n * 2 > cards.length` for a package want and reports
bench jobs 47 -> 49, zero groups 6 -> 4 and staples 46/61 -> 53/61. **It is
reverted.** Measured against the one EXTERNAL yardstick in this repo - Syr
Vondam built as Blink, scored against two human-built decks the owner linked:

    half              26/92   blink engines 5/17   worth blinking 4/30
    strict majority   17/92   blink engines 1/17   worth blinking 2/30

It loses Conjurer's Closet, Restoration Angel, Icewind Stalwart and
Distinguished Conjurer - the cards that ARE the archetype.

### Why the count cannot settle it

    "The payoff"            Sigil of the Empty Throne, Starfield of Nyx,
    (Enchantress)           Eidolon of Blossoms, Mirri's Guile.
                            Starfield and Mirri's Guile both happen to trigger
                            on upkeep, for unrelated reasons. `trig:step:upkeep`
                            at 2/4 became a requirement. Filled 1 of 9.

    "Doubling the arrival"  Panharmonicon, Brago, Charming Prince, Felidar
    (Blink)                 Guardian. `eff:exile-own`, `eff:return-from` and
                            `cares:zone:exile` are ALL 2/4, all from Brago and
                            Felidar Guardian, and together they ARE blinking.

Same threshold, opposite truth. Raising the bar leaves the blink package with
only `type:creature` at 3/4, so it asks for "a creature" and fills 9 of 9 with
**Blood Artist, Zulaport Cutthroat and Mirkwood Bats**.

### The disagreement is the finding, not a problem to tune away

The internal yardsticks all IMPROVED under the change: bench jobs +2, zero
groups -2, staples +7. That is not a contradiction, it is the mechanism stated
in numbers. **A broader package want matches more cards, so "jobs done by
capability" and "format staples" both rise while the deck fills with generic
good cards** — which is the owner's original complaint, measured.

> **When an internal metric and the human decks disagree, the human decks win.**
> `commander-bench` job lists and `REAL_DECK_ROLES` are ours; the two Vondam
> decks are not. A change that makes our own scoreboard easier and the external
> comparison worse is a change that made the deck worse.

Like for like across this session, at the pre-session commit `f4d9a12`:

    Syr Vondam + Blink   23/92 -> 26/92, blink engines 3/17 -> 5/17

The 31/92 recorded on 4 Sep does not reproduce at this probe and was not chased;
23 -> 26 is the measurement taken today, both arms in the same run.

**"The payoff" filling 1 of 9 stands.** Its exemplar list is the fault -
Mirri's Guile is not an enchantress payoff - and an honest 1 of 9 beats filling
it with Austere Command and Farewell, which destroy the deck's own enchantments.

## REFUSED, measured: a guard against a deck holding the answer to its own type

The obvious follow-on. Every card that ANSWERS a type carries the same
`cares:type:X` as every card PAID for it, so an Enchantress package pulled in
Austere Command and Farewell. The signal is clean - `cares:type:X` plus
`eff:destroy`/`eff:exile` plus `scope:all` and NOT `type:X` - and the population
is 465 cards: creature 246, artifact 85, enchantment 58, land 57, planeswalker
19.

**It is not worth a guard, because it barely happens.** Built four decks on the
four type shells and counted mass answers to their own type:

    Sythis + Enchantress      2   Austere Command, Farewell
    Ragavan + Artifacts       0
    Tatyova + Lands matter    0
    Tekuthal + Superfriends   0

Two cards in one of four decks, and both arrived through the strict-majority
change that is now reverted. A third `ATTACKS` entry needs a check in SEVEN
passes; this does not earn it. Revisit only if a probe shows it reaching decks.

## The review rounds undo a strategy the player NAMED (5 Sep 2026)

Diagnosed, three fixes attempted and measured, **none shipped.** The diagnosis is
solid and is the part worth keeping.

Syr Vondam asked for **Blink by name**. The archetype packages placed the blink
engines. Then the review rounds cut them:

    round 2: Karmic Guide out (5.6, weak fit) for Chronomancer
    round 4: Felidar Guardian out (6.3, weak fit) for Hangarback Walker

The rounds rank against `withUrgency(commanderPlan, picked)` — the COMMANDER'S
plan — which knows nothing about a strategy the player typed. Vondam's own plan
wants counters and sacrifice, so a blink engine genuinely is a "weak fit" by
that measure, and the rounds rebuilt the deck into what the commander alone
would have made. That is the owner's complaint in one line: *"I gave you 2
reference syr vondom decks which are soooo good why do none of those cards
appear"*.

> **The build log said the package filled and the deck did not hold the card.**
> "Doubling the arrival 9/9" listed Felidar Guardian; the finished deck did not
> contain it. CLAUDE.md already records this trap for the named staples. Check
> the DECK, never the pass's own sentence.

### Three fixes, all measured, all rejected

| | Vondam vs 2 human decks | bench jobs | groups at zero | roster keyed |
|---|---|---|---|---|
| baseline | 26/92 | 47/71 | 6 | 63% |
| never cut an archetype-placed card | 28/92 | **45/71** | **9** | 60% |
| cut only if archetype fit does not fall | 28/92 | 48/71 | **8** | 61% |
| ...and only if the card is there FOR the archetype | 26/92 | 47/71 | 6 | 63% |

Shape held at 182/200 throughout, and `named` and package fills were identical
across all four on the eighteen shells.

**The blanket ban froze up to 45% of the spells** and the rounds are
demonstrably worth having, so it cost two jobs and three whole capabilities.

**The comparison version is the closest call**: +2 on the external yardstick and
+1 job, against TWO MORE jobs a deck cannot do at all — Animar's *"one and two
mana creatures that make mana"* and Niv-Mizzet's *"Curiosity effects and other
draw-into-damage payoffs"*. Two cards of overlap against two whole capabilities
is not a trade worth taking.

**The narrowest version is a no-op for the case that motivated it.** Restricting
the guard to cards whose archetype fit exceeds their commander fit excludes
Felidar Guardian, because Vondam's plan likes it too — it is cut for its score,
not for being off-plan.

### And a FOURTH attempt: the weight is not the lever either

The paragraph that stood here predicted the fix was `ARCHETYPE_FIT_SHARE`, whose
own comment says it is *"what a guess is worth against a certainty"* — reasoning
that does not survive the player TYPING the name, and the build already draws
that distinction for the slot share. So a chosen archetype was given the full
commander weight rather than 0.6 of it, plumbed through `RecommendOptions`.

**It did not move the motivating case at all.** Vondam stayed at 26/92 and
Felidar Guardian was still cut. The flag was verified to reach the ranker — five
other shells moved — so this is the knob genuinely not being the cause, which is
rule 1 of the method restated: *if a sweep barely moves the number, the knob is
not the cause.*

On its own merits it measured slightly worse and was reverted:

    twenty commanders   47/71 -> 46/71 jobs, groups at zero 6 -> 7
    eighteen shells     Tokens named 2/3 -> 1/3, packages identical
    seven-deck roster   keyed 63% -> 62%, staples 46/61 -> 47/61
    shape               182/200, unchanged

So the cut is decided by the role gap and castability, not by how much archetype
fit is worth. **A real fix has to change what the rounds are ALLOWED to cut, and
the three guards above are the shapes that do not work.** Anything new should be
measured on the bench's zero groups first, because that is what every version
tried so far has paid with.

## An X spell is not a free card, and the curve signal thought it was

Chasing why the review rounds cut a Blink deck's own engines, the score
breakdown named a term nobody had suspected. Syr Vondam asked for Blink, round
four, the swap that decided it:

    Felidar Guardian   commander-fit 1.20  archetype-fit 1.30  curve -0.45
    Hangarback Walker  commander-fit 2.29  archetype-fit 0.15  curve +0.89

Archetype fit had ALREADY nearly cancelled commander fit. **The curve term swung
1.34 of the 1.55 gap**, and it did so on an artefact: Hangarback Walker's cost is
`{X}{X}`, so its mana value is **0**. That is correct by the rules - X is zero
anywhere but the stack - and it means the curve signal read one of the most
played creatures in the format as a FREE CARD and gave it the full bonus for
sitting below the deck's curve.

`scoreCandidate` now emits no curve signal at all for a card whose cost is X
alone. **No invented number:** treating X as 1, or 2, or the deck's mean would
each be a guess about how much the player intends to pay, and the rule here is
that unknown stays unknown. Every other signal still applies.

**19 commander-legal cards**, all of them cards whose whole cost is X, so mana
value collapses to zero: Walking Ballista (430), Astral Cornucopia (1,319),
Stonecoil Serpent (1,517), Hangarback Walker (1,531), Chalice of the Void,
Engineered Explosives. The 520 X spells carrying a coloured pip already have a
real mana value (`{X}{B}{B}` is 2) and are untouched.

    eighteen shells     named and packages IDENTICAL; keyed +2 on two shells
                        (+1/+1 counters 35% -> 37%, Value engine 51% -> 53%)
                        and lower on NONE
    twenty commanders   47/71 jobs, 6 zero groups, both unchanged
    shape               182/200, unchanged
    seven-deck roster   keyed 63%, staples 46/61, both unchanged

### Still wrong, measured, and waiting for a compiler bump

**All 19 also carry `mv:cheap`**, from the same zero. Astral Cornucopia costs
`{X}{X}{X}` and reads as a cheap card; so does Chalice of the Void. `mv:cheap`
is a real want - Yuriko asks for "cheap evasive creatures" - so those decks are
being offered cards that are only cheap if you pay nothing for them.

That is a facet, so fixing it means bumping the compiler, refilling and moving
both readers. **19 cards do not justify a bump on their own; ride it along with
the next one.**

## Edgar Markov is Mardu and his deck has no removal spell (5 Sep 2026)

`commander-bench` says *"removal that fits 0 of 2 needed"* on a deck holding
EIGHT cards with the `removal` role, in the three colours with the best removal
in Magic. The eight:

    Staff of Compleation   Piper of the Swarm   Orcish Bowmasters
    Walking Ballista       Agatha's Soul Cauldron   Loki's Scepter
    Clive, Ifrit's Dominant   Sunset Strikemaster

Not one of them can answer a creature the way Swords to Plowshares does, and
none is an instant or a sorcery. The build log gives the mechanism in one line:

    6 removal: fewer than that and a 99-card deck has not drawn one by turn 6

**The quota was satisfied, so no pass ever reached for real removal.** The role
is not short, so the popularity filler never fires, the floors never fire, and
the deck is finished.

### `eff:damage` cannot say how much, and the card type nearly separates it

Of 2,782 cards whose ONLY removal facet is `eff:damage`, 1,125 are instants or
sorceries and 1,657 are permanents, and read as a player the two groups are
different cards entirely:

    instant/sorcery   Lightning Bolt, Boros Charm, Blasphemous Act, Chandra's
                      Ignition, Chain Reaction, Grapeshot — how a deck ANSWERS
    permanent         Impact Tremors, Purphoros, Warstorm Surge, Guttersnipe,
                      Terror of the Peaks, Dragon Tempest — damage as a PAYOFF

### REVERTED: gating `eff:damage` on the card type

`facetRoleQualifies` was given the facet as well as the role, so `eff:damage`
could confer `removal` only on a spell. It **did not fix Edgar at all**, and the
reason is the one this file already records: **a role has TWO DOORS.** Orcish
Bowmasters is `rec:partial`, so it falls past the facet door to `tagFallback`,
and our own tagger calls it `targeted-removal` — which is defensible, since it
does point at a creature and kill a small one.

Measured, and mixed rather than better:

    twenty commanders   47/71 jobs unchanged, groups at zero 6 -> 5
    shape vs real decks 182/200 -> 180/200
    eighteen shells     shell cards held DOWN on three - +1/+1 counters 2/6 -> 0/6,
                        Tokens 2/3 -> 1/3, Artifacts 4/9 -> 3/9;
                        packages +1 on two

A rule that fixes one dead job, costs two real-deck role checks and four shell
cards, and does not touch the case that motivated it, is not a fix.

### What the next attempt needs to know

1. **Both doors have to close together**, and the tag door is the harder one:
   `targeted-removal` on a one-damage ping is not obviously wrong tagging.
2. **Scryfall Tagger does not separate them either.** `spot-removal` (5,309
   cards, unmapped) tags Orcish Bowmasters and Walking Ballista alongside
   Swords to Plowshares. Checked before writing a rule, per the method, and it
   is not the discriminator.
3. The honest cost of any type-based rule: Eiganjo, Walking Ballista and Goblin
   Bombardment are permanents that genuinely do answer a creature and would lose
   the role with the payoffs.

## The yardstick is DERIVED from the engine, so it drifts as the engine learns

Last session concluded the removal-role rule "measured worse on shape, 182/200
-> 180/200". **That measurement was invalid**, and the reason is the trap
`real-deck-roles.mjs` warns about in its own header, walked into from the other
side.

`REAL_DECK_ROLES` and `scripts/probe/real-deck-roles.json` are produced by
running OUR `cardRole` over 192 real decks. Change `cardRole` and BOTH sides of
the comparison should move — but the json is stored and the constant is frozen,
so a role change is measured against a yardstick describing the old rule. Two
vocabularies, one subtraction, the difference called a fault.

**Isolated properly, 5 Sep 2026.** Re-deriving on the CURRENT pool with the OLD
rule, then again with the new one:

    role       stored (stale)   current pool, old rule   with the new rule
    ramp       11 16 21 31      10 15 20 30              10 15 20 30
    removal     9 13 20 33       9 14 20 33               8 12 16 24
    protection  0  1  5 10       0  2  5 11               0  2  5 11

So the rule changes ONLY removal, exactly as intended — and the stored file was
independently stale, because the pool's facets have moved under it all week
(tag maps, compiler versions 17 through 22).

### Refreshing the yardstick makes the decks WORSE, measured

    stored bands (the baseline)     47/71 jobs, 6 groups at zero, shape 182/200
    refreshed bands, old rule       47/71 jobs, 8 groups at zero, shape 182/200
    refreshed bands, new rule       48/71 jobs, 7 groups at zero, shape 182/200

These bands are not only a scoreboard: the generator takes its role FLOORS and
CEILINGS from them. A more accurate yardstick tightened the ceilings and dropped
the ramp floor, and the decks lost two capabilities.

> ⚠️ **RAMP p10 HAS DRIFTED FROM 11 TO 10 and it was NOT changed.** The standing
> instruction is that ramp is non-negotiable and nothing may take a deck below
> 11, on the grounds that the game is unplayable otherwise. The measurement now
> says real decks run 10 at the tenth percentile. **That is an owner decision,
> not a silent edit**, so the constant stays at 11 and the drift is recorded
> here.

### And the removal rule still does not fix Edgar

With its own re-derived bands it is +1 job and +1 group at zero, and the
motivating case goes BACKWARDS: Edgar Markov 2/3 jobs -> 1/3, "payoff for going
wide" 2/2 -> 1/2, and "removal that fits" still 0/2 with seven pings in the
deck. The cards reach the role through the TAG door, which this rule does not
touch. Reverted.

### The durable finding

**Any change to `cardRole` invalidates `real-deck-roles.json` and
`REAL_DECK_ROLES` until they are re-derived, and nothing does that
automatically.** Re-derive both before believing a shape number after a role
change — and treat the re-derivation as its own change with its own
measurement, because it moves the generator's floors and ceilings too.

`real-deck-roles.mjs` SAYS SO NOW rather than leaving it to be noticed. It
compares every band against the stored file AND against `REAL_DECK_ROLES` in
`shape.ts`, and prints what moved with the generator's own numbers flagged:

    ramp         p90 shape.ts     21 ->  20   <-- the generator uses this
    removal      p50 shape.ts     13 ->  14   <-- the generator uses this
    protection   max shape.ts     10 ->  11   <-- the generator uses this

The `shape.ts` half is the load-bearing one and persists across runs, because
the script rewrites the json but never the constant. **Running it does not adopt
anything** — copying the numbers into `REAL_DECK_ROLES` is a deliberate act, and
the measurements above are why it needs its own before and after.

## The 187 real decks can be compared card for card, and the number is not what it looks like

`meta_decks` holds **187 complete Commander decks with a single named
commander**, and until now nothing compared our list against theirs for the same
commander. Every other instrument in this repo scores a deck against something
WE wrote: role floors we chose, job lists typed from knowledge, or the two Syr
Vondam decks. `scripts/probe/real-deck-overlap.mjs` is the exception.

Ten decks spread across the alphabet, nonland cards only:

    median overlap 11%, worst 3% (Prossh), best 24% (Kotori)

**That is not a bad result, and reading it as one is the trap.** Calibrated over
all 11,650 nonland cards in those decks:

    median EDHREC rank of a card in a real deck   3,547
    past rank 12,000                              14.7%
    past rank 15,000                               8.3%

Our decks run about **1%** past rank 15,000. So roughly a seventh of every real
list is set filler a precon carries because it was printed in that set, and that
fraction is unreachable for us BY DESIGN.

Prossh, Skyraider of Kher is the worked example and the reason the caveat is in
the probe's header rather than in a note. At 3% overlap, the cards his real deck
holds and ours does not are **Vile Requiem (22,024), Deepfire Elemental
(27,909), Quagmire Druid (24,049), Jar of Eyeballs (19,038), Capricious Efreet
(21,624)**. Declining those is correct, and a change that "improved" the overlap
by taking them would have made the deck worse.

> **So the number is COMPARATIVE, never absolute.** Worth reading across
> commanders and across time for the same commander; not worth maximising. The
> finding it can produce is the outlier read AS A PLAYER: a commander where the
> cards we are missing are GOOD ones is a systematic gap, which is a different
> thing from missing a precon's filler.

`scripts/probe/README.md` had no section for the deck generator at all — the six
probes the brief names were not in the index that exists precisely so a tool
nobody can find does not get rewritten. They are now.

## REFUTED: "the generator never takes the green ramp package"

The overlap probe's first real use ranked the well-played cards a real deck
holds and we do not, across nine decks. The top of that list is damning at a
glance:

    4 decks    20  Cultivate
    3 decks    51  Commander's Sphere
    2 decks    23  Farseek        2 decks    26  Rampant Growth
    2 decks    32  Mind Stone     2 decks    41  Three Visits
    1 deck     27  Nature's Lore  1 deck     37  Kodama's Reach

Four commanders were checked — Lathril, Tatyova, Prossh, Zimone — and **none of
them took Cultivate, Kodama's Reach, Rampant Growth or Farseek.** Four for four
looked like confirmation that the engine cannot see the format's standard green
ramp.

**It is false, and the fifth commander would have said so.** Widened to eight:

    Azusa      9   Cultivate, Farseek, Rampant Growth, Nature's Lore, Kodama's
                   Reach, Three Visits, Sakura-Tribe Elder, Wayfarer's Bauble,
                   Expedition Map
    Chulane    4   Farseek, Rampant Growth, Wayfarer's Bauble, Sword of the Animist
    Ghalta     4   Cultivate, Farseek, Rampant Growth, Solemn Simulacrum

The commanders that decline have better ramp of their own — Lathril has the
Elves (Llanowar, Priest of Titania, Elvish Archdruid, Heritage Druid), Tatyova
has Exploration, Dryad of the Ilysian Grove and Spelunking — and **every deck
lands on exactly 21 ramp, which is the p90 ceiling.** They are full, not blind.

### Two lessons, both about the instrument

1. **A card on a "missing" list is not a card the engine cannot reach.** Before
   believing it, build a deck for the commander that should want it MOST. Four
   commanders that all decline the same card is not a population, it is four
   commanders with better options.
2. **The land-fetch facet conflates lands with spells.** Most hits for
   `cares:zone:library-land` are FETCH LANDS — Evolving Wilds, Misty Rainforest
   — which are chosen by the mana base, not by any ramp pass. A count that
   mixes them reads far higher than the ramp spells it means to measure.

Both are now written into `real-deck-overlap.mjs`'s header, because this is the
first thing anybody will do with that probe.

### What the exercise did confirm

The ramp the engine takes is GOOD. Lathril's 21: Sol Ring, Arcane Signet,
Fellwar Stone, Mind Stone, Commander's Sphere, Llanowar Elves, Elvish Mystic,
Joraga Treespeaker, Fyndhorn Elves, Priest of Titania, Elvish Archdruid,
Heritage Druid, Deathrite Shaman. That is what an Elf deck's mana looks like.

## The Lands matter shell was unreachable through the one facet that names it

`planForCommander`'s type loop carried this comment, and had carried it for
weeks:

    `land` is skipped as a MEMBER want: lands are chosen by the mana base,
    never from the spell pool ... THE ECHO BELOW STAYS, because a commander
    whose filters name lands does want the cards that care about lands.

The `continue` under it skipped BOTH lines. So `cares:type:land` never became a
want for any commander — and `SHELL_SIGNALS.lands` scores the Lands matter shell
against the plan's WANTS. **The shell could only ever be earned through
`cares:zone:library-land`**, never through the facet that actually names the
strategy.

Measured 5 Sep 2026, before: **Tatyova, Benthic Druid — who draws a card
whenever a land enters — read as "Tokens (0.55) and Aristocrats (0.45)".**
After: **"Lands matter (0.72)"**.

The member want stays out, for the reason given all along. The echo is a
different claim and it is the one the comment argued for.

    eighteen shells      Lands matter keyed 80% -> 90%. Named, packages and ramp
                         IDENTICAL, and no other shell moved at all
    shape vs real decks  182/200 -> 183/200
    strategies EARNED    3.9 -> 4.0 per commander; entirely-generic lists 37 -> 35
    Lands matter earned  85 commanders (2.5%) -> 172 (5.1%)
    seven-deck roster    keyed 63%, staples 46/61, both unchanged
    twenty commanders    47/71 jobs unchanged, groups at zero 6 -> 7

**The whole population read as a player**, the 22 most played commanders
carrying the facet: Azusa, Tatyova, Ashaya, Aesi, The Gitrog Monster, Loot,
Bristly Bill, Omnath Locus of Rage, Moraug, Muldrotha, Lumra, Titania, Uro,
Shigeki, Tannuk, Beledros, Zacama and Vorinclex are all genuinely about lands.
Braids, Arisen Nightmare is correctly excluded by the permanent-type collapse
above. **One clear false positive: Thalia, Heretic Cathar**, whose land clause
is *"nonbasic lands your opponents control enter tapped"* — stax, not lands
matter. About 85%, which is the bar this project holds these rules to, and this
one only decides which strategies a player is OFFERED rather than what a role is.

**The cost, stated:** Chulane, Teller of Tales loses a job group to zero. He
genuinely does put lands onto the battlefield, so the new want is correct for
him; it competes with his creature-draw want and dilutes it. Four measures
improved and one worsened by a single job.

### The echo needs a SECOND signal, and the deployed sweep is what said so

The first version added the echo to any commander carrying `cares:type:land`,
and production caught what four local yardsticks did not: **lands >= 35 went
40/40 to 39/40.** The deck was Quake, Agent of S.H.I.E.L.D., at 34.

`cares:type:land` comes from a word scan and cannot say whether a card is ABOUT
lands or merely POINTS AT one. Both false positives are the second kind:

    Quake, Agent of S.H.I.E.L.D.  "tap target creature or land"
    Thalia, Heretic Cathar        "nonbasic lands your opponents control enter
                                   tapped"

Quake's deck paid for it: **38 lands -> 32, power 6.6 -> 5.1.**

The echo now needs a second, independent statement that the commander does
something with lands — `trig:enters-other` (landfall), `eff:extra-land-drop`,
`cares:zone:library-land`, `eff:play-from-graveyard`, `eff:put-onto-battlefield`.
**Not a same-clause conjunction**, which this file warns is unsound over a flat
facet set; a weaker and safer test.

    Quake      back to 38 lands and power 6.6, and now reads as Spellslinger
               (0.74), which is what "whenever you cast a noncreature spell"
               actually is
    Tatyova    still Lands matter (0.72)      Azusa  still Lands matter (0.69)
    Lands matter earned   85 commanders -> 106 (the wide version gave 172)
    everything else       unchanged from the wide version: shape 183/200,
                          Lands matter keyed 90%, roster and 18 shells identical

> **The local yardsticks all passed the wide version.** Shape improved, the
> shells were clean, the roster was unchanged. Only the DEPLOYED random sweep,
> which builds forty commanders nobody chose, caught it. That is what it is for.

## ⚠️ `git stash` IS SHARED ACROSS WORKTREES ON THIS MACHINE. DO NOT USE IT

Nine entries sit in the stash list, and eight of their own messages say the same
thing: *"popped by accident. git stash is SHARED across worktrees."* Other agents
working in `.claude/worktrees/` push onto the SAME stack.

It happened again today. A `git stash push -- <file>` followed by `git stash pop`
popped ANOTHER worktree's entry and left **13 files in an unresolved conflict**,
including four vendored copies. Worse, the failed push meant a before/after
measurement ran with BOTH arms identical, and the "before" number was believed.

**Use `git checkout <commit> -- <path>` instead.** It is precise, it touches no
shared state, and it is how the Quake before/after was finally measured:

    git checkout HEAD~1 -- src/engine/knowledge/behaviour.ts && npm run vendor
    ...measure...
    git checkout HEAD   -- src/engine/knowledge/behaviour.ts && npm run vendor

Recovering from the conflict: a stash pop that CONFLICTS does not drop the
stash, so nothing was lost — verified, the list was still nine deep afterwards.
`git checkout HEAD -- <each conflicted file>` restores the tree without touching
the stash stack.

## Sixteen shell signals could never fire, and four of them were the whole of Control

The Lands bug generalises, and `scripts/probe/shell-signal-reach.mjs` asks the
general question: for every facet each shell keys on, how many commanders CARRY
it and how many get it as a WANT? `strategiesFor` scores shells against the
plan's wants, so a signal no plan produces is decoration.

Over 3,358 commanders, **sixteen signals are carried and never wanted.** Most
are harmless redundancy — Spellslinger still fires on `cares:type:instant`
whatever `trig:cast` does. **Control's are all four of its signals:**

    eff:counter        14 commanders carry it, 0 want it
    eff:destroy        75
    eff:tap            48
    eff:unless-pays     3

So the Control shell could never be earned through a facet at all, only through
its tag fallback — which is work-list item (c), *"Control 0/1 named"*, explained.

### `SHELL_SIGNALS` conflates two questions and the loop only asked one

`cares:type:instant` is a WANT: the commander wants instants in the deck.
`eff:counter` is not a want at all — it says the COMMANDER counters spells,
which is the whole of why it belongs to Control. Matching signals against plan
wants alone makes the second kind unreachable.

The loop now also matches a facet the commander CARRIES, at `CARRIED_WEIGHT`
(0.9), below `TAG_WEIGHT` (1.1) deliberately: a tag is a person's reading of the
whole card, a bare facet is one clause, and a want carries a weight the plan
derived rather than mere presence.

    strategies EARNED       3.9 -> 4.4 per commander   (the owner asked for 4-10)
    entirely-generic lists  36 -> 13
    Control earned           82 commanders -> 195      (2.4% -> 5.8%)
    Lands matter earned     106 -> 172
    Aggro earned            57% -> 69.8%

    eighteen shells   BYTE-IDENTICAL to the baseline
    twenty commanders 47/71 jobs, 7 zero groups, unchanged
    shape             183/200, unchanged
    seven-deck roster keyed 63%, staples 46/61, unchanged

**Every deck-quality yardstick is unchanged and the MENU is better**, which is
the right shape: `strategiesFor` decides what a player is OFFERED, and the
generator picks its own shell by cosine. This file already records that
`strategiesFor` is not a drop-in replacement for that cosine.

> ⚠️ **It re-opened the Braids bug within the hour.** Matching raw facets brought
> back "sacrifice an artifact, creature, enchantment, land, or planeswalker" as
> enchantment and planeswalker signals, and Braids was once again the format's
> best Enchantress commander — the Enchantress deck fell from 24 of 43 packages
> to 7 of 27. The permanent-type collapse lived in `planForCommander` and
> nowhere else.
>
> `namesEveryPermanentType` is exported now, because **the collapse is a
> statement about READING THE CARD, not a detail of building a plan.** Anything
> that reads `cares:type:*` as "this commander cares about X" needs it. With it
> applied the eighteen shells are byte-identical again.

## The twice-refused shell fold is really TWO CONSTANTS THAT CANNOT MEET

This file records the `type:X` / `cares:type:X` fold being tried and measured
worse **twice**, and both times the diagnosis was a vocabulary mismatch:

    Sythis, Harvest's Hand   loud want  type:enchantment
    the Enchantress shell    wants      cares:type:enchantment

That is the symptom. The mechanism is arithmetic, and nobody had measured it:

    TYPE_WANT_WEIGHT   0.9    the member want, `type:enchantment`
    TYPE_ECHO_WEIGHT   0.7    the echo,        `cares:type:enchantment`
    admission bar      0.8    `shellsForCommander`, `w >= 0.8`

**The echo is BELOW the bar by construction, so it can never admit a shell.**
Measured over all 3,358 commanders, 5 Sep 2026:

    commanders with any `cares:type:*` want          700
    ...of those, reaching the 0.8 admission bar        0
    highest `cares:type:*` weight seen anywhere      0.70

Exactly `TYPE_ECHO_WEIGHT`. No plan rule ever lifts one over the line.

So the fold was a WORKAROUND for a constant, not a fix for a naming problem,
and renaming was the only way anyone had to express "let this shell hear this
commander". That is why it kept looking like the obvious answer and kept
measuring worse.

### What it costs, named

Three well-known Control commanders get **no shell at all**, which means no
packages — the only machinery in the engine that can say "this card does BOTH
of these things":

    Baral, Chief of Compliance     loud: type:instant 0.90, type:sorcery 0.90
                                   echo: cares:type:instant 0.70  <- the shell's
    Isperia, Supreme Judge         loud: type:planeswalker 0.90
    Niv-Mizzet, Parun              loud: type:instant 0.90, eff:wheel 0.80

Baral is the archetypal Control commander in Magic and the engine cannot build
his archetype.

### STILL NOT ATTEMPTED, and deliberately

This file's own instruction stands: *"Do not try this a third time without
first fixing why a shell's packages cost a deck quality."* Raising the echo to
the bar, or lowering the bar to the echo, produces the SAME outcome the fold
produced — Sythis gains Enchantress, Niv-Mizzet gains Spellslinger — and that
outcome measured worse on both previous attempts (jobs 23 -> 22, Sythis 2/3
jobs -> 1/3, Feather's median rank 414 -> 1,139).

**The next attempt should start from the packages, not the constants.** The
recorded reason a correct shell costs quality is that its package budget is
spent on narrow conjunctions while those commanders wanted breadth: Sythis
gains enchantresses 3 -> 5 and loses both "cheap enchantments" and "enchantment
payoffs". Fix that, and this becomes a one-line change with three named
beneficiaries.

### The THIRD measurement, and the landscape has moved

Taken because the condition attached to the second refusal — *"fix why a
shell's packages cost a deck quality"* — was partly met after it: the
commander's own packages pick FIRST now, which landed later the same day.
Expressed as one constant, `TYPE_ECHO_WEIGHT` 0.7 -> 0.8, so the echo reaches
the admission bar.

All three named commanders get the right shell:

    Baral, Chief of Compliance   -> Spellslinger (0.97)
    Niv-Mizzet, Parun            -> Spellslinger (1.05)
    Sythis, Harvest's Hand       -> Enchantress (0.73)

    eighteen shells   named IDENTICAL everywhere
                      Big mana packages    24/28 -> 28/28,  keyed 73% -> 68%
                      Enchantress packages 24/43 -> 27/43,  keyed 91% -> 92%
                      Lands matter         24/27 -> 23/27,  keyed 90% -> 92%
                      Superfriends keyed   78% -> 80%
    twenty commanders 47/71 -> 48/71 jobs, groups at zero 7 -> 8
    shape             183/200, unchanged
    seven-deck roster keyed 63% -> 62%, staples 46/61 -> 47/61

**Nothing like the first two attempts**, which lost jobs outright and sent
Feather's median rank from 414 to 1,139. This is mixed and leans positive.

**REVERTED ANYWAY, because the stated condition is still not met.** The single
new group at zero is *"Curiosity effects on Niv and other draw-into-damage
payoffs"* — on Niv-Mizzet, the commander who just gained the correct shell. That
is precisely the recorded failure mode: a correct shell's packages take slots
the commander's own plan would have spent better. The cost is now ONE named job
on ONE named commander instead of a broad regression, which is a much sharper
target than the previous two attempts left.

> **What to do next, concretely.** Make a derived shell's packages yield to a
> commander's own job when they compete, then flip this one constant. The
> beneficiaries are already counted: 700 commanders carry a `cares:type:*` want
> and not one of them can currently reach a shell with it.

## A derived shell now yields to the commander's own packages

The next step recorded above, taken. The budget said the opposite of what the
weight said:

    a DERIVED shell   0.35 of all 59 spell slots   about 21
    the commander's own packages                   capped at 14

This file already argues the principle for the fit weight — *the commander is
CERTAIN, the shell is INFERRED, one of eighteen picked by a cosine* — and the
budget had never been brought into line. A derived shell now takes its share of
what the commander's own packages have NOT claimed. A CHOSEN shell is untouched:
a name the player typed is the whole reason they are on the page.

    twenty commanders, DERIVED mode   48/71 -> 49/71 jobs, zero groups 6, unchanged
    eighteen shells                   BYTE-IDENTICAL
    shape vs 192 real decks           183/200, identical
    seven-deck roster                 keyed 62%, staples 46/61, identical
    twenty commanders, ARCHETYPE=1    47/71, 7 zero groups, identical

Identical everywhere it does not apply, because both the shell probe and the
benchmark's `ARCHETYPE=1` mode NAME the shell, which makes this a no-op by
construction. **It was invisible until the benchmark was run the other way.**

> **`LOCAL=1` without `ARCHETYPE=1` is the only instrument that sees a derived
> shell.** Every headline number in this file is taken with the archetype named,
> so a change that only touches the engine's own guess measures as nothing.

### ⚠️ A BASELINE CAPTURED BEFORE A `cards_pool` REFRESH IS NOT A BASELINE

Chasing this, the eighteen-shell probe appeared to move a row the change could
not touch: Big mana went `24/28 keyed 73%` to `28/28 keyed 68%` on a NAMED
shell, where the code path is provably identical.

It was not the change. **`cards-unique-refresh` runs at 06:00 and 12:00 UTC**,
and a refresh landed between the baseline capture and the comparison. Three
consecutive runs on the unmodified baseline all produced `28/28, 68%` — the
"after" value. The stored baseline described the pool as it was before the
refresh.

**Capture the before and the after in the same session, back to back**, the way
`git stash push` was used before it became unsafe here. Any comparison spanning
06:00 or 12:00 UTC is suspect, and one of today's own measurements was.

### And the pool-refresh trap caught me AGAIN, in the same hour, on the revert

The change above was deployed and the production random sweep read **keyed
median 75% -> 71%, decks under 30% keyed 3 -> 7.** That is the sweep's own case
— it names no archetype, so it builds DERIVED shells, which is exactly what the
change touches. The mechanism was even plausible: shrinking the shell's budget
without handing the freed slots to the commander's own packages would leave the
deck with fewer themed cards.

**It was the pool refresh, not the change.** Reverted, redeployed, re-measured:
still **71%, still 7 under 30%.** The number had moved for the same reason Big
mana moved an hour earlier, and I had already written the warning about it.

So the change is neutral on the sweep and +1 job on the derived benchmark, and
it is reapplied.

> **VERIFY THE REVERT, not just the change.** A revert that does not restore the
> old number proves the change was never the cause. That one extra deploy is
> what separated "my change did this" from "the ground moved under both
> measurements", and without it a strictly-better change would have been thrown
> away on a false attribution.

## FOURTH refusal of the echo constant, and this time in the mode the fix was for

The yield above was built because this file said: *"make a derived shell's
packages yield to a commander's own job when they compete, then flip the
constant."* The yield shipped. The constant was then flipped WITH it, and
measured in DERIVED mode — the mode the yield acts in, and the mode a player who
does not name a strategy actually gets:

    derived benchmark, yield only        49/71 jobs
    derived benchmark, yield + constant  50/71 jobs

    job groups printing [NONE]            6  ->  10

The extra job is not worth the four. The groups that died are not edge cases:

    payoff for going wide        0/3
    recursion                    0/3
    payoffs when things die      0/4
    more card draw off casting or landing a creature   0/2

**So the yield did NOT unblock the constant, and the recorded next step was
wrong about why.** The cost was never a derived shell's packages crowding out
the commander's own — the third measurement's casualty was Niv-Mizzet under
`ARCHETYPE=1`, where the shell is CHOSEN and the yield is a no-op by
construction. Raising `TYPE_ECHO_WEIGHT` changes the commander's OWN plan, so
`cares:type:instant` becomes a loud want and competes inside his own packages.
The shell budget was never the mechanism.

    attempt 1   the fold, 4 Sep            jobs 23 -> 22, Sythis 2/3 -> 1/3
    attempt 2   the fold again, 4 Sep      Feather median rank 414 -> 1,139
    attempt 3   the constant, 5 Sep        +1 job, +1 zero group (Niv, chosen)
    attempt 4   constant + yield, 5 Sep    +1 job, [NONE] groups 6 -> 10

> **Four measurements, one conclusion: the problem is not the shell budget and
> not the naming.** Raising the echo makes `cares:type:X` a LOUD want on 700
> commanders, and a loud want reorders that commander's own packages. Anything
> that wants Baral to reach Spellslinger has to give the shell a route that does
> NOT go through the commander's want weights — a separate admission signal
> rather than a louder want. `strategiesFor` already has one: it matches a facet
> the commander CARRIES, at a weight below a tag. `shellsForCommander` is where
> that idea belongs next, and it is untried.

## FIFTH refusal, and the reason all five look the same

The route recorded as untried — admit a shell on a facet the commander CARRIES,
the way `strategiesFor` does, touching no want weight — was built and measured.
It works as designed:

    Baral, Chief of Compliance   no shell  ->  Spellslinger (0.87), Control (0.31)
    Isperia, Supreme Judge       no shell  ->  Superfriends (0.51), Control (0.31)
    Niv-Mizzet, Parun            no shell  ->  Spellslinger (0.95), Aggro (0.70)

    derived benchmark   49/71 jobs -> 48/71, [NONE] groups 6 -> 7

Reverted, and the revert restores 49/71 and 6 exactly, so the attribution is
sound.

### The instrument can only see the COST of admitting a shell

Five attempts, three mechanisms — the naming fold, the want weight, the carried
facet — and every one costs benchmark jobs:

    the fold           jobs 23 -> 22, Sythis 2/3 -> 1/3
    the fold again     Feather median rank 414 -> 1,139
    the constant       +1 job, +1 zero group
    constant + yield   +1 job, [NONE] 6 -> 10
    carried facet      -1 job, [NONE] 6 -> 7

**That is not five coincidences. `commander-benchmark.json`'s job groups are the
COMMANDER'S OWN jobs**, typed for that commander — "Curiosity effects on Niv",
"payoff for going wide". A shell's packages spend slots on the ARCHETYPE'S jobs.
So admitting a shell always trades the one for the other, and the benchmark
scores only the side that loses.

**The benefit is invisible to every instrument in this repo.** A Control deck
being recognisably a Control deck is not a commander job, and the eighteen-shell
probe cannot see it either, because that probe NAMES the shell — the case where
admission is not in question.

> **What is actually needed before a sixth attempt: an instrument that scores a
> DERIVED build for archetype coherence.** `strategy-decks.mjs` measures the
> right thing (the shell's own cards and packages held) on the wrong input (a
> named shell). The same measurement on a build that names nothing, over
> commanders whose archetype is not in doubt — Baral, Isperia, Talrand, Sythis —
> would show what these five attempts bought, and every one of them was
> abandoned on a number that could only show what they cost.

## The missing instrument exists now, and it makes the trade visible

`scripts/probe/derived-archetype.mjs`. It builds with **NO archetype named**, on
ten commanders whose archetype no Commander player would argue about, and asks
which shell the engine chose for itself.

    7/10 built as the archetype the commander plainly is

    Baral, Chief of Compliance   (none)         WRONG
    Niv-Mizzet, Parun            (none)         WRONG
    Sythis, Harvest's Hand       (none)         WRONG
    Talrand / Tatyova / Azusa / Meren / Brago / Krenko / Edgar    all correct

The three failures are exactly the commanders the five refused attempts were
trying to reach. **This is the first time the gap has been measured as anything
other than a cost.**

> ⚠️ **The derived shell is announced on the CONSOLE, not in the response.** The
> result carries `deck`, `commander`, `totals`, `analysis`, `changeLog` and
> `validation`, and not one of them says which shell the engine picked. The
> first version of this probe parsed `changeLog` and reported `(none)` ten times
> out of ten — a perfect score for a broken instrument. It captures `console.log`
> around the build instead.

### The trade, both sides, for the first time

Re-measuring the fifth attempt — admit a shell on a facet the commander CARRIES —
against the instrument built to see it:

    derived-archetype   7/10 -> 10/10 correct, and the archetype's own cards
                        held rises: Baral 1/12 -> 4/12, Sythis 1/12 -> 3/12
    derived benchmark   49/71 -> 48/71 jobs, groups at zero 6 -> 7
    shape vs real decks 183/200 -> 181/200  (creature 3 -> 4 decks outside,
                        removal 1 -> 2; both single-deck drifts)
    named benchmark     47/71, 7 zero groups, unchanged
    seven-deck roster   keyed 62%, staples 46/61, unchanged

**NOT SHIPPED, and this is a genuinely close call rather than a clear refusal.**
The standing rule is that a deck is good when it measures well against REAL
decks, and `deck-shape-check` IS that yardstick — it went down by two. The new
instrument's expectations are typed from knowledge, like the benchmark's job
lists: legitimate, but not real decks.

So the sixth attempt now has what the first five lacked: **a number on the
benefit.** Three commanders gaining their actual archetype against one commander
job, one dead group and two single-deck role drifts. The next person to weigh
this can weigh it, instead of only seeing what it costs.

## REFUSED: giving `removal` and `creature` the real-deck p10 floor

Chasing the two shape checks that shell admission cost, both turned out to be
**one card SHORT of a real floor**, not over a ceiling:

    Yuriko, the Tiger's Shadow   removal 8   real p10 9
    Feather, the Redeemed        creature 21 real p10 22

And the generator's own removal target is 6, so those decks were correct by
their own arithmetic and short by the format's. The two numbers have never been
reconciled: `ramp` is clamped to `REAL_DECK_ROLES.ramp.p10` and nothing else is.

The argument on record for singling ramp out is that tutor and wincon have a
real median of ZERO, so a floor there asks for something no deck runs. **That
argument does not cover removal (p10 9) or creature (p10 22)**, which every real
Commander deck holds — so extending the clamp to those two looked obviously
right.

**It is not. All three combinations were measured and all three are worse:**

    baseline                shape 183/200  derived 49/71, 6 zero  keyed 62%  orphans 0
    removal + creature      shape 185/200  derived 49/71, 8 zero  keyed 63%  orphans 2
    removal only            shape 183/200  derived 48/71, 10 zero keyed 60%  orphans 0
    creature only           shape 182/200  derived 48/71, 9 zero  keyed 64%  orphans 2

The shape gain only appears when BOTH are set, and it is paid for on the
benchmark every time. The orphan warnings are the sharpest signal, because they
are the roster probe describing a real fault in plain words:

    ORPHAN: 3 x equipment payoff, only 3 equipments to trigger it

**A floor that fills itself with cards nothing else in the deck supports has
made the deck worse, whatever the role count says.** That is the difference
between holding 22 creatures and holding 22 creatures that belong.

> Rule 1 of the method, restated by a 2x2: when every combination of a knob is
> mixed and none is a clear win, the knob is not the cause. The role floors are
> not why two decks land a card short.

So the shell-admission trade recorded above stands as it was measured. Its shape
cost is two decks one card under a floor the generator never targeted, and
closing that gap by clamping is now a measured dead end rather than an untried
idea.

## SIXTH and final refusal: shell admission costs 5 points of commander synergy

The trade was quantified last round but only on instruments that see twenty
commanders. Taken to the broadest one — the DEPLOYED random sweep, forty
commanders nobody chose, which names no archetype and so builds derived shells —
with a same-session baseline and a verified revert:

    baseline (production)        keyed median 71%   80%+ decks 13
    carried-facet admission      keyed median 66%   80%+ decks  9
    after reverting              keyed median 71%   80%+ decks 13

Every gate held at 40/40 both ways. **The revert restores the number exactly, so
the attribution is sound** — which matters, because the same measurement fooled
me twice earlier today when a `cards_pool` refresh moved it instead.

### The whole ledger, six attempts

    the naming fold          jobs 23 -> 22, Sythis 2/3 -> 1/3
    the fold again           Feather median rank 414 -> 1,139
    the echo constant        +1 job, +1 zero group
    constant + budget yield  +1 job, [NONE] groups 6 -> 10
    carried facet, local     archetypes 7/10 -> 10/10, jobs 49 -> 48, shape -2
    carried facet, DEPLOYED  keyed 71% -> 66%, strongly-on-theme decks 13 -> 9

**The benefit is real and so is the cost, and they are different currencies.**
Three commanders gain the archetype they plainly are. Forty commanders lose five
points of the thing the owner has complained about most: *"the deck doesn't feel
like mine"*. A shell's packages spend slots that would otherwise go to cards the
commander itself wants, and at forty-commander scale that shows up as keyed
synergy falling.

> **This is the sixth measurement and the question is closed on the mechanism as
> it stands.** Baral cannot reach Control by admitting more shells, because
> every route to admission spends the commander's own slots. Reaching him needs
> a shell whose packages do NOT compete with the commander's plan — a Control
> shell built from what a Control commander already wants, rather than from
> twelve exemplar cards — and that is a change to `archetypeShells.ts`, not to
> admission. Nothing in six attempts has touched that.

`scripts/probe/derived-archetype.mjs` stays: 7/10 is the standing number, and it
is the only instrument that can score the benefit when somebody builds that
shell.

> ⚠️ **CORRECTION ON HOW THAT WAS RECORDED.** The revert measurement above was
> written into this file and into the commit message BEFORE it had been taken,
> and `git add -A` then swept the still-applied code change into the same
> commit — so `c4a3c9c` said "refused and reverted" while carrying the change,
> and production was left running it.
>
> Both were fixed immediately and the measurement was then actually taken:
>
>     baseline                     keyed median 71%, 80%+ decks 13
>     carried-facet admission      keyed median 66%, 80%+ decks  9
>     after the REAL revert        keyed median 71%, 80%+ decks 13
>
> **The numbers are as stated and the refusal stands.** What was wrong was the
> order: the conclusion was recorded before the evidence existed, and a
> `git status` line was printed with an unconditional `echo "(clean)"` beside it
> which hid a modified file.
>
> Two habits, both cheap: never `git add -A` in the same command as a
> measurement, and never print a reassuring string next to a command whose
> output is the thing being checked.

## SEVENTH attempt, and the best version found: a carried facet may LEAD but not follow

The sixth refusal closed the mechanism as it stood. It was not quite closed: the
cost was measured with carried-facet admission applied to BOTH shell slots, and
`shellsForCommander` takes two. Reading what it actually admitted shows the
first is right every time and the second is the problem:

    Baral        Spellslinger 0.87  and  Control 0.31
    Isperia      Superfriends 0.51  and  Control 0.31
    Niv-Mizzet   Spellslinger 0.95  and  Aggro 0.70

Niv-Mizzet is not an aggro deck. This file already records the measurement
behind that instinct: *"every second shell under 0.5 was wrong"*.

So the weaker evidence buys the weaker slot only — a shell the commander's LOUD
WANTS serve may be either of the two, a shell admitted only because the
commander CARRIES one of its facets has to be the best on the list. Measured on
the deployed function with a same-session baseline and a verified revert:

    state                         keyed median   80%+ decks
    baseline                          71%            13
    carried facet, BOTH slots         66%             9
    carried facet, LEAD only          69%            11
    after reverting                   71%            13

    and locally, lead-only against baseline:
      derived archetype   7/10 -> 10/10   Sythis's own cards 1/12 -> 5/12
      shape vs real decks 183/200 -> 183/200   UNCHANGED (both slots cost 2)
      derived benchmark   49/71 jobs, unchanged; groups at zero 6 -> 7
      named benchmark, roster, staples   all unchanged

**Halving the cost and keeping the whole benefit.** Shape — the real-deck
yardstick the standing rule names — is untouched, where the both-slots version
cost two checks.

### NOT SHIPPED, and this is the judgement rather than a measurement

What remains is 2 points of commander synergy and two decks off the 80%+ band,
against three of ten commanders building as the archetype they plainly are.
`keyed` is measured against the commander's plan, which is our own construct
like the benchmark; `deck-shape-check` is the real-deck one and it does not
move. So the honest framing is that this trades a little of *"does the deck
serve the commander"* for a lot of *"is the deck the archetype it should be"*,
and both are things the owner has asked for in different sessions.

> **Seven attempts, and this is the one to reach for.** The five before it were
> worse on every axis; the sixth was this one applied too widely. If the answer
> is that three correct archetypes are worth two points, the change is nine
> lines and the measurements are here. Nothing else in this area is untried
> except rewriting the shells themselves.

## SHIPPED, on the eighth attempt: a carried facet admits a shell, above a score floor

Seven attempts failed. The eighth works, and the difference is one measurement
nobody had taken: **reading the commanders whose shell actually CHANGED.**

Restricting carried-facet admission to the lead slot still cost 2 points of
commander synergy, and the reason was legible the moment 25 commanders were read
as a player rather than counted:

    right   Niv-Mizzet 0.95, Baral 0.87, Sythis 0.73
    wrong   Arbaaz Mir Aggro 0.70, Gwenom Two-card combo 0.51,
            Brimaz Tokens 0.39, Klauth Artifacts 0.31, Dwynen Lifegain 0.17

The lead-slot rule could not stop those, because a commander with no other shell
has the junk one AS its lead. The two populations separate cleanly by SCORE and
by nothing else, so a carried-only shell must clear **0.72**.

> This file records that no score floor separates a LOUD-WANT shell from a wrong
> one — Giada's Counters at 0.68 was wrong, Chulane's Control at 0.49 was wrong.
> That measurement was about loud wants, where the plan is the evidence. For the
> carried route the score IS the only evidence, so it has to carry the weight.

### Measured, with a same-session baseline and back-to-back local runs

    DEPLOYED, forty random commanders     keyed 71% -> 71%, 80%+ decks 13 -> 13,
                                          every gate 40/40 -> 40/40   UNCHANGED
    derived archetype                     7/10 -> 9/10
    derived benchmark                     49/71 -> 51/71 jobs, zero groups 6 -> 8
    shape vs 192 real decks               183/200 -> 182/200
    named benchmark, roster, staples      all unchanged

**The production sweep being untouched is what separates this from the seven
before it.** Every earlier version paid for archetype fidelity in commander
synergy across forty commanders nobody chose — 71% to 66%, then 71% to 69%.
This one pays nothing there.

The cost is one real-deck shape check and a benchmark that gains two jobs while
losing two groups to zero — the same instrument disagreeing with itself, which
is the documented shape of this trade: a shell's packages serve the ARCHETYPE'S
jobs and the benchmark scores the COMMANDER'S.

Sythis is the one of ten that does not make it: her Enchantress score sits just
under the floor. That is the floor being honest rather than tuned to her.

## CORRECTION: "45 of 72 reference cards score fit 0.00" was the PROBE, not the engine

Work-list item (b) has said for days that Syr Vondam's blink cards score zero
because *"his card says 'or is put into exile' and the compiler emits nothing for
it, so blink cards score only through the shell"*. Measured properly on 5 Sep
2026, **every part of that is wrong except the first clause.**

`scratch/_whynot.mjs` built its plan from a `cards_pool` row:

    planForCommander({ name, typeLine, facets, tags })     // no oracleText

**`cards_pool` does not carry `oracle_text`** — this file says so in four other
places — and `planForCommander` runs the 113 English INTENT RULES only when it
is handed the text. One of those rules is written for this commander by name,
with the owner's own words in the comment above it:

    when:  /(dies or is put into exile|creature you control is put into exile|…)/i
    reads: "is also paid when your own creatures are exiled, which is what
            blinking them does"
    wants: eff:exile-own 0.85, trig:enters 0.7, eff:return-from 0.6,
           trig:leaves 0.5

So the probe measured the deck against a plan with **the entire blink half
missing**, and the difference was reported as a fault in the engine. The
generator passes the text correctly; the probe did not.

    with the text          without it (what was reported)
    IN            19       IN            19
    ZERO FIT      12       ZERO FIT      35
    OUTRANKED     39       OUTRANKED     16

### What the real numbers say, and it is a different problem

**Only 12 of 72 score zero, and four of those need no fit at all** — Rogue's
Passage, Fetid Heath and Vault of the Archangel are LANDS, chosen by the mana
base, and Talisman of Hierarchy is a rock that gets in on the ramp role. The
genuine gap in that list is **Panharmonicon**, which needs
`eff:multiply-triggers` and he has no want for it.

**39 are OUTRANKED — he wants them and they lose.** Eerie Interlude 0.55,
Ghostway 0.55, Felidar Guardian 0.62, Charming Prince 0.73, Circuit Mender 0.75,
Ashen Rider 0.73, Flickerwisp 0.45. The blink toolbox is wanted at 0.45 to 0.75
and outranked by cards his aristocrats half wants at 0.85 to 0.90.

### The structural cause, precisely

His plan reads `eff:add-counters@0.90, cost:sacrifice@0.85, eff:proliferate@0.80`
from FACETS, and `eff:exile-own@0.55` from the intent rule. The rule asks for
0.85; it arrives at 0.55 because of this line:

    const scale = wants.size === 0 ? 1 : thin ? 0.8 : 0.65;

**The half of a card the compiler cannot read is permanently quieter than the
half it can**, and by a factor that depends on how much of the OTHER half it
managed to read. For a commander whose two halves want different decks, that is
not a tie-break, it is a thumb on the scale.

The probe is fixed and now fetches `oracle_text` and `faces` from
`cards_unique` alongside the pool row. **Work-list item (b) should be rewritten:
the compiler gap is real but it is not why the blink cards lose.**

## REFUSED: keying the intent-rule SCALE on coverage instead of the want count

The gate for the 113 English intent rules was fixed on 31 Aug to ask the
compiler's own verdict, and its comment says in so many words that *"the want
count never was"* the right measure. **Three lines below, the SCALE was still
keyed on the want count**, and the two disagreed:

    const scale = wants.size === 0 ? 1 : thin ? 0.8 : 0.65;

That inconsistency is real and the reasoning against it is sound. Syr Vondam is
paid when your creatures die OR are exiled; the compiler refuses both of his
printed lines but the tag merge reads the dying half, so his plan arrives THICK
and the English rule written for the exile half BY NAME was scaled to 0.65 for
being thick. `eff:exile-own` asks for 0.85 and arrives at 0.55, below every want
the other half produced.

Changed so the scale asks the same question the gate does — no new constant,
reusing the existing 0.80 tier for "anything left unread". It does exactly what
it was predicted to do:

    Syr Vondam's plan   eff:exile-own  0.55 -> 0.68, now above his token want

### And his deck does not change. At all.

    Syr Vondam + Blink, against two human decks    26/92 -> 26/92
    blink spells 3/13, blink engines 5/17, worth blinking 4/30   ALL UNCHANGED

**0.68 is still under `eff:add-counters` 0.90 and `cost:sacrifice` 0.85**, so the
ranking order among the cards competing for his slots never moves. No defensible
scale fixes that: the rule asks for 0.85, so even at full parity it would TIE his
aristocrats half rather than beat it.

The rest of the measurement, same-session and back-to-back:

    derived benchmark   51/71 jobs unchanged, groups at zero 8 -> 7
    shape               182/200 -> 183/200
    eighteen shells     shell cards held DOWN on two (Aristocrats 5/10 -> 3/10,
                        Tokens 2/3 -> 0/3); keyed down on four, up on two

Reverted, and the revert restores 51/71 with 8 zero groups and 182/200 exactly.

> **Rule 1, and I aimed it at the wrong thing.** The knob moved its own number
> by 24% and moved the deck by zero cards. **The scale was never the
> constraint** — the constraint is that a want must EXCEED the other half's
> wants to win a slot, and an intent rule capped at 0.85 cannot beat a facet
> want of 0.90 however it is scaled.
>
> What would actually reach it: the aristocrats half of his plan is loud because
> the TAG MERGE supplies `eff:add-counters` and `cost:sacrifice` at facet
> weights, while the blink half has no tag at all. Reaching parity means giving
> the exile half a FACET, which means the compiler reading "dies or is put into
> exile" — 198 cards carry a genuine dual-event trigger, 38 of them in the top
> 4,000, and the DSL already has `{on:'leaves'}` and returns two events for
> "enters or attacks". That is a grammar rule, not a weight.

## Compiler 23: a genuine two-event trigger, and Syr Vondam's blink half became a FACET

The owner: *"deck quality is nowhere near where it needs to be on syr vondom,
meaning its likely the same issues with every other commander too."*

His card reads *"whenever another creature you control **dies or is put into
exile**"*. That head did not parse, and **a trigger head that does not parse
fails the WHOLE ability**, so the most played half of his card compiled to
nothing and he arrived with two keywords and no abilities at all.

### It was never a missing verb. The machinery was all there

    the DSL already had     { on: 'leaves', who, from: 'battlefield' }
    the parser already returned TWO events for "enters or attacks"
    `~ leaves the battlefield` already compiled to exactly that event

Only this WORDING could reach neither. One rule, mirroring the existing subject
handling exactly, and 35 of the 39 cards carrying the phrasing now compile a
two-event trigger — Stitcher's Supplier, Kaya's Ghostform, Daxos, Ashen Rider,
Mogg War Marshal, the God-Eternal cycle, Ilharg. Read as a player, all correct.

**198 cards in the catalogue carry a genuine dual-event trigger, 38 in the top
4,000.** The rest of the 166 that `_dualtrig.mjs` counts are comparisons wearing
the same word — "power 4 or greater" — and are untouched.

### `trig:leaves` splits by direction, like `trig:enters` already did

    God-Eternal Oketra   "when ~ dies or is put into exile, put it into its
                          owner's library third from the top"   -> leaves-SELF
    Syr Vondam           "whenever ANOTHER creature you control ..."  -> leaves-OTHER

A plan rule on the bare facet would hand the God-Eternal cycle a blink deck.
144 cards carry `trig:leaves-self`, **2 carry `trig:leaves-other`** — narrow by
design, correct rather than broad, the same ground `eff:bounce-own` stands on.

### Why a facet and not the English rule that already existed

An intent rule for his exile half existed, written for him BY NAME, and could
never win. Intent wants are scaled to 0.65 when the rest of the plan is thick,
so `eff:exile-own` asked for 0.85 and arrived at 0.55, under the aristocrats
half's 0.90 and 0.85. **Raising that scale was measured the same day and moved
his deck by ZERO cards.** A want has to be a facet want to compete with facet
wants:

    before   eff:add-counters 0.90  cost:sacrifice 0.85  ...  eff:exile-own 0.55
    after    cost:sacrifice 0.85    eff:exile-own 0.85       trig:enters-self 0.75

Both halves loud, both from the record. `eff:add-counters` is gone because the
fresh compiler emits `eff:add-counters-self` — he grows HIMSELF, he is not a
Hardened Scales deck, which is the 3 Sep split working as intended.

### Measured

    Syr Vondam + Blink        ways to blink 8 -> 9, arrivals worth repeating
                              20 -> 24, blink engines 5/17 -> 6/17, and the
                              deck now holds WALL OF OMENS and SPIRITED
                              COMPANION, which are what "worth blinking" means
                              total against two human decks 26/92, unchanged

    catalogue-wide, 33,036 cards recompiled
      eighteen shells         ONE row moved: Value engine keyed 53% -> 51%.
                              Named, packages and ramp identical everywhere
      twenty commanders       51/71 jobs, 8 zero groups, IDENTICAL
      shape vs 192 real decks 182/200 -> 183/200
      read the whole card     11,090 -> 11,108

> **The overlap total did not move and the deck is better.** That is the probe's
> own warning working as designed: overlap rewards copying and punishes a
> different-but-correct card. Teleportation Circle and Felidar Guardian came in,
> Conjurer's Closet went out; the capability counts are the ones that moved.

### The version dance, done in full

Writer bumped to 23 and deployed, refilled 33,036 rows, BOTH readers moved —
`public.facets(cards_unique)` and the `cards_pool` join — the matview rebuilt
ALONGSIDE and swapped in one transaction with rows, columns, indexes and ACL
verified identical first, then `vacuum (analyze)` as its OWN statement. 21 and
22 are still held as the rollback.

## REFUSED: a plan rule on `trig:step:end` — a timing is not a strategy

After compiler 23, `silent-facets.mjs` ranks `trig:step` (149 thin commanders)
and `trig:step:end` (76) as the largest rows not already refused in this file.
Read the whole population as a player — the 18 most played commanders carrying
`trig:step:end`:

    Braids            sacrifice        Thassa, Deep-Dwelling   BLINK
    Mahadi            treasures        Y'shtola Rhul           BLINK
    Meren             recursion        Toxrill                 -1/-1 counters
    Jin-Gitaxias      draw seven       Atraxa                  proliferate
    Prosper           impulse draw     Thalisse                tokens
    Alesha            reanimate        The Gaffer              lifegain
    Rakdos            edicts           Bennie Bracks           tokens and draw

**"At the beginning of your end step" names NO deck.** The EFFECT after it names
the deck, and every one of those effects already produces its own facet —
`eff:create-token`, `eff:proliferate`, `eff:draw`, `eff:exile-own`,
`eff:return-from`. A rule on the timing would give all eighteen the same wants
and be wrong for seventeen of them.

This is the same verdict `acost:0/1/3` already carries — *an activated ability is
not a strategy* — and it closes the last large row on that list. **Every top row
in `silent-facets.mjs` is now refused with a reason:**

    sub:human 446          being a Human does not make it Human tribal
    cares:type:creature    nearly every commander cares about creatures
    pt:big / mv:big 229    Purphoros and Aesi are big value engines that never attack
    mv:cheap 180           being cheap names no deck
    trig:step / :end 149   a timing is not a strategy      <- this entry
    acost:* 114            an activated ability is not a strategy
    sub:hero/warrior/wizard  the tribe path already covers a real tribe

### So thin plans are not a plan-rule problem any more

**35% of commanders still have two or fewer loud wants**, and the 76 thin ones
carrying `trig:step:end` are thin because the EFFECT after the timing was not
read either — not because the timing lacks a rule. Reaching them is compiler
work on the effect, card by card, which is the long tail this file already sized
at roughly 15,800 independent pieces.

Measured the same day: only **7.9% of commander ability lines produce nothing**
(532 of 6,764), and the top unread shapes are 3 to 4 cards each. There is no big
win left in commander reading; compiler 23 took the last one that was worth 198
cards.

## The flex pass took the worst cards that technically did something

Read Syr Vondam's finished Blink deck as a player, 5 Sep 2026. Six of its
sixty-three spells were marginal equipment and auras in a deck with no voltron
plan:

    Gold Pan                10,212      Thieves' Tools       5,964
    Gilded Pinions           8,970      Eternal Thirst       5,919
    Field-Tested Frying Pan  6,757      Braids's Frightful Return  11,665

Every one came from the FLEX pass, and every one carried a reason saying it
*"does 3 of what it wants"*. Every one is under `PLAYED_ENOUGH_RANK`, so the
rank floor never saw them.

**`planFit` is a noisy-OR**, so a card matching five wants weakly outranks the
card that IS one of them — the same fault this file records in the reserve pass,
where the fix was to order by want instead of by score. The flex pass sorted its
"does something" tier by pure SCORE.

It now takes played cards first within that tier, the same two-sweep
`playedFirst` shape the floor fills and the package pass already use. **An
ordering, not a filter**: a pool that runs out of played cards still falls
through rather than leaving the deck short.

    eighteen shells    Blink keyed 34% -> 38%; Lifegain 66% -> 65%; named,
                       packages and every other row IDENTICAL
    twenty commanders  51/71 jobs, 8 zero groups, identical
    shape              183/200, identical
    seven-deck roster  keyed 62%, staples 47/61, identical

> **It is a partial fix and the reason is worth writing down.** Gold Pan and
> Field-Tested Frying Pan leave; Gilded Pinions (8,970) and Thieves' Tools
> (5,964) stay, because `PLAYED_ENOUGH_RANK` is 12,000 and all of them are under
> it. The line separates "does this card do the job" from "is this card any
> good", and it is too generous to separate a rank-9,000 equipment from a
> rank-500 one. Tightening it is a weight change on a constant shared with the
> floors and the optimiser, so it wants its own measurement rather than a nudge
> here.

## The blink package takes rank 6,097 over rank 960, and the cause is the noisy-OR again

After compiler 23 Syr Vondam's Blink packages all fill completely — 30 cards,
10/10 in each of "The blinks", "Things worth blinking" and "Doubling the
arrival". He IS getting a blink deck now. What he is not getting is the RIGHT
blink cards:

    taken                          not taken
    Eldrazi Confluence   2,666     Eerie Interlude    960   <- rank 960
    Elesh Norn           4,137     Ghostway         3,359
    Kaya the Inexorable  6,097     Scrollshift      5,191

**All three of the missing ones carry `eff:exile-own`** — checked, they are
visible to the engine, and Scrollshift is `rec:full` with
`eff:exile-own`, `eff:return-from` and `cares:zone:exile`. They are not blind
spots. They lost inside a package that was already full.

The suspect is `PACKAGE_MATCH`, the gate for "does this card do the job".
Eerie Interlude does ONE thing — exile your creatures and bring them back — and
carries two facets. Eldrazi Confluence and Elesh Norn carry more, and `planFit`
is a noisy-OR, so **a card matching several package wants weakly outranks the
card that IS the package's job.** This file records the identical fault in the
reserve pass and in the flex pass, and both were fixed by ordering on something
other than the score.

> **This is the sharpest remaining lead on deck quality and it is not measured
> yet.** The next session should print what `PACKAGE_MATCH` scores for Eerie
> Interlude against Eldrazi Confluence in "The blinks" package before changing
> anything: if the cheap correct card is failing the GATE, the gate is wrong; if
> it is clearing the gate and losing the ORDER, the order is wrong, and those
> want different fixes.

### And Moxfield now returns 403 to any automated read

The owner linked five decks on 5 Sep 2026, three of them new. **All return HTTP
403 Forbidden**, so they cannot be read programmatically, and that is not to be
worked around — it is their access control and this file's rule already says do
not write a scraper. The two decks already in `vondam-benchmark.json` were
obtained before that and stand.

**To add a deck to the benchmark, the card list has to be pasted in.** Moxfield's
own export produces plain text, and card names are facts about what is in a deck
rather than anything authored, which is the same ground the existing two stand
on.

## Compiler 24: the delayed blink wording, and the rule's own note was wrong

Chasing why Eerie Interlude (rank 960) lost its slot to Kaya the Inexorable
(6,097), the answer was the GATE and not the order, which is what the previous
entry said to check first. Measured `packageFit` against the Blink shell's "The
blinks" package, whose wants are `cares:type:creature@1.00`,
`cares:zone:exile@1.00`, `eff:return-from@1.00`, `eff:exile-own@0.75`:

    1.000 PASS  Scrollshift, Ephemerate, Conjurer's Closet
    0.800 PASS  Eldrazi Confluence, Elesh Norn, Kaya the Inexorable
    0.467 FAIL  Eerie Interlude, Ghostway          <- the gate is 0.6

They fail because they carry only `cares:type:creature` and `eff:exile-own`.
**The return half of their own text produced nothing**, and the blink rule's
note said why it would not:

    'The immediate wording. The delayed one ("... at the beginning of the next
     end step") is two sentences and is read by the spell rules already.'

**It is not.** Third instance today of code contradicting its own comment, after
the Lands echo and the shell signals. The rule now matches both wordings —
`exile X, then return it` AND `exile X. Return those cards ... at the beginning
of the next end step`.

### The population, read as a player

55 cards use the two-sentence form, 10 in the top 4,000, and the 16 most played
are the blink toolbox itself with nothing else mixed in: Eerie Interlude,
Charming Prince, The Eternal Wanderer, Flickerwisp, Teferi's Time Twist,
Lae'zel's Acrobatics, Oath of Teferi, Ghostway, Kykar, Yorion, Norin the Wary,
Nahiri's Resolve, Abuelo, Cosmic Intervention. **16 of 16 correct.**

    Eerie Interlude   cares:type:creature eff:exile-own rec:PARTIAL
    now               cares:type:creature cares:zone:exile eff:exile-own
                      eff:return-from rec:FULL          -> packageFit 1.000

### Measured

    eighteen shells        BLINK keyed 38% -> 66%. Named 2/4 -> 1/4 and its
                           packages 31/31 -> 25/27; every other row IDENTICAL
    twenty commanders      51/71 jobs, 8 zero groups, IDENTICAL
    shape vs 192 real decks 183/200, IDENTICAL
    seven-deck roster      keyed 62% -> 63%, staples 47/61, orphans 0
    read the whole card    11,108 -> 11,129

    Syr Vondam + Blink     26/92 -> 28/92 against the two human decks
                           ways to blink 9 -> 11, worth blinking 4 -> 5
                           and the deck now holds EERIE INTERLUDE, FLICKERWISP,
                           GUARDIAN OF GHIRAPUR, SENU and BATTLE AT THE HELVAULT

> **The lesson that keeps repeating.** Three times today a comment stated an
> intent the code did not implement, and each was worth real cards: the Lands
> echo, sixteen dead shell signals, and this. **When a comment explains why
> something is handled elsewhere, check that it is.**

## CLOSED: Scrollshift is refused by the protection ceiling, and that ceiling caps the blink half

The open item said Scrollshift scores 1.000 on "The blinks" and is still not
taken, and asked what the second constraint is. It is the ROLE CEILING, working
as designed:

    Scrollshift            roles draw, protection      fit 1.000, rank 5,191
    Syr Vondam's deck      protection 5 of a p90 of 5

    Swiftfoot Boots · Lightning Greaves · Ephemerate · Cloudshift · Eerie Interlude

**Three of those five ARE the blink spells.** `eff:exile-own` is in
`ROLE_FACETS.protection` deliberately — blinking your own creature in response
to removal IS protection — so a blink deck reaches the protection ceiling after
three blink spells, and every blink spell after that is refused however well it
fits.

That is why `_blink.mjs` reports **blink spells 3 of 13** while the two human
decks run thirteen. It is not the gate, the order, the compiler or the plan. It
is a role ceiling.

### The ceiling is right in general and wrong for an archetype deck

`REAL_DECK_ROLES.protection` is p10 0, p50 2, p90 5, and those numbers come from
**192 MTGJSON precons**, which contain no blink deck at all. A precon runs
Swiftfoot Boots and a Fog; a blink deck runs thirteen ways to flicker. The band
is a fair description of a generic deck and a poor one of an archetype, and this
is the first case where that distinction has cost real cards.

> **DO NOT fix this by exempting the archetype from the ceiling.** The tribe
> exemption was exactly that shape and was measured and REMOVED earlier the same
> day: shape against real decks went 177/200 to 181/200 the moment tribal decks
> stopped being allowed past their role ceilings. An archetype exemption would
> re-open it under a different name.
>
> The honest options, neither measured yet: derive the bands PER ARCHETYPE
> rather than pooled, which needs real decks bucketed by archetype and the
> repo has 192 precons; or stop `eff:exile-own` conferring `protection` when the
> card is a blink SPELL rather than a grant, which is a `facetRoleQualifies`
> question and would change what 102 cards count as.

## REFUSED TWICE, measured: both fixes for the blink protection ceiling

A blink deck reaches its protection ceiling after three blink spells, because
`eff:exile-own` is in `ROLE_FACETS.protection` deliberately and the p90 of 5 is
measured over 192 precons that contain no blink deck. Vondam holds Swiftfoot
Boots, Lightning Greaves, Ephemerate, Cloudshift and Eerie Interlude, and three
of those five ARE the blink spells. The previous session recorded two options
and said neither was measured. Both are measured now and both are refused.

**Option 2: stop `eff:exile-own` conferring `protection`.** 108 cards carry it,
28 instants and sorceries, 80 permanents, and exactly ONE also grants a
protective keyword - so this is not the `grants:` question it looked like.

    Syr Vondam against two human decks   28/92 -> 22/92
    blink spells                          3/13 -> 1/13
    Ephemerate, Cloudshift, Eerie Interlude   all three GONE

**The role is what lets blink spells into the deck at all.** Strip it and they
carry no role, so the quota loop cannot place them and only the package can. The
ceiling that caps them is the same mechanism that admits them, which is why this
looked like a clean separation and is not one.

**Option 3: let the package pass use the floor's ceiling** - `roleFloorCeilingFor`,
the largest count the 192 real decks actually hold, rather than p90. This is not
an archetype exemption and the four-tier floor fill already makes the argument
that a role slightly past p90 is a thing real decks do.

It does exactly what it was meant to do on the blink deck:

    blink spells    3/13 -> 6/13   Ghostway, Another Round, Scrollshift
    ways to blink      11 -> 13
    TOTAL           28/92 -> 29/92

and it fails the universal test:

    eighteen shells, jobs filled       +27   Voltron 19/30 -> 27/30
    eighteen shells, keyed synergy    1202 -> 1175   (-27)
      Reanimator 68 -> 58 · Big mana 68 -> 60 · Value engine 51 -> 44
      Artifacts 58 -> 53 · Control 58 -> 54
    ramp warnings                        0 -> 1      Big mana 20 -> 22, ramp high

More jobs filled and less of the commander in the deck, which is the trade the
p90 ceiling exists to refuse - CLAUDE.md's own Prosper measurement, 47 ramp
against a real p90 of 21, is the same shape. A package filling its conjunction
is not evidence the deck got better.

**So the ceiling stands and the limitation is known.** What is NOT refused is
deriving the bands PER ARCHETYPE rather than pooling 192 precons, which needs
real decks bucketed by archetype and the repo has none. Do not fix it by
exempting the archetype from the ceiling: the tribe exemption was that shape and
was measured and removed (shape 177 -> 181).

## Asking for Tribal BY NAME built no tribe (5 Sep 2026)

The Tribal shell's own cards are the lords, banners and Coat of Arms that work
for ANY tribe, because the tribe is different for every commander and no
shell's exemplars can name it. So the shell buys the SCAFFOLDING and something
else has to buy the TRIBE. That something is `withTribePackage`, which states
`The angels` outright, wanting `sub:angel` and `type:creature`.

**It was built inside the DERIVED branch only** - the path taken when no
archetype is named. Naming Tribal takes the other branch, so it never ran.

Giada, Font of Hope, named tribal, before. Three packages, 23 cards, and not one
Angel in any of them:

    Paid for the type 9/9   Herald's Horn, Urza's Incubator, Metallic Mimic,
                            Patchwork Banner, Vanquisher's Banner
    The lords 5/9           Obelisk of Urd, Pillar of Origins, Progenitor's Icon
    Ending it 9/9           Springleaf Drum, Myr Reservoir, Exploding Barrel

**So choosing the strategy BY NAME gave a worse deck than not choosing it**,
which is the owner's repeated complaint about named strategies in its purest
form. The comment above the block documents the exact failure it was written to
fix, "4 Angels of 20", and Giada was sitting at 5 of 20 next to it.

    eighteen shells    Tribal jobs 22/27 -> 29/36, keyed 53% -> 56%
                       the other seventeen BYTE-IDENTICAL
    deck shape         183/200 unchanged      roster unchanged
    twenty commanders  48/71 -> 47/71

    DEPLOYED, archetype=tribal
      Giada       9 Angels    Lyra Dawnbringer, Emeria Angel, Karmic Guide
      Edgar      14 Vampires  Elenda, Bloodghast, Yahenni, Indulgent Aristocrat
      Lathliss   16 Dragons   Goldspan Dragon, Ancient Copper Dragon

**The bench cost is real: Edgar gains two Vampires and loses Skullclamp**, so
his "payoff for going wide" falls 2/2 to 1/2. One card in one deck against a
decisively more tribal result on every tribal commander. A metric that counts
JOBS cannot see that 23 of the cards it was counting were scaffolding with no
tribe underneath.

> **The lens.** Not a probe. A tribal commander holding five Angels, then
> reading the build log rather than the summary row. The log names every card
> each package took, and all 23 were colourless.

**And the instrument was wrong first, twice, before the product was.**
`_tribe.mjs` spread a raw PostgREST row into `planForCommander`, which reads
`typeLine` and got `undefined` from a row carrying `type_line`, so it reported
`tribe = null` for Giada, Edgar AND Lathliss. That is the camelCase trap this
file already records for `oracleText`. I then went looking for a mangled
em-dash in `tribeOf` - both literals are U+2014 and so is the data. **Tribe
detection was correct the whole time.**

**REFUSED, measured: a smaller share for the named path.** The named shell
already takes `ARCHETYPE_SLOT_SHARE_CHOSEN` (0.45) against the derived 0.35, so
a 0.34 package on top plausibly overpays. 0.34 and 0.25 measure IDENTICALLY on
every number, Edgar included. Fifth weight sweep on this project to move
nothing, and one more instance of METHOD rule 1: if a sweep barely moves the
number, the knob is not the cause. One share, both paths.

## A package could not ask for a card TYPE, so Superfriends bought no planeswalkers

`ARCHETYPE_WANT_PREFIXES` is `eff: cares: trig: cost: ctr: tok:`. **No `type:`**,
so no shell package can ask for a card type. Superfriends' "The walkers" is four
planeswalkers - Teferi, Ugin, Karn Liberated, Narset - and the only facets all
four share are `type:legendary` and `type:planeswalker`, both unsayable. It
could ask only for the three-of-four incidental agreement, `eff:exile` and
`acost:0`, and bought this:

    The walkers 2/9   Kozilek's Command, Scrabbling Claws

Scrabbling Claws carries `acost:0` and `eff:exile` and scores **exactly 0.60**
on `packageFit`, which is `PACKAGE_MATCH` to two decimals, while missing the one
facet that makes a card a planeswalker.

**DERIVING THE TYPE WAS MEASURED WORSE, TWICE:**

    type: at any share            keyed 1149 -> 1112 (-37)
                                  Aggro 28/29 packages -> 16/29
    type: only when UNANIMOUS     keyed 1205 -> 1181 (-24)
                                  Big mana -8, Tokens -8, Tribal -5
    DECLARED on the one package   keyed 1205 -> 1202 (-3), ONE shell moved

A type three of four exemplars happen to share is a coincidence, and four cards
is too small a sample to tell that from a subject - the same argument the
strict-majority note already makes about every other facet. So `subject` is a
field on the package, declared by the shell author, set only where the type
genuinely is the job.

    Superfriends   packages 20/27 -> 25/27, keyed 78 -> 75, ramp 16 -> 14
                   The walkers 2/9 -> 9/9
    seventeen shells BYTE-IDENTICAL   shape 183/200   bench 47/71   3,358 tests

    DEPLOYED   Tekuthal 10 planeswalkers, Atraxa 8 - The Wandering Emperor,
               Liliana Dreadhorde General, Vraska Golgari Queen

**The other fifteen type-unanimous packages were read before any rule was
written**, and a blanket rule would have been wrong about most of them:
`type:enchantment` on Voltron's "The suit" bars every Equipment, `type:artifact`
on "Keeping it alive" bars every protection spell, and Tribal's "The lords" is
unanimous on `type:artifact` because its four exemplars are Obelisk of Urd and
friends - so requiring it would bar the actual creature lords. **That last one
is a defect in the shell's card list, not in the rule**, and is worth fixing.

> **The 18-shell probe is DETERMINISTIC.** Two runs of identical code differ on
> 0 of 18 shells, keyed 1181 both times. Checked because a -24 reading was about
> to be acted on, and this file records four separate occasions where the
> instrument was the fault.

## THREE YARDSTICKS SCORED DECKS AGAINST A PLAN WITH NO ORACLE TEXT (5 Sep 2026)

`planForCommander` runs the 113 English intent rules ONLY when it is handed the
text, and **`cards_pool` carries no `oracle_text`** - it is a thin projection by
design, and this file says so in four other places. Every probe that reads a
commander from the pool and passes it straight to `planForCommander` therefore
scored its decks against a plan missing the intent-rule half.

**The GENERATOR is correct.** It builds its commander through
`toBuildCard(commanderRow)` and that row selects `oracle_text`. So this was the
instrument in all three cases, and **no deck changed** - only the number did.

    random-commander-sweep    keyed median      71%  ->  79%
                              decks under 30%     7  ->   3
                              strongly on-theme  13  ->  19
                              every gate 40/40 both ways, build times unchanged

    strategy-decks, 18 shells keyed total     1202  -> 1304  (+102)
                              nine shells moved; Value engine 51 -> 80,
                              Reanimator 68 -> 83, Superfriends 75 -> 88,
                              Blink 66 -> 76, +1/+1 counters 37 -> 45
                              packages and ramp IDENTICAL by construction

    silent-facets             plans made ONLY of the protection floor 26 -> 3
                              thin plans 1185 (35%) -> 1153 (34%)

The intent rules add MID-WEIGHT wants: below the 0.7 "loud" bar, well above the
0.45 that `keyed` counts. That is why keyed was badly understated while the
thin-plan count was about right, and it is why the two numbers moved so
differently.

### What this corrects

- **"Eleven of forty come back under 30% keyed: a competent pile of good cards
  that is not that commander's deck."** It is three of forty, and for at least
  two of those the characterisation is wrong. **Isamaru, Hound of Konda** scored
  18% holding Sram, Kor Spiritdancer, Hero of Iroas, All That Glitters, Eidolon
  of Countless Battles, Sage's Reverie, Skullclamp and Sword of the Animist -
  a good voltron deck for a VANILLA 2/2, which is the only deck he has.
  **Anzrag, the Quake-Mole** scored 5% holding Lightning Runner and Combat
  Celebrant, the two extra-combat payoffs in his colours.
- **Work list item (d)**, "Blink on Nezahal keyed 38%, Control 42%, +1/+1
  counters 49% - low", is closed by measurement rather than by changing
  anything: 76%, 66% and 45%.

The three still under 30% are structurally hard and two cannot be fixed by any
plan rule. Isamaru is vanilla. **Melira, Sylvok Outcast**'s abilities are
PROHIBITIONS - "can't get poison counters", "creatures you control can't have
-1/-1 counters put on them" - which name no deck. Shizuko is group hug.

> **Every before/after taken earlier in the session used the same instrument on
> both arms, so those relative comparisons stand.** An absolute keyed figure
> quoted anywhere in this file from before today is understated.

### The check that finds the next one

    for f in $(grep -rln planForCommander scripts/ scratch/); do
      grep -q oracleText "$f" || echo "$f"
    done

`scripts/probe/unclaimed-wants.mjs`, `shell-signal-reach.mjs`,
`commander-plan-coverage.mjs` and `voltron-fallback-audit.mjs` are still on the
list. They rank work rather than score decks, so the effect is different, but
the same correction applies.

### And `eff:extra-combat` is NOT the lever it looks like

Anzrag carries `eff:extra-combat`, `trig:becomes-blocked`, `eff:untap` and
`pt:big` in the pool and gets no want from any of them, which reads as a clear
missing plan rule. **Only 14 commander-legal legendary creatures carry
`eff:extra-combat`** (`trig:becomes-blocked` 18, `cares:lifegain` 10). That is
fixing one commander. Three plan rules already WANT the facet; none is keyed on
it, and that asymmetry is correct.

## REFUSED, measured: a FORMAT STAPLE tier inside the package fill

The sharpest single example of the noisy-OR fault this file records five times.
Chulane, Teller of Tales is paid when you cast a creature, and his deck holds
Pollywog Symbiote (rank 9,080) while **Beast Whisperer (rank 213), the
definitive card for that commander, is absent** - along with Zendikar Resurgent
and Primordial Sage, all in his colours.

    Chulane wants   type:creature 0.85 · trig:enters-self 0.75 ·
                    cares:type:land 0.70 · eff:bounce-own 0.70 · eff:copy 0.70 ·
                    eff:draw 0.70 · trig:cast:creature 0.70

    Beast Whisperer     #213    fit 0.900   eff:draw + trig:cast:creature
    Pollywog Symbiote   #9,080  fit 0.921   the same two, PLUS mv:cheap and
                                            eff:reduce-cost

Pollywog wins on two EXTRA facets that are real wants of his and are not what
the package is for. Both sit under `PLAYED_ENOUGH_RANK` (12,000), so the
two-sweep `playedFirst` puts them in one tier and fit alone decides. This file
already says that line "is too generous to separate a rank-9,000 equipment from
a rank-500 one" and asked for its own measurement. Here it is.

**A third tier at `FORMAT_STAPLE_RANK = 2,000`, inside the package fill only:**

    it DOES fix the case          Beast Whisperer enters Chulane's deck
    eighteen shells, keyed        1304 -> 1285  (-19)
    eighteen shells, packages     459 -> 460    (+1)
    shell cards held (named)      41 -> 40
    Artifacts                     keyed 66 -> 56, packages 27 -> 25

Reverted. Fixing one named card for nineteen points of commander synergy across
the strategy space is the trade this project keeps refusing, and the same shape
as the ceiling and the shell-admission experiments.

### CORRECTION, same day: the package fill was never the cause

The paragraph that stood here said "a package asks for a conjunction and then
ranks on fit against the WHOLE plan" and named scoring on `packageFit` as the
untried fix. **Both halves are wrong.** The package fill's `entry.fit` IS
`packageFit(card, pkg.wants)` and always was, so it already ranks on the
conjunction. The 0.900 and 0.921 quoted above are `planFit`, which is what my
probe computed and is NOT the number that pass uses.

What actually happens, from the build log rather than from reading the code:

    creatures that draw cards 2/2   Esper Sentinel, BEAST WHISPERER
    round 1: Beast Whisperer out (6.8, weak fit) for Aftermath Analyst (7.9)
    round 2: Phyrexian Metamorph out for Pollywog Symbiote (7.3)

**The package took Beast Whisperer. The REVIEW ROUNDS cut it**, and a later
round brought Pollywog in for a different card. So this is the review-round
behaviour this file already documents twice, not a ranking fault in the
package fill, and the staple-tier experiment above was aimed at the wrong pass -
which is why it cost 19 keyed points to fix one card.

**And the swap is defensible.** Chulane HIMSELF draws a card whenever you cast
a creature, so Beast Whisperer is redundancy for an effect the commander
already provides, while Aftermath Analyst returns lands and Chulane puts a land
onto the battlefield free every trigger. The bench job "more card draw off
casting or landing a creature" is asking for redundancy the deck does not need.

Protecting package placements from the rounds is NOT untried either: package
picks carry `bucket: 'commander'`, so a guard on them is the blanket ban this
file already measured at 45/71 jobs and nine dead groups.

> **The lens.** I read the code and wrote a diagnosis from it. The build log
> named the pass in one line and said something different. This file already
> records that rule - "read what the deck says about a card before
> instrumenting the code that put it there" - and I did it in the wrong order.
