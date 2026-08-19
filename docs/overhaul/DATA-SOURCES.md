# Data sources: everything a maximal Magic engine could legitimately be built from

**Date:** 2026-08-19 · **Question asked:** owner, *"Is there other points we can reference too?"*
**Method:** every source below was fetched live today. URLs, licence text, rate limits and file
sizes are measured, not remembered. Where I could not verify something, it says so.

**Companions:** `XMAGE-EXTRACTION-SPIKE.md` (XMage, already assessed) ·
`RULES-ENGINE-COVERAGE.md` (what the engine does today) · `CLAUDE.md` §"Card coverage".

**The two numbers, restated so nothing below conflates them:**
- **REPRESENTABLE** — what the ability DSL can express: **76.0%**, rising to **80.7%** with the
  four cheap extensions. Measured against XMage's 32,168-card corpus.
- **AUTOMATED** — what the engine actually runs: **84 cards** of ~12,000 rows today.

Nothing in this document changes the second number by itself. Data is not automation. What the
sources below do is (a) make the engine *correct* where it does run, (b) tell us *what to build
next*, and (c) close the deck-building data gap, which is a genuinely different problem.

---

## 0. Read this before anything else: two licence facts that constrain the whole product

These are stated first because the owner is building a **commercial** product and both of these
bite commercial products specifically. **I am not a lawyer and this is not legal advice** — it is
a transcription of what the live documents say today, with the parts that matter quoted verbatim
so a lawyer can be pointed straight at them.

### 0.1 The Wizards Fan Content Policy is a "free" policy

Source: <https://company.wizards.com/en/legal/fancontentpolicy> (page states *Last Updated:
November 15, 2017*; fetched 2026-08-19).

> **One word: F-R-E-E.** You can use Wizards' IP (except for the restrictions listed in #3) to
> make Fan Content that you share with the community for free. Free means FREE:
> - You can't require payments, surveys, downloads, subscriptions, or email registration to
>   access your Fan Content;
> - You can't sell or license your Fan Content to any third parties for any type of
>   compensation; and
> - Your Fan Content must be free for others (including Wizards) to view, access, share, and
>   use without paying you anything […]

and, separately:

> **Don't use Wizards' IP in other games.** This includes your own or other people's games or
> game components (e.g., rule books, tokens, figures), regardless of whether it is distributed
> for free;

The policy does permit subsidising via *sponsorships, ad revenue and donations*.

**What this means for us, honestly.** Card *names* and *game rules* are, as a general matter of
law, weak copyright subjects (facts and systems). **Oracle text, card art, set symbols, the
Comprehensive Rules document itself and the Magic trademarks are not** — those are plainly
Wizards' IP, and DeckMatrix ships all of the first two to browsers. A subscription tier, a paid
marketplace, or an email-gated signup in front of any surface that displays them is outside the
four corners of the Fan Content Policy as written.

**Recommendation: INVESTIGATE FURTHER — this is a lawyer question, not an engineering one, and it
should be asked before the first paid tier ships, not after.** Note that every large commercial
MTG tool (Moxfield, Archidekt, TCGplayer, MTGGoldfish) operates paid tiers, so a workable posture
clearly exists in practice. What that posture *is* — tolerance, a separate agreement, or
structuring so that paid features never gate WotC IP — is exactly what needs asking. The
practical structural answer used by others is visible in Scryfall's own rule below: **keep card
data free and anonymous; charge for the things we built.**

### 0.2 Scryfall forbids paywalling their data — and we are built on Scryfall

Source: <https://scryfall.com/docs/api> §"Use of Scryfall Data and Images" (fetched 2026-08-19):

> You may not "paywall" access to Scryfall data. You may not require anyone to make payments,
> take surveys, agree to subscriptions, rate your content, join chat servers, or follow channels
> in exchange for access to Scryfall data. **If you have an account system, end-users should be
> able to access card data anonymously or with free accounts.**
>
> You may not simply repackage, republish, or proxy Scryfall data. Your software must create
> additional value for end-users.

Also binding on us, since we render card images:

> Do not cover, crop, or clip off the copyright or artist name on card images. Do not distort,
> skew, or stretch card images. **Do not blur, sharpen, desaturate, or color-shift card images.**
> Do not add your own watermarks, stamps, or logos to card images. […] When using the `art_crop`,
> list the artist name and copyright elsewhere in the same interface presenting the art crop, or
> use the full card image elsewhere in the same interface.

> Repeated mishandling or misrepresentation of data or images in your project may result in
> Scryfall restricting or blocking your API access.

**⚠️ FLAG — the approved "blurred art as identity ground" pattern in `CLAUDE.md`.** That pattern
heavily blurs card artwork as a background. The image rule above says *do not blur card images*.
Two mitigations are worth checking rather than assuming: the rule is written to stop people
misrepresenting *the card* (a blurred card a user might read as the real card), and our usage is
decorative background with the sharp, unaltered card composited on top. I cannot tell from the
text alone whether that reading is accepted. **Recommendation: ask Scryfall directly before
shipping the pattern more widely.** They are approachable, the answer is free, and the downside of
guessing wrong is losing API access to the thing the entire app is built on.

**Practical rule to adopt now, which satisfies both 0.1 and 0.2:** card search, card data, oracle
text and images stay free and anonymous, forever. Charge for *our* work — the rules engine, the
power score, collection management, the marketplace, deck optimisation. That is exactly the line
Scryfall's terms draw, and it is the least fragile place to stand.

---

## 1. Rules and card behaviour — for the engine

### 1.1 Magic Comprehensive Rules (Wizards of the Coast) — **USE. Today.**

| | |
|---|---|
| **What it is** | The actual ruleset. Numbered rules + glossary. The ultimate authority for how every mechanic resolves. |
| **Access** | <https://magic.wizards.com/en/rules> lists three current files. Verified live: `https://media.wizards.com/2026/downloads/MagicCompRules%2020260808.txt` → HTTP 200, `text/plain`, **977,819 bytes**, `Last-Modified: Sat, 15 Aug 2026`. DOCX and PDF also offered (dated 20260807). |
| **Current version** | File header reads: *"These rules are effective as of August 7, 2026."* |
| **Cost** | Free. |
| **Rate limits** | None. It is a static file. Download once per rules update (roughly every set, ~6×/year). |
| **Licence / terms** | The rules page carries only `© 1993-2026 Wizards of the Coast LLC […] All Rights Reserved.` **There is no licence granting redistribution.** WotC publishes it for consultation. |

**What it unlocks for us.** Three distinct things, in order of value:

1. **A correctness oracle for engine work.** Right now we are writing a rules engine with the
   rulebook not present in the repo. Every layer, timestamp, priority, state-based-action and
   replacement-effect decision is currently being made from memory. Rule 613 (layers), 704
   (state-based actions), 603 (triggered abilities) and 608 (resolving spells) are the exact
   texts that the "300 primitives" work in the XMage spike will be judged against.
2. **A test-name and citation vocabulary.** Every engine test can cite the rule number it
   enforces. That converts "does this look right?" into "does this match 613.1c?".
3. **The glossary is a free keyword corpus.** Every evergreen and set keyword, defined, in one
   parseable file with stable numbering.

**How to use it without a redistribution problem.** Keep it **out of the shipped bundle**. Vendor
it into `docs/reference/` (or fetch it in a dev script), cite rule numbers in code comments and
tests, and never serve the text to the browser. Rule *numbers* and short quotations in source
comments are normal engineering practice; republishing the document is not ours to do.

**Effort: hours. Value: foundational. Do it first.**

### 1.2 Scryfall rulings — **USE. Today.**

| | |
|---|---|
| **What it is** | Per-card official clarifications. `source` is `wotc` (Oracle rulings + set release notes) or `scryfall` (their own notes). Keyed by `oracle_id`, which is the same key our `cards` table already uses. |
| **Per-card endpoint** | `GET https://api.scryfall.com/cards/:set/:cn/rulings` — confirmed in the live docs. |
| **Bulk — yes, it exists** | `GET https://api.scryfall.com/bulk-data` returns a `rulings` bulk object. Measured 2026-08-19: `type: "rulings"`, `updated_at: 2026-08-18T21:00:33Z`, **5,341,262 bytes** compressed, served as `.jsonl.gz` from `data.scryfall.io`. |
| **Cost** | Free. |
| **Rate limits** | API: 10 req/s for `/bulk-data` and most methods; 2 req/s for `/cards/search`, `/cards/named`, `/cards/random`, `/cards/collection`; 10/min for `/cards/manifest`. **The file origins at `*.scryfall.io` have no rate limit.** HTTP 429 = 30-second lockout; repeated overage = ban. |
| **Required headers** | `User-Agent` (must name our app, e.g. `DeckMatrix/1.0`) **and** `Accept`. Not optional. |
| **Licence** | §0.2 above. Free for building Magic software; no paywalling; no bare repackaging. |

**What it unlocks for us.** This is the highest-value-per-hour item in the entire document for
engine *correctness*.

- **It is a ready-made edge-case test corpus.** Rulings are literally the list of situations where
  a card does not do the obvious thing. Every ruling on an automated card is a test case we can
  write, and a candidate bug we can find before a player does.
- **It is a triage signal for `needsManual`.** A card with many `wotc` rulings is a card whose
  behaviour is subtle. That is a cheap, principled prior for "do not attempt to automate this
  yet" — precision over recall, enforced by data rather than by vibes.
- **It closes the loop the engine is missing.** The engine knows what it *implements*. Rulings
  tell us what a correct implementation must *also* handle.

**Concrete shape:** one nightly job, `rulings` bulk → a `card_rulings` table keyed on
`oracle_id`, ~5 MB compressed. Surfaced on the card detail page (real player value) and consumed
by the engine test generator.

**Effort: 1–2 days for ingest + display. Value: very high. Do it second.**

### 1.3 Scryfall Oracle Tags and Art Tags (Tagger) — **USE Oracle Tags. Investigate Art Tags.**

**This is new and I do not think we know about it.** Scryfall now publishes the community Tagger
project as first-class daily bulk data.

| | |
|---|---|
| **Oracle tags** | `type: "oracle"` — the *functional* role of a card: removal, ramp, draw, sacrifice outlet, etc. Measured 2026-08-19: **5,850,723 bytes** compressed, updated 2026-08-18 21:00 UTC. |
| **Art tags** | `type: "illustration"` — what is depicted in the art. **12,536,373 bytes**. |
| **Structure** | Each tag object has a stable `id` (UUID), `slug`, `label`, `description`, `aliases`, a **hierarchy** via `parent_ids`/`child_ids`, and a `taggings` array. Oracle taggings join on `oracle_id`; art taggings join on `illustration_id`. Each tagging carries a `weight`: `very_strong` / `strong` / `median` / `weak`, and an optional `annotation`. |
| **Cost / limits** | Free, same terms, and no rate limit on `*.scryfall.io`. |
| **Caveat, stated by Scryfall** | *"Tag data is subject to change as the community adds, edits, and removes tags. Scryfall performs content moderation on Tagger data. However, we cannot guarantee that tag data is 100% free from intentional errors or abuse."* They **strongly recommend** implementing a way to temporarily disable display of individual tags, and to key on `id`, never on `slug`. |

**What it unlocks for us.** We currently have `knowledge/tagger.ts` — an 815-line regex tagger
mirrored into Postgres, which `src/engine/power/subscores.ts` depends on for `ramp`, `stax`,
`graveyard` and the rest. Oracle Tags is a **human-curated, hierarchical, weighted second opinion
on exactly that job**, for the whole catalogue, free, daily.

The right move is *not* to replace our tagger with it — community data can be wrong, and precision
over recall applies. The right move is to **diff them**. Where our tagger and Scryfall's oracle
tags agree, confidence is high. Where they disagree, that is a ranked list of our tagger's bugs,
which is otherwise very expensive to find. It also gives the power score's `synergy` and
`consistency` subscores a much richer role vocabulary than 815 lines of regex can produce.

Art tags are lower priority but are the only realistic route to art-based browse/search
("show me my cards with dragons in the art").

**Effort: 2–3 days for the diff harness. Value: high for deck-building quality, moderate for the
engine. Adopt with the disable-a-tag control Scryfall asks for.**

### 1.4 MTGJSON — **USE, selectively. The only MIT-licensed card corpus we can actually redistribute.**

| | |
|---|---|
| **What it is** | An aggregation of Gatherer, Scryfall, TCGplayer and partner data into portable formats. |
| **Access** | `https://mtgjson.com/api/v5/<File>.<ext>` — JSON, CSV, Parquet, **SQL, SQLite, PostgreSQL dumps**. Every file has a `.sha256` alongside it. |
| **Live version** | `Meta.json` fetched 2026-08-19: `{"date":"2026-08-18","version":"5.3.0+20260818"}`. |
| **Build cadence** | Builds start 01:00 EST, go live 09:00 EST, daily. |
| **Measured sizes (2026-08-19)** | `AllPrintings.json.gz` 178,096,978 B · `AtomicCards.json.gz` 51,146,544 B · `AllPricesToday.json.gz` 5,493,415 B · `AllDeckFiles.tar.gz` 256,854,117 B. |
| **Cost** | Free. The GraphQL API (`MTGGraphQL`) is beta and **Patreon-only**. |
| **Rate limits** | None published. Static file server. |
| **Licence** | **MIT.** Verified two ways: `https://mtgjson.com/license/` states the MIT text applies to "this website and its content", and `github.com/mtgjson/mtgjson` reports SPDX `MIT` with `LICENSE.txt` present. This is materially more permissive than Scryfall's terms. |

**What it carries that Scryfall does not** — checked field-by-field against the live
`Card (Atomic)` data model and the live Scryfall `Card` object docs:

| MTGJSON field | Scryfall equivalent | Verdict |
|---|---|---|
| `rulings` **embedded per card** | separate `rulings` bulk file | Convenience only. Scryfall's is smaller and fresher. |
| `foreignData[]` — name, text, type, flavour, per language | Scryfall has per-language *printings* (`all_cards`, 391 MB) | **MTGJSON wins on ergonomics.** Localised oracle text attached to the atomic card, not scattered across 391 MB of printings. The cheap route to a non-English UI. |
| `purchaseUrls`, `identifiers` (tcgplayerProductId, cardKingdomId, mcmId, mtgArenaId, mtgoId, …) | `tcgplayer_id`, `cardmarket_id`, `purchase_uris` | **MTGJSON wins.** Notably **Card Kingdom** and **TCGplayer SKU-level** ids, which Scryfall does not carry. Directly relevant to the marketplace. |
| `leadershipSkills` `{brawl, commander, oathbreaker}` | must be derived from the type line | **MTGJSON wins.** Authoritative "can this be a commander", including the awkward cases. Removes a class of bug from deck legality checking. |
| `edhrecRank` | `edhrec_rank` | Tie. Both carry it. |
| **`edhrecSaltiness`** | *(absent)* | **MTGJSON only.** EDHREC's community "how much do people hate this card" score. Genuinely useful for a *playgroup-friendliness* signal, which is a distinct axis from power. |
| `isGameChanger` | `game_changer` | Tie. |
| `sealedProduct`, `booster` config, `AllDeckFiles` | *(absent)* | **MTGJSON only.** Every preconstructed deck as structured data, and full booster collation. Relevant to precons and any pack-opening feature. |
| `firstPrinting`, `subsets`, `hasAlternativeDeckLimit`, `relatedCards`, `isFunny` | partial | Minor wins. `hasAlternativeDeckLimit` (Seven Dwarves, Persistent Petitioners, Relentless Rats) is a real deck-legality edge case. |

**Recommendation: USE, but do not migrate off Scryfall.** Scryfall stays primary — it is fresher,
we already sync it nightly, and its search syntax is what the app exposes. Pull three things from
MTGJSON on a weekly job, joined on `scryfallId` / `scryfallOracleId`: `leadershipSkills`,
`identifiers` (marketplace ids), and `AllPricesToday` (see §3.2). `foreignData` when localisation
is actually scheduled, not before.

**One caution, stated plainly:** MTGJSON's *code* is MIT, and their site says the licence covers
"this website and its content". But MTGJSON aggregates price data from TCGplayer and Cardmarket
under partner arrangements we are not party to. MIT on the aggregation does not obviously launder
a third party's pricing terms. See §3.2.

**Effort: 2–3 days. Value: high for marketplace and legality, moderate elsewhere.**

### 1.5 XMage — **PROCEED as already approved. Planning instrument, not a source of automation.**

Verified live 2026-08-19: `github.com/magefree/mage`, SPDX **MIT**, last push 2026-08-17,
2,337 stars. Licence confirmed unchanged since the spike.

Fully assessed in `XMAGE-EXTRACTION-SPIKE.md`. Restating only the conclusion so this document is
self-contained: 32,168 card classes, 72.9% pure declarative composition, 76.0% CLEAN against our
DSL spec — but they compose a **2,558-symbol primitive vocabulary we do not have**. Building the
top ~300 primitives is 4–15 person-months and would take automation from 84 cards to roughly
11,000 of our 33,037 `oracle_id`s (~33%, reading the CLEAN classification as ~5% optimistic).

**This remains the single largest lever on goal 1 and it is also by far the most expensive.**
Nothing else in this document substitutes for it.

### 1.6 ⚠️ GPL traps — **DO NOT USE. DO NOT READ.**

Already known: **Forge** is GPL-3.0 and strictly off limits, because DeckMatrix ships its rules
engine to the browser and that is distribution.

**Newly confirmed today, and worth adding to the same rule: `Cockatrice/Cockatrice` is GPL-2.0.**
Cockatrice is a well-known MTG client with an extensive card database and its own oracle parser,
and it comes up constantly in searches for MTG data tooling. It is the same trap as Forge. Add it
to `THIRD-PARTY-NOTICES.md` alongside Forge as a named do-not-read repository, so no future agent
wanders into it looking for a card parser.

---

## 2. Deck building and meta — the data gap

The gap is stated exactly, in the engine's own words, at `src/engine/power/score.ts`:

> Nothing measures popularity, inclusion rate or real-world win rate, because we hold no such
> data. edhpowerlevel has inclusion counts over millions of decklists; our `cards` table has 26
> columns and not one of them is a play count. **That is a data gap, not a formula gap.**

It is worse than that in one specific place. `src/engine/power/catalogs.ts` contains
**18 hand-written `TWO_CARD_COMBOS` and 8 `COMPACT_COMBOS`**. That is what the power score's combo
detection currently is. Section 2.3 fixes that outright.

### 2.1 EDHREC — **⚠️ DO NOT USE WITHOUT A WRITTEN LICENCE. THEIR TERMS FORBID EXACTLY WHAT WE WOULD DO.**

**There is no official public EDHREC API.** Confirmed: no developer documentation exists. The
`json.edhrec.com` endpoints are real — I confirmed
`https://json.edhrec.com/pages/commanders/atraxa-praetors-voice.json` returns HTTP 200 today — but
**an endpoint answering is not permission**, and this is precisely the case the owner asked me to
be careful and honest about.

EDHREC's Terms of Use (<https://edhrec.com/terms>, effective 6 August 2024, operator **Space Cow
Media**), quoted verbatim:

> Company grants you a non-transferable, non-exclusive, revocable, limited license to access the
> Site solely for your own **personal, noncommercial use**.
>
> Certain Restrictions. […] (a) you shall not sell, rent, lease, transfer, assign, distribute,
> host, or otherwise **commercially exploit** the Site; […] **(c) you shall not access the Site in
> order to build a similar or competitive website**; and (d) […] no part of the Site may be
> copied, reproduced, distributed, republished, **downloaded**, displayed, posted or transmitted
> in any form or by any means […]

and in the Acceptable Use Policy:

> you agree not to: […] use software or automated agents or scripts […] **to generate automated
> searches, requests, or queries to the Site.**

**Verdict: four separate clauses each independently prohibit what we would be doing.** We are
commercial (a). A deck builder with a power score is at minimum arguably "similar or competitive"
(c). Bulk ingestion is downloading and republishing (d). Any sync job is automated queries (AUP).
Their `robots.txt` is permissive, but robots.txt is a crawler-indexing convention, not a licence,
and it does not override the ToS.

**Recommendation: DO NOT SCRAPE EDHREC. Not "be polite about it" — do not do it.** For a
commercial product this is a live legal and reputational risk, and EDHREC is the single most
visible site in the Commander ecosystem; being caught scraping it is not a survivable look.

**The legitimate route: ask.** Space Cow Media runs EDHREC, **Archidekt**, **Commander Spellbook**
and Commander's Herald — and Commander Spellbook is already licensed out to power EDHREC's own
combo feature, so they demonstrably do data partnerships. A commercial data licence request is a
normal business conversation and costs one email. **Recommendation: INVESTIGATE — send that email.
It is the highest-value single action available for goal 2, and it is free.**

### 2.2 Scryfall `edhrec_rank`, `penny_rank`, `game_changer` — **USE. We already receive these and throw them away.**

This is the cheapest win in the document. All three are confirmed live on the Scryfall card object
today (`GET /cards/named?exact=Humility` returns `edhrec_rank: 11538`, `game_changer: true`). We
already pull the nightly bulk. `src/lib/cards/local-filter.ts:126` maps `edhrecRank` — and then it
is used for filtering only. It is **not** in the power score.

| Field | What it is | Coverage |
|---|---|---|
| `edhrec_rank` | EDHREC's overall popularity rank across Commander decklists. Nullable. | Most Commander-relevant cards. |
| `penny_rank` | Penny Dreadful popularity rank. Nullable. | Sparse. Of little use to us. |
| `game_changer` | Boolean. On the official WotC Commander **Game Changer** list. | Confirmed **53 cards** today via `is:gamechanger` on the Scryfall search API. |

**What this unlocks, and its honest limit.** `edhrec_rank` is a *global popularity rank*, not a
per-commander inclusion rate and not a synergy score. EDHREC's synergy is defined in their own FAQ
as `(% of decks for this commander) − (% of decks for this colour identity)` — a two-term
calculation we cannot reproduce from a single global rank. So:

- ✅ `edhrec_rank` gives us a **staple-ness** signal: is this card played, at all, by anyone. That
  alone materially improves the power score, because "this deck runs 40 cards nobody plays" is
  real information we currently do not use.
- ❌ It does **not** give us per-commander inclusion or synergy. Do not claim it does.

**`game_changer` is the important one and it is free.** WotC's official Commander Bracket system
is defined in terms of Game Changer count (brackets 1–2: zero; bracket 3: up to three; 4–5:
unlimited). We currently compute `gameChangers()` in `subscores.ts` from **hand-written
catalogues** (`COMPACT_COMBOS` plus heuristics). Scryfall hands us the official 53-card list,
maintained by Wizards, synced nightly, for free. **Replacing our heuristic with the official flag
makes our bracket calls authoritative instead of approximate.**

**Effort: under a day for all three. Value: high. This should ship this week.**

### 2.3 Commander Spellbook — **USE. The biggest deck-building win available, and it is MIT.**

| | |
|---|---|
| **What it is** | The combo database and search engine for Commander. An editor-authored combo graph from which the backend *generates* every concrete card combination ("variant") that achieves a result. |
| **Licence** | **MIT.** Verified: `github.com/SpaceCowMedia/commander-spellbook-backend`, SPDX `MIT`, last push 2026-08-18. Their About page: *"The source code for the website and the backend server are completely free and open source under the MIT license."* |
| **REST API** | `https://backend.commanderspellbook.com`. Confirmed working **unauthenticated** today: `GET /variants/?limit=1` returned variant data; `POST /find-my-combos/` with a commander plus a main-deck list returned the matching combos for that colour identity. Django REST Framework, OpenAPI schema published, generated Python and TypeScript SDKs on PyPI / npm. |
| **Bulk** | `https://json.commanderspellbook.com/variants.json` — confirmed HTTP 200, `application/json`, **621,106,592 bytes** (621 MB uncompressed). |
| **Cost** | Free. |
| **Rate limits** | None published. Their dev docs are contributor-facing. Be conservative and cache. |

**What it unlocks for us.** `POST /find-my-combos/` takes a decklist and returns the combos in it,
filtered to the deck's colour identity. That is, precisely, the feature our power score is
currently faking with 18 hardcoded pairs.

Concretely, `comboPairs()` in `src/engine/power/subscores.ts` does a name-set intersection against
`TWO_CARD_COMBOS` — 18 entries. Commander Spellbook's generated variant set is orders of magnitude
larger, includes 3+ card lines, and carries prerequisites, steps and produced results. **This is
the single change that would most narrow the gap between our power score and edhpowerlevel's**,
because combo density is what actually separates bracket 3 from bracket 5.

**⚠️ Two honest caveats before adopting.**
1. **MIT covers the code. The data licence is not separately stated.** I looked:
   `commanderspellbook.com/terms` returns 404, as does `/privacy/`. So there is no site ToS
   contradicting the MIT statement — but there is also no explicit grant on the *combo data* as
   distinct from the software. And `backend.commanderspellbook.com/robots.txt` is
   `User-Agent: * / Disallow: /`, which is a crawler directive rather than an API prohibition, but
   it is a signal.
2. **Same owner as EDHREC** (Space Cow Media). Fold this into the same email as §2.1.

**Recommendation: USE — after one email confirming commercial use of the combo data.** Then mirror
the bulk file nightly into our own table rather than calling their API per deck; that is kinder to
them, faster for us, and works offline. Credit them visibly.

**Effort: 3–4 days. Value: the highest single item for goal 2.**

### 2.4 Archidekt — **⚠️ CONFLICTING SIGNALS. DO NOT USE WITHOUT WRITTEN PERMISSION.**

- **Is there an API?** Sort of. There is no official documentation. Their staff have said in their
  own forums that they do not document it because it changes, but that *"our API is open and
  public as far as reading is concerned"* and that users *"might hit the rate limiter"*. I
  confirmed `https://archidekt.com/api/decks/1/` returns HTTP 200 today. Community wrappers
  (e.g. `pyrchidekt`) exist.
- **Their Terms of Use** (<https://archidekt.com/terms>, effective 7 September 2018, **Archidekt
  LLC**) are the **same boilerplate as EDHREC's, clause for clause**: *"personal, noncommercial
  use"*; *"(c) you shall not access the Site in order to build a similar or competitive
  website"*; and the same AUP ban on *"automated searches, requests, or queries to the Site"*.

**A forum post is not a licence, and it does not amend the ToS.** For a hobby script the informal
permission is probably fine. For a commercial competitor it is not.

**Recommendation: INVESTIGATE — same email as §2.1 and §2.3, since Space Cow Media is behind
Archidekt too.** With written permission this is a real source of Commander decklists. Without it,
do not build on it.

### 2.5 Moxfield — **INVESTIGATE. There is a legitimate, documented route: ask for access.**

- **No public API.** Confirmed: no published developer docs. `api2.moxfield.com/v3/decks/all`
  returned HTTP 404 to me today.
- Moxfield restricted API access after abuse and now **whitelists by User-Agent on request**.
  Their public statement: *"If you were using our API for a legitimate reason and it's no longer
  working, please reach out to us on Discord and establish a relationship with us so we can make
  it right. […] We just need to filter out the baddies."* Access requests go via
  `support@moxfield.com` or their Discord; `github.com/moxfield/moxfield-public` is their public
  issue tracker.
- Their infrastructure sits behind Cloudflare, and there are open issues where whitelisted agents
  still hit challenge pages. Expect friction even after approval.

**Why it matters.** EDHREC's own FAQ states: *"EDHREC collects deck data from Archidekt, Moxfield,
and Scryfall."* Moxfield is therefore one of the two upstream sources of the inclusion data we
lack. Sanctioned access to Moxfield is the closest legitimate substitute for scraping EDHREC,
because it is the same underlying decks one level upstream.

**Recommendation: INVESTIGATE — apply properly, with a real description of DeckMatrix, and expect
a conversation.** Do **not** reverse-engineer the private endpoints in the meantime. That is
exactly the behaviour that caused them to lock it down, and being one of "the baddies" forecloses
the legitimate route permanently.

### 2.6 MTGGoldfish — **DO NOT USE.**

- **No public API.** None documented, none found.
- Terms of Use (<https://www.mtggoldfish.com/policies/terms-of-use>, "Updated Mar. 17, 2016,
  Version 1.1") are consumer-account terms — they do not contain an explicit anti-scraping clause,
  which I note for accuracy rather than as encouragement.
- Their `robots.txt` is a **Cloudflare Content Signals** policy: `Content-Signal:
  search=yes,ai-train=no,use=reference`, with the file explicitly stating *"As a condition of
  accessing this website, you agree to abide by the following content signals"* and asserting
  these as express reservations of rights under Article 4 of EU Directive 2019/790. They also run
  Cloudflare bot protection.
- Their data is Constructed-format metagame, not Commander inclusion rates. It is not even the
  data we need.

**Recommendation: DO NOT USE.** Low value, non-trivial risk, explicit reservation of rights.

### 2.7 TopDeck.gg — **USE. Free, official, documented, attribution-only. Genuinely surprising find.**

| | |
|---|---|
| **What it is** | Tournament platform. Official v2 REST API serving tournaments, standings, players and **decklists**. |
| **Access** | `https://topdeck.gg/api/v2/...`, `Authorization: <API key>` header. **Keys are free** from their developer portal. |
| **Cost** | Free. Their docs: *"The TopDeck.gg API is free to use."* |
| **Rate limits** | *"Most endpoints allow 100 requests per minute. Heavier endpoints like bulk tournament queries have lower limits."* 429 on overage; contact them for more. |
| **Terms** | **Attribution required**, explicitly: *"Any project using the API must include a visible credit and link back to TopDeck.gg."* They supply the exact HTML snippet. *"By using the API, you agree to these requirements."* No non-commercial clause. No competitive-use clause. |
| **Data** | `POST /v2/tournaments` filters by `game` + `format` + date range or participant count; `columns` can include `decklist`, and *"Including `decklist` […] also returns `deckObj` when structured deck data is available."* Plus standings, win rates, rounds and tables. |

**What it unlocks for us.** **Real, outcome-labelled decklists that we are explicitly permitted to
use.** This is qualitatively better than inclusion counts for one purpose: TopDeck decks come with
*results*. Inclusion rate tells you what people play; standings tell you what wins.

That is the raw material for building **our own** inclusion and win-correlation statistics, on
data we hold under clear terms — rather than borrowing a number from a site whose terms forbid it.
It skews competitive (cEDH-weighted), so it will not describe a casual bracket-2 pod. But for
calibrating the top of the power scale — exactly where our score currently disagrees most with
edhpowerlevel — it is the right corpus.

**Recommendation: USE. Get a key today.** It costs one form and a footer credit.

**Effort: 2–3 days to ingest, 1–2 weeks to derive statistics worth trusting. Value: high, and
uniquely low-risk.**

### 2.8 Spicerack.gg — **INVESTIGATE.**

Public decklist export at `GET https://api.spicerack.gg/api/export-decklists/`, documented at
<https://docs.spicerack.gg/api-reference/public-decklist-database>. Parameters: `num_days`
(default 14), `event_format`, `organization_id`, `decklist_as_text`. The format enum includes
**`COMMANDER2`**, `DUEL`, `PAUPER_COMMANDER`, `PREDH` and `OATHBREAKER`. Returns tournament
objects with standings, Swiss/bracket records, and a `decklist` field that is typically a Moxfield
URL. Store-level Friday-night-Magic scale rather than large events.

**Recommendation: INVESTIGATE.** Free and documented, but I did not find explicit terms of use for
the API, and the decklists are often *links* rather than contents — which pushes you back to
Moxfield. Second priority after TopDeck.gg.

### 2.9 17Lands — **DO NOT USE (for our goals). Noting it so it is not re-researched.**

Public datasets at <https://www.17lands.com/public_datasets>, released under **CC BY 4.0** — a
genuinely permissive licence, and rare in this space. But the data is **Limited only** (draft,
sealed, premier/traditional events on Arena): pick orders, game-in-hand win rates. There is no
Commander data, and Commander is our format.

**Recommendation: DO NOT USE now.** Revisit only if DeckMatrix ever ships a draft feature, where
it would immediately become the best source available.

---

## 3. Pricing

### 3.1 What we use today: Scryfall — **KEEP.**

Confirmed live on the card object: `prices: {usd, usd_foil, usd_etched, eur, eur_foil, tix}`, plus
`purchase_uris` for tcgplayer / cardmarket / cardhoarder and `related_uris` including `edhrec`.
Our `supabase/functions/daily-price-capture` refreshes `cards.prices` nightly via the set-based
`capture_daily_prices()` RPC; the file header records 33,903 of 34,088 rows touched.

Scryfall's own stated limits, verbatim, which we should be showing users:

> Card objects in bulk data include price information, but **prices should be considered
> dangerously stale after 24 hours**. Only use bulk price information to track trends or provide a
> general estimate of card value. **Prices are not updated frequently enough to power a storefront
> or sales system.** You consume price information at your own risk.

and in the site footer:

> Card prices and promotional offers represent daily estimates and/or market values provided by
> our affiliates. **Absolutely no guarantee is made for any price information.**

**⚠️ FLAG for the marketplace.** Scryfall says in terms this direct that their prices must not
power a storefront. If DeckMatrix's marketplace sets, suggests, or settles prices from
`cards.prices`, that is outside the stated use. Collection *valuation* and trend display are
explicitly fine. **Recommendation: keep Scryfall for valuation and trends; label prices as daily
estimates with their date; never let a Scryfall price be the transacting price in the
marketplace.**

### 3.2 MTGJSON `AllPricesToday` — **USE. It gives us buylist, which Scryfall does not.**

Downloaded and inspected 2026-08-19: `AllPricesToday.json.gz`, **5,493,415 bytes**, meta
`5.3.0+20260818`, **111,241 card uuids**. Structure per card is
`paper → provider → {retail, buylist} → {normal, foil} → {date: price}` with an explicit
`currency`.

**Providers present today: `tcgplayer` (USD), `cardmarket` (EUR), `cardkingdom` (USD),
`manapool` (USD).** `AllPrices.json` carries the same with **90 days of history**.

**What this unlocks that Scryfall cannot.**
- **Buylist prices.** Card Kingdom buylist is present. Scryfall has no buylist at all. Buylist is
  what a shop will actually *pay* — the honest floor of a collection's value, and the number a
  user selling cards actually cares about. Showing retail-only overstates collection value, which
  is the most common complaint about collection trackers.
- **Four providers with explicit currency**, versus Scryfall's two currencies with the source
  unstated.
- **90 days of history for free**, which is a price-trend chart we currently have to accumulate
  ourselves over 90 days of running.

**⚠️ Caution, and it is a real one.** MTGJSON's site licence is MIT, but the TCGplayer and
Cardmarket figures inside it originate with those companies under partner arrangements MTGJSON has
and we do not. TCGplayer's API Terms (§3.3) explicitly prohibit obtaining their pricing data *from
a third party*. Whether an MIT-licensed aggregation cures that is not a question I can answer, and
I will not pretend otherwise.

**Recommendation: USE Card Kingdom buylist and ManaPool immediately — those are clean additions.
Treat the TCGplayer and Cardmarket columns inside MTGJSON as INVESTIGATE, and raise them with a
lawyer alongside §0.1.**

### 3.3 TCGplayer official API — **⚠️ DO NOT PURSUE. Their terms prohibit our product.**

| | |
|---|---|
| **Access** | Application-gated. Submit organisation, reason, and the specific content sought. *"TCGplayer has sole discretion to grant or deny any request."* Reporting from 2026 indicates the public developer application is effectively closed to new applicants; eBay acquired TCGplayer in 2022. |
| **Current endpoints** | `api.tcgplayer.com` — Catalog, Pricing, Inventory, Stores, Orders. Docs at `docs.tcgplayer.com`. The old **Partner API was deprecated from 14 August 2023**. |
| **Terms** | <https://help.tcgplayer.com/hc/en-us/articles/360061115874>, "Updated: June 8, 2022". |

Quoting the Restricted Activities section verbatim, because these clauses are the answer:

> The API is provided solely for the purpose of **(a) academic research or (b) promoting and
> facilitating access to and use of the Site.** […] you may not:
> - **Develop, promote, or enable any product, application, or service similar to or that
>   competes with TCGplayer's current or planned offerings, or the Site itself.**
> - **Combine TCGplayer's pricing data with your own or a third party's pricing data.**
> - Rebrand TCG Content, or otherwise use TCG Content under your or another party's brand.
> - **Distribute TCG Content or otherwise make it available to your end users or third parties
>   […] for commercial or competitive purposes.**
> - Collect content or information (including pricing information) from the Site using automated
>   means […] other than through API access as provided by these API Terms.
> - **Obtain content or information (including pricing information) from a third-party that was
>   collected from the Site using our API or otherwise using automated means.**
> - Access or collect content or information using TCG Content in order to build, enhance,
>   improve or promote a similar or competitive website, product, or service.

**Verdict.** DeckMatrix has a **marketplace**. TCGplayer is a marketplace. A card marketplace is
"similar to or competes with TCGplayer's current or planned offerings" on any plain reading. And
our whole design intent — show TCGplayer alongside Cardmarket alongside Card Kingdom — is
precisely the prohibited "combine TCGplayer's pricing data with […] a third party's pricing data".

**Recommendation: DO NOT PURSUE.** Not because access is hard, but because the terms forbid the
product. **And note the knock-on:** the second-to-last bullet is why §3.2's TCGplayer column inside
MTGJSON needs a lawyer's eye rather than an engineer's.

The one thing worth keeping is their **affiliate programme**, which is a different agreement
entirely and is designed for exactly what we want: send buyers to TCGplayer, earn commission,
display their prices under affiliate terms. **Recommendation: INVESTIGATE the affiliate route.**
That is how MTGGoldfish operates ("we may earn a commission"), and it inverts the relationship
from competitor to referrer.

### 3.4 Cardmarket official API — **NOT AVAILABLE. Closed to new applicants.**

Their help page (<https://help.cardmarket.com/en/cardmarket-api>, fetched 2026-08-19) states
plainly:

> The API provides an interface for users to create their own apps for using Cardmarket.
> **Currently, we are not accepting applications for access to the Cardmarket API.**

Also relevant: existing users must migrate to `apiv2.cardmarket.com`, with API 1.0/1.1 sunset;
credential sharing with third-party software is explicitly forbidden; professional accounts get
100,000 requests/day of which 30,000 may hit the marketplace group.

**Recommendation: DO NOT PURSUE (there is nothing to pursue).** Get Cardmarket EUR pricing via
Scryfall (`eur`, `eur_foil`) and MTGJSON, subject to §3.2's caveat. Re-check in 6–12 months.

---

## 4. Ranking: value per unit of effort, against the three goals in order

Effort is engineer-days for an experienced dev in this codebase. "Value" is what actually changes
for a user.

### Goal 1 — engine card coverage (the main goal)

| # | Source | Effort | Value | Verdict |
|---|---|---|---|---|
| 1 | **Comprehensive Rules** (1.1) | **0.5 d** | Foundational. Every primitive we write is currently being judged from memory. | **DO IT FIRST.** |
| 2 | **Scryfall rulings bulk** (1.2) | **1–2 d** | Edge-case test corpus, a principled `needsManual` prior, and real player value on the card page. | **DO IT SECOND.** |
| 3 | **Scryfall Oracle Tags** (1.3) | 2–3 d | A ranked list of our regex tagger's bugs, free. Indirect for the engine, direct for §2. | **DO IT THIRD.** |
| 4 | **MTGJSON `leadershipSkills`, `hasAlternativeDeckLimit`** (1.4) | 1 d | Removes a class of deck-legality bugs. Not coverage, but correctness. | **DO IT.** |
| 5 | **XMage extractor as planning instrument** (1.5) | **10 d** | The ranked, dependency-ordered primitive list with a card count on every line. Turns the roadmap from guesswork into a checklist. | **DO IT — already approved.** |
| 6 | **XMage primitive grind** (1.5) | **4–15 person-months** | 84 → ~11,000 cards automated (~33%). **The only thing on this list that moves the AUTOMATED number materially.** | **DO IT, sequenced, after 5.** |

**The honest summary for goal 1: items 1–4 cost about a week and buy correctness, not coverage.
Item 6 is the coverage, and it is months. There is no data source that shortcuts item 6.** The
value of items 1–5 is that they stop item 6 from being done blind.

### Goal 2 — deck building quality and the power score data gap

| # | Source | Effort | Value | Verdict |
|---|---|---|---|---|
| 1 | **Scryfall `game_changer`** (2.2) | **0.5 d** | The official 53-card WotC list replaces our hand-written heuristic. Makes bracket calls authoritative. **We already download it.** | **SHIP THIS WEEK.** |
| 2 | **Scryfall `edhrec_rank`** (2.2) | **0.5 d** | Staple-ness signal into the power score. Already downloaded, currently discarded. Not synergy — do not claim it is. | **SHIP THIS WEEK.** |
| 3 | **Commander Spellbook** (2.3) | 3–4 d | Replaces **18 hardcoded combos** with a generated variant database. The largest single improvement available to the power score. MIT. | **DO IT** (after one confirming email). |
| 4 | **Email Space Cow Media** (2.1 / 2.3 / 2.4) | **1 hour** | Could legitimately unlock EDHREC inclusion + synergy, Commander Spellbook, and Archidekt decks in one conversation. Highest expected value per hour in the document. | **DO IT TODAY.** |
| 5 | **TopDeck.gg** (2.7) | 2–3 d + 1–2 w analysis | Outcome-labelled tournament decklists under clear, attribution-only terms. Lets us build **our own** statistics. | **DO IT.** |
| 6 | **Scryfall Oracle Tags** (1.3) | 2–3 d | Richer role vocabulary for the `synergy` and `consistency` subscores. | **DO IT.** |
| 7 | **Moxfield access request** (2.5) | 1 h + wait | Upstream of EDHREC's own data. A sanctioned route exists. | **APPLY.** |
| 8 | **Spicerack.gg** (2.8) | 2 d | More Commander events; terms unverified; decklists often just links. | **INVESTIGATE.** |
| — | ~~EDHREC scraping~~ (2.1) | — | — | **🚫 PROHIBITED BY THEIR TERMS.** |
| — | ~~Archidekt without permission~~ (2.4) | — | — | **🚫 PROHIBITED BY THEIR TERMS.** |
| — | ~~MTGGoldfish~~ (2.6) | — | Wrong data, express reservation of rights. | **🚫 DO NOT.** |

### Goal 3 — collection and marketplace accuracy

| # | Source | Effort | Value | Verdict |
|---|---|---|---|---|
| 1 | **MTGJSON `AllPricesToday`** — Card Kingdom **buylist** + ManaPool (3.2) | 2 d | Buylist is the number a selling user actually wants. Scryfall has none. Fixes systematic over-valuation of collections. | **DO IT.** |
| 2 | **MTGJSON `identifiers`** (1.4) | 1 d | Card Kingdom ids, TCGplayer SKU-level ids. Deep-links and future affiliate plumbing. | **DO IT.** |
| 3 | **Scryfall prices** (3.1) | 0 d (have it) | Keep for valuation and trends. **Label as daily estimates with a date; never transact on them.** | **KEEP + LABEL.** |
| 4 | **MTGJSON `AllPrices`** 90-day history (3.2) | 1 d | Instant price-trend charts instead of waiting 90 days to accumulate our own. | **DO IT.** |
| 5 | **TCGplayer affiliate programme** (3.3) | 1 h + review | A referrer relationship instead of a competitor one. The route MTGGoldfish uses. | **INVESTIGATE.** |
| — | ~~TCGplayer API~~ (3.3) | — | Terms forbid competing marketplaces and forbid combining their prices with others'. | **🚫 DO NOT PURSUE.** |
| — | ~~Cardmarket API~~ (3.4) | — | Not accepting applications. | **🚫 UNAVAILABLE.** |

---

## 5. The prominent flags, gathered in one place

For the owner, since these are the ones that can hurt a commercial product.

| # | Flag | Severity | Action |
|---|---|---|---|
| 1 | **WotC Fan Content Policy says fan content must be FREE** — no payments, subscriptions or email gates in front of Wizards' IP (§0.1). | **HIGH — affects the business model itself** | Lawyer, before the first paid tier. Interim posture: card data free and anonymous; charge for our engine, score, collection and marketplace. |
| 2 | **Scryfall forbids paywalling their data** and forbids requiring subscriptions or email registration for card data (§0.2). | **HIGH** | Same interim posture. This one is unambiguous and we can comply by design. |
| 3 | **Scryfall forbids blurring card images** — and `CLAUDE.md` has an approved blurred-art pattern (§0.2). | **MEDIUM — but it is an approved pattern already shipping** | **Ask Scryfall directly.** Free to ask; costs API access to guess wrong. |
| 4 | **EDHREC's terms prohibit commercial use, competitive use, downloading, and automated queries** — four independent clauses (§2.1). | **HIGH if we ever scrape them** | Do not scrape. Email for a licence instead. |
| 5 | **Archidekt's terms are identical boilerplate**, despite staff forum posts saying the API is open (§2.4). | **MEDIUM** | Written permission or nothing. |
| 6 | **TCGplayer's API terms prohibit competing marketplaces and prohibit combining their pricing with others'** — and prohibit obtaining their prices via a third party, which reaches into MTGJSON (§3.3, §3.2). | **MEDIUM–HIGH for the marketplace** | Do not pursue the API. Pursue the affiliate programme. Ask a lawyer about the MTGJSON TCGplayer column. |
| 7 | **Scryfall states its prices must not power a storefront or sales system** (§3.1). | **MEDIUM** | Valuation and trends only. Never the transacting price. |
| 8 | **Cockatrice is GPL-2.0** — the same trap as Forge, and it shows up constantly in MTG data searches (§1.6). | **HIGH if contaminated** | Add to `THIRD-PARTY-NOTICES.md` as a named do-not-read repo. |
| 9 | **Scryfall requires a real `User-Agent` and an `Accept` header** on every request; 429 = 30 s lockout, repeat = ban (§1.2). | **LOW but trivially avoidable** | Audit our sync jobs for a proper `DeckMatrix/x.y` User-Agent. |

---

## 6. What I would do first, if it were one week

1. **Send one email to Space Cow Media** asking about commercial licensing for EDHREC inclusion
   and synergy data, Commander Spellbook combo data, and Archidekt decklists. One hour. It is the
   single highest-expected-value action available for goal 2, and everything else in §2 is a
   workaround for not having asked.
2. **Ask Scryfall about the blurred-art pattern.** One hour. We are already shipping it.
3. **Ship `game_changer` and `edhrec_rank` into the power score.** One day. We already download
   both and throw them away, and `game_changer` makes our bracket calls official rather than
   heuristic.
4. **Download the Comprehensive Rules into `docs/reference/`.** Half a day. Stop writing a rules
   engine without the rulebook.
5. **Ingest the Scryfall rulings bulk.** Two days. 5.3 MB that turns into an edge-case test corpus
   and a principled manual-marker prior.
6. **Get a TopDeck.gg API key.** One hour, then two days of ingest. The only decklist source in
   this document whose terms unambiguously permit what we want to do.

That week costs nothing, breaches nothing, and moves goals 2 and 3 measurably. Goal 1 still needs
the XMage primitive grind, and nothing found here changes that.

---

## Appendix: every source, one line each

| Source | Real? | Terms permit commercial use? | Verdict |
|---|---|---|---|
| WotC Comprehensive Rules | ✅ verified 2026-08-19, effective 2026-08-07 | Consultation only; no redistribution grant | **USE** (do not ship the file) |
| Scryfall API + bulk | ✅ verified | Yes, if not paywalled | **USE** (already do) |
| Scryfall rulings bulk | ✅ 5,341,262 B, daily | Same as above | **USE — new** |
| Scryfall Oracle / Art Tags bulk | ✅ 5,850,723 / 12,536,373 B, daily | Same as above | **USE — new** |
| Scryfall `edhrec_rank` / `game_changer` | ✅ verified live | Same as above | **USE — we discard these today** |
| MTGJSON v5.3.0+20260818 | ✅ verified | **MIT** | **USE, selectively** |
| XMage `magefree/mage` | ✅ MIT, pushed 2026-08-17 | Yes, with attribution | **PROCEED** (already approved) |
| Commander Spellbook | ✅ MIT, API + 621 MB bulk verified live | Code MIT; **data licence not separately stated** | **USE after confirming** |
| TopDeck.gg API v2 | ✅ verified | **Yes — free, attribution required** | **USE** |
| Spicerack.gg | ✅ documented | Terms not found | **INVESTIGATE** |
| Moxfield | ✅ site; **private API, whitelist on request** | Only with granted access | **APPLY** |
| Archidekt | ✅ API responds | **ToS: personal, noncommercial, no automated queries** | **PERMISSION FIRST** |
| EDHREC | ✅ `json.edhrec.com` responds | **🚫 No — four prohibiting clauses** | **DO NOT USE / licence it** |
| MTGGoldfish | ✅ site, no API | Express reservation of rights | **🚫 DO NOT** |
| 17Lands | ✅ CC BY 4.0 | Yes | **Not our format — skip** |
| TCGplayer API | ✅ exists, gated | **🚫 Prohibits competing marketplaces** | **🚫 DO NOT PURSUE** (affiliate instead) |
| Cardmarket API | ✅ exists | **Not accepting applications** | **🚫 UNAVAILABLE** |
| Forge | ✅ | **GPL-3.0** | **🚫 OFF LIMITS — do not read** |
| Cockatrice | ✅ | **GPL-2.0** | **🚫 OFF LIMITS — do not read** |

*All URLs, sizes, versions and quotations in this document were fetched and measured on
2026-08-19. Terms change; re-verify before acting on anything in §0, §2.1, §2.4 or §3.3.*
