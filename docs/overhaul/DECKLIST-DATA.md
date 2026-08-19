# Decklist, combo, inclusion and archetype data

Research completed 2026-08-19. Every figure here was measured, not recalled. Every
terms verdict quotes the clause it rests on.

DeckMatrix is a commercial product with paid tiers (`subscription_tier`,
`user_subscriptions`). That changes the answer for several sources. A source that a
hobby project could use is not automatically available to us.

**Companion document.** `DATA-SOURCES.md` was written the same day by another agent and
covers a wider brief (rules engine, card data, pricing). We researched the shared
sources independently and reached the same verdicts on all of them, which is worth
something. This document goes deeper on decklists specifically: measured corpus sizes,
a live test of the Commander Spellbook suggestion endpoint, the MTGJSON overlap
against our existing precon index, a licence problem in code we already ship, and the
build-our-own assessment. Its section 0.2 on Scryfall paywall rules is directly
relevant to section 3.2 below and is not repeated here.

---

## 1. The gap, re-measured against the live database

Run against project `udnaflcohfyljrsgqggy` on 2026-08-19:

| Measure | Value |
|---|---|
| `deck_cards` rows | 474 |
| Decks that actually contain cards | 8 (of 15) |
| Distinct `card_id` in `deck_cards` | 459 |
| `user_decks` | 15, across 7 users |
| `cards` | 35,450 and rising (sync is running) |

Two things the original brief did not capture, and both matter:

**Only two decks are complete.** Card totals per deck are 100, 100, 86, 79, 67, 64,
1, 1, then seven decks with zero cards. A 64-card Commander deck is a draft, not a
decklist. The usable corpus is closer to **two decks** than eight.

**Every deck is private.** All 15 rows have `is_public = false` and
`public_enabled = false`. Nothing has been shared. That is a consent question before
it is a statistics question, and section 8 deals with it.

Deck creation over time, which is the number that governs whether building our own
corpus can work:

| Month | Decks created | Distinct users |
|---|---|---|
| 2025-12 | 5 | 4 |
| 2026-01 | 8 | 4 |
| 2026-02 | 1 | 1 |
| 2026-08 | 1 | 1 |

Fifteen decks in nine months, and the rate has fallen to roughly one a month.

**`cards.edhrec_rank` already exists** and is 6.13% populated (2,173 of 35,450) and
climbing while this was written. Another agent is backfilling it from Scryfall.
Nothing in this document duplicates that work.

---

## 2. Recommendation summary

Ranked by value against the stated goals, in the stated order: power score
credibility, card suggestions, archetype and playstyle, combo detection.

| # | Source | Terms verdict | Effort | Do it? |
|---|---|---|---|---|
| 1 | **Commander Spellbook** | Clear. Public documented API, MIT client | 1 to 2 days | **Yes, now** |
| 2 | **Scryfall `edhrec_rank`** | Clear, with conditions | Already in flight | **Yes, in flight** |
| 3 | **MTGJSON** | Clear. MIT | 1 day | **Yes, now.** Also fixes a live problem |
| 4 | **Our own corpus** | Ours, with consent work | 2 to 3 days to start | **Yes, start now** |
| 5 | **Archidekt** | Conflicted. Staff say yes, written terms say no | 1 day after permission | **Ask in writing first** |
| 6 | **Moxfield** | Closed, but a real application route exists | 1 day after approval | **Apply** |
| 7 | **Topdeck.gg** | Clear. Free key, attribution required | 1 to 2 days | **Yes, for cEDH only** |
| 8 | EDHREC | **Forbidden** | n/a | **No** |
| 9 | MTGGoldfish | **Forbidden** | n/a | **No** |
| 10 | MTGTop8 | No terms published, so no permission | n/a | **No** |

Two findings need a decision before anything else. Both are in section 3.

---

## 3. Two things to deal with first

### 3.1 The precon corpus we already ship has no licence and is Moxfield-scraped

`src/data/precon-corpus.ts` and `supabase/functions/fetch-precons` both read the
GitHub repo `Westly/CommanderPrecons`. That repo:

- has **no licence file at all**. GitHub's API reports `"license": null`. With no
  licence, default copyright applies and no reuse right is granted.
- states its own provenance in its README, in full: *"The data was sourced from
  https://www.moxfield.com/users/WizardsOfTheCoast"*.

So it is Moxfield data, redistributed without a licence, and we ship a baked copy of
it in the app bundle. The header comment in `precon-corpus.ts` currently claims the
source is *"Free, legal, and offline once baked."* The "legal" half of that was not
verified and does not hold up.

This is not a crisis. It is precon decklists, which are published product contents,
and the underlying facts are not owned by Moxfield. But we are a paid product
redistributing a scrape of a site whose terms forbid scraping, and there is a clean
MIT-licensed replacement that covers 162 of the same 172 decks plus 20 more. Swap it.
See section 6.

### 3.2 The Wizards Fan Content Policy and our paid tiers

This governs every source below, because all MTG data sites operate under it. The
policy says, verbatim:

> "Free means FREE: You can't require payments, surveys, downloads, subscriptions, or
> email registration to access your Fan Content; You can't sell or license your Fan
> Content to any third parties for any type of compensation; and Your Fan Content must
> be free for others (including Wizards) to view, access, share, and use without paying
> you anything, obtaining your approval, or giving you credit."

And it permits only:

> "You can, however, subsidize your Fan Content by taking advantage of sponsorships, ad
> revenue, and donations."

DeckMatrix has paid subscription tiers and requires registration. Read literally, that
sits outside the policy.

I am not the right party to settle this and I am not going to pretend it is fine.
What is true: Moxfield, Archidekt and MTGGoldfish all run paid tiers and have done so
for years without visible enforcement, so the practical risk is evidently low. What is
also true: "everyone does it" is not a licence, and the exposure grows with revenue.

**Recommendation: get a short opinion from a lawyer before the paid tiers are
promoted hard.** It is a cheap question to ask once. It does not block any of the
engineering below.

Ask the same lawyer about the Scryfall paywall clause documented in
`DATA-SOURCES.md` section 0.2, which forbids requiring subscriptions for access to
Scryfall data. The two questions are the same question and the practical answer to
both is likely the same: keep card data free and anonymous, and charge for our own
work (the power score, the rules engine, collection and marketplace, deck
optimisation). Nothing in this document requires charging for third-party data.

---

## 4. Commander Spellbook. Do this first

**Rank 1.** It is the only source that serves three of the four goals at once, and its
terms are the cleanest of anything researched.

### What it gives

Measured live on 2026-08-19:

- **Roughly 104,000 combo variants.** Binary search on the `offset` parameter bounded
  the total between 103,125 and 104,687.
- `GET /variants` pages at up to `limit=500`, returning about 400 KB per page in
  around 1.3 seconds. The full corpus is therefore about 210 requests. That is a
  nightly job, not an infrastructure project.
- Every combo carries the cards used, the colour identity, the prerequisites, and a
  structured list of what it **produces**, for example "Infinite colorless mana",
  "Win the game", "Infinite creature ETB".

`POST /find-my-combos` is the one that matters most. Tested with a real seven-card
Kenrith list, it returned:

| Field | Result |
|---|---|
| `included` | 3 combos fully present in the deck |
| `almostIncluded` | **35 combos missing exactly one card** |
| `almostIncludedByChangingCommanders` | 4 |

That `almostIncluded` list is a card suggestion engine with real evidence behind it.
"Add Basalt Monolith and you have infinite mana" is a far stronger suggestion than
anything tag similarity can produce, and it is defensible because we can show the
combo.

There is also `POST /estimate-bracket`, which returns Commander bracket information
derived from the combos in a list. That feeds power score credibility directly.

The payload shape is a good fit for us: each card carries an `oracleId`, which joins
straight to `cards.oracle_id`.

### Terms verdict: clear

- **Code licence: MIT.** GitHub reports `"license": {"key": "mit"}` on
  `SpaceCowMedia/commander-spellbook-backend`.
- **An official generated client is published for third parties.** npm package
  `@space-cow-media/spellbook-client`, version 6.2.0, licence MIT, described as *"An
  Open Api generated client for the Commander Spellbook backend REST API."* You do not
  publish an SDK to npm for an API you do not want third parties calling.
- **An OpenAPI schema is published** at `/schema/` and a Swagger UI at
  `/schema/swagger/`, titled "Commander Spellbook API".
- Their own developer docs state: *"Most read endpoints are public; writing and
  reviewing require authentication and the appropriate permissions."* The endpoints we
  need are read endpoints.
- Their about page describes the project as *"completely free and open source under
  the MIT license"* and notes the database already powers *"EDHREC's Combo Feature"*,
  which is itself a commercial site consuming this API.
- Site `robots.txt` is `Allow: /`. There is no terms of service restricting data
  reuse. The privacy policy contains no clause on automated access, scraping,
  commercial use or data reuse.

**One honest caveat.** `backend.commanderspellbook.com/robots.txt` returns
`Disallow: /`. That is a directive to crawlers, and putting it on an API host is
routine practice to keep search engines from indexing JSON responses. It is not a
contractual restriction on API clients, and it would directly contradict the published
OpenAPI schema and npm client if read as one. I am flagging it rather than hiding it.

### Effort

One to two days. A `combo-sync` edge function paging `/variants` nightly into two new
tables, plus a `find-my-combos` call at deck view time.

### Recommendation

**Build it now.** Send a short courtesy note to their Discord saying what DeckMatrix
is and what volume we intend, and credit Commander Spellbook visibly wherever a combo
is shown. Neither is required by any term I found. Both are cheap, and this is a small
volunteer project whose goodwill is worth more than the requests.

---

## 5. Scryfall `edhrec_rank`. Already in flight

**Rank 2.** Do not duplicate. Another agent is backfilling it and the column is live.

### What it gives

A per-card popularity ordering across all Commander decks EDHREC tracks. Currently
2,173 of 35,450 rows populated (6.13%), ranks observed from 145 to 32,005.

This is genuinely useful for **power score credibility**, which is goal 1. A deck full
of cards ranked in the top 500 is measurably different from one full of cards ranked
above 20,000, and that is a real signal we can defend.

It is **not** co-occurrence. It cannot tell you that Thassa's Oracle and Demonic
Consultation belong together, only that both are popular. It narrows the gap against
edhpowerlevel.com, it does not close it.

### Terms verdict: clear, with conditions

Scryfall publishes the field in its own API and bulk files. Their documented rules,
verbatim:

> "You may not simply repackage, republish, or proxy Scryfall data. Your software must
> create additional value for end-users."

We compute a power score from it, which is additional value. Displaying a raw ranked
list of Scryfall data and nothing else would not be.

Rate limits, verbatim: `/cards/search`, `/cards/named`, `/cards/random` and
`/cards/collection` are each listed as *"2/second (500ms)"*, and all other methods as
*"10/second (100ms)"*. And:

> "If you need to rapidly look up card names, prices, or resolve a large number of card
> images, you must use the bulk data files."

Backfilling 35,450 ranks should come from the daily bulk file, not from paged API
calls. Worth checking that the in-flight work does that.

Two more Scryfall rules that intersect with our design law and are already correctly
followed by `<CardImage>`:

> "Do not cover, crop, or clip off the copyright or artist name on card images."

> "Do not distort, skew, or stretch card images."

### Recommendation

Leave it to the agent doing it. Confirm the backfill reads the bulk file. When it
lands, feed rank into the power score as a popularity subscore and label it honestly
as popularity, not quality.

---

## 6. MTGJSON. Do this, and use it to fix section 3.1

**Rank 3.** The safest licence of any source here, and it resolves an existing problem
rather than adding a new capability.

### What it gives

Measured live, version `5.3.0+20260818`, dated 2026-08-18:

- **3,004 decks total.**
- **190 Commander Decks**, 201 across the whole commander family including Brawl and
  MTGO commander decks.
- Also 220 Theme Decks, 41 Planeswalker Decks, 26 Event Decks, 22 Challenger Decks,
  **32 World Championship Decks** and 8 Pro Tour Decks. The last two are genuine
  historic tournament decklists, licensed cleanly.
- Newest Commander Deck release date present: 2026-06-26.

Every card entry carries an `identifiers` block containing `scryfallOracleId` and
`scryfallId`, so decks join to our `cards` table on `oracle_id` with no name matching.
Entries also carry `edhrecRank` and `edhrecSaltiness`.

### Overlap with our existing PRECON_INDEX, measured

| Measure | Value |
|---|---|
| `PRECON_INDEX` entries | 184 (172 distinct names, 51 sets) |
| MTGJSON `Commander Deck` entries | 190 |
| Name-matched overlap | **162** |
| Only in `PRECON_INDEX` | 10 |
| Only in MTGJSON | 20 |

The 20 MTGJSON-only entries are mostly Collector's Edition variants of decks we
already have, plus recent Final Fantasy commander decks.

So MTGJSON is **not** a large expansion of the precon corpus. Its value is that it is
the same corpus **with a licence**, which is exactly what section 3.1 needs.

### Terms verdict: clear. MIT

MTGJSON is MIT licensed, copyright 2018 to present, Zach Halpern:

> "Permission is hereby granted, free of charge, to any person obtaining a copy... to
> deal in the Software without restriction, including without limitation the rights to
> use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies"

Commercial use is unrestricted. The only obligation:

> "The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software."

One note: `mtgjson.com/robots.txt` contains `Disallow: /api/v5/*.json`. As with
Commander Spellbook, that is aimed at search crawlers indexing multi-megabyte JSON
files. Downloading those files is the entire published purpose of the project, and the
MIT licence grants the right explicitly. Fetch them politely, cached daily.

### Effort

One day.

1. Add `scripts/meta/build-precon-corpus.mjs` reading MTGJSON `DeckList.json` and the
   per-deck files, replacing `scripts/generate-synergy-corpus.mjs`.
2. Regenerate `src/data/precon-corpus.ts` and `src/data/precon-index.ts` from MTGJSON,
   keyed on `scryfallOracleId` instead of card name. That removes the name-matching
   step entirely and is a correctness win on top of the licence win.
3. Add the MTGJSON copyright notice to `THIRD-PARTY-NOTICES.md`.
4. Point `fetch-precons` at MTGJSON and retire the `Westly/CommanderPrecons`
   dependency.
5. Correct the "Free, legal" comment in the corpus header.

Note `fetch-precons` is not in my do-not-edit list, but confirm with the owner before
touching it since it is user-facing.

### Recommendation

**Do it.** It is a day of work that removes an unlicensed scraped dependency, improves
card matching, and adds 20 decks. It does not close the inclusion-data gap, and it
should not be sold as if it does. 190 precons is still 190 decks.

---

## 7. Sources that are forbidden, and why

These are ruled out on what their terms say. There is no workaround proposed for any
of them, because proposing one would be the wrong answer.

### 7.1 EDHREC. Forbidden three times over

This is the source everyone reaches for first, and it is the most clearly closed.

From EDHREC's terms of service, verbatim:

> "Company grants you a non-transferable, non-exclusive, revocable, limited license to
> access the Site solely for your own personal, noncommercial use."

> "(a) you shall not sell, rent, lease, transfer, assign, distribute, host, or otherwise
> commercially exploit the Site; (b) you shall not change, make derivative works of,
> disassemble, reverse compile or reverse engineer any part of the Site; **(c) you shall
> not access the Site in order to build a similar or competitive website**; and (d)
> except as expressly stated herein, no part of the Site may be copied, reproduced,
> distributed, republished, downloaded, displayed, posted or transmitted in any form or
> by any means"

> "(vi) use software or automated agents or scripts to produce multiple accounts on the
> Site, or **to generate automated searches, requests, or queries to the Site**."

Three independent bars: we are commercial, `CLAUDE.md` names EDHREC as a direct
benchmark so we are a competitive site, and any ingestion is an automated query.

There is **no official public API.** The JSON endpoints that community scrapers use are
the ones their own front end calls. They respond, which proves nothing about
permission. `robots.txt` permitting `/` is also irrelevant here, because the terms of
service are the governing document and they are explicit.

**Where their data actually comes from**, from their own FAQ, verbatim:

> "EDHREC collects deck data from Archidekt, Moxfield, and Scryfall."

> "We collect data daily from these pages and new data is reflected most often on pages
> within a few days."

This is the most useful fact in this entire document. **EDHREC does not own the
decklists.** It is an aggregator over public Archidekt and Moxfield decks. So the
legitimate route to the same underlying data is not EDHREC at all. It is a
relationship with Archidekt and Moxfield, which is exactly what EDHREC has. See
section 9.

**Verdict: ruled out. Do not scrape, do not call their internal JSON endpoints, do not
build a proxy.**

### 7.2 MTGGoldfish. Forbidden

From their terms of use, verbatim:

> "The Website and the contents are intended solely for personal, non-commercial use.
> You may download or copy the contents and other downloadable materials displayed on
> the Website for your personal use only."

> "You may not reproduce (except as noted above), publish, transmit, distribute, display,
> modify, create derivative works from, sell or exploit in any way any of the contents or
> the Website."

Their `robots.txt` additionally sets `Content-Signal: search=yes,ai-train=no,use=reference`
and explicitly disallows `ClaudeBot`, `GPTBot`, `CCBot`, `Google-Extended` and others,
noting these are *"EXPRESS RESERVATIONS OF RIGHTS UNDER ARTICLE 4 OF THE EUROPEAN UNION
DIRECTIVE 2019/790"*.

**Verdict: ruled out.**

### 7.3 MTGTop8. No terms, therefore no permission

There is no `robots.txt` (the server returns "File not found"), no terms of service
page, no about page, and no API. The only legal statement on the site is:

> "The information presented on this site about Magic: The Gathering, both literal and
> graphical, is copyrighted by Wizards of the Coast."

Absence of a prohibition is not a grant of permission. There is no licence, so default
copyright applies to their compilation.

Separately, it would not help much even if it were open. MTGTop8 is 60-card
constructed tournament data. Our primary number is the **EDH** power score. Modern and
Standard decklists tell us close to nothing about Commander inclusion rates.

**Verdict: ruled out. Low value even if it were not.**

### 7.4 Deckstats, Aetherhub, TappedOut

All sit behind Cloudflare bot protection. The widely used `mtg-parser` library
documents that `aetherhub.com`, `deckstats.net` and `mtggoldfish.com` *"require a
Cloudflare-bypass requests compatible http client such as cloudscraper."*

Deliberately defeating bot protection is not something to build into a commercial
product, regardless of what the terms say. Not researched further.

**Verdict: ruled out.**

### 7.5 MTGODecklistCache. Dead and unlicensed

The GitHub repo `Badaro/MTGODecklistCache` aggregated MTGO, Melee and Topdeck
tournaments as JSON. It is **archived**, has **no licence**, and its README states:

> "2025-06-10 update: mtgo.com scraper is no longer working, so this project will be
> officially shut down."

It was also itself a scrape of other sites, so it could not have granted rights it did
not hold.

**Verdict: ruled out. Dead anyway.**

---

## 8. Sources worth applying for

These are not forbidden. They are gated, and the gate has a documented way through it.
For a real commercial product this is usually the correct route, and it is the route
EDHREC itself took.

### 8.1 Archidekt. The terms and the staff contradict each other

This is the most valuable single source available to us, and the answer is genuinely
ambiguous, so here is the full picture.

**What it gives.** A public, working, unauthenticated REST API. Verified live:

- `GET /api/decks/v3/?formats=3&orderBy=-viewCount&pageSize=N` returns paged Commander
  deck summaries. Result sets appear capped at 1,000.
- `GET /api/decks/{id}/` returns a full deck. Verified on a real deck: 81 card entries
  with `categories`, `deckTags`, `edhBracket`, `viewCount`, and per card a
  `card.uid` which is the **Scryfall UUID**, joining straight to `cards.id`.

`deckTags` and `categories` are the archetype signal that goal 3 needs, and it is
human-labelled rather than inferred from oracle text.

**What their staff say.** On their own forum, from a staff member:

> "You're more than welcome to use our API for whatever you want"

> "just know that you might hit our rate limiter if you hit it too hard"

> "I believe we start rate limiting people at 40 requests per minute. So long as you're
> not hitting that, you should be fine."

**What their written terms say.** Archidekt's terms of service use the same boilerplate
as EDHREC's, word for word:

> "Company grants you a non-transferable, non-exclusive, revocable, limited license to
> access the Site solely for your own personal, noncommercial use."

> "(c) you shall not access the Site in order to build a similar or competitive website"

> "(vi) use software or automated agents or scripts... to generate automated searches,
> requests, or queries to the Site."

**The verdict.** The brief was explicit that the recommendation must rest on what the
terms say. The terms say no. A forum post by a staff member is not an amendment to the
terms of service, and "personal, noncommercial use" cannot be stretched to cover a
paid product that benchmarks itself against Archidekt.

But the contradiction is real and the staff position is on the record and unambiguous.
That is a strong basis for asking, and a weak basis for assuming.

**Recommendation: email Archidekt and get it in writing.** Say what DeckMatrix is,
that it is commercial, what data we want, what volume, and that we will stay well under
40 requests per minute and credit them. Ask for written confirmation that commercial
API use is permitted notwithstanding the "personal, noncommercial" clause. Given the
public staff position, the odds are good.

**Do not start ingesting before that reply lands.** One day of work once it does.

### 8.2 Moxfield. Closed, with a documented application route

**What it gives.** The largest Commander decklist database in the game, and one of
EDHREC's two upstream sources.

**Terms verdict: closed to unapproved access.** Their terms of service page is served
behind Cloudflare and returns HTTP 403 to automated readers, so I could not quote the
clause directly. I did not spoof a user agent to get around that, and the fact that a
terms page is gated against bots is itself informative.

Their position is documented plainly elsewhere. The `mtg-parser` library README states:

> "Moxfield.com prohibits scraping their website, as it violates their Terms of Service.
>
> For authorized access, please contact support@moxfield.com to request a custom
> User-Agent."

Their public GitHub repo carries no licence, only `"© 2020 Moxfield LLC"`.

**There is a real application process.** Moxfield restricted API access after abuse and
stated publicly that legitimate tools should get in touch, that they wanted to
*"filter out the baddies"*, and that access would be restored for those who
*"establish a relationship."* Access is granted as a whitelisted custom User-Agent.

**Recommendation: apply.** Email `support@moxfield.com` and ask on their Discord. Be
straightforward that DeckMatrix is a commercial product. This is a slower route than
Archidekt and more likely to be declined, since we are more directly a competitor. It
costs one email.

**Never** call Moxfield endpoints with a spoofed or generic User-Agent while waiting.

### 8.3 Topdeck.gg. Open, keyed, and the right answer for cEDH

**What it gives.** A documented tournament API at `https://topdeck.gg/api` returning
*"standings, decklists, and optional round data"*, filterable by game, format and date
range, and it **supports EDH**. Decklists are available *"when tournament has ended OR
organizer enabled 'Show Decks'"*.

This is competitive Commander data. It will not tell you what a casual pod plays, but
it is the best available evidence for what a high-power or cEDH deck looks like, which
is precisely where our power score most needs to be credible.

**Terms verdict: clear, with an attribution obligation.** Keys are free from their
developer portal, no subscription required. Every request carries the key in an
`Authorization` header. Rate limits are *"Most endpoints allow 100 requests per
minute"*, with `429` on overage and a contact address for higher limits.

The binding condition, verbatim:

> "Any project using the API must include a visible credit and link back to TopDeck.gg."

Their docs do not address commercial use explicitly. Given they issue free keys on
self-service registration and require only attribution, ask when registering to be
certain.

**Effort.** One to two days. Sign up, pull EDH tournaments, store decklists.

**Recommendation: yes, but scope it honestly.** Tournament cEDH is a narrow slice of
Commander. Use it to calibrate the top of the power scale and to detect competitive
archetypes. Do not present it as general inclusion data. And put the TopDeck.gg credit
in before shipping, not after.

Spicerack (`docs.spicerack.gg`) offers a similar public decklist database with an
`X-API-Key` header. Its docs publish no rate limits, terms, or commercial-use
statement. Worth a look after Topdeck, not before.

---

## 9. Building our own

Nobody has assessed this, and it deserves a straight answer rather than an encouraging
one.

### Where we actually are

Two complete decks. Fifteen deck rows, of which seven are empty and two have a single
card. Seven users. Deck creation running at roughly one a month and falling. Every
deck private.

### How long until it is statistically meaningful

To state an inclusion rate for a given commander with any confidence, you need on the
order of **100 decks for that commander**. Commander has over 2,000 viable commanders
and a long tail, so a corpus that covers even the top 100 commanders at that depth
needs roughly **10,000 to 20,000 complete decks**.

At the current rate of about one deck per month, that is not a timeline. It is never.

Even at a healthy 100 new decks per month, which would require roughly a hundredfold
growth in activity, 10,000 decks is over eight years.

**Conclusion: our own corpus cannot close this gap, and it must not be used to try.**
Anything that computes an inclusion rate from 2 decks and shows it as a percentage is
exactly the fabricated authority the brief warns against. It would be the worst
possible outcome of this work.

### What it is genuinely good for

Three things, none of which require large numbers:

1. **Personal signal.** "You run Sol Ring in 4 of your 5 decks" is true, useful and
   needs no corpus at all.
2. **Compounding value later.** Data not captured today cannot be recovered. The cost
   of recording it properly now is near zero. The cost of not doing so is permanent.
3. **A defensible position eventually.** If DeckMatrix grows, this becomes the one
   dataset no competitor has. That is a reason to build the pipes now, not a reason to
   report statistics now.

### What to build today so the data accrues

Cheap, and worth doing regardless of every other decision here.

1. **A deck snapshot table.** Append-only, one row per deck per meaningful edit, with
   the full card list and a timestamp. `deck_versions` already exists; check whether it
   captures full lists or only diffs, and make sure it survives deck deletion so the
   corpus does not evaporate when a user tidies up.
2. **Fix the incomplete-deck problem.** Six of eight non-empty decks are unfinished. A
   64-card Commander deck is noise in any corpus. Record a `is_complete` flag computed
   from format rules, and exclude incomplete decks from any aggregate.
3. **Ask for consent explicitly, once.** Every deck is currently private. Add a clear
   opt-in on the deck page: "Let DeckMatrix use this deck anonymously to improve
   recommendations." Default off. Store the answer per deck. Without this the corpus is
   unusable no matter how large it gets, and retrofitting consent is far harder than
   collecting it.
4. **Record the archetype the generator used.** When Deck Generator builds a deck, it
   knows what it was aiming for. Persist that intent. It is free labelled training data
   and it is being thrown away today.
5. **A materialised co-occurrence view, gated on sample size.** Build the machinery
   now, and have it refuse to return a number below a threshold (say 30 decks
   containing the commander) rather than returning a small-sample number. Then it is
   correct on day one and simply becomes useful later.

Owned paths for this work: `src/lib/meta/**`, `scripts/meta/**`, migrations, and new
ingestion edge functions.

---

## 10. What this changes for the four goals

**Power score credibility.** Improves, but through a different route than expected.
Scryfall `edhrec_rank` gives per-card popularity. Commander Spellbook
`/estimate-bracket` gives combo-derived bracket placement, which is the single most
defensible input available to us and is what the official Commander bracket system
actually keys on. Topdeck.gg calibrates the top end. We will not have EDHREC's
inclusion rates, and the score should not imply we do. It can be better than
edhpowerlevel on explainability even without them, because we can show which combos
and which game changers drove the number.

**Card suggestions.** Big improvement, available immediately.
`find-my-combos.almostIncluded` returned 35 real, one-card-away combos for a
seven-card test list. That group can honestly be labelled evidence. It should replace
`deck_cards` as the evidence group on the card page, because with 8 decks the current
query is not evidence and the comment claiming it is should be corrected.

**Archetype and playstyle.** The weakest outcome. MTGJSON's 190 precons give a small
set of designer-authored archetypes with real card lists, which is a reasonable
starting vocabulary and better than tags alone. Real archetype breadth needs
Archidekt's `deckTags`, which needs written permission. Until then, "lots of
playstyles" should be built on precon archetypes plus combo-produces categories, not
promised as data-derived.

**Combo detection.** Solved, essentially completely, by Commander Spellbook. 104,000
variants with structured outputs, under the cleanest terms of any source here.

---

## 11. Suggested order of work

1. Ask the lawyer question in section 3.2. One email, does not block anything.
2. Send the Archidekt permission request and the Moxfield application. Both are emails,
   both have long lead times, both should go out today.
3. Build Commander Spellbook ingestion. Highest value, cleanest terms, one to two days.
4. Swap the precon corpus to MTGJSON and fix the licence exposure. One day.
5. Land the corpus-accrual work in section 9. Two to three days, compounding.
6. Register for a Topdeck.gg key and pull EDH tournaments. One to two days.
7. Revisit Archidekt when the reply arrives.

Nothing in steps 3 to 6 depends on any permission we do not already have.

---

## Sources

- [Commander Spellbook](https://commanderspellbook.com/), [about page](https://commanderspellbook.com/about/), [backend API root](https://backend.commanderspellbook.com/), [OpenAPI schema](https://backend.commanderspellbook.com/schema/swagger/), [backend repo](https://github.com/SpaceCowMedia/commander-spellbook-backend), [developer docs](https://spacecowmedia.github.io/commander-spellbook-backend/api.html), [npm client](https://www.npmjs.com/package/@space-cow-media/spellbook-client)
- [Scryfall API docs](https://scryfall.com/docs/api), [rate limits](https://scryfall.com/docs/api/rate-limits)
- [MTGJSON](https://mtgjson.com/), [licence](https://mtgjson.com/license/), [DeckList.json](https://mtgjson.com/api/v5/DeckList.json)
- [EDHREC terms](https://edhrec.com/terms), [EDHREC FAQ](https://edhrec.com/faq)
- [Archidekt terms](https://archidekt.com/terms), [staff on API use](https://archidekt.com/forum/thread/2832338), [staff on rate limits](https://archidekt.com/forum/thread/19112643)
- [Moxfield public repo](https://github.com/moxfield/moxfield-public), [mtg-parser on Moxfield policy](https://github.com/lheyberger/mtg-parser)
- [MTGGoldfish terms of use](https://www.mtggoldfish.com/policies/terms-of-use), [robots.txt](https://www.mtggoldfish.com/robots.txt)
- [TopDeck.gg Tournaments V2 API](https://topdeck.gg/docs/tournaments-v2), [Spicerack decklist API](https://docs.spicerack.gg/api-reference/public-decklist-database)
- [MTGODecklistCache](https://github.com/Badaro/MTGODecklistCache), [Westly/CommanderPrecons](https://github.com/Westly/CommanderPrecons)
- [Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)
