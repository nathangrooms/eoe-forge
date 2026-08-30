import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check, Heart, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CardImage } from '@/components/cards';
import { formatAmount } from '@/lib/pricing';
import { gapLine, summariseGaps, wantedBy, type GapPick } from '@/lib/wishlist/gaps';
import type { DeckGap } from './WishlistByDeck';

/**
 * The wishlist with nothing on it, which is the version every new account sees
 * first and was therefore the most looked at and the weakest.
 *
 * Measured on 30 Aug 2026 at 1600x1000: a row of six tiles all reading zero, a
 * line saying "0 entries, 0 cards", a heart in a grey circle, and 292px of
 * black below the fold. Not a single card image on a page about buying cards.
 *
 * ## What fills it, and why it is real
 *
 * The page already computes, for every deck the player owns, exactly which
 * cards the list calls for that the collection does not hold. That is a real
 * shopping list the player has not written down yet, and it is the reason a
 * wishlist exists. So an empty wishlist shows those cards, dearest first, as
 * whole card images with a one-tap way onto the list.
 *
 * Nothing here is invented. A player whose decks are complete is told so. A
 * player with no decks gets the two links out and nothing dressed up to look
 * like content, because there is genuinely nothing to show them yet.
 *
 * ## The counting
 *
 * `summariseGaps` does it, and it is tested. A card missing from two decks is
 * ONE tile, so the line above says one card. Getting that wrong is how a
 * heading comes to promise more than the grid holds, which is the bug this
 * pass exists to close.
 */

/** Tiles drawn before the grid admits it is holding cards back. */
const SHOWN = 12;

export interface WishlistEmptyProps {
  gaps: DeckGap[];
  gapsLoading: boolean;
  /** False when the player has not built a deck at all. */
  hasDecks: boolean;
  onAddCard: (card: { id: string; name: string }) => void;
  onCardClick: (cardId: string) => void;
  /** Takes the reader to the search panel on this page. */
  onSearch: () => void;
}

export function WishlistEmpty({
  gaps,
  gapsLoading,
  hasDecks,
  onAddCard,
  onCardClick,
  onSearch,
}: WishlistEmptyProps) {
  /* `DeckGap` already carries everything `GapSourceDeck` asks for. No mapping
     step, so there is no second place for the shape to drift. */
  const summary = useMemo(() => summariseGaps(gaps, SHOWN), [gaps]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-card p-6 shadow-lg shadow-black/20 sm:p-8">
        <Heart className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-2 text-lg font-semibold text-foreground">Your wishlist is empty</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Put a card on here and DeckMatrix keeps its price in view, tells you when it drops to what
          you said you would pay, and shows which of your decks is waiting on it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" className="gap-2" onClick={onSearch}>
            <Search className="h-4 w-4" aria-hidden="true" />
            Find a card
          </Button>
          <Button size="sm" variant="secondary" asChild>
            <Link to="/decks">Your decks</Link>
          </Button>
        </div>
      </div>

      {gapsLoading ? (
        <GapSkeleton />
      ) : summary.cards > 0 ? (
        <section className="rounded-xl bg-muted/20 p-4 sm:p-6" aria-label="Cards your decks are short of">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {gapLine(summary)}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {summary.deckNames.length === 1
              ? `Every one of these is for ${summary.deckNames[0]}. You already own the rest of it, so these are the cards standing between a list and a deck you can shuffle up.`
              : 'You already own the rest. These are the cards standing between a list and a deck you can shuffle up, so they are the ones worth watching.'}
          </p>

          {/* Whole cards, uncropped, at a size where the art reads. Two on a
              phone rather than one, because twelve full width cards is a
              6,000px empty state nobody scrolls to the end of. */}
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {summary.picks.map(pick => (
              <GapTile
                key={pick.cardId}
                pick={pick}
                /* One deck's name under twelve cards is twelve truncated
                   copies of the same string. It is said once, above. */
                showDeck={summary.deckNames.length > 1}
                onOpen={() => onCardClick(pick.cardId)}
                onAdd={() => onAddCard({ id: pick.cardId, name: pick.name })}
              />
            ))}
          </div>
        </section>
      ) : hasDecks ? (
        <section className="rounded-xl bg-muted/20 p-6 sm:p-8">
          <Check className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-2 text-base font-semibold text-foreground">
            Every card in your decks is already in your collection
          </h3>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Nothing is holding a list up. A wishlist is for the next deck rather than this one, so
            search for what you fancy and it will sit here with its price attached.
          </p>
        </section>
      ) : (
        <section className="rounded-xl bg-muted/20 p-6 sm:p-8">
          <h3 className="text-base font-semibold text-foreground">Build a deck first</h3>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Once a deck exists, this page works out which of its cards you do not own yet and puts
            them here on their own, so you never have to type a buy list by hand.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" asChild>
              <Link to="/decks">Start a deck</Link>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/precons">Browse precons</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * One card a deck is waiting on.
 *
 * The price is read through `formatAmount`, which returns null rather than
 * "$0.00": around a thousand printings carry no USD price at all and the
 * cheapest real one is 0.01, so a rendered zero is always invented. A card we
 * could not price says nothing about money and still shows the copies wanted.
 */
function GapTile({
  pick,
  showDeck,
  onOpen,
  onAdd,
}: {
  pick: GapPick;
  showDeck: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const money = pick.price > 0 ? formatAmount(pick.price * pick.missing, 'USD') : null;
  const deck = showDeck ? wantedBy(pick) : '';
  const copies = pick.missing > 1 ? `${pick.missing} copies` : '';
  const line = [money, deck || copies].filter(Boolean).join(' · ');

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <CardImage
        card={{ name: pick.name, image_uris: pick.images }}
        fill
        quality="normal"
        onClick={onOpen}
        label={`Open ${pick.name}`}
        title={pick.name}
      >
        {pick.missing > 1 && (
          <span className="absolute right-1.5 top-1.5 rounded bg-background/85 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground">
            {pick.missing}
          </span>
        )}
      </CardImage>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{pick.name}</p>
        {/* Reserved whether or not there is a line, so a card with no price
            does not stand a row's buttons out of line with the five beside it. */}
        <p className="min-h-[1rem] truncate text-xs text-muted-foreground">{line}</p>
      </div>

      {pick.onWishlist ? (
        <span className="inline-flex items-center justify-center gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-xs font-medium text-foreground">
          <Heart className="h-3.5 w-3.5" aria-hidden="true" />
          On your list
        </span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="w-full gap-1.5"
          onClick={onAdd}
          aria-label={`Add ${pick.name} to your wishlist`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Wishlist
        </Button>
      )}
    </div>
  );
}

/** Holds the grid's shape while the gaps are still being worked out. */
function GapSkeleton() {
  return (
    <div className="rounded-xl bg-muted/20 p-4 sm:p-6">
      <Skeleton className="h-3 w-56" />
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="w-full" style={{ aspectRatio: '488 / 680' }} />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
