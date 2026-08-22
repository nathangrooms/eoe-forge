
import { Link } from 'react-router-dom';
import { Camera, Check, ScanLine, Zap, ArrowRight, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManaCost } from '@/components/ui/mana-cost';
import { CardImage } from '@/components/cards/CardImage';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { scannerCard } from '@/lib/homepage/snapshot';
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

/*
 * Which printing of Lightning Bolt this section shows is pinned to Ravnica:
 * Clue Edition, Christopher Moeller's original illustration. Pinned rather than
 * picked by price: sorting Lightning Bolt's printings by USD puts the Marvel
 * crossover on top, and opening the scanner with a picture of Thor is the same
 * mistake as letting Secret Lair oddities lead the card wall. Only the CHOICE
 * of printing is fixed; the set, cost, type line and price are all read off
 * that row, and if it ever leaves the table the fallback is the cheapest
 * printing that has art.
 *
 * The id itself lives with the query, as SCAN_PINNED_PRINTING in
 * scripts/homepage-snapshot.mjs.
 */

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
 * one element.
 *
 * IT ANIMATED `top`, WHICH IS THE ONE THING THIS PROJECT'S DESIGN LAW FORBIDS:
 * animate transform and opacity only. `top` is not a composited property, so
 * every frame of a 3.2 second loop that never ends cost a layout and a paint on
 * the main thread, on a marketing page, on a phone. It was also the only entry
 * the layout-shift observer still recorded anywhere on the homepage.
 *
 * `translateY` in per cent is a percentage of the ELEMENT, not of its parent,
 * so a 2 px bar could only ever move 2 px. The fix is to make the element the
 * full height of the card and paint the bar along its own bottom edge with a
 * gradient. Then 100% of the element IS the height of the card, the travel runs
 * from `-100%` (bar level with the top edge) to `0%` (bar level with the
 * bottom), and it is a transform. The part of the element above the card is
 * transparent, so nothing shows outside the frame.
 */
const SWEEP_CSS = `
@keyframes dmScanSweep {
  0%   { transform: translateY(-100%); opacity: 0 }
  12%  { opacity: 0.8 }
  88%  { opacity: 0.8 }
  100% { transform: translateY(0%);    opacity: 0 }
}
.dm-scan-sweep { animation: dmScanSweep 3.2s ease-in-out infinite; will-change: transform }
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
    body: 'It only takes the photo once the picture has held still and sharp.',
  },
  {
    title: 'It forgives a bad read',
    body: `A near miss still finds the right card. “${MISREAD}” works fine.`,
  },
  {
    title: 'It files the card',
    body: 'Straight into your collection, a deck or a box. If you already own one, it just adds another.',
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
  /* One card, the one held up to the camera. The printing is pinned in
     scripts/homepage-snapshot.mjs, which also keeps the fall back to the
     cheapest printing with art if the pinned one ever leaves the table. */
  const card = scannerCard() as ScanCard | null;

  const usd = card?.prices?.usd ? Number(card.prices.usd) : null;
  const art = card?.image_uris?.art_crop ?? null;

  return (
    <Section tint>
      <style>{SWEEP_CSS}</style>

      {/* items-start, and the match panel moved out of the phone (see below).
          With items-center, a 467px text column sat inside a 944px row, so 240px
          of black was parked above the heading and another 240px below the
          button. */}
      <div className="grid items-start gap-9 sm:gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:gap-20">
        {/* ------------------------------------------------------------ copy */}
        <SectionHeading
          align="left"
          eyebrow="Scan a card"
          title="Point your phone at a card"
          /* The old lead said the title again ("Hold a card up to the camera and
             it lands in your collection") and then a triple of things you do not
             have to do. This says the one thing the title does not: how it knows
             which card it is looking at, which is what the three steps go on to
             detail. */
          lead="It reads the name off the card and files it in your collection."
        >
          <ol className="mt-8 space-y-4 sm:mt-10 sm:space-y-5">
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

          {/* The result of step 3, sitting under step 3.

              This panel used to hang off the bottom of the phone mockup in the
              right-hand column, which made that column 944px against 467px of
              text and left a column of air beside it. It belongs here anyway:
              the numbered steps end with "it files the card", and this is the
              card being filed. Both columns now finish within ~60px of each
              other and nothing was removed from the page. */}
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

                {/* The line that used to close this panel — "Matched. Ready to
                    file into a collection, a deck or a box." — named the same
                    three destinations as step 3, two hundred pixels above it.
                    The tick stays, because what it marks is the match, and the
                    match is the thing computed on screen. */}
                <p className="mt-3.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Check className="h-3 w-3 shrink-0" />
                  Matched
                </p>
              </div>

          <Button asChild size="lg" className="mt-8 sm:mt-10">
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
            {/* Square on a phone, 4:5 from `sm` up. The frame is a
                viewfinder, not a card: the card inside is 68% of the padded box
                and sits whole in either shape, and a square one is 90px shorter
                on a screen where this object is already the tallest thing in the
                section. */}
            <div className="relative aspect-square overflow-hidden rounded-[1.35rem] bg-black sm:aspect-[4/5]">
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
                  {/* Full height, with the 2px bar painted along its own bottom
                      edge by a gradient, so the travel is a percentage of THIS
                      element rather than of the card. See SWEEP_CSS. */}
                  <span
                    aria-hidden
                    className="dm-scan-sweep pointer-events-none absolute inset-x-0 top-0 h-full motion-reduce:hidden"
                    style={{
                      backgroundImage:
                        'linear-gradient(to bottom, transparent calc(100% - 2px), hsl(0 0% 100% / 0.7) calc(100% - 2px))',
                    }}
                  />
                </div>
              </div>

              {/* The line that sat here, "Captures on its own once the frame is
                  sharp", was step 1 written out a second time, and the
                  "Auto-capture" chip at the top of this same viewfinder says it
                  a third. */}
            </div>

            {/* Capture controls, a drawn shutter, so hidden from the a11y tree.
                Hidden from a phone too: it is 120px of furniture around a button
                that does not do anything, under a viewfinder that has already
                said "camera" without help. */}
            <div aria-hidden className="flex items-center justify-center gap-10 py-6 max-sm:hidden">
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

          </div>
        </div>
      </div>
    </Section>
  );
}

export default HomeScanner;
