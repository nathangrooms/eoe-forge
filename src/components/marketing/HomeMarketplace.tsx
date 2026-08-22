/**
 * Homepage — the marketplace.
 *
 * The page had no mention of `/marketplace` at all, which is odd for a feature
 * that carries listings, sales, a watchlist, buy links and a full price history.
 *
 * Everything numeric here comes from `card_price_history` — the table the
 * `daily-price-capture` job writes into, which holds thousands of real
 * snapshots. It is NOT read from the browser any more. The series is taken once
 * a night by `scripts/homepage-snapshot.mjs` and read here out of
 * `src/data/homepage-snapshot.json`, so the newest point on these charts is
 * from the last time that job ran rather than from this moment. The caption at
 * the foot of the section therefore dates the window it is drawing instead of
 * calling it live, which it no longer is. The chart is the stored series,
 * unsmoothed: the first and last points, the low, the high and the percentage
 * are all computed from those rows. Nothing here is seeded.
 *
 * When there is no series the section says there is no series, and it knows on
 * the first render. Two earlier shapes both got this wrong in the same place.
 * `useDeferred` could not tell `priceTracking: null` from "still loading", so
 * the live homepage pulsed a skeleton chart at every visitor for ever, which is
 * a fabrication in animation rather than in text. `useDeferredResult` fixed the
 * claim and kept the shape, so the section still drew the skeleton first and
 * then collapsed 939px out of the page underneath the reader. There is nothing
 * to defer: the series is a bundled JSON file. It is read during render now.
 *
 * Listings themselves are deliberately absent: `listings` is row-level-secured
 * to its owner, so a logged-out visitor cannot be shown one truthfully. That
 * same policy is why {@link SellPanel} no longer mentions buyers.
 */

import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CardImage } from '@/components/cards/CardImage';
import { ManaCost } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';

import { Section, SectionHeading } from '@/components/marketing/Section';
/* `readPriceTracking`, not `loadPriceTracking`: the same snapshot read without
   the resolved promise a deferring hook had to await. See the note in the
   section for what that promise was costing. */
import {
  money,
  readPriceTracking,
  shortDate,
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
/* The two things that are true whether or not there is a chart               */
/* -------------------------------------------------------------------------- */

/**
 * The most concrete sentence in this section, promoted out of a side panel.
 *
 * "TAKE MESSAGES FROM BUYERS" WAS REMOVED ON 22 AUG 2026. THERE ARE NO BUYERS.
 *
 * `listings` carries exactly one policy — "Users can manage their own listings",
 * `USING (auth.uid() = user_id)` — checked against `pg_policies` on the live
 * database, so no account can read a row another account wrote. `Marketplace.tsx`
 * matches it: every query it makes is `.eq('user_id', session.user.id)`, and the
 * page has no browse tab at all (search, trends, watchlist, listings). So a
 * listing cannot be found by anybody, and a message about one cannot arrive.
 *
 * CLAUDE.md §8 already knew: "listings/wishlist_shares are owner-only, so the
 * marketplace and shared wishlists cannot actually be read by other users — that
 * is a FEATURE GAP, and closing it means loosening RLS deliberately".
 *
 * What is left is every part of the flow that does work today, and it is a real
 * feature: the listing, the condition and foiling, recording the sale, and the
 * copy leaving your collection. When the other half of the market exists, this
 * sentence gets the clause back.
 */
function SellPanel() {
  return (
    <div className="rounded-xl bg-muted/30 p-4">
      <p className="text-sm font-medium">Sell what you are not playing</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        List straight out of your collection with condition, foiling and quantity. Record the sale
        and the copy leaves your collection on its own.
      </p>
    </div>
  );
}

/** Verified against `buildBuyRows`. True today, chart or no chart. */
function BuyLinks({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="mr-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        Buy links open at
      </span>
      {VENDORS.map(v => (
        <span key={v} className="rounded-full bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          {v}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section                                                                    */
/* -------------------------------------------------------------------------- */

export function HomeMarketplace() {
  /*
   * READ STRAIGHT OUT OF THE SNAPSHOT, DURING RENDER. NO GATE, NO SKELETON, NO
   * SETTLING — AND THIS WAS THE BIGGEST LAYOUT SHIFT ON THE PAGE.
   *
   * The old shape was `useDeferredResult(near, loadPriceTracking)`: wait for
   * the section to come within 600px, then resolve a promise, then re-render.
   * Two renders, and the first one drew the skeleton branch. Measured on a
   * 390px phone against the built site, this section went from 1,600px to
   * 661px the moment it settled — a 939px collapse under the reader, and every
   * section below it moving up by that much. Under a fast scroll it measured
   * CLS 0.208, which is twice the "poor" threshold, on a page whose law is
   * "animate transform and opacity only, never shift layout".
   *
   * None of that bought anything, because `loadPriceTracking` was
   * `Promise.resolve(priceTracking())` over a JSON file that is already in the
   * bundle. There is nothing to wait for. `priceTracking()` returns the same
   * answer on the first render as on the second, so the section can be right
   * the first time it paints and never move again.
   *
   * The distinction the old comment was defending is still kept and still
   * matters: null means "no card has two price snapshots yet", never "this is
   * arriving". It is simply known immediately now, so no skeleton is drawn at
   * all rather than being drawn and then withdrawn.
   */
  const data = readPriceTracking();

  const hero = data?.cards[0] ?? null;
  const rest = data?.cards.slice(1) ?? [];
  /** Nothing to draw. Known on the first render, so nothing ever swaps. */
  const noSeries = hero === null;

  return (
    <Section>

      {/* TWO CLAIMS CAME OUT OF THIS LEAD BECAUSE NEITHER WAS TRUE.
​
          "going back months" — broad daily capture only started on 19 August
          2026 (CLAUDE.md §7), and `priceTracking` is null in the shipped
          snapshot, so there is no series of any length behind it yet.
​
          "buy without leaving the page" — contradicted four hundred pixels
          below by our own chip row, which says buy links open at TCGplayer,
          Cardmarket and three others. Buying leaves the page. */}
      <SectionHeading
        eyebrow="Marketplace"
        title="Watch the price before you buy it"
        lead={
          <>
            DeckMatrix saves the price of every card it tracks, once a day, so you can see whether a
            card is climbing or falling instead of only today&rsquo;s number.{' '}
            <span className="hidden sm:inline">
              Put cards up for sale straight from your collection, and get told when one hits the
              price you wanted.
            </span>
          </>
        }
      />

      {/* WITH NO SERIES, THE SECTION SHOWS THE THINGS THAT ARE TRUE.
​
          `priceTracking` is null in the shipped snapshot, so until now every
          visitor to deckmatrix.com read "No price history to chart yet" and
          "Nothing on the watch list yet." under a heading promising a price
          before you buy. Both lines were honest and well written and both were
          an apology for an exhibit that had not arrived.
​
          A homepage section is not obliged to hold a slot open for data it does
          not have. Selling out of your collection and the five places a buy
          link opens are true today, so those are what the section is when there
          is no chart, and the chart comes back on its own the first morning two
          days of prices exist. */}
      {noSeries ? (
        <div className="mt-9 rounded-2xl bg-card p-5 shadow-2xl shadow-black/40 sm:mt-14 sm:p-8">
          <SellPanel />
          <BuyLinks className="pt-6" />
        </div>
      ) : (
      <div className="mt-9 grid gap-5 sm:mt-14 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------------------------------------------------- the tracked card */}
        <div className="flex min-w-0 flex-col rounded-2xl bg-card p-5 shadow-2xl shadow-black/40 sm:p-8">
          {/* No skeleton branch. `noSeries` above is `hero === null`, so this
              arm only ever runs with a card in hand. The skeleton that stood
              here was the second render of a value that was never late. */}
          {(
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
                    {hero.series.length} days
                  </span>
                  <span>{data ? shortDate(data.to) : ''}</span>
                </div>

                {/* Low, high and first-tracked. Desktop only: the chart
                    directly above draws all three, the big figure beside it is
                    today's price, and the change badge is the movement. At 390px
                    these three tiles are the chart written out as numbers. */}
                <dl className="mt-6 grid grid-cols-3 gap-3 max-sm:hidden">
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

          <BuyLinks className="mt-auto pt-8" />
        </div>

        {/* -------------------------------------------------------- the watchlist */}
        <div className="flex min-w-0 flex-col rounded-2xl bg-card p-5 shadow-2xl shadow-black/40">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Also tracking
          </p>

          <ul className="mt-4 space-y-2.5">
            {(
              /* Two on a phone, four from `sm` up. Each row is a card, a
                 sparkline and two figures, and the list is a supporting exhibit
                 beside the tracked card above it rather than the argument.
                 No skeleton arm: `data` is read during render, so it is never
                 null here. */
              rest.map((entry, i) => (
                <div key={entry.card.id} className={cn(i >= 2 && 'hidden sm:block')}>
                  <WatchRow entry={entry} />
                </div>
              ))
            )}
          </ul>

          <div className="mt-auto pt-6">
            <SellPanel />
          </div>
        </div>
      </div>
      )}

      {/* The dates are the claim. They say which day the last point on these
          lines is from, which is the only honest way to caption a chart drawn
          from a file written last night. "Snapshots" was our word for a stored
          row; the reader's word is prices. */}
      {data && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Daily prices between {shortDate(data.from)} and {shortDate(data.to)}.
        </p>
      )}

      <div className="mt-8 text-center sm:mt-10">
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
