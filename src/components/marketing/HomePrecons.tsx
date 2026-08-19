import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight } from 'lucide-react';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { supabase } from '@/integrations/supabase/client';
import { Section, SectionInner, SectionHeading } from '@/components/marketing/Section';
import { PRECON_INDEX, type PreconIndexEntry } from '@/data/precon-index';

/**
 * Precons.
 *
 * This section used to be three separate lies stacked on top of each other:
 *
 *   - `setCount(184)` was a literal typed into the component, so the headline
 *     number could never track the catalogue.
 *   - The tiles were not precons. The query was `is_legendary + type_line ~
 *     Creature` with `.limit(40)` in database order, which is why three
 *     different Ellie cards used to sit next to each other.
 *   - Every commander was cropped to a 4:3 `art_crop` banner — the exact
 *     mistake the owner has called out more than once. A card that stands for a
 *     DECK is drawn whole, at 5:7. `art_crop` is a background texture and
 *     nothing else, which is all it is used for here (the section backdrop).
 *
 * All three are fixed by sourcing from `PRECON_INDEX` — 184 real products with
 * real names, sets, colour identities, deck sizes and commander printing ids.
 * The count is derived, the names are the products' own, and the commander of
 * each precon is resolved to its real `cards` row in ONE batched request.
 */

export const PRECON_COUNT = PRECON_INDEX.length;

/**
 * Four recent precons, at most two per set.
 *
 * Newest-first alone returns a run of decks from one set, which looks like a
 * bug in the picker rather than a shelf of products. Capping each set at two
 * keeps at least two different recent sets in the row. Deduplicating on the
 * commander printing also drops the "Collector's Edition" reprints, which are
 * the same deck with the same commander.
 *
 * Was eight, drawn as two rows of four ~390px commanders, which made this the
 * second-tallest section on the page at 1,899px. The row exists to show that
 * precons are real products with real commanders and real lists; a second row
 * of four more says nothing the first row did not, and the "Browse all 184"
 * control underneath is what carries the breadth. Four, at the SAME card size,
 * so the commanders stay large.
 */
const FEATURED: PreconIndexEntry[] = (() => {
  const perSet = new Map<string, number>();
  const seenCommander = new Set<string>();
  const out: PreconIndexEntry[] = [];

  const newestFirst = [...PRECON_INDEX].sort((a, b) =>
    String(b.released ?? '').localeCompare(String(a.released ?? ''))
  );

  for (const entry of newestFirst) {
    const lead = entry.commanders[0];
    if (!lead?.scryfallId || seenCommander.has(lead.scryfallId)) continue;
    const used = perSet.get(entry.set) ?? 0;
    if (used >= 2) continue;

    perSet.set(entry.set, used + 1);
    seenCommander.add(lead.scryfallId);
    out.push(entry);
    if (out.length === 4) break;
  }
  return out;
})();

const FEATURED_IDS = FEATURED.map(p => p.commanders[0].scryfallId);

interface CommanderCard {
  id: string;
  name: string;
  type_line: string;
  mana_cost: string | null;
  layout: string | null;
  faces: unknown;
  image_uris: Record<string, string> | null;
}

export function HomePrecons() {
  const [byId, setById] = useState<Map<string, CommanderCard> | null>(null);

  useEffect(() => {
    (async () => {
      /* One request for all eight commanders, keyed on the printing id the
         precon index already stores. `cards.id` IS the Scryfall printing id. */
      const { data } = await supabase
        .from('cards')
        .select('id,name,type_line,mana_cost,layout,faces,image_uris')
        .in('id', FEATURED_IDS);

      const map = new Map<string, CommanderCard>();
      for (const row of (data ?? []) as unknown as CommanderCard[]) map.set(row.id, row);
      setById(map);
    })();
  }, []);

  const loading = byId === null;

  /* art_crop, used the one way it is allowed to be used: as a texture behind
     other content. One image for the whole band, not eight cropped commanders. */
  const backdrop = byId
    ? FEATURED.map(p => byId.get(p.commanders[0].scryfallId)?.image_uris?.art_crop).find(Boolean)
    : undefined;

  return (
    <Section bleed className="relative isolate overflow-hidden">
      {backdrop && (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <img
            src={backdrop}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full scale-110 object-cover opacity-[0.06] blur-xl"
          />
        </div>
      )}

      <SectionInner>
        <SectionHeading
          title="Start from a precon, then make it yours"
          lead={
            <>
              {PRECON_COUNT.toLocaleString()} Commander precon decklists you can load, compare
              against what you own, and upgrade card by card. Every one comes with its real commander,
              set and full list.
            </>
          }
        />

        <div className="mt-16 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <CardImageSkeleton size="lg" fill />
                  <Skeleton className="mt-4 h-4 w-4/5" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              ))
            : FEATURED.map(precon => {
                const lead = precon.commanders[0];
                const card = byId?.get(lead.scryfallId);
                const partners = precon.commanders.length - 1;

                return (
                  <Link
                    key={precon.id}
                    to="/precons"
                    className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                  >
                    {/* The whole card. Never a crop — this card IS the deck. */}
                    <CardImage
                      card={card ?? { name: lead.name, mana_cost: lead.cost }}
                      size="lg"
                      fill
                      hideFlip
                      className="transition-transform duration-500 group-hover:-translate-y-2"
                    />

                    <div className="mt-4">
                      <p className="text-base font-medium leading-snug tracking-tight text-balance">
                        {precon.name}
                      </p>
                      <p className="mt-1 text-sm leading-snug text-muted-foreground">
                        {precon.set}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <ColorIdentity colors={precon.ci} size="sm" />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {precon.total} cards
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-snug text-muted-foreground/80">
                        {lead.name}
                        {partners > 0 && ` +${partners} partner${partners > 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </Link>
                );
              })}
        </div>

        <div className="mt-16 text-center">
          <Button asChild size="lg" variant="outline">
            <Link to="/precons">
              Browse all {PRECON_COUNT} precons
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </SectionInner>
    </Section>
  );
}

export default HomePrecons;
