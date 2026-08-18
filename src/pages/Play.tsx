/**
 * /play — the online play and playtest surface.
 *
 * Everything on this page is a thin shell over `src/lib/game`. The page owns
 * four things and nothing else: which view is on screen, which deck sat down,
 * when to press "next" on the player's behalf, and what the board's right-hand
 * rail is showing. Rules, mana, combat, the bot and the transport all live in
 * the core, which is why a networked table later needs a new transport rather
 * than a new page.
 *
 * ---------------------------------------------------------------------------
 * Click → preview → act or close
 * ---------------------------------------------------------------------------
 * Owner: *"Most important thing on play mode though, just so you dont forget,
 * is being able to click and preview your card, then select a button action or
 * close."*
 *
 * A tap is never the action. Clicking a card anywhere — hand, battlefield, a
 * graveyard, an opponent's board — sets `inspectId` and nothing else happens.
 * `CardInspector` then draws that card at readable size with explicit buttons
 * for whatever the engine says is legal, and only a button dispatches.
 *
 * The preview is not a dialog. Owner: *"Make sure no modals in play, it should
 * be beautiful within the playmat system."* It renders into `BoardRail`, a real
 * column of the layout on the right edge, made of the same mat material as the
 * table. When it opens the board narrows and re-fits its cards; nothing is ever
 * covered, so a player reading a card is still watching the game. The zone
 * browser and the game menu share that rail for exactly the same reason.
 *
 * ---------------------------------------------------------------------------
 * One renderer, three views
 * ---------------------------------------------------------------------------
 * `PlayTable` draws the pod as four upright quadrants. Hand mode and view mode
 * are the *same component* with `focusPlayerId` set, so they cannot drift from
 * the table view — hand mode is the table zoomed to your seat, view mode is the
 * table zoomed to somebody else's. Combat is the one genuinely different
 * surface, because declaring blocks is a different job from reading a board.
 *
 * ---------------------------------------------------------------------------
 * A lobby is a page. A game is not.
 * ---------------------------------------------------------------------------
 * The lobby keeps the standard page furniture. The moment a table exists the
 * surface takes the whole viewport: the app chrome goes away exactly as it does
 * on `/life`, and the only furniture left is a HUD floating over the table.
 *
 * ---------------------------------------------------------------------------
 * The player does not click through twelve steps
 * ---------------------------------------------------------------------------
 * `turnFlow.decisionFor()` asks the same helpers the bot asks — can anything
 * attack, can anything block, is anything castable — and returns either the
 * decision this seat owes the table or null. On null, and only when no other
 * seat still has a move pending, the page dispatches `advanceActions` itself.
 * What is left is: play your main phase, optionally swing, optionally block,
 * END TURN.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useCardSize } from '@/components/cards/CardSizeSlider';

import { PlayHUD, type PlayViewId } from '@/components/play/PlayHUD';
import { PlaySetup, type PlaySetupValue } from '@/components/play/PlaySetup';
import { PlayTable } from '@/components/play/PlayTable';
import { ViewerHand } from '@/components/play/ViewerHand';
import { CastSpotlight } from '@/components/play/CastSpotlight';
import { CombatView, combatIsLive } from '@/components/play/CombatView';
import { GameFeed } from '@/components/play/GameFeed';
import { TurnBanner } from '@/components/play/TurnBanner';
import { ZonePanel } from '@/components/play/ZonePanel';
import { BoardRail, railWidthFor } from '@/components/play/BoardRail';
import { CardInspector } from '@/components/play/CardInspector';
import { GameMenu } from '@/components/play/GameMenu';
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
  seatingVariants,
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

/** Height of the floating HUD — the board is held off the top edge by this. */
const HUD_INSET = 56;

/** A real card is 63 × 88 mm: height = width ÷ this. */
const CARD_RATIO = 0.7176;

/** Starting ceilings, in px, until the player moves the sliders. */
const BOARD_CARD_DEFAULT = 150;
const HAND_CARD_DEFAULT = 230;

/**
 * How the hand is sized against the screen it is being held over.
 *
 * `ViewerHand` treats its `cardWidth` as a ceiling and shrinks to fit the width
 * available, which is the right rule for a wide screen and the wrong one for a
 * short one: a laptop at 800px tall would otherwise hand you cards taller than
 * the table. So the page caps the player's chosen ceiling by *height* and
 * reserves a matching strip along the bottom edge.
 *
 * The reserved strip is deliberately smaller than a card. The fan overlaps the
 * viewer's own mat, exactly as a hand held over the near edge of a table would;
 * what the strip buys is that the seats above it are not crushed to make room.
 *
 * Hand mode gets far more of both, because there is only one seat to fit above
 * it and reading your hand is the entire job of that view.
 */
function handMetrics(
  viewportHeight: number,
  ceiling: number,
  focused: boolean
): { cardWidth: number; inset: number } {
  const height = Math.max(480, viewportHeight);
  const share = focused ? 0.42 : 0.25;
  const cardWidth = Math.round(Math.min(ceiling, Math.max(96, height * share * CARD_RATIO)));

  // The strip is a fraction of the card's own height, so the fan laps over the
  // near mat by the same proportion however big the cards are.
  //
  // On the four-quadrant table it does not lap at all. The row nearest the
  // bottom edge is the CREATURES row of the two near seats, which is the row a
  // player looks at most; a hand held over it hid half of every creature. In
  // hand mode the fan may lap, because the only board underneath it is your own
  // and the view exists to make the hand as large as it can be.
  const overhang = focused ? 0.94 : 1;
  return { cardWidth, inset: Math.round((cardWidth / CARD_RATIO) * overhang) };
}

/**
 * Pace of the automatic walk between decisions.
 *
 * Not zero. A step that resolves instantly is a step the player never saw
 * happen, and "my creature untapped and I drew a card" is information.
 */
const AUTO_STEP_MS = 130;
/** END TURN is a deliberate press, so its sweep is quicker than idle flow. */
const END_TURN_STEP_MS = 75;

/** Roughly a second, then it fades. A new cast replaces it immediately. */
const SPOTLIGHT_MS = 1100;

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

  /* The right-hand rail. At most one of these is showing, in this order:
     the card preview, a zone's contents, the game menu. */
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [zoneTarget, setZoneTarget] = useState<{ playerId: PlayerId; zone: Zone } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Whose board "View" is looking at. */
  const [viewSeatId, setViewSeatId] = useState<PlayerId | null>(null);

  /* Card size is a preference, so it is remembered per surface — and it is a
     ceiling, not a fixed width: both the board and the hand shrink below it
     rather than letting a card run off the edge of the screen. */
  const [boardCardWidth, setBoardCardWidth] = useCardSize('play-board', BOARD_CARD_DEFAULT);
  const [handCardWidth, setHandCardWidth] = useCardSize('play-hand', HAND_CARD_DEFAULT);

  /** Viewport, because the hand and the rail are both sized against the screen. */
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
  const spotlight = useCastSpotlight(state, SPOTLIGHT_MS);

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
      setInspectId(null);
      setZoneTarget(null);
      setMenuOpen(false);
      setViewSeatId(null);
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
  /* Moves — every one of them goes through the engine                      */
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
      setInspectId(null);
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
      setInspectId(null);
    },
    [state, dispatch]
  );

  const handleMulligan = useCallback(() => {
    if (!state) return;
    const actions = mulliganActions(state, HUMAN_SEAT, Date.now());
    if (actions.length === 0) return;
    dispatch(actions);
    setInspectId(null);
  }, [state, dispatch]);

  /** Tapping is an action the preview offers, never something a click does. */
  const handleTapToggle = useCallback(
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

  /**
   * Declare one creature from the preview.
   *
   * `ATTACK` replaces the whole declaration rather than appending to it, so the
   * existing attackers are re-sent alongside the new one. Re-tapping something
   * already tapped is a no-op in the reducer, so this is safe to repeat.
   */
  const handleAttackOne = useCallback(
    (card: CardInstance, defenderPlayerId: PlayerId) => {
      if (!state) return;
      const existing = state.combat.attackers
        .filter(d => d.attackerId !== card.instanceId && d.defenderPlayerId)
        .map(d => ({
          attackerId: d.attackerId,
          defenderPlayerId: d.defenderPlayerId as PlayerId,
        }));
      dispatch(
        declareAttack(
          state,
          [...existing, { attackerId: card.instanceId, defenderPlayerId }],
          Date.now()
        )
      );
      setInspectId(null);
    },
    [state, dispatch]
  );

  const handleDeclareBlocks = useCallback(
    (blocks: Array<{ blockerId: string; attackerId: string }>) => {
      dispatch({ type: 'BLOCK', blocks });
    },
    [dispatch]
  );

  const handleMoveZone = useCallback(
    (card: CardInstance, to: Zone) => {
      dispatch({
        type: 'MOVE_ZONE',
        instanceId: card.instanceId,
        to,
        position: to === 'library' ? 'top' : undefined,
      });
      setInspectId(null);
    },
    [dispatch]
  );

  const handleLeave = useCallback(() => {
    setTable(null);
    setView('table');
    setEndingTurn(null);
    setInspectId(null);
    setZoneTarget(null);
    setMenuOpen(false);
    setViewSeatId(null);
    autoOpenedFrom.current = null;
    dismissedCombatOnTurn.current = null;
  }, []);

  /** Look at somebody's board, full screen. Read-only for an opponent. */
  const handleFocusSeat = useCallback((playerId: PlayerId) => {
    setViewSeatId(playerId);
    setInspectId(null);
    setMenuOpen(false);
    setZoneTarget(null);
    autoOpenedFrom.current = null;
    setView('view');
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
      if (next === 'view' && state && !viewSeatId) {
        const firstOpponent = state.players.find(p => p.id !== HUMAN_SEAT);
        if (firstOpponent) setViewSeatId(firstOpponent.id);
      }
      setView(next);
    },
    [view, state, viewSeatId]
  );

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

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

  /* The card in the preview is looked up fresh on every render, so tapping it
     or moving it between zones updates the panel rather than freezing it. */
  const inspected = inspectId ? state.cards[inspectId] ?? null : null;
  const railContent =
    inspected !== null ? 'inspect' : zoneTarget !== null ? 'zone' : menuOpen ? 'menu' : null;
  const railWidth = railWidthFor(viewport.width);

  const focusedSeat = view === 'hand' ? HUMAN_SEAT : view === 'view' ? viewSeatId : null;

  const hand = handMetrics(viewport.height, handCardWidth, view === 'hand');
  const spotlightWidth = Math.round(
    Math.min(300, Math.max(180, (viewport.width - (railContent ? railWidth : 0)) * 0.19))
  );

  const showHand = view === 'table' || view === 'hand';
  const seatVariants = seatingVariants(state.players.length).map(layout => layout.variant);

  return (
    // Fixed, not laid out: the table takes the viewport and the app's rail and
    // top bar go away for the duration, the same trade `/life` makes. The z
    // index clears the shell (rail 40, top bar 50) while staying under the
    // portals that toasts render into.
    <div className="fixed inset-0 z-50 flex overflow-hidden bg-background">
      {/* The board. It narrows when the rail opens rather than being covered. */}
      <div className="relative min-h-0 min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={viewMotion.initial}
            animate={viewMotion.animate}
            exit={viewMotion.exit}
            transition={transition}
            className="absolute inset-0 z-0"
          >
            {view !== 'combat' ? (
              <div className="relative h-full w-full">
                <PlayTable
                  className="h-full w-full"
                  state={state}
                  viewerPlayerId={HUMAN_SEAT}
                  botPlayerIds={botPlayerIds}
                  variant={variant}
                  focusPlayerId={focusedSeat}
                  cardWidth={boardCardWidth}
                  bottomInset={showHand ? hand.inset : 0}
                  topInset={HUD_INSET}
                  onInspect={card => setInspectId(card.instanceId)}
                  onOpenZone={(playerId, zone) => {
                    setInspectId(null);
                    setMenuOpen(false);
                    setZoneTarget({ playerId, zone });
                  }}
                  onFocusSeat={handleFocusSeat}
                  attackerIds={attackerIds}
                  blockerIds={blockerIds}
                  inspectedId={inspectId}
                  lifeDeltas={lifeDeltas}
                />

                <CastSpotlight state={state} entry={spotlight} width={spotlightWidth} />

                {/* Your hand, held over the near edge of the table. Clicking a
                    card opens the preview; it never plays it. */}
                {showHand && (
                  <ViewerHand
                    className="absolute inset-x-0 bottom-2 z-30"
                    state={state}
                    viewerPlayerId={HUMAN_SEAT}
                    freeCast={freeCast}
                    cardWidth={hand.cardWidth}
                    selectedId={inspectId}
                    onInspect={card => setInspectId(card.instanceId)}
                  />
                )}
              </div>
            ) : (
              <div
                className="h-full overflow-y-auto px-2 pb-2 md:px-4"
                style={{ paddingTop: HUD_INSET + 8 }}
              >
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

        {/* The log, as a feed over the board rather than a column beside it.
            It sits in the strip the hand is held over, not on a mat: every
            square inch of the four quadrants belongs to somebody's board, and
            the row along the bottom edge of the near seats is their creature
            row — the one row nobody can afford to have a log sitting on. */}
        <div className="pointer-events-none absolute bottom-2 left-2 z-40 w-56 max-w-[36vw]">
          <GameFeed state={state} feed={feed} variant="feed" />
        </div>

        {/* Whose turn it is, said out loud for a beat. */}
        <TurnBanner state={state} viewerPlayerId={HUMAN_SEAT} />

        {state.status === 'complete' && (
          <div
            className="pointer-events-none absolute inset-x-0 z-[60] flex justify-center"
            style={{ top: HUD_INSET + 16 }}
          >
            <div className="pointer-events-auto rounded-2xl bg-background/85 px-6 py-4 text-center shadow-2xl shadow-black/70 backdrop-blur-md">
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

      {/* The rail: preview, zone, menu. Part of the board, never on top of it. */}
      {railContent && (
        <BoardRail width={railWidth} topInset={HUD_INSET}>
          {railContent === 'inspect' && inspected && (
            <CardInspector
              state={state}
              viewerPlayerId={HUMAN_SEAT}
              card={inspected}
              freeCast={freeCast}
              onCast={handleCast}
              onPlayLand={handlePlayLand}
              onTapToggle={handleTapToggle}
              onAttack={handleAttackOne}
              onMoveZone={handleMoveZone}
              onFocusSeat={handleFocusSeat}
              onClose={() => setInspectId(null)}
            />
          )}

          {railContent === 'zone' && zoneTarget && (
            <ZonePanel
              state={state}
              playerId={zoneTarget.playerId}
              zone={zoneTarget.zone}
              viewerPlayerId={HUMAN_SEAT}
              onInspect={card => setInspectId(card.instanceId)}
              onZoneChange={zone => setZoneTarget(target => (target ? { ...target, zone } : null))}
              onClose={() => setZoneTarget(null)}
            />
          )}

          {railContent === 'menu' && (
            <GameMenu
              boardCardWidth={boardCardWidth}
              onBoardCardWidth={setBoardCardWidth}
              handCardWidth={handCardWidth}
              onHandCardWidth={setHandCardWidth}
              autoAdvance={autoAdvance}
              onToggleAuto={() => setAutoAdvance(value => !value)}
              botsPaused={botsPaused}
              onToggleBots={() => setBotsPaused(paused => !paused)}
              freeCast={freeCast}
              onToggleFreeCast={() => setFreeCast(value => !value)}
              variant={variant}
              variants={seatVariants}
              onVariant={setVariant}
              onMulligan={handleMulligan}
              onLeave={handleLeave}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </BoardRail>
      )}

      {/* The HUD floats over the table; the board is inset to make room. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50">
        <PlayHUD
          state={state}
          view={view}
          onViewChange={changeView}
          viewerPlayerId={HUMAN_SEAT}
          combatLive={combatLive}
          botThinking={botThinking}
          onOpenMenu={() => {
            setMenuOpen(open => !open);
            setInspectId(null);
            setZoneTarget(null);
          }}
          menuOpen={menuOpen}
          viewSeatId={viewSeatId}
          onViewSeat={handleFocusSeat}
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
    </div>
  );
}
