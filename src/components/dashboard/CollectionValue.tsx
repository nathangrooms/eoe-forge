import { Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { getBestCardImage } from '@/lib/scryfall/card-utils';
import { asUSD } from '@/features/dashboard/value';
import { useCardLookup } from '@/features/dashboard/cardLookup';
import { useCollectionTrend } from '@/features/dashboard/trend';
import type { DashboardSummary } from '@/features/dashboard/hooks';
import { RailSection, RailEmpty, railTileWidth } from './RailSection';
import { RailTile } from './RailTile';
import { Sparkline } from './Sparkline';

/**
 * What your collection is worth, and which cards are carrying it.
 *
 * This replaces four small number tiles that sat in a row across the top saying
 * "collection value", "cards owned", "decks", "wishlist". They were the same
 * size as each other and none of them was the size of the question. A player
 * opening this app wants the total large and wants to see the cards behind it;
 * the other three numbers belong beside their own subjects, and that is where
 * they now are, in the headings of the sections about decks and wanted cards.
 *
 * The blurred ground is the approved identity pattern: the art is the art of the
 * single most valuable card in this collection, so it is a picture OF the thing
 * on screen rather than wallpaper. It appears exactly once on the page.
 *
 * Honesty rules this panel enforces, because a collection total is the number
 * people insure against:
 *
 *   - cards the catalogue holds no price for are counted and named, so the total
 *     is never presented as complete when it is not;
 *   - the trend is drawn only from real recorded snapshots, and when there is
 *     one day of them the panel says so instead of drawing a flat line;
 *   - nothing here renders 0 in place of "we do not know".
 */

/* Five, matching the deck rail above it. The panel is the full page width now
   rather than three fifths of it. */
const PER_VIEW = 5;

/** As many as the rail can page through without becoming the collection page. */
const SHOWN = 12;

interface CollectionValueProps {
  summary: DashboardSummary | null;
  loading: boolean;
}

export function CollectionValue({ summary, loading }: CollectionValueProps) {
  const collection = summary?.collection;
  const holdings = collection?.holdings ?? [];
  const top = holdings.slice(0, SHOWN);

  const lookup = useCardLookup(
    top.map(h => h.cardId),
    top.map(h => h.name)
  );
  const trend = useCollectionTrend(holdings);

  const best = top[0] ? lookup.resolve(top[0].cardId, top[0].name) : null;
  const ground = best ? getBestCardImage(best, 'art_crop') : undefined;

  const totalValue = collection?.totalValueUSD ?? 0;
  const unpriced = collection?.unpricedCards ?? 0;
  const isEmpty = !loading && holdings.length === 0;

  return (
    <section
      aria-label="What your collection is worth"
      className="relative isolate overflow-hidden rounded-2xl bg-card shadow-lg shadow-black/20"
    >
      {/* Texture, not a picture. Blurred and scaled past the edges so the blur
          radius never drags a transparent edge inward, and so there is no detail
          left for anyone to complain about being cropped. */}
      {ground && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <img
            src={ground}
            alt=""
            draggable={false}
            decoding="async"
            className="h-full w-full scale-125 object-cover opacity-60 blur-2xl"
          />
          {/* A flat scrim first, so contrast never depends on which part of the
              art happened to land behind a given letter, then a soft fade at the
              edges so the band does not end on a line. */}
          <div className="absolute inset-0 bg-card/75" />
          <div className="absolute inset-0 bg-gradient-to-r from-card via-transparent to-card/80" />
        </div>
      )}

      {/*
       * THE NUMBERS SIT ABOVE THE CARDS, NOT BESIDE THEM.
       *
       * This was a five-column grid: two columns of text, three of card rail.
       * The text is a heading, a number and two short lines, and the rail is as
       * tall as a Magic card, so the left column was a hundred and fifty pixels
       * of type vertically centred in three hundred and eighty pixels of
       * blurred charcoal — measured at 1600 x 1000, 390px wide by 380px tall
       * with nothing in it. Centring it hid the emptiness; it did not remove it.
       *
       * Stacked, the number gets the full width to be large in, the facts sit
       * beside it on the same baseline instead of wrapping under it, and the
       * rail below runs the whole width like the deck rail above it. Two
       * full-width rails of card art is one rhythm rather than two layouts.
       */}
      <div className="flex flex-col gap-5 p-5 md:p-6">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-base font-semibold text-foreground">
            What your collection is worth
          </h2>

          {loading ? (
            /* Shaped like what replaces it: a wide number with the facts beside
               it, not stacked, so the panel does not jump when it loads. */
            <div className="mt-2 flex flex-col gap-x-8 gap-y-3 md:flex-row md:items-end">
              <Skeleton className="h-12 w-48 shrink-0" />
              <div className="min-w-0 flex-1 md:pb-1">
                <Skeleton className="h-4 w-full max-w-md" />
                <Skeleton className="mt-2 h-4 w-full max-w-sm" />
              </div>
            </div>
          ) : isEmpty ? (
            <div className="mt-3 max-w-sm">
              <p className="text-2xl font-semibold text-foreground">No cards yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Add your cards and this shows what they are worth, updated with the market every
                night. Scanning is the quickest way in.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/scan"
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Scan your cards
                </Link>
                <Link
                  to="/collection/import"
                  className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
                >
                  Paste a list
                </Link>
              </div>
            </div>
          ) : (
            /* The total, what it is made of, and the change, on ONE line across
               the panel. Stacked they were three short paragraphs down the left
               edge of a wide box; side by side the row is full and the number
               still leads because it is three times the size of everything
               beside it. */
            <div className="mt-2 flex flex-col gap-x-8 gap-y-3 md:flex-row md:items-end">
              <Link
                to="/collection"
                className="block shrink-0 rounded-lg text-4xl font-semibold tabular-nums tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-5xl"
              >
                {asUSD(totalValue)}
              </Link>

              <div className="min-w-0 flex-1 md:pb-1">
                <p className="text-sm text-muted-foreground">
                  {(collection?.totalCards ?? 0).toLocaleString()} cards,{' '}
                  {(collection?.uniqueCards ?? 0).toLocaleString()} different printings
                  {unpriced > 0 && (
                    /* The one thing this panel must never do is present a
                       partial total as the whole answer. */
                    <>
                      {'. '}
                      {unpriced === 1
                        ? 'One card has no price yet, so it is not in this total.'
                        : `${unpriced.toLocaleString()} cards have no price yet, so they are not in this total.`}
                    </>
                  )}
                </p>
                <ValueTrend trend={trend} />
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <RailSection
            title="Your best cards"
            count={
              top.length > 0 ? `top ${top.length} of ${holdings.length.toLocaleString()}` : undefined
            }
            to="/collection"
            linkLabel="Collection"
            perView={PER_VIEW}
            loading={loading}
            isEmpty={isEmpty}
            empty={
              <RailEmpty
                icon={Package}
                headline="Nothing to show yet"
                body="The cards you own turn up here, most valuable first."
              />
            }
          >
            {top.map((holding, index) => {
              const card = lookup.resolve(holding.cardId, holding.name);
              const copies = holding.quantity + holding.foil;

              return (
                <div key={holding.cardId} className={railTileWidth(PER_VIEW)}>
                  <RailTile
                    to={`/cards/${holding.cardId}`}
                    card={card}
                    colors={card?.color_identity ?? []}
                    fallbackNote="No card art for this printing"
                    eager={index < PER_VIEW}
                    title={holding.name ?? 'Card'}
                    overlay={
                      copies > 1 ? (
                        <span className="absolute bottom-0 right-0 rounded-tl-md bg-background/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur">
                          &times;{copies}
                        </span>
                      ) : undefined
                    }
                    subtitle={
                      <span className="block truncate font-medium text-foreground">
                        {holding.valueUSD === null ? 'No price yet' : asUSD(holding.valueUSD)}
                      </span>
                    }
                    meta={<span className="block truncate">{describeCopies(holding, card)}</span>}
                  />
                </div>
              );
            })}
          </RailSection>
        </div>
      </div>
    </section>
  );
}

/**
 * The change, or the reason there is not one yet.
 *
 * Both branches are load-bearing. Nightly price capture only reached its current
 * shape on 19 August 2026, so most collections genuinely have one day of history
 * and a widget that showed a flat line and "no change" would be stating
 * something it does not know.
 */
function ValueTrend({ trend }: { trend: ReturnType<typeof useCollectionTrend> }) {
  if (trend.loading) return <Skeleton className="mt-2 h-7 w-full" />;

  if (trend.points.length < 2) {
    return (
      <p className="mt-1 text-sm text-muted-foreground">
        {trend.points.length === 1
          ? `Your cards were first priced on ${formatDay(trend.points[0].date)}. Once there is a second day, the change shows here.`
          : /* NOT "we have no prices for your cards". This sentence sits four
               lines under a total in dollars, and it said the opposite of the
               number above it: the total is today's price, this is about the
               day-by-day record behind it. Two true facts, one of which read as
               a flat contradiction of the other. */
            'Nothing to compare against yet. Once your cards have been priced on two different days, the change shows here.'}
      </p>
    );
  }

  const first = trend.points[0];
  const last = trend.points[trend.points.length - 1];
  const change = trend.changeUSD ?? 0;
  const percent = first.valueUSD > 0 ? (change / first.valueUSD) * 100 : 0;
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'level';

  return (
    <div className="mt-2">
      <Sparkline
        values={trend.points.map(point => point.valueUSD)}
        label={`Value of your cards from ${formatDay(first.date)} to ${formatDay(last.date)}`}
      />
      <p className="mt-2 text-sm text-muted-foreground">
        {direction === 'level' ? (
          <>Level since {formatDay(first.date)}.</>
        ) : (
          <>
            <span className="font-medium text-foreground">
              {change > 0 ? '+' : ''}
              {asUSD(change)}
            </span>{' '}
            ({percent > 0 ? '+' : ''}
            {percent.toFixed(1)}%) since {formatDay(first.date)}.
          </>
        )}{' '}
        Measured across the {trend.tracked.toLocaleString()}{' '}
        {trend.tracked === 1 ? 'card' : 'cards'} we have a price for on every day shown.
      </p>
    </div>
  );
}

/**
 * The third line of a card tile: which set, and how many copies of what.
 *
 * A single non-foil copy is the ordinary case and saying "1 normal" about it is
 * noise, so that case shows the set instead, which is the fact that actually
 * distinguishes one printing from another.
 */
function describeCopies(
  holding: { quantity: number; foil: number },
  card: { set_code?: string | null } | null
): string {
  const set = card?.set_code ? card.set_code.toUpperCase() : '';
  const parts: string[] = [];
  if (holding.foil > 0) parts.push(`${holding.foil} foil`);
  if (holding.quantity > 1) parts.push(`${holding.quantity} copies`);
  else if (holding.quantity === 1 && holding.foil > 0) parts.push('1 normal');
  if (parts.length === 0) return set;
  return set ? `${set}, ${parts.join(' and ')}` : parts.join(' and ');
}

function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
