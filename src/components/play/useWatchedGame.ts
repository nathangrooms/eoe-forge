/**
 * A whole table of bots playing a real game, live, in front of you.
 *
 * Owner: *"Playtest is supposed to play live infront of you verse bots and you
 * should be able to select your opponents decks."* and, once it existed,
 * *"Play tool is the main, playtest should use the same system too."*
 *
 * The distinction from `/play` is **who presses the buttons, and nothing else**.
 * Both surfaces run `src/lib/game`; on `/play` one seat is yours, and here every
 * seat is driven by the same `nextBotMove` policy, so a list can be watched
 * fighting real opposition rather than goldfished against nobody. Same reducer,
 * same stack, same layers, same state-based actions, same replacement effects,
 * same triggers, same bot.
 *
 * It lives beside the board it drives rather than under `components/simulation`,
 * where it started. That move is the point of this workstream: the two screens
 * drifted apart once because the watched game had its own folder, its own state
 * shape and its own components, and anybody improving "play mode" never saw it.
 *
 * Why this is not `usePlayGame`: that hook exists to model a *table with a human
 * at it*. It always reserves one seat as the one the bots must wait for, which
 * is correct there and deadlocks here — an attacking bot politely stops at
 * declare blockers for a defender that is itself a bot, and nobody ever moves
 * again. A watched game has no seat to wait for, so it gets its own driver: no
 * transport, no undo stack, a speed control and a step button.
 *
 * Three guards, all earned by watching real games break:
 *
 *   - **A tick that does not change `version` is a stall.** The engine can
 *     return an action batch the reducer rejects. After three in a row the game
 *     stops and says where. It counts them across ticks, which needs the timer
 *     re-armed by something other than a state change, so see `pulse`.
 *   - **A turn cap.** Two durdling commander decks can genuinely fail to close a
 *     game. Stopping at a stated turn and saying so beats a tab that runs until
 *     it is closed.
 *   - **The authoritative state lives in a ref.** React 18 StrictMode invokes a
 *     state updater twice, so a driver that decided the next move *inside* an
 *     updater would double every feed line in development. `usePlayGame` learned
 *     this the same way.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { describePlay, type PlayLine } from './playLine';
import type { PlayFeedEntry } from '@/hooks/usePlayGame';
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

export interface UseWatchedGameOptions {
  table: BuiltTable | null;
  aggression?: BotOptions['aggression'];
  /** Delay between decisions. 0 is allowed and runs as fast as React will paint. */
  speedMs?: number;
  running: boolean;
  /** Stop and say so rather than running forever. */
  maxTurns?: number;
}

/** The most recent thing a seat actually did, held until the next one. */
export interface WatchedPlay {
  line: PlayLine;
  /** Bumped per play, so a repeat of the same sentence still re-animates. */
  key: number;
  turn: number;
}

export interface UseWatchedGameResult {
  state: GameState | null;
  /** The same shape `/play` writes, so `GameFeed` draws both without a fork. */
  feed: PlayFeedEntry[];
  /** What was played, from where, and what paid for it. */
  lastPlay: WatchedPlay | null;
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
 * three lines that matter off the panel within a second. The feed keeps
 * decisions.
 */
const BOOKKEEPING =
  /^(Untaps|Upkeep|Draws for turn|Begins combat|Moves to combat|Waits for blocks|Combat damage|Combat ends|End step|Passes the turn|Ends the turn|Attackers are declared|Continues)\b/;

export function useWatchedGame(options: UseWatchedGameOptions): UseWatchedGameResult {
  const { table, aggression = 'normal', speedMs = 450, running, maxTurns = 60 } = options;

  const [state, setState] = useState<GameState | null>(table ? table.state : null);
  const [feed, setFeed] = useState<PlayFeedEntry[]>([]);
  const [lastPlay, setLastPlay] = useState<WatchedPlay | null>(null);
  const [halted, setHalted] = useState<string | null>(null);

  /**
   * What keeps the clock running when a decision changes nothing.
   *
   * The loop below re-arms its timer from an effect that watches `state`. A
   * rejected batch leaves `state` untouched, so nothing re-ran the effect, so
   * no next timer was ever set: ONE rejected batch stopped the game dead, in
   * silence, and `STALL_LIMIT` below could never be reached because `tick` was
   * never called a second time. The screen simply stopped, which is the exact
   * thing this project forbids: never silently do nothing. This counter moves
   * on every tick that produced no state, so the effect re-arms and the stall
   * guard can actually count to its limit and say so.
   */
  const [pulse, setPulse] = useState(0);

  /* The authority. `state` mirrors it for rendering only — see the header. */
  const stateRef = useRef<GameState | null>(table ? table.state : null);
  const feedIdRef = useRef(0);
  const playKeyRef = useRef(0);
  const stallRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  /* Every seat is a bot here, whatever the table said, and no seat is waited
     for — a defender that never answers is the deadlock this hook avoids. */
  const seatIds = useMemo<PlayerId[]>(
    () => (table ? table.state.players.map(player => player.id) : []),
    [table]
  );

  const botOptions = useMemo<BotOptions>(
    () => ({ aggression, waitForPlayerIds: [] }),
    [aggression]
  );

  /**
   * A development-only window onto the live table, matching `usePlayGame`.
   *
   * A screenshot harness that has to infer "did that bot cast anything" from
   * rendered pixels ends up asserting on the picture rather than on the game.
   * This publishes the same state object the board is drawing, so a Puppeteer
   * run reads life totals and zones out of the engine itself. Stripped from
   * production by `import.meta.env.DEV`; nothing in the app reads it.
   */
  const publish = (next: GameState | null) => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __dmGame?: GameState | null }).__dmGame = next;
  };

  const reset = useCallback((next: GameState | null) => {
    stateRef.current = next;
    setState(next);
    publish(next);
    setFeed([]);
    setLastPlay(null);
    setHalted(null);
    stallRef.current = 0;
    feedIdRef.current = 0;
    playKeyRef.current = 0;
    setPulse(value => value + 1);
  }, []);

  useEffect(() => {
    reset(table ? table.state : null);
  }, [table, reset]);

  /** One decision by whichever seat owes the table one. */
  const tick = useCallback(() => {
    const current = stateRef.current;
    if (!current || current.status !== 'playing') return;

    if (current.turn > maxTurns) {
      setHalted(
        `Stopped at turn ${maxTurns}. Neither deck closed the game, which is a finding rather than a crash.`
      );
      return;
    }

    const waiting = botsAwaitingMove(current, seatIds, botOptions);
    const actor = waiting[0] ?? current.activePlayerId;
    const move = nextBotMove(current, actor, botOptions);

    // Nobody has a decision but the game is not over: push the step itself,
    // which is what a table of players passing priority actually does.
    const actions = move ? move.actions : advanceActions(current, Date.now());

    /* Read the sentence off the DECISION, before it is applied: the cards are
       still in the zones they are leaving, so "from hand" and the names of the
       lands being tapped are readable. `playLine.ts` explains at length why
       this is not derived from a state diff. */
    const line = describePlay(current, actor, actions);

    const next = applyActions(current, actions);

    if (next.version === current.version) {
      stallRef.current += 1;
      if (stallRef.current >= STALL_LIMIT) {
        setHalted(`The engine stopped making progress at ${current.step} on turn ${current.turn}.`);
        return;
      }
      // Nothing else changed, so nothing else will re-arm the timer. Say so.
      setPulse(value => value + 1);
      return;
    }

    stallRef.current = 0;
    stateRef.current = next;
    setState(next);
    publish(next);

    if (line) {
      playKeyRef.current += 1;
      setLastPlay({ line, key: playKeyRef.current, turn: current.turn });
    }

    /* The note is the bot's INTENT ("Holds back this turn"), which is a
       different thing from the record of what it did and is worth keeping:
       it explains board positions the log never will. */
    if (move?.note && !BOOKKEEPING.test(move.note)) {
      feedIdRef.current += 1;
      const entry: PlayFeedEntry = {
        id: feedIdRef.current,
        kind: 'bot',
        actorId: actor,
        text: move.note,
      };
      // Bounded: a 60-turn game is thousands of decisions and the panel only
      // ever shows the tail of them.
      setFeed(previous => [...previous.slice(-120), entry]);
    }
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
    /* `pulse` is in here on purpose: it is the only thing that changes when a
       tick decided something the reducer refused, and without it the timer is
       never re-armed. See its declaration. */
  }, [running, state, pulse, speedMs, halted, tick]);

  const restart = useCallback(() => {
    if (!table) return;
    reset(table.state);
  }, [table, reset]);

  const stepOnce = useCallback(() => {
    if (halted) setHalted(null);
    stallRef.current = 0;
    tick();
  }, [halted, tick]);

  return {
    state,
    feed,
    lastPlay,
    halted,
    stepOnce,
    restart,
    live: !!state && state.status === 'playing' && !halted,
  };
}
