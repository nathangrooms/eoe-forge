import { cn } from '@/lib/utils';

/**
 * The DeckMatrix wordmark.
 *
 * Replaces the dragon mascot with a typographic mark in Space Grotesk — a
 * modern geometric grotesque, not a fantasy face. Set tight rather than
 * letterspaced: wide tracking on a logotype reads dated.
 *
 * "Deck" takes the foreground colour and "Matrix" the muted one, so the mark
 * reads as a single word at small sizes but has structure at large ones. Pure
 * type, so it inherits the theme, stays crisp at any size, and needs no
 * separate light/dark asset.
 */

const SIZES = {
  sm: 'text-lg tracking-[-0.02em]',
  md: 'text-2xl tracking-[-0.025em]',
  lg: 'text-4xl tracking-[-0.03em]',
  xl: 'text-6xl tracking-[-0.035em]',
} as const;

export function Wordmark({
  size = 'md',
  className,
  mono = false,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  /** Render entirely in the current colour, for use over artwork. */
  mono?: boolean;
}) {
  return (
    <span
      className={cn('font-display select-none whitespace-nowrap font-bold leading-none', SIZES[size], className)}
      aria-label="DeckMatrix"
    >
      <span className={mono ? undefined : 'text-foreground'}>Deck</span>
      <span className={mono ? 'opacity-60' : 'text-muted-foreground'}>Matrix</span>
    </span>
  );
}

export default Wordmark;
