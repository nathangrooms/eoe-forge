import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getBestCardImage,
  getCardFaces,
  hasBackFace,
  type ScryfallImageSize,
} from '@/lib/scryfall/card-utils';

/**
 * The one card image in the product.
 *
 * Two rules it exists to enforce:
 *
 * 1. **Resolution follows rendered size.** Cards used to be drawn from the
 *    `small` (146px) or `normal` (488px) Scryfall image at 200–340px on screen,
 *    which is exactly why they read as soft everywhere. Anything `md` or larger
 *    asks for `large` (672px); `small` is reserved for genuinely tiny inline
 *    thumbnails.
 * 2. **Double-faced cards flip.** The back face lives on `card_faces` (Scryfall)
 *    or the `faces` jsonb column (our `cards` table); both are read through
 *    `card-utils`, and a transform/MDFC card gets a real flip affordance.
 */

export type CardImageSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Nominal width per size token, and the Scryfall resolution drawn at it.
 * `md` and above default to `large` — that is the whole point of this table.
 *
 * The bytes are worth it. `normal` is 488 px wide, so on the 2× displays most
 * people browse on it is already under-sampled at `md` (180 CSS px → 360 device
 * px) and visibly soft by `lg` (500 device px). `large` is 672 px and covers
 * every grid size. The loading cost that actually hurts is request *count*, and
 * that is handled separately by the blur-up rule below.
 */
export const CARD_IMAGE_SIZES: Record<
  CardImageSize,
  { width: number; quality: ScryfallImageSize }
> = {
  xs: { width: 48, quality: 'small' },
  sm: { width: 110, quality: 'normal' },
  md: { width: 180, quality: 'large' },
  lg: { width: 250, quality: 'large' },
  xl: { width: 340, quality: 'large' },
};

/** A real Magic card is 63 × 88 mm with a 3 mm corner radius. */
export const CARD_ASPECT = '488 / 680';
const CARD_RADIUS = '4.75% / 3.4%';

/** Pick the size token a raw pixel width belongs to, so the slider drives quality too. */
export function cardSizeForWidth(width: number): CardImageSize {
  if (width <= 64) return 'xs';
  if (width <= 128) return 'sm';
  if (width <= 200) return 'md';
  if (width <= 285) return 'lg';
  return 'xl';
}

const SHADOW: Record<CardImageSize, string> = {
  xs: 'shadow-sm shadow-black/30',
  sm: 'shadow-md shadow-black/30',
  md: 'shadow-lg shadow-black/30',
  lg: 'shadow-lg shadow-black/40',
  xl: 'shadow-xl shadow-black/40',
};

export interface CardImageProps {
  /** Any card shape: a Scryfall object or a row from the `cards` table. */
  card: any;
  size?: CardImageSize;
  /**
   * Explicit rendered width in px — normally straight from `CardSizeSlider`.
   * Overrides `size` for both layout and the resolution requested.
   */
  width?: number;
  /** Stretch to the parent instead of taking a fixed width. Use inside `CardGrid`. */
  fill?: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Hover lift + pointer cursor. Defaults to true when `onClick` is given. */
  interactive?: boolean;
  /** Ask for `png` (transparent rounded corners) rather than `large`. */
  transparent?: boolean;
  /** Which face to show initially. Controlled when paired with `onFaceChange`. */
  faceIndex?: number;
  onFaceChange?: (index: number) => void;
  /** Hide the flip button even on a double-faced card. */
  hideFlip?: boolean;
  /** Skip lazy-loading for the handful of cards above the fold. */
  eager?: boolean;
  className?: string;
  /** Classes for the image frame itself (ring, opacity, grayscale…). */
  imageClassName?: string;
  title?: string;
  /** Rendered on top of the art — quantity pills, selection ticks, price tags. */
  children?: React.ReactNode;
}

export function CardImage({
  card,
  size,
  width,
  fill = false,
  onClick,
  interactive,
  transparent = false,
  faceIndex,
  onFaceChange,
  hideFlip = false,
  eager = false,
  className,
  imageClassName,
  title,
  children,
}: CardImageProps) {
  const resolved: CardImageSize = size ?? (width ? cardSizeForWidth(width) : 'md');
  const renderedWidth = width ?? CARD_IMAGE_SIZES[resolved].width;

  const [internalFace, setInternalFace] = useState(faceIndex ?? 0);
  const face = faceIndex ?? internalFace;

  const flippable = !hideFlip && hasBackFace(card) && getCardFaces(card).length > 1;

  const quality: ScryfallImageSize = transparent
    ? 'png'
    : CARD_IMAGE_SIZES[resolved].quality;

  const src = useMemo(
    () => getBestCardImage(card, quality, face),
    [card, quality, face]
  );
  /**
   * Blur-up placeholder — `lg` and `xl` only.
   *
   * It costs a second request per card, and in a 60-card grid that is 120
   * requests instead of 60, which is what made card loading crawl. At `lg`/`xl`
   * a card is a focal element and the lists are short, so the blur-up is worth
   * one extra 15 kB fetch; at grid sizes the fade up from the muted surface is
   * enough on its own.
   */
  const placeholder = useMemo(
    () =>
      resolved === 'lg' || resolved === 'xl'
        ? getBestCardImage(card, 'small', face)
        : undefined,
    [card, resolved, face]
  );

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // A new src (different card, flipped face, changed resolution) restarts the fade.
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  const flip = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const next = face === 0 ? 1 : 0;
      if (onFaceChange) onFaceChange(next);
      else setInternalFace(next);
    },
    [face, onFaceChange]
  );

  const isInteractive = interactive ?? Boolean(onClick);
  const name: string = card?.name ?? 'Card';
  const alt = flippable && face > 0 ? `${name} (back face)` : name;

  // Deliberately a div with button semantics rather than a <button>: the flip
  // control and any overlay children would otherwise nest inside it.
  const onKeyDown = onClick
    ? (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent<HTMLElement>);
        }
      }
    : undefined;

  return (
    <div
      className={cn('group relative select-none', fill ? 'w-full' : 'shrink-0', className)}
      style={fill ? undefined : { width: renderedWidth }}
    >
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={onClick ? name : undefined}
        onClick={onClick}
        onKeyDown={onKeyDown}
        title={title ?? name}
        className={cn(
          'relative block w-full overflow-hidden bg-muted',
          'transition-transform duration-200 ease-out motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          SHADOW[resolved],
          isInteractive &&
            'cursor-pointer hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50 motion-reduce:hover:translate-y-0',
          imageClassName
        )}
        style={{ aspectRatio: CARD_ASPECT, borderRadius: CARD_RADIUS }}
      >
        {/* Blurred low-resolution under-layer — fades out once the real art lands. */}
        {placeholder && !failed && (
          <img
            src={placeholder}
            alt=""
            aria-hidden="true"
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            className={cn(
              'absolute inset-0 h-full w-full scale-105 object-cover blur-md transition-opacity duration-300',
              'motion-reduce:transition-none',
              loaded ? 'opacity-0' : 'opacity-100'
            )}
          />
        )}

        {/* Skeleton for cards with no image at all, or before anything decodes. */}
        {(!src || failed) && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted p-2">
            <span className="line-clamp-3 text-center text-[0.7rem] font-medium leading-tight text-muted-foreground">
              {name}
            </span>
          </div>
        )}
        {!placeholder && !loaded && src && !failed && (
          <div className="absolute inset-0 animate-pulse bg-muted motion-reduce:animate-none" />
        )}

        {src && !failed && (
          <img
            src={src}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
              'motion-reduce:transition-none',
              loaded ? 'opacity-100' : 'opacity-0'
            )}
          />
        )}

        {children}
      </div>

      {flippable && (
        <button
          type="button"
          onClick={flip}
          aria-label={`Flip ${name}`}
          title="Flip card"
          className={cn(
            'absolute bottom-2 right-2 z-10 grid place-items-center rounded-full bg-background/85 text-foreground shadow-lg shadow-black/40 backdrop-blur',
            'transition-all duration-200 hover:bg-background motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            // Always visible on touch, revealed on hover on pointer devices.
            'opacity-80 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100',
            resolved === 'xs' || resolved === 'sm' ? 'h-6 w-6' : 'h-8 w-8'
          )}
        >
          <RefreshCw
            className={cn(
              'transition-transform duration-500 motion-reduce:transition-none',
              face > 0 && 'rotate-180',
              resolved === 'xs' || resolved === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
            )}
          />
        </button>
      )}
    </div>
  );
}

/** Same footprint as `CardImage`, for loading states. */
export function CardImageSkeleton({
  size = 'md',
  width,
  fill = false,
  className,
}: {
  size?: CardImageSize;
  width?: number;
  fill?: boolean;
  className?: string;
}) {
  const resolved = size ?? (width ? cardSizeForWidth(width) : 'md');
  return (
    <div
      className={cn(
        'animate-pulse bg-muted motion-reduce:animate-none',
        SHADOW[resolved],
        fill ? 'w-full' : 'shrink-0',
        className
      )}
      style={{
        aspectRatio: CARD_ASPECT,
        borderRadius: CARD_RADIUS,
        ...(fill ? {} : { width: width ?? CARD_IMAGE_SIZES[resolved].width }),
      }}
      aria-hidden="true"
    />
  );
}

export default CardImage;
