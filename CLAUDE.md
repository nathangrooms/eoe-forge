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

---

## 7. Database

39 public tables (re-counted 2026-08-18). Largest: `cards` (34,088), `card_price_history` (31,626),
`deck_cards` (459), `tasks` (166), `activity_log` (130), `wishlist` (94), `user_collections` (51),
`user_decks` (15), `profiles` (13).

### Price-history coverage — diagnosed 2026-08-18

The old note said `daily-price-capture` "only widens coverage for cards someone already owns or
watches". **That is not what it does.** It pages the whole `cards` table — but it fetches Scryfall one
card at a time with a 125 ms delay, always starting at `offset=0` (cron passes no offset), so it dies
on the edge wall clock after ~400 cards and re-captures the *same* ~342 cards every run. Its
`BATCH_SIZE = 75` constant (Scryfall's `/cards/collection` bulk limit) is declared and never used.

Real coverage: 701 of 34,088 cards, and only **14 of the 572 cards users actually own, wishlist,
deck or list**. Capture also stopped entirely between 2026-02-20 and 2026-08-18.

`scryfall-sync` already refreshes `cards.prices` nightly (33,903 of 34,088 rows touched within 2
days), so the snapshot needs **no Scryfall traffic at all**. `public.capture_daily_prices(scope,
min_usd, date)` does it as an `INSERT … SELECT`: measured 2,884 rows in 2.5 s for scope `'relevant'`
(all 572 user-relevant cards + everything ≥ $5) and all 34,088 rows in 1.6 s for scope `'all'`.
Storage measured at **410 bytes/row** including the three indexes:

| scope | rows/day | rows/year | storage/year |
|---|---|---|---|
| user-relevant only (572) | 572 | 209 k | ~86 MB |
| relevant + ≥ $20 (1,138) | 1,138 | 415 k | ~170 MB |
| **relevant + ≥ $5 (2,884) — recommended** | 2,884 | 1.05 M | **~430 MB** |
| entire catalogue (34,088) | 34,088 | 12.4 M | ~5.1 GB |

The cron job was **not** repointed — that is a storage-cost decision. To switch it on:
`select cron.alter_job(1, command => $$select public.capture_daily_prices('relevant', 5)$$);`

Existing enums: `task_status` (pending, in_progress, blocked, done), `task_category` (feature, bug,
improvement, core_functionality), `task_priority` (high, medium, low), `subscription_tier` (free, pro, unlimited).

**Extensions:** `pg_cron` and `pg_net` are both installed and available for scheduling.

### Edge Functions (20, all ACTIVE)
`scryfall-sync`, `simple-sync`, `test-scryfall` · `ai-deck-builder`, `ai-deck-builder-v2`, `mtg-brain`,
`gemini-deck-coach`, `deck-optimizer`, `calculate-deck-power`, `edh-power-check` ·
`scan-match`, `scan-card-ai` · `daily-price-capture`, `capture-card-price`, `capture-collection-value`,
`price-drop-alerts` · `fetch-precons`, `proxy-image`, `rate-limiter`

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

Left deliberately unchanged: `profiles` is world-readable by design (but two usernames are raw email
addresses — worth scrubbing); `deck_share_events` accepts anonymous inserts because logged-out
share-page views are tracked client-side; `listings`/`wishlist_shares` are owner-only, so the
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
`/deck-builder` · `/deck/:id` · `/builder` · `/smart-builder` · `/brain` · `/templates` · `/cards` ·
`/wishlist` · `/simulate` · `/tournament` · `/settings` · `/admin` · `/landing`

Component-count hotspots: `deck-builder/` **95**, `ui/` 55, `collection/` 32, `marketing/` 28,
`simulation/` 19, `marketplace/` 18, `admin/` 14, `wishlist/` 13.

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
