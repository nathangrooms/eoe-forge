import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RefreshCw, ChevronDown } from 'lucide-react';
import {
  DECK_BRACKETS,
  SUBSCORE_DESCRIPTIONS,
  SUBSCORE_LABELS,
  SUBSCORE_ORDER,
  SUBSCORE_WEIGHTS,
  bandLabel,
  bandShortLabel,
  formatPowerScore,
  powerFillClass,
  powerTextClass,
  type DeckPower,
  type SubscoreKey,
} from '@/lib/deck/power';

/**
 * The one way a power score is ever displayed.
 *
 * Before this component the same deck could show 5.0 on the dashboard, 6.28 in
 * the builder banner, 6.6 in the analysis modal and 35/100 in a panel directly
 * below it. Everything now renders `DeckPower` — a single object from a single
 * engine — through one of these three variants, so a mismatch would have to be
 * a mismatch in the data, not in the presentation.
 *
 * Three states, all explicit:
 *
 * - **scored** — a current score. The number, the band and the bracket.
 * - **stale** — a stored score whose decklist has since changed. The number is
 *   shown greyed and struck through by context, never in the power colour, and
 *   never without the word "Outdated". A wrong number shown confidently is
 *   worse than no number.
 * - **unscored** — no score exists. Says so, and offers to compute one.
 *
 * Design: surface tint and shadow, no borders, no gradients. `text-power-*` is
 * the only colour, and it is only ever applied to a current score.
 */

export type PowerScoreVariant = 'inline' | 'compact' | 'expanded';

interface PowerScoreProps {
  power: DeckPower | null | undefined;
  variant?: PowerScoreVariant;
  /** Offered when the score is missing or stale. */
  onRescore?: () => void;
  rescoring?: boolean;
  /**
   * Why there is no score, when the caller knows. "Add cards to score this
   * deck" is a useful sentence; "the score is computed by the EDH engine" is
   * a description of a machine the reader cannot act on.
   */
  unscoredReason?: string;
  className?: string;
}

const SEGMENTS = 10;

/** Shared geometry, so a filled bar and an empty one occupy identical space. */
function segmentRowClass(size: 'sm' | 'md') {
  return cn('flex', size === 'sm' ? 'mt-1.5 gap-[2px]' : 'mt-2.5 gap-[3px]');
}
const segmentClass = (size: 'sm' | 'md') =>
  cn('flex-1 rounded-[2px]', size === 'sm' ? 'h-1' : 'h-1.5');

/** The bar an unscored deck still draws, so its tile is the same height. */
function EmptySegments({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <div className={segmentRowClass(size)} role="img" aria-label="Power level not scored">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span key={i} className={cn(segmentClass(size), 'bg-foreground/10')} />
      ))}
    </div>
  );
}

/** Ten flat segments — a count you can read from across a grid, not a gradient bar. */
function Segments({
  score,
  band,
  muted,
  size = 'md',
}: {
  score: number;
  band: DeckPower['band'];
  muted: boolean;
  size?: 'sm' | 'md';
}) {
  const filled = Math.round(score);
  const fill = muted ? 'bg-foreground/25' : powerFillClass(band);
  return (
    <div
      className={segmentRowClass(size)}
      role="img"
      aria-label={`Power level ${formatPowerScore(score)} out of 10`}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            segmentClass(size),
            'transition-colors duration-500 motion-reduce:transition-none',
            i < filled ? fill : 'bg-foreground/10'
          )}
          style={{ transitionDelay: `${i * 25}ms` }}
        />
      ))}
    </div>
  );
}

function StaleChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'rounded-sm bg-foreground/10 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground',
        className
      )}
      title="The decklist changed after this score was computed. Rescore to update it."
    >
      Outdated
    </span>
  );
}

function RescoreButton({
  onRescore,
  rescoring,
  label,
}: {
  onRescore?: () => void;
  rescoring?: boolean;
  label: string;
}) {
  if (!onRescore) return null;
  return (
    <Button variant="secondary" size="sm" onClick={onRescore} disabled={rescoring}>
      <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', rescoring && 'animate-spin')} />
      {rescoring ? 'Scoring…' : label}
    </Button>
  );
}

/* ------------------------------------------------------------------ *
 * Empty / stale-only states
 * ------------------------------------------------------------------ */

/**
 * No score — but the *same block*.
 *
 * This used to replace the whole readout with a paragraph, so a nine-deck grid
 * rendered two different tile anatomies side by side: six tiles with a number,
 * a bracket and a ten-segment bar, three with a wall of explanatory prose where
 * that block should be. The eye cannot compare down a column when the columns
 * are not the same shape.
 *
 * The frame is now identical to {@link CompactPower} — same eyebrow, same
 * baseline for the figure, same bracket column, same bar — with an em-dash
 * where the number goes and every segment empty. A missing score reads as a
 * missing score, at a glance, in the position the score always occupies.
 */
function UnscoredBlock({
  variant,
  onRescore,
  rescoring,
  unscoredReason,
  className,
}: {
  variant: PowerScoreVariant;
  onRescore?: () => void;
  rescoring?: boolean;
  unscoredReason?: string;
  className?: string;
}) {
  if (variant === 'inline') {
    return (
      <div className={cn('min-w-0', className)}>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold leading-none tabular-nums text-muted-foreground">
            —
          </span>
          <span className="truncate text-[0.7rem] font-semibold leading-none text-muted-foreground">
            Not scored
          </span>
        </div>
        <EmptySegments size="sm" />
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg bg-muted/40 p-3 shadow-sm', className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            EDH power
          </p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="text-3xl font-bold leading-none tabular-nums text-muted-foreground">
              —
            </span>
            <span className="text-xs text-muted-foreground">/ 10</span>
          </p>
        </div>

        {/* Mirrors the scored block's right column exactly: label, value,
            qualifier. The value is absent, so it is an em-dash, not the word
            "unscored" repeated twice down the column. */}
        <div className="min-w-0 text-right">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Bracket
          </p>
          <p className="mt-1 truncate text-sm font-bold leading-none text-muted-foreground">—</p>
          <p className="mt-1 truncate text-[0.65rem] leading-none text-muted-foreground">
            {rescoring ? 'Scoring…' : (unscoredReason ?? 'Not scored yet')}
          </p>
        </div>
      </div>

      <EmptySegments />

      {onRescore && (
        <div className="mt-2.5 flex justify-end">
          <RescoreButton onRescore={onRescore} rescoring={rescoring} label="Score deck" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Variants
 * ------------------------------------------------------------------ */

/** One line. For deck list rows, where vertical space is the constraint. */
function InlinePower({ power, className }: { power: DeckPower; className?: string }) {
  const stale = power.stale;
  const tone = stale ? 'text-muted-foreground' : powerTextClass(power.band);
  const bracket = DECK_BRACKETS[power.bracket];

  return (
    <div
      className={cn('min-w-0', className)}
      title={
        stale
          ? 'Outdated — the decklist changed after this score was computed'
          : `${bandLabel(power.band)} — ${bracket.blurb}`
      }
    >
      <div className="flex items-baseline gap-1.5">
        <span className={cn('text-lg font-bold leading-none tabular-nums', tone)}>
          {formatPowerScore(power.score)}
        </span>
        <span className={cn('truncate text-[0.7rem] font-semibold leading-none', tone)}>
          {bandShortLabel(power.band)} · B{bracket.id}
        </span>
        {stale && <StaleChip />}
      </div>
      <Segments score={power.score} band={power.band} muted={stale} size="sm" />
    </div>
  );
}

/**
 * The tile block. Power level and bracket are the two things the owner calls
 * out as mattering most, so they get equal billing rather than a badge wedged
 * next to the format chip.
 */
function CompactPower({
  power,
  onRescore,
  rescoring,
  className,
}: {
  power: DeckPower;
  onRescore?: () => void;
  rescoring?: boolean;
  className?: string;
}) {
  const stale = power.stale;
  const tone = stale ? 'text-muted-foreground' : powerTextClass(power.band);
  const bracket = DECK_BRACKETS[power.bracket];

  return (
    <div
      className={cn('rounded-lg bg-muted/40 p-3 shadow-sm', className)}
      title={stale ? 'The decklist changed after this score was computed' : bracket.blurb}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            EDH power
          </p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className={cn('text-3xl font-bold leading-none tabular-nums', tone)}>
              {formatPowerScore(power.score)}
            </span>
            <span className="text-xs text-muted-foreground">/ 10</span>
          </p>
        </div>

        <div className="min-w-0 text-right">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Bracket {bracket.id}
          </p>
          <p className={cn('mt-1 truncate text-sm font-bold leading-none', tone)}>{bracket.name}</p>
          <p className="mt-1 truncate text-[0.65rem] leading-none text-muted-foreground">
            {bandLabel(power.band)}
          </p>
        </div>
      </div>

      <Segments score={power.score} band={power.band} muted={stale} />

      {stale && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <StaleChip />
          <RescoreButton onRescore={onRescore} rescoring={rescoring} label="Rescore" />
        </div>
      )}
    </div>
  );
}

/** A single 0–100 subscore row with its weight, so the total is explainable. */
function SubscoreRow({ k, value, muted }: { k: SubscoreKey; value: number; muted: boolean }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{SUBSCORE_LABELS[k]}</span>
        <span className="flex items-baseline gap-2 text-xs tabular-nums text-muted-foreground">
          <span className="text-[0.65rem] uppercase tracking-wider">
            ×{SUBSCORE_WEIGHTS[k].toFixed(2)}
          </span>
          <span className="text-sm font-semibold text-foreground">{Math.round(pct)}</span>
          <span>/100</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <div
          className={cn('h-full rounded-full', muted ? 'bg-foreground/30' : 'bg-foreground/70')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[0.68rem] leading-snug text-muted-foreground">
        {SUBSCORE_DESCRIPTIONS[k]}
      </p>
    </div>
  );
}

function SimulationTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3 shadow-sm">
      <p className="text-xl font-bold tabular-nums leading-none">{value}</p>
      <p className="mt-1.5 text-[0.7rem] font-medium leading-none text-muted-foreground">{label}</p>
      {hint && <p className="mt-1 text-[0.62rem] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * The deck page readout: the number, the bracket, the nine weighted subscores
 * and the seeded-simulation figures. The breakdown is the point — a score you
 * cannot explain is a score nobody trusts.
 */
function ExpandedPower({
  power,
  onRescore,
  rescoring,
  className,
}: {
  power: DeckPower;
  onRescore?: () => void;
  rescoring?: boolean;
  className?: string;
}) {
  const [showBreakdown, setShowBreakdown] = useState(true);
  const stale = power.stale;
  const tone = stale ? 'text-muted-foreground' : powerTextClass(power.band);
  const bracket = DECK_BRACKETS[power.bracket];
  const sim = power.simulation;

  const num = (v: number | undefined, digits = 0) =>
    typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';

  return (
    <div className={cn('space-y-4', className)}>
      {/* Headline: score + bracket, the two figures that matter most */}
      <div className="rounded-xl bg-muted/40 p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              DeckMatrix EDH power score
            </p>
            <p className="mt-1.5 flex items-baseline gap-2">
              <span className={cn('text-5xl font-bold leading-none tabular-nums', tone)}>
                {formatPowerScore(power.score)}
              </span>
              <span className="text-base text-muted-foreground">/ 10</span>
            </p>
            <p className={cn('mt-2 text-sm font-bold', tone)}>{bandLabel(power.band)}</p>
          </div>

          <div className="min-w-0 sm:text-right">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Commander bracket
            </p>
            <p className="mt-1.5 flex items-baseline gap-2 sm:justify-end">
              <span className={cn('text-3xl font-bold leading-none tabular-nums', tone)}>
                {bracket.id}
              </span>
              <span className={cn('text-lg font-bold leading-none', tone)}>{bracket.name}</span>
            </p>
            <p className="mt-2 max-w-xs text-[0.7rem] leading-snug text-muted-foreground sm:ml-auto">
              {bracket.blurb}
            </p>
          </div>
        </div>

        <Segments score={power.score} band={power.band} muted={stale} />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {stale
              ? 'This score was computed from an earlier version of this decklist.'
              : 'Computed from this decklist by the DeckMatrix EDH engine.'}
          </p>
          <div className="flex items-center gap-2">
            {stale && <StaleChip />}
            <RescoreButton
              onRescore={onRescore}
              rescoring={rescoring}
              label={stale ? 'Rescore' : 'Recompute'}
            />
          </div>
        </div>
      </div>

      {/* Seeded simulation — these are measurements, not opinions */}
      <div>
        <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Opening-hand simulation · 10,000 seeded draws
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SimulationTile
            label="Keepable sevens"
            value={`${num(sim?.keepable7Pct)}%`}
            hint="Two lands, colour access, castable spells"
          />
          <SimulationTile
            label="Turn-one colour"
            value={`${num(sim?.t1ColorPct)}%`}
            hint="Untapped source in the opener"
          />
          <SimulationTile
            label="Two colours by T2"
            value={`${num(sim?.t2TwoColorsPct)}%`}
            hint="Second colour available on turn two"
          />
          <SimulationTile
            label="Untapped lands"
            value={`${num(sim?.untappedLandPct)}%`}
            hint={`Avg MV ${num(sim?.avgManaValue, 2)}`}
          />
        </div>
      </div>

      {/* Nine weighted subscores */}
      <div className="rounded-xl bg-muted/40 p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setShowBreakdown(v => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={showBreakdown}
        >
          <span>
            <span className="block text-sm font-bold">Why this score</span>
            <span className="block text-xs text-muted-foreground">
              Nine weighted subscores, 0–100 each
            </span>
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform',
              showBreakdown && 'rotate-180'
            )}
          />
        </button>

        {showBreakdown && (
          <div className="mt-3 grid grid-cols-1 gap-x-6 md:grid-cols-2">
            {SUBSCORE_ORDER.map(key => (
              <SubscoreRow
                key={key}
                k={key}
                value={power.subscores?.[key] ?? 0}
                muted={stale}
              />
            ))}
          </div>
        )}
      </div>

      {/* Drivers and drags, straight from the engine */}
      {(power.drivers.length > 0 || power.drags.length > 0) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {power.drivers.length > 0 && (
            <div className="rounded-lg bg-muted/40 p-4 shadow-sm">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                What lifts it
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {power.drivers.map((driver, i) => (
                  <li key={i} className="leading-snug">
                    {driver}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {power.drags.length > 0 && (
            <div className="rounded-lg bg-muted/40 p-4 shadow-sm">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                What holds it back
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {power.drags.map((drag, i) => (
                  <li key={i} className="leading-snug">
                    {drag}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export function PowerScore({
  power,
  variant = 'compact',
  onRescore,
  rescoring,
  unscoredReason,
  className,
}: PowerScoreProps) {
  if (!power) {
    return (
      <UnscoredBlock
        variant={variant}
        onRescore={onRescore}
        rescoring={rescoring}
        unscoredReason={unscoredReason}
        className={className}
      />
    );
  }

  if (variant === 'inline') return <InlinePower power={power} className={className} />;
  if (variant === 'expanded') {
    return (
      <ExpandedPower
        power={power}
        onRescore={onRescore}
        rescoring={rescoring}
        className={className}
      />
    );
  }
  return (
    <CompactPower
      power={power}
      onRescore={onRescore}
      rescoring={rescoring}
      className={className}
    />
  );
}

/**
 * Badge-sized readout for headers and dense stat rows. Same data, same colour
 * rule, no second opinion — it just has no room for the bracket blurb.
 */
export function PowerScoreBadge({
  power,
  className,
}: {
  power: DeckPower | null | undefined;
  className?: string;
}) {
  if (!power) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold text-muted-foreground',
          className
        )}
      >
        Power not scored
      </span>
    );
  }

  const tone = power.stale ? 'text-muted-foreground' : powerTextClass(power.band);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold',
        className
      )}
      title={power.stale ? 'Outdated — rescore this deck' : DECK_BRACKETS[power.bracket].blurb}
    >
      <span className={cn('tabular-nums', tone)}>{formatPowerScore(power.score)}/10</span>
      <span className="text-muted-foreground">·</span>
      <span className={tone}>{bandShortLabel(power.band)}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">B{power.bracket}</span>
      {power.stale && <StaleChip className="ml-0.5" />}
    </span>
  );
}

export default PowerScore;
