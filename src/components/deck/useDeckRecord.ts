import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DeckHeaderRecord {
  id: string;
  name: string;
  format: string;
  public_enabled: boolean;
  public_slug: string | null;
  /**
   * The commander, and how big the deck is. Present only when the caller asked
   * for them with `{ withCommander: true }`, because they cost two more round
   * trips and five of the six deck sub-routes do not draw a card.
   */
  commanderName?: string | null;
  /** A `cards` row, ready for `CardImage`. Null when the deck has no commander. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commanderCard?: any | null;
  /** Mainboard entries, counted from `deck_cards`. */
  cardCount?: number;
  colors?: string[];
}

export interface DeckRecordOptions {
  /**
   * Also fetch the commander card, the mainboard count and the colours.
   *
   * Opt in, not default. `/deck/:id/share` draws the deck so somebody can see
   * what they are about to publish; `/deck/:id/export` and the rest do not, and
   * making them all pay two extra requests for a card nobody renders is the
   * shape of query bloat this project already fixed once on the deck list.
   */
  withCommander?: boolean;
}

/**
 * The little bit of deck identity every deck sub-route needs.
 *
 * Export, share and the missing-cards list used to be handed `deckName` by
 * whichever overlay opened them. Now that each one is a route somebody can land
 * on cold, the page has to be able to answer "which deck is this?" on its own.
 */
export function useDeckRecord(id?: string, options: DeckRecordOptions = {}) {
  const [deck, setDeck] = useState<DeckHeaderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const withCommander = Boolean(options.withCommander);

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

      const base: DeckHeaderRecord = {
        id: data.id,
        name: data.name ?? 'Untitled deck',
        format: data.format ?? 'commander',
        public_enabled: Boolean(data.public_enabled),
        public_slug: data.public_slug ?? null,
        colors: (data as { colors?: string[] }).colors ?? [],
      };

      if (!withCommander) {
        setDeck(base);
        return;
      }

      /* Two more reads, the same shape `useDeckLibrary` uses: the deck's
         entries, then the one commander printing. A failure here loses the
         picture and keeps the page, because the name and the switch are what
         this route is FOR and a deck nobody can share is worse than a deck
         nobody can see. */
      try {
        const { data: entries } = await supabase
          .from('deck_cards')
          .select('card_id, card_name, quantity, is_commander, is_sideboard')
          .eq('deck_id', id);

        const rows = entries ?? [];
        const commander = rows.find(r => r.is_commander);
        const cardCount = rows
          .filter(r => !r.is_sideboard)
          .reduce((total, r) => total + Math.max(1, r.quantity ?? 1), 0);

        let commanderCard = null;
        if (commander?.card_id) {
          const { data: card } = await supabase
            .from('cards')
            .select('id, name, type_line, mana_cost, color_identity, image_uris, oracle_text')
            .eq('id', commander.card_id)
            .maybeSingle();
          commanderCard = card ?? null;
        }

        setDeck({
          ...base,
          commanderName: commander?.card_name ?? null,
          commanderCard,
          cardCount,
        });
      } catch (cardErr) {
        console.warn('Deck record: the commander could not be read', cardErr);
        setDeck(base);
      }
    } catch (err) {
      console.error('Deck record load failed:', err);
      setDeck(null);
      setError('Could not load this deck.');
    } finally {
      setLoading(false);
    }
  }, [id, withCommander]);

  useEffect(() => {
    void load();
  }, [load]);

  return { deck, loading, error, reload: load };
}
