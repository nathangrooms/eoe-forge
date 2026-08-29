import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { MetricRow, MetricTile, type Metric } from '@/components/listing';
import { formatLabel } from '@/lib/deck/formats';
import { CATEGORY_CONFIG, CATEGORY_ORDER, type CardCategory } from './deck-categories';

/**
 * A deck's own numbers, and only its own numbers.
 *
 * This strip used to carry an `edhpowerlevel.com` tile in slot two — a scraped
 * third-party figure, on a different scale, painted in `text-power-*`, the
 * colour language reserved for the canonical EDH score. It read as *the*
 * power number, sat above the real one, and the same deck therefore showed
 * 7.6 here and 5.1 forty pixels below. It also duplicated the labelled
 * second-opinion row the builder already renders. The scraped figure and its
 * sub-metrics now live in that row alone, clearly attributed.
 *
 * ## What the consistency pass changed
 *
 * The four tiles were a local `StatTile` at `Card p-3`, which is one of the six
 * metric rows the audit counted. They are `MetricRow` now, so a figure on the
 * deck page is the same size as a figure on My Decks and on My Collection: the
 * same 24px number on the same 16px-padded tile, rather than the same number at
 * 12px less padding because two files were written a month apart.
 *
 * Nothing was dropped. The card count keeps its progress bar, which is
 * `Metric.meter`; the format moved from a `Badge variant="outline"` beside the
 * label, which is a hairline, into the line under the figure where it reads as
 * what it is; and the colour identity is a `MetricTile`, because it is the
 * shape of a tile and not the shape of a number.
 */
export interface DeckQuickStatsProps {
  totalCards: number;
  /** Copies per card category, keyed by the shared CardCategory vocabulary. */
  typeCounts: Partial<Record<CardCategory, number>>;
  avgCmc: number;
  totalValue: number;
  format: string;
  commanderName?: string;
  colors: string[];
  /** Null when there is nothing to measure against — never fake a percentage. */
  ownedPct?: number | null;
  missingCards?: number | null;
  ownershipLoading?: boolean;
}

export function DeckQuickStats({
  totalCards,
  typeCounts,
  avgCmc,
  totalValue,
  format,
  commanderName,
  colors,
  ownedPct,
  missingCards,
  ownershipLoading,
}: DeckQuickStatsProps) {
  const isCommander = format === 'commander' || format === 'edh';
  const targetCards = isCommander ? 100 : 60;
  const displayCards = isCommander && commanderName ? totalCards + 1 : totalCards;
  const completionPct = Math.min((displayCards / targetCards) * 100, 100);

  const presentTypes = CATEGORY_ORDER.filter(c => c !== 'commanders' && (typeCounts[c] ?? 0) > 0);
  /* The denominator for the shares below: the buckets themselves, so they sum
     to 100. `totalCards` would not, on a deck holding a card the categoriser
     files nowhere. */
  const countedCards = presentTypes.reduce((sum, c) => sum + (typeCounts[c] ?? 0), 0);

  const metrics: Metric[] = [
    {
      id: 'cards',
      label: 'Cards',
      value: displayCards.toLocaleString(),
      raw: displayCards,
      suffix: `/ ${targetCards}`,
      meter: completionPct,
      subtext: formatLabel(format),
    },
    {
      id: 'value',
      label: 'Est. value',
      /* A dash, never $0. The smallest real price in the database is 0.01, so a
         rendered zero is always invented, and an empty deck is not worth
         nothing, it is worth nothing yet. */
      value: totalValue > 0 ? `$${totalValue.toFixed(0)}` : '—',
      raw: totalValue,
      subtext: 'market, USD',
    },
    {
      id: 'cmc',
      label: 'Avg mana value',
      value: totalCards > 0 ? avgCmc.toFixed(2) : '—',
      raw: avgCmc,
      subtext: 'nonland cards',
    },
  ];

  return (
    <div className="space-y-3">
      <MetricRow metrics={metrics} columns={4}>
        {/* Colour identity is a tile, not a figure. It goes in the slot rather
            than being hand-built beside the row, so it wears the same ground
            and the same label type as the three numbers next to it. */}
        <MetricTile label="Colour identity">
          <div className="flex h-8 items-center">
            <ColorIdentity colors={colors} size="lg" />
          </div>
          {/* Two reserved lines, matching the meter and the subtext on the
              figures beside it, so all four tiles are the same height. */}
          <div className="mt-1 h-1" aria-hidden="true" />
          <p className="truncate text-[10px] text-muted-foreground">
            {colors.length === 0 ? 'Colourless' : `${colors.length}-colour`}
          </p>
        </MetricTile>
      </MetricRow>

      {/* Collection ownership — only rendered when it is real */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            From your collection
          </span>
          {ownershipLoading ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> checking collection…
            </span>
          ) : ownedPct === null || ownedPct === undefined ? (
            <span className="text-xs text-muted-foreground">
              No collection data. Add cards to your collection to see what this deck still needs.
            </span>
          ) : (
            <div className="flex flex-1 items-center gap-3">
              <Progress value={ownedPct} className="h-1 flex-1" />
              <span className="text-sm font-semibold tabular-nums">{ownedPct.toFixed(0)}%</span>
              {!!missingCards && missingCards > 0 && (
                <span className="text-xs text-muted-foreground">{missingCards} missing</span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Type breakdown */}
      <Card className="p-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Type breakdown
        </div>
        {presentTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cards yet.</p>
        ) : (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {presentTypes.map(c => {
              const Icon = CATEGORY_CONFIG[c].icon;
              const count = typeCounts[c] ?? 0;
              return (
                <div key={c} className="flex items-center gap-2">
                  <Icon className={cn('h-4 w-4', CATEGORY_CONFIG[c].color)} />
                  <span className="text-sm font-semibold tabular-nums">{count}</span>
                  <span className="text-xs text-muted-foreground">{CATEGORY_CONFIG[c].label}</span>
                  {/* The share, carried across from `/deck/:id/analysis` before
                      that route became a redirect. It was the one thing on that
                      page that existed nowhere else: this row printed counts
                      and its bars printed `12 · 12%`. One breakdown now, and it
                      says both. The counts come from `cardCategories`, which
                      files each card in exactly one bucket — the SQL the old
                      page read used overlapping `LIKE` tests that could sum
                      past the size of the deck. */}
                  {countedCards > 0 && (
                    <span className="text-xs tabular-nums text-muted-foreground/80">
                      {((count / countedCards) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
