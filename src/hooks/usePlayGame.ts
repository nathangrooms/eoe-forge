/**
 * DeckMatrix — the React binding for a playtest table.
 *
 * `src/lib/game` is deliberately clock-free, transport-free and React-free.
 * This hook is the one place those things meet: it stamps `Date.now()` onto
 * every action, owns the transport, runs the bot on a timer, and keeps the
 * undo stack.
 *
 * The important rule it enforces is that there is exactly **one** path into the
 * game state: broadcast an action, receive it back off the transport, apply it.
 * A human click, a bot decision and (later) an opponent three time zones away
 * all arrive the same way. The local transport echoes to the sender precisely so
 * that path is not special-cased today and rewritten tomorrow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyAction,
  createLocalTransport,
  nextBotMove,
  type BotOptions,
  type BuiltTable,
  type GameAction,
  type GameState,
  type GameTransport,
  type PlayerId,
  type TransportEnvelope,
  type TransportStatus,
} from '@/lib/game';

export interface PlayFeedEntry {
  id: number;
  /** 'bot' entries are intent ("Holds back this turn"); 'system' are surface notices. */
  kind: 'bot' | 'system';
  actorId?: PlayerId;
  text: string;
}

export interface UsePlayGameOptions {
  /** Result of `buildTable`. Changing identity starts a fresh game. */
  table: BuiltTable | null;
  /** The seat this device controls. */
  humanPlayerId: PlayerId;
  /** Delay between bot decisions, so a turn is watchable. */
  botSpeedMs?: number;
  aggression?: BotOptions['aggression'];
  /** Pause the bot without tearing the table down. */
  botsPaused?: boolean;
}

/** How many stalled bot ticks to tolerate before giving up on the bot loop. */
const MAX_STALLED_TICKS = 4;
const MAX_UNDO_DEPTH = 60;

export interface UsePlayGameResult {
  state: GameState | null;
  dispatch: (actions: GameAction | GameAction[]) => void;
  undo: () => void;
  canUndo: boolean;
  transportStatus: TransportStatus;
  transportKind: 'local' | 'realtime' | null;
  /** Seats driven by the bot policy. */
  botPlayerIds: PlayerId[];
  /** True while the bot is mid-decision, so the UI can lock its controls. */
  botThinking: boolean;
  feed: PlayFeedEntry[];
  /** True when it is the human's seat and the game is waiting on them. */
  awaitingHuman: boolean;
  note: (text: string) => void;
}

export function usePlayGame(options: UsePlayGameOptions): UsePlayGameResult {
  const { table, humanPlayerId, botSpeedMs = 700, aggression = 'normal', botsPaused } = options;

  const [state, setState] = useState<GameState | null>(table ? table.state : null);
  const [transportStatus, setTransportStatus] = useState<TransportStatus>('idle');
  const [botThinking, setBotThinking] = useState(false);
  const [feed, setFeed] = useState<PlayFeedEntry[]>([]);

  const transportRef = useRef<GameTransport | null>(null);
  const versionRef = useRef(0);
  const historyRef = useRef<GameState[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const feedIdRef = useRef(0);
  const botTimerRef = useRef<number | null>(null);
  const stalledRef = useRef(0);
  const lastTickVersionRef = useRef(-1);

  const botPlayerIds = useMemo(() => (table ? table.botPlayerIds : []), [table]);

  const note = useCallback((text: string, kind: PlayFeedEntry['kind'] = 'system', actorId?: PlayerId) => {
    feedIdRef.current += 1;
    const entry: PlayFeedEntry = { id: feedIdRef.current, kind, actorId, text };
    setFeed(previous => [...previous.slice(-40), entry]);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Transport                                                              */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!table) {
      setState(null);
      setTransportStatus('idle');
      return;
    }

    // A new table is a new game: reset every derived buffer, not just the state.
    historyRef.current = [];
    setUndoDepth(0);
    stalledRef.current = 0;
    lastTickVersionRef.current = -1;
    versionRef.current = table.state.version;
    setState(table.state);
    setFeed([]);

    const transport = createLocalTransport({
      tableId: table.state.id,
      participantId: `${table.state.id}:${humanPlayerId}`,
      name: 'This device',
      playerId: humanPlayerId,
    });
    transportRef.current = transport;

    let cancelled = false;

    const receive = (envelope: TransportEnvelope) => {
      setState(previous => {
        if (!previous) return previous;
        const next = applyAction(previous, envelope.action);
        // Same reference means the reducer rejected it — no history, no version.
        if (next === previous) return previous;
        historyRef.current = [...historyRef.current.slice(-(MAX_UNDO_DEPTH - 1)), previous];
        versionRef.current = next.version;
        return next;
      });
      setUndoDepth(depth => Math.min(MAX_UNDO_DEPTH, depth + 1));
    };

    transport
      .join({
        onAction: receive,
        onStatus: status => {
          if (!cancelled) setTransportStatus(status);
        },
      })
      .catch(error => {
        console.error('[play] transport join failed', error);
        if (!cancelled) setTransportStatus('error');
      });

    return () => {
      cancelled = true;
      transport.leave().catch(() => undefined);
      transportRef.current = null;
    };
  }, [table, humanPlayerId]);

  /* ---------------------------------------------------------------------- */
  /* Dispatch                                                               */
  /* ---------------------------------------------------------------------- */

  const dispatch = useCallback((actions: GameAction | GameAction[]) => {
    const transport = transportRef.current;
    if (!transport) return;
    const list = Array.isArray(actions) ? actions : [actions];
    const at = Date.now();

    for (const action of list) {
      // `at` is stamped here rather than in the core: the reducer never reads a
      // clock, so replaying this log elsewhere reproduces the same state.
      transport
        .broadcast({ ...action, at: action.at ?? at }, versionRef.current, at)
        .catch(error => console.error('[play] broadcast failed', error));
    }
  }, []);

  const undo = useCallback(() => {
    const history = historyRef.current;
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    historyRef.current = history.slice(0, -1);
    versionRef.current = previous.version;
    setUndoDepth(depth => Math.max(0, depth - 1));
    setState(previous);
    // Local-only on purpose. A networked undo is a rollback the whole table has
    // to agree on, which is a transport concern, not a button.
    note('Undid the last action.');
  }, [note]);

  /* ---------------------------------------------------------------------- */
  /* The bot loop                                                           */
  /* ---------------------------------------------------------------------- */

  const humanIds = useMemo(() => [humanPlayerId], [humanPlayerId]);

  useEffect(() => {
    if (botTimerRef.current !== null) {
      window.clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }

    if (!state || state.status !== 'playing' || botsPaused || botPlayerIds.length === 0) {
      setBotThinking(false);
      return;
    }

    const botOptions: BotOptions = { aggression, waitForPlayerIds: humanIds };

    let actor: PlayerId | null = null;
    let move: ReturnType<typeof nextBotMove> = null;
    for (const id of botPlayerIds) {
      const candidate = nextBotMove(state, id, botOptions);
      if (candidate) {
        actor = id;
        move = candidate;
        break;
      }
    }

    if (!actor || !move) {
      setBotThinking(false);
      stalledRef.current = 0;
      return;
    }

    // A bot that keeps deciding without moving the version forward is stuck.
    // Rather than spin the tab, stop and say so.
    if (lastTickVersionRef.current === state.version) {
      stalledRef.current += 1;
    } else {
      stalledRef.current = 0;
      lastTickVersionRef.current = state.version;
    }
    if (stalledRef.current > MAX_STALLED_TICKS) {
      setBotThinking(false);
      note('The bot stopped making progress — advance the step manually.');
      return;
    }

    setBotThinking(true);
    const actingId = actor;
    const decided = move;

    botTimerRef.current = window.setTimeout(() => {
      botTimerRef.current = null;
      note(decided.note, 'bot', actingId);
      dispatch(decided.actions);
    }, Math.max(0, botSpeedMs));

    return () => {
      if (botTimerRef.current !== null) {
        window.clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }
    };
  }, [state, botPlayerIds, botsPaused, botSpeedMs, aggression, humanIds, dispatch, note]);

  const awaitingHuman = useMemo(() => {
    if (!state || state.status !== 'playing') return false;
    if (state.activePlayerId === humanPlayerId) return true;
    // Someone else's turn, but blockers are on us.
    return (
      state.step === 'declare_blockers' &&
      state.combat.attackers.some(d => d.defenderPlayerId === humanPlayerId)
    );
  }, [state, humanPlayerId]);

  const publicNote = useCallback((text: string) => note(text), [note]);

  return {
    state,
    dispatch,
    undo,
    canUndo: undoDepth > 0,
    transportStatus,
    transportKind: transportRef.current ? transportRef.current.kind : null,
    botPlayerIds,
    botThinking,
    feed,
    awaitingHuman,
    note: publicNote,
  };
}
