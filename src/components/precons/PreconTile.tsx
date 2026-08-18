import { memo } from 'react';
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
 * plays — and the old list showed neither, so this leads with the commander's
 * art crop as a banner and hangs the commander's actual card over it. No
 * scrim over the art and no gradient: the art band and the type block are
 * separate surfaces, which is also what keeps the deck name legible over
 * artwork this varied.
 */

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
        'group relative block w-full overflow-hidden rounded-xl bg-card text-left',
        'shadow-lg shadow-black/20 transition-all duration-200 ease-out',
        'hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className
      )}
      aria-label={`${precon.name}${leads[0] ? ` — ${leads[0].name}` : ''}, ${precon.set}`}
    >
      {/* Commander art band */}
      <div className="relative h-24 w-full overflow-hidden bg-muted sm:h-28">
        {art && (
          <img
            src={art}
            alt=""
            aria-hidden="true"
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            className={cn(
              'h-full w-full object-cover object-[50%_32%]',
              'transition-transform duration-500 ease-out group-hover:scale-[1.06]',
              'motion-reduce:transition-none motion-reduce:group-hover:scale-100'
            )}
          />
        )}

        {precon.ci.length > 0 && (
          <span className="absolute right-2 top-2 inline-flex rounded-full bg-background/80 px-1.5 py-1 backdrop-blur-sm">
            <ColorIdentity colors={precon.ci} size="xs" />
          </span>
        )}

        {year && (
          <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[0.65rem] font-semibold tabular-nums text-foreground backdrop-blur-sm">
            {year}
          </span>
        )}
      </div>

      {/* Commander card, hung over the band */}
      <div className="flex gap-3 px-3 pb-2 pt-2">
        <div className="relative z-10 -mt-12 flex shrink-0">
          {cardObjects.length > 0 ? (
            cardObjects.map((card, i) => (
              <CardImage
                key={leads[i]?.scryfallId ?? i}
                card={card}
                width={62}
                hideFlip
                eager={eager}
                className={i > 0 ? '-ml-9' : undefined}
                imageClassName="shadow-xl shadow-black/50"
              />
            ))
          ) : (
            <CardImage card={{ name: precon.name }} width={62} hideFlip />
          )}
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="line-clamp-2 text-[0.95rem] font-semibold leading-snug tracking-tight">
            {precon.name}
          </h3>
          {leads.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {leads.map(c => c.name).join(' + ')}
            </p>
          )}
          {leads.length === 1 && leads[0].cost && (
            <ManaCost cost={leads[0].cost} size="xs" className="mt-1.5" />
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 px-3 pb-3 text-[0.7rem] text-muted-foreground">
        <span className="truncate">{precon.set}</span>
        <span className="shrink-0 tabular-nums">
          {precon.total != null ? `${precon.total} cards` : 'Commander'}
        </span>
      </div>
    </button>
  );
}

export const PreconTile = memo(PreconTileBase);

/** Same footprint as a tile, for the first paint of the catalogue. */
export function PreconTileSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl bg-card shadow-lg shadow-black/20"
      aria-hidden="true"
    >
      <div className="h-24 w-full animate-pulse bg-muted motion-reduce:animate-none sm:h-28" />
      <div className="flex gap-3 px-3 pb-3 pt-2">
        <div
          className="-mt-12 w-[62px] shrink-0 animate-pulse rounded bg-muted motion-reduce:animate-none"
          style={{ aspectRatio: '488 / 680' }}
        />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-3 w-2/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

export default PreconTile;
