import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { bandForScore, bandShortLabel, powerTextClass } from '@/lib/deck/power';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { CATEGORY_CONFIG, CATEGORY_ORDER, type CardCategory } from './deck-categories';

interface EdhMetrics {
  tippingPoint: number | null;
  efficiency: number | null;
  impact: number | null;
  score: number | null;
  playability: number | null;
}

export interface DeckQuickStatsProps {
  totalCards: number;
  /** Copies per card category, keyed by the shared CardCategory vocabulary. */
  typeCounts: Partial<Record<CardCategory, number>>;
  avgCmc: number;
  totalValue: number;
  edhPowerLevel?: number | null;
  edhMetrics?: EdhMetrics | null;
  edhPowerUrl?: string | null;
  loadingEdhPower?: boolean;
  edhNeedsRefresh?: boolean;
  onCheckEdhPower?: () => void;
  format: string;
  commanderName?: string;
  colors: string[];
  /** Null when there is nothing to measure against — never fake a percentage. */
  ownedPct?: number | null;
  missingCards?: number | null;
  ownershipLoading?: boolean;
}

/**
 * Bands come from the one threshold table. This file used to carry its own
 * cuts (3/6/8) while the scoring engine used 3.4/6.6/8.5, so a deck at 6.5 was
 * "High" in this tile and "mid" everywhere else.
 */
function powerBand(level: number | null | undefined) {
  if (level === null || level === undefined) return { color: 'text-muted-foreground', label: '' };
  const band = bandForScore(level);
  return { color: powerTextClass(band), label: bandShortLabel(band) };
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
  edhPowerLevel,
  edhMetrics,
  edhPowerUrl,
  loadingEdhPower,
  edhNeedsRefresh,
  onCheckEdhPower,
  format,
  commanderName,
  colors,
  ownedPct,
  missingCards,
  ownershipLoading,
}: DeckQuickStatsProps) {
  const band = powerBand(edhPowerLevel);

  const isCommander = format === 'commander' || format === 'edh';
  const targetCards = isCommander ? 100 : 60;
  const displayCards = isCommander && commanderName ? totalCards + 1 : totalCards;
  const completionPct = Math.min((displayCards / targetCards) * 100, 100);

  const presentTypes = CATEGORY_ORDER.filter(c => c !== 'commanders' && (typeCounts[c] ?? 0) > 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {/* Cards */}
        <StatTile label="Cards" action={<Badge variant="outline" className="text-[10px]">{format}</Badge>}>
          <div className="text-2xl font-semibold tabular-nums">
            {displayCards}
            <span className="text-sm font-normal text-muted-foreground"> / {targetCards}</span>
          </div>
          <Progress value={completionPct} className="mt-2 h-1" />
        </StatTile>

        {/* edhpowerlevel.com — a labelled second opinion. The deck's own EDH
            power score is rendered by `PowerScore` above this strip; the two
            are never presented as the same field. */}
        <StatTile
          label="edhpowerlevel.com"
          action={
            isCommander && onCheckEdhPower ? (
              <Button
                variant="ghost"
                size="icon"
                className="-mr-1 -mt-1 h-6 w-6"
                onClick={onCheckEdhPower}
                disabled={loadingEdhPower}
                title={edhNeedsRefresh ? 'Cards changed — recalculate' : 'Recalculate'}
              >
                {loadingEdhPower ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
            ) : undefined
          }
        >
          <div className={cn('text-2xl font-semibold tabular-nums', band.color)}>
            {edhPowerLevel !== null && edhPowerLevel !== undefined
              ? edhPowerLevel.toFixed(1)
              : '—'}
            {edhPowerLevel !== null && edhPowerLevel !== undefined && (
              <span className="text-sm font-normal text-muted-foreground">/10</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            {band.label || 'Not checked'}
            {edhNeedsRefresh && edhPowerLevel !== null && edhPowerLevel !== undefined && (
              <span className="text-destructive">outdated</span>
            )}
            {edhPowerUrl && (
              <a
                href={edhPowerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline"
                title="Open on edhpowerlevel.com"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
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

      {/* EDH sub-metrics, only when edhpowerlevel.com actually returned them */}
      {isCommander && edhMetrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(
            [
              ['Tipping point', edhMetrics.tippingPoint, (v: number) => String(v)],
              ['Efficiency', edhMetrics.efficiency, (v: number) => `${v.toFixed(1)}/10`],
              ['Impact', edhMetrics.impact, (v: number) => v.toFixed(0)],
              ['Score', edhMetrics.score, (v: number) => `${v}/1000`],
              ['Playability', edhMetrics.playability, (v: number) => `${v}%`],
            ] as Array<[string, number | null, (v: number) => string]>
          ).map(([label, value, fmt]) => (
            <Card key={label} className="p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {value !== null && value !== undefined ? fmt(value) : '—'}
              </div>
            </Card>
          ))}
        </div>
      )}

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
