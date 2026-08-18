import { useEffect, useMemo, useRef, useState } from 'react';
import { CardImage, CardImageSkeleton, CardGrid } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { Progress } from '@/components/ui/progress';
import {
  CATEGORY_CONFIG,
  CATEGORY_ORDER,
  categorizeCard,
  type CardCategory,
} from '@/components/deck-builder/deck-categories';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The build, as something worth watching — without watching ninety-nine cards.
 *
 * Two versions ago this was a centred spinner, a nine-row checklist and a
 * progress bar in a `max-w-2xl` column: a loading state that said nothing about
 * the deck being built. The fix showed the whole returned list arriving at full
 * art, which said far too much — four screens of grid, ninety-nine eager
 * images, and a pane that scrolled itself away from you. Owner: *"doesn't need
 * to show so many cards."*
 *
 * So this shows the cards *as they land* — the last dozen, one row, in place —
 * beside a live count of what has gone into each category. Same real data, same
 * reveal, a twelfth of the images. Nothing is invented to fill the wait: until
 * the builder responds there is nothing to show but empty slots, and that is
 * exactly what it shows.
 */

export interface BuildPhase {
  id: string;
  label: string;
  description: string;
}

export interface BuildStageProps {
  commander: any;
  phases: BuildPhase[];
  phaseIndex: number;
  /** The real deck as returned by the builder. Empty until it responds. */
  cards: any[];
  targetPower: number;
  budget: number;
  /** Fired once every returned card has been shown. */
  onRevealComplete?: () => void;
}

/** Slots drawn while the builder is still thinking. */
const PLACEHOLDER_SLOTS = 6;
const CARD_WIDTH = 132;
/** How many of the most recently placed cards stay on screen. */
const RECENT_WINDOW = 12;
/** Total reveal budget, spread across however many cards came back. */
const REVEAL_MS = 3200;

export function BuildStage({
  commander,
  phases,
  phaseIndex,
  cards,
  targetPower,
  budget,
  onRevealComplete,
}: BuildStageProps) {
  /** Reveal order: category by category, cheapest first inside each. */
  const ordered = useMemo(() => {
    const rank = new Map<CardCategory, number>(CATEGORY_ORDER.map((c, i) => [c, i]));
    return [...cards].sort((a, b) => {
      const ca = rank.get(categorizeCard(a)) ?? 99;
      const cb = rank.get(categorizeCard(b)) ?? 99;
      if (ca !== cb) return ca - cb;
      return (a.cmc || 0) - (b.cmc || 0) || String(a.name).localeCompare(String(b.name));
    });
  }, [cards]);

  const [revealed, setRevealed] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (ordered.length === 0) return;
    const step = Math.max(16, Math.round(REVEAL_MS / ordered.length));
    const timer = window.setInterval(() => {
      setRevealed(n => {
        if (n >= ordered.length) {
          window.clearInterval(timer);
          return n;
        }
        return n + 1;
      });
    }, step);
    return () => window.clearInterval(timer);
  }, [ordered.length]);

  useEffect(() => {
    if (!doneRef.current && ordered.length > 0 && revealed >= ordered.length) {
      doneRef.current = true;
      onRevealComplete?.();
    }
  }, [revealed, ordered.length, onRevealComplete]);

  const shown = ordered.slice(0, revealed);
  /**
   * The cards on screen: the tail of what has been placed, newest last.
   *
   * `windowStart` is kept because the React key has to be the card's position
   * in the *deck*, not in this window. Keyed on the window index, every card
   * changed key on every tick as the window slid, so each one remounted, its
   * `<img>` reloaded, and the fade-in restarted — twelve cards that never
   * finished appearing.
   */
  const windowStart = Math.max(0, shown.length - RECENT_WINDOW);
  const recent = shown.slice(windowStart);

  /** Copies placed per category, and the total each category will end at. */
  const tally = useMemo(() => {
    const placed = new Map<CardCategory, number>();
    const target = new Map<CardCategory, number>();
    for (const card of ordered) {
      const cat = categorizeCard(card);
      target.set(cat, (target.get(cat) ?? 0) + (card.quantity || 1));
    }
    for (const card of shown) {
      const cat = categorizeCard(card);
      placed.set(cat, (placed.get(cat) ?? 0) + (card.quantity || 1));
    }
    return CATEGORY_ORDER.filter(c => (target.get(c) ?? 0) > 0).map(c => ({
      category: c,
      placed: placed.get(c) ?? 0,
      total: target.get(c) ?? 0,
    }));
  }, [ordered, shown]);

  const copiesShown = shown.reduce((sum, c) => sum + (c.quantity || 1), 0);
  const copiesTotal = ordered.reduce((sum, c) => sum + (c.quantity || 1), 0);
  const valueShown = shown.reduce(
    (sum, c) => sum + parseFloat(c.prices?.usd || '0') * (c.quantity || 1),
    0
  );

  const target = copiesTotal || 99;
  const placedPct = Math.min(100, (copiesShown / target) * 100);
  const newest = recent.length > 0 ? recent[recent.length - 1] : null;

  return (
    <div className="space-y-4">
      {/* Header — the commander, the constraints, and the live count. */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-card p-4 shadow-lg shadow-black/20">
        <CardImage card={commander} size="sm" eager hideFlip />

        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
            Building
          </p>
          <h2 className="truncate text-lg font-semibold">{commander?.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <ColorIdentity colors={commander?.color_identity} size="xs" />
            <span>Target {targetPower}/10</span>
            <span aria-hidden>·</span>
            <span>Under ${budget.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
              Placed
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {copiesShown}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                / {copiesTotal || 99}
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
              Value so far
            </p>
            <p className="text-2xl font-bold tabular-nums">${valueShown.toFixed(0)}</p>
          </div>
        </div>

        <div className="w-full">
          <Progress value={placedPct} className="h-1.5" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        {/* Phase rail — the real state machine, not a decorative checklist. */}
        <aside className="rounded-xl bg-card p-3 shadow-lg shadow-black/20 lg:sticky lg:top-4 lg:self-start">
          <ol className="space-y-0.5">
            {phases.map((phase, i) => {
              const done = i < phaseIndex;
              const current = i === phaseIndex;
              return (
                <li
                  key={phase.id}
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                    current && 'bg-accent',
                    !current && !done && 'opacity-45'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.65rem] font-semibold tabular-nums',
                      done || current
                        ? 'bg-foreground text-background'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {done ? (
                      <Check className="h-3 w-3" />
                    ) : current ? (
                      <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium leading-tight">{phase.label}</span>
                    <span className="block text-[0.7rem] leading-tight text-muted-foreground">
                      {phase.description}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* The cards landing, and what has gone in so far. Fixed height: this
            pane no longer grows to four screens and scrolls away from you. */}
        <div className="min-w-0 space-y-4">
          <section className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {shown.length === 0 ? 'Reading the card pool' : 'Just placed'}
              </h3>
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                {newest
                  ? newest.name
                  : `Cards appear here as they are chosen for ${commander?.name ?? 'this deck'}.`}
              </p>
            </div>

            {shown.length === 0 ? (
              <CardGrid width={CARD_WIDTH}>
                {Array.from({ length: PLACEHOLDER_SLOTS }, (_, i) => (
                  <div
                    key={i}
                    className="animate-pulse motion-reduce:animate-none"
                    style={{ animationDelay: `${(i % 6) * 90}ms` }}
                  >
                    <CardImageSkeleton width={CARD_WIDTH} fill />
                  </div>
                ))}
              </CardGrid>
            ) : (
              <CardGrid width={CARD_WIDTH}>
                {recent.map((card, i) => (
                  <div
                    key={`${windowStart + i}-${card.id ?? card.name}`}
                    className="relative animate-in fade-in-0 zoom-in-95 duration-300 motion-reduce:animate-none"
                  >
                    {/* Eager: these are being watched land, one every few
                        frames, so a lazy loader would show empty frames. */}
                    <CardImage card={card} width={CARD_WIDTH} fill hideFlip eager>
                      {(card.quantity || 1) > 1 && (
                        /* Sits on card art, so light-on-dark is correct. */
                        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums text-white">
                          ×{card.quantity}
                        </span>
                      )}
                    </CardImage>
                  </div>
                ))}
              </CardGrid>
            )}
          </section>

          {/* Where the hundred cards are going. The counts are the whole deck;
              only the last dozen faces are drawn. */}
          {tally.length > 0 && (
            <section className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
              <h3 className="mb-3 text-sm font-semibold">Deck so far</h3>
              <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {tally.map(({ category, placed, total }) => {
                  const style = CATEGORY_CONFIG[category];
                  const Icon = style.icon;
                  return (
                    <li key={category} className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-4 w-4 shrink-0', style.color)} />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {style.label}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {placed}
                          <span className="opacity-60"> / {total}</span>
                        </span>
                      </div>
                      <Progress
                        value={total > 0 ? (placed / total) * 100 : 0}
                        className="mt-1.5 h-1"
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default BuildStage;
