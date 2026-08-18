import { cn } from '@/lib/utils';
import { Wordmark } from '@/components/Wordmark';

/**
 * The DeckMatrix logo.
 *
 * Renders the supplied logotype artwork, falling back to the typographic
 * wordmark if the asset is missing — so the app never shows a broken image and
 * a missing file degrades to something presentable rather than to nothing.
 *
 * The asset is expected at `/logo-deckmatrix.webp` (public/), with TRANSPARENCY.
 * A logotype saved on a white ground will show as a white slab on the charcoal
 * chrome; see scripts/prepare-logo.mjs, which strips a white background and
 * emits the responsive sizes.
 */

const HEIGHTS = {
  sm: 'h-6',
  md: 'h-8',
  lg: 'h-12',
  xl: 'h-20',
} as const;

export function Logo({
  size = 'md',
  className,
}: {
  size?: keyof typeof HEIGHTS;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      <img
        src="/logo-deckmatrix.webp"
        srcSet="/logo-deckmatrix.webp 1x, /logo-deckmatrix@2x.webp 2x"
        alt="DeckMatrix"
        decoding="async"
        className={cn(HEIGHTS[size], 'w-auto object-contain')}
        onError={event => {
          /* Asset absent — reveal the typographic fallback beside it. */
          const img = event.currentTarget;
          img.style.display = 'none';
          const fallback = img.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.style.display = 'inline-flex';
        }}
      />
      <span style={{ display: 'none' }}>
        <Wordmark size={size === 'xl' ? 'xl' : size === 'lg' ? 'lg' : 'md'} />
      </span>
    </span>
  );
}

export default Logo;
