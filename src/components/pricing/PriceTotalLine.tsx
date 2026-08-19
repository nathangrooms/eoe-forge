import { cn } from '@/lib/utils';
import { describeGaps, describeGapsShort, formatTotal, type PriceTotal } from '@/lib/pricing';

/**
 * A total, plus what is missing from it.
 *
 * Deck value, collection value and box value are all sums over rows where some
 * rows have no price. Adding a missing price as zero makes the total quietly
 * too low while looking exact. So this never renders a bare number: if any copy
 * in the sum was unpriced it says how many, right there, and a caller cannot
 * skip that because the count comes in the same object as the amount.
 */

export interface PriceTotalLineProps {
  total: PriceTotal;
  label?: string;
  /** `short` fits a stat tile, `full` writes the sentence out. */
  detail?: 'short' | 'full';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-3xl',
} as const;

export function PriceTotalLine({
  total,
  label,
  detail = 'short',
  size = 'md',
  className,
}: PriceTotalLineProps) {
  const amount = total.pricedCopies > 0 ? formatTotal(total.amount, total.currency) : null;
  const gap = detail === 'full' ? describeGaps(total) : describeGapsShort(total);

  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      )}
      <p className={cn('font-semibold tabular-nums text-foreground', SIZE[size])}>
        {amount ?? <span className="font-normal text-muted-foreground">No prices yet</span>}
      </p>
      {gap && (
        <p
          className={cn('mt-0.5 text-muted-foreground', detail === 'full' ? 'text-xs' : 'text-[0.7rem]')}
          title={describeGaps(total) ?? undefined}
        >
          {gap}
        </p>
      )}
    </div>
  );
}
