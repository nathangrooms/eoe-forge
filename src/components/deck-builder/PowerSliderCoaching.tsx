import { useMemo, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { ArrowRight, Target } from 'lucide-react';
import {
  DECK_BRACKETS,
  SUBSCORE_LABELS,
  bandForScore,
  bandLabel,
  bracketIdForScore,
  coachDeckPower,
  formatPowerScore,
  powerTextClass,
  type DeckPower,
  type PowerDeckEntry,
  type SubscoreKey,
} from '@/lib/deck/power';

/**
 * "How do I get this deck to X?"
 *
 * Restored and rewritten. Every number the old version showed was invented —
 * a `generatePreview` that returned hardcoded card names and hardcoded subscore
 * deltas ("interaction 6.2 → 6.7") regardless of what was in the deck.
 *
 * It now runs the real `DeckCoach` the power engine already ships, against the
 * deck's canonical subscores. The current score is a measurement and comes from
 * `DeckPower`; the target is a *choice* and lives in local state. The two are
 * never the same field — conflating "what this deck is" with "what I want it to
 * be" is how a slider position ended up persisted as a deck's power level.
 */

interface PowerSliderCoachingProps {
  power: DeckPower;
  entries: PowerDeckEntry[];
  format?: string;
  className?: string;
}

function PowerFace({
  label,
  score,
  muted,
}: {
  label: string;
  score: number;
  muted?: boolean;
}) {
  const band = bandForScore(score);
  const bracket = bracketIdForScore(score);
  const tone = muted ? 'text-muted-foreground' : powerTextClass(band);
  return (
    <div className="min-w-0 flex-1 rounded-lg bg-muted/40 p-3 shadow-sm">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className={cn('text-3xl font-bold leading-none tabular-nums', tone)}>
          {formatPowerScore(score)}
        </span>
        <span className="text-xs text-muted-foreground">/ 10</span>
      </p>
      <p className={cn('mt-1.5 text-xs font-semibold', tone)}>{bandLabel(band)}</p>
      <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
        Bracket {bracket} · {DECK_BRACKETS[bracket].name}
      </p>
    </div>
  );
}

export function PowerSliderCoaching({
  power,
  entries,
  format = 'commander',
  className,
}: PowerSliderCoachingProps) {
  const [target, setTarget] = useState(() =>
    Math.min(10, Math.max(1, Math.round(power.score + 1)))
  );

  const coaching = useMemo(
    () => coachDeckPower(entries, power, target, format),
    [entries, power, target, format]
  );

  const gap = Math.round((target - power.score) * 10) / 10;

  /** The subscores furthest from where the target band wants them. */
  const weakest = useMemo(() => {
    const wanted = target >= 9 ? 82 : target >= 7 ? 68 : target >= 5 ? 52 : 38;
    return (Object.entries(power.subscores) as Array<[SubscoreKey, number]>)
      .map(([key, value]) => ({ key, value, deficit: wanted - value }))
      .filter(entry => entry.deficit > 8)
      .sort((a, b) => b.deficit - a.deficit)
      .slice(0, 4);
  }, [power.subscores, target]);

  return (
    <div className={cn('space-y-4 rounded-xl bg-muted/30 p-4 shadow-sm', className)}>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Target className="h-4 w-4" />
          Power tuning
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Where this deck sits now, and what moves it towards where you want it.
        </p>
      </div>

      <div className="flex items-stretch gap-3">
        <PowerFace label="This deck scores" score={power.score} muted={power.stale} />
        <div className="flex items-center">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <PowerFace label="You are aiming for" score={target} />
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted-foreground">Target power</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {gap === 0
              ? 'on target'
              : gap > 0
                ? `${gap.toFixed(1)} above where it is`
                : `${Math.abs(gap).toFixed(1)} below where it is`}
          </span>
        </div>
        <Slider
          value={[target]}
          onValueChange={value => setTarget(value[0])}
          min={1}
          max={10}
          step={1}
          aria-label="Target power level"
        />
      </div>

      {coaching.recommendations.length > 0 && (
        <div className="rounded-lg bg-background/60 p-3 shadow-sm">
          {/* "What to change" over a line that says nothing needs changing was
              half of the contradiction. When the coach has no moves to offer,
              this block is a verdict, not a list of changes. */}
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {coaching.operations.length > 0 ? 'What to change' : 'Where it stands'}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {coaching.recommendations.map((line, i) => (
              <li key={i} className="leading-snug">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {coaching.operations.length > 0 && (
        <div className="rounded-lg bg-background/60 p-3 shadow-sm">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Concrete moves
          </p>
          <ul className="mt-2 space-y-2">
            {coaching.operations.slice(0, 6).map((op, i) => (
              <li key={i} className="flex items-start gap-2 text-sm leading-snug">
                <span className="mt-0.5 w-14 flex-shrink-0 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  {op.op}
                </span>
                <span className="min-w-0">
                  {op.role && <span className="font-medium">{op.role} </span>}
                  {typeof op.qty === 'number' && <span className="tabular-nums">×{op.qty} </span>}
                  <span className="text-muted-foreground">{op.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {weakest.length > 0 && (
        <div>
          {/* And the other half: these deficits sat under the "well-tuned"
              line with nothing joining them up. The heading now says plainly
              that a deck can be at its target overall and still be thin in
              places, which is the true reading of both figures. */}
          <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Thinnest parts, against a {formatPowerScore(target)} deck
          </p>
          <div className="space-y-2">
            {weakest.map(({ key, value, deficit }) => (
              <div key={key}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium">{SUBSCORE_LABELS[key]}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Math.round(value)}/100 · {Math.round(deficit)} short
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="h-full rounded-full bg-foreground/60"
                    style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {coaching.recommendations.length === 0 && coaching.operations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing to change. This list already scores at the target you picked.
        </p>
      )}
    </div>
  );
}

export default PowerSliderCoaching;
