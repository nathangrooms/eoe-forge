/**
 * DeckMatrix — life counter: a labelled +/- row.
 *
 * Used for everything on the detail sheet that is not the life total itself:
 * commander damage, poison, energy, experience. Same press-and-hold behaviour as
 * the panels, same pending-buffer semantics, 44px minimum targets throughout —
 * these get used mid-game with a hand of cards in the other hand.
 */

import type { ComponentType, ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useHoldRepeat } from './useHoldRepeat';
import { haptic } from './useImmersive';

export interface StepButtonProps {
  direction: 1 | -1;
  label: string;
  disabled?: boolean;
  onStep: (delta: number) => void;
}

export function StepButton({ direction, label, disabled, onStep }: StepButtonProps) {
  const handlers = useHoldRepeat({
    enabled: !disabled,
    onStep: () => {
      onStep(direction);
      haptic(6);
    },
  });

  const Glyph = direction === 1 ? Plus : Minus;

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground',
        'transition-colors duration-100 motion-reduce:transition-none',
        'hover:bg-accent active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:opacity-30',
      )}
      style={{ touchAction: 'none' }}
      {...handlers}
    >
      <Glyph aria-hidden className="h-5 w-5" />
    </button>
  );
}

export interface StepperProps {
  label: string;
  /** Already includes anything still buffered. */
  value: number;
  /** Buffered change, shown next to the value so a mis-tap is visible. */
  delta?: number;
  /** Threshold that kills, e.g. 21 commander damage or 10 poison. */
  lethal?: number;
  icon?: ComponentType<{ className?: string }>;
  tone?: string;
  hint?: ReactNode;
  disabled?: boolean;
  min?: number;
  onStep: (delta: number) => void;
}

export function Stepper({
  label,
  value,
  delta = 0,
  lethal,
  icon: Icon,
  tone,
  hint,
  disabled,
  min = 0,
  onStep,
}: StepperProps) {
  const isLethal = lethal !== undefined && value >= lethal;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className={cn('flex items-center gap-1.5 text-sm font-medium', tone ?? 'text-foreground')}>
          {Icon && <Icon aria-hidden className="h-4 w-4 shrink-0" />}
          <span className="truncate">{label}</span>
        </div>
        {hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>}
      </div>

      <div className="flex items-center gap-2">
        <StepButton
          direction={-1}
          label={`${label}: subtract 1`}
          disabled={disabled || value <= min}
          onStep={onStep}
        />
        <div className="w-16 text-center leading-none">
          <div
            className={cn(
              'text-2xl font-semibold tabular-nums',
              isLethal ? 'text-destructive' : 'text-foreground',
            )}
          >
            {value}
            {lethal !== undefined && (
              <span className="text-sm font-normal text-muted-foreground">/{lethal}</span>
            )}
          </div>
          {delta !== 0 && (
            <div className="mt-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {delta > 0 ? `+${delta}` : delta}
            </div>
          )}
        </div>
        <StepButton direction={1} label={`${label}: add 1`} disabled={disabled} onStep={onStep} />
      </div>
    </div>
  );
}
