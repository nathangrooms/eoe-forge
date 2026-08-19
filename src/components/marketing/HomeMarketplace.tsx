/**
 * Homepage — the marketplace.
 *
 * The page had no mention of `/marketplace` at all, which is odd for a feature
 * that carries listings, sales, a watchlist, buy links and a full price history.
 *
 * Everything numeric here is read live from `card_price_history` — the table the
 * `daily-price-capture` job writes into, which is public-readable and holds
 * thousands of real snapshots. The chart is that series, unsmoothed: the first
 * and last points, the low, the high and the percentage are all computed from
 * the rows that came back. Nothing on this section is seeded, and the section
 * renders nothing rather than inventing a shape when the query is empty.
 *
 * Listings themselves are deliberately absent: `listings` is row-level-secured
 * to its owner, so a logged-out visitor cannot be shown one truthfully.
 */

import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CardImage } from '@/components/cards/CardImage';
import { ManaCost } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';

import { Section, SectionHeading } from '@/components/marketing/Section';
import {
  loadPriceTracking,
  money,
  shortDate,
  useDeferred,
  useNearViewport,
  type TrackedCard,
} from '@/components/marketing/sectionData';

/** The five destinations `buildBuyRows` actually opens. Verified against source. */
const VENDORS = ['TCGplayer', 'Cardmarket', 'Card Kingdom', 'Cardhoarder', 'eBay'];

/* -------------------------------------------------------------------------- */
/* Chart                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One price series as a line.
 *
 * The x axis is the snapshot index, not the calendar — capture has had gaps and
 * plotting against real dates would draw a long straight run that looks like a
 * broken chart rather than a quiet market. Every point is a real stored
 * snapshot, and the caption says "snapshots" for exactly that reason.
 */
function PriceLine({
  series,
  className,
  area = false,
  baseline,
}: {
  series: number[];
  className?: string;
  area?: boolean;
  /** Draw a reference rule at this price — used for "where it started". */
  baseline?: number;
}) {
  const width = 300;
  const height = 100;
  const low = Math.min(...series);
  const high = Math.max(...series);
  /* 12% of the range as headroom above and below, so a series that ends at its
     own high does not draw a line welded to the top edge of the box. */
  const pad = (high - low || 1) * 0.12;
  const floor = low - pad;
  const span = high + pad - floor;

  const point = (value: number, index: number) => {
    const x = (index / Math.max(1, series.length - 1)) * width;
    const y = height - ((value - floor) / span) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };

  const line = series.map(point).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn('h-full w-full', className)}
    >
      {area && (
        <polygon
          points={`0,${height} ${line} ${width},${height}`}
          className="fill-current opacity-[0.05]"
        />
      )}
      {baseline !== undefined && (
        <line
          x1={0}
          x2={width}
          y1={height - ((baseline - floor) / span) * height}
          y2={height - ((baseline - floor) / span) * height}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="5 5"
          className="opacity-25"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ChangeBadge({ change, className }: { change: number; className?: string }) {
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-medium tabular-nums',
        up ? 'text-foreground' : 'text-muted-foreground',
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {up ? '+' : ''}
      {(change * 100).toFixed(1)}%
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

function WatchRow({ entry }: { entry: TrackedCard }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-muted/30 p-3">
      <CardImage card={entry.card} size="sm" width={40} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{entry.card.name}</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          {entry.card.set_code}
        </p>
      </div>

      <div className="h-8 w-16 shrink-0 text-foreground/60">
        <PriceLine series={entry.series} />
      </div>

      <div className="w-16 shrink-0 text-right">
        <p className="text-sm font-medium tabular-nums leading-tight">{money(entry.last)}</p>
        <p
          className={cn(
            'text-[11px] tabular-nums',
            entry.change >= 0 ? 'text-foreground/70' : 'text-muted-foreground'
          )}
        >
          {entry.change >= 0 ? '+' : ''}
          {(entry.change * 100).toFixed(0)}%
        </p>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Section                                                                    */
/* -------------------------------------------------------------------------- */

export function HomeMarketplace() {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const data = useDeferred(near, loadPriceTracking);

  const hero = data?.cards[0] ?? null;
  const rest = data?.cards.slice(1) ?? [];

  return (
    <Section>
      {/* Load gate. React 18 will not forward a ref through <Section>, so the
          sentinel sits at the top of the content instead of on the element. */}
      <div ref={ref} aria-hidden className="h-0" />

      <SectionHeading
        eyebrow="Marketplace"
        title="Watch the price before you buy it"
        lead="DeckMatrix saves the price of every card it tracks, once a day, going back months. So you can see whether a card is climbing or falling instead of only today's number. Put cards up for sale straight from your collection, get told when one hits the price you wanted, and buy without leaving the page."
      />

      <div className="mt-14 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------------------------------------------------- the tracked card */}
        <div className="flex min-w-0 flex-col rounded-2xl bg-card p-6 shadow-2xl shadow-black/40 sm:p-8">
          {hero === null ? (
            <div className="grid gap-8 sm:grid-cols-[200px_minmax(0,1fr)]">
              <Skeleton className="aspect-[5/7] w-[200px] rounded-xl" />
              <div className="space-y-4">
                <Skeleton className="h-10 w-40" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            </div>
          ) : (
            <div className="grid gap-8 sm:grid-cols-[200px_minmax(0,1fr)]">
              {/* Whole card at 5:7 — this is a card, so it is never cropped. */}
              <div>
                <CardImage card={hero.card} size="lg" width={200} />
                <p className="mt-4 text-sm font-medium leading-tight">{hero.card.name}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {hero.card.set_code} · {hero.card.rarity}
                  </span>
                </div>
                {hero.card.mana_cost ? (
                  <div className="mt-2">
                    <ManaCost cost={hero.card.mana_cost} size="xs" />
                  </div>
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                  <span className="text-4xl font-semibold tabular-nums tracking-tight">
                    {money(hero.last)}
                  </span>
                  <ChangeBadge change={hero.change} className="mb-1.5" />
                  <span className="mb-1.5 text-xs text-muted-foreground">
                    since {data ? shortDate(data.from) : ''}
                  </span>
                </div>

                <div className="mt-6 h-44 w-full text-foreground">
                  <PriceLine series={hero.series} area baseline={hero.first} />
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
                  <span>{data ? shortDate(data.from) : ''}</span>
                  <span>
                    {hero.series.length} snapshots
                  </span>
                  <span>{data ? shortDate(data.to) : ''}</span>
                </div>

                <dl className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    { label: 'Low', value: money(hero.low) },
                    { label: 'High', value: money(hero.high) },
                    { label: 'First tracked', value: money(hero.first) },
                  ].map(cell => (
                    <div key={cell.label} className="rounded-xl bg-muted/30 px-4 py-3">
                      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {cell.label}
                      </dt>
                      <dd className="mt-1 text-lg font-medium tabular-nums">{cell.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-8">
            <span className="mr-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              Buy links open at
            </span>
            {VENDORS.map(v => (
              <span
                key={v}
                className="rounded-full bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
              >
                {v}
              </span>
            ))}
          </div>
        </div>

        {/* -------------------------------------------------------- the watchlist */}
        <div className="flex min-w-0 flex-col rounded-2xl bg-card p-5 shadow-2xl shadow-black/40">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Also tracking
          </p>

          <ul className="mt-4 space-y-2.5">
            {data === null
              ? Array.from({ length: 4 }).map((_, i) => (
                  <li key={i}>
                    <Skeleton className="h-16 w-full rounded-xl" />
                  </li>
                ))
              : rest.map(entry => <WatchRow key={entry.card.id} entry={entry} />)}
          </ul>

          <div className="mt-auto pt-6">
            <div className="rounded-xl bg-muted/30 p-4">
              <p className="text-sm font-medium">Sell what you are not playing</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                List straight out of your collection with condition, foiling and quantity, take
                messages from buyers, then record the sale and the copy leaves your collection.
              </p>
            </div>
          </div>
        </div>
      </div>

      {data && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Daily price snapshots between {shortDate(data.from)} and {shortDate(data.to)}, read live
          from DeckMatrix's own price history.
        </p>
      )}

      <div className="mt-10 text-center">
        <Button asChild size="lg" variant="outline">
          <Link to="/marketplace">
            Open the marketplace
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

export default HomeMarketplace;
