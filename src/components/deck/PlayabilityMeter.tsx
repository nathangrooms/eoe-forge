import { AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { CardPlayability, ManaProfile } from '@/lib/deck/playability';
import { describePlayability, playabilityBand } from '@/lib/deck/playabilityView';

/**
 * Castability, shown so it reads at a glance and explains itself on hover.
 *
 * Two encodings, deliberately redundant: bar length carries the magnitude, and
 * the bottom two bands recolour to `destructive`. Length alone is readable but
 * not *obvious* in a hundred-row table, and colour alone fails for anyone who
 * cannot separate the hues — together, a card you basically cannot cast stands
 * out of the list without anyone reading a digit.
 *
 * A land renders an em dash, never a zero and never a hundred. You do not cast
 * a land, so there is no probability to print, and printing one either way
 * would be a fabricated number in a column of real ones.
 */

export interface PlayabilityMeterProps {
  card: CardPlayability | null | undefined;
  profile: ManaProfile;
  /** `sm` for dense table rows, `md` under a grid tile. */
  size?: 'sm' | 'md';
  className?: string;
}

export function PlayabilityMeter({
  card,
  profile,
  size = 'sm',
  className,
}: PlayabilityMeterProps) {
  if (!card || card.pct === null) {
    return (
      <span className={cn('text-sm text-muted-foreground', className)}>
        <span aria-hidden>—</span>
        <span className="sr-only">
          {card?.skipped === 'land' ? 'A land, so nothing to cast' : 'No castability figure'}
        </span>
      </span>
    );
  }

  const band = playabilityBand(card.pct);
  const explanation = describePlayability(card, profile);
  const rounded = Math.round(card.pct);

  const meter = (
    <span
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap',
        size === 'md' && 'gap-2.5',
        className
      )}
    >
      <span
        className={cn(
          'relative block overflow-hidden rounded-full bg-muted',
          size === 'sm' ? 'h-1.5 w-16' : 'h-2 w-20'
        )}
        role="meter"
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${card.name}: ${rounded}% castable on turn ${card.turn}`}
      >
        <span
          className={cn('absolute inset-y-0 left-0 rounded-full', band.fillClass)}
          style={{ width: `${Math.max(card.pct, 2)}%` }}
        />
      </span>
      {/* Fixed width, right-aligned. "20%" and "100%" are different widths, so
          a free-flowing span put every bar at a different x down the column —
          and comparing bar lengths at a glance is the entire point of the
          column. The track has to start at the same place on every row. */}
      <span
        className={cn(
          'shrink-0 text-right font-semibold tabular-nums',
          // Wide enough for the longest value, "100%≈", so the ≈ never clips.
          size === 'sm' ? 'w-12 text-sm' : 'w-16 text-base',
          band.textClass
        )}
      >
        {rounded}%{card.approximate ? '≈' : ''}
      </span>
    </span>
  );

  if (!explanation) return meter;

  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <span className="cursor-help">{meter}</span>
      </TooltipTrigger>
      {/* Wide, because the whole point is a sentence a player can act on and
          a 200px tooltip would wrap it into confetti. */}
      <TooltipContent side="left" className="max-w-md p-3 text-left">
        <p className="text-sm font-semibold">
          {explanation.headline}
          <span className="ml-2 font-normal text-muted-foreground">{band.label}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{explanation.cost}</p>
        <ul className="mt-2 space-y-1">
          {explanation.reasons.map(reason => (
            <li key={reason} className="text-xs leading-relaxed">
              {reason}
            </li>
          ))}
        </ul>
        {explanation.approximate && (
          <p className="mt-2 text-xs text-muted-foreground">
            This one was too tangled to solve exactly. Treat the figure as close rather than
            precise.
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The overlay for a card tile.
 *
 * Only the two problem bands get a badge over the art. Stamping a percentage
 * on all ninety-nine tiles would bury the signal under itself, and the meter
 * beneath the tile already carries the figure for every card.
 */
export function PlayabilityFlag({
  card,
  className,
}: {
  card: CardPlayability | null | undefined;
  className?: string;
}) {
  if (!card || card.pct === null) return null;
  const band = playabilityBand(card.pct);
  if (band.id !== 'hard' && band.id !== 'unlikely') return null;

  return (
    <span
      className={cn(
        // Sits over card art, so it needs its own opaque ground rather than a
        // surface token that assumes the page background behind it.
        'absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-destructive px-1.5 py-0.5 text-xs font-bold text-destructive-foreground shadow-sm',
        className
      )}
      title={`${Math.round(card.pct)}% castable on turn ${card.turn}`}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      {Math.round(card.pct)}%
    </span>
  );
}

export default PlayabilityMeter;
