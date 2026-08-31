# Reading every card: the plan, costed and gated

> Written 1 Sep 2026, after measuring rather than estimating. Every number here
> came from a script in `scripts/probe/` run against the real catalogue, and the
> script is named beside it so it can be re-run rather than believed.

The owner's brief: *"This needs to be 100% accurate, 100% inclusive of all
dictionary options and also use as little usage as possible without mistakes. We
cannot afford to make any mistakes here."*

Three of those four are achievable and one is not, so this document states the
difference plainly before anything else.

- **100% inclusive of the dictionary** — achievable, and easier than it looks.
- **Minimum usage** — achievable, measured at 11.8M tokens rather than 39M.
- **Reversible without damage** — achievable, and non-negotiable.
- **Zero mistakes** — NOT achievable, by anyone, including the compiler. What is
  achievable is that every mistake is *detectable* and *reversible*. A plan that
  promises no mistakes is a plan that will hide them.

---

## 1. The dictionary is not thousands of choices. It is 95

The concern was *"there are thousands of dictionary options, are we confident we
will take the time to check every single one"*. Measured with
`scripts/probe/assignment-cost.mjs`:

| prefix | words | who decides it |
|---|---:|---|
| `sub:` | 347 | the type line. Deterministic. |
| `cares:sub:` | 210 | a word scan for subtype names in the text |
| `kw:` | 152 | Scryfall's own `keywords` array, plus the ability-word scan |
| `type:` | 9 | the type line |
| `rec:` | 2 | the compiler describing itself. Never assigned. |
| **derived** | **720** | **no reading required** |
| `tok:` | 75 | the NAME of a token the sentence already prints |
| `ctr:` | 30 | the NAME of a counter the sentence already prints |
| **extractable** | **105** | **regex, verified at 100%** |
| `eff:` | 36 | **a reading** |
| `trig:` | 17 | **a reading** |
| `cost:` | 19 | **a reading** |
| `cares:type:` | 9 | **a reading** |
| `cares:zone:` | 6 | **a reading** |
| `acost:` | 4 | **a reading** |
| `mana:` | 3 | **a reading** |
| `scope:` | 1 | **a reading** |
| **judgement** | **95** | |

**The 105 extractable ones were verified, not assumed.** For every `tok:` and
`ctr:` facet the compiler has ever emitted, the name appears verbatim in that
card's own rules text: **1,532 of 1,532** and **1,662 of 1,662**. "Create a
Treasure token" contains the word Treasure. So those become extraction, not
judgement, and they cannot be got wrong by a reader who never sees them.

**95 words fit in a prompt, in full, every time.** That is what makes "100%
inclusive" real: there is no sampling of the vocabulary and no risk that a rare
word is never offered. Every reading sees the entire judgement vocabulary.

---

## 2. The work is 10,137 readings, not 33,032

| | cards | |
|---|---:|---|
| carry rules text | 31,833 | |
| already have judgement words from the compiler | 20,437 | **do not touch these** |
| entirely keyword text (`flying`, `trample, vigilance`) | 621 | already fully described by `kw:` |
| **real text, no judgement word** | **10,775** | the work |
| distinct texts among them | **10,137** | two cards printing the same text are one reading |

Deduplication saves less than it looks (638 readings) because the repeated texts
are mostly the keyword-only cards already excluded. It is kept because it is
free.

### Cost, at a measured rate

A single agent assigned 120 cards for **139,981 tokens** on 1 Sep 2026, which is
**1,167 tokens per reading** including reading the vocabulary once for the batch.

| | readings | tokens |
|---|---:|---:|
| every card with rules text | 31,833 | 37.1M |
| only cards with no judgement word | 11,396 | 13.3M |
| ...minus keyword-only, deduplicated | 10,137 | **11.8M** |
| ...**twice, for an independent second opinion** | 20,274 | **23.7M** |

For scale: six workflows on 31 Aug produced one landed patch worth 43 cards and
cost roughly 30M. **The whole assignment, done twice, costs less than one day of
what has already been spent.**

---

## 3. Do not touch the 20,437 the compiler already reads

This is the single most important safety rule and it answers *"if we do manual
assignment of every card, it's going to destroy our dictionary as is"*.

The compiler works from a parsed structure. When it says a card draws two cards,
it is **right**, because it read a `draw` effect with a count of 2. Assignment
works from a reading, and was measured at **93.0% precision**. Running assignment
over a card the compiler already understands trades a correct word for a 93%
word.

So the precedence is absolute and one-directional:

```
compiler word exists  ->  the compiler wins, always
compiler is silent    ->  the assignment fills the hole
```

Assignment can only ever ADD to a card that had nothing. It can never overwrite,
and it can never remove.

---

## 4. Nothing is overwritten. Ever

`card_facet_memo` is not touched by any of this. Assignment writes to a separate
table:

```
card_assignments
  oracle_id        the card
  facets           the words assigned
  evidence         PER WORD, the sentence it was read from
  model_pass       1 or 2
  assigned_at
  agreement        set when pass 2 lands: agree | disagree | pass-2-only
```

Three consequences, all deliberate:

- **The existing dictionary survives untouched.** If every assignment is wrong,
  deleting one table restores today exactly.
- **A word can be traced.** `evidence` holds the sentence the reader claims to
  have read it from, so a wrong `eff:exile` on Ad Nauseam is auditable rather
  than an opaque label. This is the single cheapest defence available and it was
  missing from the first design.
- **The merge happens at READ time**, in `facetsForCard`, with compiler
  precedence. Turning the whole thing off is one flag.

Before the first write: `pg_dump` of `card_facet_memo` and `cards_pool` to
`scratch/`, because a backup nobody took is a rollback nobody has.

### The marker, the date, and the alert

Owner: *"we need to ensure the database column for each card has a marker if
it's been manually assigned or not"*, *"also the date they were gone through"*,
and *"in admin we also need an alert for new cards which have not gone through
this process so we can do it as soon as new sets release and we can be first to
market"*.

**`assigned_at` IS the marker.** A row in `card_assignments` means the card has
been gone through and says exactly when; no row means it has not. One fact in
one place, rather than a boolean that can drift out of step with the data beside
it.

It is deliberately NOT a column on `cards`. That table holds every PRINTING and
is rewritten by the nightly sync, so a hand-written column there is a column the
sync fights. Assignment is a fact about the CARD, so it is keyed on `oracle_id`,
the same key the facet memo uses.

`public.assignment_status()` is the alert, and it is live now:

```
cards in the catalogue          33,032
nothing to read (vanilla)          354
the compiler already reads      20,944
need a reading                  11,734
read by hand                         0
STILL TO READ                   11,734
```

**IT GOES UP ON ITS OWN WHEN A SET RELEASES.** A new card arrives in
`cards_pool` through the nightly sync, the fifteen-minute facet top-up gives it
a coverage, and if the compiler could not read it the queue grows with nobody
remembering to look. That is the "first to market" property: the work appears
rather than having to be noticed.

**Vanilla cards are excluded on purpose.** The first version of the function
counted the 354 cards with no rules text as work, which would have left an alert
that could never reach zero, and an alert that cannot reach zero is one nobody
reads twice. That was the same mistake in its third form: the coverage bands
counted those cards as "no record", and the dictionary probe counted them as a
gap.

---

## 5. How a single card is analysed

Every reading gets the same five things and nothing else, because a bigger
prompt is a more expensive prompt and none of the rest changes the answer:

1. `name`, `type_line`, `mana_cost`, `oracle_text`, `power`, `toughness`
2. the **95-word judgement vocabulary**, in full, with one line of meaning each
3. the four rules below
4. what the compiler DID manage to read, if anything, as a constraint
5. permission to say **"I am not sure"** on a word rather than guess

### The four rules

1. **Only what the card says.** Not what deck it goes in, not what it is played
   with, not what the name implies.
2. **Direction matters.** A card exiling YOUR permanent is not a card exiling an
   opponent's. Where the vocabulary has a `-self` or `-own` form, it is not
   optional. This is the exact defect that had Teferi's Protection filed as
   removal on 574 cards.
3. **An invented word is worse than a missing one.** A wrong `eff:exile` tells
   the builder the card is removal and it will spend a real deck slot on a card
   that removes nothing. A missing word only means the card is not offered.
   Precision over recall, every time.
4. **Cite the sentence.** Every word carries the clause it came from. A word with
   no evidence is dropped before it is stored.

### Where the extra research budget goes

The owner asked to *"leave room for additional research on each card if we need
it"*. It is not spent evenly. A reading escalates to a longer look only when one
of these is true, and each is a cheap test:

- the card has **more than 3 paragraphs**, or over 300 characters
- the text contains a **word not in the 95** that looks like a mechanic
- pass 1 and pass 2 **disagree**
- the card is in the **top 2,000 by play rate**, where a mistake is seen

Everything else gets one pass at 1,167 tokens.

---

## 6. How a mistake is caught

Four defences. Two are strong, one is weak, and one is honest about its limits.

### 6a. The compiler is a free answer key. STRONG

9,081 cards are read completely by the compiler from a parsed structure. Running
assignment on them and comparing gives a **measured** error rate on cards nobody
had to hand-check.

Already run once, blind, on a 120-card sample spread evenly across answer size
so it could not be gamed by picking easy cards:

```
precision  93.0%   437 right of 470 claimed
recall     77.8%   437 found of 562 real
exact      37.5%
```

Recall is understated: the test's own vocabulary list omitted `cares:sub:`,
`tok:` and `ctr:`, so the reader could not have produced words the key contained.
Fixed. Scripts: `assignment-answer-key.mjs`, `score-assignment.mjs`.

**The key grows on its own.** Every compiler rule written later moves cards into
the fully-read set, which re-scores their assignments retroactively. The
verification gets stronger without anyone maintaining it.

**Its limit, stated:** it can only test cards the compiler could read, and those
are the easier ones. It will not catch a bias that only appears on hard cards.

### 6b. Two independent passes. MODERATE

Doubles the cost, catches random error well, and **does not catch shared bias**.
If both readers think "destroy" on your own permanent is removal, they agree and
both are wrong. Disagreements are stored, not silently resolved.

### 6c. The deck generator. STRONG, AND THE ONLY ONE THAT FOUND A REAL BUG

Every genuine defect this month was found by building a deck and reading it, not
by a coverage number. Teferi's Protection filed as removal survived a perfect
`coverage: 'full'` score and was caught because a deck came out wrong.

So the loop is: assign, rebuild the seven roster commanders, read the decks.
`scripts/generator-synergy-audit.mjs`, with Syr Vondam already in the roster as
the standing regression.

### 6d. The words most often invented. CHEAP AND WORTH WATCHING

From the 120-card run, in order: `cares:type:creature` (9 times),
`cost:tap-others` (3), `eff:shuffle` (3). The first is exactly the over-broad
word that made the Aristocrats shell reach for Swords to Plowshares. A per-word
invention rate is computed on every batch and a word that spikes stops the run.

---

## 7. The sequence

Each step is gated on the one before, and every gate has a number.

| # | step | gate |
|---|---|---|
| 0 | `pg_dump` the memo and the pool | file exists |
| 1 | Build `card_assignments`, unused | migration applied |
| 2 | Extract `tok:`/`ctr:` by regex | matches the compiler on cards it read |
| 3 | Re-run the answer key with the FULL vocabulary | precision ≥ 93%, recall re-measured |
| 4 | **1,000-card pilot**, lowest play rate first | precision ≥ 90% on the overlap |
| 5 | Read the pilot decks | no card obviously miscategorised |
| 6 | The remaining 9,137, in play-rate order | invention rate per word stable |
| 7 | Second pass, disagreements only | disagreement < 15% |
| 8 | Merge behind a flag, compiler-precedence | generator audit no worse |
| 9 | Turn the flag on | |

**Play-rate order matters and it is deliberately backwards at first.** The pilot
takes the LEAST played cards, so an early systematic error damages the cards
nobody builds with. Once the rate is proven, the order flips to most-played
first, so the cards a person actually sees get the benefit soonest.

---

## 8. What this does not do

- **It does not make play mode work.** A facet says a card draws cards; the
  runtime needs to know how many, when, and at what cost. Assignment serves deck
  building, recommendations, similar cards, works-well-with and search. It does
  not resolve a card on a battlefield.
- **It does not replace the compiler.** The compiler stays the authority and
  keeps growing. Every rule written later shrinks the assignment's territory and
  grows its answer key.
- **It does not reach 100% accuracy.** It reaches a *measured* accuracy, with a
  stored reason per word, no overwrite, and a rollback that is one `DELETE`.

## 9. Why the reader alone cannot do this

Measured with `scripts/probe/route-to-full.mjs`. 21,310 cards are not fully read,
and closing them needs **9,698 compiler rules and 5,228 DSL members**:

| rules written | unread clauses covered |
|---:|---:|
| 100 | 21% |
| 500 | 40% |
| 1,000 | 49.5% |
| 5,000 | 76% |
| 9,698 | 100% |

**7,680 of the 9,698 shapes appear on exactly ONE card.** Four fifths of the work
serves a single card each. At the rate actually observed on 31 Aug, that is on
the order of a billion tokens and several months.

The compiler is not being abandoned. It is being used for what it is
outstandingly good at: being *right*, and therefore being the thing that checks
everything else.
