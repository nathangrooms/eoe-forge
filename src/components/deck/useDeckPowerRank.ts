import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Where this deck sits among your own decks, by power.
 *
 * ## Why this is worth a request
 *
 * `user_decks.power_level` is a column the power engine has been writing on
 * every score since it was written, and the census found nothing in `src/` that
 * reads it for comparison. A number on its own — "6.2" — is a fact a player has
 * no scale for. "6.2, your third strongest of nine" is the same fact with the
 * only scale they actually have. Neither Moxfield nor Archidekt offers it,
 * because neither of them measures power in a way that would let them.
 *
 * ## One query, for the set
 *
 * `select id, name, power_level where user_id = …`. One row per deck, three
 * small columns, one round trip whatever the size of the library. Not
 * `compute_deck_summary` per deck, which is the shape that has taken this
 * database down twice and which `getDeckSummaries` still uses on `/decks`.
 *
 * ## What it deliberately does not do
 *
 * It does not read `edh_analysis`. That column holds the whole stored score —
 * subscores, evidence, castability, several kilobytes a deck — and pulling all
 * of it down to sort nine integers would be the same mistake in a different
 * direction. `power_level` is the engine's own rounded score
 * (`deckPowerRecord` writes it), so the ordering is the engine's ordering. It
 * is a whole number, which is why {@link DeckPowerRank} reports ties rather
 * than pretending to a precision the column does not have.
 */

export interface DeckPowerRank {
  /** 1 is the strongest. */
  rank: number;
  /** Decks of yours that carry a score at all. */
  scored: number;
  /** How many of your decks share this deck's rounded score, this one included. */
  tied: number;
  /** The strongest deck you own, for the caption. */
  strongest: { id: string; name: string; power: number } | null;
}

export function useDeckPowerRank(
  deckId: string | undefined,
  userId: string | undefined
): { rank: DeckPowerRank | null; loading: boolean } {
  const [rank, setRank] = useState<DeckPowerRank | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!deckId || !userId) {
      setRank(null);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void supabase
      .from('user_decks')
      .select('id, name, power_level')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error || !data) {
          setRank(null);
          return;
        }

        /* A deck with no score is not a deck at zero power. It is left out of
           the denominator entirely, so "third of nine" never quietly means
           "third of nine, six of which have never been scored". */
        const scored = data
          .filter(row => typeof row.power_level === 'number' && row.power_level > 0)
          .map(row => ({
            id: row.id as string,
            name: (row.name as string) ?? 'Untitled',
            power: row.power_level as number,
          }))
          .sort((a, b) => b.power - a.power);

        const self = scored.find(row => row.id === deckId);
        if (!self) {
          setRank(null);
          return;
        }

        setRank({
          rank: scored.findIndex(row => row.power === self.power) + 1,
          scored: scored.length,
          tied: scored.filter(row => row.power === self.power).length,
          strongest: scored[0] ?? null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [deckId, userId]);

  return { rank, loading };
}

export default useDeckPowerRank;
