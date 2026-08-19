import { cn } from '@/lib/utils';
import {
  finishLabelFor,
  formatAmount,
  primaryPrice,
  readPrices,
  type PriceCurrency,
  type PriceFinish,
  type PricedPrinting,
} from '@/lib/pricing';

/**
 * One price, for a grid tile or a list row where a full panel will not fit.
 *
 * The whole point is the null case. Grids across this product render
 * `formatPrice(0)` when a card has no price, which prints "$0.00" and tells a
 * player the card is worthless. 5,186 of 52,130 printings have no `usd` price
 * and 726 have no price at all, so that zero is on screen a lot. Here a missing
 * price is a dash with a real tooltip, and never a number.
 */

export interface PriceTagProps {
  card: PricedPrinting | null | undefined;
  /** Price the copy the player is actually holding or buying. */
  finish?: PriceFinish;
  currency?: PriceCurrency;
  /**
   * Multiply by copies held. The tag still shows a unit price when this is 1.
   */
  copies?: number;
  size?: 'sm' | 'md' | 'lg';
  /** Adds the market name under the number. Off in dense grids. */
  showMarket?: boolean;
  /**
   * Price EXACTLY the finish asked for, with no fall back to another one.
   *
   * The fallback is right when the question is "what is the copy I own roughly
   * worth", and wrong when the question is "what will this cost me". Craterhoof
   * Behemoth `cmm` is the case that showed it up: `usd` and `usd_foil` are both
   * null and `usd_etched` is 33.26, so a shopping row asking for a plain copy
   * fell back to the etched price and printed "$33.26 TCGplayer" beside a total
   * that had correctly left the card out. One screen, two answers.
   *
   * When the fallback DOES fire, the finish it landed on is named beside the
   * number, so the figure never passes itself off as the finish that was asked
   * for.
   */
  exact?: boolean;
  className?: string;
}

const SIZE = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
} as const;

export function PriceTag({
  card,
  finish = 'nonfoil',
  currency = 'USD',
  copies = 1,
  size = 'md',
  showMarket = false,
  exact = false,
  className,
}: PriceTagProps) {
  const found = primaryPrice(card, { finish, currency });
  const source = exact && found && found.finish !== finish ? null : found;

  if (!source || source.amount == null) {
    // The reading is only re-read in the empty case, which is cheap and keeps
    // the message specific: "never printed in foil" beats "no price" when we
    // can prove it.
    const reading = readPrices(card);
    const slot = reading.all.find(s => s.currency === currency && s.finish === finish);
    const label =
      slot?.missing === 'not-printed' ? 'Not printed in this finish' : 'No price for this printing';
    return (
      <span
        className={cn('tabular-nums text-muted-foreground', SIZE[size], className)}
        title={label}
        aria-label={label}
      >
        No price
      </span>
    );
  }

  const multiplier = Number.isFinite(copies) && copies > 0 ? Math.floor(copies) : 1;
  const shown = formatAmount(source.amount * multiplier, source.currency);

  return (
    <span className={cn('min-w-0', className)}>
      <span className={cn('tabular-nums text-foreground', SIZE[size])}>{shown}</span>
      {showMarket && (
        <span className="ml-1.5 text-[0.7rem] text-muted-foreground">
          {source.currency === 'TIX' ? 'Magic Online' : source.marketName}
          {/* Only when the number is not the finish that was asked for. Silence
              here would let an etched price stand in for a plain copy. */}
          {source.finish !== finish && ` ${finishLabelFor(source).toLowerCase()}`}
        </span>
      )}
    </span>
  );
}
