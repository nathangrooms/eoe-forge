import { cn } from '@/lib/utils';
import { Crown } from 'lucide-react';
import { PowerScore } from '@/components/deck/PowerScore';
import { SUBSCORE_LABELS, type DeckPower, type SubscoreKey } from '@/lib/deck/power';

/**
 * The commander-facing power readout.
 *
 * Restored and rewritten. The old version took a bare `powerLevel: number` and
 * an optional `metrics` object that every caller built by multiplying that one
 * number — `powerLevel * 0.9`, `* 1.1`, `* 0.8`, `* 1.2` — and labelled the
 * results Speed, Interaction, Resilience and Combo Potential. Four invented
 * figures presented as measurements. It also coloured itself with raw
 * `text-red-600` / `orange` / `yellow` / `green`, which the monochrome palette
 * does not allow.
 *
 * It now takes the canonical {@link DeckPower} and shows the four axes a
 * commander player actually asks about, straight from the engine's subscores,
 * plus the two diagnostics that drive the engine's own penalties: tutor count
 * and game changers.
 */

interface CommanderPowerDisplayProps {
  power: DeckPower | null;
  commanderName?: string;
  onRescore?: () => void;
  rescoring?: boolean;
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

function Diagnostic({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg bg-background/60 p-3 shadow-sm">
      <p className="text-lg font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1.5 text-[0.7rem] font-medium leading-none text-muted-foreground">{label}</p>
      <p className="mt-1 text-[0.62rem] leading-tight text-muted-foreground">{note}</p>
    </div>
  );
}

export function CommanderPowerDisplay({
  power,
  commanderName,
  onRescore,
  rescoring,
  className,
}: CommanderPowerDisplayProps) {
  return (
    <div className={cn('space-y-3 rounded-xl bg-muted/30 p-4 shadow-sm', className)}>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Crown className="h-4 w-4" />
          Power at the table
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {commanderName
            ? `How ${commanderName} scores against the rest of a four-player pod.`
            : 'How this deck scores against the rest of a four-player pod.'}
        </p>
      </div>

      <PowerScore power={power} variant="compact" onRescore={onRescore} rescoring={rescoring} />

      {power && (
        <>
          <div className="space-y-2.5">
            {COMMANDER_AXES.map(key => (
              <Axis key={key} k={key} value={axisValue(power, key)} muted={power.stale} />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Diagnostic
              label="Tutors"
              value={String(power.diagnostics?.tutorCount ?? 0)}
              note={
                power.diagnostics?.noTutors
                  ? 'Too few for a deck at this level, so the score is marked down'
                  : 'Enough to make the game plan repeatable'
              }
            />
            <Diagnostic
              label="Game changers"
              value={String(power.diagnostics?.gameChangerCount ?? 0)}
              note={
                power.diagnostics?.noGameChangers
                  ? 'No standout finishers, so the score is marked down'
                  : 'Cards that can end a game on their own'
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

export default CommanderPowerDisplay;
