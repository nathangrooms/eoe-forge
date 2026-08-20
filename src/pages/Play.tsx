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
import { Loader2 } from 'lucide-react';
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
import {
  PlaySetup,
  playerCountFor,
  startLabelFor,
  type PlaySetupValue,
} from '@/components/play/PlaySetup';
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
import { ManualDuties } from '@/components/play/ManualDuties';
import { CommanderChoiceBar } from '@/components/play/CommanderChoiceBar';
import { MulliganBar } from '@/components/play/MulliganBar';
import { StackStrip } from '@/components/play/StackStrip';
import { ZoneTravelLayer } from '@/components/play/ZoneTravelLayer';
import { GameMenu } from '@/components/play/GameMenu';
import { useCastSpotlight, useLifeDeltas } from '@/components/play/useTableMotion';
import { canReachCombat, controlsFlow, decisionFor, flowActions } from '@/components/play/turnFlow';
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
  bottomActions,
  botMulliganActions,
  cardsToBottom,
  castTiming,
  commanderZoneOffers,
  declareAttack,
  manualDutiesFor,
  mulliganActions,
  planCastFromHand,
  planLandDrop,
  responseOptions,
  seatingVariants,
  spellToAnswer,
  stackOf,
  type BotOptions,
  type BuiltTable,
  type CardInstance,
  type GameAction,
  type InstanceId,
  type PlayDeck,
  type ResponseOption,
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

  /**
   * The opening hand, before the game is allowed to start.
   *
   * Null once the hand is kept. While it is set, nothing advances: no
   * auto-walk, no bot timer, no first untap. That is the whole reason this
   * lives here rather than in a component — a mulligan offered while turn one
   * is already running is not a mulligan.
   *
   * `bottoming` is the second half of the London rule: after N mulligans the
   * player picks N cards out of the seven to put back, and until they have
   * picked exactly N there is nothing to confirm.
   */
  const [opening, setOpening] = useState<{
    taken: number;
    bottoming: boolean;
    chosen: string[];
  } | null>(null);

  /**
   * Manual duties the player has waved away for this step.
   *
   * Keyed by turn and step rather than by a bare flag: an upkeep trigger comes
   * round again every turn, and a dismissal that outlived its own step would
   * silently reintroduce the exact bug the strip exists to fix.
   */
  const [dutiesDismissed, setDutiesDismissed] = useState<string | null>(null);

  /**
   * CR 903.9a offers this seat has answered by leaving the commander where it
   * is, keyed by card and by `zoneChangeCounter`.
   *
   * The counter is what makes "leave it" a decision rather than a permanent
   * silence: a commander that dies, is left in the graveyard, is reanimated and
   * then dies AGAIN is a new object under CR 400.7, so the question is asked
   * again. A bare instance id would have swallowed the second death.
   */
  const [zoneChoiceLeft, setZoneChoiceLeft] = useState<readonly string[]>([]);

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
    /* The bot timer is held for the opening hand as well as for the menu
       toggle. A bot that untaps and draws while the player is still deciding
       whether to keep has already started the game without them. */
    botsPaused: botsPaused || opening !== null,
    /* `/play` runs the priority round, so the bot may use the stack: it
       announces its spells onto it, passes priority, and counters when it is
       holding an answer it can pay for. */
    useStack: true,
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

      /* Every bot answers its own opening hand before the table is handed to
         the page, so the first thing the human sees is a settled board with
         only their own decision left on it. Folded into the dealt state rather
         than dispatched afterwards, because a bot mulliganing on turn one would
         be both a rules violation and a thing that looks like a bug. */
      const dealt: BuiltTable = {
        ...built,
        state: applyActions(
          built.state,
          botMulliganActions(built.state, built.botPlayerIds, Date.now())
        ),
      };

      setVariant(setup.variant);
      setView('table');
      setOpening({ taken: 0, bottoming: false, chosen: [] });
      setDutiesDismissed(null);
      setEndingTurn(null);
      setInspectId(null);
      setZoneTarget(null);
      setMenuOpen(false);
      setViewSeatId(null);
      autoOpenedFrom.current = null;
      dismissedCombatOnTurn.current = null;
      setTable(dealt);

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
    () => ({ aggression: setup.aggression, waitForPlayerIds: [HUMAN_SEAT], useStack: true }),
    [setup.aggression]
  );

  /**
   * Things going off this step that the engine will not resolve, on this seat's
   * own board. Empty on almost every step of almost every game.
   */
  const duties = useMemo(
    () => (state ? manualDutiesFor(state, HUMAN_SEAT) : []),
    [state]
  );

  /** The step the duty strip was waved away on, so a dismissal cannot outlive it. */
  const dutyKey = state ? `${state.turn}:${state.step}` : null;
  const dutiesShowing = duties.length > 0 && dutiesDismissed !== dutyKey;

  /**
   * CR 903.9a — this seat's commanders sitting in a graveyard or exile.
   *
   * Empty on almost every frame of almost every game, and the one frame it is
   * not empty is the one that used to lose a player their commander for good.
   * The engine answers this for nobody: `commanderZoneOffers` returns the offer
   * and the sentence, and the choice is made here or by the bot's own policy.
   */
  const commanderOffers = useMemo(
    () => (state ? commanderZoneOffers(state, HUMAN_SEAT) : []),
    [state]
  );

  /** One offer, one object. See `zoneChoiceLeft`. */
  const zoneChoiceKey = (offer: { instanceId: string }): string => {
    const card = state?.cards[offer.instanceId];
    return `${offer.instanceId}:${card?.zoneChangeCounter ?? 0}`;
  };
  const commanderChoices = commanderOffers.filter(
    offer => !zoneChoiceLeft.includes(zoneChoiceKey(offer))
  );
  const commanderChoiceShowing = commanderChoices.length > 0;

  /**
   * The decision this seat owes the table, or null while the game can flow.
   *
   * `decisionFor` reports a manual duty as a decision, which is what stops the
   * 130 ms auto-walk from running the upkeep out from under a player who has an
   * Aether Vial to click. Waving the strip away has to release that stop, and
   * the engine cannot know it was waved away, so the release happens here.
   */
  const decision = useMemo(() => {
    if (!state) return null;
    const owed = decisionFor(state, HUMAN_SEAT, { freeCast });
    if (owed === 'manual' && !dutiesShowing) {
      // Fall through to whatever the step would otherwise have asked for, which
      // in an upkeep or an end step is nothing.
      return null;
    }
    return owed;
  }, [state, freeCast, dutiesShowing]);

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
    (card: CardInstance, hostId?: InstanceId) => {
      if (!state || opening !== null) return;
      /*
       * Onto the STACK, not straight onto the battlefield.
       *
       * This is the change that makes an instant worth holding. A cast that
       * lands immediately can never be answered, which is why the owner
       * reported that counterspells "dont work at all" — the engine's whole
       * stack was correct and had never been reached, because nothing outside
       * `src/lib/game` had ever built a `CAST_SPELL`. The spell now sits there
       * with its caster holding priority, and it reaches the battlefield or the
       * graveyard only once every living player has passed.
       */
      /* WHEN, before whether it is paid for. `cardActions.ts` already refuses
         to draw the button, and this is the second lock on the same door: the
         board moves under a preview that is already open, so the state the
         button was drawn against is not always the state the press lands in. */
      const timing = castTiming(state, HUMAN_SEAT, card);
      if (!timing.ok) {
        toast.error(timing.reason);
        return;
      }
      const plan = planCastFromHand(state, HUMAN_SEAT, card.instanceId, {
        ignoreMana: freeCast,
        viaStack: true,
        // CR 601.2c - an Aura names what it enchants as part of being cast. The
        // preview asks and hands the answer back here; without one the plan
        // refuses and says so, rather than putting an Aura onto the battlefield
        // attached to nothing for CR 704.5m to bin.
        ...(hostId ? { hostId } : {}),
      });
      if (!plan.ok) {
        toast.error(plan.reason);
        return;
      }
      dispatch(plan.actions);
      setInspectId(null);
    },
    [state, dispatch, freeCast, opening]
  );

  /* ---------------------------------------------------------------------- */
  /* Priority                                                               */
  /* ---------------------------------------------------------------------- */

  /** Answer the spell on the stack with one of your own. */
  const handleRespond = useCallback(
    (option: ResponseOption) => {
      if (!state) return;
      const answering = spellToAnswer(state, HUMAN_SEAT);
      const plan = planCastFromHand(state, HUMAN_SEAT, option.card.instanceId, {
        ignoreMana: freeCast,
        viaStack: true,
        // Only a card that actually counters gets the target and the effect.
        // Anything else is a response that resolves as itself.
        counterStackId: option.counters && answering ? answering.stackId : undefined,
      });
      if (!plan.ok) {
        toast.error(plan.reason);
        return;
      }
      dispatch(plan.actions);
      setInspectId(null);
    },
    [state, dispatch, freeCast]
  );

  /** Let the top of the stack resolve. The engine derives what that causes. */
  const handlePassPriority = useCallback(() => {
    if (!state) return;
    dispatch([{ type: 'PASS_PRIORITY', playerId: HUMAN_SEAT, at: Date.now() }]);
  }, [state, dispatch]);

  const handlePlayLand = useCallback(
    (card: CardInstance) => {
      if (!state || opening !== null) return;
      const plan = planLandDrop(state, HUMAN_SEAT, card.instanceId);
      if (!plan.ok) {
        toast.error(plan.reason);
        return;
      }
      dispatch(plan.actions);
      setInspectId(null);
    },
    [state, dispatch, opening]
  );

  /* ---------------------------------------------------------------------- */
  /* The opening hand                                                       */
  /* ---------------------------------------------------------------------- */

  const handleMulligan = useCallback(() => {
    if (!state) return;
    const actions = mulliganActions(state, HUMAN_SEAT, Date.now());
    if (actions.length === 0) return;
    dispatch(actions);
    setInspectId(null);
    // The count is what the bottoming step is priced from, so it goes up here
    // and nowhere else.
    setOpening(current =>
      current
        ? { taken: current.taken + 1, bottoming: false, chosen: [] }
        : { taken: 1, bottoming: false, chosen: [] }
    );
  }, [state, dispatch]);

  /**
   * Keep. A first hand starts the game; anything after that owes the bottom of
   * the library one card per mulligan taken, and the player picks which.
   */
  const handleKeep = useCallback(() => {
    if (!state) return;
    const hand = state.players.find(p => p.id === HUMAN_SEAT)?.zones.hand ?? [];
    const owed = cardsToBottom(opening?.taken ?? 0, hand.length);
    if (owed === 0) {
      setOpening(null);
      return;
    }
    setInspectId(null);
    setOpening(current => (current ? { ...current, bottoming: true, chosen: [] } : null));
  }, [state, opening]);

  /**
   * The playtest redraw in the game menu.
   *
   * Shuffles back and deals a fresh seven, and deliberately does NOT open the
   * opening-hand flow: mid-game that would pause a running table and demand a
   * bottoming step for a mulligan nobody took. It is a goldfishing tool, and it
   * is labelled as one.
   */
  const handleRedraw = useCallback(() => {
    if (!state) return;
    const actions = mulliganActions(state, HUMAN_SEAT, Date.now());
    if (actions.length === 0) return;
    dispatch(actions);
    setInspectId(null);
  }, [state, dispatch]);

  /** Pick, or unpick, one card for the bottom. */
  const handleChooseBottom = useCallback((instanceId: string) => {
    setOpening(current => {
      if (!current || !current.bottoming) return current;
      const chosen = current.chosen.includes(instanceId)
        ? current.chosen.filter(id => id !== instanceId)
        : [...current.chosen, instanceId];
      return { ...current, chosen };
    });
  }, []);

  const handleConfirmBottom = useCallback(() => {
    if (!state || !opening) return;
    const hand = state.players.find(p => p.id === HUMAN_SEAT)?.zones.hand ?? [];
    const owed = cardsToBottom(opening.taken, hand.length);
    if (opening.chosen.length !== owed) return;
    dispatch(bottomActions(opening.chosen, Date.now()));
    setOpening(null);
  }, [state, opening, dispatch]);

  /** Tapping is an action the preview offers, never something a click does. */
  const handleTapToggle = useCallback(
    (card: CardInstance) => {
      if (!state || opening !== null) return;
      if (card.zone !== 'battlefield') return;
      if (card.controllerId !== HUMAN_SEAT) return;
      dispatch({ type: card.tapped ? 'UNTAP' : 'TAP', instanceId: card.instanceId });
    },
    [state, dispatch, opening]
  );

  /**
   * The one "next" press.
   *
   * `flowActions`, not `advanceActions`, because there are two different next
   * presses and picking the wrong one hangs the game: with something on the
   * stack, next is a pass, and only an empty stack advances a step.
   */
  const handleAdvance = useCallback(() => {
    if (!state) return;
    const actions = flowActions(state, HUMAN_SEAT, Date.now());
    if (actions.length > 0) dispatch(actions);
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
    setOpening(null);
    setDutiesDismissed(null);
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

    // Nothing at all moves until the opening hand is settled. Not the walk, not
    // the bots (held in `usePlayGame` above), not the first untap.
    if (opening !== null) return;

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

    const timer = window.setTimeout(() => {
      const actions = flowActions(state, HUMAN_SEAT, Date.now());
      if (actions.length > 0) dispatch(actions);
    }, forcing ? END_TURN_STEP_MS : AUTO_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [state, opening, endingTurn, autoAdvance, botsPaused, decision, othersPending, dispatch]);

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
        /* The one thing this page is for, where a primary action belongs.
           It used to be a full width bar under a tall setup panel. */
        action={
          <Button size="lg" onClick={startGame} disabled={starting}>
            {starting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Shuffling up…
              </>
            ) : (
              startLabelFor(setup)
            )}
          </Button>
        }
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
  /** True while the player is picking which cards go to the bottom. */
  const bottoming = opening?.bottoming === true;
  /* The stack, and what this seat could do about it. Both empty on almost
     every frame; when they are not, the strip below is the whole answer to
     "no opportunity to use instants to counter a spell". */
  const stack = stackOf(state);
  const yourPriority = state.priorityPlayerId === HUMAN_SEAT;
  const responses =
    stack.length > 0 && yourPriority ? responseOptions(state, HUMAN_SEAT, { freeCast }) : [];
  const openingOwed = opening
    ? cardsToBottom(
        opening.taken,
        state.players.find(p => p.id === HUMAN_SEAT)?.zones.hand.length ?? 0
      )
    : 0;
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
                    selectedId={bottoming ? null : inspectId}
                    markedIds={bottoming ? opening?.chosen : undefined}
                    /* During the bottoming step a click PICKS the card rather
                       than previewing it: the question on screen is "which two
                       go back", and opening a preview instead would answer a
                       question nobody asked. */
                    onInspect={
                      bottoming
                        ? card => handleChooseBottom(card.instanceId)
                        : card => setInspectId(card.instanceId)
                    }
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
        {/* No width here: the feed is 224px collapsed and about 480px open, and
            it has to be able to say so itself. The wrapper used to pin it to
            `w-56`, which is why the opened panel truncated 31 of 200 lines. */}
        <div className="pointer-events-none absolute bottom-2 left-2 z-40 max-w-[46vw]">
          <GameFeed state={state} feed={feed} variant="feed" />
        </div>

        {/* Whose turn it is, said out loud for a beat. */}
        <TurnBanner state={state} viewerPlayerId={HUMAN_SEAT} />

        {/*
          The opening hand, and the things the engine will not do for you.

          Both live in the same band under the HUD, both are made of the mat's
          own material, and neither covers a seat's board or takes the screen.
          They are mutually exclusive in practice: the mulligan is answered
          before the first untap, and a duty cannot arrive until an upkeep.
        */}
        {(opening !== null || dutiesShowing || commanderChoiceShowing || stack.length > 0) && (
          <div
            className="pointer-events-none absolute inset-x-0 z-[45] flex justify-center px-2"
            style={{ top: HUD_INSET + 8 }}
          >
            {opening !== null ? (
              <MulliganBar
                taken={opening.taken}
                handSize={state.players.find(p => p.id === HUMAN_SEAT)?.zones.hand.length ?? 0}
                chosen={opening.chosen.length}
                owed={openingOwed}
                bottoming={bottoming}
                onMulligan={handleMulligan}
                onKeep={handleKeep}
                onConfirmBottom={handleConfirmBottom}
              />
            ) : stack.length > 0 ? (
              <StackStrip
                state={state}
                viewerPlayerId={HUMAN_SEAT}
                stack={stack}
                responses={responses}
                yourPriority={yourPriority}
                onRespond={handleRespond}
                onPass={handlePassPriority}
              />
            ) : commanderChoiceShowing ? (
              /* Above the duty strip, and it earns that: a duty comes round
                 again next upkeep, while a commander left in a graveyard is
                 gone until somebody remembers it is there. */
              <CommanderChoiceBar
                offers={commanderChoices}
                onTake={actions => dispatch(actions)}
                onOpen={instanceId => setInspectId(instanceId)}
                onDismiss={() =>
                  setZoneChoiceLeft(commanderChoices.map(offer => zoneChoiceKey(offer)))
                }
              />
            ) : (
              <ManualDuties
                duties={duties}
                onOpen={instanceId => setInspectId(instanceId)}
                onDismiss={() => setDutiesDismissed(dutyKey)}
              />
            )}
          </div>
        )}

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
            /* The by-hand controls send raw batches. `manual.ts` already binds
               each control to the actions it produces, so the page only has to
               be able to dispatch one. */
            onDispatch={dispatch}
            /* Read your seven, do not play one. Judging the opening hand is the
               whole decision, so the card stays large; the plays wait until it
               is kept. */
            holdReason={
              opening !== null
                ? bottoming
                  ? 'Choose which cards go to the bottom first.'
                  : 'Keep this hand or mulligan it before you start playing.'
                : undefined
            }
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
              onMulligan={handleRedraw}
              onLeave={handleLeave}
              onClose={() => setMenuOpen(false)}
              /* So the playmat previews are tinted the way this seat will be,
                 rather than showing six charcoal rectangles. */
              viewerColors={
                state.players.find(p => p.id === HUMAN_SEAT)?.commanders[0]?.colorIdentity
              }
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
