import { Link } from 'react-router-dom';
import { Layers, Heart, Minus, Plus, ShoppingCart, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardImage, cardDetailPath } from '@/components/cards';
import { PriceTag } from '@/components/pricing';
import { cn } from '@/lib/utils';
import { useCardLists, type ReasonKind, type ShoppingEntry } from '@/lib/shopping';
import { ListCardBadges } from './ListCardBadges';

/**
 * One card on the shopping list.
 *
 * The art is the largest thing on the tile because a shopping list is a list of
 * Magic cards, not a spreadsheet, and clicking it goes to the card page like
 * everywhere else in this product.
 *
 * WHY THE REASONS ARE ON THE TILE
 * -------------------------------
 * "Needed by 3 decks" is a different buying decision from "you clicked add on a
 * card page once". Merging four sources into one list and then hiding which
 * ones asked for the card makes the player open three other screens to work out
 * whether to buy it. So the reasons are printed, in words.
 *
 * PRICES, PLURAL
 * --------------
 * TCGplayer and Cardmarket both, because the player might be in either place
 * and the same card is not the same price in both. Neither is converted into
 * the other and neither is called cheaper: there is no exchange rate in this
 * project and inventing one would put a made up number beside two real ones. A
 * card we cannot price says so rather than showing 0.
 */

const REASON_ICON: Record<ReasonKind, typeof Layers> = {
  deck: Layers,
  wishlist: Heart,
  manual: ShoppingCart,
  suggestion: Sparkles,
  marketplace: ShoppingCart,
};

export interface ShoppingEntryTileProps {
  entry: ShoppingEntry;
  width: number;
  onBuy: (entry: ShoppingEntry) => void;
  /**
   * This tile's identity for the list-motion primitives in `@/lib/motion`. It is
   * what lets a tile that moved be slid from where it was to where it now is,
   * rather than simply appearing there.
   */
  motionKey?: string;
  /**
   * This card has just been bought or taken off the list and is on its way out.
   * It holds its place in the grid while it goes, so nothing else moves until it
   * is actually gone.
   */
  leaving?: boolean;
}

export function ShoppingEntryTile({
  entry,
  width,
  onBuy,
  motionKey,
  leaving = false,
}: ShoppingEntryTileProps) {
  const setQuantity = useCardLists(state => state.setQuantity);
  const remove = useCardLists(state => state.remove);

  const href = cardDetailPath({ id: entry.cardId, name: entry.cardName }) ?? '#';
  // Only a stored row can have its quantity edited. A card that is on the list
  // purely because a deck needs it has no number of its own to change: the deck
  // is the number, and editing it here would be a change that silently reverts.
  const editable = Boolean(entry.item);

  return (
    <div
      data-flip-key={motionKey}
      aria-hidden={leaving || undefined}
      className={cn('flex min-w-0 flex-col gap-2', leaving && 'motion-leaving')}
    >
      <Link
        to={href}
        aria-label={`Open ${entry.cardName}`}
        className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CardImage card={entry.card ?? { name: entry.cardName }} width={width} fill interactive>
          <ListCardBadges quantity={entry.quantity} finish={entry.finish} />
        </CardImage>
      </Link>

      <div className="min-w-0">
        <Link to={href} className="block truncate text-sm font-medium text-foreground hover:underline">
          {entry.cardName}
        </Link>

        <ul className="mt-1 space-y-0.5">
          {entry.reasons.map((reason, index) => {
            const Icon = REASON_ICON[reason.kind];
            return (
              <li
                key={`${reason.kind}-${reason.deckId ?? index}`}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{reason.label}</span>
                {reason.copies > 1 && <span className="tabular-nums">x{reason.copies}</span>}
              </li>
            );
          })}
          {entry.onTheWay > 0 && (
            <li className="text-xs text-muted-foreground">
              {entry.onTheWay} already on the way, so that many are off this list.
            </li>
          )}
        </ul>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          {/* `exact`: a shopping row must price the finish being bought and
              nothing else, or the tile and the totals above it disagree. */}
          <PriceTag card={entry.card} finish={entry.finish} currency="USD" copies={entry.quantity} size="sm" showMarket exact />
          <PriceTag card={entry.card} finish={entry.finish} currency="EUR" copies={entry.quantity} size="sm" showMarket exact />
        </div>
      </div>

      <div className="mt-auto flex items-center gap-1.5 pt-1">
        <Button size="sm" className="flex-1 gap-1.5" onClick={() => onBuy(entry)}>
          <ShoppingCart className="h-3.5 w-3.5" />
          Bought it
        </Button>

        {editable && (
          <>
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 shrink-0"
              aria-label={`One fewer ${entry.cardName}`}
              onClick={() => void setQuantity(entry.item!.id, entry.item!.quantity - 1)}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 shrink-0"
              aria-label={`One more ${entry.cardName}`}
              onClick={() => void setQuantity(entry.item!.id, entry.item!.quantity + 1)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn('h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground')}
              aria-label={`Take ${entry.cardName} off the list`}
              onClick={() => void remove(entry.item!.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The dense row, for the marketplace lead and anywhere a full tile is too much.
 * Same facts, same order, smaller.
 */
export function ShoppingEntryRow({
  entry,
  onBuy,
}: {
  entry: ShoppingEntry;
  onBuy?: (entry: ShoppingEntry) => void;
}) {
  const href = cardDetailPath({ id: entry.cardId, name: entry.cardName }) ?? '#';
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/20 p-2 transition-colors hover:bg-muted/40">
      <Link to={href} className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CardImage card={entry.card ?? { name: entry.cardName }} width={44} hideFlip interactive />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={href} className="block truncate text-sm font-medium text-foreground hover:underline">
          {entry.quantity} {entry.cardName}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {entry.reasons.map(reason => reason.label).join('. ')}
        </p>
      </div>
      <PriceTag card={entry.card} finish={entry.finish} currency="USD" copies={entry.quantity} size="sm" exact />
      {onBuy && (
        <Button size="sm" variant="secondary" className="shrink-0" onClick={() => onBuy(entry)}>
          Bought it
        </Button>
      )}
    </div>
  );
}
