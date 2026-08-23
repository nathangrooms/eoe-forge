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
`runtime-coverage.mjs` — **the published 65.64% is unchanged, re-run and
confirmed.** It is plumbing for the translator, not an implementation of an XMage
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
| not swapped: the oracle-text compiler already understands the card | 15 |

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
