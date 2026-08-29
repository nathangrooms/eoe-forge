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
import { ModeWall } from '@/components/play/ModeWall';
import { FriendsRail } from '@/components/play/FriendsRail';
import { presenceDoing } from '@/components/play/presenceWords';
import { DeckStep } from '@/components/play/DeckStep';
import { SeatStep } from '@/components/play/SeatStep';
import { GoldfishStudy } from '@/components/play/GoldfishStudy';
import { StepBar, StepTitle } from '@/components/play/StepChrome';
import {
  breadcrumbFor,
  forwardLabelFor,
  headingFor,
  startLabelFor,
  type PlayStepId,
} from '@/components/play/playFlow';
import { isPlayMode, modeOf, seatsFor, type PlayModeId } from '@/components/play/playModes';
import { reconcileDeck } from '@/components/play/playDeckView';
import { usePlayDecks, type PlayDeckOption } from '@/components/play/usePlayDecks';
import { WatchedTable } from '@/components/play/WatchedTable';
import { useWatchedGame } from '@/components/play/useWatchedGame';
import { uniqueSeatNames } from '@/components/play/seatNames';
import { PlayTable } from '@/components/play/PlayTable';
import { ViewerHand } from '@/components/play/ViewerHand';
import { CastSpotlight } from '@/components/play/CastSpotlight';
import { combatIsLive } from '@/components/play/combatUi';
import { useCardPrewarm } from '@/components/play/useCardPrewarm';
import { illegalBlockReason } from '@/components/play/combatUi';
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
import { TriggerTargetBar } from '@/components/play/TriggerTargetBar';
import { AimLayer } from '@/components/play/AimLayer';
import { useAimRequest } from '@/components/play/useAiming';
import { ZoneTravelLayer } from '@/components/play/ZoneTravelLayer';
import { GameMenu } from '@/components/play/GameMenu';
import { useCastSpotlight, useLifeDeltas } from '@/components/play/useTableMotion';
import {
  canReachCombat,
  controlsFlow,
  decisionFor,
  flowActions,
  type OpeningStop,
} from '@/components/play/turnFlow';
import { defaultSeatingFor } from '@/components/play/seatingDefaults';

import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { keepPresence, listOpenTables, tablePath } from '@/lib/lobby';
import { usePlayGame } from '@/hooks/usePlayGame';
import { resolveDeckDetailed } from '@/lib/play/deckSource';
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
  abilityResponses,
  responseOptions,
  seatingVariants,
  spellToAnswer,
  stackOf,
  triggerAwaitingTargets,
  type BotOptions,
  type BuiltTable,
  type CardInstance,
  type GameAction,
  type InstanceId,
  type PlayDeck,
  type ResponseOption,
  type PlayerId,
  type StackTarget,
  type SeatingVariant,
  type Zone,
} from '@/lib/game';

const HUMAN_SEAT: PlayerId = 'p1';

/** One stable empty list, so "no decks yet" is not a new value every render. */
const NO_DECKS: PlayDeckOption[] = [];

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
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [starting, setStarting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  /* ---------------------------------------------------------------------- */
  /* The flow: mode, then deck, then the table                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Which step is on screen, and which mode it belongs to.
   *
   * Both live in the URL as well as in state, so back and forward work, a link
   * to `/play?mode=playtest` lands on the right door, and `/simulate?deck=x`
   * can redirect here without losing what it was pointing at. `ModernDeckTile`
   * and `DeckTile` both send people here that way.
   */
  const urlMode = params.get('mode');
  const [mode, setMode] = useState<PlayModeId | null>(() =>
    isPlayMode(urlMode) ? urlMode : null
  );
  const [step, setStep] = useState<PlayStepId>(() => (isPlayMode(urlMode) ? 'deck' : 'mode'));
  /** Which seat the deck wall on step three is filling. */
  const [armedSeat, setArmedSeat] = useState(1);
  /** The opening hand study, which is goldfish's second question. */
  const [studying, setStudying] = useState(false);

  const [setup, setSetup] = useState({
    deckId: params.get('deck'),
    opponents: [{ deckId: null }] as Array<{ deckId: string | null }>,
    variant: defaultSeatingFor(2),
    aggression: 'normal' as 'timid' | 'normal' | 'aggressive',
    seed: 7,
  });

  /**
   * Whether the table on screen is being WATCHED rather than played.
   *
   * Playtest is not a second page and not a second engine. It is this table
   * with every seat flagged `isBot`, so the only thing the page has to hold is
   * which driver is running: `usePlayGame`, which reserves a seat for a human,
   * or `useWatchedGame`, which does not. Everything downstream of that is the
   * same components on the same state.
   */
  const [watching, setWatching] = useState(false);
  const [watchRunning, setWatchRunning] = useState(true);
  const [watchSpeedMs, setWatchSpeedMs] = useState(450);

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

  /*
   * COMBAT NO LONGER HAS A VIEW OF ITS OWN, so there is no view to remember.
   *
   * `autoOpenedFrom` and `dismissedCombatOnTurn` used to exist because reaching
   * declare attackers swapped this page's board for `CombatView`, and something
   * had to hand the board back afterwards. `CombatView` was a second copy of
   * the table — the same `PlayTable` and the same `ViewerHand`, with a thinner
   * set of props — so every turn the game reached combat the player quietly
   * lost their seating choice, the zone tiles stopped opening, the life change
   * animation stopped, free cast was ignored and hand view was dropped. It is
   * gone; combat is declared on the table that is already on screen.
   */

  const { state, dispatch, undo, canUndo, botPlayerIds, botThinking, feed } = usePlayGame({
    /* A watched table is driven by the other hook. `usePlayGame` always
       reserves one seat as the one the bots must wait for, which is correct
       for a game you play and deadlocks a game where every seat is a bot:
       an attacker politely stops at declare blockers for a defender that is
       itself a bot, and nobody moves again. See `useWatchedGame`. */
    table: watching ? null : table,
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

  /* The same table, with nobody to wait for. One of these two hooks is live at
     a time and the other is handed a null table, so there is never a second
     game running behind the one on screen. */
  const watched = useWatchedGame({
    table: watching ? table : null,
    aggression: setup.aggression,
    speedMs: watchSpeedMs,
    running: watchRunning,
  });

  // Presentation-only memory of the previous board: what life changed, and what
  // just left somebody's hand. Neither belongs in game state.
  const lifeDeltas = useLifeDeltas(state);
  const spotlight = useCastSpotlight(state, SPOTLIGHT_MS);

  /* ---------------------------------------------------------------------- */
  /* Deck list                                                              */
  /* ---------------------------------------------------------------------- */

  /* Three batched queries for the whole wall, cached under one key and shared
     with the lobby. See `usePlayDecks` for why this is not one RPC per deck. */
  const deckQuery = usePlayDecks(user?.id);
  /* A module-level empty array, not `?? []`. A fresh literal every render makes
     a new dependency every render, so the effect below and `startGame` would
     both be rebuilt on every keystroke anywhere on the page. */
  const decks = deckQuery.data ?? NO_DECKS;
  const loadingDecks = Boolean(user) && deckQuery.isLoading;

  /* The one live fact on the mode wall, and the reason online leads: how many
     tables are actually waiting. `open_game_tables()` is a single grouped query
     with the seats already aggregated, so this is one round trip and it is only
     asked while step one is on screen. Nothing polls it; the lobby itself is
     the surface that keeps up to date, over a pushed channel. */
  const openTables = useQuery({
    queryKey: ['open-game-tables'],
    queryFn: listOpenTables,
    enabled: Boolean(user?.id) && step === 'mode',
    staleTime: 30_000,
  });
  const onlineLive = !user
    ? undefined
    : openTables.data === undefined
      ? undefined
      : openTables.data.length === 0
        ? 'No tables waiting right now'
        : `${openTables.data.length} table${openTables.data.length === 1 ? '' : 's'} waiting`;

  /* ---------------------------------------------------------------------- */
  /* Saying you are around                                                  */
  /* ---------------------------------------------------------------------- */

  /*
   * One row, overwritten, every 90 seconds, and ONLY while this tab is being
   * looked at. See `src/lib/lobby/presence.ts` for why this is a write rather
   * than a Realtime presence channel: presence on a shared channel would tell
   * every signed-in account who else is online, and no policy could stop it.
   *
   * It writes nothing at all when the reader has "when I am around" turned off,
   * so that switch costs the database as well as the interface.
   */
  const doing = presenceDoing(table ? 'playing' : step, mode);
  useEffect(() => {
    if (!user) return;
    return keepPresence({ doing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, doing]);

  /* The deck that is actually chosen, once the list has arrived: whatever the
     URL asked for if this mode can deal it, else the first one that can be
     dealt. Nothing is chosen for a reader who has not picked a mode yet, so
     landing on step one does not silently commit a deck. */
  useEffect(() => {
    if (!mode || decks.length === 0) return;
    setSetup(previous => {
      const next = reconcileDeck(decks, mode, previous.deckId);
      return next === previous.deckId ? previous : { ...previous, deckId: next };
    });
  }, [decks, mode]);

  /* The URL follows the flow rather than the other way round, so Back leaves
     the step it was on and a link can be sent. `replace` while walking forward,
     because three steps should not cost three presses of the back button to
     leave the page. */
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (mode) next.set('mode', mode);
    else next.delete('mode');
    if (setup.deckId) next.set('deck', setup.deckId);
    else next.delete('deck');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // `params` is deliberately out of the dependency list: it is the thing
    // being written, and including it re-runs this on its own result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, setup.deckId, setParams]);

  /* ---------------------------------------------------------------------- */
  /* Starting a game                                                        */
  /* ---------------------------------------------------------------------- */

  const startGame = useCallback(async () => {
    setStarting(true);
    setSetupError(null);

    try {
      const summaryFor = (deckId: string | null) =>
        deckId ? decks.find(deck => deck.id === deckId) ?? null : null;

      const active = mode ?? 'bots';
      const playerCount = seatsFor(active, setup.opponents.length);
      /* Playtest is this table with every seat played for you. Nothing else
         about it differs, which is why it is a flag here and not a page. */
      const watchedTable = active === 'playtest';

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
        if (seat.notice) {
          notices.push(
            watchedTable ? `Seat ${i + 2}: ${seat.notice}` : `Opponent ${i + 1}: ${seat.notice}`
          );
        }
        opponents.push(seat.deck);
      }

      const myDeck = mine.deck;

      /* Seat names come from `uniqueSeatNames` when nobody at the table is you,
         because four bots called after their commanders can collide and "The
         Ur-Dragon" twice is unreadable. A table with you in it keeps your own
         name in seat one. */
      const allDecks = [myDeck, ...opponents];
      const watchedNames = watchedTable ? uniqueSeatNames(allDecks) : null;

      const built = buildTable({
        id: `play-${setup.seed}-${playerCount}-${Date.now()}`,
        seed: setup.seed,
        now: Date.now(),
        format: myDeck.format,
        seats: [
          {
            deck: myDeck,
            playerName: watchedNames
              ? watchedNames[0]
              : user?.email
                ? user.email.split('@')[0]
                : 'You',
            playerId: HUMAN_SEAT,
            // The one difference playtest makes to a table: seat one is played
            // for you as well.
            ...(watchedTable ? { isBot: true } : {}),
          },
          ...opponents.map((deck, index) => ({
            deck,
            playerName: watchedNames ? watchedNames[index + 1] : botNameFor(deck, index),
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
      setWatching(watchedTable);
      setWatchRunning(true);
      /* A watched table has no opening hand to offer: every seat has already
         answered its own, above. Offering one would stop a game nobody is
         playing, waiting for a decision nobody is making. */
      setOpening(watchedTable ? null : { taken: 0, bottoming: false, chosen: [] });
      setDutiesDismissed(null);
      setEndingTurn(null);
      setInspectId(null);
      setZoneTarget(null);
      setMenuOpen(false);
      setViewSeatId(null);
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
  }, [decks, mode, setup, user]);

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

  /*
   * A card that appears has already been fetched.
   *
   * Measured: a spell's whole life on the stack is under 2.5 seconds and a cold
   * image fetch plus the fade is longer, so four times out of four the player
   * watched an empty rectangle instead of the card. `useCardPrewarm` has the
   * measurement and says what it does and does not warm.
   */
  useCardPrewarm(state);

  const combatLive = state ? combatIsLive(state, HUMAN_SEAT) : false;
  const canAttack = state ? canReachCombat(state, HUMAN_SEAT) : false;

  /* ---------------------------------------------------------------------- */
  /* Moves — every one of them goes through the engine                      */
  /* ---------------------------------------------------------------------- */

  const handleCast = useCallback(
    (card: CardInstance, hostId?: InstanceId, targets?: StackTarget[]) => {
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
        /*
         * CR 601.2c, the other half — every spell that is not an Aura names its
         * targets as it is cast, and `SpellTargetPanel` is what asks.
         *
         * This field is the one CLAUDE.md called the largest blocker left:
         * `CastOptions.targets` reached the stack object and nothing outside
         * the bot ever filled it, so a human's Lightning Bolt resolved aimed at
         * nobody. It is filled here now, from a control a person pressed.
         */
        ...(targets && targets.length > 0 ? { targets } : {}),
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

  /**
   * Cast a spell at what the preview just aimed it at.
   *
   * A thin adapter rather than a second cast path, deliberately: the timing
   * check, the plan, the refusal toast and the stack announcement are all
   * `handleCast`'s, so a targeted spell and an untargeted one cannot come to be
   * cast by two different sets of rules.
   */
  const handleCastAtTargets = useCallback(
    (card: CardInstance, targets: StackTarget[]) => handleCast(card, undefined, targets),
    [handleCast]
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
    /* Nothing else to do. The swords appear on the creatures that can swing,
       on the board the player was already looking at. */
  }, [state, dispatch]);

  /** One press. The effect below sweeps the rest of the turn. */
  const handleEndTurn = useCallback(() => {
    if (!state) return;
    if (state.status !== 'playing') return;
    if (state.activePlayerId !== HUMAN_SEAT) return;
    /*
     * Not while the opening hand is unanswered.
     *
     * The reducer starts turn one under the mulligan bar, so every other test
     * here passes and this one is the only thing standing between END TURN and
     * a latch that the sweeping effect below refuses to service. Setting it
     * there froze the control on "Ending…" until the hand was kept, and then
     * spent turn one the instant it was. Measured; `turnFlow.ts` has the run.
     *
     * The HUD does not offer END TURN in this state any more. This is the same
     * refusal at the handler, so no other caller can reintroduce it.
     */
    if (opening !== null) return;
    setEndingTurn(state.turn);
  }, [state, opening]);

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

  /**
   * Give the game up (CR 104.3a).
   *
   * It goes down the transport like every other move, so on a networked table
   * the other seats see it as a game event rather than as a player vanishing.
   * The board is deliberately NOT torn down: `sba.ts` marks the seat lost, the
   * HUD switches to "Game over" or the game carries on among the rest, and the
   * reader gets to see what happened before choosing to leave.
   */
  const handleConcede = useCallback(() => {
    dispatch({ type: 'CONCEDE', playerId: HUMAN_SEAT });
    setMenuOpen(false);
    setInspectId(null);
  }, [dispatch]);

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
  }, []);

  /** Look at somebody's board, full screen. Read-only for an opponent. */
  const handleFocusSeat = useCallback((playerId: PlayerId) => {
    setViewSeatId(playerId);
    setInspectId(null);
    setMenuOpen(false);
    setZoneTarget(null);
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
    //
    // A latched END TURN is dropped rather than queued. It cannot be set from
    // the HUD any more, but a latch that survived the mulligan would fire the
    // moment the hand was kept and spend turn one, which is what it did.
    if (opening !== null) {
      if (endingTurn !== null) setEndingTurn(null);
      return;
    }

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
  /* Combat does NOT take over the view. There is nothing to take it over.   */
  /* ---------------------------------------------------------------------- */
  /*
   * An effect used to sit here that switched `view` to `'combat'` the moment
   * this seat owed an attack or a block, and switched it back afterwards.
   *
   * `'combat'` rendered `CombatView`, which was a second copy of this page's
   * board: the same `PlayTable` and the same `ViewerHand`, mounted with fewer
   * props. Every turn the game reached a declare step, the player lost
   *
   *   - the seating they chose (it fell back to `defaultSeatingFor`),
   *   - hand view and view mode (`focusPlayerId` was not passed),
   *   - opening a graveyard, exile, library or command zone (`onOpenZone`),
   *   - the life change animation (`lifeDeltas`),
   *   - free cast, the fan stepping back while a target is being chosen, and
   *     the mulligan's marked cards (`freeCast` / `receded` / `markedIds`),
   *   - the cast spotlight,
   *
   * and got them back when combat ended. That is CLAUDE.md's "one table, one
   * set of logic" broken in the one place it costs the most, and it is what the
   * owner meant by combat *"moves onto different screens"*.
   *
   * Nothing replaced it, because nothing needed to: `PlayTable` already
   * declares combat on the mats — swords and shields on the cards themselves —
   * and it is already on screen.
   */

  const changeView = useCallback(
    (next: PlayViewId) => {
      if (next === 'view' && state && !viewSeatId) {
        const firstOpponent = state.players.find(p => p.id !== HUMAN_SEAT);
        if (firstOpponent) setViewSeatId(firstOpponent.id);
      }
      setView(next);
    },
    [view, state, viewSeatId]
  );

  /**
   * The big control, when the game is waiting for this seat and END TURN is not
   * what it wants.
   *
   * Measured on 22 Aug 2026: at the declare-blockers stop the top-right button
   * read "PLARGG AND NASSARI'S TURN" and was disabled, while the game was
   * waiting for the reader to block. It now says what is owed.
   *
   * -------------------------------------------------------------------------
   * AND SAYING IT WAS NOT ENOUGH. Re-measured 29 Aug 2026, in a browser,
   * playing a real game against a bot:
   *
   *   turn 12, declare blockers, "Block with Insidious Bookworms (1/1)" armed
   *     press DECLARE BLOCKERS (top right, y=8)   turn 12 -> turn 12. nothing.
   *     press the combat bar (y=70)               turn 12 -> postcombat main
   *
   *   turn 13, declare attackers, one attacker declared
   *     press DECLARE ATTACKERS (top right)       turn 13 -> turn 13. nothing.
   *     press ATTACK WITH 1 in the bar            turn 13 -> postcombat main
   *
   * The cause was the effect that used to sit two blocks above this one. It
   * opened the combat view the moment the decision arrived, so by the time the
   * label read DECLARE BLOCKERS the view was ALREADY 'combat', and
   * `changeView('combat')` set the state it was already in. React bailed, and
   * the loudest control on the page did nothing at the two moments the game was
   * waiting for you.
   *
   * There is no combat view now, so there is no "take me there" half left. The
   * control COMMITS, on the first press, always. The commit is `ADVANCE_STEP`,
   * the identical action `PlayTable.confirmCombat` sends from the combat bar,
   * and both refuse for the same reason through `illegalBlockReason`, so the
   * two controls cannot drift apart.
   */
  const blockIssue = useMemo(
    () => (state ? illegalBlockReason(state, HUMAN_SEAT) : ''),
    [state]
  );

  const handleDecision = useCallback(() => {
    if (!decision) return;
    if (decision === 'attackers' && canAttack) {
      handleAttack();
      return;
    }
    if (decision === 'attackers' || decision === 'blockers') {
      if (blockIssue) return;
      dispatch([{ type: 'ADVANCE_STEP', at: Date.now() }]);
      return;
    }
    /*
     * CR 509.2, the third instance of the same dead press. Measured 29 Aug
     * 2026 with Insidious Bookworms double blocked by Jackal Familiar and
     * Rosnakht: the bar drew "1 Jackal Familiar 2/2", "2 Rosnakht 0/1" and
     * DEAL DAMAGE, the top-right control read DAMAGE ORDER, and pressing it
     * left the game on turn 5 declare_blockers. Pressing DEAL DAMAGE moved it
     * to postcombat main and put the promoted blocker in the graveyard.
     *
     * The order itself is set by the numbered chips; this control is the
     * commit, and it is `ADVANCE_STEP` — the same action `OrderBlockersBar`
     * sends through `PlayTable.confirmCombat`. The lanes already carry an
     * order, so committing without touching the chips takes the order on
     * screen, which is what DEAL DAMAGE does too.
     */
    if (decision === 'damage-order') {
      dispatch([{ type: 'ADVANCE_STEP', at: Date.now() }]);
      return;
    }
    changeView('table');
  }, [decision, canAttack, handleAttack, changeView, blockIssue, dispatch]);

  /*
   * Is anything on this table asking what it is aimed at?
   *
   * True for a waiting trigger, for a spell being cast at something, and for an
   * activated ability, because all three publish through the same channel now.
   * The page does not care which: what it draws for the answer is identical,
   * which is what fixing the seam once bought.
   *
   * Read HERE, above the two early returns below, because it is a hook. There
   * is no state yet on some of the frames this runs on, and `useAimRequest`
   * takes that: no table means no question.
   */
  const aiming = useAimRequest(state?.id, HUMAN_SEAT);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  /* -------------------------------------------------------------------- */
  /* A watched table                                                       */
  /* -------------------------------------------------------------------- */

  /* Playtest. The same engine, the same mat, the same hand, the same card
     preview and the same log; the only difference is that nobody is waiting on
     a human, so the driver is `useWatchedGame` and the surface carries a speed
     control and a step button instead of a hand you can act from. This used to
     be a separate page at `/simulate` with its own setup screen, and the drift
     that caused is what the one table law exists to stop. */
  if (watching && table && watched.state) {
    return (
      <WatchedTable
        state={watched.state}
        feed={watched.feed}
        lastPlay={watched.lastPlay}
        halted={watched.halted}
        running={watchRunning}
        onRunning={setWatchRunning}
        speedMs={watchSpeedMs}
        onSpeedMs={setWatchSpeedMs}
        onStep={watched.stepOnce}
        onRestart={watched.restart}
        onLeave={() => {
          setTable(null);
          setWatching(false);
          setWatchRunning(true);
        }}
      />
    );
  }

  if (!table || !state) {
    const heading = headingFor(step, mode);
    const chosenDeck = setup.deckId ? decks.find(deck => deck.id === setup.deckId) ?? null : null;
    const seats = mode ? seatsFor(mode, setup.opponents.length) : 0;

    const deckCrumb =
      step === 'mode'
        ? null
        : chosenDeck
          ? chosenDeck.name
          : mode === 'online'
            ? null
            : 'Seeded deck';

    const trail = breadcrumbFor({
      mode,
      deckName: deckCrumb,
      tableLabel: step === 'table' ? `${seats} seat${seats === 1 ? '' : 's'}` : null,
    });

    const goBack = () => {
      if (studying) {
        setStudying(false);
        return;
      }
      if (step === 'table') setStep('deck');
      else if (step === 'deck') setStep('mode');
    };

    const goForward = () => {
      if (step === 'mode') {
        setStep('deck');
        return;
      }
      if (step === 'deck') {
        /* Online carries on at the lobby, taking the deck with it. It is the
           third step of THIS flow rather than a fresh start: the lobby wears
           the same step label and the same breadcrumb, and its back control
           comes here. It has its own URL because a table link is the owner's
           stated way in and a link needs a real address. */
        if (mode === 'online') {
          navigate(
            setup.deckId
              ? `/play/online?deck=${encodeURIComponent(setup.deckId)}`
              : '/play/online'
          );
          return;
        }
        setStep('table');
        return;
      }
      void startGame();
    };

    /* Whether the forward control can move, and why not when it cannot. */
    const blocked =
      step === 'mode' && !mode
        ? 'Pick a mode to carry on.'
        : step === 'deck' && mode === 'online' && !setup.deckId
          ? 'Online needs one of your decks with cards in it.'
          : null;

    return (
      <StandardPageLayout
        title={<StepTitle label={heading.label} title={heading.title} />}
        description={heading.note ?? undefined}
        /* The start control lives here, beside the title, in the layout's own
           action slot, matching every other page in the app. It was moved out
           of a full width bar at the bottom of the setup panel once already and
           must not go back. */
        action={
          step === 'table' && mode && mode !== 'online' && !studying ? (
            <Button size="lg" onClick={() => void startGame()} disabled={starting}>
              {starting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Shuffling up
                </>
              ) : (
                startLabelFor(mode, seats)
              )}
            </Button>
          ) : null
        }
      >
        <div className="w-full space-y-4">
          {/* Everything about moving, at the TOP, on every step. Back, the
              choices so far and the way on used to be a bar at the bottom of
              steps one and two and a control 1470px down on step three. See
              the header of `StepChrome.tsx`. */}
          {!studying && (
            <StepBar
              crumbs={trail}
              current={step}
              onJump={next => {
                setStudying(false);
                setStep(next);
              }}
              backLabel={
                step === 'deck' ? 'Change mode' : step === 'table' ? 'Change deck' : undefined
              }
              onBack={step === 'mode' ? undefined : goBack}
              forwardLabel={forwardLabelFor(step, mode)}
              onForward={step === 'table' ? undefined : goForward}
              forwardDisabled={Boolean(blocked) || starting}
              note={blocked}
              extra={
                /* Goldfish asks two questions with two different measurements:
                   how the deck plays, and how it opens. Playing it is the
                   control in the header; the opening hand study is this, and it
                   is the tab that used to live on `/simulate`. Neither half was
                   dropped in the merge. */
                step === 'table' && mode === 'goldfish' ? (
                  <Button
                    variant="secondary"
                    onClick={() => setStudying(true)}
                    disabled={!setup.deckId}
                    /* Shown and disabled rather than hidden. A control that
                       vanishes leaves the reader wondering whether the feature
                       exists; one that says what it needs does not. */
                    title={
                      setup.deckId
                        ? undefined
                        : 'The study samples a real list, so it needs one of your own decks rather than a seeded one.'
                    }
                  >
                    Study opening hands
                  </Button>
                ) : null
              }
            />
          )}

          {step === 'mode' && (
            <>
              <ModeWall
                value={mode}
                live={{ online: onlineLive }}
                onChoose={next => {
                  setMode(next);
                  setArmedSeat(1);
                  setStep('deck');
                }}
              />

              {/* The friends list, on the first screen of the play section,
                  which is where the owner went looking for one and did not find
                  it. Under the doors rather than over them: four full bleed
                  doors are what somebody came here to press.

                  It carries the two facts that change what you do next, and
                  both are actionable without leaving: somebody is waiting for
                  your answer, and somebody you know is on right now. The rest
                  of the friends list is in the lobby, one press away, and it is
                  the same components reading the same one query. */}
              <FriendsRail
                userId={user?.id}
                signedIn={Boolean(user)}
                onOpenLobby={() =>
                  navigate(
                    setup.deckId
                      ? `/play/online?deck=${encodeURIComponent(setup.deckId)}`
                      : '/play/online'
                  )
                }
                onOpenTable={code => navigate(tablePath(code))}
              />
            </>
          )}

          {step === 'deck' && mode && (
            <DeckStep
              decks={decks}
              loading={loadingDecks}
              mode={mode}
              value={setup.deckId}
              onChoose={deckId => setSetup(previous => ({ ...previous, deckId }))}
              allowSeeded={mode !== 'online'}
            />
          )}

          {step === 'table' && mode && mode !== 'online' && !studying && (
            <SeatStep
              mode={mode}
              decks={decks}
              loadingDecks={loadingDecks}
              deckId={setup.deckId}
              onDeckId={deckId => setSetup(previous => ({ ...previous, deckId }))}
              opponents={setup.opponents}
              onOpponents={opponents =>
                setSetup(previous => ({
                  ...previous,
                  opponents,
                  variant: defaultSeatingFor(seatsFor(mode, opponents.length)),
                }))
              }
              armedSeat={armedSeat}
              onArmSeat={setArmedSeat}
              aggression={setup.aggression}
              onAggression={aggression => setSetup(previous => ({ ...previous, aggression }))}
              variant={setup.variant}
              onVariant={variant => setSetup(previous => ({ ...previous, variant }))}
              seed={setup.seed}
              onSeed={seed => setSetup(previous => ({ ...previous, seed }))}
              error={setupError}
            />
          )}

          {studying && setup.deckId && (
            <GoldfishStudy
              deckId={setup.deckId}
              deckName={chosenDeck?.name ?? 'That deck'}
              onBack={() => setStudying(false)}
            />
          )}

        </div>
        {/*
          There is deliberately NO overlay here.

          This used to render `fixed inset-0 ... bg-background/70` with a
          spinner in it while the decks were being resolved: a dimmed,
          full-screen, click-eating backdrop, which is the one thing play mode
          is not allowed to have. It also bought nothing. The start control
          already disables itself and turns into a spinner in the button, which
          is where the reader is already looking.

          It survived this long because the screenshot harness cannot see it:
          `scripts/play-preview-shots.mjs` skips any full-screen candidate whose
          class list contains the string `bg-background`, to let the immersive
          board's own opaque `bg-background` root through, and `bg-background/70`
          contains that string too.
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
  /*
   * The battlefield half of the same question.
   *
   * `responseOptions` reads the hand and nothing else, which is why a seat
   * holding a Rod of Ruin and no instants had priority passed for it: the
   * surface asked "can I answer from hand", got no, and pressed next 130 ms
   * later. Measured over six harness games: 856 response windows, 29 answerable
   * from hand, 10 more answerable only from the board.
   */
  const abilityAnswers =
    stack.length > 0 && yourPriority ? abilityResponses(state, HUMAN_SEAT, { freeCast }) : [];
  /*
   * CR 603.3d — a triggered ability of this seat's is waiting to be aimed.
   *
   * It outranks the stack strip in the band below, and that is not a taste
   * call: `drainTriggers` has genuinely STOPPED, so nothing else in the game is
   * going to move until this is answered. Drawing anything over it would be
   * drawing a control for a game that is not currently accepting one.
   */
  const triggerAsk = triggerAwaitingTargets(state);
  const aimingTrigger = !!triggerAsk && triggerAsk.playerId === HUMAN_SEAT;
  const openingOwed = opening
    ? cardsToBottom(
        opening.taken,
        state.players.find(p => p.id === HUMAN_SEAT)?.zones.hand.length ?? 0
      )
    : 0;
  /*
   * What the HUD is told about the opening hand.
   *
   * The reducer has already begun turn one underneath the mulligan bar, so the
   * HUD cannot work this out for itself: without being told, it read "your
   * turn, nothing owed" and offered a live END TURN over a hand nobody had kept.
   * `turnFlow.ts` records what pressing it did.
   */
  const openingStop: OpeningStop | null = opening
    ? bottoming
      ? 'bottom'
      : 'keep-or-mulligan'
    : null;
  const openingReady = !opening || !bottoming || opening.chosen.length === openingOwed;
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
                    className="absolute inset-x-0 bottom-0 z-30"
                    state={state}
                    viewerPlayerId={HUMAN_SEAT}
                    freeCast={freeCast}
                    /* The answer is on the mat, so the fan steps back and stops
                       taking presses until the question is closed. */
                    receded={!!aiming}
                    /*
                     * THE HAND STANDS UP WHILE THE OPENING HAND IS BEING JUDGED.
                     *
                     * The fan hangs off the bottom edge during a turn so it
                     * stops covering the player's own permanents. At the
                     * mulligan there are no permanents: both mats are empty and
                     * the seven cards ARE the decision. Measured before this
                     * line, at 1600 x 1000: eight of the nine cards on screen
                     * cut off by the window, the worst losing 45.1% of itself,
                     * under a bar asking whether to keep them.
                     */
                    sunk={opening === null}
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
        {/*
          IT SITS ON TOP OF THE HAND'S BAND, NOT INSIDE IT.

          `bottom-2` put the feed in the same strip the fan is drawn in, and the
          fan is CENTRED and wide: at 1600 x 1000 with eight cards it reaches
          x=95, and the feed occupies x=8 to x=232. Measured across three turns,
          9,149 / 9,864 / 10,697 px of the log lay under the leftmost card of
          the player's own hand, with the card painted over the top of it. Two
          of the three lines of "T1 You drew 7 cards." were unreadable, and the
          hand looked dirty where they showed through.

          Guttering the fan to make room was measured and rejected: the fan is
          currently sized by its BAND (192px cards, against the 222px the width
          would allow), so taking 232px off each side makes the WIDTH the
          binding constraint and drops the cards to 156px. That is a 19% smaller
          hand to rehouse a log, and the owner has twice asked for the hand to
          be bigger.

          So the feed clears the band instead. It lands on the near seat's left
          rail, over part of one zone tile, where it is fully legible on its own
          backdrop and covers no card in any row: the rows start at x=240
          because the rail ends at x=230, so nothing on the board is behind it.
        */}
        <div
          className="pointer-events-none absolute left-2 z-40 max-w-[46vw]"
          /*
           * THE FEED GOES TO THE TOP WHILE THE OPENING HAND IS BEING JUDGED.
           *
           * The fan stands at its full height there, so the bottom-left corner
           * it normally sits in is under the first two cards of the hand. It
           * cannot simply move up either: the next thing above is the near
           * seat's command zone, and it would be drawn straight over the
           * commander's art, which the project's own design law forbids.
           *
           * Top left is empty on that screen. The bar naming the decision is
           * centred, the two answers are on the right, and the log stays
           * reachable rather than being hidden for the duration.
           */
          style={
            opening !== null
              ? { top: HUD_INSET + 8 }
              : { bottom: (showHand ? hand.inset : FEED_INSET) + 8 }
          }
        >
          <GameFeed state={state} feed={feed} variant="feed" />
        </div>

        {/* Whose turn it is, said out loud for a beat. */}
        <TurnBanner state={state} viewerPlayerId={HUMAN_SEAT} />

        {/*
          A WAITING TRIGGER, MOUNTED FOR ITS QUESTION RATHER THAN FOR ITS BOX.

          This draws nothing. It works out what CR 603.3d has stopped the game
          on and publishes it to the table, and `AimLayer` below is what appears.
          It has to be mounted OUTSIDE that band or the two would deadlock: the
          band only opens once something is asking, and nothing is asking until
          this is mounted.
        */}
        <TriggerTargetBar state={state} viewerPlayerId={HUMAN_SEAT} onDispatch={dispatch} />

        {/*
          The opening hand, and the things the engine will not do for you.

          Both live in the same band under the HUD, both are made of the mat's
          own material, and neither covers a seat's board or takes the screen.
          They are mutually exclusive in practice: the mulligan is answered
          before the first untap, and a duty cannot arrive until an upkeep.
        */}
        {(opening !== null || aiming || aimingTrigger || dutiesShowing || commanderChoiceShowing || stack.length > 0) && (
          <div
            className="pointer-events-none absolute inset-x-0 z-[45] flex justify-center px-2"
            style={{ top: HUD_INSET + 8 }}
          >
            {opening !== null ? (
              <MulliganBar
                taken={opening.taken}
                chosen={opening.chosen.length}
                owed={openingOwed}
                bottoming={bottoming}
              />
            ) : aiming || aimingTrigger ? (
              /* Something is asking what it is aimed at, and until it has an
                 answer it outranks everything else this band can hold. For a
                 trigger that is not a taste call: `drainTriggers` has genuinely
                 STOPPED (CR 603.3d) and nothing in the game moves until it is
                 answered. For a spell or an ability the player is mid gesture
                 and the board is lit up for it.

                 The names that used to sit here are gone. What is left is what
                 the board cannot say: the card that is asking, its clause, a
                 control for each legal seat, and the way out. */
              <AimLayer state={state} viewerPlayerId={HUMAN_SEAT} />
            ) : stack.length > 0 ? (
              <StackStrip
                state={state}
                viewerPlayerId={HUMAN_SEAT}
                stack={stack}
                responses={responses}
                abilityAnswers={abilityAnswers}
                yourPriority={yourPriority}
                onRespond={handleRespond}
                onOpenPermanent={card => setInspectId(card.instanceId)}
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
            onCastAtTargets={handleCastAtTargets}
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
              onConcede={handleConcede}
              canConcede={
                state.status === 'playing' &&
                !state.players.find(p => p.id === HUMAN_SEAT)?.conceded
              }
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
          onDecision={handleDecision}
          decisionBlocked={blockIssue}
          opening={openingStop}
          onOpening={bottoming ? handleConfirmBottom : handleKeep}
          onMulligan={handleMulligan}
          /* A hand of one is the floor: below that there is nothing to keep and
             nothing to choose, and offering the press would be a lie. */
          canMulligan={
            opening !== null &&
            !bottoming &&
            (state?.players.find(p => p.id === HUMAN_SEAT)?.zones.hand.length ?? 0) > 1
          }
          openingReady={openingReady}
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
