/**
 * DeckMatrix — life counter: pre-game setup.
 *
 * Shown when there is no game to resume, and again whenever somebody asks for a
 * new one. Deliberately short: pod size, format, life total, and optionally who
 * is sitting where. Everything else is adjustable mid-game from a panel.
 *
 * Colour identity is here for one practical reason — four charcoal panels look
 * identical at arm's length, and a row of mana pips is how a player finds their
 * own seat without reading anything.
 */

import { useEffect, useState } from 'react';
import { ChevronLeft, Play } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ManaPip } from '@/components/ui/mana-cost';
import { startingLifeFor, type Format, type ManaColor } from '@/lib/game';

import { StepButton } from './Stepper';
import {
  LIFE_FORMATS,
  MAX_STARTING_LIFE,
  MIN_STARTING_LIFE,
  PLAYER_COUNTS,
  WUBRG,
  resizeSeats,
  type LifeGameConfig,
} from './session';

const LIFE_PRESETS = [20, 25, 30, 40];

export interface LifeSetupProps {
  initialConfig: LifeGameConfig;
  /** Present when a game is already running — setup can be backed out of. */
  onCancel?: () => void;
  onStart: (config: LifeGameConfig) => void;
  onExit: () => void;
}

export function LifeSetup({ initialConfig, onCancel, onStart, onExit }: LifeSetupProps) {
  const [format, setFormat] = useState<Format>(initialConfig.format);
  const [seats, setSeats] = useState(initialConfig.seats);
  const [startingLife, setStartingLife] = useState(initialConfig.startingLife);
  /** Once the total is typed by hand, changing format stops overwriting it. */
  const [lifeTouched, setLifeTouched] = useState(false);

  const playerCount = seats.length;

  useEffect(() => {
    if (lifeTouched) return;
    setStartingLife(startingLifeFor(format, playerCount));
  }, [format, playerCount, lifeTouched]);

  const setCount = (count: number) => setSeats(current => resizeSeats(current, count));

  const toggleColor = (index: number, color: ManaColor) => {
    setSeats(current =>
      current.map((seat, i) => {
        if (i !== index) return seat;
        const has = seat.colors.includes(color);
        return {
          ...seat,
          colors: has ? seat.colors.filter(c => c !== color) : [...seat.colors, color],
        };
      }),
    );
  };

  const start = () => {
    onStart({
      format,
      startingLife: Math.min(MAX_STARTING_LIFE, Math.max(MIN_STARTING_LIFE, startingLife)),
      seats,
    });
  };

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-4 p-4 pb-10">
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            variant="ghost"
            className="h-10 -ml-2 px-2 text-muted-foreground"
            onClick={onCancel ?? onExit}
          >
            <ChevronLeft className="h-4 w-4" />
            {onCancel ? 'Back to the game' : 'DeckMatrix'}
          </Button>
          <h1 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Life counter
          </h1>
        </div>

        {/* Pod size */}
        <section className="flex flex-col gap-2 rounded-2xl bg-card p-3">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Players
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {PLAYER_COUNTS.map(count => (
              <button
                key={count}
                type="button"
                onClick={() => setCount(count)}
                aria-pressed={playerCount === count}
                className={cn(
                  'h-16 rounded-xl text-2xl font-semibold transition-colors motion-reduce:transition-none',
                  playerCount === count
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                )}
              >
                {count}
              </button>
            ))}
          </div>
        </section>

        {/* Format */}
        <section className="flex flex-col gap-2 rounded-2xl bg-card p-3">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Format
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {LIFE_FORMATS.map(option => (
              <button
                key={option.format}
                type="button"
                onClick={() => setFormat(option.format)}
                aria-pressed={format === option.format}
                className={cn(
                  'rounded-xl px-3 py-2.5 text-left transition-colors motion-reduce:transition-none',
                  format === option.format
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 hover:bg-muted',
                )}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span
                  className={cn(
                    'block text-xs',
                    format === option.format ? 'text-primary-foreground/70' : 'text-muted-foreground',
                  )}
                >
                  {option.note}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Starting life */}
        <section className="flex flex-col gap-3 rounded-2xl bg-card p-3">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Starting life
          </h2>
          <div className="flex items-center justify-between gap-3">
            <StepButton
              direction={-1}
              label="Lower starting life"
              disabled={startingLife <= MIN_STARTING_LIFE}
              onStep={delta => {
                setLifeTouched(true);
                setStartingLife(current => Math.max(MIN_STARTING_LIFE, current + delta));
              }}
            />
            <span className="text-4xl font-semibold tabular-nums">{startingLife}</span>
            <StepButton
              direction={1}
              label="Raise starting life"
              disabled={startingLife >= MAX_STARTING_LIFE}
              onStep={delta => {
                setLifeTouched(true);
                setStartingLife(current => Math.min(MAX_STARTING_LIFE, current + delta));
              }}
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {LIFE_PRESETS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setLifeTouched(true);
                  setStartingLife(preset);
                }}
                className={cn(
                  'h-10 rounded-xl text-sm font-semibold tabular-nums transition-colors motion-reduce:transition-none',
                  startingLife === preset
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        </section>

        {/* Seats */}
        <section className="flex flex-col gap-2 rounded-2xl bg-card p-3">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Seats
          </h2>
          {seats.map((seat, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2">
              <Input
                value={seat.name}
                maxLength={24}
                aria-label={`Player ${index + 1} name`}
                placeholder={`Player ${index + 1}`}
                onChange={event => {
                  const { value } = event.target;
                  setSeats(current => current.map((s, i) => (i === index ? { ...s, name: value } : s)));
                }}
                className="h-11 border-0 bg-background/60 font-medium"
              />
              <div className="flex items-center gap-1.5 px-1">
                {WUBRG.map(color => {
                  const active = seat.colors.includes(color);
                  return (
                    <button
                      key={color}
                      type="button"
                      aria-pressed={active}
                      aria-label={`${color} in ${seat.name || `player ${index + 1}`} colour identity`}
                      onClick={() => toggleColor(index, color)}
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-full transition-opacity motion-reduce:transition-none',
                        active ? 'opacity-100' : 'opacity-25',
                      )}
                    >
                      <ManaPip symbol={color} size="lg" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <Button className="h-14 text-base" onClick={start}>
          <Play className="h-5 w-5" />
          Start game
        </Button>
      </div>
    </div>
  );
}
