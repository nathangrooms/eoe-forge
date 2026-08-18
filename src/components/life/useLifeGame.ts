/**
 * DeckMatrix — life counter: the session hook.
 *
 * Wraps the pure core in the three things a phone on a table needs and the core
 * deliberately does not have: coalesced input, undo, and persistence.
 *
 * ── Coalescing ────────────────────────────────────────────────────────────────
 * Tapping "-1" seven times is one event at the table, not seven. Every nudge
 * lands in a pending buffer keyed by what it targets; the buffer commits as a
 * single action once the taps stop. That buys three things at once:
 *
 *   - one log line and one undo step per burst, instead of seven;
 *   - no death mid-burst — tapping from 5 down past 0 and back up to 3 never
 *     triggers state-based actions, because nothing was applied yet;
 *   - a visible running delta, which is what stops a mis-tap becoming a mistake.
 *
 * ── Undo ──────────────────────────────────────────────────────────────────────
 * Snapshots, not inverse actions. The reducer is pure and returns a fresh object
 * per action, so keeping the previous reference costs nothing and — unlike an
 * inverse action — still works after the game has ended, which is exactly when
 * an accidental lethal needs undoing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  applyAction,
  seatingFor,
  validateAction,
  type GameAction,
  type GameState,
  type PlayerId,
  type SeatLayout,
} from '@/lib/game';

import {
  UNDO_DEPTH,
  buildGame,
  clearSession,
  compactLog,
  defaultVariantFor,
  loadSession,
  newSession,
  saveSession,
  syncConfig,
  type LifeGameConfig,
  type LifeOptions,
  type LifeSession,
} from './session';

/** How long the taps have to stop before a burst is committed. */
export const COMMIT_DELAY_MS = 1400;

/* -------------------------------------------------------------------------- */
/* Pending input                                                              */
/* -------------------------------------------------------------------------- */

export type PendingTarget =
  | { kind: 'life'; playerId: PlayerId }
  | { kind: 'commander'; playerId: PlayerId; commanderId: string }
  | { kind: 'poison'; playerId: PlayerId }
  | { kind: 'counter'; playerId: PlayerId; counter: string };

export function pendingKey(target: PendingTarget): string {
  switch (target.kind) {
    case 'commander':
      return `commander:${target.playerId}:${target.commanderId}`;
    case 'counter':
      return `counter:${target.playerId}:${target.counter}`;
    default:
      return `${target.kind}:${target.playerId}`;
  }
}

interface PendingEntry {
  target: PendingTarget;
  delta: number;
}

type PendingMap = Record<string, PendingEntry>;

function actionFor(entry: PendingEntry, at: number): GameAction {
  const { target, delta } = entry;
  switch (target.kind) {
    case 'life':
      return { type: 'LIFE_CHANGE', playerId: target.playerId, delta, at, actorId: target.playerId };
    case 'commander':
      return {
        type: 'COMMANDER_DAMAGE',
        targetPlayerId: target.playerId,
        commanderId: target.commanderId,
        amount: delta,
        at,
      };
    case 'poison':
      return { type: 'POISON', playerId: target.playerId, delta, at, actorId: target.playerId };
    case 'counter':
      return {
        type: 'PLAYER_COUNTER',
        playerId: target.playerId,
        counter: target.counter,
        delta,
        at,
        actorId: target.playerId,
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Projected view                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What a panel should show *right now*: committed state plus anything still
 * buffered. Commander damage feeds both tallies, because commander damage is
 * damage — 7 from a commander is 7 off the life total too.
 */
export interface PlayerView {
  life: number;
  lifeDelta: number;
  poison: number;
  poisonDelta: number;
  commanderDamage: Record<string, number>;
  commanderDelta: Record<string, number>;
  counters: Record<string, number>;
  counterDelta: Record<string, number>;
  /** Worst single-commander tally. Never a sum: 21 is per commander. */
  worstCommanderDamage: number;
}

export type PlayerViewMap = Record<PlayerId, PlayerView>;

function projectView(state: GameState, pending: PendingMap): PlayerViewMap {
  const view: PlayerViewMap = {};

  for (const player of state.players) {
    view[player.id] = {
      life: player.life,
      lifeDelta: 0,
      poison: player.poison,
      poisonDelta: 0,
      commanderDamage: { ...player.commanderDamage },
      commanderDelta: {},
      counters: { ...player.counters },
      counterDelta: {},
      worstCommanderDamage: 0,
    };
  }

  for (const entry of Object.values(pending)) {
    const target = view[entry.target.playerId];
    if (!target) continue;

    switch (entry.target.kind) {
      case 'life':
        target.life += entry.delta;
        target.lifeDelta += entry.delta;
        break;
      case 'poison':
        target.poison = Math.max(0, target.poison + entry.delta);
        target.poisonDelta += entry.delta;
        break;
      case 'commander': {
        const id = entry.target.commanderId;
        target.commanderDamage[id] = Math.max(0, (target.commanderDamage[id] ?? 0) + entry.delta);
        target.commanderDelta[id] = (target.commanderDelta[id] ?? 0) + entry.delta;
        target.life -= entry.delta;
        target.lifeDelta -= entry.delta;
        break;
      }
      case 'counter': {
        const key = entry.target.counter;
        target.counters[key] = Math.max(0, (target.counters[key] ?? 0) + entry.delta);
        target.counterDelta[key] = (target.counterDelta[key] ?? 0) + entry.delta;
        break;
      }
    }
  }

  for (const player of state.players) {
    const entry = view[player.id];
    entry.worstCommanderDamage = Object.values(entry.commanderDamage).reduce(
      (worst, value) => Math.max(worst, value),
      0,
    );
  }

  return view;
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

export interface LifeGame {
  session: LifeSession | null;
  state: GameState | null;
  layout: SeatLayout | null;
  view: PlayerViewMap;
  hasPending: boolean;
  canUndo: boolean;
  /** Buffer a change. Commits on its own once the taps stop. */
  nudge: (target: PendingTarget, delta: number) => void;
  pendingFor: (target: PendingTarget) => number;
  /** Commit every buffered change immediately. */
  flush: () => void;
  /** Commit buffered input, then apply a one-shot action. Returns false if rejected. */
  dispatch: (action: GameAction) => boolean;
  undo: () => void;
  /** Same players and seats, life totals back to the start. */
  resetGame: () => void;
  start: (config: LifeGameConfig) => void;
  /** Discard the game entirely and go back to setup. */
  endSession: () => void;
  setOptions: (patch: Partial<LifeOptions>) => void;
  setPartner: (playerId: PlayerId, enabled: boolean) => void;
}

export function useLifeGame(): LifeGame {
  const [session, setSessionState] = useState<LifeSession | null>(() => loadSession());
  const [pending, setPendingState] = useState<PendingMap>({});

  // Mirrors of the two pieces of state. Commits fire from timers and from
  // gesture handlers that run several updates in a row, and React state is not
  // readable synchronously — the reducer is pure, so keeping a ref in step is
  // both safe and the only way to compose "flush, then apply" correctly.
  const sessionRef = useRef<LifeSession | null>(session);
  const pendingRef = useRef<PendingMap>(pending);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const commitSession = useCallback((next: LifeSession | null) => {
    sessionRef.current = next;
    setSessionState(next);
    if (next) saveSession(next, Date.now());
    else clearSession();
  }, []);

  const commitPending = useCallback((next: PendingMap) => {
    pendingRef.current = next;
    setPendingState(next);
  }, []);

  const clearTimer = useCallback((key: string) => {
    const handle = timers.current[key];
    if (handle !== undefined) {
      clearTimeout(handle);
      delete timers.current[key];
    }
  }, []);

  /** Apply one action against the live state, recording an undo snapshot. */
  const applyNow = useCallback(
    (action: GameAction): boolean => {
      const current = sessionRef.current;
      if (!current) return false;

      const check = validateAction(current.state, action);
      if (!check.ok) {
        toast.error(check.reason ?? 'That is not a legal action.');
        return false;
      }

      const next = applyAction(current.state, action);
      if (next === current.state) return false;

      commitSession({
        ...current,
        state: compactLog(next),
        past: [...current.past, current.state].slice(-UNDO_DEPTH),
      });
      return true;
    },
    [commitSession],
  );

  const commitKey = useCallback(
    (key: string) => {
      clearTimer(key);
      const entry = pendingRef.current[key];
      if (!entry) return;

      const rest = { ...pendingRef.current };
      delete rest[key];
      commitPending(rest);

      if (entry.delta === 0) return;
      applyNow(actionFor(entry, Date.now()));
    },
    [applyNow, clearTimer, commitPending],
  );

  const flush = useCallback(() => {
    for (const key of Object.keys(pendingRef.current)) commitKey(key);
  }, [commitKey]);

  const nudge = useCallback(
    (target: PendingTarget, delta: number) => {
      if (!delta) return;
      const current = sessionRef.current;
      if (!current || current.state.status !== 'playing') return;

      const key = pendingKey(target);
      const existing = pendingRef.current[key];
      commitPending({
        ...pendingRef.current,
        [key]: { target, delta: (existing?.delta ?? 0) + delta },
      });

      clearTimer(key);
      timers.current[key] = setTimeout(() => commitKey(key), COMMIT_DELAY_MS);
    },
    [clearTimer, commitKey, commitPending],
  );

  const pendingFor = useCallback(
    (target: PendingTarget) => pending[pendingKey(target)]?.delta ?? 0,
    [pending],
  );

  const dispatch = useCallback(
    (action: GameAction): boolean => {
      flush();
      return applyNow(action);
    },
    [applyNow, flush],
  );

  /**
   * Undo cancels buffered input first. A player who taps five times and then
   * reaches for undo means "take that back" — popping a snapshot instead would
   * rewind a change from a minute ago while the visible one stayed put.
   */
  const undo = useCallback(() => {
    if (Object.keys(pendingRef.current).length > 0) {
      for (const key of Object.keys(timers.current)) clearTimer(key);
      commitPending({});
      return;
    }

    const current = sessionRef.current;
    if (!current || current.past.length === 0) return;

    commitSession({
      ...current,
      state: current.past[current.past.length - 1],
      past: current.past.slice(0, -1),
    });
  }, [clearTimer, commitPending, commitSession]);

  const resetGame = useCallback(() => {
    for (const key of Object.keys(timers.current)) clearTimer(key);
    commitPending({});

    const current = sessionRef.current;
    if (!current) return;

    // Rebuild from config rather than dispatching RESET: the core's reset uses
    // the format's starting life and would quietly discard a custom total.
    const config = syncConfig(current.config, current.state);
    commitSession({
      config,
      state: buildGame(config, Date.now()),
      past: [...current.past, current.state].slice(-UNDO_DEPTH),
      options: current.options,
    });
  }, [clearTimer, commitPending, commitSession]);

  const start = useCallback(
    (config: LifeGameConfig) => {
      for (const key of Object.keys(timers.current)) clearTimer(key);
      commitPending({});
      const existing = sessionRef.current;
      // Seating preference carries over only while the pod is the same size. A
      // variant is chosen for a specific number of seats — carrying "table"
      // from a two-player game into a four-player one silently swaps the quads
      // for the pinwheel, and setup would have just previewed the quads.
      const sameSize = existing?.state.players.length === config.seats.length;
      // Partner flags never carry over — they belong to the pod that just got
      // up from the table.
      commitSession(
        newSession(config, Date.now(), {
          variant:
            (sameSize ? existing?.options.variant : undefined)
            ?? defaultVariantFor(config.seats.length),
          partners: {},
          /* Orientation is a property of the DEVICE, not the pod, so it carries
             over between games on the same phone. */
          /* Setup's choice wins; otherwise keep whatever this device used last. */
          orientation: config.orientation
            ?? existing?.options.orientation
            ?? (config.seats.length === 1 ? 'solo' : 'shared'),
        }),
      );
    },
    [clearTimer, commitPending, commitSession],
  );

  const endSession = useCallback(() => {
    for (const key of Object.keys(timers.current)) clearTimer(key);
    commitPending({});
    commitSession(null);
  }, [clearTimer, commitPending, commitSession]);

  const setOptions = useCallback(
    (patch: Partial<LifeOptions>) => {
      const current = sessionRef.current;
      if (!current) return;
      commitSession({ ...current, options: { ...current.options, ...patch } });
    },
    [commitSession],
  );

  const setPartner = useCallback(
    (playerId: PlayerId, enabled: boolean) => {
      const current = sessionRef.current;
      if (!current) return;
      commitSession({
        ...current,
        options: {
          ...current.options,
          partners: { ...current.options.partners, [playerId]: enabled },
        },
      });
    },
    [commitSession],
  );

  // Backgrounding the tab, locking the phone or navigating away must not eat a
  // burst that has not committed yet.
  useEffect(() => {
    const onHide = () => flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [flush]);

  useEffect(
    () => () => {
      // Unmount: commit through the refs (state setters are pointless here, but
      // `commitSession` writes to storage synchronously, which is the point).
      for (const key of Object.keys(pendingRef.current)) {
        const entry = pendingRef.current[key];
        clearTimeout(timers.current[key]);
        if (entry && entry.delta !== 0) applyNow(actionFor(entry, Date.now()));
      }
      timers.current = {};
      pendingRef.current = {};
    },
    [applyNow],
  );

  const layout = useMemo(
    () => (session ? seatingFor(session.state.players.length, session.options.variant) : null),
    [session],
  );

  const view = useMemo(
    () => (session ? projectView(session.state, pending) : {}),
    [session, pending],
  );

  return {
    session,
    state: session?.state ?? null,
    layout,
    view,
    hasPending: Object.keys(pending).length > 0,
    canUndo: Object.keys(pending).length > 0 || (session?.past.length ?? 0) > 0,
    nudge,
    pendingFor,
    flush,
    dispatch,
    undo,
    resetGame,
    start,
    endSession,
    setOptions,
    setPartner,
  };
}
