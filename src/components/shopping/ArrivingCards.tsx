import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageCheck, Truck, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardImage, cardDetailPath } from '@/components/cards';
import { showError } from '@/components/ui/toast-helpers';
import { formatAmount } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import { FINISH_LABEL, useCardLists, waitingFor, type CardListItem } from '@/lib/shopping';
import { FileArrivalPanel } from './FileArrivalPanel';

/**
 * Cards you have paid for that are not in your collection yet.
 *
 * This is the part that makes the shopping list more than a wishlist. A card
 * bought three weeks ago and never received is a real fact about the world and
 * the product holds it, with the date, so the strip can say "bought 23 days
 * ago, still not here" instead of quietly forgetting.
 *
 * TWO GROUPS, NOT ONE
 * -------------------
 * On the way and in hand are different states and they need different buttons:
 * one is waiting for the post, the other is waiting for the player to put it
 * somewhere. Collapsing them would leave a card that has landed still saying it
 * is coming.
 */

export interface ArrivingCardsProps {
  arriving: CardListItem[];
  arrived: CardListItem[];
  /** `strip` is the compact form for the collection page. */
  variant?: 'full' | 'strip';
  className?: string;
}

export function ArrivingCards({ arriving, arrived, variant = 'full', className }: ArrivingCardsProps) {
  const markArrived = useCardLists(state => state.markArrived);
  const reset = useCardLists(state => state.reset);
  const [filing, setFiling] = useState<CardListItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (arriving.length === 0 && arrived.length === 0) return null;

  const width = variant === 'strip' ? 76 : 116;

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id);
    try {
      await action();
    } catch (error: any) {
      showError('Could not do that', error?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={cn('min-w-0 space-y-4', className)}>
      {arrived.length > 0 && (
        <div>
          <header className="mb-2 flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              In your hands, not filed yet
            </h2>
          </header>
          <div className="space-y-2">
            {arrived.map(item => (
              <Row key={item.id} item={item} width={width}>
                <Button size="sm" onClick={() => setFiling(item)}>
                  Put it away
                </Button>
              </Row>
            ))}
          </div>
        </div>
      )}

      {arriving.length > 0 && (
        <div>
          <header className="mb-2 flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              On the way
            </h2>
          </header>
          <div className="space-y-2">
            {arriving.map(item => (
              <Row key={item.id} item={item} width={width}>
                <Button
                  size="sm"
                  disabled={busy === item.id}
                  onClick={() => run(item.id, () => markArrived(item.id))}
                >
                  It arrived
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  aria-label={`Put ${item.card_name} back on the list to buy`}
                  disabled={busy === item.id}
                  onClick={() => run(item.id, () => reset(item.id))}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </Row>
            ))}
          </div>
        </div>
      )}

      <FileArrivalPanel item={filing} onOpenChange={open => !open && setFiling(null)} />
    </section>
  );
}

function Row({
  item,
  width,
  children,
}: {
  item: CardListItem;
  width: number;
  children: React.ReactNode;
}) {
  const href = cardDetailPath({ id: item.arrived_card_id ?? item.card_id, name: item.card_name }) ?? '#';
  const finish = item.arrived_finish ?? item.finish;
  const paid =
    item.paid_unit != null && item.paid_currency
      ? formatAmount(item.paid_unit * item.quantity, item.paid_currency)
      : null;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/25 p-2.5">
      <Link
        to={href}
        className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${item.card_name}`}
      >
        <CardImage card={item.card ?? { name: item.card_name }} width={width} hideFlip interactive />
      </Link>

      <div className="min-w-0 flex-1">
        <Link to={href} className="block truncate font-medium text-foreground hover:underline">
          {item.quantity} {item.card_name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {[
            finish !== 'nonfoil' ? FINISH_LABEL[finish] : null,
            waitingFor(item.bought_at),
            /* What was paid, never what it is worth. Blank when the player did
               not know, because unknown is not zero. */
            paid ? `Paid ${paid}` : 'No price recorded',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {item.arrived_card_id && (
          <p className="truncate text-xs text-muted-foreground">
            A different version turned up from the one ordered.
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  );
}
