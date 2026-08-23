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
| **implemented** | 75,640 | **65.64%** |
| refuses, out loud | 822 | 0.71% |
| native (java.util, becomes TypeScript syntax) | 9,570 | 8.30% |
| open | 18,148 | 15.75% |
| unresolved receiver | 11,060 | 9.60% |

**158 functions out of 2,216 — 7.1% of the API — cover 65.64% of the calls.**
That is the whole argument for ranking by frequency, and it is the number the
task asked for: a share of CALLS, not a share of methods.

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

**Implemented plus native is 73.94%** — the share of calls in an XMage card body
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
| 273 | 0.24% | `ZoneChangeInfo.Library#getFromTop` | 260 |
| 266 | 0.23% | `ZoneChangeInfo.Library#getTopCards` | 266 |
| 190 | 0.17% | `Exile#getExileZone` | 160 |
| 189 | 0.16% | `Cost#pay` | 186 |
| 169 | 0.15% | `ZoneChangeEvent#getTarget` | 111 |
| 153 | 0.13% | `MageInt#setModifiedBaseValue` | 79 |
| 147 | 0.13% | `HasteAbility#getInstance` | 146 |
| 142 | 0.12% | `Effect#setText` | 124 |
| 140 | 0.12% | `CardUtil#getPermanentFromCardPutToBattlefield` | 139 |
| 133 | 0.12% | `Game#getSpell` | 125 |

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

- **Nothing is wired in.** `src/lib/game/xmage/` is imported by its own test and
  by `runtime-coverage.mjs`, and by nothing else. No card resolves through it. The
  next piece of work is a translator that emits these bodies from
  `scripts/xmage/lib/java-parse.mjs`, and then a bridge from `to-actions.ts`.
- **`Game#getObject` returns cards only.** XMage's also returns spells on the
  stack. `getStack()` reaches those separately.
- **`Cost#pay` is missing**, so the payment half of "unless that player pays" is
  not there even though the decision half is.
- **No delayed triggers, no cross-resolution value store, no watchers.** All three
  refuse out loud rather than returning a wrong number.
- **The 9.6% unresolved receivers** are a limit of the analyser, not of the port.
  Closing that gap would move calls out of `unresolved` and into one of the other
  four buckets; it would not move the implemented figure on its own.
