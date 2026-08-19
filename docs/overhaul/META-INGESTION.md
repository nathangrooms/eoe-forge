# Meta ingestion: what was built, what is permitted, how to run it

Built 2026-08-19 against the live database (`udnaflcohfyljrsgqggy`). Every number below was
measured, not estimated. Companion to `DECKLIST-DATA.md`, which holds the terms research this
implementation acts on.

---

## 1. What is ingested, and nothing else

Exactly two sources. Both are MIT licensed with no restriction on commercial or automated use.

| Source | Licence | What it gives | Tables |
|---|---|---|---|
| **MTGJSON** | MIT, (c) 2018-present Zach Halpern | Curated decklists keyed by `scryfallOracleId` | `meta_decks`, `meta_deck_cards` |
| **Commander Spellbook** | MIT, Space Cow Media | ~104,000 combo variants with structured outputs | `meta_combos`, `meta_combo_cards` |

**Everything else researched was refused and stays refused.** EDHREC and MTGGoldfish forbid
commercial use, competitive sites and automated queries. MTGTop8 publishes no terms, which is
not permission. Archidekt and Moxfield say "personal, noncommercial" in writing whatever their
staff say in forums, so both need written permission first. Topdeck.gg needs a registered API
key nobody has obtained, and its docs do not address commercial use. The full table with the
clause each verdict rests on is in `THIRD-PARTY-NOTICES.md`.

**Do not add a source without reading its terms.** `meta_sources` has a `licence` and a
`terms_note` column, and a row there is an assertion that someone did.

---

## 2. Schema: three shapes, deliberately not one table

A decklist, a combo and an inclusion rate are different things, and flattening them loses the
one property that makes the third honest.

**Decklists** are a bag of cards with quantities.
`meta_decks` (one row per deck, carrying `format`, `is_complete`, `commander_oracle_ids`) and
`meta_deck_cards` (deck x oracle_id x board, quantity).

**Combos** are a small set of cards plus what they produce.
`meta_combos` (identity, bracket, `produces text[]`, legality, and Commander Spellbook's own
`popularity`) and `meta_combo_cards` (combo x oracle_id).

**Aggregates** are a count over a sample.
`meta_card_inclusion` and `meta_card_pairs`. Both store the numerator **and the denominator**
next to the rate, so no caller can render a percentage without being able to render the sample
it came from.

### Cards are keyed by `oracle_id`, never by name and never by printing

`public.cards` is mid-expansion to hold every printing: measured 47,783 rows across 33,037
distinct `oracle_id` values. So `oracle_id` is the only stable join, it is **not unique** in
`cards`, and **no foreign key can point at it**. These tables store `oracle_id` as bare text on
purpose, so ingestion cannot fail merely because card sync has not caught up.

---

## 3. The transform lives in SQL, once

`public.meta_load_spellbook_page(jsonb, bigint)` and
`public.meta_load_mtgjson_deck(text, jsonb)` are the canonical normalisation. Every ingestion
client fetches raw JSON and hands it to these. The edge functions contain **no transform logic
at all**.

This was a deliberate reversal partway through the build. The first version put the transform
in a TypeScript module copied into each edge function, with a test asserting the copies matched.
That is the same pattern `scripts/vendor-engine.mjs` already uses in this repo, and it is
exactly the pattern that was failing in this repo on the day this was written, with
`deck-optimizer/_engine` stale against `src/engine`. Two copies of the rules is how the wrong
thing eventually gets ingested: someone fixes one and the other keeps running the old rules.

### The allowlist is data, not code

`public.meta_deck_type_allowlist`. MTGJSON labels **3,004** things a "deck" and only **873** of
them are decklists. Measured shapes, one sample of each fetched live:

| MTGJSON type | Shape | Verdict |
|---|---|---|
| `Commander Deck` | 99 main + 1 commander = 100 | Ingest |
| `World Championship Deck` | 60 | Ingest |
| **`MTGO Redemption`** | **383 distinct cards, one of each. A whole set.** | **Refuse** |
| `Secret Lair Drop` | 30 cards, an art product | Refuse |
| `Jumpstart` | 19-card half-deck, combined at random | Refuse |
| `Bundle Land Pack` | 40 basic lands | Refuse |

`MTGO Redemption` is the one that matters. Ingest a set redemption as a decklist and the
co-occurrence engine asserts that every card in Tenth Edition is played alongside every other
card in Tenth Edition, at a lift that looks entirely authoritative. Nothing downstream would
flag it.

It is an **allowlist**: a type nobody has classified is skipped until a human looks at it, and
`format = NULL` means "not a decklist" with the reason recorded beside it.

---

## 4. Aggregates refuse to report a small sample

`meta_refresh_inclusion()` and `meta_refresh_pairs()` compute real counts over complete decks.
Nothing is estimated, modelled or smoothed.

The protection that matters: **a scope below `meta_min_scope_decks()` (30) produces no row at
all.** Not a row with a caveat a caller can ignore. No row.

This has a consequence worth stating plainly, because it will look like a bug:

> **Per-commander inclusion is currently empty, and that is the correct output.**
> The commander corpus is precons, and each commander leads about one deck. An inclusion rate
> over one deck is not a rate. The threshold exists precisely so that the system says nothing
> rather than something false.

What *is* meaningful is format-scope inclusion: "played in N of the 190 ingested commander
decks" is a real, checkable claim with a real denominator. It is a claim about **ingested
precons**, not about Commander, and `describeInclusion()` in `src/lib/meta/types.ts` words it
that way on purpose.

`meta_min_pair_decks()` (3) does the same job for co-occurrence: a pair seen together in one or
two decks is a coincidence.

Read paths (`meta_inclusion_for_card`, `meta_partners_for_card`, `meta_combos_for_card`) always
return the sample size alongside the figure. When there is no evidence they return nothing,
which must render as an **absent section**, never as `0%`. Zero is a factual assertion; absent
is the truth.

---

## 5. Resumability, and the bug this project already paid for

`meta_fetch_queue` **is** the resume pointer. One row per HTTP request, with durable state, so
an interrupted run resumes by definition rather than by remembering an offset.

`meta_ingest_runs.cursor` exists for reporting, and is governed by one rule:

> **The cursor is cleared on the COMPLETION path, and only there.**

Enforced structurally, not by convention. `meta_finish_ingest()` moves status out of `running`,
and a `BEFORE` trigger on `meta_ingest_runs` nulls the cursor as a consequence. Completion and
clearing are the same call and cannot be separated by a future edit.

A pointer that never cleared froze this project's Scryfall card sync for months. The first
version of the trigger here cleared the cursor on **any** status that was not `running`, which
included `error` — that would have turned one transient upstream 500 into a full re-fetch of
1,042 pages. Fixed in
`20260819015052_meta_clear_cursor_on_completion_not_on_error.sql`: a **failed run keeps its
cursor on purpose**, because a failure is not a completion and the retry should resume.

---

## 6. Rate limits

Requests carry, from `public.meta_user_agent()`:

```
DeckMatrix/1.0 (+https://deckmatrix.com; contact: nathan@pilotdigital.agency)
```

### Commander Spellbook enforces a limit it does not publish

Measured 2026-08-19: a burst of 100 concurrent requests returned **HTTP 429 for every one**,
with no `Retry-After`, no `X-RateLimit-*` headers and an empty body. The research doc recorded
"no published rate limit", which was true and turned out to be irrelevant.

**The absence of a documented limit is not permission to burst.** This was my error during the
build, and it cost a penalty window on the database's egress IP. Two fixes followed:

1. A 429 no longer counts as a failure. It sets `not_before` with exponential backoff (30s
   doubling, capped at 10 minutes) and **restores** the attempt, so being throttled can never
   exhaust the three-attempt retry budget and mark a page permanently `failed`.
2. `meta_drain_tick` tops the in-flight set up to a ceiling rather than dispatching a fixed
   batch, so a throttling upstream automatically slows us down instead of building a backlog of
   requests that will time out before they are reached.

Also worth recording: **the API caps page size at 100** no matter what `limit` asks for. The
research estimated 210 requests at `limit=500`; the real figure is **1,041** pages for 104,037
variants.

Settled rates: Commander Spellbook **20 requests/minute**, MTGJSON **60 requests/minute**.
Do not raise these to go faster. There is no deadline here worth being rude over.

---

## 7. Running it

Two paths, sharing the same loaders, so they cannot diverge.

### Scheduled (no secrets anywhere)

`public.meta_drain_tick(source, batch, prune)` does one tick: collect what came back, top the
in-flight set back up, and finish the run if the queue drained. Safe every minute, a no-op once
the queue is empty. pg_cron calls it directly, so **no service role key sits in a cron command
string** (this database previously had a hardcoded anon JWT in one, for exactly that reason).

```sql
select cron.schedule('meta-drain-spellbook', '* * * * *',
  $$select public.meta_drain_tick('commander_spellbook', 20, false);$$);
select cron.schedule('meta-drain-mtgjson', '* * * * *',
  $$select public.meta_drain_tick('mtgjson', 60, false);$$);
```

Seeding a fresh sweep, Commander Spellbook:

```sql
select public.meta_begin_ingest('commander_spellbook', true);
delete from public.meta_fetch_queue where source_id = 'commander_spellbook';
insert into public.meta_fetch_queue (source_id, seq, url, ref)
select 'commander_spellbook', g,
       'https://backend.commanderspellbook.com/variants/?limit=100&offset=' || (g * 100),
       (g * 100)::text
from generate_series(0, 1041) g;
```

MTGJSON seeds from `DeckList.json` joined against the allowlist, so a product manifest is never
even requested. Note `public.meta_url_encode()` is **required**: six World Championship deck
files are named after players with accented names (Romão, Šlemr, Kühn) and an unencoded request
fails before it reaches the network.

### On demand

Edge functions `spellbook-combo-sync` and `mtgjson-deck-sync`. Both are service-role gated
(`verify_jwt = false`, so the check lives in the function body), work to a time budget, and
return `done: false` until the queue drains. `?restart=true` reseeds.

### After ingestion

```sql
select * from public.meta_refresh_inclusion();
select public.meta_refresh_pairs();
```

`mtgjson-deck-sync` does this automatically on the completion path, so derived numbers can never
describe a corpus that no longer exists.

### Health

```sql
select source_id, status, processed, total, cursor, error_message from public.meta_ingest_runs;
select source_id, state, count(*) from public.meta_fetch_queue group by 1,2 order by 1,2;
```

`status = 'done'` with a non-null `cursor` is impossible by construction. If you ever see it,
the trigger has been dropped.

### Tick sizing is not a knob to turn up

A tick must finish inside its scheduling window. With a batch of 40 a Commander Spellbook tick
spent over 60 seconds parsing ~500 KB pages, overran its minute, overlapped the next tick, and
meanwhile the requests still queued inside pg_net aged past their 30 second timeout and returned
failures that had nothing to do with the upstream. Throughput fell to roughly zero while every
component reported success, which is the worst kind of broken.

`meta_queue_collect` therefore caps how many responses it processes per call, so tick duration
tracks the cap rather than the backlog, and a pg_net timeout requeues **without** consuming a
retry attempt. Settled at 12 (Spellbook) and 25 (MTGJSON) per minute.

The every-minute jobs are intentional and stay scheduled. They are cheap no-ops on an empty
queue, and leaving them armed means any future seeded queue drains on its own.

---

## 8. Measured results, first run (2026-08-19)

MTGJSON completed. Commander Spellbook was still draining when this was written and continues
unattended; the queue guarantees it finishes.

| | Count |
|---|---|
| MTGJSON deck files considered | 3,004 |
| **Refused as product manifests** | **2,131** |
| Fetched | 873, **0 failed** |
| Decks stored | 873, of which **768 complete** |
| Commander decks | **192, all 192 complete at exactly 100 cards** |
| Distinct commanders across them | **181** |
| Deck card rows | 33,546 over 13,537 distinct cards |
| Combos stored (sweep still running) | 50,400 of ~104,037 and climbing |
| Combo card rows | 163,081 |
| Inclusion rows | 14,145 across 2 format scopes |
| Card-pair rows | 24,165 |

### Coverage of the card table

`cards` holds 47,783 rows over **33,037 distinct `oracle_id`**.

| Signal | Cards covered | Share |
|---|---|---|
| Any meta evidence | **16,071** | **48.6%** |
| Inclusion data | 12,642 | 38.3% |
| Combo membership | 5,886+ | 17.8%+ |
| Co-occurrence pairs | 2,046 | 6.2% |

Measured mid-sweep. Combo coverage and the "any evidence" figure keep rising until the
Commander Spellbook queue drains; re-measure with the queries in section 7 rather than quoting
these once the run reports `done`.

### The `oracle_id` decision paid off exactly

Of every card referenced by an ingested deck or combo, **one** deck card oracle_id and **zero**
combo card oracle_ids are absent from our `cards` table. Name matching would have produced
hundreds of misses on punctuation, split cards and accented names alone.

### 181 commanders across 192 decks

This is the number that justifies the whole sample-size design. It is **1.06 decks per
commander**, so a per-commander inclusion rate would have a denominator of one. `meta_refresh_inclusion`
wrote **zero** `scope_kind = 'commander'` rows, which is the correct output.

### The aggregates behave

Format-scope commander inclusion, top of the list:

| Card | Decks | Rate |
|---|---|---|
| Sol Ring | 177 of 192 | 92% |
| Command Tower | 165 of 192 | 86% |
| Arcane Signet | 144 of 192 | 75% |

Basic lands carry `avg_quantity` around 7, which is the printing-collapse working: MTGJSON lists
each printing separately and the loader sums them to one card played N times.

The top co-occurrence pairs are Command Tower + Sol Ring (177 of 192) with a **lift of 1.01**.
That is the metric being honest: both cards are in nearly every precon, so playing one tells you
essentially nothing about the other, and a lift of 1.0 says exactly that. Anything presenting
that pair as a discovered synergy would be wrong, and the number is there to prevent it.

---

## 9. What this does and does not close

**Combo detection: solved.** Structured combos with real evidence, joined by `oracle_id`.
`meta_combos_for_card` gives the card page a group that is genuinely evidence rather than
similarity, and unlike the current `deck_cards` query it can show *why*.

**Power score: helped, not finished.** Combo membership and bracket tags are defensible inputs.
Combined with `cards.edhrec_rank` (another agent's work, 21,057 of 47,783 rows populated at the
time of writing) there is real signal. It is not EDHREC's inclusion data and must not imply it
is.

**Archetype and playstyle: barely moved.** 190 designer-built commander precons is a starting
vocabulary, not archetype breadth. Real breadth needs Archidekt's `deckTags`, which needs
written permission.

**Inclusion rates: honestly narrow.** We can now say "played in N of the M ingested commander
precons" and prove it. We cannot say what percentage of real Commander decks play a card, and
nothing in this pipeline should be worded as if we can.

**Our own corpus is still the long game and still must not be used for statistics.** Two
complete decks. The work in `DECKLIST-DATA.md` section 9 (append-only snapshots, an
`is_complete` flag, explicit per-deck consent, persisting generator archetype intent) is
unbuilt. `meta_min_scope_decks()` means that when it does exist, it will stay silent until it
has something real to say.
