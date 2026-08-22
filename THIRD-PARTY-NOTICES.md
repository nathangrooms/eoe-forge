# Third-party notices

DeckMatrix bundles and derives from third-party work. This file records what, under which
licence, and — where the obligation is attribution — discharges it.

It also records, deliberately and in writing, one thing DeckMatrix does **not** derive from.
See [Card-Forge/forge is not used](#card-forgeforge-is-not-used-gpl-30) below.

---

## XMage (magefree/mage) — MIT

**Used as:** an architectural source for the rules core in `src/lib/game/`.

DeckMatrix's rules engine is written from scratch in TypeScript. No XMage source file has been
copied, machine-translated, or vendored. What is derived is XMage's **model** — how a game of
Magic decomposes into parts, and what those parts are called. That decomposition is the hard,
well-earned thing in XMage, and it is genuinely load-bearing here, so it is attributed rather
than quietly absorbed.

### Licence

```
MIT License

Copyright (c) 2010 betasteward@gmail.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Upstream: <https://github.com/magefree/mage> · Licence file: `LICENSE.txt` in that repository.

### Which parts of `src/lib/game/` are architecturally derived

| DeckMatrix file | XMage counterpart (concept, not code) | What was taken |
|---|---|---|
| `rules.ts` | `mage.game.GameImpl`, `mage.game.GameState`, `mage.game.turn.*` | Turn → phase → step decomposition; the idea that the game object owns a single authoritative state and that every mutation goes through one entry point; state-based actions run after every action rather than on a timer |
| `rules.ts` (`checkStateBasedActions`) | `GameImpl.checkStateBasedActions` | State-based actions as a separate sweep with its own loss/win detection, applied post-action and before triggers |
| `combat.ts` | `mage.game.combat.Combat`, `CombatGroup` | Attacker/blocker declaration as recorded state, damage assignment as a separate resolution policy, first-strike as a genuine second damage step |
| `keywords.ts` | `mage.abilities.keyword.*` | Keyword abilities as a closed, enumerable set with fixed meanings, separable from card-specific text; protection as a parameterised keyword |
| `effects.ts` | `mage.abilities.TriggeredAbility`, `mage.abilities.effects.*` | Triggered abilities as (timing condition → effect list); effects that emit changes rather than mutate directly |
| `types.ts` | `mage.game.GameState`, `mage.cards.Card`, `mage.players.Player` | The state's shape: one flat card registry, zones as ordered id lists, players holding zone references rather than card objects |
| `mana.ts` | `mage.abilities.mana.*`, `mage.ManaCost` | Cost as a parsed symbol list, payment as a separate planning step over available sources |
| `layers.ts` | `mage.abilities.effects.ContinuousEffect`, `ContinuousEffects.apply(Game)`, `mage.constants.Layer`, `mage.constants.SubLayer`, `mage.constants.DependencyType` | The CR 613 layer pipeline as an explicit ordered walk; one effect declaring several layers rather than the layer being inferred from which fields it sets; timestamp ordering within a layer; dependency declared as tag sets (`getDependencyTypes`/`getDependedToTypes` → `provides`/`dependsOn`) because 613.8 dependency is not inferable in general |
| `manual.ts` | *(none — DeckMatrix-specific)* | The manual-resolution path has no XMage counterpart; XMage scripts every card instead |

Files added by the current overhaul — a continuous-effects **layer system**, an explicit
**stack**, **replacement effects**, a dedicated **state-based-actions** module and a
**triggered-ability** collector — derive from the same source: `mage.abilities.effects.ContinuousEffects`
and its layer ordering, `mage.game.stack.SpellStack`, `mage.abilities.effects.ReplacementEffect`,
and `mage.abilities.TriggeredAbilities` respectively. Where those files exist in
`src/lib/game/`, this table applies to them on the same terms.

### What is taken from `Mage.Sets/`, corrected 22 August 2026

This section used to say XMage's individually-scripted card classes "were not ported and will
not be". That is no longer the decision, so it is corrected here rather than left to mislead.

DeckMatrix now READS those 32,168 card classes and extracts, per card, which effects it builds
and **with which arguments**: `Armageddon` yields `DestroyAllEffect(StaticFilters.FILTER_LANDS)`
and `WrathOfGod` yields `DestroyAllEffect(StaticFilters.FILTER_PERMANENT_CREATURES, noRegen)`.
Ported primitives live under `src/lib/cards/xmage/`.

This is a derivative work of XMage and is used under its MIT licence, with the copyright notice
above retained. Nothing from the XMage clone is vendored into this repository; it is read in
place from `$XMAGE_ROOT`.

Scryfall remains the source of printed truth, names, costs, type lines, oracle text, legality
and prices. XMage is the source of BEHAVIOUR. Where the two disagree the oracle text wins, and
the disagreement is recorded.

**Forge is still excluded and always will be.** It is GPL-3.0, this app ships its engine to the
browser, and that is distribution.

### Where the port diverges, and why

XMage is mutable-object Java: live `Game` instances, inheritance hierarchies, effects that hold
references and mutate the objects they are handed. That model does not survive contact with
DeckMatrix's hard requirement, which is that a game **is** its action log and any client
replaying that log reaches byte-identical state.

So the architecture is ported and the mechanism is not:

- no class instances in state — `GameState` is plain JSON, `structuredClone`-safe;
- no inheritance — behaviour is data plus pure functions over it;
- no clock — timestamps arrive on `action.at`, stamped at the React boundary, never read inside
  `src/lib/game/`;
- no ambient randomness — shuffles run through the seeded mulberry32 RNG in `state.rng`;
- effects return `GameAction[]` for the reducer to apply, rather than mutating state in place.

Where XMage's design would have broken determinism or serialisability, the design was changed.
That is a requirement of the product, not a stylistic preference, and is recorded in
`docs/overhaul/RULES-ENGINE-DIRECTION.md`.

---

## Card-Forge/forge is not used (GPL-3.0)

**Nothing in this repository derives from [Card-Forge/forge](https://github.com/Card-Forge/forge).**

This is stated explicitly because it matters and because a future contributor should be able to
see that the line was held on purpose rather than by accident.

Forge is licensed **GPL-3.0**. Translating GPL-licensed code into another language produces a
derivative work — copyright treats translation of software the way it treats translation of a
book. Porting Forge's engine, or machine-converting its `res/cardsfolder` card scripts into our
DSL, would place DeckMatrix itself under GPL-3.0 with a full source-disclosure obligation. That
is incompatible with the owner's intent to commercialise the product.

Therefore, and permanently:

- no Forge source, in Java or translated to any other language;
- no Forge card scripts, verbatim, edited, or machine-converted;
- no data files extracted from a Forge distribution;
- no Forge-derived ability DSL, keyword table, or effect taxonomy.

### Verification performed

Checked on 2026-08-18 against the working tree:

- Full-text search of `src/`, `docs/`, `scripts/`, `supabase/` and the repository root for
  `forge`, `Card-Forge`, `cardsfolder`, `forge-gui`, `forge-game`, `GPL`, `GPLv3`,
  `GNU General Public`, `LGPL`, `AGPL`. Every hit is one of: prose in
  `docs/overhaul/RULES-ENGINE-DIRECTION.md` and `docs/overhaul/PLAY-MODE-SPEC.md` explaining why
  Forge is excluded; one explanatory comment in `src/lib/game/effects.ts`; the GitHub remote
  name `eoe-forge` in `CLAUDE.md`, which is unrelated; or Magic card names containing the word
  ("Battlefield Forge", "Darksteel Forge", "Forgotten Cave") inside Scryfall-sourced data.
- No `.java` sources, no `res/cardsfolder` tree, no Forge deck (`.dck`) or script (`.txt`) card
  definitions anywhere in the tree.
- Card data throughout is sourced from **Scryfall** (`src/lib/scryfall/`, `scripts/scryfallSync.ts`),
  which is the only card-data origin in this project.
- No GPL-, LGPL- or AGPL-licensed package appears among the 80 direct dependencies in
  `package.json`. (Two transitive **build-time** packages carry an LGPL component — see
  [npm dependencies](#npm-dependencies) — but neither is Forge-related and neither ships in the
  browser bundle.)

Ideas and the rules of Magic are not copyrightable; expression is. Reading Forge to understand a
concept would be lawful, but this project does not do it, because the cheapest way to keep the
line clean is not to approach it. Design questions are answered from XMage or from the Magic
Comprehensive Rules.

### One thing that was corrected, recorded rather than quietly fixed

During the 2026-08-18 review, source comments in the ability-DSL work described Forge's internal
design in specific terms and framed our design as a contrast to it — a header stating Forge had
been "read for architecture", and rationale comments referring to Forge's script tokens and to
how Forge infers CR 613 layers.

No Forge code, script or data was present. But the framing was wrong twice over: the direction
record says design questions are answered from XMage or the Comprehensive Rules and never from
Forge, and a written record inside the repository saying Forge was studied is precisely the
document a GPL claimant would want, whatever the underlying facts. Comments that would be cited
against the project are a liability even when the code they sit above is clean.

Those comments were rewritten so the rationale stands on its own or cites XMage and CR 613
directly. The code was not changed, because the code was not the problem.

Recorded here rather than silently corrected, because a future contributor deciding how careful
to be should be able to see that this was caught, why it mattered, and that the answer was to
restate the reasoning rather than to keep the reference. **A reviewer wanting independent
assurance should read `src/lib/cards/abilities/` on its own merits** — this note reports what
inspection found, and inspection of comments is not the same as proof of provenance.

---

## MTGJSON — decklist data (MIT)

**Used as:** the source of every third-party decklist in `meta_decks` / `meta_deck_cards`,
ingested by the `mtgjson-deck-sync` edge function and the `public.meta_drain_tick` scheduled
path.

MTGJSON publishes a deck index and per-deck files carrying `identifiers.scryfallOracleId` for
every card, which is how these decks join to `cards.oracle_id` with no name matching.

### Licence

```
MIT License

Copyright (c) 2018-present Zach Halpern

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Upstream: <https://mtgjson.com/> · Licence: <https://mtgjson.com/license/>

Commercial use is unrestricted. The obligation is reproducing the notice above, which this
section discharges.

One note recorded rather than glossed: `mtgjson.com/robots.txt` contains
`Disallow: /api/v5/*.json`. That is a search-crawler directive aimed at indexers of
multi-megabyte JSON files, not a restriction on clients downloading the files the project
exists to publish under an explicit MIT grant. Requests are made roughly 150 ms apart under the
User-Agent recorded below.

---

## Commander Spellbook — combo data (MIT)

**Used as:** the source of every combo in `meta_combos` / `meta_combo_cards`, ingested by the
`spellbook-combo-sync` edge function and the `public.meta_drain_tick` scheduled path.

Each combo carries the cards that make it work (by Scryfall oracle id), the colour identity,
the prerequisites, and a structured list of what the combo produces.

### Licence

```
MIT License

Copyright (c) Space Cow Media

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Upstream: <https://commanderspellbook.com/> · Backend:
<https://github.com/SpaceCowMedia/commander-spellbook-backend> · OpenAPI schema:
<https://backend.commanderspellbook.com/schema/swagger/>

**A display obligation we impose on ourselves.** Nothing in the MIT licence requires visible
credit beyond this file, but Commander Spellbook is a small volunteer project whose data does
real work in our product. Wherever a combo is shown, credit Commander Spellbook. The string
lives in `src/lib/meta/types.ts` as `COMBO_ATTRIBUTION` so it cannot drift.

Their `popularity` field is **their** count of decks containing a combo, over **their** corpus.
It is stored verbatim in `meta_combos.popularity` and must always be labelled as theirs (see
`labelComboPopularity`), never merged into a DeckMatrix-computed inclusion rate.

Two things recorded rather than hidden:

- `backend.commanderspellbook.com/robots.txt` returns `Disallow: /`. That is a crawler
  directive on an API host, routine practice to keep search engines out of JSON responses, and
  it would contradict their own published OpenAPI schema and official npm client
  (`@space-cow-media/spellbook-client`, MIT) if read as a restriction on API clients.
- **They enforce a rate limit they do not publish.** Measured 2026-08-19: a burst of 100
  concurrent requests returned HTTP 429 for every one, with no `Retry-After` and no
  `X-RateLimit-*` headers. Ingestion now runs at roughly 10 requests per minute with
  exponential backoff on 429. The absence of a documented limit is not permission to burst.

---

## Sources deliberately NOT used

Recorded in writing, the same way Card-Forge is above, so a future contributor can see the line
was held on purpose rather than by accident. Full clause-by-clause reasoning, with the quoted
terms each verdict rests on, is in `docs/overhaul/DECKLIST-DATA.md`.

| Source | Why not |
|---|---|
| **EDHREC** | Terms grant a licence "solely for your own personal, noncommercial use", forbid accessing the site "in order to build a similar or competitive website", and forbid automated "searches, requests, or queries". DeckMatrix is commercial and names EDHREC as a benchmark. Their internal JSON endpoints answer anyone, which proves nothing about permission. Their own FAQ says they collect deck data from Archidekt, Moxfield and Scryfall, so they do not own the decklists either. |
| **MTGGoldfish** | Terms limit contents to "personal, non-commercial use" and forbid reproduction or derivative works. `robots.txt` additionally disallows `ClaudeBot` and sets `ai-train=no` as an express reservation of rights under EU Directive 2019/790. |
| **MTGTop8** | No terms of service, no `robots.txt`, no API. Absence of a prohibition is not a grant of permission; default copyright applies to their compilation. Also 60-card constructed, so of little use to an EDH power score. |
| **Archidekt** | Staff say on their own forum "you're more than welcome to use our API for whatever you want", but the written terms are the same boilerplate as EDHREC's: "personal, noncommercial use", no "similar or competitive website". A forum post does not amend a contract. **Awaiting written permission before any ingestion.** |
| **Moxfield** | Prohibits scraping; access is granted case by case as a whitelisted custom User-Agent via `support@moxfield.com`. **Awaiting approval.** Their terms page is gated against bots, which was not worked around. |
| **Topdeck.gg** | Terms look workable (free key, attribution required) but require registering for an API key, which nobody has obtained, and their docs do not address commercial use. Not ingested. |
| **Deckstats, Aetherhub, TappedOut** | Behind bot protection. Deliberately defeating bot protection is not something to build into a commercial product, whatever the terms say. |
| **MTGODecklistCache** | Archived, no licence, and itself a scrape of other sites, so it could not grant rights it did not hold. |
| **`Westly/CommanderPrecons`** | **Currently shipped** via `src/data/precon-corpus.ts` and the `fetch-precons` edge function. The repo has **no licence file** (GitHub's API reports `"license": null`) and its README states the data "was sourced from https://www.moxfield.com/users/WizardsOfTheCoast". It is therefore an unlicensed redistribution of a Moxfield scrape, baked into our bundle, under a header comment currently claiming it is "Free, legal". MTGJSON is a clean MIT replacement covering 162 of the same decks plus 20 more. **Flagged for replacement; not removed here, because `fetch-precons` is user-facing and the swap needs the owner's sign-off.** |

---

## Outbound identity

Every request to an external source carries, from `public.meta_user_agent()`:

```
DeckMatrix/1.0 (+https://deckmatrix.com; contact: nathan@pilotdigital.agency)
```

Identifying the client honestly with a contact address is a term of several sources and is what
lets an operator email us rather than silently block us. A generic or spoofed User-Agent is
never sent, and one is never used to get past a bot gate: a site that gates its terms page
against robots has already given its answer.

---

## Scryfall — card data

Card names, oracle text, type lines, mana costs and images are sourced from the
[Scryfall API](https://scryfall.com/docs/api) under Scryfall's terms of use. Scryfall data is
provided free of charge; the card information itself is copyright Wizards of the Coast.

## Wizards of the Coast

Magic: The Gathering is a trademark of Wizards of the Coast LLC. DeckMatrix is unofficial Fan
Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by
Wizards. Portions of the materials used are property of Wizards of the Coast LLC.

## npm dependencies

Direct dependencies (80, audited 2026-08-18): 73 MIT, 5 Apache-2.0, 1 ISC, and GSAP. Across the
full installed tree (568 packages) the distribution is MIT, ISC, Apache-2.0, BSD-2/3-Clause,
BlueOak-1.0.0, Python-2.0, CC-BY-4.0 and MPL-2.0-or-Apache-2.0. Licence texts ship inside
`node_modules/`.

Two items are worth calling out rather than averaging into "permissive":

- **GSAP** (`gsap`, runtime dependency) is not under an OSI licence. It ships under GreenSock's
  "Standard 'no charge' license" (<https://gsap.com/standard-license>), which permits use in a
  site or app the end user is not charged a fee to access. If DeckMatrix ever charges for access
  to a surface that uses GSAP, that licence must be re-read and a GreenSock commercial licence
  bought, or GSAP replaced. Flagged here because the product is intended to be commercialised.
- **`sharp`** (devDependency, used by `scripts/prepare-logo.mjs`) pulls prebuilt binaries
  `@img/sharp-win32-x64` and `@img/sharp-wasm32`, licensed `Apache-2.0 AND LGPL-3.0-or-later`
  (libvips). These are build-time image tooling. They are never imported by application code,
  never bundled by Vite, and do not appear in `dist/`. Using an LGPL binary as a separate tool
  does not make the calling project a derivative work — but it is recorded here so the claim
  "nothing in this repo is copyleft" is never made carelessly.


## Mona Sans — SIL Open Font License 1.1

**Used as:** the application typeface, self-hosted from `public/fonts/`.

Mona Sans is released by GitHub under the SIL OFL 1.1, which permits use,
modification and redistribution including commercially, provided the font itself
is not sold on its own and any derivative keeps the licence. We ship it unmodified
as woff2 subsets.

Self-hosted deliberately rather than loaded from Google's CDN. A third-party font
request exposes every visitor's IP address to that CDN, which is a GDPR problem
for EU users, and it makes first paint depend on somebody else's uptime.
