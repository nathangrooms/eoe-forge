import { cn } from '@/lib/utils';

/**
 * The DeckMatrix wordmark.
 *
 * Set in the app's own face (Inter) rather than a display font, so the logotype
 * belongs to the same system as everything around it. The contrast is WEIGHT,
 * not colour or letterspacing: "Deck" extrabold against "Matrix" light. Both
 * halves stay full-strength foreground, so the mark holds up over artwork and
 * at small sizes where a muted half would fade out.
 *
 * Tracking is slightly negative — wide letterspacing on a logotype reads dated.
 */

const SIZES = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
  xl: 'text-6xl',
} as const;

export function Wordmark({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'select-none whitespace-nowrap leading-none tracking-[-0.03em] text-foreground',
        SIZES[size],
        className
      )}
      aria-label="DeckMatrix"
    >
      <span className="font-extrabold">Deck</span>
      <span className="font-light">Matrix</span>
    </span>
  );
}

export default Wordmark;
