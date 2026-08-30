import { Link } from 'react-router-dom';
import { Heart, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeckRail } from '@/components/deck/DeckRail';
import { useDeckLibrary } from '@/hooks/useDeckLibrary';
import { showListItemCount } from '@/lib/shopping';
import { PasteCardList } from './PasteCardList';
import { PlaytestOnlyNote } from './PlaytestOnlyNote';

/**
 * The proxy page with nothing on the list yet.
 *
 * ## Why it is its own file
 *
 * It reads the player's decks, and a page that already has forty cards on it
 * should not pay for that read. A hook cannot be called conditionally, so the
 * empty screen is a component and the hook lives inside it. `ProxyListPage`
 * mounts it only when the list is empty.
 *
 * ## What is on it, and why each thing is real
 *
 * Measured on 30 Aug 2026 this screen ended 157px above the fold on a
 * 1600x1000 laptop and carried no card image at all, on a page whose entire
 * subject is printing card images. What filled it is not decoration:
 *
 * - **The paste box**, because pasting a list is the thing most people will
 *   actually do and the empty state used to describe a control that did not
 *   exist ("Add cards from any card page or search result").
 * - **The lists you already keep**, offered with their real size so nobody
 *   opens a panel to find nothing in it.
 * - **Your decks**, as their commanders, each one a link straight to that
 *   deck's proxy sheet. A deck already in DeckMatrix never needs pasting, and
 *   that used to be a sentence with a generic "Open a deck" button under it.
 *   Now it is the decks.
 *
 * Nothing is invented. A player with no decks sees no rail, and the two links
 * out are all that is left, which is the honest amount.
 */
export function ProxyListEmpty({
  fromShopping,
  fromWishlist,
  shoppingCopies,
  wishlistCopies,
  onBring,
}: {
  /** Distinct cards on each list. Zero means the button is not offered. */
  fromShopping: number;
  fromWishlist: number;
  /** COPIES, which is what the panel that opens counts and what gets written. */
  shoppingCopies: number;
  wishlistCopies: number;
  onBring: (source: 'shopping' | 'wishlist') => void;
}) {
  const { decks, loading } = useDeckLibrary();

  return (
    <div className="space-y-6">
      <PasteCardList kind="proxy" />

      {(fromShopping > 0 || fromWishlist > 0) && (
        <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
          <p className="text-sm text-foreground">
            You already keep lists of cards you do not own yet. Bring one straight over.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {fromShopping > 0 && (
              <Button variant="secondary" size="sm" className="gap-2" onClick={() => onBring('shopping')}>
                <ShoppingCart className="h-4 w-4" />
                Your shopping list, {showListItemCount(shoppingCopies)}
              </Button>
            )}
            {fromWishlist > 0 && (
              <Button variant="secondary" size="sm" className="gap-2" onClick={() => onBring('wishlist')}>
                <Heart className="h-4 w-4" />
                Your wishlist, {showListItemCount(wishlistCopies)}
              </Button>
            )}
          </div>
        </div>
      )}

      {!loading && decks.length > 0 ? (
        <div className="rounded-xl bg-muted/20 p-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            A deck you already have in DeckMatrix does not need pasting. Pick one and the whole
            list goes straight to a sheet.
          </p>
          <div className="mt-5">
            <DeckRail
              label="Your decks, ready to print"
              decks={decks.map(deck => ({
                id: deck.id,
                name: deck.name,
                card: deck.commanderCard,
                href: `/deck/${deck.id}/proxies`,
                note: sheetNote(deck.cardCount),
              }))}
              purpose="ready to print"
            />
          </div>
        </div>
      ) : (
        !loading && (
          <div className="rounded-xl bg-muted/20 p-4 text-sm text-muted-foreground">
            <p>
              Build a deck and you can send the whole list to a sheet in one go, without pasting
              anything.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link to="/decks">Your decks</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/cards">Search for cards</Link>
              </Button>
              {fromShopping === 0 && fromWishlist === 0 && (
                <Button variant="secondary" size="sm" asChild>
                  <Link to="/shopping">Your shopping list</Link>
                </Button>
              )}
            </div>
          </div>
        )
      )}

      <PlaytestOnlyNote />
    </div>
  );
}

/**
 * How much paper a deck is, under its own card.
 *
 * Nine to a sheet is `PROXY_PER_PAGE` and the arithmetic is the same one
 * `sheetPlan` does, but this is deliberately a count of CARDS with the sheets
 * as the second half of the sentence rather than a sheet figure of its own: a
 * double faced card needs a second slot and this figure has not seen the cards
 * yet, so promising an exact sheet count here could be off by a few and would
 * then disagree with the button on the sheet itself. It says "about".
 */
function sheetNote(cardCount: number): string {
  if (cardCount <= 0) return 'No cards yet';
  const sheets = Math.ceil(cardCount / 9);
  return `${cardCount} cards, about ${sheets} ${sheets === 1 ? 'sheet' : 'sheets'}`;
}
