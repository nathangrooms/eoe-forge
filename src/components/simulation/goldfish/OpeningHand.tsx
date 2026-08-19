import { useMemo, useState } from 'react';
import { RotateCcw, Check, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardImage } from '@/components/cards';
import { ManaCost } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';
import { handShape, type GoldfishCard, type OpeningStats } from '@/lib/goldfish/engine';

interface OpeningHandProps {
  hand: GoldfishCard[];
  mulligans: number;
  /** Cards that must go to the bottom before this hand can be kept. */
  toBottom: number;
  stats: OpeningStats;
  librarySize: number;
  onMulligan: () => void;
  onKeep: (bottomUids: string[]) => void;
}

/**
 * The mulligan decision, at a size where it is actually a decision.
 *
 * A seven-card hand is the one moment in a game of Magic where every card has to
 * be read at once, so all seven are drawn full — never cropped, never a name in
 * a box — across the full width of the page. The numbers beside them are counted
 * from these exact cards and from the real library behind them: lands in hand,
 * mana producers, the cheapest spell, and the deck's own opening-hand
 * distribution so "is four lands normal for this list" has an answer rather
 * than a feeling. That distribution used to be sampled and is now solved; see
 * `openingHandStats`.
 */
export function OpeningHand({
  hand,
  mulligans,
  toBottom,
  stats,
  librarySize,
  onMulligan,
  onKeep,
}: OpeningHandProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const shape = useMemo(() => handShape(hand), [hand]);
  const needsBottom = toBottom > 0;
  const ready = selected.length === toBottom;

  const toggle = (uid: string) => {
    if (!needsBottom) return;
    setSelected(prev =>
      prev.includes(uid)
        ? prev.filter(u => u !== uid)
        : prev.length >= toBottom
          ? [...prev.slice(1), uid]
          : [...prev, uid]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-lg shadow-black/20 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {mulligans === 0 ? 'Opening hand' : `Mulligan to ${7 - mulligans}`}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {needsBottom
              ? `Choose ${toBottom} card${toBottom === 1 ? '' : 's'} to put on the bottom, then keep.`
              : 'Keep it, or throw it back. London mulligan, so you always see seven.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={onMulligan} disabled={mulligans >= 6}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Mulligan{mulligans > 0 ? ` (${mulligans})` : ''}
          </Button>
          <Button onClick={() => onKeep(selected)} disabled={!ready}>
            <Check className="mr-2 h-4 w-4" aria-hidden="true" />
            {needsBottom ? `Keep, bottom ${selected.length}/${toBottom}` : 'Keep this hand'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        {hand.map((card, index) => {
          const bottoming = selected.includes(card.uid);
          return (
            <button
              key={card.uid}
              type="button"
              onClick={() => toggle(card.uid)}
              disabled={!needsBottom}
              aria-pressed={bottoming}
              className={cn(
                'group rounded-xl p-2 text-left transition-colors',
                needsBottom && 'hover:bg-muted/40',
                bottoming ? 'bg-muted' : 'bg-muted/15'
              )}
              title={needsBottom ? `Put ${card.name} on the bottom` : card.name}
            >
              <div className="relative">
                <CardImage
                  card={card.row}
                  size="lg"
                  fill
                  eager={index < 7}
                  imageClassName={cn(bottoming && 'opacity-35 grayscale')}
                />
                {bottoming && (
                  <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-md bg-background/85 py-1.5 text-xs font-semibold text-foreground">
                    <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
                    To bottom
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-foreground">{card.name}</span>
                {card.mana_cost ? (
                  <ManaCost cost={card.mana_cost} size="sm" />
                ) : (
                  <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    Land
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col rounded-xl bg-card p-4 shadow-lg shadow-black/20">
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            This hand
          </h3>
          <div className="mt-3 grid flex-1 grid-cols-2 gap-3">
            <Readout label="Lands" value={String(shape.lands)} />
            <Readout label="Mana producers" value={String(shape.lands + shape.rocks)} />
            <Readout label="Spells" value={String(shape.spells)} />
            <Readout
              label="Cheapest spell"
              value={shape.spells ? `${shape.cheapest} MV` : '—'}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {librarySize} cards behind it. Mana producers counts lands plus anything whose text adds
            mana.
          </p>
        </div>

        <LandDistribution stats={stats} handLands={shape.lands} />
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-center rounded-lg bg-muted/30 p-3">
      <p className="text-[0.7rem] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

/**
 * How often this deck opens on each land count.
 *
 * Worked out from the deck's real library, so the bar you are standing on tells
 * you whether the hand in front of you is normal or an outlier.
 *
 * This used to print a trial count, on the reasoning that a share without an N
 * is a claim rather than a measurement. That reasoning was right and the answer
 * was wrong: the figures are not sampled any more, so there is no N to print.
 * They come from the same closed-form arithmetic the deck page's "Keepable
 * sevens" uses, which is what stops one deck reading two different ways on two
 * different pages.
 */
function LandDistribution({ stats, handLands }: { stats: OpeningStats; handLands: number }) {
  const max = Math.max(...stats.landHistogram, 0.0001);

  return (
    <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Opening hands from this library
        </h3>
        <p className="text-xs text-muted-foreground">Worked out from the whole list</p>
      </div>

      {!stats.measured ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Not enough cards in the list to draw an opening hand.
        </p>
      ) : (
        <>
          <div className="mt-4 flex h-28 items-end gap-2">
            {stats.landHistogram.map((share, lands) => (
              <div key={lands} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span
                  className={cn(
                    'text-[0.65rem] tabular-nums',
                    lands === handLands ? 'font-bold text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {share > 0.004 ? `${Math.round(share * 100)}%` : ''}
                </span>
                <div
                  className={cn(
                    'w-full rounded-t-sm transition-colors',
                    lands === handLands ? 'bg-foreground' : 'bg-muted-foreground/35'
                  )}
                  style={{ height: `${Math.max(2, (share / max) * 72)}px` }}
                />
                <span
                  className={cn(
                    'text-[0.65rem] tabular-nums',
                    lands === handLands ? 'font-bold text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {lands}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Readout label="Average lands" value={stats.averageLands.toFixed(2)} />
            <Readout label="2–5 lands" value={`${Math.round(stats.keepableShare * 100)}%`} />
            <Readout
              label="0–1 lands"
              value={`${Math.round(stats.screwShare * 100)}%`}
            />
          </div>
        </>
      )}
    </div>
  );
}
