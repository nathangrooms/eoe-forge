# Fifty questions put to Tutor, and what happened

Measured 29 Aug 2026 against the deployed function. Nothing in this document was
changed in the product. It is a review, and where it disagrees with an earlier
review it says so and shows the measurement.

The survey this tests is `docs/design/WITHOUT-A-MODEL.md`, which asked what a
language model actually contributes and answered it against 30 prompts the
product writes for itself. This asks the harder version of the same question
against 50 questions a player would type, with the model gone.

---

## 0. What was re-run, and why a second harness exists

An earlier pass recorded fifty answers in `scripts/tutor-fifty-answers.json` and
four review passes then scored those recordings. A recording can be stale or
selectively quoted and neither fault is visible from inside the file that holds
it. So everything below was asked again, from a harness that shares no code with
the first one: `scripts/tutor-refute-probe.mjs`.

**The endpoint is unchanged and the recordings are real.** `mtg-brain` is
version 94, `verify_jwt: false`, deployed 2026-08-29T18:22:43Z. All eight
deployed files hash identical to the repo with line endings normalised, checked
rather than assumed. Twelve of the fifty were re-asked and every one came back
matching its recording, `answeredFrom: 'catalogue'` or `'nothing'`, never
`'gateway'`. **No question in this document reached a language model.**

Asked in total for this review: 12 re-asks, 11 singleton probes, 13 routing
pairs, 8 fabrication probes, 5 list probes and 4 retries. **53 fresh requests,
49 answers, 4 transient 502s that all answered on retry.** Files:

```
scripts/tutor-refute-probe.mjs        the harness
scripts/tutor-refute-asks.json        the twelve re-asks
scripts/tutor-singleton-asks.json     the singleton probes
scripts/tutor-fragment-asks.json      the matched routing pairs
scripts/tutor-fabrication-asks.json   the invented-card probes
scripts/tutor-unrouted-triage.ts      why each unrouted question went nowhere
scripts/tutor-extract-probe.ts        which card name each question reaches
scratch/tutor-refute-*.json           every reply, verbatim
```

One divergence, recorded rather than left to be found: the harness carries the
anon key and no session, so "which of your decks already play this" answers as
signed out. It changes no routing and no other section.

---

## 1. The honest headline: four numbers

Two of these are mechanical and two are judgement, so both are given.

**Mechanically: 22 of 50 reached an ask. 28 routed nowhere.** Reproduced from
the deployed router by `scripts/tutor-unrouted-triage.ts`: **19 matched no
phrase at all** and **9 matched a phrase and then had no subject**.

**By judgement, partitioning all fifty:**

| | count | share |
|---|---:|---:|
| **Answered well** | **6** | 12% |
| **Refused correctly** | **15** | 30% |
| **Answered badly** | **8** | 16% |
| **Failed to route on something we hold** | **21** | 42% |

- **Answered well** means a real answer, every fact checked against the card and
  against Scryfall, and it answers the question that was asked.
  `q09 q10 q13 q31 q38 q50`
- **Refused correctly** means it declined and we genuinely do not hold the
  answer. This is a pass. `q01 q02 q03 q05 q07 q08 q20 q21 q22 q23 q29 q33 q35
  q39 q49`
- **Answered badly** means it produced prose that contains a wrong fact, or that
  answers a different question than the one asked without saying so.
  `q12 q15 q16 q18 q24 q28 q34 q46`
- **Failed to route** means the stock paragraph fired on something the database,
  the request body or this repo's own code already holds.
  `q04 q06 q11 q14 q17 q19 q25 q26 q27 q30 q32 q36 q37 q40 q41 q42 q43 q44 q45
  q47 q48`

**Six of fifty is what a player gets.** The 30% refusing correctly is a real
pass and must not be merged into it, and the 42% is the work queue.

**34 of 50 answers are one of four stock paragraphs**: the no-deck refusal 22
times, the with-deck refusal 6, the Optimise hand-off 4, "pick a card at the top
of the page" twice. That is the largest single fact about reading the run.

---

## 2. Re-asking twelve that passed, and checking them against the card

The brief was to re-ask ten marked PASS and report any that should not have
passed. **Twelve were re-asked**, all previously marked PASS by at least one
lens: `q01 q09 q10 q13 q18 q24 q28 q31 q38 q39 q47 q50`. Every printed figure was
checked twice, against our own `cards_unique` row and against Scryfall's live API
by curl.

Of the twelve: **six hold up** (q09 q10 q13 q31 q38 q50), **three should not have
passed** (q18 q24 q28), and **three are refusals that hold** (q01 and q39 decline
things we genuinely do not have; q47 is treated separately in section 3, because
what looks like a pass is silence).

Four more that an earlier lens passed or half-passed are examined below without
being re-asked in the same shape: q46, q15, q16 and q12. q15 and q16 were instead
probed with four rewordings, which is what settled their cause.

### The six that hold up

| | what it printed | checked |
|---|---|---|
| **q09** Rhystic Study | rank 44, Game Changer, `$64.33 / €33.74`, 11 printings, "Legal in Commander, Legacy, Vintage, Pauper, Brawl, Historic and Oathbreaker" | Scryfall `pauper: legal`, `game_changer: true`, `edhrec_rank: 44`. **Pauper is right**, and it is right for a reason worth knowing: Rhystic Study is a Prophecy common. I expected this to be the fabrication and it is not. |
| **q10** Agadeem's Awakening | both faces, `Sorcery // Land`, "you may pay 3 life. If you don't, it enters tapped", 4 combos | Our row: `layout: modal_dfc`, `oracle_text` NULL, faces populated. Combo count 4, exact. It read the faces rather than the empty column. |
| **q13** Esper Sentinel | "first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power" | Quoted exactly, including the `{X}` clause. rank 77, `$56.15`, all exact. |
| **q31** Black Lotus | `About €11,658.96 in euros.` and **no dollar figure** | Scryfall `usd: null`. Our row `usd` NULL, `eur` 11658.96. The null-price rule is honoured where it matters most. |
| **q38** Sol Ring combos | "106 combos we hold", four named with pieces and mana | `meta_combo_cards` gives exactly 106 for Sol Ring's `oracle_id`. The Hullbreaker Horror line carries "Plus 1 more piece the combo list describes rather than names", which is the honest hedge and is correct. |
| **q50** 3 mana counterspells | eight cards, costs and prices | Every one is mana value 3, tagged `counterspell`, Commander legal. Prices match our rows. |

Three prices differ from Scryfall's default printing (Rhystic Study 64.33 against
69.93, Toxic Deluge 4.59 against 4.61, Smothering Tithe 53.12 against 61.71).
That is not an error: we quote the cheapest printing, which is the project's
documented convention, and every one of those answers says "There are N printings
and they do not all cost the same."

### The seven that should not have passed

**q28 "Is my mana base any good?" is marked `correct` in the answers file and
PASS by two of the four reviews. It states two things that the cards themselves
contradict.**

> `Cut Roadside Reliquary, play Exotic Orchard. Taps for BGUW, enters untapped. $0.19.`

Exotic Orchard's text, in our row and on Scryfall:
`{T}: Add one mana of any color that a land an opponent controls could produce.`
Against three mono-red opponents it makes `{R}` and casts nothing in Atraxa's
deck. It is offered as a straight upgrade over a land that at least reliably
makes `{C}`.

> `Cut Rogue's Passage, play Path of Ancestry. Taps for BGUW, sometimes enters tapped. $0.22.`

Path of Ancestry begins `This land enters tapped.` with no condition.

Both defects are in `supabase/functions/mtg-brain/manabase.ts`. `tappedNote` at
line 47 downgrades to "sometimes" whenever the card says `you may` anywhere, and
the only `you may` on Path of Ancestry is inside the scry reminder,
`(Look at the top card of your library. You may put that card on the bottom.)`.
`produced_mana` is a list of what a land *can ever* make and the swap list prints
it as what it *does* make.

Measured over `cards_unique`, so the scale is stated rather than implied:

```
land rows                                                    1,213
  make two or more colours                                     380
  ...of which do so only CONDITIONALLY                          24
  say "This land enters tapped." flatly                        417
  ...of which are reported as "sometimes enters tapped"         71   (17%)
```

That looks small until you reproduce the shortlist. `findLandCandidates` orders
by `edhrec_rank`, and for a WUBG deck **the top three candidates are Command
Tower (rank 2), Exotic Orchard (9) and Path of Ancestry (14), and all three are
conditional producers**. Command Tower survives because its condition *is* the
commander's identity. The other two do not. **Two of the six swaps Tutor offered
carry a wrong fact, and they are the second and third lines of the list.**

Everything else in q28 is exact and was checked: 33 lands is the real count from
the 92 rows sent; all nine "weakest slots" genuinely produce only `{C}` or `{W}`;
none of the six recommendations is already in the deck; all six are inside
Atraxa's identity; the shockland phrasing "enters untapped if you pay the life"
is right. And its caveat is the best-written line in the run:

> `This is judged on colours only, so a land that makes no colour sits at the top
> of the list whatever else it does. If one of those is in there for what it does
> rather than what it taps for, keep it.`

The caveat covers the cuts. It does not cover the swaps, which is where the two
wrong facts are.

---

**q24 "Are there any combos in my deck?" refuses, and the reason it gives is
false.**

> `Checking a hundred cards against every combo we hold is not something I can do
> quickly enough yet, and I would rather say that than tell you your deck has no
> combos when I have not really looked.`

The tone is right and the instinct is right. The fact is wrong. Measured with
`EXPLAIN ANALYZE` against the live database, on the exact 92 cards the harness
sent:

```
combos wholly inside the deck, driven from all 61,500 combos    5,197 ms   times out
combos wholly inside the deck, driven from the deck's 92 cards  1,314 ms   fine
```

against a 3 s `statement_timeout`. The second form returns **two combos this
deck actually has**:

```
Yahenni, Undying Partisan + Yuna, Grand Summoner   infinite creature ETB / LTB / sacrifice / death triggers
Yahenni, Undying Partisan + Zameck Guildmage       same, needs {G}{U}
```

Both carry template pieces (3 and 1), which is exactly the hedge Tutor already
prints on the per-card combo path. It could answer this, in 1.3 seconds, and stay
honest.

One earlier review put the index-driven form at 1,761 ms; my own first attempt on
22 cards took 2,874 ms and the full 92 took 1,314 ms. The number moves with the
plan. The conclusion does not: **it is inside the timeout and the refusal is not
true.**

---

**q18 "cheaper alternative to Smothering Tithe" is marked correct. Nothing in it
is false and it does not answer the question.**

Six cards, all genuinely cheaper, all prices verified. But Smothering Tithe is
`{3}{W}` and the six are `{1}{B} {3}{R} {3}{R} {2}{G} {U} {2}{B}`. **None is
white.** A player who plays Smothering Tithe is in a white deck and cannot cast
five of the six.

One earlier review said the shared basis is "only the `treasure` tag". That is
wrong and I measured it: all six share **four** tags with Smothering Tithe
(`ramp`, `treasure`, `tokens`, `token-maker`), and Black Market Connections
shares five including `enchantment`. The tag basis is fine. **The missing thing
is a colour filter**, in `similarTo` in `answer/catalogue.ts`. Smothering Tithe's
own `$53.12` is also never printed, so "cheaper" is asserted with no baseline on
screen.

---

**q46 "Why was Jeweled Lotus banned?" prints a contradiction.** Four lines apart:

> `Commander plays it at rank 8,914.`
> `Legal in Legacy and Vintage. Banned in Commander and Oathbreaker.`

Both are true readings of our columns. Read together by a player they say nobody
plays it in the format where it is banned, and it is banned in that format. It
also never says the reason for the ban is something we do not hold, so the answer
reads as a dodge rather than a limit.

---

**q15 and q16 answer half of a two-card question and do not say so.** q15 asks
Swords to Plowshares or Path to Exile and prints a Swords card page in which
"Path to Exile" never appears, plus
`with Jumbo Cactuar: near-infinite lifegain`, which has nothing to do with the
question. q16 answers about Rampant Growth alone.

An earlier review said the cause is the anti-fragment guard eating "Cultivate"
inside the leading phrase "Is Cultivate". **That is wrong, and I tested it.**

| asked | answered about |
|---|---|
| `Is Cultivate or Rampant Growth better in commander?` | Rampant Growth |
| `Cultivate or Rampant Growth, which is better in commander?` | Rampant Growth |
| `Rampant Growth or Cultivate, which is better?` | Rampant Growth |
| `Path to Exile or Swords to Plowshares, which is better?` | **Swords to Plowshares** |

The last row settles it. Path to Exile is named first and loses. The cause is
`.sort((a, b) => b.length - a.length)` in `cardNamedInQuestion`
(`answer/index.ts:359`): candidates are tried longest first and the loop returns
on the first that resolves. **In a two-card comparison the card with the longer
name wins, whichever was asked about first.**

---

**q12 "What does Doubling Season do with planeswalkers?"** prints the card
correctly and the second quoted line is the answer, but the words planeswalker
and loyalty never appear. Doubling Season `standard: legal` is correct on
Scryfall, which I expected to be a stale column and is not.

---

## 3. The singleton bug

The recorded fault, stored verbatim in `tutor_messages`, in a deck whose `format`
column reads `commander`:

> "**Out:** Wretched Banquet. **In:** Mystic Remora. This is already in your deck,
> but you only have one copy. You could add another copy if you want more card
> draw."

**Eleven questions were put to Tutor that invite a second copy.** Eight are in
`scripts/tutor-singleton-asks.json`, plus q47 and two follow-ups. **All eleven
carried the real 92-card Commander deck**, so the format was never in doubt.

| | question | what came back |
|---|---|---|
| q47 | Can I run two copies of Sol Ring in my commander deck? | routed nowhere, stock refusal |
| s1 | Should I add a second Sol Ring to this deck? | routed nowhere, stock refusal |
| s2 | Two copies of Sol Ring, is that allowed here? | full Sol Ring page |
| s3 | I already run Rhystic Study. Should I run more copies of it for consistency? | full Rhystic Study page |
| s4 | How many copies of Arcane Signet can I play in commander? | full Arcane Signet page |
| s5 | What card should I replace to fit in a second Cyclonic Rift? | Optimise hand-off |
| s6 | Is running 4 copies of Lightning Bolt fine in my deck? | full Lightning Bolt page |
| s7 | What does Sol Ring do? (deck attached) | full Sol Ring page |
| s8 | Can I run two Islands in my commander deck? | routed nowhere, stock refusal |
| c3 | Sol Ring, can I run two? | full Sol Ring page |
| c4 | Sol Ring, how many copies in commander? | full Sol Ring page |

**The fabricated sentence did not recur once. Nothing invited a second copy and
nothing said it was fine.** That is the finding and it is a real improvement over
the model.

**It also never once stated the rule.** Six of the eleven answer a copies
question with a card page whose only relevant line is this:

> `Legal in Commander and Vintage (one copy only). Banned in Legacy and Oathbreaker.`

The parenthetical belongs to **Vintage**, where Sol Ring is `restricted`. It is
produced at `answer/index.ts:661`:

```ts
else if (state === 'restricted') legal.push(`${format.says} (one copy only)`);
```

A per-format qualifier is glued onto one item and the whole array is then joined
into one sentence, so the qualifier lands at the end and grammatically attaches
to the list rather than to Vintage. Read as an answer to "can I run two?", the
sentence says Commander is fine and one copy applies to something. **A player
asking whether they may run two copies is being shown a line that reads as yes.**

Two more that matter:

- **s6** asked whether four copies of Lightning Bolt are fine in the attached
  deck. Lightning Bolt is red. **Atraxa's colour identity is WUBG.** The card
  cannot go in that deck at all, at any count, and the answer says
  "Legal in Commander, Modern, Legacy..." and stops.
- **s8** asked about two Islands, which is the one case where the answer is yes.
  It routed nowhere. A blanket yes and a blanket no would both be wrong, and
  saying nothing is the third wrong answer.

**We hold the rule. It is in this repo.** `src/lib/deck/deckLegality.ts` computes
the singleton verdict, with tests in `deckLegality.test.ts`. Its own doc comment
quotes the sentence:

> `"Sol Ring appears 2 times (violates singleton rule)"`

and `cardFaults()` implements, in order: banned, never legal, `restricted` with
more than one copy, the copy limit with the **basic land exception tested first**
because `Wastes` is not in every format's exception table, and then colour
identity against the commander. Every one of the eleven questions above is
answered by that file. Tutor does not import it and there is no equivalent inside
`supabase/functions/mtg-brain/`.

So the honest verdict: **the singleton bug is gone as a fabrication and is not
fixed as a product. q47 passes on phrasing luck.** Change four words and the
answer becomes a card page that reads as permission.

---

## 4. Twenty-eight routed nowhere. Which could we have answered?

This is the work queue and it is worth more than the score. "Held" below means
the answer is a column, a row, the request body, or code in this repo, and every
`yes` was measured today.

### Held. These are wrongly refused. (21)

Nineteen of these are in the mechanical 28. Two more, q11 and q32, matched an ask
and then had no subject, so they are counted here rather than as no-phrase
failures. Same outcome for the player: a stock paragraph on something we hold.

| | question | where the answer already is | measured |
|---|---|---|---|
| q04 | Can a creature I just played tap for mana the same turn? | the **haste reminder text**, on 42 cards | `Haste (This creature can attack and {T} as soon as it comes under your control.)` |
| q06 | What does hexproof do and how is it different from shroud? | both reminder texts, verbatim | hexproof on **109** cards, shroud on **89**. The difference is the four words "your opponents control" |
| q11 | Explain Cyclonic Rift in plain terms | `cards_unique` | the reply says "name it in the question and I will look it up". It was named |
| q14 | What does overload mean? | reminder text | `Overload {1}{R} (You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")` |
| q17 | Is Rhystic Study worth sixty dollars? | `prices->>'usd'` | `$64.33`, and q09 printed it eight questions earlier |
| q19 | What cards should I cut from this deck and why? | the Optimise hand-off | q20, q21 and q22 get it for the same intent |
| q25 | Rate this deck out of ten | **the request body** | `power_level: 6` and `power.score: 7.34` were both sent |
| q26 | How many lands should I run in a commander deck? | `meta_decks` | **median 38**, p10 37, p90 40, over 192 real 100-card Commander lists |
| q27 | How much ramp does a commander deck need? | `meta_decks` | **median 9.5** non-land ramp cards, p10 6, p90 14, same 192 |
| q30 | What colours is this deck short on? | the request body | `identity: []`. The deck is colourless. "None" was free |
| q32 | What is this deck worth? | the request body | `economy.priceUSD: 423.02` |
| q36 | How does the Thassa's Oracle and Demonic Consultation combo work? | `meta_combos` | combo `742-1295`, popularity **147,487**, produces `Exile your library` and `Win the game`, needs `{U}{U}{B}` |
| q37 | What are the best two card infinite combos in commander? | `meta_combos` | **3,887** two-card combos with no template piece, rankable by popularity |
| q40 | Is Sol Ring legal in Modern? | `legalities->>'modern'` | `not_legal` |
| q41 | Which formats can I play Lightning Bolt in? | `legalities` | 16 formats, `historic: banned` |
| q42 | Can I play Swords to Plowshares in Modern? | `legalities` | `not_legal` |
| q43 | Is my deck legal for commander? | the request body **and** `deckLegality.ts` | `legality: {"ok": true, "issues": []}` |
| q44 | Is Dockside Extortionist banned in commander? | `legalities` | `banned` |
| q45 | What cards are banned in commander? | one `where` clause | **76** rows |
| q47 | Can I run two copies of Sol Ring? | `deckLegality.ts` | the singleton rule, with tests |
| q48 | Can I play a card with a green mana symbol in its rules text? | `color_identity`, and `deckLegality.ts`'s colour-identity fault | Talisman of Curiosity costs `{2}` and carries `color_identity: ["G","U"]` purely because of the `{G}` in its text. The column already answers this |

### Genuinely not held. Refusing is correct. (9)

| | question | checked |
|---|---|---|
| q02 | deathtouch plus trample, how much to assign | both keyword definitions are held; the **assignment rule** is not. Half held |
| q03 | two legendary creatures with the same name | 9 cards mention "the legend rule" and **all nine say it does not apply to them**. It is never defined |
| q05 | exile against destroy | no definition of either anywhere |
| q07 | do I lose when my library is empty | **0** cards carry that rule |
| q08 | first strike plus deathtouch | both definitions held, the interaction is not. Half held |
| q23 | what is my win condition | the deck's tags say `counters` and `proliferate`, which is a theme. A theme is not a win condition |
| q33 | how do I know if my cards are worth money | a product signpost, not a data answer. The collection valuation exists and is not named |
| q35 | build a commander deck for under fifty dollars | the Deck Generator does this and is not named |
| q49 | how much commander damage kills a player | **0** cards carry it |

### The single most important line in this section

**"What I do not hold is a rules reference" is the load-bearing false claim.**
It is printed at `answer/index.ts:332` on every one of the 28, and it is true
about the Comprehensive Rules and false about the keyword glossary.

Measured over `cards_unique.oracle_text`, by splitting on newlines and matching
`Keyword (definition)`:

```
distinct keywords carrying an official definition     212
distinct definition strings                           474
```

Wizards prints the definition of a keyword in the reminder text on the card, and
we hold every card. **No new table, no new source, no scraping, no permission
question.** The rules questions a beginner actually asks are keyword questions,
and the keyword glossary has been in the catalogue the whole time.

---

## 5. Why routing failed, proved with matched pairs

Six pairs, same fact wanted, one word of difference, run against the live
endpoint. This is not a code reading.

| asked | result |
|---|---|
| `Is Sol Ring legal in Modern?` | stock refusal |
| `Sol Ring, legal in Modern?` | **"Not legal in Standard, Pioneer, Modern..."** |
| `Which formats can I play Lightning Bolt in?` | stock refusal |
| `Lightning Bolt, which formats?` | **full legality, "Banned in Historic"** |
| `Is Dockside Extortionist banned in commander?` | stock refusal |
| `Dockside Extortionist, banned in commander?` | **"Banned in Commander."** |
| `Is Black Lotus legal in commander?` | stock refusal |
| `Black Lotus, legal in commander?` | **"Banned in Commander, Legacy and Oathbreaker."** |
| `Is Rhystic Study worth sixty dollars?` | stock refusal |
| `Rhystic Study, worth sixty dollars?` | **"About $64.33"** |
| `How does the Thassa's Oracle and Demonic Consultation combo work?` | stock refusal |
| `Thassa's Oracle combos` | **"with Demonic Consultation: exile your library and win the game. Needs {U}{U}{B}."** |

The last pair is the one to look at. The most famous combo in the format, the
highest popularity figure in our table, the pieces, the result and the mana cost
are all held and all printed correctly. The question that failed was one word
order away from the question that worked.

### The mechanism, traced rather than inferred

`scripts/tutor-extract-probe.ts` runs the real `extractCardNames` and then the
real fragment test from `cardNamedInQuestion`, on the failing questions:

```
Is Sol Ring legal in Modern?
  extracted : ["Is Sol Ring","Is Sol","Sol Ring","Sol","Ring","Modern"]
  tried     : ["Is Sol Ring","Sol Ring","Is Sol","Modern"]
              Is Sol Ring    resolves to nothing
              Sol Ring       <- REJECTED as a fragment of "Is Sol Ring"
              Is Sol         <- REJECTED
              Modern         not a card

Sol Ring, legal in Modern?
  tried     : ["Sol Ring","Modern","Ring"]
              Sol Ring       resolves. Answered.
```

Three things fall out of that trace, and they are three separate bugs.

**One. The fragment guard rejects on a phrase that resolved to nothing.** It was
written for a real fault, "Blastoderm Supreme" resolving to "Blastoderm", where
the containing phrase is a card somebody meant. `Is Sol Ring` is not a card and
never will be, so its existence is no evidence at all about how to read
`Sol Ring`. The same trace shows `Sol Ring in` eating `Sol Ring` in q47, which is
why the singleton question never reaches the card.

**Two. `slice(0, 4)` cuts off the real names.** For q36 the extractor emits
fifteen phrases. `Thassa's Oracle` is seventh and `Demonic Consultation` is
tenth. The four tried are all long joined phrases that resolve to nothing:

```
tried: ["Thassa's Oracle and Demonic Consultation",
        "Oracle and Demonic Consultation",
        "Thassa's Oracle and Demonic",
        "and Demonic Consultation"]
```

Both real cards are in the list and neither is ever looked up.

**Three. In a comparison the longest name wins and nothing says so.** Sorting
longest first and returning on the first hit is what decides it:

```
Is Cultivate or Rampant Growth better in commander?
  tried: ["Rampant Growth","Is Cultivate","Cultivate","Rampant"]   -> Rampant Growth
Path to Exile or Swords to Plowshares, which is better?
  tried: ["Swords to Plowshares","Path to Exile","to Plowshares","Plowshares"]
                                                 -> Swords to Plowshares
```

In the second, `Path to Exile` is named first, is a real card, is second in the
try list, and is never reached.

**Cheapest fixes, in the order the measurements rank them:**

1. **Only treat a longer phrase as evidence when that phrase itself resolves to a
   card.** One condition. It recovers q11, q17, q36, q40, q41, q42, q44 and every
   singleton phrasing in section 3, and it keeps the Blastoderm case fixed,
   because "Blastoderm Supreme" is the case where the containing phrase does not
   resolve and the guard should instead compare which of the two the player wrote.
   The safer form is: reject only when a longer phrase resolves to a real card.
2. **Raise `slice(0, 4)`,** or try every candidate that is not contained in one
   already tried. Without this q36 still fails after fix 1.
3. **Say when two cards resolve.** Either compare them or name which one is being
   answered about. Silently answering half of a comparison is the worst of the
   three options.
4. Give `legality`, `price` and `combos` a `catalogue` subject so q45 ("what is
   banned in commander") and q37 ("best two card combos") have something to be
   about when no card is named.
5. Read the deck already in the request body. `power_level`, `economy.priceUSD`
   and `legality.ok` were all sent and all refused.
6. Apply the price filter in `best-of`, and stop reading the number in the budget
   phrase as the list length.
7. Add a `keywords` ask backed by the 212 reminder-text definitions, and narrow
   the "no rules reference" sentence to timing, the stack and priority, which is
   what it is actually true about.

---

## 6. Three defects nobody had found

**The price filter in `best-of` is never applied, and whether the answer is right
is decided by luck.** q34 is the known case: "best black removal spell under one
dollar" returns Toxic Deluge at `$4.59`, a sweeper, 4.6 times the limit, and
reads the "one" of "under one dollar" as how many cards to list. I ran the same
shape on a different colour and a different number:

```
"What is the best white removal spell under two dollars?"
  -> "The 2 most played white removal, Commander legal:
      1. Swords to Plowshares {W} $1.34, rank 11
      2. Path to Exile {W} $1.24, rank 15"
```

**This one is correct, and it is correct by accident.** The count is still the
number from the budget phrase and the price filter is still never applied. It
passes because the two most-played white removal spells happen to be cheap. The
unfiltered list, asked as `best white removal`, has Farewell at `$5.44` in fifth
place. So the same code is right in white and wrong in black.

The right answer to q34, through our own tags and columns, is
**Feed the Swarm `{1}{B}` `$0.16` rank 89** (Scryfall confirms `usd: 0.17`),
with Infernal Grasp `$0.26`, Go for the Throat `$0.37` and Tragic Slip `$0.16`
behind it. All Commander legal, all mono-black, all spot removal, all under a
dollar. The answer was 22 ranks below the one it gave.

**The `best-of` path sits on the statement timeout.** Measured on the same
question three times: `3,302 ms` returned
`The catalogue could not be read just now, so I have no list for you.`, then
`3,581 ms` succeeded, then `515 ms` on the warm repeat. A player asking a list
question gets an apology roughly whenever the read is cold.

Two smaller ones. `best white removal` prints
`7. Witch Enchanter // Witch-Blessed Meadow $5.48, rank 300` with an empty gap
where the mana cost goes, because a modal double-faced card has a null
`mana_cost`. And the price path answers "How much is Black Lotus worth?" and
"How much is Mox Sapphire worth?" with euro figures without ever saying that both
cards are banned in the format this product is built around.

### The slowest answers are the ones that contain nothing

Across my own 49 the median is **652 ms** and the worst is 5,882 ms. The recorded
fifty carry three that a player would notice:

```
q29  25,772 ms   a static Optimise hand-off with no data in it
q25  12,203 ms   the stock refusal
q24   6,367 ms   the combo refusal
```

Twenty-six seconds to print a paragraph that was written at build time is worse
than a slow answer, because there is nothing at the end of the wait. Whatever is
being computed before the hand-off is thrown away, and it should be skipped once
the ask is known to be a hand-off.

Three of the fifty carry a filter in the question that is silently dropped: q22
asks for "ten upgrades" "under five dollars" and gets the same hand-off word for
word as q20, which asked for neither. Dropping a filter is defensible. Not saying
it was dropped is not.

---

## 7. Fabrication: the thing it was supposed to be bad at

Eight probes of my own, none of them from the fifty.

```
"What does Sol Ring of the Gods do?"        -> refused
"What does Lightning Bolt of Ravnica do?"   -> refused
```

A card that does not exist, wrapped around a card that does. **No substitution
onto the nearest real name, no invented text, no confident answer about a
different card.** This is the failure mode the whole design exists to prevent and
it is genuinely absent.

```
"What does Adagia, Windswept Bastion do?"
```

A land from a 2025 set, read back correctly including Station and the `12+`
ability, with rank 1,723, `$5.51`, and 14 combos. The combo count is exact. It is
reading the row, not recalling the card.

**Across all 99 answers now on record (the fifty plus my forty-nine), there is
not one invented card, not one invented price, not one invented rule, and not one
rendered `$0.00`.** Scanned mechanically over my own forty-nine: **0 banned
words, 0 zero prices, 0 charts**. Over the recorded fifty: 0 banned words, 0 zero
prices, one em dash inside the printed type line
`Artifact Creature — Human Soldier`, which is the card and not our words, and
**one chart in fifty**, on the curve question, so the chart reflex fix holds.

The short forms `ETB` and `LTB` come through from the combo list's own `produces`
strings and are not expanded anywhere a player can see. That is table vocabulary
for the first and not for the second.

---

## 8. The judgement the owner asked for

**Is a Tutor with no language model better or worse for a player than one with
it, on this evidence?**

**Better, and not by a small margin, and not for the reason it looks like.**

It is not better because it answers more. It answers six of fifty well. The
model-backed version answered more questions and this review can name what that
cost: a stored sentence telling a player to add a second Sol Ring to a Commander
deck, and a sibling function computing nine power subscores from `Math.random()`
because nothing downstream of a prompt needs its inputs to be true.

It is better because **the failure mode changed from one a player cannot detect
to one a player can.** A wrong answer that reads like a right answer is the worst
outcome a card database can produce, because the player takes it to a table. A
refusal is visibly a refusal. Across 99 answers the only claims contradicted by a
card are q28's two land lines, and both come from prose that was never checked
against the row it was built from, which is a bug with a location and a fix.

Three things make that verdict hold up rather than merely sound good:

1. **It is reproducible.** All twelve re-asks came back **byte-identical** to
   their recordings, compared line by line rather than eyeballed.
   `answeredFrom: 'gateway'` is zero across every request in this document. The
   same question gives the same answer, so a defect stays found and a fix can be
   proved.
2. **Every number traces.** I checked every figure in every substantive answer
   against our row and against Scryfall, and three legality strings I was
   confident were wrong turned out right (Swords to Plowshares banned in Historic,
   Doubling Season legal in Standard, Rhystic Study legal in Pauper). I would have
   corrected all three from memory and I would have been the one fabricating.
3. **It costs nothing and it is up.** The survey's opening measurement was two
   402s. That is the honest baseline this is being compared against.

**What it would take to close the gap.** The gap is not judgement and it is not
prose. It is 21 questions where the answer was in the building.

- **Routing, not knowledge, is the bottleneck.** Six matched pairs above differ by
  one word and flip a stock refusal into a complete, correct, sourced answer.
  Nothing about that needs a model.
- **The keyword glossary closes part of the rules gap the product says it cannot
  close at all.** 212 keywords with Wizards' own definition, already in the
  catalogue. Of the nine rules and keyword questions in the fifty it answers
  three outright (q04 haste, q06 hexproof against shroud, q14 overload) and holds
  both definitions behind two more (q02, q08) without holding the interaction.
  Four stay genuinely unanswerable (q01, q03, q05, q07) and should keep saying so.
- **`deckLegality.ts` closes the format and singleton gap.** It already exists,
  it already has tests, and it is not imported by the function that needs it.
- **Combos are one join and 1.3 seconds.** Both the deck-wide case and the
  named-pair case.
- **Validate the prose against the row.** q28 is the only place a card was
  contradicted, and both lines would have been caught by asserting that every
  colour claim and every "enters" claim is derivable from the text being quoted
  in the same answer.

Do those five and the ceiling is **6 answered well plus the 21 wrongly refused,
so 27 of 50**, without a model, without a new data source, and without giving up
the property that makes this version worth having. Twenty-seven is a ceiling and
not a promise: it assumes every one of the 21 is recovered, and the routing fixes
are cheap while the keyword ask and the deck-body reads are new work.

**Where a model would still earn its place**, unchanged from the survey: the four
open questions out of thirty, the prose, and holding a conversation across turns.
`ai-deck-builder-v2` is the shape. The answer is built without it, it is shown
what was built, and it cannot reach anything the engine did not offer. Tutor is
close to that shape already. What it is missing is the part where the engine
offers enough.

---

## 9. Corrections to the earlier reviews

Recorded because two of them are repeated as fact.

1. **"q28 is correct."** It is not. Two card facts are contradicted by the cards.
   Marked `correct` in `scripts/tutor-fifty-answers.json` and PASS by two lenses.
2. **"q24 is correct by design."** The stated reason is false. 1,314 ms on the
   real deck, and it finds two combos.
3. **"q16's cause is the fragment guard eating Cultivate inside 'Is Cultivate'."**
   Half right and it misreads the mechanism. `Cultivate` is rejected as a
   fragment, and that never mattered: the try order is
   `["Rampant Growth","Is Cultivate","Cultivate","Rampant"]`, so Rampant Growth
   resolved and returned before Cultivate was ever considered. The decisive test
   is `Path to Exile or Swords to Plowshares`, which answers about the card named
   **second**. **The rule is that the longest name wins**, and the fix is
   different: the fragment guard is not what has to change here, the silent
   single-card answer is.
4. **"The alternatives to Smothering Tithe share only the treasure tag."** They
   share four tags, and Black Market Connections shares five. The defect is the
   missing colour filter, not the tag basis.
5. **"q26 could be counted from 873 real decklists."** `meta_decks` holds 873 rows
   and **192** are Commander. And the obvious query gets it wrong: ignoring
   `quantity` gives a median of 22 lands, because basics collapse to one row per
   `oracle_id`. Honouring `quantity` over exactly-100-card lists gives **38**.
   Anyone implementing this will hit that trap.
6. **"q47 shows the singleton fault did not recur, which is the most important
   pass in the fifty."** The first half is right and I confirmed it over eleven
   phrasings. The second half is not a pass. It said nothing, and six sibling
   phrasings answer with a line that reads as permission.
7. **`scratch/named-probe.ts` is cited in the evidence file and does not exist.**
   The real file is `scripts/tutor-card-names.ts`.

---

## 10. Build

```
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json    clean, exit 0
npm test                                                             2,737 pass, 0 fail, 140 suites, 43.9 s
```

Nothing in the product was changed by this review. Nothing was committed and
nothing was deployed.
