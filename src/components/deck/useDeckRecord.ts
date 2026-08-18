import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DeckHeaderRecord {
  id: string;
  name: string;
  format: string;
  public_enabled: boolean;
  public_slug: string | null;
}

/**
 * The little bit of deck identity every deck sub-route needs.
 *
 * Export, share and the missing-cards list used to be handed `deckName` by
 * whichever overlay opened them. Now that each one is a route somebody can land
 * on cold, the page has to be able to answer "which deck is this?" on its own.
 */
export function useDeckRecord(id?: string) {
  const [deck, setDeck] = useState<DeckHeaderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setError('No deck specified.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('user_decks')
        .select('id, name, format, public_enabled, public_slug')
        .eq('id', id)
        .maybeSingle();

      if (queryError) throw queryError;
      if (!data) {
        setDeck(null);
        setError('This deck could not be found.');
        return;
      }

      setDeck({
        id: data.id,
        name: data.name ?? 'Untitled deck',
        format: data.format ?? 'commander',
        public_enabled: Boolean(data.public_enabled),
        public_slug: data.public_slug ?? null,
      });
    } catch (err) {
      console.error('Deck record load failed:', err);
      setDeck(null);
      setError('Could not load this deck.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { deck, loading, error, reload: load };
}
