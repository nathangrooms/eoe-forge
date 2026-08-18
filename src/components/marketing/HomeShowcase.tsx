import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Boxes, Search, TrendingUp } from 'lucide-react';
import { ManaCost, ColorIdentity } from '@/components/ui/mana-cost';
import { supabase } from '@/integrations/supabase/client';
import { Section, SectionInner, SectionHeading } from '@/components/marketing/Section';
import { cn } from '@/lib/utils';

/**
 * Product showcase.
 *
 * Everything here renders REAL rows from the synced card table — real names,
 * real mana costs, real art, real prices. Nothing is mocked, so the homepage
 * cannot drift out of sync with the product, and there is no temptation to
 * invent numbers to fill a layout.
 */

interface ShowcaseCard {
  id: string;
  name: string;
  mana_cost: string | null;
  cmc: number;
  type_line: string;
  rarity: string;
  color_identity: string[] | null;
  image_uris: Record<string, string> | null;
  prices: Record<string, string> | null;
}

const cardImage = (c: ShowcaseCard) => c.image_uris?.normal ?? c.image_uris?.large ?? null;

/* ------------------------------------------------------------- card marquee */

function CardMarquee({ cards }: { cards: ShowcaseCard[] }) {
  if (cards.length === 0) return null;
  // Duplicated once so the CSS translate loop is seamless.
  const row = [...cards, ...cards];

  return (
    <div
      className="relative overflow-hidden py-2"
      style={{
        maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
      }}
    >
      <div className="flex w-max gap-3 animate-marquee motion-reduce:animate-none">
        {row.map((c, i) => (
          <figure
            key={`${c.id}-${i}`}
            className="group relative aspect-[5/7] w-40 shrink-0 overflow-hidden rounded-xl sm:w-52 lg:w-56"
          >
            {cardImage(c) ? (
              <img
                src={cardImage(c)!}
                alt={c.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-contain transition-transform duration-500 group-hover:-translate-y-1"
              />
            ) : (
              <div className="h-full w-full rounded-xl bg-muted" />
            )}
          </figure>
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
    <div>
      {/* Each column is h-full with justify-end, so the bar's percentage height
          resolves against a definite box. Without that the columns size to their
          content and every bar collapses to zero. */}
      <div className="flex h-32 items-stretch gap-1.5">
        {counts.map((n, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-[10px] leading-none tabular-nums text-muted-foreground">
              {n || ''}
            </span>
            <div
              className="w-full rounded-t bg-foreground transition-all"
              style={{ height: `${(Math.max(n, 0) / max) * 100}%`, minHeight: n > 0 ? 6 : 2 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {buckets.map(b => (
          <span key={b} className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground">
            {b === 6 ? '6+' : b}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- deck row */

function DeckRow({ card }: { card: ShowcaseCard }) {
  const usd = card.prices?.usd;
  return (
    <div className="flex items-center gap-3 px-3 py-2 odd:bg-foreground/[0.03]">
      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">1</span>
      <span className="min-w-0 flex-1 truncate text-sm">{card.name}</span>
      <ManaCost cost={card.mana_cost} size="xs" className="shrink-0" />
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {usd ? `$${Number(usd).toFixed(2)}` : '—'}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------- section */

function BentoTile({
  title, body, className, children, icon: Icon,
}: {
  title: string; body: string; className?: string;
  children?: React.ReactNode; icon: React.ElementType;
}) {
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-xl bg-card shadow-lg shadow-black/20', className)}>
      <div className="p-6 pb-4">
        <div className="mb-3 inline-flex rounded-md bg-muted/60 p-2">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
      {children && <div className="mt-auto px-6 pb-6">{children}</div>}
    </div>
  );
}

export function HomeShowcase() {
  const [cards, setCards] = useState<ShowcaseCard[] | null>(null);

  useEffect(() => {
    (async () => {
      /* Mythics and rares with real market value — these are the cards players
         recognise on sight, which is what makes the row read as Magic. */
      const { data } = await supabase
        .from('cards')
        .select('id,name,mana_cost,cmc,type_line,rarity,color_identity,image_uris,prices')
        .in('rarity', ['mythic', 'rare'])
        .not('image_uris', 'is', null)
        .not('prices', 'is', null)
        .limit(400);

      const withArt = ((data ?? []) as unknown as ShowcaseCard[])
        .filter(c => cardImage(c) && Number(c.prices?.usd) > 0)
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
          lead="Everything below is live data from the card catalogue — the same data the builder uses."
        />
      </SectionInner>

      {/* full-bleed marquee */}
      <div className="mt-12">
        {loading ? (
          <SectionInner containerClassName="flex gap-3 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[5/7] w-40 shrink-0 rounded-xl sm:w-52 lg:w-56" />
            ))}
          </SectionInner>
        ) : (
          <CardMarquee cards={list} />
        )}
      </div>

      {/* bento */}
      <SectionInner className="mt-16">
        <div className="grid gap-4 lg:grid-cols-3">
          <BentoTile
            icon={Search}
            title="Search the whole card pool"
            body="Every paper card, synced nightly from Scryfall. Costs render as pips, not as text."
            className="lg:col-span-2"
          >
            <div className="rounded-lg bg-muted/30">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="px-3 py-2 odd:bg-foreground/[0.03]">
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ))
                : list.slice(0, 5).map(c => <DeckRow key={c.id} card={c} />)}
            </div>
          </BentoTile>

          <BentoTile
            icon={TrendingUp}
            title="See the curve"
            body="Mana curve computed from the real converted mana costs of the cards above."
          >
            {loading ? <Skeleton className="h-28 w-full" /> : <ManaCurve cards={list} />}
          </BentoTile>

          <BentoTile
            icon={Boxes}
            title="Colour identity, done right"
            body="Read from the card's identity — the way Commander actually counts it."
            className="lg:col-span-3"
          >
            <div className="flex flex-wrap gap-2">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-32 rounded-full" />
                  ))
                : list.slice(0, 10).map(c => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1.5"
                    >
                      <ColorIdentity colors={c.color_identity} size="xs" />
                      <span className="max-w-[10rem] truncate text-xs">{c.name}</span>
                    </span>
                  ))}
            </div>
          </BentoTile>
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
