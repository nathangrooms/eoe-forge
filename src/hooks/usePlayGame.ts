/**
 * DeckMatrix — the React binding for a playtest table.
 *
 * `src/lib/game` is deliberately clock-free, transport-free and React-free.
 * This hook is the one place those things meet: it stamps `Date.now()` onto
 * every action, owns the transport, runs the bot on a timer, and keeps the
 * undo stack.
 *
 * The rule it enforces is that there is exactly **one** path into game state:
 * broadcast an action, receive it back off the transport, apply it. A human
 * click, a bot decision and (later) an opponent three time zones away all
 * arrive the same way. The local transport echoes to the sender precisely so
 * that path is not special-cased today and rewritten tomorrow.
 *
 * The authoritative state lives in a ref, with `useState` only mirroring it for
 * rendering. That is not premature optimisation: React 18's StrictMode invokes
 * state updater functions twice, and `applyAction` inside an updater would
 * apply every action twice in development — silently, and only in dev.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyAction,
  createLocalTransport,
  nextBotMove,
  type BotMove,
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
  /** Result of `buildTable`. A new object identity starts a fresh game. */
  table: BuiltTable | null;
  /** The seat this device controls. */
  humanPlayerId: PlayerId;
  /** Delay between bot decisions, so a turn is watchable rather than instant. */
  botSpeedMs?: number;
  aggression?: BotOptions['aggression'];
  /** Pause the bot without tearing the table down. */
  botsPaused?: boolean;
}

/** Stalled bot ticks tolerated before the loop gives up and says so. */
const MAX_STALLED_TICKS = 4;
const MAX_UNDO_DEPTH = 60;

export interface UsePlayGameResult {
  state: GameState | null;
  dispatch: (actions: GameAction | GameAction[]) => void;
  undo: () => void;
  canUndo: boolean;
  transportStatus: TransportStatus;
  transportKind: 'local' | 'realtime' | null;
  botPlayerIds: PlayerId[];
  /** True while a bot decision is queued, so the UI can lock its own controls. */
  botThinking: boolean;
  feed: PlayFeedEntry[];
  /** True when the game is waiting on the human seat. */
  awaitingHuman: boolean;
  note: (text: string) => void;
}

export function usePlayGame(options: UsePlayGameOptions): UsePlayGameResult {
  const { table, humanPlayerId, botSpeedMs = 700, aggression = 'normal', botsPaused } = options;

  const [state, setState] = useState<GameState | null>(table ? table.state : null);
  const [transportStatus, setTransportStatus] = useState<TransportStatus>('idle');
  const [transportKind, setTransportKind] = useState<'local' | 'realtime' | null>(null);
  const [botThinking, setBotThinking] = useState(false);
  const [feed, setFeed] = useState<PlayFeedEntry[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);

  const stateRef = useRef<GameState | null>(table ? table.state : null);
  const transportRef = useRef<GameTransport | null>(null);
  const historyRef = useRef<GameState[]>([]);
  const feedIdRef = useRef(0);
  const botTimerRef = useRef<number | null>(null);
  const stalledRef = useRef(0);
  const lastTickVersionRef = useRef(-1);

  const botPlayerIds = useMemo(() => (table ? table.botPlayerIds : []), [table]);

  const pushFeed = useCallback(
    (text: string, kind: PlayFeedEntry['kind'] = 'system', actorId?: PlayerId) => {
      feedIdRef.current += 1;
      const entry: PlayFeedEntry = { id: feedIdRef.current, kind, actorId, text };
      setFeed(previous => [...previous.slice(-40), entry]);
    },
    []
  );

  /* ---------------------------------------------------------------------- */
  /* Transport                                                              */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!table) {
      stateRef.current = null;
      setState(null);
      setTransportStatus('idle');
      setTransportKind(null);
      return;
    }

    // A new table is a new game: reset every derived buffer, not just the state.
    historyRef.current = [];
    stalledRef.current = 0;
    lastTickVersionRef.current = -1;
    stateRef.current = table.state;
    setState(table.state);
    setUndoDepth(0);
    setFeed([]);

    const transport = createLocalTransport({
      tableId: table.state.id,
      participantId: `${table.state.id}:${humanPlayerId}`,
      name: 'This device',
      playerId: humanPlayerId,
    });
    transportRef.current = transport;
    setTransportKind(transport.kind);

    let cancelled = false;

    const receive = (envelope: TransportEnvelope) => {
      const previous = stateRef.current;
      if (!previous) return;

      const next = applyAction(previous, envelope.action);
      // Same reference means the reducer rejected it: no history, no version bump.
      if (next === previous) return;

      historyRef.current = [...historyRef.current.slice(-(MAX_UNDO_DEPTH - 1)), previous];
      stateRef.current = next;
      if (!cancelled) {
        setState(next);
        setUndoDepth(historyRef.current.length);
      }
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
      // The clock lives here, never in the core: replaying this log elsewhere
      // has to reproduce the same state, so the reducer is handed a timestamp
      // rather than reading one.
      const version = stateRef.current ? stateRef.current.version : 0;
      transport
        .broadcast({ ...action, at: action.at ?? at }, version, at)
        .catch(error => console.error('[play] broadcast failed', error));
    }
  }, []);

  const undo = useCallback(() => {
    const history = historyRef.current;
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    historyRef.current = history.slice(0, -1);
    stateRef.current = previous;
    setState(previous);
    setUndoDepth(historyRef.current.length);
    // Local-only on purpose. A networked undo is a rollback the whole table has
    // to agree on, which is a transport concern rather than a button.
    pushFeed('Undid the last action.');
  }, [pushFeed]);

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
    let move: BotMove | null = null;
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
    // Rather than spin the tab, stop and hand control back with an explanation.
    if (lastTickVersionRef.current === state.version) {
      stalledRef.current += 1;
    } else {
      stalledRef.current = 0;
      lastTickVersionRef.current = state.version;
    }
    if (stalledRef.current > MAX_STALLED_TICKS) {
      setBotThinking(false);
      pushFeed('The bot stopped making progress — advance the step manually.');
      return;
    }

    setBotThinking(true);
    const actingId = actor;
    const decided = move;

    botTimerRef.current = window.setTimeout(() => {
      botTimerRef.current = null;
      pushFeed(decided.note, 'bot', actingId);
      dispatch(decided.actions);
    }, Math.max(0, botSpeedMs));

    return () => {
      if (botTimerRef.current !== null) {
        window.clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }
    };
  }, [state, botPlayerIds, botsPaused, botSpeedMs, aggression, humanIds, dispatch, pushFeed]);

  const awaitingHuman = useMemo(() => {
    if (!state || state.status !== 'playing') return false;
    if (state.activePlayerId === humanPlayerId) return true;
    // Someone else's turn, but the blocks are ours to declare.
    return (
      state.step === 'declare_blockers' &&
      state.combat.attackers.some(d => d.defenderPlayerId === humanPlayerId)
    );
  }, [state, humanPlayerId]);

  const note = useCallback((text: string) => pushFeed(text), [pushFeed]);

  return {
    state,
    dispatch,
    undo,
    canUndo: undoDepth > 0,
    transportStatus,
    transportKind,
    botPlayerIds,
    botThinking,
    feed,
    awaitingHuman,
    note,
  };
}
