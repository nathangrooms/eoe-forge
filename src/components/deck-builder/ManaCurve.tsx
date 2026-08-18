import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { categorizeCard, CATEGORY_CONFIG, type CardCategory } from './deck-categories';

/**
 * The mana curve for the primary build surface.
 *
 * Follows the conventions every serious MTG tool uses: lands are excluded,
 * copies are counted (not distinct cards), and the top bin is open-ended.
 * Bars are segmented by card type using the --type-* tokens so the shape of
 * the deck is readable at a glance.
 */

interface CurveCard {
  cmc?: number;
  quantity?: number;
  type_line?: string | null;
}

const BINS = ['0', '1', '2', '3', '4', '5', '6', '7+'] as const;

/** Types that can appear in the curve — lands are excluded by definition. */
const CURVE_TYPES: CardCategory[] = [
  'creatures',
  'planeswalkers',
  'instants',
  'sorceries',
  'artifacts',
  'enchantments',
  'battles',
  'other',
];

function binIndex(cmc: number): number {
  if (cmc >= 7) return 7;
  return Math.max(0, Math.min(6, Math.round(cmc)));
}

export interface ManaCurveProps {
  cards: CurveCard[];
  className?: string;
  /** Compact drops the legend and shrinks the plot for sidebar/header use. */
  compact?: boolean;
  height?: number;
}

export function ManaCurve({ cards, className, compact = false, height = 96 }: ManaCurveProps) {
  const { bins, max, total, avgCmc, typesPresent } = useMemo(() => {
    const bins = BINS.map(() => ({ total: 0, byType: {} as Partial<Record<CardCategory, number>> }));
    let total = 0;
    let cmcSum = 0;

    for (const card of cards) {
      const category = categorizeCard(card);
      if (category === 'lands' || category === 'commanders') continue;
      const qty = card.quantity ?? 1;
      if (qty <= 0) continue;
      const cmc = Number.isFinite(card.cmc) ? Number(card.cmc) : 0;
      const idx = binIndex(cmc);
      bins[idx].total += qty;
      bins[idx].byType[category] = (bins[idx].byType[category] ?? 0) + qty;
      total += qty;
      cmcSum += cmc * qty;
    }

    const typesPresent = CURVE_TYPES.filter(t => bins.some(b => (b.byType[t] ?? 0) > 0));

    return {
      bins,
      max: Math.max(...bins.map(b => b.total), 1),
      total,
      avgCmc: total > 0 ? cmcSum / total : 0,
      typesPresent,
    };
  }, [cards]);

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mana Curve</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {total > 0 ? <>avg {avgCmc.toFixed(2)} · {total} nonland</> : 'no nonland cards'}
        </span>
      </div>

      <div className="flex items-end gap-1.5" style={{ height }}>
        {bins.map((bin, i) => {
          const pct = (bin.total / max) * 100;
          const segments = CURVE_TYPES.filter(t => (bin.byType[t] ?? 0) > 0);
          return (
            <div key={BINS[i]} className="flex-1 flex flex-col justify-end min-w-0 h-full">
              <span
                className={cn(
                  'text-[10px] leading-none tabular-nums text-center mb-1',
                  bin.total > 0 ? 'text-foreground' : 'text-transparent'
                )}
              >
                {bin.total || 0}
              </span>
              <div
                className="w-full flex flex-col-reverse overflow-hidden rounded-sm bg-muted"
                style={{ height: `${Math.max(pct, bin.total > 0 ? 4 : 2)}%` }}
                title={
                  bin.total > 0
                    ? `${BINS[i]} MV — ${bin.total} card${bin.total === 1 ? '' : 's'}\n` +
                      segments
                        .map(t => `${CATEGORY_CONFIG[t].label}: ${bin.byType[t]}`)
                        .join('\n')
                    : `${BINS[i]} MV — none`
                }
              >
                {segments.map(t => (
                  <div
                    key={t}
                    className={CATEGORY_CONFIG[t].bg}
                    style={{ height: `${((bin.byType[t] ?? 0) / bin.total) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-1.5 mt-1">
        {BINS.map(b => (
          <span key={b} className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground">
            {b}
          </span>
        ))}
      </div>

      {!compact && typesPresent.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-3 border-t border-border">
          {typesPresent.map(t => (
            <span key={t} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-[2px]', CATEGORY_CONFIG[t].bg)} />
              {CATEGORY_CONFIG[t].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default ManaCurve;
