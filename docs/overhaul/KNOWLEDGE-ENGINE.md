# The card-knowledge engine — direction record

**Status:** Direction · **Date:** 2026-08-19 · **Type:** Document only, no application code changed

**Companions:** `RULES-ENGINE-DECISION.md` (Forge vs XMage vs ours) ·
`XMAGE-EXTRACTION-SPIKE.md` (the 2,558-primitive measurement) ·
`RULES-ENGINE-COVERAGE.md` (what play mode resolves and what it admits) ·
`RULES-ENGINE-DIRECTION.md` (the licence line)

The owner asked:

> "did you fully integrate everything from the mage or forge into play mode? feel like it should
> also maybe become our mtg brain and deck builder - although not sure if it has card knowledge or
> just gameplay? i'd like to rely as little on gemini as I can, especially if we have knowledge to
> build something better - it also has to scale with new cards coming in too. Lots of playstyles
> and cards that do certain actions"

Every number below was measured on 19 Aug 2026 against the live catalogue and the current tree.
Where a number in an existing document turned out to be measured differently, that is said plainly
rather than repeated.

---

## The measurement basis

Nothing here is quoted from another document. The catalogue was pulled through the publishable key
— the same read the browser has — and every figure recomputed:

| | |
|---|---:|
| Rows in `cards` | **34,088** |
| Distinct `oracle_id` | **33,037** |
| Distinct set codes | **305** |
| Rows whose `oracle_text` is null with everything on `faces` | **854** |
| Rows with no rules text anywhere | **351** |

`scripts/measure-ability-coverage.ts` **does not currently run to completion**: it pages at 1,000
rows and the catalogue read fails with Postgres `57014` (statement timeout) at about row 20,000.
Every measurement below was taken by fetching at 500 rows with retries into a local cache and then
calling the real exported functions — `measureCoverage`, `automationFor`, `abilityEngineOwns`,
`deriveCardTags`, `rolesOf` — on all 34,088 rows. No number here is an extrapolation from a sample.

---

## 1. Gameplay and card knowledge are two different systems

**The XMage port gave us gameplay. It gave us essentially no card knowledge, and that was the
correct trade.**

What was ported is the *architecture* in `src/lib/game/`: turn structure, the stack and priority,
state-based actions, the layer system for continuous effects, replacement effects, combat, and the
determinism guarantees around them. That is the part of Magic that is genuinely hard to design and
that decades of XMage edge cases had already solved. It is bounded, it is finite, and it is done.

What was **not** ported is XMage's 32,168 card classes — the part that knows what any specific card
does. `RULES-ENGINE-DIRECTION.md` set that boundary and `XMAGE-EXTRACTION-SPIKE.md` then measured
whether it was the right one. It was, and the reason is one number:

> The 24,435 XMage cards whose *shape* fits our DSL compose **2,558 distinct engine primitives**.
> Implementing the top 300 of them covers 11,424 of those cards. There is no small vocabulary that
> unlocks a useful majority — the tail is very long and very flat.

So an extracted XMage card row is not knowledge. It is a call into functions we would still have to
write, and writing them was sized at 4–15 person-months for roughly a third of the catalogue. The
extraction is the easy tenth. That is why porting the card classes was rejected, and the same
verdict applies to Forge for identical structural reasons plus a licence that ends the conversation
on its own.

**So the honest answer to "did you fully integrate everything from mage into play mode" is: we
integrated the engine, deliberately not the cards, and the cards were never the part that was going
to arrive by porting.**

### What play mode actually resolves today

Measured over all 34,088 rows, not a slice:

| | cards | share |
|---|---:|---:|
| `abilityEngineOwns` — the compiled-ability bridge runs this card's triggers | **906** | **2.66%** |
| `automationFor(...).level === 'automated'` — the older in-engine detector | 283 | 0.83% |
| Either of the two | **949** | **2.78%** |
| `automationFor(...).needsManual` | **32,615** | **95.7%** |

Full `automationFor` distribution over 34,088: `manual` 32,025 · `vanilla` 858 · `partial` 590 ·
`keywords` 332 · `automated` 283. 6,667 triggers detected, 905 of them automated by the old
detector.

**A correction that matters.** `RULES-ENGINE-COVERAGE.md` and `CLAUDE.md` both quote "84 automated,
11,205 manual, of ~12,000". Re-measuring the first 12,000 rows by `id` reproduces that shape almost
exactly — `manual` 11,254 · `vanilla` 296 · `partial` 229 · `keywords` 122 · `automated` 99. **That
figure was measured over a 12,000-row slice of a 34,088-row table, not over the catalogue.** The
denominator in circulation is short by a factor of 2.8. The true current headline is *949 of 34,088
cards, 2.8%* — better than 0.7% sounded, and still under three percent. Quote the new one.

**One thing has not changed.** `automationFor`, `needsManual` and `manualControlsFor` still have
zero importers anywhere in `src/components`, `src/pages` or `src/hooks`. The engine knows which
cards it cannot resolve; nothing on screen says so. That remains the single highest-value UI fix in
this area and it needs no engine work.

---

## 2. Where the real card knowledge lives today

It exists, it is substantial, and it is not in `src/lib/game/`. There are two systems.

### 2.1 The tagger — categorical knowledge, near-total coverage

`src/lib/cards/tagger.ts` is now a 12-line re-export. The implementation is
**`src/engine/knowledge/tagger.ts`**, 815 lines: a boolean condition tree over normalised oracle
text, type line, keywords and mana cost, compiled to a Postgres function by
`scripts/generate-tagger-sql.ts` so the TypeScript and the SQL cannot drift.

**Measured, exactly:**

| | |
|---|---:|
| `TAG_RULES` entries | **66** |
| Distinct canonical tags | **66** |
| Distinct alias names | 11 (one of which, `lands-matter`, is also canonical) |
| `ALL_TAGS` — every emittable name | **76** |
| Names that never fire on any card | **0** |

So the figure sometimes quoted as "77 tags" is wrong, and `tag-signal.ts` already has it right:
**76 names, 66 distinct ideas.**

**Coverage over all 34,088 rows:**

| | cards | share |
|---|---:|---:|
| At least one canonical tag | **34,066** | **99.9%** |
| At least one *role* tag (excluding the 12 card-type tags) | **25,074** | **73.6%** |
| No tag at all | 22 | 0.1% |

Mean 2.43 canonical tags per card. Role tags per card: p50 = 1, p90 = 3, max 8, mean 1.30.

**The TypeScript and the SQL agree.** Running `deriveCardTags` in Node over all 34,088 rows leaves
exactly 22 cards untagged; querying the database for `tags = '{}'` returns exactly 22 rows. The
generated-SQL discipline is not just documented, it holds against the live table.

Frequencies span three orders of magnitude, which is why `tag-signal.ts` weights them by inverse
document frequency instead of counting them: `creature` 18,827 · `etb` 4,625 · `evasion` 4,412 ·
`token-maker` 3,606 · `card-draw` 3,431 · `targeted-removal` 3,420 · `counters` 2,888 · `ramp`
2,144 · `lifegain` 2,069 · `graveyard-recursion` 1,577 · `voltron` 1,243 · `sacrifice-outlet` 724 ·
`stax` 501 · `aristocrats` 476 · `reanimator` 372 · `spellslinger` 342 · `landfall` 220 ·
`proliferate` 101 · `self-mill` 66 · `extra-turn` 56 · `cascade` 42 · `storm` 40 · `fast-mana` 38.

### 2.2 The oracle-text compiler — structural knowledge, three quarters coverage

`src/lib/cards/abilities/` compiles normalised oracle text into a declarative ability DSL, with a
clause-accounting proof (`assertClausesAccounted`) that every character of rules text lands either
in an ability the engine will run or in a recorded gap. There is no third bucket.

**Measured over all 34,088 rows — 3.0 seconds, 89 µs per card:**

| | cards | share |
|---|---:|---:|
| Blank after normalisation | 386 | 1.1% |
| At least one ability emitted | **25,481** | **74.8%** |
| At least one ability with no manual marker in it | **20,070** | **58.9%** |
| `coverage === 'full'` — nothing dropped, nothing manual | **7,611** | **22.3%** |

By coverage: `full` 7,611 · `partial` 17,870 · `manual` 8,221 · `none` 386.
**39,548 abilities emitted · 24,910 clauses recorded as gaps · accounting failures: 0.**

Abilities by kind: `keyword` 15,228 · `triggered` 11,764 · `activated` 5,766 · `spell` 4,050 ·
`static` 1,869 · `replacement` 871.

Gaps by reason: `unrecognised` 11,980 · `ambiguous` 8,026 · `alt-cast` 1,330 · `multi-face` 1,097 ·
`granted-ability` 808 · `hidden-choice` 452 · `needs-history` 316 · `meta-replacement` 271 ·
`outside-game` 237 · `copy-layer` 185 · `duration` 130 · `complex-combat` 72 · `state-trigger` 6.

### 2.3 The gap this exposes, and it is the important one

Put the two numbers side by side.

- The compiler emits **at least one ability for 25,481 cards (74.8%)** and knows the *kind* of every
  one of the 39,548 abilities it emits.
- Play mode actually resolves **906 cards (2.66%)**.

That is not a contradiction, it is the design working as intended. `abilityEngineOwns` is
deliberately all-or-nothing: it requires `coverage === 'full'` and every trigger runnable, because a
card split across the compiler and the older detector is the partial-ownership bug, and a card that
half-resolves is worse than one marked manual. Precision over recall.

**But it means the knowledge is already there and mostly unused.** Twenty-eight times more cards
have a structurally understood ability than have a runnable one. Play mode cannot use that
knowledge, because playing a card requires exactness. **Brain and the deck builder can, because
they do not.**

---

## 3. What Brain and the deck builder actually need — and how much less it is

The deck builder never has to resolve a card. It has to answer categorical questions:

- Is this ramp? Is it removal? Does it draw?
- Does it care about tokens / graveyards / artifacts / landfall?
- Does it enter tapped, cost too much, win the game outright?
- Does it belong in a deck alongside *these other ninety-nine cards*?

None of that requires knowing that Doubling Season's doubling is a replacement effect on
CREATE_TOKEN and ADD_COUNTERS events. It requires knowing that Doubling Season is a token-and-counter
payoff. Play mode needs the first. Brain needs the second, and already has it.

**Concretely, how much less:**

| Question | System | Coverage |
|---|---|---:|
| "Resolve this card correctly, unattended" | play engine | **2.66%** (906 / 34,088) |
| "What kind of thing is this card" | tagger | **99.9%** (34,066 / 34,088) |
| "What shape are this card's abilities" | compiler | **74.8%** (25,481 / 34,088) |
| "Does this card fill one of the six deck roles" | `roles.ts` | **39.9%** (13,595 / 34,088) |

**The categorical answer already covers 37 times more of the catalogue than the executable answer,
and it is the answer Brain and the builder need.** The expensive remainder — the 2,558 primitives,
the layer system, priority windows — buys gameplay accuracy and buys the deck builder almost
nothing.

This is the direct answer to the owner's question. The engine does have card knowledge, not just
gameplay. It has more card knowledge than play mode can use. The thing that is missing is not
knowledge, it is *wiring*: the two features that most need it, Brain and the AI builder, do not
consult it.

---

## 4. Reducing the dependence on Gemini, staged by value per unit of work

### 4.1 Where the model is actually called, measured

19 edge functions exist. **Five call an AI gateway**, across 6 files and 7 `chat/completions` call
sites, all on `google/gemini-2.5-flash` through `ai.gateway.lovable.dev`.

| Function | Call sites | What the model is doing | Grounded in our data? |
|---|---:|---|---|
| **`mtg-brain`** | 1 | Answers natural-language questions | **No — zero database queries** |
| **`ai-deck-builder-v2`** | 2 (one in `test-builder.ts`) | Produces a *plan* only: theme, `keyCards`, `mustAvoidCards` | Card selection is ours; the plan is not |
| **`deck-optimizer`** | 1 | Chooses and justifies from a pre-ranked pool | **Yes, fully** |
| **`scan-card-ai`** | 1 | Vision — reads a photograph of a card | N/A |
| **`gemini-deck-coach`** | 2 | Deck coaching prose | Partly (queries `cards`) |

Front-end invocation counts across `src/`: `mtg-brain` **7**, `scryfall-sync` 3, `edh-power-check`
3, `deck-optimizer` 2, then one each for `scan-card-ai`, `ai-deck-builder`, `ai-deck-builder-v2`,
`capture-card-price`, `capture-collection-value`, `simple-sync`, `test-scryfall`.
**`gemini-deck-coach` is invoked by no page at all** — it is named only by the admin prompt editor.
`ai-deck-builder` (v1) references no gateway.

### 4.2 The deck optimiser: already off the model for card selection

This one is settled, and it is the template for everything else.

`deck-optimizer` retrieves every printing legal in the format and inside the commander's colour
identity, ranks the **whole pool** with `src/engine/advise/` — never a `.limit()` before ranking —
and only then hands the ranked pool to the model with instructions to *choose from it, not recall
from memory*. Every name that comes back is re-resolved against rows actually fetched from `cards`,
and what fails resolution is dropped and counted. When the model returns nothing usable,
`engineOnlySections()` answers from the ranked pool instead; the previous version returned HTTP 500.

The vendored engine under `supabase/functions/deck-optimizer/_engine/` is **byte-identical** to
`src/engine/` — verified today for `knowledge/tagger.ts`, `knowledge/tag-signal.ts`,
`advise/roles.ts`, `advise/rank.ts`, `advise/query.ts` and `core/types.ts`.

**So: the optimiser does not depend on a language model for card selection. It depends on one for
prose and for taste in ranking order, and it degrades to an engine-only answer without it.** That is
the honest state, and it is a good one.

### 4.3 The staged plan

Ordered by value per unit of work. Each stage names what it removes the model from and what it does
not.

---

**Stage 1 — Point the AI builder at the real tagger. Days, not weeks.**

`ai-deck-builder-v2` does not use the 66-rule tagger. Its card query selects
`id, name, type_line, oracle_text, cmc, color_identity, colors, rarity, prices, mana_cost, keywords`
— **not the `tags` column**, which is populated in the database. Instead
`builder-orchestrator.ts` calls a private `tagCard()` that emits **22 tag names**, one of which
(`combo-piece`) the canonical tagger never emits, so the quota that reads it is permanently empty.
Its rules include `text.match(/sacrifice|sac\b/)` → `sac-outlet` and `add .* mana` → `ramp`:
precisely the bare-word and reminder-text errors the canonical tagger documents at length and
avoids, which is why every Treasure producer currently reads as a sacrifice outlet and a mana rock.

Removing the second tagger and reading `cards.tags` upgrades the builder from 22 crude tags to 66
precision-first ones covering 99.9% of the catalogue. **Removes the model from: nothing directly.
Improves: every card the builder picks.** It is first because it is the cheapest and it is a
correctness fix, not only a quality one.

---

**Stage 2 — Give the AI builder the optimiser's retrieval, and make the plan optional. 1–2 weeks.**

The builder already selects cards itself from an 8,000-row pool; the model supplies a plan. Replace
the pool-plus-inline-scoring with `src/engine/advise/` — the same ranked retrieval the optimiser
uses — and treat a failed plan the way the optimiser treats a failed model: build anyway, from role
targets and tag synergy.

**Removes the model from: producing a usable deck at all.** The model becomes optional flavour on
top of a deterministic build. **Still needs it:** turning "I want a spooky graveyard deck that goes
wide" into a theme the engine can act on. Free-text intent is a language problem.

---

**Stage 3 — Ground Brain in our own catalogue. 1–2 weeks, and it is the biggest single win.**

`mtg-brain` is our widest model dependency — 7 invocation sites, including the Brain page, the AI
builder, three deck-analysis components, scan insights and template recommendations — and **it makes
no database queries whatsoever.** Grepping the function for `supabase` returns zero hits. It detects
card names in the message, fetches each one from `api.scryfall.com` at request time, and otherwise
relies on a hardcoded knowledge object plus the model's memory.

So the single most-used AI feature in the product cannot see the 34,088-row catalogue, the 66-rule
tagger, the 39,548 compiled abilities, the EDH power subscores or the user's own decks and
collection — all of which we already hold.

Grounding it means: resolve mentioned cards against `cards` (not Scryfall), attach their tags,
compiled ability kinds, legalities, price and the user's ownership, and put that in the prompt as
retrieved context. Then answer *"what does this card do"*, *"is this legal in commander"*, *"what's
my curve"*, *"how much ramp do I have"*, *"what are this deck's win conditions"* from the engine
directly and never call the model at all.

**Removes the model from:** every factual lookup — card text, type, cost, legality, price, tags,
role counts, curve, colour identity, ownership, deck composition, power subscores. Those are
database rows and arithmetic, and a model answering them from memory is the fabrication risk this
project has already been burned by. **Still needs it:** open-ended natural language. See §4.5.

---

**Stage 4 — Retire `gemini-deck-coach`, or point it at the optimiser. Days.**

It is deployed, it calls the gateway, and no page invokes it. Either delete it — after grepping its
import path in the current tree, per the standing rule — or make it a thin caller of
`deck-optimizer`, which already does the grounded version of its job. Right now it is a second,
ungrounded implementation of deck advice sitting behind an admin tab.

---

**Stage 5 — Continue the primitive grind for play mode. Months, and it is a different goal.**

The four cheap DSL extensions the spike identified — computed values, watchers, cost modification,
conditional mana — raise what is *representable* from 76.0% to 80.7% against XMage's corpus. That
raises play-mode automation from 2.66%. **It does almost nothing for Brain or the deck builder**,
which is exactly why it belongs last in *this* document and stays high priority in the play-mode
roadmap. Two different products, two different sequences. Do not let one justify the other.

### 4.4 So: can this replace Gemini?

**Yes, completely, for these:** what a card does categorically · every field on a card · format
legality · colour identity · price and ownership · deck composition, curve, role counts and role
gaps · castability percentages · EDH power and its subscores · which real cards are plausible
additions to a deck and in what order · which cards are the weakest and why · whether a suggestion
is legal. All of it is a query or a pure function over data we hold, and every one of those answers
is *verifiable*, which a model's answer is not.

**No, and probably never, for these:** free-form questions in Brain, where the input is a sentence
nobody anticipated · turning a vibe ("aristocrats but budget and not too mean") into a build
specification · explaining a rules interaction in prose · reading a photograph of a card.

**Between the two:** the *prose* around grounded answers. The engine can produce every fact in a
deck review; a model writes it up better than a template does. That is a legitimate, low-risk use —
the model is styling data it was handed, not recalling facts. Keep it there, keep the fallback, and
keep validating.

### 4.5 The honest limit

Brain's core value *is* natural language. A user typing "why does my deck feel slow" is asking a
question no schema anticipates. The right target is not "remove the model from Brain" — it is
**"the model never states a fact it was not handed"**. Retrieval and validation, exactly as
`deck-optimizer` now does it. That is achievable and it is the goal.

---

## 5. How this scales with new cards

**This is the strongest property of the approach and it is the direct answer to "it has to scale
with new cards coming in too."**

Tags and compiled abilities are both **derived from oracle text at sync time**. Nothing is
hand-authored per card. `scryfall-sync` writes a new set into `cards`; `public.derive_card_tags`
(generated from `TAG_RULES`, never hand-written) tags every new row; the compiler parses every new
row's text on read. A set that lands tomorrow is covered to whatever degree the existing rules
understand its wording, with **zero per-card work**. The catalogue already spans 305 set codes on
this basis.

Compare the alternative honestly. XMage's community added 2,238 card implementations in twelve
months and genuinely keeps pace with Wizards — but every one of those is a person writing a class,
and adopting that corpus means adopting a continuous re-extraction and semantic-drift pipeline
forever. Deriving from oracle text has no such tail.

### The failure mode, stated plainly

**A genuinely novel mechanic will parse poorly, and the danger is that it parses poorly and quietly.**

A new set introduces a keyword no rule matches. The tagger, being precision-first, emits *nothing*
rather than a wrong tag — correct, and invisible. The compiler records the clause as a gap with a
`GapReason` — also correct, and also invisible unless someone looks. The card then sits in the
catalogue looking normal, gets recommended by nothing, gets counted toward no role, and nobody
notices for months.

The infrastructure to catch this **already exists and is not yet watched**:

- `assertClausesAccounted` proves no clause is silently dropped. It reports **0 accounting failures
  across 34,088 rows** today. That is the guarantee that gaps are *recorded*, not that anyone reads
  them.
- `measureCoverage` returns `byGapReason` and `byManualHint` — a ranked list of exactly which
  templates are costing the most. `unrecognised` at 11,980 clauses is the standing to-do list.
- The tagger emits 22 cards with no tag at all, catalogue-wide. That number is a health metric.

**What is missing is the alarm, not the detector.** Three things, none of them large:

1. **Fix `measure-ability-coverage.ts` so it completes.** It times out at ~20,000 rows today. A
   number that cannot be recomputed is a number that will be quoted after it stops being true —
   which is precisely what happened to "84 of 12,000".
2. **Run it per sync and diff against the previous run**, per new set code. A set whose untagged
   rate or `unrecognised` gap rate is materially worse than the catalogue baseline is a set with a
   new mechanic, and that should be a notification, not an archaeology project.
3. **Surface per-set coverage in admin.** "This set is 61% tagged against a 99.9% baseline" is a
   one-line answer to "did the new set break anything".

Silent degradation is the same failure the play engine's honesty rule exists to prevent, one level
up. The rule should be stated the same way: **a set we understand badly must be visibly a set we
understand badly.**

---

## 6. "Lots of playstyles and cards that do certain actions"

This is the most interesting part of the question and the least built.

### 6.1 What exists

**Roles — real, narrow, honest.** `src/engine/advise/roles.ts` maps six roles onto real tags, every
tag verified against `TAG_RULES` by a test:

| Role | Tags | Cards serving it |
|---|---|---:|
| removal | `targeted-removal`, `board-wipe`, `land-destruction`, `bounce` (+ aliases) | 4,402 |
| draw | `card-draw` (+ alias) | 3,431 |
| ramp | `ramp`, `mana-rock`, `mana-dork`, `fast-mana`, `cost-reduction`, `treasure` | 2,333 |
| wincon | `finisher`, `extra-turn`, `extra-combat`, `infect`, `storm`, `voltron` (+ alias) | 2,258 |
| interaction | `counterspell`, `protection`, `stax`, `graveyard-hate` | 1,791 |
| land | `land` | 1,410 |

**13,595 of 34,088 cards (39.9%) serve at least one of the six. 60.1% serve none.** The role targets
(10 ramp / 10 draw / 8 removal / 4 interaction / 3 wincon / 36 land for Commander) are declared
policy, written down to be argued with, and the *gap* measured against them is real.

That answers "cards that do certain actions", and it answers it well for six actions.

**Archetypes — present, and built on the wrong foundation.**
`src/lib/deckbuilder/archetype-detector.ts` carries 13 signatures: Voltron, Aristocrats, Combo,
Control, Aggro, Tokens, Reanimator, Stax, Lands Matter, Storm, Tribal, Spellslinger, Midrange. It is
used by `ArchetypeDetection.tsx`, `AIGeneratedDeckList.tsx`, `AIBuilder`, `DeckBuilder` and
`DeckInterface`.

**It does not read `cards.tags`.** It matches raw substrings against `oracle_text` *and against the
card's own name* — the exact two normalisation mistakes the tagger's header documents at length and
exists to avoid. Reminder text counts. A card whose name contains a trigger word scores for it. This
is a third tagger in the codebase, after the canonical one and the copy inside `ai-deck-builder-v2`.

Meanwhile the tagger *already emits* most of those archetypes as first-class, precision-tested tags:
`voltron` 1,243 · `tribal-payoff` 504 · `stax` 501 · `aristocrats` 476 · `lands-matter` 471 ·
`reanimator` 372 · `spellslinger` 342 · `artifacts-matter` 252 · `landfall` 220 · `blink` 199 ·
`enchantments-matter` 69 · `self-mill` 66 · `group-hug` 60 · `storm` 40. Plus the payoff-adjacent
ones: `token-maker` 3,606 · `counters` 2,888 · `treasure` 385 · `proliferate` 101.

### 6.2 What it would take to build a deck around a playstyle

Four steps, in order, and only the third is genuinely new work.

**1. Delete the other two taggers.** One classifier per card, or they drift — the rule the tagger
already enforces on itself by generating its own SQL. Point `archetype-detector.ts` and
`ai-deck-builder-v2` at `cards.tags`. Archetype detection then becomes counting tags in a decklist
and weighting by IDF, which `tag-signal.ts` already computes: a deck with six `storm` cards (IDF
9.7) is a storm deck; a deck with six `etb` cards is a deck.

**2. Promote the archetype list from prose to data.** An archetype is a named bundle of role targets
plus tag weights — "aristocrats wants `sacrifice-outlet` ≥ 6, `aristocrats` ≥ 8, `token-maker` ≥ 6,
`graveyard-recursion` ≥ 4, and shifts the removal target down". That is the same shape as
`COMMANDER_ROLE_TARGETS`, which already exists, is already overridable per call, and is already
honest about being declared policy rather than measurement. Roughly a dozen archetypes, each a few
lines. This is small.

**3. Add the payoff/enabler distinction, because it is the one thing tags genuinely miss.** The
tagger says *what a card is about*; it does not say *which side of the engine it sits on*. Ashnod's
Altar and Blood Artist both carry `aristocrats`, and a deck of twenty outlets and no payoff is a
pile. This is a real gap and it is the honest cost of this section. It is derivable from what the
compiler already emits — an ability with a `dies` trigger whose body has an effect is a payoff; an
activated ability whose *cost* is a sacrifice is an enabler — and the compiler already classifies
5,766 activated and 11,764 triggered abilities. That is the work: a second axis over compiled
abilities, not a new corpus.

**4. Only then involve a model, and only for intent.** "Spooky graveyard deck that goes wide" →
`{ archetype: 'aristocrats', colors: [...], budget: ... }`. That is a short, checkable
classification into a closed list, not a card list. Everything downstream is deterministic, every
card is real, and if the model is unavailable the user picks the archetype from a menu and gets the
identical deck.

### 6.3 Honest assessment

Steps 1 and 2 are days of work on foundations that exist and would visibly improve the builder.
Step 3 is the real project and it is bounded — one derived attribute over the 39,548 abilities
already compiled, not a new source of knowledge. Step 4 is small and is the only part that touches a
model.

**Understanding playstyles well enough to build a deck around one does not need the 2,558
primitives, the layer system, or anything from XMage that we did not already take. It needs the
knowledge we have to stop being ignored by the three features that most need it.**

---

## Summary

1. The XMage port gave us **gameplay architecture, not card knowledge**, and porting the 32,168 card
   classes was rejected because they are calls into a 2,558-primitive vocabulary with a very flat
   tail — 4–15 person-months for roughly a third of the catalogue.
2. Real card knowledge exists in two places: the **tagger** (66 rules, 76 names, **99.9%** of 34,088
   cards tagged) and the **oracle-text compiler** (39,548 abilities over **74.8%** of cards, zero
   silent drops).
3. Play mode resolves **2.66%** of cards. Brain and the builder need categorical answers, which
   already cover **99.9%**. The correct denominator is 34,088, not the 12,000 in circulation.
4. **The deck optimiser no longer depends on a model for card selection** and falls back to an
   engine-only answer. `mtg-brain` is the opposite extreme: 7 call sites, zero database queries.
   Ground it, and most factual questions leave the model entirely.
5. New sets are covered **automatically at sync time** with no per-card work. The failure mode is a
   novel mechanic parsing poorly and quietly; the detectors exist, the alarm does not, and
   `measure-ability-coverage.ts` does not currently complete.
6. Playstyles need one tagger instead of three, archetypes expressed as data, and a payoff/enabler
   axis over abilities already compiled. Not a rules engine.
