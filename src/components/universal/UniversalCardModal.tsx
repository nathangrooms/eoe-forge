import { UniversalCardModal as CardDetailModal } from '@/components/enhanced/UniversalCardModal';

/**
 * Adapter, not a second card-detail experience.
 *
 * There used to be two components both exported as `UniversalCardModal` with
 * incompatible props and different tab sets, so clicking the same card from a
 * storage box and from search opened two visibly different dialogs — one of
 * which shipped a "Prints" tab that said "Loading other printings…" forever and
 * a "Synergy analysis coming soon…" tab. This file now keeps only the
 * `open`/`onOpenChange` prop contract its callers use and renders the single
 * real modal.
 */
interface UniversalCardModalProps {
  card: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCardAdd?: (card: any) => void;
  onCardWishlist?: (card: any) => void;
  showAddButton?: boolean;
  showWishlistButton?: boolean;
}

export function UniversalCardModal({
  card,
  open,
  onOpenChange,
  onCardAdd,
  onCardWishlist,
  showAddButton = true,
  showWishlistButton = false,
}: UniversalCardModalProps) {
  return (
    <CardDetailModal
      card={card}
      isOpen={open}
      onClose={() => onOpenChange(false)}
      onAddToCollection={showAddButton ? onCardAdd : undefined}
      onAddToWishlist={showWishlistButton ? onCardWishlist : undefined}
    />
  );
}
