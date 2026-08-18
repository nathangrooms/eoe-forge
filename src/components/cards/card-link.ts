import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * The one way to open a card.
 *
 * Owner, three times over: *"Collection — if I click a card, it opens preview
 * right window, it should go straight to the card"*, *"Wishlist also doesnt
 * need right side, should open full window"*, *"Marketplace doesnt let you
 * click into a card detail page"*.
 *
 * So the rule is flat: outside play mode, clicking a card anywhere in the
 * product navigates to `/cards/:id`. No docked pane, no right-hand panel, no
 * modal. Right-hand panels stay correct for in-context *actions* — add to deck,
 * edit a listing, filters — but never for looking at a card.
 *
 * `/cards/:id` resolves a Scryfall id, one of our own `cards.id` values, or a
 * plain card name, so every row shape in the app can reach it.
 */

/**
 * Deep link for whatever card-ish object a surface happens to hold.
 *
 * Row shapes are checked before `id` on purpose: a collection row, wishlist
 * row, deck row and listing all carry their own primary key in `id` and the
 * card in `card_id`. Linking to `id` there would open a card page for a join
 * row that is not a card.
 */
export function cardDetailPath(card: any): string | null {
  if (!card) return null;
  if (typeof card === 'string') return card ? `/cards/${encodeURIComponent(card)}` : null;

  const id =
    card.card_id ?? card.cardId ?? card.scryfall_id ?? card.scryfallData?.id ?? card.id ?? null;
  if (typeof id === 'string' && id) return `/cards/${encodeURIComponent(id)}`;

  const name = card.name ?? card.card_name ?? null;
  if (typeof name === 'string' && name) return `/cards/${encodeURIComponent(name)}`;

  return null;
}

/**
 * `const openCard = useOpenCard()` — hand it any card, row or name and it goes
 * to the card page. Returns nothing and does nothing when the object carries
 * neither an id nor a name, so a click on a half-loaded row is inert rather
 * than a navigation to `/cards/undefined`.
 */
export function useOpenCard() {
  const navigate = useNavigate();
  return useCallback(
    (card: any) => {
      const path = cardDetailPath(card);
      if (path) navigate(path);
    },
    [navigate]
  );
}
