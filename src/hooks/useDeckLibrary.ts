/**
 * The signed-in player's decks, each carrying the card its commander is.
 *
 * This used to live inside `src/components/tournament/useEventDecks.ts`, where
 * only an event could reach it. Three surfaces want the same thing now: the
 * tournaments page offering decks to register, the proxy page offering decks to
 * print, and the settings export saying which decklists are about to be
 * written. The alternative was three loaders disagreeing about what a deck is,
 * which is the duplication CLAUDE.md names as this product's core problem.
 *
 * ## Three queries, whatever the deck count
 *
 * CLAUDE.md records two outages and a disk IO warning from per-row queries.
 * `DeckAPI.getDeckSummaries()` is the surviving example of that shape, one
 * `compute_deck_summary` RPC per deck, and it is deliberately NOT what this
 * uses.
 *
 *   1. `user_decks`   id, name, format, colours
 *   2. `deck_cards`   every entry for every one of those decks, in one `.in()`
 *   3. `cards`        every commander printing at once, in one `.in()`
 *
 * Three round trips for one deck and three for fifty.
 *
 * Nothing here invents a number: deck names, formats, colour identity and card
 * counts are all read from `user_decks` / `deck_cards`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';

export interface DeckOption {
  id: string;
  name: string;
  format: string;
  colors: string[];
  commanderName: string | null;
  /** A `cards` row, ready for `CardImage`. Null when the deck has no commander. */
  commanderCard: CardRow | null;
  /** Mainboard cards, counted from `deck_cards`. */
  cardCount: number;
  updatedAt: string;
}

interface CardRow {
  id: string;
  name: string;
  image_uris: unknown;
  faces: unknown;
  color_identity: string[] | null;
  type_line: string | null;
  mana_cost: string | null;
}

export interface DeckLibraryState {
  decks: DeckOption[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useDeckLibrary(): DeckLibraryState {
  const { user } = useAuth();
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setDecks([]);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: deckRows, error: deckError } = await supabase
          .from('user_decks')
          .select('id, name, format, colors, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (deckError) throw deckError;
        const rows = deckRows ?? [];
        if (rows.length === 0) {
          if (!cancelled) setDecks([]);
          return;
        }

        const { data: cardRows } = await supabase
          .from('deck_cards')
          .select('deck_id, card_id, card_name, quantity, is_commander, is_sideboard')
          .in('deck_id', rows.map(r => r.id));

        const counts: Record<string, number> = {};
        const commanders: Record<string, { id: string | null; name: string }> = {};
        for (const card of cardRows ?? []) {
          if (!card.is_sideboard) {
            counts[card.deck_id] = (counts[card.deck_id] ?? 0) + (Number(card.quantity) || 1);
          }
          if (card.is_commander && !commanders[card.deck_id]) {
            commanders[card.deck_id] = { id: card.card_id ?? null, name: card.card_name };
          }
        }

        const commanderIds = Array.from(
          new Set(
            Object.values(commanders)
              .map(c => c.id)
              .filter((id): id is string => !!id)
          )
        );

        const printings = new Map<string, CardRow>();
        if (commanderIds.length > 0) {
          const { data: printingRows } = await supabase
            .from('cards')
            .select('id, name, image_uris, faces, color_identity, type_line, mana_cost')
            .in('id', commanderIds);
          for (const row of (printingRows ?? []) as unknown as CardRow[]) {
            printings.set(row.id, row);
          }
        }

        const options: DeckOption[] = rows.map(row => {
          const commander = commanders[row.id];
          return {
            id: row.id,
            name: row.name,
            format: row.format ?? 'commander',
            colors: Array.isArray(row.colors) ? row.colors : [],
            commanderName: commander?.name ?? null,
            commanderCard: commander?.id ? printings.get(commander.id) ?? null : null,
            cardCount: counts[row.id] ?? 0,
            updatedAt: row.updated_at,
          };
        });

        if (!cancelled) setDecks(options);
      } catch (err) {
        console.error('Failed to load your decks:', err);
        if (!cancelled) setError('Could not load your decks.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  return useMemo(() => ({ decks, loading, error, reload }), [decks, loading, error, reload]);
}

/**
 * How many cards a rail is describing, counted the same way everywhere.
 *
 * `cardCount` is mainboard copies, which is what "99 cards" means to a player
 * and what the deck page prints. Summing it here rather than at each call site
 * is what stops one surface counting copies and the next counting rows.
 */
export function totalCards(decks: DeckOption[]): number {
  return decks.reduce((sum, deck) => sum + deck.cardCount, 0);
}
