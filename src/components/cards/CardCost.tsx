import { ManaCost, type ManaCostSize } from '@/components/ui/mana-cost';
import { getManaCost } from '@/lib/scryfall/card-utils';
import { cn } from '@/lib/utils';

/**
 * A card's printed mana cost, split-card aware.
 *
 * Split and adventure cards carry a cost per face. `getManaCost` joins them as
 * `{1}{R} // {W}`, and feeding that whole string to `ManaCost` would silently
 * merge two different costs into one run of pips — a Magic player reads
 * "Wear // Tear" as a three-pip card instead of two separate halves. This keeps
 * the halves visually separated the way Scryfall prints them.
 */
export function CardCost({
  card,
  faceIndex,
  size = 'xs',
  className,
}: {
  card: any;
  faceIndex?: number;
  size?: ManaCostSize;
  className?: string;
}) {
  const cost = getManaCost(card, faceIndex);
  if (!cost) return null;

  const halves = cost.split('//').map(part => part.trim()).filter(Boolean);

  return (
    <span className={cn('inline-flex items-center gap-1 align-middle', className)}>
      {halves.map((half, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-muted-foreground">//</span>}
          <ManaCost cost={half} size={size} />
        </span>
      ))}
    </span>
  );
}
