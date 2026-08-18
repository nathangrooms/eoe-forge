import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Resolve card artwork by card NAME.
 *
 * Several surfaces only carry a card's name — the dashboard's DeckSummary knows
 * `commanderName` but not the card row, and the activity log stores a name in its
 * metadata. Rather than widen every one of those queries, this looks the artwork
 * up once per distinct name and caches it for the session.
 *
 * Names are batched into a single `in` query so a list of ten decks costs one
 * request, not ten.
 */

export interface CardArt {
  name: string;
  art_crop: string | null;
  normal: string | null;
  large: string | null;
  color_identity: string[] | null;
  type_line: string | null;
}

/** Session-lifetime cache. Card art does not change between page views. */
const cache = new Map<string, CardArt | null>();
const key = (name: string) => name.trim().toLowerCase();

export function useCardArt(names: (string | null | undefined)[]): Map<string, CardArt> {
  const wanted = Array.from(
    new Set(names.filter((n): n is string => !!n && n.trim().length > 0).map(n => n.trim()))
  );
  const cacheKey = wanted.map(key).sort().join('|');

  const [resolved, setResolved] = useState<Map<string, CardArt>>(new Map());

  useEffect(() => {
    let cancelled = false;
    if (wanted.length === 0) {
      setResolved(new Map());
      return;
    }

    const missing = wanted.filter(n => !cache.has(key(n)));

    const build = () => {
      const out = new Map<string, CardArt>();
      for (const n of wanted) {
        const hit = cache.get(key(n));
        if (hit) out.set(key(n), hit);
      }
      if (!cancelled) setResolved(out);
    };

    if (missing.length === 0) {
      build();
      return;
    }

    (async () => {
      const { data } = await supabase
        .from('cards')
        .select('name,image_uris,color_identity,type_line')
        .in('name', missing)
        .limit(missing.length * 4);

      /* A name can match several printings; keep the first that has artwork. */
      for (const row of (data ?? []) as any[]) {
        const k = key(row.name);
        const img = row.image_uris ?? {};
        if (!cache.get(k) && (img.art_crop || img.normal)) {
          cache.set(k, {
            name: row.name,
            art_crop: img.art_crop ?? null,
            normal: img.normal ?? null,
            large: img.large ?? null,
            color_identity: row.color_identity ?? null,
            type_line: row.type_line ?? null,
          });
        }
      }
      /* Remember misses too, so a name without art is not re-queried every render. */
      for (const n of missing) if (!cache.has(key(n))) cache.set(key(n), null);

      build();
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return resolved;
}

/** Single-name convenience wrapper. */
export function useSingleCardArt(name: string | null | undefined): CardArt | null {
  const map = useCardArt([name]);
  return name ? map.get(key(name)) ?? null : null;
}

export const cardArtKey = key;
