/**
 * /play — the online play and playtest surface.
 *
 * Everything on this page is a thin shell over `src/lib/game`. The page owns
 * four things and nothing else: which view is on screen, which deck sat down,
 * when to press "next" on the player's behalf, and the dialogs. Rules, mana,
 * combat, the bot and the transport all live in the core, which is why a
 * networked table later needs a new transport rather than a new page.
 *
 * ---------------------------------------------------------------------------
 * A lobby is a page. A game is not.
 * ---------------------------------------------------------------------------
 * The lobby keeps the standard page furniture — title, description, the app's
 * rail and top bar — because that is a page you read. The moment a table
 * exists the surface takes the whole viewport: the board goes full bleed behind
 * a fixed overlay, the app chrome goes away exactly as it does on `/life`, and
 * the only furniture left is a HUD floating over the table. A game deserves the
 * screen, and a left rail beside a battlefield is just a smaller battlefield.
 *
 * ---------------------------------------------------------------------------
 * The player does not click through twelve steps
 * ---------------------------------------------------------------------------
 * The engine keeps the full turn structure, because priority, triggers and a
 * networked table all need it. The *player* sees three or four decisions a turn
 * and the page walks everything in between:
 *
 *   `turnFlow.decisionFor()` asks the same helpers the bot asks — can anything
 *   attack, can anything block, is anything castable — and returns either the
 *   decision this seat owes the table or null. On null, and only when no other
 *   seat still has a move pending, the page dispatches `advanceActions` itself.
 *
 * So untap, upkeep, draw, begin combat, an empty blocker step, combat damage,
 * end of combat, the end step and cleanup all happen on their own. What is left
 * is: play your main phase, optionally swing, optionally block, END TURN. That
 * last one is a single press that sweeps the rest of the turn — one step at a
 * time, through the same reducer, pausing wherever a bot still has to answer,
 * so combat resolves properly instead of being skipped.
 *
 * The three views are the feature, not the chrome:
 *
 *   Table   the pod as it physically sits, driven by `seating.ts` geometry
 *   Hand    your cards big enough to read, each saying if and why it is castable
 *   Combat  attackers, blockers, and the defender's board and hand together
 *
 * Combat opens itself when a combat decision is actually yours, and hands the
 * view back when the swing is over — with the switcher always visible so that
 * is a convenience, never a trap.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import { PlayHUD, type PlayViewId } from '@/components/play/PlayHUD';
import { PlaySetup, type PlaySetupValue } from '@/components/play/PlaySetup';
import { TableView } from '@/components/play/TableView';
import { HandView } from '@/components/play/HandView';
import { ViewerHand } from '@/components/play/ViewerHand';
import { CastSpotlight } from '@/components/play/CastSpotlight';
import { CombatView, combatIsLive } from '@/components/play/CombatView';
import { GameFeed } from '@/components/play/GameFeed';
import { TurnBanner } from '@/components/play/TurnBanner';
import { ZoneBrowser } from '@/components/play/ZoneBrowser';
import { useCastSpotlight, useLifeDeltas } from '@/components/play/useTableMotion';
import { canReachCombat, controlsFlow, decisionFor } from '@/components/play/turnFlow';
import { defaultSeatingFor } from '@/components/play/seatingDefaults';

import { usePlayGame } from '@/hooks/usePlayGame';
import { listPlayableDecks, resolveDeck, type DeckSummary } from '@/lib/play/deckSource';
import {
  advanceActions,
  applyActions,
  botsAwaitingMove,
  buildTable,
  declareAttack,
  mulliganActions,
  planCastFromHand,
  planLandDrop,
  type BotOptions,
  type BuiltTable,
  type CardInstance,
  type GameAction,
  type PlayDeck,
  type PlayerId,
  type SeatingVariant,
  type Zone,
} from '@/lib/game';

const HUMAN_SEAT: PlayerId = 'p1';

/**
 * How much of the board's bottom edge is reserved for the fanned hand. The
 * cards themselves are taller than this and deliberately overlap the viewer's
 * own mat, exactly as a hand held over the near edge of a table would.
 */
const HAND_INSET = 96;

/** Height of the floating HUD — the board is held off the top edge by this. */
const HUD_INSET = 56;

/**
 * Pace of the automatic walk between decisions.
 *
 * Not zero. A step that resolves instantly is a step the player never saw
 * happen, and "my creature untapped and I drew a card" is information. Fast
 * enough that nine skipped steps take about a second; slow enough to read.
 */
const AUTO_STEP_MS = 130;
/** END TURN is a deliberate press, so its sweep is quicker than idle flow. */
const END_TURN_STEP_MS = 75;

/** Runaway guard for the local simulations below. A turn has twelve steps. */
const MAX_SIMULATED_STEPS = 16;

/** A short, table-friendly name for a bot: its commander, not "Player 2". */
function botNameFor(deck: PlayDeck, index: number): string {
  const commander = deck.commanders[0];
  if (!commander) return `Bot ${index + 1}`;
  const short = commander.name.split(/[,—-]/)[0].trim();
  return short.length > 0 ? short : `Bot ${index + 1}`;
}

export default function Play() {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();

  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [starting, setStarting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [setup, setSetup] = useState<PlaySetupValue>({
    deckId: null,
    playerCount: 2,
    variant: defaultSeatingFor(2),
    aggression: 'normal',
    seed: 7,
  });

  const [table, setTable] = useState<BuiltTable | null>(null);
  const [variant, setVariant] = useState<SeatingVariant>('table');
  const [view, setView] = useState<PlayViewId>('table');
  const [freeCast, setFreeCast] = useState(false);
  const [botsPaused, setBotsPaused] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  /** The turn number END TURN was pressed on. Null when nobody is ending one. */
  const [endingTurn, setEndingTurn] = useState<number | null>(null);
  const [zoneTarget, setZoneTarget] = useState<{ playerId: PlayerId; zone: Zone } | null>(null);

  /** The view combat interrupted, so it can be handed back afterwards. */
  const autoOpenedFrom = useRef<PlayViewId | null>(null);
  /** Turn number on which the player deliberately left the combat view. */
  const dismissedCombatOnTurn = useRef<number | null>(null);

  const { state, dispatch, undo, canUndo, botPlayerIds, botThinking, feed } = usePlayGame({
    table,
    humanPlayerId: HUMAN_SEAT,
    botSpeedMs: 750,
    aggression: setup.aggression,
    botsPaused,
  });

  // Presentation-only memory of the previous board: what life changed, and what
  // just left somebody's hand. Neither belongs in game state.
  const lifeDeltas = useLifeDeltas(state);
  const spotlight = useCastSpotlight(state);

  /* ---------------------------------------------------------------------- */
  /* Deck list                                                              */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setLoadingDecks(false);
      return;
    }

    listPlayableDecks(user.id)
      .then(list => {
        if (cancelled) return;
        setDecks(list);
        if (list.length > 0) setSetup(previous => ({ ...previous, deckId: list[0].id }));
      })
      .catch(error => {
        console.warn('[play] could not list decks:', error);
        if (!cancelled) setDecks([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDecks(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  /* ---------------------------------------------------------------------- */
  /* Starting a game                                                        */
  /* ---------------------------------------------------------------------- */

  const startGame = useCallback(async () => {
    setStarting(true);
    setSetupError(null);

    try {
      const mine = setup.deckId ? decks.find(deck => deck.id === setup.deckId) ?? null : null;
      const myDeck = await resolveDeck(mine, { seed: setup.seed, name: 'Seeded commander deck' });

      const opponentDecks: PlayDeck[] = [];
      for (let i = 1; i < setup.playerCount; i++) {
        // Distinct seeds so a three-way pod is not three copies of one deck.
        opponentDecks.push(await resolveDeck(null, { seed: setup.seed + i * 977 }));
      }

      const built = buildTable({
        id: `play-${setup.seed}-${setup.playerCount}-${Date.now()}`,
        seed: setup.seed,
        now: Date.now(),
        format: myDeck.format,
        seats: [
          {
            deck: myDeck,
            playerName: user?.email ? user.email.split('@')[0] : 'You',
            playerId: HUMAN_SEAT,
          },
          ...opponentDecks.map((deck, index) => ({
            deck,
            playerName: botNameFor(deck, index),
            playerId: `p${index + 2}` as PlayerId,
            isBot: true,
          })),
        ],
      });

      setVariant(setup.variant);
      setView('table');
      setEndingTurn(null);
      autoOpenedFrom.current = null;
      dismissedCombatOnTurn.current = null;
      setTable(built);

      if (myDeck.source !== 'user-deck') {
        toast.info(
          myDeck.source === 'seeded'
            ? 'Playing a seeded commander deck.'
            : 'Card database unreachable — playing the offline demo deck.'
        );
      }
    } catch (error) {
      console.error('[play] could not start a game', error);
      setSetupError(
        error instanceof Error ? error.message : 'Could not deal the table. Try again.'
      );
    } finally {
      setStarting(false);
    }
  }, [decks, setup, user]);

  /* ---------------------------------------------------------------------- */
  /* Whose move is it, really                                               */
  /* ---------------------------------------------------------------------- */

  const botOptions = useMemo<BotOptions>(
    () => ({ aggression: setup.aggression, waitForPlayerIds: [HUMAN_SEAT] }),
    [setup.aggression]
  );

  /** The decision this seat owes the table, or null while the game can flow. */
  const decision = useMemo(
    () => (state ? decisionFor(state, HUMAN_SEAT, { freeCast }) : null),
    [state, freeCast]
  );

  /**
   * True while another seat still has a move queued. Nothing auto-advances over
   * one: the bot decides on a timer, and walking past a pending block would
   * resolve combat before the opponent ever declared it.
   */
  const othersPending = useMemo(
    () => (state ? botsAwaitingMove(state, botPlayerIds, botOptions).length > 0 : false),
    [state, botPlayerIds, botOptions]
  );

  const combatLive = state ? combatIsLive(state, HUMAN_SEAT) : false;
  const canAttack = state ? canReachCombat(state, HUMAN_SEAT) : false;

  /* ---------------------------------------------------------------------- */
  /* Moves                                                                  */
  /* ---------------------------------------------------------------------- */

  const handleCast = useCallback(
    (card: CardInstance) => {
      if (!state) return;
      const plan = planCastFromHand(state, HUMAN_SEAT, card.instanceId, { ignoreMana: freeCast });
      if (!plan.ok) {
        toast.error(plan.reason);
        return;
      }
      dispatch(plan.actions);
    },
    [state, dispatch, freeCast]
  );

  const handlePlayLand = useCallback(
    (card: CardInstance) => {
      if (!state) return;
      const plan = planLandDrop(state, HUMAN_SEAT, card.instanceId);
      if (!plan.ok) {
        toast.error(plan.reason);
        return;
      }
      dispatch(plan.actions);
    },
    [state, dispatch]
  );

  const handleDiscard = useCallback(
    (card: CardInstance) => {
      dispatch({ type: 'MOVE_ZONE', instanceId: card.instanceId, to: 'graveyard' });
    },
    [dispatch]
  );

  const handleMulligan = useCallback(() => {
    if (!state) return;
    const actions = mulliganActions(state, HUMAN_SEAT, Date.now());
    if (actions.length === 0) return;
    dispatch(actions);
  }, [state, dispatch]);

  /** Clicking a permanent you control taps or untaps it, as it would on a table. */
  const handleCardClick = useCallback(
    (card: CardInstance) => {
      if (!state) return;
      if (card.zone !== 'battlefield') return;
      if (card.controllerId !== HUMAN_SEAT) return;
      dispatch({ type: card.tapped ? 'UNTAP' : 'TAP', instanceId: card.instanceId });
    },
    [state, dispatch]
  );

  const handleAdvance = useCallback(() => {
    if (!state) return;
    dispatch(advanceActions(state, Date.now()));
  }, [state, dispatch]);

  /**
   * Main phase → declare attackers, in one press.
   *
   * Composed by simulating `advanceActions` forward through the pure reducer
   * and shipping the whole batch, so the engine decides what each hop does and
   * the page only decides where to stop. Bails out rather than overshooting.
   */
  const handleAttack = useCallback(() => {
    if (!state) return;

    const at = Date.now();
    const batch: GameAction[] = [];
    let simulated = state;

    for (let i = 0; i < MAX_SIMULATED_STEPS && simulated.step !== 'declare_attackers'; i++) {
      const actions = advanceActions(simulated, at);
      simulated = applyActions(simulated, actions);
      batch.push(...actions);
      // Walked out of our own turn: there was no combat to reach.
      if (simulated.activePlayerId !== state.activePlayerId) return;
    }

    if (simulated.step !== 'declare_attackers') return;
    if (batch.length > 0) dispatch(batch);
    autoOpenedFrom.current = null;
    dismissedCombatOnTurn.current = null;
    setView('combat');
  }, [state, dispatch]);

  /** One press. The effect below sweeps the rest of the turn. */
  const handleEndTurn = useCallback(() => {
    if (!state) return;
    if (state.status !== 'playing') return;
    if (state.activePlayerId !== HUMAN_SEAT) return;
    setEndingTurn(state.turn);
  }, [state]);

  const handleDeclareAttack = useCallback(
    (attacks: Array<{ attackerId: string; defenderPlayerId: PlayerId }>) => {
      if (!state) return;
      dispatch(declareAttack(state, attacks, Date.now()));
    },
    [state, dispatch]
  );

  const handleDeclareBlocks = useCallback(
    (blocks: Array<{ blockerId: string; attackerId: string }>) => {
      dispatch({ type: 'BLOCK', blocks });
    },
    [dispatch]
  );

  const handleMoveCard = useCallback(
    (instanceId: string, to: Zone, position?: 'top' | 'bottom') => {
      dispatch({ type: 'MOVE_ZONE', instanceId, to, position });
    },
    [dispatch]
  );

  const handleLeave = useCallback(() => {
    setTable(null);
    setView('table');
    setEndingTurn(null);
    autoOpenedFrom.current = null;
    dismissedCombatOnTurn.current = null;
  }, []);

  /* ---------------------------------------------------------------------- */
  /* The automatic walk                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * Press "next" on the player's behalf.
   *
   * Fires only when every one of these is true, which is what keeps it from
   * ever stealing a decision:
   *
   *   - this seat is the one holding the game up (`controlsFlow`);
   *   - no other seat has a move queued — the bot answers first;
   *   - the current step holds no decision for this seat, *or* END TURN was
   *     pressed and the player has explicitly given the rest of the turn up.
   *
   * Every hop goes through `advanceActions`, the same helper the bot uses, so
   * combat damage resolves on the way past rather than being skipped.
   */
  useEffect(() => {
    if (!state) return;

    if (state.status !== 'playing') {
      if (endingTurn !== null) setEndingTurn(null);
      return;
    }

    // The turn moved on: whatever END TURN was ending is over.
    if (endingTurn !== null && endingTurn !== state.turn) {
      setEndingTurn(null);
      return;
    }

    const forcing = endingTurn === state.turn;
    if (!forcing && !autoAdvance) return;
    if (botsPaused) return;
    if (!controlsFlow(state, HUMAN_SEAT)) return;
    if (!forcing && decision !== null) return;
    if (othersPending) return;

    const timer = window.setTimeout(
      () => dispatch(advanceActions(state, Date.now())),
      forcing ? END_TURN_STEP_MS : AUTO_STEP_MS
    );
    return () => window.clearTimeout(timer);
  }, [state, endingTurn, autoAdvance, botsPaused, decision, othersPending, dispatch]);

  /* ---------------------------------------------------------------------- */
  /* Combat takes over the view when it matters                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!state) return;

    // A combat *decision*, not merely the combat phase. Steps the page walks
    // through on its own must never yank the view sideways for a frame.
    const myDecision = decision === 'attackers' || decision === 'blockers';

    // Auto-opening is a convenience, so leaving has to stick. Without the
    // dismissal check the effect would drag the player straight back and the
    // switcher would look broken for the rest of the turn.
    const dismissed = dismissedCombatOnTurn.current === state.turn;

    if (myDecision && view !== 'combat' && !dismissed) {
      autoOpenedFrom.current = view;
      setView('combat');
      return;
    }

    // Combat is done and we opened this view ourselves — give the table back.
    if (!combatLive && view === 'combat' && autoOpenedFrom.current) {
      setView(autoOpenedFrom.current);
      autoOpenedFrom.current = null;
    }
  }, [state, view, combatLive, decision]);

  const changeView = useCallback(
    (next: PlayViewId) => {
      if (view === 'combat' && next !== 'combat' && state) {
        dismissedCombatOnTurn.current = state.turn;
      }
      autoOpenedFrom.current = null;
      setView(next);
    },
    [view, state]
  );

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  const selectedIds = useMemo<string[]>(() => [], []);

  if (!table || !state) {
    return (
      <StandardPageLayout
        title="Play"
        description="Goldfish a deck or play a pod against bots, on the rules engine that will run online tables."
      >
        <PlaySetup
          decks={decks}
          loadingDecks={loadingDecks}
          starting={starting}
          error={setupError}
          value={setup}
          onChange={setSetup}
          onStart={startGame}
        />
        {starting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </StandardPageLayout>
    );
  }

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

  const viewMotion = reduceMotion
    ? { initial: false as const, animate: {}, exit: {} }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
      };

  const attackerIds = state.combat.attackers.map(d => d.attackerId);
  const blockerIds = state.combat.attackers.flatMap(d => d.blockedBy);

  return (
    // Fixed, not laid out: the table takes the viewport and the app's rail and
    // top bar go away for the duration, the same trade `/life` makes. The z
    // index clears the shell (rail 40, top bar 50) while staying under the
    // portals that dialogs and toasts render into.
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background">
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={viewMotion.initial}
            animate={viewMotion.animate}
            exit={viewMotion.exit}
            transition={transition}
            className="absolute inset-0 z-0"
          >
            {view === 'table' && (
              <div className="relative h-full w-full">
                <TableView
                  className="h-full w-full"
                  state={state}
                  viewerPlayerId={HUMAN_SEAT}
                  botPlayerIds={botPlayerIds}
                  variant={variant}
                  bottomInset={HAND_INSET}
                  topInset={HUD_INSET}
                  onCardClick={handleCardClick}
                  onOpenZone={(playerId, zone) => setZoneTarget({ playerId, zone })}
                  attackerIds={attackerIds}
                  blockerIds={blockerIds}
                  selectedIds={selectedIds}
                  lifeDeltas={lifeDeltas}
                />

                <CastSpotlight state={state} entry={spotlight} />

                {/* Your hand, held over the near edge of the table. */}
                <ViewerHand
                  className="absolute inset-x-0 bottom-1 z-30"
                  state={state}
                  viewerPlayerId={HUMAN_SEAT}
                  freeCast={freeCast}
                  onCast={handleCast}
                  onPlayLand={handlePlayLand}
                />
              </div>
            )}

            {view === 'hand' && (
              <div className="h-full overflow-y-auto px-2 pb-2 md:px-4" style={{ paddingTop: HUD_INSET + 8 }}>
                <HandView
                  state={state}
                  viewerPlayerId={HUMAN_SEAT}
                  botPlayerIds={botPlayerIds}
                  freeCast={freeCast}
                  onCast={handleCast}
                  onPlayLand={handlePlayLand}
                  onDiscard={handleDiscard}
                  onMulligan={handleMulligan}
                  onOpenZone={(playerId, zone) => setZoneTarget({ playerId, zone })}
                  onCardClick={handleCardClick}
                />
              </div>
            )}

            {view === 'combat' && (
              <div className="h-full overflow-y-auto px-2 pb-2 md:px-4" style={{ paddingTop: HUD_INSET + 8 }}>
                <CombatView
                  state={state}
                  viewerPlayerId={HUMAN_SEAT}
                  botPlayerIds={botPlayerIds}
                  onDeclareAttack={handleDeclareAttack}
                  onDeclareBlocks={handleDeclareBlocks}
                  onAdvance={handleAdvance}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* The log, as a feed over the board rather than a column beside it. */}
        <GameFeed
          state={state}
          feed={feed}
          variant="feed"
          className="absolute bottom-2 left-2 z-30 w-64 max-w-[40vw]"
        />

        {/* Whose turn it is, said out loud for a beat. */}
        <TurnBanner state={state} viewerPlayerId={HUMAN_SEAT} />

        {/* The HUD floats over the table; the board is inset to make room. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-50">
          <PlayHUD
            state={state}
            view={view}
            onViewChange={changeView}
            viewerPlayerId={HUMAN_SEAT}
            combatLive={combatLive}
            botThinking={botThinking}
            botsPaused={botsPaused}
            onToggleBots={() => setBotsPaused(paused => !paused)}
            freeCast={freeCast}
            onToggleFreeCast={() => setFreeCast(value => !value)}
            autoAdvance={autoAdvance}
            onToggleAuto={() => setAutoAdvance(value => !value)}
            decision={decision}
            onAdvance={handleAdvance}
            onEndTurn={handleEndTurn}
            ending={endingTurn !== null}
            onAttack={handleAttack}
            canAttack={canAttack}
            onUndo={undo}
            canUndo={canUndo}
            onLeave={handleLeave}
          />
        </div>

        {state.status === 'complete' && (
          <div className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center">
            <div className="pointer-events-auto rounded-2xl bg-background/85 px-6 py-5 text-center shadow-2xl shadow-black/70 backdrop-blur-md">
              <p className="text-lg font-semibold text-foreground">
                {state.winnerIds.length > 0
                  ? `${state.players.find(p => p.id === state.winnerIds[0])?.name} wins.`
                  : 'The game is a draw.'}
              </p>
              <Button size="sm" className="mt-3 h-8 text-xs" onClick={handleLeave}>
                Set up another game
              </Button>
            </div>
          </div>
        )}
      </div>

      <ZoneBrowser
        state={state}
        open={zoneTarget !== null}
        onOpenChange={open => {
          if (!open) setZoneTarget(null);
        }}
        playerId={zoneTarget?.playerId ?? null}
        zone={zoneTarget?.zone ?? null}
        viewerPlayerId={HUMAN_SEAT}
        onMove={handleMoveCard}
        onZoneChange={zone => setZoneTarget(target => (target ? { ...target, zone } : null))}
      />
    </div>
  );
}
