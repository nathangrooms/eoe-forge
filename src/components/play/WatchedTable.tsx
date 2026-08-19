/**
 * Play mode, watched instead of played.
 *
 * Owner: *"On playtester, this is using the same engine as the main play tool?
 * Play tool is the main, playtest should use the same system too - also cant
 * see the users hand and how they are casting - good to test playmode and how
 * it visually works by watching the bot use playtest just as the real play a
 * game section would work."*
 *
 * That last clause is the whole specification. The point of the playtest is to
 * TEST PLAY MODE, so a playtest that draws a different board tests nothing. So
 * there is no board here. Every visible thing on this screen is the component
 * `/play` uses, given the same props:
 *
 *   `PlayTable`        the four upright quadrants, seats, mats, combat lanes
 *   `ViewerHand`       the fanned hand along the bottom edge, at readable size
 *   `CenterPreview`    click a card, read it in the middle of the mat
 *   `CastSpotlight`    the card that just left a hand, held at the right edge
 *   `GameFeed`         the log, floating rather than boxed
 *   `TurnBanner`       whose turn it is, said out loud for a beat
 *   `ZoneTravelLayer`  a card travelling from where it was to where it went
 *   `Playmat`          the material every panel on this screen is made of
 *
 * What this file adds is the four things a *watched* game needs and a played
 * one does not: which seat you are looking through, the transport controls
 * (pause, step, speed, restart), the line saying what the last decision
 * actually was, and the fact that nothing here dispatches.
 *
 * ## Which seat you are watching
 *
 * `viewerPlayerId` is the one prop that decides everything downstream: it puts
 * that seat at the bottom of the table (`layoutFromViewpoint`), it is the seat
 * whose hand is drawn face up instead of as card backs, and it is the seat
 * `ZoneTravelLayer` is allowed to animate a hand for. So the seat picker here
 * is not a fifth concept; it is the same prop `/play` pins to the human.
 *
 * Following the active player automatically is offered and off by default. It
 * re-seats the table every turn, which is the correct thing when you want to
 * see every hand and a disorienting thing when you are studying one board.
 *
 * ## Nothing here dispatches, and that is enforced rather than promised
 *
 * `liveSession.ts` publishes a dispatcher per table, and `usePlayGame` is the
 * only thing that publishes one. This screen drives the game through
 * `useWatchedGame` instead, so `useLiveSession` finds nothing, every combat
 * chip on every card disappears on its own, and the preview is asked for
 * read-only actions. There is no path from a click here into game state.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronsRight, Eye, Gauge, Pause, Play, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PlayTable } from './PlayTable';
import { Playmat } from './Playmat';
import { ViewerHand } from './ViewerHand';
import { CastSpotlight } from './CastSpotlight';
import { CenterPreview } from './CenterPreview';
import { GameFeed } from './GameFeed';
import { TurnBanner } from './TurnBanner';
import { ZoneTravelLayer } from './ZoneTravelLayer';
import { useCastSpotlight, useLifeDeltas } from './useTableMotion';
import {
  BOARD_CARD_DEFAULT,
  HAND_CARD_DEFAULT,
  HUD_INSET,
  handMetrics,
} from './tableMetrics';
import { useCardSize } from '@/components/cards/CardSizeSlider';
import type { WatchedPlay } from './useWatchedGame';
import type { PlayFeedEntry } from '@/hooks/usePlayGame';
import { STEP_LABELS, type GameState, type PlayerId } from '@/lib/game';

/** Milliseconds between decisions, slowest first. */
const SPEEDS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: '0.5x', ms: 900 },
  { label: '1x', ms: 450 },
  { label: '2x', ms: 200 },
  { label: '4x', ms: 90 },
  { label: 'Max', ms: 0 },
];

/** Roughly a second, then it fades. A new cast replaces it immediately. */
const SPOTLIGHT_MS = 1100;

/* The HUD inset, the starting card sizes and `handMetrics` come from
   `tableMetrics.ts`, which `/play` reads too. They were copied into this file
   with different numbers once, and the two screens laid the same hand out two
   different ways within days of being merged. A playtest that sizes its cards
   differently from the screen it exists to test is not testing that screen. */

export interface WatchedTableProps {
  state: GameState;
  feed: PlayFeedEntry[];
  lastPlay: WatchedPlay | null;
  halted: string | null;
  running: boolean;
  onRunning: (next: boolean) => void;
  speedMs: number;
  onSpeedMs: (next: number) => void;
  onStep: () => void;
  onRestart: () => void;
  onLeave: () => void;
}

export function WatchedTable({
  state,
  feed,
  lastPlay,
  halted,
  running,
  onRunning,
  speedMs,
  onSpeedMs,
  onStep,
  onRestart,
  onLeave,
}: WatchedTableProps) {
  const [inspectId, setInspectId] = useState<string | null>(null);
  /** The seat the table is seen through. Same prop `/play` pins to the human. */
  const [watchedId, setWatchedId] = useState<PlayerId>(state.players[0]?.id ?? 'p1');
  /** Follow the turn: re-seat the table on whoever is acting. Off by default. */
  const [follow, setFollow] = useState(false);
  /** One seat, filling the board. `/play` calls this hand mode. */
  const [soloSeat, setSoloSeat] = useState(false);

  /* The player's own card sizes, read from the SAME two preferences `/play`
     writes. A playtest that draws cards at a size the player never chose is not
     showing them their play mode, it is showing them a different one. There is
     no slider on this screen, because a watched game gives you nothing to hold
     still while you drag one, but the setting lands here all the same. */
  const [boardCardWidth] = useCardSize('play-board', BOARD_CARD_DEFAULT);
  const [handCardWidth] = useCardSize('play-hand', HAND_CARD_DEFAULT);

  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* Presentation-only memory of the previous board, exactly as `/play` keeps
     it: what life changed, and what just left somebody's hand. */
  const lifeDeltas = useLifeDeltas(state);
  const spotlight = useCastSpotlight(state, SPOTLIGHT_MS);

  /* A seat that leaves the game is not a seat to watch from. */
  useEffect(() => {
    if (state.players.some(player => player.id === watchedId && !player.hasLost)) return;
    const alive = state.players.find(player => !player.hasLost) ?? state.players[0];
    if (alive) setWatchedId(alive.id);
  }, [state.players, watchedId]);

  useEffect(() => {
    if (!follow) return;
    setWatchedId(state.activePlayerId);
  }, [follow, state.activePlayerId]);

  /* Every seat is a bot. The board dims nothing and hides nothing on that
     account; it is simply the truth about who is deciding. */
  const botPlayerIds = useMemo(() => state.players.map(player => player.id), [state.players]);

  const attackerIds = useMemo(
    () => state.combat.attackers.map(declaration => declaration.attackerId),
    [state.combat.attackers]
  );
  const blockerIds = useMemo(
    () => state.combat.attackers.flatMap(declaration => declaration.blockedBy),
    [state.combat.attackers]
  );

  const watched = state.players.find(player => player.id === watchedId) ?? null;
  const active = state.players.find(player => player.id === state.activePlayerId) ?? null;
  const inspected = inspectId ? state.cards[inspectId] ?? null : null;

  const hand = handMetrics(viewport.height, handCardWidth, soloSeat);
  const spotlightWidth = Math.round(Math.min(300, Math.max(180, viewport.width * 0.19)));

  const openSeat = useCallback((playerId: PlayerId) => {
    setFollow(false);
    setWatchedId(playerId);
    setSoloSeat(true);
    setInspectId(null);
  }, []);

  const winner =
    state.status === 'complete' && state.winnerIds.length > 0
      ? state.players.find(player => player.id === state.winnerIds[0]) ?? null
      : null;

  return (
    /* Fixed, not laid out: a running game takes the viewport and the app shell
       goes away, the same trade `/play` and `/life` make. Setup keeps the
       normal frame; only the game itself goes immersive. */
    <div className="fixed inset-0 z-50 flex overflow-hidden bg-background">
      <div className="relative min-h-0 min-w-0 flex-1">
        {/* THE BOARD. Not a copy of it. */}
        <PlayTable
          className="h-full w-full"
          state={state}
          viewerPlayerId={watchedId}
          /* Not "You". Nobody at this table is you. */
          viewerLabel="Watching"
          botPlayerIds={botPlayerIds}
          variant={state.players.length > 2 ? 'quads' : 'table'}
          focusPlayerId={soloSeat ? watchedId : null}
          cardWidth={boardCardWidth}
          topInset={HUD_INSET}
          bottomInset={hand.inset}
          onInspect={card => setInspectId(card.instanceId)}
          onFocusSeat={openSeat}
          attackerIds={attackerIds}
          blockerIds={blockerIds}
          inspectedId={inspectId}
          lifeDeltas={lifeDeltas}
        />

        {/* The card that just left a hand, held at the right edge so play
            continues underneath it. */}
        <CastSpotlight state={state} entry={spotlight} width={spotlightWidth} />

        {/*
          THE HAND. The owner could not see one at all.

          `/play` draws the human's hand here; this draws the watched seat's,
          from the same component, with the same castability read. So a card the
          bot cannot pay for is greyed out in its hand exactly as one of yours
          would be, which is half of "how they are casting" on its own.
        */}
        <ViewerHand
          className="absolute inset-x-0 bottom-2 z-30"
          state={state}
          viewerPlayerId={watchedId}
          cardWidth={hand.cardWidth}
          selectedId={inspectId}
          emptyLabel={watched ? `${watched.name} has no cards in hand` : 'No cards in hand'}
          onInspect={card => setInspectId(card.instanceId)}
        />

        {/* Whose hand this is, because it is not yours. */}
        {watched && (
          <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center"
               style={{ bottom: hand.inset + 4 }}>
            <span className="rounded-full bg-background/80 px-3 py-1 text-[11px] font-medium text-foreground shadow-md shadow-black/40 backdrop-blur-sm">
              {watched.name}
              <span className="ml-1.5 text-muted-foreground">
                hand, {watched.zones.hand.length} card{watched.zones.hand.length === 1 ? '' : 's'}
              </span>
            </span>
          </div>
        )}

        {/*
          WHAT JUST HAPPENED, in full.

          Owner: *"cant see ... how they are casting"*. The log says "Surrak cast
          Grizzly Bears"; this says what it was cast from and what was tapped to
          pay for it, read straight off the action batch the bot decided on. See
          `playLine.ts` for why it is not derived from the board.
        */}
        {lastPlay && (
          <div
            className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3"
            style={{ bottom: hand.inset + 34 }}
          >
            <div
              key={lastPlay.key}
              className="relative max-w-[46rem] overflow-hidden rounded-xl px-4 py-2 shadow-[0_14px_36px_rgba(0,0,0,0.6)]"
            >
              <Playmat tone="board" rounded="rounded-xl" className="absolute inset-0 h-full w-full" />
              <p className="relative text-sm leading-snug text-foreground">
                <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Turn {lastPlay.turn}
                </span>{' '}
                {lastPlay.line.text}
              </p>
            </div>
          </div>
        )}

        {/* The log, floating in the strip the hand is held over. */}
        <div className="pointer-events-none absolute bottom-2 left-2 z-40 w-56 max-w-[36vw]">
          <GameFeed state={state} feed={feed} variant="feed" />
        </div>

        <TurnBanner state={state} viewerPlayerId={watchedId} />

        {/*
          The result, drawn INTO the mat.

          This used to be `bg-background/90` plus `backdrop-blur-md`, which is a
          modal in everything but name and smeared the final board underneath
          it. Same fix `/play` took: a banner of the mat's own material, opaque,
          blurring nothing, covering no seat.
        */}
        {(state.status === 'complete' || halted) && (
          <div
            className="pointer-events-none absolute inset-x-0 z-[46] flex justify-center px-2"
            style={{ top: HUD_INSET + 8 }}
          >
            <div className="pointer-events-auto relative flex flex-wrap items-center justify-center gap-3 overflow-hidden rounded-xl px-5 py-3 shadow-[0_18px_46px_rgba(0,0,0,0.7)]">
              <Playmat tone="board" rounded="rounded-xl" className="absolute inset-0 h-full w-full" />
              <p className="relative text-base font-semibold text-foreground">
                {state.status === 'complete'
                  ? winner
                    ? `${winner.name} wins.`
                    : 'The game is a draw.'
                  : 'The game stopped.'}
              </p>
              {halted && (
                <p className="relative max-w-md text-xs text-muted-foreground">{halted}</p>
              )}
              <Button size="sm" className="relative h-8 text-xs" onClick={onRestart}>
                Play it again
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="relative h-8 text-xs"
                onClick={onLeave}
              >
                Change the decks
              </Button>
            </div>
          </div>
        )}

        {/*
          The preview, in the centre of the mat, read-only.

          Same component `/play` uses, so a card reads exactly the same way on
          both screens. `readOnly` drops the plays rather than drawing them
          disabled: nothing on this table takes instructions from you, and a
          button that does nothing is the failure this surface exists to answer.
        */}
        {inspected && (
          <CenterPreview
            state={state}
            viewerPlayerId={watchedId}
            card={inspected}
            readOnly
            boardWidth={viewport.width}
            boardHeight={viewport.height}
            topInset={HUD_INSET}
            bottomInset={hand.inset}
            onFocusSeat={openSeat}
            onClose={() => setInspectId(null)}
          />
        )}

        {/* THE CONTROLS. A watched game runs on time, so time is the control. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-background/80 px-3 py-1.5 backdrop-blur-md">
            <span className="text-xs font-semibold text-foreground">
              Turn {state.turn} · {active?.name ?? 'Nobody'}
            </span>
            <span className="text-[11px] text-muted-foreground">{STEP_LABELS[state.step]}</span>
          </div>

          {/* Whose eyes you are watching through. */}
          <div className="pointer-events-auto flex items-center gap-1 rounded-xl bg-background/80 px-2 py-1.5 backdrop-blur-md">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {state.players.map(player => (
              <button
                key={player.id}
                type="button"
                onClick={() => {
                  setFollow(false);
                  setWatchedId(player.id);
                }}
                aria-pressed={watchedId === player.id}
                title={`Watch the table from ${player.name}'s seat`}
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs transition-colors',
                  player.hasLost
                    ? 'text-muted-foreground line-through'
                    : watchedId === player.id
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {player.name} {player.life}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFollow(value => !value)}
              aria-pressed={follow}
              title="Move to whichever seat is taking its turn"
              className={cn(
                'ml-1 rounded-md px-2 py-0.5 text-[11px] transition-colors',
                follow ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Follow the turn
            </button>
            <button
              type="button"
              onClick={() => setSoloSeat(value => !value)}
              aria-pressed={soloSeat}
              title="Fill the screen with the seat you are watching"
              className={cn(
                'rounded-md px-2 py-0.5 text-[11px] transition-colors',
                soloSeat ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              One seat
            </button>
          </div>

          <div className="pointer-events-auto ml-auto flex items-center gap-1 rounded-xl bg-background/80 px-2 py-1.5 backdrop-blur-md">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onRunning(!running)}
              disabled={state.status !== 'playing'}
            >
              {running ? (
                <>
                  <Pause className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Pause
                </>
              ) : (
                <>
                  <Play className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Play
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={onStep}
              disabled={state.status !== 'playing'}
            >
              <ChevronsRight className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Step
            </Button>

            <span className="mx-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
              {SPEEDS.map(speed => (
                <button
                  key={speed.label}
                  type="button"
                  onClick={() => onSpeedMs(speed.ms)}
                  aria-pressed={speedMs === speed.ms}
                  title={`One decision every ${speed.ms} milliseconds`}
                  className={cn(
                    'rounded px-1.5 py-0.5 transition-colors',
                    speedMs === speed.ms ? 'bg-muted text-foreground' : 'hover:text-foreground'
                  )}
                >
                  {speed.label}
                </button>
              ))}
            </span>

            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onRestart}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Restart
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onLeave}>
              <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Leave
            </Button>
          </div>
        </div>

        {/*
          Cards changing zones, seen to change zones. It gates nothing: the
          reducer committed before it started drawing.
        */}
        <ZoneTravelLayer state={state} viewerPlayerId={watchedId} />
      </div>
    </div>
  );
}

export default WatchedTable;
