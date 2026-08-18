import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, Layers, Package, Star, Target, TrendingUp } from 'lucide-react';
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
    icon: typeof Layers;
  }> = [
    { label: 'Total decks', value: totalDecks.toLocaleString(), icon: Layers },
    {
      label: 'Avg power',
      value: avgPowerLevel === null ? '—' : avgPowerLevel.toFixed(1),
      suffix: avgPowerLevel === null ? undefined : '/10',
      subtext:
        avgPowerLevel === null
          ? 'No scored Commander decks'
          : `${powerDecks.length} scored Commander deck${powerDecks.length === 1 ? '' : 's'}`,
      icon: Target,
    },
    {
      label: 'Total value',
      value: `$${Math.round(totalValue).toLocaleString()}`,
      icon: DollarSign,
    },
    { label: 'Favorites', value: favoriteCount.toLocaleString(), icon: Star },
    { label: 'Total cards', value: totalCards.toLocaleString(), icon: Package },
    {
      label: 'Complete',
      value: builtDecks.length > 0 ? `${completionRate}%` : '—',
      subtext:
        builtDecks.length > 0
          ? `${completeDecks} of ${builtDecks.length} built deck${builtDecks.length === 1 ? '' : 's'}`
          : 'No deck has cards yet',
      icon: TrendingUp,
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6', className)}>
      {stats.map(stat => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-muted p-2">
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-bold tabular-nums">{stat.value}</span>
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
