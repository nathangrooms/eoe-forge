/**
 * The optimiser's own power-delta estimate — labelled as an estimate.
 *
 * This used to be a projection widget: it took the model's `edhImpact`, added
 * it to a "current level", and rendered `7.2 → 7.5` in a tooltip headed "Power
 * Level Projection". Two problems. The arithmetic was performed on a number the
 * model made up, and the result read exactly like the EDH power score, which is
 * a real measurement the app computes elsewhere. Design law says there is one
 * canonical power number; this was quietly minting a second.
 *
 * What survives is the honest part: the model said it thinks this swap is worth
 * roughly +0.2, so show that, say whose opinion it is, and show nothing at all
 * when no estimate came back. `impact` is deliberately `number | null` — the
 * caller passes through whatever the edge function returned, including nothing.
 */

import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PowerImpactBadgeProps {
  /** `null` when the model gave no estimate. Renders nothing. */
  impact: number | null | undefined;
  className?: string;
}

export function PowerImpactBadge({ impact, className }: PowerImpactBadgeProps) {
  // A missing estimate and a zero estimate both mean "no signal to show".
  if (typeof impact !== 'number' || Math.abs(impact) < 0.05) return null;

  const positive = impact > 0;

  return (
    <span
      title="The optimiser's own estimate of the power-level change — not the deck's EDH power score"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium tabular-nums',
        // A power delta is an MTG measurement, so it keeps the --power-*
        // tokens: gain reads low-power green, loss reads high-power red.
        positive ? 'text-power-1' : 'text-power-10',
        className
      )}
    >
      {positive ? (
        <TrendingUp className="h-3.5 w-3.5" />
      ) : (
        <TrendingDown className="h-3.5 w-3.5" />
      )}
      {positive ? '+' : ''}
      {impact.toFixed(1)} est. power
    </span>
  );
}
