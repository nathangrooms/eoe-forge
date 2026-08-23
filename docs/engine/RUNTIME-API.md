# The XMage runtime API: the ranking, what is implemented, and the share of calls covered

Code: `src/lib/game/xmage/`. Tests: `src/lib/game/xmage/runtime.test.ts`.
Measurement: `scripts/xmage/api-surface-typed.mjs` and
`scripts/xmage/runtime-coverage.mjs`.

## Attribution and licence

Behaviour here is derived from **XMage**, which is MIT licensed,
`Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
The clone is read in place, outside this repository, at commit
`07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d`. Nothing from it is vendored. Every
file carrying ported logic says so in its own header.

XMage's display strings are never copied: those carry Wizards of the Coast rules
text, which is not XMage's to license. Every filter name and log line in
`src/lib/game/xmage/` is ours. Card wording in the tests comes from Scryfall,
through `scripts/primitives/.data/catalogue.json`.

Forge is GPL-3.0. It was not fetched, read or referenced.

## Where every number below comes from

Two scripts, both run over the XMage clone, and every figure in this document is
copied out of their output rather than typed:

- `node scripts/xmage/index-engine-methods.mjs` reads XMage's engine source and
  records the name, return type and arity of every method every engine type
  declares. 3,725 engine files, 4,063 types, 14,699 declared methods.
- `node scripts/xmage/api-surface-typed.mjs` walks the 7,931 card files that
  declare their own class and counts every call in them, keyed by **resolved
  receiver type**.
- `node --experimental-strip-types scripts/xmage/runtime-coverage.mjs` joins
  that ranking against the API this port actually has.

---

# 1. Keying by receiver type roughly doubles the job

`scripts/xmage/api-surface.mjs` counts by METHOD NAME. Re-run, it reproduces the
figures in CLAUDE.md exactly: 7,931 card files, 118,738 calls, 1,423 distinct
methods, 26 methods for 50% of calls.

That ranking cannot be used as a work order, because you do not implement
`.getId()`. You implement `Permanent#getId` and `Ability#getId` and they are
different functions on different objects. So `api-surface-typed.mjs` resolves
the receiver: it builds a local type environment from method parameters, local
declarations, enhanced-for variables, `new`, casts and literals, then types each
step of a chain through the engine method table. `game.getPlayer(id).getLibrary().size()`
is three calls on three receivers, not three bare names.

**115,240 calls, of which 104,180 (90.4%) have a resolved receiver type.** The
remaining 9.6% are reported as `?` and stay in the denominator. They are never
dropped.

The gap against the by-name total is 3,498 calls, 2.9%. The bare scanner is a
regular expression over the file text and counts `.name(` wherever it appears;
this one walks expressions and only counts what it can place. Both totals are
printed by their own script.

Three keyings, and the third is the work order:

| keying | what one row means | distinct rows |
|---|---|---:|
| NAME | `.getId()` | 1,347 |
| DECLARER | the class XMage put the method on | 2,594 |
| ROOT | the highest supertype declaring it, so `Permanent#getControllerId` and `Controllable#getControllerId` are one function | **2,216** |

## How much the ranking changed, because it decides the work order

Rows needed to cover a share of all calls:

| share | by NAME | by DECLARER | by ROOT |
|---:|---:|---:|---:|
| 50% | 25 | 44 | **41** |
| 80% | 99 | 202 | **177** |
| 90% | 182 | 412 | **348** |
| 95% | 294 | 702 | **585** |
| 99% | 667 | 1,622 | **1,318** |

**The by-name ranking understates the work by about 1.8x at every level.** 99
methods for 80% becomes 177 functions. That is the headline change, and it is
the one that matters for planning.

The ORDER changes less than the size does, which is the good news. For the top
twenty names, rank by name against the rank of that name's biggest root row:

| by name | by root | method | calls | receivers | biggest receiver holds |
|---:|---:|---|---:|---:|---:|
| 1 | 1 | `getControllerId` | 7,937 | 6 | 81% |
| 2 | 2 | `getPlayer` | 6,389 | 1 | 100% |
| 3 | 5 | `getSourceId` | 3,972 | 7 | 65% |
| 4 | 3 | `getId` | 3,772 | 6 | 96% |
| **5** | **9** | `add` | 3,685 | **22** | **50%** |
| 6 | 4 | `getPermanent` | 3,164 | 5 | 96% |
| 7 | 6 | `getType` | 2,483 | 2 | 99% |
| 8 | 7 | `getState` | 2,359 | 18 | 90% |
| **9** | **17** | `getFirstTarget` | 2,346 | 4 | **49%** |
| 10 | 8 | `moveCards` | 1,873 | 3 | 99% |
| 11 | 14 | `equals` | 1,871 | 20 | 67% |
| 12 | 13 | `getFirst` | 1,645 | 1 | 78% |
| 13 | 11 | `getCard` | 1,554 | 11 | 86% |
| 14 | 10 | `getTargetId` | 1,552 | 1 | 100% |
| **15** | **29** | `setTargetPointer` | 1,470 | 2 | **46%** |
| **16** | **48** | `map` | 1,375 | 2 | **34%** |
| 17 | 12 | `getBattlefield` | 1,321 | 1 | 100% |
| 18 | 15 | `choose` | 1,305 | 3 | 92% |
| **19** | **36** | `getTargets` | 1,286 | 6 | **46%** |
| 20 | 16 | `addEffect` | 1,238 | 5 | 96% |

The four big movers are the four names that mean several different things:

- **`.add()`**, rank 5 by name, splits 22 ways. Its biggest single meaning is
  `Filter#add` at 1,852 calls, rank 9. Writing `add` once and calling the row
  done would have served half the calls with nothing to show the other half was
  missing.
- **`.getFirstTarget()`**, rank 9 by name, is two functions: `Ability#getFirstTarget`
  reaches through the whole target list, `Target#getFirstTarget` reads one slot.
  Neither holds a majority.
- **`.setTargetPointer()`** and **`.getTargets()`** split the same way.
- **`.map()`** is java.util.stream, not XMage at all, and drops from rank 16 to 48.

That last one is the general point: the by-name ranking mixes the Java standard
library into the middle of the XMage API. Keying by receiver separates them, and
they need different work — one needs a function written, the other needs the
translator to emit `.map(...)`.

---

# 2. What was built, and what shape it has

`src/lib/game/xmage/` — five files, 158 functions.

| file | what is in it |
|---|---|
| `runtime.ts` | scope, write buffer, the decision protocol, `runBody` |
| `objects.ts` | `Game`, `Player`, `Permanent`/`Card`/`MageObject`, `Cards`, `Battlefield`, `GameState`, `SpellStack`, `Combat`, `Token`, `Choice`, counters |
| `filters.ts` | `Filter`, `Predicates`, `CardType`/`SubType`/`SuperType` predicates, the stock filter set |
| `targets.ts` | `Ability`, `Target`, `Targets`, `TargetPointer`, `GameEvent`, `Effect`, `DynamicValue`, `CardUtil` |
| `index.ts` | `runXmageEffect`, `runXmageEffectWith`, the derived manifest |

## The signature is XMage's. The body is ours.

A translated card body is the Java with the semicolons removed:

```ts
const run = runXmageEffect(state, { sourceId, controllerId, targets, idPrefix }, (game, source) => {
  const controller = game.getPlayer(source.getControllerId());
  const permanent = game.getPermanent(source.getFirstTarget());
  if (!controller || !permanent) return false;
  controller.drawCards(2);
  permanent.destroy();
  return true;
});
```

A faithful copy of XMage's `Game` would be a mutable object graph, and this
engine's reducer is pure and returns a new state. So the facades **read** from a
`GameState` and **write** by appending `GameAction`s. `permanent.destroy()`
destroys nothing; it records the `MOVE_ZONE` a player could have pressed.
`run.actions` is an ordinary action list the reducer folds, so a translated card
resolving is replayable, undoable and identical on every client.

**Reads still see writes**, because XMage bodies routinely move a card and then
ask where it is. Every emitted action is folded through the engine's own
`applyAction` into a working copy that later reads use. The working copy is
scratch and is thrown away; only the action list leaves. `runtime.test.ts`
asserts both halves: the graveyard grows on the next line, and the state handed
in is byte-identical afterwards.

## Decisions go through the existing seam

`chooseUse`, `choose`, `chooseTarget`, `discard`, `searchLibrary` and
`Choice#getChoice` do not guess and do not return a default. They raise the
question as a **`PendingChoice`** — the same shape `activate.ts` already produces
and `bot.ts` already answers — and abort the run.

Aborting rather than continuing is the point. A body that asks "unless that
player pays {1}" and is handed a silent `false` resolves the card backwards, and
the log would show a card that resolved. So when a run stops on a question,
`ok` is false and **`actions` is empty**. The caller answers and the body runs
again from the top.

The refs answers are keyed on are stable because the bodies are deterministic:
no clock, no random source, so the same state reaches the same call sites in the
same order and `use0` is the first `chooseUse` on every replay.

`runXmageEffectWith` takes a `(choice: PendingChoice) => StackTarget |
InstanceId[] | number[] | null` decider — the exact callback shape `bot.ts` and
`cast-targets.ts` already use — and feeds answers back until the body finishes.
A test asserts that an existing decider drives a translated body unchanged. That
is what makes this a seam a human can use rather than one only a bot can.

## Three places it says no rather than guessing

- **`GameState#getWatcher`** (527 calls) returns `null` and records a deferral.
  A watcher this engine does not fold answers 0 for every question, and 0 is a
  *wrong* answer, not a neutral one. XMage bodies all guard with
  `if (watcher != null)`, so `null` makes the card a visible no-op.
- **`Game#addDelayedTriggeredAbility`** (295 calls) defers. There is no store for
  a delayed trigger in `GameState`, and a silent success would be a card that
  appeared to set something up and never fired it.
- **`GameState#getValue`** for a key no earlier line in the same run wrote. XMage
  keeps that bag on the game across resolutions; adding a mutable one to
  `GameState` would be an escape hatch every future card reached for.

`Cards#getRandom` returns the first card, not a random one, and says so in the
source. Nothing in this folder may read `Math.random`: two clients replaying one
action log would pick different cards.

---

# 3. The share of calls covered

`node --experimental-strip-types scripts/xmage/runtime-coverage.mjs`

Denominator: **115,240 calls in 7,931 card-local class bodies**. The API those
bodies call is **2,216 distinct functions**. This port has written **158**.

| bucket | calls | share |
|---|---:|---:|
| **implemented** | 76,564 | **66.44%** |
| refuses, out loud | 822 | 0.71% |
| native (java.util, becomes TypeScript syntax) | 9,570 | 8.30% |
| open | 17,224 | 14.95% |
| unresolved receiver | 11,060 | 9.60% |

**169 functions out of 2,212 — 7.6% of the API — cover 66.44% of the calls.**
That is the whole argument for ranking by frequency, and it is the number the
task asked for: a share of CALLS, not a share of methods.

> **Updated 23 Aug 2026, from 158 functions and 65.64%.** The change is one
> class, `Library`, and section 6a says what it cost and what it bought. The
> re-run also merges 13 rows that were keyed to a class that cannot own them;
> that correction moves 886 calls between ROW NAMES and, on its own, moves the
> coverage figure by 0.00 points. Both numbers are printed by
> `runtime-coverage.mjs`, and `--no-rekey` turns the correction off.

The four buckets are never merged into one headline, and here is what each one
is:

- **implemented** means a function in `src/lib/game/xmage/` does the thing.
- **refuses** means a function exists and DECLINES, with a deferral naming what
  it could not do. Counting these as implemented would be the third coverage
  overstatement on this project, so they are their own row. Two rows, 822 calls.
- **native** means the row is `java.util`, not XMage: `UUID#equals` (1,262),
  `Collection#add` (1,007), `Collection#stream` (676), `Stream#map` (474). A
  TypeScript translation emits `===`, `push`, and `.map`. That is real coverage
  and it costs no code, which is exactly why it is reported separately rather
  than folded into the first number. 157 rows, 9,570 calls.
- **unresolved** is the analyser's own limit, not the port's. It stays in the
  denominator.

**Implemented plus native is 74.74%** — the share of calls in an XMage card body
that a mechanical translation can currently run.

## The one caveat that matters, stated rather than buried

`Game#addEffect` is counted as implemented at 1,184 calls, and the call itself
is: it appends an `ADD_CONTINUOUS` action. But its ARGUMENT is a continuous
effect, and in XMage that argument is `new BoostTargetEffect(...)` or
`new GainAbilityTargetEffect(...)` — a class that is its own porting job, tracked
in `docs/engine/PORT-LOG.md`. So `addEffect` being implemented means the seam is
there, not that every card calling it runs. The same is true of `Effect#apply`
(694 calls): it composes translated bodies, and it is worth exactly as much as
the bodies that exist to compose.

This is the `abilityEngineOwns` distinction one level down, and it is why the
number above is called "share of calls covered" and not "share of cards
playable". They are different claims and only the second one is what a player
experiences.

## What is next, biggest first

From `xmage-runtime-coverage.json`. The distribution is flat from here: the
biggest open row is 0.24% of calls, and there is no single item left worth more
than a quarter of a percent.

| calls | share | function | cards |
|---:|---:|---|---:|
| 190 | 0.17% | `Exile#getExileZone` | 160 |
| 189 | 0.16% | `Cost#pay` | 186 |
| 169 | 0.15% | `ZoneChangeEvent#getTarget` | 111 |
| 153 | 0.13% | `MageInt#setModifiedBaseValue` | 79 |
| 147 | 0.13% | `HasteAbility#getInstance` | 146 |
| 142 | 0.12% | `Effect#setText` | 124 |
| 140 | 0.12% | `CardUtil#getPermanentFromCardPutToBattlefield` | 139 |
| 133 | 0.12% | `Game#getSpell` | 125 |
| 132 | 0.12% | `Cards#remove` | 122 |
| 132 | 0.12% | `Ability#addTarget` | 131 |

The two rows that used to head this table, `ZoneChangeInfo.Library#getFromTop`
at 273 calls and `#getTopCards` at 266, are gone from it. **The counts were
right and the class name was wrong**, and the class is written now. Section 6a.

`Cost#pay` is the interesting one on that list, because it is the missing half of
the Rhystic Study idiom: the decision is implemented and the payment is not.

---

# 4. The manifest cannot lie

`xmageApiManifest()` in `index.ts` builds one of every facade and reads its own
method names back off the object. `runtime-coverage.mjs` imports that function
and joins it against the ranked histogram. There is no hand-typed list of what
is implemented, so the 65.64% cannot drift away from the code: delete a method
and the number falls on the next run.

Two entries are hand-written and are named here so they are not mistaken for
derived ones: `Controllable` (`getControllerId`, `isControlledBy`) and
`MageItem` (`getId`). Those are abstract interfaces with no single facade behind
them; both methods are on every facade in the folder.

The `REFUSALS` set in `runtime-coverage.mjs` is also hand-written, deliberately.
Promoting a row out of it has to be an edit somebody makes on purpose, not
something that happens because a function grew a body.

---

# 5. The tests

`src/lib/game/xmage/runtime.test.ts` — 20 tests, all passing, inside a suite of
2,250 that all pass.

Every board is built from a real row of the `cards` table and every test asserts
that card's Scryfall oracle text before it asserts behaviour, the same
discipline `port.test.ts` uses. The bodies under test are TRANSLATIONS, not
paraphrases: if a test had to restructure the Java to make it run, the API would
be the wrong shape and the port would not be mechanical, which is the entire
premise.

- **Rhystic Study** — the idiom CLAUDE.md names as the shape of the whole
  problem. Six tests: it stops on the question and commits nothing, it draws when
  the opponent declines, it draws nothing when they pay, the ref is stable across
  replays, and an existing `PendingChoice` decider drives it unchanged.
- **Wrath of God** — `getBattlefield().getActivePermanents(filter)`, then destroy
  each. The assertion folds the actions through the real reducer and checks the
  BOARD, because green tests do not mean a player can reach it.
- **Blightsteel Colossus** — destroy refuses on indestructible and emits a `NOTE`
  saying so.
- **Reads see writes**, and the state handed in is byte-identical afterwards.
- **`getPermanentOrLKIBattlefield`** answers from the board the run started on
  after the permanent has gone.
- **The filter builder** — `add()` composes the way an XMage body builds one;
  `Predicates.or` and `Predicates.and` behave; reads go through the layered
  characteristics rather than the printed type line.
- **The watcher refusal** names the watcher and says `0 is not the real number`.
- **The manifest** is read off the code and cannot claim a method the code does
  not have.

## The harness

```
node --experimental-strip-types scripts/playtest/run.ts --seed 9000 --games 20 \
  --kind commander --players 4 --verify --quiet --out scratch/playtest/runs/runtime-api
```

**20 games, 19 finished, 1 stalled, 0 invariant violations.** Seed 9018 hits the
80-turn cap.

CLAUDE.md says this harness reports 20 of 20 and 0 stalled, so that discrepancy
is stated rather than glossed. It is **not** caused by this work: seed 9018 ends
at turn 81 in `refute-live-off`, `refute-live` and `meet-2026-08-23`, three runs
recorded in `scratch/playtest/runs/` before this folder existed, and there is a
`scratch/playtest/runs/9018-probe` directory from an earlier investigation of the
same seed. Nothing in `src/lib/game/xmage/` is imported by anything outside
itself yet — `grep` over `src/` and `scripts/` returns no importer — so it
cannot have changed a game the harness plays.

---

# 6. What this does not do yet

Stated plainly, because "the engine supports it" and "a player can do it" are
different claims and this document only makes the first one.

- ~~**Nothing is wired in.**~~ **Superseded.** When this was written
  `src/lib/game/xmage/` was imported by its own test and by
  `runtime-coverage.mjs` and by nothing else. The translator exists
  (`docs/engine/TRANSLATION.md`), `to-actions.ts` imports the bodies, and 217
  cards reach one through the shipped table. What that bought is measured in
  `TRANSLATION.md` section 9 and in section 6a below, and it is small.
- **No private look.** `Player#lookAtCards` is the largest single blocker left,
  62 bodies, and it is not a mapping: this engine has no way to show a card to
  one player, and a `NOTE` naming the cards would show them to everybody.
- **`Game#getObject` returns cards only.** XMage's also returns spells on the
  stack. `getStack()` reaches those separately.
- **`Cost#pay` is missing**, so the payment half of "unless that player pays" is
  not there even though the decision half is.
- **No delayed triggers, no cross-resolution value store, no watchers.** All three
  refuse out loud rather than returning a wrong number.
- **The 9.6% unresolved receivers** are a limit of the analyser, not of the port.
  Closing that gap would move calls out of `unresolved` and into one of the other
  four buckets; it would not move the implemented figure on its own.

---

# 6a. The Library, and the class name that was wrong

Added 23 Aug 2026. Everything above this line except the figures in section 3
was written before this class existed.

## The work order named a class that cannot own the methods

The two biggest open rows on the whole ranking were
`ZoneChangeInfo.Library#getFromTop` (273 calls) and `#getTopCards` (266).
`mage.game.ZoneChangeInfo.Library` is a nested helper: it declares one boolean,
three constructors and `copy()`, and nothing else. It cannot be the receiver of
either. The class the card bodies call is `mage.players.Library`, what
`player.getLibrary()` returns, and `api-surface-typed.mjs` picked the other one
because it resolves a simple name by package preference alone and `mage.game.`
outranks `mage.players.`.

Three things say so, and none of them is an opinion:

- `xmage-engine-methods.json` lists exactly one method on the nested class.
- The card files read `controller.getLibrary().getTopCards(game, 4)`. Aethermage's
  Touch, Ad Nauseam and Abundant Harvest are the first three, and 500 more
  follow.
- `translate-check.mjs` check 1 has reported the two rows moving since the
  translator was written, because `lib/java-types.mjs` already prefers a
  top-level class over a nested one.

**`api-surface-typed.mjs` is still not edited.** It produced the published
ranking, and quietly changing the script behind a published number is how
numbers drift. The correction is in `runtime-coverage.mjs`, in the open, and it
is DERIVED rather than typed: for a row whose class name is nested, it asks the
engine index whether that class can own the method through its own declarations
and its whole chain, and re-keys only when it cannot while exactly one same-named
top-level class can. It prints how many rows and calls it moved, and `--no-rekey`
turns it off.

It moves 13 rows and 886 calls, and every one of the 13 is a `Library` row. On
its own it moves the coverage figure by nothing:

| | implemented | share |
|---|---:|---:|
| re-key off, no `Library` in the manifest | 75,640 | 65.64% |
| re-key on, no `Library` in the manifest | 75,640 | **65.64%** |
| re-key off, `Library` written | 75,683 | 65.67% |
| re-key on, `Library` written | 76,564 | **66.44%** |

Row two is the point: the correction is a measurement fix and not a coverage
gain. Row three is what writing the class would have been worth without it,
0.03 points, because 886 of the 929 library calls were filed under a name the
manifest could never match. All four rows come from one script over the same
data, run four ways.

## What the class is

`makeLibrary` in `objects.ts`. Thirteen methods, twelve of them XMage's:
`getFromTop`, `getFromBottom`, `getTopCards`, `getCards`, `getCard`,
`getCardList`, `hasCards`, `size`, `count`, `isEmptyDraw`, `putOnTop`,
`putOnBottom`, and `ids`, which is ours and joins no row.

Two things about it are not obvious and both are load-bearing.

**It is LIVE.** `player.getLibrary()` used to return an `XCards`, which copies
the id list at the moment it is built. XMage binds the library object before a
loop and reads it inside one:

    Library library = opponent.getLibrary();
    do { card = library.getFromTop(game); … } while (library.hasCards());

Against a snapshot that loop never ends. So every read here goes back to the
working state, the same copy the emitted actions are folded into, which is what
makes "move the top card, then look at the top card" mean what it says.
Twenty-two card files bind the library to a local before reading it.

**Which is why there is a budget.** Liveness is the first thing in this folder
that lets a body loop, and a loop whose body fails to move a card never ends.
`countLibraryRead` counts the reads and throws `XmageRunaway` past fifty
thousand of them, far above a real library, which costs a few hundred. It throws
rather than returning a tidy empty answer, because an empty library that is not
empty is the silent wrong number this project keeps shipping, and
`to-actions.ts` already turns a throw from a translated body into a line in the
log rather than a dead resolution.

Three methods are deliberately ABSENT and their bodies stay blocked:
`removeFromTop`, `remove` and `clear` take a card out of the library without
saying where it goes, there is no action in this engine for a card in no zone,
and a version that returned the card while leaving it in place would turn
`while (…) removeFromTop()` into a loop on one card for ever. Five calls across
three card files.

## Reads return null, not undefined

`getFromTop` on an empty library is `null`, matching `Game#getPermanent` and
`Game#getCard`. XMage bodies are full of `if (card == null) break;`, the
translator turns that into `=== null`, and a facade answering `undefined` fails
that check and lets the body carry on holding nothing.

## Three defects found while doing it

All three are the same shape as the four in `TRANSLATION.md` section 6: a call
that looked like it worked and quietly did nothing or the wrong thing. None was
found by a test. All three are in `library.test.ts` now, pinned to real cards.

### `putCardsOnTopOfLibrary` reversed the cards

It emitted one `position: 'top'` move per card in order, and each one goes to
index 0, so three cards came back in the opposite order. The commonest thing a
library read is followed by is putting the cards it read straight back.
Architects of Will reads `getTopCards(game, 3)` and returns exactly those three,
so the card whose whole job is to leave a library alone was scrambling its top
three in silence. The moves go back to front now, so the first id given ends up
on top.

**And the order was never ours to pick.** XMage's
`putCardsOnTopOfLibrary(cards, game, source, anyOrder)` either asks the player to
order the cards one at a time or SHUFFLES them, and "the order you handed me" is
neither. So it defers when there is more than one card, saying the player was not
asked. That adds no behaviour and guesses nothing, which is what `getWatcher` and
the unbound target pointer already do.

### `searchLibrary` threw away the target it was supposed to fill

XMage's `Player#searchLibrary(target, source, game)` returns a boolean and FILLS
the target, and every body that searches reads the answer back off it on the
next line:

    if (opponent.searchLibrary(target, source, game)) {
        Card found = opponent.getLibrary().getCard(target.getFirstTarget(), game);

Ours took a bare filter and returned the ids, so the target stayed empty,
`getFirstTarget()` was `undefined` and `getCard(undefined)` was `null`. **Oriq
Loremage asked the player to search their library, took the answer, shuffled,
and put nothing in the graveyard, and returned true.** Boldwyr Heavyweights
asked every opponent whether to search and put nothing onto the battlefield.
Five shipped bodies have this shape, and `Library#getCard` is the line that reads
the answer, so mapping it is what made the failure reachable.

`searchLibrary` takes the TARGET now, which is also XMage's own signature, and
fills it. The asking stays on the player rather than moving to `Target#choose`,
because only the player knows which library is theirs and `choose` would offer
every library on the board.

### `revealCards` called a two-argument function with one argument

The mapping took the `Cards` and dropped the title, and the empty string meant to
replace the title never appeared, because `lit` only fires for a position that is
actually taken. Every body reaching `revealCards` emitted `revealCards(cards)`
and was thrown away by `tsc --strict` as TS2554. It went unnoticed because almost
nothing reached `revealCards` until the `Library` rows unblocked the bodies that
do: "reveal the top card of your library" is the commonest thing a library read
is followed by. **60 bodies were failing this way; 2 remain**, on a different
overload.

## What it bought

`translate-bodies.mjs`, before and after, joined body by body through the new
`--ledger` and `--drop` flags rather than by subtracting totals:

| | |
|---|---:|
| bodies whose FIRST blocker was one of the four named rows | **459** |
| of those, emit after phase one | 71 (15.5%) |
| of those, **SHIP** after `tsc --strict` | **54 (11.8%)** |
| every body first-blocked on any `Library#` row | 505 |
| of those, ship | 61 |

**54 of 459.** A body blocked on one thing is usually blocked on a second, and
the second is the honest number. What the other 388 stopped on next:

| bodies | next blocker |
|---:|---|
| 62 | `Player#lookAtCards` |
| 29 | `Player#choose/5` |
| 16 | `CardUtil#makeCardPlayable` |
| 11 | `Cards#remove` |
| 11 | `CardUtil#castSpellWithAttributesForFree` |
| 9 | `CardUtil#castMultipleWithAttributeForFree` |
| 9 | `Card#setFaceDown` |

`Player#lookAtCards` heads the list and is not so much a missing function as a
missing idea: this engine has no private look, and a `NOTE` naming the cards
would show them to everybody. It is the top of the next work order and it is a
decision about hidden information rather than a mapping.

Across the whole corpus, shipped bodies went **758 to 852** and card files
**721 to 812**. 61 of that increase is the `Library` rows; the rest is the
`revealCards` and `CardsImpl` mappings the Library work exposed. Substantive
bodies went **380 to 474**, and the trivial count is unchanged at 378, so every
new body is a substantive one.

## And what it did not buy

`scripts/verify-ability-coverage.mjs`, the only number that counts:

| | AUTOMATED | of 32,469 |
|---|---:|---:|
| before | 3,488 | 10.74% |
| after | **3,501** | **10.78%** |

Under the script's stricter variant, 10.10% to 10.13%.

**Thirteen cards.** Ninety-four more translated Java bodies, forty-one more cards
carrying a body pointer in `lowered.generated.ts` (176 to 217), and the bar moved
four hundredths of a point. That is the fifth time this project has measured the
distance between an API being written and a player reaching it, and it is worth
writing down rather than rounding up.

## Gates

Typecheck: 0 errors in `src/lib/**` and `scripts/**`. One error in
`src/components/deck/DeckAddPanel.tsx` and a stale vendored engine, both from a
concurrent edit to `src/engine/core/types.ts` that added a `creature` role.
Neither file is this work's to touch and neither is caused by it.

`node --test src/lib/**/*.test.ts`: **1,697 pass, 0 fail**, including 29 new
tests in `src/lib/game/xmage/library.test.ts`. The 14 failures in the full run
are all in `src/engine/engine-parity.test.ts`, the vendored-copy check failing
for the same reason the `pretest` gate does.

Harness, 20 commander games on seed 9000: **19 finished, 1 stalled, 0 invariant
violations, 0 replays diverged.** Seed 9018 hits the 80-turn cap, the same
pre-existing stall recorded in three earlier runs; re-run with `--max-turns 200`
it **finishes on turn 82**, so it is a long game and not a deadlock. The analysis
report is identical to the `bodies-loud` baseline except for one row: one more
card doing a library search now says out loud that it did not do it.

Sample read: 11 newly shipped bodies read against their Java, chosen
deterministically. **Nine agree line for line. Two disagree, and both are the
`searchLibrary` defect above**, Oriq Loremage and Boldwyr Heavyweights, which is
how it was found. Both are fixed in the runtime and the mapping, never in the
output.

---

# 6b. Six overloads, three defects, and the thing the number is now waiting on

Added 23 Aug 2026. The figures in sections 3 and 6a are superseded by the ones
below; everything else above this line stands.

## What this tranche was asked to do, and what was already true

The task was to make a translated body RUN when a card resolves. It already
does. `to-actions.ts` has carried a `{do:'xmage-body'}` case since section 9 of
`TRANSLATION.md`, `compileWithTrace` reaches it through `xmageSwapFor`, and both
resolution paths in `stack.ts` end at `resolveAbilityRun`, which turns every
line a body defers into a `NOTE` in the game log. Measured on the pool:
**1,367 cards are swapped to an XMage record and 191 of them carry a body**, of
which 36 are AUTOMATED and 32 are PROMPTED or PROMPTABLE.

So the seam was not the constraint. The constraint is how many cards have a
translated body at all, and that is a translator question. This section is the
runtime half of the answer; `TRANSLATION.md` section 11 is the other half.

## The methods

Six rows on the translator's work order were overloads of methods this port
already had. Together they were the first blocker on 290 bodies, which was more
than the three effect classes ranked above them and very much cheaper.

| added | what it is |
|---|---|
| `Player#millCards` | `millCards(int, Ability, Game)`. XMage's own implementation is `getTopCards` then `moveCards` to the graveyard, both of which existed. It returns the milled pile, because the next line of a body reads it. |
| `Player#discardCards` | The two `discard` overloads that NAME the cards. Not a decision, so it must not raise one. Ours, not XMage's, so it joins no row here. |
| `Target#choose(…, from)` | A fourth argument: choose out of a pile the caller already has. This is what `Player#choose(Outcome, Cards, TargetCard, Ability, Game)` needs, 97 bodies, and the pile is usually somewhere the target's own zone cannot see. |
| `Player#discard(count, max)` | The range form. See defect 1. |

`Permanent#damage/6`, `Player#damage/6` and `Card#addCounters/3` needed no new
function at all: they are longer spellings of overloads already mapped, and the
translator now recognises them when the extra flags are the defaults XMage's own
short forms pass. `Player#choose/3`, the `Choice` form, is mapped and bought
nothing: every body reaching it stops one step earlier on a `Choice` this port
cannot build.

## Three defects, all found by reading a shipped body against its Java

### 1. One arity row matched two different overloads

`Player#discard` has two five-argument forms:

    Cards discard(int amount, boolean random, boolean payForCost, Ability, Game)
    Cards discard(int minAmount, int maxAmount, boolean payForCost, Ability, Game)

One row took argument 0 as the amount and matched both. So
`discard(0, Integer.MAX_VALUE, false, source, game)`, which is XMage for "discard
any number of cards", translated to `discard(0)`, which returns nothing and says
nothing. The second argument is what tells them apart and the mapping reads it
now.

### 2. `Integer.MAX_VALUE` did not read as an int, so a target could hold nothing

`target()` collects the int arguments of a target constructor to work out its
min and max. `Integer` is not an engine class, so the type lookup answered null,
so the upper bound was invisible, so `new TargetCardInHand(0, Integer.MAX_VALUE,
filter)` became `{ min: 0, max: 0 }`: a target that cannot hold a card.
**271 target constructors in the card files are written that way.**

### 3. A target whose minimum is zero never asked anybody

`Target#choose` opened with `if (chosen.length >= min) return [...chosen]`. With
`min` legitimately 0 that is `0 >= 0` on the first line, so the target returned
an empty list without asking, and the body carried on as though the player had
declined. It is now `>= Math.max(min, 1)`: a target that was already filled
still short-circuits, and a target that may take nothing is still a question.

Nantuko Cultivator is where both of the last two showed up together. Printed:
"You may discard any number of land cards. Draw that many cards." It discarded
nothing, drew nothing, grew by nothing, and returned false. `overloads.test.ts`
now runs its shipped body and asserts all three.

A fourth thing, not a defect but the same shape: `discard` returned an id array
where XMage returns a `Cards`, and 23 otherwise complete bodies were thrown away
by `tsc` for asking a `string[]` for its `size()`.

## A body that throws does not take the game with it

`to-actions.ts` already caught it. What was missing was a test, and the task
asked for the decision to be written down: **a body that throws is reported as a
deferral naming the key and the message, the other effects of the same ability
still run, and `resolveAbilityRun` turns the deferral into a `NOTE` a player
reads.** Three tests in `xmage-body.test.ts` assert exactly that, including one
that folds the resulting actions through the real reducer. They install a
throwing body in `TRANSLATED_BODIES` and remove it again, because the import in
`to-actions.ts` is deliberately direct and a registry added to make this
testable would be a registry that can be empty when a card resolves.

## The share of calls, re-run

`node --experimental-strip-types scripts/xmage/runtime-coverage.mjs`

| bucket | calls | share |
|---|---:|---:|
| **implemented** | 76,678 | **66.54%** |
| refuses, out loud | 822 | 0.71% |
| native | 9,570 | 8.30% |
| open | 17,110 | 14.85% |
| unresolved receiver | 11,060 | 9.60% |

**170 functions**, up from 169, and 66.44% to 66.54%. Only `millCards` is an
XMage name, so it is the only one of the four additions that can move this
figure at all. Implemented plus native: 74.74% to **74.84%**.

That is the whole point of keeping this figure separate from the coverage bar
below. A tranche that added four functions and 98 shipped bodies moved the share
of calls by a tenth of a point and the share of cards a player can play by two
hundredths. Neither number is wrong. They answer different questions.

## Gates

Typecheck: **0 errors** over `tsconfig.app.json`. The `DeckAddPanel.tsx` error
and the stale vendored engine that section 6a recorded are both gone; that
concurrent edit has landed.

`npm test`: **2,401 pass, 0 fail**, including 13 new tests in
`src/lib/game/xmage/overloads.test.ts` and 3 in
`src/lib/game/abilities/xmage-body.test.ts`. `pretest` passes now too.

`npm run build` succeeds.

Harness, 20 commander games on seed 9000 at `--max-turns 200`: **20 finished, 0
stalled, 0 invariant violations.** Seed 9018 finishes on turn 82, which is what
section 6a predicted. The analysis report is the `bodies-loud` baseline plus
three resolutions and one more card that says out loud what it did not do.

Sample read: five newly shipped bodies against their Java, chosen from the ones
using the new mappings. Chandra's Ignition, Colossal Badger, Windfall, Sire of
Insanity and Grindclock **agree line for line**. Nantuko Cultivator did not, and
that is defect 2 and 3 above.

---

# 6c. The effect classes, the two tables behind them, and where the return stopped

Added 23 Aug 2026. The figures in sections 3, 6a and 6b are superseded by the
ones below; everything else above this line stands. `TRANSLATION.md` section 12
is the translator half and carries the exchange rate.

## The work order named the wrong unit, twice

The task named `CreateTokenEffect`, `BoostTargetEffect` and
`CreateTokenCopyTargetEffect` as the next block, 179 bodies, and said to re-rank
first because the list changes as things get written. Re-ranking moved the
answer, for a reason worth keeping: **the work order ranks by ROW, and the
largest things left are FAMILIES.**

A family is a row per member. Re-aggregating the blocked bodies by what one piece
of work would serve — over the **5,423** a `--census` run reports, which is phase
one, rather than the 5,574 a full run blocks once the typecheck has dropped its
share:

| bodies | cards | family | rows it is spread across |
|---:|---:|---|---:|
| 491 | 487 | a shared `*Effect` class | 183 |
| 129 | 128 | `CreateToken*Effect` | 2 |
| **127** | **127** | **a token CLASS** | **101** |
| 123 | 123 | a `*Predicate` | 21 |
| 106 | 105 | `CardUtil#getSourceCostsTag` | 1 |
| 80 | 80 | `GameState#getWatcher` | 1 |

The token classes are 127 bodies and they never appear on the ranking, because
101 distinct classes at one and two bodies each sit below every visible row.
They were also **already extracted**: `scripts/xmage/extract-tokens.mjs` parsed
741 of XMage's 793 token classes into `tokens.generated.ts` in an earlier
tranche and nothing had ever read it. So the largest single item available was
also the cheapest, and it was invisible.

The same shape appeared again after the first step: `StaticFilters.*` is 181
bodies across 56 constants and `new Filter*` is 62 more across 22 classes.
Neither is a row anybody would have picked off the list.

## Step one: tokens, CreateTokenEffect, BoostTargetEffect

`src/lib/game/xmage/effects.ts` is new, and it is the first file in this folder
that is HAND written rather than the runtime a machine translation calls. That
distinction is the point: a card-local body lives in `bodies.generated.ts` and is
translated; a shared effect class is called by hundreds of cards, and a machine
translation of one would be wrong in hundreds of places at once.

- **`xmageToken(scope, className)`** reads the generated table. A class the table
  does not hold RAISES rather than falling back on a 1/1, and a constructor with
  ARGUMENTS blocks in the translator: `new PhyrexianRebirthHorrorToken(count,
  count)` sizes the token from the board, and the no-argument spec would put a
  token of the wrong size onto the battlefield in silence. 118 of the 127 take no
  arguments; the other nine block by name.
- **`createTokenEffect`** is XMage's `CreateTokenEffect`, with the parts a body
  reads back off it: `getLastAddedTokenIds`, `entersWithCounters`,
  `withAdditionalTokens`, and the two removal methods, which defer because they
  set up a delayed trigger and there is no store for one.
- **`boostTargetEffect`** and **`boostSourceEffect`** build one of this engine's
  own `ContinuousEffect` records at layer 7c. They are BUILDERS rather than
  finished records because `setTargetPointer` arrives on the line after the
  constructor, so an effect that resolved its targets eagerly would resolve them
  before it had any.

`Game#addEffect` now takes the ability as its second argument, which is XMage's
own signature. It used to be dropped, and it can be dropped as long as the
argument is a finished record; a builder cannot say what it is about without it.

## Step two: the filter family, derived rather than transcribed

`scripts/xmage/extract-filters.mjs` is new and follows the `extract-tokens.mjs`
precedent exactly: read XMage's own filter classes and `StaticFilters.java`,
resolve each to a predicate list, and REFUSE anything carrying a predicate this
engine cannot express rather than publishing it short.

- Of the 67 filter files, 13 are base classes this script handles directly. Of
  the remaining 54: **32 read, 22 refused**, each refusal named by the predicate
  that stopped it.
- 98 of 198 `StaticFilters` constants read.
- 171 of the 198 constants pass only a NAME to their constructor. That argument
  is dropped, and dropping it is not an approximation:
  `new FilterNonlandCard("a nonland card")` matches exactly what
  `new FilterNonlandCard()` matches. Any OTHER argument narrows the filter, and
  those refuse.

**The name is built, never copied.** XMage's own filter string is Wizards of the
Coast wording; the message this table emits is assembled from the predicates that
resolved, which is the rule `extract-tokens.mjs` already applies to a token's
type line.

**Eighteen of the derived constants overlap the 29 hand-typed rows already in
`translate.mjs`, and all eighteen agree.** That is what makes the other 80
trustworthy, and it is why the hand rows still win: a row somebody wrote on
purpose is never silently replaced by a parse.

### The extraction was wrong twice before it was right, and both were the same wrong

The first version returned an EMPTY predicate list for
`FilterControlledCreaturePermanent`, because XMage's constructors delegate three
hops deep and the walker followed one and returned what it had. An empty
predicate list under a name that says "creature you control" is a filter that
matches every permanent on the battlefield.

The second version ignored the STATIC BLOCKS, where half the meaning lives:

    FILTER_CONTROLLED_UNTAPPED_CREATURES = new FilterControlledCreaturePermanent(...);
    static { FILTER_CONTROLLED_UNTAPPED_CREATURES.add(TappedPredicate.UNTAPPED); }

Read from the declaration alone, that constant is "creatures you control", and a
card built on it would let a player tap a creature that was already tapped.

Neither was caught by anything except reading eight constants against their Java
before wiring the table in. Both had the shape this project keeps relearning: the
extractor gave up quietly and returned the part it managed. It refuses now — a
chain it cannot follow to its end, a guard it cannot decide, or an `add` it
cannot resolve all refuse the whole filter and report it by name.

## Six defects, and the first would have shipped in the change that caused it

### 1. Every token would have arrived colourless

`XTokenSpec` was a narrower hand-written copy of the engine's `TokenSpec`, with
no `colorIdentity`. `CREATE_TOKEN` takes a `TokenSpec`, a narrower object is
assignable to a wider one, so the colour was dropped by the type system without a
word. It was **unreachable until this change** — no shipped body could build a
token at all — and would have become reachable in the same commit that wired the
table in. `XTokenSpec` is an alias of `TokenSpec` now, so it cannot drift again.

### 2. A chain forgot what it was, and 16 bodies were thrown away for it

`Effect#setTargetPointer` returned `XEffect`. XMage bodies write
`new BoostTargetEffect(2, 2).setTargetPointer(...)` and hand the result straight
to `game.addEffect`, and after that chain the value was no longer a
continuous-effect builder as far as `tsc` was concerned. Sixteen bodies were
translated correctly and dropped. The return type is `this`.

### 3. `FixedTarget` takes an object as often as an id

XMage has six constructors and `new FixedTarget(permanent, game)` is the
commonest spelling in a body. Ours took only the id, so 20 bodies translated and
were then rejected for handing a permanent where a string belonged. It takes
either now. **What our version does NOT do is pin the zone change counter**,
which XMage's object forms do, so the pointer here follows the id alone and will
still find a card somebody moved in between. That is a real difference and it is
recorded rather than hidden.

### 4. `Game#getObject(Ability)` is a second overload on the same arity

`game.getObject(source)` is how a body reads the card its own ability is printed
on, and XMage's implementation of it is `getObject(source.getSourceId())`. Ours
had only the id form, and the two cannot be told apart by argument count, so 20
bodies failed to typecheck. It is matched on the argument TYPE now.

### 5. `putOntoBattlefield` returned void where XMage returns boolean

All seven of XMage's overloads return "did any token arrive", and Tempting
Contract reads `if (opponent.chooseUse(...) && token.putOntoBattlefield(...))`.
Ours returned void, which is not a thing that can be tested for truth.

### 6. The wording guard had only ever read half the file

`translate-check.mjs` check 5 refuses any string literal in the generated file
with a space in it, on the blunt rule that every string this engine uses as data
is one token. It scanned **double-quoted literals only**. The translator emits
both: `JSON.stringify` produces double quotes and the hand-written `NEW` rows in
`translate.mjs` are written with single ones. So for as long as that check has
existed, every hand-written filter name in the generated file was invisible to
it, and it reported zero with a hole in it.

It reads both quote characters now, and it immediately found two pre-existing
names, `permanent you control` and `nonland card`. Both are ours rather than
XMage's, and both are now emitted as a LIST OF WORDS that `makeFilter` joins,
which is also how the derived filter names go in. The check stays blunt, it sees
twice as much, and it reads **zero**.

Softening the rule for these rows was the other option and it was the wrong one.
A guard that reads zero while it cannot see half of what it guards is worse than
no guard, because the zero is believed.

## A seventh thing, in a gate rather than in the engine

`lowered.generated.ts` was **not byte-reproducible**, and the previous tranche
gated on "generator output is byte-reproducible". Two runs over identical inputs
produced identical records and different file hashes, because the header carried
a build timestamp. The claim could be made and never checked. The stamp is gone;
the XMage commit above it is what identifies the input, and unlike a clock it
reads the same on every machine. Both generators hash identically across runs
now.

## The share of calls

`node --experimental-strip-types scripts/xmage/runtime-coverage.mjs`

| bucket | calls | share |
|---|---:|---:|
| **implemented** | 76,738 | **66.59%** |
| refuses, out loud | 822 | 0.71% |
| native | 9,570 | 8.30% |
| open | 17,050 | 14.80% |
| unresolved receiver | 11,060 | 9.60% |

**171 functions**, up from 170; 66.54% to 66.59%. Implemented plus native, 74.84%
to **74.89%**. Most of this tranche is not a function at all — it is two tables
and a set of overloads — so this figure barely moves, which is the expected shape
rather than a disappointment. It answers a different question from the bar in
`TRANSLATION.md` and the two are never added together.

## Gates

`tsc --noEmit -p tsconfig.app.json`: **0 errors**.

`npm test`: **2,444 pass, 0 fail**, including 16 new tests in
`src/lib/game/xmage/effects.test.ts`. Five of those run a body that really ships
rather than one the test wrote, which is the discipline `library.test.ts` set: a
body written by the test proves the facade runs, not that anything reaches it.
Every board is folded through the real reducer before it is asserted.

`npm run build` succeeds, prebuild gate included.

Checks 1 to 5 unchanged except check 5, which now reads both quote characters and
still reports **0 of 4,565 literals**. Check 4: 1,125 bodies, 378 trivial, **747
substantive** — the trivial count is unchanged at 378, so every body this tranche
added is a substantive one.

Harness, seed 9000, 20 games, `--max-turns 200`: **20 finished, 0 stalled, 0
invariant violations.** Seed 9018 finishes on turn 82, the same as the last two
tranches.

Sample read: 12 pairs, chosen deterministically from the 1,125 that ship. **All
12 agree line for line.** The one thing worth naming is not a disagreement:
Living Lore and Severance Priest both emit `moveCardsToExile(card)` without the
exile-zone id, which is `CardUtil#getExileZoneId` being dropped along with its
argument. Check 2 counts it, 13 occurrences, and what it means is that those
cards exile to a generic zone rather than a named one.

---

## 6d. Whose pile is it: the owner scope on a zone target (23 August 2026)

Added by the adversarial read of sections 6a to 6c. `docs/engine/TRANSLATION.md`
section 13 is the full account; this is what changed in the runtime.

### The rule, read out of XMage rather than assumed

XMage never puts the owner restriction in the filter. It puts it in the target
class, and the filter it hands that class says "your" only in the display name it
was constructed with:

    TargetCardInYourGraveyard.possibleTargets(sourceControllerId, source, game)
        -> game.getPlayer(sourceControllerId).getGraveyard()

    TargetCardInHand.possibleTargets(sourceControllerId, source, game)
        -> game.getPlayer(sourceControllerId).getHand()

    TargetCardInLibrary.canTarget(id, source, game)
        -> game.getPlayer(source.getControllerId()).getLibrary().getCard(id, game)

    TargetCardInOpponentsGraveyard.possibleTargets(sourceControllerId, …)
        -> every player in range the source controller hasOpponent()

    TargetCardInGraveyard   -> every graveyard, so no restriction
    TargetCardInExile       -> the shared exile in range, so no restriction

The translator read the filter, took the zone from the class NAME and dropped the
rest, so the first four and the fifth all arrived here as a bare
`zone:'graveyard'` or `zone:'hand'`. `makeTarget`'s `legalSet` filters on
`card.zone` alone, so all of them offered every player's pile.

### What that did

26 shipped bodies. Measured on the pre-fix bundle, on a real board, answering the
one question Gix's Command asks with an opponent's card:

    before:  MOVE_ZONE theirAngel -> hand
    after:   nothing moves; the chooser's own card still comes back

Dream Cache, Nantuko Cultivator, Sawtooth Loon, Tooth and Nail and eleven more
were reading somebody else's hand the same way.

### The shape of the fix

`XTargetOptions` gains one field:

    owner?: 'chooser' | 'not-chooser';

Scoped by OWNER and not by controller, because a hand, a graveyard and a library
are owner-keyed piles in this engine exactly as they are in XMage, and a stolen
creature still dies to its owner's graveyard. Applied in `legalSet`, which is
`possibleTargets` and `canChoose`, and in `withinSet`, which is the
candidate-pile path, because XMage enforces the same restriction in `canTarget`.

The direction of the failure case is the load-bearing part. With no chooser
passed it returns NOTHING and files a deferral. Falling back to "every pile"
would be the original bug wearing a guard clause, and it would be silent; an
empty list plus a line in the log is the visible failure this port prefers.

Undefined for the classes that genuinely mean any player's pile, so
`TargetCardInGraveyard` still sees every graveyard, which is what Liliana, the
Necromancer needs.

### The ratchet

`src/lib/game/xmage/owner-scope.test.ts`, seven tests. Five drive the facade,
one drives a body out of `bodies.generated.ts` rather than one the test wrote,
and the last walks the whole shipped bundle and fails if any hand or library
target is emitted without an owner. XMage has exactly one hand target class and
one library target class in this corpus and both are chooser-scoped, so a
missing owner there is the mapping regressing rather than a card that means
something else.

42 shipped bodies now name whose pile they mean. Nothing uses `not-chooser` yet:
no body in the bundle constructs `TargetCardInOpponentsGraveyard`.

### One more flag, in the translator rather than in the runtime

`Player#discard`'s five-argument form was matched on the TYPE of argument 1 and
then dropped it. Argument 1 is `random`, so XMage's "discard a card at random"
was arriving as our `discard(count)`, which asks the player which card to pitch.
Now guarded with `flags({ 1: 'false', 2: 'false' })`, so a random discard and a
discard paid as a cost block with their arity named until the facade has
something to map them to. Three bodies leave the bundle and coverage falls by one
card, which is the honest direction.
