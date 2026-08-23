import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { categorizeCard, CATEGORY_CONFIG, type CardCategory } from './deck-categories';

/**
 * The mana curve.
 *
 * Follows the conventions every serious MTG tool uses: lands are excluded,
 * copies are counted by default, and the top bin is open-ended. Bars are
 * segmented by card type using the `--type-*` tokens so the shape of the deck
 * is readable at a glance.
 *
 * ## Three things arrived here when the Mana tab was rebuilt
 *
 * The census counted the controls on that tab: `ManaCurve` 0 buttons and 0
 * inputs, `ManaSourcesPanel` 0 and 0, `LandEnhancerUX` 0 and 0. Three read-only
 * blocks stacked on a page, which is why the tab reads as unfinished. Both
 * Moxfield and Archidekt let you switch a curve between counting copies and
 * counting distinct cards, and both let you narrow it to a colour.
 *
 * - **`basis`** switches between copies and distinct cards. They are different
 *   questions: copies is what you draw, distinct is what you built.
 * - **`colours`** narrows to cards of a colour, so a five-colour deck can ask
 *   what its blue curve looks like.
 * - **`onSelectBin`** makes a bar a control. The decklist already filters by
 *   mana value and its facet chips already carry counts; clicking the 4-drop
 *   bar and landing on the Cards tab filtered to mana value 4 is the cheapest
 *   thing on this page that turns a picture into a tool. Both halves existed
 *   and nothing joined them.
 *
 * A caller that passes none of the three gets what this drew before, minus the
 * hairline under the legend.
 */

interface CurveCard {
  cmc?: number;
  quantity?: number;
  type_line?: string | null;
  colors?: string[] | null;
}

const BINS = ['0', '1', '2', '3', '4', '5', '6', '7+'] as const;

/** The bin ids, which are also `DeckCardFilterState.manaValues`' vocabulary. */
export type CurveBin = (typeof BINS)[number];

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

/**
 * What one bar counts.
 *
 * `copies` is a playset of Lightning Bolt as four; `cards` is it as one. A deck
 * of sixteen one-drops made out of four four-ofs has a very different curve
 * depending which question was asked, and drawing one without saying which is
 * how two tools showing "the curve" of one deck end up disagreeing.
 */
export type CurveBasis = 'copies' | 'cards';

export interface ManaCurveProps {
  cards: CurveCard[];
  className?: string;
  /** Compact drops the legend and shrinks the plot for sidebar/header use. */
  compact?: boolean;
  height?: number;
  /** Copies (the default) or distinct cards. */
  basis?: CurveBasis;
  /** Narrow to cards of these colours. Empty means everything. */
  colours?: readonly string[];
  /** Makes each bar a button. The bin id is what the decklist filter takes. */
  onSelectBin?: (bin: CurveBin) => void;
  /** The bin currently narrowed to elsewhere, drawn as selected. */
  selectedBin?: CurveBin | null;
}

export function ManaCurve({
  cards,
  className,
  compact = false,
  height = 96,
  basis = 'copies',
  colours,
  onSelectBin,
  selectedBin,
}: ManaCurveProps) {
  const { bins, max, total, avgCmc, typesPresent } = useMemo(() => {
    const bins = BINS.map(() => ({ total: 0, byType: {} as Partial<Record<CardCategory, number>> }));
    let total = 0;
    let cmcSum = 0;

    const wanted = colours && colours.length > 0 ? new Set(colours) : null;

    for (const card of cards) {
      const category = categorizeCard(card);
      if (category === 'lands' || category === 'commanders') continue;
      if ((card.quantity ?? 1) <= 0) continue;

      /* A colourless card is kept out of a colour narrowing rather than shown
         inside every one of them. An artifact is not a blue card, and a
         five-colour deck filtered to blue that still draws all thirty of its
         rocks has not narrowed anything. */
      if (wanted) {
        const own = card.colors ?? [];
        if (!own.some(c => wanted.has(c))) continue;
      }

      /* One is one when the question is "how many different cards". Copies is
         the default because copies is what you draw. */
      const qty = basis === 'cards' ? 1 : (card.quantity ?? 1);

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
  }, [cards, basis, colours]);

  const noun = basis === 'cards' ? 'distinct nonland' : 'nonland';

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Mana curve
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {total > 0 ? (
            <>
              avg {avgCmc.toFixed(2)} · {total} {noun}
            </>
          ) : (
            'nothing to plot'
          )}
        </span>
      </div>

      <div className="flex items-end gap-1.5" style={{ height }}>
        {bins.map((bin, i) => {
          const pct = (bin.total / max) * 100;
          const segments = CURVE_TYPES.filter(t => (bin.byType[t] ?? 0) > 0);
          const selected = selectedBin === BINS[i];
          const title =
            bin.total > 0
              ? `${BINS[i]} mana value: ${bin.total} ${bin.total === 1 ? 'card' : 'cards'}\n` +
                segments.map(t => `${CATEGORY_CONFIG[t].label}: ${bin.byType[t]}`).join('\n') +
                (onSelectBin ? '\nShow these in the decklist' : '')
              : `${BINS[i]} mana value: none`;

          const plot = (
            <>
              <span
                className={cn(
                  'mb-1 text-center text-[10px] leading-none tabular-nums',
                  bin.total > 0 ? 'text-foreground' : 'text-transparent'
                )}
              >
                {bin.total || 0}
              </span>
              <div
                className={cn(
                  'flex w-full flex-col-reverse overflow-hidden rounded-sm bg-muted',
                  /* Opacity only, and only on the bar. A bar that grew on hover
                     would move the plot under the pointer, which is the layout
                     shift the animation rule exists to stop. */
                  onSelectBin &&
                    'transition-opacity group-hover:opacity-80 motion-reduce:transition-none',
                  selected && 'ring-2 ring-ring'
                )}
                style={{ height: `${Math.max(pct, bin.total > 0 ? 4 : 2)}%` }}
              >
                {segments.map(t => (
                  <div
                    key={t}
                    className={CATEGORY_CONFIG[t].bg}
                    style={{ height: `${((bin.byType[t] ?? 0) / bin.total) * 100}%` }}
                  />
                ))}
              </div>
            </>
          );

          /* A bar with nothing in it is not a control. Filtering the decklist
             to a mana value it holds no cards at would land a reader on an
             empty list they then have to undo. */
          return onSelectBin && bin.total > 0 ? (
            <button
              key={BINS[i]}
              type="button"
              onClick={() => onSelectBin(BINS[i])}
              title={title}
              aria-label={`Show the ${BINS[i]} mana value cards in the decklist`}
              className="group flex h-full min-w-0 flex-1 flex-col justify-end rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {plot}
            </button>
          ) : (
            <div
              key={BINS[i]}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              title={title}
            >
              {plot}
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex gap-1.5">
        {BINS.map(b => (
          <span
            key={b}
            className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground"
          >
            {b}
          </span>
        ))}
      </div>

      {!compact && typesPresent.length > 0 && (
        /* A tinted strip, not `border-t border-border`. A hairline is the one
           thing the design law names outright and this was the last one in the
           file. */
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2">
          {typesPresent.map(t => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
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
