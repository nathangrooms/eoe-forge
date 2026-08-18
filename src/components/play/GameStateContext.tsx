/**
 * DeckMatrix — the current `GameState`, available to any card that draws itself.
 *
 * ## Why this exists
 *
 * A card's power and toughness are not properties of the card. They are
 * properties of the *battlefield*: an anthem three permanents away changes them.
 * So `GameCardView` cannot render a correct stat line from its `card` prop
 * alone, and for a long time it did not — it called `combat.ts`'s `powerOf`,
 * which is handed a `CardInstance` and cannot see an anthem, and the board
 * showed 3/3 where the rules said 4/4.
 *
 * Threading `state` through nine call sites would work and would be forgotten
 * at the tenth. This context makes it impossible to forget: the card view always
 * asks, and `characteristics.ts` always answers with the layered value.
 *
 * ## Why this does not cost a render
 *
 * The context value is the `GameState` object itself — nothing derived, nothing
 * built in a provider body. `applyAction` is a pure reducer that returns a new
 * object only when something changed, so the value's identity changes exactly
 * when the board changes, and no more often. Consumers re-render on a real state
 * change, which they had to do anyway.
 *
 * The layer computation is memoised on that same object identity in
 * `abilities/statics.ts`, so a hundred cards asking during one render share one
 * `computeLayers` run and every later render is a `WeakMap` hit. This is the
 * shape the constraint requires: computed once per state, never per card and
 * never per render.
 *
 * ## Outside a provider
 *
 * `useGameState()` returns `null` rather than throwing. That is deliberate and
 * it is not a silent failure: a card rendered outside a game — a deck-list row,
 * a search result — genuinely has no battlefield, and its printed values are the
 * correct thing to show. The accessors in `characteristics.ts` fall back to
 * printed values for exactly this case, and say so.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { GameState } from '@/lib/game';

const GameStateContext = createContext<GameState | null>(null);

/**
 * Publish the live state to the card views below.
 *
 * Pass the state you already have. Do not wrap it, memoise it or spread it into
 * a new object — a fresh object every render would defeat the memo downstream
 * and make every card recompute the whole board.
 */
export function GameStateProvider({
  state,
  children,
}: {
  state: GameState;
  children: ReactNode;
}) {
  return <GameStateContext.Provider value={state}>{children}</GameStateContext.Provider>;
}

/** The live state, or `null` when this card is not being drawn inside a game. */
export function useGameState(): GameState | null {
  return useContext(GameStateContext);
}
