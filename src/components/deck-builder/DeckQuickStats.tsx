import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { CATEGORY_CONFIG, CATEGORY_ORDER, type CardCategory } from './deck-categories';

/**
 * The deck's own numbers, and only its own numbers.
 *
 * This strip used to carry an `edhpowerlevel.com` tile in slot two — a scraped
 * third-party figure, on a different scale, painted in `text-power-*`, the
 * colour language reserved for the canonical EDH score. It read as *the*
 * power number, sat above the real one, and the same deck therefore showed
 * 7.6 here and 5.1 forty pixels below. It also duplicated the labelled
 * second-opinion row the builder already renders. The scraped figure and its
 * sub-metrics now live in that row alone, clearly attributed.
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

function StatTile({
  label,
  children,
  action,
  className,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('p-3', className)}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {action}
      </div>
      {children}
    </Card>
  );
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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {/* Cards */}
        <StatTile label="Cards" action={<Badge variant="outline" className="text-[10px]">{format}</Badge>}>
          <div className="text-2xl font-semibold tabular-nums">
            {displayCards}
            <span className="text-sm font-normal text-muted-foreground"> / {targetCards}</span>
          </div>
          <Progress value={completionPct} className="mt-2 h-1" />
        </StatTile>

        {/* Value */}
        <StatTile label="Est. value">
          <div className="text-2xl font-semibold tabular-nums">${totalValue.toFixed(0)}</div>
          <div className="mt-1 text-xs text-muted-foreground">market, USD</div>
        </StatTile>

        {/* Average mana value */}
        <StatTile label="Avg mana value">
          <div className="text-2xl font-semibold tabular-nums">{avgCmc.toFixed(2)}</div>
          <div className="mt-1 text-xs text-muted-foreground">nonland cards</div>
        </StatTile>

        {/* Colour identity */}
        <StatTile label="Colour identity">
          <div className="flex h-8 items-center">
            <ColorIdentity colors={colors} size="lg" />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {colors.length === 0 ? 'Colourless' : `${colors.length}-colour`}
          </div>
        </StatTile>
      </div>

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
              No collection data — add cards to your collection to see what this deck still needs.
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
              return (
                <div key={c} className="flex items-center gap-2">
                  <Icon className={cn('h-4 w-4', CATEGORY_CONFIG[c].color)} />
                  <span className="text-sm font-semibold tabular-nums">{typeCounts[c]}</span>
                  <span className="text-xs text-muted-foreground">{CATEGORY_CONFIG[c].label}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
