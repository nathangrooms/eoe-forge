/**
 * What your decks are short of, gathered across all of them, for the wishlist
 * screen a new account actually sees first.
 *
 * The wishlist page already computes a gap per deck: what the list calls for
 * minus what the collection holds. `WishlistByDeck` draws that a deck at a
 * time, which is right when you are shopping for one deck. An empty wishlist
 * wants the other cut: the cards, biggest first, whichever deck wants them.
 *
 * ## The counting rule, which is the whole reason this is a file
 *
 * A card can be missing from two decks at once. That makes three different
 * numbers available and every one of them is a plausible thing to print above
 * the grid:
 *
 *   - CARDS      distinct cards at least one deck is short of
 *   - COPIES     how many physical cards would have to be bought
 *   - ROWS       one per deck per card, which is what a naive flatten produces
 *
 * A grid of card tiles shows one tile per CARD, so the line above it counts
 * cards. Copies are printed on the tile that needs more than one, where they
 * belong. Rows are never shown to anybody: they are an accident of the data
 * shape and printing them would mean saying "12 cards" above eight pictures.
 *
 * This is the same class of bug as the tournaments rail that read "2 decks in
 * your library" above one card, and it is worth a test for the same reason:
 * this product asks people to trust an EDH power score.
 */

export interface GapSourceCard {
  cardId: string;
  name: string;
  /** Copies this deck still needs, always > 0. */
  missing: number;
  price: number;
  images?: Record<string, string>;
  onWishlist: boolean;
}

export interface GapSourceDeck {
  deckId: string;
  name: string;
  cards: GapSourceCard[];
}

export interface GapPick {
  cardId: string;
  name: string;
  images?: Record<string, string>;
  /** Copies wanted across every deck that is short of this card. */
  missing: number;
  /** Market price of one copy. Zero means we could not price it. */
  price: number;
  onWishlist: boolean;
  /** Decks short of this card, in the order they were given. */
  decks: string[];
}

export interface GapSummary {
  /** The tiles to draw, biggest spend first. */
  picks: GapPick[];
  /** Distinct cards at least one deck is short of. The tile denominator. */
  cards: number;
  /** Physical copies that would have to be bought. */
  copies: number;
  /** Decks that are short of at least one card. */
  decks: number;
  /**
   * Those decks by name, in the order given.
   *
   * The screen reads this to decide whether naming the deck on every tile says
   * anything. With one deck it does not: twelve cards each captioned with the
   * same truncated deck name is noise, so the name is said once in the
   * sentence above them instead.
   */
  deckNames: string[];
}

/**
 * Fold every deck's gap list into one, biggest spend first.
 *
 * "Biggest spend" is price times copies, matching the order `WishlistByDeck`
 * already sorts each deck's own list by, so the two screens agree about which
 * card matters most. Cards with no price fall to the bottom rather than being
 * dropped: an unpriced card is still a card the deck has not got.
 */
export function summariseGaps(gaps: GapSourceDeck[], limit: number): GapSummary {
  const byCard = new Map<string, GapPick>();
  let copies = 0;
  const decksWithGaps = new Set<string>();
  const deckNames: string[] = [];

  for (const deck of gaps) {
    if (deck.cards.length > 0 && !decksWithGaps.has(deck.deckId)) deckNames.push(deck.name);
    if (deck.cards.length > 0) decksWithGaps.add(deck.deckId);
    for (const card of deck.cards) {
      copies += card.missing;
      const seen = byCard.get(card.cardId);
      if (seen) {
        seen.missing += card.missing;
        seen.onWishlist = seen.onWishlist || card.onWishlist;
        if (!seen.decks.includes(deck.name)) seen.decks.push(deck.name);
        /* Keep whichever price we actually have. Two decks referencing the
           same card id must report the same figure, and zero means unpriced,
           never free: the cheapest real price in the catalogue is 0.01. */
        if (seen.price <= 0 && card.price > 0) seen.price = card.price;
        if (!seen.images && card.images) seen.images = card.images;
      } else {
        byCard.set(card.cardId, {
          cardId: card.cardId,
          name: card.name,
          images: card.images,
          missing: card.missing,
          price: card.price,
          onWishlist: card.onWishlist,
          decks: [deck.name],
        });
      }
    }
  }

  const ordered = [...byCard.values()].sort((a, b) => {
    const spend = b.price * b.missing - a.price * a.missing;
    if (spend !== 0) return spend;
    /* Total order, so a cap never shows one card twice and hides another. */
    return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
  });

  return {
    picks: ordered.slice(0, Math.max(0, limit)),
    cards: ordered.length,
    copies,
    decks: decksWithGaps.size,
    deckNames,
  };
}

/**
 * The line above the grid, which has to count the tiles under it.
 *
 * No em-dash and no jargon, per the copy rules.
 */
export function gapLine(summary: GapSummary): string {
  const { picks, cards, decks } = summary;
  if (cards === 0) return '';

  const deckPart = `${decks} deck${decks === 1 ? '' : 's'}`;
  const cardPart = `${cards} card${cards === 1 ? '' : 's'}`;

  if (picks.length >= cards) {
    return `${deckPart} short of ${cardPart}`;
  }
  return `${deckPart} short of ${cardPart}, and these are the ${picks.length} dearest`;
}

/** Which decks want this card, said in the space one line allows. */
export function wantedBy(pick: GapPick): string {
  if (pick.decks.length === 0) return '';
  if (pick.decks.length === 1) return pick.decks[0];
  return `${pick.decks.length} of your decks`;
}
