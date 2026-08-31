import { useCallback, useMemo, useRef, useState } from 'react';
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

/**
 * The name, when there is no picture to show instead.
 *
 * It used to be `0.7rem` at every size, which is fine on a thumbnail and absurd
 * on a big one: the Tournaments deck rail draws its tiles at about 350 by 490,
 * and a deck with no commander was a large flat grey rectangle with eleven
 * pixel type floating in the middle of it. This is the fallback every surface
 * hits when a card has no art, so it is worth the tokens rather than a patch at
 * one call site.
 *
 * Sized off the same token the picture is, so the words grow with the box.
 */
const FALLBACK_TEXT: Record<CardImageSize, string> = {
  xs: 'text-[0.6rem] leading-tight',
  sm: 'text-[0.7rem] leading-tight',
  md: 'text-sm leading-snug',
  lg: 'text-base leading-snug',
  xl: 'text-lg leading-snug',
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
  /**
   * Override the Scryfall resolution the size token would otherwise pick.
   *
   * For surfaces that render *many* cards well below the token's nominal width
   * — a 175-card commander wall at 218px, a precon tile's 158px inset — where
   * `large` (672px) is roughly four times the pixels the display can show and
   * the cost is paid once per card. The ladder in {@link CARD_IMAGE_SIZES} is
   * deliberately generous for focal cards; this is the escape hatch for grids
   * where the count, not the card, is the expense. Ignored when `transparent`.
   */
  quality?: ScryfallImageSize;
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
  /**
   * What a screen reader should call this when it is clickable.
   *
   * Defaults to the card's name, and that default is wrong wherever the same
   * card appears more than once. On a card page's printings grid, twelve tiles
   * showing set, collector number, rarity, year, price and artist were all
   * announced as "Sol Ring button", so a reader could not tell the $1.47
   * printing from the $14.09 one. Pass the whole line where the tiles differ.
   */
  label?: string;
  /** Marks the tile a reader should hear as the one currently chosen. */
  current?: boolean;
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
  quality: qualityOverride,
  faceIndex,
  onFaceChange,
  hideFlip = false,
  eager = false,
  className,
  imageClassName,
  title,
  label,
  current,
  children,
}: CardImageProps) {
  const resolved: CardImageSize = size ?? (width ? cardSizeForWidth(width) : 'md');
  const renderedWidth = width ?? CARD_IMAGE_SIZES[resolved].width;

  const [internalFace, setInternalFace] = useState(faceIndex ?? 0);
  const face = faceIndex ?? internalFace;

  const flippable = !hideFlip && hasBackFace(card) && getCardFaces(card).length > 1;

  const quality: ScryfallImageSize = transparent
    ? 'png'
    : (qualityOverride ?? CARD_IMAGE_SIZES[resolved].quality);

  const src = useMemo(
    () => getBestCardImage(card, quality, face),
    [card, quality, face]
  );
  /*
   * THE BLUR-UP PLACEHOLDER IS GONE, AND THE REASON IS THE LICENCE.
   *
   * It drew a second `<img>` of the card at `small`, under the real one, with
   * `blur-md scale-105 object-cover`, and faded it out on load. Scryfall's
   * image guidelines say plainly: *"Do not blur, sharpen, desaturate, or
   * color-shift card images."* A blur-up displays a blurred card image. That it
   * is brief does not make it not displayed.
   *
   * This project has already removed that treatment twice for that exact
   * sentence — the blurred identity ground, replaced by
   * `src/lib/cards/identityGround.ts`, and the playmat, which was applying
   * `saturate(0.26) brightness(0.4)`. Both notes say the same thing: the
   * downside of guessing wrong is losing the API this product is built on, so
   * we do not guess. Neither pass reached HERE, the component every card in the
   * app goes through, because the reasoning written above it was entirely about
   * request count and never about the picture.
   *
   * What replaces it is what `lg` and `xl` are the only sizes that were not
   * already doing: the muted pulse below, which every grid in the product fades
   * up from.
   *
   * It is also cheaper, which is the smaller half. Measured at 1600: card
   * search drew 48 `<img>` for 24 cards and precons 48 for 24. Both halve.
   */
  /**
   * Load state is tracked as "which src finished", not as a boolean.
   *
   * A boolean plus a `useEffect(..., [src])` reset is the obvious version and it
   * is broken: a cached image fires `onLoad` during commit, *before* the effect
   * runs, so the effect immediately resets the flag and the card stays at
   * `opacity-0` forever. Deriving it from the src makes a new src false by
   * construction, with no effect to lose the race against.
   */
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const loaded = Boolean(src) && loadedSrc === src;
  const failed = Boolean(src) && failedSrc === src;

  const srcRef = useRef(src);
  srcRef.current = src;

  /** Belt and braces: an image already complete at mount never fires `onLoad`. */
  const attachImage = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth > 0) {
      setLoadedSrc(srcRef.current ?? null);
    }
  }, []);

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
      /*
       * A card can be smaller than its size token asks for. It can never be
       * bigger than the space it was given.
       *
       * The width here is an inline style and a caller's `className="w-full"`
       * is a class, so the inline width won and the card was drawn at its token
       * width inside a narrower slot. Measured on `/precons` at 390px: the tile
       * was 175px, the card's slot 91.5px, and the card 250px, so 47% of the
       * commander was cut off by the tile's own `overflow-hidden`. That is the
       * cut the owner has reported repeatedly, and the design law forbids it
       * outright.
       *
       * `maxWidth: 100%` cannot make any card larger and cannot change a layout
       * where the slot was already wide enough, which is every desktop case.
       * It only stops a card spilling out of a box that then clips it.
       */
      style={fill ? undefined : { width: renderedWidth, maxWidth: '100%' }}
    >
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={onClick ? label ?? name : undefined}
        aria-current={current ? 'true' : undefined}
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
        {/* Cards with no image at all, or whose image failed.
            The name is the only true thing we have, so it is the whole tile
            rather than a caption inside one. `line-clamp-4` because a long
            commander name wraps to three at `lg` and losing the last word of
            "Ulamog, the Ceaseless Hunger" is worse than a taller block. */}
        {(!src || failed) && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted px-3 py-2">
            <span
              className={cn(
                'line-clamp-4 text-balance text-center font-medium text-muted-foreground',
                FALLBACK_TEXT[resolved]
              )}
            >
              {name}
            </span>
          </div>
        )}
        {!loaded && src && !failed && (
          <div className="absolute inset-0 animate-pulse bg-muted motion-reduce:animate-none" />
        )}

        {src && !failed && (
          <img
            // Remounting per src guarantees `attachImage` re-runs for cached hits.
            key={src}
            ref={attachImage}
            src={src}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            onLoad={() => setLoadedSrc(src)}
            onError={() => setFailedSrc(src)}
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
        /* Same cap as the real card above, so the placeholder holds the space
           the card will actually take rather than a wider one that shifts the
           layout when the picture arrives. */
        ...(fill
          ? {}
          : { width: width ?? CARD_IMAGE_SIZES[resolved].width, maxWidth: '100%' }),
      }}
      aria-hidden="true"
    />
  );
}

export default CardImage;
