# Price history: what we can legitimately get, and what it costs to keep

**Date:** 2026-08-19
**Question asked:** owner, *"the last 5+ years of price history if its possible to scrape it or find it
anywhere, then we run a github job to save new prices for EVERY CARD, every day"*
**Method:** every source below was fetched live today. Licence text, file sizes, update times and
rate limits are measured, not remembered. Every storage number is measured against the live MTG
database (`udnaflcohfyljrsgqggy`), not estimated. Where I could not verify something, it says so.

**Companion:** `DATA-SOURCES.md` §3 covered pricing at a high level on 2026-08-19. This document goes
deeper on the one question that one did not answer: how far back can we go, and what does keeping it
cost. Where the two overlap they agree.

I am not a lawyer and this is not legal advice. It is a transcription of what the live documents say
today, with the parts that matter quoted so a lawyer can be pointed straight at them.

---

## 1. The answer, first

**No. Five years of Magic price history cannot be obtained legitimately. Not for money, not for
free, not from anywhere.**

The most we can get is **90 days**, from MTGJSON, for free, under MIT, for every card. That is the
ceiling and it is not close to five years.

Every site that holds five years of price charts holds it as their own proprietary asset and either
forbids automated access outright or forbids commercial use of what you take. Every marketplace API
that could have sold it to us has closed to new applicants. There is no open dataset, no academic
mirror and no usable archive.

Here is the whole field on one page:

| Source | Has multi-year history? | Can we legitimately take it? | Verdict |
|---|---|---|---|
| **MTGJSON `AllPrices`** | No. Exactly 90 days | **Yes.** MIT licence, free, no auth | **USE. This is the seed.** |
| **Scryfall bulk data** | No. Current day only | Yes, and their terms *require* bulk over API calls at our volume | **USE. This is the daily feed.** |
| **Cardmarket price guide** | No. Current day only | Yes, public download, no auth, no API needed | **USE if we want a second EUR opinion.** |
| **TCGplayer API** | No history endpoint | Application only, and the terms forbid what we are building | **DO NOT PURSUE.** |
| **Cardmarket API** | n/a | "Currently, we are not accepting applications" | **CLOSED.** |
| **MTGPrice.com API** | Site has years of charts | "all API access to MTGPrice is closed" | **CLOSED.** |
| **MTGGoldfish** | Yes, years of charts | Terms: "personal, non-commercial use" only | **DO NOT SCRAPE.** |
| **MTGStocks** | Yes, years of charts | Terms: personal, non-commercial licence | **DO NOT SCRAPE.** |
| **EchoMTG** | Unclear | Account-gated API, direct competitor, terms not retrievable | **NOT VIABLE.** |
| **Open datasets / Kaggle** | No. Card data only, no price series | n/a | **NOTHING THERE.** |
| **Internet Archive** | Two disconnected 90-day windows from 2022 and 2023 | Fetch failed both times | **NOT USABLE.** |

**So the plan changes shape.** We do not import history. We **start accumulating it today**, seeded
with MTGJSON's 90 days so that day one shows a chart rather than a dot. In three years we will have
the three-year charts nobody will sell us. That is the only route, and the sooner the daily job
runs, the sooner the clock starts. This is an argument for shipping the sweep this week rather than
next month.

---

## 2. MTGJSON: the only real history available, and it is 90 days

### 2.1 Exactly how much history

The official downloads page states it in plain words. From
<https://mtgjson.com/downloads/all-files/> (fetched 2026-08-19):

> **AllPrices**: File containing all prices of cards in various formats organized by a card's `uuid`
> property **for the past 90 days**.

> **AllPricesToday**: File containing all prices, **for the current day**, of cards in various
> formats organized by a card's `uuid` property.

I did not take their word for it. I streamed and decompressed the head of `AllPrices.json.gz` and
counted the dates in it:

```
first date 2026-05-20   last date 2026-08-18   span 91 days   distinct days present 89
missing inside the span: 2026-06-06, 2026-08-06
```

So it is a rolling 91-day window containing 89 build days. **Two days are missing across the entire
file**, which means MTGJSON's build failed on those two dates and that data is gone for good. It is
not a per-card gap, it is global. Worth knowing before we treat the seed as complete.

Per card, sampled over 4,307 cards with a TCGplayer retail series: **median 89 days, mean 87.8, max
89**. Coverage is dense, not sparse.

### 2.2 What is in it

Five paper providers and one online provider, confirmed both from the data model page and from the
bytes:

| Provider | Currency | Retail | Buylist |
|---|---|---|---|
| `tcgplayer` | USD | yes | no |
| `cardmarket` | EUR | yes | no |
| `cardkingdom` | USD | yes | **yes** |
| `cardsphere` | USD | yes | yes |
| `manapool` | USD | yes | no |
| `cardhoarder` (MTGO) | tix | yes | yes |

Shape is `paper -> provider -> {retail, buylist} -> {normal, foil} -> {date: price}`, with an
explicit `currency` on each provider. Card Kingdom buylist is the number a seller actually receives
and Scryfall has nothing like it.

### 2.3 Licence

<https://mtgjson.com/license/> (fetched 2026-08-19) carries the full MIT text and opens:

> By using this website and its content you agree to the following License:
> Copyright © 2018 – Present, Zach Halpern
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software […]

MIT, and it says it covers the website and its content, which is the price files. This is the most
permissive licence in the whole field by a distance.

**One caveat, and it is the only genuine legal question in this document. See §4.4.**

### 2.4 Files, sizes and cadence, measured

All measured 2026-08-19 by HTTP HEAD:

| File | Bytes | Last modified |
|---|---|---|
| `AllPrices.json.xz` | 46,717,092 | 2026-08-18 |
| `AllPrices.json.gz` | 148,305,501 | 2026-08-18 06:10 UTC |
| `AllPrices.json.bz2` | 99,599,381 | 2026-08-18 |
| `AllPricesToday.json.gz` | 5,493,415 | 2026-08-18 06:08 UTC |
| `cardIdentifiers.parquet` | 13,201,796 | current |
| `cardIdentifiers.csv` | 31,562,801 | current |

Cadence, from the MTGJSON FAQ: builds kick off at 1:00 AM EST and go live at 9:00 AM EST. Daily.

Use **`AllPrices.json.xz` at 46.7 MB**, not the 148 MB gzip. It is the same data, a third the
download.

### 2.5 The join actually works

`AllPrices` is keyed by MTGJSON `uuid`, which is not our key. The mapping file is small and cheap:
`cardIdentifiers.csv` (31.6 MB) has exactly the column we need. Header, fetched live:

```
uuid,scryfallId,scryfallOracleId,scryfallIllustrationId,scryfallCardBackId,mcmId,mcmMetaId,
mtgArenaId,mtgoId,mtgoFoilId,multiverseId,tcgplayerProductId,...
```

Our `cards.id` is the Scryfall card id, so the path is
`MTGJSON uuid -> identifiers.scryfallId -> cards.id`. Verified against a live record. **Do not
download `AllIdentifiers.json.gz` (228 MB) or `AllPrintings.sqlite` (675 MB) for this.** The parquet
at 13.2 MB or the CSV at 31.6 MB is the whole job.

---

## 3. Scryfall bulk data: current prices only, and their terms tell us to use bulk

### 3.1 Confirmed: no history

The `/bulk-data` manifest returns seven files. Not one of them is historical. Every card object
carries a single current `prices` block. Fetched live 2026-08-19:

| Type | Compressed size | Updated |
|---|---|---|
| `oracle_cards` | 24,529,183 | 2026-08-18 21:02 UTC |
| `unique_artwork` | 37,419,987 | 2026-08-18 21:02 UTC |
| **`default_cards`** | **77,517,892** | 2026-08-18 21:05 UTC |
| `all_cards` | 391,690,346 | 2026-08-18 21:18 UTC |
| `rulings` | 5,341,262 | 2026-08-18 21:00 UTC |
| `art_tags` | 12,536,373 | 2026-08-18 09:01 UTC |
| `oracle_tags` | 5,850,723 | 2026-08-18 21:00 UTC |

Format note that matters for the job: these are **gzipped JSONL**, one card per line, not a JSON
array. From <https://scryfall.com/docs/api/bulk-data>:

> Each bulk file is a gzipped JSONL (JSON Lines) archive: You will specifically download a
> `jsonl.gz` archive and need to decompress or stream it on disk. They are not wrapped in tarballs
> (it's just `.gz`, not `.tar.gz`)

Which means the sweep can stream it and never hold 400 MB in memory.

Cadence, same page:

> Bulk data is only collected once every 12-24 hours.

And on prices specifically:

> Card objects in bulk data include price information, but **prices should be considered dangerously
> stale after 24 hours**. Only use bulk price information to track trends or provide a general
> estimate of card value. **Prices are not updated frequently enough to power a storefront or sales
> system.** You consume price information at your own risk.

Trend display is exactly the permitted use. The marketplace must never transact on these numbers.

### 3.2 Their terms require bulk at our volume

This settles the "34,088 API calls or one bulk file" question on terms, not just on speed. From
<https://scryfall.com/docs/api/rate-limits> (fetched 2026-08-19):

> **If you need to rapidly look up card names, prices, or resolve a large number of card images, you
> must use the bulk data files.**

> We only update prices for cards once per day. Fetching card data more frequently than 24 hours
> will not yield new prices.

Hard limits are 10 requests/second on most endpoints, 2/second on `/cards/search`, `/cards/named`,
`/cards/random` and `/cards/collection`. And:

> The direct file origins located at `*.scryfall.io` do not have rate limits.

**So the daily sweep pulls one file from `data.scryfall.io` and does zero API calls.** A per-card
loop against the API is not merely slow at 110,000 cards, it is against their stated rule.

### 3.3 Dated bulk URLs expire

Bulk URLs carry a timestamp, which raised the question of whether old ones survive and could be
mined for history. They do not. Measured:

```
default-cards-20260818210555.jsonl.gz  -> HTTP 200
default-cards-20250818210555.jsonl.gz  -> HTTP 404
```

Yesterday's file is up. Last year's is gone. There is no Scryfall price archive.

### 3.4 The six fields we should be storing

Scryfall publishes `usd`, `usd_foil`, `usd_etched`, `eur`, `eur_foil`, `tix`. We currently store four
and drop two. Measured on the live `cards` table this morning (**52,130 rows and climbing**, the
sync agent is mid-run):

| Field | Cards with a value |
|---|---|
| `eur` | 47,318 |
| `usd` | 46,944 |
| `tix` | **36,150** |
| `eur_foil` | 33,538 |
| `usd_foil` | 33,311 |
| `usd_etched` | **374** |

**We are throwing away a `tix` price on 36,150 cards every single night.** That is not a rounding
error, it is the third most populated price field we hold. Both missing fields go in the new schema.

---

## 4. The marketplaces: all closed, and their terms are explicit

### 4.1 TCGplayer

**Access.** From <https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions>
(fetched 2026-08-19, page dated "Updated: June 8, 2022"):

> TCGplayer has sole discretion to grant or deny any request for API access and may seek further
> information before making a decision.

**No price history endpoint exists.** The `Pricing` section of <https://docs.tcgplayer.com/reference/pricing>
lists seven endpoints (market price by SKU, product prices by group, product/SKU market prices,
product/SKU buylist prices). All are current-value. The page's own summary:

> Pricing endpoints return a treasure trove of data about different price points for all of the
> products in the catalog. From these endpoints, market pricing, low/mid/high pricing, and Buylist
> pricing can all be pulled.

Nothing historical. You would have to snapshot it yourself, which is what we are doing anyway from
a source that is actually open to us.

**And the terms forbid what we are building.** Four clauses, quoted exactly:

> The API is provided solely for the purpose of (a) academic research or (b) promoting and
> facilitating access to and use of the Site.

> Develop, promote, or enable any product, application, or service similar to or that competes with
> TCGplayer's current or planned offerings, or the Site itself.

> Combine TCGplayer's pricing data with your own or a third party's pricing data.

> Collect content or information (including pricing information) from the Site using automated means
> (which includes using crawlers, scrapers, bots, robots, scripts, devices, browser plugins and
> add-ons or any other technology) other than through API access as provided by these API Terms.

> Obtain content or information (including pricing information) from a third-party that was
> collected from the Site using our API or otherwise using automated means, as described above.

DeckMatrix has a marketplace. It shows Cardmarket EUR alongside USD. Both of the first two clauses
land squarely on us. **Do not apply. Do not scrape.** The affiliate programme is a separate and
legitimate route if the owner wants a commercial relationship with TCGplayer, and it pays
commission rather than costing money. That is worth pursuing on its own merits, but it is not a
history source.

### 4.2 Cardmarket API: closed

<https://help.cardmarket.com/en/cardmarket-api> (fetched 2026-08-19), in bold on the page:

> **Currently, we are not accepting applications for access to the Cardmarket API.**

### 4.3 Cardmarket price guide: open, free, and current-day only

This is a real and pleasant surprise. Cardmarket made the price guide a public download in June
2024. From <https://news.cardmarket.com/en/Magic/were-making-the-price-guide-and-product-catalogue-available-for-download>
(dated 05.06.2024):

> Starting next Tuesday, Cardmarket's price guide and product catalogue will be available for
> download for all games. You can download these files from this downloads page. Previously, these
> files were only available to API users, but we've decided to widen their availability to all of
> our users. Please note that **the price guide is updated once daily** and the product catalogue is
> updated whenever we add a new release […]

> Because this information is now publicly available, we don't need the old API endpoint.

Verified live, no authentication of any kind:

```
https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json
  HTTP 200, application/json, 25,828,168 bytes
https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_1.json
  HTTP 200, 20,126,830 bytes
```

First record, exactly as served:

```json
{"version":1,"createdAt":"2026-08-18T02:43:21+0200","priceGuides":[
 {"idProduct":1,"idCategory":1,"avg":0.09,"low":0.02,"trend":0.1,
  "avg1":0.39,"avg7":0.09,"avg30":0.11,
  "avg-foil":0.36,"low-foil":0.04,"trend-foil":0.4,
  "avg1-foil":0.4,"avg7-foil":0.36,"avg30-foil":0.35}, ...
```

`avg1`, `avg7` and `avg30` are trailing 1, 7 and 30 day averages. That is **derived** history, not a
series, and it cannot be unrolled into daily points without inventing numbers. It does not extend
our chart.

**No archive.** I probed for dated files and the bucket refuses everything except the current file:

```
/priceGuide/                             HTTP 403
/priceGuide/price_guide_1_2026-08-17.json HTTP 403
/priceGuide/price_guide_1.json.gz         HTTP 403
/priceGuide/price_guide_1.json            HTTP 200
```

Current day only. The join key is `idProduct`, which is Cardmarket's `mcmId`, which MTGJSON's
`cardIdentifiers` gives us. So this is joinable if we ever want a second EUR opinion, but it adds no
history and Scryfall already gives us `eur`. **Low priority. Nice to know it exists.**

### 4.4 The one clause that needs a lawyer

TCGplayer's API Terms say you may not:

> Obtain content or information (including pricing information) from a third-party that was
> collected from the Site using our API or otherwise using automated means […]

MTGJSON's `AllPrices` contains a `tcgplayer` column. If we seed our USD chart from it, we are
obtaining TCGplayer pricing from a third party.

**The distinction that probably saves us:** those are *API Terms*. They bind people who applied for
and accepted API access. We never have and, per §4.1, never will. A contract cannot bind a
non-party. Separately, Scryfall's `usd` is itself TCGplayer-derived under an affiliate arrangement
and Scryfall publishes it openly, so this data already reaches us by a route Scryfall considers
legitimate.

**But I am not going to pretend that is settled.** It is the single question in this document where
the honest answer is "ask a lawyer, and ask before the seed runs, not after". `DATA-SOURCES.md`
§3.2 raised the same flag independently and reached the same place.

**Three options for the owner, in order of my preference:**

1. **Seed `usd` from MTGJSON's `tcgplayer` retail series** and ask a lawyer in parallel. It matches
   our ongoing Scryfall `usd` series most closely, so the chart has no visible seam. Highest value,
   one open question.
2. **Seed `eur` only, from MTGJSON's `cardmarket` series.** Scryfall's `eur` is also Cardmarket
   derived, so it matches, and Cardmarket publish their price guide publicly anyway. Charts get 90
   days of EUR and zero days of USD. Zero legal question, half the value.
3. **Seed Card Kingdom retail as its own labelled series.** Legally clean, but it is a different
   number from TCGplayer market, so it can never be blended into the same line without lying about
   what a card was worth.

Whichever is chosen, **record the source on every seeded row.** Mixing a seeded series and a live
series in one line without saying so is exactly the kind of quiet fabrication this project forbids.
The schema in §6 carries a `src` column for this.

---

## 5. The long-chart sites: they have what we want and we cannot have it

### 5.1 MTGGoldfish

From <https://www.mtggoldfish.com/policies/terms-of-use> (fetched 2026-08-19):

> The Website and the contents are intended solely for **personal, non-commercial use**. You may
> download or copy the contents and other downloadable materials displayed on the Website for your
> personal use only. No right, title or interest in any downloaded content is transferred to you as
> a result of any such downloading or copying. **You may not reproduce (except as noted above),
> publish, transmit, distribute, display, modify, create derivative works from, sell or exploit in
> any way any of the contents or the Website.**

DeckMatrix is a commercial product. That is a clean no, twice over: commercial use, and
redistribution. There is no public API. **Do not scrape MTGGoldfish.**

Their `robots.txt` additionally carries Cloudflare content signals (`ai-train=no`, `use=reference`)
described on the file itself as express reservations of rights under Article 4 of EU Directive
2019/790. Not aimed at us, but it shows the posture.

### 5.2 MTGStocks

MTGStocks is behind a Cloudflare challenge that returns HTTP 202 to a plain client, so I could not
retrieve the terms text directly and I am reporting this second hand rather than as a verified
quote. Their terms of use at <https://www.mtgstocks.com/docs/terms-of-use> grant a limited,
non-exclusive, non-transferable licence to use the site for personal, non-commercial purposes, and
prohibit unauthorised reproduction or distribution.

Two things follow regardless of the exact wording. **A site sitting behind a bot challenge has
stated its position on automated access without needing a clause.** And MTGStocks have a
partnership with MTGJSON, which is the legitimate front door: whatever MTGStocks are willing to
share flows through MTGJSON's MIT-licensed files, which we already take. **Do not scrape
MTGStocks.**

### 5.3 MTGPrice.com

From <https://www.mtgprice.com/mtgPriceAPI.jsp> (fetched 2026-08-19), the entire content of their
API page:

> MTGPrice.com API Access (BETA)
> **Please note that at this time, all API access to MTGPrice is closed.** We may re-visit this
> decision in the future.

Closed.

### 5.4 EchoMTG

An open API exists at <https://www.echomtg.com/api/> with a "Data: Item History" endpoint. Three
problems. It is user-token authenticated with 24-hour token expiry, so it is built for personal
scripts, not for a server-side pipeline. EchoMTG is a direct competitor as a collection tracker.
And I could not retrieve their Terms and Conditions at a stable URL, so I cannot quote what they
permit. **Not viable without asking them directly, and there is no reason to.**

### 5.5 Open datasets, archives, academic mirrors

I looked. There is nothing.

Kaggle's Magic datasets (`mylesoneill/magic-the-gathering-cards`, `patkle/more-than-25k-magic-the-gathering-trading-cards`)
are MTGJSON card dumps, some as old as 2016, with **no price series**. The `mtgcardprices` Kaggle
competition is a one-off snapshot, not a time series.

The Internet Archive is the closest thing to a real find and it does not survive contact. The
Wayback CDX index holds **four** captures of MTGJSON's price files across its entire history:

```
20220106090512  AllPrices.json.zip  200   50,730,644
20230530051038  AllPrices.json.bz2  200   69,041,037
20230530051053  AllPrices.json.zip  200   97,001,883
20250709031922  AllPricesToday.json.zip 200 4,180,339
```

Even at best that is two disconnected 90-day windows, one ending January 2022 and one ending May
2023, with multi-year holes on either side. A chart built from that would be three fragments
separated by two enormous gaps. And it is moot: both retrieval attempts returned **HTTP 503** from
`web.archive.org`, so the bytes are not actually served.

**Recommendation: do not spend time here.** Even if the 503s cleared, two isolated quarters from
years ago are not history, and under project law the holes between them would have to render as
holes, which would make the chart worse rather than better.

---

## 6. Storage: measured, not estimated

### 6.1 Where the 600 bytes per row actually goes

The brief says `card_price_history` is fat. It is worse than fat, and the fat is not where you would
guess. Measured live:

| | Bytes | Per row |
|---|---|---|
| Heap | 6,144,000 | **178.0** |
| Indexes | 15,785,984 | **457.4** |
| Toast | 40,960 | 1.2 |
| **Total** (34,510 rows) | **21,970,944** | **636.7** |

**The indexes are 72% of the table.** Four of them:

| Index | Size |
|---|---|
| `idx_card_price_history_card_date` on (card_id, snapshot_date) | 6,240 kB |
| `idx_card_price_history_oracle_date` on (oracle_id, snapshot_date) | 5,936 kB |
| `card_price_history_pkey` on (id) | 2,592 kB |
| `idx_card_price_history_date` on (snapshot_date DESC) | 648 kB |

Every one of those is expensive because the keys are wrong. `card_id` and `oracle_id` are declared
`text` and hold 36-character UUID strings, so each index entry carries 37 bytes where 4 would do.
The `id uuid` primary key is pure overhead: it indexes 34,510 rows on a value nothing ever looks up,
costing 2.6 MB, when `(card_id, snapshot_date)` is already unique and is the real key.

And `card_name` is stored on every row, duplicated from `cards`, for no reason at all.

### 6.2 The lean schema, measured on real Postgres

I built the proposed table in the live database, loaded 330,000 rows into it, measured, and dropped
it. Not a calculation, a measurement.

```sql
create table card_price_history (
  card_key   int4  not null,     -- surrogate key into cards, not a 36-char text uuid
  d          date  not null,
  usd        int4,               -- hundredths. 6 numerics become 6 int4s
  usd_foil   int4,
  usd_etched int4,               -- NEW: 374 cards
  eur        int4,
  eur_foil   int4,
  tix        int4,               -- NEW: 36,150 cards
  primary key (card_key, d)      -- the only index. no surrogate id.
);
```

| Variant | Heap | Indexes | **Total per row** |
|---|---|---|---|
| **Current table** | 178.0 | 457.4 | **636.7** |
| Lean, `uuid` key, PK only | 66.4 | 54.1 | **120.6** |
| **Lean, `int4` key, PK only** | 54.4 | 30.0 | **84.5** |
| **Lean, `int4` key, PK + covering index** | 54.4 | 85.5 | **139.9** |

**84.5 bytes/row against a 150 byte target, and 7.5x smaller than today, on identical coverage and
with two extra price fields.** The covering index variant lands at 139.9, still inside target, and
§7 shows why it is worth every one of those extra bytes.

The `int4` surrogate key beats the `uuid` key by 30%. It needs a small integer column added to
`cards`, which is a one-line migration and a `generated always as identity` column.

Add a `src smallint` to record whether a row was observed by our own sweep or seeded from MTGJSON
(§4.4). Alignment padding makes that about 8 bytes/row, taking the covering variant to roughly 148.
Still inside target, and it is what keeps the seeded seam honest.

### 6.3 How often prices actually move

This is the number that decides everything, and it is the number the brief guessed at. I measured it
two independent ways and they agree.

**From our own history** (the 363 cards with 60 or more snapshots, 26,910 consecutive day pairs,
Scryfall-sourced, the exact feed the daily job will use):

| Gate | Share of day pairs that would write a row |
|---|---|
| Any field differs at all | **51.97%** |
| Any field moves by ≥1% **and** ≥$0.05 | **14.92%** |

**From MTGJSON's own data** (5,634 cards parsed out of the live `AllPrices` file, ~374,000 day pairs
per provider), for the single `usd` series alone:

| Provider | Any change | ≥1% | ≥$0.05 | ≥1% and ≥$0.05 |
|---|---|---|---|---|
| tcgplayer | 25.60% | 21.04% | 7.09% | **5.79%** |
| cardmarket | 29.60% | 26.83% | 8.63% | 7.86% |
| manapool | 15.17% | 13.30% | 7.83% | 7.43% |
| cardkingdom | 4.32% | 4.32% | 4.05% | 4.05% |

Our own single-field `usd` number under the same gate is **5.77%**. MTGJSON's tcgplayer number is
**5.79%**. Two entirely separate datasets, two decimal places apart. That is as much confidence as
this kind of measurement gets.

**Three things follow, and two of them contradict assumptions in the brief.**

**One. Use a gate, not raw inequality.** Ungated store-on-change writes on 51.97% of day pairs and
saves only half. Gated at ≥1% and ≥$0.05 it writes on 14.92% and saves 85%. The gate is worth 3.5x.

**Two. The row-level rate is 14.92%, not 5.79%.** A row holds six fields and is written if *any* of
them moves. The single-field rate is the wrong number to size storage with, and it is off by 2.6x.
Anyone quoting 5-6% for this design is quoting a per-field figure.

**Three. Card Kingdom is a different animal.** 4.32% of days show any change at all, because Card
Kingdom set prices by hand rather than by algorithm. Worth remembering if we ever chart their
buylist: sparse there means genuinely unchanged.

### 6.4 What it costs per year

At the 110,000 card target, 365 days, using the measured 14.92% and the measured bytes per row:

| Strategy | Rows/day | Rows/year | Bytes/year (84.5) | Bytes/year (139.9, covering) |
|---|---|---|---|---|
| **Full daily** | 110,000 | 40.15 M | **3.39 GB** | 5.62 GB |
| **Change-gated daily** | 16,412 | 5.99 M | **506 MB** | **839 MB** |
| Weekly full sweep | 15,714 | 5.72 M | 483 MB | 801 MB |
| Current schema, full daily | 110,000 | 40.15 M | **25.6 GB** | n/a |

Read the last row again. **The schema fix alone is worth 22 GB a year.** It is worth more than every
other decision in this document combined, and it costs one migration.

**And the weekly fallback the brief held in reserve is pointless.** A weekly full sweep writes
15,714 rows/day-equivalent. A change-gated daily sweep writes 16,412. They cost the same to within
4%, and the daily one gives daily granularity. There is no scenario where the weekly fallback is the
right answer, so it can be struck from the plan.

Seeding from MTGJSON's 90 days, with the same gate applied, costs roughly 14 rows/card, so about
1.5 M rows and **210 MB** as a one-off. Cheap.

### 6.5 Age-based rollup is worth less than the brief assumes

The brief proposes daily for a year, weekly after that, monthly beyond two years. Once the change
gate is in place, **the weekly tier saves nothing**:

| Tier | Rows/year at 110,000 cards | Saving vs gated daily |
|---|---|---|
| Gated daily | 5.99 M | baseline |
| Weekly rollup | 5.72 M | **4.5%** |
| Monthly rollup | 1.32 M | **78%** |

Gated daily already writes fewer rows than a weekly grid would, because 85% of cards do not move.
Collapsing to weekly buys 4.5% and permanently destroys resolution. **Skip the weekly tier.** Keep
daily for two years, then roll straight to monthly, where the saving is real.

Five-year totals at 110,000 cards, covering index included:

| Plan | 5-year size |
|---|---|
| Full daily, current schema | **128 GB** |
| Full daily, lean schema | 28.1 GB |
| Gated daily, lean schema, no rollup | 4.20 GB |
| **Gated daily, lean, monthly rollup after year 2** | **2.23 GB** |

### 6.6 The Supabase account, checked

Both facts here were wrong in my working assumptions until I looked.

**The organisation is on the Pro plan, not Free.** Verified through the management API:
`nathangrooms's Org`, plan `pro`. CLAUDE.md §6.1 describes a free-tier auto-pause incident; that is
history, and the auto-pause risk it warns about no longer applies.

**The MTG database is 300 MB today** (`pg_database_size` = 314,281,107 bytes).

Pro plan limits, from <https://supabase.com/pricing> (fetched 2026-08-19):

> 8 GB disk size per project included, then $0.125 per GB
> 250 GB [egress] included, then $0.09 per GB
> 100 GB [file storage] included, then $0.0213 per GB

Against the 8 GB included disk:

| Plan | Size after 5 years | Total DB | Monthly overage |
|---|---|---|---|
| **Gated daily + monthly rollup** | 2.23 GB | ~2.6 GB | **£0** |
| Gated daily, no rollup | 4.20 GB | ~4.5 GB | **£0** |
| Full daily, lean schema | 28.1 GB | ~28.5 GB | ~$2.56/mo by year 5 |
| Full daily, current schema | 128 GB | ~128 GB | ~$15/mo by year 5 |

**The recommended plan never leaves the included allowance.** Even the unrolled version does not.

The dollar figures for full daily are not frightening on their own, and that is worth saying
plainly rather than pretending cost forces our hand. The real argument against full daily is
operational: 40 million rows a year makes every backup, restore, vacuum and index rebuild slower,
and on the Micro compute instance that Pro includes, a 28 GB table will not stay in cache. The
gated plan keeps the whole five-year dataset smaller than a single year of the naive one.

**On the owner's stated budget.** He said 3.7 GB/year is fine. The recommended design uses **839 MB
in year one and 2.23 GB across five years**. We come in under his annual tolerance for the entire
five-year life of the feature.

---

## 7. The SEO consequence, measured

110,000 card pages each render a price chart. The chart query runs on every visit from search. So
its cost is not a detail, it is the site's performance profile.

**The current table fails this test.** Measured on the live database, one card, its whole history:

```
Index Scan using idx_card_price_history_card_date  (actual time=1.007..1.413 rows=79)
  Index Cond: (card_id = '004524bf-...')
  Buffers: shared hit=82
```

**82 buffers for 79 rows.** Slightly more than one page read per row. Rows for a single card are
scattered across the heap because inserts arrive date-major, so every point on the chart is a
separate 8 kB page. 1.4 ms today at 79 rows. At five years of daily history it is 1,800 rows and
roughly 1,800 buffers, on every page view, on 110,000 pages.

**A covering index fixes it completely.** Measured on a probe table with 1,000 days of history per
card:

```sql
create index card_price_history_cov
  on card_price_history (card_key, d)
  include (usd, usd_foil, usd_etched, eur, eur_foil, tix);
```

```
Index Only Scan using card_price_history_cov  (actual time=0.045..0.221 rows=1000)
  Index Cond: (card_key = 137)
  Heap Fetches: 0
  Buffers: shared hit=10
  Execution Time: 0.354 ms
```

**1,000 rows in 10 buffers, zero heap fetches, 0.354 ms warm.** Against the current table's 82
buffers for 79 rows, that is **100 rows per buffer instead of 1**, a hundredfold reduction in I/O.
Cold, the same query took 16.8 ms and 10 buffers, so even a cache miss is 10 random reads.

Three notes for whoever builds it:

- `Heap Fetches: 0` requires the visibility map to be current, so the table needs autovacuum to keep
  up. A daily append-only insert of 16,000 rows is the easy case for autovacuum, but set
  `autovacuum_vacuum_scale_factor` low on this table so it is visited despite being large.
- The covering index costs 55.4 bytes/row on top of the 84.5 (measured: 139.9 total). Given it turns
  the SEO query into an index-only scan, that is the best-spent 55 bytes in the schema.
- Order the key `(card_key, d)`, not `(d, card_key)`. The chart asks for one card across all dates.
  A date-leading index cannot serve it.

---

## 8. Recommendation

**Build this:**

1. **Lean schema first.** `(card_key int4, d date)` primary key, six `int4` price columns in
   hundredths, a `src smallint`, no surrogate id, no `card_name`, no `oracle_id`. Measured at 84.5
   bytes/row, or 148 with the covering index and source column. Down from 636.7. Join to `cards` for
   everything else.

2. **Covering index** on `(card_key, d) include (usd, usd_foil, usd_etched, eur, eur_foil, tix)`.
   Measured 100x fewer buffers on the read path that every SEO visitor triggers.

3. **Daily sweep over the whole catalogue from one Scryfall bulk file.** `default_cards`,
   77.5 MB gzipped JSONL from `data.scryfall.io`, which is rate-limit free and which Scryfall's own
   terms tell us to use at this volume. Stream it. Zero API calls.

4. **Store on change, gated at ≥1% and ≥$0.05.** Measured to write on 14.92% of card-days. 5.99 M
   rows and 839 MB per year at 110,000 cards. Drop the weekly-fallback option entirely: it is 4%
   cheaper than gated daily and throws away six sevenths of the resolution.

5. **Carry forward on read, and mark carried points as carried.** A missing day means unchanged, not
   worthless. The read path fills gaps from the last observation; the response distinguishes observed
   from carried; the chart says which is which. Test it.

6. **Seed 90 days from MTGJSON `AllPrices.json.xz`** (46.7 MB), joined through
   `cardIdentifiers.parquet` (13.2 MB) on `scryfallId`. About 1.5 M rows and 210 MB one-off. Set
   `src` on every seeded row. **Get the §4.4 question answered before this step runs.**

7. **Monthly rollup beyond two years.** Skip the weekly tier, it saves 4.5%. Monthly saves 78%.

**Tell the owner:**

- Five years does not exist. Nobody will sell it and nobody legitimately gives it away.
- 90 days is the ceiling, it is free, it is MIT licensed, and it covers every card.
- **The clock starts the day the sweep ships.** In three years we will have three-year charts that no
  competitor will sell us today. That is a reason to ship this week.
- It will cost 839 MB in year one and 2.23 GB over five years, entirely inside the Supabase Pro
  allowance already being paid for. His 3.7 GB/year budget covers the whole five years.
- One question needs a lawyer before the seed runs, and it is written out in §4.4.

---

## 9. Coordination note

Checked at time of writing: `.github/workflows/` **does not exist** in the repo, and there is no
`supabase/functions/price-bulk-sync`, no `src/lib/prices`, no `scripts/prices`. Agent `wqlgjy4km` had
not landed its scheduling work at the point this document was written. Re-check before creating
anything under `.github/workflows/`, and extend what is there rather than replacing it.

One thing this document settles for that agent regardless of what it has built: **the daily job must
pull one Scryfall bulk file, not loop the API.** Scryfall's rate-limit page requires it in terms, and
110,000 cards at 10 requests/second is over three hours of API traffic against a limit that exists to
stop exactly that.

---

## 10. Sources, all fetched 2026-08-19

| Source | URL | Status |
|---|---|---|
| MTGJSON all files (90 days) | <https://mtgjson.com/downloads/all-files/> | verified |
| MTGJSON licence (MIT) | <https://mtgjson.com/license/> | verified |
| MTGJSON price formats | <https://mtgjson.com/data-models/price/price-formats/> | verified |
| MTGJSON `AllPrices.json.gz` | <https://mtgjson.com/api/v5/AllPrices.json.gz> | downloaded and parsed |
| MTGJSON `cardIdentifiers.csv` | <https://mtgjson.com/api/v5/csv/cardIdentifiers.csv> | header verified |
| Scryfall bulk data | <https://scryfall.com/docs/api/bulk-data> | verified |
| Scryfall bulk manifest | <https://api.scryfall.com/bulk-data> | fetched, 7 files |
| Scryfall rate limits | <https://scryfall.com/docs/api/rate-limits> | verified |
| Scryfall data terms | <https://scryfall.com/docs/api> | verified |
| TCGplayer API terms | <https://help.tcgplayer.com/hc/en-us/articles/360061115874-TCGplayer-API-Terms-Conditions> | verified, quoted |
| TCGplayer pricing endpoints | <https://docs.tcgplayer.com/reference/pricing> | verified, no history |
| Cardmarket API | <https://help.cardmarket.com/en/cardmarket-api> | verified, closed |
| Cardmarket download announcement | <https://news.cardmarket.com/en/Magic/were-making-the-price-guide-and-product-catalogue-available-for-download> | verified |
| Cardmarket price guide file | <https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json> | downloaded, 25.8 MB |
| MTGGoldfish terms of use | <https://www.mtggoldfish.com/policies/terms-of-use> | verified, quoted |
| MTGStocks terms of use | <https://www.mtgstocks.com/docs/terms-of-use> | **blocked by bot challenge, reported second hand** |
| MTGPrice API | <https://www.mtgprice.com/mtgPriceAPI.jsp> | verified, closed |
| EchoMTG API docs | <https://www.echomtg.com/api/> | verified, account gated |
| Supabase pricing | <https://supabase.com/pricing> | verified |
| Supabase org plan | management API | verified: `pro` |
| Live database measurements | project `udnaflcohfyljrsgqggy` | measured directly |
