import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RefreshCw, ChevronDown } from 'lucide-react';
import { MetricRow } from '@/components/listing';
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
  type Subscore,
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
  /**
   * `expanded` only. Draw the 48px score and the bracket above the working.
   * Defaults to true. Pass false where the screen already carries both in its
   * own metric row, which is the case on the EDH tab.
   */
  headline?: boolean;
  /**
   * `expanded` only. The screen already prints the average playability, so the
   * castability row leads on the three figures that are only here.
   *
   * Both surfaces that draw this block have it: the deck page header carries
   * `Average playability` on every tab, and the public deck page carries it in
   * the metric row above. Without this the EDH tab drew `5.0%` twice about six
   * hundred pixels apart — which is what it did under two different names
   * before this file was made to use one.
   */
  averageDrawnElsewhere?: boolean;
  className?: string;
}

const SEGMENTS = 10;

/** Placeholder for a figure that does not exist. Not a zero. */
const EMDASH = '\u2014';

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
          ? 'Outdated. The decklist changed after this score was computed.'
          : `${bandLabel(power.band)}. ${bracket.blurb}`
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

/**
 * One subscore, with the cards it counted.
 *
 * The bar and the number were here before. What is new is everything under
 * them: the sentence saying what was counted, and the named cards that add up
 * to it. DeckMatrix has already shipped a score that read 35 to 39 out of 100
 * for every deck and nobody caught it for a long time, because a bar with a
 * number on it looks exactly the same whether or not it measured anything. A
 * player who can see the cards can see when it is wrong.
 */
function SubscoreRow({ sub, muted }: { sub: Subscore; muted: boolean }) {
  const [open, setOpen] = useState(false);
  const value = sub.value;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const hasEvidence = sub.from.length > 0 || sub.holdingBack.length > 0;

  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{SUBSCORE_LABELS[sub.key]}</span>
        <span className="flex items-baseline gap-2 text-xs tabular-nums text-muted-foreground">
          <span className="text-[0.65rem] uppercase tracking-wider">
            &times;{sub.weight.toFixed(2)}
          </span>
          {value === null ? (
            <span className="text-sm font-semibold text-muted-foreground">Not measured</span>
          ) : (
            <>
              <span className="text-sm font-semibold text-foreground">{Math.round(pct)}</span>
              <span>/100</span>
            </>
          )}
        </span>
      </div>

      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <div
          className={cn('h-full rounded-full', muted ? 'bg-foreground/30' : 'bg-foreground/70')}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* What was counted. Not a description of the metric, the measurement. */}
      <p className="mt-1 text-[0.68rem] leading-snug text-muted-foreground">
        {value === null ? (sub.note ?? sub.measured) : sub.measured}
      </p>

      {hasEvidence && (
        <>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            className="mt-1 text-[0.68rem] font-medium text-foreground/80 hover:text-foreground"
          >
            {open ? 'Hide the cards' : 'Show the cards'}
          </button>

          {open && (
            <div className="mt-1.5 space-y-2 rounded-lg bg-background/60 p-2.5 shadow-sm">
              {sub.from.length > 0 && (
                <div>
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Where the points came from
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {sub.from.map(c => (
                      <li
                        key={c.name}
                        className="flex items-baseline justify-between gap-2 text-[0.72rem] leading-snug"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{c.name}</span>
                          {c.quantity > 1 && (
                            <span className="text-muted-foreground"> &times;{c.quantity}</span>
                          )}
                          <span className="text-muted-foreground"> {c.why}</span>
                        </span>
                        <span className="flex-shrink-0 tabular-nums text-muted-foreground">
                          +{c.points.toFixed(1)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {sub.othersCount > 0 && (
                    <p className="mt-1 text-[0.68rem] text-muted-foreground">
                      and {sub.othersCount} more, worth {sub.othersPoints.toFixed(1)} between them
                    </p>
                  )}
                </div>
              )}

              {sub.holdingBack.length > 0 && (
                <div>
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    What is costing you points
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {sub.holdingBack.map(c => (
                      <li
                        key={c.name}
                        className="flex items-baseline justify-between gap-2 text-[0.72rem] leading-snug"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{c.name}</span>
                          {c.quantity > 1 && (
                            <span className="text-muted-foreground"> &times;{c.quantity}</span>
                          )}
                          <span className="text-muted-foreground"> {c.why}</span>
                        </span>
                        <span className="flex-shrink-0 tabular-nums text-muted-foreground">
                          &minus;{c.points.toFixed(1)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The subscores in display order.
 *
 * A stored score from before a subscore existed simply will not carry it, and
 * ordering off `SUBSCORE_ORDER` rather than off the stored array means a
 * missing one is absent rather than rendered as a zero.
 */
function orderedEvidence(power: DeckPower): Subscore[] {
  const byKey = new Map(power.evidence.map(s => [s.key, s]));
  return SUBSCORE_ORDER.map(k => byKey.get(k as SubscoreKey)).filter(
    (s): s is Subscore => Boolean(s)
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
  headline = true,
  averageDrawnElsewhere = false,
  className,
}: {
  power: DeckPower;
  onRescore?: () => void;
  rescoring?: boolean;
  headline?: boolean;
  averageDrawnElsewhere?: boolean;
  className?: string;
}) {
  const [showBreakdown, setShowBreakdown] = useState(true);
  const stale = power.stale;
  const tone = stale ? 'text-muted-foreground' : powerTextClass(power.band);
  const bracket = DECK_BRACKETS[power.bracket];
  const cast = power.castability;

  const num = (v: number | undefined, digits = 0) =>
    typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';

  return (
    <div className={cn('space-y-4', className)}>
      {/* Headline: score + bracket, the two figures that matter most.

          `headline={false}` is for a caller that has already drawn both at the
          top of its own screen. It was measured off the EDH tab: the number
          2.0 was printed five times on one page — the hero at 30px, this
          block's 48px, `DeckEdhPanel`'s `MetricRow` tile at 24px, and the
          before/after pair in `PowerSliderCoaching` — with the bracket four
          times alongside it. The working below is what this component is for;
          the figure at the top was the copy. Segments, the stale chip and the
          rescore control stay either way, because the rescore control is the
          only one there is. */}
      <div className="rounded-xl bg-muted/40 p-5 shadow-sm">
        {headline && (
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
        )}

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

      {/* Exact castability. This block used to be headed "Opening-hand
          simulation, 10,000 seeded draws"; the generator behind it repeated
          after about 161 shuffles of a 99-card deck. These are closed-form. */}
      <div>
        <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Can you cast your own deck
        </p>
        {/* The shared tile, not a local one.
            These four were a `SimulationTile`: `text-xl font-bold` on an 11px
            label, which is a fifth metric treatment for the same kind of fact
            and one of the six the consistency audit counted. `MetricRow` at
            `on="card"` is the recessed variant for a row inside a panel that is
            already raised, and it draws the figure at the size every other
            figure in the product gets. The hints are `subtext`, which is the
            slot this was imitating. */}
        <MetricRow
          on="card"
          columns={averageDrawnElsewhere ? 3 : 4}
          metrics={[
            !averageDrawnElsewhere && {
              id: 'average',
              /* ONE NAME AND ONE PRECISION FOR ONE NUMBER. This tile said
                 `Average castable  5%`. The deck page header says
                 `Average playability  5.0%` and the public deck page said
                 `Playability  5%`, and all three read
                 `power.castability.averagePct`, which is
                 `playability.averagePct` — `src/engine/power/score.ts:324`
                 assigns it straight across. Three names and two roundings for
                 one measurement, two of them on the same screen on the EDH
                 tab, where a reader has no way to tell that 5% and 5.0% are
                 the same figure. */
              label: 'Average playability',
              value: cast.averagePct === null ? EMDASH : `${num(cast.averagePct, 1)}%`,
              raw: cast.averagePct ?? undefined,
              subtext: `across ${cast.scoredCount} cards with a cost`,
            },
            {
              id: 'hard',
              /* Named after the threshold, the same way the Mana tab names it.
                 This tile said `Hard to cast  94` while the Mana tab said
                 `Under 50%  94` about the identical count, so the two tabs
                 disagreed about what the figure was called. */
              label: `Under ${cast.threshold}%`,
              value: String(cast.hardToCastCount),
              raw: cast.hardToCastCount,
              subtext: 'more often stuck in hand than cast on curve',
            },
            {
              id: 'keepable',
              label: 'Keepable sevens',
              value: cast.keepable7Pct === null ? EMDASH : `${num(cast.keepable7Pct)}%`,
              raw: cast.keepable7Pct ?? undefined,
              subtext: 'two to five lands in your opener',
            },
            {
              id: 'turn-one',
              label: 'Turn-one colour',
              value: cast.turnOneColourPct === null ? EMDASH : `${num(cast.turnOneColourPct)}%`,
              raw: cast.turnOneColourPct ?? undefined,
              subtext: `average mana value ${num(cast.avgManaValue, 2)}`,
            },
          ]}
        />

        {/*
          `approximate` is set when the solver ran out of states on some card
          and fell back to a marginal product. `CastabilityReadout` says in as
          many words that a caller must not present the figure as exact when it
          is set, and this block did exactly that: `PlayabilityMeter` and
          `ManaSourcesPanel` both honour the flag, and the headline readout on
          the deck page, the one place the number is largest, ignored it.
        */}
        {cast.approximate && (
          <p className="mt-2 text-[0.7rem] leading-snug text-muted-foreground">
            One or more cards were too tangled to solve exactly, so these figures are close rather
            than precise.
          </p>
        )}

        {cast.hardest.length > 0 && (
          <div className="mt-2 rounded-lg bg-muted/40 p-3 shadow-sm">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Hardest to pay for
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {cast.hardest.map(card => (
                <li
                  key={card.name}
                  className="flex items-baseline justify-between gap-3 text-xs leading-snug"
                >
                  <span className="min-w-0 truncate font-medium">{card.name}</span>
                  <span className="flex-shrink-0 tabular-nums text-muted-foreground">
                    {num(card.pct)}% by turn {card.turn}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[0.68rem] leading-snug text-muted-foreground">
              These are the same cards the optimiser puts at the top of its cut list.
            </p>
          </div>
        )}
      </div>

      {/* Ten weighted subscores, each carrying its evidence */}
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
              Ten parts, each one showing the cards it counted
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
            {orderedEvidence(power).map(sub => (
              <SubscoreRow key={sub.key} sub={sub} muted={stale} />
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
  headline,
  averageDrawnElsewhere,
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
        headline={headline}
        averageDrawnElsewhere={averageDrawnElsewhere}
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
      title={power.stale ? 'Outdated. Rescore this deck.' : DECK_BRACKETS[power.bracket].blurb}
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
