# Rules engine — an honest coverage report

**Date:** 2026-08-18 · **Scope:** `src/lib/game/`, `src/lib/cards/abilities/`

**Companions:** `RULES-ENGINE-DIRECTION.md` (the decision and the licence line) ·
`RULES-ENGINE-DECISION.md` (why we port rather than host) · `../../THIRD-PARTY-NOTICES.md`
(attribution, and the Forge-contamination check)

This document exists to be believed. Its job is to say what the engine does, what it does not,
and — the part that actually matters — **what happens to a card whose text is not implemented**.

The complaint that started this work was a card that appeared to resolve and did nothing. The
design rule that answers it is stated in the direction record:

> A card whose text the engine does not implement must be **marked manual on the card**. Silence
> is the bug. Precision over recall: a wrong ability corrupts a game, a missing one just needs a
> human.

So the question this report answers is not "how much of Magic is implemented" — the answer to
that will always be "a small fraction, and that is fine". The question is **"can a player always
tell?"**

---

## The headline finding, stated first

**The engine is honest. The interface is not yet.**

The rules core detects unimplemented text correctly, marks it on the card, and refuses to
half-resolve things. Verified end to end in `src/lib/game/integration.test.ts`. But:

| Card kind | Player is told? | How |
|---|---|---|
| Instant / sorcery that resolves to the graveyard | **Yes** | A `NOTE` action goes into `GameState.log` and shows in the game feed |
| Permanent whose trigger fires *now* and is not automated | **Yes** | Same — a `NOTE` naming the clause |
| Permanent whose trigger fired but only half-resolved | **Yes** | A `NOTE` naming the residual text |
| **Permanent with unimplemented text that is not a firing trigger** | **No** | The marker exists on the card and nothing renders it |

That last row is the original bug, still live for permanents. `automationFor(card).needsManual`
is `true`, `manualNotes` is populated, `summary` is ready for a badge — and **no component in
`src/` calls any of it.** Verified by search: `automationFor`, `manualControlsFor`,
`manualNoteAction`, `needsManual`, `markManualResolved` and `manualControlsFor` have **zero**
importers among all `.tsx` files.

Measured against a 40-card sample of real cards spanning the difficulty range (see
[Measurements](#measurements)): 16 of 40 were played onto the battlefield, carried text the
engine does not resolve, correctly reported `needsManual: true`, and produced **no visible signal
at all** — the log line read only "One played Blood Artist."

This is a deliberate design decision made for a good reason and then left half-finished. From
`effects.ts`:

> Measured over the catalogue, 93% of cards carry *some* text this engine does not implement, so
> a log line for every permanent that arrives would bury the feed and train the player to ignore
> it. The broader "this card has text we do not run" case is carried by the card's own marker
> (`automationFor().needsManual`), where it costs nothing to look at and nothing to ignore.

The reasoning is right. Spamming the feed for 93% of permanents would destroy the value of the
notes that matter. The card-level marker is the correct home for it. **The marker just has to be
drawn.** Until it is, the engine's honesty is invisible, and from the player's seat the original
complaint is unfixed for every permanent.

### What closing it takes

Three small pieces of UI, all reading an API that already exists and is already tested:

1. **`GameCardView.tsx`** — render a dot when `automationFor(card).needsManual`. Weight it by
   `automation.level`: `partial` is the loud one (a card that half-resolved is the one a player
   will assume was handled), `manual` is a quiet dot, `vanilla` and `keywords` get nothing. The
   `level` field exists precisely to be weighted this way.
2. **`CardInspector.tsx`** — show `automation.manualNotes` as a list, and render
   `manualControlsFor(state, card)` as the two-tap controls the owner asked for ("marking cards
   which fly, have lifesteal, trample, also if they have +1 counters"). The controls come back
   already bound to `GameAction[]`; the component dispatches them.
3. **The keyword badges** must show `control.support === 'advisory'` differently from `'engine'`.
   A badge that looks enforced and is not is the same silent lie in a different costume.

No engine work is required for any of it.

---

## What the engine models

Status key: **Full** — implemented to the Comprehensive Rules cited. **Partial** — the common
path works, edge cases listed. **Manual** — the player does it, and the engine says so.

### Turn structure and game flow — `rules.ts`

| Thing | Status | Notes |
|---|---|---|
| Turn → phase → step (CR 500s) | Full | All 12 steps, in order, with `PHASE_OF_STEP` mapping |
| Untap step (CR 502) | Full | `UNTAP_ALL`, summoning sickness cleared for permanents controlled since the turn began |
| Draw step, first-turn skip (CR 103.7a) | Full | Two-player only, per the rule |
| Cleanup: damage wears off (CR 514.2) | Full | |
| Turn passing, multiplayer seat order | Full | Skips dead seats |
| Land drop limit | Full | One per turn, own turn, from hand |
| Commander tax (CR 903.8) | Full | +2 generic per previous cast from the command zone |
| Priority (CR 117.3–117.4) | Full | `stack.ts` — pass moves it in turn order, a full round resolves one object |

### State-based actions — `sba.ts`

CR 704, detection separated from application, looped until stable (CR 704.3) and bounded so a
genuinely unbreakable loop reports `stable: false` rather than hanging a client.

| Rule | Status |
|---|---|
| 704.5a life ≤ 0 | Full |
| 704.5b drew from an empty library | Full |
| 704.5c ten or more poison | Full |
| 704.5d token that left the battlefield ceases to exist | Full |
| 704.5f toughness ≤ 0 | Full |
| 704.5g lethal damage marked | Full |
| Commander damage, 21 from one commander (CR 903.10a) | Full |
| Legend rule, Aura/Equipment attachment legality, planeswalker uniqueness | See `sba.ts` for the current list |

### The stack — `stack.ts`

| Thing | Status | Notes |
|---|---|---|
| Announcement (CR 601), targets locked in | Full | |
| Resolution order, priority round-trip | Full | |
| Fizzling (CR 608.2b) — targets rechecked on resolution | Full | All targets illegal → does not resolve; some illegal → does as much as it can |
| Zone change makes a new object (CR 400.7) | Full | `StackTarget` records the zone it was chosen in |
| Split second (CR 702.61a) | Full | |
| "Can't be countered" | Full | Correctly does **not** save a spell from fizzling |

### Continuous effects — `layers.ts`

CR 613, all seven layers with layer 7's five sublayers, timestamp order (CR 613.7) and dependency
override (CR 613.8). Effects are **data**, never closures — a callback cannot be replayed on a
client that only received an action log. Timestamps are caller-supplied integers; ties break on
effect id so two effects sharing a timestamp still order identically everywhere.

### Replacement effects — `replacement.ts`

CR 614. The once-per-event rule (CR 614.5) is enforced by carrying `replacedBy` on the action
rather than in a transient in-memory `Set`, so it survives replay. CR 616.1 choice travels in the
action as `replacementOrder`; absent a player choice the fallback is a total order on effect id,
so a client that never prompts never diverges from one that does.

### Combat — `combat.ts`

| Keyword | Status |
|---|---|
| flying / reach — block legality | Full |
| menace — two or more blockers | Full |
| defender — cannot attack | Full |
| vigilance — attacking does not tap | Full |
| haste — attacks the turn it lands | Full |
| first strike / double strike | Full — a real second damage step, deaths resolved between |
| deathtouch | Full — including one point counting as lethal when assigning through blockers |
| trample | Full — including the all-blockers-died-to-first-strike case (CR 702.19b) |
| lifelink | Full |
| indestructible | Full |
| protection | Full — quality parsed out of oracle text, gates blocking and damage |

### Keyword abilities — `keywords.ts`

A closed, finite set, which is why it is the one part of the card pool implemented properly.
**15 keywords the engine enforces** (`ENGINE_KEYWORDS`) and **41 it does not** (`ADVISORY_KEYWORDS`)
— flash, ward, prowess, cascade, infect, storm, persist, undying, myriad and the rest. The split
is a public API: `keywordSupport(keyword)` returns `'engine'` or `'advisory'`, and any keyword
not in either list is reported `'advisory'`, never silently "supported".

### Card abilities from oracle text — `src/lib/cards/abilities/`

This is what replaces XMage's 25,000 hand-written card classes: a compiler from normalised
oracle text to the declarative ability DSL, with `book.ts`-style hand-authored entries beating
the compiler where it cannot parse.

The important property is not how much it parses — it is **clause accounting**, in
`coverage.ts`:

> `assertClausesAccounted` checks that the spans of every compiled ability plus the spans of
> every `UnparsedClause` cover the whole normalised oracle text. A clause the compiler quietly
> dropped fails this check, so a dropped clause is a failing TEST rather than a card that
> mysteriously does nothing at a table three weeks later.

That is the anti-silent-no-op contract turned into a proof rather than a promise, and it is the
same discipline `tagger.ts` uses to keep its TypeScript and SQL byte-identical. Every character
of a card's rules text must land in one of two places: an ability the engine will run, or a
recorded gap with a `GapReason`. There is no third bucket, so there is nowhere for a clause to
disappear to.

Abilities are **data** — no functions, no closures, no regex objects, no classes. A
`CardAbilities` value survives `structuredClone`, `JSON.stringify` and a Supabase `jsonb`
column unchanged, which is what lets the compiled result be cached server-side and shipped to a
client that then runs the whole engine locally.

### Networked play — `net/`, `transport.ts`

Order is a value, not an arrival time: every entry carries an `OrderKey`, clients sort by it, so
two senders cannot fork the game. Batches rather than individual actions on the wire. State is
public and knowledge is a per-client overlay — libraries and hands are arrays of anonymous
instance ids, so the shared state is identical everywhere and only the private mapping differs.

---

## What the engine does **not** model

Stated plainly, because a list of what works is worthless without it.

- **Card-specific abilities at large.** There is no per-card scripting and there will not be.
  Abilities come from compiling oracle text (`effects.ts`, `abilities/`), and that compiler
  recognises a deliberately small set of clauses.
- **Targeting decisions.** Anything reading `target`, `choose`, `may`, `up to`, `each player`,
  `unless`, `instead`, `for each`, `equal to`, `where X`, or a bare `if` is refused
  automatically — see `NEEDS_A_HUMAN` in `effects.ts`. That list is *deliberately over-eager*.
  Refusing a trigger costs the player two taps; auto-resolving one wrongly corrupts the game and
  teaches them not to trust the ones that are right.
- **Mana abilities beyond tapping for mana.** `mana.ts` plans a payment across untapped sources;
  it does not model filter lands, cost reduction, cost increase, alternative costs, or additional
  costs.
- **Activated abilities on permanents.** Tap-for-effect is a manual tap plus a manual outcome.
- **Sacrifice, exile, tutoring, graveyard recursion, discard** as automated effects. All are on
  the refusal list; all are reachable through the manual zone controls.
- **Modal spells, X spells, kicker, escape, flashback, adventure** and every other alternative
  casting mode.
- **Attacking planeswalkers or battles.** Attacks are declared against players.
- **Blocker damage ordering.** The attacking player does not order multiple blockers; they are
  damaged in declaration order.
- **Banding**, "assign damage as though it weren't blocked", and damage prevention or
  redirection outside the replacement system.
- **The London mulligan's bottoming step.** `mulliganActions` reshuffles and draws one fewer;
  putting N on the bottom is left to the player and the zone browser, which is how it works at a
  physical table.

---

## What happens to a card whose text is not implemented

This is the section the whole document is for.

Every card in a game gets classified by `automationFor(card)`, which returns an
`AutomationLevel`:

| Level | Meaning | Marker shown? |
|---|---|---|
| `vanilla` | No rules text at all. Basics, vanilla creatures. | No — nothing to miss |
| `keywords` | Only keyword abilities, all of which combat enforces | No |
| `automated` | Every ability on the card is applied by the engine | No |
| `partial` | Some abilities fire, some need the player | **Yes — this is the loud one** |
| `manual` | The card has abilities and the engine resolves none | Yes — a quiet dot |
| `unknown` | Oracle text was never loaded, so we cannot even say | Yes |

`partial` matters most. A card that half-resolved is the card a player will assume was handled:
they saw the life total move, so they trust the rest happened. `automationFor` reports the
residual text separately (`DetectedTrigger.residual`) so a half-resolved trigger never passes for
a whole one.

### The four ways the engine tells you

1. **A `NOTE` action in the game log** when a trigger fires that the engine declines:
   `"Complex triggered (enters the battlefield) — the engine does not resolve "destroy target
   creature.". Do it by hand."` This is an ordinary logged action, so it replays, undoes and
   broadcasts like anything else.
2. **A `NOTE` for a half-resolved trigger:** `"Half Automatic (attacks) partly resolved — still
   to do by hand: target opponent discards a card."`
3. **A `NOTE` for a spell that resolved to the graveyard and did nothing.** This is the loudest
   silent no-op and gets a note unconditionally — even a card with no oracle text at all gets
   `"Unknown Card resolves — the engine applies no spell effects; resolve it by hand."`
4. **A marker on the card itself** — `needsManual`, `manualNotes`, `summary`. Correct in the
   engine; **not rendered by any UI**. See [the headline finding](#the-headline-finding-stated-first).

### And then the player resolves it in two taps

`manualControlsFor(state, card)` returns the whole menu, already bound to actions:

| Group | Controls |
|---|---|
| `tap` | Tap / untap |
| `counters` | 11 presets (+1/+1, −1/−1, loyalty, charge, stun, shield, oil, lore, quest, time, generic), ordered by card type — a planeswalker leads with loyalty, a creature with +1/+1. Any other counter goes through `cardCounter` with a typed key, so the list is a shortcut and never a limit |
| `stats` | Power/toughness ±1, exact set, and reset-to-printed |
| `keywords` | All 56 flaggable keywords, **each declaring `support: 'engine' \| 'advisory'`** |
| `zones` | Move to any zone except the stack (the stack is owned by `stack.ts`; a bare `MOVE_ZONE` onto it would strand the card) |
| `marker` | "I resolved this by hand" — and its inverse, because that is a claim a player can retract |

Every control returns `GameAction[]` and nothing else, so a hand-applied +1/+1 counter travels
the identical path as a triggered one: validated, logged, undoable, broadcastable. A manual life
change that skipped the log would make the feed a lie.

Player-level counters (energy, experience, rad, ticket), token creation from 11 presets or a
hand-built spec, and free-text `NOTE` entries for house rules round it out.

---

## Determinism

The product requirement — "hundreds or thousands of players playing live" — is only reachable
because the engine is pure and seeded, so a game **is** its action log: clients apply locally for
instant feedback, the server validates and relays actions and never state, and every client
replaying the same log lands on byte-identical state.

Each of these is a passing test in `src/lib/game/integration.test.ts`:

| Guarantee | How it is tested |
|---|---|
| `applyAction` does not mutate its input | The state is deep-frozen before the call; any in-place write throws |
| Same state + same action → same result | Two calls, snapshots compared |
| An illegal action returns the **identical reference** | So callers detect a rejection with `next === prev` |
| Replaying an action list reaches byte-identical state | Applied twice from the same start, JSON snapshots compared |
| Same seed + same decks deal the identical table | And a *different* seed deals a different one, so the RNG is genuinely consulted |
| State is plain JSON | Round-trips through `JSON.stringify`, survives `structuredClone`, and a walker asserts no `Date`, `Map`, `Set`, function or class instance anywhere |
| No clock, no unseeded randomness | A source-level scan of every module for `Date.now`, `Math.random`, `crypto.randomUUID`, `new Date`, `performance.now` |
| Every module is reachable | Every `.ts` file in the folder must be re-exported from `index.ts` |
| The trigger chain is bounded | `MAX_TRIGGER_DEPTH` — real Magic allows an infinite loop and calls it a draw; a shared reducer that hangs is a denial of service on every client at the table |

### Two honest caveats

**1. `GameState.log` is not the replay source.** `GameEvent` carries prose and a type, not the
`GameAction` that produced it. The log is the human-readable record shown in the feed;
duplicating every action into it would roughly double the size of a state that already goes over
a wire. The replayable artefact is the ordered list of actions the transport relayed, which a
client must retain separately to reconstruct a game from scratch. This is a reasonable trade, but
"a game is its action log" is easy to over-read — the log in question is the transport's, not
`state.log`'s. `integration.test.ts` asserts the current shape so that if `GameEvent` ever grows
an `action` field, the transport and the test get updated together.

**2. One clock exists, in `transport.ts`.** `LocalTransport.broadcast` stamps
`at: at ?? Date.now()` onto the wire envelope. This is **not** a determinism leak: the stamp is
set once by the sender and travels with the action, so every peer applies the identical value,
and it lands on the envelope rather than on game state. The application layer
(`hooks/usePlayGame.ts`) stamps `Date.now()` at the React boundary and passes it in as
`action.at` — which is exactly the right shape. Nothing inside `src/lib/game/` reads a clock, and
the source scan enforces that with `transport.ts` as the single documented exemption.

---

## Measurements

### Over the real catalogue (recorded in `effects.ts`, 12,000 rows from our `cards` table)

| `AutomationLevel` | Cards |
|---|---|
| `manual` | 11,205 |
| `vanilla` | 367 |
| `partial` | 196 |
| `keywords` | 148 |
| `automated` | 84 |

2,094 triggers detected, 297 of them automated.

**That distribution is the point, not a disappointment.** Most Magic cards do have an ability
this engine will not resolve. It is why the marker matters more than the automation, and why the
UI must weight `partial` differently from `manual` rather than painting all 11,000 the same.

### Spot-check over 40 real cards (2026-08-18)

A sample spanning vanilla creatures, keyword-only creatures, clean ETB triggers, half-automatable
cards, and genuinely hard ones (Doubling Season, Rhystic Study, Smothering Tithe, Whisperwood
Elemental, Aetherflux Reservoir):

| `AutomationLevel` | Cards |
|---|---|
| `manual` | 26 |
| `vanilla` | 7 |
| `partial` | 3 |
| `keywords` | 2 |
| `automated` | 2 |

- 13 triggers detected, 5 automated.
- **Silently dropped: 0.** Every card whose text is not fully handled reported
  `needsManual: true`. The classification layer is sound.
- **Played but produced no visible signal: 16 of 40.** All of them permanents whose unimplemented
  text is not a trigger firing at that moment — Blood Artist, Impact Tremors, Rhystic Study,
  Smothering Tithe, Doubling Season, Sanguine Bond, Skullclamp and the rest. Each reported
  `needsManual: true` to any caller that asked; the game log for each read only
  `"One played Blood Artist."` This is the headline finding: the engine knows, and nothing tells
  the player.

The 26/40 in `manual` mirrors the catalogue-wide ratio and is the honest shape of this problem.
It is also why the fix is a badge and an inspector panel rather than more log lines.

---

## Attribution

The architecture of `src/lib/game/` is derived from **XMage** (MIT). Nothing in this repository
derives from **Card-Forge/forge** (GPL-3.0) — that line is held deliberately and the verification
performed is recorded in **`THIRD-PARTY-NOTICES.md`** at the repository root.

---

## How to run the checks

```sh
# Typecheck — note tsconfig.app.json; the root tsconfig.json compiles nothing
npx tsc -p tsconfig.app.json --noEmit

# Tests — no runner is installed; node's own is used, as tagger.test.ts does
node --test --experimental-strip-types $(find src -name "*.test.ts" | tr '\n' ' ')

# Build
npm run build
```

**As of 2026-08-18: 457 tests passing, typecheck clean, build clean.** Every module in the core
carries its own test file — `combat`, `effects`, `layers`, `replacement`, `sba`, `stack`,
`triggers`, `net`, plus `integration.test.ts` for the cross-cutting guarantees above and
`tagger` / `tag-signal` for the card classification the ability compiler reuses.
