import { useQuery } from '@tanstack/react-query';
import { uniqueCards } from '@/lib/cards/cardQuery';
import {
  FACE_POOL_SIZE,
  faceTagsFor,
  facesForTemplates,
  type FaceCard,
} from '@/lib/deckbuilder/templates/archetypeFaces';
import type { ArchetypeTemplate } from '@/lib/deckbuilder/types';

/**
 * The representative cards for every archetype on the page, in ONE query.
 *
 * Not one query per tile. Eleven templates would be eleven round trips, and the
 * shape that took this database down twice is a component that reads per row.
 * The ranking is done in `archetypeFaces.ts`, which is pure and tested; this
 * only fetches the pool it ranks.
 *
 * `uniqueCards()` rather than `from('cards')`, per the rule in
 * `src/lib/cards/source.ts`: a tile wants a card, not eight printings of it.
 *
 * Measured with EXPLAIN against the real database before this was written:
 * 400 rows, 606 buffer hits, 2.465 ms, served by `cards_unique_edhrec_rank_idx`
 * with early termination, so the cost does not grow as the catalogue does.
 *
 * The page is fully usable while this is in flight and if it fails outright —
 * the tiles simply have no cards on them, which is what they had before. Card
 * art is worth adding and is not worth an error state on a page about deck
 * shapes.
 */

const COLUMNS = 'id,name,tags,edhrec_rank,color_identity,image_uris,type_line,set_code,mana_cost,cmc,layout,faces';

export function useArchetypeFaces(templates: readonly ArchetypeTemplate[]) {
  const tags = faceTagsFor(templates);
  const ids = templates.map(t => t.id).join(',');

  const { data, isLoading } = useQuery({
    /* Keyed on the archetypes, not on the render. The template list is static,
       so this is fetched once per session and served from cache after. */
    queryKey: ['archetype-faces', ids, FACE_POOL_SIZE],
    enabled: tags.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<FaceCard[]> => {
      const { data, error } = await uniqueCards()
        .select(COLUMNS)
        .overlaps('tags', tags)
        .not('edhrec_rank', 'is', null)
        .order('edhrec_rank', { ascending: true })
        .limit(FACE_POOL_SIZE);

      /* Thrown, not swallowed. `resolveCards` in the Tutor function discarded
         its error and a run that resolved 0 of 86 real card names looked
         healthy; the caller here treats a failure as "no cards", but it does so
         knowingly rather than by accident. */
      if (error) throw error;
      return (data ?? []) as unknown as FaceCard[];
    },
  });

  return {
    faces: facesForTemplates(templates, data ?? []),
    loading: isLoading,
  };
}
