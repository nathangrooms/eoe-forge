import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ManaCost, ManaPip } from '@/components/ui/mana-cost';
import { selectCardsWhere } from '@/lib/supabase/jsonPath';
import { cn } from '@/lib/utils';

/**
 * Full-width CSS recreation of the deck builder, driven by real card rows.
 *
 * Deliberately borderless — depth comes from stacked surface tints and shadow,
 * not from hairlines. Nothing here is an image of the app; it is built from the
 * same tokens the real UI uses, so it cannot drift out of date visually.
 */

interface Card {
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

const CATEGORIES = [
  { label: 'Commander', test: (c: Card) => /Legendary Creature/i.test(c.type_line), one: true },
  { label: 'Creatures', test: (c: Card) => /Creature/i.test(c.type_line) },
  { label: 'Instants', test: (c: Card) => /Instant/i.test(c.type_line) },
  { label: 'Sorceries', test: (c: Card) => /Sorcery/i.test(c.type_line) },
  { label: 'Artifacts', test: (c: Card) => /Artifact/i.test(c.type_line) },
  { label: 'Enchantments', test: (c: Card) => /Enchantment/i.test(c.type_line) },
  { label: 'Lands', test: (c: Card) => /Land/i.test(c.type_line) },
];

export function HomeAppVisual() {
  const [cards, setCards] = useState<Card[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await selectCardsWhere(
        'id,name,mana_cost,cmc,type_line,rarity,color_identity,image_uris,prices'
      )
        .eq('legalities->>commander', 'legal')
        .in('rarity', ['mythic', 'rare'])
        .not('image_uris', 'is', null)
        .not('mana_cost', 'is', null)
        .limit(150);
      setCards(((data ?? []) as unknown as Card[]).filter(c => c.image_uris?.normal).slice(0, 60));
    })();
  }, []);

  const list = cards ?? [];

  /* First-match categorisation; Commander is a singleton slot. */
  const buckets = CATEGORIES.map(c => ({ ...c, cards: [] as Card[] }));
  for (const c of list) {
    const b = buckets.find(x => x.test(c) && !(x.one && x.cards.length >= 1));
    if (b) b.cards.push(c);
  }
  const placed = buckets.reduce((n, b) => n + b.cards.length, 0);
  const value = list.reduce((s, c) => s + Number(c.prices?.usd ?? 0), 0);

  const curve = [0, 1, 2, 3, 4, 5, 6].map(
    b => list.filter(c => (b === 6 ? Number(c.cmc) >= 6 : Math.floor(Number(c.cmc)) === b)).length
  );
  const curveMax = Math.max(1, ...curve);

  const grid = list.slice(0, 18);

  return (
    <section className="bg-card/40 py-24">
      <div className="px-4 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl text-balance">
            This is the builder
          </h2>
          <p className="mt-5 text-lg text-muted-foreground text-pretty">
            Categories fill themselves, the curve updates as you add, and the price of the
            list is always in front of you.
          </p>
        </div>

        {/* ---------- full-width app mockup ---------- */}
        <div className="mx-auto mt-14 max-w-[1600px] overflow-hidden rounded-2xl bg-background shadow-2xl shadow-black/40">
          {/* window chrome */}
          <div className="flex items-center gap-3 bg-muted/40 px-5 py-3">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-foreground/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-foreground/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-foreground/20" />
            </div>
            <span className="ml-2 text-sm font-medium">Atraxa Superfriends</span>
            <span className="rounded bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Commander
            </span>
            <div className="ml-auto flex items-center gap-4 text-sm tabular-nums text-muted-foreground">
              <span>{cards ? `${placed} cards` : '—'}</span>
              <span className="text-foreground">{cards ? `$${value.toFixed(2)}` : ''}</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-[220px_1fr_260px]">
            {/* ---- left: categories ---- */}
            <aside className="hidden bg-muted/20 p-5 lg:block">
              <p className="mb-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Categories
              </p>
              <ul className="space-y-1">
                {buckets.map((b, i) => (
                  <li
                    key={b.label}
                    className={cn(
                      'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
                      i === 1 ? 'bg-foreground/10 font-medium' : 'text-muted-foreground'
                    )}
                  >
                    <span>{b.label}</span>
                    <span className="tabular-nums text-xs">{cards ? b.cards.length : '·'}</span>
                  </li>
                ))}
              </ul>

              <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Colours
              </p>
              <div className="flex gap-1.5">
                {['W', 'U', 'B', 'R', 'G'].map(c => (
                  <ManaPip key={c} symbol={c} size="md" />
                ))}
              </div>
            </aside>

            {/* ---- middle: card grid ---- */}
            <div className="p-5">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {cards === null
                  ? Array.from({ length: 18 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-[5/7] rounded-lg" />
                    ))
                  : grid.map(c => (
                      <figure
                        key={c.id}
                        className="group relative aspect-[5/7] overflow-hidden rounded-lg shadow-lg shadow-black/30 transition-transform duration-300 hover:-translate-y-1"
                      >
                        <img
                          src={c.image_uris!.normal}
                          alt={c.name}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      </figure>
                    ))}
              </div>
            </div>

            {/* ---- right: analysis ---- */}
            <aside className="bg-muted/20 p-5">
              <p className="mb-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Mana curve
              </p>
              <div className="flex h-28 items-stretch gap-1.5">
                {curve.map((n, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-[10px] leading-none tabular-nums text-muted-foreground">
                      {n || ''}
                    </span>
                    <div
                      className="w-full rounded-t bg-foreground"
                      style={{ height: `${(n / curveMax) * 100}%`, minHeight: n ? 5 : 2 }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {[0, 1, 2, 3, 4, 5, '6+'].map((b, i) => (
                  <span
                    key={i}
                    className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground"
                  >
                    {b}
                  </span>
                ))}
              </div>

              <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Most expensive
              </p>
              <ul className="space-y-2.5">
                {cards === null
                  ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4" />)
                  : [...list]
                      .sort((a, b) => Number(b.prices?.usd ?? 0) - Number(a.prices?.usd ?? 0))
                      .slice(0, 5)
                      .map(c => (
                        <li key={c.id} className="flex items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate">{c.name}</span>
                          <ManaCost cost={c.mana_cost} size="xs" />
                          <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                            ${Number(c.prices?.usd ?? 0).toFixed(0)}
                          </span>
                        </li>
                      ))}
              </ul>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HomeAppVisual;
