import { useMemo } from 'react';
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
 * The representative cards for every archetype on the page.
 *
 * ONE QUERY FOR THE PAGE, NOT ONE PER TILE. Eleven templates would be eleven
 * round trips, and the shape that has taken this database down twice is a
 * component that reads per row. The ranking itself is in `archetypeFaces.ts`,
 * which is pure and tested; this only fetches the pool it ranks.
 *
 * `uniqueCards()` rather than `from('cards')`, per the rule in
 * `src/lib/cards/source.ts`: a tile wants a card, not eight printings of it.
 *
 * ## The query is expensive and the answer never varies, so it is cached
 *
 * Measured with EXPLAIN on the real database, and the first version of this
 * shipped on a figure that was wrong because I had typed the tag list by hand
 * instead of asking the code for it. The list the app actually sends is 18
 * synergy tags, not the 29 I tested with, and a SMALLER tag set is MORE
 * expensive here: the index walks `edhrec_rank` and filters, so fewer matching
 * tags means it reads further down the ranking to fill the same limit.
 *
 *     18 tags, limit 400   1,134 heap blocks, reaches rank 1136
 *     18 tags, limit 250     797 heap blocks, reaches rank  800
 *
 * Warm that is 3ms. Cold, on this project's disk, a block read costs about
 * 8.8ms, so 797 of them is roughly seven seconds against a three second
 * `statement_timeout` — and `sweep.mjs` duly caught it, twice in twenty presses,
 * as `57014 canceling statement due to statement timeout`.
 *
 * The fix is not a bigger timeout. It is that THE ANSWER IS THE SAME FOR EVERY
 * USER and changes only when the catalogue does: the templates are constants in
 * the repo and the ranking is `edhrec_rank`. So the computed faces are kept in
 * `localStorage` for a day, and the database is asked once per browser per day
 * rather than once per page load. Roughly forty kilobytes, because what is
 * stored is the 33 chosen cards rather than the 250-row pool they came from.
 *
 * A covering index on `cards_unique (edhrec_rank) INCLUDE (tags, ...)` would
 * make the live query an index-only scan and cost nothing per call. It is
 * deliberately not added: this file's own note in CLAUDE.md records that `cards`
 * and `cards_unique` already carry 49 near-duplicate indexes across 60% of the
 * database, and a decorative strip is not the reason to add a fiftieth.
 *
 * The page is fully usable while this is in flight and if it fails outright —
 * the tiles simply have no cards on them, which is what they had before.
 */

const COLUMNS =
  'id,name,tags,edhrec_rank,color_identity,image_uris,type_line,set_code,mana_cost,cmc,layout,faces';

/** A day. The catalogue syncs nightly and the templates are constants. */
const CACHE_MS = 24 * 60 * 60 * 1000;

/** Bump when the ranking rules change, or every browser keeps the old answer. */
const CACHE_VERSION = 2;

type Faces = Record<string, FaceCard[]>;
interface Cached {
  at: number;
  key: string;
  faces: Faces;
}

/**
 * What the cached answer depends on. If any of it moves the cache is a miss,
 * which is why the tag list and the pool size are in it rather than assumed.
 */
function cacheKey(templates: readonly ArchetypeTemplate[], tags: readonly string[]): string {
  return [
    CACHE_VERSION,
    FACE_POOL_SIZE,
    templates.map(t => t.id).join('.'),
    [...tags].sort().join('.'),
  ].join('|');
}

const STORAGE_KEY = 'deckmatrix.archetypeFaces';

/**
 * Every read and write is wrapped, because `localStorage` does not merely
 * return empty in a private window — the accessor itself throws in some
 * contexts, and a decorative strip must never be able to blank a page.
 */
function readCache(key: string): Faces | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (parsed.key !== key) return null;
    if (!Number.isFinite(parsed.at) || Date.now() - parsed.at > CACHE_MS) return null;
    return parsed.faces ?? null;
  } catch {
    return null;
  }
}

function writeCache(key: string, faces: Faces): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), key, faces }));
  } catch {
    /* Full, or blocked. The page is correct either way; it just asks again. */
  }
}

export function useArchetypeFaces(templates: readonly ArchetypeTemplate[]) {
  const tags = useMemo(() => faceTagsFor(templates), [templates]);
  const key = useMemo(() => cacheKey(templates, tags), [templates, tags]);

  /* Read once per key rather than on every render. A miss is null and the
     query below runs; a hit means the query never runs at all. */
  const cached = useMemo(() => readCache(key), [key]);

  const { data, isLoading } = useQuery({
    queryKey: ['archetype-faces', key],
    enabled: tags.length > 0 && cached === null,
    staleTime: CACHE_MS,
    queryFn: async (): Promise<Faces> => {
      const { data, error } = await uniqueCards()
        .select(COLUMNS)
        .overlaps('tags', tags)
        .not('edhrec_rank', 'is', null)
        .order('edhrec_rank', { ascending: true })
        .limit(FACE_POOL_SIZE);

      /* Thrown, not swallowed. `resolveCards` in the Tutor function discarded
         its error and a run that resolved 0 of 86 real card names looked
         healthy; the caller here treats a failure as "no cards", but knowingly
         rather than by accident. */
      if (error) throw error;

      const faces = facesForTemplates(templates, (data ?? []) as unknown as FaceCard[]);
      writeCache(key, faces);
      return faces;
    },
  });

  return {
    faces: cached ?? data ?? {},
    loading: cached === null && isLoading,
  };
}
