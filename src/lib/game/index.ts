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
 *   - `combat.ts`    what a declared attack actually does, expressed as actions
 *   - `moves.ts`     composite moves (cast, land drop, advance) shared by UI and bot
 *   - `setup.ts`     decklists in, shuffled and dealt `GameState` out
 *   - `bot.ts`       a plausible opponent that decides only in `GameAction`s
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
export * from './combat.ts';
export * from './moves.ts';
export * from './setup.ts';
export * from './bot.ts';

export * from './transport.ts';
