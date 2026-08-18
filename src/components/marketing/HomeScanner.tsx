import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Check, ScanLine, Zap, ArrowRight, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManaCost } from '@/components/ui/mana-cost';
import { CardImage } from '@/components/cards/CardImage';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/**
 * Photo scan.
 *
 * Owner: *"photo scan — you could style a camera with a card in the middle."*
 * So the section IS a camera: body, viewfinder, four focus brackets around a
 * whole 5:7 card, a sweep, a shutter, and the match resolving underneath.
 * Every part is CSS — there is no screenshot of the scanner anywhere here.
 *
 * Nothing on this panel is invented:
 *   - the card, its printing, its mana cost and its price are read live from
 *     `cards` (cheapest printing of Lightning Bolt that has art);
 *   - the 93% is *computed* on screen by the same Levenshtein similarity the
 *     matcher uses, run over the misread and the real name;
 *   - the three steps describe what `src/features/scan/` actually does — a
 *     sharpness/steadiness gate before capture, fuzzy name matching against the
 *     catalogue with a Scryfall fallback, then filing into collection, deck or
 *     a storage container.
 */

/** The misread this section demonstrates — one dropped character. */
const MISREAD = 'Lightnng Bolt';
const TARGET = 'Lightning Bolt';

/**
 * Ravnica: Clue Edition — Christopher Moeller's original illustration.
 *
 * Pinned rather than picked by price. Sorting Lightning Bolt's printings by USD
 * puts the Marvel crossover on top, and opening the scanner with a picture of
 * Thor is the same mistake as letting Secret Lair oddities lead the card wall.
 * Only the *choice of printing* is fixed here — the set, cost, type line and
 * price all come off this row live, and if it ever disappears the query falls
 * back to the cheapest printing that has art.
 */
const PINNED_PRINTING = '77c6fa74-5543-42ac-9ead-0e890b188e99';

/**
 * Levenshtein distance, then similarity as a fraction of the longer string.
 *
 * Deliberately the same formula as `calculateSimilarity` in
 * `src/features/scan/api.ts`, reimplemented rather than imported because that
 * module pulls in the whole scan feature. Recomputing it means the percentage
 * printed below is derived from the two strings on screen, not typed in.
 */
function levenshtein(a: string, b: string): number {
  const rows = Array.from({ length: b.length + 1 }, (_, j) => {
    const row = new Array<number>(a.length + 1).fill(0);
    row[0] = j;
    return row;
  });
  for (let i = 0; i <= a.length; i++) rows[0][i] = i;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[j][i] = Math.min(rows[j][i - 1] + 1, rows[j - 1][i] + 1, rows[j - 1][i - 1] + cost);
    }
  }
  return rows[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const longer = a.length >= b.length ? a : b;
  if (longer.length === 0) return 1;
  return (longer.length - levenshtein(a, b)) / longer.length;
}

const MATCH_PCT = Math.round(similarity(MISREAD, TARGET) * 100);

/**
 * The sweep. A 2 px bar travelling the height of the framed card.
 *
 * Scoped here rather than in `tailwind.config.ts` because it exists for exactly
 * one element. `top` is animated as a percentage so the bar tracks the card's
 * height at any breakpoint.
 */
const SWEEP_CSS = `
@keyframes dmScanSweep {
  0%   { top: 0%;   opacity: 0 }
  12%  { opacity: 0.8 }
  88%  { opacity: 0.8 }
  100% { top: 100%; opacity: 0 }
}
.dm-scan-sweep { animation: dmScanSweep 3.2s ease-in-out infinite }
`;

/** Four corner brackets, drawn as eight filled bars — no hairlines. */
function FocusBrackets() {
  const bar = 'absolute rounded-full bg-white/85';
  return (
    <div aria-hidden className="pointer-events-none absolute -inset-3 sm:-inset-4">
      <span className={cn(bar, 'left-0 top-0 h-[3px] w-8 sm:w-11')} />
      <span className={cn(bar, 'left-0 top-0 h-8 w-[3px] sm:h-11')} />
      <span className={cn(bar, 'right-0 top-0 h-[3px] w-8 sm:w-11')} />
      <span className={cn(bar, 'right-0 top-0 h-8 w-[3px] sm:h-11')} />
      <span className={cn(bar, 'bottom-0 left-0 h-[3px] w-8 sm:w-11')} />
      <span className={cn(bar, 'bottom-0 left-0 h-8 w-[3px] sm:h-11')} />
      <span className={cn(bar, 'bottom-0 right-0 h-[3px] w-8 sm:w-11')} />
      <span className={cn(bar, 'bottom-0 right-0 h-8 w-[3px] sm:h-11')} />
    </div>
  );
}

const STEPS = [
  {
    title: 'It waits for a clean frame',
    body: 'Auto-capture measures every frame and only fires once the picture has held sharp and still — you are not fighting the shutter.',
  },
  {
    title: 'It forgives a bad read',
    body: `The name is scored against the catalogue by edit distance — “${MISREAD}” still resolves.`,
  },
  {
    title: 'It files the card',
    body: 'Straight into your collection, a deck, or a storage container — quantity bumped if you already own one.',
  },
];

interface ScanCard {
  id: string;
  name: string;
  mana_cost: string | null;
  type_line: string | null;
  set_code: string | null;
  image_uris: Record<string, string> | null;
  prices: Record<string, string> | null;
}

export function HomeScanner() {
  const [card, setCard] = useState<ScanCard | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('cards')
        .select('id,name,mana_cost,type_line,set_code,image_uris,prices')
        .eq('name', TARGET)
        .not('image_uris', 'is', null)
        .limit(6);

      if (cancelled) return;

      const withArt = ((data ?? []) as any[]).filter(
        c => c?.image_uris?.large || c?.image_uris?.normal
      );
      const pinned = withArt.find(c => c.id === PINNED_PRINTING);
      const cheapest = [...withArt].sort(
        (a, b) => Number(a.prices?.usd ?? Infinity) - Number(b.prices?.usd ?? Infinity)
      )[0];

      setCard(((pinned ?? cheapest) as ScanCard) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const usd = card?.prices?.usd ? Number(card.prices.usd) : null;
  const art = card?.image_uris?.art_crop ?? null;

  return (
    <Section>
      <style>{SWEEP_CSS}</style>

      <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:gap-20">
        {/* ------------------------------------------------------------ copy */}
        <SectionHeading
          align="left"
          eyebrow="Photo scan"
          title="Point your phone at a card"
          lead="Hold a card in the frame and it goes into your collection. No typing, no dropdown, no set picker."
        >
          <ol className="mt-10 space-y-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-semibold tabular-nums">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <Button asChild size="lg" className="mt-10">
            <Link to="/scan">
              Try the scanner
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </SectionHeading>

        {/* ---------------------------------------------------------- camera */}
        <div className="mx-auto w-full max-w-[480px]">
          <div className="rounded-[2rem] bg-card p-3 shadow-2xl shadow-black/50">
            {/* status strip */}
            <div className="flex items-center gap-2.5 px-3 pb-3 pt-2">
              <Camera className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">Card scanner</span>
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
                Auto-capture
              </span>
            </div>

            {/* viewfinder */}
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.35rem] bg-black">
              {/* The card lights its own frame — atmosphere from art, not a gradient. */}
              {art && (
                <img
                  src={art}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-2xl"
                />
              )}
              <div className="absolute inset-0 bg-black/55" />

              <div className="absolute inset-x-0 top-5 flex justify-center">
                <span className="rounded-full bg-black/70 px-3 py-1 text-[11px] font-medium text-white/85">
                  Card detected
                </span>
              </div>

              {/* the whole card, framed */}
              <div className="absolute inset-0 flex items-center justify-center px-10">
                <div className="relative w-[68%]">
                  {card ? (
                    <CardImage card={card} fill />
                  ) : (
                    <div
                      className="w-full rounded-[4.75%/3.4%] bg-white/[0.06]"
                      style={{ aspectRatio: '488 / 680' }}
                    />
                  )}
                  <FocusBrackets />
                  <span
                    aria-hidden
                    className="dm-scan-sweep pointer-events-none absolute inset-x-0 h-[2px] bg-white/70 motion-reduce:hidden"
                  />
                </div>
              </div>

              <p className="absolute inset-x-0 bottom-5 text-center text-[11px] text-white/50">
                Captures on its own once the frame is sharp
              </p>
            </div>

            {/* capture controls — a drawn shutter, so hidden from the a11y tree */}
            <div aria-hidden className="flex items-center justify-center gap-10 py-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                <Pause className="h-4 w-4" />
              </span>
              <span className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-foreground/15">
                <span className="h-[3.4rem] w-[3.4rem] rounded-full bg-foreground" />
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                <Zap className="h-4 w-4" />
              </span>
            </div>

            {/* the match */}
            <div className="rounded-2xl bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <ScanLine className="h-3.5 w-3.5" />
                Read from frame
              </div>
              <p className="mt-1.5 font-mono text-sm text-muted-foreground line-through decoration-muted-foreground/60">
                {MISREAD}
              </p>

              <div className="mt-4 flex items-center gap-3.5">
                {card ? (
                  <CardImage card={card} width={46} />
                ) : (
                  <div
                    className="w-[46px] shrink-0 rounded-[4.75%/3.4%] bg-foreground/10"
                    style={{ aspectRatio: '488 / 680' }}
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">{card?.name ?? TARGET}</p>
                    <ManaCost cost={card?.mana_cost ?? '{R}'} size="xs" />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {card?.type_line ?? 'Instant'}
                    {card?.set_code ? ` · ${card.set_code.toUpperCase()}` : ''} · {MATCH_PCT}% name
                    match
                  </p>
                </div>

                {usd !== null && (
                  <span className="shrink-0 text-sm tabular-nums">${usd.toFixed(2)}</span>
                )}
              </div>

              <p className="mt-3.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Check className="h-3 w-3 shrink-0" />
                Added to your collection — quantity bumped if you already own one
              </p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

export default HomeScanner;
