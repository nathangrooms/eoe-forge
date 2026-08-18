import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight } from 'lucide-react';
import { ManaCost, ColorIdentity } from '@/components/ui/mana-cost';
import { supabase } from '@/integrations/supabase/client';

/**
 * "New sets" showcase.
 *
 * Set names and release dates are fixed facts about printed products; the card
 * counts and all artwork are read live from the synced catalogue, so this
 * section proves the sync claim rather than just asserting it.
 */

const FEATURED_SETS: { code: string; name: string; released: string }[] = [
  { code: 'hob', name: 'The Hobbit', released: 'Aug 2026' },
  { code: 'msh', name: 'Marvel Super Heroes', released: 'Jun 2026' },
  { code: 'msc', name: 'Marvel Super Heroes Commander', released: 'Jun 2026' },
  { code: 'sos', name: 'Secrets of Strixhaven', released: 'Apr 2026' },
  { code: 'soc', name: 'Secrets of Strixhaven Commander', released: 'Apr 2026' },
  { code: 'tmt', name: 'Teenage Mutant Ninja Turtles', released: 'Mar 2026' },
];

interface SetTile {
  code: string;
  name: string;
  released: string;
  count: number;
  art: string | null;
  headline: string | null;
}

interface Commander {
  id: string;
  name: string;
  type_line: string;
  mana_cost: string | null;
  color_identity: string[] | null;
  set_code: string;
  image_uris: Record<string, string> | null;
}

export function HomeNewSets() {
  const [tiles, setTiles] = useState<SetTile[] | null>(null);
  const [commanders, setCommanders] = useState<Commander[] | null>(null);

  useEffect(() => {
    (async () => {
      const results = await Promise.all(
        FEATURED_SETS.map(async s => {
          const { count } = await supabase
            .from('cards')
            .select('*', { count: 'exact', head: true })
            .eq('set_code', s.code);

          /* A mythic from the set makes the most striking tile art. */
          const { data } = await supabase
            .from('cards')
            .select('name,image_uris,rarity')
            .eq('set_code', s.code)
            .in('rarity', ['mythic', 'rare'])
            .not('image_uris', 'is', null)
            .limit(25);

          const pick = (data ?? []).find(
            (c: any) => c.image_uris?.art_crop
          ) as any;

          return {
            ...s,
            count: count ?? 0,
            art: pick?.image_uris?.art_crop ?? null,
            headline: pick?.name ?? null,
          };
        })
      );
      setTiles(results.filter(t => t.count > 0));
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('cards')
        .select('id,name,type_line,mana_cost,color_identity,set_code,image_uris')
        .in('set_code', FEATURED_SETS.map(s => s.code))
        .eq('is_legendary', true)
        .ilike('type_line', '%Creature%')
        .not('image_uris', 'is', null)
        .limit(60);

      const withArt = ((data ?? []) as unknown as Commander[]).filter(
        c => c.image_uris?.art_crop
      );
      setCommanders(withArt.slice(0, 6));
    })();
  }, []);

  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl text-balance">
            New sets, the week they land
          </h2>
          <p className="mt-4 text-muted-foreground text-pretty">
            The catalogue syncs from Scryfall every night, so a set is searchable and
            buildable as soon as it is spoiled — not months later.
          </p>
        </div>

        {/* ---- set tiles ---- */}
        <div className="mx-auto mt-14 grid max-w-[1500px] gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles === null
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[16/9] rounded-xl" />
              ))
            : tiles.map(t => (
                <article
                  key={t.code}
                  className="group relative aspect-[16/9] overflow-hidden rounded-xl shadow-lg shadow-black/30"
                >
                  {t.art ? (
                    <img
                      src={t.art}
                      alt={t.headline ?? t.name}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-muted" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-white/25 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/80">
                        {t.code}
                      </span>
                      <span className="text-[11px] text-white/60">{t.released}</span>
                    </div>
                    <h3 className="mt-1.5 text-lg font-medium leading-tight text-white">
                      {t.name}
                    </h3>
                    <p className="text-xs text-white/70">
                      {t.count.toLocaleString()} cards in the catalogue
                    </p>
                  </div>
                </article>
              ))}
        </div>

        {/* ---- commander spotlight ---- */}
        <div className="mx-auto mt-20 max-w-[1500px]">
          <h3 className="text-center text-xl font-medium">
            Fresh commanders, already legal to build
          </h3>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {commanders === null
              ? Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-xl" />
                ))
              : commanders.map(c => (
                  <div
                    key={c.id}
                    className="group relative flex h-28 overflow-hidden rounded-xl bg-card shadow-lg shadow-black/20"
                  >
                    <div className="relative w-32 shrink-0 overflow-hidden">
                      <img
                        src={c.image_uris!.art_crop}
                        alt={c.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-3">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.type_line}</p>
                      <div className="flex items-center gap-2">
                        <ColorIdentity colors={c.color_identity} size="xs" />
                        <ManaCost cost={c.mana_cost} size="xs" />
                      </div>
                    </div>
                  </div>
                ))}
          </div>

          <div className="mt-10 text-center">
            <Button asChild size="lg" variant="outline">
              <Link to="/cards">
                Browse the full catalogue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HomeNewSets;
