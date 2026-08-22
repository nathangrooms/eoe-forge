import { memo } from 'react';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardImage } from '@/components/cards';
import { identityGround } from '@/lib/cards/identityGround';
import { ColorIdentity, ManaCost } from '@/components/ui/mana-cost';
import {
  commanderArt,
  commanderCard,
  type CommanderCardMap,
  type PreconSummary,
} from '@/lib/precons/precon-api';

/**
 * One precon, led by its commander.
 *
 * A precon is chosen on two things — who the commander is and what colours it
 * plays — so the tile leads with the commander's artwork and hangs the
 * commander's actual card over it.
 *
 * **The art band carries the art's own shape.** It used to sit in a fixed 96px
 * band, which at tile width is roughly 3:1 — Scryfall's art crop is usually
 * 626 × 457, so better than half of every illustration was thrown away and what
 * survived was a letterbox through the middle. The band now carries that ratio,
 * so the whole illustration is on screen at the size the artist drew it for.
 *
 * "Usually" is doing real work in that sentence and the previous version of
 * this comment claimed otherwise. A few printings ship a wider crop —
 * *Quintorius, History Chaser* (SOC) is 745 × 390, aspect 1.91 against the
 * usual 1.37 — and `cover` does slice those, by about a quarter of their width.
 * The alternative, `contain`, would letterbox the wide ones but also open a
 * hairline of muted ground down the sides of every 616 × 452 printing, which
 * costs far more cards than it saves. The full commander card below is the one
 * that must never be cropped, and it never is.
 *
 * The small full card stays — the owner likes it — and is drawn a good deal
 * larger, overlapping the foot of the art the way a commander sits in front of
 * its own scene. No scrim and no gradient over the artwork: the art band and
 * the type block are separate surfaces, which is what keeps a deck name
 * legible over illustrations this varied.
 */

/** Scryfall's art crop. Matching it exactly is what makes "uncropped" true. */
const ART_ASPECT = '626 / 457';

/**
 * The card is sized as a share of the tile, not in pixels.
 *
 * The grid is `auto-fill minmax(TILE_WIDTH, 1fr)`, so a tile is anywhere from
 * 380px to nearly 600px wide depending on how the columns fall. A fixed 132px
 * card is right in the middle of that range and wrong at both ends — lost
 * against the art on a wide screen, crowding it on a narrow one.
 */
const CARD_COLUMN = 'w-[30%] min-w-[92px] max-w-[200px]';
const PARTNER_COLUMN = 'w-[40%] min-w-[124px] max-w-[268px]';

/**
 * Compact gives the card a larger *share* of a smaller tile.
 *
 * A flat 30% of a 272px tile is a 74px card — the thumbnail this component
 * exists to avoid. At 38% it holds ~92px, which still reads as a card, and the
 * type block loses a step of size instead.
 */
const CARD_COLUMN_COMPACT = 'w-[38%] min-w-[84px] max-w-[140px]';
const PARTNER_COLUMN_COMPACT = 'w-[52%] min-w-[110px] max-w-[190px]';

/**
 * How far the card climbs into the artwork.
 *
 * Percentage margins resolve against the containing block's *width*, so this
 * tracks the card, which is itself a percentage of that width: a card is
 * 30% × 680/488 ≈ 42% of the body width tall, and −19% of it is a hair under
 * half the card. The overlap therefore looks identical at every tile size,
 * which a pixel value cannot do.
 */
const OVERLAP = 'mt-[-19%]';

export interface PreconTileProps {
  precon: PreconSummary;
  cards?: CommanderCardMap;
  onSelect: (precon: PreconSummary) => void;
  /** Skip lazy-loading for the first row. */
  eager?: boolean;
  /** Four-across density — smaller type, proportionally larger commander card. */
  compact?: boolean;
  className?: string;
}

function PreconTileBase({
  precon,
  cards,
  onSelect,
  eager,
  compact = false,
  className,
}: PreconTileProps) {
  const leads = precon.commanders.slice(0, 2);
  const cardObjects = leads.map(ref => commanderCard(ref, cards));
  const art = cardObjects[0] ? commanderArt(cardObjects[0], leads[0]?.scryfallId) : null;
  const year = precon.released ? precon.released.slice(0, 4) : null;
  const cardColumn = compact
    ? leads.length > 1
      ? PARTNER_COLUMN_COMPACT
      : CARD_COLUMN_COMPACT
    : leads.length > 1
      ? PARTNER_COLUMN
      : CARD_COLUMN;

  return (
    <button
      type="button"
      onClick={() => onSelect(precon)}
      className={cn(
        'group relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-card text-left',
        'shadow-lg shadow-black/25 transition-all duration-200 ease-out',
        'hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className
      )}
      aria-label={`${precon.name}${leads[0] ? ` — ${leads[0].name}` : ''}, ${precon.set}`}
    >
      {/* THE WHOLE CARD, and that is the entire point of this block.

          It used to be Scryfall's `art_crop`, which is the illustration with
          the frame, the name, the type line and the text box cut away. It was
          contained rather than squashed, so nothing was distorted, but a crop
          is still a crop and the owner reported it three times: "Precons page
          still doesnt show the full card in main image and cuts to rectangle".

          So the card is now shown whole, through the canonical `CardImage`,
          sitting on the deck's own colour identity. The small inset that used
          to hang over the foot of this band is gone: it was the full card, so
          keeping both would show the same card twice at two sizes.

          The wash is `identityGround`, our own derived data, NOT a blurred copy
          of the art. Scryfall's terms say plainly: do not blur, sharpen,
          desaturate or colour-shift card images. */}
      {/* NO FIXED ASPECT ON THIS BAND, and that is the fix rather than a
          preference. A landscape frame with `overflow-hidden` around a portrait
          card cuts the bottom off it, which is the text box, which is most of
          what a commander says. The card sets the height and the band follows.
          Owner reported the cut four times before this. */}
      <div className="relative flex w-full shrink-0 items-center justify-center overflow-hidden bg-muted p-4">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: identityGround(precon.ci) ?? undefined }}
        />

        {cardObjects.length > 0 ? (
          <div className="relative flex w-full items-start justify-center gap-2">
            {cardObjects.map((card, i) => (
              <div
                key={leads[i]?.scryfallId ?? i}
                /* Width-led. A card image carries its own 63:88, so giving it a
                   width gives the band a height and nothing can be cut. Two
                   partners share the width rather than fanning, because two
                   WHOLE cards is what this block now promises. */
                className={cn(
                  'shrink-0',
                  leads.length > 1 ? 'w-[46%]' : 'w-[64%]',
                  'max-w-[260px]'
                )}
              >
                <CardImage
                  card={card}
                  size="lg"
                  className={cn(
                    'w-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)]',
                    'transition-transform duration-500 ease-out group-hover:scale-[1.03]',
                    'motion-reduce:transition-none motion-reduce:group-hover:scale-100'
                  )}
                />
              </div>
            ))}
          </div>
        ) : (
          // Nothing to draw, but the band still needs a height or the tile
          // collapses to its badges.
          <div className="relative w-full" style={{ aspectRatio: '63 / 88' }} />
        )}

        {precon.ci.length > 0 && (
          <span className="absolute right-2.5 top-2.5 inline-flex rounded-full bg-background/85 px-2 py-1.5 shadow-lg shadow-black/30 backdrop-blur-sm">
            <ColorIdentity colors={precon.ci} size="sm" className="gap-1" />
          </span>
        )}

        {year && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-background/85 px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground shadow-lg shadow-black/30 backdrop-blur-sm">
            {year}
          </span>
        )}
      </div>

      {/* Commander card, hung over the foot of the art. */}
      <div className={cn('flex flex-1 flex-col', compact ? 'px-3 pb-3 pt-2.5' : 'px-4 pb-4 pt-3')}>
        <div className={cn('flex', compact ? 'gap-2.5' : 'gap-4')}>
          {/* No inset card here any more. The band above is the whole card
              now, so this column showed the same commander twice at two
              sizes. */}

          <div className="min-w-0 flex-1 pt-1">
            <h3
              className={cn(
                'line-clamp-2 font-bold leading-snug tracking-tight',
                compact ? 'text-sm' : 'text-lg'
              )}
            >
              {precon.name}
            </h3>
            {leads.length > 0 && (
              <p
                className={cn(
                  'mt-1 flex items-start gap-1.5 text-muted-foreground',
                  compact ? 'text-xs' : 'text-sm'
                )}
              >
                <Crown
                  className={cn('mt-0.5 shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')}
                  aria-hidden="true"
                />
                <span className="line-clamp-2">{leads.map(c => c.name).join(' + ')}</span>
              </p>
            )}
            {leads.length === 1 && leads[0].cost && (
              <ManaCost
                cost={leads[0].cost}
                size={compact ? 'xs' : 'sm'}
                className={cn('gap-1', compact ? 'mt-1.5' : 'mt-2')}
              />
            )}
          </div>
        </div>

        <div
          className={cn(
            'mt-auto flex items-baseline justify-between gap-3 text-muted-foreground',
            compact ? 'pt-2 text-[0.7rem]' : 'pt-3 text-xs'
          )}
        >
          <span className="truncate">{precon.set}</span>
          {precon.total != null && (
            <span className="shrink-0 tabular-nums">{precon.total} cards</span>
          )}
        </div>
      </div>
    </button>
  );
}

export const PreconTile = memo(PreconTileBase);

/** Same footprint as a tile, for the first paint of the catalogue. */
export function PreconTileSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-lg shadow-black/25"
      aria-hidden="true"
    >
      <div
        className="w-full animate-pulse bg-muted motion-reduce:animate-none"
        style={{ aspectRatio: ART_ASPECT }}
      />
      <div className={cn('flex', compact ? 'gap-2.5 px-3 pb-3 pt-2.5' : 'gap-4 px-4 pb-4 pt-3')}>
        <div
          className={cn(
            'shrink-0 animate-pulse rounded-lg bg-muted motion-reduce:animate-none',
            compact ? CARD_COLUMN_COMPACT : CARD_COLUMN,
            OVERLAP
          )}
          style={{ aspectRatio: '488 / 680' }}
        />
        <div className="flex-1 space-y-2.5 pt-1.5">
          <div className="h-4 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

export default PreconTile;
