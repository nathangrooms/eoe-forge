import { cn } from '@/lib/utils';
import { Crown } from 'lucide-react';
import { SUBSCORE_LABELS, type DeckPower, type SubscoreKey } from '@/lib/deck/power';

/**
 * The four axes a commander player asks about.
 *
 * Restored and rewritten once already. The version before that took a bare
 * `powerLevel: number` and an optional `metrics` object that every caller built
 * by multiplying that one number — `powerLevel * 0.9`, `* 1.1`, `* 0.8`,
 * `* 1.2` — and labelled the results Speed, Interaction, Resilience and Combo
 * Potential. Four invented figures presented as measurements. It also coloured
 * itself with raw `text-red-600` / `orange` / `yellow` / `green`, which the
 * monochrome palette does not allow.
 *
 * It takes the canonical {@link DeckPower} and reads the four axes straight off
 * the engine's own subscores.
 *
 * ## TWO THINGS LEFT THIS FILE, BOTH BECAUSE THEY WERE ALREADY ON THE PAGE
 *
 * **The score itself.** This panel mounted `PowerScore variant="compact"` at
 * the top of its body. Both of its callers draw `PowerScore variant="expanded"`
 * higher up the same screen — `DeckInterface`'s EDH tab and
 * `AIGeneratedDeckList` — so a deck's power was rendered twice at two sizes
 * from one object. The expanded one is the canonical readout and carries the
 * bracket, the ten subscores and their evidence; this one added nothing to it.
 *
 * **Tutors and game changers.** Two hand-rolled 18px tiles here. They are
 * figures about the deck, so they belong in the tab's `MetricRow` with the
 * other figures about the deck — and there `DeckEdhPanel` can do something this
 * panel never could, which is name the cards behind them. The engine has
 * carried `gameChangers.list` and `tutors.list` all along and the adapter
 * reduced both to integers. It does not any more; see `NamedCard` in
 * `powerAdapter`.
 *
 * What is left is the part that was only ever here.
 */

interface CommanderPowerDisplayProps {
  power: DeckPower | null;
  commanderName?: string;
  className?: string;
}

/** The axes that decide how a commander deck plays out at a four-player table. */
const COMMANDER_AXES: SubscoreKey[] = ['speed', 'interaction', 'resilience', 'synergy'];

/**
 * One axis.
 *
 * `value` is null when the score could not measure that axis for this deck, and
 * that is NOT the same thing as a zero. The flat `power.subscores` record folds
 * the two together (`subscore.value ?? 0` in `powerAdapter`), so reading the
 * axis from there painted an empty bar and "0/100" for a commander whose
 * direction simply could not be read. That is an invented failing grade for a
 * question that was never answered, which is the exact thing `applicable` was
 * added to prevent. So this reads `power.evidence`, which keeps the null.
 */
function Axis({ k, value, muted }: { k: SubscoreKey; value: number | null; muted: boolean }) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium">{SUBSCORE_LABELS[k]}</span>
          <span className="text-muted-foreground">Not measured</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-foreground/10" />
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{SUBSCORE_LABELS[k]}</span>
        <span className="tabular-nums text-muted-foreground">{Math.round(pct)}/100</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <div
          className={cn('h-full rounded-full', muted ? 'bg-foreground/30' : 'bg-foreground/70')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The axis's real value, keeping "not measured" separate from zero.
 *
 * `power.evidence` is the subscore list itself and carries both `applicable`
 * and a nullable `value`. A stored score written before the evidence was kept
 * has none, and in that case the flat record is all there is, so it is used and
 * a stored zero is shown as a zero.
 */
function axisValue(power: DeckPower, key: SubscoreKey): number | null {
  const subscore = power.evidence?.find(entry => entry.key === key);
  if (subscore) return subscore.applicable ? subscore.value : null;
  return power.subscores?.[key] ?? null;
}

export function CommanderPowerDisplay({
  power,
  commanderName,
  className,
}: CommanderPowerDisplayProps) {
  return (
    <div className={cn('space-y-4 rounded-xl bg-muted/30 p-4 shadow-sm', className)}>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Crown className="h-4 w-4" />
          Power at the table
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {commanderName
            ? `The four axes that decide how ${commanderName} plays out against a four-player pod.`
            : 'The four axes that decide how this deck plays out against a four-player pod.'}
        </p>
      </div>

      {power ? (
        <div className="space-y-2.5">
          {COMMANDER_AXES.map(key => (
            <Axis key={key} k={key} value={axisValue(power, key)} muted={power.stale} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          This deck has not been scored yet, so there is nothing to break down.
        </p>
      )}
    </div>
  );
}

export default CommanderPowerDisplay;
