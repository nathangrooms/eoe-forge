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
 * Click → preview IN THE CENTRE → act or close
 * ---------------------------------------------------------------------------
 * Owner: *"Most important thing on play mode though, just so you dont forget,
 * is being able to click and preview your card, then select a button action or
 * close."* And then, once it existed but in the wrong place: *"I just clicked a
 * card and it didnt show in centre, still using right menu??"*
 *
 * A tap is never the action. Clicking a card anywhere — hand, battlefield, a
 * graveyard, an opponent's board — sets `inspectId` and nothing else happens.
 * `CenterPreview` then draws that card in the MIDDLE of the mat at the largest
 * readable size, with the real actions for that card in that zone in a row
 * BENEATH it, and only a button dispatches.
 *
 * The spec amendment of 19 Aug 2026 separates two things that had been
 * conflated. Clicking a card is a DECISION, so it takes the centre of the
 * table. A card being CAST is an ANNOUNCEMENT, so `CastSpotlight` keeps the
 * right edge, where play can continue around it. Both are still on the mat:
 * no dialog, no portal, no backdrop, nothing covered.
 *
 * `BoardRail` therefore no longer takes card clicks. It keeps the two jobs that
 * are about browsing rather than deciding — the contents of a zone, and the
 * game menu — and the board narrows for those exactly as before.
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
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useCardSize } from '@/components/cards/CardSizeSlider';
import {
  BOARD_CARD_DEFAULT,
  FEED_INSET,
  HAND_CARD_DEFAULT,
  HUD_INSET,
  handMetrics,
} from '@/components/play/tableMetrics';

import { PlayHUD, type PlayViewId } from '@/components/play/PlayHUD';
import { PlaySetup, playerCountFor, type PlaySetupValue } from '@/components/play/PlaySetup';
import { PlayTable } from '@/components/play/PlayTable';
import { ViewerHand } from '@/components/play/ViewerHand';
import { CastSpotlight } from '@/components/play/CastSpotlight';
import { CombatView, combatIsLive } from '@/components/play/CombatView';
import { GameFeed } from '@/components/play/GameFeed';
import { TurnBanner } from '@/components/play/TurnBanner';
import { ZonePanel } from '@/components/play/ZonePanel';
import { BoardRail, railWidthFor } from '@/components/play/BoardRail';
import { Playmat } from '@/components/play/Playmat';
import { CenterPreview } from '@/components/play/CenterPreview';
import { ZoneTravelLayer } from '@/components/play/ZoneTravelLayer';
import { GameMenu } from '@/components/play/GameMenu';
import { useCastSpotlight, useLifeDeltas } from '@/components/play/useTableMotion';
import { canReachCombat, controlsFlow, decisionFor } from '@/components/play/turnFlow';
import { defaultSeatingFor } from '@/components/play/seatingDefaults';

import { usePlayGame } from '@/hooks/usePlayGame';
import {
  listPlayableDecks,
  resolveDeckDetailed,
  type DeckSummary,
} from '@/lib/play/deckSource';
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

/* The insets, the starting card sizes and the hand arithmetic all live in
   `tableMetrics.ts`. They used to live here, and a second copy with different
   numbers lived in `WatchedTable.tsx`, so the playtest that exists to TEST this
   screen laid its hand out differently from it. One copy, in a `.ts` the test
   runner can reach. See `tableMetrics.test.ts`. */

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
    mode: 'bots',
    deckId: null,
    opponents: [{ deckId: null }],
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
      const summaryFor = (deckId: string | null) =>
        deckId ? decks.find(deck => deck.id === deckId) ?? null : null;

      const playerCount = playerCountFor(setup);

      /* Every seat resolves the same way, and every seat says what it landed
         on. `resolveDeckDetailed` returns a notice when it could not deal the
         deck that was asked for — the owner reported the silent version of this
         as "it just plays a demo deck", and the only trace used to be a
         console.warn nobody had open. */
      const mine = await resolveDeckDetailed(summaryFor(setup.deckId), {
        seed: setup.seed,
        name: 'Seeded commander deck',
      });

      const notices: string[] = [];
      if (mine.notice) notices.push(mine.notice);

      const opponents: PlayDeck[] = [];
      for (let i = 0; i < playerCount - 1; i++) {
        // Distinct seeds so a three-way pod is not three copies of one deck.
        const seat = await resolveDeckDetailed(summaryFor(setup.opponents[i]?.deckId ?? null), {
          seed: setup.seed + (i + 1) * 977,
        });
        if (seat.notice) notices.push(`Opponent ${i + 1}: ${seat.notice}`);
        opponents.push(seat.deck);
      }

      const myDeck = mine.deck;

      const built = buildTable({
        id: `play-${setup.seed}-${playerCount}-${Date.now()}`,
        seed: setup.seed,
        now: Date.now(),
        format: myDeck.format,
        seats: [
          {
            deck: myDeck,
            playerName: user?.email ? user.email.split('@')[0] : 'You',
            playerId: HUMAN_SEAT,
          },
          ...opponents.map((deck, index) => ({
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

      // A substitution is an error the player has to know about, not an aside.
      for (const notice of notices) toast.warning(notice, { duration: 9000 });

      if (notices.length === 0 && myDeck.source === 'seeded' && !setup.deckId) {
        toast.info(`Seeded deck: ${myDeck.name}.`);
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

  /**
   * Put one creature in front of one attacker, from the preview.
   *
   * The mirror of `handleAttackOne`, with one difference that comes straight
   * from the reducer: `BLOCK` *appends* to `blockedBy` where `ATTACK` replaces
   * the declaration, so this sends only the new pairing. `CardInspector` will
   * not offer a creature that is already blocking, which is what keeps the same
   * body out of two lanes.
   */
  const handleBlockOne = useCallback(
    (card: CardInstance, attackerId: string) => {
      dispatch({ type: 'BLOCK', blocks: [{ blockerId: card.instanceId, attackerId }] });
      setInspectId(null);
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
        {/*
          There is deliberately NO overlay here.

          This used to render `fixed inset-0 ... bg-background/70` with a
          spinner in it while the decks were being resolved: a dimmed,
          full-screen, click-eating backdrop, which is the one thing play mode
          is not allowed to have. It also bought nothing. `PlaySetup` already
          disables its start button and turns it into "Shuffling up…" with a
          spinner in the button itself, which is where the reader is already
          looking, so the overlay dimmed the whole page to repeat a message
          that was six pixels away.

          It survived this long because the screenshot harness cannot see it:
          `scripts/play-preview-shots.mjs` skips any full-screen candidate whose
          class list contains the string `bg-background`, to let the immersive
          board's own opaque `bg-background` root through, and `bg-background/70`
          contains that string too. Measured with that exemption removed, it was
          the only full-screen dimmer left in either surface.
        */}
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
  /* The rail no longer holds the card preview — that is the centre of the mat
     now. What is left in it is the two things that are about BROWSING rather
     than deciding, and they can be open at the same time as a preview. */
  const railContent = zoneTarget !== null ? 'zone' : menuOpen ? 'menu' : null;
  const railWidth = railWidthFor(viewport.width);
  /* The board's own box, which the centre preview sizes itself against. It is
     the viewport minus the rail when the rail is open, minus the HUD along the
     top and the hand along the bottom — the mat you can actually see. */
  const boardWidth = viewport.width - (railContent ? railWidth : 0);
  const boardHeight = viewport.height;

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
                  bottomInset={showHand ? hand.inset : FEED_INSET}
                  topInset={HUD_INSET}
                  onInspect={card => setInspectId(card.instanceId)}
                  /* Tap, straight from the permanent. Owner: *"tapping should
                     be easy on card."* It opens nothing, so tapping five lands
                     is five taps rather than five trips through the rail. */
                  onTapCard={handleTapToggle}
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
              /* Combat owns its own insets rather than sitting in a padded box:
                 it measures the room it has and sizes its cards from that, the
                 same bargain every mat on the table makes. */
              <CombatView
                className="h-full w-full"
                state={state}
                viewerPlayerId={HUMAN_SEAT}
                botPlayerIds={botPlayerIds}
                onInspect={card => setInspectId(card.instanceId)}
                inspectedId={inspectId}
                onAdvance={handleAdvance}
                topInset={HUD_INSET}
                bottomInset={FEED_INSET}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* The log, as a feed over the board rather than a column beside it.
            Every square inch of the four quadrants belongs to somebody's board,
            and the row along the bottom edge of the near seats is their creature
            row — the one row nobody can afford to have a log sitting on. So the
            feed lives in the reserved strip along the bottom edge: shared with
            the hand on the table, kept clear by `FEED_INSET` in the two views
            that have no hand, where it used to land squarely on the focused
            seat's command zone. */}
        <div className="pointer-events-none absolute bottom-2 left-2 z-40 w-56 max-w-[36vw]">
          <GameFeed state={state} feed={feed} variant="feed" />
        </div>

        {/* Whose turn it is, said out loud for a beat. */}
        <TurnBanner state={state} viewerPlayerId={HUMAN_SEAT} />

        {/*
          The result, drawn INTO the mat.

          This used to be a centred panel on `bg-background/85` with
          `backdrop-blur-md` behind it — a translucent sheet of chrome smearing
          the board it was sitting on, which is a modal in everything but name
          and a breach of the no-modals rule the rest of this screen keeps. It
          is now a banner made of the same `Playmat` material as the table,
          opaque, in the band the combat strip uses, blurring nothing and
          covering no seat's board. The final position of the game stays
          readable underneath it, which is the thing a player wants to look at
          when a game ends.
        */}
        {state.status === 'complete' && (
          <div
            /* Above the centre preview rather than beside it in the stack: a
               game that has ended is the one thing on this screen that outranks
               whatever card you were in the middle of reading. */
            className="pointer-events-none absolute inset-x-0 z-[46] flex justify-center px-2"
            style={{ top: HUD_INSET + 8 }}
          >
            <div className="pointer-events-auto relative flex items-center gap-4 overflow-hidden rounded-xl px-5 py-3 shadow-[0_18px_46px_rgba(0,0,0,0.7)]">
              <Playmat tone="board" rounded="rounded-xl" className="absolute inset-0 h-full w-full" />
              <p className="relative text-base font-semibold text-foreground">
                {/* The viewer's seat is called "You", so the winner line has to
                    agree with it or it reads "You wins." */}
                {state.winnerIds.length === 0
                  ? 'The game is a draw.'
                  : state.winnerIds[0] === HUMAN_SEAT
                    ? 'You win.'
                    : `${state.players.find(p => p.id === state.winnerIds[0])?.name} wins.`}
              </p>
              <Button size="sm" className="relative h-8 text-xs" onClick={handleLeave}>
                Set up another game
              </Button>
            </div>
          </div>
        )}

        {/*
          THE CENTRE PREVIEW.

          Inside the board's own box, so it is centred on the playmat surface
          rather than on the window, and so it moves with the board when the
          rail opens. No backdrop, no portal, no dimming: the wrapper is
          `pointer-events-none` and only the panel itself takes clicks, which is
          what leaves every control on the table live underneath it.
        */}
        {inspected && (
          <CenterPreview
            state={state}
            viewerPlayerId={HUMAN_SEAT}
            card={inspected}
            freeCast={freeCast}
            boardWidth={boardWidth}
            boardHeight={boardHeight}
            topInset={HUD_INSET}
            bottomInset={showHand ? hand.inset : FEED_INSET}
            onCast={handleCast}
            onPlayLand={handlePlayLand}
            onTapToggle={handleTapToggle}
            onAttack={handleAttackOne}
            onBlock={handleBlockOne}
            onMoveZone={handleMoveZone}
            onFocusSeat={handleFocusSeat}
            onClose={() => setInspectId(null)}
          />
        )}
      </div>

      {/* The rail: a zone's contents, or the game menu. Part of the board, never
          on top of it. The card preview left for the centre of the mat. */}
      {railContent && (
        <BoardRail width={railWidth} topInset={HUD_INSET}>
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

      {/*
        Cards changing zones, seen to change zones.

        Spec: *"A card moving zones should travel from where it was to where it
        is going. The movement IS the feedback."* It is a sheet of ghosts over
        everything, it takes no clicks and it gates nothing — the reducer
        committed before it started drawing, so a player clicking straight
        through never waits on it.
      */}
      <ZoneTravelLayer state={state} viewerPlayerId={HUMAN_SEAT} />

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
