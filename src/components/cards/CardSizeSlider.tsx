import { useCallback, useEffect, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

/**
 * A continuous card-size control — a scroller, not S/M/L buttons.
 *
 * The emitted number is the *minimum card width in px* that `CardGrid` feeds
 * straight into `repeat(auto-fill, minmax(<width>px, 1fr))`, so dragging the
 * slider reflows the grid live. The choice is remembered per surface, because
 * "how big do I like my cards" is a preference, not a session detail.
 */

export const CARD_WIDTH_MIN = 90;
export const CARD_WIDTH_MAX = 320;
export const CARD_WIDTH_DEFAULT = 176;
export const CARD_WIDTH_STEP = 2;

/**
 * Radix's slider thumb ships with a 2px ring. Borders are banned in this
 * product, so every slider in the card surfaces wears this skin: a solid ink
 * thumb on a muted track.
 */
export const BORDERLESS_SLIDER = cn(
  '[&_[role=slider]]:border-0 [&_[role=slider]]:bg-primary [&_[role=slider]]:shadow-md [&_[role=slider]]:shadow-black/30',
  '[&_[role=slider]]:h-4 [&_[role=slider]]:w-4'
);

const storageKeyFor = (surface: string) => `dm.card-size.${surface}`;

const clamp = (n: number) =>
  Math.min(CARD_WIDTH_MAX, Math.max(CARD_WIDTH_MIN, Math.round(n)));

function readStored(surface: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKeyFor(surface));
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp(parsed) : fallback;
  } catch {
    // Private mode / blocked storage — the preference just is not remembered.
    return fallback;
  }
}

function writeStored(surface: string, value: number) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKeyFor(surface), String(value));
  } catch {
    /* non-fatal */
  }
}

/**
 * Card width for one surface, restored from localStorage on mount.
 *
 * ```tsx
 * const [cardWidth, setCardWidth] = useCardSize('search');
 * <CardSizeSlider storageKey="search" value={cardWidth} onValueChange={setCardWidth} />
 * <CardGrid width={cardWidth}>…</CardGrid>
 * ```
 */
export function useCardSize(
  storageKey: string,
  fallback: number = CARD_WIDTH_DEFAULT
): [number, (next: number) => void] {
  const [width, setWidth] = useState<number>(() => readStored(storageKey, fallback));

  // Switching surface (e.g. a tabbed page) re-reads that surface's preference.
  useEffect(() => {
    setWidth(readStored(storageKey, fallback));
    // `fallback` is intentionally not a dependency: it is a default, not a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const set = useCallback(
    (next: number) => {
      const value = clamp(next);
      setWidth(value);
      writeStored(storageKey, value);
    },
    [storageKey]
  );

  return [width, set];
}

/** Card-shaped glyph so the two ends of the track read as "smaller / bigger". */
function CardGlyph({ px, dim }: { px: number; dim?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block shrink-0 rounded-[2px]', dim ? 'bg-foreground/25' : 'bg-foreground/45')}
      style={{ width: px, height: Math.round(px * (680 / 488)) }}
    />
  );
}

export interface CardSizeSliderProps {
  /** Surface name — the localStorage key suffix, e.g. `'search'`, `'collection'`. */
  storageKey: string;
  value: number;
  onValueChange: (width: number) => void;
  min?: number;
  max?: number;
  /** Hide the px readout when space is tight. */
  showValue?: boolean;
  className?: string;
}

export function CardSizeSlider({
  storageKey,
  value,
  onValueChange,
  min = CARD_WIDTH_MIN,
  max = CARD_WIDTH_MAX,
  showValue = true,
  className,
}: CardSizeSliderProps) {
  const handle = useCallback(
    (values: number[]) => {
      const next = clamp(values[0] ?? value);
      onValueChange(next);
      // Same value `useCardSize` writes — persisting here too means the control
      // remembers itself even when a caller holds the value in its own state.
      writeStored(storageKey, next);
    },
    [onValueChange, storageKey, value]
  );

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <CardGlyph px={7} dim />
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={CARD_WIDTH_STEP}
        onValueChange={handle}
        aria-label="Card size"
        className={cn('w-28 sm:w-40', BORDERLESS_SLIDER)}
      />
      <CardGlyph px={11} />
      {showValue && (
        <span className="w-10 shrink-0 text-right text-[0.7rem] tabular-nums text-muted-foreground">
          {value}px
        </span>
      )}
    </div>
  );
}

export default CardSizeSlider;
