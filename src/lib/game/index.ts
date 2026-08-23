/**
 * DeckMatrix — shared game-state core.
 *
 *   import { createGame, applyAction, seatingFor } from '@/lib/game';
 *
 * One state shape and one reducer behind every game surface:
 *
 *   - `types.ts`     the serialisable state and the action union
 *   - `rules.ts`     `applyAction(state, action) -> state`, pure, real Commander rules
 *   - `seating.ts`   where each seat sits at the table and how far its panel turns
 *
 * Layered on top of the reducer, and just as pure:
 *
 *   - `mana.ts`      can this cost be paid, and which permanents does it tap
 *   - `keywords.ts`  the closed set of keyword abilities, and which we enforce
 *   - `layers.ts`    CR 613 continuous effects — the layer system, ported from
 *                    XMage (MIT); the pure "what are this object's current
 *                    characteristics" function everything else should ask
 *   - `characteristics.ts` the ONE accessor for current power, toughness,
 *                    types, colours and keywords — `computeLayers` applied and
 *                    memoised per state. The board, the inspector, combat and
 *                    the bot all ask this, so they cannot disagree.
 *   - `combat.ts`    what a declared attack actually does, expressed as actions
 *   - `stack.ts`     the stack, priority, targeting, fizzling and countering
 *   - `replacement.ts` CR 614 replacement effects, applied one at a time
 *   - `intrinsic.ts` the replacement effects a card carries in its own oracle
 *                    text — "this land enters tapped" — derived rather than
 *                    registered, so no code path can forget to wire one up
 *   - `effects.ts`   the triggers we detect, and an honest marker for the rest
 *   - `manual.ts`    the two-tap controls for everything the engine will not do
 *   - `activate.ts`  CR 602 — what a permanent's abilities cost, whether they
 *                    can be used right now, and the batch that uses one
 *   - `attach.ts`    CR 301.5 / 303.4 — which permanent an Equipment or Aura
 *                    may go on, and what the one it is on is currently getting
 *   - `commander.ts` CR 903 — the command zone: what a commander costs from it
 *                    and why, the CR 903.9a choice a player makes when their
 *                    commander dies, and the per-commander damage tallies
 *   - `moves.ts`     composite moves (cast, land drop, advance) shared by UI and bot
 *   - `cast-targets.ts` CR 601.2c — aiming an instant or a sorcery as it is
 *                    cast, reusing `activate.ts`'s target legality
 *   - `announce.ts`  CR 603.3d — aiming a TRIGGERED ability as it goes on the
 *                    stack, through the same `chooseTargetsFor`, plus the one
 *                    copy of CR 608.2b's "is that still a legal target" that
 *                    both halves re-check with
 *   - `setup.ts`     decklists in, shuffled and dealt `GameState` out
 *   - `bot.ts`       a plausible opponent that decides only in `GameAction`s
 *
 * On card effects, because it is the first thing anyone asks: this is NOT a
 * rules engine and will not become one. Keyword abilities are implemented
 * properly because they are a closed set; a short list of mechanically
 * unambiguous triggers fires automatically; everything else is detected,
 * marked on the card as "manual", and made resolvable in two taps. The one
 * invariant is that the engine never silently does nothing.
 *
 * And exactly one file that admits other machines exist:
 *
 *   - `transport.ts` join / leave / broadcast / receive, plus an in-memory hub.
 *     A Supabase Realtime implementation drops in behind the same interface.
 *
 * Nothing in this folder touches React, Supabase or storage. A life counter
 * drives it from local component state; a networked game ships the same
 * `GameAction` values over a channel and replays them. Both land on identical
 * state, because the reducer is deterministic — no clock, no unseeded
 * randomness.
 *
 * Minimal four-player Commander pod:
 *
 *   const state = createGame({
 *     format: 'commander',
 *     players: [{ name: 'Nathan' }, { name: 'Sam' }, { name: 'Ali' }, { name: 'Jo' }],
 *   });
 *   const next = applyAction(state, { type: 'DAMAGE', targetPlayerId: 'p2', amount: 7 });
 *   const layout = seatingFor(4);
 */

export * from './types.ts';
export * from './rules.ts';
export * from './seating.ts';

export * from './mana.ts';
export * from './keywords.ts';
export * from './printed.ts';
export * from './layers.ts';
// The single accessor for "what are this object's characteristics right now".
// Everything that draws a board or does combat maths asks this, not `powerOf`.
export * from './characteristics.ts';
export * from './combat.ts';
export * from './stack.ts';
export * from './replacement.ts';
export * from './intrinsic.ts';
export * from './sba.ts';
export * from './triggers.ts';
export * from './effects.ts';
export * from './manual.ts';
export * from './respond.ts';
// CR 602 — activating an ability on a permanent you control: costs, timing,
// targets, and the announcement onto the stack.
export * from './activate.ts';
// CR 301.5 / 303.4 — equipping, enchanting, and reading what an attachment is
// giving its host off the layer engine's own applied-effect trace.
export * from './attach.ts';
// CR 903 — the command zone. Imported before `moves.ts` because the cast path
// builds its `CAST_COMMANDER` announcement from here.
export * from './commander.ts';
export * from './moves.ts';
// CR 601.2c — the asker that lets an instant or a sorcery be cast AT something.
// After `moves.ts` and `activate.ts` because it composes both: it reuses
// `activate.ts`'s target legality and ends in `moves.ts`'s cast plan.
export * from './cast-targets.ts';
// CR 603.3d — the other half of the same seam: aiming a TRIGGERED ability, and
// the one copy of "is that still a legal target" (CR 608.2b) that the spell
// half re-checks with too.
export * from './announce.ts';
export * from './setup.ts';
export * from './bot.ts';

export * from './abilities/index.ts';

export * from './transport.ts';
