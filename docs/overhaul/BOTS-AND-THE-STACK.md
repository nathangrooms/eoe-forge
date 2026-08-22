# Bots and the stack: the before

Owner: *"I am expecting at least 20 bot matches tested, audited and reviewed to
ensure this is working 100% for all cards, abilities, actions, tappables, on
enter, exile, graveyard, everything working as it should and bots have all
access and smart play."*

This document is the measurement taken **before** any change is made to teach a
bot to cast instants and sorceries. No engine code was changed to produce it.
`src/lib/game` is untouched. The only file added is
`scripts/playtest/stack-census.ts`, which is a counter, not a rule.

Every number below names the script that produced it and how that script
counted. Two twenty game runs were played, because the harness ships two
configurations and only one of them is the game a player meets.

---

## 1. What was run

```
node --experimental-strip-types scripts/playtest/run.ts \
  --seed 9000 --games 20 --kind commander --players 4 --verify --quiet \
  --out scratch/playtest/runs/before

node --experimental-strip-types scripts/playtest/analyze.ts \
  --run C:\Users\natha\Desktop\Software\Deckmatrix\scratch\playtest\runs\before\commander-4p-seed9000-x20 \
  --name before
```

Then the same twenty seeds again with `--stack`, which is the flag
`scripts/playtest/run.ts` uses to configure the bot the way `src/pages/Play.tsx`
configures it:

```
node --experimental-strip-types scripts/playtest/run.ts \
  --seed 9000 --games 20 --kind commander --players 4 --verify --quiet --stack \
  --out scratch/playtest/runs/before-stack
```

Then both runs were counted by the new census:

```
node --experimental-strip-types scripts/playtest/stack-census.ts \
  --run <run folder>
```

Artefacts, all reproducible from the seeds alone:

| what | where |
|---|---|
| default run, 20 games | `scratch/playtest/runs/before/commander-4p-seed9000-x20/` |
| its generated report | `scratch/playtest/reports/before.md` |
| the `/play` configuration run | `scratch/playtest/runs/before-stack/commander-4p-seed9000-x20-stack/` |
| the census | `scripts/playtest/stack-census.ts` |

Game N uses seed `9000 + N`, so any single game replays alone with
`--seed <that number> --games 1`.

---

## 2. The headline numbers

Both runs, side by side. "default" is the command in the task brief. "`--stack`"
is the same twenty seeds with the bot configured the way `/play` configures it.

| | default | `--stack` |
|---|---|---|
| games finished | **20 of 20** | **20 of 20** |
| stalled | **0** | **0** |
| invariant violations | **0** | **0** |
| total actions proposed by bots | **22,413** | **25,295** |
| total actions the engine applied | **24,852** | **29,760** |
| actions the reducer refused | 12 | 16 |
| turns | 915 | 903 |

Finished, stalled and total actions come from `run.ts`'s own summary and are
repeated in `summary.json` in each run folder. Invariant violations come from
`analyze.ts` (`0 invariant violations` on its last line) and independently from
`stack-census.ts`, which calls the same `checkInvariants` from `observe.ts`
after every applied action and got 0 as well.

### The two action counts are different on purpose

22,413 is what the bots proposed. 24,852 is what the engine actually applied.
The gap is the whole reason a new counter was needed, and it is explained in
section 4.

---

## 3. The stack, measured

Counted by `scripts/playtest/stack-census.ts`. It replays every recorded game
through the real reducer the same way `analyze.ts` does, rebuilding both
decklists, checking the opening hash, and re-checking the state hash after every
single action. All 20 games in both runs replayed with every hash matching, so
nothing here comes from a position the game was not in.

| | expected by the brief | default | `--stack` |
|---|---|---|---|
| spells announced onto the stack | 0 | **3** | **872** |
| abilities put on the stack | | **657** | **656** |
| objects that resolved off the stack | | **657** | **1,525** |
| priority passed | | **1,759** | **4,803** |
| ...of which the stack was not empty | | **1,759** | **4,803** |
| spells countered | 0 | **3** | **3** |
| spells that fizzled | | 0 | 0 |
| instants cast | 0 | **3** | **3** |
| sorceries cast | 0 | **0** | **0** |

**Three of the four expected zeroes are not zero.** The stack is in daily use in
both configurations, priority rounds really happen, objects really resolve, and
three counterspells were cast and applied. The brief's third point, that the
loop is closed because nothing can put a first object on the stack, does not
hold: **an activated or triggered ability puts one there 657 times a run**, and
that is what opens the window the counterspell branch needs.

How each row was counted:

- **spells / abilities on the stack**: an object whose `stackId` is in
  `state.stack` after an action and was not there before, split on
  `object.kind`.
- **resolved off the stack**, **priority passed**, **spells countered**: read
  off the game's own event log, one entry per applied action, counting
  `RESOLVE_STACK`, `PASS_PRIORITY` and `COUNTER_SPELL`.
- **priority passed with something on the stack**: an accepted `PASS_PRIORITY`
  where `state.stack` was non-empty in the state **before** it applied. Every
  single pass in both runs was one of these, because on an empty stack the bot
  advances the step instead of holding a priority round.
- **instants and sorceries cast**: an accepted `CAST_SPELL`, or an accepted
  `PLAY` out of hand or the command zone, where the card's **first printed
  face** is an Instant or a Sorcery.

### Why "first face" and why it matters

Ten `PLAY` actions in the default run put a card with an instant front face onto
the battlefield. None of them is a cast. They are land drops:

```
Kazuul's Fury // Kazuul's Cliffs      Khalni Ambush // Khalni Territory
Silundi Vision // Silundi Isle        Ondu Inversion // Ondu Skyruins
Fell the Profane // Fell Mire         Vastwood Fortification // Vastwood Thicket
```

`isLand` in `src/lib/game/mana.ts:281` reads the **whole** type line, so
`Instant // Land` is a land to it and `chooseLand` picks it up. A first draft of
the census reported those ten as instants cast, which would have been a fabricated
result in the flattering direction. The census now asks `isLand` first, the same
function the bot asked. This is the same trap `defaultResolutionZone` documents in
`stack.ts`, and `isPermanent` avoids it by using `faceTypeLine`. `isLand` does not.

Worth noting for later: all ten entered **untapped**. Those land faces are
printed to enter tapped unless a cost is paid, and that belongs with the "enters
tapped" cluster the audit already recorded.

---

## 4. The finding that stands, and it is the important one

**A bot never casts an instant or a sorcery for its own text. Not once, in
either run.**

The three instants cast in each run are the same three cards, and every one of
them was a counterspell cast from the one branch in `bot.ts` that passes
`viaStack: true`:

| run | card | what it was cast at |
|---|---|---|
| default | Essence Capture | Blinding Mage's activated ability |
| default | Quench | Mask of Memory's equip ability |
| default | Spell Rupture | Lembas' activated ability |
| `--stack` | Essence Capture | Jawbone Duelist, a creature spell |
| `--stack` | Quench | Silverflame Squire // On Alert, a creature spell |
| `--stack` | Spell Rupture | Daughter of the Deep, a creature spell |

Zero removal spells. Zero card draw. Zero sweepers. Zero ramp sorceries. The
cause is one line, exactly as the brief says:

```ts
// src/lib/game/bot.ts:167
const ranked = candidates
  .filter(card => isPermanent(card))
  .sort((a, b) => castScore(state, b) - castScore(state, a));
```

The size of what that discards, counted by `stack-census.ts` off the opening
state of every game so it describes the decks rather than what happened to be
drawn:

- **650** instant and sorcery card instances were dealt into the 80 decklists,
  which is 8 per 99 card deck.
- **125** of them reached a hand at some point across the 20 games.
- **3** were ever cast, all counterspells.

So roughly 122 real cards were drawn, held, and never used, in one twenty game
run, in each configuration.

### The opportunity that is being thrown away

The census asks the same two questions `respond.ts` already answers, of the
seat holding priority, once per stack object per seat so one window is not
counted dozens of times:

| | default | `--stack` |
|---|---|---|
| times a seat was offered somebody else's object to answer | 1,102 | **3,278** |
| ...and was holding an instant it could legally cast and pay for | 334 | **567** |
| ...and that instant was a counterspell | 3 | 3 |

**567 windows in the `/play` configuration where the bot was holding a card it
could have cast, and it cast one in three of them.** That is the hole, stated as
a number, and it is the number the "after" run has to move.

---

## 5. Two defects found while measuring

### 5a. A counterspell is cast at an activated ability

All three counters in the default run were aimed at an ability, not a spell.
The cards read:

| card | printed text |
|---|---|
| Essence Capture | Counter target creature spell. Put a +1/+1 counter on up to one target creature you control. |
| Quench | Counter target spell unless its controller pays {2}. |
| Spell Rupture | Counter target spell unless its controller pays {X}, where X is the greatest power among creatures you control. |

Essence Capture countered `{W}, {T}: Tap target creature.` An activated ability
on the stack is not a spell, and it is certainly not a creature spell. The
engine accepted it: `validateAction` in `rules.ts` checks only that the object
exists and is not marked can't be countered. It never asks whether the object is
a spell, and nothing anywhere checks the counterspell's own restriction.

Two places let it through and both are small:

- `spellToAnswer` in `respond.ts:166` returns `stackTop(state)` whatever kind it
  is. Its own doc comment says "the spell this player is being given the chance
  to answer", and it returns abilities.
- `countersSpells` in `respond.ts:75` matches the text and says nothing about
  what the target has to be.

It did not show up in the `--stack` run only because the counterspell was spent
on a real spell first. The defect is still there.

### 5b. "Unless its controller pays" is not offered

Quench and Spell Rupture both counter **unless a cost is paid**. In all six
casts across both runs the object was countered outright and the controller was
never asked. `planCastFromHand` attaches `effects: [{ op: 'counter-spell' }]`
with no condition, and `actionsForEffect` in `stack.ts:380` turns that straight
into a `COUNTER_SPELL`. There is no branch for a payment anywhere in that path.
This is a card playing **stronger** than it is printed, which is the category
the audit already calls the worst kind.

---

## 6. The harness lies about counterspells, and it has to be fixed first

`scratch/playtest/reports/before.md`, generated by `analyze.ts` from these exact
games, opens with:

> 1 of the 14 things the owner asked about never happened once in 20 games:
> ### A spell was countered — 0 times

**Three spells were countered.** The engine's own log records three
`COUNTER_SPELL` actions in that run.

The cause is the same shape as the lifelink and deathtouch false zeroes the
audit already caught. `detectEvents` in `observe.ts:730` pushes
`spell-countered` when `action.type === 'COUNTER_SPELL'`, and `analyze.ts` only
ever hands it the actions a bot **proposed**. A `COUNTER_SPELL` is never one of
those. `applyAction` folds `stackFollowUps` inside itself through `applyOne`, so
countering happens as a nested consequence of the counterspell resolving and is
invisible to a probe watching top level action types. The same blindness hides
every `RESOLVE_STACK`: 657 of them applied in the default run and not one
appears in `record.actions`.

The report's own section 2 makes the claim that this row breaks:

> Every row is detected from the state difference across an action, not from the
> action type

That is true of most rows and false of this one.

There is a second, plainer problem in the same file. Section 5 of the generated
report prints this as fixed prose, unconditionally, with no measurement behind
it:

> **Nothing ever reaches the stack, and the reason is a closed loop.**

It printed in a run where 3 spells and 657 abilities reached the stack.
`analyze.ts` lines 1026 to 1046 are a hardcoded paragraph. It was true when it
was written and the file has no way to notice that it stopped being true.

**Neither was changed in this pass**, deliberately, so that the "before"
artefacts are exactly what the current harness produces. Both must be fixed
before the "after" run, or the comparison inherits the same false zero and the
same fabricated paragraph. That is the first task of the next phase.

---

## 7. Win rate spread across the four seats

This is the thing that must not get worse. A bot that starts casting instants
and gets the timing wrong will show up here first, as one seat pulling away or
as the turn order mattering more than it does now.

| seat | default run | `--stack` run |
|---|---|---|
| Bot 1 (seat 1, plays first) | 5 | 6 |
| Bot 2 | 6 | 4 |
| Bot 3 | 5 | 4 |
| Bot 4 | 4 | 6 |

Twenty games each, so an even table is 5 apiece. Default run spread is 4 to 6.
`--stack` run spread is 4 to 6. Counted by `stack-census.ts` from
`record.winnerNames`, which the harness sets from the seat's display name, given
in seat order.

Twenty games is a small sample and a 4 to 6 spread is well inside what chance
produces. The point of recording it is not that it is balanced. It is that the
same twenty seeds, run again after the change, will produce a directly
comparable table, and a seat at 12 or a seat at 0 would be a real signal.

Turn counts are the other guard: 915 turns over 20 games in the default run,
903 with the stack on. Games that suddenly run much longer are a bot that has
learned to hold up mana and forgotten to spend it.

---

## 8. What already works, so none of it gets rebuilt

This is the part the brief asked for explicitly. The machinery is mostly there.
Almost all of the missing work is asking, choosing and timing, not rules.

### `stack.ts` (1,075 lines) is finished for this job

- **Announcement.** `castSpell` builds the `StackObject`, mints a deterministic
  id off a counter in state, and `withObjectOnStack` gives the caster priority
  and clears the pass list, which is CR 117.3c.
- **Priority.** `passPriority` walks the living players, `allPlayersPassed`
  answers CR 117.4, and `stackFollowUps` derives the consequence: resolve the
  top object, or advance the step on an empty stack. Nothing is sent over the
  wire for this, it is derived, so every client computes the same chain.
- **Resolution.** `resolutionActionsFor` is a pure function from a stack object
  to actions. It handles a permanent spell entering, an Aura entering attached
  in one step under CR 303.4f, an instant or sorcery going to the graveyard
  after its effects under CR 608.2m, and it emits a `NOTE` rather than nothing
  when it can do nothing, which is the project's honesty rule.
- **`compiledSpellActions` runs an instant or sorcery's own compiled text.**
  This is the piece that was missing before the XMage tranche and it is present
  now. A spell that reaches the top of the stack does what it says.
- **Fizzling** (CR 608.2b), **split second** (CR 702.61a), **can't be
  countered** (CR 701.5b) and **zone change makes a new object** (CR 400.7, via
  `zoneChangeCounter` on the target) are all implemented and each is checked in
  exactly one place.

Measured proof it runs rather than merely existing: 657 resolutions in the
default run, 1,525 with the stack on, 0 invariant violations either way.

### `respond.ts` (241 lines) already answers the hard question

- `isInstantSpeed` reads the type line, then the keyword list, then the oracle
  text, so a card loaded without keywords that prints "Flash" is still caught.
- `castTiming` is the full timing gate, written once so no caller can disagree
  with another: instant speed needs only `canRespond`, and everything else is
  sorcery speed under CR 307.1, meaning your own turn, a main phase, and an
  empty stack. **A bot casting instants does not need new timing rules. It needs
  to call this one.**
- `responseOptions` returns everything in hand this seat could legally cast at
  this moment and pay for out of untapped permanents, counters first and then
  cheapest. Empty is its normal answer, which is the half that keeps a prompt
  from becoming noise.
- `spellToAnswer` and `hasResponse` are the "is there a decision worth making"
  pair.

It was exercised 3,278 times in the `--stack` run and returned a non-empty list
567 times. It works. Nothing consumes it except the counterspell branch.

### `moves.ts` (404 lines) already builds the cast both ways

`planCastFromHand` handles zone legality, commander tax through `taxForCard`,
payment through `planPayment` and `paymentActions` including floating mana,
the commander announcement under CR 903.8, and the Aura host question under CR
601.2c which it refuses rather than guesses. `viaStack: true` produces the
`CAST_SPELL`, `viaStack` absent produces the immediate `PLAY`. Both branches are
correct and both are in use today.

**`CastOptions.targets` already exists** and already rides onto the stack
object. Its doc comment says plainly that no surface supplies it. That is
accurate and it is the single largest piece of missing work.

### `bot.ts` (877 lines) already has more than the brief credits it with

- `BotOptions.useStack` exists, `activeMove` passes it into `chooseSpell`, and
  `src/pages/Play.tsx` sets it to `true` in both places it builds `BotOptions`.
  **The `/play` bot has been casting through the stack all along.** What the
  audit measured was `run.ts`, whose `useStack` defaults to `false`.
- `priorityMove` holds a real priority round and counters correctly when it gets
  a legal chance, which the `--stack` run shows three times.
- `chooseActivation` and `botChoice` already answer targets, modes and costs for
  an **activated** ability through `planActivationWith`. That is the pattern a
  spell target picker should copy rather than reinvent: 657 abilities went on
  the stack per run through it, with targets chosen.
- `chooseCommanderZone`, the Aura host logic including `auraPunishes`, the
  attack and block policies, and the vigilance re-declaration guard are all
  working and none of it is in the way.

### `activate.ts` has the picker that spells lack

`PendingChoice` with `kind: 'target' | 'cost' | 'mode'`, a prompt in a player's
words, the candidate cards and players, and `min`/`max`. `planActivationWith`
drives the ask-and-answer loop with a callback. `activationTiming` is the
ability-side twin of `castTiming`.

A compiled `kind: 'spell'` ability carries a `targets` list, which is what
`compiledSpellActions` reads on resolution. So the spell side has the
declaration already. What it has no equivalent of is the asker.

---

## 9. What the "after" work is actually facing

Counted by `stack-census.ts` over the distinct instants and sorceries in the 80
decklists of the default run, asking `abilitiesFor` the same way
`compiledSpellActions` asks it at resolution:

| | count | share |
|---|---|---|
| distinct instants and sorceries in the decks | **498** | |
| compile to text the engine can run | **271** | 54.4% |
| ...of which at least one needs a target nobody asks for | **187** | 69.0% of 271 |
| compile to nothing runnable | **227** | 45.6% |

So if `isPermanent` were simply removed from `chooseSpell` today:

- **84** of 498 would resolve and do what they say, being the runnable ones that
  need no target.
- **187** would reach resolution, find `object.targets` empty, and print the
  "no target was chosen when it was cast, so there is nothing for it to affect"
  note that `compiledSpellActions` already writes. Honest, and useless.
- **227** would resolve into a "resolve it by hand" note.

That ratio is why this is not a one line change, and it is a better reason than
the one the audit gave. The timing question is real but `castTiming` already
answers it. **The missing piece is a target picker for a spell**, and 187 cards
in a single twenty game sample are waiting on it.

---

## 10. What must be true of the after run

Same command, same seeds, `--name after`, plus the `--stack` pass. These are the
guards, all already measured above:

1. **20 of 20 finished, 0 stalled.** A bot that passes priority wrongly
   deadlocks, and the harness records that as a stall with the reason. This is
   the single most important row.
2. **0 invariant violations**, from both `analyze.ts` and `stack-census.ts`.
3. **Seat wins stay inside a sane spread.** 4 to 6 today over 20 games. A seat
   at 0 or above 10 is a finding.
4. **Turn counts stay near 915 and 903.** A large rise means a bot holding mana
   it never spends.
5. **Instants and sorceries cast rises above 3.** With 125 of them reaching a
   hand and 567 windows where one was castable, staying near zero means the
   change did not land.
6. **Nothing that works today stops working.** 657 abilities on the stack, 657
   resolutions, 598 land drops, 1,471 cards played, 2,016 passing tests.

And before any of that: fix the counterspell false zero and the hardcoded
paragraph in `analyze.ts`, or the after report will be measured with a broken
ruler.

---

## 11. Housekeeping

- No file under `src/lib/game` was changed. `npm test` passes 2,016 of 2,016.
  `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` exits 0.
- One file was added: `scripts/playtest/stack-census.ts`. It reads recorded
  games and prints JSON. It writes nothing and changes no rule.
- `scripts/playtest/tsconfig.json` reports one error, in
  `src/lib/game/intrinsic.ts`, about an unresolved `@/` alias. It predates this
  work and is not caused by the new file.
- Nothing was committed.
