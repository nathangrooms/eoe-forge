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

const PER_VIEW = 3;

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

      <div className="grid gap-6 p-5 md:p-6 lg:grid-cols-5">
        {/* Centred against the rail beside it. The numbers are a short block and
            the cards are a tall one, so pinning both to the top left a third of
            this panel as empty charcoal. */}
        <div className="flex min-w-0 flex-col lg:col-span-2 lg:justify-center">
          <h2 className="text-base font-semibold text-foreground">
            What your collection is worth
          </h2>

          {loading ? (
            <>
              <Skeleton className="mt-3 h-12 w-48" />
              <Skeleton className="mt-3 h-4 w-56" />
              <Skeleton className="mt-6 h-7 w-full" />
            </>
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
            <>
              <Link
                to="/collection"
                className="mt-2 block rounded-lg text-4xl font-semibold tabular-nums tracking-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-5xl"
              >
                {asUSD(totalValue)}
              </Link>

              <p className="mt-2 text-sm text-muted-foreground">
                {(collection?.totalCards ?? 0).toLocaleString()} cards,{' '}
                {(collection?.uniqueCards ?? 0).toLocaleString()} different printings
              </p>

              {unpriced > 0 && (
                /* The one thing this panel must never do is present a partial
                   total as the whole answer. */
                <p className="mt-1 text-sm text-muted-foreground">
                  {unpriced === 1
                    ? 'One card has no price yet, so it is not in this total.'
                    : `${unpriced.toLocaleString()} cards have no price yet, so they are not in this total.`}
                </p>
              )}

              <ValueTrend trend={trend} />
            </>
          )}
        </div>

        <div className="min-w-0 lg:col-span-3">
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
  if (trend.loading) return <Skeleton className="mt-6 h-7 w-full" />;

  if (trend.points.length < 2) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        {trend.points.length === 1
          ? `Prices for your cards were first recorded on ${formatDay(trend.points[0].date)}. Once there is a second day, the change shows here.`
          : 'We have not recorded prices for your cards yet. Once we have, the change shows here.'}
      </p>
    );
  }

  const first = trend.points[0];
  const last = trend.points[trend.points.length - 1];
  const change = trend.changeUSD ?? 0;
  const percent = first.valueUSD > 0 ? (change / first.valueUSD) * 100 : 0;
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'level';

  return (
    <div className="mt-6">
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
