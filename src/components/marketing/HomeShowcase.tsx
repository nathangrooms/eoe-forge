import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight } from 'lucide-react';
import { ManaCost } from '@/components/ui/mana-cost';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { supabase } from '@/integrations/supabase/client';
import { Section, SectionInner, SectionHeading } from '@/components/marketing/Section';
import { cn } from '@/lib/utils';

/**
 * Product showcase — the proof strip.
 *
 * Everything here renders REAL rows from the synced card table: real names,
 * real mana costs, real art, real prices. Nothing is mocked, so the homepage
 * cannot drift out of sync with the product, and there is no temptation to
 * invent numbers to fill a layout.
 *
 * Two rules this section exists to obey:
 *
 * 1. A card is drawn WHOLE, at 5:7, through `CardImage`. Never an `art_crop`
 *    stretched into a banner — a crop is a piece of art, not a card.
 * 2. Secret Lair drops are excluded. Sorting the catalogue by USD floats
 *    crossover novelties (My Little Pony ponies, at the time of writing) to the
 *    top, and the first thing a player sees on a Magic homepage has to be Magic.
 */

/** Secret Lair and promo sets — real Magic cards, but not the face of the game. */
const NOVELTY_SETS = new Set(['sld', 'slu', 'slp', 'slc', 'slx', 'sch', 'pmei']);

interface ShowcaseCard {
  id: string;
  name: string;
  mana_cost: string | null;
  cmc: number;
  type_line: string;
  rarity: string;
  set_code: string;
  layout: string | null;
  faces: unknown;
  image_uris: Record<string, string> | null;
  prices: Record<string, string> | null;
}

/* ------------------------------------------------------------- card marquee */

function CardMarquee({ cards }: { cards: ShowcaseCard[] }) {
  if (cards.length === 0) return null;
  // Duplicated once so the CSS translate loop is seamless. The duplicates share
  // a src with the originals, so they cost no extra requests.
  const row = [...cards, ...cards];

  return (
    <div
      className="relative overflow-hidden py-2"
      style={{
        maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
      }}
    >
      <div className="flex w-max gap-4 animate-marquee motion-reduce:animate-none">
        {row.map((c, i) => (
          <div key={`${c.id}-${i}`} className="w-40 shrink-0 sm:w-52 lg:w-60">
            {/* size="md" asks Scryfall for `large` without the blur-up second
                request that `lg`/`xl` add — twelve cards, twelve requests. */}
            <CardImage card={c} size="md" fill hideFlip />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- mana curve */

function ManaCurve({ cards }: { cards: ShowcaseCard[] }) {
  const buckets = [0, 1, 2, 3, 4, 5, 6];
  const counts = buckets.map(
    b => cards.filter(c => (b === 6 ? c.cmc >= 6 : Math.floor(c.cmc) === b)).length
  );
  const max = Math.max(1, ...counts);

  return (
    <div className="flex h-full flex-col">
      {/* Each column is h-full with justify-end, so the bar's percentage height
          resolves against a definite box. Without that the columns size to their
          content and every bar collapses to zero. `flex-1` lets the chart grow to
          match the taller panel beside it rather than leaving dead space. */}
      <div className="flex min-h-[10rem] flex-1 items-stretch gap-2">
        {counts.map((n, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-[11px] leading-none tabular-nums text-muted-foreground">
              {n || ''}
            </span>
            <div
              className="w-full rounded-t bg-foreground transition-all"
              style={{ height: `${(Math.max(n, 0) / max) * 100}%`, minHeight: n > 0 ? 6 : 2 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {buckets.map(b => (
          <span
            key={b}
            className="flex-1 text-center text-[11px] tabular-nums text-muted-foreground"
          >
            {b === 6 ? '6+' : b}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- row */

function CatalogueRow({ card }: { card: ShowcaseCard }) {
  const usd = card.prices?.usd;
  return (
    <div className="flex items-center gap-4 rounded-xl px-3 py-2 odd:bg-foreground/[0.04]">
      {/* A whole card, never a crop — 48px is small, but it is still a card. */}
      <div className="w-12 shrink-0">
        <CardImage card={card} size="xs" fill hideFlip />
      </div>
      <span className="min-w-0 flex-[1.2] truncate text-sm font-medium">{card.name}</span>
      <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">
        {card.type_line}
      </span>
      <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground md:block">
        {card.set_code}
      </span>
      <ManaCost cost={card.mana_cost} size="sm" className="shrink-0" />
      <span className="w-16 shrink-0 text-right text-sm tabular-nums">
        {usd ? `$${Number(usd).toFixed(2)}` : '—'}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------- panels */

function Panel({
  title,
  body,
  className,
  children,
}: {
  title: string;
  body: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl bg-card p-6 shadow-lg shadow-black/20',
        className
      )}
    >
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ section */

export function HomeShowcase() {
  const [cards, setCards] = useState<ShowcaseCard[] | null>(null);

  useEffect(() => {
    (async () => {
      /* Mythics and rares with real market value — the cards players recognise
         on sight, which is what makes the row read as Magic. */
      const { data } = await supabase
        .from('cards')
        .select('id,name,mana_cost,cmc,type_line,rarity,set_code,layout,faces,image_uris,prices')
        .in('rarity', ['mythic', 'rare'])
        .not('image_uris', 'is', null)
        .not('prices', 'is', null)
        .limit(400);

      const withArt = ((data ?? []) as unknown as ShowcaseCard[])
        .filter(c => Boolean(c.image_uris?.large || c.image_uris?.normal))
        .filter(c => !NOVELTY_SETS.has(c.set_code))
        .filter(c => Number(c.prices?.usd) > 0)
        .sort((a, b) => Number(b.prices?.usd ?? 0) - Number(a.prices?.usd ?? 0));

      setCards(withArt.slice(0, 12));
    })();
  }, []);

  const loading = cards === null;
  const list = cards ?? [];

  return (
    <Section bleed>
      <SectionInner>
        <SectionHeading
          title="Real cards. Real costs. Real prices."
          lead="Everything below is live data from the card catalogue — the same rows the builder, the collection and the marketplace read."
        />
      </SectionInner>

      {/* full-bleed marquee of WHOLE cards */}
      <div className="mt-14">
        {loading ? (
          <SectionInner containerClassName="flex gap-4 overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="w-40 shrink-0 sm:w-52 lg:w-60">
                <CardImageSkeleton size="md" fill />
              </div>
            ))}
          </SectionInner>
        ) : (
          <CardMarquee cards={list} />
        )}
      </div>

      <SectionInner className="mt-16">
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            className="lg:col-span-2"
            title="Every field, straight from the row"
            body="Name, type line, printing, mana cost and market price — the same cards as above, nothing retyped. Costs render as pips, never as raw braces."
          >
            <div className="rounded-xl bg-muted/30 p-1.5">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-3 py-2">
                      <Skeleton className="h-14 w-10 shrink-0 rounded" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))
                : list.slice(0, 6).map(c => <CatalogueRow key={c.id} card={c} />)}
            </div>
          </Panel>

          <Panel
            title="See the curve"
            body="Computed from the real converted mana costs of the cards above — the same calculation the builder runs on your list."
          >
            {loading ? (
              <Skeleton className="min-h-[10rem] w-full flex-1" />
            ) : (
              <ManaCurve cards={list} />
            )}
          </Panel>
        </div>

        <div className="mt-10 text-center">
          <Button asChild size="lg">
            <Link to="/register">
              Start building
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </SectionInner>
    </Section>
  );
}

export default HomeShowcase;
