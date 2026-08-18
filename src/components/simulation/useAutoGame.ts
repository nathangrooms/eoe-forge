/**
 * Playtest — a whole table of bots playing a real game, live, in front of you.
 *
 * Owner: *"Playtest is supposed to play live infront of you verse bots and you
 * should be able to select your opponents decks."*
 *
 * The distinction from `/play` is who presses the buttons, and nothing else.
 * Both surfaces run `src/lib/game`; on `/play` one seat is yours, and here
 * every seat — yours included — is driven by the same `nextBotMove` policy, so
 * a list can be watched fighting real opposition rather than goldfished against
 * nobody.
 *
 * Why this is not `usePlayGame`: that hook exists to model a *table with a
 * human at it*. It always reserves one seat as the one the bots must wait for,
 * which is correct there and deadlocks here — an attacking bot politely stops
 * at declare blockers for a defender that is itself a bot, and nobody ever
 * moves again. A watched game has no seat to wait for, so it gets its own
 * driver: no transport, no undo stack, a speed control and a step button.
 *
 * Two guards, both earned by watching real games break:
 *
 *   - **A tick that does not change `version` is a stall.** The engine can
 *     return an action batch that the reducer rejects; without this the tab
 *     spins forever.
 *   - **A turn cap.** Two durdling commander decks can genuinely fail to close
 *     a game. Stopping at a stated turn number and saying so beats a tab that
 *     runs until it is closed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyActions,
  advanceActions,
  botsAwaitingMove,
  nextBotMove,
  type BotOptions,
  type BuiltTable,
  type GameState,
  type PlayerId,
} from '@/lib/game';

export interface AutoGameEntry {
  id: number;
  actorId: PlayerId;
  turn: number;
  text: string;
}

export interface UseAutoGameOptions {
  table: BuiltTable | null;
  aggression?: BotOptions['aggression'];
  /** Delay between decisions. 0 is allowed and runs as fast as React will paint. */
  speedMs?: number;
  running: boolean;
  /** Stop and say so rather than running forever. */
  maxTurns?: number;
}

export interface UseAutoGameResult {
  state: GameState | null;
  feed: AutoGameEntry[];
  /** Set when the game stopped for a reason that is not "somebody won". */
  halted: string | null;
  /** Take exactly one decision, for watching a specific moment closely. */
  stepOnce: () => void;
  restart: () => void;
  /** True while there is still a game to watch. */
  live: boolean;
}

/** Consecutive decisions that fail to move `version` before we call it stuck. */
const STALL_LIMIT = 3;

/**
 * Notes the feed drops.
 *
 * Twelve steps a turn means eleven of every twelve bot notes are "Untaps",
 * "Upkeep", "End step" — bookkeeping the board already shows, which pushed the
 * three lines that matter (a land, a cast, a swing) off the panel within a
 * second. The feed keeps decisions.
 */
const BOOKKEEPING =
  /^(Untaps|Upkeep|Draws for turn|Begins combat|Moves to combat|Waits for blocks|Combat damage|Combat ends|End step|Passes the turn|Ends the turn|Attackers are declared|Continues)\b/;

export function useAutoGame(options: UseAutoGameOptions): UseAutoGameResult {
  const { table, aggression = 'normal', speedMs = 450, running, maxTurns = 60 } = options;

  const [state, setState] = useState<GameState | null>(table ? table.state : null);
  const [feed, setFeed] = useState<AutoGameEntry[]>([]);
  const [halted, setHalted] = useState<string | null>(null);

  const feedIdRef = useRef(0);
  const stallRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  /* Every seat is a bot here, whatever the table said, and no seat is waited
     for — a defender that never answers is the deadlock this hook exists to
     avoid. */
  const seatIds = useMemo<PlayerId[]>(
    () => (table ? table.state.players.map(player => player.id) : []),
    [table]
  );

  const botOptions = useMemo<BotOptions>(
    () => ({ aggression, waitForPlayerIds: [] }),
    [aggression]
  );

  useEffect(() => {
    setState(table ? table.state : null);
    setFeed([]);
    setHalted(null);
    stallRef.current = 0;
    feedIdRef.current = 0;
  }, [table]);

  /** One decision by whichever seat owes the table one. */
  const tick = useCallback(() => {
    setState(current => {
      if (!current || current.status !== 'playing') return current;

      if (current.turn > maxTurns) {
        setHalted(
          `Stopped at turn ${maxTurns}. Neither deck closed the game — that is a finding, not a crash.`
        );
        return current;
      }

      const waiting = botsAwaitingMove(current, seatIds, botOptions);
      const actor = waiting[0] ?? current.activePlayerId;
      const move = nextBotMove(current, actor, botOptions);

      // Nobody has a decision but the game is not over: push the step itself,
      // which is what a table of players passing priority actually does.
      const actions = move ? move.actions : advanceActions(current, Date.now());
      const next = applyActions(current, actions);

      if (next.version === current.version) {
        stallRef.current += 1;
        if (stallRef.current >= STALL_LIMIT) {
          setHalted(
            `The engine stopped making progress at ${current.step} on turn ${current.turn}.`
          );
        }
        return current;
      }

      stallRef.current = 0;

      if (move?.note && !BOOKKEEPING.test(move.note)) {
        const name = current.players.find(player => player.id === actor)?.name ?? actor;
        feedIdRef.current += 1;
        const entry: AutoGameEntry = {
          id: feedIdRef.current,
          actorId: actor,
          turn: current.turn,
          text: `${name} — ${move.note}`,
        };
        // Bounded: a 60-turn game is thousands of decisions and the panel only
        // ever shows the tail of them.
        setFeed(previous => [...previous.slice(-120), entry]);
      }

      return next;
    });
  }, [botOptions, maxTurns, seatIds]);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!running || !state || state.status !== 'playing' || halted) return;

    timerRef.current = window.setTimeout(tick, Math.max(0, speedMs));
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [running, state, speedMs, halted, tick]);

  const restart = useCallback(() => {
    if (!table) return;
    setState(table.state);
    setFeed([]);
    setHalted(null);
    stallRef.current = 0;
    feedIdRef.current = 0;
  }, [table]);

  const stepOnce = useCallback(() => {
    if (halted) setHalted(null);
    stallRef.current = 0;
    tick();
  }, [halted, tick]);

  return {
    state,
    feed,
    halted,
    stepOnce,
    restart,
    live: !!state && state.status === 'playing' && !halted,
  };
}
