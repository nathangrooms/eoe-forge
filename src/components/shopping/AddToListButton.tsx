import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Printer, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { cn } from '@/lib/utils';
import { useCardLists, type ItemSource, type ListKind } from '@/lib/shopping';
import { useAuth } from '@/components/AuthProvider';

/**
 * The one way to put a card on a list.
 *
 * The owner's first words about this feature were that it exists nowhere: "No
 * add to shopping list anywhere". So it has to be on the card page, in search
 * results, in deck views, on missing-card lists and in the marketplace, and it
 * has to look and behave the same in all of them. That is why there is one
 * component rather than five buttons that drifted.
 *
 * It serves both lists, because they are the same primitive. A card can sit on
 * both at once, which is a real thing a player does: proxy it for tonight, buy
 * it next month.
 *
 * WHAT IT SHOWS WHEN THE CARD IS ALREADY THERE
 * --------------------------------------------
 * The count, not a disabled button. Wanting a second copy is normal and a
 * control that refuses to work looks broken. Clicking again adds another copy
 * and says so.
 */

/** Anything in this product that stands for a card. */
export interface AddableCard {
  id?: string | null;
  card_id?: string | null;
  oracle_id?: string | null;
  oracleId?: string | null;
  name?: string | null;
  card_name?: string | null;
}

interface Resolved {
  cardId: string;
  cardName: string;
  oracleId: string | null;
}

/**
 * Row shapes are checked before `id`, exactly as `cardDetailPath` does: a
 * collection row, wishlist row and deck row all carry their own primary key in
 * `id` and the card in `card_id`. Reading `id` first would put the join row's
 * id on the list.
 */
export function resolveAddable(card: AddableCard | null | undefined): Resolved | null {
  if (!card) return null;
  const cardId = card.card_id ?? card.id ?? null;
  const cardName = card.card_name ?? card.name ?? null;
  if (typeof cardId !== 'string' || !cardId) return null;
  if (typeof cardName !== 'string' || !cardName) return null;
  const oracle = card.oracle_id ?? card.oracleId ?? null;
  return { cardId, cardName, oracleId: typeof oracle === 'string' ? oracle : null };
}

export interface AddToListButtonProps {
  card: AddableCard;
  kind: ListKind;
  /** Copies added per click. */
  quantity?: number;
  /** Why it is going on the list. Sets the reason shown beside it later. */
  source?: ItemSource;
  /** The deck that needs it, when the click came from a deck screen. */
  deckId?: string | null;
  /** `icon` drops the label for dense grids. `full` fills its container. */
  display?: 'default' | 'icon' | 'full';
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'secondary' | 'ghost';
  className?: string;
}

const LABEL: Record<ListKind, { add: string; on: string; icon: typeof ShoppingCart }> = {
  shopping: { add: 'Shopping list', on: 'On your shopping list', icon: ShoppingCart },
  proxy: { add: 'Proxy list', on: 'On your proxy list', icon: Printer },
};

export function AddToListButton({
  card,
  kind,
  quantity = 1,
  source = 'manual',
  deckId = null,
  display = 'default',
  size = 'sm',
  variant = 'secondary',
  className,
}: AddToListButtonProps) {
  const { user } = useAuth();
  const add = useCardLists(state => state.add);
  const load = useCardLists(state => state.load);
  const copiesOn = useCardLists(state => state.copiesOn);
  const loaded = useCardLists(state => state.loaded);
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  // The button has to know whether the card is already listed before it can say
  // so, and it may be the first thing on screen that needs the lists.
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const resolved = resolveAddable(card);
  const already = resolved
    ? copiesOn(kind, {
        id: resolved.cardId,
        oracle_id: resolved.oracleId,
        name: resolved.cardName,
      })
    : 0;

  const onClick = useCallback(
    async (event: React.MouseEvent) => {
      // These buttons sit inside clickable card tiles all over the product.
      event.preventDefault();
      event.stopPropagation();
      if (!resolved || saving) return;
      /*
       * ASK BEFORE TRYING, so the database never has to answer.
       *
       * The card page is public, and these two buttons sit on it beside Add to
       * collection and Add to wishlist, both of which already check for an
       * account. These did not, so a signed-out visitor pressing Shopping list
       * or Proxy list was shown, in a toast, the words
       *
       *     permission denied for function card_list_add
       *
       * which is a Postgres error naming an internal function. RLS was doing
       * exactly its job. The interface was passing the refusal straight through
       * to a player. Same copy as the sibling buttons, deliberately.
       */
      if (!user) {
        showError(
          'Sign in required',
          kind === 'shopping'
            ? 'Sign in to add cards to your shopping list.'
            : 'Sign in to add cards to your proxy list.'
        );
        return;
      }
      setSaving(true);
      try {
        await add({
          kind,
          cardId: resolved.cardId,
          cardName: resolved.cardName,
          oracleId: resolved.oracleId,
          quantity,
          source,
          sourceDeckId: deckId,
        });
        setJustAdded(true);
        window.setTimeout(() => setJustAdded(false), 1600);
        showSuccess(
          kind === 'shopping' ? 'On your shopping list' : 'On your proxy list',
          already > 0
            ? `${resolved.cardName}, now ${already + quantity} copies.`
            : resolved.cardName
        );
      } catch (error: any) {
        /* Never hand a database message to a player. Whatever went wrong, the
           useful sentence is the same one, and the detail goes to the console
           where somebody who can act on it will see it. */
        console.error('add to list failed', error);
        showError('Could not add that', 'Please try again in a moment.');
      } finally {
        setSaving(false);
      }
    },
    [add, already, deckId, kind, quantity, resolved, saving, source, user]
  );

  if (!resolved) return null;

  const meta = LABEL[kind];
  const Icon = justAdded ? Check : meta.icon;
  const iconOnly = display === 'icon';

  const button = (
    <Button
      type="button"
      size={iconOnly ? 'icon' : size}
      variant={already > 0 ? 'default' : variant}
      onClick={onClick}
      disabled={saving}
      aria-label={already > 0 ? `${meta.on}. Add another copy.` : `Add ${resolved.cardName} to your ${kind === 'shopping' ? 'shopping' : 'proxy'} list`}
      className={cn(
        'gap-1.5',
        iconOnly && 'h-8 w-8 shrink-0 p-0',
        display === 'full' && 'w-full',
        className
      )}
    >
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
      )}
      {!iconOnly && <span className="truncate">{meta.add}</span>}
      {already > 0 && (
        <span className="tabular-nums text-xs opacity-80">{already}</span>
      )}
    </Button>
  );

  if (!iconOnly) return button;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top">
        {already > 0 ? `${meta.on}: ${already}. Click to add another.` : meta.add}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Both lists at once, for a card page where there is room for the full choice.
 *
 * Kept beside the single button rather than duplicating its logic, so the two
 * can never disagree about what "already on the list" means.
 */
export function AddToListActions({
  card,
  deckId,
  source,
  className,
  /** Match whatever row this sits in. The card page's action stack is `default`. */
  size = 'sm',
}: {
  card: AddableCard;
  deckId?: string | null;
  source?: ItemSource;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      <AddToListButton
        card={card}
        kind="shopping"
        deckId={deckId}
        source={source}
        size={size}
        display="full"
      />
      <AddToListButton
        card={card}
        kind="proxy"
        deckId={deckId}
        source={source}
        size={size}
        display="full"
      />
    </div>
  );
}
