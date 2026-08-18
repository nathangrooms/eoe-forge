import { CardDetailPane } from '@/components/cards/CardDetailPane';

/**
 * Compatibility shim — there is no card modal any more.
 *
 * This file used to be the `<Dialog>` that every card in the product opened
 * into: it dimmed the page, trapped focus and covered the very list the player
 * was comparing the card against. The detail surface now lives in
 * `@/components/cards/CardDetail`, rendered either as the routed `/cards/:id`
 * page or as an in-layout pane beside the list.
 *
 * The old `isOpen`/`onClose` contract is kept only so a caller that has not yet
 * been converted to `CardDetailSplit` still renders something sane — an
 * ordinary block in the flow that scrolls itself into view, with no overlay and
 * no focus trap. New code should import `CardDetailPane` (or link to
 * `/cards/:id`) directly.
 *
 * @deprecated Use `CardDetailPane` from `@/components/cards`, or `/cards/:id`.
 */
interface CardDetailShimProps {
  card: any;
  isOpen: boolean;
  onClose: () => void;
  onAddToCollection?: (card: any) => void;
  onAddToWishlist?: (card: any) => void;
  onAddToDeck?: (card: any) => void;
  className?: string;
}

export function UniversalCardModal({
  card,
  isOpen,
  onClose,
  onAddToCollection,
  onAddToWishlist,
  onAddToDeck,
  className,
}: CardDetailShimProps) {
  if (!isOpen || !card) return null;

  return (
    <CardDetailPane
      card={card}
      onClose={onClose}
      onAddToCollection={onAddToCollection}
      onAddToWishlist={onAddToWishlist}
      onAddToDeck={onAddToDeck}
      className={className ?? 'mt-6'}
    />
  );
}

export default UniversalCardModal;
