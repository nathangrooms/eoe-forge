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
 * The build, as something worth watching.
 *
 * What was here before: a centred spinner, a nine-row checklist and a progress
 * bar, all inside a `max-w-2xl` column on a 1440px screen — a loading state that
 * told you nothing about the deck being built. This shows the actual deck
 * arriving: every card the builder picked, at full art, dropping into its
 * category as the remaining checks run.
 *
 * The cards are the real returned list — nothing is invented to fill the wait.
 * Until the builder responds there is nothing to show but empty slots, and that
 * is exactly what it shows.
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
const PLACEHOLDER_SLOTS = 24;
const CARD_WIDTH = 132;
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
  const scrollRef = useRef<HTMLDivElement | null>(null);

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

  /**
   * The stage scrolls itself, not the page.
   *
   * Ninety-nine cards is four screens of grid. Letting the document grow that
   * far means the counter, the phase rail and the newest cards are all off
   * screen within a second of the build starting — you would be watching an
   * empty header. The grid lives in its own pane that follows the reveal
   * instead, so the cards land where you are already looking.
   */
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || revealed === 0) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, [revealed]);

  const shown = ordered.slice(0, revealed);

  const groups = useMemo(() => {
    const map = new Map<CardCategory, any[]>();
    for (const card of shown) {
      const cat = categorizeCard(card);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(card);
    }
    return CATEGORY_ORDER.filter(c => map.has(c)).map(c => ({ category: c, cards: map.get(c)! }));
  }, [shown]);

  const copiesShown = shown.reduce((sum, c) => sum + (c.quantity || 1), 0);
  const copiesTotal = ordered.reduce((sum, c) => sum + (c.quantity || 1), 0);
  const valueShown = shown.reduce(
    (sum, c) => sum + parseFloat(c.prices?.usd || '0') * (c.quantity || 1),
    0
  );

  const target = copiesTotal || 99;
  const placedPct = Math.min(100, (copiesShown / target) * 100);

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
            <p className="text-2xl font-bold tabular-nums">
              ${valueShown.toFixed(0)}
            </p>
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

        {/* The deck, appearing. */}
        <div
          ref={scrollRef}
          className="space-y-6 overflow-y-auto pr-1 lg:max-h-[calc(100vh-17rem)]"
        >
          {groups.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Reading the card pool for {commander?.name}. Cards appear here as they
                are chosen.
              </p>
              <CardGrid width={CARD_WIDTH}>
                {Array.from({ length: PLACEHOLDER_SLOTS }, (_, i) => (
                  <div
                    key={i}
                    className="animate-pulse motion-reduce:animate-none"
                    style={{ animationDelay: `${(i % 8) * 90}ms` }}
                  >
                    <CardImageSkeleton width={CARD_WIDTH} fill />
                  </div>
                ))}
              </CardGrid>
            </div>
          ) : (
            groups.map(group => {
              const style = CATEGORY_CONFIG[group.category];
              const Icon = style.icon;
              const copies = group.cards.reduce((s, c) => s + (c.quantity || 1), 0);
              return (
                <section key={group.category}>
                  <h3 className="mb-2.5 flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', style.color)} />
                    <span className="text-sm font-semibold">{style.label}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                      {copies}
                    </span>
                  </h3>
                  <CardGrid width={CARD_WIDTH}>
                    {group.cards.map((card, i) => (
                      <div
                        key={`${card.id ?? card.name}-${i}`}
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
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default BuildStage;
