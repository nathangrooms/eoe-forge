import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { InsuranceReport } from '@/components/collection/InsuranceReport';
import { useCollectionStore } from '@/features/collection/store';
import { priceUSD } from '@/features/collection/value';
import type { CollectionCard } from '@/types/collection';

/**
 * `/collection/insurance`.
 *
 * A document the user prints, screenshots or sends on — it needs a URL, not a
 * modal. Same valuation rule as the collection header: non-foil copies at
 * `usd`, foil copies at `usd_foil` falling back to `usd`.
 */
function valueOfItem(item: CollectionCard): number {
  if (!item.card) return 0;
  const nonFoil = priceUSD(item.card, false);
  const foil = priceUSD(item.card, true) || nonFoil;
  return (item.quantity || 0) * nonFoil + (item.foil || 0) * foil;
}

/**
 * Whether the copies the user actually owns can be priced.
 *
 * Not "does this printing have any price": `Nissa, Genesis Mage` has a foil
 * price of $1.42 and no non-foil price, and the owner holds two non-foils, so
 * the printing is priced and the stack is not. Asking the wider question let
 * her into "Most Valuable Cards" ranked at $0.00 each. Non-foil copies need
 * `usd`; foil copies take `usd_foil` and fall back to `usd`.
 */
function hasPrice(item: CollectionCard): boolean {
  const prices = item.card?.prices as Record<string, string | null> | undefined;
  if (!prices) return false;
  const read = (key: string) => {
    const raw = prices[key];
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const usd = read('usd');
  const foilUsd = read('usd_foil') ?? read('usd_etched') ?? usd;
  if ((item.quantity || 0) > 0 && usd !== null) return true;
  if ((item.foil || 0) > 0 && foilUsd !== null) return true;
  return false;
}

export default function CollectionInsurance() {
  const { snapshot, load } = useCollectionStore();

  useEffect(() => {
    if (!snapshot) load();
    // Loaded once; the collection page owns later refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);

  const { totalCards, totalValue, topCards, unpricedCards } = useMemo(() => {
    let cards = 0;
    let value = 0;
    let unpriced = 0;
    for (const item of items) {
      const copies = (item.quantity || 0) + (item.foil || 0);
      cards += copies;
      value += valueOfItem(item);
      if (copies > 0 && !hasPrice(item)) unpriced += 1;
    }

    const top = [...items]
      .filter(hasPrice)
      .map(item => ({ item, value: valueOfItem(item) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 25)
      .map(({ item, value: itemValue }) => ({
        name: item.card_name,
        setCode: item.set_code,
        quantity: item.quantity,
        foil: item.foil,
        condition: item.condition,
        value: itemValue,
      }));

    return { totalCards: cards, totalValue: value, topCards: top, unpricedCards: unpriced };
  }, [items]);

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 pb-24 pt-2 md:px-6 md:pt-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-3 flex items-center gap-2">
          <Link
            to="/collection?tab=analytics"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Collection
          </Link>
        </div>

        <header className="mb-4 flex items-center gap-3 md:mb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Insurance report
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Valuation of your collection as of today
            </p>
          </div>
        </header>

        <InsuranceReport
          collectionValue={totalValue}
          cardCount={totalCards}
          topCards={topCards}
          unpricedCards={unpricedCards}
          showOpenLink={false}
        />
      </div>
    </div>
  );
}
