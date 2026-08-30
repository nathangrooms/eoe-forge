import { Heart } from 'lucide-react';
import { asUSD } from '@/features/dashboard/value';
import { useCardLookup } from '@/features/dashboard/cardLookup';
import type { DashboardSummary } from '@/features/dashboard/hooks';
import { RailSection, RailEmpty, railTileWidth } from './RailSection';
import { RailTile } from './RailTile';
import { showingFirst } from './railCount';

/**
 * What to pick up next: the cards you want, cheapest first.
 *
 * "What should I do next" is one of the four questions this page exists to
 * answer, and for most Commander players the honest answer is a small purchase
 * rather than a project. Cheapest first because the cheapest wanted card is the
 * easiest yes, and because the wishlist page already sorts by priority, so this
 * is a different cut of the same list rather than a duplicate of it.
 *
 * The price is the cheapest printing we hold, which is the same rule the
 * wishlist page and the deck optimiser use. Cards the catalogue has no price for
 * say so and sit at the end, because an unknown price is not a low one.
 *
 * The heading says how many of them there are as well. The total leaves those
 * cards out, and a shopping figure that leaves cards out without saying so is
 * the same defect as a collection total that does.
 */

/* Six across, not two. These two rails moved from a narrow column into a full
   width row of their own, and their per-view count did not move with them, so
   the owner got "2 massive ones" where a dozen fit. The rail still scrolls, so
   this is how many are VISIBLE rather than how many exist. */
const PER_VIEW = 6;

/** Enough to page through. The wishlist page is one click away for the rest. */
const SHOWN = 18;

interface WantedNextProps {
  className?: string;
  summary: DashboardSummary | null;
  loading: boolean;
}

export function WantedNext({ className, summary, loading }: WantedNextProps) {
  const wishlist = summary?.wishlist;
  const wanted = (wishlist?.wanted ?? []).slice(0, SHOWN);

  const lookup = useCardLookup(
    wanted.map(card => card.cardId),
    wanted.map(card => card.name)
  );

  /*
   * Cards, not rows. `totalItems` is how many wishlist ROWS there are and
   * `totalDesired` sums the copies each one asks for, so a row wanting three
   * copies is three cards. The heading said "cards" and printed the row count.
   */
  const total = wishlist?.totalDesired ?? 0;
  const value = wishlist?.valueUSD ?? 0;
  /*
   * Wanted cards the catalogue holds no price for. `valueUSD` leaves them out,
   * and a wishlist total is the number people budget against, so the count has
   * to sit beside it rather than be computed and dropped. It was computed and
   * dropped: measured 2026-08-19, four of the owner's 94 wanted cards have no
   * price and the tile read "94 cards, $8,102.41 to buy" as if that were all
   * of them.
   */
  const unpriced = wishlist?.unpricedCards ?? 0;

  /*
   * The rail draws one tile per wishlist ROW and stops at eighteen, so a
   * ninety four row list used to read "96 cards, $8,102.41 to buy" above
   * eighteen pictures. The money and the card count still describe the whole
   * list, which is what somebody budgets against, and the cap now says so.
   */
  const rows = wishlist?.totalItems ?? 0;
  const countLabel =
    total > 0
      ? `${total} cards, ${asUSD(value)} to buy${
          unpriced > 0 ? ` · ${unpriced} with no price yet` : ''
        }${showingFirst(wanted.length, rows)}`
      : undefined;

  return (
    <RailSection
      title="Wanted next"
      count={countLabel}
      to="/wishlist"
      linkLabel="Wishlist"
      perView={PER_VIEW}
      className={className}
      loading={loading}
      isEmpty={wanted.length === 0}
      empty={
        <RailEmpty
          icon={Heart}
          headline="Nothing on your wishlist"
          body="Add a card you are hunting for and it turns up here with what it costs today."
          actionLabel="Find cards"
          actionTo="/cards"
        />
      }
    >
      {wanted.map((card, index) => {
        const row = lookup.resolve(card.cardId, card.name);

        return (
          <div key={card.id} className={railTileWidth(PER_VIEW)}>
            <RailTile
              /* A card click always opens that card's page. Rows whose printing
                 is not in our catalogue at all fall back to the wishlist. */
              to={card.cardId ? `/cards/${card.cardId}` : '/wishlist'}
              card={row}
              colors={row?.color_identity ?? []}
              fallbackNote="We do not hold this printing yet"
              eager={index < PER_VIEW}
              title={card.name ?? 'Card'}
              overlay={
                card.quantity > 1 ? (
                  <span className="absolute bottom-0 right-0 rounded-tl-md bg-background/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur">
                    &times;{card.quantity}
                  </span>
                ) : undefined
              }
              subtitle={
                <span className="block truncate font-medium text-foreground">
                  {card.unitUSD === null
                    ? 'No price yet'
                    : card.quantity > 1
                      ? `${asUSD(card.unitUSD * card.quantity)} for ${card.quantity}`
                      : asUSD(card.unitUSD)}
                </span>
              }
              meta={<span className="block truncate">{describePriority(card.priority)}</span>}
            />
          </div>
        );
      })}
    </RailSection>
  );
}

/**
 * How badly you want it, in a sentence.
 *
 * Written out rather than left to `capitalize`, which capitalises every word and
 * turned "high priority" into "High Priority" mid sentence.
 */
function describePriority(priority: string | null): string {
  const key = (priority ?? '').trim().toLowerCase();
  if (key === 'high') return 'High priority';
  if (key === 'medium') return 'Medium priority';
  if (key === 'low') return 'Low priority';
  return '';
}
