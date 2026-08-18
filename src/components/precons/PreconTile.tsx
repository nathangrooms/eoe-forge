import { memo } from 'react';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardImage } from '@/components/cards';
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
 * **The art is never sliced.** It used to sit in a fixed 96px band, which at
 * tile width is roughly 3:1 — Scryfall's art crop is 626 × 457, so better than
 * half of every illustration was thrown away and what survived was a letterbox
 * through the middle. The band now carries the crop's own aspect ratio, so the
 * whole illustration is on screen at the size the artist drew it for, and the
 * tile is sized around the art rather than the other way round.
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
  className?: string;
}

function PreconTileBase({ precon, cards, onSelect, eager, className }: PreconTileProps) {
  const leads = precon.commanders.slice(0, 2);
  const cardObjects = leads.map(ref => commanderCard(ref, cards));
  const art = cardObjects[0] ? commanderArt(cardObjects[0], leads[0]?.scryfallId) : null;
  const year = precon.released ? precon.released.slice(0, 4) : null;

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
      {/* The commander's artwork, whole. */}
      <div
        className="relative w-full shrink-0 overflow-hidden bg-muted"
        style={{ aspectRatio: ART_ASPECT }}
      >
        {art && (
          <img
            src={art}
            alt=""
            aria-hidden="true"
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            className={cn(
              // The frame already carries the crop's aspect ratio, so `cover`
              // has nothing to cut — it only guards the handful of outlier
              // layouts whose crop is not exactly 626 × 457.
              'h-full w-full object-cover object-center',
              'transition-transform duration-500 ease-out group-hover:scale-[1.04]',
              'motion-reduce:transition-none motion-reduce:group-hover:scale-100'
            )}
          />
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
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <div className="flex gap-4">
          <div
            className={cn(
              'relative z-10 flex shrink-0',
              leads.length > 1 ? PARTNER_COLUMN : CARD_COLUMN,
              OVERLAP
            )}
          >
            {cardObjects.length > 0 ? (
              cardObjects.map((card, i) => (
                <div
                  key={leads[i]?.scryfallId ?? i}
                  // Partners fan rather than shrinking to two half-width
                  // cards: 70% + 70% − 40% fills the column exactly, and
                  // leaves 40% of the back card showing — enough to read its
                  // name and art, which a heavier overlap does not.
                  className={cn(
                    'shrink-0',
                    leads.length > 1 ? 'w-[70%]' : 'w-full',
                    i > 0 && '-ml-[40%]'
                  )}
                >
                  <CardImage
                    card={card}
                    // `md` and above draw the 672px `large` scan and skip the
                    // blur-up under-layer, so a page of tiles is one request
                    // per image however wide the column lands.
                    size="md"
                    fill
                    hideFlip
                    eager={eager}
                    interactive={false}
                    imageClassName="shadow-2xl shadow-black/60"
                  />
                </div>
              ))
            ) : (
              <CardImage
                card={{ name: precon.name }}
                size="md"
                fill
                hideFlip
                interactive={false}
              />
            )}
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <h3 className="line-clamp-2 text-lg font-bold leading-snug tracking-tight">
              {precon.name}
            </h3>
            {leads.length > 0 && (
              <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                <Crown className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="line-clamp-2">{leads.map(c => c.name).join(' + ')}</span>
              </p>
            )}
            {leads.length === 1 && leads[0].cost && (
              <ManaCost cost={leads[0].cost} size="sm" className="mt-2 gap-1" />
            )}
          </div>
        </div>

        <div className="mt-auto flex items-baseline justify-between gap-3 pt-3 text-xs text-muted-foreground">
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
export function PreconTileSkeleton() {
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-lg shadow-black/25"
      aria-hidden="true"
    >
      <div
        className="w-full animate-pulse bg-muted motion-reduce:animate-none"
        style={{ aspectRatio: ART_ASPECT }}
      />
      <div className="flex gap-4 px-4 pb-4 pt-3">
        <div
          className={cn(
            'shrink-0 animate-pulse rounded-lg bg-muted motion-reduce:animate-none',
            CARD_COLUMN,
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
