# PROBE-TRUTH

What `scripts/verify-ability-coverage.mjs` and `src/lib/game/abilities/behaviour-probe.ts`
decline to test, counted card by card, and split into the refusals the engine
could answer today and the refusals that are correct.

Measured 23 August 2026. Nothing here is estimated except the one figure at the
end that says so in its own heading.

**No grading was changed.** `verify-ability-coverage.mjs` and `behaviour-probe.ts`
are untouched. The counts come from a new read-only script,
`scripts/probe-truth-census.mjs`, which copies the grading of
`verify-ability-coverage.mjs` verbatim and proves the copy is faithful by
reproducing that script's five headline numbers exactly before it prints
anything else.

---

## 1. The numbers this run produced

Run today, over the cached bulk file, pool of 32,469 cards:

```
node --experimental-strip-types scripts/verify-ability-coverage.mjs
```

| verdict | cards | share |
|---|---:|---:|
| AUTOMATED | 4,124 | 12.70% |
| PROMPTED | 1,601 | 4.93% |
| PROMPTABLE | 710 | 2.19% |
| SILENT | 25,702 | 79.16% |
| NO-TEXT | 332 | 1.02% |

AUTOMATED plus PROMPTED, which is what "a card the probe passes" means, is
**5,725 cards, 17.63%**.

Supporting counts from the same run: 5,357 cards reached the probe as
AUTOMATED and 1,233 were downgraded; 252 more produced nothing at all on the
probe board and were kept anyway; `abilityEngineOwns` is true for 2,572 cards.

### The 16.05% in the brief did not reproduce

The brief quotes 16.05% for "cards passing a probe". Today's run of the script
as it stands gives 12.70% AUTOMATED and 17.63% AUTOMATED plus PROMPTED. Neither
is 16.05%, and `scratch/verify-ability-coverage.json` had no earlier copy left
to compare against because the run overwrote it. Every figure below is quoted
against today's run, and today's run is reproducible with the command above.

### Reproducing the census

```
node --experimental-strip-types scripts/probe-truth-census.mjs
DM_ASK_MORE=1 node --experimental-strip-types scripts/probe-truth-census.mjs
```

The first writes `scratch/probe-truth-census.json` and reconciles with the
shipped script exactly. The second is the estimate in section 5 and writes
`scratch/probe-truth-census-ask-more.json`. `DM_ASK_MORE` changes no figure in
the default run.

---

## 2. ANSWERABLE

Refusals where an instrument already in the engine can supply the answer, and
the probe does not ask it.

| # | where | cards | the instrument that could answer |
|---|---|---:|---|
| A1 | `behaviour-probe.ts:137` `needsTargetBinding` | 1,043 downgraded, **733 run when asked** | `chooseTargetsFor` |
| A2 | `verify-ability-coverage.mjs:1212` PROMPTED never graded | 1,601 passed unexamined, 918 run when asked | `chooseTargetsFor` |
| A3 | `verify-ability-coverage.mjs:269` `counter` probed with no stack | 117 carry it, 74 blocked by it alone | `castSpellAction` plus `chooseTargetsFor` |
| A4 | `verify-ability-coverage.mjs:733` `MODE_ASKED` needs a shipped surface | 341 | `planActivation` refusal with options, answered by `bot.ts` |
| A5 | `behaviour-probe.ts:61` the fixed seven card board | about 134 | a board the card's own selector can match |

### A1. Any ability that announces a target is failed before its effects run

`needsTargetBinding` returns true for any ability with a non-empty `targets`
array. At line 189 the probe runs the effects, throws the result away, and
reports `deferred` with the sentence "targets are not bound on the probe board,
so this ability was not executed". `verify-ability-coverage.mjs` then downgrades
the card from AUTOMATED to SILENT.

The comment above it says binding would "test the fake". That was true when
nothing owned target legality. It is not true now: `chooseTargetsFor`
(`activate.ts:924`) owns legality for all three ways a target is announced, and
`activate.ts`, `cast-targets.ts` and `announce.ts` all end in it. `makeContext`
already takes a `targets` array as its fourth argument.

Measured: **1,043** AUTOMATED cards are downgraded for this and nothing else.
The census re-ran each of them on the identical board, bound each announced
target through `chooseTargetsFor`, and then applied the probe's own bar,
actions must come out and nothing may be deferred:

* 733 ran
* 155 had no legal target on that seven card board
* 96 went silent
* 56 deferred for a different reason
* 3 could not be lined up in ref order

The 310 that did not run stay refused, and correctly. Note that the re-ask is a
**harder** test than what happens today: today the card is failed without its
effects being judged at all.

### A2. The 1,601 PROMPTED cards are probed and the result is discarded

Line 1212 reads `if (e.verdict !== 'AUTOMATED') continue;`. Every PROMPTED and
PROMPTABLE card is put through `probeBehaviour`, its outcome is counted into the
report (`PROMPTED/deferred 1,579`), and then nothing is done with it.

So 1,601 cards, 4.93% of the pool, count as passing without a single piece of
behavioural evidence. With targets bound, 918 of them demonstrably run. The
other 683 pass today on no evidence at all.

This row does not raise the number. It lowers it, or it leaves it alone, which
is the direction the project law asks for.

### A3. `counter` is graded unresolved because the probe board has no stack

`VERB_PROBES.counter` is `{do:'counter', what:{sel:'target', ref:0}}` run on a
board with nothing on the stack and no announced target, so it can only defer,
so `counter` lands in `NEVER_RESOLVED`, so every card carrying it is graded
dead. The script's own comment already says this and calls it a known limit.

Measured: **117** cards carry a dead `counter`. **74** have it as their only
blocker.

The census put the same effect to the same interpreter with a real spell cast
onto the stack and that stack object announced as the target. It produced an
action. So the verb resolves and the board was the problem.

### A4. A mode is refused because no human surface draws it, but a bot answers it

`MODE_ASKED` is `MODE_PROBE.ok && MODE_DRAWN_BY_A_SURFACE`. Both halves were
measured this run:

* `MODE_PROBE` is true. Birds of Paradise offered five colours through
  `planActivation`, the one chosen is the one that landed in the pool.
* `MODE_DRAWN_BY_A_SURFACE` is false. No file under `src/components`,
  `src/pages` or `src/hooks` reads `choice.modes` or `modeRef`.

So every modal card stays PROMPTABLE. The census asked the third question the
script does not ask: does a bot answer it. `nextBotMove` was given a seat with
one Birds of Paradise and nothing else to do. It returned a move, the move was
applied, and mana landed in the pool. `bot.ts:1196` `botChoice` has a `mode`
branch that takes the card's own first options and hands the indices back
through `planActivationWith`.

Measured: **341** PROMPTABLE cards carry their mode on an activated ability,
which is the only ability kind `planActivation` offers modes for.

**Keep the two claims apart.** The surface gap is real and the script is right
to record it. What is wrong is treating "no person can answer this" and "no
answer exists anywhere" as the same sentence. A bot plays these cards today.
Whatever is done here must report the bot number and the person number as two
numbers, never one.

### A5. Effects that match nothing on a seven card board

`probeBoard` is two players, four permanents, one card each in hand, library
and graveyard. No lands, no mana, no stack, no combat, no counters, no
attackers, no planeswalker, no enchantment.

Measured downgrades that are about that board rather than about the card:
105 cards on "nothing to pump", 24 on "the object this card is about was never
bound", and a tail of about five more. Roughly 134 cards.

The verb itself works: `pump` is measured this run as resolving, one action on
the probe board. What fails is that "attacking creatures with flying get +2/+0"
matches nothing when nothing is attacking and nothing flies.

**This row carries the most risk of the five.** A board built from the card's
own selector can end up proving only that the selector matches itself. If this
is done, the board must be built from a fixed richer template that every card
sees, not from the card under test, and the bar must stay the same: actions out,
nothing deferred.

---

## 3. GENUINE

Refusals where nothing in the engine can supply an answer. These are the probe
doing its job, and the list is as important as the one above: it is where the
number cannot be raised by improving the instrument.

| # | where | cards | why nothing can answer it |
|---|---|---:|---|
| G1 | unparsed text, `verify:1098` | 16,194 | the compiler could not read the paragraph |
| G2 | `{do:manual}` marker | 6,174 | the card is marked as needing a person |
| G3 | `may`, `to-actions.ts:852` | 175 sole, plus 67 refused triggers | no `PendingChoice` kind exists for a yes or a no |
| G4 | `unless-pays`, `to-actions.ts:859` | 0 | correct, and it costs nothing today |
| G5 | a mode on a spell or a trigger | 159 plus 16 | nothing enumerates the options off the activation path |
| G6 | `kind:'mana'` abilities | 88 carry, 84 sole | `activate.ts` offers `kind === 'activated'` only |
| G7 | advisory keywords | kicker 193, flashback 188, crew 185, morph 141, ward 137 | `combat.ts` asks about fifteen names |
| G8 | restrictions outside attack and block | 99, 95, 75 | collected by `statics.ts`, read by nobody |
| G9 | replacements other than two shapes | 68 | `intrinsic.ts` derives no such result |
| G10 | trigger ownership is all or nothing | 1,194 | mirrors `abilityEngineOwns` exactly |
| G11 | events the engine never emits | step 44, tapped 33, gains-life 24, becomes-blocked 23 | no event to fire on |
| G12 | "up to" and two targets at once | 71 carry, 42 sole | declining is an answer nothing can give |
| G13 | a `cost` choice | included above | even `botChoice` returns null for these, on purpose |
| G14 | engine keyword absent from `card.keywords` | 0 | the rule is right and currently costs nothing |

### The four worth reading in full

**G3, `may`.** `to-actions.ts:852` pushes a deferral and stops, and it is right
to. `PendingChoice` has exactly three kinds, `target`, `cost` and `mode`, so
there is no shape in which a yes or a no could be offered, and `botChoice` has
nothing to answer. 175 cards are blocked by a `may` alone at the decision stage
and another 19 by a `may` together with a target. Separately, 67 cards are
refused at the trigger bridge for `optional ("you may")`. The probe's comment
about `may` at line 398 is still true.

**G4, `unless-pays`.** Also still true, and it currently costs nothing.
`unless-pays` is the named blocking decision on **zero** cards in the pool.
Every card carrying one is already refused for something earlier, usually
unparsed text. Worth knowing before anybody spends a week on Rhystic Study.

**G5, a mode that is not on an activated ability.** `abilityVerdict` only ever
sets `asked` for a mode inside its `case 'activated'` branch. That is not an
oversight in the script, it is the truth: `activate.ts` is the only file that
builds a `kind:'mode'` PendingChoice, `cast-targets.ts` contains no mention of
modes, and `announce.ts` handles targets only. `stack.ts` does honour
`object.modes` at resolution, so the missing half is the offer and not the
honouring. **159** cards carry their mode on a spell and **16** on a trigger.

**G10, trigger ownership.** 1,194 cards carry the reason "trigger not owned:
another clause on the card disqualified it". That is `abilityEngineOwns`
(`trigger-bridge.ts:569`): coverage must be `full` and every trigger on the card
must be runnable, or none of them are. The predicate exists so the old detector
in `effects.ts` and the new bridge cannot both fire and double every enters
trigger. It is the single largest dead reason and it is correct.

---

## 4. The third list: where the probe accepts a weaker answer

Not refusals, so not in either list above, but they belong in this document
because the project law says every change here must make the probe ask more.
Each of these is a place it currently asks less.

* **252 cards produce nothing and stay AUTOMATED.** `behaviour-probe.ts:194`
  scores `silent` and `verify:1215` counts it without downgrading. The script
  prints the alternative itself on its last line: AUTOMATED would be 3,872,
  11.93%.
* **Keyword, static and replacement abilities are scored `ran` without being
  run** (`behaviour-probe.ts:166`). The reason given is sound, they are not
  effect trees. The consequence is that 595 AUTOMATED cards are carried by
  keyword lines only and nothing about them was executed.
* **A card with no abilities scores `ran`** (`behaviour-probe.ts:158`).
  Correct for a vanilla creature. Combined with the line above, a card of
  nothing but keywords passes with an empty action list.
* **One representative effect decides each verb.** The script says so at line
  253. A verb that resolves for the shape written there and defers for another
  shape reads as resolved.
* **116 AUTOMATED cards still have a decision word in their oracle text.** The
  script counts this and prints it and does nothing with it. It is the cheapest
  available lead on where the grading is too kind.

---

## 5. The estimate, if every ANSWERABLE row were asked

**This is an estimate. It must not appear in a headline.**

Measured by `DM_ASK_MORE=1`, which re-runs the identical grading with A1, A3 and
A4 asked through the real engine seams and nothing loosened. A5 is not included.

| verdict | today | with the answerable rows asked |
|---|---:|---:|
| AUTOMATED | 4,124 (12.70%) | 4,953 (15.25%) |
| PROMPTED | 1,601 (4.93%) | 1,955 (6.02%) |
| PROMPTABLE | 710 (2.19%) | 383 (1.18%) |
| SILENT | 25,702 (79.16%) | 24,846 (76.52%) |
| **passing** | **5,725 (17.63%)** | **6,908 (21.28%)** |

Plus 1,183 cards, plus 3.65 points.

Three things that number carries and should not be allowed to hide:

1. It keeps the 252 card leniency of section 4, which grows to 348 once targets
   are bound. Downgrade those as well and AUTOMATED is 4,605, 14.18%.
2. A2 is not in it, because A2 removes cards rather than adding them. 683
   PROMPTED cards pass on no evidence today and would still need to earn it.
3. The target binding is done on one fixed board. 155 cards had no legal target
   there, which is a board fact and not settled either way.

---

## 6. What this does not fix, and it is most of the gap

The brief names three numbers: 16.05% from the probe, 63% of cards that had
something to do in twenty real games, and zero silent failures. Everything in
section 2 moves the first number by under four points.

The reason is section 3, row G1. **16,194 cards, half the pool, are refused
because the compiler could not read some of their text.** Another 6,174 carry a
marker that says a person is needed. Together that is 22,368 cards, 68.9% of the
pool, and no change to the probe touches any of them. They are a compiler
problem and a primitive-writing problem, which is what the port sequence in
CLAUDE.md already says.

So the honest reading of the gap between 17.63% and 63% is that the probe
explains a small part of it, and the two twenty game figures are measured over
the cards that actually turned up in twenty games rather than over the
catalogue. Those two denominators are not the same and the numbers cannot be
compared until they are.

The one finding here that does bear directly on the owner's question, "why
cannot bots make choices on more than 16% of cards", is A4. A bot answers a
five way mode choice today, end to end, and the probe scores those 341 cards as
carrying a decision nobody offers. The engine is not the thing stopping them.
The missing piece is a surface a person can press, and that is a different
number from the one the probe reports.

---

## 7. What was changed on 23 August 2026, and what it cost

Sections 1 to 6 were written while the grading was untouched. This section is
the record of changing it. The rule the change was held to is the project's own:
every edit had to make the probe ask MORE, and no edit was allowed to accept a
weaker answer.

Reproduce with:

```
DM_CARD_DUMP=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
node --experimental-strip-types scripts/probe-movers.mjs
```

The second joins `scratch/verify-card-verdicts.BASELINE.json`, taken from a run
of the shipped script before any edit, against the run you just did, and prints
every card whose verdict changed with its Scryfall text and the probe's own
record of what it did.

### 7.1 The five changes

**One. A target is now BOUND and the ability is then run.** `needsTargetBinding`
is gone. `behaviour-probe.ts` asks `chooseTargetsFor` what is legal, hands each
remaining question to `bot.ts`, and runs the effects with the answers in the
context. Which bot function answers is the one the game would use for that kind
of ability: `botChoice` for an activated ability, `botTargetForEffects` for a
trigger or a spell, the second of which is the body of `botTriggerTarget` moved
into an exported function so there is one implementation and not two. Nothing in
the probe decides a target.

**Two. A mode is answered by `botChoice`, through `RunOptions.modes`.** That is
the engine's own channel, the same field `planActivation` fills. The probe runs
the effects, takes the `ModeChoice` the interpreter offers, asks `botChoice`,
and runs again with the answer.

**Three. A "you may" is answered YES,** through a new `RunOptions.answerMayYes`
that is off in the game and set by nothing except the probe. The bias is written
at the switch in `to-actions.ts` rather than in a report: yes is not the neutral
answer, and it buys a claim about the card's effects and no claim at all that
anybody can be asked the question.

**Four. `counter` is asked on a board that has a stack.** The verb was graded
"named and never resolved" because the probe board holds no spell, which is a
fact about the board. It is now put to the same interpreter with a real Shock
cast onto the stack and that stack object announced. It produces an action, so
it leaves the dead list. The old measurement is still printed beside the new one.

**Five. The probe is binding on PROMPTED,** on the identical terms it is binding
on AUTOMATED. The line `if (e.verdict !== 'AUTOMATED') continue;` meant 1,601
cards were probed, counted, and then let through with no behavioural evidence.

### 7.2 Two bars were RAISED, both because the binding exposed a false pass

**Silence is now a refusal.** `probeBehaviour` has always returned `ok: false`
for `silent` and called it the prohibited state. The script counted those cards
and kept them anyway. That was survivable while every targeted ability was
refused before it ran, and it stopped being survivable the moment targets bound:
Tome Scour, Swallowing Plague and Dogpile all reached AUTOMATED with zero
actions to their name on the first run with binding on. 281 AUTOMATED and 129
PROMPTED cards are now counted SILENT for producing nothing. Were they accepted,
AUTOMATED would read 4,909 rather than 4,628.

**An ability that announces a target no effect reads is refused.** Decimate
announces four targets and compiles to one `destroy`, so three quarters of the
card is gone, and it still ran and produced an action. 138 cards are refused for
this, and every one of them is a card whose DSL says less than the card does.

### 7.3 Two bugs the probe found by asking

**`announcedTargetsOf` missed every player target.** It walked for
`{sel:'target', ref}` and not for `{who:'target-player', ref}`, which
`context.ts:333` resolves out of the identical `ctx.targets[ref]`. So Sovereign's
Bite, "Target player loses 3 life and you gain 3 life", reported that it
announced nothing: nobody was asked, the lose-life half resolved against no
player and produced no action, and the gain-life half made the card look like it
worked. This is a GAME bug and not a measuring bug. `announce.ts` asks about the
specs this function returns, so a trigger reading "target opponent discards two
cards" was drained with nobody asked and nobody discarding. Fixed in
`card-abilities.ts`.

**The old `llm-validation` test asserted the stale refusal.** It read "a targeted
spell is accepted but is NOT automatable, because nothing binds the target". It
now asserts the opposite, and a second test beside it asserts the thing that
matters: an ability whose target IS bound and which then produces no action is
SILENT, so binding cannot become a way of passing.

### 7.4 The numbers

| verdict | before | after |
|---|---:|---:|
| AUTOMATED | 4,124 (12.70%) | 4,628 (14.25%) |
| PROMPTED | 1,601 (4.93%) | 1,075 (3.31%) |
| PROMPTABLE | 710 (2.19%) | 723 (2.23%) |
| SILENT | 25,702 (79.16%) | 25,711 (79.19%) |
| NO-TEXT | 332 (1.02%) | 332 (1.02%) |
| **passing** | **5,725 (17.63%)** | **5,703 (17.56%)** |

**The passing number went DOWN.** That is the point. 1,547 cards moved: 769
toward passing and 778 away from it.

| transition | cards |
|---|---:|
| SILENT to AUTOMATED | 756 |
| PROMPTED to SILENT | 526 |
| AUTOMATED to SILENT | 252 |
| SILENT to PROMPTABLE | 13 |

Every one of the 756 cards that reached AUTOMATED ran with at least one action
and had its target bound through `chooseTargetsFor`. Checked rather than
asserted: the count of cards in that set whose probe outcome was anything other
than `ran` with actions is zero.

### 7.5 What answered what

| answer | cards |
|---|---:|
| 1 target bound, aimed by `botTargetForEffects` | 1,247 |
| 1 target bound, aimed by `botChoice` | 825 |
| a "you may" answered yes | 241 |
| 2 targets bound, aimed by `botTargetForEffects` | 84 |
| a mode answered by `botChoice` | 241 across all mode texts |

Of the 756 cards that reached AUTOMATED, **none** needed the "may" answer and
**none** needed a mode answer. Every one of them gained on target binding alone.
So the two answers that carry a policy are carrying no part of the headline,
which is worth knowing before anybody argues about the policy.

### 7.6 What was deliberately NOT changed

`MODE_ASKED` still requires a shipped human surface, so the 341 modal cards of
row A4 are still PROMPTABLE. Section 2 asked for the bot number and the person
number to stay two numbers, and folding a bot into `MODE_ASKED` would have made
them one. The bot number is printed instead, per card, in the "what the probe
answered" block: `botChoice` answers a mode for 241 cards and aims a target for
825. The engine is not what stops a person playing those cards. The missing
piece is still a surface, and that is still a different number.

### 7.7 What is still too kind, measured on this run

* **A static, a keyword and a replacement are still scored `ran` without being
  run.** Out of the Way is the plain case: its cost reduction static is graded as
  working and nothing executed it.
* **An effect list is graded as one unit.** Clear the Mind compiles to an XMage
  body that produces nothing and a `draw` that produces one action, so it read as
  working on the draw alone until the unread-target rule caught it for a
  different reason. A per-effect bar would catch the rest of that shape and does
  not exist.
* **The board still decides some verdicts.** Shaman of the Pack binds its target
  and then loses life equal to the number of Elves, of which the probe board has
  none, so it produces nothing and is counted SILENT. That is a board fact
  reported as a card fact, and it now costs cards rather than being invisible. It
  is the A5 row of section 2 and it is still open.
