import { useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { CollectionExport } from '@/components/collection/CollectionExport';
import { CollectionBackupRestore } from '@/components/collection/CollectionBackupRestore';
import { CollectionDeckRecommendations } from '@/components/collection/CollectionDeckRecommendations';
import { EnhancedPriceAlerts } from '@/components/collection/EnhancedPriceAlerts';
import { InsuranceReport } from '@/components/collection/InsuranceReport';
import { TCGPlayerPriceSync } from '@/components/collection/TCGPlayerPriceSync';
import { formatPrice } from '@/components/collection/browser/types';
import type { CollectionCard } from '@/types/collection';
import { SpreadPanel } from './SpreadPanel.tsx';
import { RecentRail, ValueRail } from './ValueRail.tsx';
import { ValueOverTime } from './ValueOverTime.tsx';
import {
  collectionSummary,
  colourSpread,
  manaValueSpread,
  mostValuable,
  raritySpread,
  recentlyAdded,
  setSpread,
} from './spread.ts';

/**
 * The Analytics tab.
 *
 * Owner: *"Collection analytics page is an absolute mess, no visuals, no
 * graphs, its just awful. Most valuable cards should show a scroller of them for
 * example. Value history stretches so far. Lots of other issues too, UI is
 * unreadable so messy."*
 *
 * ## What was actually wrong
 *
 * Four components each derived their own figures from the same rows and each
 * drew their own version of them. Counted on the old page:
 *
 * - **Total value appeared four times**, from four separate reduces, one of
 *   which used `parseFloat(x || '0')` and so printed `$0.00` for a card that has
 *   only a foil price.
 * - **Most valuable cards appeared twice**, as two lists of names and numbers,
 *   ranked differently, on a page about a collection of illustrated cards that
 *   showed none of them.
 * - **Total cards appeared three times**, average value twice.
 * - The only things resembling charts were `Progress` bars, which encode one
 *   number each and cannot be compared across categories.
 *
 * ## What replaced it
 *
 * One valuation, in `spread.ts`, tested. One headline. Cards drawn as cards, in
 * the product's own rail. Real charts where there is something worth drawing,
 * each behind `React.lazy` so recharts stays out of the Collection route graph,
 * and each in a box reserved before its data exists so nothing moves as the page
 * fills in.
 *
 * ## Why the tools are still here
 *
 * Price sync, export, backup, alerts and the insurance document are not
 * analytics and they are not charts, but people use them and moving them off the
 * tab is a product decision, not a tidy-up. They sit at the bottom under their
 * own heading, so the visuals come first and the utilities are still one scroll
 * away.
 *
 * ## Database discipline
 *
 * Everything above the tools reads the rows the collection store already loaded
 * in one query. This component issues no queries at all, and the derivation runs
 * once per collection change rather than once per card. `ValueOverTime` makes a
 * single request for the whole snapshot range.
 */

export interface CollectionAnalyticsViewProps {
  cards: CollectionCard[];
  loading?: boolean;
}

export function CollectionAnalyticsView({ cards, loading = false }: CollectionAnalyticsViewProps) {
  const { user } = useAuth();

  /* One pass over the collection for every figure on the page. It used to be
     four passes in four components, which is how they came to disagree. */
  const derived = useMemo(() => {
    const summary = collectionSummary(cards);
    return {
      summary,
      colour: colourSpread(cards),
      manaValue: manaValueSpread(cards),
      rarity: raritySpread(cards),
      sets: setSpread(cards, 8),
      valuable: mostValuable(cards, 20),
      recent: recentlyAdded(cards, 20),
    };
  }, [cards]);

  const { summary } = derived;

  return (
    <div className="space-y-8">
      <Headline summary={summary} loading={loading} />

      <section aria-labelledby="dm-valuable-heading" className="min-w-0">
        <div className="mb-3 flex items-baseline gap-2.5">
          <h2 id="dm-valuable-heading" className="text-base font-semibold text-foreground">
            Most valuable cards
          </h2>
          {!loading && derived.valuable.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatPrice(derived.valuable.reduce((sum, c) => sum + c.value, 0))} across these{' '}
              {derived.valuable.length}
            </span>
          )}
        </div>
        <ValueRail
          cards={derived.valuable}
          hasUnpriced={summary.unpriced > 0}
          loading={loading}
        />
      </section>

      {/* The time series gets the wider cell because a line needs run, and the
          colour spread gets the narrower one because six bars do not. */}
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-12">
        <ValueOverTime
          currentValue={summary.value}
          loading={loading}
          className="xl:col-span-7"
        />
        <SpreadPanel
          className="xl:col-span-5"
          title="Colour spread"
          caption="Copies you own of each colour. A card in two colours counts in both, so the bars add up to more than your card count."
          kind="colour"
          rowLabel="Colour"
          slices={derived.colour.slices}
          tableNote={colourNote(derived.colour)}
          emptyNote="Add some cards and the colours you own show up here."
        />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SpreadPanel
          title="Mana value"
          caption="Spells only. Lands are left out, since every land costs nothing to play."
          kind="manaValue"
          rowLabel="Mana value"
          slices={derived.manaValue.slices}
          tableNote={
            derived.manaValue.landCopies > 0
              ? `${derived.manaValue.landCopies.toLocaleString()} lands are not counted here.`
              : undefined
          }
          emptyNote="No spells with a mana value yet."
        />
        <SpreadPanel
          title="Rarity"
          caption="Copies you own of each rarity, least scarce first."
          kind="rarity"
          rowLabel="Rarity"
          slices={derived.rarity}
          emptyNote="No rarities to show yet."
        />
        <SpreadPanel
          title="Sets"
          caption="Your eight biggest sets. Everything else is grouped into the last bar."
          kind="set"
          rowLabel="Set"
          slices={derived.sets}
          tableNote={
            summary.sets > 8 ? `${summary.sets.toLocaleString()} sets in total.` : undefined
          }
          emptyNote="No sets to show yet."
        />
      </div>

      {derived.recent.length > 0 && (
        <section aria-labelledby="dm-recent-heading" className="min-w-0">
          <h2 id="dm-recent-heading" className="mb-3 text-base font-semibold text-foreground">
            Recently added
          </h2>
          <RecentRail rows={derived.recent} loading={loading} />
        </section>
      )}

      <CollectionDeckRecommendations collectionCards={cards} />

      <section aria-labelledby="dm-tools-heading" className="space-y-4">
        <div>
          <h2 id="dm-tools-heading" className="text-base font-semibold text-foreground">
            Tools
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Refresh prices, take a copy of your collection, watch for price moves, or print a
            list for your insurer.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <TCGPlayerPriceSync />
          {user && <CollectionExport userId={user.id} />}
          {user && <CollectionBackupRestore userId={user.id} />}
        </div>

        <EnhancedPriceAlerts />

        <InsuranceReport
          collectionValue={summary.value}
          cardCount={summary.copies}
          unpricedCards={summary.unpriced}
          topCards={derived.valuable.map(entry => ({
            name: entry.name,
            setCode: entry.setCode,
            quantity: entry.quantity,
            foil: entry.foil,
            value: entry.value,
          }))}
        />
      </section>
    </div>
  );
}

/**
 * One hero figure and the facts that qualify it, on one line.
 *
 * This replaces sixteen stat boxes: four in the old analytics header, three
 * inside the value chart, four in the value trends panel and five more in the
 * analytics grid, with total value stated in four of them. A number belongs
 * beside its subject, and the collection's worth is the subject of this tab.
 *
 * The figure uses the font's proportional digits, not `tabular-nums`: equal
 * width digits make a number look loose at display sizes. The row of small
 * figures under it is tabular, because those do sit in a line together.
 */
function Headline({
  summary,
  loading,
}: {
  summary: ReturnType<typeof collectionSummary>;
  loading: boolean;
}) {
  if (loading) {
    return (
      /* Three lines, matching the three the real header has, at the line box of
         each: `h-5` for the label, `h-15` for the hero, `h-5` for the figures.
         A fourth conditional line used to appear when the collection resolved
         with unpriced rows in it, which moved everything below the header down
         by 24px. That fact is one of the figures now, so the header is always
         exactly three lines and this skeleton is always exactly its size. */
      <header className="space-y-1" aria-hidden="true">
        <div className="h-5 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        {/* 60px is `text-5xl leading-tight`, the hero's exact line box. */}
        <div className="h-[60px] w-64 max-w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-5 w-[28rem] max-w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </header>
    );
  }

  const facts: string[] = [
    `${summary.copies.toLocaleString()} cards`,
    `${summary.unique.toLocaleString()} different printings`,
    `${summary.sets.toLocaleString()} sets`,
  ];
  if (summary.foilCopies > 0) facts.push(`${summary.foilCopies.toLocaleString()} foil`);
  if (summary.avgManaValue > 0) facts.push(`${summary.avgManaValue} average mana value`);
  /* Sits with the figures rather than on a line of its own, because it
     qualifies the figure above it and because a line that only sometimes
     exists is a line that sometimes moves the page. */
  if (summary.unpriced > 0) {
    facts.push(
      summary.unpriced === 1 ? '1 with no price yet' : `${summary.unpriced.toLocaleString()} with no price yet`
    );
  }

  return (
    <header className="space-y-1">
      <p className="text-sm text-muted-foreground">What your collection is worth</p>
      <p className="text-5xl font-semibold leading-tight text-foreground">
        {formatPrice(summary.value)}
      </p>
      <p className="text-sm text-muted-foreground">
        {facts.map((fact, i) => (
          <span key={fact}>
            {i > 0 && <span aria-hidden="true"> · </span>}
            <span className="tabular-nums">{fact}</span>
          </span>
        ))}
      </p>
    </header>
  );
}

/**
 * The exact over-count, for the numbers view.
 *
 * The caption states the RULE and never changes; this states the FIGURE and
 * changes with the collection. Keeping them apart is what stops the caption
 * growing a line when the data lands and dropping the chart under it.
 */
function colourNote({
  multicolourCopies,
  totalCopies,
}: {
  multicolourCopies: number;
  totalCopies: number;
}): string | undefined {
  if (totalCopies === 0 || multicolourCopies === 0) return undefined;
  return `${multicolourCopies.toLocaleString()} of your ${totalCopies.toLocaleString()} cards are in two or more colours, so they appear in more than one row.`;
}

export default CollectionAnalyticsView;
