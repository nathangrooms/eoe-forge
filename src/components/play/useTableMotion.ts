/**
 * The two pieces of motion that need memory of the previous board.
 *
 * `GameState` is a snapshot: it says a player is on 34 life, not that they just
 * lost 6, and it says a card is on the battlefield, not that it arrived a
 * moment ago. Both of those are what a game *feels* like, so the difference
 * between consecutive states is computed here and handed to the view as
 * short-lived presentation state.
 *
 * Nothing in this file writes to game state or reads a rule. It is a diff and a
 * timer, deliberately kept out of `src/lib/game` — which is pure, clock-free
 * and has no business knowing that a number floated up the screen.
 */

import { useEffect, useRef, useState } from 'react';
import type { CardInstance, GameState, PlayerId, Zone } from '@/lib/game';

/* -------------------------------------------------------------------------- */
/* Life changes                                                               */
/* -------------------------------------------------------------------------- */

export interface LifeDelta {
  id: number;
  delta: number;
}

export type LifeDeltaMap = Record<PlayerId, LifeDelta[]>;

/**
 * Life changes since the last state, per seat, expiring after `ttlMs`.
 *
 * Keyed by an incrementing id rather than the amount so two consecutive hits
 * for 3 are two floating numbers, not one that never leaves.
 */
export function useLifeDeltas(state: GameState | null, ttlMs = 1000): LifeDeltaMap {
  const previous = useRef<Record<PlayerId, number> | null>(null);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);
  const [deltas, setDeltas] = useState<LifeDeltaMap>({});

  useEffect(() => {
    if (!state) {
      previous.current = null;
      setDeltas({});
      return;
    }

    const current: Record<PlayerId, number> = {};
    for (const player of state.players) current[player.id] = player.life;

    const before = previous.current;
    previous.current = current;
    // First state for this table: record the baseline, float nothing.
    if (!before) return;

    const added: Array<{ playerId: PlayerId; entry: LifeDelta }> = [];
    for (const player of state.players) {
      const was = before[player.id];
      if (was === undefined || was === player.life) continue;
      nextId.current += 1;
      added.push({
        playerId: player.id,
        entry: { id: nextId.current, delta: player.life - was },
      });
    }
    if (added.length === 0) return;

    setDeltas(map => {
      const next: LifeDeltaMap = { ...map };
      for (const item of added) {
        next[item.playerId] = [...(next[item.playerId] ?? []), item.entry];
      }
      return next;
    });

    const expiring = new Set(added.map(item => item.entry.id));
    const timer = window.setTimeout(() => {
      setDeltas(map => {
        const next: LifeDeltaMap = {};
        for (const key of Object.keys(map)) {
          const kept = map[key].filter(entry => !expiring.has(entry.id));
          if (kept.length > 0) next[key] = kept;
        }
        return next;
      });
    }, ttlMs);
    timers.current.push(timer);
  }, [state, ttlMs]);

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
    },
    []
  );

  return deltas;
}

/* -------------------------------------------------------------------------- */
/* The card being cast                                                        */
/* -------------------------------------------------------------------------- */

const CAST_FROM: readonly Zone[] = ['hand', 'command'];
const CAST_TO: readonly Zone[] = ['battlefield', 'graveyard', 'exile'];

export interface CastSpotlightEntry {
  card: CardInstance;
  controllerId: PlayerId;
  /** Where it landed — a creature stays, a burn spell went straight to the yard. */
  to: Zone;
  key: number;
}

/**
 * The card that just left somebody's hand, held on screen for a beat.
 *
 * Arena does this because a spell resolving off-screen is a spell you did not
 * see; in a pod with three bots it is the difference between watching a game
 * and watching numbers change. Derived from a zone diff rather than the log,
 * because the log carries prose and this needs the card.
 */
export function useCastSpotlight(state: GameState | null, ttlMs = 1600): CastSpotlightEntry | null {
  const previousZones = useRef<Record<string, Zone> | null>(null);
  const previousGame = useRef<string | null>(null);
  const nextKey = useRef(0);
  const timer = useRef<number | null>(null);
  const [entry, setEntry] = useState<CastSpotlightEntry | null>(null);

  useEffect(() => {
    if (!state) {
      previousZones.current = null;
      previousGame.current = null;
      setEntry(null);
      return;
    }

    const current: Record<string, Zone> = {};
    for (const id of Object.keys(state.cards)) current[id] = state.cards[id].zone;

    const before = previousGame.current === state.id ? previousZones.current : null;
    previousZones.current = current;
    previousGame.current = state.id;
    if (!before) return;

    let found: CardInstance | null = null;
    for (const id of Object.keys(current)) {
      const was = before[id];
      if (was === undefined || was === current[id]) continue;
      if (CAST_FROM.indexOf(was) === -1) continue;
      if (CAST_TO.indexOf(current[id]) === -1) continue;
      const card = state.cards[id];
      if (!card) continue;
      // Later ids win: on a multi-card action the last thing played is what a
      // player is actually looking for.
      found = card;
    }
    if (!found) return;

    nextKey.current += 1;
    setEntry({
      card: found,
      controllerId: found.controllerId,
      to: found.zone,
      key: nextKey.current,
    });

    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntry(null);
    }, ttlMs);
  }, [state, ttlMs]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  return entry;
}
