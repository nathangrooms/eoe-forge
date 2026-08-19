import { Link } from 'react-router-dom';
import { PackageCheck } from 'lucide-react';
import { CardImage, cardDetailPath } from '@/components/cards';
import { formatAmount } from '@/lib/pricing';
import { paidTotals, waitingFor, type CardListItem } from '@/lib/shopping';

/**
 * What you have already bought and put away.
 *
 * The row survives filing rather than being deleted, because it is the only
 * record of what a card cost. That is a different fact from what it is worth
 * today, and it is the half the collection has never been able to answer.
 *
 * The totals are per currency and never added together. Dollars and euros are
 * not the same money, this project holds no exchange rate, and a combined
 * figure would be a number nobody spent.
 */

export function PastPurchases({ items }: { items: CardListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-card px-6 py-16 text-center shadow-lg shadow-black/20">
        <PackageCheck className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-medium text-foreground">Nothing filed away yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Once a card arrives and you put it into your collection it stays here, with what you paid
          for it.
        </p>
      </div>
    );
  }

  const { totals, copiesWithNoPrice } = paidTotals(items);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {totals.map(total => (
          <div key={total.currency} className="min-w-0 rounded-xl bg-muted/30 px-4 py-3">
            <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
              Spent in {total.currency === 'USD' ? 'dollars' : 'euros'}
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
              {formatAmount(total.amount, total.currency)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {total.copies} {total.copies === 1 ? 'card' : 'cards'}
            </p>
          </div>
        ))}
        {copiesWithNoPrice > 0 && (
          <div className="min-w-0 rounded-xl bg-muted/30 px-4 py-3">
            <p className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">No price kept</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
              {copiesWithNoPrice}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {copiesWithNoPrice === 1 ? 'card is' : 'cards are'} missing from the totals
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {items.map(item => {
          const href =
            cardDetailPath({ id: item.arrived_card_id ?? item.card_id, name: item.card_name }) ?? '#';
          const paid =
            item.paid_unit != null && item.paid_currency
              ? formatAmount(item.paid_unit * item.quantity, item.paid_currency)
              : null;
          return (
            <div key={item.id} className="flex items-center gap-3 rounded-xl bg-muted/20 p-2.5">
              <Link
                to={href}
                className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open ${item.card_name}`}
              >
                <CardImage card={item.card ?? { name: item.card_name }} width={56} hideFlip interactive />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={href} className="block truncate font-medium text-foreground hover:underline">
                  {item.quantity} {item.card_name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {[waitingFor(item.bought_at), paid ? `Paid ${paid}` : 'No price recorded']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
