import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { HistoryNav } from '@/components/navigation/HistoryNav';
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

export default function CollectionInsurance() {
  const { snapshot, load } = useCollectionStore();

  useEffect(() => {
    if (!snapshot) load();
    // Loaded once; the collection page owns later refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);

  const { totalCards, totalValue, topCards } = useMemo(() => {
    let cards = 0;
    let value = 0;
    for (const item of items) {
      cards += (item.quantity || 0) + (item.foil || 0);
      value += valueOfItem(item);
    }

    const top = [...items]
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

    return { totalCards: cards, totalValue: value, topCards: top };
  }, [items]);

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 pb-24 pt-2 md:px-6 md:pt-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-3 flex items-center gap-2">
          <HistoryNav />
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
          showOpenLink={false}
        />
      </div>
    </div>
  );
}
