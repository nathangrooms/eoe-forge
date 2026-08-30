import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { InsuranceReport } from '@/components/collection/InsuranceReport';
import { ValueRail } from '@/components/collection/analytics/ValueRail';
import { mostValuable, type OwnedRow } from '@/components/collection/analytics/spread';
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

/**
 * Which set a printing is from. `cards` is the authority; the copy stored on
 * the collection row is a fallback, and 'UNK' is not a set code, it is a
 * placeholder meaning nobody knew.
 */
function setCodeOf(item: CollectionCard): string | undefined {
  const joined = item.card?.set_code;
  if (joined) return String(joined);
  const stored = (item.set_code || '').trim();
  if (!stored || stored.toLowerCase() === 'unk' || stored.toLowerCase() === 'unknown') {
    return undefined;
  }
  return stored;
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
        /*
         * FROM THE JOINED CARD ROW, not from the stored copy.
         *
         * This passed `item.set_code`, and `user_collections` stores the string
         * 'UNK' for a row whose set was unknown when it was written. So 10 of
         * this account's 53 rows printed UNK on the one document whose entire
         * job is proving which printing you owned. The Analytics tab renders
         * the same component with the resolved value, which meant the preview
         * you check was right and the file you send an insurer was wrong.
         */
        setCode: setCodeOf(item),
        collectorNumber: item.card?.collector_number ?? undefined,
        quantity: item.quantity,
        foil: item.foil,
        condition: item.condition,
        value: itemValue,
      }));

    return { totalCards: cards, totalValue: value, topCards: top, unpricedCards: unpriced };
  }, [items]);

  /* The SAME ranking the analytics tab draws, from the shared module, so the
     rail and the itemised list under it can never disagree about which card is
     first. */
  const valuable = useMemo(() => mostValuable(items as unknown as OwnedRow[], 25), [items]);

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 pb-24 pt-2 md:px-6 md:pt-4">
      {/* Full width, not a centred ribbon.

          This was `mx-auto w-full max-w-3xl`: a 768px column in a 1592px
          window, measured, with roughly 285px of empty background down each
          side. Settings was taken off exactly that wrapper for exactly that
          reason and the note above its COLUMNS constant records the numbers.
          The heading paragraph keeps a readable measure of its own; nothing
          else on the page wants to be narrow. */}
      <div className="w-full">
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
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Valuation of your collection as of today
            </p>
          </div>
        </header>

        {/*
         * THE CARDS THE DOCUMENT IS ABOUT, AS CARDS.
         *
         * This page had ZERO card images on it, measured. It is a valuation of
         * particular printings — the line items carry a set code and a collector
         * number precisely because a printing is what is being insured — and it
         * showed twenty-five of them as a column of names in a 320px box.
         *
         * `ValueRail` is the rail the analytics tab already uses for the same
         * ranking, so this is the same cards in the same order at the same size,
         * not a second implementation that could disagree with it. `mostValuable`
         * is likewise the shared ranking rather than the private sort below,
         * which is why both show the same twenty-five.
         */}
        {valuable.length > 0 && (
          <section aria-labelledby="dm-insurance-valuable" className="mb-6 min-w-0">
            <div className="mb-3 flex items-baseline gap-2.5">
              <h2 id="dm-insurance-valuable" className="text-base font-semibold text-foreground">
                What is worth the most
              </h2>
              <span className="text-xs text-muted-foreground">
                The printings you own, in the order they are valued below
              </span>
            </div>
            <ValueRail cards={valuable} hasUnpriced={unpricedCards > 0} />
          </section>
        )}

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
