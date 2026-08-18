/**
 * /play — the online play and playtest surface.
 *
 * Everything on this page is a thin shell over `src/lib/game`. The page owns
 * three things and nothing else: which view is on screen, which deck sat down,
 * and the dialogs. Rules, mana, combat, the bot and the transport all live in
 * the core, which is why a networked table later needs a new transport rather
 * than a new page.
 *
 * Once a table exists the page stops being a document and becomes a board. The
 * lobby keeps the standard page furniture — title, description, breadcrumb —
 * because that is a page you read. A game in progress does not get a heading
 * over it: the pod fills the viewport, every seat sits on its own playmat, and
 * your hand is fanned along the bottom edge where a hand belongs.
 *
 * The three views are the feature, not the chrome:
 *
 *   Table   the pod as it physically sits, driven by `seating.ts` geometry
 *   Hand    your cards big enough to read, each saying if and why it is castable
 *   Combat  attackers, blockers, and the defender's board and hand together
 *
 * Combat opens itself when someone swings, and hands the view back when the
 * swing is over — with the switcher always visible so that is a convenience,
 * never a trap.
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
import { ZoneBrowser } from '@/components/play/ZoneBrowser';
import { useCastSpotlight, useLifeDeltas } from '@/components/play/useTableMotion';

import { usePlayGame } from '@/hooks/usePlayGame';
import { listPlayableDecks, resolveDeck, type DeckSummary } from '@/lib/play/deckSource';
import {
  advanceActions,
  buildTable,
  declareAttack,
  isUnderAttack,
  mulliganActions,
  planCastFromHand,
  planLandDrop,
  type BuiltTable,
  type CardInstance,
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
    variant: 'table',
    aggression: 'normal',
    seed: 7,
  });

  const [table, setTable] = useState<BuiltTable | null>(null);
  const [variant, setVariant] = useState<SeatingVariant>('table');
  const [view, setView] = useState<PlayViewId>('table');
  const [freeCast, setFreeCast] = useState(false);
  const [botsPaused, setBotsPaused] = useState(false);
  const [zoneTarget, setZoneTarget] = useState<{ playerId: PlayerId; zone: Zone } | null>(null);

  /** The view combat interrupted, so it can be handed back afterwards. */
  const autoOpenedFrom = useRef<PlayViewId | null>(null);
  /** Turn number on which the player deliberately left the combat view. */
  const dismissedCombatOnTurn = useRef<number | null>(null);

  const { state, dispatch, undo, canUndo, botPlayerIds, botThinking, feed, transportKind } =
    usePlayGame({
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
  /* Combat takes over the view when it matters                             */
  /* ---------------------------------------------------------------------- */

  const combatLive = state ? combatIsLive(state, HUMAN_SEAT) : false;

  useEffect(() => {
    if (!state) return;

    const myDecision =
      (state.activePlayerId === HUMAN_SEAT && state.step === 'declare_attackers') ||
      isUnderAttack(state, HUMAN_SEAT);

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
  }, [state, view, combatLive]);

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

  const handlePassTurn = useCallback(() => {
    dispatch({ type: 'PASS_TURN' });
  }, [dispatch]);

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

  const handleNewGame = useCallback(() => {
    setTable(null);
    setView('table');
    autoOpenedFrom.current = null;
    dismissedCombatOnTurn.current = null;
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  const selectedIds = useMemo<string[]>(() => [], []);

  const transportLabel =
    transportKind === 'local'
      ? 'Local table — online play drops in behind the same transport'
      : 'Transport idle';

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
    // 6rem is the app shell's own furniture: a 4rem top bar plus the main
    // element's vertical padding. Matching it exactly means the board fills the
    // viewport without the page itself gaining a scrollbar.
    <div className="flex h-[calc(100vh-6rem)] min-h-[36rem] w-full flex-col gap-2 px-1 pb-1 md:px-3">
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
        onAdvance={handleAdvance}
        onPassTurn={handlePassTurn}
        onUndo={undo}
        canUndo={canUndo}
        onNewGame={handleNewGame}
        transportLabel={transportLabel}
      />

      <div className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="relative min-h-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              initial={viewMotion.initial}
              animate={viewMotion.animate}
              exit={viewMotion.exit}
              transition={transition}
              className="absolute inset-0"
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

                  {/* Below xl there is no room for a rail, so the log becomes a
                      translucent HUD panel rather than disappearing. */}
                  <GameFeed
                    state={state}
                    feed={feed}
                    limit={20}
                    className="absolute right-2 top-2 z-30 hidden max-h-[40%] w-56 bg-background/70 backdrop-blur-md sm:flex xl:hidden"
                  />
                </div>
              )}

              {view === 'hand' && (
                <div className="h-full overflow-y-auto pr-1">
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
                <div className="h-full overflow-y-auto pr-1">
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

          {state.status === 'complete' && (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
              <div className="pointer-events-auto rounded-2xl bg-background/85 px-6 py-5 text-center shadow-2xl shadow-black/70 backdrop-blur-md">
                <p className="text-lg font-semibold text-foreground">
                  {state.winnerIds.length > 0
                    ? `${state.players.find(p => p.id === state.winnerIds[0])?.name} wins.`
                    : 'The game is a draw.'}
                </p>
                <Button size="sm" className="mt-3 h-8 text-xs" onClick={handleNewGame}>
                  Set up another game
                </Button>
              </div>
            </div>
          )}
        </div>

        <GameFeed state={state} feed={feed} className="hidden min-h-0 xl:flex" />
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
