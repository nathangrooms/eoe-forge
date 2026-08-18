/**
 * DeckMatrix — life counter: resolving the artwork behind a colour mat.
 *
 * Every image on a mat comes out of our own `cards` table. Nothing here invents
 * a URL, guesses a Scryfall id or hotlinks a path that has not been read back
 * from the database: a colour's candidate list is card *names*, the lookup asks
 * the table for those names, and a colour whose candidates are all missing
 * simply keeps its CSS mat. That is why the CSS surface is the real mat and the
 * art is an enhancement — the failure mode is "less pretty", never "blank".
 *
 * Cost: one query for the whole feature. All five colours share a single
 * `in (…)` over `name`, which rides the table's `name` index, and the answer is
 * memoised for the tab and mirrored into `localStorage` so the mats are on
 * screen in the first frame of the next visit.
 */

import { useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';

import {
  MAT_ART_CANDIDATES,
  MAT_COLORS,
  MAT_DEFINITIONS,
  type MatColor,
} from './mats';

export interface MatArt {
  /** The card the art belongs to. Shown in setup — the player should know. */
  cardName: string;
  /** `image_uris.art_crop`, straight from the row. */
  art: string;
}

export type MatArtMap = Partial<Record<MatColor, MatArt>>;

const STORAGE_KEY = 'dm.life.mat-art.v1';
/** Re-check monthly: printings get added, and a better art may become available. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredArt {
  v: 1;
  savedAt: number;
  mats: MatArtMap;
}

function readCache(): MatArtMap | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredArt;
    if (!parsed || parsed.v !== 1 || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > TTL_MS) return null;
    if (!parsed.mats || typeof parsed.mats !== 'object') return null;

    // Trust nothing off disk: only https URLs on rows we would have written.
    const clean: MatArtMap = {};
    for (const color of MAT_COLORS) {
      const entry = parsed.mats[color];
      if (entry && typeof entry.art === 'string' && entry.art.startsWith('https://')) {
        clean[color] = { cardName: String(entry.cardName ?? ''), art: entry.art };
      }
    }
    return clean;
  } catch {
    return null;
  }
}

function writeCache(mats: MatArtMap): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredArt = { v: 1, savedAt: Date.now(), mats };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode or quota — the mats still render, just without a warm start */
  }
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/** Tab-lifetime memo. Shared by setup and the board so they never both query. */
let memo: MatArtMap | null = readCache();
/** In-flight request, so N mounting components make one round trip. */
let inflight: Promise<MatArtMap> | null = null;
/** Everything that wants to know when `memo` changes. */
const listeners = new Set<(mats: MatArtMap) => void>();

interface CardRow {
  name: string;
  image_uris: { art_crop?: string | null } | null;
}

/**
 * Best `art_crop` per card name.
 *
 * A name can have several printings in the table and the older ones may have no
 * imagery at all, so the first row with an `art_crop` wins rather than the first
 * row full stop.
 */
function artByName(rows: CardRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    if (!row?.name) continue;
    const key = row.name.trim().toLowerCase();
    if (out.has(key)) continue;
    const crop = row.image_uris?.art_crop;
    if (typeof crop === 'string' && crop.startsWith('https://')) out.set(key, crop);
  }
  return out;
}

async function fetchMatArt(): Promise<MatArtMap> {
  // Names only, plus the one jsonb column actually needed. Never `*`.
  const { data, error } = await supabase
    .from('cards')
    .select('name,image_uris')
    .in('name', MAT_ART_CANDIDATES)
    .limit(MAT_ART_CANDIDATES.length * 6);

  if (error || !data) return {};

  const found = artByName(data as unknown as CardRow[]);
  const mats: MatArtMap = {};

  for (const color of MAT_COLORS) {
    for (const candidate of MAT_DEFINITIONS[color].art) {
      const art = found.get(candidate.trim().toLowerCase());
      if (art) {
        mats[color] = { cardName: candidate, art };
        break;
      }
    }
  }

  return mats;
}

function publish(mats: MatArtMap): void {
  memo = mats;
  if (Object.keys(mats).length > 0) writeCache(mats);
  for (const listener of listeners) listener(mats);
}

/** Force a re-read on the next mount. Exposed for tests and dev tooling. */
export function clearMatArtCache(): void {
  memo = null;
  inflight = null;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to do */
    }
  }
}

/**
 * Artwork for all five mats.
 *
 * Returns whatever is already known synchronously — usually everything, from
 * the cache — and fills in the rest when the one query lands. A colour missing
 * from the map is not an error; it means that colour is showing its CSS mat.
 */
export function useMatArt(): MatArtMap {
  const [mats, setMats] = useState<MatArtMap>(() => memo ?? {});

  useEffect(() => {
    let cancelled = false;
    const listener = (next: MatArtMap) => {
      if (!cancelled) setMats(next);
    };
    listeners.add(listener);

    if (memo) {
      setMats(memo);
    } else {
      if (!inflight) {
        inflight = fetchMatArt()
          .catch(() => ({} as MatArtMap))
          .then(result => {
            publish(result);
            return result;
          })
          .finally(() => {
            inflight = null;
          });
      }
      void inflight;
    }

    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);

  return mats;
}
