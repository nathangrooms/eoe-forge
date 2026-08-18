/**
 * Playtest — the game, playing.
 *
 * This deliberately renders `PlayTable`, the exact board `/play` draws, rather
 * than a second board that would drift from it. The only differences are that
 * nobody here is holding a hand and that the controls run time instead of
 * making plays: pause, step, speed, restart.
 *
 * Owner: *"it also doesn't utilise page width"* — so the running game takes the
 * viewport, the same trade `/play` and `/life` make once a table exists. Setup
 * stays inside the app shell; only the game goes immersive.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronsRight,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PlayTable } from '@/components/play/PlayTable';
import { BoardRail, railWidthFor } from '@/components/play/BoardRail';
import { STEP_LABELS, type CardInstance, type GameState, type PlayerId } from '@/lib/game';
import { PlaytestInspector } from './PlaytestInspector';
import type { AutoGameEntry } from './useAutoGame';

/** Milliseconds between decisions, slowest first. */
const SPEEDS: Array<{ label: string; ms: number }> = [
  { label: '0.5×', ms: 900 },
  { label: '1×', ms: 450 },
  { label: '2×', ms: 200 },
  { label: '4×', ms: 90 },
  { label: 'Max', ms: 0 },
];

export interface PlaytestTableProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  botPlayerIds: readonly PlayerId[];
  feed: AutoGameEntry[];
  halted: string | null;
  running: boolean;
  onRunning: (next: boolean) => void;
  speedMs: number;
  onSpeedMs: (next: number) => void;
  onStep: () => void;
  onRestart: () => void;
  onLeave: () => void;
}

export function PlaytestTable({
  state,
  viewerPlayerId,
  botPlayerIds,
  feed,
  halted,
  running,
  onRunning,
  speedMs,
  onSpeedMs,
  onStep,
  onRestart,
  onLeave,
}: PlaytestTableProps) {
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
  }));

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const inspected = inspectId ? state.cards[inspectId] ?? null : null;
  const railWidth = railWidthFor(viewport.width);

  const attackerIds = useMemo(
    () => state.combat.attackers.map(declaration => declaration.attackerId),
    [state]
  );
  const blockerIds = useMemo(
    () => state.combat.attackers.flatMap(declaration => declaration.blockedBy),
    [state]
  );

  const active = state.players.find(player => player.id === state.activePlayerId);
  /* Six, not fourteen. The feed floats over the table, and a fourteen-line
     column is tall enough to sit on the near seat's lands row — which is the
     one thing nothing on this surface is allowed to cover. */
  const tail = feed.slice(-6);

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden bg-background">
      <div className="relative min-h-0 min-w-0 flex-1">
        <PlayTable
          className="h-full w-full"
          state={state}
          viewerPlayerId={viewerPlayerId}
          botPlayerIds={botPlayerIds}
          variant={state.players.length > 2 ? 'quads' : 'table'}
          cardWidth={168}
          topInset={52}
          /* The strip the feed floats in, kept clear of every seat's board. */
          bottomInset={72}
          onInspect={card => setInspectId((card as CardInstance).instanceId)}
          attackerIds={attackerIds}
          blockerIds={blockerIds}
          inspectedId={inspectId}
        />

        {/* What is happening, as prose, over the bottom-left of the table. */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-40 w-60 max-w-[28vw] space-y-0.5">
          {tail.map(entry => (
            <p
              key={entry.id}
              className="truncate rounded-md bg-background/70 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur-sm"
            >
              <span className="text-foreground">T{entry.turn}</span> {entry.text}
            </p>
          ))}
        </div>

        {/* The controls float over the table rather than boxing it in. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center gap-2 px-3 py-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-background/80 px-3 py-1.5 backdrop-blur-md">
            <span className="text-xs font-semibold text-foreground">
              Turn {state.turn} · {active?.name ?? '—'}
            </span>
            <span className="text-[11px] text-muted-foreground">{STEP_LABELS[state.step]}</span>
          </div>

          <div className="pointer-events-auto flex items-center gap-1 rounded-xl bg-background/80 px-2 py-1.5 backdrop-blur-md">
            {state.players.map(player => (
              <span
                key={player.id}
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs',
                  player.hasLost
                    ? 'text-muted-foreground line-through'
                    : player.id === state.activePlayerId
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground'
                )}
              >
                {player.name} {player.life}
              </span>
            ))}
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
                  className={cn(
                    'rounded px-1.5 py-0.5 transition-colors',
                    speedMs === speed.ms
                      ? 'bg-muted text-foreground'
                      : 'hover:text-foreground'
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

        {(state.status === 'complete' || halted) && (
          <div className="pointer-events-none absolute inset-x-0 top-16 z-[60] flex justify-center">
            <div className="pointer-events-auto max-w-md rounded-2xl bg-background/90 px-6 py-4 text-center shadow-2xl shadow-black/70 backdrop-blur-md">
              <p className="text-lg font-semibold text-foreground">
                {state.status === 'complete'
                  ? state.winnerIds.length > 0
                    ? `${state.players.find(p => p.id === state.winnerIds[0])?.name} wins.`
                    : 'The game is a draw.'
                  : 'The game stopped.'}
              </p>
              {halted && <p className="mt-1 text-xs text-muted-foreground">{halted}</p>}
              <div className="mt-3 flex justify-center gap-2">
                <Button size="sm" className="h-8 text-xs" onClick={onRestart}>
                  Play it again
                </Button>
                <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={onLeave}>
                  Change the decks
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reading a card is part of the board here too — never a modal. */}
      {inspected && (
        <BoardRail width={railWidth} topInset={52}>
          <PlaytestInspector state={state} card={inspected} onClose={() => setInspectId(null)} />
        </BoardRail>
      )}
    </div>
  );
}
