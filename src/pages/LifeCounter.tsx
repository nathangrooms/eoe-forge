/**
 * DeckMatrix — the full-screen life counter.
 *
 * Built for a phone or tablet lying flat in the middle of a Commander table,
 * and usable on a desktop without changing anything. `/life` renders outside the
 * app shell (see `App.tsx`): no top bar, no rail, no page padding — the board is
 * the whole screen.
 *
 * The rules live in `src/lib/game`, the seat geometry in `src/lib/game/seating`,
 * the session and undo in `useLifeGame`. This file is the assembly: which panel
 * is showing, and the two device capabilities a table counter wants — full
 * screen and a wake lock, both feature-detected and both optional.
 *
 * Nothing here is a modal. Reset confirms in place inside the game menu, which
 * is itself a positioned region rather than an overlay.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Trophy, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { seatAt, type PlayerId, type SeatingVariant } from '@/lib/game';

import { GameMenu } from '@/components/life/GameMenu';
import { LifeSetup } from '@/components/life/LifeSetup';
import { PlayerDetail } from '@/components/life/PlayerDetail';
import { PlayerPanel } from '@/components/life/PlayerPanel';
import { DEFAULT_MAT_ORDER } from '@/components/life/mats';
import {
  quickStartConfig,
  savePrefs,
  syncConfig,
  type LifeGameConfig,
} from '@/components/life/session';
import {
  useFullscreen,
  usePrefersReducedMotion,
  useScrollLock,
  useWakeLock,
} from '@/components/life/useImmersive';
import { useLifeGame } from '@/components/life/useLifeGame';
import { useMatArt } from '@/components/life/useMatArt';

export default function LifeCounter() {
  const navigate = useNavigate();
  const game = useLifeGame();

  /* Land on setup EVERY time rather than silently resuming the last game. A
     persisted session meant opening /life always dropped you into whatever was
     played last — usually a stale 4-player pod — with no way to see the
     player-count choice. Setup now offers Resume explicitly instead. */
  const [setupOpen, setSetupOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailPlayerId, setDetailPlayerId] = useState<PlayerId | null>(null);

  const reducedMotion = usePrefersReducedMotion();
  const fullscreen = useFullscreen();
  const wakeLock = useWakeLock(!!game.session);
  useScrollLock(true);

  /* One lookup for the whole feature, shared with setup through a module-level
     cache. Every mat still renders without it — the artwork is the second half
     of a mat, never the whole of one. */
  const matArt = useMatArt();

  const { session, state, layout, view, undo, flush, dispatch, nudge } = game;
  const showSetup = !session || setupOpen;

  // Leaving the counter should not leave the browser stuck in full screen.
  const exitFullscreen = fullscreen.exit;
  useEffect(() => () => exitFullscreen(), [exitFullscreen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      // Renaming a player is a text field; ctrl+Z there means undo the typing.
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo]);

  const setupConfig = useMemo<LifeGameConfig>(() => {
    // No game in progress: open on the table this device played last — pod size,
    // seat colours, names and format all pre-filled, so Start is one press and
    // nothing needs choosing. Falls back to a four-player Commander pod.
    if (!session) return quickStartConfig();
    // Carry the live names and colours into setup, not the ones typed at the
    // start of the last game.
    return syncConfig(session.config, session.state);
  }, [session]);

  const handleStart = useCallback(
    (config: LifeGameConfig) => {
      game.start(config);
      // Remember the table, not the game. The session is cleared when a pod
      // breaks up; these are the habits that should survive it.
      savePrefs(config);
      setSetupOpen(false);
      setDetailPlayerId(null);
      // Requested from inside the click that started the game, which is the only
      // time a browser will grant it.
      fullscreen.enter();
    },
    [fullscreen, game],
  );

  const handleExit = useCallback(() => {
    flush();
    fullscreen.exit();
    navigate('/');
  }, [flush, fullscreen, navigate]);

  if (showSetup) {
    return (
      <LifeSetup
        initialConfig={setupConfig}
        onCancel={session ? () => setSetupOpen(false) : undefined}
        onStart={handleStart}
        onExit={() => navigate('/')}
      />
    );
  }

  if (!state || !layout) return null;

  const complete = state.status === 'complete';
  const detailPlayer = detailPlayerId ? state.players.find(p => p.id === detailPlayerId) : undefined;
  const detailSeat = detailPlayer ? seatAt(layout, detailPlayer.seat) : undefined;
  const winners = state.winnerIds
    .map(id => state.players.find(player => player.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <>
      {/*
        `touch-action: none` lives on the board, not on the body: the property is
        evaluated up the ancestor chain, and putting it higher would also stop the
        detail sheet from scrolling.
      */}
      <div
        className="fixed inset-0 z-40 select-none bg-background"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
          touchAction: 'none',
        }}
        onContextMenu={event => event.preventDefault()}
      >
        <div className="relative h-full w-full">
          {state.players.map(player => {
            const seat = seatAt(layout, player.seat);
            if (!seat) return null;
            // `player.seat` is the index into the config's seat list by
            // construction — `createGame` numbers seats in the order they were
            // passed — so the mat chosen at setup follows the player.
            const mat =
              session.config.seats[player.seat]?.mat
              ?? DEFAULT_MAT_ORDER[player.seat % DEFAULT_MAT_ORDER.length];
            return (
              <PlayerPanel
                key={player.id}
                player={player}
                seat={seat}
                view={view[player.id]}
                rules={state.rules}
                mat={mat}
                matArt={matArt[mat]?.art}
                interactive={!complete}
                orientation={session?.options.orientation ?? 'shared'}
                reducedMotion={reducedMotion}
                onNudgeLife={delta => nudge({ kind: 'life', playerId: player.id }, delta)}
                onOpenDetail={() => setDetailPlayerId(player.id)}
              />
            );
          })}

          {/* The one control cluster every seat can reach. */}
          <div className="absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-popover p-1.5 shadow-[0_2px_10px_hsl(0_0%_0%/0.45)]">
            {complete && (
              <div className="flex items-center gap-2 pl-3 pr-1">
                <Trophy aria-hidden className="h-4 w-4 shrink-0 text-type-commander" />
                <p className="whitespace-nowrap text-sm font-semibold">
                  {winners.length === 1
                    ? `${winners[0]} wins`
                    : winners.length > 1
                      ? `${winners.join(' & ')} win`
                      : 'Draw'}
                </p>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-full"
              disabled={!game.canUndo}
              onClick={undo}
              aria-label={game.hasPending ? 'Cancel the change in progress' : 'Undo the last change'}
            >
              <Undo2 className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={() => {
                flush();
                setMenuOpen(true);
              }}
              aria-label="Game menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {detailPlayer && detailSeat && (
        <PlayerDetail
          player={detailPlayer}
          seat={detailSeat}
          state={state}
          view={view[detailPlayer.id]}
          partners={session.options.partners}
          onNudge={nudge}
          onRename={name => dispatch({ type: 'SET_PLAYER_NAME', playerId: detailPlayer.id, name })}
          onConcede={() => {
            dispatch({ type: 'CONCEDE', playerId: detailPlayer.id, actorId: detailPlayer.id });
            setDetailPlayerId(null);
          }}
          onSetPartner={game.setPartner}
          onUndo={() => {
            undo();
            setDetailPlayerId(null);
          }}
          onClose={() => setDetailPlayerId(null)}
        />
      )}

      <GameMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        state={state}
        options={session.options}
        fullscreen={fullscreen}
        wakeLock={wakeLock}
        canUndo={game.canUndo}
        onUndo={undo}
        onReset={() => {
          game.resetGame();
          setDetailPlayerId(null);
        }}
        onRequestNewGame={() => {
          setMenuOpen(false);
          setSetupOpen(true);
        }}
        onSetVariant={(variant: SeatingVariant) => game.setOptions({ variant })}
        onExit={handleExit}
      />
    </>
  );
}
