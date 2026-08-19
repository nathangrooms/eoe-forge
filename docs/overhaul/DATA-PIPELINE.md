# The data pipeline

**Date:** 2026-08-19
**Owner's ask:** *"any way to pull it and ensure we scan for changes daily, also auto run scryfall
and every other update we need for long term data (if we can fill old and then update daily by
github automation would be amazing)"*

Every number here was measured against the live database (`udnaflcohfyljrsgqggy`) on 2026-08-19.
Where something was not measured it says so.

**Companion documents.** `PRICE-HISTORY.md` establishes what price data can legitimately be
obtained and what it costs to keep. `DATA-SOURCES.md` covers the sources. This document covers the
one thing neither of those does: what runs, when, and how anyone knows it is still running.

---

## 1. The honest answer to "can we fill old data"

**No. Old price history cannot be filled in, by us or by anyone, at any price.**

Scryfall publishes today's price and nothing else, and yesterday's bulk file is gone: measured, a
dated bulk URL from last year returns 404. The sites holding five year charts hold them as their own
asset and their terms forbid taking them. Every marketplace API that could have sold us history has
closed to new applicants, and none of them has a history endpoint anyway.

The full survey, with quotes and dates, is `PRICE-HISTORY.md`. The one legitimate exception is
MTGJSON, which publishes a rolling **90 days** under an MIT licence. That is the ceiling for
everybody.

So this is not a backfill. It is:

> **Start the clock properly today, and make sure it never stops again.**

What *was* fixable is that history was starting at 10% coverage with the wrong cards. Measured
before and after this work:

| | Before | After |
|---|---|---|
| Cards with any price history | **3,528** | **13,394** |
| Cards a user owns, wants, plays or has listed, with today's price | not tracked, and not prioritised | **568 of 568** |
| Distinct days of history | 79 | 79 |
| Storage per stored price | 636.7 bytes (old schema) | **154.6 bytes** |

The 154.6 figure was measured at rest, on 30,037 stored prices. Measured again a few minutes later,
mid-sweep, the same call reported 282.3, because `pg_total_relation_size` counts dead tuples that
autovacuum has not reclaimed yet. Take the at-rest number, and do not be alarmed by a doubled
reading taken while a sweep is running.

The catalogue is mid-sync from 34,088 to 96,732 printings as this is written, so the "after" number
keeps climbing on its own: every printing gets a first point the first time a sweep sees it.

---

## 2. Why GitHub Actions and not pg_cron

pg_cron is in this database and is not going away. It is not the right host for these jobs on its
own, and the reason is written in its own run history:

```
cron.job_run_details, the daily price capture
  2026-02-17 06:00  succeeded
  2026-02-18 06:00  succeeded
  2026-02-19 06:00  succeeded
  2026-02-20 06:00  succeeded
  ... nothing at all ...
  2026-08-18 06:00  succeeded
```

**Six months of silence, and nothing and nobody said so.** Over the same stretch the card catalogue
froze on 2026-01-31 while every deck suggestion and power score kept being computed against it,
confidently and wrongly.

There *was* a watchdog. `cron.job` 3 called `resume_scryfall_sync_if_stalled()`, which built its
return string with `format('… (%.1f min idle)', …)`. Postgres `format()` accepts `%s`, `%I`, `%L`
and `%%` only, so `%.1f` raised on every call the job ever made. Worse, the `perform
trigger_scryfall_sync('resume')` sat *before* the throwing line, so the exception rolled the resume
back. The watchdog was not merely silent, it undid its own work. Fixed 2026-08-19.

A background worker inside Postgres has no run list a person will look at, no failure email and no
re-run button. GitHub Actions has all three, plus a definition that lives in the repository and
shows up in a diff.

| | Runs on |
|---|---|
| Scheduling, retries, alerting, manual re-runs | **GitHub Actions** |
| The actual work | Postgres and the edge functions, called by Actions |
| One safety net | pg_cron, and only for the prices the product quotes back at people |

---

## 3. What runs

Every job is registered in `public.pipeline_jobs`, which is the list the watchdog walks. A job that
is not in that table is a job nobody is watching, so adding a row is the same act as putting it
under the alarm.

| Job | When | Driven by | What it does | Overdue after |
|---|---|---|---|---|
| **Card catalogue** | 03:15 UTC daily | `.github/workflows/cards-nightly.yml` | Makes sure a complete Scryfall pass happened. Resumes a stalled one; starts one only if none ran. | 36 h |
| **Bulk prices** (`price-bulk`) | 06:20 UTC daily | `.github/workflows/prices-daily.yml`, step 1 | Streams Scryfall's `default_cards` bulk file and records every printing whose price moved. | 30 h |
| **Owned-card prices** (`price-snapshot`) | immediately after | same workflow, step 2 | Records today's price for every card a user owns, wants, plays or has listed, moved or not. | 30 h |
| **Collection values** | after prices | same workflow | Records what every user collection is worth today. | 30 h |
| **Unique card list** | every 15 min | pg_cron `cards-unique-refresh` | Rebuilds `cards_unique` so search and suggestions see new cards. | 6 h |
| **Combos and decks** | every minute | pg_cron `meta-drain-*` | Drains `meta_fetch_queue` (Commander Spellbook, MTGJSON). | 72 h |
| **Watchdog** | every 3 hours | `.github/workflows/pipeline-watchdog.yml` | Asks whether any of the above is overdue. Opens an issue if so. | n/a |
| **Price safety net** | 11:00 UTC daily | pg_cron `price-tier1-safety-net` | Repeats step 2 only if the GitHub run did not finish. Does nothing if it did. | n/a |

Set metadata (`sync_status.scryfall_sets`) has **never run once** and no function populates it. It is
registered with `watched = false` so it does not hold the alarm permanently red, and it is listed in
§8 as a real gap rather than quietly omitted.

### 3.1 Secrets

Two, both GitHub repository secrets under Settings, Secrets and variables, Actions:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | `https://udnaflcohfyljrsgqggy.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service role key, from Supabase, Settings, API |

Neither is in the repository and neither is ever printed. `scripts/data/pipeline.mjs` pushes every
line of output through a `scrub()` that replaces the key, and anything shaped like a JWT, before it
reaches the log. The service role key bypasses row level security entirely, so it must never appear
in client code, in a log, or in this file.

Every function the pipeline calls is granted to `service_role` and `postgres` only and revoked from
`anon` and `authenticated`. Verified on the live database: `price_snapshot_tick`,
`price_snapshot_run`, `price_snapshot_coverage`, `pipeline_health` and `pipeline_heartbeat` all
carry `postgres=X | service_role=X` and nothing else.

---

## 4. The coverage policy for prices

Before today, coverage was capped by accident rather than by decision, and the cards that mattered
most were the ones missing. This is the decision, written down. It is two rules and one writer.

### Rule 1: every card somebody owns, wants, plays or is selling gets a row every day

No cap, no price threshold, movement or not.

That set is the view `public.price_snapshot_tier1`: the distinct card ids across `user_collections`,
`wishlist`, `deck_cards` and `listings`. Measured today: **584 references, 573 of which exist in the
catalogue, 568 of which carry a price**.

These are the only numbers this product ever quotes back at a person. A gap in the chart of a card
nobody owns is cosmetic. A gap in the chart of a card somebody owns is the product failing at its
one job. **The daily workflow asserts on this and fails the run if a single one is missing.**

Measured after the first run: **568 of 568. No gaps.**

The five priced-but-not-captured difference between 573 and 568 is honest: those five cards have a
`prices` object where every field is null. They are Arena-rebalanced cards that were never sold on
paper. Nothing is written for them, because a row of six nulls is not an observation, and it is one
careless read away from rendering as `$0.00`.

### Rule 2: everything else gets a row on a real move

A card gets a row the first time it is ever seen, and after that only when a price changed by **at
least 1 percent and at least 5 cents**, or appeared, or vanished. `usd_foil`, `usd_etched`, `eur`,
`eur_foil` and `tix` all count the same as `usd`.

Measured on our own stored history, 30,982 consecutive day pairs:

| Rule | Share of card-days that would write a row |
|---|---|
| Any digit differs | **51.83%** |
| The gate above | **15.53%** |

An independent measurement in `PRICE-HISTORY.md`, taken from MTGJSON's own file over roughly 374,000
day pairs, put the same gate at 14.92%. Two separate datasets, well under a point apart.

**A missing day means the price did not move. It does not mean unknown and it never means zero.**
That is only safe because the read path fills it in: `card_price_series(card_id, from, to)` returns
a dense daily series with every point flagged observed or carried. Reading `card_price_point`
directly draws a gap as a fall to zero, which invents a price the card never had. **Charts must go
through the function.**

A **30 day heartbeat** bounds how far a value is ever carried, so no chart repeats a stale number
indefinitely.

### What it costs

Measured today at rest: **154.6 bytes** per stored price across the whole storage layer, against
636.7 bytes per row on the schema this replaced.

At the full 96,732 printing catalogue:

| | Prices per day | Per year | Storage per year |
|---|---|---|---|
| Owned cards, unconditional | 568, grows with users | 207 k | 32 MB |
| Catalogue, gated at 15.53% | ~15,000 | 5.5 M | 850 MB |
| **Total** | | | **~880 MB** |
| (for comparison) every card every day, old schema | 96,732 | 35 M | 22.5 GB |

The Supabase organisation is on the Pro plan with 8 GB of included disk; the database is 300 MB
today. This never leaves the included allowance, and the owner's stated tolerance was 3.7 GB a year.

### Two bugs this shape deliberately avoids

Both have happened in this repository, which is why they are called out in the code as well as here.

**A `LIMIT` applied before an `ORDER BY`** takes an arbitrary page and silently caps coverage. The
sweep pages by keyset, `where id > cursor order by id limit n`, so the ordering is inside the
subquery and the limit applies to the ordered set. It cannot be written the wrong way round.

**A resume pointer that never clears on completion** makes a job restart mid-catalogue forever.
`pipeline_runs.resume_after` is set to `NULL` in the same statement that marks the run succeeded,
and `price_sweep_health()` independently reports any day marked done that still carries a pointer.
Verified on the first completed run: `resume_after` is `null` and `status` is `succeeded`.

---

## 5. How the price job is put together

The storage layer (`card_price_key`, `card_price_point`, `card_price_last`, the
`card_price_history` compatibility view, `apply_price_sweep`, `card_price_series`) is not described
here; `PRICE-HISTORY.md` §6 to §8 is its design note.

The daily price job is **two steps in one workflow, in this order**:

1. `scripts/prices/daily-sweep.mjs` streams Scryfall's `default_cards` bulk file, about 74 MB
   gzipped and 116,712 lines, and stages every paper printing. One download instead of roughly
   100,000 API calls, which is what Scryfall's rate limit page requires of anyone at this volume.
2. `scripts/data/pipeline.mjs price-snapshot` walks the owned-card set and records today's price for
   every one of them, gate open.

Both write through **`apply_price_sweep`, which is the only thing in the system that writes a price
point.** One writer, one definition of "the price moved", no way for the two steps to disagree.

### The collision, because it is the reason for the ordering

An earlier version of `price_snapshot_tick` walked the whole catalogue itself. That was a second
sweep, and the two collided for real rather than in theory. At **02:40:37** the bulk sweep failed
with:

```
staging 4000 rows at line 4657: canceling statement due to lock timeout | code=55P03
```

because the tick held a lock on the shared `price_sweep_stage`. The catalogue phase was removed the
same hour. `price_snapshot_tick` now refuses to run at all while `price_sweep_run` shows a sweep in
flight, using the sweep's own log as the signal, and it never writes to that log.

### Why pages, and what that buys

PostgREST arms an 8 second statement timeout on every request, and it cannot be widened from inside
a function: the timer is armed when the calling statement starts, so a later `SET` never re-arms it.
Pages are the only way the HTTP path can work.

They buy real resumability as a side effect, because every page commits. That was proved by
accident and then kept: a 4,000 card page hit the timeout mid-run, and afterwards `pipeline_runs`
still read `ticks = 2` with the cursor unchanged. **Nothing was half written.** The runner therefore
halves its page size on a timeout and retries, which is always safe.

Measured under a genuinely bad case (a catalogue sync writing to `cards`, two autovacuum ANALYZEs
and a combo drain all in flight): a 1,000 card page took **28.8 s**. Reading `cards` is the expensive
half, not writing prices: `cards` is 201 MB over 59,750 rows, about 3.4 kB a row, so 1,752 rows cost
1,452 heap blocks and about a second even with every buffer cached.

**Overlap.** `price_snapshot_tick` takes `pg_try_advisory_xact_lock` and returns immediately if
another run holds it, rather than queueing. A run for a date that already succeeded returns `done`
without doing anything, so re-running a day is free.

---

## 6. How to tell it is healthy

One question, one answer:

```sql
select * from public.pipeline_health();
```

or, from anywhere with the secrets:

```bash
node scripts/data/pipeline.mjs health
```

One row per job: when it last succeeded, how many hours ago, the window it is allowed, and a
sentence saying what it is doing. The watchdog workflow runs this every three hours and exits
non-zero if any watched job is outside its window, which becomes a red run, a failure email and an
open issue labelled `data-pipeline`. When everything recovers the same workflow closes the issue.

Each job is probed at its own source of truth, not at a heartbeat it has to remember to write. **A
watchdog that needs the watched thing to cooperate goes quiet exactly when that thing breaks.** So
`price-bulk` is read from `price_sweep_run`, `scryfall-cards` from `sync_status`, `cards-unique`
from `cards_unique_refresh_state`, `collection-value` from `collection_value_history.created_at`.

Three more that answer narrower questions:

| Call | Answers |
|---|---|
| `price_snapshot_coverage(date)` | Did every owned card get today's price? |
| `price_history_stats()` | How much history exists, over how many cards and days, and how big |
| `price_sweep_health(7)` | Which of the last 7 days did not land, and why |

`pipeline_health()` itself shipped with a bug worth recording, because it is precisely the class of
bug it exists to catch. The first version derived the collection value job's freshness from
`max(snapshot_date) + 23:59`, which is a point in the **future** for any snapshot taken today. It
reported an age of **-21.67 hours** and called a job healthy that had not actually run since
December. It now reads the row's real `created_at`, and it treats any negative age as a probe fault
rather than as good news.

---

## 7. When it is not healthy

**`price-bulk` is overdue or failed.** Re-run the "Daily prices" workflow. The sweep resumes from
its `cursor_line` and will not redo work; `--force` redoes a finished day deliberately. If it failed
with a lock timeout, something else was writing `price_sweep_stage` at the same time, which should
now be impossible from inside this repository. Nothing existing becomes wrong while it is failing;
the catalogue simply gains no new points that day.

**`price-snapshot` is overdue.** This is the one that matters most, because it is the prices people
see. Re-run the same workflow. It resumes from the last completed page and will not write a day
twice. If pages keep timing out, run it with a smaller batch: `workflow_dispatch` takes one. The
11:00 UTC pg_cron safety net means these prices were captured regardless of whether GitHub was
reachable.

**`collection-value` is overdue.** Re-run the same workflow; it is a single edge function call. The
dashboard's value-over-time chart stops gaining points, but no existing number becomes wrong.

**`scryfall-cards` is overdue.** Read `sync_status` where `id = 'scryfall_cards'`. If `status` is
`running` and `last_sync` is not moving, the pass stalled: `select
public.resume_scryfall_sync_if_stalled()` picks it up from its stored page. If `error_message` holds
a `next_page_url` while the status says finished, that is the partial-sync bug and the same call
fixes it. **Do not start a fresh sync over a running one**; there is one resume pointer and two
passes will fight over it. This matters more than the others: every deck suggestion and power score
is computed against `cards`, so a stale catalogue makes the app confidently wrong rather than
visibly broken.

**`cards-unique` is overdue.** Expected during a long catalogue sync, because the refresh refuses to
run mid-sync on purpose. If the sync has finished and it is still overdue, call `select
public.refresh_cards_unique(true)`. It cannot be refreshed through PostgREST: the `authenticator`
role carries an 8 second statement timeout and a concurrent refresh takes minutes.

**`meta-queue` is overdue.** Check `meta_fetch_queue` depth and `meta_ingest_runs`. The drains run
every minute; a backlog usually means the upstream source is rate limiting.

**The watchdog itself failed.** Almost always a missing secret or an unreachable database. The
script exits 78 with a plain message naming the absent secret.

---

## 8. What is still missing, said plainly

Real gaps. None is fixed by this work and none should be discovered later as a surprise.

1. **Set metadata has never synced.** `sync_status.scryfall_sets` has `last_sync = null` and status
   `pending` since the row was created. No function populates it. Registered unwatched.

2. **The card scanner has no image hashes.** `card_image_hashes` holds **0 rows**. The scanner
   identifies a card by its artwork, and the catalogue just went from one printing per card to every
   printing, which is exactly when this matters most. There is no job to build them.

3. **Eleven wishlist rows point at card ids that do not exist**, including the literal string
   `sol-ring`. The wishlist writer is putting a slug where an id belongs. Those rows cannot be priced
   by anything, and they are the whole difference between 584 references and 573 cards.

4. **`scryfall-sync` starts a fresh pass from pg_cron at 04:15 without checking whether one is
   running.** The GitHub job deliberately does check, but that pg_cron trigger predates it and still
   fires. Retiring it once the current printings run lands removes the last way two passes can
   collide. Not done here, because that sync is another agent's live workstream.

   The nightly workflow was first written to run at 03:15, which turned this hazard into a nightly
   certainty: it would start a pass at 03:15 and pg_cron would start a second one over the top at
   04:15. The sync function's own "already in progress" check does not stop that, because it only
   refuses when there is *no* resume pointer, and mid pass there always is one. The workflow now runs
   at **04:30**, fifteen minutes after pg_cron, so it finds the pass it is meant to supervise and
   only ever starts one itself when pg_cron did not fire.

5. **`trigger_scryfall_sync()` carries a hardcoded JWT in its function body.** It is the anon
   publishable key, which is designed to be client visible and is already in
   `src/integrations/supabase/client.ts`, so nothing needs rotating. It is still the wrong shape and
   should read from a setting.

6. **`capture_daily_prices()` is now orphaned.** Nothing calls it since the cron job was repointed.
   Left in place rather than dropped, because dropping a function on a live product deserves its own
   change.

7. **No seed from MTGJSON's 90 days.** `PRICE-HISTORY.md` §4.4 flags one licensing question that
   should be answered before that seed runs. Until then, each card's chart starts on the day a sweep
   first saw it.

8. **`price_history_stats()` exists only in the live database.** No migration declares it, and both
   `scripts/data/pipeline.mjs` and `supabase/functions/price-bulk-sync/index.ts` call it. A database
   rebuilt from `supabase/migrations` alone would not have it. The runner now treats those figures as
   commentary and carries on without them, rather than failing a price run whose work is already done
   and asserted, but the function still needs a home. It belongs with the lean price schema that owns
   the tables it measures, not here, which is why this migration does not create it and risk a second
   collision over the same name.

---

## 8a. Corrections from review

Four things in the first version of this pipeline reported success they had not earned, or damaged
work they did not own. `supabase/migrations/20260819200000_pipeline_hardening.sql` fixes them and
each was demonstrated failing before and firing after, against the live database.

| What was wrong | Why it mattered | Now |
|---|---|---|
| The guard stopping the tier 1 top-up from emptying `price_sweep_stage` looked only for a sweep dated **today** | A sweep that starts at 23:55 carries yesterday's date and is still streaming at 00:05. The guard missed it and the next line was an unconditional `delete`. This is the same collision that already killed a sweep at 02:40 on 2026-08-19, reached by another route | The date is gone from the guard. Any running sweep blocks the tick and the safety net |
| Once a day was marked succeeded, the tick refused to do anything else that day | Tier 1 is a live view. Somebody adding a card at 07:00 made the 06:20 run's own assertion false, the re-run failed on it, and no call could repair the day before midnight | The short circuit asks `price_snapshot_day_complete()`, the fact, instead of the run's status word. A covered day is a free no-op; a day that has gone short reopens and finishes |
| The watchdog judged `scryfall-cards` on `last_sync` alone | A sync that terminates early every night touches the row and leaves the catalogue at 43,361 of 96,732, and the watchdog called it healthy forever. That is the exact shape of the January to August outage this pipeline exists to prevent | Completeness counts, and so does a resume pointer left behind by a run flagged finished. Both cases were green before and are red now |
| `price-bulk` wrote its "no sweep has ever completed" fallback as `coalesce(format(...))` | `format()` renders NULL as an empty string and never returns NULL, so the fallback was unreachable and a fresh database printed a sentence with holes in it | A real `if not found` |

Two smaller ones, in `scripts/data/pipeline.mjs` and `prices-daily.yml`:

- The runner wrote a `pipeline_heartbeat` for `price-snapshot` after the tick had already written that
  row. The heartbeat keys on the **database's** `current_date`, so a run that crossed midnight stamped
  the *next* day succeeded before it had run. That call is gone; the tick's own row is the record.
- `workflow_dispatch` inputs were pasted into `run:` through `${{ }}`, which is a shell command
  substituted before the shell sees it, in a step that has the service role key in its environment.
  They go through `env:` now and are read as `"$BATCH"` and `"$CHUNK"`.

---

## 9. Cost

| | |
|---|---|
| GitHub Actions | Free. Public repository minutes are unlimited; on a private repository this is roughly 3 hours a month against a 2,000 minute free allowance. |
| Scryfall | Nothing. One 74 MB bulk file a day from `data.scryfall.io`, which has no rate limit, and zero API calls. |
| Supabase storage | About 880 MB a year, inside the 8 GB the Pro plan already includes. |
| Supabase compute | A few minutes of one connection, once a day, at 06:20 UTC. |

---

## 10. Files

| Path | What it is |
|---|---|
| `.github/workflows/prices-daily.yml` | Bulk sweep, then owned-card prices, then collection values |
| `.github/workflows/cards-nightly.yml` | Nightly catalogue supervision |
| `.github/workflows/pipeline-watchdog.yml` | Every three hours, is anything overdue |
| `scripts/data/pipeline.mjs` | The runner those workflows call. Runs the same on a laptop. |
| `scripts/prices/daily-sweep.mjs` | The bulk sweep (owned by the price history work) |
| `supabase/migrations/20260819190000_data_pipeline_scheduler.sql` | Registry, run log, coverage policy, watchdog |
| `supabase/migrations/20260819200000_pipeline_hardening.sql` | The four corrections in section 8a |
| `supabase/migrations/20260819150000_lean_price_history.sql` | The storage layer this builds on |
