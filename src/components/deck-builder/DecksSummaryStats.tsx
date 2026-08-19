import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DeckSummary } from '@/lib/api/deckAPI';
import { usesPowerLevel } from '@/lib/deck/formats';

interface DecksSummaryStatsProps {
  decks: DeckSummary[];
  className?: string;
}

export function DecksSummaryStats({ decks, className }: DecksSummaryStatsProps) {
  const totalDecks = decks.length;
  const favoriteCount = decks.filter(d => d.favorite).length;

  /*
   * Power level is a Commander concept, and a stale score is not a score.
   *
   * The dashboard's own average reads the same population through
   * `useCachedDeckStats`, so the two headers can no longer disagree about the
   * same collection.
   */
  const powerDecks = decks.filter(
    d => usesPowerLevel(d.format) && d.power && !d.power.stale
  );
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

  const stats: Array<{
    label: string;
    value: string;
    suffix?: string;
    subtext?: string;
  }> = [
    { label: 'Total decks', value: totalDecks.toLocaleString() },
    {
      label: 'Avg power',
      value: avgPowerLevel === null ? '—' : avgPowerLevel.toFixed(1),
      suffix: avgPowerLevel === null ? undefined : '/10',
      subtext:
        avgPowerLevel === null
          ? 'No scored Commander decks'
          : `${powerDecks.length} scored Commander deck${powerDecks.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Total value',
      value: `$${Math.round(totalValue).toLocaleString()}`,
    },
    { label: 'Favorites', value: favoriteCount.toLocaleString() },
    { label: 'Total cards', value: totalCards.toLocaleString() },
    {
      label: 'Complete',
      value: builtDecks.length > 0 ? `${completionRate}%` : '—',
      subtext:
        builtDecks.length > 0
          ? `${completeDecks} of ${builtDecks.length} built deck${builtDecks.length === 1 ? '' : 's'}`
          : 'No deck has cards yet',
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6', className)}>
      {stats.map(stat => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            {/* NO ICONS. A boxed pictogram beside every number says nothing the
                label does not, and six of them in a row is the house style of
                every generated dashboard. Owner: "Deck manage metrics dont need
                icons - makes it look like ai slop". The number is the thing;
                give it the space instead. */}
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-2xl font-semibold tabular-nums">{stat.value}</span>
                  {stat.suffix && (
                    <span className="text-xs text-muted-foreground">{stat.suffix}</span>
                  )}
                </div>
                {stat.subtext && (
                  <p className="truncate text-[10px] text-muted-foreground">{stat.subtext}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
