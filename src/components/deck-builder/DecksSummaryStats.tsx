import { MetricRow, type Metric } from '@/components/listing';
import type { DeckSummary } from '@/lib/api/deckAPI';
import { usesPowerLevel } from '@/lib/deck/formats';

interface DecksSummaryStatsProps {
  decks: DeckSummary[];
  loading?: boolean;
  className?: string;
}

/**
 * My Decks' figures.
 *
 * This row is where the shared metric tile came from. The owner named it good
 * and named My Collection's bad, the audit measured the gap at 19,447 px²
 * against 2,534, and `MetricRow` is this treatment lifted out so every page
 * gets it. Several pages wear it now.
 *
 * So this file draws no tiles any more. It works out six figures and hands them
 * over, which is all a page should have to decide about its own numbers.
 *
 * Two things it used to say in a comment are enforced by the shared component
 * now, and both are worth repeating here because both were paid for:
 *
 * - **No icons.** Owner: *"Deck manage metrics dont need icons - makes it look
 *   like ai slop"*. `MetricRow` has no `icon` prop.
 * - **Six columns whatever the content.** A row that wrapped on its own figures
 *   moved everything below it when the data landed.
 *
 * What it gains: `raw` on every figure, so a number that moves animates the way
 * the collection's total does, and a loading state, so the row holds its 95px
 * from the first paint instead of appearing under the title when the decks
 * arrive and shoving the deck grid down.
 */
export function DecksSummaryStats({ decks, loading = false, className }: DecksSummaryStatsProps) {
  const totalDecks = decks.length;
  const favoriteCount = decks.filter(d => d.favorite).length;

  /*
   * Power level is a Commander concept, and a stale score is not a score.
   *
   * The dashboard's own average reads the same population through
   * `useCachedDeckStats`, so the two headers can no longer disagree about the
   * same collection.
   */
  const powerDecks = decks.filter(d => usesPowerLevel(d.format) && d.power && !d.power.stale);
  const avgPowerLevel =
    powerDecks.length > 0
      ? powerDecks.reduce((sum, d) => sum + (d.power?.score ?? 0), 0) / powerDecks.length
      : null;

  const totalValue = decks.reduce((sum, d) => sum + (d.economy?.priceUSD || 0), 0);
  const totalCards = decks.reduce((sum, d) => sum + (d.counts?.total || 0), 0);

  /*
   * "Complete" means you own every card in the deck. An empty deck does not
   * satisfy that — it just has nothing to be missing.
   *
   * Filtering on `missing === 0` alone reported this library as 22% complete
   * (2 of 9) when both of those decks held zero cards and not one real deck was
   * finished. Complete now requires a decklist, and the denominator is the
   * decks that have one, so empty shells neither inflate the numerator nor
   * quietly pad the bottom of the ratio.
   */
  const builtDecks = decks.filter(d => (d.counts?.total || 0) > 0);
  const completeDecks = builtDecks.filter(d => (d.economy?.missing || 0) === 0).length;
  const completionRate =
    builtDecks.length > 0 ? Math.round((completeDecks / builtDecks.length) * 100) : 0;

  const metrics: Metric[] = [
    { id: 'decks', label: 'Total decks', value: totalDecks.toLocaleString(), raw: totalDecks },
    {
      id: 'power',
      label: 'Avg power',
      value: avgPowerLevel === null ? '—' : avgPowerLevel.toFixed(1),
      raw: avgPowerLevel ?? undefined,
      suffix: avgPowerLevel === null ? undefined : '/10',
      subtext:
        avgPowerLevel === null
          ? 'No scored Commander decks'
          : `${powerDecks.length} scored Commander deck${powerDecks.length === 1 ? '' : 's'}`,
    },
    {
      id: 'value',
      label: 'Total value',
      /* A dash, never $0. The smallest real price in the database is 0.01, so a
         rendered zero is always invented, and a library of empty decks is not
         worth nothing, it is worth nothing yet. */
      value: totalValue > 0 ? `$${Math.round(totalValue).toLocaleString()}` : '—',
      raw: totalValue,
    },
    {
      id: 'favorites',
      label: 'Favorites',
      value: favoriteCount.toLocaleString(),
      raw: favoriteCount,
    },
    { id: 'cards', label: 'Total cards', value: totalCards.toLocaleString(), raw: totalCards },
    {
      id: 'complete',
      label: 'Complete',
      value: builtDecks.length > 0 ? `${completionRate}%` : '—',
      raw: builtDecks.length > 0 ? completionRate : undefined,
      subtext:
        builtDecks.length > 0
          ? `${completeDecks} of ${builtDecks.length} built deck${builtDecks.length === 1 ? '' : 's'}`
          : 'No deck has cards yet',
    },
  ];

  return <MetricRow metrics={metrics} columns={6} loading={loading} className={className} />;
}
