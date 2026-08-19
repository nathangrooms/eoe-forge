import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight } from 'lucide-react';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { supabase } from '@/integrations/supabase/client';
import { Section, SectionHeading } from '@/components/marketing/Section';

/**
 * "New sets" showcase.
 *
 * Set names and release dates are fixed facts about printed products; the card
 * counts and all artwork are read live from the synced catalogue, so this
 * section proves the sync claim rather than just asserting it.
 *
 * On art_crop: a SET tile legitimately uses one, because the tile stands for a
 * set and the crop is being used as a landscape texture. A COMMANDER tile does
 * not — a commander stands for a deck, so it is drawn as a whole 5:7 card
 * through `CardImage`. That distinction is the whole reason the spotlight below
 * looks the way it does.
 */

const FEATURED_SETS: { code: string; name: string; released: string }[] = [
  { code: 'hob', name: 'The Hobbit', released: 'Aug 2026' },
  { code: 'msh', name: 'Marvel Super Heroes', released: 'Jun 2026' },
  { code: 'msc', name: 'Marvel Super Heroes Commander', released: 'Jun 2026' },
  { code: 'sos', name: 'Secrets of Strixhaven', released: 'Apr 2026' },
  { code: 'soc', name: 'Secrets of Strixhaven Commander', released: 'Apr 2026' },
  { code: 'tmt', name: 'Teenage Mutant Ninja Turtles', released: 'Mar 2026' },
];

const SET_NAME = new Map(FEATURED_SETS.map(s => [s.code, s.name]));

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
  color_identity: string[] | null;
  set_code: string;
  layout: string | null;
  faces: unknown;
  image_uris: Record<string, string> | null;
}

/**
 * One commander per featured set, in the order the sets are listed.
 *
 * Straight `.slice(0, 6)` on the query result returns six cards from whichever
 * set happens to sort first — twenty-four of the sixty rows come from a single
 * Commander set — so the spotlight would show six Marvel cards under a heading
 * about six sets. Round-robin keeps the claim and the picture in agreement.
 */
function oneCommanderPerSet(rows: Commander[], limit: number): Commander[] {
  const bySet = new Map<string, Commander[]>();
  for (const row of rows) {
    const bucket = bySet.get(row.set_code);
    if (bucket) bucket.push(row);
    else bySet.set(row.set_code, [row]);
  }

  const picked: Commander[] = [];
  const seen = new Set<string>();
  // Several passes, so a set with only one legend still contributes and the
  // remaining slots fill from the sets that have more.
  for (let round = 0; picked.length < limit && round < 8; round++) {
    let progressed = false;
    for (const { code } of FEATURED_SETS) {
      if (picked.length >= limit) break;
      const candidate = (bySet.get(code) ?? [])[round];
      if (!candidate || seen.has(candidate.name)) continue;
      seen.add(candidate.name);
      picked.push(candidate);
      progressed = true;
    }
    if (!progressed) break;
  }
  return picked;
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
            .select('id', { count: 'exact', head: true })
            .eq('set_code', s.code);

          /* A mythic from the set makes the most striking tile art. */
          const { data } = await supabase
            .from('cards')
            .select('name,image_uris,rarity')
            .eq('set_code', s.code)
            .in('rarity', ['mythic', 'rare'])
            .not('image_uris', 'is', null)
            .limit(25);

          const pick = (data ?? []).find((c: any) => c.image_uris?.art_crop) as any;

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
        .select('id,name,type_line,color_identity,set_code,layout,faces,image_uris')
        .in('set_code', FEATURED_SETS.map(s => s.code))
        .eq('is_legendary', true)
        .ilike('type_line', '%Creature%')
        .not('image_uris', 'is', null)
        .limit(60);

      const withArt = ((data ?? []) as unknown as Commander[]).filter(
        c => c.image_uris?.large || c.image_uris?.normal
      );
      setCommanders(oneCommanderPerSet(withArt, 6));
    })();
  }, []);

  return (
    <Section>
      <SectionHeading
        title="New sets, the week they land"
        lead="Cards update from Scryfall every night. You can search a new set and start building with it as soon as it is spoiled, not months later."
      />

      {/* ---- set tiles: art_crop is correct here, a tile stands for a SET ----

           One row of six rather than two rows of three. The tiles and the
           commanders below them are both built from the same six sets in the
           same order, so at six columns each set now sits directly above its
           own legend and the pairing is visible instead of stated. It also
           takes ~480px off the section, which was 1,697px to make one point
           twice. */}
      <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {tiles === null
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/2] rounded-xl" />
            ))
          : tiles.map(t => (
              <article
                key={t.code}
                className="group relative aspect-[3/2] overflow-hidden rounded-xl shadow-lg shadow-black/30"
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
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/90">
                      {t.code}
                    </span>
                    <span className="text-[10px] text-white/60">{t.released}</span>
                  </div>
                  <h3 className="mt-1 text-sm font-medium leading-tight text-white">{t.name}</h3>
                  <p className="text-[11px] text-white/70">{t.count.toLocaleString()} cards</p>
                </div>
              </article>
            ))}
      </div>

      {/* ---- commander spotlight: WHOLE cards at 5:7, one per set ---- */}
      <div className="mt-12">
        <div className="mx-auto max-w-3xl text-center">
          <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Fresh commanders, already legal to build
          </h3>
          {/* The old line here explained that each card belongs to the set
              above it. At six columns the card IS under its set, so the layout
              says it and the sentence does not have to. */}
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            A legend from each of those sets, shown as a whole card.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {commanders === null
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                  <CardImageSkeleton size="lg" fill />
                  <Skeleton className="mt-3 h-4 w-3/4" />
                </div>
              ))
            : commanders.map(c => (
                <figure key={c.id} className="group">
                  <CardImage
                    card={c}
                    size="md"
                    fill
                    className="transition-transform duration-500 group-hover:-translate-y-1.5"
                  />
                  <figcaption className="mt-3.5">
                    <p className="text-sm font-medium leading-snug line-clamp-2">{c.name}</p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">
                      {SET_NAME.get(c.set_code) ?? c.set_code.toUpperCase()}
                    </p>
                    {/* Colour identity only. The card above already prints the
                        mana cost in its own top-right corner, and repeating it
                        under the art reads as a rendering slip. Identity is the
                        datum a commander is actually chosen on. */}
                    <div className="mt-2">
                      <ColorIdentity colors={c.color_identity} size="sm" />
                    </div>
                  </figcaption>
                </figure>
              ))}
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" variant="outline">
            <Link to="/cards">
              Browse every card
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}

export default HomeNewSets;
