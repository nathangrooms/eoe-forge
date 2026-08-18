import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OwnershipSummary {
  /** Copies of deck cards the user actually owns, capped at what the deck needs. */
  ownedCopies: number;
  /** Copies the deck needs that the user does not own. */
  missingCopies: number;
  /** Distinct card names the user is short on. */
  missingNames: string[];
  requiredCopies: number;
  ownedPct: number;
}

interface DeckCardLike {
  name: string;
  quantity?: number;
}

/**
 * Owned/missing measured against the user's actual collection.
 *
 * The builder previously hardcoded `missingCards: 0, ownedPct: 100`, so every
 * deck claimed a full collection regardless of what the user had. Returns
 * `null` while loading and when there is no signed-in user, so the caller can
 * render a real empty state rather than a fabricated 100%.
 */
export function useCollectionOwnership(cards: DeckCardLike[], userId?: string | null) {
  const [summary, setSummary] = useState<OwnershipSummary | null>(null);
  const [loading, setLoading] = useState(false);

  // Recompute only when the multiset of card names/quantities changes.
  const signature = cards
    .map(c => `${(c.name || '').toLowerCase()}:${c.quantity ?? 1}`)
    .sort()
    .join('|');

  useEffect(() => {
    let cancelled = false;

    if (!userId || cards.length === 0) {
      setSummary(null);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_collections')
          .select('card_name, quantity')
          .eq('user_id', userId);

        if (error) throw error;

        const owned = new Map<string, number>();
        for (const row of data ?? []) {
          const key = (row.card_name || '').toLowerCase().trim();
          if (!key) continue;
          owned.set(key, (owned.get(key) ?? 0) + (row.quantity ?? 0));
        }

        let requiredCopies = 0;
        let ownedCopies = 0;
        const missingNames: string[] = [];

        for (const card of cards) {
          const need = card.quantity ?? 1;
          requiredCopies += need;
          const have = owned.get((card.name || '').toLowerCase().trim()) ?? 0;
          const counted = Math.min(have, need);
          ownedCopies += counted;
          if (counted < need) missingNames.push(card.name);
        }

        if (cancelled) return;
        setSummary({
          ownedCopies,
          missingCopies: requiredCopies - ownedCopies,
          missingNames,
          requiredCopies,
          ownedPct: requiredCopies > 0 ? (ownedCopies / requiredCopies) * 100 : 0,
        });
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, userId]);

  return { ownership: summary, loading };
}
