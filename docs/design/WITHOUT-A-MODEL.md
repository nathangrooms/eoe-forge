# What the language model actually contributes

Measured 29 Aug 2026. Nothing in this document was changed. It is a survey.

The owner, asked what the deck coach and Tutor should run on now that the gateway
is out of credits: *"they should run automatically through our engine, I dont want
to use any LLM we have so much knowledge?"*

This answers the second half of that sentence, which is a question and deserves a
measured answer rather than a yes. It reports, for every call site, what goes into
the prompt, what comes back, and how much of what comes back we had already worked
out before we asked.

---

## 0. The state that makes this urgent, re-measured today

```
POST https://udnaflcohfyljrsgqggy.supabase.co/functions/v1/mtg-brain
  -> 402 in 0.29 s   {"error":"AI credits are exhausted for this workspace.","type":"payment_required"}

POST https://udnaflcohfyljrsgqggy.supabase.co/functions/v1/gemini-deck-coach
  -> 402 in 1.03 s   {"error":"Payment required, please add credits to Lovable AI workspace."}
```

Both taken with the project's publishable key against the live deployment.

Two things fall out of those two lines before any analysis starts.

**The deployed Tutor is older than the repo, again.** The repo returns
`Tutor is unavailable right now. This is our end, not yours.` on a 402. The live
function returns `AI credits are exhausted for this workspace.` Those are different
strings, so the deployed code is not this code. Section 10c of CLAUDE.md records
exactly this trap on exactly this function. It has recurred.

**Both live refusal strings break the copy rules.** Both contain the two letters
the ban list exists to prevent, and the coach's names a third party's billing page
at a player. Neither is fixable by the player.

---

## 1. The four call sites, plus four the brief did not list

Every model call in the project goes through `ai.gateway.lovable.dev`, so all eight
are down together.

| Function | Reached from the app? | What the call is for |
|---|---|---|
| `mtg-brain` | Yes, invoked from 6 files | Tutor, the chat surface |
| `deck-optimizer` (line 2258) | Yes, `AIOptimizerPanel` | Choose from a ranked pool, write the prose |
| `ai-deck-builder-v2/pipeline.ts` (line 1188) | Yes, `AIBuilder` | Choose ids from a ranked shortlist |
| `gemini-deck-coach` (lines 264, 1113) | **No caller anywhere in `src/`** | Dead |
| `ai-deck-builder-v2/admin-config.ts` | n/a | A model id string, not a call |
| `dsl-compile-batch` | **Deliberately unreachable from the app** | Builds knowledge offline |
| `scan-card-ai` | Yes, `visionFallback` | A photograph to a card name |
| `generate-art` | Yes, admin Art Studio | Images |

`gemini-deck-coach` appears in `src/` only twice, both in `admin/AISystemAdmin.tsx`
and `admin/PromptEditor.tsx`, which display a prompt for editing. Nothing invokes
the function. Its deck-building path had already been switched off inside the
function itself before that: line 160 reads
`console.log('Skipping Gemini coaching to avoid timeout, using optimized initial deck')`.

`scan-card-ai` is the one call in the list that our data cannot replace. A photograph
to a card name is an image problem, and we hold no image understanding. It is out of
scope here and should stay a model call.

`dsl-compile-batch` is the opposite case and the distinction matters more than any
other in this document. It is a model call that **produces** engine knowledge rather
than consuming it, and its own header says nothing in the app may ever call it. It
has run barely at all: `llm_ability_compilations` holds **93 rows** against 33,032
unique cards, and the app does not read that table.

---

## 2. `deck-optimizer`: what goes out, what comes back, what we already knew

### What is put in the prompt

Everything below is computed by our own code before the request is sent, and printed
into the message the model reads.

- The deck, every card by name and quantity.
- **Cut targets, weakest first**, from `evaluateUserDeck` through `toSwapTargets`.
  Each carries a written reason and a castability figure, or an explicit marker that
  no figure exists.
- **The candidate pool**, `rankCandidates`, every entry with name, type, mana value,
  price, tags **and the ranker's own sentence explaining its position**. That sentence
  is assembled by `buildReason` from whichever of **eight** scoring signals fired:
  `role-gap`, `commander-fit`, `archetype-fit`, `tag-synergy`, `curve-fit`,
  `castability`, `popularity`, `budget-fit`.
- **Land candidates**, `rankLands`, each with the colours it makes, whether it enters
  tapped, its price and its reason.
- Role counts against role targets, mean mana value, deck themes from tags, land count
  against the format target, the fill plan, the collection.

So the model is handed a ranked list of real cards, each already carrying the reason
it is there, and asked to pick from it.

### What is asked back

One tool call, `deck_analysis`, with **39 leaf fields**.

### What the caller does with it

Every card name is re-validated against the pool or the deck list and dropped if it is
in neither. `issues` is re-resolved against the deck. Prices, art and ownership are
re-attached from the catalogue. Category scores fall back to `measuredCategories`.
`landReplacements` and `basicFiller` are computed after the answer arrives and are never
taken from it.

### The classification, all 39 fields

**ALREADY OURS: 29 fields.** We compute a real answer for each of these before the call
and the model is asked to produce it again.

| Field | Where we already have it |
|---|---|
| `summary` | `engineSummary(profile, args)` |
| `categories.synergy` .. `.manabase` (5) | `measuredCategories(profile, landCount, idealLandCount)` |
| `currentPowerLevel` | `evaluation.power.score`, returned in the same response as `power.score` |
| `manabase[].text` | `manabaseNote(args)` |
| `additions[]` name, reason, type, category, priority (5) | `engineOnlySections`, off `rankCandidates` |
| `removals[]` name, reason, priority (3) | `engineOnlySections`, off `swapTargets` |
| `replacements[]` remove, removeReason, add, addBenefit, addType, synergy, category, priority (8) | `engineOnlySections` |
| `landRecommendations[]` type, name, reason, priority, category (5) | `engineOnlySections`, off `rankLands` and `LandGrounds` |

`currentPowerLevel` is worth pausing on. The response already carries `power.score`,
`power.band`, `power.bracket` and nine subscores from the one canonical evaluator, and
`currentPowerLevel` is a second, unvalidated number for the same thing, taken from the
model and never checked against ours. That is the five-competing-power-fields problem
from the design law, still alive in one field.

**DERIVABLE: 9 fields.** We hold the data and do not currently compute them.

| Field | What it would take |
|---|---|
| `projectedPowerLevel` | `evaluateUserDeck` on the deck with the swaps applied. The evaluator is already imported into this file. |
| `additions[].edhImpact`, `removals[].edhImpact`, `replacements[].edhImpact` (3) | The same evaluation with one card changed, differenced. Today all three are `null` and the code comment says plainly that nothing here measures it. |
| `issues[].card`, `.reason`, `.severity`, `.category` (4) | `swapTargets` already carries the card and the reason. `severity` has an objective source in the castability figure. `engineOnlySections` returns `issues: []` and says in a comment that an empty list is the honest way to say it has no opinion, which is true today and need not stay true. |
| `strengths[].text` | Roles at or above target, plus `evaluation.power.subscores[].holdingBack` and `.note`, which already say which subscores are not the problem. |

**GENUINELY GENERATIVE: 1 field.** `strategy[].text`. How to pilot the deck and where
the decision points are. Parts of it are derivable, but the useful part is judgement.

**29 already ours, 9 derivable, 1 generative.**

### The finding that matters most in this file

The engine-only path is finished, and **the current outage is the one failure mode that
bypasses it.**

`optimise()` returns early on `payment_required` (line 672) and the handler turns that
into an HTTP 402 (line 253). `engineOnlySections` is only reached when
`model.kind === 'failed'`. A 402 is not `failed`. So today, with the workspace out of
credits, the panel shows
`AI credits required. Please add credits in Settings -> Workspace -> Usage.`
and the player never sees the ranked pool, the cut list, the land swaps or the power
score that the server had already computed by that point.

`aiUsed` and `fallbackUsed` are real and correct. They are just unreachable from the
failure we actually have.

---

## 3. `ai-deck-builder-v2`: the model has the smallest job in the codebase

The pipeline builds the deck **first**, with no model involved, then shows the model
the top of its own ranking and asks which of those cards belong.

What it may return: `include` and `exclude` as lists of oracle ids, plus `strategy`,
`winConditions` and `warnings` as prose.

What happens to that: an id not on the shortlist is dropped and counted in `rejected`.
The accepted ids become `preferOracleIds` and `avoidOracleIds` on a second
`generateDeck` call, where they act as a **stable reordering within each role pass**
(`orderPreferredFirst`) and a hard filter. They do not change any score. If the plan is
null, or returns nothing usable, the baseline deck stands and the change log says
`Built without a planner: the ranking alone chose every card`.

Classification of its 5 returned fields: `include` and `exclude` are **ALREADY OURS**
as data (they can only name cards we ranked and offered); the model contributes an
ordering preference. `strategy`, `winConditions` and `warnings` are
**GENUINELY GENERATIVE**, and `winConditions` is arguably derivable from the `wincon`
role.

**2 already ours, 3 generative, and the build never depends on any of them.** This is
already the shape the owner is asking for. It is the reference.

---

## 4. `gemini-deck-coach`: not merely replaceable, actively harmful

Two call sites, no caller, and a third problem underneath them.

`analyzeWithEDHCalculator` at line 1027 is the function that produces the power score,
the band and all nine subscores for that whole file:

```
const mockPower = 4 + Math.random() * 4;
subscores: { speed: Math.random() * 100, interaction: Math.random() * 100, ... }
playability: { keepable7_pct: 60 + Math.random() * 30, ... }
drivers: ['Synergistic commander', 'Good mana base'],
drags: ['High average CMC', 'Limited interaction'],
```

Every number is invented and the three lists are constants. Those invented numbers are
then written into the prompt at line 271 as the evidence the model is asked to reason
from, so the analytics answer is a model reading dice and the deck-build answer reports
a random power level as its own. This is the "nothing fabricated" rule broken at the
source rather than at the surface, and the fact that nothing calls the function is the
only reason it has not reached a player.

Classification: **0 already ours, 0 derivable, 0 generative, because there is nothing
here to keep.** `evaluateUserDeck` is the real implementation of exactly this and lives
two functions away in a different file.

---

## 5. Tutor: what it returns, and the honest version of the hard question

### The response

| Field | Verdict |
|---|---|
| `visualData.charts` | **ALREADY OURS.** `chartsFor()` draws both charts from the deck summary with no model involved, and a chart the model draws that the question did not ask for is discarded server-side. |
| `cards` | **ALREADY OURS as data.** Names are read out of the prose and resolved against `cards`; a name that resolves to nothing is silently dropped. The model chooses which names appear, and the catalogue supplies everything about them. |
| `visualData.tables` | **DERIVABLE** for the cut-and-play case, which the optimiser already produces. |
| `message` | **GENUINELY GENERATIVE.** |

### The prompt is already mostly an answer

For a land question, `mtg-brain` computes and prints, before asking anything: every
land in the deck with what it taps for, `gradeLands` verdicts, `upgradeTargets` worst
first, and a shortlist from `findLandCandidates` of lands making two or more of the
deck's colours that it does not already run, ordered by how much Commander plays them.

Read the one real cut answer we have (2026-08-22) against that. Every bullet is a land,
and every reason is "enters tapped" or "makes colours you do not play". That is
`gradeLands` restated in sentences.

### The real questions, with the denominator stated

`tutor_messages` holds **5 user questions across 4 conversations**, 19 Aug to 29 Aug.
That is the entire corpus. It is not enough to decide anything, and it must not be
quoted as though it were.

Worse for our purposes: **3 of the 5 are canned chips**, matched verbatim to prompt
strings in `Tutor.tsx` at lines 82, 103 and 167. Only two were typed.

| # | Question | Deck attached | Verdict |
|---|---|---|---|
| 1 | "What are the best upgrade cards for my deck? Consider both budget and high-end options." (chip) | yes | ALREADY OURS |
| 2 | "you said out for a lot, but no ins?" (typed) | yes | see below |
| 3 | "What cards should I consider cutting from my deck and why?" (chip) | yes | ALREADY OURS |
| 4 | "Explain this card in plain terms: what it actually does, and when it is good." (chip) | no | GENUINELY GENERATIVE |
| 5 | "whats a good 3 mana counterspell card" (typed) | no | DERIVABLE, and proved below |

Question 2 is the interesting one and it does not fit the buckets. It is a repair turn.
The previous answer was cut off mid-list and the player asked it to finish. The
substance it wanted, cut paired with play, is something `engineOnlySections` and
`pairLandSwaps` produce whole and never truncate. So the failure it was repairing is a
failure a report does not have. But noticing that a list was cut off, and knowing that
"no ins?" refers to it, is conversation, and that is real.

Question 5 is answerable with one statement. Run today against the live database:

```sql
select name, mana_cost, edhrec_rank, prices->>'usd'
from cards_unique
where tags @> array['counterspell'] and cmc = 3
  and legalities->>'commander' = 'legal' and edhrec_rank is not null
order by edhrec_rank limit 10;
```

```
Fierce Guardianship  {2}{U}   rank 82    $57.58
Force of Negation    {1}{U}{U} rank 266   $46.82
Boromir, Warden of the Tower {2}{W} rank 849 $6.50
Unwind               {2}{U}   rank 1062  $1.13
Flare of Denial      {1}{U}{U} rank 1425  $3.22
Archmage's Charm     {U}{U}{U} rank 1746  $1.69
Disallow             {1}{U}{U} rank 1821  $0.43
Refute               {1}{U}{U} rank 1908  $0.24
Cancel               {1}{U}{U} rank 2051  $0.06
Invert Polarity      {U}{U}{R} rank 2203  $0.50
```

That is a better answer than prose, it is sourced, and nothing in the product serves
it today because `rankCandidates` needs a deck to rank against.

### The fallback that already exists renders blank

Questions 4 and 5 both arrived after the credits ran out and both got the same stored
answer, twice, from the database:

> "That question could not be answered just now. Here is what your deck holds, counted
> from the list itself:\n\n\n\nPlease try again in a moment."

`Tutor.tsx` line 546 builds that string from `selectedDeck.counts` and
`selectedDeck.power`. Neither question had a deck attached, so both interpolations were
empty and the middle of the message is literally nothing. The fallback is deck-only, and
the two questions it has ever had to answer were both card questions.

---

## 6. Which questions we can answer without a model, with a denominator

The 5 real questions are too few. The honest larger denominator is the set of prompts
**the product itself puts in front of players**: 18 quick actions and 12 example
prompts in `Tutor.tsx`, **30 in total**. Three of the five real questions came from that
set, so it is not hypothetical.

The line drawn here is strict. **ALREADY OURS** means the engine computes it today.
**DERIVABLE** means the data is in the database and no code turns it into an answer.

### ALREADY OURS: 9 of 30

Analyse the deck; suggest upgrades; what to cut; what makes a good Commander deck and
its ratios; build on a budget; which formats is it legal in; what are the best ramp
cards; is my mana base optimal; how does EDH power level work.

Every one of these is a function that runs now: `evaluateUserDeck`, `rankCandidates`,
`toSwapTargets`, `deriveDeckShape`, `gradeLands`, `findLandCandidates`, `generateDeck`,
and `cards.legalities`.

### DERIVABLE: 9 of 30

Find the combos in my deck; format staples by colour; which cards synergise with this
one; alternatives to this card, cheaper and stronger; is it worth a slot; how do I
answer it across the table; best removal in black; budget alternatives to a named card;
what is my win condition.

What backs them, counted today:

```
meta_combos             61,500      meta_combo_cards   204,297
meta_card_pairs         24,165      meta_card_inclusion 14,145
cards_unique            33,032      with rules text     31,833
  tagged                33,010      with a popularity rank 32,067
  with a USD price      32,449      Commander legal     31,829
```

Proof that combos are one query away, run against a real user deck today
(Atraxa superfriends, 92 distinct oracle ids):

```
Zameck Guildmage + Yahenni, Undying Partisan
  -> Infinite creature ETB, LTB, sacrifice triggers, death triggers
Yuna, Grand Summoner + Yahenni, Undying Partisan
  -> Infinite creature ETB, LTB, sacrifice triggers, death triggers
```

Two complete combos, named, with what they produce, and nothing in the product shows
them.

### GENUINELY GENERATIVE: 4 of 30

How should I pilot this deck; explain this card in plain terms and when it is good;
what is the best way to abuse this; how do I deal with aggro decks.

On "explain this card in plain terms", the tempting answer is that we have a compiler
and can render the record back. We can, and it does not help. `render.ts` says so in its
own header: it emits **oracle vocabulary, not English**, deliberately, because it is a
measuring instrument for round-trip checking. Rendering a card's record gives the player
back a paraphrase of the text already printed on the card they are looking at. "When it
is good" is not in the record at all.

### NOT ANSWERABLE FROM WHAT WE HOLD: 8 of 30

How does my deck perform in the current meta; what are the current top strategies and
commanders; explain how the stack and priority work; explain combat damage steps; rules
interactions and misplays with this card; explain the main archetypes; which commanders
want this card; is there a strictly better card.

Two separate gaps, and they need different answers.

**No rules corpus.** The database has **82 base tables and not one of them holds rules
text, rulings or a glossary.** `cards` has 39 columns and none of them mentions rulings.
Four
of the eight are rules questions. A model answers them from general knowledge, and we
have no substitute. We could write the common ones once as static pages, which is a
content job, not an engine job.

**No meta and no per-commander corpus.** Measured today, `meta_card_inclusion` and
`meta_card_pairs` hold **`scope_kind = 'format'` only, 2 scopes, largest denominator 552
decks**. There is no commander scope, exactly as the 30-deck floor rule predicted, because
precons give roughly one deck per commander. So "which commanders want this card" and
anything about the current meta cannot be answered honestly. Saying so is the correct
product behaviour and is cheaper than a model inventing it.

### The split

| | count | share of 30 |
|---|---:|---:|
| ALREADY OURS | 9 | 30% |
| DERIVABLE | 9 | 30% |
| GENUINELY GENERATIVE | 4 | 13% |
| NOT ANSWERABLE FROM WHAT WE HOLD | 8 | 27% |

Read it as: **60% of what the product invites a player to ask, we can answer from our
own data**, half of that today and half after work that needs no model. **13% is real
judgement.** The remaining **27% we cannot answer honestly with or without a model**, and
today a model answers them anyway, which is worse than not answering.

---

## 7. What the model adds, stated plainly

Across all four call sites the brief named, once the already-computed inputs are
subtracted, what is left is:

1. **Selection order.** Choosing 15 from a ranked 200, or reordering a shortlist. Our
   ranking already produced a defensible order and the model reorders it on judgement
   we cannot inspect and do not validate.
2. **Prose.** Turning the ranker's joined signal details into a sentence a player enjoys
   reading. This is the real contribution and it should not be dismissed. `engineSummary`
   assembles its summary as
   `<n> cards counted, mean mana value <x>. <n> lands against <n> for the format. Short
   of: <role n/n>, ...` followed by a line saying the suggestions came from the in-house
   engine. That is true, complete and flat.
3. **Judgement on open questions.** 4 of 30 prompts, and roughly 1 of 39 optimiser fields.
4. **Conversation.** Following "no ins?" back to the previous turn. One of five real
   questions needed it.

Against that, three costs measured here rather than argued.

It is **down right now** and both questions asked since 28 Aug got the blank fallback.

It gets things wrong that our own columns settle. Stored verbatim in `tutor_messages`,
in a deck whose `format` column reads `commander`:

> "**Out:** Wretched Banquet. **In:** Mystic Remora. This is already in your deck, but
> you only have one copy. You could add another copy if you want more card draw."

That is the singleton rule, in the one format the whole product is built around. The
optimiser has a hard rule against exactly this, printed into its prompt as rule 2, and
a validator behind the rule. Tutor has neither, because Tutor's answer is prose and
prose is not validated.

And it is the reason `gemini-deck-coach` was ever built on nine random numbers. A
function whose job is to feed a prompt does not need its inputs to be true, and nobody
noticed for as long as a model was reading them.

---

## 8. The honest recommendation, in order of how cheap the win is

Nothing below was done. Each is a separate piece of work.

1. **Stop the 402 bypassing the finished fallback.** `deck-optimizer` should treat
   `payment_required` and `rate_limit` the way it treats `failed`, and return the engine
   sections it had already computed. This is the largest gain for the least code in the
   whole survey, and it is the difference between the optimiser working today and not.
2. **Deploy the repo.** The live Tutor is not this code, by its own error string.
3. **Delete `gemini-deck-coach`, or repoint it at `evaluateUserDeck`.** Nothing calls it
   and it manufactures nine random subscores.
4. **Give Tutor a no-deck fallback.** The one it has renders an empty message, and both
   questions it has faced had no deck. Catalogue questions like question 5 are a query,
   not a conversation.
5. **Compute the 9 derivable optimiser fields**, starting with `projectedPowerLevel` and
   `edhImpact`, which are one extra `evaluateUserDeck` call each and would let the panel
   stop rendering blanks.
6. **Surface the 9 derivable Tutor answers**, starting with combos, which are one join
   away and are currently invisible.
7. **Keep a model, if one is kept at all, for the 4 open questions and the prose**, and
   nowhere else. That is the `ai-deck-builder-v2` shape: the answer is built without it,
   it is shown what was built, and it cannot reach anything the engine did not offer.
8. **Say "we do not hold this" for the 8 we cannot answer.** That is not a downgrade. A
   made-up meta share is worse than a straight refusal, and the product already has the
   habit: `mtg-brain` withholds the colour breakdown rather than guess when a land cannot
   be classified.

Removing the model from the optimiser and the generator is honest. Removing it from
Tutor entirely is a downgrade on 4 of 30 prompts and on the ability to hold a
conversation, and 5 real questions is not a denominator that can decide it either way.
The 60% is real and is not being served today at all.
