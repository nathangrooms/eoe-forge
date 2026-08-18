import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Resolve real `cards` rows for the dashboard.
 *
 * The dashboard's own tables only ever carry a *reference* to a card — the
 * activity log stores `entity_id` (a printing id) plus a name in its metadata,
 * `deck_cards` stores `card_id`, `user_collections` stores `card_id`. None of
 * them carry artwork. Everything visual on this page therefore depends on
 * joining back to `cards`, and that is what this hook is: one batched join,
 * cached for the session.
 *
 * Both lookup axes are supported because both are needed. An id is the exact
 * printing the user chose and is always preferred; a name is the fallback for
 * rows written before ids were recorded, or by writers that only had a name.
 *
 * The full row is returned (not just a URL) so callers can hand it straight to
 * `<CardImage>` / `getBestCardImage`, which pick the right resolution for the
 * size they are drawn at.
 */

export interface CardRow {
  id: string;
  name: string;
  set_code: string | null;
  type_line: string | null;
  mana_cost: string | null;
  color_identity: string[] | null;
  rarity: string | null;
  layout: string | null;
  image_uris: Record<string, string> | null;
  faces: unknown;
}

const SELECT =
  'id,name,set_code,type_line,mana_cost,color_identity,rarity,layout,image_uris,faces';

/**
 * Session-lifetime caches. Card rows do not change between page views, and the
 * dashboard remounts on every navigation back to it — without this, returning
 * to the dashboard re-fetches the same twenty cards every time.
 *
 * `null` is cached as deliberately as a hit: a name with no matching row must
 * not be re-queried on every render.
 */
const rowsById = new Map<string, CardRow | null>();
const rowsByName = new Map<string, CardRow | null>();

const nameKey = (name: string) => name.trim().toLowerCase();

function toRow(raw: Record<string, unknown>): CardRow {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    set_code: (raw.set_code as string) ?? null,
    type_line: (raw.type_line as string) ?? null,
    mana_cost: (raw.mana_cost as string) ?? null,
    color_identity: Array.isArray(raw.color_identity) ? (raw.color_identity as string[]) : null,
    rarity: (raw.rarity as string) ?? null,
    layout: (raw.layout as string) ?? null,
    image_uris: (raw.image_uris as Record<string, string>) ?? null,
    faces: raw.faces ?? null,
  };
}

/** How much artwork a printing actually carries — used to pick between reprints. */
function artScore(row: CardRow): number {
  const img = row.image_uris ?? {};
  let score = 0;
  if (img.art_crop) score += 4;
  if (img.large || img.png) score += 2;
  if (img.normal) score += 1;
  return score;
}

function unique(values: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export interface CardLookup {
  /** Printing id first, name second. Returns null until resolved, or if unknown. */
  resolve: (id?: string | null, name?: string | null) => CardRow | null;
  loading: boolean;
}

export function useCardLookup(
  ids: (string | null | undefined)[],
  names: (string | null | undefined)[] = []
): CardLookup {
  const wantedIds = unique(ids);
  const wantedNames = unique(names);

  // Effects key off the *content* of the request, not the array identity the
  // caller happens to hand over — otherwise every render refetches.
  const requestKey =
    wantedIds.map(v => v.toLowerCase()).sort().join(',') +
    '||' +
    wantedNames.map(nameKey).sort().join(',');

  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const missingIds = wantedIds.filter(id => !rowsById.has(id));
    const missingNames = wantedNames.filter(name => !rowsByName.has(nameKey(name)));

    if (missingIds.length === 0 && missingNames.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);

    (async () => {
      const queries: Promise<{ data: unknown[] | null }>[] = [];

      if (missingIds.length > 0) {
        queries.push(
          supabase.from('cards').select(SELECT).in('id', missingIds) as unknown as Promise<{
            data: unknown[] | null;
          }>
        );
      }
      if (missingNames.length > 0) {
        queries.push(
          supabase
            .from('cards')
            .select(SELECT)
            .in('name', missingNames)
            // A name matches every reprint; a handful is enough to find one with art.
            .limit(missingNames.length * 6) as unknown as Promise<{ data: unknown[] | null }>
        );
      }

      const results = await Promise.all(queries);

      for (const result of results) {
        for (const raw of (result.data ?? []) as Record<string, unknown>[]) {
          const row = toRow(raw);
          if (!row.id) continue;

          rowsById.set(row.id, row);

          // Between reprints, keep whichever printing actually has artwork.
          const key = nameKey(row.name);
          const held = rowsByName.get(key);
          if (!held || artScore(row) > artScore(held)) rowsByName.set(key, row);
        }
      }

      // Remember the misses too, so an unknown id is asked for exactly once.
      for (const id of missingIds) if (!rowsById.has(id)) rowsById.set(id, null);
      for (const name of missingNames) {
        const key = nameKey(name);
        if (!rowsByName.has(key)) rowsByName.set(key, null);
      }

      if (!cancelled) {
        setVersion(v => v + 1);
        setLoading(false);
      }
    })().catch(error => {
      console.error('Error resolving card artwork:', error);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return useMemo(
    () => ({
      loading,
      resolve: (id?: string | null, name?: string | null) => {
        if (id) {
          const hit = rowsById.get(id);
          if (hit) return hit;
        }
        if (name) {
          const hit = rowsByName.get(nameKey(name));
          if (hit) return hit;
        }
        return null;
      },
    }),
    // `version` is the signal that the module caches changed under us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, loading]
  );
}
