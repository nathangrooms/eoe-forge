import { CardDetailPane } from '@/components/cards/CardDetailPane';

/**
 * Compatibility shim over the inline card-detail pane.
 *
 * There used to be two components both exported as `UniversalCardModal` with
 * incompatible props, so the same card looked different depending on whether
 * you clicked it in a storage box or in search. That was reconciled to one
 * dialog; the dialog is now gone too. This keeps the `open`/`onOpenChange`
 * prop names its callers use and renders the in-layout pane instead — nothing
 * dims, nothing traps focus, and the list behind it stays usable.
 *
 * @deprecated Use `CardDetailPane` from `@/components/cards`, or `/cards/:id`.
 */
interface UniversalCardModalProps {
  card: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCardAdd?: (card: any) => void;
  onCardWishlist?: (card: any) => void;
  showAddButton?: boolean;
  showWishlistButton?: boolean;
  className?: string;
}

export function UniversalCardModal({
  card,
  open,
  onOpenChange,
  onCardAdd,
  onCardWishlist,
  showAddButton = true,
  showWishlistButton = false,
  className,
}: UniversalCardModalProps) {
  if (!open || !card) return null;

  return (
    <CardDetailPane
      card={card}
      onClose={() => onOpenChange(false)}
      onAddToCollection={showAddButton ? onCardAdd : undefined}
      onAddToWishlist={showWishlistButton ? onCardWishlist : undefined}
      className={className ?? 'mt-6'}
    />
  );
}

export default UniversalCardModal;
