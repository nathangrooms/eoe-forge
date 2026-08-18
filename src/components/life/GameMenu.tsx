/**
 * DeckMatrix — life counter: the table menu.
 *
 * Everything that is not "change a number" lives behind one button in the middle
 * of the board, because the middle is the one place all four players can reach
 * and the one place no panel wants to own.
 *
 * This dialog is the only surface that is *not* rotated to a seat: it is
 * operated by whoever owns the device, so it reads in the device's own
 * orientation like the rest of the app.
 */

import { useState } from 'react';
import {
  Dices,
  Maximize,
  Minimize,
  MonitorSmartphone,
  Plus,
  RotateCcw,
  Undo2,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { seatingVariants, type GameState, type SeatingVariant } from '@/lib/game';

import type { LifeOptions } from './session';
import type { FullscreenControl, WakeLockStatus } from './useImmersive';

export interface GameMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: GameState;
  options: LifeOptions;
  fullscreen: FullscreenControl;
  wakeLock: WakeLockStatus;
  canUndo: boolean;
  onUndo: () => void;
  onRequestReset: () => void;
  onRequestNewGame: () => void;
  onSetVariant: (variant: SeatingVariant) => void;
  onExit: () => void;
}

export function GameMenu({
  open,
  onOpenChange,
  state,
  options,
  fullscreen,
  wakeLock,
  canUndo,
  onUndo,
  onRequestReset,
  onRequestNewGame,
  onSetVariant,
  onExit,
}: GameMenuProps) {
  const [firstPlayer, setFirstPlayer] = useState<string | null>(null);

  const variants = seatingVariants(state.players.length);
  const recent = state.log.slice(-6).reverse();

  const rollFirstPlayer = () => {
    const alive = state.players.filter(player => !player.hasLost);
    const pool = alive.length > 0 ? alive : state.players;
    // Presentation only — the deterministic core never calls Math.random itself.
    const picked = pool[Math.floor(Math.random() * pool.length)];
    setFirstPlayer(picked?.name ?? null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto rounded-2xl border-0 bg-popover p-4 motion-reduce:animate-none sm:rounded-2xl"
      >
        <DialogTitle className="text-base font-semibold">
          {state.rules.label} · {state.players.length} players
        </DialogTitle>
        <DialogDescription className="sr-only">
          Undo, reset, seating and screen options for the running game.
        </DialogDescription>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="h-12 justify-start"
            disabled={!canUndo}
            onClick={() => {
              onUndo();
              onOpenChange(false);
            }}
          >
            <Undo2 className="h-4 w-4" />
            Undo
          </Button>

          <Button variant="secondary" className="h-12 justify-start" onClick={onRequestReset}>
            <RotateCcw className="h-4 w-4" />
            Reset life
          </Button>

          <Button variant="secondary" className="h-12 justify-start" onClick={rollFirstPlayer}>
            <Dices className="h-4 w-4" />
            Who starts?
          </Button>

          <Button
            variant="secondary"
            className="h-12 justify-start"
            disabled={!fullscreen.supported}
            onClick={fullscreen.toggle}
          >
            {fullscreen.isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            {fullscreen.isFullscreen ? 'Exit full screen' : 'Full screen'}
          </Button>
        </div>

        {firstPlayer && (
          <p className="rounded-xl bg-muted/50 px-3 py-2 text-center text-sm">
            <span className="font-semibold">{firstPlayer}</span> goes first
          </p>
        )}

        {variants.length > 1 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Seating</h3>
            <div className="flex flex-col gap-1.5">
              {variants.map(variant => {
                const active = (options.variant ?? 'table') === variant.variant;
                return (
                  <button
                    key={variant.variant}
                    type="button"
                    onClick={() => onSetVariant(variant.variant)}
                    className={cn(
                      'rounded-xl px-3 py-2.5 text-left text-sm transition-colors motion-reduce:transition-none',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {variant.description}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent</h3>
            <ul className="flex flex-col gap-1">
              {recent.map((event, index) => (
                <li key={`${event.seq}-${index}`} className="truncate text-sm text-muted-foreground">
                  {event.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-col gap-2">
          <Button className="h-12 justify-start" onClick={onRequestNewGame}>
            <Plus className="h-4 w-4" />
            New game
          </Button>
          <Button variant="ghost" className="h-11 justify-start text-muted-foreground" onClick={onExit}>
            <X className="h-4 w-4" />
            Leave the life counter
          </Button>
        </div>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" />
          {wakeLock.held
            ? 'Screen is being kept awake.'
            : wakeLock.supported
              ? 'Screen wake lock is unavailable right now.'
              : 'This browser cannot keep the screen awake.'}
        </p>
      </DialogContent>
    </Dialog>
  );
}
