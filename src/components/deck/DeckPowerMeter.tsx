import { cn } from '@/lib/utils';

/**
 * Power level and Commander bracket.
 *
 * The owner calls this the single most important readout on a deck tile, so it
 * gets a real block rather than a badge squeezed in beside the format chip.
 *
 * Two numbers are shown because players use both:
 *
 * - **Power level** (0–10) is the continuous score `compute_deck_summary`
 *   returns — it reads `edh_analysis.metrics.powerLevel` when the deck has been
 *   analysed and falls back to the deck's own `power_level` column.
 * - **Bracket** (1–5) is Wizards' social-contract scale. The summary RPC does
 *   not return one, so it is *derived* from the score here. When a deck has a
 *   scraped bracket from the analysis panel, pass it in as `bracket` and the
 *   derivation is skipped — a real bracket always beats an inferred one.
 *
 * Power is one of the three things the palette allows colour for, so this is
 * the only coloured element on the tile besides the mana pips.
 */

export type PowerBand = 'casual' | 'mid' | 'high' | 'cEDH';

export interface DeckBracket {
  id: 1 | 2 | 3 | 4 | 5;
  name: string;
  blurb: string;
}

/** Wizards' Commander Brackets, worded to match the EDH analysis panel. */
export const DECK_BRACKETS: Record<1 | 2 | 3 | 4 | 5, DeckBracket> = {
  1: {
    id: 1,
    name: 'Exhibition',
    blurb: 'No extra turns, no mass land denial, no two-card combos, no game changers',
  },
  2: {
    id: 2,
    name: 'Core',
    blurb: 'No chained extra turns, no mass land denial, no two-card combos',
  },
  3: {
    id: 3,
    name: 'Upgraded',
    blurb: 'Late-game combos only, at most three game changers',
  },
  4: { id: 4, name: 'Optimized', blurb: 'No restrictions — built to win' },
  5: { id: 5, name: 'cEDH', blurb: 'Competitive, tuned against the strongest decks' },
};

/**
 * Score → bracket.
 *
 * Deliberately straddles the same cuts the RPC uses for `power.band`
 * (≤3 casual, ≤6 mid, ≤8 high, else cEDH) so the two readouts can never
 * disagree on the tile — a "Casual" deck can only land in bracket 1 or 2.
 */
export function bracketForScore(score: number): DeckBracket {
  if (score <= 2) return DECK_BRACKETS[1];
  if (score <= 4) return DECK_BRACKETS[2];
  if (score <= 6) return DECK_BRACKETS[3];
  if (score <= 8) return DECK_BRACKETS[4];
  return DECK_BRACKETS[5];
}

/** Same thresholds the analysis panel and dashboard already use. */
export function powerTextClass(score: number): string {
  if (score <= 3) return 'text-power-1';
  if (score <= 6) return 'text-power-4';
  if (score <= 8) return 'text-power-7';
  return 'text-power-10';
}

function powerFillClass(score: number): string {
  if (score <= 3) return 'bg-power-1';
  if (score <= 6) return 'bg-power-4';
  if (score <= 8) return 'bg-power-7';
  return 'bg-power-10';
}

const BAND_LABEL: Record<string, string> = {
  casual: 'Casual',
  mid: 'Mid power',
  high: 'High power',
  cEDH: 'cEDH',
  cedh: 'cEDH',
};

export function bandLabel(band: string | undefined, score: number): string {
  if (band && BAND_LABEL[band]) return BAND_LABEL[band];
  if (score <= 3) return 'Casual';
  if (score <= 6) return 'Mid power';
  if (score <= 8) return 'High power';
  return 'cEDH';
}

/** Trailing `.0` is noise on a score that is usually a whole number. */
function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

const SEGMENTS = 10;

interface PowerMeterProps {
  score: number | null | undefined;
  band?: string;
  /** A real bracket, when one is known. Otherwise derived from the score. */
  bracket?: 1 | 2 | 3 | 4 | 5;
  className?: string;
}

/**
 * Ten flat segments. Not a gradient bar and not a pulsing badge — the fill is a
 * count you can read at a glance from across the grid.
 */
function Segments({ score, fill }: { score: number; fill: string }) {
  const filled = Math.round(score);
  return (
    <div
      className="mt-2.5 flex gap-[3px]"
      role="img"
      aria-label={`Power level ${formatScore(score)} out of 10`}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 flex-1 rounded-[2px] transition-colors duration-500 motion-reduce:transition-none',
            i < filled ? fill : 'bg-foreground/10'
          )}
          style={{ transitionDelay: `${i * 25}ms` }}
        />
      ))}
    </div>
  );
}

export function DeckPowerMeter({ score, band, bracket, className }: PowerMeterProps) {
  const value = Math.max(0, Math.min(10, Number(score ?? 0)));
  const info = bracket ? DECK_BRACKETS[bracket] : bracketForScore(value);
  const text = powerTextClass(value);
  const fill = powerFillClass(value);

  return (
    <div className={cn('rounded-lg bg-muted/40 p-3', className)} title={info.blurb}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Power level
          </p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className={cn('text-3xl font-bold leading-none tabular-nums', text)}>
              {formatScore(value)}
            </span>
            <span className="text-xs text-muted-foreground">/ 10</span>
          </p>
        </div>

        <div className="min-w-0 text-right">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Bracket {info.id}
          </p>
          <p className={cn('mt-1 truncate text-sm font-bold leading-none', text)}>{info.name}</p>
          <p className="mt-1 truncate text-[0.65rem] leading-none text-muted-foreground">
            {bandLabel(band, value)}
          </p>
        </div>
      </div>

      <Segments score={value} fill={fill} />
    </div>
  );
}

/** One-line version for the list view, where vertical space is the constraint. */
export function DeckPowerInline({ score, band, bracket, className }: PowerMeterProps) {
  const value = Math.max(0, Math.min(10, Number(score ?? 0)));
  const info = bracket ? DECK_BRACKETS[bracket] : bracketForScore(value);
  const text = powerTextClass(value);
  const fill = powerFillClass(value);
  const filled = Math.round(value);

  return (
    <div className={cn('min-w-0', className)} title={`${bandLabel(band, value)} — ${info.blurb}`}>
      <div className="flex items-baseline gap-1.5">
        <span className={cn('text-lg font-bold leading-none tabular-nums', text)}>
          {formatScore(value)}
        </span>
        <span className={cn('truncate text-[0.7rem] font-semibold leading-none', text)}>
          B{info.id} · {info.name}
        </span>
      </div>
      <div className="mt-1.5 flex gap-[2px]" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={cn('h-1 w-1.5 rounded-[1px]', i < filled ? fill : 'bg-foreground/10')}
          />
        ))}
      </div>
    </div>
  );
}

export default DeckPowerMeter;
