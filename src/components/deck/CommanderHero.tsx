import { useMemo } from 'react';
import { Crown, Layers, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardImage, CARD_ASPECT, type CardImageSize } from '@/components/cards';
import { ManaPip } from '@/components/ui/mana-cost';
import { formatLabel, usesCommander } from '@/lib/deck/formats';

/**
 * The commander card, rendered as the hero of a deck tile.
 *
 * The tile used to draw the commander into an 80×112 box from the `normal`
 * (488 px) image — a postage stamp of the one thing that actually identifies a
 * deck. It is now the largest element on the tile and goes through `CardImage`,
 * so it is drawn from `large` (672 px) and inherits the real card geometry,
 * the blur-up and the flip affordance.
 *
 * A deck with no commander gets a designed card-shaped panel rather than the
 * empty grey box that was there before: colour identity as full-size pips, the
 * format set in tracked capitals, and a route into the builder.
 */

/** Matches `CardImage`'s corner geometry — 3 mm corners at any rendered size. */
const CARD_RADIUS = '4.75% / 3.4%';

const WUBRG = ['W', 'U', 'B', 'R', 'G'];

function sortIdentity(colors: string[] | null | undefined): string[] {
  const clean = (colors ?? []).filter(Boolean).map(c => c.toUpperCase());
  const unique = Array.from(new Set(clean)).filter(c => WUBRG.includes(c));
  return unique.sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b));
}

export interface CommanderHeroProps {
  commander?: { name: string; image?: string } | null;
  deckName: string;
  format: string;
  identity: string[];
  cardCount: number;
  size?: CardImageSize;
  /** Skip lazy-loading — for the handful of tiles above the fold. */
  eager?: boolean;
  onClick?: () => void;
  className?: string;
  /** Rendered over the art: favourite state, missing-card flag, etc. */
  children?: React.ReactNode;
}

export function CommanderHero({
  commander,
  deckName,
  format,
  identity,
  cardCount,
  size = 'xl',
  eager = false,
  onClick,
  className,
  children,
}: CommanderHeroProps) {
  /**
   * `compute_deck_summary` returns the full `image_uris` jsonb alongside the
   * single pre-picked `image` URL, so the quality ladder in `card-utils` has
   * every resolution to choose from. `image` is kept as the last resort for
   * commanders that are not in the local `cards` table.
   */
  const card = useMemo(() => {
    if (!commander) return null;
    const raw = commander as { name: string; image?: string; image_uris?: unknown };
    const imageUris =
      raw.image_uris && typeof raw.image_uris === 'object' ? raw.image_uris : undefined;
    return {
      name: raw.name,
      image_uris: imageUris,
      image_url: raw.image,
    };
  }, [commander]);

  if (card) {
    return (
      <CardImage
        card={card}
        size={size}
        fill
        eager={eager}
        onClick={onClick ? () => onClick() : undefined}
        title={`${card.name} — commander of ${deckName}`}
        className={className}
      >
        {children}
      </CardImage>
    );
  }

  return (
    <CommanderFallback
      deckName={deckName}
      format={format}
      identity={identity}
      cardCount={cardCount}
      onClick={onClick}
      className={className}
    >
      {children}
    </CommanderFallback>
  );
}

interface FallbackProps {
  deckName: string;
  format: string;
  identity: string[];
  cardCount: number;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The no-commander state.
 *
 * Card-shaped and card-sized so the grid never loses its rhythm, but composed
 * from the two things a commanderless deck does have: its colour identity and
 * its format.
 */
export function CommanderFallback({
  deckName,
  format,
  identity,
  cardCount,
  onClick,
  className,
  children,
}: FallbackProps) {
  const pips = sortIdentity(identity);
  const wantsCommander = usesCommander(format);
  const label = formatLabel(format);

  return (
    <div className={cn('group relative w-full select-none', className)}>
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={onClick ? `${deckName} — ${wantsCommander ? 'choose a commander' : 'open deck'}` : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        className={cn(
          'relative flex w-full flex-col items-center justify-center overflow-hidden bg-muted p-[8%] text-center',
          'shadow-xl shadow-black/40 transition-transform duration-200 ease-out motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          onClick &&
            'cursor-pointer hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50 motion-reduce:hover:translate-y-0'
        )}
        style={{ aspectRatio: CARD_ASPECT, borderRadius: CARD_RADIUS }}
      >
        {/* Oversized watermark — flat, no glow, purely a silhouette. */}
        <Crown
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[12%] -right-[10%] h-[55%] w-[55%] text-foreground/[0.04]"
          strokeWidth={1}
        />

        <div className="relative flex flex-col items-center gap-[6%]">
          {pips.length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {pips.map(c => (
                <ManaPip
                  key={c}
                  symbol={c}
                  size="lg"
                  className="h-8 w-8 text-sm shadow-md shadow-black/30 sm:h-9 sm:w-9"
                />
              ))}
            </div>
          ) : (
            <span
              aria-hidden="true"
              className="grid h-12 w-12 place-items-center rounded-full bg-foreground/5 text-muted-foreground"
            >
              {wantsCommander ? (
                <Crown className="h-6 w-6" />
              ) : (
                <Layers className="h-6 w-6" />
              )}
            </span>
          )}

          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
            {label}
          </p>

          <p className="text-balance text-base font-bold leading-tight text-foreground sm:text-lg">
            {wantsCommander ? 'No commander' : `${cardCount} cards`}
          </p>

          {wantsCommander && onClick && (
            <p className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-muted-foreground transition-colors group-hover:text-foreground motion-reduce:transition-none">
              <Sparkles className="h-3 w-3" />
              Choose one in the builder
            </p>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}

export default CommanderHero;
