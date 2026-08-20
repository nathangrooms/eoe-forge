import { Link } from 'react-router-dom';
import { CardImage, CardImageSkeleton, cardDetailPath } from '@/components/cards';
import { CardRail } from '@/components/cards/CardRail';
import { formatPriceOrUnknown } from '@/components/collection/browser/types';
import { cn } from '@/lib/utils';
import type { OwnedRow, ValuedRow } from './spread.ts';

/**
 * The most valuable cards, as cards.
 *
 * Owner: *"Most valuable cards should show a scroller of them for example"*,
 * and underneath that, the reason: this is a collection of Magic cards and the
 * analytics page was showing none of them. It listed names and dollar figures in
 * rows, twice over, in two different components that ranked the same cards
 * differently.
 *
 * `CardRail` is the product's one horizontal card row: no scrollbar, arrows that
 * appear only when there is somewhere to scroll, and trackpad and touch
 * scrolling untouched because the element is still a real scroll container.
 * `CardImage` is the product's one card image, which right-sizes the Scryfall
 * asset and never crops. Neither is reimplemented here.
 *
 * Cards are drawn at 250px, the `lg` size token, which is the size the card
 * page's own rails use. They are the subject of the section, so they are large.
 */

/** One tile width, and the resolution `CardImage` asks Scryfall for. */
const TILE_WIDTH = 250;

export interface ValueRailProps {
  cards: ValuedRow[];
  /**
   * True when the collection holds stacks we could not price. Those stacks are
   * absent from the ranking on purpose, and the count of them is printed in the
   * page headline. It is not repeated under the rail: a line that only sometimes
   * exists is a line that sometimes moves the page.
   */
  hasUnpriced?: boolean;
  loading?: boolean;
  className?: string;
}

export function ValueRail({ cards, hasUnpriced = false, loading, className }: ValueRailProps) {
  if (loading) return <RailSkeleton className={className} />;

  if (cards.length === 0) {
    return (
      <p className={cn('rounded-xl bg-muted/30 p-6 text-sm text-muted-foreground', className)}>
        {hasUnpriced
          ? 'None of the cards you own have a price we can read yet, so there is nothing to rank.'
          : 'Add some cards and the ones worth the most will show up here.'}
      </p>
    );
  }

  return (
    <div className={cn('min-w-0', className)}>
      <CardRail label="Most valuable cards" contentClassName="gap-4">
        {cards.map((entry, index) => (
          <ValueTile key={entry.rowId} entry={entry} rank={index + 1} />
        ))}
      </CardRail>
    </div>
  );
}

function ValueTile({ entry, rank }: { entry: ValuedRow; rank: number }) {
  const href = cardDetailPath(entry.card) ?? cardDetailPath(entry.name);
  const copies = entry.quantity + entry.foil;

  const body = (
    <>
      <CardImage card={entry.card} width={TILE_WIDTH} hideFlip interactive>
        {/* Rank sits on the art rather than above it, so the tiles stay one
            card tall and the rail has one rhythm. */}
        <span className="absolute left-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground shadow-lg shadow-black/40 backdrop-blur">
          {rank}
        </span>
      </CardImage>
      <p className="mt-2 truncate text-sm font-medium text-foreground" title={entry.name}>
        {entry.name}
      </p>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatPriceOrUnknown(entry.value)}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {entry.setCode}
          {copies > 1 ? ` · ${copies} copies` : ''}
          {entry.foil > 0 ? ` · ${entry.foil} foil` : ''}
        </span>
      </div>
    </>
  );

  const className = 'block shrink-0 snap-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const style = { width: TILE_WIDTH };

  /* A real link, so the card page is reachable by middle click, by keyboard and
     by "open in new tab" — the whole point of routing to `/cards/:id` rather
     than opening a pane. */
  return href ? (
    <Link to={href} className={className} style={style}>
      {body}
    </Link>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}

/**
 * The rail's exact footprint before there is anything in it.
 *
 * Every measurement here mirrors the real tile rather than approximating it:
 * `pb-2` is the padding `CardRail` puts on its scrolling row, `mt-2 h-5` is the
 * name line with its margin, and the second `h-5` has no margin because the real
 * tile's price row is a flex box sitting directly under the name. An earlier
 * version had `mt-1` on that second bar and was 4px taller than the thing it
 * stood in for, which moved the whole page down by 4px per rail on load.
 */
function RailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex gap-4 overflow-hidden pb-2', className)} aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="shrink-0" style={{ width: TILE_WIDTH }}>
          <CardImageSkeleton width={TILE_WIDTH} />
          <div className="mt-2 h-5 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-5 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/**
 * The same rail for rows that are not ranked by value — what arrived most
 * recently. Same tile size and same click target, because it is the same kind of
 * thing and a second tile shape would be a second thing to maintain.
 */
export function RecentRail({
  rows,
  loading,
  className,
}: {
  rows: OwnedRow[];
  loading?: boolean;
  className?: string;
}) {
  if (loading) return <RailSkeleton className={className} />;
  if (rows.length === 0) return null;

  return (
    <div className={cn('min-w-0', className)}>
      <CardRail label="Recently added" contentClassName="gap-4">
        {rows.map(row => {
          const card = row.card!;
          const href = cardDetailPath(card) ?? cardDetailPath(card.name ?? row.card_name ?? '');
          const copies = (row.quantity || 0) + (row.foil || 0);
          const tile = (
            <>
              <CardImage card={card} width={TILE_WIDTH} hideFlip interactive />
              <p
                className="mt-2 truncate text-sm font-medium text-foreground"
                title={card.name ?? row.card_name}
              >
                {card.name ?? row.card_name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {String(card.set_code ?? row.set_code ?? '').toUpperCase()}
                {copies > 1 ? ` · ${copies} copies` : ''}
              </p>
            </>
          );
          const cls = 'block shrink-0 snap-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
          return href ? (
            <Link key={row.id} to={href} className={cls} style={{ width: TILE_WIDTH }}>
              {tile}
            </Link>
          ) : (
            <div key={row.id} className={cls} style={{ width: TILE_WIDTH }}>
              {tile}
            </div>
          );
        })}
      </CardRail>
    </div>
  );
}
