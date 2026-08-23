# Translating XMage's card bodies by machine

Generator: `scripts/xmage/translate-bodies.mjs` and `scripts/xmage/lib/translate.mjs`.
Output: `src/lib/game/xmage/bodies.generated.ts`.
Verification: `scripts/xmage/translate-check.mjs`.
Report: `scripts/coverage/.data/xmage-translation.json`.

## Attribution and licence

Behaviour here is derived from **XMage**, which is MIT licensed,
`Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
The clone is read in place, outside this repository, at commit
`07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d`. Nothing from it is vendored.

**No XMage display string reaches the generated file, and that is measured
rather than asserted.** Section 6 has the number and the rule that produces it.
Card wording comes from Scryfall.

Forge is GPL-3.0. It was not fetched, read or referenced.

---

# 1. What this does

The previous phase built the API: `src/lib/game/xmage/`, 158 functions covering
65.64% of the calls XMage's card bodies make. `docs/engine/RUNTIME-API.md`
section 6 said the next piece of work was "a translator that emits these bodies
from `scripts/xmage/lib/java-parse.mjs`". This is that translator.

It reads the 7,931 XMage card files that declare their own Java class, finds the
card-local `apply(Game game, Ability source)` method — the one that RUNS when the
card resolves, and the one that maps exactly onto our
`XmageBody = (game, source) => boolean` — and translates it tree to tree into
TypeScript that calls our facades.

It is a tree translation, not a text one. `java-parse.mjs` already parses all
32,168 files token for token with 0.00% failure, so every decision below is taken
on a parse node.

## The rule that decides whether a card emits

A body emits only when EVERY node in it has a mapping. One unmapped call,
constructor, constant or statement kind and the whole body is refused, and the
thing that stopped it is recorded by name.

That is the point rather than a limitation. A card that resolves and does part of
what it says is what CLAUDE.md calls a serious bug; a card that is absent is a
known gap. So `blocked` is not an error log, it is the work order, and section 5
ranks it.

---

# 2. The numbers

`node scripts/xmage/translate-bodies.mjs`

| | |
|---|---:|
| card files scanned | 32,168 |
| with a card-local class | **7,931** |
| of those, declaring `apply(Game, Ability)` | 5,903 |
| `apply` bodies found (a file can have several) | 6,524 |
| **bodies emitted** | **758** |
| **card files that emit something** | **721** |
| bodies blocked | 5,766 |
| of which dropped by the typecheck phase | 147 |

**721 of the 7,931 — 9.1% — now emit something.** Against the 5,903 files that
have an `apply` body at all, which is the population a translator of `apply` can
reach, it is 12.2%.

## The number that number is not

`node scripts/xmage/translate-check.mjs`, check 4:

| | |
|---|---:|
| bodies in `bodies.generated.ts` | 758 |
| whose whole body is `return true;` or `return false;` | **378** |
| substantive | **380** |

Half of what translates does nothing. Those are real overrides — an
`AsThoughEffect` or a `ContinuousEffect` has to implement `apply`, and its actual
behaviour lives in a different method — and they translate perfectly and are
worth nothing on their own. `TranslatedBody.trivial` carries the flag on the
record itself, so no caller can mistake one for behaviour, and
`bodies.generated.test.ts` asserts that a body marked trivial emits no actions.

So the honest headline is **380 substantive translated bodies across 721 card
files**, and the two halves are never added together into one number.

---

# 3. How a body is translated

## Statements and expressions

Declarations become `let`, control flow becomes control flow, `==` becomes `===`.
A control-flow head is an opaque token slice in the parser, so it is re-parsed
rather than pattern-matched. Enhanced-for becomes `for…of`, and when the thing
being iterated is our `XCards` rather than an array the translator emits
`.getCards()`.

## Four tables, and each is a different kind of missing

| table | what it maps | what a gap means |
|---|---|---|
| `METHODS` | `Root#method` to our function, plus which Java argument positions to pass | a mapping to write, or a function to write |
| `NEW` | `new SomeClass(...)` to a call into our API | a constructor with no counterpart |
| `CONSTS` | `Zone.BATTLEFIELD`, `CounterType.P1P1` to our spelling | a constant with no counterpart |
| `NATIVE` | `java.util` to TypeScript syntax | no runtime code involved either way |

A method can be IMPLEMENTED in the runtime and still block. `Player#choose(Outcome,
Target, Ability, Game)` returns a boolean and FILLS the target; ours is
`Target#choose(game, prompt, controllerId)` and returns the ids it filled. Same
behaviour, different shape, so it needs a REWRITE rather than an argument
permutation — and the report separates `method` (no function) from `arity` (a
function whose overload this table does not describe), because they are different
jobs.

## Arguments are translated lazily

The translator does not translate an argument it is not going to pass on. XMage's
signatures carry three things this engine does not want: the `Game` and the
`Ability`, both already in scope, and a display message.

Translating a dropped argument only to throw it away turned every card whose
prompt reads `"Have " + permanent.getLogName() + " gain reach?"` into a body
blocked on string concatenation. Nothing was wrong with those cards.

## Constant propagation through the card's own constructor

XMage writes the filter in one place and uses it in another:

```java
class FooEffect extends OneShotEffect {
    private final FilterPermanent filter;
    FooEffect(FilterPermanent filter) { this.filter = filter; }
}
// and in the card:
new FooEffect(StaticFilters.FILTER_LAND)
```

The field IS a constant; it takes two hops to see it. Following those hops is
ordinary constant propagation over the tree and it was the single biggest thing
standing between a body and a translation: **328 bodies stopped on an unknown
`filter`** before it existed, and 62 do now.

It refuses to guess in the cases where guessing would be wrong: more than one
construction site with different arguments, and a constructor that computes
rather than assigns.

**And it follows the static initialiser too**, which is the half that a first
version missed and section 6 records finding:

```java
private static final FilterPermanent filter = new FilterPermanent();
static { filter.add(SubType.FOREST.getPredicate()); }
```

Reading only the declaration gives "any permanent".

## Targets are read by TYPE, not by position

XMage's target constructors overload on position: `TargetPermanent(FilterPermanent)`,
`(int numTargets)`, `(int min, int max, FilterPermanent, boolean notTarget)`. Taking
argument zero as the filter is wrong more often than it is right, and it showed as
29 bodies emitting `makeTarget(scope, { filter: 0 })` where the 0 was a minimum
count. The filter is now the argument whose TYPE is a filter, the counts are the
integers, `notTarget` is the boolean, and the zone comes from the class name.

## Two phases, because a body that does not typecheck is not a translation

Phase one emits everything with a complete mapping. Phase two runs `tsc` over the
emitted file **under `strict: true`** — stricter than `tsconfig.app.json`, which
has `strict: false` — maps each error back to the body it came from, and re-emits
without those bodies, recording them as blocked with the TypeScript error code.

147 bodies are dropped this way. Most are genuine: XMage's Java dereferences
without a null check where our facades return `XPlayer | null`. Emitting `!` to
silence those would hide exactly the failure the type is reporting.

Both phases are deterministic, so re-running reproduces the same file.

---

# 4. Verification

`node scripts/xmage/translate-check.mjs --sample 30`

Five checks. Every one produces a number.

## Check 1 — the shared inference agrees with the published ranking

`lib/java-types.mjs` re-implements the receiver-type inference that
`api-surface-typed.mjs` does inline, because the translator has to ask the
question one node at a time rather than once over a token stream. Two copies of
anything drift, so this rebuilds the whole by-root histogram through the shared
module and diffs it against `xmage-api-surface.json`.

```
calls through lib/java-types.mjs : 115,240
calls in xmage-api-surface.json  : 115,240
rows with an identical count     : 2,167
rows that moved                  : 44
```

**Same total to the call. 2,167 of 2,211 rows identical.** The 44 that moved are
two deliberate improvements:

| delta | row | note |
|---:|---|---|
| +273 / -273 | `Library#getFromTop` from `ZoneChangeInfo.Library#getFromTop` | see below |
| +266 / -266 | `Library#getTopCards` | see below |
| +140 / -140 | `Target#getFirstTarget` from `?#getFirstTarget` | fewer unresolved |

**The published work order names the wrong class for its two biggest open rows.**
`Library` exists twice in XMage: `mage.players.Library`, which is what
`player.getLibrary()` returns, and `mage.game.ZoneChangeInfo.Library`, a nested
helper no card touches. Package preference alone picks the nested one, because
`mage.game.` outranks `mage.players.`. The COUNTS in `RUNTIME-API.md` are right;
the class name on those rows is not. The function to write is
`Library#getTopCards` on the player's library.

`Targets extends ArrayList<Target>`, so `targets.get(1)` has no declaration
anywhere in XMage and the type was lost mid-chain. A small patch table restores
it, which is where the `Target#getFirstTarget` move comes from.

## Check 2 — no call is silently dropped

Lazy argument translation is right, and it is also exactly how a translator hides
work. So for every body that translates, this compares the calls the walk reached
against every call the Java body CONTAINS.

```
bodies that translate          : 905   (phase one)
calls those bodies contain     : 4,294
calls the translation reached  : 4,517
calls dropped with an argument : 137  (3.19%)
```

**3.19%**, and what they are is the expected list: `getName`, `getLogName`,
`getIdName`, `getSourceName` inside prompts, and `getControllerId` inside dropped
positions. `reached` EXCEEDS `contained` because an inlined field brings calls
with it from the card's own constructor, which is extra translation rather than
missing translation.

## Check 3 — the sample read

30 pairs, deterministically chosen, drawn only from bodies that actually SHIP, are
written to `scratch/xmage/translation-sample.txt`. The disagreement rate is a
number a person produces by reading them; the script only prepares the pairs.

**First pass, 30 pairs read, 16 substantive:**

| | |
|---|---:|
| agreed line for line | 14 |
| semantic disagreement | **1** |
| licence breach | **1** |

- **Doomgape.** `new TargetSacrifice(StaticFilters.FILTER_PERMANENT_CREATURE)`
  translated to "any creature". `TargetSacrifice`'s own constructor calls
  `makeFilter`, which adds "you control" and "can be sacrificed" to whatever you
  hand it. Read straight, Doomgape would let you sacrifice an opponent's creature.
- **The Horus Heresy.** `game.informPlayers(player.getLogName() + " chooses " + …)`
  copied XMage's own log wording into the generated file.

**Second pass, a disjoint set of 25 substantive bodies:**

| | |
|---|---:|
| agreed line for line | 23 |
| semantic disagreement | **2** |

- **Llanowar Druid** untapped every permanent instead of every Forest, and
  **Crimson Honor Guard** counted every permanent instead of every commander, both
  because the filter's predicates are added in a `static { }` block after the
  declaration and only the declaration was being read.

**Four defects in 41 substantive bodies read, 9.8%.** All four are fixed in the
translator, never in the output. Crimson Honor Guard now blocks on
`CommanderPredicate.instance`, which this engine's filters cannot express — a
refusal, which is the right answer.

The rate AFTER the fixes on the same samples is zero, and that is not evidence of
anything: those are the samples the fixes were derived from. The 9.8% is the
number that means something, and it is the reason a sample read is worth doing at
all — none of the four would have been found by any of the other four checks.

## Check 4 — what the shipped bodies actually contain

Section 2. 378 of 758 are `return true/false` and nothing else.

## Check 5 — no XMage wording in the generated file

```
distinct string literals        : 3,012
literals that look like wording : 0
```

Measured by reading every string literal back out of `bodies.generated.ts`. The
rule that produces the zero is in section 6.

---

# 5. What blocks the rest

From `scripts/coverage/.data/xmage-translation.json`. These are FIRST blockers: a
body stops at the first thing it cannot map, so this is what to implement next,
not a total of everything missing.

| kind | bodies | what it means |
|---|---:|---|
| `method` | 2,713 | no function in `src/lib/game/xmage/` |
| `new` | 1,271 | a constructor with no counterpart |
| `unresolved-receiver` | 439 | the analyser could not type the receiver |
| `constant` | 418 | an enum constant or static field with no counterpart |
| `arity` | 359 | the function exists; this overload has no mapping |
| `typecheck` | 231 | translated, then rejected by `tsc --strict` |
| `method-reference` | 77 | `Game::getPermanent` and friends |
| `instanceof` | 68 | |
| `native-missing` | 62 | a `java.util` method with no row |
| `field` | 62 | a field whose value could not be followed |
| `string-concat` | 60 | an object in a `+`, where Java calls `toString` |
| everything else | 90 | control flow, lambdas, parse, object identity |

**The top twenty-five, biggest first:**

| bodies | cards | kind | what |
|---:|---:|---|---|
| 163 | 163 | method | `Library#getTopCards` |
| 158 | 157 | method | `Library#getFromTop` |
| 99 | 98 | method | `CardUtil#getSourceCostsTag` |
| 80 | 80 | method | `GameState#getWatcher` (a REFUSAL, deliberately) |
| 76 | 76 | method | `Library#hasCards` |
| 75 | 75 | new | `CreateTokenCopyTargetEffect` |
| 75 | 65 | typecheck | TS2345, argument type |
| 73 | 71 | method | `Exile#getExileZone` |
| 68 | 68 | method | `Player#millCards` |
| 65 | 65 | arity | `Player#choose/5` (choose from a given `Cards`) |
| 62 | 62 | method | `Library#getCards` |
| 60 | 60 | string-concat | an object in a `+` |
| 56 | 56 | arity | `Permanent#damage/6` |
| 55 | 55 | unresolved | `.add()` |
| 55 | 54 | method | `Player#rollDice` |
| 54 | 54 | unresolved | `.orElse()` |
| 54 | 53 | method | `Ability#getCosts` |
| 53 | 53 | new | `CreateTokenEffect` |
| 53 | 40 | typecheck | TS2339, property does not exist |
| 52 | 52 | method | `Game#getPermanentEntering` |
| 51 | 51 | new | `BoostTargetEffect` |
| 49 | 48 | method | `CardUtil#getPermanentFromCardPutToBattlefield` |
| 49 | 48 | method | `Condition#apply` |
| 40 | 39 | method | `Player#flipCoin` |
| 40 | 40 | method | `Battlefield#contains` |

**What the ranking says to do next.** Four `Library#` rows are 459 bodies between
them and they are one small class: the top of a player's library, how many cards
are in it, and the cards themselves. That is the single largest return available
and it is a day's work, not a project.

After that the shape changes. `CreateTokenEffect`, `BoostTargetEffect` and
`CreateTokenCopyTargetEffect` are 179 bodies and they are the caveat from
`RUNTIME-API.md` arriving in person: `Game#addEffect` counts as implemented
because the CALL is, but its argument is a continuous-effect class that is its own
porting job. Those three are the most-used of them.

Three rows deserve a note because they are not gaps:

- **`GameState#getWatcher`**, 80 bodies. It is implemented AND it refuses,
  because a watcher this engine does not fold answers 0 for every question and 0
  is a wrong answer rather than a missing one. Those 80 bodies are correctly
  absent.
- **`CardUtil#getSourceCostsTag`**, 99 bodies. Both engines have a function with
  that name and they are different functions: XMage's reads the VALUE stored under
  a tag, ours builds the KEY. There is deliberately no mapping.
- **`Player#choose/5`**, 65 bodies, chooses from a given `Cards` rather than a
  zone. Our `Target` takes a zone, so there is no faithful mapping until it takes
  a candidate list.

---

# 6. Four defects this work found in the runtime API

None of these were found by a test. Three were found by reading translated bodies
beside their Java, and one by running a translated body on a real board. All four
are the same failure mode: **a call that looks like it worked and quietly did
nothing or did the wrong thing.**

### `idsFrom` dropped every card object

`player.moveCards(creatures, 'graveyard')` where `creatures` is an array of
permanents — which is what `battlefield.getActivePermanents(...)` returns, and
what XMage passes constantly — fell through the `Array.isArray` branch, was
filtered down to nothing, moved zero cards and returned success.

### `countAll` and `getAllActivePermanents` ignored their controller

XMage draws a line that costs a card its meaning if it is missed.
`getActivePermanents(filter, sourcePlayerId, …)` treats that id as a RANGE anchor.
`getAllActivePermanents(filter, controllerId, …)` and `countAll(…)` treat it as
OWNERSHIP. Ours passed it only as predicate context, so
`StaticFilters.creature()`, which carries no controller predicate for the context
to bind to, counted everybody's creatures. Elspeth Tirel gained life for the
opponent's board. Caught by `bodies.generated.test.ts` on a real board.

### `TargetPointer#getFirst` returned nothing for a player target

XMage has one id space: a `UUID` is a permanent or a player and the body decides
which by what it asks for. `game.getPlayer(getTargetPointer().getFirst(game,
source))` is how every card that targets a player reads its target. Returning card
ids only made all of them find nothing and do nothing quietly — Hidetsugu's Second
Rite resolved and dealt no damage. `InstanceId` and `PlayerId` are both `string`,
so one id space is what this engine already had; the split was in `targets.ts`.

### XMage wording reached the generated file

`game.informPlayers(player.getLogName() + " chooses " + …)` copied XMage's own log
wording, and Blazing Salvo got a whole sentence in through a local variable:
`String message = "Have Blazing Salvo do 5 damage to you?"`, passed one line later.

Checking the argument positions that reach a player is not enough when a body can
bind the text to a local first. So the test is on the LITERAL, and it is
deliberately blunt: **a space, or more than 24 characters, means wording.** Every
string this engine uses as data is one token — a zone, a counter name, a subtype,
a value-bag key — so the rule costs little and check 5 verifies it by reading the
generated file back rather than trusting it.

Wording is replaced by an empty string rather than blocking the body: blocking
cost 34 bodies for nothing and masked the work order, because 389 bodies then
reported "display string" as their first blocker when the thing actually standing
in their way was a missing method further down. **40 bodies are kept but degraded
this way, 57 occurrences**, and the generator prints that count on every run. What
is lost is the sentence in the log, not the rules effect.

## One plumbing addition to the runtime

`XGame#xmageScope()`. XMage's `Target`, `Cards` and `Choice` constructors reach
the game through a static context this engine deliberately does not have, and
every one of those objects needs the scope to read the board or raise a question.
The name is one XMage never uses, so it joins no row in
`runtime-coverage.mjs`. **The published 65.64% was unchanged by it, re-run and
confirmed** (it reads 66.44% now, for a different reason: see section 10). It is plumbing for the translator, not an implementation of an XMage
function, and counting it as one would overstate the port.

---

# 7. Reproducing this

```bash
# translate, typecheck, emit
node scripts/xmage/translate-bodies.mjs

# what would be emitted, and what blocks the rest, without writing anything
node scripts/xmage/translate-bodies.mjs --census

# one card, for working on a mapping
node scripts/xmage/translate-bodies.mjs --card WrathOfGod --no-typecheck

# the five checks, and the readable sample
node scripts/xmage/translate-check.mjs --sample 30
```

**Generated code is generated.** `bodies.generated.ts` says so in its own header.
A hand edit there is lost on the next run; a wrong body is fixed in
`scripts/xmage/lib/translate.mjs`.

The body finder lives in `scripts/xmage/lib/find-bodies.mjs` and is imported by
both the generator and the checker. It was copied into both at first, and a fix to
the generator left the checker reporting 936 bodies when 758 had been written. A
verification that can drift from the thing it verifies is not a verification.

---

# 8. What this does not do

- ~~**Nothing is wired in.**~~ **Superseded on 23 Aug 2026. See section 9.**
  When this document was written `bodies.generated.ts` was imported by its own
  test and by nothing else. It is now imported by `to-actions.ts`, and 176 cards
  reach a translated body through the shipped table. Section 9 records what that
  bought, measured, and what it did not.
- **Only `apply(Game, Ability)`.** 5,903 of the 7,931 files have one. The other
  2,028 declare watchers, conditions, triggered abilities and replacement effects,
  whose method shapes are different and none of which this translator reads.
- **Half of what emits does nothing**, and the record says which half.
- **Every prompt is empty.** A translated `chooseUse` raises a `PendingChoice`
  with no words in it. That is the licence rule doing its job, and the caller is
  meant to supply wording from Scryfall, but until something does, a player asked
  a question by a translated body is asked a blank one.
- **`Player#loseLife` returns what it was asked for, not what was lost.** XMage
  returns the life actually lost, which is what Blood Tyrant counts. Ours returns
  the amount when it is positive. Noticed during the sample read, not fixed:
  it belongs to the runtime API's next tranche rather than to the translator.

## The harness

```
node --experimental-strip-types scripts/playtest/run.ts --seed 9000 --games 20 \
  --kind commander --players 4 --verify --quiet --out scratch/playtest/runs/translate-final
```

**20 games, 19 finished, 1 stalled, 0 invariant violations.** Seed 9018 hits the
80-turn cap.

CLAUDE.md says this harness reports 20 of 20, so the discrepancy is stated rather
than glossed. It is not caused by this work: `RUNTIME-API.md` section 5 already
recorded the same seed stalling at turn 81 in three earlier runs recorded in
`scratch/playtest/runs/`, before either folder existed, and nothing in
`src/lib/game/xmage/` is imported by anything the harness runs.

Typecheck clean. `npm test`: **2,289 pass, 0 fail.**

---

# 9. Wiring the bodies in, and what that actually bought

Added 23 Aug 2026. Everything above this line was written while nothing imported
`bodies.generated.ts`. This section records what happened when something did.

## The seam, which is the one the records already used

There is no second way in. A card-local effect class already had a name in the
lowering: `PrimId` spells it `local:AbattoirGhoulEffect`, and `lower.ts` failed
the card on it. `TRANSLATED_BODIES` is keyed `AbattoirGhoul::AbattoirGhoulEffect`.
Those are the same thing with the card on the front, so the whole join is one
lowering that turns a `local:` primitive into a pointer.

    dsl.ts            + { do: 'xmage-body'; key; card; effect }
    lower.ts          + xmageBodyLowerings(keys) -> Record<PrimId, Lowering>
    emit-lowered.mjs    merges it into LOWERINGS and writes lowered.generated.ts
    to-actions.ts     + case 'xmage-body' -> runXmageEffect

Cards flow through `xmageSwapFor` exactly as before. The precedence rule did not
move, the whole-card bar did not move, and the all-or-nothing bar did not move.

**The key set is a parameter, not an import.** The bodies live in
`src/lib/game/` because they call a facade that reads a `GameState`; `lower.ts`
lives in `src/lib/cards/` and is imported BY the game layer. `emit-lowered.mjs`
is the only place the two meet, it runs offline, and what ships is the result.
No new module edge in the app.

**The class name is rechecked.** A `local:` id carries the effect class and not
the card, two cards can name an effect class the same, and lowering one card to
another card's body would be a card that runs and is someone else's. The
lowering rebuilds the key from `provenance.xmageClass` and refuses on a miss.

## What it bought, counted

`node --experimental-strip-types scripts/xmage/emit-lowered.mjs`

| | before | after |
|---|---:|---:|
| records emitted into `lowered.generated.ts` | 6,145 | **6,321** |
| an ability did not lower | 25,239 | 25,063 |
| cards carrying a body pointer | 0 | **176** (178 pointers) |

380 substantive bodies were offered. The 378 `trivial` ones are refused twice:
once by the generator and once by `to-actions.ts` at the point of use.

**176 cards, not 380.** A body only helps if it is the LAST thing blocking its
card, and most of these cards are blocked on something else as well. Abattoir
Ghoul has a body and still does not lower, because its trigger class has no entry
in the trigger table.

## The bar: `scripts/verify-ability-coverage.mjs`, whole corpus

| run | AUTOMATED | of 32,469 |
|---|---:|---:|
| `DM_XMAGE_OFF=1`, no XMage records at all | 3,172 | **9.77%** |
| records wired, bodies not (the state this work started from) | 3,465 | **10.67%** |
| bodies wired | 3,503 | 10.79% |
| bodies wired, and an unbound pointer read made loud | 3,488 | **10.74%** |

The last row is LOWER than the one above it on purpose. See the defect below.

Under the script's own stricter variant, where a probe-silent card is also
downgraded, the same states read 10.03%, 10.03% and **10.10%**.

**So: the bodies are worth about a third of a point.** 176 cards out of 32,469
is 0.54%, and only some of them clear the probe. Three hundred and eighty
translated Java bodies moved the only number that counts by 0.07 points.

## What happened to the 176

`node --experimental-strip-types scratch/xmage/body-cards.mjs` compiles each one
and probes it.

| | cards |
|---|---:|
| swapped, and the probe board ran it clean | 22 |
| swapped, and it said out loud what it did not do | 136 |
| swapped, and still silent | 3 |
| not swapped: the oracle-text compiler already understands the card | 14 |
| not swapped: text on a face the engine does not play (Alive // Well) | 1 |

99 of the 136 defer because the probe board binds no targets, which is the
probe's limit and not the card's. **64 defer on one thing**, below.

## The largest defect, and the three cards that named it

XMage's triggered abilities rebind the target pointer while the trigger is being
DETECTED: "whenever a player casts a nonblack spell" pins it to the caster,
"whenever this deals combat damage to a player" pins it to the damaged player,
"at the beginning of each opponent's upkeep" pins it to the upkeep player. That
rebinding lives in the trigger class, which is a different Java file from the
effect, so it is not in the body this translator reads. This engine builds the
pointer from ANNOUNCED targets, and a trigger announces none.

- **Soot Imp**. "Whenever a player casts a nonblack spell, that player loses 1 life." Nobody loses any.
- **Rackling**. "deals X damage to that player, where X is 3 minus the number of cards in their hand." No damage.
- **Dimir Cutpurse**. "that player discards a card and you draw a card." **It draws the card and never makes anyone discard.**

Dimir Cutpurse is the dangerous one and it is why the coverage number went down.
Actions came out, so nothing outside could tell that half the card was skipped.
`XmageRun.applied` cannot catch it either: the body did apply, and it did act.

**Fixed by making the read report, not by guessing the binding.**
`pointerOverTargets` now defers when it is read with nothing bound. That adds no
behaviour and can only turn a silent card into one that says what it did not do.
Binding the pointer to the trigger's player instead would be a guess about which
object each trigger class pinned, and a wrong guess is a card that runs and is
wrong.

It cost 15 cards off AUTOMATED and moved 18 more from `silent` to `deferred` on
the probe. Both are the honest direction.

## A second defect, in the test harness rather than the engine

`harness.testlib.ts`'s `board()` filled `manaCost` and not `cmc`. Every reader
spells it `card.cmc ?? 0`, so every board built for a test said every card cost
nothing, and a mana-value effect could be asserted, read 0, and pass while the
same card behaved differently in a game, because `setup.ts` fills `cmc` on the
real path. Feed the Swarm found it: "you lose life equal to that permanent's mana
value" charged nothing. Fixed; the catalogue row already had the field.

## Twenty cards read by hand

`scratch/xmage/hand-check.mjs` picks twenty of the 161 swapped cards with a fixed
seed, binds a legal target off each ability's own `TargetSpec`, runs the effects
and folds the actions through the real reducer. Twelve did exactly what the
printed card says, four correctly refused a decision the engine may not take, one
was a genuine no-op because the card's own condition was false, and three
disagreed. All three disagreements are the target pointer above.

## The harness

```
node --experimental-strip-types scripts/playtest/run.ts --seed 9000 --games 20 \
  --kind commander --players 4 --verify --quiet --out scratch/playtest/runs/bodies-loud
node --experimental-strip-types scripts/playtest/analyze.ts --run bodies-loud/commander-4p-seed9000-x20
```

**20 games, 19 finished, 1 stalled, 0 invariant violations, 0 replays diverged.**
Seed 9018 hits the 80-turn cap, the same pre-existing stall `RUNTIME-API.md`
section 5 records in three earlier runs.

The analysis report is identical to the `refute-live` baseline on the same seeds
except for one row: notes went from 791 to 797. Every silent-card verdict is
unchanged, to the resolution.

**One translated body was reached by a real game in 27,036 actions: Drake
Familiar, three times, and each time it announced a decision it could not take.**
That is the honest scale of 176 cards in a 32,469 card pool.

## Gates

Typecheck 0 errors. `npm test` **2,303 pass, 0 fail**. Seven of the new tests are
in `src/lib/game/abilities/xmage-body.test.ts`, and one of those walks the
shipped table and checks that every pointer names a substantive body this build
carries, because the two files are written by two different scripts and a
disagreement between them looks exactly like a card that quietly does nothing.

`npm run build` succeeds. `runtime-coverage.mjs` re-run: **65.64% unchanged**.
nothing here added a facade method.

---

# 10. The Library rows, and what 459 bodies turned into

Added 23 Aug 2026. Section 5 ranked four `Library#` rows as 459 bodies and
called them the single largest return on the work order. The class is written.
**`docs/engine/RUNTIME-API.md` section 6a is the full account**, including the
three runtime defects it turned up; this is the part that belongs to the
translator.

## The class name in section 5 was right and the one in RUNTIME-API.md was not

Section 5 already spells these rows `Library#…` because
`lib/java-types.mjs` prefers a top-level class over a nested one, and check 1
has reported the two rows moving ever since. `mage.game.ZoneChangeInfo.Library`
declares one boolean, three constructors and `copy()`. The class is
`mage.players.Library`. `runtime-coverage.mjs` now corrects those rows from the
engine index rather than from a typed list, and prints how many it moved.

## Three mappings, and two of them were bugs

| | |
|---|---|
| `Library#*` | 12 new rows, every signature read out of `mage/players/Library.java`. `removeFromTop`, `remove` and `clear` are deliberately unmapped: they take a card out of a library without saying where it goes. |
| `Player#searchLibrary` | passed `target.getFilter()` and threw the target away. XMage's FILLS the target and the next line reads it back, so five shipped bodies asked the player to search and then did nothing. It passes the TARGET now. |
| `Player#revealCards` | `take: [1]` meant the replacement title was never emitted, so every call was one argument short and `tsc --strict` threw the body away. 60 bodies; 2 remain, on an overload that cannot be told apart by arity. |
| `new CardsImpl(…)` | only `()` and `(Card)` were mapped, and `.add()` takes one card. `new CardsImpl(library.getTopCards(game, 4))` handed an array to a one-card method. The collection forms go to `addAll` now, which reads its argument through `idsFrom`. |

## Two measurement flags on the generator

The work order is an aggregate: it says 163 bodies stop on
`Library#getTopCards`, not WHICH 163, so after a mapping is written there is no
way to answer the only question that matters. `--ledger <path>` writes one
record per body: the card, the class, and either `emitted` or the first
blocker.
`--drop <prefix>` deletes `METHODS` rows before the scan, so one script produces
both the BEFORE and the AFTER ledger and they join body by body. `--drop`
refuses to run without `--census` and refuses to write the shipped file or the
published report.

## The number

| | |
|---|---:|
| bodies first-blocked on the four named rows | **459** |
| of those, emit after phase one | 71 |
| of those, **SHIP** after `tsc --strict` | **54** |
| every body first-blocked on any `Library#` row | 505 |
| of those, ship | 61 |

**54 of 459, and that is the honest one.** The other 388 stopped on a second
thing, led by `Player#lookAtCards` at 62.

Corpus totals: bodies **758 to 852**, card files **721 to 812**, substantive
**380 to 474** with the trivial count unchanged at 378. Records carrying a body
pointer, **176 cards to 217**.

`scripts/verify-ability-coverage.mjs` AUTOMATED: **3,488 (10.74%) to 3,501
(10.78%)**. Thirteen cards.

Typecheck clean in `src/lib/**` and `scripts/**`. `node --test
src/lib/**/*.test.ts`: **1,697 pass, 0 fail**, with 29 new tests in
`src/lib/game/xmage/library.test.ts`. Harness: 20 games, 19 finished, 1 stalled
on the pre-existing seed 9018 which finishes on turn 82 at `--max-turns 200`, 0
invariant violations, 0 replays diverged.

---

# 11. The arity block, and the ceiling the whole body line of work is aiming at

Added 23 Aug 2026. `docs/engine/RUNTIME-API.md` section 6b is the runtime half
of this, including the three defects. This is the translator half and the
measurement.

## The wiring was already done, so this had to move somewhere else

The task was to make a translated body run when a card resolves. Section 9 did
that and it still holds: `compileWithTrace` reaches `xmageSwapFor`, a swapped
record can carry a `{do:'xmage-body'}` pointer, and `to-actions.ts` runs it.
Counted over the pool this time rather than assumed:

| | cards |
|---|---:|
| swapped to an XMage record | **1,367** |
| of those, carrying a translated body | 191 |
| of those, AUTOMATED | 36 |
| of those, PROMPTED or PROMPTABLE | 32 |
| of those, downgraded by the probe or graded dead | 123 |

`scratch/xmage/swapped-pool-verdicts.mjs`, joined against the name list
`DM_NAME_LIST=1` writes. The other measurements quoted below are
`scratch/xmage/body-reach.mjs` and `body-shape.mjs` for the 246 cards that
cannot reach a body, `body-block-why.mjs` for why, `pigeon.mjs` for the 44,
`local-ceiling.mjs` for the ceiling and `probe-target-cost.mjs` for the 884.
Every one of them was run; none of the figures here is estimated.

So the seam is not the constraint. The constraint is how many cards have a body
at all, and the biggest cheap block on the work order was six OVERLOADS of
methods the runtime already had: `Player#choose/5` (97 bodies),
`Permanent#damage/6` (63), `Player#moveCards/8` (39), `Card#addCounters/3` (35),
`Player#choose/3` (29) and `Player#discard/4` (27), plus `Player#millCards`
(70), which is one method whose XMage implementation is two calls this port
already had.

## Three guards, so an overload is matched and never guessed

Longer XMage overloads are usually the shorter one with trailing flags, and the
shorter one is the longer one with those flags at their defaults. Mapping the
long form to the short function is exactly right for the default flags and
exactly wrong for anything else, so `translate.mjs` now reads the LITERAL:

- `flags({4:'false', 5:'true'})` matches `damage(..., combat, preventable)` only
  in the combination `PermanentImpl`'s own four-argument form passes. 151 of the
  157 six-argument calls in the card files are that pair. The other six block.
- `all(flags({4:'false',5:'false',6:'false'}), isNull(7))` does the same for
  `moveCards/8`. 24 of the 133 calls qualify; the rest ask for a permanent to
  arrive tapped, face down, or under its owner's control, and each of those
  dropped would be a visible difference on the board.
- `argIs(1, 'Cards', 'CardsImpl')` picks between two five-argument `choose`
  overloads by the type of the second argument, and `argIs(1, 'boolean')`
  against `argIs(1, 'int')` does it for the two five-argument `discard` forms.
  That second pair was a live defect: see RUNTIME-API section 6b.

A call that matches none of them blocks with its arity named, which is the
report saying a meaning is missing rather than the file carrying a wrong one.

## One new flag on the generator

`--tsc-log <path>` writes every phase-two error with its MESSAGE and the card it
landed in. The report has always recorded the error CODE, and a code cannot be
acted on: `TS2339` on 63 bodies says a method is missing without saying which.
It named two in one run, and `discard` returning an id array where XMage returns
a `Cards` was worth 23 bodies on its own. It changes nothing about what is
emitted.

## The number

| | before | after |
|---|---:|---:|
| bodies that SHIP, after `tsc --strict` | 852 | **950** |
| card files that emit something | 812 | 910 |
| substantive bodies | 474 | 572 |
| bodies first-blocked on an arity | 420 | **194** |
| records in `lowered.generated.ts` | 6,362 | 6,409 |
| cards carrying a body pointer | 217 | **264** |

**`scripts/verify-ability-coverage.mjs` AUTOMATED, whole corpus, same script:
3,501 (10.78%) to 3,507 (10.80%). Six cards.** Under the stricter variant,
3,290 (10.13%) to 3,295 (10.15%).

Ninety-eight more shipped bodies and forty-seven more cards reaching one bought
six cards on the bar. Pre-probe the figure went from 4,427 to 4,459, so
thirty-two more cards became candidates and twenty-six of them were downgraded:
21 for an unbound target, 11 for a target pointer nothing bound, 3 for a discard
the engine correctly refuses to decide. Every one of those downgrades is the
honest direction.

That is the exchange rate, and it is the number worth carrying forward: **the
Library tranche was 54 bodies for 13 cards, this one is 98 bodies for 6.** No
single tranche of this kind moves 10.80% by a visible amount.

## The ceiling this whole line of work is aiming at

`scratch/xmage/local-ceiling.mjs`, over all 32,168 extracted records: if every
card-local body translated and nothing else changed, how many more cards would
lower?

| | records |
|---|---:|
| lowers today | 6,362 |
| **blocked ONLY on card-local classes** | **3,605** |
| blocked on a card-local class AND on something shared | 3,234 |
| blocked on shared classes only | 18,183 |
| no usable oracle id, or no abilities | 784 |

**3,605 cards is the ceiling of the translated-body line of work.** It is worth
having because it is the denominator that says whether to keep going: the bodies
deliver 264 cards today against a ceiling of 3,605, and 18,183 cards are not
waiting on a body at all. It is a ceiling and not coverage, which on this
project has to be said out loud every time.

## Why tier 3 stops where it does, and what it costs

The precedence rule in `src/lib/cards/xmage/lowered.ts` now names three tiers,
and the third one, a machine-translated body, is deliberately a last resort
INSIDE a card that lowers completely rather than a way to ship part of one that
does not.

Measured: **246 cards have a substantive translated body they cannot reach.**
151 of them because the ability carrying the body is itself blocked, and 95
because a sibling ability is. Running the reachable half of those 95 would be
half a card, which is the failure this project has already made four times, and
the 151 would gain nothing at all. The blockers behind them are a long tail with
no lever in it: the biggest is `ConditionalOneShotEffect` at 13 cards.

A stricter version was measured too, in case the correspondence could ever be
forced rather than guessed: cards where the compiler failed on exactly ONE
paragraph and exactly one lowered ability carries exactly one body, so there is
one thing on each side and no matching to do. **44 cards.** Not worth
overturning the whole-card rule for.

## The largest single thing between 10.80% and a higher number, and it is the ruler

`scratch/xmage/probe-target-cost.mjs`, and this is a measurement ABOUT THE
MEASUREMENT, not a coverage figure:

**884 cards are in neither the AUTOMATED nor the PROMPTED bucket, and the only
thing the behaviour probe deferred on for any of them was the sentence "targets
are not bound on the probe board".** That is 2.72 points of the pool, more than
a hundred times what this tranche moved.

It is not an engine gap. `behaviour-probe.ts` binds no targets on purpose,
because faking one would test the fake, and it reports `deferred` rather than
`silent` so the card is not falsely rejected. But `verify-ability-coverage.mjs`
grades the target question separately and already decides it: a targeted SPELL
is AUTOMATED because a shipped surface announces spell targets, and a targeted
trigger or activated ability is a DECISION. Then the probe downgrades the spell
anyway, for a target the verdict rule has already said a player can announce.

The fix is to bind a legal target off each ability's own `TargetSpec`, which
`scratch/xmage/hand-check.mjs` already knows how to do, and NOT to delete the
downgrade. It is left alone here for one reason: it would move the headline by
around 2.7 points without changing a single thing a player experiences, and this
project has twice published a number that moved for that kind of reason. When
somebody does it, both numbers have to be printed side by side and the old one
has to stay reproducible.

## Gates

Typecheck **0 errors** over `tsconfig.app.json`. `npm test` **2,401 pass, 0
fail**, including 13 new tests in `src/lib/game/xmage/overloads.test.ts` and 3
in `src/lib/game/abilities/xmage-body.test.ts` for a body that throws.
`npm run build` succeeds. Checks 1 to 5 unchanged; no XMage wording reaches the
generated file.

Harness, seed 9000, 20 games, `--max-turns 200`: **20 finished, 0 stalled, 0
invariant violations.** Seed 9018 finishes on turn 82. The analysis report
matches the `bodies-loud` baseline on every verdict but three resolutions and
one card.

---

# 12. Two blocks, the curve, and the reason to stop

Added 23 Aug 2026. `docs/engine/RUNTIME-API.md` section 6c is the runtime half,
including the six defects and the seventh in a gate. This is the translator half,
the measurement, and the stopping argument.

The task was to work down the blocker list until the return falls off, re-ranking
after each step, re-measuring coverage after each block so the curve is visible,
and to stop when the return per unit of work falls off rather than when the list
runs out.

## Re-ranking changed the answer, and it is a fact about the ranking

Section 5's table and the work order `translate-bodies.mjs` prints both rank by
ROW. That is right for a method and wrong for a family, and the largest things
left on the list are families: one piece of work spread over a hundred rows of
one and two bodies each, sitting below everything visible.

Re-aggregated by what a single piece of work would serve, the token classes were
127 bodies across 101 rows — the largest item available, invisible on the
ranking, and already extracted into `tokens.generated.ts` by a tranche that never
wired it up. `StaticFilters.*` and `new Filter*` were 243 more across 78 rows.

Neither was on the named list. The named block, `CreateTokenEffect` +
`BoostTargetEffect` + `CreateTokenCopyTargetEffect`, was 183 bodies, and the
first two of those three came along with step one because the token table
unblocked their argument.

## The two steps, and what each one cost and bought

Measured after each step, not once at the end.

| | bodies that ship | card files | cards with a body pointer | AUTOMATED | stricter |
|---|---:|---:|---:|---:|---:|
| **start** | 950 | 910 | 264 | 3,507 (10.80%) | 3,295 (10.15%) |
| after **step 1**: tokens, `CreateTokenEffect`, `BoostTargetEffect`, `putOntoBattlefield` | 1,065 | 1,022 | 314 | **3,519 (10.84%)** | 3,307 (10.19%) |
| after **step 2**: the filter family, `putOntoBattlefield/3` and `/6` | 1,125 | 1,082 | 343 | **3,522 (10.85%)** | 3,310 (10.19%) |

**The curve, which is the thing worth carrying forward:**

| tranche | bodies added | cards on the bar | bodies per card |
|---|---:|---:|---:|
| Library (section 10) | 54 | 13 | 4 |
| the arity block (section 11) | 98 | 6 | 16 |
| **step 1, this section** | **115** | **12** | **10** |
| **step 2, this section** | **60** | **3** | **20** |

Step two cost the same kind of work as step one and returned a quarter as much
per body. That is the return falling off, and it is where this stops.

## Why it falls off, which is not where anybody would look

The obvious reading is that the bodies are getting harder. They are not. Joined
card by card, `scratch/xmage/body-verdicts.mjs`, over all 343 cards that carry a
translated body today:

| | cards |
|---|---:|
| lowers fully, and the body RAN on the probe board | **64** |
| lowers fully, probe DEFERRED | **261** |
| lowers fully, probe silent | 15 |
| does not lower fully | 3 |

**Three out of four cards that carry a working translated body are deferred**,
and the deferrals are almost entirely two lines:

| hits | what it says |
|---:|---|
| 177 | targets are not bound on the probe board, so this ability was not executed |
| 110 | the object this card is about was never bound, so the part of the card that reads it did nothing |
| 8 | the source had nothing left to attach to |
| 5 | the tokens were created but the delayed trigger that removes them cannot be stored |

Neither of the top two is a missing translation, and only the second is even an
engine gap.

- **The first is the RULER**, and section 11 already named it: `behaviour-probe.ts`
  binds no targets on purpose, and `verify-ability-coverage.mjs` grades the target
  question separately and has already decided it before the probe downgrades the
  card anyway. Section 11 measured that at 884 cards and 2.72 points across the
  whole pool. It is untouched here, for the reason section 11 gives.
- **The second is the trigger target pointer**, `targets.ts`'s `UNBOUND`: XMage
  rebinds the pointer inside the TRIGGER class, which is a different Java file
  from the effect and therefore not part of the body this project translates.

So the shape of the ceiling has moved. The bodies that ship now are increasingly
ones whose whole job is to act on a target, and a target is exactly what neither
the probe nor the trigger bridge provides. **More translated bodies is no longer
the binding constraint.**

## Where this stopped, and what the next step would have bought

Stopped after step two, on the curve above.

The work order after step two, largest first, with what each row actually is:

| bodies | cards | row | available? |
|---:|---:|---|---|
| 106 | 105 | `CardUtil#getSourceCostsTag` | **no** — same name, different function; section 5 |
| 81 | 81 | `GameState#getWatcher` | **no** — a deliberate refusal |
| 78 | 78 | `CreateTokenCopyTargetEffect` | yes |
| 77 | 74 | an object in a `+` expression | a translator job, not an engine one |
| 74 | 72 | `Exile#getExileZone` | yes |
| 70 | 70 | `Player#lookAtCards` | a decision about hidden information |

**The next step would have been `CreateTokenCopyTargetEffect`, 78 bodies across
78 cards, and here is what it needs**, counted over those 78 files:

| files | what they use |
|---:|---|
| 60 | `setTargetPointer` |
| 36 | `getAddedPermanents` |
| 17 | `addDelayedTriggeredAbility` |
| 15 | `setSavedPermanent` |
| 13 | `withAdditionalSubType` |
| 6 + 3 + 2 + 1 | `setIsntLegendary`, `setOnlySubType`, `setBecomesArtifact`, a `CopyApplier` |

That is copy-of-a-copy handling, a token built from a live permanent, a delayed
trigger this engine has no store for, and six modifier methods — several times
the work of either step above. And **60 of the 78 read a target pointer**, which
is the exact shape the measurement above says gets deferred three times in four.

At step two's rate of 20 bodies per card it would be worth about **three or four
cards**, for more work than both steps here combined. That is the estimate the
stopping decision rests on, and it is an estimate: the honest thing about it is
that it comes from this tranche's own measured exchange rate rather than from a
guess about the class.

**What is worth doing instead, and it is not on this list at all:** bind a legal
target off each ability's own `TargetSpec` in the probe. Section 11 measured that
at 884 cards and 2.72 points, a hundred times either step here, and this
tranche's 177 target deferrals across body-carrying cards say the same thing
again from a different direction. Section 11's conditions still hold: bind a
legal target rather than deleting the downgrade, and publish both numbers side by
side.

## What went into the translator

- The token table and the filter table are read from
  `scripts/coverage/.data/*.json` and consulted **after** the hand-written
  `NEW`, `STATIC_FILTERS` and `METHODS` tables, never before. Eighteen filter
  constants overlap the hand table and all eighteen agree, which is what makes
  the derived half trustworthy; hand rows still win so that a row somebody wrote
  on purpose is never silently replaced by a parse.
- A `NEW` builder can now BLOCK. Builders are module level and `fail` belongs to
  the per-body closure, so a builder returns a block and `newRef` raises it. That
  is what lets `CreateTokenEffect` refuse a `DynamicValue` amount and
  `BoostTargetEffect` refuse a `DynamicValue` boost rather than passing an object
  where a number belongs.
- `Duration` maps to four of this engine's `EffectExpiry` kinds. `Custom`,
  `OneUse`, `EndOfStep` and `EndOfCombat` block by name rather than becoming end
  of turn: an effect that ends at the wrong moment is a wrong board that nothing
  later notices.
- A token or filter class constructed WITH ARGUMENTS blocks. The tables hold the
  no-argument form, and reading `new FilterCreatureCard(SubType.ELF)` as the
  no-argument form would match every creature card instead of every Elf.
- `Token#putOntoBattlefield` gained the 3-argument form, which XMage defines as
  the 4-argument one with the ability's own controller. It was the first blocker
  on 55 bodies, and it is a row that only APPEARED once the token classes stopped
  blocking those bodies one step earlier. The 6-argument form is matched on the
  literal `false` for `attacking`, so a token meant to arrive attacking blocks
  rather than quietly arriving in the second main phase.

## Reproducing

```bash
node scripts/xmage/extract-tokens.mjs     # the token table
node scripts/xmage/extract-filters.mjs    # the filter table, new here
node scripts/xmage/translate-bodies.mjs
node --experimental-strip-types scripts/xmage/emit-lowered.mjs
node --experimental-strip-types scripts/verify-ability-coverage.mjs
node --experimental-strip-types scratch/xmage/body-verdicts.mjs   # the 343
```

Both generators are byte-reproducible now. `lowered.generated.ts` was not: see
`RUNTIME-API.md` section 6c.

## Gates

`tsc --noEmit -p tsconfig.app.json` **0 errors**. `npm test` **2,444 pass, 0
fail**. `npm run build` succeeds. Checks 1 to 5 clean, with check 5 now reading
both quote characters and still at 0. Harness seed 9000, 20 games,
`--max-turns 200`: **20 finished, 0 stalled, 0 invariant violations**. Sample
read: **12 of 12 agree line for line**.

Corpus: bodies **950 to 1,125**, card files **910 to 1,082**, substantive **572
to 747** (trivial unchanged at 378, so every new body is substantive), records in
`lowered.generated.ts` **6,409 to 6,488**, cards carrying a body pointer **264 to
343**.

**`scripts/verify-ability-coverage.mjs` AUTOMATED, whole corpus, same script:
3,507 (10.80%) to 3,522 (10.85%). Fifteen cards.** Stricter variant 3,295
(10.15%) to 3,310 (10.19%).

---

# 13. The adversarial read, 23 August 2026

An independent pass whose job was to refute sections 10 to 12 rather than to
agree with them. Every number here came from a script run in that session. Where
a claim survived it says so; where it did not, the correction is here and the
code is fixed.

## The ruler was not relaxed, and that is checkable

The first thing to rule out, because this project has twice reported a
denominator as a gain. `scripts/verify-ability-coverage.mjs` and
`src/lib/game/abilities/behaviour-probe.ts` are both byte-identical to what they
were at commit `c59af7b`, which is before the first of the three tranches:

    git log --oneline c59af7b..HEAD -- \
      src/lib/game/abilities/behaviour-probe.ts scripts/verify-ability-coverage.mjs

returns nothing, and neither file is modified in the working tree. The
denominator is the whole pool, 32,469 of 38,626 rows, and the exclusions are
printed at the top of every run. The probe still downgrades: 997 cards that grade
AUTOMATED before it are refused after it. It still does NOT downgrade the 212
that resolve in complete silence, and the script still prints what the figure
would be if it did, 3,309 (10.19%).

So the gain is real. It is also much smaller than four tranches of work implies,
and the reason nobody could see that is the next section.

## The counterfactual nobody had run

Every tranche measured its own delta. None measured the programme. Doing it takes
no source change: ES modules are one instance per process, so load
`lowered.generated.ts`, delete every record carrying a `{do:'xmage-body'}`
pointer, and only then load the grader, which reads the same object.

    node --experimental-strip-types scratch/refute/bodies-off.mjs

With all 342 body-carrying records removed, AUTOMATED reads **3,465 (10.67%)**.
That is exactly the figure `CLAUDE.md` still carries, and it is what the corpus
scored before any body existed.

So the whole translated-body line of work, 1,122 bodies across four tranches, is
worth **56 cards, 3,465 to 3,521, 0.17 points**. The three tranches under review
account for 34 of them. Turning the XMage swap off entirely with `DM_XMAGE_OFF=1`
reads 3,172 (9.77%), so the port as a whole is worth 349 cards and the primitive
lowerings are 293 of those. A translated body is worth about a fortieth of a
card.

That is the sentence the next planning session needs, and no tranche delta could
have produced it.

## The count of cards carrying a body was a record count

Section 12 says 343 cards carry a body. 343 is the number of RECORDS with a
pointer, 342 after this pass. Eleven are digital-only MTGO printings the pool
excludes. Twenty-two more survive the pool and are still dropped at compile time:
nineteen because the oracle-text compiler already grades them `full`, so
`xmageSwapFor` refuses on its first line, and three because they are split cards
with text on a face this engine does not play. The number of POOL cards whose
compiled abilities hold a pointer is **309**, and 55 of them run on the probe
board.

The 22 refusals are the precedence rule working, not a defect. The count was
still the wrong one to publish.

## Reachability, proved from the bundle rather than from grep

Both legs, and neither passes through a test or a script.

Which cards get a pointer: `src/App.tsx:76` lazy-loads `src/pages/Play.tsx`,
which mounts `src/components/play/AbilityPanel.tsx` and `PlayTable.tsx`; those
import `activationsFor` and `planActivation` as values from `@/lib/game`;
`src/lib/game/activate.ts:68` and `src/lib/game/stack.ts:92` import
`abilitiesFor` from `abilities/card-abilities.ts`, whose line 87 calls
`compileCardAbilities`; `src/lib/cards/abilities/compiler.ts:645` calls
`xmageSwapFor`, which reads `XMAGE_LOWERED`.

What happens on resolution: `stack.ts:465` and `:577` call
`resolveAbilityActions`, `activate.ts:1151` calls `resolveAbilityRun`, and both
land on `to-actions.ts` `case 'xmage-body'`, which reads `TRANSLATED_BODIES` and
calls `runXmageEffect`.

The empirical half: after `npm run build`, all **1,122 body keys are in
`dist/assets/rules-*.js`**, the chunk the play route loads, and the string
`owner:"chooser"` added by this pass is in it too. The bodies ship to the
browser.

## Two defects, both found by reading the Java beside the TypeScript

Thirty non-trivial bodies were drawn deterministically from the 1,122 that ship
and read pair by pair. **Two disagreed, 6.7%.** Both were a general rule with a
blast radius much larger than the sample, so both were then measured across the
whole bundle.

### A boolean flag matched on its type instead of its value

`Player#discard` has two five-argument overloads, and the row that told them
apart read the TYPE of argument 1 and then threw the argument away:

    { arity: 5, when: argIs(1, 'boolean'), ...M('discard', [0]) }

Argument 1 is `random`. `discard(1, true, false, source, game)` is XMage for
"discard a card at random" and it became `discard(1)`, which asks the player
which card to pitch. Section 11 states that "every long-form overload is matched
on the LITERAL flag values its short form passes". That was true of
`Permanent#damage/6` and `Player#damage/6` and it was not true of the one method
whose fix that section describes. Three shipped bodies were affected:
Skullknocker Ogre, Drastic Revelation and Oath of Scholars.

Fixed with `flags({ 1: 'false', 2: 'false' })`, so a random discard and a discard
paid as a cost now block with their arity named, which is this translator's own
doctrine. The three bodies leave the bundle and **coverage falls by one card**.

### The owner restriction lives in the target class, and it was being dropped

The larger one. XMage does not put "your graveyard" in the filter. It puts it in
the target class: `TargetCardInYourGraveyard.possibleTargets(sourceControllerId)`
reads `game.getPlayer(sourceControllerId).getGraveyard()`, and the filter it was
constructed with is a plain `FilterCreatureCard` whose only mention of "your" is
its display name. `TargetCardInHand` and `TargetCardInLibrary` are the same
shape.

The translator read the filter, took the zone from the class name and dropped the
rest, so `TargetCardInYourGraveyard`, `TargetCardInGraveyard` and
`TargetCardInOpponentsGraveyard` all arrived as `zone:'graveyard'` and
`makeTarget` offered every player's pile. **26 shipped bodies were in that
state.** Measured on the pre-fix bundle, on a real board:

    Gix's Command, answer = an opponent's Serra Angel
      before:  MOVE_ZONE theirAngel -> hand
      after:   nothing moves; the chooser's own card still comes back

`XTargetOptions` now carries `owner: 'chooser' | 'not-chooser'`, honoured in both
`possibleTargets` and the candidate-pile path, because XMage enforces it in
`canTarget` as well. With no chooser passed it offers NOTHING and files a
deferral, rather than falling back to everything, which would be the same bug
wearing a guard clause. 42 shipped bodies now name whose pile they mean.
`src/lib/game/xmage/owner-scope.test.ts` holds seven tests, one of which walks
the whole bundle and fails if a hand or library target ever loses its owner
again.

### What did not disagree

The other 28 agree line for line, including every case where the difference looks
like one. `Library#getFromTop` peeks in XMage and peeks here. `Library#getCards`
is top to bottom in both. `Permanent#damage/6` is guarded on `false, true` and
those are the defaults. Gallifrey Stands reads the inner class's own `FilterCard`
with the Doctor predicate, and so do we. Liliana, the Necromancer uses
`TargetCardInGraveyard`, which really does mean any graveyard, and correctly has
no owner scope after the fix.

Two things are approximations rather than disagreements, and both say so out
loud: a two-option `chooseUse` becomes a Yes/No with an empty prompt, because the
labels are XMage's wording, and `putCardsOnBottomOfLibrary(cards, anyOrder)`
keeps the caller's order and files a deferral saying nobody was asked to pick it.
Eleven shipped bodies pass `anyOrder = true`.

## Ten cards checked against Scryfall by hand

Twelve, in the end, each cast on a real two-player board and folded through the
real reducer. Fumigate destroyed three creatures and gained three life. Windfall
had both players pitch their hands and draw two, which is the larger of the two
piles. Stronghold Discipline took two from the player with two creatures and one
from the player with one. Biorhythm set the totals to 2 and 1. Fracturing Gust
destroyed one artifact and one enchantment and gained four. Treasure Hunt took
two lands and the nonland under them. Wave of Reckoning and Solar Blaze each
killed all three creatures, which is what both oracle texts say and what both
Java files do. Death Begets Life destroyed four permanents and drew four.
Heartless Hidetsugu halved both life totals. Pestilence Demon hit four creatures
and two players. Mana Severance deferred and said why.

**Eleven correct, one honest deferral, no disagreement.**

## The finding that should choose the next tranche

Section 12 stopped on the grounds that "more translated bodies is no longer the
binding constraint" and named the ruler as the reason: 177 of the 343 body cards
defer because the probe binds no target. It priced the fix at 884 cards and 2.72
points and left the premise untested.

The premise holds. Take body cards the probe downgraded for an unbound target,
put each on a real board, bind a legal target, and run:

    node --experimental-strip-types scratch/refute/bind-targets.mjs 120

    sampled                                 120
    run clean once a target is bound         91   (75.8%)
    still defer                              29

**Three out of four.** Of the 309 pool cards that reach a body, 164 defer on this
one line; at that rate about 124 of them would run. That is more than twice what
1,122 translated bodies have bought in total, and it comes from a change to the
probe rather than to the engine.

The caveat is real and has to be published beside the number: the harness binds
whatever legal target makes the body run, not the target a rules-correct
announcement would pick, so 75.8% is a ceiling on what target-binding is worth
and not a promise. Containment Breach "ran" against a creature. A body does not
check its own target's legality, because in XMage the `Target` does that at
announcement and here the announcer does, so the real work is binding off each
record's `TargetSpec`, and the two numbers must be published side by side exactly
as section 11 said.

`CreateTokenCopyTargetEffect`, the row section 12 nominated, is still 78 bodies
and still the largest single row. At this programme's measured rate of one card
per forty bodies it is worth about two cards. The unbound target is worth about a
hundred.

## Gates

`tsc --noEmit -p tsconfig.app.json` 0 errors. `npm test` **2,451 pass, 0 fail**,
seven of them new. `npm run build` succeeds. Checks 1 to 5 clean, check 5 still 0
of 4,554 literals. Both generators byte-reproducible across two runs.

Harness, seed 9000, 20 games, `--verify --max-turns 200`, before and after the
fixes: **20 finished, 0 stalled, 0 replays diverged, 0 cards resolved silently**,
27,018 actions both times. Seed 9018 finishes on turn 82. The harness has no
counter called "invariant violations"; what `--verify` does is replay every game
and compare every state hash, and no replay diverged.

Corpus: bodies **1,125 to 1,122**, substantive **747 to 744**, records **6,488 to
6,487**, cards carrying a pointer **343 to 342**, pool cards that reach one 309.

**`scripts/verify-ability-coverage.mjs` AUTOMATED, whole corpus: 3,522 (10.85%)
to 3,521 (10.84%).** One card, and it is the price of the random-discard guard.
Stricter variant 3,310 (10.19%) to 3,309 (10.19%).

## The licence notice was wrong and is corrected

`THIRD-PARTY-NOTICES.md` opened with "No XMage source file has been copied,
machine-translated, or vendored." Two of those three are still true. Roughly
1,100 of XMage's card-local `apply(Game, Ability)` bodies are machine-translated
into `src/lib/game/xmage/bodies.generated.ts` and the shipped app runs them. MIT
permits that with the copyright notice retained, and it is retained: in that
file's header, and in every file under `src/lib/game/xmage/` and
`src/lib/cards/xmage/` except `record.test.ts`, which holds no ported logic. A
notice that understates what was taken is the one error an attribution file
cannot afford, so it is corrected and dated.

Checked at the same time: no `.java` or `.jar` file is tracked or present in the
repository, the clone is read in place, no Forge clone exists anywhere on the
machine, and nothing in `scripts/` or `src/` fetches or reads one. An independent
wording check took every string literal of eight characters or more holding a
space out of the five generated and hand-written XMage files, 586 of them, and
asked whether it appears verbatim among the 70,282 distinct Java string literals
in the clone. 84 do, and all 84 are Magic vocabulary Scryfall also prints: filter
names like "creature you control", token names like "Storm Crow", and type lines
like "Artifact Creature, Phyrexian Golem". No sentence of rules text. Check 5
reads 0 and that survives an independent method.
